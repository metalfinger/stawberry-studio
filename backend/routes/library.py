"""Library route — visual memory bank.

Surfaces every reference_pool image for a project with rich metadata so the
frontend Library Drawer can show, filter, search, and re-use them. All reads
are non-destructive; favorites/star are simple flag flips.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import backend.database.core as db_core

router = APIRouter(prefix="/api/projects/{project_id}/library", tags=["library"])


def _row_to_card(row: dict) -> dict[str, Any]:
    tags = {}
    try:
        tags = json.loads(row.get("tags_json") or "{}")
    except Exception:
        tags = {}
    used_in: list[str] = []
    try:
        used_in = json.loads(row.get("used_in_cuts_json") or "[]")
    except Exception:
        used_in = []
    return {
        "ref_id": row["id"],
        "image_url": row["image_url"],
        "thumb_url": row["image_url"],
        "label": row.get("label") or row.get("source_type") or "reference",
        "asset_id": row.get("asset_id"),
        "scope": row.get("scope") or "project",
        "source_type": row.get("source_type") or "",
        "source_cut_id": row.get("source_cut_id"),
        "is_active": bool(row.get("is_active", 1)),
        "is_anchor": bool(row.get("is_anchor", 0)),
        "is_style_anchor": bool(row.get("is_style_anchor", 0)),
        "is_favorite": bool(row.get("is_favorite", 0)),
        "superseded_by_id": row.get("superseded_by_id"),
        "prompt": row.get("prompt") or "",
        "cost_usd": float(row.get("cost_usd") or 0),
        "model_used": row.get("model_used") or "",
        "used_in_cuts": used_in,
        "created_at": row.get("created_at"),
        "tags": tags,
        "aspect_ratio": row.get("aspect_ratio") or "",
    }


@router.get("")
def list_library(
    project_id: str,
    asset_id: str | None = None,
    source_type: str | None = None,
    only_active: bool = True,
    favorites_only: bool = False,
    search: str | None = None,
    limit: int = 500,
):
    """List reference_pool entries for the project, newest first.

    Filters:
    - asset_id: only refs tied to a single asset
    - source_type: 'master' | 'variant' | 'cut' | 'upload' | 'web'
    - only_active: hide superseded versions (default true)
    - favorites_only: only user-pinned
    - search: substring match against label/prompt/source_type
    """
    conn = db_core.get_connection()
    try:
        cur = conn.cursor()
        sql = "SELECT * FROM reference_pool WHERE project_id = ?"
        args: list[Any] = [project_id]
        if asset_id:
            sql += " AND asset_id = ?"
            args.append(asset_id)
        if source_type:
            sql += " AND source_type = ?"
            args.append(source_type)
        if only_active:
            sql += " AND COALESCE(is_active, 1) = 1"
        if favorites_only:
            sql += " AND COALESCE(is_favorite, 0) = 1"
        if search:
            sql += " AND (COALESCE(label,'') LIKE ? OR COALESCE(prompt,'') LIKE ? OR COALESCE(source_type,'') LIKE ?)"
            like = f"%{search}%"
            args += [like, like, like]
        sql += " ORDER BY created_at DESC LIMIT ?"
        args.append(limit)
        cur.execute(sql, args)
        rows = [dict(r) for r in cur.fetchall()]
        return {"items": [_row_to_card(r) for r in rows], "count": len(rows)}
    finally:
        conn.close()


@router.get("/cost-summary")
def cost_summary(project_id: str):
    """Aggregate spend for the project. Combines image generation cost
    (sum of reference_pool.cost_usd) with LLM tool-call cost (sum of
    cost_usd embedded in agent_events tool_call payloads). Used to seed
    the Console cost meter on refresh so the user never loses the
    running total."""
    conn = db_core.get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT COALESCE(SUM(cost_usd), 0) AS image_cost FROM reference_pool "
            "WHERE project_id = ?",
            (project_id,),
        )
        image_cost = float(cur.fetchone()["image_cost"] or 0)

        # LLM cost lives inside agent_events.payload_json for tool_call rows.
        try:
            cur.execute(
                "SELECT payload_json FROM agent_events "
                "WHERE project_id = ? AND event_type = 'tool_call'",
                (project_id,),
            )
            llm_cost = 0.0
            for r in cur.fetchall():
                try:
                    p = json.loads(r["payload_json"] or "{}")
                    llm_cost += float(p.get("cost_usd") or 0)
                except Exception:
                    pass
        except Exception:
            llm_cost = 0.0

        return {
            "image_cost_usd": image_cost,
            "llm_cost_usd": llm_cost,
            "total_cost_usd": image_cost + llm_cost,
        }
    finally:
        conn.close()


@router.get("/stats")
def library_stats(project_id: str):
    """Counts by source_type + total cost so the drawer header shows budget context."""
    conn = db_core.get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT source_type, COUNT(*) AS n, SUM(COALESCE(cost_usd, 0)) AS cost "
            "FROM reference_pool WHERE project_id = ? AND COALESCE(is_active,1)=1 "
            "GROUP BY source_type",
            (project_id,),
        )
        by_type = {r["source_type"]: {"count": r["n"], "cost": float(r["cost"] or 0)} for r in cur.fetchall()}
        cur.execute(
            "SELECT COUNT(*) AS n, SUM(COALESCE(cost_usd,0)) AS cost FROM reference_pool "
            "WHERE project_id = ?",
            (project_id,),
        )
        total = cur.fetchone()
        return {
            "by_type": by_type,
            "total_count": total["n"] if total else 0,
            "total_cost_usd": float((total["cost"] if total else 0) or 0),
        }
    finally:
        conn.close()


class StarRequest(BaseModel):
    favorite: bool


@router.post("/{ref_id}/favorite")
def toggle_favorite(project_id: str, ref_id: str, req: StarRequest):
    conn = db_core.get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE reference_pool SET is_favorite = ? WHERE id = ? AND project_id = ?",
            (1 if req.favorite else 0, ref_id, project_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "reference not found")
        conn.commit()
        return {"ref_id": ref_id, "favorite": req.favorite}
    finally:
        conn.close()


class StyleAnchorRequest(BaseModel):
    anchor: bool


@router.post("/{ref_id}/style-anchor")
def set_style_anchor(project_id: str, ref_id: str, req: StyleAnchorRequest):
    """Pin one image as the project-wide style anchor.

    Setting anchor=True clears any prior style anchor in the project, since
    only one is allowed at a time.
    """
    conn = db_core.get_connection()
    try:
        cur = conn.cursor()
        if req.anchor:
            cur.execute(
                "UPDATE reference_pool SET is_style_anchor = 0 WHERE project_id = ?",
                (project_id,),
            )
        cur.execute(
            "UPDATE reference_pool SET is_style_anchor = ? WHERE id = ? AND project_id = ?",
            (1 if req.anchor else 0, ref_id, project_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "reference not found")
        conn.commit()
        return {"ref_id": ref_id, "is_style_anchor": req.anchor}
    finally:
        conn.close()


class RestoreRequest(BaseModel):
    pass


@router.get("/{ref_id}/versions")
def reference_versions(project_id: str, ref_id: str):
    """Return the full supersession chain for a reference, oldest-first.

    Used by the Library detail "Versions" panel: pick any version of the
    same logical reference (same asset_id + label, OR same source_cut_id +
    label-pattern for cut renders) and Compare against the active one.
    """
    conn = db_core.get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM reference_pool WHERE id = ?", (ref_id,))
        seed = cur.fetchone()
        if not seed:
            raise HTTPException(404, "reference not found")
        seed = dict(seed)
        # Cut renders: chain by source_cut_id + label LIKE 'render_v%'.
        if seed.get("source_type") == "cut" and seed.get("source_cut_id"):
            cur.execute(
                "SELECT * FROM reference_pool WHERE source_cut_id = ? "
                "AND label LIKE 'render_v%' ORDER BY created_at ASC",
                (seed["source_cut_id"],),
            )
        else:
            # Asset references: chain by asset_id + same label.
            cur.execute(
                "SELECT * FROM reference_pool WHERE asset_id = ? AND label = ? "
                "ORDER BY created_at ASC",
                (seed.get("asset_id"), seed.get("label") or ""),
            )
        rows = [dict(r) for r in cur.fetchall()]
        return {"versions": [_row_to_card(r) for r in rows]}
    finally:
        conn.close()


@router.post("/{ref_id}/restore")
def restore_reference(project_id: str, ref_id: str):
    """Re-activate a superseded reference. Drops its superseded_by_id pointer
    and flips is_active back to 1. Useful for "I liked v2 better" undo."""
    conn = db_core.get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE reference_pool SET is_active = 1, superseded_by_id = NULL "
            "WHERE id = ? AND project_id = ?",
            (ref_id, project_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "reference not found")
        conn.commit()
        return {"ref_id": ref_id, "restored": True}
    finally:
        conn.close()


class SlotAssignRequest(BaseModel):
    cut_id: str
    slot_index: int
    ref_id: str | None = None  # None to clear the slot


@router.post("/slot")
def assign_slot(project_id: str, req: SlotAssignRequest):
    """Set or clear a reference slot on a cut. The Library Drawer drag-drops
    targets call this so a user can recompose a cut by swapping references."""
    conn = db_core.get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT image_slots FROM cuts WHERE id = ?", (req.cut_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "cut not found")
        try:
            slots = json.loads(row["image_slots"] or "{}")
        except Exception:
            slots = {}
        key = str(req.slot_index)
        if req.ref_id is None:
            slots.pop(key, None)
        else:
            cur.execute(
                "SELECT image_url FROM reference_pool WHERE id = ? AND project_id = ?",
                (req.ref_id, project_id),
            )
            ref = cur.fetchone()
            if not ref:
                raise HTTPException(404, "reference not found")
            slots[key] = {"ref_id": req.ref_id, "image_url": ref["image_url"]}
        cur.execute(
            "UPDATE cuts SET image_slots = ? WHERE id = ?",
            (json.dumps(slots), req.cut_id),
        )
        conn.commit()
        return {"cut_id": req.cut_id, "image_slots": slots}
    finally:
        conn.close()
