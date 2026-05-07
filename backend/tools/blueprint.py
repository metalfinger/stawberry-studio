"""
Blueprint Phase Tools - Enhanced
Tools for managing scenes, shots, and cuts with cascading metadata
"""
import json
import uuid
from backend import db
from backend.database.core import mark_phases_stale
from backend.tools.registry import tool


# ============== SCENE TOOLS ==============

@tool("get_scenes", description="List all scenes for a project — returns formatted text with scene UUIDs.", tags=["blueprint"])
def get_scenes(project_id: str) -> str:
    """
    Get all scenes for a project with their metadata.
    
    Args:
        project_id: The current project ID
    
    Returns:
        List of scenes formatted as string
    """
    scenes = db.get_scenes(project_id)
    if not scenes:
        return "No scenes yet. Use add_scene to create the first scene."
    
    result = "📋 **Current Scenes:**\n"
    for s in scenes:
        result += f"\n**Scene {s['scene_number']}: {s['title']}** (ID: {s['id']})\n"
        result += f"  Description: {s['description'] or '—'}\n"
        result += f"  Location: {s['location'] or '—'} | Time: {s['time_of_day'] or '—'}\n"
        result += f"  Lighting: {s['lighting'] or '—'} | Mood: {s['mood'] or '—'}\n"
        shots = db.get_shots(s['id'])
        result += f"  Shots: {len(shots)}\n"
    return result


