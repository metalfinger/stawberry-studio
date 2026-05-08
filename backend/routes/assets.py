from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from pydantic import BaseModel
from backend import db
from backend.database import assets as assets_db
from backend.tools.generation import get_cut_context
# Legacy sheet routes are removed; references endpoints below replace them.

router = APIRouter(prefix="/api/projects/{project_id}", tags=["assets"])


@router.get("/assets/{asset_id}")
async def get_asset(project_id: str, asset_id: str):
    """Return the asset row + its identity reference summary so the
    ContextPanel can show name / type / suggested_prompt for editing."""
    from backend.database import assets as assets_db
    asset = assets_db.get_asset(asset_id) if hasattr(assets_db, "get_asset") else None
    if not asset:
        # Fall back to direct query
        from backend.database.core import get_async_connection
        async with get_async_connection() as conn:
            async with conn.execute(
                "SELECT * FROM assets WHERE id = ? AND project_id = ?",
                (asset_id, project_id),
            ) as cur:
                row = await cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Asset not found")
        asset = dict(row)
    return {
        "id": asset["id"],
        "name": asset.get("name"),
        "type": asset.get("type"),
        "description": asset.get("description"),
        "suggested_prompt": asset.get("suggested_prompt"),
        "appearance": asset.get("appearance"),
        "distinctive_features": asset.get("distinctive_features"),
        "wardrobe_lock": asset.get("wardrobe_lock"),
        "image_url": asset.get("image_url"),
        "parent_asset_id": asset.get("parent_asset_id"),
    }


@router.get("/assets/{asset_id}/references")
async def list_asset_references(project_id: str, asset_id: str):
    """Every reference for this asset, identity first."""
    from backend.orchestrator import references
    refs = await references.list_references(asset_id)
    return {"references": refs}


class PromptUpdate(BaseModel):
    prompt: str


@router.put("/assets/{asset_id}/prompt")
async def update_asset_prompt_route(project_id: str, asset_id: str, body: PromptUpdate):
    """Direct REST patch for the ContextPanel's Save action — bypasses the
    chat WS so the UI doesn't have to wait on a narrator round-trip just to
    persist a prompt edit. Re-runs trait extraction so appearance /
    distinctive_features / wardrobe_lock stay in sync."""
    from backend.database.core import get_async_connection
    from backend.orchestrator.identity_traits import extract_identity_traits

    new_prompt = (body.prompt or "").strip()
    if not new_prompt:
        raise HTTPException(status_code=400, detail="Prompt is empty")

    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT type FROM assets WHERE id = ? AND project_id = ?",
            (asset_id, project_id),
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Asset not found")
        asset_type = row["type"] or "character"
        await conn.execute(
            "UPDATE assets SET suggested_prompt = ? WHERE id = ? AND project_id = ?",
            (new_prompt, asset_id, project_id),
        )
        await conn.commit()

    traits = await extract_identity_traits(new_prompt, asset_type=asset_type)
    if any(traits.values()):
        async with get_async_connection() as conn:
            await conn.execute(
                "UPDATE assets SET appearance = ?, distinctive_features = ?, "
                "wardrobe_lock = ?, consistency_tokens = ? "
                "WHERE id = ? AND project_id = ?",
                (
                    traits.get("appearance") or "",
                    traits.get("distinctive_features") or "",
                    traits.get("wardrobe_lock") or "",
                    traits.get("consistency_tokens") or "",
                    asset_id,
                    project_id,
                ),
            )
            await conn.commit()
    return {"ok": True, "asset_id": asset_id, "traits": traits}


