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
        """Broadcast an event to every subscriber for the project. Failed
        sinks are auto-pruned so a dropped WebSocket doesn't block others."""
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


# Module-level singleton — import this everywhere instead of constructing.
bus = ProjectBus()