@tool("add_scene", description="Create a new scene with rich metadata (location, lighting, mood, etc.).", tags=["blueprint"])
def add_scene(
    project_id: str,
    title: str,
    description: str = "",
    # Location
    location: str = "",
    location_detail: str = "",
    time_of_day: str = "",
    # Atmosphere
    lighting: str = "",
    lighting_color: str = "",
    weather: str = "",
    atmosphere: str = "",
    mood: str = "",
    ambient_sound: str = "",
    # Overrides (scene-specific style changes)
    override_art_style: str = "",
    override_color_palette: str = "",
) -> str:
    """
    Add a new scene to the project. Scene metadata cascades to its shots and cuts.
    
    Args:
        project_id: The current project ID
        title: Scene title (e.g., "Opening - City Night")
        description: What happens in this scene (narrative summary)
        location: Where the scene takes place (e.g., "Moon Movie Set")
        location_detail: Specific details (e.g., "Center of the fake lunar surface, near flag")
        time_of_day: Time setting (Day, Night, Dawn, Dusk, "Timeless studio")
        lighting: Lighting source/style (e.g., "Single harsh spotlight from above")
        lighting_color: Color temperature (e.g., "Cool white, harsh shadows")
        weather: Weather conditions (e.g., "None - indoor studio", "Rainy")
        atmosphere: Atmospheric effects (e.g., "Dust motes in spotlight", "Fog")
        mood: Emotional tone (e.g., "Epic parody", "Tense", "Comedic")
        ambient_sound: Sound design cue (e.g., "Studio hum, distant crew chatter")
        override_art_style: Scene-specific style override (e.g., "Noir style for flashback")
        override_color_palette: Scene-specific color override (e.g., "Sepia tones")
    
    Returns:
        Confirmation with scene details
    """
    conn = db.get_connection()
    cursor = conn.cursor()
    
    # Get next scene number
    cursor.execute("SELECT MAX(scene_number) FROM scenes WHERE project_id = ?", (project_id,))
    max_num = cursor.fetchone()[0]
    scene_number = (max_num or 0) + 1
    
    scene_id = f"scene_{uuid.uuid4().hex[:8]}"
    cursor.execute("""
        INSERT INTO scenes (id, project_id, scene_number, title, description, 
                           location, location_detail, time_of_day, 
                           lighting, lighting_color, weather, atmosphere, mood, ambient_sound,
                           override_art_style, override_color_palette)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (scene_id, project_id, scene_number, title, description, 
          location, location_detail, time_of_day, 
          lighting, lighting_color, weather, atmosphere, mood, ambient_sound,
          override_art_style, override_color_palette))
    
    from datetime import datetime
    cursor.execute("UPDATE projects SET updated_at = ? WHERE id = ?",
                   (datetime.now().isoformat(), project_id))
    conn.commit()
    conn.close()

    # Mark downstream phases as stale
    mark_phases_stale(project_id, "STORY")

    return f"""✅ Added **Scene {scene_number}: {title}** (ID: {scene_id})
📍 Location: {location or '—'} | {location_detail or ''}
⏰ Time: {time_of_day or '—'} | 💡 Lighting: {lighting or '—'}
🌤️ Weather: {weather or '—'} | 🎭 Mood: {mood or '—'}
🔊 Ambient: {ambient_sound or '—'}"""


# ============== SHOT TOOLS ==============

@tool("get_shots_for_scene", description="List shots within a scene — returns shot UUIDs and descriptions.", tags=["blueprint"])
def get_shots_for_scene(scene_id: str) -> str:
    """
    Get all shots for a specific scene.
    
    Args:
        scene_id: The scene ID
    
    Returns:
        List of shots formatted as string
    """
    shots = db.get_shots(scene_id)
    if not shots:
        return f"No shots in this scene yet. Use add_shot to create shots."
    
    result = f"📷 **Shots in Scene:**\n"
    for shot in shots:
        cuts = db.get_cuts(shot['id']) if hasattr(db, 'get_cuts') else []
        result += f"\n**Shot {shot['shot_number']}** (ID: {shot['id']})\n"
        result += f"  {shot['description']}\n"
        result += f"  Camera: {shot['camera_angle'] or '—'} | Movement: {shot['camera_movement'] or '—'}\n"
        result += f"  Subject: {shot['subject'] or '—'} | Composition: {shot['composition'] or '—'}\n"
        result += f"  Cuts: {len(cuts)}\n"
    return result


@tool("add_shot", description="Create a shot inside a scene with camera + composition metadata.", tags=["blueprint"])
def add_shot(
    scene_id: str,
    description: str,
    # Camera
    camera_angle: str = "",
    camera_height: str = "",
    camera_movement: str = "",
    camera_distance: str = "",
    # Lens
    lens_type: str = "",
    depth_of_field: str = "",
    focus_point: str = "",
    # Composition
    subject: str = "",
    subject_position: str = "",
    composition: str = "",
    foreground: str = "",
    background: str = "",
    # Overrides
    override_mood: str = "",
    override_lighting: str = "",
    override_art_style: str = "",
) -> str:
    """
    Add a shot to a scene. Shots inherit scene metadata unless overridden.
    
    Args:
        scene_id: The scene to add the shot to
        description: What happens in this shot (action summary)
        camera_angle: Angle (e.g., "Low angle hero shot", "Eye level", "Bird's eye")
        camera_height: Height (e.g., "Ground level", "Shoulder height", "Overhead")
        camera_movement: Movement (e.g., "Static", "Dolly in", "Pan left", "Handheld")
        camera_distance: Distance (e.g., "Extreme close-up", "Close-up", "Medium", "Wide", "Extreme wide")
        lens_type: Lens choice (e.g., "Wide angle", "Normal", "Telephoto", "Fisheye")
        depth_of_field: DOF setting (e.g., "Shallow - subject isolated", "Deep - everything sharp")
        focus_point: What's in focus (e.g., "Character's eyes", "Flag in foreground")
        subject: Main subject (e.g., "Samurai Astronaut", "The Director")
        subject_position: Frame position (e.g., "Center", "Rule of thirds left", "Lower third")
        composition: Composition style (e.g., "Symmetrical", "Dynamic diagonal", "Frame within frame")
        foreground: What's in front (e.g., "Dust particles", "Boom mic visible")
        background: What's behind (e.g., "Studio lights visible", "Black void")
        override_mood: Override scene mood for this shot
        override_lighting: Override scene lighting for this shot
        override_art_style: Override project art style for this shot
    
    Returns:
        Confirmation with shot details
    """
    conn = db.get_connection()
    cursor = conn.cursor()
    
    # Get next shot number
    cursor.execute("SELECT MAX(shot_number) FROM shots WHERE scene_id = ?", (scene_id,))
    max_num = cursor.fetchone()[0]
    shot_number = (max_num or 0) + 1
    
    shot_id = f"shot_{uuid.uuid4().hex[:8]}"
    cursor.execute("""
        INSERT INTO shots (id, scene_id, shot_number, description, 
                          camera_angle, camera_height, camera_movement, camera_distance,
                          lens_type, depth_of_field, focus_point,
                          subject, subject_position, composition, foreground, background,
                          override_mood, override_lighting, override_art_style)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (shot_id, scene_id, shot_number, description, 
          camera_angle, camera_height, camera_movement, camera_distance,
          lens_type, depth_of_field, focus_point,
          subject, subject_position, composition, foreground, background,
          override_mood, override_lighting, override_art_style))
    
    conn.commit()
    conn.close()
    
    return f"""✅ Added **Shot {shot_number}** (ID: {shot_id})
📸 Camera: {camera_angle or 'TBD'} | {camera_distance or ''} | {camera_movement or 'Static'}
🎯 Subject: {subject or 'TBD'} @ {subject_position or 'center'}
🔍 Lens: {lens_type or 'Normal'} | DOF: {depth_of_field or 'TBD'}
📝 {description}"""


