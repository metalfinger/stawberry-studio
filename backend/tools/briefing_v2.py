"""
Enhanced Briefing Tools with Inference Intelligence
Auto-enriches metadata using LLM reasoning
"""
from google.adk.tools import tool
from backend import db
from backend.intelligence import get_inference_engine


@tool
def get_brief(project_id: str) -> dict:
    """
    Get the current project brief.

    Args:
        project_id: The project ID

    Returns:
        The current brief data
    """
    return db.get_brief(project_id) or {}


@tool
def update_brief(
    project_id: str,
    title: str = None,
    logline: str = None,
    genre: str = None,
    aesthetic_tags: list = None,
    artist_refs: list = None,
    auto_infer: bool = True
) -> dict:
    """
    Update the project brief. Now with INTELLIGENT INFERENCE!

    When you update basic fields (title, logline, genre), the system automatically
    infers rich creative metadata like visual style, emotional arc, pacing, etc.

    Args:
        project_id: The project ID
        title: Project title
        logline: One-sentence story description
        genre: Genre/category
        aesthetic_tags: Visual style keywords (optional)
        artist_refs: Film/director references (optional)
        auto_infer: If True, automatically infer rich metadata (default: True)

    Returns:
        Updated brief with inferred metadata

    Example:
        User says: "A video about discovering water on Mars"

        You call:
        update_brief(
            project_id="...",
            title="First Water",
            logline="A lone astronaut discovers evidence of water on Mars",
            genre="Sci-Fi",
            auto_infer=True
        )

        System automatically infers and adds:
        - creative_intent: "Create viral-worthy grounded sci-fi"
        - visual_identity: "Cinematic realism, Malick-style contemplation"
        - emotional_arc: "Isolation → Discovery → Hope"
        - color_theory: "Desaturated reds with ice blue accents"
        - reference_works: ["The Martian", "Interstellar landing scene"]
        - And more...
    """
    updates = {}
    if title is not None:
        updates['title'] = title
    if logline is not None:
        updates['logline'] = logline
    if genre is not None:
        updates['genre'] = genre
    if aesthetic_tags is not None:
        updates['aesthetic_tags'] = aesthetic_tags
    if artist_refs is not None:
        updates['artist_refs'] = artist_refs

    # Update basic fields first
    result = db.update_brief(project_id, **updates)

    # Auto-infer rich metadata if requested
    if auto_infer and (title or logline or genre):
        try:
            # Build context for inference
            current_brief = db.get_brief(project_id)
            user_input = f"{current_brief.get('title', '')} - {current_brief.get('logline', '')} ({current_brief.get('genre', '')})"

            # Run inference
            engine = get_inference_engine()
            inferred = engine.infer_brief_metadata(user_input)

            # Store inferred metadata (these would be additional columns in briefs_v2 table)
            # For now, we'll add a note about what was inferred
            inference_summary = f"""
🧠 INFERRED METADATA:

Creative Vision:
- Intent: {inferred.get('creative_intent', 'N/A')}
- Visual Identity: {inferred.get('visual_identity', 'N/A')}
- Cinematic Style: {inferred.get('cinematic_style', 'N/A')}

Story Approach:
- Structure: {inferred.get('story_structure', 'N/A')}
- Emotional Arc: {inferred.get('emotional_arc', 'N/A')}
- Themes: {', '.join(inferred.get('thematic_core', []))}

Visual Language:
- Pacing: {inferred.get('pacing_preference', 'N/A')}
- Color Theory: {inferred.get('color_theory', 'N/A')}
- Lighting: {inferred.get('lighting_philosophy', 'N/A')}

References:
{chr(10).join([f"- {ref}" for ref in inferred.get('reference_works', [])])}

Creative Suggestions:
{chr(10).join([f"- {sug}" for sug in inferred.get('suggestions', [])])}
"""

            result['_inferred_metadata'] = inference_summary
            result['_inferred_data'] = inferred

        except Exception as e:
            result['_inference_error'] = f"Inference failed: {str(e)}"

    return result


@tool
def complete_briefing(project_id: str) -> dict:
    """
    Complete the briefing phase and advance to STORY phase.

    Only call this when:
    - Title is set
    - Logline is set
    - Genre is set

    The system will automatically transition the project to STORY phase
    and prepare for story development with the Story Architect.

    Args:
        project_id: The project ID

    Returns:
        Success message with transition info
    """
    brief = db.get_brief(project_id)

    if not brief or not brief.get('title') or not brief.get('logline') or not brief.get('genre'):
        return {
            "error": "Brief incomplete",
            "missing": [
                "title" if not brief or not brief.get('title') else None,
                "logline" if not brief or not brief.get('logline') else None,
                "genre" if not brief or not brief.get('genre') else None
            ]
        }

    # Advance project phase
    db.update_project_phase(project_id, "STORY")

    return {
        "success": True,
        "message": "Brief locked! Transitioning to Story Development...",
        "next_phase": "STORY",
        "next_agent": "Story Architect",
        "brief_summary": {
            "title": brief['title'],
            "logline": brief['logline'],
            "genre": brief['genre']
        }
    }


@tool
def suggest_creative_directions(project_id: str, user_input: str) -> dict:
    """
    Generate creative direction suggestions based on user input.

    Use this when the user seems uncertain or wants ideas.

    Args:
        project_id: The project ID
        user_input: What the user said

    Returns:
        3-5 distinct creative direction suggestions

    Example:
        User: "I'm not sure how to approach the Mars landing visually"

        Result:
        {
            "suggestions": [
                "Go full Terrence Malick: Golden hour, whispered VO, macro dust...",
                "Ridley Scott realism: Gritty, used-future, handheld...",
                "Wong Kar-wai on Mars: Slow-mo, step-printed, saturated..."
            ]
        }
    """
    try:
        engine = get_inference_engine()
        suggestions = engine.suggest_creative_directions(user_input, context_type="brief")

        return {
            "suggestions": suggestions,
            "count": len(suggestions)
        }
    except Exception as e:
        return {
            "error": f"Failed to generate suggestions: {str(e)}",
            "suggestions": []
        }