@router.post("/assets/{asset_id}/references/identity")
async def generate_asset_identity_route(project_id: str, asset_id: str):
    """Generate (or return existing) identity card for the asset."""
    from backend.orchestrator import references
    try:
        ref = await references.generate_identity_card(asset_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ref


@router.post("/assets/{asset_id}/references/identity/regenerate")
async def regenerate_asset_identity_route(project_id: str, asset_id: str):
    """Mark the prior identity reference as superseded and mint a fresh one
    from the current `suggested_prompt`. Used by the ContextPanel /
    AssetMasterNode regen buttons. Direct REST so the chat console stays out
    of the per-asset busy state — the frontend can show a card-level spinner
    and a toast, no confusing chat dialogue."""
    from backend.database.core import get_async_connection
    from backend.orchestrator import references

    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT id FROM reference_pool WHERE asset_id = ? "
            "AND label = 'identity' AND is_active = 1",
            (asset_id,),
        ) as cur:
            old = await cur.fetchone()
        if old:
            await conn.execute(
                "UPDATE reference_pool SET is_active = 0 WHERE id = ?",
                (old["id"],),
            )
            await conn.commit()

    try:
        new_ref = await references.generate_identity_card(asset_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if old and new_ref.get("id"):
        async with get_async_connection() as conn:
            await conn.execute(
                "UPDATE reference_pool SET superseded_by_id = ? WHERE id = ?",
                (new_ref["id"], old["id"]),
            )
            await conn.commit()
    return new_ref


@router.post("/assets/{asset_id}/references/precache")
async def precache_asset_turnaround(project_id: str, asset_id: str):
    """Generate the standard turnaround set for the asset (identity + a few
    canonical poses, in parallel)."""
    from backend.orchestrator import references
    try:
        refs = await references.precache_standard_turnaround(asset_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"references": refs}


# /sheet, /sheets, /sheet/generate, /sheet/cells/{label} routes removed —
# references-first architecture replaces them with /references endpoints above.
# Frontend client.ts keeps `getAssetSheet` / `generateAssetSheet` symbol names
# so older components don't break, but they call the new endpoints.


# Models
class AssetSwapRequest(BaseModel):
    cut_id: str
    old_asset_id: str
    new_asset_id: str

class AssetResponse(BaseModel):
    id: str
    name: str
    type: str
    image_url: str | None

@router.post("/assets/swap-input")
def swap_input_asset(project_id: str, req: AssetSwapRequest):
    """
    Swap an asset assignment for a Cut.
    Smartly finds where the asset is linked (Cut -> Shot -> Scene) and updates the link.
    """
    conn = db.get_connection()
    cursor = conn.cursor()

    # 1. Get Hierarchy
    ctx = get_cut_context(project_id, req.cut_id)
    if "error" in ctx:
        raise HTTPException(404, "Cut not found")
    
    cut = ctx["cut"]
    shot = ctx["shot"]
    scene = ctx["scene"]

    # 2. Check Cut Links
    cursor.execute("""
        SELECT id FROM asset_links 
        WHERE asset_id = ? AND node_type = 'cut' AND node_id = ?
    """, (req.old_asset_id, cut["id"]))
    link = cursor.fetchone()

    if link:
        # Update Cut Link
        cursor.execute("UPDATE asset_links SET asset_id = ? WHERE id = ?", (req.new_asset_id, link["id"]))
        conn.commit()
        conn.close()
        return {"success": True, "level": "cut", "message": "Updated Cut-level assignment"}

    # 3. Check Shot Links
    if shot:
        cursor.execute("""
            SELECT id FROM asset_links 
            WHERE asset_id = ? AND node_type = 'shot' AND node_id = ?
        """, (req.old_asset_id, shot["id"]))
        link = cursor.fetchone()
        if link:
            cursor.execute("UPDATE asset_links SET asset_id = ? WHERE id = ?", (req.new_asset_id, link["id"]))
            conn.commit()
            conn.close()
            return {"success": True, "level": "shot", "message": "Updated Shot-level assignment (affects sibling cuts)"}

    # 4. Check Scene Links
    if scene:
        cursor.execute("""
            SELECT id FROM asset_links 
            WHERE asset_id = ? AND node_type = 'scene' AND node_id = ?
        """, (req.old_asset_id, scene["id"]))
        link = cursor.fetchone()
        if link:
            cursor.execute("UPDATE asset_links SET asset_id = ? WHERE id = ?", (req.new_asset_id, link["id"]))
            conn.commit()
            conn.close()
            return {"success": True, "level": "scene", "message": "Updated Scene-level assignment"}

    conn.close()
    return {"success": False, "message": "Link not found in hierarchy"}
