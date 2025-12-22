"""
Generation Phase Tools
Context gathering, prompt compilation, and image generation.
"""

import uuid
from typing import Dict, Any, List, Optional
from backend.database import core as db
from backend.database import shots as shots_db
from backend.database import assets as assets_db



# ============== CONTEXT TOOLS ==============

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


def compile_shot_prompt(project_id: str, cut_id: str) -> Dict[str, Any]:
    """
    Compile a Nano Banana Pro (Gemini 3 Pro Image) format prompt.
    Uses @Image1, @Image2 notation with detailed natural language.
    """
    ctx = get_cut_context(project_id, cut_id)
    if "error" in ctx:
        return ctx
    
    cut = ctx["cut"]
    shot = ctx["shot"]
    scene = ctx["scene"]
    brief = ctx["brief"]
    
    assets = get_cut_assets(project_id, cut_id)
    
    # Build reference image mapping
    # @Image1 = Primary Character
    # @Image2 = Location
    # @Image3 = Secondary Character (if any)
    # @Image4 = Prop (if any)
    reference_images = []
    image_refs = {}
    slot_num = 1
    
    # Characters
    for i, char in enumerate(assets["characters"][:2]):
        ref_key = f"@Image{slot_num}"
        reference_images.append({
            "slot": slot_num,
            "ref": ref_key,
            "type": "character",
            "name": char.get("name"),
            "asset_id": char.get("id"),
            "image_url": char.get("image_url"),
            "status": "ready" if char.get("image_url") else "pending"
        })
        image_refs[f"char_{i}"] = ref_key
        slot_num += 1
    
    # Location
    if assets["locations"]:
        loc = assets["locations"][0]
        ref_key = f"@Image{slot_num}"
        reference_images.append({
            "slot": slot_num,
            "ref": ref_key,
            "type": "location",
            "name": loc.get("name"),
            "asset_id": loc.get("id"),
            "image_url": loc.get("image_url") or scene.get("location_master_url"),
            "status": "ready" if (loc.get("image_url") or scene.get("location_master_url")) else "pending"
        })
        image_refs["location"] = ref_key
        slot_num += 1
    
    # Props
    if assets["props"]:
        prop = assets["props"][0]
        ref_key = f"@Image{slot_num}"
        reference_images.append({
            "slot": slot_num,
            "ref": ref_key,
            "type": "prop",
            "name": prop.get("name"),
            "asset_id": prop.get("id"),
            "image_url": prop.get("image_url"),
            "status": "ready" if prop.get("image_url") else "pending"
        })
        image_refs["prop"] = ref_key
        slot_num += 1
    
    # Build detailed natural language prompt
    prompt_parts = []
    
    # Opening - Genre and Style
    genre = brief.get("genre", "cinematic")
    art_style = resolve_inheritance(cut, shot, scene, brief, "art_style") or "photorealistic"
    prompt_parts.append(f"Create a {art_style} still from a {genre} film.")
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
    
    # REFERENCE IMAGES legend
    if reference_images:
        prompt_parts.append("REFERENCE IMAGES PROVIDED:")
        for ref in reference_images:
            status = "✓" if ref["status"] == "ready" else "○ pending"
            prompt_parts.append(f"- {ref['ref']}: {ref['name']} ({ref['type']}) [{status}]")
    
    compiled_prompt = "\n".join(prompt_parts)
    
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
    prompt_parts.append("[System] Edit mode. Preserve spatial relationships.")
    prompt_parts.append("")
    
    # Edit directive
    prompt_parts.append("[Edit]")
    prompt_parts.append("Input Image A is the previous frame to edit.")
    if assets["characters"]:
        prompt_parts.append("Image B is the character reference for face consistency.")
    prompt_parts.append("")
    
    # What to change
    if cut.get("edit_target"):
        prompt_parts.append(f"Target: {cut['edit_target']}")
    else:
        prompt_parts.append(f"Action: {cut.get('action', '')}")
        if cut.get("expression"):
            prompt_parts.append(f"New Expression: {cut['expression']}")
        if cut.get("gesture"):
            prompt_parts.append(f"New Gesture: {cut['gesture']}")
    
    # What to lock
    spatial_lock = cut.get("spatial_lock", "Keep background, pose, and lighting unchanged.")
    prompt_parts.append(f"Constraint: {spatial_lock}")
    
    # Continuity notes
    if cut.get("continuity_notes"):
        prompt_parts.append(f"Continuity: {cut['continuity_notes']}")
    
    compiled_prompt = "\n".join(prompt_parts)
    
    # Slots: Previous cut + Character master
    slots = {}
    if prev_cut and prev_cut.get("generated_image_url"):
        slots["A"] = prev_cut["generated_image_url"]
    if assets["characters"]:
        slots["B"] = assets["characters"][0].get("image_url", "")
    
    return {
        "prompt": compiled_prompt,
        "slots": slots,
        "mode": "edit",
        "cut_id": cut_id,
        "prev_cut_id": prev_cut["id"] if prev_cut else None,
    }


# ============== GENERATION (MOCK) ==============

def generate_image_mock(prompt: str, slots: Dict[str, str]) -> Dict[str, Any]:
    """
    Mock image generation - returns placeholder URL.
    Replace with real Gemini/Imagen API call later.
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


def save_cut_image(project_id: str, cut_id: str, image_url: str) -> Dict[str, Any]:
    """Save generated image URL to cut."""
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE cuts SET generated_image_url = ? WHERE id = ?
    """, (image_url, cut_id))
    conn.commit()
    conn.close()
    
    return {"success": True, "cut_id": cut_id, "image_url": image_url}


def mark_cut_status(project_id: str, cut_id: str, status: str, notes: str = "") -> Dict[str, Any]:
    """Update cut's generation status."""
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE cuts SET generation_status = ?, generation_notes = ? WHERE id = ?
    """, (status, notes, cut_id))
    conn.commit()
    conn.close()
    
    return {"success": True, "cut_id": cut_id, "status": status}


def get_asset_image(project_id: str, asset_id: str) -> Optional[str]:
    """Get the image URL for an asset."""
    asset = assets_db.get_asset(asset_id)
    return asset.get("image_url") if asset else None


# ============== QA TOOLS ==============

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
