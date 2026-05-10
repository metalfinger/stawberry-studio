"""In-memory image-generation activity tracker.

Lightweight counter that lets the UI show "{N} generating" instead of
the user wondering whether anything is happening. Image generation
hooks into this around their `await img_provider.generate(req)` calls.

Per-project, in-process. Resets on backend restart — that's fine,
nothing important is persisted; it's just a UI indicator.

Public API:
    track(project_id, label)   — context manager: increments + decrements
    snapshot(project_id)       — read counts for the GET /generation-stats endpoint
"""
from __future__ import annotations

import time
from collections import defaultdict
from contextlib import contextmanager
from threading import Lock
from typing import Iterator


_lock = Lock()
# {project_id: [{"label": str, "started": float}, ...]}
_in_flight: dict[str, list[dict]] = defaultdict(list)
# Rolling tally of completed generations this process lifetime.
_completed: dict[str, int] = defaultdict(int)
_failed: dict[str, int] = defaultdict(int)


@contextmanager
def track(project_id: str, label: str = "image_gen") -> Iterator[None]:
    """Context manager — increment in_flight on enter, decrement on exit.
    On exception, count it as failed."""
    if not project_id:
        # Defensive — global tracker across loose calls would be confusing.
        yield
        return
    entry = {"label": label, "started": time.monotonic()}
    with _lock:
        _in_flight[project_id].append(entry)
    try:
        yield
        with _lock:
            try:
                _in_flight[project_id].remove(entry)
            except ValueError:
                pass
            _completed[project_id] += 1
    except BaseException:
        with _lock:
            try:
                _in_flight[project_id].remove(entry)
            except ValueError:
                pass
            _failed[project_id] += 1
        raise


def snapshot(project_id: str) -> dict:
    """Return current counters for a project."""
    with _lock:
        in_flight_list = list(_in_flight.get(project_id, []))
        completed = _completed.get(project_id, 0)
        failed = _failed.get(project_id, 0)
    now = time.monotonic()
    in_flight = [
        {"label": e["label"], "elapsed_s": int(now - e["started"])}
        for e in in_flight_list
    ]
    return {
        "in_flight_count": len(in_flight),
        "in_flight": in_flight,
        "completed_total": completed,
        "failed_total": failed,
    }
