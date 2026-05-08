"""
Context Bundler — assembles the full production tree for one cut into a single
structured blob the Cut Composer feeds to the model.

This is THE moat. Pure prompt-to-image tools have no project context. We have:
  - Brief globals (art style, palette, lighting style, world rules, negatives)
  - Continuity Bible (compiled aggregate of brief + character + location state)
  - Scene metadata + lighting state
  - Shot metadata + camera/lens/composition
  - The cut itself
  - The PREVIOUS cut (image + state) for continuity grounding
  - The NEXT cut (action) for narrative flow awareness
  - Sibling cuts in the same shot (rhythm context)
  - All sibling cuts in the same scene (what audience just saw)
  - Linked characters → their active sheet + cell labels
  - Linked locations → master + lighting baseline
  - Linked props → master
  - Reference pool top-K candidates (Smart Picker output)
  - Style anchor (project-level pinned reference)
  - Scene anchor cut (the hero panel of this scene)
  - Prior similar cuts (vector match against tags)

By bundling all of this for the model in one pass, we aim for one-shot success.
The critic becomes a safety net, not the expected path.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

import structlog

from backend.database.core import get_async_connection
from backend.orchestrator.continuity import (
    compile_continuity_bible,
    get_continuity_bible,
)

log = structlog.get_logger(__name__)


# ============================================================================
# Result type
# ============================================================================

@dataclass
class CutContext:
    """Everything the Cut Composer needs in one place."""
    project_id: str
    cut_id: str

    # Entity rows (raw dicts)
    project: dict[str, Any] = field(default_factory=dict)
    brief: dict[str, Any] = field(default_factory=dict)
    scene: dict[str, Any] = field(default_factory=dict)
    shot: dict[str, Any] = field(default_factory=dict)
    cut: dict[str, Any] = field(default_factory=dict)

    # Continuity Bible (compiled aggregate)
    bible: dict[str, Any] = field(default_factory=dict)

    # Hierarchical neighbours
    previous_cut: dict[str, Any] | None = None    # {id, action, image_url, character_state, ...}
    next_cut: dict[str, Any] | None = None        # {id, action} — narrative flow awareness
    sibling_cuts_in_shot: list[dict[str, Any]] = field(default_factory=list)
    sibling_cuts_in_scene: list[dict[str, Any]] = field(default_factory=list)

    # Linked assets with their active sheets
    linked_characters: list[dict[str, Any]] = field(default_factory=list)
    linked_locations: list[dict[str, Any]] = field(default_factory=list)
    linked_props: list[dict[str, Any]] = field(default_factory=list)

    # Reference pool ranked candidates (set by Cut Composer step 1, but
    # bundler attaches the current style anchor + scene anchor for picker hints)
    style_anchor: dict[str, Any] | None = None
    scene_anchor_cut: dict[str, Any] | None = None
    candidate_refs: list[dict[str, Any]] = field(default_factory=list)

    # Convenience: derived strings the Cut Composer's prompt builder uses often
    art_style: str = ""
    color_palette: str = ""
    lighting_signature: str = ""
    aspect_ratio: str = "16:9"
    negatives: str = ""

    # Stats for logging / UI ("loaded 4 sibling cuts, 3 sheets, 12K tokens")
    stats: dict[str, Any] = field(default_factory=dict)


# ============================================================================
# Helpers
# ============================================================================

async def _fetch_one(conn, sql: str, params: tuple) -> dict[str, Any] | None:
    async with conn.execute(sql, params) as cur:
        row = await cur.fetchone()
    return dict(row) if row else None


async def _fetch_all(conn, sql: str, params: tuple) -> list[dict[str, Any]]:
    async with conn.execute(sql, params) as cur:
        return [dict(r) for r in await cur.fetchall()]


def _lighting_signature(scene: dict[str, Any]) -> str:
    bits = [
        scene.get("time_of_day"),
        scene.get("lighting_color"),
        scene.get("lighting"),
        scene.get("mood"),
    ]
    return " · ".join(b for b in bits if b)


# ============================================================================
# Public API
# ============================================================================

async def bundle_cut_context(cut_id: str, *, sibling_window: int = 6) -> CutContext:
    """Traverse the full project tree and return a CutContext for this cut.

    `sibling_window`: how many cuts before/after (chronologically) to include
    for "what the audience just saw / will see next" awareness.
    """
    async with get_async_connection() as conn:
        cut = await _fetch_one(conn, "SELECT * FROM cuts WHERE id = ?", (cut_id,))
        if cut is None:
            raise ValueError(f"cut {cut_id} not found")

        shot = await _fetch_one(conn, "SELECT * FROM shots WHERE id = ?", (cut["shot_id"],))
        scene = await _fetch_one(conn, "SELECT * FROM scenes WHERE id = ?", (shot["scene_id"],)) if shot else None
        project = await _fetch_one(conn, "SELECT * FROM projects WHERE id = ?", (scene["project_id"],)) if scene else None
        brief = await _fetch_one(conn, "SELECT * FROM briefs WHERE project_id = ?", (project["id"],)) if project else None

        if not (shot and scene and project):
            raise RuntimeError(f"cut {cut_id} has broken parent references")

        project_id = project["id"]

        # Sibling cuts in this shot, ordered by cut_number
        siblings_shot = await _fetch_all(
            conn,
            "SELECT * FROM cuts WHERE shot_id = ? ORDER BY cut_number ASC",
            (shot["id"],),
        )

        # All cuts in this scene, in playback order — used for the sliding
        # window of "previously seen / coming next".
        scene_cuts = await _fetch_all(
            conn,
            """
            SELECT c.*, sh.shot_number AS shot_num
            FROM cuts c
            JOIN shots sh ON sh.id = c.shot_id
            WHERE sh.scene_id = ?
            ORDER BY sh.shot_number ASC, c.cut_number ASC
            """,
            (scene["id"],),
        )

        # Find this cut's position in scene_cuts
        idx = next((i for i, c in enumerate(scene_cuts) if c["id"] == cut_id), None)
        if idx is None:
            siblings_scene = scene_cuts
            previous_cut = None
            next_cut = None
        else:
            window_start = max(0, idx - sibling_window)
            window_end = min(len(scene_cuts), idx + sibling_window + 1)
            siblings_scene = scene_cuts[window_start:window_end]
            previous_cut = scene_cuts[idx - 1] if idx > 0 else None
            next_cut = scene_cuts[idx + 1] if idx + 1 < len(scene_cuts) else None

        # Linked assets via asset_links + scene/shot bubble-up
        linked_assets = await _fetch_all(
            conn,
            """
            SELECT a.*, al.usage, al.variant_notes
            FROM asset_links al JOIN assets a ON a.id = al.asset_id
            WHERE al.node_type = 'cut' AND al.node_id = ?
            """,
            (cut_id,),
        )

        # Pull the asset's identity reference from reference_pool. The "sheet"
        # alias keeps downstream consumers working without renaming.
        async def _attach_sheet_and_master(a):
            a["sheet"] = await _fetch_one(
                conn,
                "SELECT * FROM reference_pool WHERE asset_id = ? AND label = 'identity' ORDER BY created_at DESC LIMIT 1",
                (a["id"],),
            )
            a["master"] = None  # legacy element_masters table is gone

        for a in linked_assets:
            await _attach_sheet_and_master(a)
            # Walk parent chain (max depth 4 to avoid pathological cycles).
            chain: list[dict[str, Any]] = []
            seen = {a["id"]}
            cur = a
            for _ in range(4):
                pid = cur.get("parent_asset_id") or cur.get("master_id")
                if not pid or pid in seen:
                    break
                seen.add(pid)
                parent = await _fetch_one(conn, "SELECT * FROM assets WHERE id = ?", (pid,))
                if not parent:
                    break
                await _attach_sheet_and_master(parent)
                chain.append(parent)
                cur = parent
            a["parent_chain"] = chain

        # Style anchor + scene anchor cut
        style_anchor = await _fetch_one(
            conn,
            "SELECT * FROM reference_pool WHERE project_id = ? AND is_style_anchor = 1 ORDER BY created_at DESC LIMIT 1",
            (project_id,),
        )
        if style_anchor:
            style_anchor["tags"] = json.loads(style_anchor.get("tags_json") or "{}")

        scene_anchor_cut = None
        if scene.get("anchor_cut_id"):
            scene_anchor_cut = await _fetch_one(
                conn,
                "SELECT * FROM cuts WHERE id = ?",
                (scene["anchor_cut_id"],),
            )

    # Continuity Bible — recompile every time we bundle a cut. Stale
    # bibles were the root cause of glasses being dropped on cut #2 of
    # Test 2: the bible was compiled at asset extraction (when columns
    # were empty) and never refreshed when identities were generated.
    # Compilation is cheap (a couple of indexed reads) and worth it.
    bible = await compile_continuity_bible(project_id)

    # Bucket linked assets by type
    chars = [a for a in linked_assets if (a.get("type") or "").lower() == "character"]
    locs = [a for a in linked_assets if (a.get("type") or "").lower() == "location"]
    props = [a for a in linked_assets if (a.get("type") or "").lower() == "prop"]

    # Apply scene-level wardrobe override on top of character.wardrobe_lock
    # so prompt-builders see the right outfit for THIS scene without us having
    # to mint a per-scene character variant.
    overrides_raw = (scene or {}).get("character_wardrobe_overrides") or ""
    if overrides_raw:
        try:
            overrides = json.loads(overrides_raw)
        except json.JSONDecodeError:
            overrides = {}
        for c in chars:
            ov = overrides.get(c["id"])
            if ov:
                c["wardrobe_lock_scene"] = ov
                # Layer the override on top of the base wardrobe_lock for any
                # downstream prompt builder that just reads wardrobe_lock.
                base = (c.get("wardrobe_lock") or "").strip()
                c["wardrobe_lock"] = (base + " · scene-specific: " + ov).strip(" · ") if base else ov

    ctx = CutContext(
        project_id=project_id,
        cut_id=cut_id,
        project=project,
        brief=brief or {},
        scene=scene,
        shot=shot,
        cut=cut,
        bible=bible or {},
        previous_cut=previous_cut,
        next_cut=next_cut,
        sibling_cuts_in_shot=siblings_shot,
        sibling_cuts_in_scene=siblings_scene,
        linked_characters=chars,
        linked_locations=locs,
        linked_props=props,
        style_anchor=style_anchor,
        scene_anchor_cut=scene_anchor_cut,
        art_style=(brief or {}).get("art_style") or "",
        color_palette=(brief or {}).get("color_palette") or "",
        lighting_signature=_lighting_signature(scene),
        aspect_ratio=(brief or {}).get("aspect_ratio") or "16:9",
        negatives=(brief or {}).get("negative_prompts") or "",
        stats={
            "siblings_in_shot": len(siblings_shot),
            "siblings_in_scene": len(siblings_scene),
            "linked_characters": len(chars),
            "linked_locations": len(locs),
            "linked_props": len(props),
            "has_previous_cut": previous_cut is not None,
            "has_next_cut": next_cut is not None,
            "has_style_anchor": style_anchor is not None,
            "has_scene_anchor": scene_anchor_cut is not None,
        },
    )
    log.info(
        "cut_context_bundled",
        cut_id=cut_id,
        project_id=project_id,
        **ctx.stats,
    )
    return ctx


def render_context_summary(ctx: CutContext) -> str:
    """Human-readable summary string for the progress UI."""
    s = ctx.stats
    parts = [
        f"{s.get('siblings_in_scene', 0)} sibling cuts",
        f"{s.get('linked_characters', 0)} characters",
        f"{s.get('linked_locations', 0)} locations",
        f"{s.get('linked_props', 0)} props",
    ]
    if s.get("has_previous_cut"):
        parts.append("prev cut available")
    if s.get("has_style_anchor"):
        parts.append("style anchor pinned")
    return ", ".join(parts)
