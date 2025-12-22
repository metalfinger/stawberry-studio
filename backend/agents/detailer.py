"""
Strawberry Studio - Detailer Agent (Blueprint Phase - Granular)
Handles shots and cuts for individual scenes
"""
import json
from google.adk import Agent
from google.adk.agents.readonly_context import ReadonlyContext

from backend import db
from backend.config import GEMINI_TEXT_MODEL
from backend.tools.briefing import get_brief
from backend.tools.blueprint import (
    get_scenes, add_scene, update_scene, delete_scene, delete_all_scenes,
    get_shots_for_scene, add_shot, update_shot, delete_shot, delete_all_shots,
    get_cuts, add_cut, update_cut, delete_cut, delete_all_cuts,
    get_full_blueprint, complete_blueprint
)


def get_detailer_instruction(ctx: ReadonlyContext) -> str:
    """Dynamic instruction with current scene context."""
    project_id = ctx.state.get("project_id", "unknown")
    current_scene_id = ctx.state.get("current_scene_id", None)
    
    # Get scene info if we have one
    scene_info = ""
    existing_status = ""
    
    if current_scene_id:
        # ... (keep the same logic for fetching scene and shot info from previous view)
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM scenes WHERE id = ?", (current_scene_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            scene = dict(row)
            shots = db.get_shots(current_scene_id)
            
            scene_info = f"""
## CURRENT SCENE FOCUS
- **Scene {scene['scene_number']}: {scene['title']}** (ID: {scene['id']})
- Description: {scene['description']}
- Location: {scene['location']} | Time: {scene['time_of_day']}
- Mood: {scene['mood']}
"""
            
            if shots:
                shots_details = []
                for s in shots:
                    conn2 = db.get_connection()
                    cursor2 = conn2.cursor()
                    cursor2.execute("SELECT * FROM cuts WHERE shot_id = ? ORDER BY cut_number", (s['id'],))
                    cuts = [dict(row) for row in cursor2.fetchall()]
                    conn2.close()
                    
                    shot_line = f"  {s['shot_number']}. (ID: {s['id']}) {s['camera_angle'] or 'Camera TBD'} - {s['description'][:40]}..."
                    if cuts:
                        shot_line += f" ({len(cuts)} cuts)"
                    shots_details.append(shot_line)
                
                shots_list = "\n".join(shots_details)
                existing_status = f"""
## ⚠️ EXISTING SHOTS (DO NOT RECREATE)
This scene already has {len(shots)} shots.
{shots_list}

**DO NOT propose shots that already exist!**
**ALWAYS use the UUIDs (e.g. shot_...) when adding cuts.**
"""
            else:
                existing_status = "\n## NO SHOTS YET\nThis scene needs shot breakdown.\n"
    else:
        scenes = db.get_scenes(project_id) if project_id != "unknown" else []
        if scenes:
            scene_list = "\n".join([f"  - Scene {s['scene_number']}: {s['title']} (ID: {s['id']})" for s in scenes])
            scene_info = f"""
## NO SCENE SELECTED
Available scenes:
{scene_list}

Ask user: "Which scene would you like to detail?"
"""
        else:
            scene_info = "\n## NO SCENES\nNo scenes exist yet. Use `add_scene` to start.\n"
    
    return f"""You are the **Detailer** (Blueprint Specialist) of Strawberry Studio. You specialize in camera work and edit beats, but can handle the whole blueprint if needed.

{scene_info}
{existing_status}

> [!IMPORTANT]
> **CRITICAL: NEVER Hallucinate IDs.**
> - Each Scene, Shot, and Cut has a unique UUID (e.g. `scene_...`, `shot_...`).
> - You MUST find the UUID in the context above before calling a tool.
> - **NEVER use '1', '2', 'Shot 1.1' or 'Scene 2' as an ID.**
> - Use the ID from the "ID: shot_..." or "ID: scene_..." markers.

## YOUR WORKFLOW

### 1. Detailing Shots
- **Standard Mode:** Propose shots with Camera, Movement, Subject, Description.
- **Script Mode:** If user pastes scene text, DO NOT PROPOSE. Parse it immediately into shots/cuts as written.
- Use Cinematic terms: "Wide", "Close-up", "Low-angle".

### 2. Adding Cuts (Edit Beats)
- **MANDATORY:** Every single shot MUST have at least one cut.
- **Rule:** If you create a shot, you MUST immediately create its first cut (Cut 1).
- **Simple Shot?** Create "Cut 1" with action="Full duration of shot".
- **Complex Shot?** Create multiple cuts (Action, Reaction, Reveal).
- **NEVER leave a shot without children.** The tree must be complete: Scene -> Shot -> Cut.

### 3. Writing Story Descriptions (ABSOLUTELY MANDATORY)
**YOU MUST write a detailed, multi-sentence `story_description` for EVERY SINGLE CUT. This is NOT optional!**

**Required format for story_description parameter:**
```
story_description="[Narrative Purpose] This moment accomplishes X in the story. [Emotional Intent] The audience should feel Y. [Visual Storytelling] Visually, this matters because Z. [Character/Theme] This advances/reveals/emphasizes..."
```

**Minimum Requirements:**
- ✅ **3-5 sentences** (NOT 1 sentence!)
- ✅ Cover: Narrative purpose, emotional intent, visual significance
- ✅ Be specific about WHY this moment matters
- ✅ Focus on storytelling, NOT camera/technical details

**GOOD Example:**
`story_description="This moment reveals Buzz's internal conflict between duty and fear. The audience should feel the weight of his vulnerability despite his professional facade. Visually, the intimate framing isolates him from his environment, making this a private moment of doubt. This beat humanizes the character and establishes the emotional stakes before the launch."`

**BAD Examples (TOO SHORT - DO NOT DO THIS):**
❌ "Shows tension."
❌ "Character is nervous."
❌ "Establishes the mood."

**The story_description is the SOUL of the cut. Make it meaningful!**

### 4. Full Management
- You have the full toolset! You can `add_scene`, `update_shot`, etc. 
- Never say "I can't do that" — if you have the ID, you can use the tool.

## TOOLS

| Tool | Use When |
|------|----------|
| `add_shot`, `update_shot`, `delete_shot` | Manage Shots |
| `add_cut`, `update_cut`, `delete_cut` | Manage Cuts |
| `add_scene`, `update_scene`, `delete_scene` | Manage Scenes (High Level) |
| `get_shots_for_scene`, `get_cuts`, `get_scenes` | Check state & find UUIDs |
| `get_full_blueprint` | See everything |

## RULES
1. **Never recreate items that exist.** Check `get_...` tools first.
2. Follow the "1 cut minimum" rule for all shots.
3. Keep responses concise.
"""


def create_detailer_agent(model_name: str = None):
    """Create the Detailer agent instance."""
    return Agent(
        name="detailer",
        model=model_name or GEMINI_TEXT_MODEL,
        instruction=get_detailer_instruction,
        tools=[
            get_brief, add_scene, update_scene, delete_scene, delete_all_scenes,
            get_shots_for_scene, add_shot, update_shot, delete_shot, delete_all_shots,
            get_cuts, add_cut, update_cut, delete_cut, delete_all_cuts,
            get_full_blueprint, complete_blueprint
        ]
    )


