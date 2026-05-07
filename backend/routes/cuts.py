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

class GenerateCutRequest(BaseModel):
    prompt_override: Optional[str] = None
    model: str = "gemini-3-pro-image"
    
class SetActiveRequest(BaseModel):
    generation_id: str

@router.post("/{cut_id}/generate")
async def generate_cut_visual(project_id: str, cut_id: str, request: GenerateCutRequest):
    """
    Generate a new image for a Cut.
    Uses real Gemini/Fal API via generation tools.
    """
    try:
        print(f"DEBUG: Generating cut {cut_id} with prompt override: {request.prompt_override}")
        
        # 1. Compile Prompt (or use override)

        if request.prompt_override:
            # Create a mock compiled prompt struct if overridden
            compiled = {"prompt": request.prompt_override, "mode": "manual"}
        else:
            # PRIORITY: Check for saved compiled prompt first
            ctx = generation.get_cut_context(project_id, cut_id)
            cut = ctx["cut"]
            
            if cut.get("compiled_prompt") and cut.get("image_slots"):
                print("DEBUG: Using saved AGENT prompt from DB")
                slots = json.loads(cut.get("image_slots", "{}"))
                
                # Reconstruct reference_images list from slots
                from backend.database.assets import get_asset
                reference_images = []
                for slot_key, asset_id in slots.items():
                    if asset_id:
                        # CASE 1: Reference is a previous CUT (Continuity)
                        if asset_id.startswith("cut_"):
                            conn = db.get_connection()
                            cursor = conn.cursor()
                            cursor.execute("SELECT generated_image_url FROM cuts WHERE id = ?", (asset_id,))
                            row = cursor.fetchone()
                            conn.close()
                            
                            if row and row["generated_image_url"]:
                                reference_images.append({
                                    "slot": int(slot_key.replace("@Image", "")),
                                    "ref": slot_key,
                                    "type": "frame",
                                    "asset_id": asset_id,
                                    "image_url": row["generated_image_url"]
                                })
                                
                        # CASE 2: Reference is an ASSET
                        else:
                            asset = get_asset(asset_id)
                            if asset:
                                 # Resolve master image
                                conn = db.get_connection()
                                cursor = conn.cursor()
                                cursor.execute("SELECT master_image_url FROM element_masters WHERE asset_id = ? AND is_active = 1", (asset_id,))
                                row = cursor.fetchone()
                                conn.close()
                                img_url = row["master_image_url"] if row else asset.get("image_url")
                                
                                if img_url:
                                    reference_images.append({
                                        "slot": int(slot_key.replace("@Image", "")),
                                        "ref": slot_key,
                                        "type": asset.get("type", "asset"),
                                        "asset_id": asset_id,
                                        "image_url": img_url
                                    })
                
                compiled = {
                    "prompt": cut["compiled_prompt"],
                    "reference_images": reference_images,
                    "mode": "agent_saved"
                }
            else:
                # Fallback: Use smart compiler from tools/generation.py
                print("DEBUG: Compiling prompt (Fallback)...")
                compiled = generation.compile_shot_prompt(project_id, cut_id)
            
            print(f"DEBUG: Compiled: {compiled}")
            if "error" in compiled:
                raise HTTPException(status_code=400, detail=compiled["error"])

        # Get aspect ratio from brief (or shot override)
        shot = ctx.get("shot", {})
        brief = ctx.get("brief", {})
        aspect_ratio = shot.get("aspect_ratio_override") or brief.get("aspect_ratio") or "16:9"
        print(f"DEBUG: Using aspect_ratio: {aspect_ratio}")

        # 2. Call Generator
        print("DEBUG: Calling generation.generate_cut_image...")
        result = generation.generate_cut_image(
            project_id=project_id,
            cut_id=cut_id,
            prompt=compiled["prompt"],
            model=request.model,
            reference_images=compiled.get("reference_images"),
            aspect_ratio=aspect_ratio
        )
        print(f"DEBUG: Generation Result: {result}")
        
        if result is None:
             print("CRITICAL: generate_cut_image returned None!")
             # Fallback error
             raise HTTPException(status_code=500, detail="Generation returned no result")

        return result
        
    except Exception as e:
        print(f"CRITICAL ERROR in generate_cut_visual: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

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
