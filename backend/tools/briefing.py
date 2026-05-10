"""
Briefing Phase Tools
Tools for managing project briefs in Phase 1
"""
from backend import db
from backend import db
mark_phases_stale = db.mark_phases_stale
from backend.tools.registry import tool


@tool("get_brief", description="Read the current brief for a project, including all visual style and world fields.", tags=["brief", "read"])
def get_brief(project_id: str) -> str:
    """
    Get the current brief status for a project with ALL fields.
    
    Args:
        project_id: The current project ID
    
    Returns:
        Brief details as formatted string with full context
    """
    brief = db.get_brief(project_id)
    if not brief:
        return "No brief found for this project."
    
    import json as _json
    try:
        palette_hex = _json.loads(brief.get('palette_hex') or '[]')
    except Exception:
        palette_hex = []
    try:
        style_tokens = _json.loads(brief.get('style_tokens') or '[]')
    except Exception:
        style_tokens = []
    palette_str = ", ".join(palette_hex) if palette_hex else '(not compiled — locked at BRIEF→STORY handoff)'
    tokens_str = "\n  - " + "\n  - ".join(style_tokens) if style_tokens else '(not compiled)'

    return f"""📋 CURRENT BRIEF (Full Context)

## Core Identity
- **Title:** {brief.get('title') or '(not set)'}
- **Logline:** {brief.get('logline') or '(not set)'}
- **Genre:** {brief.get('genre') or '(not set)'}
- **Tone:** {brief.get('tone') or '(not set)'}

## Visual Style (CRITICAL FOR GENERATION)
- **Art Style:** {brief.get('art_style') or '⚠️ NOT SET - Ask user!'}
- **Color Palette:** {brief.get('color_palette') or '(not set)'}
- **Lighting Style:** {brief.get('lighting_style') or '(not set)'}
- **Aspect Ratio:** {brief.get('aspect_ratio') or '16:9'}
- **Render Quality:** {brief.get('render_quality') or '(not set)'}

## Style Bible (compiled — quote these verbatim in every asset prompt)
- **Palette (hex):** {palette_str}
- **Style tokens:**{tokens_str}
- **Lighting rules:** {brief.get('lighting_rules') or '(not compiled)'}

## World Rules
- **World Logic:** {brief.get('world_logic') or '(not set)'}
- **Era/Setting:** {brief.get('era_setting') or '(not set)'}

## Audience & Themes
- **Target Audience:** {brief.get('target_audience') or '(not set)'}
- **Key Themes:** {brief.get('key_themes') or '(not set)'}
"""


