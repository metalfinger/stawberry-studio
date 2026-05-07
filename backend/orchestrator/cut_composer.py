"""
Cut Composer — the one-button "compose this cut" pipeline.

Orchestrates the seven steps that turn a planned cut into a finished panel:

  1. bundle_cut_context(cut_id)        → full project tree + bible + neighbours
  2. pick_for_cut(...)                 → ranked reference slots (Smart Picker)
  3. gap detection → iris.compose_missing_reference (silent pre-prod fixer)
  4. compile_prompt(...)               → DSL → final prompt + slot URLs
  5. image provider .generate(...)     → Nano Banana Pro render
  6. review_cut(...)                   → vision continuity critic; auto-retry up to 2x
  7. auto_register_cut(...)            → reference_pool indexing + DB write

Each step yields a `ComposeStep` dict that callers (the WebSocket route) can
stream to the UI. The final return is a `ComposeResult` with the image URL,
critic verdict, and full event trace.

Invariants:
  - One call ⇒ one cut output; no batching.
  - Failures inside any step do NOT raise; they record a `compose_step` with
    status="error" and abort cleanly. The caller decides whether to surface.
  - All work runs against the live DB; no dry-run mode.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, AsyncIterator

import structlog

from backend.database.core import get_async_connection
from backend.orchestrator.context_bundler import CutContext, bundle_cut_context
from backend.orchestrator.events import RunContext, log_event
from backend.orchestrator.picker import pick_for_cut
from backend.orchestrator.prompt_dsl import CompiledPrompt, compile_prompt
from backend.orchestrator.references import auto_register_cut
from backend.orchestrator.vision_critic import ContinuityScore, review_cut
from backend.providers import ImageGenRequest, ProviderError, ReferenceImage, get_registry

log = structlog.get_logger(__name__)


# ============================================================================
# Result types
# ============================================================================

@dataclass
class ComposeStep:
    step: str          # "bundle" | "pick" | "preprod" | "prompt" | "render" | "critic" | "register"
    status: str        # "start" | "ok" | "skip" | "error"
    detail: dict[str, Any] = field(default_factory=dict)
    ts: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> dict[str, Any]:
        return {"step": self.step, "status": self.status, "detail": self.detail, "ts": self.ts}


@dataclass
class ComposeResult:
    cut_id: str
    image_url: str | None
    score: ContinuityScore | None
    attempts: int
    steps: list[ComposeStep]
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "cut_id": self.cut_id,
            "image_url": self.image_url,
            "score": self.score.model_dump() if self.score else None,
            "attempts": self.attempts,
            "steps": [s.to_dict() for s in self.steps],
            "error": self.error,
        }


# ============================================================================
# Helpers
# ============================================================================

def _build_template(ctx: CutContext) -> str:
    """Build a DSL template from the bundled cut context.

    This is deterministic and explicit so the prompt-engineer can audit/edit.
    The compiler will resolve [CHARACTER:id] / [SETTING:id] / [LIGHTING:scene_id]
    against the Continuity Bible.
    """
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
    return "\n".join(blocks)


async def _detect_gaps(ctx: CutContext) -> list[dict[str, Any]]:
    """Return a list of missing-pre-production gaps the cut needs.

    A "gap" today = a linked character/location with no active sheet AND no
    master image. Iris will fill these in step 3.
    """
    gaps: list[dict[str, Any]] = []
    for kind, items in (("character", ctx.linked_characters),
                        ("location", ctx.linked_locations),
                        ("prop", ctx.linked_props)):
        for a in items:
            has_sheet = bool(a.get("sheet"))
            has_master = bool((a.get("master") or {}).get("master_image_url") or a.get("image_url"))
            if not (has_sheet or has_master):
                gaps.append({"asset_id": a["id"], "type": kind, "name": a.get("name")})
    return gaps


async def _pick_references(ctx: CutContext) -> list[dict[str, Any]]:
    picks = await pick_for_cut(ctx.project_id, ctx.cut_id, max_slots=5)

    # Always front-load the style anchor as slot 1 if available and no pick
    # already occupies it.
    if ctx.style_anchor and not any(p.get("slot") == 1 for p in picks):
        picks.insert(0, {
            "reference": ctx.style_anchor,
            "score": 1.0,
            "reasons": ["pinned style anchor"],
            "slot": 1,
            "ref": "@Image1",
        })
    # Re-number slots in case insertion shifted them
    for i, p in enumerate(picks, start=1):
        p["slot"] = i
        p["ref"] = f"@Image{i}"
    return picks


def _slot_dict_from_picks(picks: list[dict[str, Any]]) -> dict[str, str]:
    slots: dict[str, str] = {}
    for p in picks:
        url = (p.get("reference") or {}).get("image_url")
        if url:
            slots[p["ref"]] = url
    return slots


def _to_reference_images(slots: dict[str, str]) -> list[ReferenceImage]:
    refs: list[ReferenceImage] = []
    for ref, url in slots.items():
        try:
            slot_n = int(ref.replace("@Image", ""))
        except ValueError:
            slot_n = len(refs) + 1
        refs.append(ReferenceImage(image_url=url, slot=slot_n, name=ref))
    return refs


async def _persist_cut_image(cut_id: str, image_url: str, status: str) -> None:
    async with get_async_connection() as conn:
        await conn.execute(
            "UPDATE cuts SET generated_image_url = ?, generation_status = ? WHERE id = ?",
            (image_url, status, cut_id),
        )
        await conn.commit()


# ============================================================================
# Public API
# ============================================================================

async def compose_cut(
    cut_id: str,
    *,
    max_critic_retries: int = 2,
    critic_threshold: float = 0.8,
    on_step: "callable[[ComposeStep], None] | None" = None,
) -> ComposeResult:
    """Run the full compose pipeline for one cut. Synchronous-ish: returns
    when the pipeline either succeeds or abandons.

    `on_step` is invoked synchronously after each step is recorded — the
    WebSocket route uses it to stream `compose_step` events to the client.
    """
    steps: list[ComposeStep] = []

    def _emit(step: ComposeStep) -> None:
        steps.append(step)
        if on_step:
            try:
                on_step(step)
            except Exception:
                log.exception("compose_step_callback_failed", step=step.step)

    project_id = ""
    rc = RunContext(project_id="", phase="STORYBOARD", agent_id="cut_composer")

    # ---- Step 1: bundle ----
    _emit(ComposeStep("bundle", "start", {"cut_id": cut_id}))
    try:
        ctx = await bundle_cut_context(cut_id)
        project_id = ctx.project_id
        rc = RunContext(project_id=project_id, phase="STORYBOARD", agent_id="cut_composer")
        await log_event(rc, "compose_bundle_ok", {"cut_id": cut_id, **ctx.stats})
        _emit(ComposeStep("bundle", "ok", {"stats": ctx.stats}))
    except Exception as e:
        log.exception("compose_bundle_failed", cut_id=cut_id)
        _emit(ComposeStep("bundle", "error", {"error": str(e)}))
        return ComposeResult(cut_id=cut_id, image_url=None, score=None, attempts=0, steps=steps, error=str(e))

    await _persist_cut_image(cut_id, ctx.cut.get("generated_image_url") or "", "in_progress")

    # ---- Step 2: pick references ----
    _emit(ComposeStep("pick", "start"))
    try:
        picks = await _pick_references(ctx)
        _emit(ComposeStep("pick", "ok", {
            "count": len(picks),
            "top_scores": [p.get("score") for p in picks[:3]],
        }))
    except Exception as e:
        log.exception("compose_pick_failed", cut_id=cut_id)
        _emit(ComposeStep("pick", "error", {"error": str(e)}))
        picks = []

    # ---- Step 3: pre-prod gap detection (Iris) ----
    _emit(ComposeStep("preprod", "start"))
    try:
        gaps = await _detect_gaps(ctx)
        if not gaps:
            _emit(ComposeStep("preprod", "skip", {"reason": "all linked assets have sheets/masters"}))
        else:
            # Iris module is optional — wire when Step 7 lands.
            try:
                from backend.orchestrator.iris import compose_missing_reference  # type: ignore
            except Exception:
                compose_missing_reference = None  # type: ignore
            if compose_missing_reference is None:
                _emit(ComposeStep("preprod", "skip", {
                    "reason": "iris not yet wired",
                    "gaps": gaps,
                }))
            else:
                filled: list[dict[str, Any]] = []
                for gap in gaps:
                    try:
                        out = await compose_missing_reference(cut_id, gap)
                        filled.append(out)
                    except Exception as ge:
                        log.exception("iris_gap_fill_failed", gap=gap)
                        _emit(ComposeStep("preprod", "error", {"gap": gap, "error": str(ge)}))
                if filled:
                    # Re-bundle so the new sheets/masters are visible downstream
                    ctx = await bundle_cut_context(cut_id)
                    picks = await _pick_references(ctx)
                _emit(ComposeStep("preprod", "ok", {"filled": len(filled), "gaps": gaps}))
    except Exception as e:
        log.exception("compose_preprod_failed", cut_id=cut_id)
        _emit(ComposeStep("preprod", "error", {"error": str(e)}))

    # ---- Step 4: compile prompt ----
    _emit(ComposeStep("prompt", "start"))
    try:
        template = _build_template(ctx)
        compiled: CompiledPrompt = compile_prompt(template, project_id)
        # Merge picker slots — they take priority over DSL-resolved slots
        # since picker uses richer scoring.
        picker_slots = _slot_dict_from_picks(picks)
        merged_slots: dict[str, str] = {**compiled.slots, **picker_slots}
        _emit(ComposeStep("prompt", "ok", {
            "prompt_chars": len(compiled.final_prompt),
            "slots": list(merged_slots.keys()),
            "missing": compiled.missing,
            "used_assets": compiled.used_assets,
        }))
    except Exception as e:
        log.exception("compose_prompt_failed", cut_id=cut_id)
        _emit(ComposeStep("prompt", "error", {"error": str(e)}))
        await _persist_cut_image(cut_id, "", "failed")
        return ComposeResult(cut_id=cut_id, image_url=None, score=None, attempts=0, steps=steps, error=str(e))

    # ---- Steps 5+6: render + critic with retries ----
    reg = get_registry()
    img_provider, model = reg.image_for_role("pro")  # Nano Banana Pro

    final_url: str | None = None
    final_score: ContinuityScore | None = None
    attempts = 0
    last_error: str | None = None

    base_prompt = compiled.final_prompt
    base_refs = _to_reference_images(merged_slots)

    for attempt in range(1, max_critic_retries + 2):  # 1 baseline + up to N retries
        attempts = attempt
        retry_prompt = base_prompt
        if attempt > 1 and final_score is not None:
            # Strengthen reference adherence on retry
            sugg = "; ".join(final_score.suggestions[:3])
            retry_prompt = (
                f"{base_prompt}\n\n## CRITIC RETRY NOTES (attempt {attempt})\n"
                f"Lock identity to slot @Image1. Address: {sugg}"
            )

        _emit(ComposeStep("render", "start", {"attempt": attempt, "model": model}))
        try:
            req = ImageGenRequest(
                prompt=retry_prompt,
                model=model,
                aspect_ratio=ctx.aspect_ratio or "16:9",
                resolution="2048x2048",
                num_images=1,
                negative_prompt=ctx.negatives,
                reference_images=base_refs,
            )
            result = await img_provider.generate(req)
            final_url = result.image_urls[0]
            _emit(ComposeStep("render", "ok", {
                "attempt": attempt,
                "image_url": final_url,
                "cost_usd": result.cost_usd,
                "model_used": result.model_used,
            }))
        except ProviderError as pe:
            last_error = str(pe)
            log.error("compose_render_failed", cut_id=cut_id, attempt=attempt, error=str(pe))
            _emit(ComposeStep("render", "error", {"attempt": attempt, "error": str(pe)}))
            break
        except Exception as e:
            last_error = str(e)
            log.exception("compose_render_unexpected", cut_id=cut_id, attempt=attempt)
            _emit(ComposeStep("render", "error", {"attempt": attempt, "error": str(e)}))
            break

        # Critic
        _emit(ComposeStep("critic", "start", {"attempt": attempt}))
        try:
            char_master = ""
            if ctx.linked_characters:
                m = ctx.linked_characters[0].get("master") or {}
                char_master = m.get("master_image_url") or ctx.linked_characters[0].get("image_url") or ""
            prev_url = (ctx.previous_cut or {}).get("generated_image_url") or ""
            final_score = await review_cut(
                candidate_url=final_url,
                character_master_url=char_master or None,
                previous_cut_url=prev_url or None,
                scene_lighting=ctx.lighting_signature or None,
                project_id=project_id,
                cut_id=cut_id,
                threshold=critic_threshold,
            )
            _emit(ComposeStep("critic", "ok", {
                "attempt": attempt,
                "overall": final_score.overall,
                "passed": final_score.passed(critic_threshold),
                "issues": final_score.issues[:3],
            }))
            if final_score.passed(critic_threshold):
                break
        except Exception as e:
            log.exception("compose_critic_failed", cut_id=cut_id, attempt=attempt)
            _emit(ComposeStep("critic", "error", {"attempt": attempt, "error": str(e)}))
            break

    # ---- Step 7: persist + register ----
    if final_url:
        await _persist_cut_image(cut_id, final_url, "complete")
        _emit(ComposeStep("register", "start"))
        try:
            ref_id = await auto_register_cut(cut_id, final_url)
            _emit(ComposeStep("register", "ok", {"reference_id": ref_id}))
        except Exception as e:
            log.exception("compose_register_failed", cut_id=cut_id)
            _emit(ComposeStep("register", "error", {"error": str(e)}))
    else:
        await _persist_cut_image(cut_id, "", "failed")

    await log_event(rc, "compose_done", {
        "cut_id": cut_id,
        "image_url": final_url,
        "attempts": attempts,
        "passed": bool(final_score and final_score.passed(critic_threshold)),
        "overall": final_score.overall if final_score else None,
    })

    return ComposeResult(
        cut_id=cut_id,
        image_url=final_url,
        score=final_score,
        attempts=attempts,
        steps=steps,
        error=None if final_url else (last_error or "render failed"),
    )


async def stream_compose_cut(cut_id: str, **kwargs) -> AsyncIterator[ComposeStep]:
    """Async-iterator wrapper. Yields each step as it's recorded.

    Implemented via a queue so the underlying pipeline keeps its synchronous
    callback model. The route layer uses this for WebSocket fan-out.
    """
    queue: asyncio.Queue[ComposeStep | None] = asyncio.Queue()

    def _push(step: ComposeStep) -> None:
        queue.put_nowait(step)

    async def _runner() -> None:
        try:
            await compose_cut(cut_id, on_step=_push, **kwargs)
        finally:
            queue.put_nowait(None)

    task = asyncio.create_task(_runner())
    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            yield item
    finally:
        if not task.done():
            await task
