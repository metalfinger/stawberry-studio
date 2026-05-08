"""
Cut Planner — proposes the Plan for composing a cut without executing.

Returns a Plan structure listing every reference required (cached or new),
the render step, and the register step. The agent (Pixel) presents this to
the user as a PlanCard message; the user approves or modifies; the cut
executor then runs the approved plan.

Public API:
    plan_compose_cut(cut_id, feedback=None, parent_plan=None) -> Plan
"""
from __future__ import annotations

import re
from typing import Any

import structlog

from backend.orchestrator import references_v2, picker_v2
from backend.orchestrator.context_bundler import bundle_cut_context
from backend.orchestrator.narrator import Narrator
from backend.orchestrator.plans import (
    ITEM_KIND_PREPROD_FILL,
    ITEM_KIND_REFERENCE_GENERATE,
    ITEM_KIND_REFERENCE_REUSE,
    ITEM_KIND_REGISTER,
    ITEM_KIND_RENDER,
    Plan,
    PlanItem,
    fork_plan_for_refinement,
    make_item,
    make_plan,
)

log = structlog.get_logger(__name__)


# Cost / time estimates per kind. Tuned for Nano Banana Pro Nov-2026 pricing.
_COST_REFERENCE_GEN = 0.04
_COST_RENDER_CUT = 0.04
_ETA_REFERENCE_GEN = 30
_ETA_RENDER_CUT = 30
_ETA_REGISTER = 1
_ETA_REUSE = 0


_CONTINUITY_TOKENS = (
    "still ", "same ", "continues", "continuing", "continue",
    "keeps ", "keep ", "remains", "remain ", "as before",
    "from the previous", "moments later", "a moment later",
    "the next instant", "without cut", "no cut", "match cut",
    "carries on", "follows through", "right after",
)


_RE_ANCHOR_EVERY_N_CUTS = 4
"""Every Nth cut in a chain we drop prev_cut from refs and let the
original identity dominate. Without this, identity drifts by cut 5+
because prev_cut piles its own face/wardrobe on top of identity each
time. 4 is the sweet spot — enough room for natural cut-to-cut flow,
short enough to claw the face back before it's gone."""


def _should_chain_prev_cut(ctx) -> bool:
    """Return True iff the new cut should condition on the previous cut.

    Default (safe): only when same shot OR explicit continuity language is
    present in the cut's action / continuity_notes. The previous beat's
    composition can otherwise pull the model away from the new framing.
    `cuts.chain_from_prev` overrides the heuristic when set explicitly.

    L-fix: every Nth cut we force the chain off so identity re-anchors
    against the original. Otherwise long chains drift faces.
    """
    cut = ctx.cut or {}
    prev = ctx.previous_cut or {}
    # Explicit override (truthy=force chain, falsy="0"/"no"=force off).
    explicit = cut.get("chain_from_prev")
    if explicit is not None and explicit != "":
        return str(explicit).lower() not in ("0", "false", "no", "off")

    # Identity re-anchor: every Nth cut drop prev_cut so the character's
    # original identity reference can dominate without competition.
    cut_num = cut.get("cut_number")
    if isinstance(cut_num, int) and cut_num > 0 and cut_num % _RE_ANCHOR_EVERY_N_CUTS == 0:
        return False

    # Same shot ⇒ continuity is the default expectation.
    if cut.get("shot_id") and prev.get("shot_id") and cut["shot_id"] == prev["shot_id"]:
        return True

    blob = " ".join([
        (cut.get("action") or ""),
        (cut.get("continuity_notes") or ""),
        (cut.get("transition") or ""),
    ]).lower()
    return any(tok in blob for tok in _CONTINUITY_TOKENS)


