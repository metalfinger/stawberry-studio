"""Batch route — compose multiple cuts in one go.

Emits a typed BatchProgressCard via the Narrator/bus so the Console can
show overall progress + per-cut status. Honors pause/cancel intents
through the in-process registries owned by `intents.py`.
"""
from __future__ import annotations

import asyncio
import uuid
from typing import Any

import structlog
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

import backend.database.core as db_core
from backend.orchestrator import cut_executor, cut_planner, intents as intent_dispatch
from backend.orchestrator.narrator import Narrator
from backend.orchestrator.plans import save_plan

router = APIRouter(prefix="/api/projects/{project_id}/batch", tags=["batch"])
log = structlog.get_logger(__name__)


class BatchComposeRequest(BaseModel):
    cut_ids: list[str]


@router.post("/compose")
async def batch_compose(
    project_id: str,
    req: BatchComposeRequest,
    background: BackgroundTasks,
) -> dict[str, Any]:
    if not req.cut_ids:
        raise HTTPException(400, "no cut_ids supplied")
    batch_id = uuid.uuid4().hex
    background.add_task(_run_batch, project_id, batch_id, req.cut_ids)
    return {"batch_id": batch_id, "count": len(req.cut_ids)}


async def _run_batch(project_id: str, batch_id: str, cut_ids: list[str]) -> None:
    narrator = Narrator(project_id)
    items = [{"id": cid, "label": f"Cut {cid[-6:]}", "status": "pending"} for cid in cut_ids]
    msg_id = await narrator.batch_progress(batch_id=batch_id, items=items, can_pause=True)
    intent_dispatch._running_batches[batch_id] = asyncio.current_task()  # type: ignore[assignment]
    try:
        for idx, cid in enumerate(cut_ids):
            if batch_id in intent_dispatch._cancelled_batches:
                await narrator.text(f"_Batch `{batch_id[:8]}` cancelled at item {idx + 1}._")
                break
            while batch_id in intent_dispatch._paused_batches:
                await asyncio.sleep(0.5)
                if batch_id in intent_dispatch._cancelled_batches:
                    return
            await narrator.update_batch_item(msg_id, cid, status="running")
            try:
                plan = await cut_planner.plan_compose_cut(cid)
                # auto-approve every item for batch mode
                for it in plan.items:
                    it.approved = True
                await save_plan(plan)
                result = await cut_executor.execute_plan(plan.id)
                await narrator.update_batch_item(
                    msg_id, cid,
                    status="done" if not result.error else "error",
                    thumb_url=result.image_url,
                )
            except Exception as e:  # noqa: BLE001
                log.exception("batch_item_failed", cut_id=cid)
                await narrator.update_batch_item(msg_id, cid, status="error")
    finally:
        intent_dispatch._running_batches.pop(batch_id, None)
        intent_dispatch._paused_batches.discard(batch_id)
        intent_dispatch._cancelled_batches.discard(batch_id)
