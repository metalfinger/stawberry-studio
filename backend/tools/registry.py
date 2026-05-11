"""
Tool registry — single source of truth for every callable an agent can invoke.

Tools register via the `@tool` decorator:

    from backend.tools.registry import tool

    @tool("update_brief", description="Patch fields on a project's brief")
    async def update_brief(project_id: str, **fields) -> dict:
        ...

The registry exposes:
- `get_tool(name)`             → the callable
- `list_tools()`               → all ids
- `get_schema(name)`           → JSON schema (MCP-compatible)
- `bind_tools_to_pai(agent, ids)` → attach by id to a Pydantic AI Agent

Auto-discovery: importing `backend.tools` walks the package and triggers
decorator side-effects so every module gets a chance to register.
"""
from __future__ import annotations

import inspect
import json
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, get_type_hints

import structlog

log = structlog.get_logger(__name__)


# ============================================================================
# Registry
# ============================================================================

@dataclass
class ToolEntry:
    name: str
    description: str
    fn: Callable[..., Any]
    is_async: bool
    parameters_schema: dict[str, Any] = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)


_REGISTRY: dict[str, ToolEntry] = {}


def _build_param_schema(fn: Callable[..., Any]) -> dict[str, Any]:
    """Best-effort JSON schema from a function signature."""
    sig = inspect.signature(fn)
    try:
        hints = get_type_hints(fn)
    except Exception:
        hints = {}

    properties: dict[str, Any] = {}
    required: list[str] = []

    for pname, param in sig.parameters.items():
        if pname in ("self", "cls"):
            continue
        ann = hints.get(pname, str)
        prop = _annotation_to_schema(ann)
        if param.default is inspect.Parameter.empty:
            required.append(pname)
        else:
            prop["default"] = _json_safe(param.default)
        properties[pname] = prop

    return {
        "type": "object",
        "properties": properties,
        **({"required": required} if required else {}),
    }


def _annotation_to_schema(ann: Any) -> dict[str, Any]:
    """Map a Python type to a tiny JSON-schema fragment. Best-effort."""
    if ann is str:
        return {"type": "string"}
    if ann is int:
        return {"type": "integer"}
    if ann is float:
        return {"type": "number"}
    if ann is bool:
        return {"type": "boolean"}
    if ann is dict or getattr(ann, "__origin__", None) is dict:
        return {"type": "object"}
    if ann is list or getattr(ann, "__origin__", None) is list:
        return {"type": "array", "items": {"type": "string"}}
    return {"type": "string"}


def _json_safe(v: Any) -> Any:
    try:
        json.dumps(v)
        return v
    except TypeError:
        return str(v)


def tool(
    name: str | None = None,
    *,
    description: str | None = None,
    tags: list[str] | None = None,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator: register a callable in the global tool registry."""

    def _decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        tool_name = name or fn.__name__
        desc = description or (inspect.getdoc(fn) or fn.__name__).split("\n")[0]
        if tool_name in _REGISTRY:
            log.warning("tool_re-registered", name=tool_name)
        entry = ToolEntry(
            name=tool_name,
            description=desc,
            fn=fn,
            is_async=inspect.iscoroutinefunction(fn),
            parameters_schema=_build_param_schema(fn),
            tags=list(tags or []),
        )
        _REGISTRY[tool_name] = entry
        return fn

    return _decorator


def get_tool(name: str) -> ToolEntry:
    if name not in _REGISTRY:
        raise KeyError(f"Tool '{name}' not registered. Available: {list(_REGISTRY)}")
    return _REGISTRY[name]


def list_tools(tag: str | None = None) -> list[str]:
    if tag is None:
        return sorted(_REGISTRY)
    return sorted(n for n, e in _REGISTRY.items() if tag in e.tags)


def get_schema(name: str) -> dict[str, Any]:
    """JSON-schema descriptor — MCP-compatible."""
    e = get_tool(name)
    return {
        "name": e.name,
        "description": e.description,
        "inputSchema": e.parameters_schema,
    }


def export_mcp_manifest() -> list[dict[str, Any]]:
    """All tools as a flat MCP-style manifest (for future MCP server mode)."""
    return [get_schema(n) for n in list_tools()]


# ============================================================================
# Pydantic AI binding
# ============================================================================

def bind_tools_to_pai(pai_agent: Any, tool_ids: list[str]) -> None:
    """Attach registered tools to a Pydantic AI Agent by id.

    Bumps `retries` to 3 (default is 1). When the model invents a wrong
    kwarg name pydantic-AI re-validates and asks the model to try again;
    one retry isn't enough for real-world drift (e.g. `update_cut`
    receiving `camera_distance` which belongs on `update_shot`). Three
    gives the model space to self-correct without nuking the chat turn.
    """
    for tid in tool_ids:
        entry = get_tool(tid)
        try:
            pai_agent.tool_plain(entry.fn, retries=3)
        except TypeError:
            # Older pydantic-AI signatures may not support `retries` kwarg.
            pai_agent.tool_plain(entry.fn)
