"""ProjectBus — pub/sub for typed Console messages keyed by project_id.

Why this exists
---------------
Phase B added a `Narrator` that emits typed messages over a WebSocket. It
took a `send_fn` callback at construction time, which meant only code with
direct access to the socket could emit. That excluded virtually every
business-logic site (cut_executor, references_v2, picker, batch runners,
agent tools), so 9 of the 14 message components shipped dormant.

The bus fixes that: any backend code can `publish(project_id, event)` and
the active chat WebSocket(s) for that project receive it. There's no
coupling between business logic and transport — the route layer subscribes,
the orchestrator publishes.

Multi-tab is supported automatically (multiple subscribers per project).
Dead sinks self-prune on first publish failure.
"""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from collections.abc import Awaitable, Callable

import structlog

log = structlog.get_logger(__name__)

EventSink = Callable[[dict], Awaitable[None]]


class ProjectBus:
    def __init__(self) -> None:
        self._subs: dict[str, dict[int, EventSink]] = defaultdict(dict)
        self._next_id: int = 0
        self._lock = asyncio.Lock()

    async def subscribe(self, project_id: str, sink: EventSink) -> int:
        """Register a sink. Returns a subscription id used for unsubscribe."""
        async with self._lock:
            sid = self._next_id
            self._next_id += 1
            self._subs[project_id][sid] = sink
            return sid

    async def unsubscribe(self, project_id: str, sub_id: int) -> None:
        async with self._lock:
            self._subs.get(project_id, {}).pop(sub_id, None)
            if project_id in self._subs and not self._subs[project_id]:
                self._subs.pop(project_id, None)

    def subscriber_count(self, project_id: str) -> int:
        return len(self._subs.get(project_id, {}))

    async def publish(self, project_id: str, event: dict) -> None:
        """Broadcast an event to every subscriber for the project AND persist
        it so a future refresh can replay the same stream. Failed sinks are
        auto-pruned. Persistence is fire-and-forget; if the DB write fails
        we still deliver to live subscribers."""
        # 1. Persist (so refresh resumes). Skip purely-internal events.
        try:
            await _persist_event(project_id, event)
        except Exception as e:  # noqa: BLE001
            log.warning("bus.persist_failed", project_id=project_id, error=str(e))

        # 2. Broadcast to live subscribers.
        sinks = list(self._subs.get(project_id, {}).items())
        if not sinks:
            return
        dead: list[int] = []
        for sid, sink in sinks:
            try:
                await sink(event)
            except Exception as e:  # noqa: BLE001
                log.warning("bus.sink_failed", project_id=project_id, sid=sid, error=str(e))
                dead.append(sid)
        for sid in dead:
            await self.unsubscribe(project_id, sid)


# ---------------------------------------------------------------------------
# Persistence — every typed event lands in console_events so a hard refresh
# can replay the same stream. Events without a `kind` field are skipped
# (they're plain transport messages like type=phase / type=stream).
# ---------------------------------------------------------------------------

async def _persist_event(project_id: str, event: dict) -> None:
    if not isinstance(event, dict):
        return
    kind = event.get("kind")
    if not kind:
        return
    # Avoid recursion / circular imports — get_async_connection is the same
    # connection helper the rest of the app uses.
    from backend.database.core import get_async_connection
    payload = json.dumps(event, default=str)
    async with get_async_connection() as conn:
        await conn.execute(
            "INSERT INTO console_events (project_id, ts, kind, message_id, payload_json) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                project_id,
                event.get("timestamp"),
                kind,
                event.get("message_id"),
                payload,
            ),
        )
        await conn.commit()


async def fetch_recent_events(project_id: str, limit: int = 300) -> list[dict]:
    """Return the most recent typed events for a project, oldest-first so
    they replay in chronological order."""
    from backend.database.core import get_async_connection
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT payload_json FROM console_events "
            "WHERE project_id = ? ORDER BY id DESC LIMIT ?",
            (project_id, limit),
        ) as cur:
            rows = await cur.fetchall()
    out: list[dict] = []
    for r in reversed(rows):
        try:
            out.append(json.loads(r["payload_json"]))
        except Exception:
            continue
    return out


# Module-level singleton — import this everywhere instead of constructing.
bus = ProjectBus()
