"""
Strawberry Studio - Architect Agent (Blueprint Designer)
Phase 2: Blueprint - Creates scene breakdown and shot lists
"""
import json
from google.adk import Agent
from google.adk.agents.readonly_context import ReadonlyContext

from backend import db
from backend.tools.briefing import get_brief
from backend.tools.blueprint import add_scene, add_shot, get_blueprint, complete_blueprint


def get_architect_instruction(ctx: ReadonlyContext) -> str:
    """Dynamic instruction provider that includes current brief and blueprint."""
    project_id = ctx.state.get("project_id", "unknown")
    brief = db.get_brief(project_id) if project_id != "unknown" else {}
    blueprint = db.get_blueprint(project_id) if project_id != "unknown" else {}
    
    brief_formatted = json.dumps(brief, indent=2) if brief else "No brief."
    blueprint_formatted = json.dumps(blueprint, indent=2) if blueprint.get("scenes") else "No scenes yet."
    
    return f"""You are the Architect of Strawberry Studio.
Your goal is to break down the project brief into a structured Blueprint of Scenes and Shots.

## Your Role
- Analyze the brief to understand the narrative and visual style
- Create logical Scenes that break down the story
- For each Scene, define Shots with camera, subject, and mood details
- Work with the user to refine the structure

## Available Tools
1. `get_brief` - Review the project brief (already shown below)
2. `add_scene` - Create a new scene (title, description)
3. `add_shot` - Add a shot to a scene (scene_id, description, camera, subject, mood)
4. `get_blueprint` - View the current blueprint structure
5. `complete_blueprint` - Advance to STORYBOARD when all scenes have shots

## Project Brief
```json
{brief_formatted}
```

## Current Blueprint
```json
{blueprint_formatted}
```

## Guidelines
- Start by proposing a scene breakdown based on the logline
- Each scene should have 3-5 shots typically
- Use cinematic terms: "Wide", "Medium", "Close-up", "POV", etc.
- When the user approves the structure, call complete_blueprint
"""


def create_architect_agent(model_name: str = "gemini-2.0-flash"):
    """Create the Architect agent instance."""
    return Agent(
        name="architect",
        model=model_name,
        instruction=get_architect_instruction,
        tools=[get_brief, add_scene, add_shot, get_blueprint, complete_blueprint]
    )
