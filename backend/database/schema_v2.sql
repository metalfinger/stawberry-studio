-- Strawberry Studio Enhanced Schema v2.0
-- Focus: Narrative intelligence, cinematic metadata, inference-driven

-- ============================================================================
-- BRIEFS - Project Vision & Creative Direction
-- ============================================================================
CREATE TABLE IF NOT EXISTS briefs_v2 (
    project_id TEXT PRIMARY KEY,

    -- Core (kept simple - will be inferred from)
    title TEXT,
    logline TEXT,
    genre TEXT,

    -- Creative Vision (NEW: Rich context)
    creative_intent TEXT DEFAULT '',  -- "Create viral-worthy sci-fi that feels real"
    target_emotion TEXT DEFAULT '',   -- "Awe, wonder, hope in isolation"
    reference_works TEXT DEFAULT '',  -- "The Martian meets Interstellar"
    visual_identity TEXT DEFAULT '',  -- "Cinematic realism, Malick-style contemplation"

    -- Narrative Intelligence (NEW)
    story_structure TEXT DEFAULT 'three-act',  -- "three-act", "hero-journey", "vignette"
    thematic_core TEXT DEFAULT '',    -- ["isolation", "discovery", "human-spirit"]
    emotional_arc TEXT DEFAULT '',    -- "Loneliness → Curiosity → Triumph"
    narrative_style TEXT DEFAULT '',  -- "Show don't tell, visual storytelling"

    -- Cinematic Language (NEW: Auto-inferred defaults)
    cinematic_style TEXT DEFAULT '',  -- "Grounded sci-fi, naturalistic"
    pacing_preference TEXT DEFAULT '', -- "Contemplative, patient"
    visual_motifs TEXT DEFAULT '',    -- "Red dust as life, isolation vs connection"
    color_theory TEXT DEFAULT '',     -- "Desaturated with warm accents"

    -- Visual Style (Enhanced)
    art_style TEXT DEFAULT '',
    color_palette TEXT DEFAULT '',
    aspect_ratio TEXT DEFAULT '16:9',
    render_quality TEXT DEFAULT 'photorealistic',
    lighting_philosophy TEXT DEFAULT '', -- "Natural, motivated, high contrast"

    -- World Rules (Enhanced)
    world_logic TEXT DEFAULT '',
    era_setting TEXT DEFAULT '',
    sensory_palette TEXT DEFAULT '',  -- "Cold, quiet, tactile"

    -- Meta
    inference_locked BOOLEAN DEFAULT FALSE, -- If true, stop auto-inferring

    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- ============================================================================
-- SCENES - Narrative Beats & Emotional Journey
-- ============================================================================
CREATE TABLE IF NOT EXISTS scenes_v2 (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    scene_number INTEGER,
    title TEXT,
    description TEXT,

    -- Narrative Intelligence (NEW)
    story_purpose TEXT DEFAULT '',    -- "Establish isolation and stakes"
    emotional_beat TEXT DEFAULT '',   -- "Wonder → Discovery → Urgency"
    narrative_function TEXT DEFAULT '', -- "Setup", "Turning Point", "Climax"
    character_arc_moment TEXT DEFAULT '', -- "Hero accepts the call"
    thematic_focus TEXT DEFAULT '',   -- "Discovery, hope"

    -- Story Connectivity (NEW)
    builds_from_previous TEXT DEFAULT '', -- Auto: context from prev scene
    sets_up_next TEXT DEFAULT '',     -- What this foreshadows
    emotional_shift TEXT DEFAULT '',  -- "Calm to tense"
    pacing_role TEXT DEFAULT '',      -- "Slow build", "Acceleration", "Pause"

    -- Cinematic Approach (NEW)
    visual_motif TEXT DEFAULT '',     -- "Dust particles catching light"
    color_signature TEXT DEFAULT '',  -- "Warm amber vs cold blue"
    pacing_rhythm TEXT DEFAULT '',    -- "Slow, methodical"
    tension_level INTEGER DEFAULT 5,  -- 1-10 scale
    sensory_priority TEXT DEFAULT '', -- "Visual > Sound > Tactile"

    -- Location (Enhanced)
    location TEXT,
    location_detail TEXT DEFAULT '',
    location_personality TEXT DEFAULT '', -- "Harsh, unforgiving, beautiful"
    time_of_day TEXT,

    -- Atmosphere (Enhanced)
    lighting TEXT,
    lighting_color TEXT DEFAULT '',
    lighting_motivation TEXT DEFAULT '', -- "Natural sun, no artificial"
    weather TEXT DEFAULT '',
    atmosphere TEXT DEFAULT '',
    temperature TEXT DEFAULT '',      -- NEW: "Freezing, -60°C"
    tactile_detail TEXT DEFAULT '',   -- NEW: "Rough regolith, crunchy"

    -- Audio Design (NEW)
    ambient_sound TEXT DEFAULT '',
    sound_design_notes TEXT DEFAULT '', -- "Muffled, lonely, mechanical"
    silence_usage TEXT DEFAULT '',    -- "Hold silence after discovery"

    -- Mood & Emotion (Enhanced)
    mood TEXT,
    mood_evolution TEXT DEFAULT '',   -- How mood changes through scene

    -- Cinematic References (NEW)
    reference_films TEXT DEFAULT '',  -- "Interstellar cornfield scene"
    reference_photographers TEXT DEFAULT '', -- "Gregory Crewdson"

    -- Automatic Inference (NEW)
    inferred_metadata TEXT DEFAULT '', -- JSON of auto-filled fields
    user_overrides TEXT DEFAULT '',    -- JSON of user corrections

    -- Overrides (kept)
    override_art_style TEXT DEFAULT '',
    override_color_palette TEXT DEFAULT '',

    -- Continuity (kept)
    anchor_cut_id TEXT DEFAULT '',
    scene_continuity_log TEXT DEFAULT '',
    location_master_url TEXT DEFAULT '',

    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- ============================================================================
-- SHOTS - Camera Language & Visual Storytelling
-- ============================================================================
CREATE TABLE IF NOT EXISTS shots_v2 (
    id TEXT PRIMARY KEY,
    scene_id TEXT,
    shot_number INTEGER,
    description TEXT,

    -- Narrative Purpose (NEW)
    shot_purpose TEXT DEFAULT '',     -- "Establish scale", "Reveal emotion"
    emotional_function TEXT DEFAULT '', -- "Build tension", "Release"
    story_information TEXT DEFAULT '', -- What this shot tells the audience

    -- Camera Language (Enhanced)
    camera_angle TEXT,
    camera_height TEXT DEFAULT '',
    camera_movement TEXT,
    camera_distance TEXT DEFAULT '',
    camera_motivation TEXT DEFAULT '', -- NEW: "POV shows isolation"
    shot_type_name TEXT DEFAULT '',   -- NEW: "Extreme Wide", "Dutch Angle"

    -- Lens & Technical (Enhanced)
    lens_type TEXT DEFAULT '',
    lens_character TEXT DEFAULT '',   -- NEW: "Clinical, sharp" vs "Dreamy, soft"
    depth_of_field TEXT DEFAULT '',
    focus_point TEXT DEFAULT '',
    focus_motivation TEXT DEFAULT '', -- NEW: "Eyes = emotion"

    -- Composition (Enhanced)
    subject TEXT,
    subject_position TEXT DEFAULT '',
    composition TEXT,
    composition_theory TEXT DEFAULT '', -- NEW: "Rule of thirds", "Centered symmetry"
    visual_balance TEXT DEFAULT '',   -- NEW: "Weighted left, tension right"
    foreground TEXT DEFAULT '',
    background TEXT DEFAULT '',
    negative_space TEXT DEFAULT '',   -- NEW: "Sky dominates top 2/3"

    -- Visual Storytelling (NEW)
    visual_subtext TEXT DEFAULT '',   -- "Small figure = vulnerability"
    symbolic_elements TEXT DEFAULT '', -- "Dust = life emerging"
    color_contrast TEXT DEFAULT '',   -- "Warm subject vs cool bg"

    -- Movement & Energy (NEW)
    movement_energy TEXT DEFAULT '',  -- "Static = contemplation"
    eye_flow TEXT DEFAULT '',         -- "Left to right scan"

    -- Cinematic References (NEW)
    reference_shots TEXT DEFAULT '',  -- "Blade Runner 2049 desert walk"

    -- Overrides (kept)
    override_mood TEXT,
    override_lighting TEXT DEFAULT '',
    override_art_style TEXT DEFAULT '',

    FOREIGN KEY (scene_id) REFERENCES scenes_v2(id)
);

-- ============================================================================
-- CUTS - Atomic Moments & Edit Beats
-- ============================================================================
CREATE TABLE IF NOT EXISTS cuts_v2 (
    id TEXT PRIMARY KEY,
    shot_id TEXT,
    cut_number INTEGER,
    action TEXT,

    -- Narrative Beat (NEW)
    beat_purpose TEXT DEFAULT '',     -- "Moment of realization"
    emotional_peak TEXT DEFAULT '',   -- "Shock → Wonder"
    story_revelation TEXT DEFAULT '', -- "Water = life possible"
    subtext TEXT DEFAULT '',          -- What's unsaid but felt

    -- Character Performance (Enhanced)
    dialogue TEXT,
    expression TEXT DEFAULT '',
    expression_nuance TEXT DEFAULT '', -- NEW: "Micro-expression: doubt"
    body_language TEXT DEFAULT '',
    gesture TEXT DEFAULT '',
    gaze_direction TEXT DEFAULT '',
    internal_state TEXT DEFAULT '',   -- NEW: "Conflicted, hopeful"

    -- Sensory Detail (NEW)
    tactile_moment TEXT DEFAULT '',   -- "Glove scraping ice"
    temperature_cue TEXT DEFAULT '',  -- "Breath visible"
    sound_moment TEXT DEFAULT '',     -- "Scraping stops, silence"

    -- Beat & Timing (Enhanced)
    beat_type TEXT,
    duration_hint TEXT DEFAULT '',
    hold_emphasis TEXT DEFAULT '',    -- NEW: "Hold 3 sec on face"
    rhythm_note TEXT DEFAULT '',      -- NEW: "Punctuation in sequence"
    transition TEXT DEFAULT 'cut',
    transition_motivation TEXT DEFAULT '', -- NEW: "Hard cut = shock"

    -- Continuity (Enhanced)
    prev_cut_ref TEXT DEFAULT '',
    continuity_notes TEXT DEFAULT '',
    character_state TEXT DEFAULT '',
    character_state_change TEXT DEFAULT '', -- NEW: "Clean → dust covered"
    object_tracking TEXT DEFAULT '',
    object_state_change TEXT DEFAULT '', -- NEW: "Scanner off → on"
    lighting_continuity TEXT DEFAULT '',
    spatial_continuity TEXT DEFAULT '', -- NEW: "Matches Cut 2 position"

    -- Edit Chain (Enhanced for i2i)
    edit_target TEXT DEFAULT '',
    spatial_lock TEXT DEFAULT '',
    consistency_anchor TEXT DEFAULT '', -- NEW: Reference cut for coherence

    -- Visual Composition (NEW)
    framing_choice TEXT DEFAULT '',   -- "Tight on hands = intimacy"
    color_moment TEXT DEFAULT '',     -- "Blue ice vs red dust"
    light_quality TEXT DEFAULT '',    -- "Hard shadow reveals texture"

    -- Generation State (kept)
    generated_image_url TEXT DEFAULT '',
    generation_status TEXT DEFAULT 'pending',
    generation_notes TEXT DEFAULT '',

    -- Overrides (kept)
    override_camera_distance TEXT DEFAULT '',
    override_focus_point TEXT DEFAULT '',
    override_lighting TEXT DEFAULT '',
    override_mood TEXT DEFAULT '',

    FOREIGN KEY (shot_id) REFERENCES shots_v2(id)
);

-- ============================================================================
-- NARRATIVE CONTEXT - Story Brain
-- ============================================================================
CREATE TABLE IF NOT EXISTS narrative_context (
    id TEXT PRIMARY KEY,
    project_id TEXT,

    -- Story Arc Tracking
    current_act TEXT DEFAULT 'setup',     -- "setup", "confrontation", "resolution"
    tension_curve TEXT DEFAULT '',        -- JSON: [{scene: 1, tension: 3}, ...]
    emotional_journey TEXT DEFAULT '',    -- JSON: beat-by-beat emotion map

    -- Character Journey (if applicable)
    character_arcs TEXT DEFAULT '',       -- JSON: character development tracking

    -- Visual Continuity
    established_visual_rules TEXT DEFAULT '', -- "Always wide for Mars exterior"
    color_progression TEXT DEFAULT '',    -- "Warm → cool as story darkens"
    motif_tracking TEXT DEFAULT '',       -- Where motifs appear

    -- Pacing Analysis
    scene_durations TEXT DEFAULT '',      -- Estimated timing
    rhythm_pattern TEXT DEFAULT '',       -- "Slow slow FAST slow"

    -- Auto-updated by agents
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- ============================================================================
-- CINEMATIC KNOWLEDGE - Reference Library
-- ============================================================================
CREATE TABLE IF NOT EXISTS cinematic_references (
    id TEXT PRIMARY KEY,
    project_id TEXT,

    -- Film References
    reference_type TEXT,              -- "film", "commercial", "photographer"
    reference_name TEXT,
    reference_aspect TEXT,            -- "color grading", "pacing", "composition"
    application_note TEXT,            -- How it applies to this project

    -- Scene/Shot Links
    linked_nodes TEXT DEFAULT '',     -- JSON: which scenes use this

    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- ============================================================================
-- INDEXES for Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_scenes_project ON scenes_v2(project_id);
CREATE INDEX IF NOT EXISTS idx_shots_scene ON shots_v2(scene_id);
CREATE INDEX IF NOT EXISTS idx_cuts_shot ON cuts_v2(shot_id);
CREATE INDEX IF NOT EXISTS idx_narrative_project ON narrative_context(project_id);
CREATE INDEX IF NOT EXISTS idx_references_project ON cinematic_references(project_id);
