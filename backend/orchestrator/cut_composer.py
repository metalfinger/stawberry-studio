"""
Cut Composer — backwards-compatible wrapper around the new planner+executor.

Phase A of the Agentic Console redesign moved compose to a two-step model:
  1. cut_planner.plan_compose_cut(cut_id, feedback) → Plan
  2. cut_executor.execute_plan(plan_id) → ExecuteResult

This file keeps `compose_cut(cut_id, feedback=None)` alive so existing
callers (legacy /compose route, tests, agent tools that haven't migrated
yet) keep working. New code should call the planner + executor directly
to surface the Plan to the user for approval.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, AsyncIterator, Callable

import structlog

from backend.orchestrator.cut_executor import ExecuteResult, execute_plan
from backend.orchestrator.cut_planner import plan_compose_cut
from backend.orchestrator.plans import Plan, PlanItem, save_plan, update_plan_status

log = structlog.get_logger(__name__)


# ============================================================================
# Backwards-compat shims (kept so existing routes / tests keep working)
# ============================================================================

@dataclass
class ComposeStep:
    step: str
    status: str
    detail: dict[str, Any] = field(default_factory=dict)
    ts: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> dict[str, Any]:
        return {"step": self.step, "status": self.status, "detail": self.detail, "ts": self.ts}


@dataclass
class ComposeResult:
    cut_id: str
    image_url: str | None
    score: Any | None  # legacy ContinuityScore — always None now
    attempts: int
    steps: list[ComposeStep]
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "cut_id": self.cut_id,
            "image_url": self.image_url,
            "score": None,
            "attempts": self.attempts,
            "steps": [s.to_dict() for s in self.steps],
            "error": self.error,
        }


def _item_to_step(item: PlanItem) -> ComposeStep:
    """Map a PlanItem to a legacy ComposeStep so callers using the streaming
    WS endpoint keep getting the shape they expect."""
    step_name_map = {
        "reference_check": "pick",
        "reference_reuse": "pick",
        "reference_generate": "preprod",
        "render": "render",
        "register": "register",
    }
    return ComposeStep(
        step=step_name_map.get(item.kind, item.kind),
        status="ok" if item.status == "done" else item.status,
        detail={
            "description": item.description,
            "cost_usd": item.cost_usd,
            **(item.result or {}),
        },
    )


# ============================================================================
# Public API — auto-approve everything (legacy "fire and forget" path)
# ============================================================================

async def compose_cut(
    cut_id: str,
    *,
    feedback: str | None = None,
    on_step: Callable[[ComposeStep], None] | None = None,
) -> ComposeResult:
    """Plan → auto-approve → execute. Equivalent to the old monolithic
    pipeline. New code should use cut_planner + cut_executor directly so the
    plan can be presented to the user for approval before execution.
    """
    steps: list[ComposeStep] = []

    def _emit(s: ComposeStep) -> None:
        steps.append(s)
        if on_step:
            try:
                on_step(s)
            except Exception:
                log.exception("on_step_callback_failed", step=s.step)

    _emit(ComposeStep("bundle", "start", {"cut_id": cut_id}))
    try:
        plan = await plan_compose_cut(cut_id, feedback=feedback)
    except Exception as e:
        log.exception("compose_plan_failed", cut_id=cut_id)
        _emit(ComposeStep("bundle", "error", {"error": str(e)}))
        return ComposeResult(cut_id=cut_id, image_url=None, score=None, attempts=1, steps=steps, error=str(e))

    _emit(ComposeStep("bundle", "ok", {"items": len(plan.items), "total_cost_usd": plan.total_cost_usd}))

    # Auto-approve every item (legacy behaviour).
    for item in plan.items:
        item.approved = True
    await save_plan(plan)
    await update_plan_status(plan.id, "approved")

    # Bridge executor steps to legacy ComposeStep events.
    def _on_step(item: PlanItem):
        _emit(_item_to_step(item))

    result = await execute_plan(plan.id, on_step=_on_step)

    return ComposeResult(
        cut_id=cut_id,
        image_url=result.image_url,
        score=None,
        attempts=1,
        steps=steps,
        error=result.error,
    )


async def stream_compose_cut(cut_id: str, **kwargs) -> AsyncIterator[ComposeStep]:
    """Async-iterator wrapper. Yields each step as it's recorded."""
    queue: asyncio.Queue[ComposeStep | None] = asyncio.Queue()

    def _push(step: ComposeStep) -> None:
        queue.put_nowait(step)

    async def _runner() -> None:
        try:
            await compose_cut(cut_id, on_step=_push, **kwargs)
        finally:
            queue.put_nowait(None)

    task = asyncio.create_task(_runner())
    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            yield item
    finally:
        if not task.done():
            await task
