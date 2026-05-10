"""
Production-flow pipeline service.

Wraps the `phases` and `artifacts` tables with a clean async API:

    save_artifact_version(...)  → mints v(N+1)
    get_artifact(...)           → retrieve any version
    list_versions(...)          → lineage
    freeze_and_advance(...)     → lock v_current, mark next phase in_progress, cascade staleness
    fork_artifact(...)          → branch a new version off an old one (for "what if?" exploration)
    get_pipeline_state(...)     → all 6 phases with status + current_version
"""
from __future__ import annotations

import json
import uuid
from typing import Any

import structlog

from backend import db

PIPELINE_PHASES = db.PIPELINE_PHASES
get_async_connection = db.get_async_connection
mark_phases_stale = db.mark_phases_stale

log = structlog.get_logger(__name__)


# ============================================================================
# Read API
# ============================================================================

async def get_pipeline_state(project_id: str) -> dict[str, Any]:
    """Return one row per phase showing status + current_version. Phases the
    project has never touched still appear with status='pending'.
    """
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT phase, status, current_version, updated_at FROM phases WHERE project_id = ?",
            (project_id,),
        ) as cur:
            rows = await cur.fetchall()
    seen = {r["phase"]: dict(r) for r in rows}

    state = []
    for ph in PIPELINE_PHASES:
        existing = seen.get(ph) or {
            "phase": ph,
            "status": "pending",
            "current_version": 0,
            "updated_at": None,
        }
        state.append(existing)
    return {"project_id": project_id, "phases": state}


async def get_artifact(
    project_id: str,
    phase: str,
    version: int | None = None,
) -> dict[str, Any] | None:
    """Return a specific artifact version, or the current_version if `version` is None."""
    phase_c = phase
    async with get_async_connection() as conn:
        if version is None:
            async with conn.execute(
                """
                SELECT a.*
                FROM artifacts a
                JOIN phases p ON p.project_id = a.project_id AND p.phase = a.phase
                WHERE a.project_id = ? AND a.phase = ? AND a.version = p.current_version
                LIMIT 1
                """,
                (project_id, phase_c),
            ) as cur:
                row = await cur.fetchone()
        else:
            async with conn.execute(
                "SELECT * FROM artifacts WHERE project_id = ? AND phase = ? AND version = ?",
                (project_id, phase_c, version),
            ) as cur:
                row = await cur.fetchone()
    if row is None:
        return None
    out = dict(row)
    try:
        out["payload"] = json.loads(out.get("payload_json") or "{}")
    except json.JSONDecodeError:
        out["payload"] = {}
    return out


