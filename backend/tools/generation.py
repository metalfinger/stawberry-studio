"""
Generation Phase Tools
Context gathering, prompt compilation, and image generation.
"""

import uuid
import json
import sqlite3
from typing import Dict, Any, List, Optional
from backend.database import core as db
from backend.database import shots as shots_db
from backend.database import assets as assets_db
from backend.tools.registry import tool


# L2 — style anchor injector. Sync helper since the cut compile tools are
# sync. Reads continuity_bible.style_anchor_url directly.
def _style_anchor_url_sync(project_id: str) -> str:
    try:
        conn = db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT style_anchor_url FROM continuity_bible WHERE project_id = ?",
                (project_id,),
            )
            row = cur.fetchone()
            if not row:
                return ""
            try:
                return (row["style_anchor_url"] or "").strip()
            except Exception:
                return (row[0] or "").strip()
        finally:
            conn.close()
    except sqlite3.Error:
        return ""


def _prepend_style_anchor_ref(reference_images: list[dict], project_id: str) -> list[dict]:
    """If a style anchor exists, prepend it as a high-slot reference. The
    model treats it as a visual lock — palette, line, grain. We don't add
    a @ImageN tag in the prompt for it; it's a passive style binder."""
    url = _style_anchor_url_sync(project_id)
    if not url:
        return reference_images
    # Use slot 9 to avoid clashing with cut composer's 1-4 mapping.
    if any(r.get("image_url") == url for r in reference_images):
        return reference_images
    return [
        {
            "slot": 9,
            "ref": "@StyleAnchor",
            "type": "style_anchor",
            "name": "Project style anchor",
            "image_url": url,
            "status": "ready",
        },
        *reference_images,
    ]



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
    
    # Fetch all assets with their master images
    cursor.execute("""
        SELECT a.*, em.master_image_url 
        FROM assets a
        LEFT JOIN element_masters em ON a.id = em.asset_id AND em.is_active = 1
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


# ============== PROMPT COMPILATION ==============

def resolve_inheritance(cut: dict, shot: dict, scene: dict, brief: dict, field: str) -> str:
    """Resolve a field value with child-overrides-parent inheritance."""
    # Check cut overrides first
    override_field = f"override_{field}"
    if cut.get(override_field):
        return cut[override_field]
    if cut.get(field):
        return cut[field]
    
    # Then shot
    if shot.get(override_field):
        return shot[override_field]
    if shot.get(field):
        return shot[field]
    
    # Then scene
    if scene.get(override_field):
        return scene[override_field]
    if scene.get(field):
        return scene[field]
    
    # Finally brief
    return brief.get(field, "")


@tool("compile_shot_prompt", description="Compile a text-to-image prompt for the first cut of a shot.", tags=["generation", "write"])
def compile_shot_prompt(project_id: str, cut_id: str) -> Dict[str, Any]:
    """
    Compile a Nano Banana Pro (Gemini 3 Pro Image) format prompt.
    Uses @Image1, @Image2 notation with detailed natural language.
    
    SMART FILTERING:
    - Only includes REAL assets (character, location, prop) with ready images
    - Excludes "frame" type assets (cut/composition references)
    - @Image4 = previous cut ONLY if it has a generated image
    - Never references current cut or future cuts
    """
    ctx = get_cut_context(project_id, cut_id)
    if "error" in ctx:
        return ctx
    
    cut = ctx["cut"]
    shot = ctx["shot"]
    scene = ctx["scene"]
    brief = ctx["brief"]
    
    # Get current cut position for filtering
    current_scene_num = scene.get("scene_number", 1)
    current_shot_num = shot.get("shot_number", 1)
    current_cut_num = cut.get("cut_number", 1)
    is_first_cut = (current_scene_num == 1 and current_shot_num == 1 and current_cut_num == 1)
    
    assets = get_cut_assets(project_id, cut_id)
    
    reference_images = []
    image_refs = {}
    slot_num = 1
    
    # Helper to ensure we get an image if one exists (auto-heal)
    def _resolve_asset_image(asset):
        if asset.get("image_url"):
            return asset["image_url"]
            
        # Fallback: Check if there is an active master
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT master_image_url FROM element_masters WHERE asset_id = ? AND is_active = 1", (asset.get("id"),))
        row = cursor.fetchone()
        conn.close()
        return row["master_image_url"] if row else None
    
    def _is_frame_or_cut_reference(asset):
        """Check if this is a frame/cut reference, not a real asset."""
        asset_type = asset.get("type", "").lower()
        asset_name = asset.get("name", "").lower()
        
        # Skip if type is "frame" or "cut"
        if asset_type in ("frame", "cut", "shot", "scene"):
            return True
        
        # Skip if name looks like a cut reference (e.g., "S1 SH1 C1 - Boot Descent")
        if any(pattern in asset_name for pattern in ["s1 sh", "s2 sh", "s3 sh", "shot 1 cut", "shot 2 cut"]):
            return True
            
        return False

    # Characters (only real characters with ready images)
    for i, char in enumerate(assets["characters"][:2]):
        if _is_frame_or_cut_reference(char):
            continue
        img_url = _resolve_asset_image(char)
        if not img_url:  # Skip pending assets
            continue
            
        ref_key = f"@Image{slot_num}"
        reference_images.append({
            "slot": slot_num,
            "ref": ref_key,
            "type": "character",
            "name": char.get("name"),
            "asset_id": char.get("id"),
            "image_url": img_url,
            "status": "ready"
        })
        image_refs[f"char_{i}"] = ref_key
        slot_num += 1
    
    # Location (only if ready)
    if assets["locations"]:
        loc = assets["locations"][0]
        if not _is_frame_or_cut_reference(loc):
            img_url = _resolve_asset_image(loc) or scene.get("location_master_url")
            if img_url:
                ref_key = f"@Image{slot_num}"
                reference_images.append({
                    "slot": slot_num,
                    "ref": ref_key,
                    "type": "location",
                    "name": loc.get("name"),
                    "asset_id": loc.get("id"),
                    "image_url": img_url,
                    "status": "ready"
                })
                image_refs["location"] = ref_key
                slot_num += 1
    
    # Props (only real props with ready images, skip frame references)
    if assets["props"]:
        for prop in assets["props"][:1]:  # Only first prop
            if _is_frame_or_cut_reference(prop):
                continue
            img_url = _resolve_asset_image(prop)
            if not img_url:
                continue
                
            ref_key = f"@Image{slot_num}"
            reference_images.append({
                "slot": slot_num,
                "ref": ref_key,
                "type": "prop",
                "name": prop.get("name"),
                "asset_id": prop.get("id"),
                "image_url": img_url,
                "status": "ready"
            })
            image_refs["prop"] = ref_key
            slot_num += 1
    
    # @Image4 = Previous cut for continuity (ONLY if not first cut AND has generated image)
    if not is_first_cut:
        prev_cut = get_previous_cut(project_id, cut_id)
        if prev_cut and prev_cut.get("generated_image_url"):
            ref_key = "@Image4"
            reference_images.append({
                "slot": 4,
                "ref": ref_key,
                "type": "continuity",
                "name": f"Previous Cut (S{current_scene_num}-SH{current_shot_num}-C{current_cut_num - 1})",
                "asset_id": prev_cut.get("id"),
                "image_url": prev_cut.get("generated_image_url"),
                "status": "ready"
            })
            image_refs["continuity"] = ref_key
            
    # NOTE: Persistent Slot Overrides are intentionally NOT processed here
    # The agent should only use what's returned by this function
            
            
    # Build detailed natural language prompt
    prompt_parts = []
    
    # Opening - World and Style Context (Using Brief's full visual style)
    genre = brief.get("genre", "cinematic")
    art_style = resolve_inheritance(cut, shot, scene, brief, "art_style")
    color_palette = brief.get("color_palette", "")
    lighting_style = resolve_inheritance(cut, shot, scene, brief, "lighting_style") or brief.get("lighting_style", "")
    world_logic = brief.get("world_logic", "")
    
    # Build the opening with style context
    if art_style:
        prompt_parts.append(f"WORLD: {genre} | {world_logic or 'Standard universe'}")
        prompt_parts.append(f"AESTHETIC: {art_style} style rendering.")
        if color_palette:
            prompt_parts.append(f"COLOR PALETTE: {color_palette}")
        if lighting_style:
            prompt_parts.append(f"LIGHTING: {lighting_style}")
        prompt_parts.append("")
        prompt_parts.append(f"Create a {art_style} still from a {genre} film.")
    else:
        # Fallback with warning
        prompt_parts.append(f"STYLE: ⚠️ No art_style defined in Brief - defaulting to cinematic.")
        prompt_parts.append(f"Create a cinematic still from a {genre} film.")
    prompt_parts.append("")
    
    # SUBJECT section - Characters with @Image references
    if assets["characters"]:
        prompt_parts.append("SUBJECT:")
        char = assets["characters"][0]
        char_ref = image_refs.get("char_0", "")
        
        # Build detailed character description
        char_desc = []
        char_desc.append(f"The main subject is {char.get('name', 'the character')}")
        
        if char.get("appearance"):
            char_desc.append(f", {char['appearance']}")
        elif char.get("description"):
            char_desc.append(f" - {char['description']}")
        
        # Add reference instruction
        if char_ref:
            char_desc.append(f" (use {char_ref} as character reference with face 100% same as reference")
            if char.get("wardrobe_lock"):
                char_desc.append(f", wearing exactly: {char['wardrobe_lock']}")
            if char.get("consistency_tokens"):
                char_desc.append(f", maintaining these features: {char['consistency_tokens']}")
            char_desc.append(")")
        
        char_desc.append(".")
        prompt_parts.append("".join(char_desc))
        
        # Action description
        action = cut.get("action", "")
        if action:
            action_desc = f"The character is {action.lower()}"
            if cut.get("expression"):
                action_desc += f", with {cut['expression']} expression"
            if cut.get("body_language"):
                action_desc += f", {cut['body_language']}"
            if cut.get("gesture"):
                action_desc += f", {cut['gesture']}"
            action_desc += "."
            prompt_parts.append(action_desc)
        
        # Gaze and dialogue
        if cut.get("gaze_direction"):
            prompt_parts.append(f"Eyes directed {cut['gaze_direction']}.")
        if cut.get("dialogue"):
            prompt_parts.append(f'Speaking: "{cut["dialogue"]}"')
        
        # Secondary character
        if len(assets["characters"]) > 1:
            char2 = assets["characters"][1]
            char2_ref = image_refs.get("char_1", "")
            prompt_parts.append(f"Also in frame: {char2.get('name', 'secondary character')} ({char2_ref} as reference with face 100% same as reference).")
        
        prompt_parts.append("")
    
    # LOCATION section
    prompt_parts.append("LOCATION:")
    loc_ref = image_refs.get("location", "")
    location_name = scene.get("location", "the scene location")
    
    loc_desc = [f"The scene takes place in {location_name}"]
    if loc_ref:
        loc_desc.append(f" (use {loc_ref} as location reference)")
    loc_desc.append(".")
    prompt_parts.append("".join(loc_desc))
    
    # Location details
    if scene.get("location_detail"):
        prompt_parts.append(f"Environment details: {scene['location_detail']}.")
    if scene.get("atmosphere"):
        prompt_parts.append(f"Atmosphere: {scene['atmosphere']}.")
    if scene.get("time_of_day"):
        prompt_parts.append(f"Time of day: {scene['time_of_day']}.")
    if scene.get("weather"):
        prompt_parts.append(f"Weather: {scene['weather']}.")
    prompt_parts.append("")
    
    # PROPS section
    if assets["props"]:
        prompt_parts.append("PROPS:")
        prop = assets["props"][0]
        prop_ref = image_refs.get("prop", "")
        prop_desc = f"Include {prop.get('name', 'the prop')}"
        if prop.get("description"):
            prop_desc += f" ({prop['description']})"
        if prop_ref:
            prop_desc += f" - use {prop_ref} as prop reference"
        prop_desc += "."
        prompt_parts.append(prop_desc)
        prompt_parts.append("")
    
    # CAMERA section
    prompt_parts.append("CAMERA:")
    camera_parts = []
    
    if shot.get("camera_angle"):
        camera_parts.append(f"{shot['camera_angle']} angle")
    if shot.get("camera_distance") or cut.get("override_camera_distance"):
        dist = cut.get("override_camera_distance") or shot.get("camera_distance")
        camera_parts.append(f"{dist} shot")
    if shot.get("lens_type"):
        camera_parts.append(f"shot with {shot['lens_type']} lens")
    
    if camera_parts:
        prompt_parts.append(", ".join(camera_parts) + ".")
    
    if shot.get("camera_movement"):
        prompt_parts.append(f"Camera movement: {shot['camera_movement']}.")
    if shot.get("depth_of_field"):
        prompt_parts.append(f"Depth of field: {shot['depth_of_field']}.")
    
    focus = cut.get("override_focus_point") or shot.get("focus_point")
    if focus:
        prompt_parts.append(f"Focus point: {focus}.")
    
    # Composition
    if shot.get("foreground") or shot.get("background"):
        if shot.get("foreground"):
            prompt_parts.append(f"Foreground: {shot['foreground']}.")
        if shot.get("background"):
            prompt_parts.append(f"Background: {shot['background']}.")
    prompt_parts.append("")
    
    # LIGHTING section
    lighting = resolve_inheritance(cut, shot, scene, brief, "lighting")
    if lighting:
        prompt_parts.append("LIGHTING:")
        prompt_parts.append(f"{lighting}.")
        if scene.get("lighting_color"):
            prompt_parts.append(f"Light color: {scene['lighting_color']}.")
        prompt_parts.append("")
    
    # STYLE section
    prompt_parts.append("STYLE:")
    style_parts = [art_style]
    
    color_palette = resolve_inheritance(cut, shot, scene, brief, "color_palette")
    if color_palette:
        style_parts.append(f"color palette: {color_palette}")
    if brief.get("render_quality"):
        style_parts.append(brief["render_quality"])
    
    prompt_parts.append(", ".join(style_parts) + ".")
    
    mood = resolve_inheritance(cut, shot, scene, brief, "mood")
    if mood:
        prompt_parts.append(f"Mood: {mood}.")
    if cut.get("beat_type"):
        prompt_parts.append(f"Emotional beat: {cut['beat_type']}.")
    prompt_parts.append("")
    
    prompt_parts.append("")
    
    # CONTINUITY section
    if "@Image4" in image_refs:
        prompt_parts.append("CONTINUITY:")
        prompt_parts.append(f"Use @Image4 as the absolute base for visual continuity (lighting, framing, and environment).")
        if cut.get("continuity_notes"):
            prompt_parts.append(f"Notes: {cut['continuity_notes']}.")
        prompt_parts.append("")
    
    # REFERENCE IMAGES legend
    if reference_images:
        prompt_parts.append("REFERENCE IMAGES PROVIDED:")
        for ref in reference_images:
            status = "✓" if ref["status"] == "ready" else "○ pending"
            prompt_parts.append(f"- {ref['ref']}: {ref['name']} ({ref['type']}) [{status}]")
    
    compiled_prompt = "\n".join(prompt_parts)
    
    reference_images = _prepend_style_anchor_ref(reference_images, project_id)
    return {
        "prompt": compiled_prompt,
        "reference_images": reference_images,
        "mode": "nano_banana_pro",
        "cut_id": cut_id,
        "scene_number": scene.get("scene_number"),
        "shot_number": shot.get("shot_number"),
        "cut_number": cut.get("cut_number"),
        "assets_used": {
            "characters": [c.get("name") for c in assets["characters"]],
            "locations": [l.get("name") for l in assets["locations"]],
            "props": [p.get("name") for p in assets["props"]],
        }
    }


@tool("compile_edit_prompt", description="Compile an image-to-image edit prompt for cuts >1.", tags=["generation", "write"])
def compile_edit_prompt(project_id: str, cut_id: str) -> Dict[str, Any]:
    """
    Compile an edit prompt for cut refinement.
    Used when cut_number > 1 (editing previous cut).
    """
    ctx = get_cut_context(project_id, cut_id)
    if "error" in ctx:
        return ctx
    
    cut = ctx["cut"]
    prev_cut = get_previous_cut(project_id, cut_id)
    assets = get_cut_assets(project_id, cut_id)
    
    prompt_parts = []
    
    # System instruction for edit mode
    # prompt_parts.append("[System] Edit mode. Preserve spatial relationships.")
    # prompt_parts.append("")
    
    # Edit directive
    # prompt_parts.append("[Edit]")
    # prompt_parts.append("Input Image A is the previous frame to edit.")
    
    # Use consolidated @ImageX format
    prompt_parts.append(f"AESTHETIC: Lore-consistent continuity edit.")
    prompt_parts.append(f"ACTION: {cut.get('action', '')}")
    
    if assets["characters"]:
        # prompt_parts.append("Image B is the character reference for face consistency.")
        prompt_parts.append(f"SUBJECT: Maintain @Image1 identity strictly.")
    
    prompt_parts.append("CONTINUITY: Use @Image4 as the base frame for pose and background consistency. Update the frame with the new action.")
    
    if cut.get("expression"):
        prompt_parts.append(f"EXPRESSION: {cut['expression']}")
    if cut.get("gesture"):
        prompt_parts.append(f"GESTURE: {cut['gesture']}")
    
    # What to lock
    spatial_lock = cut.get("spatial_lock", "Keep background, pose, and lighting same as @Image4.")
    prompt_parts.append(f"CONSTRAINT: {spatial_lock}")
    
    # Continuity notes
    if cut.get("continuity_notes"):
        prompt_parts.append(f"NOTES: {cut['continuity_notes']}")
    
    compiled_prompt = "\n".join(prompt_parts)
    
    # Unified reference_images format
    reference_images = []
    
    # Character @Image1
    if assets["characters"]:
        char_img = assets["characters"][0].get("image_url", "")
        if char_img:
            reference_images.append({
                "slot": 1,
                "ref": "@Image1",
                "type": "character",
                "name": assets["characters"][0].get("name"),
                "image_url": char_img,
                "status": "ready"
            })
            
    # Previous Cut @Image4
    if prev_cut:
        prev_img = prev_cut.get("generated_image_url")
        if prev_img:
            reference_images.append({
                "slot": 4,
                "ref": "@Image4",
                "type": "continuity",
                "name": f"Previous Cut {prev_cut.get('cut_number')}",
                "image_url": prev_img,
                "status": "ready"
            })
    
    reference_images = _prepend_style_anchor_ref(reference_images, project_id)
    return {
        "prompt": compiled_prompt,
        "reference_images": reference_images,
        "mode": "edit",
        "cut_id": cut_id,
        "prev_cut_id": prev_cut["id"] if prev_cut else None,
    }


# ============== REAL GENERATION ==============

@tool("generate_cut_image", description="Run the image generator for a cut and save the result.", tags=["generation", "write"])
def generate_cut_image(
    project_id: str, 
    cut_id: str, 
    prompt: str, 
    model: str = "gemini-3-pro-image",
    reference_images: Optional[List[Dict[str, Any]]] = None,
    mode: str = "text",
    aspect_ratio: str = "16:9"
) -> Dict[str, Any]:
    """
    Generate a real image for a cut and save to history.
    Routes between text-to-image and image-to-image based on mode.
    """
    from backend.services.gemini_image import generate_image_text_to_image, generate_image_image_to_image
    from datetime import datetime
    import json
    
    # If no reference images provided, try to compile them from cut context
    if reference_images is None:
        compiled = compile_shot_prompt(project_id, cut_id)
        if "reference_images" in compiled:
            reference_images = compiled["reference_images"]
            mode = compiled.get("mode", mode)

    # 1. Create Generation Request ID
    req_id = f"gen_cut_{uuid.uuid4().hex[:8]}"
    conn = db.get_connection()
    cursor = conn.cursor()
    
    # Insert 'pending' record
    cursor.execute("""
        INSERT INTO generation_requests (
            id, project_id, target_type, target_cut_id, prompt, model, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (req_id, project_id, 'cut', cut_id, prompt, model, 'generating'))
    conn.commit()
    conn.close()
    
    try:
        # 2. Call Generation Service
        # NEW PHILOSOPHY: Cuts are 99% I2I. 
        # Default to I2I/Edit model if ANY reference images exist (or if mode is explicitly set)
        is_i2i = (mode in ["edit", "i2i"]) or (reference_images and len(reference_images) > 0)
        
        if is_i2i:
            # Image to Image via Nano Banana Pro Edit
            # Base reference is often slot 4 (continuity) or slot 1 (character)
            base_ref_url = None
            if reference_images:
                # Prioritize @Image4 for continuity evolution
                base_ref_url = next((r["image_url"] for r in reference_images if r["slot"] == 4), None)
                if not base_ref_url:
                     # Fallback to any available reference (e.g. @Image1)
                     base_ref_url = next((r["image_url"] for r in reference_images if r["image_url"]), None)

            result = generate_image_image_to_image(
                prompt=prompt,
                reference_image_url=base_ref_url,
                model="nano-banana-pro-edit",
                strength=0.7, 
                num_images=1,
                reference_images=reference_images,
                aspect_ratio=aspect_ratio
            )
        else:
            # Pure Text to Image via Nano Banana Pro (only if zero references)
            result = generate_image_text_to_image(
                prompt=prompt,
                model=model,
                num_images=1,
                reference_images=reference_images,
                aspect_ratio=aspect_ratio
            )
        
        # 3. Update Request with Result
        conn = db.get_connection()
        cursor = conn.cursor()
        
        status = 'complete' if result['success'] else 'failed'
        output_url = result.get('image_url')
        error_msg = result.get('error')
        
        cursor.execute("""
            UPDATE generation_requests 
            SET status = ?, output_image_url = ?, error_message = ?, 
                completed_at = CURRENT_TIMESTAMP, cost_usd = ?
            WHERE id = ?
        """, (status, output_url, error_msg, result.get('cost_usd', 0), req_id))
        
        # 4. Auto-update Cut if successful (optional, but good UX for first gen)
        if result['success']:
            cursor.execute("""
                UPDATE cuts 
                SET generated_image_url = ?, generation_status = 'complete'
                WHERE id = ? AND (generated_image_url IS NULL OR generated_image_url = '')
            """, (output_url, cut_id))
            
        conn.commit()
        conn.close()
        
        return {
            "success": result['success'],
            "image_url": output_url,
            "request_id": req_id
        }
        
    except Exception as e:
        # Fail the request
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE generation_requests SET status = 'failed', error_message = ? WHERE id = ?", (str(e), req_id))
        conn.commit()
        conn.close()
        raise e



# ============== LEGACY / HELPERS ==============

@tool("generate_image_mock", description="Mock image generator for offline testing.", tags=["generation", "mock"])
def generate_image_mock(prompt: str, slots: Dict[str, str]) -> Dict[str, Any]:
    """
    Mock image generation - returns placeholder URL.
    Kept for backward compatibility / dev mode.
    """
    mock_id = uuid.uuid4().hex[:12]
    mock_url = f"https://placeholder.generated/{mock_id}.png"
    
    return {
        "success": True,
        "image_url": mock_url,
        "mock": True,
        "prompt_length": len(prompt),
        "slots_used": list(slots.keys()),
    }


@tool("save_cut_image", description="Persist a generated image URL onto a cut row.", tags=["generation", "write"])
def save_cut_image(project_id: str, cut_id: str, image_url: str) -> Dict[str, Any]:
    """Save generated image URL to cut (Helper)."""
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE cuts SET generated_image_url = ? WHERE id = ?
    """, (image_url, cut_id))
    conn.commit()
    conn.close()
    
    return {"success": True, "cut_id": cut_id, "image_url": image_url}


@tool("mark_cut_status", description="Update generation_status on a cut (pending|generating|complete|failed).", tags=["generation", "write"])
def mark_cut_status(project_id: str, cut_id: str, status: str, notes: str = "") -> Dict[str, Any]:
    """Update cut's generation status (Helper)."""
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE cuts SET generation_status = ?, generation_notes = ? WHERE id = ?
    """, (status, notes, cut_id))
    conn.commit()
    conn.close()
    
    return {"success": True, "cut_id": cut_id, "status": status}


@tool("get_asset_image", description="Return the active image URL for an asset (master or fallback).", tags=["generation", "read"])
def get_asset_image(project_id: str, asset_id: str) -> Optional[str]:
    """Get the image URL for an asset."""
    asset = assets_db.get_asset(asset_id)
    return asset.get("image_url") if asset else None


# ============== QA TOOLS ==============

@tool("compare_with_master", description="QA: compare a generated cut against character master refs (stub for vision check).", tags=["generation", "qa"])
def compare_with_master(project_id: str, cut_id: str) -> Dict[str, Any]:
    """
    Compare generated cut with master assets.
    Returns consistency check results.
    """
    ctx = get_cut_context(project_id, cut_id)
    assets = get_cut_assets(project_id, cut_id)
    
    # For now, return mock results
    # Real implementation would use vision model to compare
    return {
        "cut_id": cut_id,
        "has_image": bool(ctx["cut"].get("generated_image_url")),
        "character_count": len(assets["characters"]),
        "checks": {
            "face_match": "pending_vision_check",
            "wardrobe_match": "pending_vision_check",
            "lighting_match": "pending_vision_check",
        },
        "note": "Vision-based comparison not yet implemented"
    }


@tool("flag_issue", description="QA: flag a continuity issue on a cut.", tags=["generation", "qa"])
def flag_issue(project_id: str, cut_id: str, issue: str, severity: str = "minor") -> Dict[str, Any]:
    """Flag a continuity issue on a cut."""
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE cuts SET generation_notes = ?, generation_status = 'failed' WHERE id = ?
    """, (f"[{severity.upper()}] {issue}", cut_id))
    conn.commit()
    conn.close()
    
    return {"success": True, "cut_id": cut_id, "issue": issue, "severity": severity}


@tool("request_edit", description="QA: ask the renderer to redo a cut with edit_target/spatial_lock.", tags=["generation", "qa"])
def request_edit(project_id: str, cut_id: str, edit_target: str, spatial_lock: str = "") -> Dict[str, Any]:
    """Request an edit pass on a cut."""
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE cuts SET edit_target = ?, spatial_lock = ?, generation_status = 'pending' WHERE id = ?
    """, (edit_target, spatial_lock, cut_id))
    conn.commit()
    conn.close()
    
    return {"success": True, "cut_id": cut_id, "edit_requested": edit_target}


@tool("approve_cut", description="QA: mark a cut as approved.", tags=["generation", "qa"])
def approve_cut(project_id: str, cut_id: str) -> Dict[str, Any]:
    """Approve a cut after QA review."""
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE cuts SET generation_status = 'approved', generation_notes = 'QA approved' WHERE id = ?
    """, (cut_id,))
    conn.commit()
    conn.close()
    
    return {"success": True, "cut_id": cut_id, "status": "approved"}
