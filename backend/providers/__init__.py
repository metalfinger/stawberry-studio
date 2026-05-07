"""
Provider abstraction — universal LLM + image-gen interfaces.

Public entry points:
    from backend.providers import get_registry
    reg = get_registry()
    llm, model = reg.llm_for_role("planner")     # → (provider, "kimi-k2")
    img, model = reg.image_for_role("pro")       # → (gemini, "gemini-3-pro-image")
"""
from backend.providers.base import (
    ImageGenRequest,
    ImageGenResult,
    ImageProvider,
    LLMProvider,
    LLMResponse,
    Message,
    ProviderError,
    ReferenceImage,
    ToolCall,
    ToolDef,
)
from backend.providers.registry import ProviderRegistry, build_registry, get_registry

__all__ = [
    "ImageGenRequest",
    "ImageGenResult",
    "ImageProvider",
    "LLMProvider",
    "LLMResponse",
    "Message",
    "ProviderError",
    "ReferenceImage",
    "ToolCall",
    "ToolDef",
    "ProviderRegistry",
    "build_registry",
    "get_registry",
]
