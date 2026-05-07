from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from pydantic import BaseModel
from backend import db
from backend.database import assets as assets_db
from backend.tools.generation import get_cut_context
from backend.orchestrator.sheet_generator import (
    generate_sheet_for_asset,
    get_active_sheet,
    list_sheets_for_asset,
)
from backend.orchestrator.sheet_cells import crop_cell_url

router = APIRouter(prefix="/api/projects/{project_id}", tags=["assets"])


@router.get("/assets/{asset_id}/references")
async def list_asset_references(project_id: str, asset_id: str):
    """Every reference for this asset, identity first."""
    from backend.orchestrator import references_v2
    refs = await references_v2.list_references(asset_id)
    return {"references": refs}


@router.post("/assets/{asset_id}/references/identity")
async def generate_asset_identity_route(project_id: str, asset_id: str):
    """Generate (or return existing) identity card for the asset."""
    from backend.orchestrator import references_v2
    try:
        ref = await references_v2.generate_identity_card(asset_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ref


@router.post("/assets/{asset_id}/references/precache")
async def precache_asset_turnaround(project_id: str, asset_id: str):
    """Generate the standard turnaround set for the asset (identity + a few
    canonical poses, in parallel)."""
    from backend.orchestrator import references_v2
    try:
        refs = await references_v2.precache_standard_turnaround(asset_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"references": refs}


@router.get("/assets/{asset_id}/sheet")
async def get_asset_sheet(project_id: str, asset_id: str):
    """Return the asset's active element sheet (or null if none)."""
    sheet = await get_active_sheet(asset_id)
    return {"sheet": sheet}


@router.get("/assets/{asset_id}/sheets")
async def list_asset_sheets(project_id: str, asset_id: str):
    sheets = await list_sheets_for_asset(asset_id)
    return {"sheets": sheets}


class GenerateSheetRequest(BaseModel):
    override_sheet_type: str | None = None
    seed: int | None = None


@router.post("/assets/{asset_id}/sheet/generate")
async def generate_asset_sheet(project_id: str, asset_id: str, req: GenerateSheetRequest):
    """Plan + generate a new element sheet for the asset (Nano Banana Pro)."""
    try:
        result = await generate_sheet_for_asset(
            asset_id,
            override_sheet_type=req.override_sheet_type,
            seed=req.seed,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {
        "sheet_id": result.sheet_id,
        "image_url": result.image_url,
        "template_id": result.template_id,
        "sheet_type": result.sheet_type,
        "panels": result.panels,
        "layout": result.layout,
        "cost_usd": result.cost_usd,
        "rationale": result.rationale,
    }


@router.get("/assets/{asset_id}/sheet/cells/{cell_label}")
async def get_sheet_cell(project_id: str, asset_id: str, cell_label: str):
    """Return a cropped cell image URL for a single panel of the active sheet."""
    sheet = await get_active_sheet(asset_id)
    if not sheet:
        raise HTTPException(status_code=404, detail="no active sheet")
    url = await crop_cell_url(sheet["id"], cell_label)
    if not url:
        raise HTTPException(status_code=404, detail=f"cell {cell_label} not found")
    return {"image_url": url, "cell_label": cell_label}


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
