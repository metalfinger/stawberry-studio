-- Migration 008 — drop the legacy sheet/master tables now that
-- references_v2 is the canonical asset image system.
--
-- Sheet generator code is removed in this commit; nothing reads these
-- tables anymore. The reference_pool table (extended in migration 007
-- with asset_id/label/parent_reference_id/scope) is the single source
-- of truth for asset reference images.

DROP TABLE IF EXISTS sheet_cell_crops;
DROP TABLE IF EXISTS element_sheets;
-- element_masters and element_variants kept alive — legacy routes
-- (backend/routes/elements.py, backend/tools/element_generation.py) still
-- write to them. New flow (references_v2) doesn't read or write either.
-- Remove in a future cleanup pass once those routes/tools are deleted.
