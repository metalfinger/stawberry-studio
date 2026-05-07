"""
Provider interfaces — universal contract for any LLM or image-gen backend.

Adapters subclass `LLMProvider` or `ImageProvider`. Agents and services depend
only on these interfaces; the concrete provider is resolved through the
`ProviderRegistry` at runtime, keyed by logical role.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any, Literal, TypeVar

from pydantic import BaseModel, Field

# ============================================================================
# LLM types
# ============================================================================

Role = Literal["system", "user", "assistant", "tool"]


class Message(BaseModel):
    role: Role
    content: str
    name: str | None = None
    tool_call_id: str | None = None


class ToolDef(BaseModel):
    """JSON-schema description of a tool an LLM can call."""
    name: str
    description: str
    parameters: dict[str, Any] = Field(default_factory=dict)  # JSON Schema


class ToolCall(BaseModel):
    id: str
    name: str
    arguments: dict[str, Any]


class LLMResponse(BaseModel):
    content: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)
    model: str
    finish_reason: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    raw: dict[str, Any] | None = None


T = TypeVar("T", bound=BaseModel)


class LLMProvider(ABC):
    """All LLM providers implement these four methods."""

    name: str = "abstract"

    @abstractmethod
    async def complete(
        self,
        messages: list[Message],
        *,
        model: str,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        tools: list[ToolDef] | None = None,
        **kwargs: Any,
    ) -> LLMResponse: ...

    @abstractmethod
    async def stream(
        self,
        messages: list[Message],
        *,
        model: str,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        """Yields chunks of generated text. Implementations may yield strings."""
        if False:  # pragma: no cover - typing hint
            yield ""

    @abstractmethod
    async def structured_output(
        self,
        messages: list[Message],
        schema: type[T],
        *,
        model: str,
        temperature: float = 0.0,
        **kwargs: Any,
    ) -> T:
        """Return a validated Pydantic instance. Uses native structured output where available."""

    def models(self) -> list[str]:
        """Optional: list known model identifiers for this provider."""
        return []


# ============================================================================
# Image types
# ============================================================================

class ReferenceImage(BaseModel):
    """A reference image conditioned in a slot (Nano Banana Pro / Gemini 3 Pro Image)."""
    image_url: str
    slot: int = 1
    name: str | None = None
    asset_id: str | None = None


class ImageGenRequest(BaseModel):
    prompt: str
    model: str
    resolution: str = "1024x1024"
    aspect_ratio: str = "1:1"
    num_images: int = 1
    seed: int | None = None
    negative_prompt: str = ""
    reference_images: list[ReferenceImage] = Field(default_factory=list)
    extra: dict[str, Any] = Field(default_factory=dict)  # provider-specific params


class ImageGenResult(BaseModel):
    image_urls: list[str]  # local /storage/generated/... paths
    cost_usd: float = 0.0
    model_used: str
    image_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ImageProvider(ABC):
    """All image-gen providers implement generate (text→image) and edit (image+ref→image)."""

    name: str = "abstract"

    @abstractmethod
    async def generate(self, req: ImageGenRequest) -> ImageGenResult: ...

    @abstractmethod
    async def edit(self, req: ImageGenRequest) -> ImageGenResult:
        """Image-to-image with reference_images present."""

    def models(self) -> list[str]:
        return []


# ============================================================================
# Errors
# ============================================================================

class ProviderError(Exception):
    """Raised by any adapter on upstream failure. Caught at the FastAPI boundary."""

    def __init__(self, provider: str, message: str, *, status: int | None = None):
        super().__init__(f"[{provider}] {message}")
        self.provider = provider
        self.status = status
