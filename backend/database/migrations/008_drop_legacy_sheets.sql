-- 008_drop_legacy_sheets — historically dropped the element_sheets +
-- sheet_cell_crops tables that migration 005 had created. Since 005 is
-- now a no-op (those tables are no longer created in the first place),
-- this drop is unnecessary too. No-op kept so the version sequence
-- stays intact for the migration runner.
SELECT 1;
