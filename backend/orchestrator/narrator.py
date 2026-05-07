"""
Narrator — emits typed Console messages over the chat WebSocket.

Replaces plain-text streaming with structured messages that the new Console
renders as dedicated components: TodoList, Plan, Image, ReferenceCard, etc.

Each message gets a stable `message_id` so subsequent updates patch by id
(e.g. flipping a plan item from pending → done) without resending the
entire message.

Usage from an agent:
    narrator = Narrator(ws_send_fn)
    msg_id = await narrator.plan(plan)
    await narrator.update_plan_item(msg_id, plan_item_id, status="done", result={...})
    await narrator.image(url, caption="cut 2 v1")
    await narrator.actions([
        Action("Approve", intent="approve_plan", payload={"plan_id": plan.id}, primary=True),
        Action("Modify", intent="modify_plan"),
    ])
"""
from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Awaitable, Callable

import structlog

from backend.orchestrator.bus import bus
from backend.orchestrator.plans import Plan, PlanItem

log = structlog.get_logger(__name__)


# ============================================================================
# Action — for action button rows
# ============================================================================

@dataclass
class Action:
    label: str
    intent: str
    icon: str | None = None
    primary: bool = False
    payload: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        d = {"label": self.label, "intent": self.intent}
        if self.icon: d["icon"] = self.icon
        if self.primary: d["primary"] = True
        if self.payload: d["payload"] = self.payload
        return d


# ============================================================================
# Narrator
# ============================================================================

