"""
Enhanced Blueprint Tools with Cinematic Intelligence
Auto-infers visual storytelling metadata
"""
from google.adk.tools import tool
from backend import db
from backend.intelligence import get_inference_engine
import uuid


@tool
def add_scene_with_inference(
    project_id: str,
    scene_number: int,
    title: str,
    description: str,
    location: str = None,
    time_of_day: str = None,
    mood: str = None,
    auto_infer: bool = True
) -> dict:
    """
    Create a new scene with INTELLIGENT INFERENCE of cinematic metadata.

    Provide basic info (title, description) and the system infers:
    - Story purpose and narrative function
    - Emotional beats and character arcs
    - Visual approach (lighting, color, pacing)
    - Camera suggestions
    - Thematic focus
    - And more...

    Args:
        project_id: The project ID
        scene_number: Scene number in sequence
        title: Scene title
        description: What happens in this scene
        location: Where it takes place (optional - can be inferred)
        time_of_day: When it happens (optional - can be inferred)
        mood: Emotional tone (optional - can be inferred)
        auto_infer: Auto-fill rich metadata (default: True)

    Returns:
        Created scene with inferred metadata

    Example:
        add_scene_with_inference(
            project_id="...",
            scene_number=1,
            title="The Landing",
            description="Spacecraft descends through Mars atmosphere and touches down",
            auto_infer=True
        )

        System infers:
        - location: "Mars surface - rocky terrain" (from description)
        - time_of_day: "Golden hour" (cinematic choice for drama)
        - mood: "Isolation, anticipation" (from context)
        - lighting: "Harsh directional sunlight, long shadows"
        - story_purpose: "Establish setting and protagonist's isolation"
        - pacing_rhythm: "Slow, methodical - let it breathe"
        - camera_suggestions: ["Wide establishing shot", "Slow push-in", ...]
    """
    # Get brief for context
    brief = db.get_brief(project_id)

    # Get previous scenes for narrative flow
    existing_scenes = db.get_scenes(project_id)
    previous_scenes = [s for s in existing_scenes if s['scene_number'] < scene_number]

    # Create base scene first
    scene_id = f"scene_{uuid.uuid4().hex[:8]}"

    base_data = {
        'id': scene_id,
        'project_id': project_id,
        'scene_number': scene_number,
        'title': title,
        'description': description,
        'location': location or '',
        'time_of_day': time_of_day or '',
        'mood': mood or ''
    }

    # Run inference if requested
    inferred_data = {}
    camera_suggestions = []

    if auto_infer:
        try:
            engine = get_inference_engine()

            # Calculate total scenes (estimate if unknown)
            total_scenes = max([s['scene_number'] for s in existing_scenes] + [scene_number])

            # Infer metadata
            inferred = engine.infer_scene_metadata(
                scene_description=description,
                scene_number=scene_number,
                total_scenes=total_scenes,
                brief_context=brief,
                previous_scenes=previous_scenes
            )

            # Merge inferred data
            if not location and 'location_detail' in inferred:
                base_data['location'] = inferred.get('location_detail', '')[:100]  # Extract from detail

            if not time_of_day and 'lighting_motivation' in inferred:
                # Infer time from lighting
                lighting = inferred.get('lighting_motivation', '').lower()
                if 'golden' in lighting or 'sunset' in lighting:
                    base_data['time_of_day'] = 'Golden hour'
                elif 'harsh' in lighting or 'noon' in lighting:
                    base_data['time_of_day'] = 'Day'
                elif 'soft' in lighting or 'overcast' in lighting:
                    base_data['time_of_day'] = 'Overcast day'

            if not mood:
                base_data['mood'] = inferred.get('mood', '')

            # Add inferred fields (would be stored in scenes_v2 table)
            base_data['lighting'] = inferred.get('lighting_motivation', '')

            inferred_data = inferred
            camera_suggestions = inferred.get('camera_approach_suggestions', [])

        except Exception as e:
            inferred_data = {'error': f"Inference failed: {str(e)}"}

    # Create scene in database
    db.add_scene_raw(base_data)

    # Build response
    result = {
        "scene_id": scene_id,
        "scene_number": scene_number,
        "title": title,
        "description": description,
        **base_data
    }

    if inferred_data:
        result['_inferred'] = inferred_data

    if camera_suggestions:
        result['_camera_suggestions'] = camera_suggestions

    return result


