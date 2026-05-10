-- Strawberry Studio — Initial Schema (greenfield)
-- Migration 001: consolidates all CREATE TABLE statements from init_db v3.

PRAGMA foreign_keys = ON;

CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    current_phase TEXT DEFAULT 'BRIEF',
    stale_phases TEXT DEFAULT '[]',
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE briefs (
    project_id TEXT PRIMARY KEY,
    title TEXT DEFAULT '',
    logline TEXT DEFAULT '',
    genre TEXT DEFAULT '',
    tone TEXT DEFAULT '',
    target_audience TEXT DEFAULT '',
    key_themes TEXT DEFAULT '',
    art_style TEXT DEFAULT '',
    color_palette TEXT DEFAULT '',
    aspect_ratio TEXT DEFAULT '16:9',
    render_quality TEXT DEFAULT '',
    lighting_style TEXT DEFAULT '',
    world_logic TEXT DEFAULT '',
    era_setting TEXT DEFAULT '',
    reference_films TEXT DEFAULT '',
    reference_artists TEXT DEFAULT '',
    negative_prompts TEXT DEFAULT '',
    character_design_notes TEXT DEFAULT '',
    environment_design_notes TEXT DEFAULT '',
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE scenes (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    scene_number INTEGER,
    title TEXT,
    description TEXT,
    location TEXT,
    location_detail TEXT DEFAULT '',
    time_of_day TEXT,
    lighting TEXT,
    lighting_color TEXT DEFAULT '',
    weather TEXT DEFAULT '',
    atmosphere TEXT DEFAULT '',
    mood TEXT,
    ambient_sound TEXT DEFAULT '',
    override_art_style TEXT DEFAULT '',
    override_color_palette TEXT DEFAULT '',
    anchor_cut_id TEXT DEFAULT '',
    scene_continuity_log TEXT DEFAULT '',
    location_master_url TEXT DEFAULT '',
    set_decoration TEXT DEFAULT '',
    camera_restrictions TEXT DEFAULT '',
    key_props_list TEXT DEFAULT '',
    blocking_notes TEXT DEFAULT '',
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE shots (
    id TEXT PRIMARY KEY,
    scene_id TEXT,
    shot_number INTEGER,
    description TEXT,
    camera_angle TEXT,
    camera_height TEXT DEFAULT '',
    camera_movement TEXT,
    camera_distance TEXT DEFAULT '',
    lens_type TEXT DEFAULT '',
    focal_length_mm TEXT DEFAULT '',
    depth_of_field TEXT DEFAULT '',
    focus_point TEXT DEFAULT '',
    subject TEXT,
    subject_position TEXT DEFAULT '',
    composition TEXT,
    foreground TEXT DEFAULT '',
    background TEXT DEFAULT '',
    override_mood TEXT,
    override_lighting TEXT DEFAULT '',
    override_art_style TEXT DEFAULT '',
    aspect_ratio_override TEXT DEFAULT '',
    filter_effects TEXT DEFAULT '',
    speed_ramp TEXT DEFAULT '',
    FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
);

CREATE TABLE cuts (
    id TEXT PRIMARY KEY,
    shot_id TEXT,
    cut_number INTEGER,
    action TEXT,
    story_description TEXT DEFAULT '',
    dialogue TEXT,
    expression TEXT DEFAULT '',
    body_language TEXT DEFAULT '',
    gesture TEXT DEFAULT '',
    gaze_direction TEXT DEFAULT '',
    beat_type TEXT,
    duration_hint TEXT DEFAULT '',
    transition TEXT DEFAULT 'cut',
    prev_cut_ref TEXT DEFAULT '',
    continuity_notes TEXT DEFAULT '',
    character_state TEXT DEFAULT '',
    object_tracking TEXT DEFAULT '',
    lighting_continuity TEXT DEFAULT '',
    edit_target TEXT DEFAULT '',
    spatial_lock TEXT DEFAULT '',
    generated_image_url TEXT DEFAULT '',
    generation_status TEXT DEFAULT 'pending',
    generation_notes TEXT DEFAULT '',
    override_camera_distance TEXT DEFAULT '',
    override_focus_point TEXT DEFAULT '',
    override_lighting TEXT DEFAULT '',
    override_mood TEXT DEFAULT '',
    costume_notes TEXT DEFAULT '',
    prop_interaction TEXT DEFAULT '',
    emotional_arc TEXT DEFAULT '',
    sfx_notes TEXT DEFAULT '',
    music_cue TEXT DEFAULT '',
    compiled_prompt TEXT DEFAULT '',
    image_slots TEXT DEFAULT '{}',
    FOREIGN KEY (shot_id) REFERENCES shots(id) ON DELETE CASCADE
);

CREATE TABLE chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT,
    phase TEXT,
    role TEXT,
    agent_name TEXT,
    content TEXT,
    timestamp TEXT,
    is_noise INTEGER DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    type TEXT,
    name TEXT,
    description TEXT,
    appearance TEXT,
    style TEXT,
    metadata TEXT,
    master_id TEXT,
    variant_diff TEXT,
    slot_filled INTEGER DEFAULT 0,
    image_url TEXT,
    consistency_tokens TEXT DEFAULT '',
    distinctive_features TEXT DEFAULT '',
    wardrobe_lock TEXT DEFAULT '',
    suggested_prompt TEXT DEFAULT '',
    source_type TEXT DEFAULT 'global',
    source_cut_id TEXT,
    generation_chain TEXT DEFAULT '[]',
    face_embedding_url TEXT,
    created_at TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (master_id) REFERENCES assets(id)
);

CREATE TABLE asset_links (
    id TEXT PRIMARY KEY,
    asset_id TEXT,
    node_type TEXT,
    node_id TEXT,
    usage TEXT,
    variant_notes TEXT,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

-- element_masters / element_variants tables removed: reference_pool
-- (see migration 007) is the single source of truth for asset master
-- images, and the routes/tools that wrote to these tables are gone
-- (see C1 cleanup commit). Dev-mode rebuild — old DBs need to be wiped.

CREATE TABLE generation_requests (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_asset_id TEXT,
    target_cut_id TEXT,
    prompt TEXT NOT NULL,
    model TEXT DEFAULT 'gemini-3-pro-image',
    method TEXT DEFAULT 'text_to_image',
    reference_image_url TEXT,
    reference_images TEXT,
    params TEXT,
    status TEXT DEFAULT 'queued',
    progress_percentage INTEGER DEFAULT 0,
    current_step TEXT,
    output_image_url TEXT,
    output_file_path TEXT,
    output_metadata TEXT,
    error_message TEXT,
    cost_usd REAL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    saved_to_master_id TEXT,
    saved_to_variant_id TEXT,
    candidate_group_id TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (target_asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY (target_cut_id) REFERENCES cuts(id) ON DELETE CASCADE
);

CREATE TABLE generation_history (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    prompt TEXT NOT NULL,
    model TEXT DEFAULT 'gemini-3-pro-image',
    generation_method TEXT DEFAULT 'text_to_image',
    reference_images TEXT,
    params TEXT,
    output_image_url TEXT,
    output_image_id TEXT,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    cost_usd REAL DEFAULT 0.0,
    tokens_used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- element_presets table removed: it served the deleted element_generation
-- tools (preset prompt templates for the legacy sheet generator). No
-- code reads or writes it any more.

CREATE INDEX idx_generation_history_project_id ON generation_history(project_id);
CREATE INDEX idx_generation_requests_project ON generation_requests(project_id);
CREATE INDEX idx_generation_requests_status ON generation_requests(status);
CREATE INDEX idx_generation_requests_asset ON generation_requests(target_asset_id);
CREATE INDEX idx_generation_requests_candidate_group ON generation_requests(candidate_group_id);
CREATE INDEX idx_chat_history_project_phase ON chat_history(project_id, phase);
CREATE INDEX idx_scenes_project ON scenes(project_id);
CREATE INDEX idx_shots_scene ON shots(scene_id);
CREATE INDEX idx_cuts_shot ON cuts(shot_id);
CREATE INDEX idx_assets_project ON assets(project_id);
CREATE INDEX idx_assets_master ON assets(master_id);
CREATE INDEX idx_asset_links_node ON asset_links(node_type, node_id);
CREATE INDEX idx_asset_links_asset ON asset_links(asset_id);
