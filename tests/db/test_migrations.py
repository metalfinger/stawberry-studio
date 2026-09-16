import sqlite3

import pytest


@pytest.mark.asyncio
async def test_migrations_create_all_tables(tmp_db):
    """A fresh DB after migrations has every required table + the migrations log."""
    expected = {
        "schema_migrations",
        "projects",
        "briefs",
        "scenes",
        "shots",
        "cuts",
        "chat_history",
        "assets",
        "asset_links",
        "generation_requests",
        "generation_history",
        "agent_events",
        "reference_pool",
        "continuity_bible",
        # phases + artifacts dropped (pipeline module deleted).
        # element_masters / element_variants / element_presets / element_sheets /
        # sheet_cell_crops gone too — single source of truth = reference_pool.
    }
    conn = sqlite3.connect(tmp_db)
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    conn.close()
    actual = {r[0] for r in rows}
    missing = expected - actual
    assert not missing, f"missing tables: {missing}"


@pytest.mark.asyncio
async def test_migrations_idempotent(tmp_db):
    """Re-running the migrator on a current db is a no-op."""
    from backend.database.migrations import run_migrations

    applied = await run_migrations(tmp_db)
    assert applied == [], "second run should apply nothing"
