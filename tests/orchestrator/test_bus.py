"""ProjectBus contract tests.

Lock the small surface so the typed-message protocol stays decoupled from
the WebSocket transport: anyone can subscribe; anyone can publish; failed
sinks don't poison other subscribers.
"""
import asyncio

import pytest

from backend.orchestrator.bus import ProjectBus
from backend.orchestrator.narrator import Narrator


@pytest.mark.asyncio
async def test_publish_reaches_all_subscribers():
    bus = ProjectBus()
    received_a: list[dict] = []
    received_b: list[dict] = []

    async def sink_a(ev): received_a.append(ev)
    async def sink_b(ev): received_b.append(ev)

    sa = await bus.subscribe("p1", sink_a)
    sb = await bus.subscribe("p1", sink_b)

    await bus.publish("p1", {"hello": "world"})
    assert received_a == [{"hello": "world"}]
    assert received_b == [{"hello": "world"}]

    await bus.unsubscribe("p1", sa)
    await bus.unsubscribe("p1", sb)


@pytest.mark.asyncio
async def test_publish_skips_other_projects():
    bus = ProjectBus()
    p1: list[dict] = []
    p2: list[dict] = []
    await bus.subscribe("p1", lambda e: _async_append(p1, e))
    await bus.subscribe("p2", lambda e: _async_append(p2, e))
    await bus.publish("p1", {"x": 1})
    assert p1 == [{"x": 1}]
    assert p2 == []


@pytest.mark.asyncio
async def test_dead_sink_is_pruned():
    bus = ProjectBus()
    dead_calls = 0
    alive: list[dict] = []

    async def dead(_):
        nonlocal dead_calls
        dead_calls += 1
        raise RuntimeError("ws closed")

    async def good(ev): alive.append(ev)

    await bus.subscribe("p", dead)
    await bus.subscribe("p", good)
    await bus.publish("p", {"a": 1})
    await bus.publish("p", {"a": 2})
    assert dead_calls == 1  # auto-pruned after first fail
    assert alive == [{"a": 1}, {"a": 2}]


@pytest.mark.asyncio
async def test_narrator_publishes_via_bus(monkeypatch):
    # Monkey-patch the singleton so this test stays isolated.
    from backend.orchestrator import bus as bus_mod

    captured: list[dict] = []

    async def sink(ev): captured.append(ev)

    sub_id = await bus_mod.bus.subscribe("p9", sink)
    n = Narrator("p9")
    await n.text("hello", agent_name="Berry")
    await bus_mod.bus.unsubscribe("p9", sub_id)

    assert len(captured) == 1
    msg = captured[0]
    assert msg["kind"] == "text"
    assert msg["markdown"] == "hello"
    assert msg["agent_name"] == "Berry"
    assert "message_id" in msg
    assert "timestamp" in msg


async def _async_append(lst, ev):
    lst.append(ev)
