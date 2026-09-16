"""Post-turn ordering pass — base-level chronological guarantee.

Even if the agent forgets to pass scene_number on add_scene, the runner
auto-reorders to match the position of each tool call in the model's
response (which is the agent's *intended* order). These tests build a
synthetic message list shaped like pydantic-ai's `all_messages()` output
and verify reorder_from_turn correctly renumbers the DB.
"""
from __future__ import annotations

import uuid

import pytest
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    ToolCallPart,
    ToolReturnPart,
)

from backend import db
from backend import db
get_connection = db.get_connection
from backend.orchestrator.turn_ordering import reorder_from_turn
from backend.tools.blueprint import add_scene


@pytest.fixture
def project_id():
    pid = f"proj_{uuid.uuid4().hex[:8]}"
    c = get_connection()
    c.execute("INSERT INTO projects (id, name, current_phase) VALUES (?, ?, 'STORY')", (pid, "ord-test"))
    c.commit()
    c.close()
    yield pid
    try:
        c = get_connection()
        c.execute("DELETE FROM scenes WHERE project_id = ?", (pid,))
        c.execute("DELETE FROM projects WHERE id = ?", (pid,))
        c.commit()
        c.close()
    except Exception:
        pass


def _add_scene_call_part(call_id: str, title: str) -> ToolCallPart:
    return ToolCallPart(tool_name="add_scene", args={"project_id": "irrelevant", "title": title}, tool_call_id=call_id)


def _add_scene_return_part(call_id: str, scene_id: str, title: str) -> ToolReturnPart:
    # The actual add_scene returns a string containing "(ID: scene_xxx)".
    content = f"✅ Added Scene 1: {title} (ID: {scene_id})"
    return ToolReturnPart(tool_name="add_scene", content=content, tool_call_id=call_id)


def test_reorder_from_turn_renumbers_to_response_order(project_id):
    # Simulate Sage having created scenes in the wrong DB-arrival order.
    # Author intent: Countdown → Flop → Aftermath.
    # DB ended up: Aftermath (1), Flop (2), Countdown (3).
    add_scene(project_id, "The Aftermath")
    add_scene(project_id, "One Small Flop")
    add_scene(project_id, "The Countdown")
    rows = {s["title"]: s for s in db.get_scenes(project_id)}
    aftermath_id = rows["The Aftermath"]["id"]
    flop_id = rows["One Small Flop"]["id"]
    countdown_id = rows["The Countdown"]["id"]
    assert rows["The Aftermath"]["scene_number"] == 1  # confirms scrambled state

    # Build a synthetic message stream where the model's intent was
    # Countdown → Flop → Aftermath: a single ModelResponse with three
    # ToolCallParts in that order, followed by ModelRequests carrying
    # the matching ToolReturnParts.
    cid_1, cid_2, cid_3 = "call-1", "call-2", "call-3"
    response = ModelResponse(parts=[
        _add_scene_call_part(cid_1, "The Countdown"),
        _add_scene_call_part(cid_2, "One Small Flop"),
        _add_scene_call_part(cid_3, "The Aftermath"),
    ])
    returns = ModelRequest(parts=[
        _add_scene_return_part(cid_1, countdown_id, "The Countdown"),
        _add_scene_return_part(cid_2, flop_id, "One Small Flop"),
        _add_scene_return_part(cid_3, aftermath_id, "The Aftermath"),
    ])

    counts = reorder_from_turn(project_id, [response, returns])
    assert counts["scenes"] == 3

    # On disk we should now read in author-intended order.
    after = db.get_scenes(project_id)
    titles_in_order = [(s["scene_number"], s["title"]) for s in after]
    assert titles_in_order == [
        (1, "The Countdown"),
        (2, "One Small Flop"),
        (3, "The Aftermath"),
    ]


