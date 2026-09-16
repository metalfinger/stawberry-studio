"""Provider registry: role resolution + adapter wiring."""
import pytest

from backend.providers.registry import _provider_for_model, build_registry


def test_model_to_provider_inference():
    assert _provider_for_model("gemini-3-flash-preview") == "gemini"
    assert _provider_for_model("kimi-k2-0905-preview") == "kimi"
    assert _provider_for_model("moonshot-v1-128k") == "kimi"
    assert _provider_for_model("claude-haiku-4-5-20251001") == "anthropic"
    assert _provider_for_model("gpt-4o-mini") == "openai"
    assert _provider_for_model("o1-mini") == "openai"
    assert _provider_for_model("fal-ai/nano-banana-pro") == "fal"
    assert _provider_for_model("unknown-thing") == "gemini"  # default fallback


def test_registry_lists_all_providers():
    reg = build_registry()
    assert set(reg.llm_names()) == {"gemini", "kimi", "openai", "anthropic"}
    assert set(reg.image_names()) == {"gemini", "fal"}


def test_role_resolves_to_provider_pair():
    reg = build_registry()
    # Default text model is Gemini (per Settings default)
    provider, model = reg.llm_for_role("planner")
    assert provider.name == "gemini"
    assert model.startswith("gemini")
