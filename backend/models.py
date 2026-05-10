"""
Strawberry Studio — Pydantic v2 models for the public REST surface.

Trimmed to ONLY the models actually consumed by routes (Project,
ProjectCreate, Brief, BriefUpdate). The rest of the codebase reads
DB rows directly as dicts via `from backend import db`. Earlier
versions of this file shipped 20+ classes covering Scene/Shot/Cut/
Asset/Blueprint/AssetMaster/etc — all dead, all deleted.

Field names mirror the SQLite schema in
backend/database/migrations/001_initial.sql.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

_BASE_CONFIG = ConfigDict(extra="ignore", str_strip_whitespace=True)


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
