"""
Navigation Tools for Berry Orchestrator
Handles phase switching and project status tracking
"""
from backend import db
from backend.tools.registry import tool


@tool("get_project_status", description="Project state: phase, completion %, asset/scene counts.", tags=["navigation", "read"])
def get_project_status(project_id: str) -> dict:
    """
    Get comprehensive project status including phase progress and stale indicators.

    Args:
        project_id: The project ID

    Returns:
        Full project status with:
        - current_phase: Active phase
        - stale_phases: List of phases needing refresh
        - progress: Completion status of each phase
    """
    project = db.get_project(project_id)
    if not project:
        return {"error": "Project not found"}

    brief = db.get_brief(project_id)
    scenes = db.get_scenes(project_id)
    assets = db.get_assets(project_id)
    stale_phases = db.get_stale_phases(project_id)

    # Calculate completion status for each phase
    brief_complete = bool(brief and brief.get('title') and brief.get('logline') and brief.get('genre'))

    # Story complete if at least one scene with shots exists
    story_complete = False
    if scenes:
        for scene in scenes:
            shots = db.get_shots_for_scene(scene['id'])
            if shots:
                story_complete = True
                break

    # Assets complete if at least one asset exists
    assets_complete = len(assets) > 0 if assets else False

    # Generate complete if any cuts have generated images
    generate_complete = False
    if scenes:
        for scene in scenes:
            shots = db.get_shots_for_scene(scene['id'])
            for shot in shots:
                cuts = db.get_cuts(shot['id'])
                for cut in cuts:
                    if cut.get('generated_image_url'):
                        generate_complete = True
                        break

    return {
        "project_id": project_id,
        "project_name": project.get("name", "Untitled"),
        "current_phase": project.get("current_phase", "BRIEF"),
        "stale_phases": stale_phases,
        "progress": {
            "BRIEF": {
                "complete": brief_complete,
                "stale": "BRIEF" in stale_phases,
                "data": {
                    "title": brief.get('title') if brief else None,
                    "logline": brief.get('logline') if brief else None,
                    "genre": brief.get('genre') if brief else None
                }
            },
            "STORY": {
                "complete": story_complete,
                "stale": "STORY" in stale_phases,
                "data": {
                    "scene_count": len(scenes) if scenes else 0
                }
            },
            "ASSETS": {
                "complete": assets_complete,
                "stale": "ASSETS" in stale_phases,
                "data": {
                    "asset_count": len(assets) if assets else 0
                }
            },
            "GENERATE": {
                "complete": generate_complete,
                "stale": "GENERATE" in stale_phases,
                "data": {}
            }
        }
    }


@tool("switch_phase", description="Switch the active phase (does not delete data — just navigation).", tags=["navigation"])
def switch_phase(project_id: str, target_phase: str) -> dict:
    """
    Switch to a different phase for viewing/editing.
    This allows the user to go back to previous phases and make changes.

    Args:
        project_id: The project ID
        target_phase: The phase to switch to (BRIEF, STORY, ASSETS, GENERATE)

    Returns:
        Success status and phase info
    """
    valid_phases = ["BRIEF", "STORY", "ASSETS", "GENERATE"]
    target_phase = target_phase.upper()

    if target_phase not in valid_phases:
        return {
            "error": f"Invalid phase: {target_phase}",
            "valid_phases": valid_phases
        }

    project = db.get_project(project_id)
    if not project:
        return {"error": "Project not found"}

    old_phase = project.get("current_phase", "BRIEF")
    stale_phases = db.get_stale_phases(project_id)

    # Update phase
    db.update_project_phase(project_id, target_phase)

    return {
        "success": True,
        "previous_phase": old_phase,
        "current_phase": target_phase,
        "is_stale": target_phase in stale_phases,
        "stale_phases": stale_phases,
        "message": f"Switched from {old_phase} to {target_phase}" + (
            f" (Note: {target_phase} is marked as stale due to upstream changes)"
            if target_phase in stale_phases else ""
        )
    }


@tool("get_stale_status", description="Which phases are flagged stale due to upstream changes.", tags=["navigation", "read"])
def get_stale_status(project_id: str) -> dict:
    """
    Get detailed stale status for all phases.
    Use this to understand what needs to be refreshed.

    Args:
        project_id: The project ID

    Returns:
        Stale status with explanation
    """
    stale_phases = db.get_stale_phases(project_id)
    project = db.get_project(project_id)

    if not project:
        return {"error": "Project not found"}

    phase_explanations = {
        "STORY": "Story structure may not reflect recent brief changes",
        "ASSETS": "Assets may not match current story structure",
        "GENERATE": "Generated images may not reflect current assets or story"
    }

    stale_info = []
    for phase in stale_phases:
        stale_info.append({
            "phase": phase,
            "reason": phase_explanations.get(phase, "Upstream data has changed"),
            "action": f"Review and update {phase} phase content"
        })

    return {
        "project_id": project_id,
        "current_phase": project.get("current_phase", "BRIEF"),
        "has_stale_phases": len(stale_phases) > 0,
        "stale_phases": stale_phases,
        "details": stale_info,
        "recommendation": (
            "Consider reviewing stale phases before generating final outputs"
            if stale_phases else "All phases are up to date"
        )
    }


