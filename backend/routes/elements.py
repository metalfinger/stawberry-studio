"""
Element Generation API Routes
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from backend.tools import element_generation
from backend import db

router = APIRouter(prefix="/api/projects/{project_id}/elements", tags=["elements"])


# ============================================================================
# REQUEST MODELS
# ============================================================================

class GenerateMasterRequest(BaseModel):
    asset_id: str
    prompt: Optional[str] = None
    auto_generate: bool = True
    model: str = "gemini-3-pro-image"
    resolution: str = "2048x2048"
    view_type: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    reference_images: Optional[List[Dict[str, Any]]] = None


class GenerateVariantRequest(BaseModel):
    master_id: str
    variant_type: str
    method: str = "image_to_image"
    custom_prompt: Optional[str] = None
    model: str = "gemini-2.5-flash-image"
    strength: float = 0.6


class GenerateVariantsBatchRequest(BaseModel):
    master_id: str
    variant_types: Optional[List[str]] = None


# ============================================================================
# MASTER ENDPOINTS
# ============================================================================

@router.post("/masters")
def create_element_master(project_id: str, request: GenerateMasterRequest):
    """
    Generate master reference image for an asset.

    POST /projects/{project_id}/elements/masters
    Body: {
        asset_id: str,
        prompt?: str,
        auto_generate?: bool,
        model?: str,
        resolution?: str,
        view_type?: str
    }

    Returns: { master_id, status, image_url, prompt }
    """
    # Verify project exists
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Verify asset exists and belongs to project
    asset = db.get_asset(request.asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if asset.get('project_id') != project_id:
        raise HTTPException(status_code=403, detail="Asset does not belong to this project")

    try:
        master_id = element_generation.generate_element_master(
            asset_id=request.asset_id,
            prompt=request.prompt,
            auto_generate=request.auto_generate,
            model=request.model,
            resolution=request.resolution,
            view_type=request.view_type,
            params=request.params,
            reference_images=request.reference_images
        )

        # Get created master
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM element_masters WHERE id = ?", (master_id,))
        master = dict(cursor.fetchone())
        conn.close()

        return {
            "success": True,
            "master_id": master_id,
            "master": master
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/masters/{master_id}")
def get_element_master_details(project_id: str, master_id: str):
    """
    Get master details including all variants.

    GET /projects/{project_id}/elements/masters/{master_id}

    Returns: { master: {...}, variants: [...] }
    """
    # Get master
    conn = db.get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM element_masters WHERE id = ?", (master_id,))
    master_row = cursor.fetchone()

    if not master_row:
        raise HTTPException(status_code=404, detail="Master not found")

    master = dict(master_row)

    # Verify belongs to project
    asset = db.get_asset(master['asset_id'])
    if not asset or asset.get('project_id') != project_id:
        raise HTTPException(status_code=403, detail="Master does not belong to this project")

    # Get variants
    variants = element_generation.get_element_variants(master_id, active_only=True)

    conn.close()

    return {
        "master": master,
        "variants": variants,
        "variant_count": len(variants)
    }


@router.delete("/masters/{master_id}")
def delete_element_master(project_id: str, master_id: str):
    """
    Delete master and all its variants.

    DELETE /projects/{project_id}/elements/masters/{master_id}
    """
    # Get master
    conn = db.get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM element_masters WHERE id = ?", (master_id,))
    master_row = cursor.fetchone()

    if not master_row:
        raise HTTPException(status_code=404, detail="Master not found")

    master = dict(master_row)

    # Verify belongs to project
    asset = db.get_asset(master['asset_id'])
    if not asset or asset.get('project_id') != project_id:
        raise HTTPException(status_code=403, detail="Master does not belong to this project")

    # Delete (CASCADE will delete variants)
    cursor.execute("DELETE FROM element_masters WHERE id = ?", (master_id,))
    conn.commit()
    conn.close()

    return {"success": True, "deleted": master_id}


# ============================================================================
# VARIANT ENDPOINTS
# ============================================================================

@router.post("/variants")
def create_element_variant(project_id: str, request: GenerateVariantRequest):
    """
    Generate a single variant from master.

    POST /projects/{project_id}/elements/variants
    Body: {
        master_id: str,
        variant_type: str,
        method?: 'image_to_image' | 'text_to_image',
        custom_prompt?: str,
        model?: str,
        strength?: float
    }

    Returns: { variant_id, status, image_url }
    """
    # Verify master exists and belongs to project
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM element_masters WHERE id = ?", (request.master_id,))
    master_row = cursor.fetchone()
    conn.close()

    if not master_row:
        raise HTTPException(status_code=404, detail="Master not found")

    master = dict(master_row)
    asset = db.get_asset(master['asset_id'])
    if not asset or asset.get('project_id') != project_id:
        raise HTTPException(status_code=403, detail="Master does not belong to this project")

    try:
        variant_id = element_generation.generate_element_variant(
            master_id=request.master_id,
            variant_type=request.variant_type,
            method=request.method,
            custom_prompt=request.custom_prompt,
            model=request.model,
            strength=request.strength
        )

        # Get created variant
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM element_variants WHERE id = ?", (variant_id,))
        variant = dict(cursor.fetchone())
        conn.close()

        return {
            "success": True,
            "variant_id": variant_id,
            "variant": variant
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/variants/batch")
def create_element_variants_batch(project_id: str, request: GenerateVariantsBatchRequest):
    """
    Generate multiple variants at once.

    POST /projects/{project_id}/elements/variants/batch
    Body: {
        master_id: str,
        variant_types?: string[]  // If null, generates standard set
    }

    Returns: { variant_ids: [...], count: number }
    """
    # Verify master
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM element_masters WHERE id = ?", (request.master_id,))
    master_row = cursor.fetchone()
    conn.close()

    if not master_row:
        raise HTTPException(status_code=404, detail="Master not found")

    master = dict(master_row)
    asset = db.get_asset(master['asset_id'])
    if not asset or asset.get('project_id') != project_id:
        raise HTTPException(status_code=403, detail="Master does not belong to this project")

    try:
        variant_ids = element_generation.generate_all_standard_variants(
            master_id=request.master_id,
            variant_types=request.variant_types
        )

        return {
            "success": True,
            "variant_ids": variant_ids,
            "count": len(variant_ids)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/variants/{variant_id}")
def delete_element_variant(project_id: str, variant_id: str):
    """
    Delete a variant.

    DELETE /projects/{project_id}/elements/variants/{variant_id}
    """
    # Get variant
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM element_variants WHERE id = ?", (variant_id,))
    variant_row = cursor.fetchone()

    if not variant_row:
        raise HTTPException(status_code=404, detail="Variant not found")

    variant = dict(variant_row)

    # Verify belongs to project
    cursor.execute("SELECT * FROM element_masters WHERE id = ?", (variant['master_id'],))
    master = dict(cursor.fetchone())

    asset = db.get_asset(master['asset_id'])
    if not asset or asset.get('project_id') != project_id:
        raise HTTPException(status_code=403, detail="Variant does not belong to this project")

    # Delete
    success = element_generation.delete_element_variant(variant_id)
    conn.close()

    return {"success": success, "deleted": variant_id}


# ============================================================================
# QUERY ENDPOINTS
# ============================================================================

@router.get("/assets/{asset_id}/summary")
def get_asset_elements(project_id: str, asset_id: str):
    """
    Get complete element summary for an asset.

    GET /projects/{project_id}/elements/assets/{asset_id}/summary

    Returns: {
        has_master: bool,
        master: {...} | null,
        variants: [...],
        variant_count: number,
        variant_types: string[]
    }
    """
    # Verify asset belongs to project
    asset = db.get_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if asset.get('project_id') != project_id:
        raise HTTPException(status_code=403, detail="Asset does not belong to this project")

    summary = element_generation.get_asset_elements_summary(asset_id)
    return summary


@router.get("/assets/{asset_id}/active-master")
def get_active_master_for_asset(project_id: str, asset_id: str):
    """
    Get the currently active master for an asset.

    GET /projects/{project_id}/elements/assets/{asset_id}/active-master

    Returns: {
        active_master: {...} | null,
        active_generation_id: string | null
    }
    """
    # Verify asset belongs to project
    asset = db.get_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if asset.get('project_id') != project_id:
        raise HTTPException(status_code=403, detail="Asset does not belong to this project")

    conn = db.get_connection()
    cursor = conn.cursor()

    # Find the active master for this asset
    cursor.execute("""
        SELECT em.*, gr.id as generation_request_id
        FROM element_masters em
        LEFT JOIN generation_requests gr ON gr.id = em.generation_request_id
        WHERE em.asset_id = ? AND em.is_active = 1
        ORDER BY em.created_at DESC
        LIMIT 1
    """, (asset_id,))

    row = cursor.fetchone()
    conn.close()

    if row:
        master = dict(row)
        return {
            "active_master": master,
            "active_generation_id": master.get('generation_request_id')
        }

    return {
        "active_master": None,
        "active_generation_id": None
    }


@router.get("/history")
def get_element_generation_history(
    project_id: str,
    target_type: Optional[str] = None,
    limit: int = 50
):
    """
    Get generation history for project.

    GET /projects/{project_id}/elements/history?target_type=element_master&limit=50

    Returns: [ { id, prompt, model, image_url, cost, created_at, ... }, ... ]
    """
    # Verify project
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    history = element_generation.get_generation_history(
        project_id=project_id,
        target_type=target_type,
        limit=limit
    )

    return history


# ============================================================================
# PROMPT ENDPOINTS
# ============================================================================

@router.get("/assets/{asset_id}/prompt")
def get_compiled_master_prompt(project_id: str, asset_id: str):
    """
    Get compiled prompt for generating master (without actually generating).

    GET /projects/{project_id}/elements/assets/{asset_id}/prompt

    Returns: { prompt, model, resolution, aspect_ratio, background }
    """
    # Verify asset
    asset = db.get_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if asset.get('project_id') != project_id:
        raise HTTPException(status_code=403, detail="Asset does not belong to this project")

    try:
        prompt_data = element_generation.compile_element_master_prompt(asset_id)
        return prompt_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/masters/{master_id}/variants/{variant_type}/prompt")
def get_compiled_variant_prompt(
    project_id: str,
    master_id: str,
    variant_type: str
):
    """
    Get compiled prompt for generating variant (preview).

    GET /projects/{project_id}/elements/masters/{master_id}/variants/{variant_type}/prompt

    Returns: { prompt, method, strength, model }
    """
    # Verify master
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM element_masters WHERE id = ?", (master_id,))
    master_row = cursor.fetchone()
    conn.close()

    if not master_row:
        raise HTTPException(status_code=404, detail="Master not found")

    master = dict(master_row)
    asset = db.get_asset(master['asset_id'])
    if not asset or asset.get('project_id') != project_id:
        raise HTTPException(status_code=403, detail="Master does not belong to this project")

    try:
        prompt_data = element_generation.compile_element_variant_prompt(
            master_id=master_id,
            variant_type=variant_type
        )
        return prompt_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# GENERATION QUEUE ENDPOINTS
# ============================================================================

@router.post("/generate/master")
def queue_master_generation(project_id: str, request: GenerateMasterRequest, background_tasks: BackgroundTasks):
    """
    Queue a master generation request (doesn't auto-save to slot).
    Returns request_id for tracking progress.

    POST /projects/{project_id}/elements/generate/master
    Body: {
        asset_id: str,
        prompt?: str,
        model?: str,
        resolution?: str,
        params?: { seed?: int }
    }

    Returns: { success, request_id, status }
    """
    from backend.services.generation_queue import create_generation_request, start_generation_task
    from backend.tools.element_generation import compile_element_master_prompt

    # Verify asset
    asset = db.get_asset(request.asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset.get('project_id') != project_id:
        raise HTTPException(status_code=403, detail="Asset does not belong to this project")

    # Get compiled prompt if not provided
    if not request.prompt:
        prompt_data = compile_element_master_prompt(request.asset_id)
        prompt = prompt_data['prompt']
    else:
        prompt = request.prompt

    # Create generation request
    request_id = create_generation_request(
        project_id=project_id,
        target_type='master',
        target_asset_id=request.asset_id,
        prompt=prompt,
        model=request.model,
        params={
            'resolution': request.resolution,
            'seed': request.params.get('seed') if request.params else None
        },
        reference_images=request.reference_images
    )

    # Start generation in background
    background_tasks.add_task(start_generation_task, request_id)

    return {
        "success": True,
        "request_id": request_id,
        "status": "queued"
    }


@router.get("/requests/{request_id}")
def get_generation_request_status(project_id: str, request_id: str):
    """
    Get generation request status and progress.

    GET /projects/{project_id}/elements/requests/{request_id}

    Returns: {
        id, status, progress_percentage, current_step,
        output_image_url, error_message, ...
    }
    """
    from backend.services.generation_queue import get_generation_status

    status = get_generation_status(request_id)
    if not status:
        raise HTTPException(status_code=404, detail="Request not found")

    if status['project_id'] != project_id:
        raise HTTPException(status_code=403, detail="Request does not belong to this project")

    return status


@router.get("/requests")
def list_generation_requests_endpoint(
    project_id: str,
    status: Optional[str] = None,
    target_asset_id: Optional[str] = None,
    limit: int = 50
):
    """
    List generation requests with filters.

    GET /projects/{project_id}/elements/requests?status=complete&limit=20

    Returns: [ { id, status, progress_percentage, ... }, ... ]
    """
    from backend.services.generation_queue import list_generation_requests

    requests = list_generation_requests(
        project_id=project_id,
        status=status,
        target_asset_id=target_asset_id,
        limit=limit
    )

    return requests


@router.post("/requests/{request_id}/cancel")
def cancel_generation_request(project_id: str, request_id: str):
    """
    Cancel a pending/generating request.

    POST /projects/{project_id}/elements/requests/{request_id}/cancel

    Returns: { success, cancelled }
    """
    from backend.services.generation_queue import cancel_generation, get_generation_status

    # Verify ownership
    status = get_generation_status(request_id)
    if not status:
        raise HTTPException(status_code=404, detail="Request not found")
    if status['project_id'] != project_id:
        raise HTTPException(status_code=403, detail="Request does not belong to this project")

    cancelled = cancel_generation(request_id)

    return {
        "success": True,
        "cancelled": cancelled
    }


@router.post("/requests/{request_id}/save-to-slot")
def save_generation_to_slot(
    project_id: str,
    request_id: str,
    make_active: bool = False
):
    """
    Save a completed generation to a master/variant slot.
    If make_active=True, sets as the active image for that slot.

    POST /projects/{project_id}/elements/requests/{request_id}/save-to-slot?make_active=true

    Returns: { success, master_id } or { success, variant_id }
    """
    import uuid
    from datetime import datetime
    from backend.services.generation_queue import get_generation_status

    # Get request
    req = get_generation_status(request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req['project_id'] != project_id:
        raise HTTPException(status_code=403, detail="Request does not belong to this project")
    if req['status'] != 'complete':
        raise HTTPException(status_code=400, detail="Generation not complete")

    conn = db.get_connection()
    cursor = conn.cursor()

    if req['target_type'] == 'master':
        # Check if this generation already has a master
        cursor.execute("""
            SELECT id FROM element_masters WHERE generation_request_id = ?
        """, (request_id,))
        existing_master = cursor.fetchone()

        if existing_master:
            # Master already exists, just update is_active
            master_id = existing_master[0]

            if make_active:
                # First deactivate ALL masters for this asset
                cursor.execute("""
                    UPDATE element_masters
                    SET is_active = 0
                    WHERE asset_id = ?
                """, (req['target_asset_id'],))

                # Then activate this one
                cursor.execute("""
                    UPDATE element_masters
                    SET is_active = 1, updated_at = ?
                    WHERE id = ?
                """, (datetime.now().isoformat(), master_id))
                
                # CRITICAL FIX: Update the main asset record
                cursor.execute("""
                    UPDATE assets
                    SET image_url = ?, slot_filled = 1
                    WHERE id = ?
                """, (req['output_image_url'], req['target_asset_id']))

            conn.commit()
            conn.close()

            return {"success": True, "master_id": master_id}

        # Create new element_master record
        master_id = f"master_{uuid.uuid4().hex[:8]}"

        # Get asset type
        asset = db.get_asset(req['target_asset_id'])
        element_type = asset.get('type', 'character')

        # If make_active, first deactivate ALL masters for this asset
        if make_active:
            # First deactivate ALL masters for this asset
            cursor.execute("""
                UPDATE element_masters
                SET is_active = 0
                WHERE asset_id = ?
            """, (req['target_asset_id'],))

            # Activate this one
            cursor.execute("""
                INSERT INTO element_masters (
                    id, asset_id, element_type, master_image_url,
                    master_prompt, candidate_group_id, is_active,
                    generation_request_id, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'complete', ?, ?)
            """, (master_id, req['target_asset_id'], element_type,
                  req['output_image_url'], req['prompt'], req['candidate_group_id'],
                  make_active, request_id, datetime.now().isoformat(), datetime.now().isoformat()))
            
            # CRITICAL FIX: Update the main asset record with this image_url
            cursor.execute("""
                UPDATE assets
                SET image_url = ?, slot_filled = 1
                WHERE id = ?
            """, (req['output_image_url'], req['target_asset_id']))

        else:
            # Just insert without activating
            cursor.execute("""
                INSERT INTO element_masters (
                    id, asset_id, element_type, master_image_url,
                    master_prompt, candidate_group_id, is_active,
                    generation_request_id, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'complete', ?, ?)
            """, (master_id, req['target_asset_id'], element_type,
                  req['output_image_url'], req['prompt'], req['candidate_group_id'],
                  make_active, request_id, datetime.now().isoformat(), datetime.now().isoformat()))

        # Update generation_request
        cursor.execute("""
            UPDATE generation_requests
            SET saved_to_master_id = ?
            WHERE id = ?
        """, (master_id, request_id))

        conn.commit()
        conn.close()

        return {"success": True, "master_id": master_id}

    elif req['target_type'] == 'variant':
        # Similar for variants...
        raise HTTPException(status_code=501, detail="Variant saving not yet implemented")

    else:
        raise HTTPException(status_code=400, detail=f"Unknown target_type: {req['target_type']}")
