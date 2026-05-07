-- Migration 005: Element Sheets (Phase 4.6)
--
-- One multi-panel "model sheet" per asset, generated in a single Nano Banana
-- Pro pass. Replaces the per-variant approach (side_left, side_right, …).
-- Each sheet records its grid layout + per-cell semantic labels so the
-- Smart Reference Picker can address one cell of the sheet when composing
-- a cut prompt ("the 3/4-right cell of @Image1").
--
-- After this migration verifies, Migration 006 will deprecate the
-- element_variants table and the variant_type enum.

CREATE TABLE element_sheets (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,

    -- Template chosen by the Sheet Planner from tree context
    sheet_type TEXT NOT NULL,                  -- 'character_full' | 'character_3view' | 'character_solo'
                                                -- 'location_full' | 'location_solo'
                                                -- 'prop_3view' | 'prop_solo'
                                                -- 'vehicle_full' | 'costume_flat'
    template_id TEXT NOT NULL,                  -- internal template version, e.g. 'character_full_v1'

    -- The actual generated sheet image
    image_url TEXT,
    aspect_ratio TEXT DEFAULT '',
    resolution TEXT DEFAULT '',

    -- Grid + per-cell metadata so the picker can target one cell
    -- layout_json schema:
    --   { "grid": [rows, cols], "cells": [{"label": "front", "row": 0, "col": 0,
    --     "bbox": [x_norm, y_norm, w_norm, h_norm]}, ...] }
    layout_json TEXT NOT NULL DEFAULT '{}',

    -- panels_json: ordered list of cell labels for quick lookup
    panels_json TEXT NOT NULL DEFAULT '[]',     -- e.g. ['front','3/4','side','back','hero','face','happy','sad','angry']

    -- Generation provenance
    prompt TEXT,                                -- the multi-panel prompt fed to the image model
    model TEXT DEFAULT 'gemini-3-pro-image-preview',
    generation_request_id TEXT,
    cost_usd REAL DEFAULT 0.0,
    seed INTEGER,

    -- Lifecycle
    is_active INTEGER DEFAULT 0,                -- only one active sheet per asset (newest)
    status TEXT DEFAULT 'pending',              -- pending | generating | complete | failed
    error_message TEXT,

    -- Story usage at generation time (for transparency / debugging — what cuts
    -- did the planner consider when picking the template)
    rationale_json TEXT DEFAULT '{}',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX idx_sheets_asset ON element_sheets(asset_id);
CREATE INDEX idx_sheets_active ON element_sheets(asset_id, is_active);
CREATE INDEX idx_sheets_status ON element_sheets(status);

-- Cropped sheet cells (lazy — only created when a cut needs a specific cell
-- and the model can't reliably attend to it inside the multi-panel image).
CREATE TABLE sheet_cell_crops (
    id TEXT PRIMARY KEY,
    sheet_id TEXT NOT NULL,
    cell_label TEXT NOT NULL,                   -- e.g. 'front', '3/4-right', 'happy'
    cropped_image_url TEXT NOT NULL,
    bbox_json TEXT NOT NULL,                    -- the bbox used for cropping
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (sheet_id, cell_label),
    FOREIGN KEY (sheet_id) REFERENCES element_sheets(id) ON DELETE CASCADE
);

CREATE INDEX idx_cell_crops_sheet ON sheet_cell_crops(sheet_id);
