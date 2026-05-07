"""
Strawberry Studio — structured configuration via pydantic-settings.

All env vars funnel through `Settings`. Logical role names (planner_model,
renderer_image, etc.) decouple agents from concrete model strings — Phase 2
will switch the resolver from "model name as string" to "ProviderRegistry lookup".

Module-level legacy constants (GEMINI_TEXT_MODEL, GEMINI_IMAGE_MODEL_PRO, etc.)
are preserved for existing agents — they delegate to Settings under the hood.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class LLMConfig(BaseSettings):
    """LLM provider keys + per-role model selection."""
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Provider keys
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    google_api_key: str | None = Field(default=None, alias="GOOGLE_API_KEY")  # legacy alias
    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    moonshot_api_key: str | None = Field(default=None, alias="MOONSHOT_API_KEY")
    moonshot_base_url: str = Field(default="https://api.moonshot.ai/v1", alias="MOONSHOT_BASE_URL")

    # Logical roles — best models by default. Cost optimization is later
    # (per user: "use best of best models, cost optimize once fully working").
    # Each can be overridden via the matching env var.
    default_text_model: str = Field(default="gemini-2.5-pro", alias="DEFAULT_TEXT_MODEL")
    # Creative roles → Gemini 2.5 Pro (best tool-calling + vision among your providers).
    # Kimi K2 stays as default_text_model fallback for any non-tool-using role.
    planner_model: str = Field(default="gemini-2.5-pro", alias="PLANNER_MODEL")
    detailer_model: str = Field(default="gemini-2.5-pro", alias="DETAILER_MODEL")
    prompter_model: str = Field(default="gemini-2.5-pro", alias="PROMPTER_MODEL")
    # Vision-required role → Gemini 2.5 Pro (only configured provider with multimodal).
    qa_model: str = Field(default="gemini-2.5-pro", alias="QA_MODEL")
    # Critics → Gemini 2.5 Pro (matches creative roles for consistency + tool-use).
    critic_model: str = Field(default="gemini-2.5-pro", alias="CRITIC_MODEL")

    def role(self, role_name: str) -> str:
        """Resolve a logical role to a model string. Empty fields fall back to default_text_model."""
        value = getattr(self, f"{role_name}_model", "") or ""
        return value or self.default_text_model


class ImageConfig(BaseSettings):
    """Image-generation provider keys + per-role model selection."""
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    fal_api_key: str | None = Field(default=None, alias="FAL_KEY")
    replicate_api_key: str | None = Field(default=None, alias="REPLICATE_API_TOKEN")

    pro_model: str = Field(default="gemini-3-pro-image-preview", alias="GEMINI_IMAGE_MODEL_PRO")
    flash_model: str = Field(default="gemini-3.1-flash-image-preview", alias="GEMINI_IMAGE_MODEL_FLASH")
    fal_text_to_image_model: str = Field(default="fal-ai/nano-banana-pro", alias="FAL_T2I_MODEL")
    fal_image_to_image_model: str = Field(default="fal-ai/nano-banana-pro/edit", alias="FAL_I2I_MODEL")
    element_variant_model: str = Field(default="gemini-2.5-flash-image", alias="ELEMENT_VARIANT_MODEL")

    enable_real_generation: bool = Field(default=False, alias="ENABLE_REAL_IMAGE_GENERATION")


class StorageConfig(BaseSettings):
    """File storage paths."""
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    storage_root: str = Field(default="storage", alias="STORAGE_ROOT")
    generated_dir: str = Field(default="generated", alias="STORAGE_GENERATED_DIR")
    projects_dir: str = Field(default="projects", alias="STORAGE_PROJECTS_DIR")


class CORSConfig(BaseSettings):
    """CORS origin whitelist."""
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    origins_csv: str = Field(
        default="http://localhost:5173,http://localhost:3000",
        alias="CORS_ORIGINS",
    )

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.origins_csv.split(",") if o.strip()]


class Settings(BaseSettings):
    """Top-level settings — composes the per-domain configs."""
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    llm: LLMConfig = Field(default_factory=LLMConfig)
    image: ImageConfig = Field(default_factory=ImageConfig)
    storage: StorageConfig = Field(default_factory=StorageConfig)
    cors: CORSConfig = Field(default_factory=CORSConfig)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings accessor — instantiate once per process."""
    return Settings()


# ============================================================================
# Legacy module-level constants (preserved for existing agents).
# DEPRECATED: import `from backend.config import get_settings` instead and use
# `get_settings().llm.role("planner")` etc. These will be removed in Phase 2.
# ============================================================================

_settings = get_settings()

GEMINI_API_KEY: str | None = _settings.llm.gemini_api_key
GOOGLE_API_KEY: str | None = _settings.llm.google_api_key
FAL_KEY: str | None = _settings.image.fal_api_key

GEMINI_TEXT_MODEL: str = _settings.llm.default_text_model
GEMINI_IMAGE_MODEL_PRO: str = _settings.image.pro_model
GEMINI_IMAGE_MODEL_FLASH: str = _settings.image.flash_model

ENABLE_REAL_IMAGE_GENERATION: bool = _settings.image.enable_real_generation
