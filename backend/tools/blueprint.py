"""
Blueprint Phase Tools - Enhanced
Tools for managing scenes, shots, and cuts with cascading metadata
"""
import json
import uuid
from backend import db


# ============== SCENE TOOLS ==============

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


def add_scene(
    project_id: str,
    title: str,
    description: str = "",
    location: str = "",
    time_of_day: str = "",
    lighting: str = "",
    mood: str = ""
) -> str:
    """
    Add a new scene to the project. Scene metadata is inherited by its shots.
    
    Args:
        project_id: The current project ID
        title: Scene title (e.g., "Opening - City Night")
        description: What happens in this scene
        location: Where the scene takes place
        time_of_day: Time setting (Day, Night, Dawn, Dusk)
        lighting: Lighting style (natural, neon, candlelit)
        mood: Emotional tone (mysterious, tense, romantic)
    
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
        INSERT INTO scenes (id, project_id, scene_number, title, description, location, time_of_day, lighting, mood)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (scene_id, project_id, scene_number, title, description, location, time_of_day, lighting, mood))
    
    from datetime import datetime
    cursor.execute("UPDATE projects SET updated_at = ? WHERE id = ?",
                   (datetime.now().isoformat(), project_id))
    conn.commit()
    conn.close()
    
    return f"✅ Added **Scene {scene_number}: {title}** (ID: {scene_id})\n" + \
           f"   Location: {location or '—'} | Time: {time_of_day or '—'} | Mood: {mood or '—'}"


# ============== SHOT TOOLS ==============

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


def add_shot(
    scene_id: str,
    description: str,
    camera_angle: str = "",
    camera_movement: str = "",
    subject: str = "",
    composition: str = "",
    override_mood: str = None
) -> str:
    """
    Add a shot to a scene. Shots inherit scene metadata unless overridden.
    
    Args:
        scene_id: The scene to add the shot to
        description: What happens in this shot
        camera_angle: Wide, Medium, Close-up, Extreme Close-up, POV
        camera_movement: Static, Pan, Tilt, Dolly, Handheld, Crane
        subject: Main subject of the shot
        composition: Rule of thirds, centered, diagonal, symmetrical
        override_mood: Override scene mood for this shot only
    
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
        INSERT INTO shots (id, scene_id, shot_number, description, camera_angle, camera_movement, subject, composition, override_mood)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (shot_id, scene_id, shot_number, description, camera_angle, camera_movement, subject, composition, override_mood))
    
    conn.commit()
    conn.close()
    
    return f"✅ Added **Shot {shot_number}** (ID: {shot_id})\n" + \
           f"   {camera_angle or 'Camera TBD'} | {subject or 'Subject TBD'}\n" + \
           f"   {description}"


# ============== CUT TOOLS ==============

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