async def list_versions(project_id: str, phase: str) -> list[dict[str, Any]]:
    """All versions of an artifact for one phase, newest first."""
    phase_c = phase
    async with get_async_connection() as conn:
        async with conn.execute(
            """
            SELECT id, version, schema_id, parent_version, notes, created_at, created_by
            FROM artifacts WHERE project_id = ? AND phase = ?
            ORDER BY version DESC
            """,
            (project_id, phase_c),
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


# ============================================================================
# Write API
# ============================================================================

async def _ensure_phase_row(conn, project_id: str, phase: str) -> dict[str, Any]:
    async with conn.execute(
        "SELECT * FROM phases WHERE project_id = ? AND phase = ?",
        (project_id, phase),
    ) as cur:
        row = await cur.fetchone()
    if row is None:
        await conn.execute(
            "INSERT INTO phases (project_id, phase, status, current_version) VALUES (?, ?, 'pending', 0)",
            (project_id, phase),
        )
        await conn.commit()
        return {"project_id": project_id, "phase": phase, "status": "pending", "current_version": 0}
    return dict(row)


async def save_artifact_version(
    project_id: str,
    phase: str,
    schema_id: str,
    payload: dict[str, Any],
    *,
    notes: str = "",
    created_by: str = "system",
    parent_version: int | None = None,
    set_as_current: bool = True,
) -> dict[str, Any]:
    """Mint a new artifact version. Auto-increments. Optionally sets as current."""
    phase_c = phase
    async with get_async_connection() as conn:
        await _ensure_phase_row(conn, project_id, phase_c)
        async with conn.execute(
            "SELECT COALESCE(MAX(version), 0) AS mv FROM artifacts WHERE project_id = ? AND phase = ?",
            (project_id, phase_c),
        ) as cur:
            row = await cur.fetchone()
        next_version = (row["mv"] or 0) + 1

        artifact_id = f"art_{uuid.uuid4().hex[:12]}"
        await conn.execute(
            """
            INSERT INTO artifacts
                (id, project_id, phase, version, schema_id, payload_json, parent_version, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                artifact_id,
                project_id,
                phase_c,
                next_version,
                schema_id,
                json.dumps(payload),
                parent_version,
                notes,
                created_by,
            ),
        )

        if set_as_current:
            await conn.execute(
                """
                UPDATE phases SET current_version = ?, status = 'in_progress', updated_at = CURRENT_TIMESTAMP
                WHERE project_id = ? AND phase = ?
                """,
                (next_version, project_id, phase_c),
            )
        await conn.commit()

    log.info(
        "artifact_saved",
        project_id=project_id,
        phase=phase_c,
        version=next_version,
        schema_id=schema_id,
        parent_version=parent_version,
        set_as_current=set_as_current,
    )
    return {
        "id": artifact_id,
        "project_id": project_id,
        "phase": phase_c,
        "version": next_version,
        "schema_id": schema_id,
        "parent_version": parent_version,
    }


async def fork_artifact(
    project_id: str,
    phase: str,
    base_version: int,
    new_payload: dict[str, Any],
    *,
    notes: str = "fork",
    created_by: str = "system",
) -> dict[str, Any]:
    """Branch off `base_version` with new payload. Creates a sibling version that
    keeps the lineage. Does NOT auto-set as current — caller decides via
    `set_as_current` if they want this fork to win.
    """
    phase_c = phase
    base = await get_artifact(project_id, phase_c, base_version)
    if base is None:
        raise ValueError(f"base version {base_version} not found for {phase_c}")
    return await save_artifact_version(
        project_id,
        phase_c,
        base["schema_id"],
        new_payload,
        notes=notes,
        created_by=created_by,
        parent_version=base_version,
        set_as_current=False,
    )


async def freeze_and_advance(project_id: str, phase: str) -> dict[str, Any]:
    """Lock the current version of `phase`, advance project_phase to the next phase
    in PIPELINE_PHASES, and cascade staleness onto downstream phases per the
    existing mark_phases_stale mechanic.
    """
    phase_c = phase
    if phase_c not in PIPELINE_PHASES:
        raise ValueError(f"unknown phase: {phase_c}")

    idx = PIPELINE_PHASES.index(phase_c)
    next_phase = PIPELINE_PHASES[idx + 1] if idx + 1 < len(PIPELINE_PHASES) else None

    async with get_async_connection() as conn:
        # Lock current
        await conn.execute(
            """
            UPDATE phases SET status = 'frozen', updated_at = CURRENT_TIMESTAMP
            WHERE project_id = ? AND phase = ?
            """,
            (project_id, phase_c),
        )
        # Advance project's current_phase pointer
        if next_phase:
            await _ensure_phase_row(conn, project_id, next_phase)
            await conn.execute(
                """
                UPDATE phases SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP
                WHERE project_id = ? AND phase = ?
                """,
                (project_id, next_phase),
            )
        await conn.execute(
            "UPDATE projects SET current_phase = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (next_phase or phase_c, project_id),
        )
        await conn.commit()

    # Cascade staleness on the legacy mechanic (still works on phase strings)
    stale = mark_phases_stale(project_id, phase_c)
    log.info("phase_frozen", project_id=project_id, phase=phase_c, next_phase=next_phase, stale=stale)
    return {"frozen": phase_c, "next": next_phase, "stale": stale}


async def mark_phase_in_progress(project_id: str, phase: str) -> None:
    """Idempotent: surface a phase as the active editing target."""
    phase_c = phase
    async with get_async_connection() as conn:
        await _ensure_phase_row(conn, project_id, phase_c)
        await conn.execute(
            """
            UPDATE phases SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP
            WHERE project_id = ? AND phase = ?
            """,
            (project_id, phase_c),
        )
        await conn.commit()
