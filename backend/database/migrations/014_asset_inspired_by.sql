-- 014: Atlas recast traceability.
--
-- When Atlas substitutes a real-world celebrity / public figure with a
-- fictional archetype (Sunny Deol → "Rana the Action Veteran"), record the
-- original inspiration so the user can see the chain on the canvas instead
-- of wondering why their hero is named "Rana."
ALTER TABLE assets ADD COLUMN inspired_by TEXT DEFAULT '';
