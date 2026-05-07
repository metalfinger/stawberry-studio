"""
Anthropic (Claude) LLM adapter.
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


class AnthropicLLM(LLMProvider):
    name = "anthropic"

    def __init__(self, *, api_key: str | None) -> None:
        self.api_key = api_key

    def _client(self):
        from anthropic import AsyncAnthropic

        if not self.api_key:
            raise ProviderError(self.name, "API key not configured")
        return AsyncAnthropic(api_key=self.api_key)

    @staticmethod
    def _split(messages: list[Message]) -> tuple[str, list[dict]]:
        """Anthropic takes `system` separately and the rest as conversation."""
        system_parts: list[str] = []
        rest: list[dict] = []
        for m in messages:
            if m.role == "system":
                system_parts.append(m.content)
            else:
                # Anthropic only allows user/assistant in messages
                role = "user" if m.role == "tool" else m.role
                rest.append({"role": role, "content": m.content})
        return ("\n\n".join(system_parts), rest)

    @staticmethod
    def _to_anth_tools(tools: list[ToolDef] | None) -> list[dict] | None:
        if not tools:
            return None
        return [
            {
                "name": t.name,
                "description": t.description,
                "input_schema": t.parameters or {"type": "object", "properties": {}},
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
        system, conv = self._split(messages)
        try:
            resp = await client.messages.create(
                model=model,
                system=system or None,
                messages=conv,
                temperature=temperature,
                max_tokens=max_tokens or 4096,
                tools=self._to_anth_tools(tools),
                **kwargs,
            )
        except Exception as e:
            raise ProviderError(self.name, str(e)) from e

        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        for block in resp.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_calls.append(
                    ToolCall(id=block.id, name=block.name, arguments=block.input or {})
                )

        return LLMResponse(
            content="".join(text_parts),
            tool_calls=tool_calls,
            model=resp.model,
            finish_reason=resp.stop_reason,
            input_tokens=resp.usage.input_tokens,
            output_tokens=resp.usage.output_tokens,
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
        system, conv = self._split(messages)
        try:
            async with client.messages.stream(
                model=model,
                system=system or None,
                messages=conv,
                temperature=temperature,
                max_tokens=max_tokens or 4096,
                **kwargs,
            ) as stream:
                async for text in stream.text_stream:
                    yield text
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
        # Anthropic uses tool-call coercion for structured output.
        tool = ToolDef(
            name="emit_result",
            description=f"Emit the final result conforming to {schema.__name__}.",
            parameters=schema.model_json_schema(),
        )
        resp = await self.complete(
            messages,
            model=model,
            temperature=temperature,
            tools=[tool],
            tool_choice={"type": "tool", "name": "emit_result"},
            **kwargs,
        )
        if not resp.tool_calls:
            raise ProviderError(self.name, "structured_output: model returned no tool call")
        return schema.model_validate(resp.tool_calls[0].arguments)

    def models(self) -> list[str]:
        return [
            "claude-opus-4-7",
            "claude-sonnet-4-6",
            "claude-haiku-4-5-20251001",
        ]
