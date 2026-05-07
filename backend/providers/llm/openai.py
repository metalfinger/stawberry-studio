"""
OpenAI-compatible LLM adapter.

Works for: OpenAI, Kimi (Moonshot), and any other OpenAI-compatible endpoint
(DeepSeek, Together, vLLM, Ollama-OpenAI). Subclass with a different base_url
to point at the alternate provider.
"""
from __future__ import annotations

import json
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


class OpenAILLM(LLMProvider):
    name = "openai"

    def __init__(
        self,
        *,
        api_key: str | None,
        base_url: str | None = None,
        provider_name: str = "openai",
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url
        self.name = provider_name

    def _client(self):
        from openai import AsyncOpenAI

        if not self.api_key:
            raise ProviderError(self.name, "API key not configured")
        return AsyncOpenAI(api_key=self.api_key, base_url=self.base_url)

    @staticmethod
    def _to_oa_messages(messages: list[Message]) -> list[dict]:
        out: list[dict] = []
        for m in messages:
            d: dict = {"role": m.role, "content": m.content}
            if m.name:
                d["name"] = m.name
            if m.tool_call_id:
                d["tool_call_id"] = m.tool_call_id
            out.append(d)
        return out

    @staticmethod
    def _to_oa_tools(tools: list[ToolDef] | None) -> list[dict] | None:
        if not tools:
            return None
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters or {"type": "object", "properties": {}},
                },
            }
            for t in tools
        ]

    async def complete(
        self,
        messages: list[Message],
        *,
        model: str,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        tools: list[ToolDef] | None = None,
        **kwargs: Any,
    ) -> LLMResponse:
        client = self._client()
        try:
            resp = await client.chat.completions.create(
                model=model,
                messages=self._to_oa_messages(messages),
                temperature=temperature,
                max_tokens=max_tokens,
                tools=self._to_oa_tools(tools),
                **kwargs,
            )
        except Exception as e:
            raise ProviderError(self.name, str(e)) from e

        choice = resp.choices[0]
        msg = choice.message
        tool_calls: list[ToolCall] = []
        if getattr(msg, "tool_calls", None):
            for tc in msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {"_raw": tc.function.arguments}
                tool_calls.append(ToolCall(id=tc.id, name=tc.function.name, arguments=args))

        usage = resp.usage
        return LLMResponse(
            content=msg.content or "",
            tool_calls=tool_calls,
            model=resp.model,
            finish_reason=choice.finish_reason,
            input_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            output_tokens=getattr(usage, "completion_tokens", 0) or 0,
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
        try:
            stream = await client.chat.completions.create(
                model=model,
                messages=self._to_oa_messages(messages),
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
                **kwargs,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    yield delta.content
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
        try:
            # Use response_format=json_schema if the model supports it,
            # otherwise fall back to instructions + JSON mode.
            resp = await client.chat.completions.create(
                model=model,
                messages=self._to_oa_messages(messages),
                temperature=temperature,
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": schema.__name__,
                        "schema": schema.model_json_schema(),
                        "strict": False,
                    },
                },
                **kwargs,
            )
            text = resp.choices[0].message.content or "{}"
            return schema.model_validate_json(text)
        except Exception as e:
            raise ProviderError(self.name, str(e)) from e

    def models(self) -> list[str]:
        if self.name == "kimi":
            return ["kimi-k2", "moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k"]
        return ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-mini"]


class KimiLLM(OpenAILLM):
    """Moonshot Kimi via OpenAI-compatible endpoint."""

    def __init__(self, *, api_key: str | None, base_url: str = "https://api.moonshot.ai/v1") -> None:
        super().__init__(api_key=api_key, base_url=base_url, provider_name="kimi")
