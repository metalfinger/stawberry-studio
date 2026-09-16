"""Explicit-ordering and reorder-tool tests.

Locks the rule that:
- add_scene with explicit `scene_number` lands at that slot and shifts
  any existing scene at-or-after that number up by one;
- add_scene without `scene_number` falls back to atomic MAX+1;
- reorder_scenes renumbers all scenes for a project to a 1..N sequence
  matching the supplied id list, atomically.

Same shape applies to add_shot / add_cut and their reorder tools.
"""
from __future__ import annotations

import pytest

from backend import db
from backend.tools import blueprint as bp


@pytest.fixture
def project_id():
    pid = db.create_project("test-ordering").get("id") if hasattr(db, "create_project") else None
    if not pid:
        # Fallback: insert directly.
        import uuid as _u
        pid = f"proj_{_u.uuid4().hex[:8]}"
        c = db.get_connection()
        c.execute("INSERT INTO projects (id, name, current_phase) VALUES (?, ?, 'STORY')", (pid, "test-ordering"))
        c.commit()
        c.close()
    yield pid
    # best-effort cleanup
    try:
        get_connection = db.get_connection
        c = get_connection()
        c.execute("DELETE FROM scenes WHERE project_id = ?", (pid,))
        c.execute("DELETE FROM projects WHERE id = ?", (pid,))
        c.commit()
        c.close()
    except Exception:
        pass


def _scene_ids_in_order(project_id: str) -> list[tuple[int, str]]:
    return [(s["scene_number"], s["title"]) for s in db.get_scenes(project_id)]


def test_explicit_scene_number_inserts_in_correct_slot(project_id):
    bp.add_scene(project_id, "C", scene_number=1)
    bp.add_scene(project_id, "F", scene_number=2)
    bp.add_scene(project_id, "A", scene_number=3)
    assert _scene_ids_in_order(project_id) == [(1, "C"), (2, "F"), (3, "A")]


def test_explicit_insert_into_middle_shifts_later_scenes(project_id):
    bp.add_scene(project_id, "First", scene_number=1)
    bp.add_scene(project_id, "Last", scene_number=2)
    # Insert middle — Last should shift to 3.
    bp.add_scene(project_id, "Middle", scene_number=2)
    assert _scene_ids_in_order(project_id) == [(1, "First"), (2, "Middle"), (3, "Last")]


def test_auto_number_falls_back_to_max_plus_one(project_id):
    bp.add_scene(project_id, "S1")
    bp.add_scene(project_id, "S2")
    nums = [n for n, _ in _scene_ids_in_order(project_id)]
    assert nums == [1, 2]


def test_reorder_scenes_renumbers_to_match_list(project_id):
    bp.add_scene(project_id, "Aftermath")
    bp.add_scene(project_id, "Flop")
    bp.add_scene(project_id, "Countdown")
    scenes = db.get_scenes(project_id)
    by_title = {s["title"]: s["id"] for s in scenes}
    ordered = [by_title["Countdown"], by_title["Flop"], by_title["Aftermath"]]
    msg = bp.reorder_scenes(project_id, ordered)
    assert "✅" in msg
    assert _scene_ids_in_order(project_id) == [(1, "Countdown"), (2, "Flop"), (3, "Aftermath")]


def test_reorder_rejects_partial_list(project_id):
    bp.add_scene(project_id, "S1")
    bp.add_scene(project_id, "S2")
    s2 = db.get_scenes(project_id)[1]["id"]
    msg = bp.reorder_scenes(project_id, [s2])  # missing S1
    assert "❌" in msg
    # Pre-existing order untouched.
    assert _scene_ids_in_order(project_id) == [(1, "S1"), (2, "S2")]
