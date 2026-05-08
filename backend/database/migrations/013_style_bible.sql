-- 013_style_bible.sql
-- Phase L1: real palette + shared style tokens that bind every prompt.
-- palette_hex = JSON array of ~6 hex strings (e.g. ["#0A0E27","#FF3366",...])
-- style_tokens = JSON array of short shared phrases that get appended to
--   every Atlas / Pixel prompt for cross-asset cohesion (halftone density,
--   line weight, chroma offset, paper grain, render finish).
-- lighting_rules = 2-3 sentences describing how light behaves in this world.
ALTER TABLE briefs ADD COLUMN palette_hex     TEXT NOT NULL DEFAULT '[]';
ALTER TABLE briefs ADD COLUMN style_tokens    TEXT NOT NULL DEFAULT '[]';
ALTER TABLE briefs ADD COLUMN lighting_rules  TEXT NOT NULL DEFAULT '';
