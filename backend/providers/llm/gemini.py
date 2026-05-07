"""
Google Gemini LLM adapter — uses the modern `google-genai` SDK.
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from backend.providers.base import (
    LLMProvider,
    LLMResponse,
    Message,
    ProviderError,
    T,
    ToolCall,
    ToolDef,
)


class GeminiLLM(LLMProvider):
    name = "gemini"

    def __init__(self, *, api_key: str | None) -> None:
        self.api_key = api_key

    def _client(self):
        from google import genai

        if not self.api_key:
            raise ProviderError(self.name, "API key not configured")
        return genai.Client(api_key=self.api_key)

    @staticmethod
    def _to_gemini_contents(messages: list[Message]) -> tuple[str | None, list[dict]]:
        """Gemini takes a `system_instruction` separately + a list of `contents`."""
        system_parts: list[str] = []
        contents: list[dict] = []
        for m in messages:
            if m.role == "system":
                system_parts.append(m.content)
                continue
            role = "model" if m.role == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": m.content}]})
        return ("\n\n".join(system_parts) or None, contents)

    @staticmethod
    def _to_gemini_tools(tools: list[ToolDef] | None):
        if not tools:
            return None
        from google.genai import types as gtypes

        decls = [
            gtypes.FunctionDeclaration(
                name=t.name,
                description=t.description,
                parameters=t.parameters or {"type": "object", "properties": {}},
            )
            for t in tools
        ]
        return [gtypes.Tool(function_declarations=decls)]

    async def complete(
        self,
        messages: list[Message],
        *,
        model: str,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        tools: list[ToolDef] | None = None,
        thinking_budget: int | None = None,
        **kwargs: Any,
    ) -> LLMResponse:
        client = self._client()
        from google.genai import types as gtypes

        system, contents = self._to_gemini_contents(messages)
        # Gemini 3 / 2.5 models think internally — they consume tokens before
        # producing output. Reserve enough budget by default so callers don't
        # accidentally cap themselves at 0 visible output.
        effective_max = max_tokens if max_tokens is not None else 4096
        if effective_max < 1024 and (model.startswith("gemini-3") or model.startswith("gemini-2.5")):
            effective_max = 2048

        thinking_cfg = None
        if thinking_budget is not None:
            thinking_cfg = gtypes.ThinkingConfig(thinking_budget=thinking_budget)

        config = gtypes.GenerateContentConfig(
            system_instruction=system,
            temperature=temperature,
            max_output_tokens=effective_max,
            tools=self._to_gemini_tools(tools),
            thinking_config=thinking_cfg,
        )
        try:
            resp = await client.aio.models.generate_content(
                model=model, contents=contents, config=config
            )
        except Exception as e:
            raise ProviderError(self.name, str(e)) from e

        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        if resp.candidates:
            for part in resp.candidates[0].content.parts or []:
                if getattr(part, "text", None):
                    text_parts.append(part.text)
                if getattr(part, "function_call", None):
                    fc = part.function_call
                    tool_calls.append(
                        ToolCall(id=fc.id or fc.name, name=fc.name, arguments=dict(fc.args or {}))
                    )

        usage = getattr(resp, "usage_metadata", None)
        return LLMResponse(
            content="".join(text_parts),
            tool_calls=tool_calls,
            model=model,
            finish_reason=str(resp.candidates[0].finish_reason) if resp.candidates else None,
            input_tokens=getattr(usage, "prompt_token_count", 0) or 0,
            output_tokens=getattr(usage, "candidates_token_count", 0) or 0,
        )

    async def stream(
        self,
        messages: list[Message],
        *,
        model: str,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        client = self._client()
        from google.genai import types as gtypes

        system, contents = self._to_gemini_contents(messages)
        config = gtypes.GenerateContentConfig(
            system_instruction=system,
            temperature=temperature,
            max_output_tokens=max_tokens,
        )
        try:
            stream = await client.aio.models.generate_content_stream(
                model=model, contents=contents, config=config
            )
            async for chunk in stream:
                if chunk.text:
                    yield chunk.text
        except Exception as e:
            raise ProviderError(self.name, str(e)) from e

    async def structured_output(
        self,
        messages: list[Message],
        schema: type[T],
        *,
        model: str,
        temperature: float = 0.0,
        **kwargs: Any,
    ) -> T:
        client = self._client()
        from google.genai import types as gtypes

        system, contents = self._to_gemini_contents(messages)
        config = gtypes.GenerateContentConfig(
            system_instruction=system,
            temperature=temperature,
            response_mime_type="application/json",
            response_schema=schema,
        )
        try:
            resp = await client.aio.models.generate_content(
                model=model, contents=contents, config=config
            )
        except Exception as e:
            raise ProviderError(self.name, str(e)) from e
        # google-genai parses into the Pydantic schema if response_schema is provided.
        parsed = getattr(resp, "parsed", None)
        if parsed is not None:
            return parsed  # type: ignore[return-value]
        return schema.model_validate_json(resp.text or "{}")

    def models(self) -> list[str]:
        return [
            "gemini-3-pro-preview",
            "gemini-3-flash-preview",
            "gemini-2.5-pro",
            "gemini-2.5-flash",
        ]
