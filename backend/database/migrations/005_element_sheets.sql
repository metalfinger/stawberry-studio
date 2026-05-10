-- 005_element_sheets — historically created the element_sheets +
-- sheet_cell_crops tables. Both were dropped by migration 008 once
-- references_first (007) replaced them. This migration is now a no-op
-- so the version sequence stays intact for the migration runner.
SELECT 1;
