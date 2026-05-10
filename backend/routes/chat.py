"""
Chat WebSocket route — single agent runtime, pydantic-AI through chat_bridge.

Every chat turn flows: this WebSocket handler → chat_bridge.stream_turn →
orchestrator/runner.stream_agent. The legacy google.adk Runner / Session
service / per-agent factory modules are gone — every supported agent has
a YAML spec under backend/agents/specs/ and an MD prompt under
backend/agents/prompts/, both consumed by the modern runner.

Phase routing is a small dict here that maps phase + sub-mode → agent
metadata (id, display name, greeting, optional auto-trigger). The handler
forwards user messages to the bridge and streams chunks back; agent
switches inside a phase (Sage ↔ Nova) and across phases (BRIEF → STORY)
are simple state changes, no Runner re-instantiation needed because the
bridge is stateless w.r.t. agent identity (it picks up project chat
history on every turn).
"""
import json
import re

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend import db
from backend import db_async
from backend.orchestrator import chat_bridge
from backend.orchestrator import intents as intent_dispatch
from backend.orchestrator.bus import bus
from backend.orchestrator.llm_cost import cost_for as _llm_cost_for
from backend.orchestrator.narrator import Narrator, Action

router = APIRouter()


# Phase → modes → agent metadata.
# Tuple: (display_name, agent_id, greeting, auto_trigger or None)
# agent_id MUST match a YAML spec in backend/agents/specs/<id>.yaml.
PHASE_AGENTS: dict[str, dict] = {
    "BRIEF": {
        "default": ("Berry", "berry", "Hey! I'm Berry, your Creative Director. Tell me about your video vision!", None),
    },
    "STORY": {
        "planner": ("Sage", "sage", "Hi! I'm Sage, your Story Architect. I've read the brief - let me propose a scene structure.", "Analyze the brief and propose a scene breakdown."),
        "detailer": ("Nova", "nova", "I'm Nova, your Shot Designer. Let's break this scene into shots and cuts!", None),
        "default": "planner",
    },
    "ASSETS": {
        "default": ("Atlas", "atlas", "I'm Atlas, your Visual Designer. Let me examine your story and extract all visual elements...", "Analyze the blueprint and extract all characters, locations, and props."),
    },
    "GENERATE": {
        "prompter": ("Pixel", "pixel", "Hey! I'm Pixel, your Prompt Artist. Which cut shall we start with?", None),
        "renderer": ("Spark", "spark", "I'm Spark, your VFX Artist. Ready to render your visuals.", None),
        "qa": ("Scout", "scout", "I'm Scout, your QA Lead. I'll review each image for consistency.", None),
        "default": "prompter",
    },
}


# Per-WS-session debounce — only emit one repair-offer ActionsBar per
# connected session so refreshes don't pile up the same card. Cleared on
# disconnect implicitly because it's tied to the project_id+phase pair we
# already bookkeep via narrator events.
_repair_offered: set[str] = set()


