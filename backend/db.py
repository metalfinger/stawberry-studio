"""
Database Facade - Re-exports everything from database package
Maintains backward compatibility with 'import backend.db'
"""
from .database.core import (
    init_db, get_connection,
    create_project, get_project, list_projects, update_phase,
    get_brief, update_brief, complete_briefing,
    get_stale_phases, mark_phases_stale, clear_stale_phase, update_project_phase
)
from .database.scenes import (
    get_scenes, add_scene, update_scene, delete_scene, delete_all_scenes,
    add_scene_raw
)
from .database.shots import (
    get_shots, get_shots as get_shots_for_scene, add_shot, update_shot, delete_shot, delete_all_shots,
    get_cuts, add_cut, update_cut, delete_cut, delete_all_cuts,
    add_shot_raw
)
from .database.history import (
    get_chat_history, add_chat_message, get_chat_history_for_context
)
from .database.blueprint import (
    get_full_struct as get_blueprint,
    complete_blueprint
)
from .database.assets import (
    get_asset, get_assets, create_asset, get_masters, get_variants,
    get_asset_nodes, get_node_assets
)
