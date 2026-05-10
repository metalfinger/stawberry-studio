"""
Strawberry Studio — agent-callable tools.

Importing this module triggers @tool registration for the live tools.
Anything not imported here is invisible to the tool registry.
"""
from backend.tools.briefing import (
    update_brief, complete_briefing, confirm_briefing_complete, get_brief,
)
from backend.tools.blueprint import (
    get_scenes, add_scene, update_scene, delete_scene, delete_all_scenes,
    get_shots_for_scene, add_shot, update_shot, delete_shot, delete_all_shots,
    get_cuts, add_cut, update_cut, delete_cut, delete_all_cuts,
    get_full_blueprint, complete_blueprint, confirm_blueprint_complete,
    reorder_scenes, reorder_shots, reorder_cuts,
)
from backend.tools.generation import (
    get_cut_context, get_previous_cut, get_cut_assets, find_cut_by_number,
)
from backend.tools.assets import (
    create_asset, get_assets, update_asset, delete_asset,
    link_asset_to_node, get_node_assets, auto_link_assets_to_blueprint,
    complete_asset_extraction, confirm_asset_extraction_complete,
    save_suggested_asset_prompt,
)

__all__ = [
    # Briefing
    'get_brief', 'update_brief', 'complete_briefing', 'confirm_briefing_complete',
    # Blueprint — scenes
    'get_scenes', 'add_scene', 'update_scene', 'delete_scene', 'delete_all_scenes',
    # Blueprint — shots
    'get_shots_for_scene', 'add_shot', 'update_shot', 'delete_shot', 'delete_all_shots',
    # Blueprint — cuts
    'get_cuts', 'add_cut', 'update_cut', 'delete_cut', 'delete_all_cuts',
    # Blueprint — structure
    'get_full_blueprint', 'complete_blueprint', 'confirm_blueprint_complete',
    # Blueprint — reorder
    'reorder_scenes', 'reorder_shots', 'reorder_cuts',
    # Generation context
    'get_cut_context', 'get_previous_cut', 'get_cut_assets', 'find_cut_by_number',
    # Asset CRUD
    'create_asset', 'get_assets', 'update_asset', 'delete_asset',
    'link_asset_to_node', 'get_node_assets', 'auto_link_assets_to_blueprint',
    'complete_asset_extraction', 'confirm_asset_extraction_complete',
    'save_suggested_asset_prompt',
]
