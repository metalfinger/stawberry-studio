"""
Smart Reference Picker.

Given a cut to generate, score every candidate in the reference_pool against
the cut's needs and return a ranked top-K with rationale. The Pixel agent
calls `pick_for_cut` to populate slot assignments instead of using rule
heuristics.

Scoring (v1, deterministic — vision-LLM scoring lands in v2 once embeddings exist):
  + 1.5  exact character match (linked_asset id ∈ candidate.character_ids)
  + 1.0  location match
  + 0.6  lighting signature match
  + 0.4  same aspect ratio
  + 0.3  is_anchor
  + 0.4  is_style_anchor (for slot 1)
  + 0.2  recency (newest wins ties)
  - 0.5  is_favorite from a different project (cross-project ref — slight penalty)

Returns list of {reference, score, reason}.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import structlog

from backend.database.core import get_async_connection
from backend.orchestrator.references import search

log = structlog.get_logger(__name__)


@dataclass
class PickRequest:
    project_id: str
    cut_id: str
    character_ids: list[str]
    location_id: str | None
    lighting_signature: str
    aspect_ratio: str
    needs_anchor: bool = False
    use_style_anchor: bool = True
    include_favorites: bool = True


def _score_candidate(
    cand: dict[str, Any],
    req: PickRequest,
    is_slot_one: bool = False,
) -> tuple[float, list[str]]:
    score = 0.0
    reasons: list[str] = []

    # Character identity
    cand_chars = cand.get("character_ids") or []
    if any(cid in cand_chars for cid in req.character_ids):
        score += 1.5
        reasons.append("character match")

    # Location
    if cand.get("location_id") and cand["location_id"] == req.location_id:
        score += 1.0
        reasons.append("location match")

    # Lighting
    if req.lighting_signature and cand.get("lighting_signature"):
        # Cheap fuzzy: any token in common
        a = set((req.lighting_signature or "").split(":"))
        b = set((cand["lighting_signature"] or "").split(":"))
        overlap = len(a & b - {""})
        if overlap >= 2:
            score += 0.6
            reasons.append("lighting match")
        elif overlap == 1:
            score += 0.3
            reasons.append("lighting partial")

    # Aspect ratio
    if cand.get("aspect_ratio") and cand["aspect_ratio"] == req.aspect_ratio:
        score += 0.4
        reasons.append("aspect match")

    # Anchors
    if cand.get("is_anchor"):
        score += 0.3
        reasons.append("scene anchor")
    if cand.get("is_style_anchor") and is_slot_one and req.use_style_anchor:
        score += 0.4
        reasons.append("style anchor")

    # Cross-project favorite penalty
    if cand.get("is_favorite") and cand.get("project_id") != req.project_id:
        score -= 0.5
        reasons.append("cross-project favorite")

    return score, reasons


async def pick_for_cut(
    project_id: str,
    cut_id: str,
    *,
    max_slots: int = 5,
) -> list[dict[str, Any]]:
    """Build a slot-assignment list for a cut. Slot 1 = highest-scoring etc."""
    # Pull cut context — character/location ids linked + scene lighting
    async with get_async_connection() as conn:
        async with conn.execute(
            """
            SELECT c.id, sh.id AS shot_id, s.id AS scene_id, s.project_id,
                   s.lighting_color, s.time_of_day, s.mood
            FROM cuts c
            JOIN shots sh ON sh.id = c.shot_id
            JOIN scenes s ON s.id = sh.scene_id
            WHERE c.id = ?
            """,
            (cut_id,),
        ) as cur:
            ctx = await cur.fetchone()
        if ctx is None:
            return []
        ctx = dict(ctx)

        async with conn.execute(
            """
            SELECT a.id, a.type
            FROM asset_links al JOIN assets a ON a.id = al.asset_id
            WHERE al.node_type = 'cut' AND al.node_id = ?
            """,
            (cut_id,),
        ) as cur:
            links = [dict(r) for r in await cur.fetchall()]
        char_ids = [r["id"] for r in links if r["type"] == "character"]
        loc_ids = [r["id"] for r in links if r["type"] == "location"]

        # Brief aspect ratio
        async with conn.execute(
            "SELECT aspect_ratio FROM briefs WHERE project_id = ?", (project_id,)
        ) as cur:
            brief = await cur.fetchone()
        aspect_ratio = (brief and brief["aspect_ratio"]) or "16:9"

    lighting_sig = ":".join(
        x for x in [ctx.get("time_of_day") or "", ctx.get("lighting_color") or "", ctx.get("mood") or ""] if x
    )

    req = PickRequest(
        project_id=project_id,
        cut_id=cut_id,
        character_ids=char_ids,
        location_id=loc_ids[0] if loc_ids else None,
        lighting_signature=lighting_sig,
        aspect_ratio=aspect_ratio,
    )

    # Pull candidate pool
    candidates = await search(project_id, include_favorites=req.include_favorites, limit=200)

    scored = []
    for cand in candidates:
        s, reasons = _score_candidate(cand, req)
        if s <= 0:
            continue
        scored.append({"reference": cand, "score": round(s, 2), "reasons": reasons})

    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[:max_slots]

    log.info(
        "picker_ranked",
        cut_id=cut_id,
        candidates=len(candidates),
        picked=len(top),
        top_scores=[t["score"] for t in top],
    )
    # Assign slot numbers
    for i, item in enumerate(top, start=1):
        item["slot"] = i
        item["ref"] = f"@Image{i}"
    return top
