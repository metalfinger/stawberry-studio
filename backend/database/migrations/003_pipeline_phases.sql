-- 003_pipeline_phases — historically created the `phases` and `artifacts`
-- tables for the 6-phase production pipeline + versioned artifact payloads.
-- Both tables, the pipeline module, the pipeline routes, and the
-- artifact-versioning tests have been deleted; the live chat flow uses
-- projects.current_phase only. No-op kept so the version sequence stays
-- intact for the migration runner.
SELECT 1;
