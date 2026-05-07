"""
Asset Context Bundler — sibling of `context_bundler.py` for the upstream
phases. Given an asset_id, walks the production tree and returns:

- The asset row + any active sheet/master.
- The brief globals (art style, palette, lighting, world rules).
- Every scene/shot/cut the asset is linked to (via asset_links + bubble-up).
- Sibling assets in the same project (so Atlas/Pixel can avoid duplicates).
- The Continuity Bible.

Used by Atlas while writing `suggested_prompt`, by Iris when filling gaps,
and by Pixel when it needs context-aware asset reasoning.
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


@dataclass
class AssetContext:
    asset_id: str
    project_id: str

    asset: dict[str, Any] = field(default_factory=dict)
    brief: dict[str, Any] = field(default_factory=dict)
    bible: dict[str, Any] = field(default_factory=dict)

    # Where this asset shows up
    linked_scenes: list[dict[str, Any]] = field(default_factory=list)
    linked_shots: list[dict[str, Any]] = field(default_factory=list)
    linked_cuts: list[dict[str, Any]] = field(default_factory=list)

    # Other assets in the project (for de-duplication / contrast)
    sibling_assets: list[dict[str, Any]] = field(default_factory=list)

    # Parent / variant-base chain (for derived assets — Mara's gun has chain=[Mara])
    parent_chain: list[dict[str, Any]] = field(default_factory=list)

    # Active outputs
    active_sheet: dict[str, Any] | None = None
    master_image_url: str = ""

    stats: dict[str, Any] = field(default_factory=dict)


async def _fetch_one(conn, sql, params):
    async with conn.execute(sql, params) as cur:
        row = await cur.fetchone()
    return dict(row) if row else None


async def _fetch_all(conn, sql, params):
    async with conn.execute(sql, params) as cur:
        return [dict(r) for r in await cur.fetchall()]


async def bundle_asset_context(asset_id: str) -> AssetContext:
    """Walk the tree from one asset outward."""
    async with get_async_connection() as conn:
        asset = await _fetch_one(conn, "SELECT * FROM assets WHERE id = ?", (asset_id,))
        if asset is None:
            raise ValueError(f"asset {asset_id} not found")
        project_id = asset["project_id"]

        brief = await _fetch_one(conn, "SELECT * FROM briefs WHERE project_id = ?", (project_id,))

        # Linked nodes — scene/shot/cut by asset_links + bubble-up.
        links = await _fetch_all(
            conn,
            "SELECT * FROM asset_links WHERE asset_id = ?",
            (asset_id,),
        )
        scene_ids = {l["node_id"] for l in links if l["node_type"] == "scene"}
        shot_ids = {l["node_id"] for l in links if l["node_type"] == "shot"}
        cut_ids = {l["node_id"] for l in links if l["node_type"] == "cut"}

        # Bubble up: cuts → shots → scenes
        if cut_ids:
            placeholders = ",".join("?" * len(cut_ids))
            cuts = await _fetch_all(
                conn,
                f"SELECT * FROM cuts WHERE id IN ({placeholders})",
                tuple(cut_ids),
            )
            shot_ids.update(c["shot_id"] for c in cuts if c.get("shot_id"))
        else:
            cuts = []
        if shot_ids:
            placeholders = ",".join("?" * len(shot_ids))
            shots = await _fetch_all(
                conn,
                f"SELECT * FROM shots WHERE id IN ({placeholders})",
                tuple(shot_ids),
            )
            scene_ids.update(s["scene_id"] for s in shots if s.get("scene_id"))
        else:
            shots = []
        if scene_ids:
            placeholders = ",".join("?" * len(scene_ids))
            scenes = await _fetch_all(
                conn,
                f"SELECT * FROM scenes WHERE id IN ({placeholders})",
                tuple(scene_ids),
            )
        else:
            scenes = []

        sibling_assets = await _fetch_all(
            conn,
            "SELECT id, type, name, suggested_prompt, image_url FROM assets WHERE project_id = ? AND id != ?",
            (project_id, asset_id),
        )

        sheet = await _fetch_one(
            conn,
            "SELECT * FROM element_sheets WHERE asset_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1",
            (asset_id,),
        )
        if sheet:
            sheet["panels"] = json.loads(sheet.get("panels_json") or "[]")
            sheet["layout"] = json.loads(sheet.get("layout_json") or "{}")

        # Walk the parent chain (max depth 4) for derived/variant assets.
        parent_chain: list[dict[str, Any]] = []
        seen = {asset_id}
        cursor_asset = asset
        for _ in range(4):
            pid = cursor_asset.get("parent_asset_id") or cursor_asset.get("master_id")
            if not pid or pid in seen:
                break
            seen.add(pid)
            parent = await _fetch_one(conn, "SELECT * FROM assets WHERE id = ?", (pid,))
            if not parent:
                break
            parent_sheet = await _fetch_one(
                conn,
                "SELECT * FROM element_sheets WHERE asset_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1",
                (pid,),
            )
            if parent_sheet:
                parent_sheet["panels"] = json.loads(parent_sheet.get("panels_json") or "[]")
                parent_sheet["layout"] = json.loads(parent_sheet.get("layout_json") or "{}")
            parent["sheet"] = parent_sheet
            parent_chain.append(parent)
            cursor_asset = parent

    bible = await get_continuity_bible(project_id)
    if bible is None:
        bible = await compile_continuity_bible(project_id)

    ctx = AssetContext(
        asset_id=asset_id,
        project_id=project_id,
        asset=asset,
        brief=brief or {},
        bible=bible or {},
        linked_scenes=scenes,
        linked_shots=shots,
        linked_cuts=cuts,
        sibling_assets=sibling_assets,
        parent_chain=parent_chain,
        active_sheet=sheet,
        master_image_url=(asset.get("image_url") or ""),
        stats={
            "linked_scenes": len(scenes),
            "linked_shots": len(shots),
            "linked_cuts": len(cuts),
            "sibling_assets": len(sibling_assets),
            "has_sheet": sheet is not None,
            "has_master": bool(asset.get("image_url")),
        },
    )
    log.info("asset_context_bundled", asset_id=asset_id, **ctx.stats)
    return ctx
