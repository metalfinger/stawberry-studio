"""
Chat bridge — the chat WebSocket's single entry into the agent runtime.

Every chat turn flows: routes/chat.py → chat_bridge.stream_turn → orchestrator/
runner.stream_agent (pydantic-AI). The legacy google.adk path is gone; this
module is now the canonical surface.
"""
from __future__ import annotations

import json
from collections.abc import AsyncIterator

from backend import db
from backend.orchestrator.runner import stream_agent

# Every agent the chat WebSocket can route to. Iris is internal (gap-filler,
# invoked from cut_executor PREPROD_FILL items) and not user-chat-addressable.
# Spark/Scout were never reachable from chat (PHASE_AGENTS only auto-switched
# Sage↔Nova in STORY mode) so they were deleted as dead-end legacy.
PYDANTIC_AI_AGENTS = {"berry", "sage", "nova", "atlas", "pixel"}


def is_enabled(agent_id: str) -> bool:
    """True iff the agent has a pydantic-AI spec we can stream. Always
    on — there's no legacy fallback anymore."""
    return agent_id in PYDANTIC_AI_AGENTS


def _check_master_readiness(project_id: str) -> dict:
    """Inspect DB for assets without master images. Returns gap summary
    so Pixel's prompt can hard-stop when masters aren't ready.

    Moved from the deleted backend/agents/prompter.py — chat_bridge is the
    only caller. Self-contained: only touches get_connection.
    """
    if not project_id or project_id == "unknown":
        return {"ok": True, "missing": [], "by_type": {}}
    try:
        get_connection = db.get_connection

        conn = get_connection()
        cursor = conn.cursor()
        # Master image lives in reference_pool (label='identity'). element_masters
        # is gone — single source of truth.
        cursor.execute(
            """
            SELECT a.id, a.type, a.name,
                   COALESCE(a.image_url, '') AS direct_url,
                   COALESCE((
                     SELECT rp.image_url FROM reference_pool rp
                     WHERE rp.asset_id = a.id AND rp.label = 'identity'
                       AND COALESCE(rp.is_active,1) = 1
                     ORDER BY rp.created_at DESC LIMIT 1
                   ), '') AS master_url
            FROM assets a
            WHERE a.project_id = ? AND a.type IN ('character','location','prop')
              AND (a.master_id IS NULL OR a.master_id = '')
            """,
            (project_id,),
        )
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        missing = [r for r in rows if not r["master_url"] and not r["direct_url"]]
        by_type: dict = {}
        for m in missing:
            by_type.setdefault(m["type"], []).append(m["name"])
        return {
            "ok": len(missing) == 0,
            "missing": missing,
            "by_type": by_type,
            "total_assets": len(rows),
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": True, "missing": [], "by_type": {}, "error": str(e)}


def _build_existing_structure(project_id: str) -> str:
    """Render the current scene/shot tree for Sage's prompt header."""
    scenes = db.get_scenes(project_id) or []
    if not scenes:
        return "- No scenes yet. You need to propose a scene structure."
    lines = []
    for s in scenes:
        lines.append(f"  - Scene {s['scene_number']}: **{s['title']}** (id: `{s['id']}`)")
        shots = db.get_shots(s["id"]) or []
        for sh in shots:
            preview = (sh.get("description") or "")[:40]
            lines.append(f"    - Shot {sh['shot_number']} (id: `{sh['id']}`): {preview}")
    return "## ⚠️ EXISTING STRUCTURE (DO NOT RECREATE)\n" + "\n".join(lines)


def _build_full_tree(project_id: str) -> str:
    """Full scene → shot → cut tree with UUIDs. Pixel needs this so when the
    user says 'scene 1 shot 1 cut 1' the agent can resolve to a real
    cut_id from its prompt context instead of hallucinating a UUID."""
    scenes = db.get_scenes(project_id) or []
    if not scenes:
        return "- No scenes yet."
    lines = ["## CUTS YOU CAN COMPOSE (use these exact IDs — never invent)"]
    for s in scenes:
        lines.append(f"- Scene {s['scene_number']}: {s['title']}")
        shots = db.get_shots(s["id"]) or []
        for sh in shots:
            cuts = db.get_cuts(sh["id"]) or []
            for cut in cuts:
                action = (cut.get("action") or cut.get("description") or "").strip()[:80]
                lines.append(
                    f"  - S{s['scene_number']}/Sh{sh['shot_number']}/C{cut['cut_number']} "
                    f"(cut_id: `{cut['id']}`) — {action}"
                )
    return "\n".join(lines)


def build_prompt_vars(agent_id: str, project_id: str) -> dict[str, str]:
    """Compose the placeholder values each agent's prompt expects."""
    if agent_id == "berry":
        brief = db.get_brief(project_id) or {}
        missing = []
        if not brief.get("title"):
            missing.append("Title")
        if not brief.get("logline"):
            missing.append("Logline")
        if not brief.get("genre"):
            missing.append("Genre")
        if not brief.get("art_style"):
            missing.append("Art Style")
        if missing:
            next_action = f"Still need: {', '.join(missing)}. Ask about {missing[0]} next."
        else:
            next_action = "All required fields filled. Call complete_briefing to ask the user for confirmation."
        return {
            "project_id": project_id,
            "brief_json": json.dumps(brief, indent=2) if brief else "{}",
            "next_action": next_action,
        }

    if agent_id == "sage":
        brief = db.get_brief(project_id) or {}
        return {
            "project_id": project_id,
            "brief_json": json.dumps(brief, indent=2) if brief else "{}",
            "existing_status": _build_existing_structure(project_id),
        }

    if agent_id == "nova":
        return {
            "project_id": project_id,
            "scene_info": _build_existing_structure(project_id),
            "existing_status": "",  # filled if a current_scene_id is in session state (future)
        }

    if agent_id == "atlas":
        from backend.database import assets as asset_db

        chars = asset_db.get_assets(project_id, "character")
        locs = asset_db.get_assets(project_id, "location")
        props = asset_db.get_assets(project_id, "prop")
        if chars or locs or props:
            block = (
                "## EXISTING ASSETS\n"
                f"- Characters ({len(chars)}): {', '.join(c['name'] for c in chars) or 'None'}\n"
                f"- Locations ({len(locs)}): {', '.join(loc['name'] for loc in locs) or 'None'}\n"
                f"- Props ({len(props)}): {', '.join(p['name'] for p in props) or 'None'}\n\n"
                "**Review these before creating duplicates.**"
            )
        else:
            block = "## NO ASSETS YET\nBlueprint is ready for asset extraction."
        return {"project_id": project_id, "existing_assets": block}

    if agent_id == "pixel":
        readiness = _check_master_readiness(project_id)
        if readiness["ok"]:
            block = ""
        else:
            type_lines = "\n".join(
                f"- **{t.capitalize()}s without masters**: {', '.join(names)}"
                for t, names in readiness["by_type"].items()
            )
            block = (
                "\n---\n\n# ⛔ HARD STOP — DO NOT ATTEMPT CUT PROMPTS\n\n"
                f"**{len(readiness['missing'])} of {readiness['total_assets']}** core assets are missing master images:\n\n"
                f"{type_lines}\n\n"
                "## YOUR ONLY JOB IN THIS TURN\n\n"
                "1. Refuse to compose any cut prompt.\n"
                "2. Do **NOT** call `get_smart_generation_context`, "
                "`propose_cut_plan`, `execute_cut_plan`, `compose_cut`, "
                "or `update_cut`. Composing any cut prompt before masters "
                "exist is a bug.\n"
                "3. **Offer the one-click unblock.** Reply with EXACTLY this structure:\n\n"
                "   > Hold on — these assets still need master images:\n"
                "   > - [list every missing asset, grouped by type]\n"
                "   >\n"
                "   > Want me to generate sheets for all of them in one pass? Just say "
                "**\"yes, generate them\"** and I'll fire `generate_all_missing_sheets` "
                "across every asset that has a saved prompt. Each one becomes a multi-panel "
                "model sheet (front/3-quarter/side/back/expressions in a single image), "
                "ready to use as a reference in any cut.\n\n"
                "4. If the user agrees, call `generate_all_missing_sheets(project_id=\"{project_id}\")` "
                "and report the per-asset result.\n"
                "5. If `generate_all_missing_sheets` returns assets without `suggested_prompt`, "
                "tell the user Atlas needs to fill those — Pixel cannot create master prompts "
                "from nothing. Suggest going back to the ASSETS phase.\n\n"
                "---\n"
            )
        tree = _build_full_tree(project_id)
        return {"project_id": project_id, "readiness_block": block, "cut_tree": tree}

    return {"project_id": project_id}


async def _load_history_for_pai(project_id: str, phase: str, *, limit: int = 20) -> list:
    """Pull recent chat history for this (project, phase) and convert to Pydantic AI
    ModelMessages so the agent has continuity across turns.

    Without this, every turn starts with empty memory — which is what made
    Atlas need 6+ "yes/confirm" loops in the first wired-up tests.
    """
    import asyncio

    from pydantic_ai.messages import (
        ModelRequest,
        ModelResponse,
        TextPart,
        UserPromptPart,
    )

    rows = await asyncio.to_thread(db.get_chat_history_for_context, project_id, phase, limit)
    messages: list = []
    for row in rows:
        role = row.get("role")
        content = row.get("content") or ""
        if not content:
            continue
        if role == "user":
            messages.append(ModelRequest(parts=[UserPromptPart(content=content)]))
        elif role == "assistant":
            messages.append(ModelResponse(parts=[TextPart(content=content)]))
    return messages


async def stream_turn(
    agent_id: str,
    user_message: str,
    *,
    project_id: str,
    phase: str,
    usage_out: dict | None = None,
) -> AsyncIterator[str]:
    """Stream chunks from the new Pydantic AI runner. Caller pushes each chunk
    onto the WebSocket as it arrives. Threads recent chat history so the agent
    remembers the conversation.

    Pass `usage_out` (a dict) to receive real token counts after the stream
    completes — populated keys: input_tokens, output_tokens, total_tokens,
    requests, model. The dict is mutated in place by the runner.
    """
    prompt_vars = build_prompt_vars(agent_id, project_id)
    history = await _load_history_for_pai(project_id, phase, limit=20)
    async for chunk in stream_agent(
        agent_id,
        user_message,
        project_id=project_id,
        phase=phase,
        prompt_vars=prompt_vars,
        history=history,
        usage_out=usage_out,
    ):
        yield chunk
