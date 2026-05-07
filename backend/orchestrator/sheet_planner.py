"""
Sheet Planner — picks the right element-sheet template from full tree context.

Given an asset, the planner reads:
- Asset metadata (type, name, description, consistency_tokens, wardrobe_lock)
- How many cuts the asset is linked to (asset_links count)
- What scenes those cuts belong to (multi-scene → richer template)
- What poses/expressions/angles the cuts demand (parsed from cut.action,
  cut.expression, cut.body_language, cut.gesture, cut.gaze_direction)
- Brief.art_style (anime → more panels welcome; minimal flat → fewer)

…and picks one of the templates declared in TEMPLATES below. The planner is
deterministic + rule-based; an optional LLM-driven override hook exists but
isn't wired by default.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

import structlog

from backend.database.core import get_async_connection

log = structlog.get_logger(__name__)


# ============================================================================
# Templates
# ============================================================================

@dataclass
class SheetTemplate:
    template_id: str
    sheet_type: str          # bucket name (character_full / character_solo / location_full / …)
    grid: tuple[int, int]    # (rows, cols)
    cells: list[str]         # ordered cell labels (row-major)
    aspect_ratio: str        # the sheet's aspect ratio
    rationale: str = ""      # human-readable for logging / UI

    @property
    def cell_count(self) -> int:
        return self.grid[0] * self.grid[1]


# Order matters when multiple are eligible — first match wins.
TEMPLATES: dict[str, SheetTemplate] = {
    # --- Characters ---
    "character_full": SheetTemplate(
        template_id="character_full_v1",
        sheet_type="character_full",
        grid=(3, 3),
        cells=[
            "front", "three_quarter_right", "side_right",
            "back", "hero_pose", "face_close_up",
            "expression_happy", "expression_sad", "expression_angry",
        ],
        aspect_ratio="1:1",
        rationale="Hero / named character with multiple appearances",
    ),
    "character_3view": SheetTemplate(
        template_id="character_3view_v1",
        sheet_type="character_3view",
        grid=(1, 3),
        cells=["front", "three_quarter_right", "side_right"],
        aspect_ratio="4:1",
        rationale="Named support character with limited appearances",
    ),
    "character_solo": SheetTemplate(
        template_id="character_solo_v1",
        sheet_type="character_solo",
        grid=(1, 1),
        cells=["front"],
        aspect_ratio="1:1",
        rationale="Background / single-appearance character",
    ),
    # --- Locations ---
    "location_full": SheetTemplate(
        template_id="location_full_v1",
        sheet_type="location_full",
        grid=(2, 2),
        cells=["wide_establishing", "medium", "key_detail", "alt_lighting"],
        aspect_ratio="16:9",
        rationale="Hero location used across multiple scenes",
    ),
    "location_solo": SheetTemplate(
        template_id="location_solo_v1",
        sheet_type="location_solo",
        grid=(1, 1),
        cells=["wide_establishing"],
        aspect_ratio="16:9",
        rationale="Single-use / transit location",
    ),
    # --- Props ---
    "prop_3view": SheetTemplate(
        template_id="prop_3view_v1",
        sheet_type="prop_3view",
        grid=(1, 3),
        cells=["front", "three_quarter", "side"],
        aspect_ratio="4:1",
        rationale="Hero prop linked to multiple cuts",
    ),
    "prop_solo": SheetTemplate(
        template_id="prop_solo_v1",
        sheet_type="prop_solo",
        grid=(1, 1),
        cells=["front"],
        aspect_ratio="1:1",
        rationale="Background prop",
    ),
    # --- Vehicles ---
    "vehicle_full": SheetTemplate(
        template_id="vehicle_full_v1",
        sheet_type="vehicle_full",
        grid=(2, 3),
        cells=["front", "three_quarter", "side", "rear", "cockpit", "in_motion"],
        aspect_ratio="3:2",
        rationale="Hero vehicle with multiple uses",
    ),
    # --- Costumes (when wardrobe is the asset itself) ---
    "costume_flat": SheetTemplate(
        template_id="costume_flat_v1",
        sheet_type="costume_flat",
        grid=(1, 2),
        cells=["flat_front", "flat_back"],
        aspect_ratio="21:9",
        rationale="Standalone wardrobe asset",
    ),
}


# ============================================================================
# Planning
# ============================================================================

@dataclass
class SheetPlan:
    """Output of the planner: which template + why + what context fed the choice."""
    template: SheetTemplate
    asset_id: str
    asset_type: str
    asset_name: str
    cut_count: int
    scene_count: int
    is_named: bool
    has_wardrobe_lock: bool
    has_dialogue_in_any_cut: bool
    poses_demanded: list[str] = field(default_factory=list)      # parsed signals
    expressions_demanded: list[str] = field(default_factory=list)
    angles_demanded: list[str] = field(default_factory=list)
    rationale: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "template_id": self.template.template_id,
            "sheet_type": self.template.sheet_type,
            "grid": list(self.template.grid),
            "cells": self.template.cells,
            "aspect_ratio": self.template.aspect_ratio,
            "asset_id": self.asset_id,
            "asset_name": self.asset_name,
            "asset_type": self.asset_type,
            "cut_count": self.cut_count,
            "scene_count": self.scene_count,
            "is_named": self.is_named,
            "has_wardrobe_lock": self.has_wardrobe_lock,
            "has_dialogue_in_any_cut": self.has_dialogue_in_any_cut,
            "poses_demanded": self.poses_demanded,
            "expressions_demanded": self.expressions_demanded,
            "angles_demanded": self.angles_demanded,
            "rationale": self.rationale,
        }


# Lightweight regex/keyword signal parsers — used to decide if a character
# really needs the full sheet vs a simpler one.
_POSE_KEYWORDS = [
    "running", "fighting", "punching", "kicking", "jumping", "leaping",
    "kneeling", "lying", "crouching", "sitting", "standing", "walking",
    "hero pose", "action pose", "fighting stance",
]
_EXPRESSION_KEYWORDS = [
    "smiling", "happy", "joyful", "laughing",
    "sad", "crying", "tearful", "weeping",
    "angry", "furious", "scowling", "glaring",
    "surprised", "shocked", "stunned",
    "afraid", "scared", "terrified",
    "confused", "puzzled", "thoughtful",
]
_ANGLE_KEYWORDS = [
    "back view", "from behind", "rear view", "side profile",
    "three quarter", "3/4 view", "looking up", "looking down",
    "low angle", "high angle", "bird's eye", "worm's eye",
]


def _scan_keywords(text: str, keywords: list[str]) -> list[str]:
    hits = []
    if not text:
        return hits
    low = text.lower()
    for kw in keywords:
        if kw in low and kw not in hits:
            hits.append(kw)
    return hits


async def _gather_context(asset_id: str) -> dict[str, Any]:
    """Pull asset row + linked cuts/scenes + brief from DB."""
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT * FROM assets WHERE id = ?", (asset_id,)
        ) as cur:
            asset_row = await cur.fetchone()
        if asset_row is None:
            raise ValueError(f"asset {asset_id} not found")
        asset = dict(asset_row)

        async with conn.execute(
            "SELECT aspect_ratio, art_style FROM briefs WHERE project_id = ?",
            (asset["project_id"],),
        ) as cur:
            brief = await cur.fetchone()
        brief = dict(brief) if brief else {}

        # Asset_links → cut ids
        async with conn.execute(
            """
            SELECT al.node_id, al.node_type
            FROM asset_links al
            WHERE al.asset_id = ?
            """,
            (asset_id,),
        ) as cur:
            links = [dict(r) for r in await cur.fetchall()]

        cut_ids = [l["node_id"] for l in links if l["node_type"] == "cut"]
        cuts: list[dict[str, Any]] = []
        scenes_set: set[str] = set()
        if cut_ids:
            placeholders = ",".join("?" for _ in cut_ids)
            async with conn.execute(
                f"""
                SELECT c.id, c.action, c.dialogue, c.expression, c.body_language,
                       c.gesture, c.gaze_direction, sh.scene_id
                FROM cuts c
                JOIN shots sh ON sh.id = c.shot_id
                WHERE c.id IN ({placeholders})
                """,
                cut_ids,
            ) as cur:
                cuts = [dict(r) for r in await cur.fetchall()]
            scenes_set = {c["scene_id"] for c in cuts if c.get("scene_id")}

    return {
        "asset": asset,
        "brief": brief,
        "links": links,
        "cuts": cuts,
        "scene_count": len(scenes_set),
    }


def _is_named(asset: dict[str, Any]) -> bool:
    """Heuristic: a 'named' asset has a proper noun name (not 'a guard', 'background', etc.)."""
    name = (asset.get("name") or "").strip()
    if not name:
        return False
    low = name.lower()
    bad_starters = ("a ", "an ", "the ", "some ")
    if any(low.startswith(s) for s in bad_starters):
        return False
    if any(w in low for w in ("background", "extra", "unnamed", "silhouette", "crowd")):
        return False
    # Has a capital letter → likely a proper name
    return any(c.isupper() for c in name)


async def plan_sheet(asset_id: str, *, override_sheet_type: str | None = None) -> SheetPlan:
    """Pick a sheet template for the asset using full tree context."""
    ctx = await _gather_context(asset_id)
    asset = ctx["asset"]
    cuts = ctx["cuts"]
    asset_type = (asset.get("type") or "").lower()
    asset_name = asset.get("name") or ""

    cut_count = len(cuts)
    scene_count = ctx["scene_count"]
    has_wardrobe_lock = bool((asset.get("wardrobe_lock") or "").strip())
    has_dialogue = any((c.get("dialogue") or "").strip() for c in cuts)
    is_named = _is_named(asset)

    # Aggregate signals across all linked cuts
    poses: list[str] = []
    expressions: list[str] = []
    angles: list[str] = []
    for c in cuts:
        text = " ".join(
            str(c.get(k) or "") for k in
            ("action", "body_language", "gesture", "gaze_direction", "expression")
        )
        for kw in _scan_keywords(text, _POSE_KEYWORDS):
            if kw not in poses:
                poses.append(kw)
        for kw in _scan_keywords(text, _EXPRESSION_KEYWORDS):
            if kw not in expressions:
                expressions.append(kw)
        for kw in _scan_keywords(text, _ANGLE_KEYWORDS):
            if kw not in angles:
                angles.append(kw)

    # Manual override (UI dropdown)
    if override_sheet_type and override_sheet_type in TEMPLATES:
        chosen = TEMPLATES[override_sheet_type]
        rationale = f"manual override → {chosen.sheet_type}"
    else:
        chosen, rationale = _pick_template(
            asset_type=asset_type,
            cut_count=cut_count,
            scene_count=scene_count,
            is_named=is_named,
            has_wardrobe_lock=has_wardrobe_lock,
            has_dialogue=has_dialogue,
            poses=poses,
            expressions=expressions,
            angles=angles,
        )

    plan = SheetPlan(
        template=chosen,
        asset_id=asset_id,
        asset_type=asset_type,
        asset_name=asset_name,
        cut_count=cut_count,
        scene_count=scene_count,
        is_named=is_named,
        has_wardrobe_lock=has_wardrobe_lock,
        has_dialogue_in_any_cut=has_dialogue,
        poses_demanded=poses,
        expressions_demanded=expressions,
        angles_demanded=angles,
        rationale=rationale,
    )
    log.info(
        "sheet_planned",
        asset_id=asset_id,
        asset_name=asset_name,
        template=chosen.sheet_type,
        cells=len(chosen.cells),
        rationale=rationale,
    )
    return plan


def _pick_template(
    *,
    asset_type: str,
    cut_count: int,
    scene_count: int,
    is_named: bool,
    has_wardrobe_lock: bool,
    has_dialogue: bool,
    poses: list[str],
    expressions: list[str],
    angles: list[str],
) -> tuple[SheetTemplate, str]:
    """Deterministic rule-based template selection. Returns (template, rationale)."""

    if asset_type == "character":
        # Hero treatment: named + (wardrobe-lock OR dialogue OR ≥2 cuts OR demanded expressions)
        is_hero = is_named and (
            has_wardrobe_lock
            or has_dialogue
            or cut_count >= 2
            or len(expressions) >= 1
        )
        if is_hero:
            return TEMPLATES["character_full"], (
                f"named character; cuts={cut_count}, scenes={scene_count}, "
                f"wardrobe_lock={has_wardrobe_lock}, dialogue={has_dialogue}, "
                f"expressions_demanded={len(expressions)} → full sheet"
            )
        if is_named:
            return TEMPLATES["character_3view"], (
                f"named but lighter usage (cuts={cut_count}) → 3-view"
            )
        return TEMPLATES["character_solo"], (
            f"unnamed / background character (cuts={cut_count}) → solo"
        )

    if asset_type == "location":
        if scene_count >= 2 or cut_count >= 4:
            return TEMPLATES["location_full"], (
                f"location used across scenes={scene_count}, cuts={cut_count} → full"
            )
        return TEMPLATES["location_solo"], (
            f"single-use location (scenes={scene_count}, cuts={cut_count}) → solo"
        )

    if asset_type == "prop":
        if cut_count >= 2 or is_named:
            return TEMPLATES["prop_3view"], (
                f"hero prop (named={is_named}, cuts={cut_count}) → 3-view"
            )
        return TEMPLATES["prop_solo"], (
            f"background prop (cuts={cut_count}) → solo"
        )

    if asset_type in ("vehicle", "vehicle_mech", "mech"):
        return TEMPLATES["vehicle_full"], "vehicle → full sheet"

    if asset_type in ("costume", "outfit", "wardrobe"):
        return TEMPLATES["costume_flat"], "standalone wardrobe → flat"

    # Fallback: treat unknown types like solo character
    return TEMPLATES["character_solo"], f"unknown asset_type={asset_type!r}; fallback solo"