@tool("update_brief", description="Patch fields on a project's brief. Pass only the fields you want to change.", tags=["brief", "write"])
def update_brief(
    project_id: str,
    title: str = None,
    logline: str = None,
    genre: str = None,
    # Visual Style (Critical for Generation)
    art_style: str = None,
    color_palette: str = None,
    lighting_style: str = None,
    aspect_ratio: str = None,
    render_quality: str = None,
    # World & Tone
    world_logic: str = None,
    era_setting: str = None,
    tone: str = None,
    # Audience & Themes
    target_audience: str = None,
    key_themes: str = None,
    # References & Inspiration (NEW)
    reference_films: str = None,
    reference_artists: str = None,
    negative_prompts: str = None,
    # Design Notes (NEW)
    character_design_notes: str = None,
    environment_design_notes: str = None,
) -> str:
    """
    Updates the project brief with comprehensive information.
    Call this whenever the user provides details about their project.
    
    Args:
        project_id: The current project ID
        title: The project name
        logline: A one-sentence summary of the story
        genre: The category (e.g., Drama, Sci-Fi, Comedy)
        art_style: Visual rendering style (e.g., "Ben 10 Anime", "Pixar 3D", "Realistic")
        color_palette: Color scheme description (e.g., "Neon greens, deep blacks")
        lighting_style: Default lighting approach (e.g., "Harsh stage lighting", "Golden hour")
        aspect_ratio: Frame aspect ratio (e.g., "16:9", "2.39:1", "1:1")
        render_quality: Quality level (e.g., "Draft", "Production", "4K")
        world_logic: Universe rules (e.g., "Fake moon set comedy", "Animals can talk")
        era_setting: Time period (e.g., "Modern", "Medieval", "Futuristic")
        tone: Emotional tone (e.g., "Hopeful", "Tense", "Comedic")
        target_audience: Who is this for (e.g., "Kids 6-12", "Adults", "General")
        key_themes: Main themes (e.g., "Friendship, Sacrifice, Redemption")
        reference_films: Visual references (e.g., "Ben 10: Alien Force, Samurai Jack")
        reference_artists: Artist references (e.g., "Genndy Tartakovsky, Studio Trigger")
        negative_prompts: What to avoid (e.g., "No photorealism, no 3D renders")
        character_design_notes: Global character style (e.g., "Bold outlines, exaggerated proportions")
        environment_design_notes: Global environment style (e.g., "Flat colors, geometric shapes")
    
    Returns:
        Confirmation message with updated brief status
    """
    updates = {}
    if title: updates['title'] = title
    if logline: updates['logline'] = logline
    if genre: updates['genre'] = genre
    if art_style: updates['art_style'] = art_style
    if color_palette: updates['color_palette'] = color_palette
    if lighting_style: updates['lighting_style'] = lighting_style
    if aspect_ratio: updates['aspect_ratio'] = aspect_ratio
    if render_quality: updates['render_quality'] = render_quality
    if world_logic: updates['world_logic'] = world_logic
    if era_setting: updates['era_setting'] = era_setting
    if tone: updates['tone'] = tone
    if target_audience: updates['target_audience'] = target_audience
    if key_themes: updates['key_themes'] = key_themes
    if reference_films: updates['reference_films'] = reference_films
    if reference_artists: updates['reference_artists'] = reference_artists
    if negative_prompts: updates['negative_prompts'] = negative_prompts
    if character_design_notes: updates['character_design_notes'] = character_design_notes
    if environment_design_notes: updates['environment_design_notes'] = environment_design_notes
    
    if not updates:
        return "No updates provided."

    updated = db.update_brief(project_id, **updates)

    # Mark downstream phases as stale when brief changes
    stale = mark_phases_stale(project_id, "BRIEF")
    stale_msg = f" (Downstream phases marked stale: {', '.join(stale)})" if stale else ""

    # Invalidate the style bible + anchor when STYLE-RELEVANT fields change.
    # Without this, an edit to art_style / color_palette / lighting_style /
    # world_logic leaves the OLD bible + OLD anchor pinned, which silently
    # diverges from what the user just typed.
    style_keys = {"art_style", "color_palette", "lighting_style",
                  "world_logic", "era_setting", "negative_prompts"}
    if any(k in updates for k in style_keys):
        try:
            conn = db.get_connection()
            cur = conn.cursor()
            cur.execute(
                "UPDATE briefs SET palette_hex = '[]', style_tokens = '[]', "
                "lighting_rules = '' WHERE project_id = ?",
                (project_id,),
            )
            cur.execute(
                "UPDATE continuity_bible SET style_anchor_url = '' "
                "WHERE project_id = ?",
                (project_id,),
            )
            cur.execute(
                "UPDATE reference_pool SET is_active = 0 "
                "WHERE project_id = ? AND is_style_anchor = 1 AND is_active = 1",
                (project_id,),
            )
            conn.commit()
            conn.close()
            stale_msg += " · style bible + anchor invalidated (run 🛠️ Consistency to recompile)"
        except Exception:
            pass

    # Build summary of what was set
    set_fields = [f"{k}='{v[:30]}...'" if len(str(v)) > 30 else f"{k}='{v}'" for k, v in updates.items()]
    return f"✅ Brief updated! {', '.join(set_fields)}{stale_msg}"


