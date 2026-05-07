"""
ProviderRegistry — single lookup table for all configured LLM and image providers.

Two query modes:
- by name:  registry.get_llm("gemini")  → GeminiLLM instance
- by role:  registry.llm_for_role("planner") → (provider_instance, "kimi-k2")

Role resolution reads `Settings.llm.role(name)` to produce a model string,
then infers the provider from the model name (kimi-* → kimi, claude-* →
anthropic, gpt-* → openai, gemini-* → gemini).
"""
from __future__ import annotations

from functools import lru_cache

import structlog

from backend.config import Settings, get_settings
from backend.providers.base import ImageProvider, LLMProvider
from backend.providers.image import FalImage, GeminiImage
from backend.providers.llm import AnthropicLLM, GeminiLLM, KimiLLM, OpenAILLM

log = structlog.get_logger(__name__)


def _provider_for_model(model: str) -> str:
    """Infer the provider name from a model string."""
    m = model.lower()
    if m.startswith(("kimi", "moonshot")):
        return "kimi"
    if m.startswith("claude"):
        return "anthropic"
    if m.startswith(("gpt-", "o1-", "o3-")):
        return "openai"
    if m.startswith("gemini") or m.startswith("imagen"):
        return "gemini"
    if m.startswith("fal-ai/"):
        return "fal"
    # Default to default_text_model's provider
    return "gemini"


class ProviderRegistry:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._llm: dict[str, LLMProvider] = {}
        self._image: dict[str, ImageProvider] = {}

    # ---- registration ----

    def register_llm(self, name: str, provider: LLMProvider) -> None:
        self._llm[name] = provider

    def register_image(self, name: str, provider: ImageProvider) -> None:
        self._image[name] = provider

    # ---- by-name lookup ----

    def get_llm(self, name: str) -> LLMProvider:
        if name not in self._llm:
            raise KeyError(f"LLM provider '{name}' not registered. Available: {list(self._llm)}")
        return self._llm[name]

    def get_image(self, name: str) -> ImageProvider:
        if name not in self._image:
            raise KeyError(f"Image provider '{name}' not registered. Available: {list(self._image)}")
        return self._image[name]

    # ---- by-role resolution ----

    def llm_for_role(self, role: str) -> tuple[LLMProvider, str]:
        """Resolve role → (provider_instance, model_string)."""
        model = self.settings.llm.role(role)
        provider_name = _provider_for_model(model)
        return self.get_llm(provider_name), model

    def image_for_role(self, role: str) -> tuple[ImageProvider, str]:
        """Resolve role → (provider_instance, model_string).
        Roles: 'pro' → pro_model, 'flash' → flash_model, 'variant' → element_variant_model.
        """
        ic = self.settings.image
        model = {
            "pro": ic.pro_model,
            "flash": ic.flash_model,
            "variant": ic.element_variant_model,
            "fal_t2i": ic.fal_text_to_image_model,
            "fal_i2i": ic.fal_image_to_image_model,
        }.get(role, ic.pro_model)
        provider_name = _provider_for_model(model)
        return self.get_image(provider_name), model

    def llm_names(self) -> list[str]:
        return list(self._llm)

    def image_names(self) -> list[str]:
        return list(self._image)


# ============================================================================
# Bootstrap
# ============================================================================

def build_registry(settings: Settings | None = None) -> ProviderRegistry:
    """Construct a registry with all configured providers."""
    s = settings or get_settings()
    reg = ProviderRegistry(s)

    # LLMs — always register; missing keys raise lazily on first call.
    reg.register_llm("gemini", GeminiLLM(api_key=s.llm.gemini_api_key))
    reg.register_llm("kimi", KimiLLM(api_key=s.llm.moonshot_api_key, base_url=s.llm.moonshot_base_url))
    reg.register_llm("openai", OpenAILLM(api_key=s.llm.openai_api_key))
    reg.register_llm("anthropic", AnthropicLLM(api_key=s.llm.anthropic_api_key))

    # Image
    reg.register_image("gemini", GeminiImage(api_key=s.llm.gemini_api_key))
    reg.register_image(
        "fal",
        FalImage(
            api_key=s.image.fal_api_key,
            text_to_image_model=s.image.fal_text_to_image_model,
            image_to_image_model=s.image.fal_image_to_image_model,
        ),
    )

    log.info(
        "provider_registry_built",
        llms=reg.llm_names(),
        images=reg.image_names(),
        default_text_model=s.llm.default_text_model,
        pro_image_model=s.image.pro_model,
    )
    return reg


@lru_cache(maxsize=1)
def get_registry() -> ProviderRegistry:
    """Cached registry singleton."""
    return build_registry()
