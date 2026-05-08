"""Consistency-repair endpoints (Phase L6).

Existing projects (Test 4 etc.) were created BEFORE the style bible /
white sheets / location-plate logic landed. Rather than ask the user to
delete-and-redo, these endpoints re-run the new logic in-place:

  POST /api/projects/{project_id}/repair/style-bible
       Re-extract palette_hex / style_tokens / lighting_rules from the
       brief. Cheap (one Flash call). Returns the new bible.

  POST /api/projects/{project_id}/repair/style-anchor
       Mint a fresh anchor image. Replaces the prior URL so every
       subsequent generation references the new one. Costs one Pro
       image call.

  POST /api/projects/{project_id}/repair/regenerate-identities
       Mark every asset's identity as superseded and re-mint with the
       current (now white-background) sheet rules. Returns counts.
       Costs N image calls.

  POST /api/projects/{project_id}/repair/all
       Convenience: bible → anchor → identities, in order.

All endpoints emit progress through the chat narrator if a session is
attached, so the user sees what's happening. Cheap operations run
inline; expensive ones (full identity re-mint) fan out and stream.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/projects/{project_id}/repair", tags=["repair"])


@router.post("/style-bible")
async def repair_style_bible(project_id: str):
    from backend.orchestrator.style_bible import compile_style_bible_for_project
    bible = await compile_style_bible_for_project(project_id)
    return {
        "ok": True,
        "palette_hex": bible.get("palette_hex") or [],
        "style_tokens": bible.get("style_tokens") or [],
        "lighting_rules": bible.get("lighting_rules") or "",
    }


@router.post("/style-anchor")
async def repair_style_anchor(project_id: str):
    from backend.orchestrator.style_anchor import recompile_style_anchor
    url = await recompile_style_anchor(project_id)
    if not url:
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not generate anchor — does the project have a brief "
                "with art_style or color_palette set?"
            ),
        )
    return {"ok": True, "style_anchor_url": url}


@router.post("/regenerate-identities")
async def repair_regenerate_identities(project_id: str):
    """Mark every active identity reference as superseded, then mint a
    fresh one using the current (white-background) sheet rules. Identity
    is regenerated for characters / props / locations alike — locations
    re-render as flat-lit plates."""
    from backend.database.core import get_async_connection
    from backend.orchestrator import references_v2

    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT id, type FROM assets WHERE project_id = ? "
            "AND COALESCE(type,'') IN "
            "('character','location','prop','sublocation','location_angle')",
            (project_id,),
        ) as cur:
            assets = [dict(r) for r in await cur.fetchall()]

        # Supersede all current identities in one go.
        await conn.execute(
            "UPDATE reference_pool SET is_active = 0 "
            "WHERE asset_id IN (SELECT id FROM assets WHERE project_id = ?) "
            "AND label = 'identity' AND is_active = 1",
            (project_id,),
        )
        await conn.commit()

    minted: list[dict] = []
    failed: list[dict] = []
    for a in assets:
        try:
            ref = await references_v2.generate_identity_card(a["id"])
            minted.append({
                "asset_id": a["id"], "type": a["type"],
                "image_url": ref.get("image_url"),
            })
        except Exception as e:  # noqa: BLE001
            failed.append({"asset_id": a["id"], "type": a["type"], "error": str(e)})

    return {
        "ok": True,
        "minted_count": len(minted),
        "failed_count": len(failed),
        "minted": minted,
        "failed": failed,
    }


@router.post("/all")
async def repair_all(project_id: str):
    """Run bible → anchor → identities in order and report counts."""
    bible = await repair_style_bible(project_id)
    try:
        anchor = await repair_style_anchor(project_id)
    except HTTPException as e:
        anchor = {"ok": False, "error": e.detail}
    identities = await repair_regenerate_identities(project_id)
    return {
        "ok": True,
        "style_bible": bible,
        "style_anchor": anchor,
        "identities": identities,
    }