async def _maybe_offer_repair(project_id: str, current_phase: str, narrator: Narrator) -> None:
    """If the project is past BRIEF but the consistency stack isn't ready
    yet, emit one ActionsBar offering to repair it inline. Replaces the
    old standalone 🛠️ Consistency menu — repair is a chat decision now.
    """
    if current_phase == "BRIEF":
        # Bible auto-compiles at BRIEF→STORY confirm; nothing to offer here.
        return

    key = f"{project_id}:{current_phase}"
    if key in _repair_offered:
        return

    get_async_connection = db.get_async_connection
    from backend import db

    brief = db.get_brief(project_id) or {}
    try:
        palette_hex = json.loads(brief.get("palette_hex") or "[]")
    except Exception:
        palette_hex = []
    try:
        style_tokens = json.loads(brief.get("style_tokens") or "[]")
    except Exception:
        style_tokens = []
    bible_empty = not (palette_hex or style_tokens)

    anchor_url = ""
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT style_anchor_url FROM continuity_bible WHERE project_id = ?",
            (project_id,),
        ) as cur:
            row = await cur.fetchone()
        if row:
            anchor_url = (row["style_anchor_url"] or "").strip()
    anchor_missing = not anchor_url

    # Identity coverage — if the project has assets but few have an active
    # identity reference, the user almost certainly wants the regen pass.
    asset_count = 0
    identity_count = 0
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT COUNT(*) AS n FROM assets WHERE project_id = ? "
            "AND COALESCE(type,'') IN "
            "('character','location','prop','sublocation','location_angle')",
            (project_id,),
        ) as cur:
            r = await cur.fetchone()
            asset_count = (r["n"] if r else 0) or 0
        if asset_count:
            async with conn.execute(
                "SELECT COUNT(DISTINCT asset_id) AS n FROM reference_pool "
                "WHERE project_id = ? AND label = 'identity' AND is_active = 1",
                (project_id,),
            ) as cur:
                r = await cur.fetchone()
                identity_count = (r["n"] if r else 0) or 0
    identities_thin = asset_count > 0 and identity_count < asset_count

    if not (bible_empty or anchor_missing or identities_thin):
        return

    # Pick the highest-leverage single button. If everything's broken,
    # offer "Repair all" — one click runs bible → anchor → identities.
    needs = []
    if bible_empty:
        needs.append("style bible")
    if anchor_missing:
        needs.append("anchor image")
    if identities_thin:
        needs.append(f"{asset_count - identity_count} asset identities")
    needs_str = ", ".join(needs)

    buttons = [Action(label="✅ Repair now", intent="repair_all", primary=True)]
    if not bible_empty and anchor_missing:
        buttons = [
            Action(label="🖼️ Mint anchor", intent="recompile_style_anchor", primary=True),
            Action(label="Skip", intent="dismiss"),
        ]
    elif bible_empty and not anchor_missing and not identities_thin:
        buttons = [
            Action(label="🎨 Compile bible", intent="recompile_style_bible", primary=True),
            Action(label="Skip", intent="dismiss"),
        ]
    else:
        # Default: one-click full repair, plus dismiss.
        buttons.append(Action(label="Skip", intent="dismiss"))

    await narrator.actions(
        prompt=f"This project is missing: {needs_str}. Want me to fix it?",
        buttons=buttons,
    )
    _repair_offered.add(key)


def _resolve_mode(phase_config: dict) -> tuple:
    """Pick the entry corresponding to the phase's `default` mode key."""
    default_key = phase_config.get("default")
    if isinstance(default_key, str):
        return default_key, phase_config[default_key]
    return "default", phase_config["default"]


def detect_agent_switch(message: str, current_mode: str) -> tuple:
    """Detect if user wants to switch between Sage (planner) and Nova (detailer).
    Returns (new_mode, scene_num or None)."""
    message_lower = message.lower()

    # Switch to Nova
    detail_match = re.search(r"(detail|focus|work on|break down)\s*(scene\s*(\d+)|scene)", message_lower)
    if detail_match:
        scene_num = detail_match.group(3)
        return ("detailer", scene_num)

    # Switch back to Sage
    if any(phrase in message_lower for phrase in ["back to overview", "back to planner", "overview", "scene structure"]):
        return ("planner", None)

    return (current_mode, None)