# ============== CUT TOOLS ==============

@tool("get_cuts", description="List cuts within a shot.", tags=["blueprint"])
def get_cuts(shot_id: str) -> str:
    """
    Get all cuts for a specific shot.
    
    Args:
        shot_id: The shot ID
    
    Returns:
        List of cuts formatted as string
    """
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM cuts WHERE shot_id = ? ORDER BY cut_number", (shot_id,))
    rows = cursor.fetchall()
    conn.close()
    
    if not rows:
        return "No cuts in this shot yet. Use add_cut to create cuts."
    
    result = "✂️ **Cuts:**\n"
    for cut in rows:
        c = dict(cut)
        result += f"\n**Cut {c['cut_number']}** (ID: {c['id']})\n"
        result += f"  Action: {c['action']}\n"
        if c.get('dialogue'):
            result += f"  Dialogue: \"{c['dialogue']}\"\n"
        result += f"  Beat: {c['beat_type'] or '—'} | Transition: {c['transition'] or 'cut'}\n"
    return result


@tool("add_cut", description="Create an action cut inside a shot.", tags=["blueprint"])
def add_cut(
    shot_id: str,
    action: str,
    story_description: str,
    # Character Action
    dialogue: str = "",
    expression: str = "",
    body_language: str = "",
    gesture: str = "",
    gaze_direction: str = "",
    # Beat & Timing
    beat_type: str = "",
    duration_hint: str = "",
    transition: str = "cut",
    # Continuity
    continuity_notes: str = "",
    character_state: str = "",
    object_tracking: str = "",
    lighting_continuity: str = "",
    # Overrides
    override_camera_distance: str = "",
    override_focus_point: str = "",
    override_lighting: str = "",
    override_mood: str = "",
    image_slots: str = "{}",
) -> str:
    """
    Add a cut (edit point) to a shot. Cuts are the atomic visual storytelling units.

    Args:
        shot_id: The shot to add the cut to
        action: What happens in this cut (brief summary, e.g., "Astronaut slams flag into ground")
        story_description: **REQUIRED** Detailed storytelling intent (3-5 sentences) - what this moment
                          means narratively, emotionally, thematically. Must explain WHY this moment
                          matters for the story, not just WHAT happens.
        dialogue: Any dialogue spoken (e.g., "KIAI!")
        expression: Facial expression (e.g., "Determined", "Shocked", "Subtle smirk")
        body_language: Physical state (e.g., "Tense and coiled", "Relaxed confidence")
        gesture: Specific gesture (e.g., "Thrusting flag downward", "Arms crossed")
        gaze_direction: Eye direction (e.g., "Down at flag", "Off-screen left", "Direct to camera")
        beat_type: Type of moment (e.g., "action", "reaction", "pause", "reveal", "transition")
        duration_hint: Timing guidance (e.g., "Quick - 0.5s", "Hold for 2s", "Slow motion")
        transition: Edit type (e.g., "cut", "fade", "dissolve", "wipe", "match cut")
        continuity_notes: Continuity reminders (e.g., "Same costume as prev cut", "Flag now planted")
        character_state: Emotional/physical state (e.g., "Exhausted but triumphant")
        object_tracking: Props to track (e.g., "Flag position - now vertical in ground")
        lighting_continuity: Light matching notes (e.g., "Same harsh spotlight from above")
        override_camera_distance: Override shot's camera distance for this cut
        override_focus_point: Override shot's focus for this cut
        override_lighting: Override scene lighting for this cut
        override_mood: Override scene mood for this cut

    Returns:
        Confirmation with cut details
    """
    conn = db.get_connection()
    cursor = conn.cursor()

    # Get next cut number
    cursor.execute("SELECT MAX(cut_number) FROM cuts WHERE shot_id = ?", (shot_id,))
    max_num = cursor.fetchone()[0]
    cut_number = (max_num or 0) + 1

    cut_id = f"cut_{uuid.uuid4().hex[:8]}"
    cursor.execute("""
        INSERT INTO cuts (id, shot_id, cut_number, action, story_description,
                         dialogue, expression, body_language, gesture, gaze_direction,
                         beat_type, duration_hint, transition,
                         continuity_notes, character_state, object_tracking, lighting_continuity,
                                                   override_camera_distance, override_focus_point, override_lighting, override_mood, image_slots)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (cut_id, shot_id, cut_number, action, story_description,
          dialogue, expression, body_language, gesture, gaze_direction,
          beat_type, duration_hint, transition,
          continuity_notes, character_state, object_tracking, lighting_continuity,
          override_camera_distance, override_focus_point, override_lighting, override_mood, image_slots))

    conn.commit()
    conn.close()

    return f"""✅ Added **Cut {cut_number}** (ID: {cut_id})
⚡ Action: {action}
😊 Expression: {expression or '—'} | 🎭 Body: {body_language or '—'} | 👁️ Gaze: {gaze_direction or '—'}
🎬 Beat: {beat_type or '—'} | ⏱️ Duration: {duration_hint or '—'} | ➡️ Transition: {transition}
📝 Story: {story_description[:60] + '...' if len(story_description) > 60 else story_description}"""


# ============== UPDATE/DELETE TOOLS ==============

@tool("update_scene", description="Update fields on an existing scene by UUID.", tags=["blueprint"])
def update_scene(
    scene_id: str,
    title: str = None,
    description: str = None,
    # Location
    location: str = None,
    location_detail: str = None,
    time_of_day: str = None,
    # Atmosphere
    lighting: str = None,
    lighting_color: str = None,
    weather: str = None,
    atmosphere: str = None,
    mood: str = None,
    ambient_sound: str = None,
    # Overrides
    override_art_style: str = None,
    override_color_palette: str = None,
    # Production Notes
    set_decoration: str = None,
    camera_restrictions: str = None,
    key_props_list: str = None,
    blocking_notes: str = None,
) -> str:
    """Update scene metadata with all available fields."""
    updates = {}
    if title: updates['title'] = title
    if description: updates['description'] = description
    if location: updates['location'] = location
    if location_detail: updates['location_detail'] = location_detail
    if time_of_day: updates['time_of_day'] = time_of_day
    if lighting: updates['lighting'] = lighting
    if lighting_color: updates['lighting_color'] = lighting_color
    if weather: updates['weather'] = weather
    if atmosphere: updates['atmosphere'] = atmosphere
    if mood: updates['mood'] = mood
    if ambient_sound: updates['ambient_sound'] = ambient_sound
    if override_art_style: updates['override_art_style'] = override_art_style
    if override_color_palette: updates['override_color_palette'] = override_color_palette
    if set_decoration: updates['set_decoration'] = set_decoration
    if camera_restrictions: updates['camera_restrictions'] = camera_restrictions
    if key_props_list: updates['key_props_list'] = key_props_list
    if blocking_notes: updates['blocking_notes'] = blocking_notes

    if db.update_scene(scene_id, updates):
        # Get project_id from scene and mark downstream phases as stale
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT project_id FROM scenes WHERE id = ?", (scene_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            mark_phases_stale(row['project_id'], "STORY")
        return f"✅ Scene updated with {len(updates)} fields."
    return "❌ Failed to update scene."

@tool("delete_scene", description="Delete a scene (cascades to its shots and cuts).", tags=["blueprint"])
def delete_scene(scene_id: str) -> str:
    """Delete a scene and all its contents."""
    if db.delete_scene(scene_id):
        return "✅ Scene deleted."
    return "❌ Failed to delete scene."

@tool("delete_all_scenes", description="Delete all scenes in a project.", tags=["blueprint"])
def delete_all_scenes(project_id: str) -> str:
    """Delete ALL scenes in the project. Use with caution!"""
    if db.delete_all_scenes(project_id):
        return "✅ All scenes deleted."
    return "❌ Failed to delete scenes."

@tool("update_shot", description="Update fields on an existing shot by UUID.", tags=["blueprint"])
def update_shot(
    shot_id: str,
    description: str = None,
    # Camera
    camera_angle: str = None,
    camera_height: str = None,
    camera_movement: str = None,
    camera_distance: str = None,
    # Lens
    lens_type: str = None,
    focal_length_mm: str = None,
    depth_of_field: str = None,
    focus_point: str = None,
    # Composition
    subject: str = None,
    subject_position: str = None,
    composition: str = None,
    foreground: str = None,
    background: str = None,
    # Overrides
    override_mood: str = None,
    override_lighting: str = None,
    override_art_style: str = None,
    # Effects
    aspect_ratio_override: str = None,
    filter_effects: str = None,
    speed_ramp: str = None,
) -> str:
    """Update shot metadata with all available fields."""
    updates = {}
    if description: updates['description'] = description
    if camera_angle: updates['camera_angle'] = camera_angle
    if camera_height: updates['camera_height'] = camera_height
    if camera_movement: updates['camera_movement'] = camera_movement
    if camera_distance: updates['camera_distance'] = camera_distance
    if lens_type: updates['lens_type'] = lens_type
    if focal_length_mm: updates['focal_length_mm'] = focal_length_mm
    if depth_of_field: updates['depth_of_field'] = depth_of_field
    if focus_point: updates['focus_point'] = focus_point
    if subject: updates['subject'] = subject
    if subject_position: updates['subject_position'] = subject_position
    if composition: updates['composition'] = composition
    if foreground: updates['foreground'] = foreground
    if background: updates['background'] = background
    if override_mood: updates['override_mood'] = override_mood
    if override_lighting: updates['override_lighting'] = override_lighting
    if override_art_style: updates['override_art_style'] = override_art_style
    if aspect_ratio_override: updates['aspect_ratio_override'] = aspect_ratio_override
    if filter_effects: updates['filter_effects'] = filter_effects
    if speed_ramp: updates['speed_ramp'] = speed_ramp

    if db.update_shot(shot_id, updates):
        # Get project_id from shot's scene and mark downstream phases as stale
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.project_id FROM scenes s
            JOIN shots sh ON s.id = sh.scene_id
            WHERE sh.id = ?
        """, (shot_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            mark_phases_stale(row['project_id'], "STORY")
        return f"✅ Shot updated with {len(updates)} fields."
    return "❌ Failed to update shot."

@tool("delete_shot", description="Delete a shot (cascades to its cuts).", tags=["blueprint"])
def delete_shot(shot_id: str) -> str:
    """Delete a shot."""
    if db.delete_shot(shot_id):
        return "✅ Shot deleted."
    return "❌ Failed to delete shot."

@tool("delete_all_shots", description="Delete all shots in a scene.", tags=["blueprint"])
def delete_all_shots(scene_id: str) -> str:
    """Delete ALL shots in a scene."""
    if db.delete_all_shots(scene_id):
        return "✅ All shots in scene deleted."
    return "❌ Failed to delete shots."

@tool("update_cut", description="Update fields on an existing cut by UUID.", tags=["blueprint"])
def update_cut(
    cut_id: str,
    action: str = None,
    story_description: str = None,
    # Character Action
    dialogue: str = None,
    expression: str = None,
    body_language: str = None,
    gesture: str = None,
    gaze_direction: str = None,
    # Beat & Timing
    beat_type: str = None,
    duration_hint: str = None,
    transition: str = None,
    # Continuity
    continuity_notes: str = None,
    character_state: str = None,
    object_tracking: str = None,
    lighting_continuity: str = None,
    # Overrides
    override_camera_distance: str = None,
    override_focus_point: str = None,
    override_lighting: str = None,
    override_mood: str = None,
    # Production Notes
    costume_notes: str = None,
    prop_interaction: str = None,
    emotional_arc: str = None,
    sfx_notes: str = None,
    music_cue: str = None,
    # Generation
    compiled_prompt: str = None,
    image_slots: str = None,
) -> str:
    """Update cut metadata with all available fields including compiled_prompt."""
    updates = {}
    if action: updates['action'] = action
    if story_description: updates['story_description'] = story_description
    if dialogue: updates['dialogue'] = dialogue
    if expression: updates['expression'] = expression
    if body_language: updates['body_language'] = body_language
    if gesture: updates['gesture'] = gesture
    if gaze_direction: updates['gaze_direction'] = gaze_direction
    if beat_type: updates['beat_type'] = beat_type
    if duration_hint: updates['duration_hint'] = duration_hint
    if transition: updates['transition'] = transition
    if continuity_notes: updates['continuity_notes'] = continuity_notes
    if character_state: updates['character_state'] = character_state
    if object_tracking: updates['object_tracking'] = object_tracking
    if lighting_continuity: updates['lighting_continuity'] = lighting_continuity
    if override_camera_distance: updates['override_camera_distance'] = override_camera_distance
    if override_focus_point: updates['override_focus_point'] = override_focus_point
    if override_lighting: updates['override_lighting'] = override_lighting
    if override_mood: updates['override_mood'] = override_mood
    if costume_notes: updates['costume_notes'] = costume_notes
    if prop_interaction: updates['prop_interaction'] = prop_interaction
    if emotional_arc: updates['emotional_arc'] = emotional_arc
    if sfx_notes: updates['sfx_notes'] = sfx_notes
    if music_cue: updates['music_cue'] = music_cue
    if compiled_prompt: updates['compiled_prompt'] = compiled_prompt
    if image_slots: updates['image_slots'] = image_slots

    if db.update_cut(cut_id, updates):
        # Get project_id from cut's hierarchy and mark downstream phases as stale
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.project_id FROM scenes s
            JOIN shots sh ON s.id = sh.scene_id
            JOIN cuts c ON sh.id = c.shot_id
            WHERE c.id = ?
        """, (cut_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            mark_phases_stale(row['project_id'], "STORY")
        return f"✅ Cut updated with {len(updates)} fields."
    return "❌ Failed to update cut."

@tool("delete_cut", description="Delete a cut.", tags=["blueprint"])
def delete_cut(cut_id: str) -> str:
    """Delete a cut."""
    if db.delete_cut(cut_id):
        return "✅ Cut deleted."
    return "❌ Failed to delete cut."

@tool("delete_all_cuts", description="Delete all cuts in a shot.", tags=["blueprint"])
def delete_all_cuts(shot_id: str) -> str:
    """Delete ALL cuts in a shot."""
    if db.delete_all_cuts(shot_id):
        return "✅ All cuts in shot deleted."
    return "❌ Failed to delete cuts."



# ============== STRUCTURE TOOLS ==============

@tool("get_full_blueprint", description="Return the entire blueprint (scenes -> shots -> cuts).", tags=["blueprint"])
def get_full_blueprint(project_id: str) -> str:
    """
    Get the complete blueprint hierarchy: Scenes → Shots → Cuts
    
    Args:
        project_id: The current project ID
    
    Returns:
        Full structure as formatted string
    """
    scenes = db.get_scenes(project_id)
    if not scenes:
        return "No scenes yet. Start by creating scenes with add_scene."
    
    result = "📖 **FULL BLUEPRINT**\n" + "="*40 + "\n"
    
    for scene in scenes:
        result += f"\n🎬 **SCENE {scene['scene_number']}: {scene['title']}**\n"
        result += f"   {scene['location'] or '?'} | {scene['time_of_day'] or '?'} | {scene['mood'] or '?'}\n"
        
        shots = db.get_shots(scene['id'])
        if not shots:
            result += "   (no shots)\n"
            continue
            
        for shot in shots:
            result += f"\n   📷 Shot {scene['scene_number']}.{shot['shot_number']}: {shot['camera_angle'] or '?'}\n"
            result += f"      {shot['description']}\n"
            
            # Get cuts
            conn = db.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM cuts WHERE shot_id = ? ORDER BY cut_number", (shot['id'],))
            cuts = [dict(row) for row in cursor.fetchall()]
            conn.close()
            
            for cut in cuts:
                result += f"      ✂️ Cut {cut['cut_number']}: {cut['action']}\n"
    
    return result


@tool("complete_blueprint", description="Validate the blueprint is ready and ASK the user to confirm advancing to ASSETS phase.", tags=["blueprint"])
def complete_blueprint(project_id: str) -> str:
    """
    Request to complete the blueprint phase - REQUIRES USER CONFIRMATION.
    This tool validates the structure is ready, then asks the user to confirm the phase transition.
    
    DO NOT proceed to the next phase without explicit user confirmation (e.g., "yes", "proceed", "confirm").
    
    Args:
        project_id: The current project ID
    
    Returns:
        Confirmation request or error message
    """
    scenes = db.get_scenes(project_id)
    if not scenes:
        return "❌ Cannot complete: No scenes defined yet."

    scene_stats = []
    total_shots = 0
    total_cuts = 0
    structural_problems: list[str] = []

    for scene in scenes:
        shots = db.get_shots(scene['id'])
        if not shots:
            structural_problems.append(f"Scene '{scene['title']}' has no shots.")
            continue

        scene_shot_count = len(shots)
        total_shots += scene_shot_count

        # Count cuts per scene + flag shotless cuts and missing shot_size.
        scene_cut_count = 0
        for shot in shots:
            conn = db.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM cuts WHERE shot_id = ?", (shot['id'],))
            cut_count = cursor.fetchone()[0]
            conn.close()
            scene_cut_count += cut_count
            if cut_count == 0:
                structural_problems.append(
                    f"Shot {shot.get('shot_number', shot['id'])} in '{scene['title']}' has no cuts."
                )
            if not (shot.get('shot_size') or '').strip():
                structural_problems.append(
                    f"Shot {shot.get('shot_number', shot['id'])} in '{scene['title']}' has no shot_size (wide / medium / close / etc.)."
                )
        total_cuts += scene_cut_count

        scene_stats.append(f"  - Scene {scene['scene_number']}: {scene['title']} ({scene_shot_count} shots, {scene_cut_count} cuts)")

    if structural_problems:
        return (
            "❌ Cannot complete blueprint — fix these structural gaps first:\n" +
            "\n".join(f"- {p}" for p in structural_problems) +
            "\n\nUse `update_shot` / `add_cut` to fix, then call `complete_blueprint` again."
        )
    
    # Build summary
    summary = f"""📖 **Blueprint Summary:**
**{len(scenes)} Scenes** | **{total_shots} Shots** | **{total_cuts} Cuts**

{chr(10).join(scene_stats)}"""
    
    return f"""✅ **Blueprint phase is ready to complete!**

{summary}

🚨 **CONFIRMATION REQUIRED:**
Are you ready to move to the **ASSETS** phase where we'll extract characters, locations, and props?

👉 **Please say "yes" or "proceed" to confirm**, or tell me what changes you'd like to make first."""


@tool("confirm_blueprint_complete", description="Actually advance to ASSETS phase. Call only after explicit user confirmation.", tags=["blueprint"])
def confirm_blueprint_complete(project_id: str) -> str:
    """
    Actually complete the blueprint and transition to ASSETS phase.
    ONLY call this AFTER the user has explicitly confirmed (said "yes", "proceed", "confirm", etc.)
    
    Args:
        project_id: The current project ID
    
    Returns:
        Success or error message
    """
    scenes = db.get_scenes(project_id)
    if not scenes:
        return "❌ Cannot complete: No scenes defined yet."

    # Mirror complete_blueprint's structural checks to keep the gates aligned.
    problems: list[str] = []
    for scene in scenes:
        shots = db.get_shots(scene['id'])
        if not shots:
            problems.append(f"Scene '{scene['title']}' has no shots.")
            continue
        for shot in shots:
            conn = db.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM cuts WHERE shot_id = ?", (shot['id'],))
            cut_count = cursor.fetchone()[0]
            conn.close()
            if cut_count == 0:
                problems.append(f"Shot {shot.get('shot_number')} in '{scene['title']}' has no cuts.")
            if not (shot.get('shot_size') or '').strip():
                problems.append(f"Shot {shot.get('shot_number')} in '{scene['title']}' has no shot_size.")
    if problems:
        return "❌ Refusing to advance:\n" + "\n".join(f"- {p}" for p in problems)

    success = db.complete_blueprint(project_id)
    if success:
        return "🎉 Blueprint complete! Project advancing to ASSETS phase. The Asset Analyst will take over."
    return "❌ Error advancing project."

