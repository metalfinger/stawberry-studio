"""
Cut Executor — runs an approved Plan.

Public API:
    execute_plan(plan_id, on_step) -> ExecuteResult

Each plan item is executed in dependency order. Per-item callback fires so
the agent (Pixel) can update the chat ProgressCard. Lazy-fill / generation
items create reference_pool rows. The Render item composes the cut via
Nano Banana Pro using all approved reference items as slots. The Register
item supersedes prior cut versions and persists the new render to
reference_pool with label='render_v{N}'.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Any, Callable

import structlog

from backend.database.core import get_async_connection
from backend.orchestrator import references_v2
from backend.orchestrator.context_bundler import bundle_cut_context
from backend.orchestrator.events import RunContext, log_event
from backend.orchestrator.narrator import Narrator
from backend.orchestrator.plans import (
    ITEM_KIND_REFERENCE_GENERATE,
    ITEM_KIND_REFERENCE_REUSE,
    ITEM_KIND_REGISTER,
    ITEM_KIND_RENDER,
    Plan,
    PlanItem,
    load_plan,
    save_plan,
    update_plan_status,
)
from backend.orchestrator.prompt_dsl import compile_prompt
from backend.providers import ImageGenRequest, ProviderError, ReferenceImage, get_registry

log = structlog.get_logger(__name__)


# ============================================================================
# Result type
# ============================================================================

class ExecuteResult:
    def __init__(self):
        self.plan_id: str = ""
        self.cut_id: str | None = None
        self.image_url: str | None = None
        self.reference_id: str | None = None
        self.cost_usd: float = 0.0
        self.error: str | None = None
        self.items_done: int = 0
        self.items_total: int = 0

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


# ============================================================================
# Helpers
# ============================================================================

def _build_template_from_ctx(ctx, cumulative_feedback: list[str]) -> str:
    """Build the DSL template for the cut. Threads cumulative feedback as
    a USER FEEDBACK block at the end so it influences the render."""
    cut = ctx.cut
    scene = ctx.scene
    shot = ctx.shot

    blocks: list[str] = ["[STYLE]"]

    for c in ctx.linked_characters:
        blocks.append(f"[CHARACTER:{c['id']}]")
    for loc in ctx.linked_locations:
        blocks.append(f"[SETTING:{loc['id']}]")
    if scene and scene.get("id"):
        blocks.append(f"[LIGHTING:{scene['id']}]")

    action_bits: list[str] = []
    for k in ("action", "story_description", "expression", "body_language",
              "gesture", "gaze_direction", "prop_interaction", "costume_notes"):
        v = (cut.get(k) or "").strip()
        if v:
            action_bits.append(v)
    if action_bits:
        blocks.append("[ACTION] " + " ".join(action_bits))

    cam_bits: list[str] = []
    for k in ("override_camera_distance", "override_focus_point"):
        v = (cut.get(k) or "").strip()
        if v:
            cam_bits.append(v)
    for k in ("camera_distance", "camera_angle", "camera_movement", "lens_type", "focal_length_mm"):
        v = (shot or {}).get(k)
        if v:
            cam_bits.append(str(v))
    if cam_bits:
        blocks.append("[CAMERA] " + ", ".join(cam_bits))

    if ctx.previous_cut and ctx.previous_cut.get("generated_image_url"):
        prev_action = (ctx.previous_cut.get("action") or "").strip()
        if prev_action:
            blocks.append(f"[CONTINUITY] previous beat: {prev_action}")

    blocks.append("[NEGATIVE]")

    template = "\n".join(blocks)

    if cumulative_feedback:
        feedback_block = "\n\n## USER FEEDBACK (cumulative — apply ALL)\n"
        for i, f in enumerate(cumulative_feedback, start=1):
            feedback_block += f"{i}. {f}\n"
        template += feedback_block

    return template


async def _next_render_version(cut_id: str) -> int:
    """Compute the next v{N} for a cut's render references."""
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT label FROM reference_pool WHERE source_cut_id = ? AND label LIKE 'render_v%'",
            (cut_id,),
        ) as cur:
            rows = await cur.fetchall()
    versions = []
    for r in rows:
        lbl = r["label"]
        if lbl and lbl.startswith("render_v"):
            try:
                versions.append(int(lbl[len("render_v"):]))
            except ValueError:
                pass
    return (max(versions) + 1) if versions else 1


async def _supersede_prior_renders(cut_id: str, new_ref_id: str) -> None:
    """Mark all prior render references for this cut as superseded."""
    async with get_async_connection() as conn:
        await conn.execute(
            """
            UPDATE reference_pool
            SET is_active = 0, superseded_by_id = ?
            WHERE source_cut_id = ? AND label LIKE 'render_v%' AND id != ? AND is_active = 1
            """,
            (new_ref_id, cut_id, new_ref_id),
        )
        await conn.commit()