async def _stream_one_turn(
    websocket: WebSocket,
    *,
    agent_id: str,
    agent_name: str,
    user_message: str,
    project_id: str,
    phase: str,
    narrator: Narrator,
) -> str:
    """Stream a single agent turn through the pydantic-AI bridge.

    Returns the full assistant text (caller persists + echoes the final
    `message` event). Raises on a bridge error so the caller can emit a
    typed FailureCard.
    """
    import time as _time

    if not chat_bridge.is_enabled(agent_id):
        # Should never happen — every PHASE_AGENTS entry maps to a known
        # spec id. Surface loudly so a typo in the dict gets caught.
        raise RuntimeError(f"agent '{agent_id}' has no pydantic-AI spec")

    full_response = ""
    usage_info: dict = {}
    t0 = _time.monotonic()

    async for chunk in chat_bridge.stream_turn(
        agent_id, user_message,
        project_id=project_id, phase=phase,
        usage_out=usage_info,
    ):
        if chunk:
            full_response += chunk
            await websocket.send_json({
                "type": "stream",
                "content": chunk,
                "agent_name": agent_name,
            })

    # Cost telemetry — pydantic_ai populates usage_info with real token
    # counts, we price against the per-model table so the Console cost
    # meter is exact.
    try:
        in_tok = int(usage_info.get("input_tokens", 0) or 0)
        out_tok = int(usage_info.get("output_tokens", 0) or 0)
        model_used = usage_info.get("model") or ""
        cost = _llm_cost_for(model_used, in_tok, out_tok)
        await narrator.tool_call(
            name=f"{agent_id}.complete",
            args={
                "model": model_used,
                "input_tokens": in_tok,
                "output_tokens": out_tok,
                "requests": int(usage_info.get("requests", 0) or 0),
            },
            status="done",
            cost_usd=cost,
            latency_ms=int((_time.monotonic() - t0) * 1000),
        )
    except Exception:
        pass

    # ActionsBar heuristic — Berry asking the user to confirm BRIEF→STORY
    # gets a typed Yes/Make-changes button row. Cheap, agent-agnostic.
    try:
        lowered = full_response.lower()
        if (
            agent_id == "berry"
            and "story" in lowered
            and ("confirmation required" in lowered or 'say "yes"' in lowered or "please say" in lowered)
        ):
            await narrator.actions(
                prompt="Ready to move to STORY phase?",
                buttons=[
                    Action(label="✅ Yes, proceed", intent="confirm_briefing", primary=True),
                    Action(label="✏️ Make changes", intent="decline_briefing"),
                ],
            )
    except Exception:
        pass

    return full_response