def test_reorder_from_turn_skips_when_partial(project_id):
    # Two pre-existing scenes; this turn only added one — should NOT
    # rewrite the project's order.
    add_scene(project_id, "Pre-existing 1")
    add_scene(project_id, "Pre-existing 2")
    add_scene(project_id, "Brand new")
    rows = db.get_scenes(project_id)
    new_id = rows[-1]["id"]
    assert rows[-1]["title"] == "Brand new"

    response = ModelResponse(parts=[_add_scene_call_part("c1", "Brand new")])
    returns = ModelRequest(parts=[_add_scene_return_part("c1", new_id, "Brand new")])

    counts = reorder_from_turn(project_id, [response, returns])
    assert counts["scenes"] == 0  # safety: only 1 added, skip reorder

    titles = [s["title"] for s in db.get_scenes(project_id)]
    assert titles == ["Pre-existing 1", "Pre-existing 2", "Brand new"]


def test_reorder_from_turn_handles_empty_messages(project_id):
    counts = reorder_from_turn(project_id, [])
    assert counts == {"scenes": 0, "shots": 0, "cuts": 0}


# ─── Shots ordering ──────────────────────────────────────────────

def _add_shot_call_part(call_id: str, scene_id: str, description: str) -> ToolCallPart:
    return ToolCallPart(
        tool_name="add_shot",
        args={"scene_id": scene_id, "description": description},
        tool_call_id=call_id,
    )


def _add_shot_return_part(call_id: str, shot_id: str) -> ToolReturnPart:
    return ToolReturnPart(
        tool_name="add_shot",
        content=f"✅ Added Shot 1 (ID: {shot_id})",
        tool_call_id=call_id,
    )


def test_shots_renumber_to_response_order(project_id):
    from backend.tools.blueprint import add_scene, add_shot

    add_scene(project_id, "Scene 1")
    scene_id = db.get_scenes(project_id)[0]["id"]

    # Author intent (in this hypothetical model response): A → B → C.
    # Pretend pydantic-ai dispatched in order C → A → B (so shot_number
    # in DB starts wrong).
    add_shot(scene_id, "C — boot snag")
    add_shot(scene_id, "A — boot contact")
    add_shot(scene_id, "B — dust kick")
    rows = {r["description"]: r for r in db.get_shots(scene_id)}
    a_id = rows["A — boot contact"]["id"]
    b_id = rows["B — dust kick"]["id"]
    c_id = rows["C — boot snag"]["id"]

    response = ModelResponse(parts=[
        _add_shot_call_part("s1", scene_id, "A — boot contact"),
        _add_shot_call_part("s2", scene_id, "B — dust kick"),
        _add_shot_call_part("s3", scene_id, "C — boot snag"),
    ])
    returns = ModelRequest(parts=[
        _add_shot_return_part("s1", a_id),
        _add_shot_return_part("s2", b_id),
        _add_shot_return_part("s3", c_id),
    ])
    counts = reorder_from_turn(project_id, [response, returns])
    assert counts["shots"] == 3
    after = [(s["shot_number"], s["description"]) for s in db.get_shots(scene_id)]
    assert after == [
        (1, "A — boot contact"),
        (2, "B — dust kick"),
        (3, "C — boot snag"),
    ]


# ─── Cuts ordering ───────────────────────────────────────────────

def _add_cut_call_part(call_id: str, shot_id: str, action: str) -> ToolCallPart:
    return ToolCallPart(
        tool_name="add_cut",
        args={"shot_id": shot_id, "action": action, "story_description": "x"},
        tool_call_id=call_id,
    )


def _add_cut_return_part(call_id: str, cut_id: str) -> ToolReturnPart:
    return ToolReturnPart(
        tool_name="add_cut",
        content=f"✅ Added Cut 1 (ID: {cut_id})",
        tool_call_id=call_id,
    )


