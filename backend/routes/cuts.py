from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
import backend.database.core as db
import backend.tools.generation as generation
import json

from backend.orchestrator.cut_composer import compose_cut, stream_compose_cut

router = APIRouter(prefix="/api/projects/{project_id}/cuts", tags=["cuts"])


@router.post("/{cut_id}/compose")
async def compose_cut_endpoint(project_id: str, cut_id: str):
    """Run the full Cut Composer pipeline (bundle → pick → preprod → prompt → render → critic → register)."""
    result = await compose_cut(cut_id)
    return result.to_dict()


@router.websocket("/{cut_id}/compose/stream")
async def compose_cut_stream(websocket: WebSocket, project_id: str, cut_id: str):
    """Stream `compose_step` events to the client as the pipeline runs."""
    await websocket.accept()
    try:
        async for step in stream_compose_cut(cut_id):
            await websocket.send_json({"type": "compose_step", **step.to_dict()})
        await websocket.send_json({"type": "compose_done", "cut_id": cut_id})
    except WebSocketDisconnect:
        return
    except Exception as e:
        try:
            await websocket.send_json({"type": "compose_error", "error": str(e)})
        finally:
            return
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@router.get("/{cut_id}/history")
async def get_cut_history(project_id: str, cut_id: str):
    """Get generation history for a cut."""
    conn = db.get_connection()
    cursor = conn.cursor()
    
    # Fetch from generation_requests where target_type='cut' and target_cut_id=cut_id
    cursor.execute("""
        SELECT * FROM generation_requests 
        WHERE project_id = ? AND target_type = 'cut' AND target_cut_id = ?
        ORDER BY created_at DESC
    """, (project_id, cut_id))
    
    rows = cursor.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]

@router.post("/{cut_id}/active")
async def set_active_generation(project_id: str, cut_id: str, request: SetActiveRequest):
    """
    Set a specific generation as the Active image for the cut.
    ALSO: Promotes this image to an Asset (type='frame') so it can be referenced later.
    """
    try:
        conn = db.get_connection()
        cursor = conn.cursor()
        
        print(f"DEBUG: set_active_generation called with gen_id={request.generation_id}")
        
        # 1. Get the generation record
        cursor.execute("SELECT * FROM generation_requests WHERE id = ?", (request.generation_id,))
        gen = cursor.fetchone()
        if not gen:
            conn.close()
            raise HTTPException(status_code=404, detail="Generation not found")
        
        image_url = gen['output_image_url']
        print(f"DEBUG: Found generation with image_url={image_url}")
        
        # 2. Update the CUT table
        cursor.execute("""
            UPDATE cuts 
            SET generated_image_url = ?, generation_status = 'complete'
            WHERE id = ?
        """, (image_url, cut_id))
        
        # 3. Promote to ASSET (Type: 'frame')
        # Get Cut Info for naming
        cursor.execute("SELECT * FROM cuts WHERE id = ?", (cut_id,))
        cut_row = cursor.fetchone()
        cut_num = cut_row['cut_number'] if cut_row else '?'
        
        asset_name = f"Frame: Cut {cut_num}"
        frame_asset_id = f"asset_frame_{cut_id}"
        
        # Upsert Asset
        cursor.execute("""
            INSERT INTO assets (id, project_id, name, type, image_url, description)
            VALUES (?, ?, ?, 'frame', ?, 'Auto-generated frame from Cut')
            ON CONFLICT(id) DO UPDATE SET
                image_url = excluded.image_url
        """, (frame_asset_id, project_id, asset_name, image_url))
        
        # Upsert Element Master
        master_id = f"master_{frame_asset_id}"
        cursor.execute("""
            INSERT INTO element_masters (id, asset_id, element_type, master_image_url, status, is_active)
            VALUES (?, ?, 'frame', ?, 'complete', 1)
            ON CONFLICT(id) DO UPDATE SET
                master_image_url = excluded.master_image_url
        """, (master_id, frame_asset_id, image_url))
        
        conn.commit()
        conn.close()
        
        print(f"DEBUG: Successfully set active image for cut {cut_id}")
        return {"success": True, "active_url": image_url, "asset_id": frame_asset_id}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in set_active_generation: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{cut_id}/pre-production")
async def get_cut_pre_production(project_id: str, cut_id: str):
    """
    Get pre-production requirements for a cut.
    Returns what assets need generation before the final cut can be rendered.
    """
    from backend.tools.pre_production import get_pre_production_requirements
    
    try:
        result = get_pre_production_requirements(project_id, cut_id)
        return result
    except Exception as e:
        print(f"ERROR in get_cut_pre_production: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class UpdateSlotsRequest(BaseModel):
    image_slots: str

@router.post("/{cut_id}/slots")
async def update_cut_image_slots(project_id: str, cut_id: str, request: UpdateSlotsRequest):
    """Save persistent image slot assignments for a cut."""
    from backend.tools.blueprint import update_cut
    try:
        result = update_cut(cut_id, image_slots=request.image_slots)
        if "✅" in result:
            return {"success": True, "message": result}
        else:
            raise HTTPException(status_code=500, detail=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
