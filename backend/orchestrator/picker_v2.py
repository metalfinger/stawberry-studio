"""
Label-aware reference picker.

Given a cut and its linked assets, decide which reference labels each asset
needs and return the actual reference rows (lazy-filling any that don't
exist yet). Replaces the tag-scoring picker for new code paths.

Public API:
    rank_labels_for_cut(cut, asset) -> list[str]
        Reads cut text fields (action, expression, body_language, gaze,
        prop_interaction, character_state) and returns the top-N labels
        from the controlled vocabulary that best match this cut.

    resolve_references(asset_ids, cut, *, max_per_asset=2, allow_lazy=True)
        -> list[Reference]
        For each asset, ensure its identity card exists, then look up
        the top labels (cache-first). Lazy-fills missing ones in
        parallel if allow_lazy=True.
"""
from __future__ import annotations

import asyncio
import re
from typing import Any

import structlog

from backend.orchestrator import references_v2

log = structlog.get_logger(__name__)


# ============================================================================
# Label scoring — keyword → label map
# ============================================================================
#
# Each label has a list of keywords. A cut's text fields are scanned; the
# label with the most keyword hits wins for that cut. Deterministic, no
# LLM call.

_LABEL_KEYWORDS: dict[str, list[str]] = {
    # Angles
    "side_right": ["profile", "side view", "from the side", "side-right"],
    "side_left": ["side-left"],
    "three_quarter_right": ["three-quarter", "3/4 angle", "from the right"],
    "three_quarter_left": ["from the left"],
    "back": ["from behind", "back to camera", "walking away", "back view"],
    # Expressions
    "expression_focused": ["focused", "concentrating", "narrowed eyes", "intense gaze"],
    "expression_angry": ["angry", "rage", "furious", "snarling", "scowl"],
    "expression_sad": ["sad", "tears", "crying", "sorrow", "weeping"],
    "expression_happy": ["happy", "smiling", "laughing", "joy", "grin"],
    "expression_terrified": ["terrified", "afraid", "horror", "panic", "fear"],
    "expression_smug": ["smug", "smirk", "smirking", "self-satisfied"],
    # Actions / states
    "running": ["running", "sprinting", "racing", "chase", "fleeing", "pursuing"],
    "fighting_stance": ["fighting", "ready stance", "combat", "guard up"],
    "wounded": ["wounded", "bleeding", "injured", "hurt", "limping"],
    "kneeling": ["kneeling", "knelt", "on her knees", "on his knees"],
    "gun_drawn": ["gun drawn", "weapon raised", "aiming", "pistol up"],
    "hero_pose": ["heroic", "stands tall", "confident pose"],
    # Prop states
    "state_glowing": ["glowing", "lit up", "activated", "shining"],
    "state_dormant": ["dormant", "powered down", "dark", "inactive"],
    # Location
    "key_detail": ["close-up", "detail", "focus on", "zoomed in"],
    "alt_lighting": ["dawn", "dusk", "night-time", "alternate lighting"],
}


def _score_label(label: str, text_blob: str) -> int:
    """Count how many of `label`'s keywords appear in the text."""
    score = 0
    for kw in _LABEL_KEYWORDS.get(label, []):
        if re.search(r"\b" + re.escape(kw) + r"\b", text_blob, re.IGNORECASE):
            score += 1
    return score


def _cut_text_blob(cut: dict, asset: dict | None = None) -> str:
    """Concatenate the cut's user-provided text fields into one blob."""
    parts: list[str] = []
    for k in (
        "action", "story_description", "expression", "body_language",
        "gesture", "gaze_direction", "character_state", "prop_interaction",
        "costume_notes", "emotional_arc",
    ):
        v = (cut.get(k) or "").strip()
        if v:
            parts.append(v)
    return " · ".join(parts)


def rank_labels_for_cut(cut: dict, asset: dict, *, top_n: int = 2) -> list[str]:
    """Return the top-N reference labels that best fit this cut for this asset.

    Always includes "identity" as a baseline at index 0 unless something
    scores higher.
    """
    asset_type = (asset.get("type") or "").lower()
    blob = _cut_text_blob(cut)
    if not blob:
        return ["identity"]

    # Restrict candidate labels to ones plausible for this asset type.
    candidates = list(_LABEL_KEYWORDS.keys())
    if asset_type == "character":
        candidates = [l for l in candidates if not l.startswith("state_") and not l.startswith("prop_") and l not in ("alt_lighting", "key_detail")]
    elif asset_type == "location":
        candidates = [l for l in candidates if l in ("key_detail", "alt_lighting")]
    elif asset_type == "prop":
        candidates = [l for l in candidates if l.startswith("prop_") or l.startswith("state_")]

    scored = [(l, _score_label(l, blob)) for l in candidates]
    scored = [(l, s) for l, s in scored if s > 0]
    scored.sort(key=lambda x: x[1], reverse=True)

    labels = [l for l, _ in scored[:top_n]]
    if "identity" not in labels:
        labels.insert(0, "identity")
    return labels[:top_n]


# ============================================================================
# Public: resolve references for a cut's linked assets
# ============================================================================

async def resolve_references(
    assets: list[dict],
    cut: dict,
    *,
    max_per_asset: int = 2,
    allow_lazy: bool = True,
) -> list[dict]:
    """For each asset linked to a cut, pick the labels it needs and return
    the actual reference rows (cache-first, lazy-fill on miss when allowed).

    Returned references are ordered: per-asset identity first, then ranked
    extras. Caller can slice down to the model's slot limit.
    """
    out: list[dict] = []
    for asset in assets:
        labels = rank_labels_for_cut(cut, asset, top_n=max_per_asset)
        for label in labels:
            existing = await references_v2.find_reference_by_label(asset["id"], label)
            if existing:
                out.append(existing)
                continue
            if not allow_lazy:
                # Fall back to identity if we can't generate.
                identity = await references_v2.get_identity_card(asset["id"])
                if identity and identity not in out:
                    out.append(identity)
                continue
            try:
                generated = await references_v2.get_or_generate(
                    asset["id"], label, story_context=cut.get("action") or None,
                )
                out.append(generated)
            except Exception as e:
                log.warning(
                    "lazy_fill_failed",
                    asset_id=asset["id"], label=label, error=str(e),
                )
                identity = await references_v2.get_identity_card(asset["id"])
                if identity and identity not in out:
                    out.append(identity)
    return out
