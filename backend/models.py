"""
Strawberry Studio — canonical Pydantic v2 models.

This is the single source of truth for entity shapes across the backend AND
frontend (frontend/src/api/generated.ts is generated from these via pydantic2ts).

Field names mirror the SQLite schema in backend/database/migrations/001_initial.sql.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

_BASE_CONFIG = ConfigDict(extra="ignore", str_strip_whitespace=True)


# ============================================================================
# Project
# ============================================================================

class ProjectCreate(BaseModel):
    model_config = _BASE_CONFIG
    name: str


class Project(BaseModel):
    model_config = _BASE_CONFIG
    id: str
    name: str
    current_phase: str = "BRIEF"
    stale_phases: str = "[]"
    created_at: str | None = None
    updated_at: str | None = None


# ============================================================================
# Brief — globals that apply to the whole project
# ============================================================================

class Brief(BaseModel):
    model_config = _BASE_CONFIG
    project_id: str
    title: str = ""
    logline: str = ""
    genre: str = ""
    tone: str = ""
    target_audience: str = ""
    key_themes: str = ""
    art_style: str = ""
    color_palette: str = ""
    aspect_ratio: str = "16:9"
    render_quality: str = ""
    lighting_style: str = ""
    world_logic: str = ""
    era_setting: str = ""
    reference_films: str = ""
    reference_artists: str = ""
    negative_prompts: str = ""
    character_design_notes: str = ""
    environment_design_notes: str = ""


class BriefUpdate(BaseModel):
    model_config = _BASE_CONFIG
    title: str | None = None
    logline: str | None = None
    genre: str | None = None
    tone: str | None = None
    target_audience: str | None = None
    key_themes: str | None = None
    art_style: str | None = None
    color_palette: str | None = None
    aspect_ratio: str | None = None
    render_quality: str | None = None
    lighting_style: str | None = None
    world_logic: str | None = None
    era_setting: str | None = None
    reference_films: str | None = None
    reference_artists: str | None = None
    negative_prompts: str | None = None
    character_design_notes: str | None = None
    environment_design_notes: str | None = None


# ============================================================================
# Scene / Shot / Cut
# ============================================================================

class Scene(BaseModel):
    model_config = _BASE_CONFIG
    id: str
    project_id: str
    scene_number: int
    title: str
    description: str | None = None
    location: str | None = None
    location_detail: str = ""
    time_of_day: str | None = None
    lighting: str | None = None
    lighting_color: str = ""
    weather: str = ""
    atmosphere: str = ""
    mood: str | None = None
    ambient_sound: str = ""
    override_art_style: str = ""
    override_color_palette: str = ""
    anchor_cut_id: str = ""
    scene_continuity_log: str = ""
    location_master_url: str = ""
    set_decoration: str = ""
    camera_restrictions: str = ""
    key_props_list: str = ""
    blocking_notes: str = ""


class Shot(BaseModel):
    model_config = _BASE_CONFIG
    id: str
    scene_id: str
    shot_number: int
    description: str | None = None
    camera_angle: str | None = None
    camera_height: str = ""
    camera_movement: str | None = None
    camera_distance: str = ""
    lens_type: str = ""
    focal_length_mm: str = ""
    depth_of_field: str = ""
    focus_point: str = ""
    subject: str | None = None
    subject_position: str = ""
    composition: str | None = None
    foreground: str = ""
    background: str = ""
    override_mood: str | None = None
    override_lighting: str = ""
    override_art_style: str = ""
    aspect_ratio_override: str = ""
    filter_effects: str = ""
    speed_ramp: str = ""


class Cut(BaseModel):
    model_config = _BASE_CONFIG
    id: str
    shot_id: str
    cut_number: int
    action: str | None = None
    story_description: str = ""
    dialogue: str | None = None
    expression: str = ""
    body_language: str = ""
    gesture: str = ""
    gaze_direction: str = ""
    beat_type: str | None = None
    duration_hint: str = ""
    transition: str = "cut"
    prev_cut_ref: str = ""
    continuity_notes: str = ""
    character_state: str = ""
    object_tracking: str = ""
    lighting_continuity: str = ""
    edit_target: str = ""
    spatial_lock: str = ""
    generated_image_url: str = ""
    generation_status: str = "pending"
    generation_notes: str = ""
    override_camera_distance: str = ""
    override_focus_point: str = ""
    override_lighting: str = ""
    override_mood: str = ""
    costume_notes: str = ""
    prop_interaction: str = ""
    emotional_arc: str = ""
    sfx_notes: str = ""
    music_cue: str = ""
    compiled_prompt: str = ""
    image_slots: str = "{}"


# ============================================================================
# Asset (characters, locations, props, frames)
# ============================================================================

class Asset(BaseModel):
    model_config = _BASE_CONFIG
    id: str
    project_id: str
    type: str  # 'character' | 'location' | 'prop' | 'frame'
    name: str
    description: str | None = None
    appearance: str | None = None
    style: str | None = None
    metadata: str | None = None
    master_id: str | None = None
    variant_diff: str | None = None
    slot_filled: int = 0
    image_url: str | None = None
    consistency_tokens: str = ""
    distinctive_features: str = ""
    wardrobe_lock: str = ""
    suggested_prompt: str = ""
    source_type: str = "global"
    source_cut_id: str | None = None
    generation_chain: str = "[]"
    face_embedding_url: str | None = None
    created_at: str | None = None


class AssetLink(BaseModel):
    model_config = _BASE_CONFIG
    id: str
    asset_id: str
    node_type: str  # 'scene' | 'shot' | 'cut'
    node_id: str
    usage: str = "primary"
    variant_notes: str | None = None


# ============================================================================
# Element generation (master + variants)
# ============================================================================

class ElementMaster(BaseModel):
    model_config = _BASE_CONFIG
    id: str
    asset_id: str
    element_type: str
    master_image_url: str | None = None
    master_prompt: str | None = None
    master_generation_params: str | None = None
    background_type: str = "white"
    view_type: str | None = None
    resolution: str = "2048x2048"
    aspect_ratio: str = "1:1"
    status: str = "pending"
    error_message: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    is_active: bool = False
    generation_request_id: str | None = None
    candidate_group_id: str | None = None


class ElementVariant(BaseModel):
    model_config = _BASE_CONFIG
    id: str
    master_id: str
    variant_type: str
    variant_description: str | None = None
    image_url: str | None = None
    prompt: str | None = None
    generation_method: str = "image_to_image"
    reference_image_id: str | None = None
    generation_params: str | None = None
    status: str = "pending"
    error_message: str | None = None
    is_active: bool = True
    created_at: str | None = None


class GenerationRequest(BaseModel):
    model_config = _BASE_CONFIG
    id: str
    project_id: str
    target_type: str  # 'master' | 'variant' | 'cut'
    target_asset_id: str | None = None
    target_cut_id: str | None = None
    prompt: str
    model: str = "gemini-3-pro-image"
    method: str = "text_to_image"
    reference_image_url: str | None = None
    reference_images: str | None = None
    params: str | None = None
    status: str = "queued"
    progress_percentage: int = 0
    current_step: str | None = None
    output_image_url: str | None = None
    output_file_path: str | None = None
    output_metadata: str | None = None
    error_message: str | None = None
    cost_usd: float | None = None
    started_at: str | None = None
    completed_at: str | None = None
    created_at: str | None = None
    saved_to_master_id: str | None = None
    saved_to_variant_id: str | None = None
    candidate_group_id: str | None = None


# ============================================================================
# Chat
# ============================================================================

class ChatMessage(BaseModel):
    model_config = _BASE_CONFIG
    role: str  # 'user' | 'assistant' | 'tool' | 'system'
    content: str
    agent_name: str | None = None
    timestamp: str | None = None
    phase: str | None = None
    is_noise: bool = False


class ChatRequest(BaseModel):
    model_config = _BASE_CONFIG
    message: str


# ============================================================================
# Composite / response shapes
# ============================================================================

class ShotWithCuts(Shot):
    cuts: list[Cut] = Field(default_factory=list)
    assets: list[Asset] | None = None


class SceneWithShots(Scene):
    shots: list[ShotWithCuts] = Field(default_factory=list)
    assets: list[Asset] | None = None


class Blueprint(BaseModel):
    model_config = _BASE_CONFIG
    project_id: str
    brief: Brief | None = None
    scenes: list[SceneWithShots] = Field(default_factory=list)


class AssetMaster(Asset):
    """Master asset with embedded variants and linked nodes for the assets endpoint."""
    variants: list[Asset] = Field(default_factory=list)
    linked_nodes: list[AssetLink] = Field(default_factory=list)


class AssetsResponse(BaseModel):
    model_config = _BASE_CONFIG
    characters: list[AssetMaster] = Field(default_factory=list)
    locations: list[AssetMaster] = Field(default_factory=list)
    props: list[AssetMaster] = Field(default_factory=list)
    frames: list[AssetMaster] = Field(default_factory=list)


# ============================================================================
# Errors (structured)
# ============================================================================

class APIError(BaseModel):
    model_config = _BASE_CONFIG
    error: str
    detail: str | None = None
    code: str | None = None
    context: dict[str, Any] | None = None