@tool("refresh_phase", description="Clear stale flag on a phase after re-validating its content.", tags=["navigation"])
def refresh_phase(project_id: str, phase: str) -> dict:
    """
    Mark a phase as refreshed (no longer stale).
    Call this after reviewing and updating content in a stale phase.

    Args:
        project_id: The project ID
        phase: The phase to mark as refreshed

    Returns:
        Updated stale status
    """
    valid_phases = ["BRIEF", "STORY", "ASSETS", "GENERATE"]
    phase = phase.upper()

    if phase not in valid_phases:
        return {
            "error": f"Invalid phase: {phase}",
            "valid_phases": valid_phases
        }

    remaining_stale = db.clear_stale_phase(project_id, phase)

    return {
        "success": True,
        "refreshed_phase": phase,
        "remaining_stale_phases": remaining_stale,
        "message": f"{phase} phase marked as refreshed" + (
            f". Still stale: {', '.join(remaining_stale)}" if remaining_stale else ""
        )
    }


@tool("get_phase_progress", description="Progress per phase (artifacts present / required).", tags=["navigation", "read"])
def get_phase_progress(project_id: str) -> dict:
    """
    Get checklist-style progress for the current phase.
    Returns items that are done vs missing, and whether user can advance.

    Args:
        project_id: The project ID

    Returns:
        Progress data with items, completion status, and blockers
    """
    project = db.get_project(project_id)
    if not project:
        return {"error": "Project not found"}

    current_phase = project.get("current_phase", "BRIEF")
    brief = db.get_brief(project_id)
    scenes = db.get_scenes(project_id)
    assets = db.get_assets(project_id)

    if current_phase == "BRIEF":
        items = [
            {
                "name": "Title",
                "done": bool(brief and brief.get('title')),
                "value": brief.get('title') if brief else None
            },
            {
                "name": "Logline",
                "done": bool(brief and brief.get('logline')),
                "value": brief.get('logline') if brief else None
            },
            {
                "name": "Genre",
                "done": bool(brief and brief.get('genre')),
                "value": brief.get('genre') if brief else None
            },
            {
                "name": "Style",
                "done": bool(brief and brief.get('art_style')),
                "value": brief.get('art_style') if brief else None
            }
        ]
        # Required: title, logline, genre
        required_done = all(item['done'] for item in items[:3])
        blocking = [item['name'] for item in items[:3] if not item['done']]

    elif current_phase == "STORY":
        scene_count = len(scenes) if scenes else 0
        shot_count = 0
        cut_count = 0

        if scenes:
            for scene in scenes:
                shots = db.get_shots_for_scene(scene['id'])
                shot_count += len(shots) if shots else 0
                for shot in shots:
                    cuts = db.get_cuts(shot['id'])
                    cut_count += len(cuts) if cuts else 0

        items = [
            {
                "name": "Scenes",
                "done": scene_count > 0,
                "value": f"{scene_count} scenes" if scene_count else None
            },
            {
                "name": "Shots",
                "done": shot_count > 0,
                "value": f"{shot_count} shots" if shot_count else None
            },
            {
                "name": "Cuts",
                "done": cut_count > 0,
                "value": f"{cut_count} cuts" if cut_count else None
            }
        ]
        required_done = scene_count > 0 and shot_count > 0
        blocking = []
        if scene_count == 0:
            blocking.append("At least one scene")
        if shot_count == 0:
            blocking.append("At least one shot")

    elif current_phase == "ASSETS":
        characters = [a for a in assets if a.get('asset_type') == 'character'] if assets else []
        locations = [a for a in assets if a.get('asset_type') == 'location'] if assets else []
        props = [a for a in assets if a.get('asset_type') == 'prop'] if assets else []

        items = [
            {
                "name": "Characters",
                "done": len(characters) > 0,
                "value": f"{len(characters)} characters" if characters else None
            },
            {
                "name": "Locations",
                "done": len(locations) > 0,
                "value": f"{len(locations)} locations" if locations else None
            },
            {
                "name": "Props",
                "done": len(props) > 0,
                "value": f"{len(props)} props" if props else None
            }
        ]
        # Require at least characters or locations
        required_done = len(characters) > 0 or len(locations) > 0
        blocking = []
        if not required_done:
            blocking.append("At least one character or location")

    elif current_phase == "GENERATE":
        # Count cuts with generated images
        generated_count = 0
        total_cuts = 0

        if scenes:
            for scene in scenes:
                shots = db.get_shots_for_scene(scene['id'])
                for shot in shots:
                    cuts = db.get_cuts(shot['id'])
                    for cut in cuts:
                        total_cuts += 1
                        if cut.get('generated_image_url'):
                            generated_count += 1

        items = [
            {
                "name": "Images Generated",
                "done": generated_count > 0,
                "value": f"{generated_count}/{total_cuts} cuts" if total_cuts else "No cuts to generate"
            }
        ]
        required_done = generated_count > 0
        blocking = ["Generate at least one image"] if not required_done else []

    else:
        items = []
        required_done = False
        blocking = ["Unknown phase"]

    return {
        "phase": current_phase,
        "items": items,
        "can_advance": required_done,
        "blocking": blocking
    }
