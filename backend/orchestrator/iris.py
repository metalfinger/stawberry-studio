"""
Iris — the silent pre-production fixer.

Iris is no longer a chat agent. She is a *function* the Cut Composer calls
when it detects a missing reference (a linked character/location/prop that
has no element sheet and no master). Iris fills that gap by generating the
appropriate sheet, returns a structured result, and the composer continues.

Public API:
    compose_missing_reference(cut_id, gap) → dict

`gap` shape (detected during cut planning):
    {"asset_id": str, "type": "character|location|prop", "name": str | None}

Return shape:
    {
        "asset_id": str,
        "type": str,
        "sheet_id": str,
        "image_url": str,
        "cost_usd": float,
        "rationale": str,
    }

Failure: raises. The caller records the gap as `error` and continues.
"""
from __future__ import annotations

from typing import Any

import structlog

from backend.orchestrator.events import RunContext, log_event
from backend.orchestrator.references import precache_standard_turnaround

log = structlog.get_logger(__name__)


async def compose_missing_reference(cut_id: str, gap: dict[str, Any]) -> dict[str, Any]:
    """Generate the missing sheet/master for the gap's asset.

    Today this routes everything through the Sheet Planner — characters get
    their character sheet, locations get their location plate, props get a
    turnaround. The planner picks the right template based on the asset's
    metadata.
    """
    asset_id = gap["asset_id"]
    asset_type = gap.get("type") or ""
    rc = RunContext(project_id="", phase="ASSETS", agent_id="iris")
    await log_event(rc, "iris_gap_start", {"cut_id": cut_id, "asset_id": asset_id, "type": asset_type})

    try:
        refs = await precache_standard_turnaround(asset_id)
    except Exception as e:
        log.exception("iris_reference_failed", asset_id=asset_id, cut_id=cut_id)
        await log_event(rc, "iris_gap_error", {"asset_id": asset_id, "error": str(e)})
        raise

    identity = refs[0]
    out = {
        "asset_id": asset_id,
        "type": asset_type,
        "identity_reference_id": identity["id"],
        "image_url": identity["image_url"],
        "extra_views": [r["label"] for r in refs[1:]],
        "cost_usd": sum(r.get("cost_usd", 0.0) for r in refs),
    }
    await log_event(rc, "iris_gap_filled", out)
    log.info("iris_gap_filled", cut_id=cut_id, asset_id=asset_id, identity_id=identity["id"])
    return out