async def _previous_render_url(cut_id: str, *, exclude_url: str | None = None) -> str | None:
    """Most recent prior render image_url for this cut (active or superseded)."""
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT image_url FROM reference_pool WHERE source_cut_id = ? AND label LIKE 'render_v%' "
            "ORDER BY created_at DESC LIMIT 5",
            (cut_id,),
        ) as cur:
            rows = await cur.fetchall()
    for r in rows:
        url = r["image_url"]
        if url and url != exclude_url:
            return url
    return None


async def _append_used_in_cuts(ref_ids: list[str], cut_id: str) -> None:
    """Append cut_id to each consumed reference's `used_in_cuts_json`. Lets
    the Library show 'used in N cuts' counts truthfully."""
    if not ref_ids or not cut_id:
        return
    async with get_async_connection() as conn:
        for rid in ref_ids:
            async with conn.execute(
                "SELECT used_in_cuts_json FROM reference_pool WHERE id = ?", (rid,),
            ) as cur:
                row = await cur.fetchone()
            if not row:
                continue
            try:
                arr = json.loads(row["used_in_cuts_json"] or "[]")
            except Exception:
                arr = []
            if cut_id not in arr:
                arr.append(cut_id)
                await conn.execute(
                    "UPDATE reference_pool SET used_in_cuts_json = ? WHERE id = ?",
                    (json.dumps(arr), rid),
                )
        await conn.commit()


async def _persist_cut_image(cut_id: str, image_url: str, status: str) -> None:
    async with get_async_connection() as conn:
        await conn.execute(
            "UPDATE cuts SET generated_image_url = ?, generation_status = ? WHERE id = ?",
            (image_url, status, cut_id),
        )
        await conn.commit()


async def _append_refinement_feedback(cut_id: str, new_feedback: list[str]) -> None:
    """Persist cumulative feedback chain on cuts.refinement_feedback (JSON)."""
    if not new_feedback:
        return
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT refinement_feedback FROM cuts WHERE id = ?", (cut_id,)
        ) as cur:
            row = await cur.fetchone()
        existing = json.loads((row and row["refinement_feedback"]) or "[]") if row else []
        merged = existing + [f for f in new_feedback if f not in existing]
        await conn.execute(
            "UPDATE cuts SET refinement_feedback = ? WHERE id = ?",
            (json.dumps(merged), cut_id),
        )
        await conn.commit()


# ============================================================================
# Public: execute_plan
# ============================================================================

