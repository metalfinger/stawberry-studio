"""
Generation Phase Tools
Context gathering, prompt compilation, and image generation.
"""

import uuid
import json
from typing import Dict, Any, List, Optional
from backend.database import core as db
from backend.database import shots as shots_db
from backend.database import assets as assets_db
from backend.tools.registry import tool


# ============== CONTEXT TOOLS ==============

@tool("get_cut_context", description="Return cut + parent shot + scene + brief for prompt assembly.", tags=["generation", "read"])
def get_cut_context(project_id: str, cut_id: str) -> Dict[str, Any]:
    """
    Get full hierarchical context for a cut.
    Returns cut, parent shot, parent scene, and project brief.
    """
    conn = db.get_connection()
    cursor = conn.cursor()
    
    # Get the cut
    cursor.execute("SELECT * FROM cuts WHERE id = ?", (cut_id,))
    cut = cursor.fetchone()
    if not cut:
        conn.close()
        return {"error": f"Cut not found: {cut_id}"}
    cut = dict(cut)
    
    # Get parent shot
    cursor.execute("SELECT * FROM shots WHERE id = ?", (cut["shot_id"],))
    shot = cursor.fetchone()
    shot = dict(shot) if shot else {}
    
    # Get parent scene
    if shot:
        cursor.execute("SELECT * FROM scenes WHERE id = ?", (shot.get("scene_id"),))
        scene = cursor.fetchone()
        scene = dict(scene) if scene else {}
    else:
        scene = {}
    
    # Get brief
    brief = db.get_brief(project_id)
    
    conn.close()
    
    return {
        "cut": cut,
        "shot": shot,
        "scene": scene,
        "brief": brief,
        "hierarchy": ["brief", "scene", "shot", "cut"]
    }


@tool("get_previous_cut", description="Return the cut immediately before this one (for continuity chaining).", tags=["generation", "read"])
def get_previous_cut(project_id: str, cut_id: str) -> Optional[Dict[str, Any]]:
    """
    Get the cut before this one (for continuity chaining).
    Returns None if this is the first cut.
    """
    conn = db.get_connection()
    cursor = conn.cursor()
    
    # Get current cut's info
    cursor.execute("SELECT shot_id, cut_number FROM cuts WHERE id = ?", (cut_id,))
    current = cursor.fetchone()
    if not current:
        conn.close()
        return None
    
    shot_id = current["shot_id"]
    cut_number = current["cut_number"]
    
    if cut_number <= 1:
        conn.close()
        return None  # This is the first cut
    
    # Get previous cut in same shot
    cursor.execute("""
        SELECT * FROM cuts 
        WHERE shot_id = ? AND cut_number = ?
    """, (shot_id, cut_number - 1))
    prev = cursor.fetchone()
    conn.close()
    
    return dict(prev) if prev else None


@tool("get_cut_assets", description="Return assets linked to a specific cut, grouped by type.", tags=["generation", "read"])
def get_cut_assets(project_id: str, cut_id: str) -> Dict[str, List[Dict]]:
    """
    Get all assets linked to this cut.
    Also includes assets from parent shot and scene.
    """
    result = {
        "characters": [],
        "locations": [],
        "props": [],
    }
    
    # Get cut's direct assets
    cut_assets = assets_db.get_node_assets("cut", cut_id)
    
    # Get parent shot's assets
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT shot_id FROM cuts WHERE id = ?", (cut_id,))
    row = cursor.fetchone()
    if row:
        shot_assets = assets_db.get_node_assets("shot", row["shot_id"])
        
        # Get parent scene's assets
        cursor.execute("SELECT scene_id FROM shots WHERE id = ?", (row["shot_id"],))
        shot_row = cursor.fetchone()
        if shot_row:
            scene_assets = assets_db.get_node_assets("scene", shot_row["scene_id"])
        else:
            scene_assets = []
    else:
        shot_assets = []
        scene_assets = []
    
    conn.close()
    
    # Combine and categorize
    all_assets = cut_assets + shot_assets + scene_assets
    seen_ids = set()
    
    for asset in all_assets:
        if asset["id"] not in seen_ids:
            seen_ids.add(asset["id"])
            asset_type = asset.get("type", "prop")
            if asset_type == "character":
                result["characters"].append(asset)
            elif asset_type == "location":
                result["locations"].append(asset)
            else:
                result["props"].append(asset)
    
    return result


