-- Migration 009 — Agentic Console foundation.
--
-- Phase A of the redesign. Adds:
--   - reference_pool library metadata: is_active, superseded_by_id, prompt,
--     cost_usd, model_used, used_in_cuts_json. Enables version chains, drag-
--     drop, library detail view, and revert via flag flips.
--   - cuts.refinement_feedback: cumulative feedback list per cut.
--   - briefs.auto_approve_under_usd: threshold for auto-approving low-cost
--     plan items.
--   - plans table: persistence + audit for plan-as-artifact pattern.

ALTER TABLE reference_pool ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE reference_pool ADD COLUMN superseded_by_id TEXT;
ALTER TABLE reference_pool ADD COLUMN prompt TEXT DEFAULT '';
ALTER TABLE reference_pool ADD COLUMN cost_usd REAL DEFAULT 0;
ALTER TABLE reference_pool ADD COLUMN model_used TEXT DEFAULT '';
ALTER TABLE reference_pool ADD COLUMN used_in_cuts_json TEXT DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_refs_active ON reference_pool(is_active) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_refs_superseded ON reference_pool(superseded_by_id);

ALTER TABLE cuts ADD COLUMN refinement_feedback TEXT DEFAULT '[]';

ALTER TABLE briefs ADD COLUMN auto_approve_under_usd REAL DEFAULT 0;

CREATE TABLE plans (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    cut_id TEXT,
    parent_plan_id TEXT,
    feedback_round INTEGER DEFAULT 0,
    items_json TEXT NOT NULL,
    total_cost_usd REAL DEFAULT 0,
    total_eta_s INTEGER DEFAULT 0,
    status TEXT DEFAULT 'proposed',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (cut_id) REFERENCES cuts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plans_project ON plans(project_id);
CREATE INDEX IF NOT EXISTS idx_plans_cut ON plans(cut_id);
CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
