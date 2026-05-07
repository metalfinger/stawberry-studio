"""
Pydantic AI runner — turns an AgentSpec + RunContext into a callable agent.

Provider routing:
- model name like "gemini-3-pro-preview" → google-genai backend
- "kimi-*"                                → OpenAI-compat backend with Moonshot base_url
- "claude-*"                              → Anthropic backend
- "gpt-*"                                  → OpenAI backend

All four are funneled through Pydantic AI's `pydantic_ai.models.*` adapters so
the agent code itself is provider-agnostic — only the model object differs.
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import structlog
from pydantic_ai import Agent

from backend.config import get_settings
from backend.orchestrator.agent_spec import AgentSpec, load_agent_spec
from backend.orchestrator.events import RunContext, log_event

log = structlog.get_logger(__name__)


def _make_pai_model(model: str):
    """Build the right pydantic_ai model object for a given model string."""
    s = get_settings()
    m = model.lower()

    if m.startswith("gemini") or m.startswith("imagen"):
        from pydantic_ai.models.google import GoogleModel
        from pydantic_ai.providers.google import GoogleProvider

        api_key = s.llm.gemini_api_key or s.llm.google_api_key
        return GoogleModel(model, provider=GoogleProvider(api_key=api_key))

    if m.startswith("claude"):
        from pydantic_ai.models.anthropic import AnthropicModel
        from pydantic_ai.providers.anthropic import AnthropicProvider

        return AnthropicModel(model, provider=AnthropicProvider(api_key=s.llm.anthropic_api_key))

    if m.startswith(("kimi", "moonshot")):
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.openai import OpenAIProvider

        return OpenAIChatModel(
            model,
            provider=OpenAIProvider(
                api_key=s.llm.moonshot_api_key,
                base_url=s.llm.moonshot_base_url,
            ),
        )

    # Default: OpenAI / OpenAI-compatible
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    return OpenAIChatModel(model, provider=OpenAIProvider(api_key=s.llm.openai_api_key))


def build_pai_agent(spec: AgentSpec, *, system_prompt_overrides: dict[str, str] | None = None) -> Agent:
    """Build a Pydantic AI Agent from a declarative spec — prompt + tools wired in."""
    # Trigger tool registry side-effects (decorators register on import).
    import backend.tools  # noqa: F401  pylint: disable=unused-import
    from backend.tools.registry import bind_tools_to_pai

    s = get_settings()
    model_name = s.llm.role(spec.model_role)
    model = _make_pai_model(model_name)

    raw_prompt = spec.load_prompt() if spec.system_prompt_path else ""
    if system_prompt_overrides:
        try:
            raw_prompt = raw_prompt.format(**system_prompt_overrides)
        except KeyError as e:
            log.warning("prompt_format_missing_var", agent_id=spec.id, missing=str(e))

    agent = Agent(
        model=model,
        system_prompt=raw_prompt or f"You are {spec.role or spec.id}.",
    )

    if spec.tools:
        bind_tools_to_pai(agent, spec.tools)

    log.info(
        "pai_agent_built",
        agent_id=spec.id,
        model=model_name,
        prompt_len=len(raw_prompt),
        tool_count=len(spec.tools),
    )
    return agent


async def run_agent(
    agent_id: str,
    user_message: str,
    *,
    project_id: str = "",
    phase: str = "",
    prompt_vars: dict[str, str] | None = None,
    history: list[Any] | None = None,
) -> dict[str, Any]:
    """One-shot agent run: send a user message, get a structured response."""
    spec = load_agent_spec(agent_id)
    ctx = RunContext(project_id=project_id, phase=phase, agent_id=agent_id)
    pai_agent = build_pai_agent(spec, system_prompt_overrides=prompt_vars)

    await log_event(ctx, "run_start", {"user_message_preview": user_message[:200]})
    history_arg = history or []
    if history_arg:
        from pydantic_ai.messages import ModelRequest, SystemPromptPart
        rendered_system = ""
        if hasattr(pai_agent, "_system_prompts"):
            sp = pai_agent._system_prompts
            rendered_system = sp[0] if isinstance(sp, (list, tuple)) and sp else (sp or "")
        if rendered_system:
            history_arg = [ModelRequest(parts=[SystemPromptPart(content=rendered_system)])] + list(history_arg)
    try:
        result = await pai_agent.run(user_message, message_history=history_arg)
    except Exception as e:
        await log_event(ctx, "error", {"message": str(e), "type": type(e).__name__})
        raise

    output_text = getattr(result, "output", None) or getattr(result, "data", None) or ""
    await log_event(ctx, "agent_message", {"content": str(output_text)[:2000]})
    await log_event(ctx, "run_end", {"len": len(str(output_text))})

    return {
        "run_id": ctx.run_id,
        "agent_id": agent_id,
        "output": str(output_text),
        "messages": result.all_messages() if hasattr(result, "all_messages") else None,
    }


async def stream_agent(
    agent_id: str,
    user_message: str,
    *,
    project_id: str = "",
    phase: str = "",
    prompt_vars: dict[str, str] | None = None,
    history: list[Any] | None = None,
) -> AsyncIterator[str]:
    """Stream chunks from the agent. Yields strings.

    Logs tool_call and agent_message events from the run's full message list
    after streaming completes, so the agent_events table captures the work
    the agent actually did (not just run_start/run_end bookends).
    """
    spec = load_agent_spec(agent_id)
    ctx = RunContext(project_id=project_id, phase=phase, agent_id=agent_id)
    pai_agent = build_pai_agent(spec, system_prompt_overrides=prompt_vars)

    history_len = len(history) if history else 0
    await log_event(
        ctx,
        "run_start",
        {"user_message_preview": user_message[:200], "stream": True, "history_len": history_len},
    )

    final_text = ""
    last_resp = None
    try:
        # Use agent.run() (not run_stream) so the full tool-call loop executes.
        # run_stream halts after the first model response, which means tool calls
        # never actually run when the model calls a tool — bug observed with
        # Berry/Sage/etc. silently "logging" without writing to the DB.
        #
        # CRITICAL: Pydantic AI drops the agent's `system_prompt` when
        # `message_history` is provided unless the first ModelRequest contains
        # a SystemPromptPart. Inject one here so every turn has fresh project
        # context (project_id, brief_json, next_action) and tool instructions.
        history_arg = history or []
        if history_arg:
            from pydantic_ai.messages import ModelRequest, SystemPromptPart
            rendered_system = ""
            if hasattr(pai_agent, "_system_prompts"):
                sp = pai_agent._system_prompts
                rendered_system = sp[0] if isinstance(sp, (list, tuple)) and sp else (sp or "")
            if rendered_system:
                # Prepend a system-only ModelRequest so PA respects it.
                history_arg = [ModelRequest(parts=[SystemPromptPart(content=rendered_system)])] + list(history_arg)
        last_resp = await pai_agent.run(user_message, message_history=history_arg)
        out = last_resp.output if hasattr(last_resp, "output") else str(last_resp)
        final_text = out if isinstance(out, str) else str(out)
        if final_text:
            yield final_text
    finally:
        # After the stream ends, walk the full message list and log tool calls
        # + the final assistant text. This is what makes the event log useful
        # for debugging runs.
        try:
            if last_resp is not None:
                from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart

                msgs = last_resp.all_messages() if hasattr(last_resp, "all_messages") else []
                for msg in msgs:
                    if isinstance(msg, ModelResponse):
                        for part in msg.parts:
                            if isinstance(part, ToolCallPart):
                                await log_event(
                                    ctx,
                                    "tool_call",
                                    {"name": part.tool_name, "args": _safe_args(part.args)},
                                )
        except Exception as e:  # noqa: BLE001
            log.warning("stream_post_log_failed", error=str(e))

        if final_text:
            await log_event(ctx, "agent_message", {"content": final_text[:2000]})
        await log_event(ctx, "run_end", {"len": len(final_text)})


def _safe_args(args: Any) -> Any:
    """Best-effort JSON-friendly args for the event log."""
    if args is None:
        return None
    if isinstance(args, (dict, list, str, int, float, bool)):
        return args
    try:
        import json as _json

        return _json.loads(str(args)) if isinstance(args, str) else str(args)
    except Exception:  # noqa: BLE001
        return str(args)
