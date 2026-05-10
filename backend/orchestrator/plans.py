"""
Plan-as-artifact — the central pattern of the agentic console.

Every multi-step agent action proposes a Plan in chat, waits for user signal,
then executes step-by-step. The Plan is a first-class persisted entity for
audit, replay, and refinement chains.

Public API:
    Plan, PlanItem            — dataclasses
    save_plan(plan)           — persist proposed plan
    load_plan(plan_id)        — load by id
    update_plan_status(id, s) — proposed → approved → executing → done
    update_item_status(...)   — flip individual item status as execution proceeds
    fork_plan(id, feedback)   — create a refinement plan with cumulative feedback
"""
from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any

import structlog

from backend import db
get_async_connection = db.get_async_connection

log = structlog.get_logger(__name__)


# ============================================================================
# Plan kinds — each describes what a single plan item will do
# ============================================================================

ITEM_KIND_REFERENCE_CHECK = "reference_check"        # verify existing ref
ITEM_KIND_REFERENCE_GENERATE = "reference_generate"  # call generate_pose / identity
ITEM_KIND_REFERENCE_REUSE = "reference_reuse"        # use a cached ref as-is
ITEM_KIND_REFERENCE_SWAP = "reference_swap"          # user-initiated reference substitution
ITEM_KIND_RENDER = "render"                          # call image provider for the cut
ITEM_KIND_REGISTER = "register"                      # persist result to reference_pool
ITEM_KIND_PREPROD_FILL = "preprod_fill"              # iris-style gap fill


@dataclass
class PlanItem:
    """One actionable step inside a Plan."""
    id: str
    kind: str
    description: str
    cost_usd: float = 0.0
    eta_s: int = 0
    cached: bool = False
    approved: bool = False  # gates execution; auto-flipped True for cached items
    dependencies: list[str] = field(default_factory=list)
    alternatives: list[dict[str, Any]] = field(default_factory=list)
    payload: dict[str, Any] = field(default_factory=dict)  # opaque; carries context for the executor
    result: dict[str, Any] | None = None
    status: str = "pending"  # pending | approved | running | done | skipped | error
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "PlanItem":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class Plan:
    """Ordered set of PlanItems plus metadata."""
    id: str
    project_id: str
    cut_id: str | None
    items: list[PlanItem] = field(default_factory=list)
    total_cost_usd: float = 0.0
    total_eta_s: int = 0
    feedback_round: int = 0
    parent_plan_id: str | None = None
    feedback: list[str] = field(default_factory=list)  # cumulative feedback chain
    status: str = "proposed"
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    completed_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["items"] = [i.to_dict() if not isinstance(i, dict) else i for i in self.items]
        return d

    def recompute_totals(self) -> None:
        self.total_cost_usd = sum(i.cost_usd for i in self.items)
        self.total_eta_s = sum(i.eta_s for i in self.items if i.status not in ("done", "skipped"))

    def auto_approve(self, threshold_usd: float) -> int:
        """Flip approved=True for items at or below threshold. Returns count."""
        n = 0
        for item in self.items:
            if item.cached or item.cost_usd <= threshold_usd:
                if not item.approved:
                    item.approved = True
                    n += 1
        return n


# ============================================================================
# Persistence
# ============================================================================

def make_plan(
    project_id: str,
    *,
    cut_id: str | None = None,
    items: list[PlanItem] | None = None,
    parent_plan_id: str | None = None,
    feedback: list[str] | None = None,
    feedback_round: int = 0,
) -> Plan:
    plan = Plan(
        id=f"plan_{uuid.uuid4().hex[:12]}",
        project_id=project_id,
        cut_id=cut_id,
        items=items or [],
        parent_plan_id=parent_plan_id,
        feedback=feedback or [],
        feedback_round=feedback_round,
    )
    plan.recompute_totals()
    return plan


def make_item(
    kind: str,
    description: str,
    *,
    cost_usd: float = 0.0,
    eta_s: int = 0,
    cached: bool = False,
    payload: dict[str, Any] | None = None,
    alternatives: list[dict[str, Any]] | None = None,
) -> PlanItem:
    return PlanItem(
        id=f"pi_{uuid.uuid4().hex[:10]}",
        kind=kind,
        description=description,
        cost_usd=cost_usd,
        eta_s=eta_s,
        cached=cached,
        approved=cached,  # cached items auto-approved (free, instant)
        payload=payload or {},
        alternatives=alternatives or [],
    )