@tool("get_smart_generation_context", description="Full context bundle: cut, available_assets, previous_cuts, next_cut, art_style, slot rules.", tags=["generation", "read"])
def get_smart_generation_context(project_id: str, cut_id: str) -> Dict[str, Any]:
    """
    Get FULL context for a cut to enable smart agent decisions.
    
    Returns:
    - current_cut: Details about this cut (action, description, etc.)
    - current_position: Scene/Shot/Cut numbers
    - available_assets: ALL project assets with ready images
    - previous_cuts: ALL previous cuts with generated images (for continuity)
    - art_style: The project's visual style
    - action_context: What's happening in this cut
    
    The agent uses this to INTELLIGENTLY decide:
    - Which assets are relevant to this specific cut
    - Whether continuity from a previous cut is needed
    - What should go in each image slot
    """
    ctx = get_cut_context(project_id, cut_id)
    if "error" in ctx:
        return ctx
    
    cut = ctx["cut"]
    shot = ctx["shot"]
    scene = ctx["scene"]
    brief = ctx["brief"]
    
    # Current position
    current_scene_num = scene.get("scene_number", 1)
    current_shot_num = shot.get("shot_number", 1)
    current_cut_num = cut.get("cut_number", 1)
    
    # Get ALL project assets with ready images
    conn = db.get_connection()
    cursor = conn.cursor()
    
    # Fetch all assets with their master images. Source: reference_pool's
    # active 'identity' row (single source of truth, replaces element_masters).
    cursor.execute("""
        SELECT a.*,
               (SELECT rp.image_url FROM reference_pool rp
                WHERE rp.asset_id = a.id AND rp.label = 'identity'
                  AND COALESCE(rp.is_active,1) = 1
                ORDER BY rp.created_at DESC LIMIT 1) AS master_image_url
        FROM assets a
        WHERE a.project_id = ?
    """, (project_id,))
    
    all_assets = []
    for row in cursor.fetchall():
        asset = dict(row)
        asset_type = asset.get("type", "prop")
        # Skip "frame" type assets - these are cut composition references, not real assets
        if asset_type in ("frame", "cut", "shot", "scene"):
            continue
        # Check if image exists
        img_url = asset.get("master_image_url") or asset.get("image_url")
        if img_url:
            all_assets.append({
                "id": asset["id"],
                "name": asset.get("name"),
                "type": asset_type,
                "appearance": asset.get("appearance", ""),
                "image_url": img_url,
                "status": "ready"
            })
    
    # Get ALL previous cuts that have generated images
    cursor.execute("""
        SELECT c.*, sh.shot_number, sc.scene_number, 
               sh.camera_angle, sh.camera_distance, sh.camera_movement AS movement
        FROM cuts c
        JOIN shots sh ON c.shot_id = sh.id
        JOIN scenes sc ON sh.scene_id = sc.id
        WHERE sc.project_id = ? AND c.generated_image_url IS NOT NULL AND c.generated_image_url != ''
        ORDER BY sc.scene_number, sh.shot_number, c.cut_number
    """, (project_id,))
    
    previous_cuts = []
    for row in cursor.fetchall():
        prev = dict(row)
        # Only include cuts that come BEFORE the current one
        if (prev["scene_number"] < current_scene_num or
            (prev["scene_number"] == current_scene_num and prev["shot_number"] < current_shot_num) or
            (prev["scene_number"] == current_scene_num and prev["shot_number"] == current_shot_num and prev["cut_number"] < current_cut_num)):
            previous_cuts.append({
                "id": prev["id"],
                "position": f"S{prev['scene_number']}-SH{prev['shot_number']}-C{prev['cut_number']}",
                "action": prev.get("action", ""),
                "image_url": prev["generated_image_url"],
                "camera_angle": prev.get("camera_angle", ""),
                "camera_distance": prev.get("camera_distance", ""),
                "movement": prev.get("movement", ""),
                "status": "ready"
            })
    
    conn.close()
    
    # Current cut's linked assets (what the storyteller linked to this cut)
    linked_assets = get_cut_assets(project_id, cut_id)
    
    # Get NEXT cut action for narrative context (not for referencing!)
    next_cut_action = None
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.action FROM cuts c
        JOIN shots sh ON c.shot_id = sh.id
        JOIN scenes sc ON sh.scene_id = sc.id
        WHERE sc.project_id = ?
        AND (
            (sc.scene_number = ? AND sh.shot_number = ? AND c.cut_number = ?) OR
            (sc.scene_number = ? AND sh.shot_number = ? AND c.cut_number = 1) OR
            (sc.scene_number = ? AND sh.shot_number = 1 AND c.cut_number = 1)
        )
        ORDER BY sc.scene_number, sh.shot_number, c.cut_number
        LIMIT 1
    """, (project_id, 
          current_scene_num, current_shot_num, current_cut_num + 1,  # Next cut in same shot
          current_scene_num, current_shot_num + 1,  # First cut of next shot
          current_scene_num + 1  # First cut of next scene
    ))
    next_row = cursor.fetchone()
    if next_row:
        next_cut_action = next_row["action"]
    conn.close()
    
    art_style = resolve_inheritance(cut, shot, scene, brief, "art_style") or brief.get("art_style", "cinematic")
    
    return {
        "current_cut": {
            "id": cut_id,
            "position": f"S{current_scene_num}-SH{current_shot_num}-C{current_cut_num}",
            "scene_number": current_scene_num,
            "shot_number": current_shot_num,
            "cut_number": current_cut_num,
            "action": cut.get("action", ""),
            "story_description": cut.get("story_description", ""),
            "expression": cut.get("expression", ""),
            "dialogue": cut.get("dialogue", ""),
            "beat_type": cut.get("beat_type", ""),
        },
        "shot_context": {
            "description": shot.get("description", ""),
            "camera_angle": shot.get("camera_angle", ""),
            "camera_distance": shot.get("camera_distance", ""),
            "movement": shot.get("movement", ""),
        },
        "scene_context": {
            "name": scene.get("name", ""),
            "description": scene.get("description", ""),
            "atmosphere": scene.get("atmosphere", ""),
        },
        "art_style": art_style,
        "genre": brief.get("genre", ""),
        "available_assets": all_assets,
        "previous_cuts": previous_cuts,
        "next_cut_action": next_cut_action,  # For narrative flow awareness
        "linked_assets": linked_assets,
        "is_first_cut": (current_scene_num == 1 and current_shot_num == 1 and current_cut_num == 1),
        "rules": {
            "can_reference": "All assets with status='ready' AND all previous_cuts with images",
            "cannot_reference": "Current cut (itself), future cuts, assets without images",
            "slot_order": "Fill slots in ascending order: @Image1, @Image2, @Image3... No gaps allowed."
        }
    }


@tool("find_cut_by_number", description="Look up a cut by S{n}-Sh{n}-C{n} numbering.", tags=["generation", "read"])
def find_cut_by_number(project_id: str, scene_number: int, shot_number: int, cut_number: int = 1) -> Dict[str, Any]:
    """
    Find a cut UUID by its scene/shot/cut numbers.
    Useful when user says "Start with scene 1 shot 1".
    """
    conn = db.get_connection()
    cursor = conn.cursor()
    
    # 1. Find Scene
    cursor.execute("SELECT id FROM scenes WHERE project_id = ? AND scene_number = ?", (project_id, scene_number))
    scene = cursor.fetchone()
    if not scene:
        conn.close()
        return {"error": f"Scene {scene_number} not found."}
    
    # 2. Find Shot
    cursor.execute("SELECT id FROM shots WHERE scene_id = ? AND shot_number = ?", (scene["id"], shot_number))
    shot = cursor.fetchone()
    if not shot:
        conn.close()
        return {"error": f"Shot {shot_number} in Scene {scene_number} not found."}
    
    # 3. Find Cut
    cursor.execute("SELECT * FROM cuts WHERE shot_id = ? AND cut_number = ?", (shot["id"], cut_number))
    cut = cursor.fetchone()
    
    conn.close()
    
    if not cut:
        return {"error": f"Cut {cut_number} in Scene {scene_number} Shot {shot_number} not found."}
        
    return dict(cut)

# Legacy QA tools (compare_with_master / flag_issue / request_edit /
# approve_cut) and generate_image_mock removed — they were granted only
# to Spark and Scout, both of which were never reachable from chat
# (PHASE_AGENTS only auto-switched between Sage and Nova). Modern
# render-quality flow goes through orchestrator/vision_critic.py and
# the cut_executor's auto-retry loop. The legacy "approve_cut" tool is
# different from the "approve_cut_render" frontend intent — the
# frontend intent still works via intents.py.
#
# Helper tools (save_cut_image, mark_cut_status, get_asset_image) also
# removed — modern paths write generated_image_url directly via the
# planner/executor + reference_pool, and asset image lookup is a
# subquery (see continuity.py / chat_bridge.py).
