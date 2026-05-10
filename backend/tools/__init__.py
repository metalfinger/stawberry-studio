"""
Strawberry Studio - Tools
"""
from backend.tools.briefing import update_brief, complete_briefing, confirm_briefing_complete, get_brief
from backend.tools.blueprint import (
    get_scenes, add_scene, update_scene, delete_scene, delete_all_scenes,
    get_shots_for_scene, add_shot, update_shot, delete_shot, delete_all_shots,
    get_cuts, add_cut, update_cut, delete_cut, delete_all_cuts,
    get_full_blueprint, complete_blueprint, confirm_blueprint_complete,
    reorder_scenes, reorder_shots, reorder_cuts,
)

from backend.tools.generation import (
    get_cut_context, get_previous_cut, get_cut_assets,
    generate_image_mock, save_cut_image, mark_cut_status, get_asset_image,
    compare_with_master, flag_issue, request_edit, approve_cut, find_cut_by_number,
)
from backend.tools.assets import (
    create_asset, get_assets, update_asset, delete_asset,
    link_asset_to_node, get_node_assets, auto_link_assets_to_blueprint,
    complete_asset_extraction, confirm_asset_extraction_complete, save_suggested_asset_prompt,
)

# Trigger registration side-effects for tool modules used only by specific agents.
from backend.tools import navigation as _navigation  # noqa: F401
from backend.tools import phase_confirmation as _phase_confirmation  # noqa: F401
from backend.tools import pre_production as _pre_production  # noqa: F401

__all__ = [
    # Briefing tools
    'get_brief',
    'update_brief',
    'complete_briefing',
    'confirm_briefing_complete',
    # Blueprint tools - Scenes
    'get_scenes',
    'add_scene',
    'update_scene',
    'delete_scene',
    'delete_all_scenes',
    # Blueprint tools - Shots
    'get_shots_for_scene',
    'add_shot',
    'update_shot',
    'delete_shot',
    'delete_all_shots',
    # Blueprint tools - Cuts
    'get_cuts',
    'add_cut',
    'update_cut',
    'delete_cut',
    'delete_all_cuts',
    # Blueprint tools - Structure
    'get_full_blueprint',
    'complete_blueprint',
    'confirm_blueprint_complete',
    # Blueprint tools - Reorder (fix scrambled chronology)
    'reorder_scenes',
    'reorder_shots',
    'reorder_cuts',
    # Generation tools
    'get_cut_context',
    'get_previous_cut',
    'get_cut_assets',
    'generate_image_mock',
    'save_cut_image',
    'mark_cut_status',
    'get_asset_image',
    'compare_with_master',
    'flag_issue',
    'request_edit',
    'approve_cut',
    'find_cut_by_number',
    # Asset tools
    'create_asset',
    'get_assets',
    'update_asset',
    'delete_asset',
    'link_asset_to_node',
    'get_node_assets',
    'auto_link_assets_to_blueprint',
    'complete_asset_extraction',
    'confirm_asset_extraction_complete',
    # Pre-production tools
    'get_pre_production_requirements',
    'compile_pre_production_step',
    'execute_pre_production_step',
    'save_pre_production_output',
    'complete_pre_production',
    'get_generation_history',
    'get_generation_history',
]
