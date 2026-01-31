from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from pydantic import BaseModel
from backend import db
from backend.database import assets as assets_db
from backend.tools.generation import get_cut_context

router = APIRouter(prefix="/api/projects/{project_id}", tags=["assets"])

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
