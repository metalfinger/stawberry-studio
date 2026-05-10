"""
Core database operations and schema initialization.
"""
import asyncio
import json
import sqlite3
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

import aiosqlite

DB_PATH = str(Path(__file__).parent.parent.parent / "strawberry.db")


def get_connection():
    """Synchronous connection. Used by legacy tools/agents during transition."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@asynccontextmanager
async def get_async_connection() -> AsyncIterator[aiosqlite.Connection]:
    """Async connection for hot paths (chat WebSocket, background tasks)."""
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        yield conn


def init_db():
    """Run pending migrations synchronously — for CLI / scripts only."""
    from backend.database.migrations import run_migrations
    asyncio.run(run_migrations(DB_PATH))


async def init_db_async():
    """Run pending migrations asynchronously. Call from FastAPI lifespan."""
    from backend.database.migrations import run_migrations
    await run_migrations(DB_PATH)


# Project Operations
def create_project(name: str) -> dict[str, Any]:
    project_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (project_id, name, now, now)
    )
    cursor.execute(
        "INSERT INTO briefs (project_id) VALUES (?)",
        (project_id,)
    )
    conn.commit()
    conn.close()

    return {
        "id": project_id,
        "name": name,
        "current_phase": "BRIEF",
        "created_at": now,
        "updated_at": now
    }


def get_project(project_id: str) -> dict[str, Any] | None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def list_projects() -> list[dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM projects ORDER BY updated_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def update_phase(project_id: str, new_phase: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE projects SET current_phase = ?, updated_at = ? WHERE id = ?",
        (new_phase, datetime.now().isoformat(), project_id)
    )
    conn.commit()
    conn.close()


# Brief Operations
def get_brief(project_id: str) -> dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM briefs WHERE project_id = ?", (project_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else {}


def update_brief(project_id: str, **kwargs) -> dict[str, Any]:
    if not kwargs:
        return get_brief(project_id)

    set_clause = ", ".join([f"{k} = ?" for k in kwargs.keys()])
    values = list(kwargs.values()) + [project_id]

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(f"UPDATE briefs SET {set_clause} WHERE project_id = ?", values)
    conn.commit()
    conn.close()

    return get_brief(project_id)


def complete_briefing(project_id: str) -> bool:
    """Advance project from BRIEF to STORY phase."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE projects SET current_phase = 'STORY', updated_at = ? WHERE id = ?",
        (datetime.now().isoformat(), project_id)
    )
    conn.commit()
    conn.close()
    return True


# ============================================================================
# Stale Phase Tracking
# ============================================================================

# Single phase model. The dual 4-phase / 6-phase split that used to live
# here is dead — every consumer now uses these four names.
PIPELINE_PHASES = ["BRIEF", "STORY", "ASSETS", "GENERATE"]
PHASE_ORDER = PIPELINE_PHASES


def canonical_phase(name: str) -> str:
    """Identity helper kept for callers that wrap phase strings. The
    legacy translation table (DEVELOP/DESIGN/etc → BRIEF/STORY/...) is
    gone; every phase string in the system is one of PIPELINE_PHASES."""
    return name


def get_stale_phases(project_id: str) -> list:
    """Get list of stale phases for a project."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT stale_phases FROM projects WHERE id = ?", (project_id,))
    row = cursor.fetchone()
    conn.close()

    if row and row['stale_phases']:
        try:
            return json.loads(row['stale_phases'])
        except json.JSONDecodeError:
            return []
    return []


def mark_phases_stale(project_id: str, from_phase: str) -> list:
    """Mark every phase strictly downstream of `from_phase` as stale.
    Single 4-phase pipeline (BRIEF → STORY → ASSETS → GENERATE)."""
    if from_phase not in PIPELINE_PHASES:
        return []

    current_stale = set(get_stale_phases(project_id))
    phase_idx = PIPELINE_PHASES.index(from_phase)
    downstream_phases = PIPELINE_PHASES[phase_idx + 1:]
    # Drop anything not in the current pipeline (cleans up old DBs that
    # had legacy 6-phase names lingering in stale_phases JSON).
    cleaned_existing = {p for p in current_stale if p in PIPELINE_PHASES}
    new_stale = cleaned_existing.union(set(downstream_phases))

    # Save to database
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE projects SET stale_phases = ?, updated_at = ? WHERE id = ?",
        (json.dumps(list(new_stale)), datetime.now().isoformat(), project_id)
    )
    conn.commit()
    conn.close()

    return list(new_stale)


def clear_stale_phase(project_id: str, phase: str) -> list:
    """
    Clear stale flag for a specific phase.
    Called when work is done in that phase to "refresh" it.

    Args:
        project_id: The project ID
        phase: The phase to clear from stale list

    Returns:
        Remaining stale phases
    """
    current_stale = set(get_stale_phases(project_id))
    current_stale.discard(phase)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE projects SET stale_phases = ?, updated_at = ? WHERE id = ?",
        (json.dumps(list(current_stale)), datetime.now().isoformat(), project_id)
    )
    conn.commit()
    conn.close()

    return list(current_stale)


def clear_all_stale_phases(project_id: str) -> bool:
    """Clear all stale flags for a project."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE projects SET stale_phases = '[]', updated_at = ? WHERE id = ?",
        (datetime.now().isoformat(), project_id)
    )
    conn.commit()
    conn.close()
    return True


def update_project_phase(project_id: str, new_phase: str) -> bool:
    """
    Update project phase (used for navigation).
    Does NOT clear stale flags - that's separate.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE projects SET current_phase = ?, updated_at = ? WHERE id = ?",
        (new_phase, datetime.now().isoformat(), project_id)
    )
    conn.commit()
    conn.close()
    return True
