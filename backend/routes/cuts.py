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
from fastapi import APIRouter, HTTPException

from backend import db

router = APIRouter(prefix="/api/projects/{project_id}/cuts", tags=["cuts"])


@router.get("/{cut_id}/renders")
async def list_cut_renders(project_id: str, cut_id: str):
    """All render versions for a cut (active + superseded), newest first.
    Powers the cut-history strip under each cut on the canvas.

    Each row: { id, label, image_url, is_active, superseded_by_id,
    created_at, prompt, cost_usd, model_used }.
    """
    get_async_connection = db.get_async_connection
    async with get_async_connection() as conn:
        async with conn.execute(
            """SELECT id, label, image_url, COALESCE(is_active,1) AS is_active,
                      superseded_by_id, created_at, prompt, cost_usd, model_used
               FROM reference_pool
               WHERE source_cut_id = ? AND label LIKE 'render_v%'
               ORDER BY created_at DESC""",
            (cut_id,),
        ) as cur:
            rows = [dict(r) for r in await cur.fetchall()]
    return {"cut_id": cut_id, "renders": rows}


class _ActiveRenderBody(__import__("pydantic").BaseModel):
    reference_id: str


@router.post("/{cut_id}/active-render")
async def set_active_render(project_id: str, cut_id: str, body: _ActiveRenderBody):
    """Promote a prior render version back to the active cut image. Used
    when the user picks an older version from the history strip."""
    get_async_connection = db.get_async_connection
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT image_url FROM reference_pool WHERE id = ? AND source_cut_id = ?",
            (body.reference_id, cut_id),
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Render not found for this cut")
        image_url = row["image_url"]
        # Mark everything inactive, then activate the chosen render.
        await conn.execute(
            "UPDATE reference_pool SET is_active = 0 WHERE source_cut_id = ? "
            "AND label LIKE 'render_v%'",
            (cut_id,),
        )
        await conn.execute(
            "UPDATE reference_pool SET is_active = 1 WHERE id = ?",
            (body.reference_id,),
        )
        await conn.execute(
            "UPDATE cuts SET generated_image_url = ? WHERE id = ?",
            (image_url, cut_id),
        )
        await conn.commit()
    try:
        from backend.orchestrator.bus import bus
        await bus.publish(
            project_id,
            {"type": "cut_updated", "cut_id": cut_id, "image_url": image_url},
        )
    except Exception:
        pass
    return {"ok": True, "image_url": image_url}
