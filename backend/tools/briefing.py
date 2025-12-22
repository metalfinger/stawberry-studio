"""
Briefing Phase Tools
Tools for managing project briefs in Phase 1
"""
from backend import db


def get_brief(project_id: str) -> str:
    """
    Get the current brief status for a project.
    
    Args:
        project_id: The current project ID
    
    Returns:
        Brief details as formatted string
    """
    brief = db.get_brief(project_id)
    if not brief:
        return "No brief found for this project."
    
    return f"""Current Brief:
- Title: {brief.get('title') or '(not set)'}
- Logline: {brief.get('logline') or '(not set)'}
- Genre: {brief.get('genre') or '(not set)'}
- Visual Tags: {', '.join(brief.get('aesthetic_tags', [])) or '(none)'}
- Artist Refs: {', '.join(brief.get('artist_refs', [])) or '(none)'}"""


def update_brief(
    project_id: str,
    title: str = None,
    logline: str = None,
    genre: str = None,
    style: str = None,
    tone: str = None
) -> str:
    """
    Updates the project brief with new information.
    Call this whenever the user provides details about their project.
    
    Args:
        project_id: The current project ID
        title: The project title
        logline: A one-sentence summary of the story
        genre: The genre (e.g., Drama, Sci-Fi, Comedy)
        style: Visual style description (e.g., "realistic, blue-red tint, cinematic")
        tone: Emotional tone (e.g., "hopeful", "tense", "mysterious")
    
    Returns:
        Confirmation message with updated brief status
    """
    updates = {}
    if title: updates['title'] = title
    if logline: updates['logline'] = logline
    if genre: updates['genre'] = genre
    if style: updates['style'] = style
    if tone: updates['tone'] = tone
    
    if not updates:
        return "No updates provided."
    
    updated = db.update_brief(project_id, **updates)
    return f"✅ Brief updated! Title='{updated.get('title', '')}', Logline='{updated.get('logline', '')}', Genre='{updated.get('genre', '')}'"


def complete_briefing(project_id: str) -> str:
    """
    Completes the briefing phase and advances the project to BLUEPRINT.
    Only call this when Title, Logline, and Genre are all filled.
    
    Args:
        project_id: The current project ID
    
    Returns:
        Success or error message
    """
    brief = db.get_brief(project_id)
    if not brief:
        return "❌ Error: Project not found."
    
    missing = []
    if not brief['title']: missing.append("Title")
    if not brief['logline']: missing.append("Logline")
    if not brief['genre']: missing.append("Genre")
    
    if missing:
        return f"❌ Cannot complete briefing. Missing: {', '.join(missing)}"
    
    success = db.complete_briefing(project_id)
    if success:
        return "🎉 Briefing complete! Project advancing to BLUEPRINT phase. The Architect will take over."
    return "❌ Error advancing project."