@tool
def add_shot_with_inference(
    scene_id: str,
    shot_number: int,
    description: str,
    camera_angle: str = None,
    camera_movement: str = None,
    subject: str = None,
    auto_infer: bool = True
) -> dict:
    """
    Create a shot with CINEMATIC INTELLIGENCE.

    Provide basic description and the system infers:
    - Camera motivation and shot type names
    - Lens choice and character
    - Composition theory
    - Visual subtext and symbolic elements
    - Focus points and depth of field
    - Reference shots from cinema

    Args:
        scene_id: Parent scene UUID
        shot_number: Shot number in scene
        description: What happens in this shot
        camera_angle: Camera angle (optional - can be inferred)
        camera_movement: Camera movement (optional - can be inferred)
        subject: Main subject (optional - can be inferred)
        auto_infer: Auto-fill cinematic metadata (default: True)

    Returns:
        Created shot with inferred camera language
    """
    # Get scene context
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM scenes WHERE id = ?", (scene_id,))
    scene = dict(cursor.fetchone())
    conn.close()

    # Get shots in scene to know position
    existing_shots = db.get_shots(scene_id)
    total_shots = max([s['shot_number'] for s in existing_shots] + [shot_number])

    shot_id = f"shot_{uuid.uuid4().hex[:8]}"

    base_data = {
        'id': shot_id,
        'scene_id': scene_id,
        'shot_number': shot_number,
        'description': description,
        'camera_angle': camera_angle or '',
        'camera_movement': camera_movement or '',
        'subject': subject or ''
    }

    inferred_data = {}

    if auto_infer:
        try:
            engine = get_inference_engine()

            inferred = engine.infer_shot_metadata(
                shot_description=description,
                scene_context=scene,
                shot_number=shot_number,
                total_shots_in_scene=total_shots
            )

            # Apply inferences
            if not camera_angle:
                base_data['camera_angle'] = inferred.get('camera_angle', '')

            if not camera_movement:
                base_data['camera_movement'] = inferred.get('camera_movement', '')

            if not subject:
                base_data['subject'] = inferred.get('focus_point', '')  # Or extract from description

            # Store rich metadata
            base_data['composition'] = inferred.get('composition', '')

            inferred_data = inferred

        except Exception as e:
            inferred_data = {'error': f"Inference failed: {str(e)}"}

    # Create shot
    db.add_shot_raw(base_data)

    result = {
        "shot_id": shot_id,
        "shot_number": shot_number,
        "description": description,
        **base_data
    }

    if inferred_data:
        result['_inferred'] = inferred_data

    return result


@tool
def analyze_story_arc(project_id: str) -> dict:
    """
    Analyze the current story structure and provide intelligent feedback.

    Returns:
    - Tension curve analysis
    - Emotional journey mapping
    - Pacing assessment
    - Structural strengths and weaknesses
    - Specific improvement suggestions

    Use this to review the blueprint before completion.
    """
    brief = db.get_brief(project_id)
    scenes = db.get_scenes(project_id)

    if not scenes:
        return {"error": "No scenes to analyze"}

    try:
        engine = get_inference_engine()
        analysis = engine.analyze_narrative_arc(scenes, brief)

        return {
            "analysis": analysis,
            "scene_count": len(scenes),
            "recommendations": analysis.get('suggestions', [])
        }

    except Exception as e:
        return {"error": f"Analysis failed: {str(e)}"}


# Re-export original tools for backward compatibility
from backend.tools.blueprint import (
    get_scenes, update_scene, delete_scene,
    get_shots_for_scene, update_shot, delete_shot,
    get_cuts, add_cut, update_cut, delete_cut,
    get_full_blueprint, complete_blueprint
)
