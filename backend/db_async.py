"""
Async shim over backend.db sync facade.

Wraps every callable in `backend.db` with `asyncio.to_thread` so async handlers
(WebSocket, background tasks) can `await` DB operations without blocking the
event loop. The underlying sync code is unchanged — this is a transition layer.

Usage:
    from backend import db_async as db
    project = await db.get_project(project_id)

When tools/routes migrate to native aiosqlite (Phase 3), this shim deletes.
"""
from __future__ import annotations

import asyncio
import functools
from typing import Any, Callable

from backend import db as _sync_db


def _wrap(fn: Callable[..., Any]) -> Callable[..., Any]:
    """Wrap a sync callable so it runs in a thread and returns an awaitable."""
    @functools.wraps(fn)
    async def _async_wrapper(*args: Any, **kwargs: Any) -> Any:
        return await asyncio.to_thread(fn, *args, **kwargs)

    return _async_wrapper


# Auto-wrap every public callable from backend.db
_exported: list[str] = []
for _name in dir(_sync_db):
    if _name.startswith("_"):
        continue
    _attr = getattr(_sync_db, _name)
    if callable(_attr):
        globals()[_name] = _wrap(_attr)
        _exported.append(_name)

__all__ = _exported