def add_cut(
    shot_id: str,
    action: str,
    story_description: str,
    dialogue: str = "",
    beat_type: str = "",
    transition: str = "cut"
) -> str:
    """
    Add a cut (edit point) to a shot. Cuts are rough storyboard level.

    Args:
        shot_id: The shot to add the cut to
        action: What happens in this cut (brief summary)
        story_description: **REQUIRED** Detailed storytelling intent (3-5 sentences) - what this moment
                          means narratively, emotionally, thematically. Must explain WHY this moment
                          matters for the story, not just WHAT happens. Written in STORY phase.
        dialogue: Any dialogue spoken
        beat_type: action, reaction, pause, reveal, transition
        transition: cut, fade, dissolve, wipe

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
        INSERT INTO cuts (id, shot_id, cut_number, action, story_description, dialogue, beat_type, transition)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (cut_id, shot_id, cut_number, action, story_description, dialogue, beat_type, transition))

    conn.commit()
    conn.close()

    return f"✅ Added **Cut {cut_number}** (ID: {cut_id})\n" + \
           f"   Action: {action}\n" + \
           (f"   Story: {story_description[:60]}...\n" if story_description else "") + \
           (f"   Dialogue: \"{dialogue}\"\n" if dialogue else "")


# ============== UPDATE/DELETE TOOLS ==============

def update_scene(scene_id: str, title: str = None, description: str = None, location: str = None, time_of_day: str = None, lighting: str = None, mood: str = None) -> str:
    """Update scene metadata."""
    updates = {}
    if title: updates['title'] = title
    if description: updates['description'] = description
    if location: updates['location'] = location
    if time_of_day: updates['time_of_day'] = time_of_day
    if lighting: updates['lighting'] = lighting
    if mood: updates['mood'] = mood
    
    if db.update_scene(scene_id, updates):
        return f"✅ Scene updated."
    return "❌ Failed to update scene."

def delete_scene(scene_id: str) -> str:
    """Delete a scene and all its contents."""
    if db.delete_scene(scene_id):
        return "✅ Scene deleted."
    return "❌ Failed to delete scene."

def delete_all_scenes(project_id: str) -> str:
    """Delete ALL scenes in the project. Use with caution!"""
    if db.delete_all_scenes(project_id):
        return "✅ All scenes deleted."
    return "❌ Failed to delete scenes."

def update_shot(shot_id: str, description: str = None, camera_angle: str = None, camera_movement: str = None, subject: str = None, composition: str = None) -> str:
    """Update shot metadata."""
    updates = {}
    if description: updates['description'] = description
    if camera_angle: updates['camera_angle'] = camera_angle
    if camera_movement: updates['camera_movement'] = camera_movement
    if subject: updates['subject'] = subject
    if composition: updates['composition'] = composition
    
    if db.update_shot(shot_id, updates):
        return "✅ Shot updated."
    return "❌ Failed to update shot."

def delete_shot(shot_id: str) -> str:
    """Delete a shot."""
    if db.delete_shot(shot_id):
        return "✅ Shot deleted."
    return "❌ Failed to delete shot."

def delete_all_shots(scene_id: str) -> str:
    """Delete ALL shots in a scene."""
    if db.delete_all_shots(scene_id):
        return "✅ All shots in scene deleted."
    return "❌ Failed to delete shots."

def update_cut(cut_id: str, action: str = None, story_description: str = None, dialogue: str = None, beat_type: str = None, transition: str = None) -> str:
    """Update cut metadata.

    Args:
        cut_id: The cut to update
        action: What happens in this cut
        story_description: Detailed storytelling intent (3-5 sentences)
        dialogue: Any dialogue spoken
        beat_type: action, reaction, pause, reveal, transition
        transition: cut, fade, dissolve, wipe
    """
    updates = {}
    if action: updates['action'] = action
    if story_description: updates['story_description'] = story_description
    if dialogue: updates['dialogue'] = dialogue
    if beat_type: updates['beat_type'] = beat_type
    if transition: updates['transition'] = transition

    if db.update_cut(cut_id, updates):
        return "✅ Cut updated."
    return "❌ Failed to update cut."

def delete_cut(cut_id: str) -> str:
    """Delete a cut."""
    if db.delete_cut(cut_id):
        return "✅ Cut deleted."
    return "❌ Failed to delete cut."

def delete_all_cuts(shot_id: str) -> str:
    """Delete ALL cuts in a shot."""
    if db.delete_all_cuts(shot_id):
        return "✅ All cuts in shot deleted."
    return "❌ Failed to delete cuts."



# ============== STRUCTURE TOOLS ==============

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


def complete_blueprint(project_id: str) -> str:
    """
    Complete the blueprint phase and advance to STORYBOARD.
    All scenes must have at least one shot.
    
    Args:
        project_id: The current project ID
    
    Returns:
        Success or error message
    """
    scenes = db.get_scenes(project_id)
    if not scenes:
        return "❌ Cannot complete: No scenes defined yet."
    
    for scene in scenes:
        shots = db.get_shots(scene['id'])
        if not shots:
            return f"❌ Cannot complete: Scene '{scene['title']}' has no shots."
    
    success = db.complete_blueprint(project_id)
    if success:
        return "🎉 Blueprint complete! Project advancing to STORYBOARD phase."
    return "❌ Error advancing project."