async def execute_plan(
    plan_id: str,
    *,
    on_step: Callable[[PlanItem], None] | None = None,
) -> ExecuteResult:
    """Run an approved Plan. Each item executes; on_step fires after each."""
    plan = await load_plan(plan_id)
    if not plan:
        raise ValueError(f"plan {plan_id} not found")

    result = ExecuteResult()
    result.plan_id = plan_id
    result.cut_id = plan.cut_id
    result.items_total = len(plan.items)

    rc = RunContext(project_id=plan.project_id, phase="STORYBOARD", agent_id="cut_executor")
    await update_plan_status(plan_id, "executing")
    await log_event(rc, "plan_execute_start", {"plan_id": plan_id, "items": len(plan.items)})

    if plan.cut_id:
        await _persist_cut_image(plan.cut_id, "", "in_progress")

    ctx = await bundle_cut_context(plan.cut_id) if plan.cut_id else None

    # Narrator publishes typed events to the project's Console subscribers
    # (chat WS). Lets the executor emit reference cards, images, and
    # comparisons without holding the WS handle.
    narrator = Narrator(plan.project_id)
    consumed_ref_ids: list[str] = []  # for used_in_cuts_json bookkeeping
    # Render bookkeeping passed from RENDER → REGISTER so the library row
    # has full provenance (prompt, cost, model, which slots fed in).
    render_meta: dict[str, Any] = {}

    # Tracks references that will be passed to the render step
    ref_slots: list[ReferenceImage] = []

    def _emit(item: PlanItem) -> None:
        await_save_done = save_plan(plan)  # noqa: F841 (fire-and-forget below)
        if on_step:
            try:
                on_step(item)
            except Exception:
                log.exception("on_step_callback_failed", item_id=item.id)

    async def _emit_async(item: PlanItem) -> None:
        await save_plan(plan)
        if on_step:
            try:
                on_step(item)
            except Exception:
                log.exception("on_step_callback_failed", item_id=item.id)

    try:
        for item in plan.items:
            if not item.approved:
                item.status = "skipped"
                await _emit_async(item)
                continue

            item.status = "running"
            await _emit_async(item)

            try:
                if item.kind == ITEM_KIND_REFERENCE_REUSE:
                    image_url = item.payload.get("image_url")
                    ref_id = item.payload.get("reference_id")
                    if image_url:
                        ref_slots.append(ReferenceImage(
                            image_url=image_url,
                            slot=len(ref_slots) + 1,
                            name=item.payload.get("label") or "ref",
                        ))
                    if ref_id:
                        consumed_ref_ids.append(ref_id)
                    item.status = "done"
                    item.result = {"image_url": image_url}
                    try:
                        await narrator.reference_card(
                            ref={
                                "id": ref_id or "",
                                "image_url": image_url,
                                "label": item.payload.get("label") or "ref",
                                "asset_name": item.payload.get("asset_name") or "",
                            },
                            status="cached",
                            cost_usd=0.0,
                        )
                    except Exception:
                        log.exception("emit_ref_card_failed")

                elif item.kind == ITEM_KIND_REFERENCE_GENERATE:
                    asset_id = item.payload.get("asset_id")
                    label = item.payload.get("label")
                    story = item.payload.get("story_context")
                    ref = await references_v2.get_or_generate(
                        asset_id, label, story_context=story,
                    )
                    item.status = "done"
                    item.result = {
                        "reference_id": ref["id"],
                        "image_url": ref["image_url"],
                        "label": ref["label"],
                        "cost_usd": ref.get("cost_usd", 0.0),
                    }
                    result.cost_usd += ref.get("cost_usd", 0.0)
                    ref_slots.append(ReferenceImage(
                        image_url=ref["image_url"],
                        slot=len(ref_slots) + 1,
                        name=label or "ref",
                    ))
                    consumed_ref_ids.append(ref["id"])
                    try:
                        await narrator.reference_card(
                            ref={
                                "id": ref["id"],
                                "image_url": ref["image_url"],
                                "label": label or "ref",
                                "asset_name": item.payload.get("asset_name") or "",
                            },
                            status="newly_generated",
                            cost_usd=ref.get("cost_usd", 0.0),
                        )
                    except Exception:
                        log.exception("emit_ref_card_failed")

                elif item.kind == ITEM_KIND_RENDER:
                    if not ctx:
                        raise RuntimeError("render item without cut context")
                    cumulative_feedback = item.payload.get("feedback") or []
                    # Auto-prepend project style anchor as slot 0 when one
                    # exists and isn't already present.
                    if ctx.style_anchor and ctx.style_anchor.get("image_url"):
                        anchor_url = ctx.style_anchor["image_url"]
                        if not any(s.image_url == anchor_url for s in ref_slots):
                            ref_slots.insert(0, ReferenceImage(
                                image_url=anchor_url, slot=1, name="style_anchor",
                            ))
                            for i, s in enumerate(ref_slots):
                                s.slot = i + 1
                    template = _build_template_from_ctx(ctx, cumulative_feedback)
                    compiled = compile_prompt(template, plan.project_id)
                    # Trim slots to provider limit (5).
                    refs_for_call = ref_slots[:5]
                    reg = get_registry()
                    img_provider, model = reg.image_for_role("pro")
                    req = ImageGenRequest(
                        prompt=compiled.final_prompt,
                        model=model,
                        aspect_ratio=ctx.aspect_ratio or "16:9",
                        resolution="2048x2048",
                        num_images=1,
                        negative_prompt=ctx.negatives,
                        reference_images=refs_for_call,
                    )
                    # Live "Rendering…" indication. The elapsed pseudo-msg
                    # shows a spinner + ETA so the user knows the gen is in
                    # flight (Nano Banana Pro can take 20–40s).
                    started_at = datetime.now().isoformat()
                    rendering_msg_id = None
                    try:
                        rendering_msg_id = await narrator.elapsed(
                            label=f"Rendering cut {(plan.cut_id or '')[-6:]} on {model}…",
                            started_at=started_at,
                            estimated_total_s=30,
                        )
                    except Exception:
                        pass
                    img_result = await img_provider.generate(req)
                    image_url = img_result.image_urls[0]
                    item.status = "done"
                    item.result = {
                        "image_url": image_url,
                        "cost_usd": img_result.cost_usd,
                        "model_used": img_result.model_used,
                        "prompt_chars": len(compiled.final_prompt),
                        "slots": len(refs_for_call),
                    }
                    # Stash for REGISTER so the library row carries the full
                    # generation context (re-use decisioning needs this).
                    render_meta = {
                        "prompt": compiled.final_prompt,
                        "cost_usd": img_result.cost_usd,
                        "model_used": img_result.model_used,
                        "request_id": img_result.image_id,
                        "aspect_ratio": req.aspect_ratio,
                        "slots_used": [
                            {"slot": s.slot, "name": s.name, "image_url": s.image_url}
                            for s in refs_for_call
                        ],
                        "consumed_ref_ids": list(consumed_ref_ids),
                        "feedback_round": plan.feedback_round,
                        "feedback_chain": list(plan.feedback or []),
                    }
                    result.image_url = image_url
                    result.cost_usd += img_result.cost_usd
                    # Emit a typed image so the Console renders it inline,
                    # not just behind the plan card.
                    try:
                        await narrator.image(
                            image_url,
                            caption=f"Cut render · ${img_result.cost_usd:.2f}",
                            metadata={"plan_id": plan.id, "cut_id": plan.cut_id},
                        )
                    except Exception:
                        log.exception("emit_image_failed")
                    # If this is a refinement (feedback present), surface a
                    # before/after Comparison so the user can accept/refine
                    # without leaving the chat.
                    if plan.feedback_round > 0 and plan.cut_id:
                        try:
                            prev = await _previous_render_url(plan.cut_id, exclude_url=image_url)
                            if prev:
                                from backend.orchestrator.narrator import Action as _Action
                                await narrator.comparison(
                                    left_url=prev,
                                    right_url=image_url,
                                    left_label="Previous",
                                    right_label=f"Round {plan.feedback_round}",
                                    actions=[
                                        _Action(label="Accept", intent="approve_cut_render", payload={"cut_id": plan.cut_id, "image_url": image_url}, primary=True),
                                        _Action(label="Refine again", intent="propose_cut_plan", payload={"cut_id": plan.cut_id, "parent_plan_id": plan.id}),
                                    ],
                                )
                        except Exception:
                            log.exception("emit_comparison_failed")

                elif item.kind == ITEM_KIND_REGISTER:
                    cut_id = item.payload.get("cut_id")
                    if not result.image_url or not cut_id:
                        item.status = "skipped"
                        item.error = "no image to register"
                    else:
                        version = await _next_render_version(cut_id)
                        from backend.orchestrator.references import register_image
                        ref_id = await register_image(
                            project_id=plan.project_id,
                            image_url=result.image_url,
                            source_type="cut",
                            source_cut_id=cut_id,
                            source_request_id=render_meta.get("request_id"),
                            aspect_ratio=render_meta.get("aspect_ratio") or "",
                            tags={
                                "label": f"render_v{version}",
                                "feedback_round": plan.feedback_round,
                                "plan_id": plan.id,
                                "slots_used": render_meta.get("slots_used") or [],
                                "consumed_ref_ids": render_meta.get("consumed_ref_ids") or [],
                                "feedback_chain": render_meta.get("feedback_chain") or [],
                            },
                        )
                        # Backfill the metadata register_image doesn't take —
                        # this is what makes the Library detail pane truly
                        # useful for "is this reusable, or do I need a variant?".
                        async with get_async_connection() as conn:
                            await conn.execute(
                                """UPDATE reference_pool
                                   SET label = ?, is_active = 1,
                                       prompt = ?, cost_usd = ?, model_used = ?
                                   WHERE id = ?""",
                                (
                                    f"render_v{version}",
                                    render_meta.get("prompt", "") or "",
                                    float(render_meta.get("cost_usd", 0) or 0),
                                    render_meta.get("model_used", "") or "",
                                    ref_id,
                                ),
                            )
                            await conn.commit()
                        await _supersede_prior_renders(cut_id, ref_id)
                        await _persist_cut_image(cut_id, result.image_url, "complete")
                        # Append cumulative feedback (only new round) to cut.
                        if plan.feedback:
                            await _append_refinement_feedback(cut_id, plan.feedback[-1:])
                        # Truthfully record which library refs this render
                        # consumed, so the Library "used in N cuts" badge
                        # actually means something.
                        await _append_used_in_cuts(consumed_ref_ids, cut_id)
                        item.status = "done"
                        item.result = {"reference_id": ref_id, "version": version}
                        result.reference_id = ref_id
                else:
                    item.status = "done"  # unknown kind treated as no-op

                result.items_done += 1
                await _emit_async(item)

            except ProviderError as pe:
                item.status = "error"
                item.error = str(pe)
                result.error = str(pe)
                await _emit_async(item)
                log.exception("plan_item_provider_error", item_id=item.id)
                break
            except Exception as e:
                item.status = "error"
                item.error = str(e)
                result.error = str(e)
                await _emit_async(item)
                log.exception("plan_item_failed", item_id=item.id)
                break

        plan.status = "done" if result.error is None else "error"
        plan.completed_at = datetime.now().isoformat()
        await save_plan(plan)
        await update_plan_status(plan_id, plan.status)
        await log_event(rc, "plan_execute_done", {
            "plan_id": plan_id,
            "image_url": result.image_url,
            "cost_usd": result.cost_usd,
            "items_done": result.items_done,
            "error": result.error,
        })

    finally:
        if plan.cut_id and not result.image_url and not result.error:
            await _persist_cut_image(plan.cut_id, "", "failed")

    return result
