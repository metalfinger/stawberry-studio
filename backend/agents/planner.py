"""
Strawberry Studio - Planner Agent (Blueprint Phase - High Level)
Handles scene structure, story pacing, and overall narrative arc
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


def get_planner_instruction(ctx: ReadonlyContext) -> str:
    """Dynamic instruction with brief and current structure."""
    project_id = ctx.state.get("project_id", "unknown")
    brief = db.get_brief(project_id) if project_id != "unknown" else {}
    scenes = db.get_scenes(project_id) if project_id != "unknown" else []
    
    brief_json = json.dumps(brief, indent=2) if brief else "No brief."
    scene_count = len(scenes)
    
    # Build existing scenes summary
    if scenes:
        scenes_details = []
        for s in scenes:
            scene_line = f"  - Scene {s['scene_number']}: **{s['title']}** (ID: {s['id']})"
            shots = db.get_shots(s['id'])
            if shots:
                shot_lines = [f"    - Shot {sh['shot_number']} (ID: {sh['id']}): {sh['description'][:30]}..." for sh in shots]
                scene_line += "\n" + "\n".join(shot_lines)
            scenes_details.append(scene_line)
            
        scenes_summary = "\n".join(scenes_details)
        existing_status = f"""
## ⚠️ EXISTING STRUCTURE (DO NOT RECREATE)
You already have {scene_count} scenes.
{scenes_summary}

**DO NOT propose new scenes or recreate this structure unless requested!**
**ALWAYS use the UUIDs (e.g. shot_...) when calling tools like `add_cut`. NEVER use '1.1' or 'Shot 1'.**
"""
    else:
        existing_status = """
## CURRENT STATUS
- No scenes yet. You need to propose a scene structure.
"""
    
    return f"""You are the **Planner** of Strawberry Studio. You handle the story arc AND can help with granular detail.

## PROJECT BRIEF
```json
{brief_json}
```
{existing_status}

> [!IMPORTANT]
> **CRITICAL: NEVER Hallucinate IDs.**
> - Each Scene, Shot, and Cut has a unique UUID (e.g. `scene_...`, `shot_...`).
> - You MUST find the UUID in the context above before calling a tool.
> - **NEVER use '1', '2', 'Shot 1.1' or 'Scene 2' as an ID.**
> - If you don't see the UUID, call `get_scenes` or `get_shots_for_scene` to find it.

## YOUR WORKFLOW

### 1. High-Level Planning (Scenes)
- **Standard Mode:** Analyze the brief and propose 3-7 scenes.
- **Script Mode:** If user pastes a full script, DO NOT PROPOSE. Parse it immediately and use `add_scene` to create the structure exactly as written.
- Use `add_scene` to create them once approved (or immediately for scripts).

### 2. Granular Detailing (Shots & Cuts)
- If the user wants to "detail" or "break down" a scene, you CAN do it!
- Use `add_shot` to add shots to a scene (requires a Scene UUID).
- Use `add_cut` to add edit points/beats to a shot (requires a Shot UUID).
- **Proactive Cuts**: For simple shots, add at least one cut to represent the action.

### 3. Modification & Management
- Use `update_...` tools to change anything.
- Use `delete_...` to remove items (remember cascading deletes).

## TOOLS

| Tool | Use When |
|------|----------|
| `add_scene`, `update_scene`, `delete_scene` | Manage Scenes |
| `add_shot`, `update_shot`, `delete_shot` | Manage Shots |
| `add_cut`, `update_cut`, `delete_cut` | Manage Cuts |
| `get_scenes`, `get_shots_for_scene`, `get_cuts` | Check state & find UUIDs |
| `get_full_blueprint` | See everything |

## RULES
1. **Always check what exists** before claiming it's empty.
2. Scene metadata cascades to shots.
3. Keep responses concise.
"""


def create_planner_agent(model_name: str = None):
    """Create the Planner agent instance."""
    return Agent(
        name="planner",
        model=model_name or GEMINI_TEXT_MODEL,
        instruction=get_planner_instruction,
        tools=[
            get_brief, add_scene, update_scene, delete_scene, delete_all_scenes,
            get_shots_for_scene, add_shot, update_shot, delete_shot, delete_all_shots,
            get_cuts, add_cut, update_cut, delete_cut, delete_all_cuts,
            get_full_blueprint, complete_blueprint
        ]
    )