@router.websocket("/api/projects/{project_id}/chat")
async def chat_websocket(websocket: WebSocket, project_id: str, phase: str = None):
    """WebSocket endpoint for chatting with the phase-appropriate agent."""
    await websocket.accept()

    project = await db_async.get_project(project_id)
    if not project:
        await websocket.send_json({"error": "Project not found"})
        await websocket.close()
        return

    current_phase = phase if phase else project.get("current_phase", "BRIEF")
    project_phase = project.get("current_phase", "BRIEF")
    is_history_mode = current_phase != project_phase

    phase_config = PHASE_AGENTS.get(current_phase, PHASE_AGENTS["BRIEF"])
    current_mode, entry = _resolve_mode(phase_config)
    agent_name, agent_id, greeting, auto_trigger = entry
    current_scene_id = None

    # Narrator emits typed Console messages (handoff, failure, tool_call,
    # plan, image, etc.) by publishing to the project's ProjectBus. The
    # WebSocket is registered as a bus subscriber so any backend code
    # (orchestrator, tools, batch runners) can emit without holding the
    # socket itself. The subscription is torn down on WS close (see finally).
    narrator = Narrator(project_id)
    sub_id = await bus.subscribe(project_id, websocket.send_json)

    await websocket.send_json({
        "type": "phase",
        "phase": current_phase,
        "agent": agent_name,
        "mode": current_mode,
        "is_history": is_history_mode,
    })

    # Send phase-specific chat history.
    history = await db_async.get_chat_history(project_id, phase=current_phase)
    await websocket.send_json({"type": "history", "messages": history})

    # Replay typed Console events so PlanCards, images, references,
    # comparisons, handoffs, etc. all re-render after a hard refresh.
    try:
        from backend.orchestrator.bus import fetch_recent_events
        replay = await fetch_recent_events(project_id, limit=300)
        if replay:
            await websocket.send_json({"type": "replay_start", "count": len(replay)})
            for ev in replay:
                ev2 = {**ev, "_replayed": True}
                await websocket.send_json(ev2)
            await websocket.send_json({"type": "replay_end"})
    except Exception as e:
        import structlog as _sl
        _sl.get_logger(__name__).warning("replay_failed", error=str(e))

    # Send initial greeting if no history for this phase (and not in history mode).
    if not history and not is_history_mode:
        await db_async.add_chat_message(project_id, "assistant", greeting, phase=current_phase, agent_name=agent_name)
        await websocket.send_json({"type": "message", "role": "assistant", "content": greeting, "agent_name": agent_name})

    # Inline consistency-repair offer — replaces the standalone 🛠️ menu.
    # Detects projects that are past BRIEF but missing a compiled bible /
    # anchor / asset identities, and surfaces a typed ActionsBar so the user
    # can fix it from chat with one click.
    try:
        await _maybe_offer_repair(project_id, current_phase, narrator)
    except Exception as e:
        import structlog as _sl
        _sl.get_logger(__name__).warning("repair_offer_failed", error=str(e))

    # Auto-trigger on fresh phase entry (Sage analyzes brief, Atlas extracts assets, etc.).
    if auto_trigger and (not history and not is_history_mode):
        try:
            full_response = await _stream_one_turn(
                websocket,
                agent_id=agent_id,
                agent_name=agent_name,
                user_message=auto_trigger,
                project_id=project_id,
                phase=current_phase,
                narrator=narrator,
            )
            if full_response:
                await db_async.add_chat_message(project_id, "assistant", full_response, phase=current_phase, agent_name=agent_name)
                await websocket.send_json({
                    "type": "message",
                    "role": "assistant",
                    "content": full_response,
                    "agent_name": agent_name,
                })
                await websocket.send_json({
                    "type": "tree_updated",
                    "agent": agent_name,
                    "phase": current_phase,
                })
        except Exception as e:
            await websocket.send_json({"type": "error", "message": f"auto_trigger: {e}"})

    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            # Console sends {type: 'user_message', content, attachments} or
            # {type: 'user_intent', intent, payload}. Legacy clients send {message}.
            msg_type = message_data.get("type")
            if msg_type == "user_intent":
                intent = message_data.get("intent", "")
                payload = message_data.get("payload") or {}
                ref_msg_id = message_data.get("ref_message_id")
                handled = await intent_dispatch.handle_intent(
                    project_id=project_id,
                    intent=intent,
                    payload=payload,
                    ref_message_id=ref_msg_id,
                    narrator=narrator,
                )
                if handled:
                    continue
                user_message = f"[intent:{intent}] {json.dumps(payload)}" if intent else ""
            else:
                user_message = (
                    message_data.get("content")
                    or message_data.get("message", "")
                )

            if not user_message:
                continue

            # In-phase agent switch (Sage ↔ Nova in STORY).
            if current_phase == "STORY":
                new_mode, scene_num = detect_agent_switch(user_message, current_mode)
                if new_mode != current_mode and new_mode in phase_config:
                    current_mode = new_mode
                    entry = phase_config[current_mode]
                    agent_name, agent_id, _greet, _auto = entry

                    # Resolve scene number to ID for Nova focus.
                    focus_info = None
                    if scene_num and new_mode == "detailer":
                        scenes = await db_async.get_scenes(project_id)
                        scene = next((s for s in scenes if s["scene_number"] == int(scene_num)), None)
                        if scene:
                            current_scene_id = scene["id"]
                            focus_info = f"Scene {scene['scene_number']}: {scene['title']}"

                    await websocket.send_json({
                        "type": "mode_switch",
                        "mode": current_mode,
                        "agent": agent_name,
                        "scene_id": current_scene_id,
                        "focus": focus_info,
                    })

            # Cross-phase transition (e.g. complete_briefing fired and the
            # project's current_phase advanced behind our back).
            project = await db_async.get_project(project_id)
            new_phase = project.get("current_phase", current_phase)
            if new_phase != current_phase:
                old_phase = current_phase
                prev_agent_name = agent_name

                current_phase = new_phase
                phase_config = PHASE_AGENTS.get(current_phase, PHASE_AGENTS["BRIEF"])
                current_mode, entry = _resolve_mode(phase_config)
                agent_name, agent_id, new_greeting, new_auto_trigger = entry

                # ONE typed handoff card carries the prev→next narrative.
                # We deliberately do NOT echo the new agent's greeting — the
                # auto_trigger below produces the substantive first message,
                # which is far more useful than a static "Hi I'm Atlas" line.
                try:
                    await narrator.handoff(
                        from_agent=prev_agent_name or "—",
                        to_agent=agent_name,
                        reason=f"{old_phase} → {new_phase}",
                    )
                except Exception:
                    pass
                await websocket.send_json({
                    "type": "phase_change",
                    "old_phase": old_phase,
                    "new_phase": new_phase,
                    "agent": agent_name,
                })

                # If the new phase has an auto_trigger, run it immediately so
                # the user doesn't have to type anything to get the agent
                # working. This is the "no nudge" fix — old flow showed only
                # a greeting and waited for the user to say "go".
                if new_auto_trigger:
                    try:
                        full_response = await _stream_one_turn(
                            websocket,
                            agent_id=agent_id,
                            agent_name=agent_name,
                            user_message=new_auto_trigger,
                            project_id=project_id,
                            phase=current_phase,
                            narrator=narrator,
                        )
                        if full_response:
                            await db_async.add_chat_message(project_id, "assistant", full_response, phase=current_phase, agent_name=agent_name)
                            await websocket.send_json({
                                "type": "message",
                                "role": "assistant",
                                "content": full_response,
                                "agent_name": agent_name,
                            })
                            await websocket.send_json({
                                "type": "tree_updated",
                                "agent": agent_name,
                                "phase": current_phase,
                            })
                    except Exception as e:
                        await websocket.send_json({"type": "error", "message": f"phase_auto_trigger: {e}"})
                else:
                    # No auto_trigger — show greeting once so the user knows
                    # the new agent is here.
                    await db_async.add_chat_message(project_id, "assistant", new_greeting, phase=current_phase, agent_name=agent_name)
                    await websocket.send_json({"type": "message", "role": "assistant", "content": new_greeting, "agent_name": agent_name})

                continue  # Skip processing the triggering user message after phase change.

            # Persist + echo user message.
            await db_async.add_chat_message(project_id, "user", user_message, phase=current_phase)
            await websocket.send_json({"type": "message", "role": "user", "content": user_message})

            # Stream one agent turn.
            try:
                full_response = await _stream_one_turn(
                    websocket,
                    agent_id=agent_id,
                    agent_name=agent_name,
                    user_message=user_message,
                    project_id=project_id,
                    phase=current_phase,
                    narrator=narrator,
                )
            except Exception as e:
                try:
                    await narrator.failure(
                        error=str(e),
                        suggestion="Retry the message — if it keeps failing, check the agent logs.",
                        recovery_actions=[],
                    )
                except Exception:
                    pass
                await websocket.send_json({"type": "error", "message": f"orchestrator: {e}"})
                continue

            if full_response:
                await db_async.add_chat_message(project_id, "assistant", full_response, phase=current_phase, agent_name=agent_name)
                await websocket.send_json({
                    "type": "message",
                    "role": "assistant",
                    "content": full_response,
                    "agent_name": agent_name,
                })
                # Notify the frontend that mutating agents may have changed
                # the tree state. The canvas re-fetches assets/scenes/shots/
                # cuts on this signal and reconciles.
                await websocket.send_json({
                    "type": "tree_updated",
                    "agent": agent_name,
                    "phase": current_phase,
                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        # Always release the bus subscription so a dropped WS doesn't leak.
        try:
            await bus.unsubscribe(project_id, sub_id)
        except Exception:
            pass
