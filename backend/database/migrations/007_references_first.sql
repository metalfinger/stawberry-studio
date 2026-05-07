-- Migration 007 — References-first asset model.
--
-- Replaces sheets-as-grid-images with references-as-atomic-units. Every
-- visual representation of an asset becomes a single row with a label
-- and (optionally) a parent_reference_id linking back to the identity card
-- it was conditioned on. Sheets become a client-side rendering of these
-- references in a grid; no backend "sheet" file.
--
-- Per project decision: NO BACKFILL. Old test projects' generated sheets
-- become unreferenced storage files (orphaned, not loaded). Fresh DB is
-- the easier path.

-- 1. Reshape reference_pool by adding the references-first columns. Keep
--    the table name (less disruption to existing routes, less code churn);
--    semantically it now IS the references table.
--    element_sheets / element_masters / sheet_cell_crops stay alive
--    for now; they'll be dropped in commit 6 when sheet_generator is
--    deleted alongside its callers.
ALTER TABLE reference_pool ADD COLUMN asset_id TEXT;
ALTER TABLE reference_pool ADD COLUMN label TEXT;
ALTER TABLE reference_pool ADD COLUMN parent_reference_id TEXT;
ALTER TABLE reference_pool ADD COLUMN status TEXT DEFAULT 'complete';
ALTER TABLE reference_pool ADD COLUMN scope TEXT DEFAULT 'project';
ALTER TABLE reference_pool ADD COLUMN scope_id TEXT;

CREATE INDEX IF NOT EXISTS idx_refpool_asset_label ON reference_pool(asset_id, label);
CREATE INDEX IF NOT EXISTS idx_refpool_parent ON reference_pool(parent_reference_id);
CREATE INDEX IF NOT EXISTS idx_refpool_scope ON reference_pool(scope, scope_id);
