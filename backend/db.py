"""
Single canonical DB surface for the entire backend.

Everything that touches the database SHOULD import from here:

    from backend import db
    conn = db.get_connection()                     # sync sqlite3 conn
    async with db.get_async_connection() as conn:  # aiosqlite conn
    brief = db.get_brief(project_id)
    scenes = db.get_scenes(project_id)
    ...

Internally this re-exports the domain-split modules under
backend/database/. Importing from those modules directly works but is
discouraged — keeping the import surface flat means there's exactly one
place to look when you want to understand what the DB does.
"""
from .database.core import (
    # Connection management
    init_db, init_db_async,
    get_connection, get_async_connection,
    # Project CRUD
    create_project, get_project, list_projects, update_phase, update_project_phase,
    # Brief CRUD
    get_brief, update_brief, complete_briefing,
    # Phase staleness
    get_stale_phases, mark_phases_stale, clear_stale_phase, clear_all_stale_phases,
    # Constants
    PIPELINE_PHASES, PHASE_ORDER,
)
from .database.scenes import (
    get_scenes, add_scene, update_scene, delete_scene, delete_all_scenes,
    add_scene_raw,
)
from .database.shots import (
    get_shots, get_shots as get_shots_for_scene,
    add_shot, update_shot, delete_shot, delete_all_shots,
    get_cuts, add_cut, update_cut, delete_cut, delete_all_cuts,
    add_shot_raw,
)
from .database.history import (
    get_chat_history, add_chat_message, get_chat_history_for_context,
)
from .database.blueprint import (
    get_full_struct as get_blueprint,
    complete_blueprint,
)
from .database.assets import (
    get_asset, get_assets, create_asset,
    get_masters, get_variants,
    get_asset_nodes, get_node_assets,
    link_asset_to_node,
)

__all__ = [
    "init_db", "init_db_async",
    "get_connection", "get_async_connection",
    "create_project", "get_project", "list_projects", "update_phase", "update_project_phase",
    "get_brief", "update_brief", "complete_briefing",
    "get_stale_phases", "mark_phases_stale", "clear_stale_phase", "clear_all_stale_phases",
    "PIPELINE_PHASES", "PHASE_ORDER",
    "get_scenes", "add_scene", "update_scene", "delete_scene", "delete_all_scenes", "add_scene_raw",
    "get_shots", "get_shots_for_scene", "add_shot", "update_shot", "delete_shot", "delete_all_shots",
    "get_cuts", "add_cut", "update_cut", "delete_cut", "delete_all_cuts", "add_shot_raw",
    "get_chat_history", "add_chat_message", "get_chat_history_for_context",
    "get_blueprint", "complete_blueprint",
    "get_asset", "get_assets", "create_asset", "get_masters", "get_variants",
    "get_asset_nodes", "get_node_assets", "link_asset_to_node",
]
