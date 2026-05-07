"""
Reference Pool service.

Every generated image lands here with full provenance. Subsequent cuts can
re-use existing references instead of regenerating, which:
  - keeps the look locked (consistency)
  - saves cost
  - speeds up iteration

Public API:
    register_image(...)             — index a new reference
    search(...)                     — filter candidates by character/location/lighting/etc.
    get_anchors(project_id)         — scene anchor frames
    get_style_anchor(project_id)    — project-level style ref
    set_style_anchor(...)
    set_anchor(...)
    toggle_favorite(...)            — cross-project pinning
"""
from __future__ import annotations

import json
import uuid
from typing import Any

import structlog

from backend.database.core import get_async_connection

log = structlog.get_logger(__name__)


# ============================================================================
# Write API
# ============================================================================

async def register_image(
    project_id: str,
    image_url: str,
    *,
    source_type: str,
    source_cut_id: str | None = None,
    source_master_id: str | None = None,
    source_variant_id: str | None = None,
    source_request_id: str | None = None,
    character_ids: list[str] | None = None,
    location_id: str | None = None,
    aspect_ratio: str = "",
    lighting_signature: str = "",
    tags: dict[str, Any] | None = None,
    is_anchor: bool = False,
    is_style_anchor: bool = False,
) -> str:
    """Index a new reference. Returns its row id."""
    rid = f"ref_{uuid.uuid4().hex[:12]}"
    async with get_async_connection() as conn:
        await conn.execute(
            """
            INSERT INTO reference_pool
                (id, project_id, image_url, tags_json, character_ids_json, location_id,
                 aspect_ratio, lighting_signature, source_type, source_cut_id,
                 source_master_id, source_variant_id, source_request_id,
                 is_anchor, is_style_anchor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rid,
                project_id,
                image_url,
                json.dumps(tags or {}),
                json.dumps(character_ids or []),
                location_id,
                aspect_ratio,
                lighting_signature,
                source_type,
                source_cut_id,
                source_master_id,
                source_variant_id,
                source_request_id,
                1 if is_anchor else 0,
                1 if is_style_anchor else 0,
            ),
        )
        await conn.commit()
    log.info("reference_registered", project_id=project_id, source_type=source_type, id=rid)
    return rid


async def set_style_anchor(project_id: str, image_url: str) -> str:
    """Pin a single image as the project's canonical style reference. Replaces any prior."""
    async with get_async_connection() as conn:
        await conn.execute(
            "UPDATE reference_pool SET is_style_anchor = 0 WHERE project_id = ? AND is_style_anchor = 1",
            (project_id,),
        )
        await conn.commit()
    return await register_image(
        project_id, image_url, source_type="upload", is_style_anchor=True, tags={"role": "style_anchor"}
    )


async def set_anchor(reference_id: str, is_anchor: bool = True) -> None:
    async with get_async_connection() as conn:
        await conn.execute(
            "UPDATE reference_pool SET is_anchor = ? WHERE id = ?",
            (1 if is_anchor else 0, reference_id),
        )
        await conn.commit()


async def toggle_favorite(reference_id: str, is_favorite: bool) -> None:
    """Cross-project favorites — searchable from any project."""
    async with get_async_connection() as conn:
        await conn.execute(
            "UPDATE reference_pool SET is_favorite = ? WHERE id = ?",
            (1 if is_favorite else 0, reference_id),
        )
        await conn.commit()


# ============================================================================
# Read / search API
# ============================================================================

def _row_to_dict(row) -> dict[str, Any]:
    out = dict(row)
    out["tags"] = json.loads(out.pop("tags_json") or "{}")
    out["character_ids"] = json.loads(out.pop("character_ids_json") or "[]")
    out["is_anchor"] = bool(out.get("is_anchor", 0))
    out["is_style_anchor"] = bool(out.get("is_style_anchor", 0))
    out["is_favorite"] = bool(out.get("is_favorite", 0))
    out.pop("embedding", None)  # don't ship binary blobs
    return out


async def search(
    project_id: str,
    *,
    character_id: str | None = None,
    location_id: str | None = None,
    source_type: str | None = None,
    is_anchor: bool | None = None,
    aspect_ratio: str | None = None,
    include_favorites: bool = False,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Filter the pool. Cross-project favorites included if `include_favorites=True`."""
    clauses = ["(project_id = ?" + (" OR is_favorite = 1" if include_favorites else "") + ")"]
    params: list[Any] = [project_id]
    if location_id:
        clauses.append("location_id = ?")
        params.append(location_id)
    if source_type:
        clauses.append("source_type = ?")
        params.append(source_type)
    if is_anchor is True:
        clauses.append("is_anchor = 1")
    if aspect_ratio:
        clauses.append("aspect_ratio = ?")
        params.append(aspect_ratio)

    where = " AND ".join(clauses)
    sql = f"SELECT * FROM reference_pool WHERE {where} ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    async with get_async_connection() as conn:
        async with conn.execute(sql, params) as cur:
            rows = await cur.fetchall()

    out = [_row_to_dict(r) for r in rows]
    if character_id:
        out = [r for r in out if character_id in r["character_ids"]]
    return out


async def get_anchors(project_id: str) -> list[dict[str, Any]]:
    return await search(project_id, is_anchor=True)


async def get_style_anchor(project_id: str) -> dict[str, Any] | None:
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT * FROM reference_pool WHERE project_id = ? AND is_style_anchor = 1 ORDER BY created_at DESC LIMIT 1",
            (project_id,),
        ) as cur:
            row = await cur.fetchone()
    return _row_to_dict(row) if row else None


# ============================================================================
# Auto-population — wire into generation hot paths
# ============================================================================

async def auto_register_master(asset_id: str, image_url: str, request_id: str | None = None) -> str | None:
    """Hook: called after a master image is generated."""
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT project_id, type FROM assets WHERE id = ?", (asset_id,)
        ) as cur:
            row = await cur.fetchone()
    if not row:
        return None
    project_id = row["project_id"]
    asset_type = row["type"]
    return await register_image(
        project_id,
        image_url,
        source_type="master",
        source_master_id=asset_id,
        source_request_id=request_id,
        character_ids=[asset_id] if asset_type == "character" else [],
        location_id=asset_id if asset_type == "location" else None,
        tags={"role": "master", "asset_type": asset_type},
    )


async def auto_register_cut(cut_id: str, image_url: str, request_id: str | None = None) -> str | None:
    """Hook: called after a cut image is rendered. Pulls scene/character/location from blueprint."""
    async with get_async_connection() as conn:
        async with conn.execute(
            """
            SELECT c.id AS cut_id, c.shot_id,
                   s.id AS scene_id, s.project_id, s.location, s.lighting, s.lighting_color, s.time_of_day, s.mood
            FROM cuts c
            JOIN shots sh ON sh.id = c.shot_id
            JOIN scenes s ON s.id = sh.scene_id
            WHERE c.id = ?
            """,
            (cut_id,),
        ) as cur:
            ctx = await cur.fetchone()
        if ctx is None:
            return None
        ctx = dict(ctx)
        # Linked assets from asset_links
        async with conn.execute(
            """
            SELECT a.id AS asset_id, a.type
            FROM asset_links al JOIN assets a ON a.id = al.asset_id
            WHERE al.node_type = 'cut' AND al.node_id = ?
            """,
            (cut_id,),
        ) as cur:
            links = [dict(r) for r in await cur.fetchall()]

    char_ids = [r["asset_id"] for r in links if r["type"] == "character"]
    loc_ids = [r["asset_id"] for r in links if r["type"] == "location"]
    lighting_sig = ":".join(
        x for x in [ctx.get("time_of_day") or "", ctx.get("lighting_color") or "", ctx.get("mood") or ""] if x
    )
    return await register_image(
        ctx["project_id"],
        image_url,
        source_type="cut",
        source_cut_id=cut_id,
        source_request_id=request_id,
        character_ids=char_ids,
        location_id=loc_ids[0] if loc_ids else None,
        lighting_signature=lighting_sig,
        tags={"role": "cut", "scene_id": ctx["scene_id"], "shot_id": ctx["shot_id"]},
    )
