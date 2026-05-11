"""Intent dispatch — handles `user_intent` events the Console sends.

The Console emits structured intents (approve_plan, accept_recommendation,
pause_batch, etc.) when the user clicks a button on a typed message. This
module routes each intent to the right handler and emits typed responses
back via the Narrator/bus.

Returning True means the intent was fully handled and the route loop
should NOT also feed the message through the chat agent. Returning False
means we couldn't handle it — fall back to the legacy text path.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

import structlog

from backend.orchestrator import cut_executor, cut_planner, picker
from backend.orchestrator.bus import bus
from backend.orchestrator.narrator import Action, Narrator
from backend.orchestrator.plans import (
    Plan,
    PlanItem,
    fork_plan_for_refinement,
    load_plan,
    save_plan,
    update_item_status,
    update_plan_status,
)

log = structlog.get_logger(__name__)


# Track in-flight executions so cancel_plan / pause_batch can act on them.
_running_plans: dict[str, asyncio.Task] = {}
_running_batches: dict[str, asyncio.Task] = {}
_paused_batches: set[str] = set()
_cancelled_batches: set[str] = set()
# IdleSuggestion debounce: skip if user just got one and didn't act on it.
# Cleared whenever the user sends a real chat message (see chat.py).
_idle_active: set[str] = set()
_idle_dismissed: set[str] = set()


async def handle_intent(
    *,
    project_id: str,
    intent: str,
    payload: dict[str, Any],
    ref_message_id: str | None,
    narrator: Narrator,
) -> bool:
    """Dispatch a user_intent. Returns True if fully handled."""
    log.info("intent_received", intent=intent, project_id=project_id, payload_keys=list(payload.keys()))
    try:
        if intent == "compose_cut" or intent == "propose_cut_plan":
            return await _propose_plan(project_id, payload, narrator)
        if intent == "approve_plan":
            return await _approve_plan(project_id, payload, ref_message_id, narrator)
        if intent == "modify_plan":
            return await _modify_plan(project_id, payload, narrator)
        if intent == "cancel_plan":
            return await _cancel_plan(project_id, payload, narrator)
        if intent == "skip_new_gens":
            return await _skip_new_gens(project_id, payload, ref_message_id, narrator)
        if intent == "retry_plan":
            return await _retry_plan(project_id, payload, ref_message_id, narrator)
        if intent == "accept_recommendation":
            return await _accept_recommendation(project_id, payload, narrator)
        if intent == "generate_new_instead":
            return await _generate_new_instead(project_id, payload, narrator)
        if intent == "pause_batch":
            return await _pause_batch(payload, narrator)
        if intent == "cancel_batch":
            return await _cancel_batch(payload, narrator)
        if intent == "user_idle":
            return await _idle_suggestion(project_id, narrator)
        if intent == "reconnect":
            return await _activity_summary(project_id, payload, narrator)
        if intent == "confirm_briefing":
            return await _confirm_briefing(project_id, narrator)
        if intent == "decline_briefing":
            await narrator.text("OK — tell me what you'd like to change about the brief.")
            return True
        if intent == "advance_phase":
            return await _advance_phase(project_id, narrator)
        if intent == "recompile_style_bible":
            return await _recompile_bible(project_id, narrator)
        if intent == "recompile_style_anchor":
            return await _recompile_anchor(project_id, narrator)
        if intent == "regenerate_identities":
            return await _regenerate_identities(project_id, narrator)
        if intent == "repair_all":
            return await _repair_all(project_id, narrator)
        if intent == "draft_identities":
            return await _draft_identities(project_id, narrator)
        if intent == "plan_unrendered":
            return await _plan_unrendered(project_id, narrator)
        if intent == "dismiss":
            _idle_dismissed.add(project_id)
            return True
        if intent == "refine_reference":
            return await _refine_reference(project_id, payload, narrator)
        if intent == "regenerate_asset_identity":
            return await _regenerate_asset_identity(project_id, payload, narrator)
        if intent == "update_asset_prompt":
            return await _update_asset_prompt(project_id, payload, narrator)
        if intent == "update_render_prompt":
            return await _update_render_prompt(project_id, payload, narrator, ref_message_id)
        # Unknown intents fall back to chat agent.
        return False
    except Exception as e:
        log.exception("intent_handler_failed", intent=intent)
        try:
            await narrator.failure(
                error=str(e),
                suggestion="The intent failed. You can try the action again or use chat.",
                recovery_actions=[],
            )
        except Exception:
            pass
        return True


# ============================================================================
# Plan flow
# ============================================================================

async def _propose_plan(project_id: str, payload: dict, narrator: Narrator) -> bool:
    cut_id = payload.get("cut_id")
    feedback = payload.get("feedback")
    parent_plan_id = payload.get("parent_plan_id")
    if not cut_id:
        await narrator.text("I need a cut id to plan a compose. Try clicking compose on a specific cut.")
        return True
    parent_plan = await load_plan(parent_plan_id) if parent_plan_id else None
    plan = await cut_planner.plan_compose_cut(cut_id, feedback=feedback, parent_plan=parent_plan)
    await save_plan(plan)
    auto = float(payload.get("auto_approve_under_usd") or 0.0)
    msg_id = await narrator.plan(plan, auto_approve_under=auto)
    # Persist the message_id on the plan record so executor / approve_plan
    # can patch the right card from anywhere.
    await _set_plan_message_id(plan.id, msg_id)
    return True


async def _set_plan_message_id(plan_id: str, message_id: str) -> None:
    """Persist the chat message_id of the plan card so update_plan_item can
    patch the right card from anywhere."""
    from backend import db
    get_async_connection = db.get_async_connection

    async with get_async_connection() as conn:
        await conn.execute(
            "UPDATE plans SET payload_json = json_set(COALESCE(payload_json,'{}'), '$.message_id', ?) WHERE id = ?",
            (message_id, plan_id),
        )
        await conn.commit()


async def _get_plan_message_id(plan_id: str) -> str | None:
    from backend import db
    get_async_connection = db.get_async_connection

    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT json_extract(payload_json, '$.message_id') FROM plans WHERE id = ?",
            (plan_id,),
        ) as cur:
            row = await cur.fetchone()
    return row[0] if row and row[0] else None


async def _approve_plan(
    project_id: str, payload: dict, ref_message_id: str | None, narrator: Narrator
) -> bool:
    plan_id = payload.get("plan_id")
    if not plan_id:
        return False
    plan = await load_plan(plan_id)
    if not plan:
        await narrator.failure(error=f"Plan {plan_id} not found", suggestion="Re-propose the plan.", recovery_actions=[])
        return True

    # Mark all items approved.
    for item in plan.items:
        item.approved = True
    await save_plan(plan)
    await update_plan_status(plan_id, "approved")

    plan_msg_id = ref_message_id or await _get_plan_message_id(plan_id)

    async def on_step(item: PlanItem) -> None:
        if not plan_msg_id:
            return
        try:
            await narrator.update_plan_item(
                plan_msg_id,
                item.id,
                status=item.status,
                result=item.result,
                error=item.error,
            )
        except Exception:
            log.exception("plan_update_emit_failed", item_id=item.id)

    # Run executor in the background so the WS loop stays responsive.
    task = asyncio.create_task(_run_executor(project_id, plan_id, on_step, narrator))
    _running_plans[plan_id] = task
    task.add_done_callback(lambda _t: _running_plans.pop(plan_id, None))
    return True


async def _run_executor(project_id: str, plan_id: str, on_step, narrator: Narrator) -> None:
    try:
        from backend.orchestrator.cut_executor import execute_plan as _exec
        result = await _exec(plan_id, on_step=on_step)
        if result.error:
            await narrator.failure(
                error=result.error,
                suggestion="You can retry the failed steps or modify the plan.",
                recovery_actions=[
                    Action(label="🔁 Retry", intent="retry_plan", payload={"plan_id": plan_id}, primary=True),
                    Action(label="Cancel", intent="cancel_plan", payload={"plan_id": plan_id}),
                ],
            )
        # NOTE: cut_executor already emits narrator.image() inside the
        # RENDER step. Emitting again here was producing two image cards
        # in the chat for the same render — confusing and made it look
        # like the model was re-running. The PlanCard final state plus
        # the executor's image emission cover the success UX.
    except asyncio.CancelledError:
        await narrator.text(f"_Plan {plan_id[:8]} cancelled._")
        raise
    except Exception as e:  # noqa: BLE001
        await narrator.failure(error=str(e), suggestion="Try again, or modify the plan.", recovery_actions=[])


async def _modify_plan(project_id: str, payload: dict, narrator: Narrator) -> bool:
    plan_id = payload.get("plan_id")
    await narrator.text(
        f"OK — tell me what to change about the plan (e.g. _'use cached identity for Mara'_, _'skip the location reference'_). "
        f"Plan id: `{plan_id[:8]}`"
    )
    return True


async def _cancel_plan(project_id: str, payload: dict, narrator: Narrator) -> bool:
    plan_id = payload.get("plan_id")
    if not plan_id:
        return False
    task = _running_plans.pop(plan_id, None)
    if task and not task.done():
        task.cancel()
    await update_plan_status(plan_id, "cancelled")
    await narrator.text(f"_Plan `{plan_id[:8]}` cancelled._")
    return True


async def _skip_new_gens(
    project_id: str, payload: dict, ref_message_id: str | None, narrator: Narrator
) -> bool:
    plan_id = payload.get("plan_id")
    if not plan_id:
        return False
    plan = await load_plan(plan_id)
    if not plan:
        return False
    for item in plan.items:
        if item.kind == "reference_generate":
            item.approved = False
        else:
            item.approved = True
    await save_plan(plan)
    await narrator.text("Skipping new gens — running with cached references only.")
    return await _approve_plan(project_id, {"plan_id": plan_id}, ref_message_id, narrator)


async def _retry_plan(
    project_id: str, payload: dict, ref_message_id: str | None, narrator: Narrator
) -> bool:
    plan_id = payload.get("plan_id")
    if not plan_id:
        return False
    plan = await load_plan(plan_id)
    if not plan:
        return False
    # Reset error/done items so they re-execute.
    for item in plan.items:
        if item.status in ("error", "skipped"):
            item.status = "pending"
            item.error = None
            item.approved = True
    await save_plan(plan)
    return await _approve_plan(project_id, {"plan_id": plan_id}, ref_message_id, narrator)


# ============================================================================
# Recommendation flow
# ============================================================================

async def _accept_recommendation(project_id: str, payload: dict, narrator: Narrator) -> bool:
    ref_id = payload.get("ref_id")
    cut_id = payload.get("cut_id")
    slot_index = payload.get("slot_index")
    if not (ref_id and cut_id and slot_index is not None):
        return False
    from backend.routes.library import assign_slot, SlotAssignRequest

    try:
        assign_slot(project_id, SlotAssignRequest(cut_id=cut_id, slot_index=int(slot_index), ref_id=ref_id))
        await narrator.text(f"Reference attached to cut slot {slot_index}.")
    except Exception as e:  # noqa: BLE001
        await narrator.failure(error=str(e), suggestion="Try drag-drop instead.", recovery_actions=[])
    return True


async def _generate_new_instead(project_id: str, payload: dict, narrator: Narrator) -> bool:
    # Re-propose the plan so the cached candidate isn't suggested this time.
    cut_id = payload.get("cut_id")
    if not cut_id:
        return False
    return await _propose_plan(project_id, {"cut_id": cut_id, "force_new_gens": True}, narrator)


# ============================================================================
# Batch flow
# ============================================================================

async def _pause_batch(payload: dict, narrator: Narrator) -> bool:
    batch_id = payload.get("batch_id")
    if not batch_id:
        return False
    _paused_batches.add(batch_id)
    await narrator.text(f"Batch `{batch_id[:8]}` paused.")
    return True


async def _cancel_batch(payload: dict, narrator: Narrator) -> bool:
    batch_id = payload.get("batch_id")
    if not batch_id:
        return False
    _cancelled_batches.add(batch_id)
    task = _running_batches.pop(batch_id, None)
    if task and not task.done():
        task.cancel()
    await narrator.text(f"Batch `{batch_id[:8]}` cancelled.")
    return True


# ============================================================================
# Idle + Activity
# ============================================================================

async def _idle_suggestion(project_id: str, narrator: Narrator) -> bool:
    """No-op. Idle suggestions were dropped — turned out to be noise rather
    than signal. The frontend stopped sending the user_idle ping, but we
    still handle the intent here for backwards compat with old tabs."""
    return True


async def _draft_identities(project_id: str, narrator: Narrator) -> bool:
    """Stub — not exposed in current UX. Leaving the handler so a future
    'draft missing identities' button can wire to it cleanly."""
    return True


async def _plan_unrendered(project_id: str, narrator: Narrator) -> bool:
    """Stub — same rationale as _draft_identities."""
    return True


# ============================================================================
# Asset prompt edit + regenerate flow
# ============================================================================

async def _update_render_prompt(
    project_id: str, payload: dict, narrator: Narrator, ref_message_id: str | None
) -> bool:
    """Persist a user-edited prompt onto the render plan item so that when
    the user approves the plan, the executor uses the override instead of
    re-compiling from the DSL. Echoes the change back as a plan_update so
    the PlanCard reflects the new prompt immediately."""
    plan_id = payload.get("plan_id")
    item_id = payload.get("item_id")
    new_prompt = (payload.get("prompt") or "").strip()
    if not (plan_id and item_id and new_prompt):
        return False
    plan = await load_plan(plan_id)
    if not plan:
        return False
    target = next((i for i in plan.items if i.id == item_id), None)
    if target is None:
        return False
    target.payload = {**(target.payload or {}), "prompt_override": new_prompt, "compiled_prompt": new_prompt}
    await save_plan(plan)
    plan_msg_id = ref_message_id or await _get_plan_message_id(plan_id)
    if plan_msg_id:
        try:
            await narrator.update_plan_item(
                plan_msg_id, item_id,
                status=target.status,
                result={"prompt_edited": True},
                error=None,
            )
        except Exception:
            pass
    await narrator.text("Prompt saved. Approve the plan to render with your edits.")
    return True


async def _update_asset_prompt(project_id: str, payload: dict, narrator: Narrator) -> bool:
    """Patch assets.suggested_prompt and re-extract structured identity
    locks (appearance / distinctive_features / wardrobe_lock) so the cut
    DSL has rich grounding next time. The user can then regenerate the
    identity image."""
    asset_id = payload.get("asset_id")
    new_prompt = (payload.get("prompt") or "").strip()
    if not asset_id or not new_prompt:
        return False
    from backend import db
    get_async_connection = db.get_async_connection
    from backend.orchestrator.identity_traits import extract_identity_traits

    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT type, name FROM assets WHERE id = ? AND project_id = ?",
            (asset_id, project_id),
        ) as cur:
            row = await cur.fetchone()
        asset_type = (row["type"] if row else "character") or "character"
        asset_name = (row["name"] if row else "") or ""
        await conn.execute(
            "UPDATE assets SET suggested_prompt = ? WHERE id = ? AND project_id = ?",
            (new_prompt, asset_id, project_id),
        )
        await conn.commit()

    traits = await extract_identity_traits(new_prompt, asset_type=asset_type, asset_name=asset_name)
    if any(traits.values()):
        async with get_async_connection() as conn:
            await conn.execute(
                "UPDATE assets SET appearance = ?, distinctive_features = ?, "
                "wardrobe_lock = ?, consistency_tokens = ? "
                "WHERE id = ? AND project_id = ?",
                (
                    traits.get("appearance") or "",
                    traits.get("distinctive_features") or "",
                    traits.get("wardrobe_lock") or "",
                    traits.get("consistency_tokens") or "",
                    asset_id,
                    project_id,
                ),
            )
            await conn.commit()

    await narrator.text(f"Prompt saved for asset `{asset_id[:8]}` — identity locks refreshed.")
    return True


async def _regenerate_asset_identity(project_id: str, payload: dict, narrator: Narrator) -> bool:
    """Update prompt (if provided) and regenerate the asset's identity
    reference. Supersedes the prior identity — the new one becomes the
    active anchor for downstream cuts."""
    asset_id = payload.get("asset_id")
    new_prompt = (payload.get("prompt") or "").strip()
    if not asset_id:
        return False

    from backend import db
    get_async_connection = db.get_async_connection
    from backend.orchestrator import references

    if new_prompt:
        async with get_async_connection() as conn:
            await conn.execute(
                "UPDATE assets SET suggested_prompt = ? WHERE id = ? AND project_id = ?",
                (new_prompt, asset_id, project_id),
            )
            await conn.commit()

    # Supersede prior identity so the regen mints a fresh one.
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT id, image_url FROM reference_pool WHERE asset_id = ? AND label = 'identity' AND is_active = 1",
            (asset_id,),
        ) as cur:
            old = await cur.fetchone()
        if old:
            await conn.execute(
                "UPDATE reference_pool SET is_active = 0 WHERE id = ?", (old["id"],),
            )
            await conn.commit()

    await narrator.text(f"Regenerating identity for asset `{asset_id[:8]}`…")
    try:
        new_ref = await references.generate_identity_card(asset_id)
    except Exception as e:  # noqa: BLE001
        await narrator.failure(error=str(e), suggestion="Check the prompt and try again.", recovery_actions=[])
        return True

    # Point the prior identity at the new one for clear lineage.
    if old and new_ref.get("id"):
        async with get_async_connection() as conn:
            await conn.execute(
                "UPDATE reference_pool SET superseded_by_id = ? WHERE id = ?",
                (new_ref["id"], old["id"]),
            )
            await conn.commit()

    await narrator.reference_card(
        ref={
            "id": new_ref["id"],
            "image_url": new_ref["image_url"],
            "label": "identity",
            "asset_name": "",
        },
        status="newly_generated",
        cost_usd=new_ref.get("cost_usd", 0.0),
    )
    return True


# ============================================================================
# Refine an existing reference (asset variant) with feedback
# ============================================================================

async def _refine_reference(project_id: str, payload: dict, narrator: Narrator) -> bool:
    """Generate a sibling reference using the parent's identity + the user's
    feedback as story_context. Useful for 'this expression is wrong, here's
    what I want' on asset references. Supersedes nothing — the original
    stays around so the user can compare."""
    ref_id = payload.get("ref_id")
    asset_id = payload.get("asset_id")
    feedback = (payload.get("feedback") or "").strip()
    if not (ref_id and feedback):
        return False
    if not asset_id:
        from backend import db
        get_async_connection = db.get_async_connection
        async with get_async_connection() as conn:
            async with conn.execute(
                "SELECT asset_id, label FROM reference_pool WHERE id = ?", (ref_id,),
            ) as cur:
                row = await cur.fetchone()
        if not row:
            await narrator.failure(error=f"Reference {ref_id[:8]} not found", suggestion="", recovery_actions=[])
            return True
        asset_id = row["asset_id"]

    await narrator.text(f"Refining reference `{ref_id[:8]}` with your feedback…")
    try:
        from backend.orchestrator import references
        # Use a label that captures the refinement intent.
        label = f"refine_{ref_id[-6:]}"
        new_ref = await references.generate_pose(
            asset_id=asset_id,
            label=label,
            story_context=feedback,
            parent_reference_id=ref_id,
        )
    except Exception as e:  # noqa: BLE001
        await narrator.failure(error=str(e), suggestion="Try a different prompt.", recovery_actions=[])
        return True

    await narrator.reference_card(
        ref={
            "id": new_ref["id"],
            "image_url": new_ref["image_url"],
            "label": label,
            "asset_name": "",
        },
        status="newly_generated",
        cost_usd=new_ref.get("cost_usd", 0.0),
    )
    return True


async def _activity_summary(project_id: str, payload: dict, narrator: Narrator) -> bool:
    last_seen = payload.get("last_seen_ts")
    if not last_seen:
        return True
    from backend import db
    get_async_connection = db.get_async_connection

    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT ts, agent_id, event_type, payload_json FROM agent_events "
            "WHERE project_id = ? AND ts > ? "
            "ORDER BY ts ASC LIMIT 50",
            (project_id, last_seen),
        ) as cur:
            rows = [dict(r) for r in await cur.fetchall()]
    if not rows:
        return True
    events = []
    for r in rows:
        when = (r.get("ts") or "")[11:19]  # HH:MM:SS
        what = f"{r.get('agent_id', '?')} · {r.get('event_type', '?')}"
        cost = 0.0
        try:
            p = json.loads(r.get("payload_json") or "{}")
            cost = float(p.get("cost_usd") or 0)
        except Exception:
            pass
        events.append({"when": when, "what": what, "cost_usd": cost})
    await narrator.activity(events=events)
    return True


# ============================================================================
# Briefing confirm
# ============================================================================

async def _confirm_briefing(project_id: str, narrator: Narrator) -> bool:
    """Direct phase advancement — no LLM call. Backs the chat ActionsBar
    "Yes, proceed" button AND the PhaseRail "Move to next phase" button
    when the project is in BRIEF."""
    from backend.tools.briefing import confirm_briefing_complete as _confirm
    from backend.orchestrator.style_bible import compile_style_bible_for_project

    # `confirm_briefing_complete` is async — earlier code dropped the
    # coroutine on the floor and the phase never actually advanced. That's
    # why the PhaseRail button "did nothing".
    msg = await _confirm(project_id)
    await narrator.text(str(msg))
    # Phase L1: distill the brief's prose into a quotable style bible
    # (palette_hex + style_tokens + lighting_rules) so every Atlas / Pixel
    # prompt downstream can append the same shared vocabulary.
    # Best-effort — never block the BRIEF→STORY handoff.
    try:
        bible = await compile_style_bible_for_project(project_id)
        if bible.get("palette_hex") or bible.get("style_tokens"):
            tokens = ", ".join(bible.get("style_tokens") or [])
            palette = ", ".join(bible.get("palette_hex") or [])
            await narrator.text(
                "🎨 Style bible compiled.\n"
                + (f"  • Palette: {palette}\n" if palette else "")
                + (f"  • Tokens: {tokens}" if tokens else "")
            )
        elif bible.get("_failed"):
            # Loud failure (I5) — without this, Test1's bible came back
            # empty and nobody noticed until cuts rendered with drifting
            # palettes. Surface to chat so the user can repair.
            await narrator.failure(
                error="Style bible compile returned empty after retry.",
                suggestion="Render quality will degrade without locked palette + tokens. Click 🔧 Repair to retry, or edit the brief and try again.",
                recovery_actions=[
                    Action(label="🎨 Retry bible compile", intent="recompile_style_bible", primary=True),
                ],
            )
    except Exception:  # noqa: BLE001
        pass
    # L2 — mint the project's pinned style anchor image so every
    # downstream generation can attach it as a visual reference.
    try:
        from backend.orchestrator.style_anchor import ensure_style_anchor
        url = await ensure_style_anchor(project_id)
        if url:
            await narrator.text(f"🖼️ Style anchor pinned. Every generation will reference it.")
    except Exception:  # noqa: BLE001
        pass
    return True


# ============================================================================
# Generic phase-advance — backs the PhaseRail "Move to next phase" button.
# Picks the right confirm_*_complete tool based on current_phase and runs it
# DIRECTLY (no LLM call). The user sees the result via the phase_change event
# the chat WS already emits when current_phase advances.
# ============================================================================

async def _advance_phase(project_id: str, narrator: Narrator) -> bool:
    from backend import db_async

    project = await db_async.get_project(project_id)
    if not project:
        await narrator.text("Project not found.")
        return True
    current = (project.get("current_phase") or "BRIEF").upper()

    if current == "BRIEF":
        return await _confirm_briefing(project_id, narrator)

    if current == "STORY":
        from backend.tools.blueprint import confirm_blueprint_complete
        msg = confirm_blueprint_complete(project_id)
        await narrator.text(msg)
        return True

    if current == "ASSETS":
        from backend.tools.assets import confirm_asset_extraction_complete
        result = confirm_asset_extraction_complete(project_id)
        if isinstance(result, dict):
            msg = result.get("message") or "Phase advanced."
        else:
            msg = str(result)
        await narrator.text(msg)
        return True

    if current == "GENERATE":
        await narrator.text("GENERATE is the final phase — nothing further to advance to.")
        return True

    await narrator.text(f"Don't know how to advance from phase `{current}`.")
    return True


# ============================================================================
# Repair intents — surfaced inline in chat as ActionsBar buttons. No
# standalone Consistency menu needed.
# ============================================================================

async def _recompile_bible(project_id: str, narrator: Narrator) -> bool:
    from backend.orchestrator.style_bible import compile_style_bible_for_project

    await narrator.text("🎨 Recompiling style bible…")
    try:
        bible = await compile_style_bible_for_project(project_id)
    except Exception as e:  # noqa: BLE001
        await narrator.failure(error=str(e), suggestion="Check the brief has art_style set.", recovery_actions=[])
        return True
    pal = ", ".join(bible.get("palette_hex") or []) or "(none)"
    tok = ", ".join(bible.get("style_tokens") or []) or "(none)"
    await narrator.text(f"✓ Bible compiled.\n  • Palette: {pal}\n  • Tokens: {tok}")
    return True


async def _recompile_anchor(project_id: str, narrator: Narrator) -> bool:
    from backend.orchestrator.style_anchor import recompile_style_anchor

    await narrator.text("🖼️ Minting a fresh style anchor image…")
    try:
        url = await recompile_style_anchor(project_id)
    except Exception as e:  # noqa: BLE001
        await narrator.failure(error=str(e), suggestion="Check brief.art_style.", recovery_actions=[])
        return True
    if not url:
        await narrator.text("Couldn't mint anchor — brief needs art_style or color_palette.")
        return True
    await narrator.text("✓ Style anchor pinned. Every generation now references it.")
    return True


async def _regenerate_identities(project_id: str, narrator: Narrator) -> bool:
    """Mark every active identity superseded and re-mint each. Costs one
    image gen per asset. We surface a tool_call card so the user sees cost
    + latency live."""
    from backend import db
    get_async_connection = db.get_async_connection
    from backend.orchestrator import references
    import time as _time

    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT id, name, type FROM assets WHERE project_id = ? "
            "AND COALESCE(type,'') IN "
            "('character','location','prop','sublocation','location_angle')",
            (project_id,),
        ) as cur:
            assets = [dict(r) for r in await cur.fetchall()]
        await conn.execute(
            "UPDATE reference_pool SET is_active = 0 "
            "WHERE asset_id IN (SELECT id FROM assets WHERE project_id = ?) "
            "AND label = 'identity' AND is_active = 1",
            (project_id,),
        )
        await conn.commit()

    if not assets:
        await narrator.text("No assets to regenerate.")
        return True

    await narrator.text(f"♻️ Re-minting {len(assets)} asset identities (≈${len(assets) * 0.20:.2f})…")
    minted = 0
    failed = 0
    t0 = _time.monotonic()
    for a in assets:
        try:
            await references.generate_identity_card(a["id"])
            minted += 1
        except Exception:  # noqa: BLE001
            failed += 1
    elapsed = int(_time.monotonic() - t0)
    await narrator.text(f"✓ Re-minted {minted} identities ({failed} failed) in {elapsed}s.")
    return True


async def _repair_all(project_id: str, narrator: Narrator) -> bool:
    """Bible → anchor → identities, in order. The full lift-onto-new-stack
    pass for projects created before the consistency work landed."""
    await _recompile_bible(project_id, narrator)
    await _recompile_anchor(project_id, narrator)
    await _regenerate_identities(project_id, narrator)
    await narrator.text("✓ Consistency repair complete.")
    return True
