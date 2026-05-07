-- Migration 004: Reference Pool + Continuity Bible (Phase 4.5)
--
-- Reference pool: every generated image is indexed with full provenance so
-- the Smart Reference Picker can score candidates and the system can re-use
-- existing images instead of regenerating them.
--
-- Continuity bible: project-level singleton compiled at every freeze. Aggregates
-- brief globals + character profiles + location set bibles + lighting state.
-- Injected as a system-prompt prefix into every agent run.

CREATE TABLE reference_pool (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    image_url TEXT NOT NULL,
    embedding BLOB,                          -- CLIP/SigLIP vector (set when embeddings land in v2)
    embedding_model TEXT DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '{}',    -- {subjects:[], lighting:'', camera:'', mood:'', time_of_day:''}
    character_ids_json TEXT NOT NULL DEFAULT '[]',  -- assets the picker considers a face/identity match
    location_id TEXT,
    aspect_ratio TEXT DEFAULT '',
    lighting_signature TEXT DEFAULT '',      -- "golden_hour:warm:0.7:high_contrast"
    source_type TEXT NOT NULL,               -- 'master' | 'variant' | 'cut' | 'upload' | 'web'
    source_cut_id TEXT,
    source_master_id TEXT,
    source_variant_id TEXT,
    source_request_id TEXT,                  -- generation_requests.id for full lineage
    is_anchor INTEGER DEFAULT 0,             -- scene anchor frames
    is_style_anchor INTEGER DEFAULT 0,       -- project-level style anchor
    is_favorite INTEGER DEFAULT 0,           -- user-pinned cross-project
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (source_cut_id) REFERENCES cuts(id) ON DELETE SET NULL
);

CREATE INDEX idx_refpool_project ON reference_pool(project_id);
CREATE INDEX idx_refpool_source_type ON reference_pool(source_type);
CREATE INDEX idx_refpool_anchor ON reference_pool(is_anchor) WHERE is_anchor = 1;
CREATE INDEX idx_refpool_style_anchor ON reference_pool(is_style_anchor) WHERE is_style_anchor = 1;
CREATE INDEX idx_refpool_favorite ON reference_pool(is_favorite) WHERE is_favorite = 1;
CREATE INDEX idx_refpool_location ON reference_pool(location_id);

CREATE TABLE continuity_bible (
    project_id TEXT PRIMARY KEY,
    version INTEGER DEFAULT 1,
    brief_globals_json TEXT NOT NULL DEFAULT '{}',   -- art_style, palette, lighting_style, world_logic
    characters_json TEXT NOT NULL DEFAULT '[]',      -- [{name, asset_id, distinctive, wardrobe_lock, tokens}]
    locations_json TEXT NOT NULL DEFAULT '[]',       -- [{name, asset_id, master_url, axis_baseline, sun_angle}]
    lighting_state_json TEXT NOT NULL DEFAULT '{}',  -- {scene_id: {time_of_day, color_temp, intensity}}
    style_anchor_url TEXT DEFAULT '',                -- single image pinned for the project
    last_compiled_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
