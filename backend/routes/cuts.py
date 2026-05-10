"""Cut REST endpoints.

The legacy NodeProperties-driven endpoints (compose, compose/stream,
history, active, pre-production, slots) have been removed. The chat
WebSocket flow (Pixel → propose_cut_plan → PlanCard → execute_cut_plan)
is the single canonical path for cut composition.

What lives here today: only routes the modern flow needs. As of writing
that's none — the file is kept as an empty router so other modules
that registered include_router(cuts.router) keep importing cleanly.
Add new cut-specific REST endpoints here when needed.
"""
from fastapi import APIRouter

router = APIRouter(prefix="/api/projects/{project_id}/cuts", tags=["cuts"])
