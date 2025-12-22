"""
Strawberry Studio - Asset Analyst Agent (Storyboard Phase)
Analyzes blueprint to extract characters, locations, and props
"""
from google.adk import Agent
from google.adk.agents.readonly_context import ReadonlyContext

from backend import db
from backend.config import GEMINI_TEXT_MODEL
from backend.tools.assets import (
    get_full_blueprint_for_analysis,
    create_asset,
    create_variant,
    create_frame_slot,
    get_assets,
    get_masters_with_variants,
    get_asset_usage,
    update_asset,
    delete_asset,
    delete_all_assets,
    link_asset_to_node,
    get_node_assets,
    complete_asset_extraction,
    auto_link_assets_to_blueprint,
)
from backend.tools.briefing import get_brief


ANALYST_TOOLS = [
    get_brief,
    get_full_blueprint_for_analysis,
    create_asset,
    create_variant,
    create_frame_slot,
    get_assets,
    get_masters_with_variants,
    get_asset_usage,
    update_asset,
    delete_asset,
    delete_all_assets,
    link_asset_to_node,
    get_node_assets,
    complete_asset_extraction,
    auto_link_assets_to_blueprint,
]


def get_analyst_instruction(ctx: ReadonlyContext) -> str:
    """Dynamic instruction for the Asset Analyst agent."""
    project_id = ctx.state.get("project_id", "unknown")
    
    # Get existing assets summary
    existing_assets = ""
    if project_id != "unknown":
        from backend.database import assets as asset_db
        characters = asset_db.get_assets(project_id, "character")
        locations = asset_db.get_assets(project_id, "location")
        props = asset_db.get_assets(project_id, "prop")
        
        if characters or locations or props:
            existing_assets = f"""
## EXISTING ASSETS
- Characters ({len(characters)}): {', '.join([c['name'] for c in characters]) or 'None'}
- Locations ({len(locations)}): {', '.join([l['name'] for l in locations]) or 'None'}
- Props ({len(props)}): {', '.join([p['name'] for p in props]) or 'None'}

**Review these before creating duplicates!**
"""
        else:
            existing_assets = "\n## NO ASSETS YET\nBlueprint is ready for asset extraction.\n"
    
    return f"""You are the **Asset Analyst** 🔍 of Strawberry Studio.

Your job is to analyze the complete blueprint and extract all visual assets needed for production.

**PROJECT ID: {project_id}** (use this in all tool calls)

{existing_assets}

## YOUR WORKFLOW

### 1. Analyze Blueprint
- Call `get_full_blueprint_for_analysis(project_id)` to see all scenes, shots, and cuts
- Read through descriptions to identify mentioned assets

### 2. Extract Assets (in order)
**Characters** - People, robots, creatures
- Name, description, appearance details (age, costume, distinctive features)
- **IMPORTANT:** For each character, also specify:
  - `consistency_tokens`: "scar on left cheek, blue eyes, silver hair"
  - `distinctive_features`: "Always wears red scarf"
  - `wardrobe_lock`: "Black leather jacket, white t-shirt"

**Locations** - Places, environments
- Name, description, lighting, mood, architectural style

**Props** - Objects, vehicles, items
- Name, description, size, material, function

### 3. Auto-Link Assets to Blueprint
- After creating all assets, call `auto_link_assets_to_blueprint(project_id='{project_id}')`
- This scans all scenes, shots, cuts and links assets where their names appear
- Locations → linked to Scenes
- Characters/Props → linked to Cuts (or Shots if in subject)

### 4. Manual Linking (if needed)
- For any missed links, use `link_asset_to_node(asset_id, node_type, node_id, usage)`
- Usage: 'primary' (main focus), 'background', or 'mentioned'

### 5. Complete Extraction
- When all assets are identified and linked, call `complete_asset_extraction(project_id='{project_id}')`
- This transitions the project to GENERATE phase

## IMPORTANT RULES

> [!CAUTION]
> - **ALWAYS use UUIDs** when linking. Scene IDs look like `scene_xxx`, Shot IDs like `shot_xxx`.
> - **DEDUPLICATE**: If "Dr. Chen" and "the scientist" refer to the same person, create ONE asset.
> - **BE THOROUGH**: Even background elements matter for consistency.
> - **ASK IF UNSURE**: If a description is ambiguous, ask the user for clarification.
> - **CONSISTENCY TOKENS ARE CRITICAL**: Without them, characters will drift during generation.

## EXAMPLE EXTRACTION

"Dr. Sarah Chen examines the water sample in the Mars Colony lab"
→ Character: Dr. Sarah Chen
  - appearance: "scientist, 40s, Asian, short black hair"
  - consistency_tokens: "silver streak in hair, round glasses, mole on right cheek"
  - wardrobe_lock: "red NASA jumpsuit, silver badge"
→ Location: Mars Colony Lab (sterile, bright lighting, futuristic)
→ Prop: Water Sample (vial with blue liquid)
"""


def create_analyst(model_name: str = None):
    """Create the Asset Analyst agent."""
    return Agent(
        name="analyst",
        model=model_name or GEMINI_TEXT_MODEL,
        instruction=get_analyst_instruction,
        tools=ANALYST_TOOLS
    )