class Narrator:
    """Per-project helper that emits typed Console messages.

    Constructed with the project_id; it publishes to the ProjectBus so any
    backend code (route handler, orchestrator, tool, batch runner) can emit
    without holding the WebSocket directly. The chat route subscribes the
    socket to the bus on connect — broadcast and decoupled.

    Backwards-compat: if a `send` callable is passed it's still respected
    so older call sites keep working until migrated.
    """

    def __init__(
        self,
        project_id_or_send: "str | Callable[[dict[str, Any]], Awaitable[None]]",
        parent_message_id: str | None = None,
    ):
        if callable(project_id_or_send):
            # Legacy: direct sink. Bus path inactive.
            self._project_id: str | None = None
            self._send: Callable[[dict[str, Any]], Awaitable[None]] | None = project_id_or_send
        else:
            self._project_id = project_id_or_send
            self._send = None
        self.parent_message_id = parent_message_id
        self.last_message_id: str | None = None

    # legacy shim; some sites read `narrator.send` directly
    @property
    def send(self):  # noqa: D401
        return self._send

    @staticmethod
    def _new_id() -> str:
        return f"msg_{uuid.uuid4().hex[:12]}"

    @staticmethod
    def _ts() -> str:
        return datetime.now().isoformat()

    async def _emit(self, payload: dict[str, Any]) -> str:
        payload.setdefault("message_id", self._new_id())
        payload.setdefault("timestamp", self._ts())
        if self.parent_message_id:
            payload.setdefault("parent_message_id", self.parent_message_id)
        if self._send is not None:
            await self._send(payload)
        elif self._project_id is not None:
            await bus.publish(self._project_id, payload)
        self.last_message_id = payload["message_id"]
        return payload["message_id"]

    # ----- typed message helpers -----

    async def text(self, markdown: str, *, agent_name: str | None = None) -> str:
        return await self._emit({
            "kind": "text",
            "markdown": markdown,
            "agent_name": agent_name,
        })

    async def plan(self, plan: Plan, *, auto_approve_under: float = 0.0) -> str:
        return await self._emit({
            "kind": "plan",
            "plan_id": plan.id,
            "cut_id": plan.cut_id,
            "items": [self._plan_item_dict(i) for i in plan.items],
            "total_cost_usd": plan.total_cost_usd,
            "total_eta_s": plan.total_eta_s,
            "feedback_round": plan.feedback_round,
            "feedback": plan.feedback,
            "auto_approve_under_usd": auto_approve_under,
        })

    @staticmethod
    def _plan_item_dict(item: PlanItem) -> dict[str, Any]:
        return {
            "id": item.id,
            "kind": item.kind,
            "description": item.description,
            "cost_usd": item.cost_usd,
            "eta_s": item.eta_s,
            "cached": item.cached,
            "approved": item.approved,
            "alternatives": item.alternatives,
            "payload": item.payload,
            "status": item.status,
            "result": item.result,
            "error": item.error,
        }

    async def update_plan_item(
        self,
        plan_message_id: str,
        item_id: str,
        *,
        status: str,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        event = {
            "kind": "plan_update",
            "message_id": plan_message_id,
            "item_id": item_id,
            "status": status,
            "result": result,
            "error": error,
            "timestamp": self._ts(),
        }
        if self._send is not None:
            await self._send(event)
        elif self._project_id is not None:
            await bus.publish(self._project_id, event)

    async def image(self, url: str, *, caption: str = "", metadata: dict[str, Any] | None = None) -> str:
        return await self._emit({
            "kind": "image",
            "url": url,
            "caption": caption,
            "metadata": metadata or {},
        })

    async def reference_card(
        self,
        ref: dict[str, Any],
        *,
        status: str = "cached",
        cost_usd: float | None = None,
    ) -> str:
        return await self._emit({
            "kind": "reference_card",
            "ref_id": ref.get("id"),
            "thumb_url": ref.get("image_url"),
            "label": ref.get("label", ""),
            "asset_name": (ref.get("tags") or {}).get("asset_name") or ref.get("asset_name") or "",
            "status": status,
            "cost_usd": cost_usd,
            "ref_metadata": {
                "created_at": ref.get("created_at"),
                "model_used": ref.get("model_used"),
                "prompt_chars": len(ref.get("prompt", "") or ""),
            },
        })

    async def elapsed(
        self,
        label: str,
        *,
        started_at: str | None = None,
        estimated_total_s: int | None = None,
    ) -> str:
        return await self._emit({
            "kind": "elapsed",
            "label": label,
            "started_at": started_at or self._ts(),
            "estimated_total_s": estimated_total_s,
        })

    async def comparison(
        self,
        left_url: str,
        right_url: str,
        *,
        left_label: str = "before",
        right_label: str = "after",
        actions: list[Action] | None = None,
    ) -> str:
        return await self._emit({
            "kind": "comparison",
            "left_url": left_url,
            "right_url": right_url,
            "left_label": left_label,
            "right_label": right_label,
            "actions": [a.to_dict() for a in (actions or [])],
        })

    async def recommendation(
        self,
        primary: dict[str, Any],
        alternatives: list[dict[str, Any]],
        reasoning: str,
    ) -> str:
        return await self._emit({
            "kind": "recommendation",
            "primary": primary,
            "alternatives": alternatives,
            "reasoning": reasoning,
        })

    async def tool_call(
        self,
        name: str,
        args: dict[str, Any],
        *,
        status: str = "running",
        result: Any = None,
        cost_usd: float | None = None,
        latency_ms: int | None = None,
    ) -> str:
        return await self._emit({
            "kind": "tool_call",
            "name": name,
            "args": args,
            "status": status,
            "result": result,
            "cost_usd": cost_usd,
            "latency_ms": latency_ms,
        })

    async def batch_progress(
        self,
        batch_id: str,
        items: list[dict[str, Any]],
        *,
        can_pause: bool = True,
    ) -> str:
        return await self._emit({
            "kind": "batch_progress",
            "batch_id": batch_id,
            "items": items,
            "can_pause": can_pause,
        })

    async def update_batch_item(
        self,
        batch_message_id: str,
        item_id: str,
        *,
        status: str,
        thumb_url: str | None = None,
    ) -> None:
        """Patch a single item inside an existing batch_progress card."""
        event = {
            "kind": "batch_item_update",
            "message_id": batch_message_id,
            "item_id": item_id,
            "status": status,
            "thumb_url": thumb_url,
            "timestamp": self._ts(),
        }
        if self._send is not None:
            await self._send(event)
        elif self._project_id is not None:
            await bus.publish(self._project_id, event)

    async def idle_suggestion(self, reasoning: str, actions: list[Action]) -> str:
        return await self._emit({
            "kind": "idle_suggestion",
            "reasoning": reasoning,
            "actions": [a.to_dict() for a in actions],
        })

    async def activity(self, events: list[dict[str, Any]]) -> str:
        return await self._emit({
            "kind": "activity",
            "events": events,
        })

    async def failure(
        self,
        error: str,
        suggestion: str = "",
        recovery_actions: list[Action] | None = None,
    ) -> str:
        return await self._emit({
            "kind": "failure",
            "error": error,
            "suggestion": suggestion,
            "recovery_actions": [a.to_dict() for a in (recovery_actions or [])],
        })

    async def actions(self, buttons: list[Action], *, prompt: str = "") -> str:
        return await self._emit({
            "kind": "actions",
            "prompt": prompt,
            "buttons": [b.to_dict() for b in buttons],
        })

    async def handoff(
        self,
        *,
        from_agent: str,
        to_agent: str,
        reason: str,
        actions: list[Action] | None = None,
    ) -> str:
        """When one agent passes control to another. Renders as a special card
        with [Approve handoff] / [Stay with current agent] buttons."""
        return await self._emit({
            "kind": "handoff",
            "from_agent": from_agent,
            "to_agent": to_agent,
            "reason": reason,
            "actions": [a.to_dict() for a in (actions or [])],
        })
