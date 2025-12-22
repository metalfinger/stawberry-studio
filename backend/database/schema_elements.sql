-- Element Generation System Schema
-- For managing character/location/prop master images and variants
-- Using Gemini 3 Pro Image (Nano Banana Pro) for generation

-- ============================================================================
-- ELEMENT MASTERS - Core reference images for assets
-- ============================================================================
CREATE TABLE IF NOT EXISTS element_masters (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    element_type TEXT NOT NULL,              -- 'character' | 'location' | 'prop'

    -- Master Image
    master_image_url TEXT,                   -- Primary reference image
    master_prompt TEXT,                      -- Prompt used to generate master
    master_generation_params TEXT,           -- JSON: {model, seed, resolution, etc.}

    -- Master Specifications
    background_type TEXT DEFAULT 'white',    -- 'white' | 'transparent' | 'context'
    view_type TEXT,                          -- 'front_full' | 'hero_shot' | 'front_view'
    resolution TEXT DEFAULT '2048x2048',
    aspect_ratio TEXT DEFAULT '1:1',

    -- Status
    status TEXT DEFAULT 'pending',           -- 'pending' | 'generating' | 'complete' | 'failed'
    error_message TEXT,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

-- ============================================================================
-- ELEMENT VARIANTS - Different views/variations of masters
-- ============================================================================
CREATE TABLE IF NOT EXISTS element_variants (
    id TEXT PRIMARY KEY,
    master_id TEXT NOT NULL,

    -- Variant Details
    variant_type TEXT NOT NULL,              -- 'side_left' | '3_4' | 'back' | 'face_detail' | etc.
    variant_description TEXT,                -- Human-readable: "Left profile view"
    image_url TEXT,

    -- Generation Info
    prompt TEXT,                             -- Prompt used for this variant
    generation_method TEXT DEFAULT 'image_to_image',  -- 'text_to_image' | 'image_to_image'
    reference_image_id TEXT,                 -- If i2i, which master/variant was reference
    generation_params TEXT,                  -- JSON: {model, strength, seed, etc.}

    -- Status
    status TEXT DEFAULT 'pending',           -- 'pending' | 'generating' | 'complete' | 'failed'
    error_message TEXT,
    is_active BOOLEAN DEFAULT TRUE,          -- Can deactivate old/bad variants

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (master_id) REFERENCES element_masters(id) ON DELETE CASCADE
);

-- ============================================================================
-- GENERATION HISTORY - Track all generation attempts with full traceability
-- ============================================================================
CREATE TABLE IF NOT EXISTS generation_history (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,

    -- What was generated
    target_type TEXT NOT NULL,               -- 'element_master' | 'element_variant' | 'cut_final' | 'test'
    target_id TEXT,                          -- ID of master/variant/cut (NULL for test generations)

    -- Generation Details
    prompt TEXT NOT NULL,
    model TEXT DEFAULT 'gemini_3_pro_image', -- 'gemini_3_pro_image' | 'gemini_2_5_flash' | 'imagen_3'
    generation_method TEXT DEFAULT 'text_to_image',  -- 'text_to_image' | 'image_to_image'

    -- Reference Images (for i2i)
    reference_images TEXT,                   -- JSON: [{id, url, role: 'base' | 'style'}]

    -- Parameters
    params TEXT,                             -- JSON: all generation params

    -- Result
    output_image_url TEXT,
    output_image_id TEXT,                    -- Storage ID
    status TEXT DEFAULT 'pending',           -- 'pending' | 'success' | 'failed'
    error_message TEXT,

    -- Cost Tracking
    cost_usd REAL DEFAULT 0.039,             -- Gemini 3 Pro Image cost per image
    tokens_used INTEGER DEFAULT 1290,        -- Standard tokens per image

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,

    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============================================================================
-- ELEMENT PRESETS - Reusable prompt templates
-- ============================================================================
CREATE TABLE IF NOT EXISTS element_presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,                      -- "Character - Front Full Body"
    element_type TEXT NOT NULL,              -- 'character' | 'location' | 'prop'
    preset_type TEXT NOT NULL,               -- 'master' | 'variant'
    variant_type TEXT,                       -- If preset_type='variant': which variant

    -- Template
    prompt_template TEXT NOT NULL,           -- "Create a {style} character portrait of {name}..."
    required_fields TEXT,                    -- JSON: ['name', 'appearance', 'style']

    -- Default Parameters
    default_model TEXT DEFAULT 'gemini_3_pro_image',
    default_resolution TEXT DEFAULT '2048x2048',
    default_aspect_ratio TEXT DEFAULT '1:1',
    default_background TEXT DEFAULT 'white',
    default_params TEXT,                     -- JSON: additional default params

    -- System or User-created
    is_system BOOLEAN DEFAULT TRUE,          -- System presets vs user-created
    created_by TEXT,                         -- User ID if user-created

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_element_masters_asset_id ON element_masters(asset_id);
CREATE INDEX IF NOT EXISTS idx_element_masters_element_type ON element_masters(element_type);
CREATE INDEX IF NOT EXISTS idx_element_masters_status ON element_masters(status);

CREATE INDEX IF NOT EXISTS idx_element_variants_master_id ON element_variants(master_id);
CREATE INDEX IF NOT EXISTS idx_element_variants_variant_type ON element_variants(variant_type);
CREATE INDEX IF NOT EXISTS idx_element_variants_is_active ON element_variants(is_active);

CREATE INDEX IF NOT EXISTS idx_generation_history_project_id ON generation_history(project_id);
CREATE INDEX IF NOT EXISTS idx_generation_history_target_type ON generation_history(target_type);
CREATE INDEX IF NOT EXISTS idx_generation_history_created_at ON generation_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_element_presets_element_type ON element_presets(element_type);
CREATE INDEX IF NOT EXISTS idx_element_presets_preset_type ON element_presets(preset_type);

-- ============================================================================
-- SEED DATA: System Presets
-- ============================================================================

-- Character Master Preset
INSERT OR IGNORE INTO element_presets (
    id, name, element_type, preset_type, variant_type,
    prompt_template, required_fields, is_system
) VALUES (
    'preset_char_master',
    'Character - Front Full Body',
    'character',
    'master',
    NULL,
    'Create a high-quality character reference sheet in photorealistic style.

CHARACTER: {name}
DESCRIPTION: {appearance}

REQUIREMENTS:
- Full body shot, front view facing camera
- Neutral standing pose with arms slightly away from body
- Clear facial features with detailed eyes, nose, mouth
- Pure white background (#FFFFFF)
- Studio lighting, no shadows on background
- Photorealistic 3D render quality
- High detail on face, hands, clothing, accessories
- Character should be centered in frame
- 2048x2048 resolution, square composition

This is a master reference image for character consistency in future generations.',
    '["name", "appearance"]',
    TRUE
);

-- Character Variant: Side View
INSERT OR IGNORE INTO element_presets (
    id, name, element_type, preset_type, variant_type,
    prompt_template, required_fields, is_system
) VALUES (
    'preset_char_side',
    'Character - Side Profile',
    'character',
    'variant',
    'side_left',
    'Same exact character from the reference image, now shown in left profile view.

REQUIREMENTS:
- Perfect side view (90° left profile)
- Same character appearance, clothing, and styling
- Same neutral standing pose
- Pure white background
- Same studio lighting
- Maintain 100% character consistency with reference
- 2048x2048 resolution',
    '[]',
    TRUE
);

-- Character Variant: Face Detail
INSERT OR IGNORE INTO element_presets (
    id, name, element_type, preset_type, variant_type,
    prompt_template, required_fields, is_system
) VALUES (
    'preset_char_face',
    'Character - Face Close-up',
    'character',
    'variant',
    'face_detail',
    'Close-up portrait of the same character from reference image.

REQUIREMENTS:
- Head and shoulders only
- Same character face, exact same features
- Neutral expression, looking at camera
- Pure white background
- Studio portrait lighting
- Extreme detail on facial features
- 2048x2048 resolution',
    '[]',
    TRUE
);

-- Location Master Preset
INSERT OR IGNORE INTO element_presets (
    id, name, element_type, preset_type, variant_type,
    prompt_template, required_fields, is_system
) VALUES (
    'preset_loc_master',
    'Location - Hero Establishing Shot',
    'location',
    'master',
    NULL,
    'Create a high-quality location establishing shot in photorealistic style.

LOCATION: {name}
DESCRIPTION: {appearance}

REQUIREMENTS:
- Hero angle showing the most important view
- Clear spatial understanding and depth
- Cinematic composition with proper framing
- {time_of_day} lighting
- Photorealistic architectural/environmental detail
- Show key features that define this location
- 2048x1365 resolution (3:2 landscape aspect ratio)
- Professional photography quality

This is a master reference for location consistency.',
    '["name", "appearance", "time_of_day"]',
    TRUE
);

-- Prop Master Preset
INSERT OR IGNORE INTO element_presets (
    id, name, element_type, preset_type, variant_type,
    prompt_template, required_fields, is_system
) VALUES (
    'preset_prop_master',
    'Prop - Front View Reference',
    'prop',
    'master',
    NULL,
    'Create a high-quality prop reference image in photorealistic style.

PROP: {name}
DESCRIPTION: {appearance}

REQUIREMENTS:
- Front view, clearly visible and centered
- Pure white background (#FFFFFF)
- Studio product photography lighting
- Clear details, textures, and materials
- Proper scale and proportions
- Professional product shot quality
- 2048x2048 resolution, square composition

This is a master reference for prop consistency.',
    '["name", "appearance"]',
    TRUE
);
