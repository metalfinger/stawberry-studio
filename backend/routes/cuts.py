import asyncio
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
import backend.database.core as db
import backend.tools.generation as generation
import json

from backend.orchestrator.cut_planner import plan_compose_cut
from backend.orchestrator.cut_executor import execute_plan
from backend.orchestrator.plans import save_plan, update_plan_status

router = APIRouter(prefix="/api/projects/{project_id}/cuts", tags=["cuts"])


# --- Auto-approve compose path -----------------------------------------------
#
# Inlined from the deleted cut_composer.py wrapper. Plan → mark every item
# approved → execute. New code that wants user approval should call
# plan_compose_cut + present the Plan via PlanCard, then execute_plan; this
# endpoint stays as the explicit "fire and forget" route for callers who
# really want a single-shot render with no user gate.

_STEP_NAME_MAP = {
    "reference_check": "pick",
    "reference_reuse": "pick",
    "reference_generate": "preprod",
    "render": "render",
    "register": "register",
}


def _item_to_step(item) -> dict:
    return {
        "step": _STEP_NAME_MAP.get(item.kind, item.kind),
        "status": "ok" if item.status == "done" else item.status,
        "detail": {
            "description": item.description,
            "cost_usd": item.cost_usd,
            **(item.result or {}),
        },
        "ts": datetime.now().isoformat(),
    }


async def _compose_auto(cut_id: str, on_step=None) -> dict:
    """Plan → auto-approve → execute. Returns a dict shaped like the old
    ComposeResult.to_dict() so frontend / streaming clients keep working."""
    steps: list[dict] = []

    def _emit(step: dict) -> None:
        steps.append(step)
        if on_step:
            try:
                on_step(step)
            except Exception:
                pass

    _emit({"step": "bundle", "status": "start", "detail": {"cut_id": cut_id}, "ts": datetime.now().isoformat()})
    try:
        plan = await plan_compose_cut(cut_id)
    except Exception as e:
        _emit({"step": "bundle", "status": "error", "detail": {"error": str(e)}, "ts": datetime.now().isoformat()})
        return {"cut_id": cut_id, "image_url": None, "score": None, "attempts": 1, "steps": steps, "error": str(e)}

    _emit({"step": "bundle", "status": "ok",
           "detail": {"items": len(plan.items), "total_cost_usd": plan.total_cost_usd},
           "ts": datetime.now().isoformat()})

    for item in plan.items:
        item.approved = True
    await save_plan(plan)
    await update_plan_status(plan.id, "approved")

    def _exec_step(item):
        _emit(_item_to_step(item))

    result = await execute_plan(plan.id, on_step=_exec_step)
    return {
        "cut_id": cut_id,
        "image_url": result.image_url,
        "score": None,
        "attempts": 1,
        "steps": steps,
        "error": result.error,
    }


@router.post("/{cut_id}/compose")
async def compose_cut_endpoint(project_id: str, cut_id: str):
    """Auto-approve compose: plan → approve all → execute. Use plan_compose_cut + execute_plan directly when user approval is desired."""
    return await _compose_auto(cut_id)


@router.websocket("/{cut_id}/compose/stream")
async def compose_cut_stream(websocket: WebSocket, project_id: str, cut_id: str):
    """Stream `compose_step` events to the client as the pipeline runs."""
    await websocket.accept()
    queue: asyncio.Queue = asyncio.Queue()

    def _push(step: dict) -> None:
        queue.put_nowait(step)

    async def _runner() -> None:
        try:
            await _compose_auto(cut_id, on_step=_push)
        finally:
            queue.put_nowait(None)

    task = asyncio.create_task(_runner())
    try:
        while True:
            step = await queue.get()
            if step is None:
                break
            await websocket.send_json({"type": "compose_step", **step})
        await websocket.send_json({"type": "compose_done", "cut_id": cut_id})
    except WebSocketDisconnect:
        return
    except Exception as e:
        try:
            await websocket.send_json({"type": "compose_error", "error": str(e)})
        finally:
            return
    finally:
        if not task.done():
            await task
        try:
            await websocket.close()
        except Exception:
            pass


class SetActiveRequest(BaseModel):
    generation_id: str


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