def _close_enough_alternatives(
    asset_id: str, label: str, all_refs: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Find cached references for the same asset that are close-enough
    substitutes for the requested label. Used by the planner to surface
    'use this instead' alternatives.

    Heuristic: same asset, share a label keyword (e.g. 'expression_focused'
    matches 'expression_angry' on the 'expression' prefix).
    """
    candidates = [r for r in all_refs if r.get("asset_id") == asset_id and r.get("label") and r["label"] != label]
    if not candidates:
        return []
    # Score by token overlap between requested label and candidate label.
    target_tokens = set(re.split(r"[_/\s]+", label.lower()))
    scored = []
    for r in candidates:
        cand_tokens = set(re.split(r"[_/\s]+", (r.get("label") or "").lower()))
        overlap = len(target_tokens & cand_tokens)
        if overlap > 0:
            scored.append((overlap, r))
    scored.sort(reverse=True)
    out = []
    for _, r in scored[:3]:
        cand_tokens = set(re.split(r"[_/\s]+", (r.get("label") or "").lower()))
        shared = ", ".join(sorted(target_tokens & cand_tokens))
        out.append({
            "ref_id": r["id"],
            "label": r["label"],
            "image_url": r["image_url"],
            "reason": f"shares '{shared}'",
        })
    return out


async def plan_compose_cut(
    cut_id: str,
    *,
    feedback: str | None = None,
    parent_plan: Plan | None = None,
) -> Plan:
    """Build a Plan describing what this cut needs.

    Strategy:
    1. Bundle context.
    2. For each linked asset: rank labels via picker_v2.
    3. For each top label per asset: check if reference exists.
       - If exists: reuse item (cached, free, instant).
       - If missing: generate item with cost + ETA + close-enough alternatives.
    4. Add render item + register item.
    5. If feedback present: fork parent plan to carry cumulative feedback.
    """
    ctx = await bundle_cut_context(cut_id)

    if parent_plan and feedback:
        plan = await fork_plan_for_refinement(parent_plan, feedback)
        plan.cut_id = cut_id
    else:
        plan = make_plan(
            project_id=ctx.project_id,
            cut_id=cut_id,
            feedback=[feedback] if feedback else [],
            feedback_round=1 if feedback else 0,
        )

    # Pull every existing reference once for alternative-finding.
    from backend.database.core import get_async_connection
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT * FROM reference_pool WHERE project_id = ? AND is_active = 1",
            (ctx.project_id,),
        ) as cur:
            all_active_refs = [dict(r) for r in await cur.fetchall()]

    # Strong-match candidates we'll surface as a single Recommendation
    # message so the user can pick "use this existing" with one click
    # before approving the plan. Best-overlap candidates only — picker
    # heuristic, not embeddings.
    strong_recs: list[dict[str, Any]] = []

    # Per-asset reference resolution.
    #
    # Continuity learning from Test 2 / cut C2 (the glasses incident):
    # picking BOTH identity AND a variant (e.g. expression_angry) for the
    # same character ended up sending Nano Banana Pro three slots for one
    # face — and the variant pulled the model away from the identity, so
    # fine details (round glasses) were dropped on the second beat. The
    # identity carries the most signal; expression should be expressed via
    # text in [ACTION], not by stacking another image.
    linked = ctx.linked_characters + ctx.linked_locations + ctx.linked_props
    for asset in linked:
        is_character = (asset.get("type") or "").lower() == "character"
        # Characters: identity-only. Locations/props: top-2 still allowed.
        top_n = 1 if is_character else 2
        labels = picker_v2.rank_labels_for_cut(ctx.cut, asset, top_n=top_n)
        # Force identity for characters — picker can rank others first when
        # the cut hints at them, but identity is non-negotiable in slot 1.
        if is_character and "identity" not in labels:
            labels = ["identity"] + labels[:0]
        for label in labels:
            existing = await references_v2.find_reference_by_label(asset["id"], label)
            if existing:
                plan.items.append(make_item(
                    ITEM_KIND_REFERENCE_REUSE,
                    f"Reuse {asset['name']} / {label} (cached)",
                    cost_usd=0.0,
                    eta_s=_ETA_REUSE,
                    cached=True,
                    payload={
                        "asset_id": asset["id"],
                        "asset_name": asset["name"],
                        "label": label,
                        "reference_id": existing["id"],
                        "image_url": existing["image_url"],
                    },
                ))
            else:
                alternatives = _close_enough_alternatives(asset["id"], label, all_active_refs)
                plan.items.append(make_item(
                    ITEM_KIND_REFERENCE_GENERATE,
                    f"Generate {asset['name']} / {label}",
                    cost_usd=_COST_REFERENCE_GEN,
                    eta_s=_ETA_REFERENCE_GEN,
                    cached=False,
                    payload={
                        "asset_id": asset["id"],
                        "asset_name": asset["name"],
                        "label": label,
                        "story_context": (ctx.cut.get("action") or "")[:200],
                    },
                    alternatives=alternatives,
                ))
                # If a cached candidate has 2+ token overlap (i.e. close
                # enough to skip the gen) record it for a single
                # Recommendation message after planning.
                if alternatives:
                    strong_recs.append({
                        "asset_name": asset["name"],
                        "label": label,
                        "primary": alternatives[0],
                        "alternatives": alternatives[1:],
                    })

    # Continuity: previous cut as a reference — but ONLY when the cut
    # actually continues the prior beat. Stacking prev_cut as a slot on
    # an unrelated new beat (e.g. a close-up reaction following a wide)
    # drags the model toward the previous composition and weakens
    # identity locks. Heuristic: keep prev_cut when (a) same shot or
    # (b) action language signals continuation.
    if ctx.previous_cut and ctx.previous_cut.get("generated_image_url"):
        if _should_chain_prev_cut(ctx):
            plan.items.append(make_item(
                ITEM_KIND_REFERENCE_REUSE,
                f"Reuse previous cut {ctx.previous_cut.get('cut_number')} (continuity)",
                cost_usd=0.0,
                cached=True,
                payload={
                    "label": f"prev_cut_{ctx.previous_cut.get('cut_number', '')}",
                    "image_url": ctx.previous_cut["generated_image_url"],
                    "reason": "previous cut for continuity",
                },
            ))

    # Style anchor if present
    if ctx.style_anchor and ctx.style_anchor.get("image_url"):
        plan.items.append(make_item(
            ITEM_KIND_REFERENCE_REUSE,
            "Use project style anchor",
            cost_usd=0.0,
            cached=True,
            payload={
                "label": "style_anchor",
                "image_url": ctx.style_anchor["image_url"],
                "reason": "project-pinned style reference",
            },
        ))

    # Compile the render prompt at plan time so the user can preview AND
    # override it before approval. Prior implementation only built the
    # prompt at execute time, so the user never saw what was being sent.
    try:
        from backend.orchestrator.cut_executor import _build_template_from_ctx
        from backend.orchestrator.prompt_dsl import compile_prompt as _compile

        cumulative_feedback = list(plan.feedback or [])
        template_preview = _build_template_from_ctx(ctx, cumulative_feedback)
        compiled_preview = _compile(template_preview, ctx.project_id)
        compiled_prompt_text = compiled_preview.final_prompt
        slots_preview = [
            {"slot": int(k.replace("@Image", "")), "image_url": v}
            for k, v in compiled_preview.slots.items()
        ]
    except Exception as e:  # noqa: BLE001
        log.warning("compile_prompt_preview_failed", error=str(e))
        compiled_prompt_text = ""
        slots_preview = []

    # Render the cut
    plan.items.append(make_item(
        ITEM_KIND_RENDER,
        f"Render cut {ctx.cut.get('cut_number', '')} on Nano Banana Pro",
        cost_usd=_COST_RENDER_CUT,
        eta_s=_ETA_RENDER_CUT,
        cached=False,
        payload={
            "cut_id": cut_id,
            "feedback": list(plan.feedback),  # cumulative feedback
            # Pre-compiled preview so PlanCard can show the actual prompt
            # the model will see. `prompt_override`, if set, replaces it.
            "compiled_prompt": compiled_prompt_text,
            "slots_preview": slots_preview,
        },
    ))

    # Register the result
    plan.items.append(make_item(
        ITEM_KIND_REGISTER,
        "Save to library + cut card",
        cost_usd=0.0,
        eta_s=_ETA_REGISTER,
        cached=False,
        payload={"cut_id": cut_id},
    ))

    plan.recompute_totals()
    log.info(
        "plan_composed",
        plan_id=plan.id,
        cut_id=cut_id,
        n_items=len(plan.items),
        total_cost=plan.total_cost_usd,
        total_eta=plan.total_eta_s,
        feedback_round=plan.feedback_round,
    )

    # Surface a single Recommendation for the strongest cached match so
    # the user can swap it in pre-approval. Silent when nothing close.
    if strong_recs:
        try:
            top = strong_recs[0]
            primary = top["primary"]
            alts = top["alternatives"]
            narrator = Narrator(plan.project_id)
            await narrator.recommendation(
                primary={
                    "ref_id": primary["ref_id"],
                    "thumb_url": primary["image_url"],
                    "label": primary["label"],
                    "asset_name": top["asset_name"],
                    "status": "cached",
                },
                alternatives=[
                    {
                        "ref_id": a["ref_id"],
                        "thumb_url": a["image_url"],
                        "label": a["label"],
                        "asset_name": top["asset_name"],
                        "status": "cached",
                    }
                    for a in alts
                ],
                reasoning=(
                    f"Found a close match for {top['asset_name']}/{top['label']} "
                    f"in the library — using it would skip a $0.04 generation."
                ),
            )
        except Exception:
            log.exception("recommendation_emit_failed")

    return plan