def test_cuts_renumber_to_response_order(project_id):
    from backend.tools.blueprint import add_scene, add_shot, add_cut

    add_scene(project_id, "Scene 1")
    scene_id = db.get_scenes(project_id)[0]["id"]
    add_shot(scene_id, "Shot 1")
    shot_id = db.get_shots(scene_id)[0]["id"]

    # DB-arrival scrambled: 'flails' lands before 'falls' (matches the
    # exact bug we saw in Test 2 / S2 / Sh2).
    add_cut(shot_id, "falls face-first", "x")
    add_cut(shot_id, "flails to regain balance", "x")
    rows = {c["action"]: c for c in db.get_cuts(shot_id)}
    flails_id = rows["flails to regain balance"]["id"]
    falls_id = rows["falls face-first"]["id"]

    # Author intent: flail first, then fall.
    response = ModelResponse(parts=[
        _add_cut_call_part("c1", shot_id, "flails to regain balance"),
        _add_cut_call_part("c2", shot_id, "falls face-first"),
    ])
    returns = ModelRequest(parts=[
        _add_cut_return_part("c1", flails_id),
        _add_cut_return_part("c2", falls_id),
    ])
    counts = reorder_from_turn(project_id, [response, returns])
    assert counts["cuts"] == 2
    after = [(c["cut_number"], c["action"]) for c in db.get_cuts(shot_id)]
    assert after == [
        (1, "flails to regain balance"),
        (2, "falls face-first"),
    ]


def test_full_blueprint_in_one_turn_orders_all_levels(project_id):
    """Sage creating an entire blueprint in a single turn (3 scenes, 2
    shots each, 2 cuts each) — every level must come out in author order
    even though pydantic-ai dispatched the writes in a random order."""
    from backend.tools.blueprint import add_scene, add_shot, add_cut

    # Pretend dispatch order was reversed at every level.
    add_scene(project_id, "Aftermath")
    add_scene(project_id, "Flop")
    add_scene(project_id, "Countdown")
    by_title = {s["title"]: s for s in db.get_scenes(project_id)}
    countdown = by_title["Countdown"]
    flop = by_title["Flop"]
    aftermath = by_title["Aftermath"]

    response_parts: list = []
    return_parts: list = []
    counter = 0

    def push_call_and_return(name: str, args: dict, ret_content: str) -> None:
        nonlocal counter
        counter += 1
        cid = f"c{counter}"
        response_parts.append(ToolCallPart(tool_name=name, args=args, tool_call_id=cid))
        return_parts.append(ToolReturnPart(tool_name=name, content=ret_content, tool_call_id=cid))

    # Scenes in author order
    for sc in (countdown, flop, aftermath):
        push_call_and_return("add_scene", {"project_id": project_id, "title": sc["title"]},
                             f"Added (ID: {sc['id']})")

    # Shots & cuts per scene — but only on scenes that have NO shots yet.
    # We'll add shots to "countdown" alone for this test.
    add_shot(countdown["id"], "Sh1 reversed")
    add_shot(countdown["id"], "Sh1 author-first")
    shots = db.get_shots(countdown["id"])
    sh_first = next(s for s in shots if s["description"] == "Sh1 author-first")
    sh_second = next(s for s in shots if s["description"] == "Sh1 reversed")
    push_call_and_return("add_shot",
                         {"scene_id": countdown["id"], "description": "Sh1 author-first"},
                         f"Added (ID: {sh_first['id']})")
    push_call_and_return("add_shot",
                         {"scene_id": countdown["id"], "description": "Sh1 reversed"},
                         f"Added (ID: {sh_second['id']})")

    response = ModelResponse(parts=response_parts)
    returns = ModelRequest(parts=return_parts)
    counts = reorder_from_turn(project_id, [response, returns])

    assert counts["scenes"] == 3
    assert counts["shots"] == 2

    scene_titles = [(s["scene_number"], s["title"]) for s in db.get_scenes(project_id)]
    assert scene_titles == [(1, "Countdown"), (2, "Flop"), (3, "Aftermath")]
    shot_descs = [(s["shot_number"], s["description"]) for s in db.get_shots(countdown["id"])]
    assert shot_descs == [(1, "Sh1 author-first"), (2, "Sh1 reversed")]