async def save_plan(plan: Plan) -> None:
    plan.recompute_totals()
    async with get_async_connection() as conn:
        await conn.execute(
            """
            INSERT INTO plans (id, project_id, cut_id, parent_plan_id, feedback_round,
                               items_json, total_cost_usd, total_eta_s, status,
                               created_at, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                items_json = excluded.items_json,
                total_cost_usd = excluded.total_cost_usd,
                total_eta_s = excluded.total_eta_s,
                status = excluded.status,
                completed_at = excluded.completed_at
            """,
            (
                plan.id,
                plan.project_id,
                plan.cut_id,
                plan.parent_plan_id,
                plan.feedback_round,
                json.dumps({"items": [i.to_dict() for i in plan.items], "feedback": plan.feedback}),
                plan.total_cost_usd,
                plan.total_eta_s,
                plan.status,
                plan.created_at,
                plan.completed_at,
            ),
        )
        await conn.commit()


async def load_plan(plan_id: str) -> Plan | None:
    async with get_async_connection() as conn:
        async with conn.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)) as cur:
            row = await cur.fetchone()
    if not row:
        return None
    d = dict(row)
    payload = json.loads(d["items_json"])
    plan = Plan(
        id=d["id"],
        project_id=d["project_id"],
        cut_id=d["cut_id"],
        items=[PlanItem.from_dict(i) for i in payload.get("items", [])],
        total_cost_usd=d.get("total_cost_usd") or 0.0,
        total_eta_s=d.get("total_eta_s") or 0,
        feedback_round=d.get("feedback_round") or 0,
        parent_plan_id=d.get("parent_plan_id"),
        feedback=payload.get("feedback") or [],
        status=d.get("status") or "proposed",
        created_at=d.get("created_at") or "",
        completed_at=d.get("completed_at"),
    )
    return plan


async def update_plan_status(plan_id: str, status: str) -> None:
    completed_at = datetime.now().isoformat() if status in ("done", "cancelled") else None
    async with get_async_connection() as conn:
        await conn.execute(
            "UPDATE plans SET status = ?, completed_at = ? WHERE id = ?",
            (status, completed_at, plan_id),
        )
        await conn.commit()


async def update_item_status(
    plan_id: str,
    item_id: str,
    status: str,
    *,
    result: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    """Flip a single item's status by re-saving the plan."""
    plan = await load_plan(plan_id)
    if not plan:
        log.warning("update_item_status_not_found", plan_id=plan_id, item_id=item_id)
        return
    for item in plan.items:
        if item.id == item_id:
            item.status = status
            if result is not None:
                item.result = result
            if error is not None:
                item.error = error
            break
    await save_plan(plan)


async def fork_plan_for_refinement(parent: Plan, feedback: str) -> Plan:
    """Create a new Plan that inherits parent's feedback chain plus this round."""
    cumulative = parent.feedback + [feedback]
    new = make_plan(
        project_id=parent.project_id,
        cut_id=parent.cut_id,
        parent_plan_id=parent.id,
        feedback=cumulative,
        feedback_round=parent.feedback_round + 1,
    )
    return new


async def list_plans_for_cut(cut_id: str) -> list[Plan]:
    """All plan rounds for a cut (initial + refinements), oldest first."""
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT * FROM plans WHERE cut_id = ? ORDER BY created_at ASC",
            (cut_id,),
        ) as cur:
            rows = await cur.fetchall()
    plans: list[Plan] = []
    for row in rows:
        d = dict(row)
        payload = json.loads(d["items_json"])
        plans.append(Plan(
            id=d["id"],
            project_id=d["project_id"],
            cut_id=d["cut_id"],
            items=[PlanItem.from_dict(i) for i in payload.get("items", [])],
            total_cost_usd=d.get("total_cost_usd") or 0.0,
            total_eta_s=d.get("total_eta_s") or 0,
            feedback_round=d.get("feedback_round") or 0,
            parent_plan_id=d.get("parent_plan_id"),
            feedback=payload.get("feedback") or [],
            status=d.get("status") or "proposed",
            created_at=d.get("created_at") or "",
            completed_at=d.get("completed_at"),
        ))
    return plans
