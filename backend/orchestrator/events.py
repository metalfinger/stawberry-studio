"""
Event-sourced run log.

Every agent step (tool call, message, handoff, error, completion) appends a row
to the `agent_events` table. The event log is the source of truth for
replayability and debugging.

Event types:
    run_start, run_end
    user_message, agent_message, agent_chunk
    tool_call, tool_result, tool_error
    handoff, phase_transition
    critic_pass, critic_revise, critic_fail
    error
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from backend.database.core import get_async_connection


@dataclass
class RunContext:
    """Per-run context threaded through the orchestrator."""
    run_id: str = field(default_factory=lambda: f"run_{uuid.uuid4().hex[:12]}")
    project_id: str = ""
    phase: str = ""
    agent_id: str = ""
    seq: int = 0
    extra: dict[str, Any] = field(default_factory=dict)

    def next_seq(self) -> int:
        self.seq += 1
        return self.seq


async def log_event(
    ctx: RunContext,
    event_type: str,
    payload: dict[str, Any] | None = None,
) -> None:
    """Append an event to the agent_events table."""
    row = (
        ctx.run_id,
        ctx.next_seq(),
        datetime.now().isoformat(),
        ctx.agent_id,
        ctx.project_id,
        ctx.phase,
        event_type,
        json.dumps(payload or {}),
    )
    async with get_async_connection() as conn:
        await conn.execute(
            """
            INSERT INTO agent_events (run_id, seq, ts, agent_id, project_id, phase, event_type, payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            row,
        )
        await conn.commit()


async def replay_run(run_id: str) -> list[dict]:
    """Return all events for a run in order."""
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT * FROM agent_events WHERE run_id = ? ORDER BY seq ASC",
            (run_id,),
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]
