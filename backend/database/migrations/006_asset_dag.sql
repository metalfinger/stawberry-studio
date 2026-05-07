-- Migration 006 — Asset DAG
--
-- Phase 4.6 made the asset model flat: every asset is a peer with one sheet.
-- This breaks for derived assets (Mara's gun, the ramen stall in the alley)
-- and merged ones (boots, scarf — wardrobe of a character).
--
-- This migration introduces:
--   - parent_asset_id : the contextual parent that defines this asset's
--                       visual identity. Sheet generation conditions on the
--                       parent's sheet/master so identity locks.
--   - reference_strategy : 'standalone' | 'derived' | 'variant'. Mostly
--                          informational; sheet generator uses
--                          parent_asset_id + master_id to decide.
--   - scenes.character_wardrobe_overrides : JSON map {asset_id: text} so a
--                          character can wear different wardrobe per scene
--                          without duplicating the character asset.
--
-- master_id (existing column) is reused as the variant pointer
-- (Mara-at-7 → master_id = Mara). Sheet generator treats master_id and
-- parent_asset_id symmetrically: both pin slot @Image1 as a reference.

ALTER TABLE assets ADD COLUMN parent_asset_id TEXT;
ALTER TABLE assets ADD COLUMN reference_strategy TEXT DEFAULT 'standalone';
ALTER TABLE scenes ADD COLUMN character_wardrobe_overrides TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_assets_parent ON assets(parent_asset_id);
