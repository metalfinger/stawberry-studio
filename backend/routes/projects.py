"""
Project routes
"""
from fastapi import APIRouter, HTTPException
from typing import List
import uuid

from backend import db
from backend.models import Project, ProjectCreate, Brief, BriefUpdate

router = APIRouter(prefix="/api/projects", tags=["projects"])

@router.get("", response_model=List[Project])
def list_projects():
    """List all projects."""
    return db.list_projects()

@router.post("", response_model=Project)
def create_project(data: ProjectCreate):
    """Create a new project."""
    return db.create_project(data.name)

@router.get("/{project_id}", response_model=Project)
def get_project(project_id: str):
    """Get a single project."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.get("/{project_id}/brief", response_model=Brief)
def get_brief(project_id: str):
    """Get project brief."""
    brief = db.get_brief(project_id)
    if not brief:
        raise HTTPException(status_code=404, detail="Brief not found")
    return brief

@router.patch("/{project_id}/brief", response_model=Brief)
def update_brief(project_id: str, data: BriefUpdate):
    """Update project brief."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    return db.update_brief(project_id, **updates)

@router.get("/{project_id}/blueprint")
def get_blueprint(project_id: str, include_assets: bool = False):
    """
    Get full blueprint with scenes, shots, and cuts. 
    Optionally include linked assets with bubble-up aggregation.
    
    Bubble-up logic:
    - Cut shows its directly linked assets
    - Shot shows its assets + all unique assets from its cuts
    - Scene shows its assets + all unique assets from its shots (which include cut assets)
    """
    from backend.database import assets as asset_db
    
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    scenes = db.get_scenes(project_id)
    brief = db.get_brief(project_id)
    result = {
        "project_id": project_id,
        "brief": brief,
        "scenes": []
    }
    
    for scene in scenes:
        scene_data = dict(scene)
        scene_asset_ids = set()  # Track unique assets for scene
        
        # Get scene's direct assets
        if include_assets:
            scene_direct_assets = asset_db.get_node_assets('scene', scene['id'])
            for a in scene_direct_assets:
                scene_asset_ids.add(a['id'])
        
        shots = db.get_shots(scene['id'])
        scene_data['shots'] = []
        
        for shot in shots:
            shot_data = dict(shot)
            shot_asset_ids = set()  # Track unique assets for shot
            
            # Get shot's direct assets
            if include_assets:
                shot_direct_assets = asset_db.get_node_assets('shot', shot['id'])
                for a in shot_direct_assets:
                    shot_asset_ids.add(a['id'])
            
            # Get cuts for this shot
            conn = db.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM cuts WHERE shot_id = ? ORDER BY cut_number", (shot['id'],))
            cuts = [dict(row) for row in cursor.fetchall()]
            conn.close()
            
            # Include assets for each cut and bubble up to shot
            if include_assets:
                for cut in cuts:
                    cut_assets = asset_db.get_node_assets('cut', cut['id'])
                    cut['assets'] = cut_assets
                    # Bubble up: add cut's assets to shot's collection
                    for a in cut_assets:
                        shot_asset_ids.add(a['id'])
            
            # Build shot's aggregated asset list
            if include_assets:
                # Combine direct + bubbled-up from cuts
                all_shot_asset_ids = shot_asset_ids
                shot_data['assets'] = [a for a in asset_db.get_assets(project_id) if a['id'] in all_shot_asset_ids] if all_shot_asset_ids else []
                # Bubble up to scene
                scene_asset_ids.update(shot_asset_ids)
            
            shot_data['cuts'] = cuts
            scene_data['shots'].append(shot_data)
        
        # Build scene's aggregated asset list
        if include_assets:
            scene_data['assets'] = [a for a in asset_db.get_assets(project_id) if a['id'] in scene_asset_ids] if scene_asset_ids else []
        
        result['scenes'].append(scene_data)
    
    return result


@router.get("/{project_id}/assets")
def get_assets(project_id: str, asset_type: str = None):
    """Get all assets with master/variant hierarchy and node links."""
    from backend.database import assets as asset_db
    
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get masters with variants
    masters = asset_db.get_masters(project_id, asset_type)
    
    result = {
        "characters": [],
        "locations": [],
        "props": [],
        "frames": []
    }
    
    for master in masters:
        master_data = dict(master)
        # Get variants
        master_data["variants"] = asset_db.get_variants(master["id"])
        # Get linked nodes
        master_data["linked_nodes"] = asset_db.get_asset_nodes(master["id"])
        
        # Categorize
        asset_type_key = master["type"] + "s"  # character -> characters
        if asset_type_key in result:
            result[asset_type_key].append(master_data)
    
    # Get frames separately (they don't have variants)
    frames = asset_db.get_assets(project_id, "frame")
    for frame in frames:
        frame_data = dict(frame)
        frame_data["linked_nodes"] = asset_db.get_asset_nodes(frame["id"])
        result["frames"].append(frame_data)
    
    return result


@router.get("/{project_id}/node/{node_type}/{node_id}/assets")
def get_node_assets(project_id: str, node_type: str, node_id: str):
    """Get assets linked to a specific node."""
    from backend.database import assets as asset_db
    
    assets = asset_db.get_node_assets(node_type, node_id)
    return {"assets": assets, "count": len(assets)}


@router.get("/{project_id}/cuts/{cut_id}/prompt")
def get_cut_prompt(project_id: str, cut_id: str):
    """
    Get compiled prompt for a specific cut.
    Returns the full generation prompt with slot assignments.
    """
    from backend.tools.generation import compile_shot_prompt, compile_edit_prompt, get_cut_context
    
    # Get cut context to determine mode
    ctx = get_cut_context(project_id, cut_id)
    if "error" in ctx:
        raise HTTPException(status_code=404, detail=ctx["error"])
    
    cut = ctx["cut"]
    cut_number = cut.get("cut_number", 1)
    
    # Determine which prompt to compile
    if cut_number == 1:
        result = compile_shot_prompt(project_id, cut_id)
    else:
        result = compile_edit_prompt(project_id, cut_id)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.get("/{project_id}/cuts/{cut_id}/history")
def get_cut_history(project_id: str, cut_id: str):
    """Get generation history for a cut."""
    from backend.tools.pre_production import get_generation_history
    
    # Verify project exists
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    return get_generation_history(project_id, cut_id)


