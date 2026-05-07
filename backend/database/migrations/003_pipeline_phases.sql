-- Migration 003: production-flow pipeline (6-phase model with versioned artifacts)
--
-- Two new tables:
-- 1. phases     — per-project state of each pipeline phase (status + current version)
-- 2. artifacts  — versioned content payloads, one row per (project, phase, version)
--
-- The pipeline mimics real film production:
--   DEVELOP → DESIGN → CAST_SCOUT → BLUEPRINT → STORYBOARD → ANIMATIC
--
-- Backwards-compat: existing projects keep their current_phase column. The
-- 4-phase legacy values (BRIEF/STORY/ASSETS/GENERATE) and the 6-phase new
-- values both remain valid; consumers map old → new at read time.

CREATE TABLE phases (
    project_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    status TEXT DEFAULT 'pending',          -- pending|in_progress|frozen|stale
    current_version INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, phase),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    version INTEGER NOT NULL,
    schema_id TEXT NOT NULL,                 -- e.g. 'treatment_v1', 'scene_plan_v1', 'panel_v1'
    payload_json TEXT NOT NULL DEFAULT '{}',
    parent_version INTEGER,                  -- forking lineage
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT DEFAULT 'system',
    UNIQUE (project_id, phase, version),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_artifacts_project_phase ON artifacts(project_id, phase);
CREATE INDEX idx_artifacts_schema ON artifacts(schema_id);
CREATE INDEX idx_phases_status ON phases(status);