@tool("complete_briefing", description="Validate the brief is ready and ASK the user for confirmation to advance to STORY phase. Does not actually transition.", tags=["brief", "phase"])
def complete_briefing(project_id: str) -> str:
    """
    Request to complete the briefing phase - REQUIRES USER CONFIRMATION.
    This tool validates the brief is ready, then asks the user to confirm the phase transition.
    
    DO NOT proceed to the next phase without explicit user confirmation (e.g., "yes", "proceed", "confirm").
    
    Args:
        project_id: The current project ID
    
    Returns:
        Confirmation request or error message
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
    
    # Build summary of what's captured
    summary = f"""📋 **Brief Summary:**
- **Title:** {brief.get('title')}
- **Logline:** {brief.get('logline')}
- **Genre:** {brief.get('genre')}
- **Art Style:** {brief.get('art_style') or '(not set)'}
- **Tone:** {brief.get('tone') or '(not set)'}"""
    
    return f"""✅ **Briefing phase is ready to complete!**

{summary}

🚨 **CONFIRMATION REQUIRED:**
Are you ready to move to the **STORY** phase where we'll plan scenes and shots?

👉 **Please say "yes" or "proceed" to confirm**, or tell me what changes you'd like to make first."""


@tool("confirm_briefing_complete", description="Actually advance the project to STORY phase. Call ONLY after the user has explicitly confirmed.", tags=["brief", "phase"])
async def confirm_briefing_complete(project_id: str) -> str:
    """
    Actually complete the briefing and transition to STORY phase.
    ONLY call this AFTER the user has explicitly confirmed (said "yes", "proceed", "confirm", etc.)

    Async because we await the style-bible + style-anchor compilation
    on the SAME event loop as the chat WS. The earlier threaded approach
    was creating a new loop in a daemon thread, but pydantic_ai / aiosqlite
    cache async clients globally — those clients got bound to the thread's
    loop, then when the main loop tried to reuse them on the next chat
    turn we hit "Event loop is closed".

    Args:
        project_id: The current project ID

    Returns:
        Success or error message
    """
    brief = db.get_brief(project_id)
    if not brief:
        return "❌ Error: Project not found."

    missing = []
    if not (brief.get('title') or '').strip(): missing.append("Title")
    if not (brief.get('logline') or '').strip(): missing.append("Logline")
    if not (brief.get('genre') or '').strip(): missing.append("Genre")
    if not (brief.get('art_style') or '').strip(): missing.append("Art Style")

    if missing:
        return (
            f"❌ Cannot complete briefing. Missing required fields: {', '.join(missing)}.\n"
            "Call `update_brief` with the missing fields, then try again."
        )

    success = db.complete_briefing(project_id)
    if not success:
        return "❌ Error advancing project."

    # Compile bible + mint anchor on the running loop. Awaiting them
    # ensures they finish before Atlas starts AND keeps every async
    # client bound to the chat WS's loop (no cross-loop pollution).
    try:
        import asyncio
        from backend.orchestrator.style_bible import compile_style_bible_for_project
        from backend.orchestrator.style_anchor import ensure_style_anchor

        # Cap at 90s combined so a flaky LLM doesn't block the chat turn
        # forever. If they overrun we let them keep going as a background
        # task — next reference generation picks up whatever exists.
        async def _compile_both():
            await compile_style_bible_for_project(project_id)
            await ensure_style_anchor(project_id)

        try:
            await asyncio.wait_for(_compile_both(), timeout=90)
        except asyncio.TimeoutError:
            # Fire-and-forget the rest — same loop, no cross-loop issue.
            asyncio.create_task(_compile_both())
    except Exception:
        # Best-effort. Don't block the BRIEF→STORY handoff on bible failure.
        pass

    return "🎉 Briefing complete! Project advancing to STORY phase. The Story Architect will take over."
