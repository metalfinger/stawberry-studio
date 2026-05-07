"""
Migration runner — applies numbered .sql files in order, idempotent.

Usage:
    from backend.database.migrations import run_migrations
    await run_migrations(db_path)

Migrations live next to this file as `NNN_name.sql`. Applied versions are
recorded in the `schema_migrations` table.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import List, Tuple

import aiosqlite
import structlog

log = structlog.get_logger(__name__)

MIGRATIONS_DIR = Path(__file__).parent
_FILE_RE = re.compile(r"^(\d{3,})_(.+)\.sql$")


def _discover_migrations() -> List[Tuple[int, str, Path]]:
    """Return sorted list of (version, name, path) for every NNN_name.sql file."""
    found: List[Tuple[int, str, Path]] = []
    for p in MIGRATIONS_DIR.iterdir():
        if not p.is_file() or not p.name.endswith(".sql"):
            continue
        m = _FILE_RE.match(p.name)
        if not m:
            continue
        found.append((int(m.group(1)), m.group(2), p))
    found.sort(key=lambda t: t[0])
    return found


async def _ensure_migrations_table(conn: aiosqlite.Connection) -> None:
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    await conn.commit()


async def _applied_versions(conn: aiosqlite.Connection) -> set[int]:
    async with conn.execute("SELECT version FROM schema_migrations") as cur:
        rows = await cur.fetchall()
    return {row[0] for row in rows}


async def run_migrations(db_path: str) -> List[int]:
    """Apply all pending migrations. Returns versions applied this run."""
    applied: List[int] = []
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("PRAGMA foreign_keys = ON")
        await _ensure_migrations_table(conn)
        already = await _applied_versions(conn)

        for version, name, path in _discover_migrations():
            if version in already:
                continue
            sql = path.read_text()
            log.info("migration_applying", version=version, name=name)
            await conn.executescript(sql)
            await conn.execute(
                "INSERT INTO schema_migrations(version, name) VALUES (?, ?)",
                (version, name),
            )
            await conn.commit()
            applied.append(version)
            log.info("migration_applied", version=version, name=name)

    return applied
