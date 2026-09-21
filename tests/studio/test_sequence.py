from types import SimpleNamespace

import pytest

from backend.studio.models import FieldEdit, NodeCreate, NodePatch
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError
from backend.studio.tools import invoke


def change(studio, node, **fields):
    studio.patch_node(node["id"], NodePatch(
        expected_revision=studio.inspect(node["id"])["node"]["revision"], reason="Fixture",
        changes={k: v if isinstance(v, FieldEdit) else FieldEdit(value=v) for k, v in fields.items()}))


@pytest.fixture
def film(tmp_path):
    studio = Studio(Store(tmp_path / "w"))
    project = studio.create_node(NodeCreate(kind="project", name="Edit"))
    change(studio, project, style="Ink", target_duration_seconds=20)
    mara = studio.create_node(NodeCreate(kind="character", name="Mara", parent_id=project["id"]))
    road = studio.create_node(NodeCreate(kind="location", name="Road", parent_id=project["id"]))
    door = studio.create_node(NodeCreate(kind="location", name="Door", parent_id=project["id"]))
    scenes, cuts = {}, {}
    for si, (scene_name, shots) in enumerate([("Road", [("Run", ["A1", "A2", "A3"])]), ("Door", [("Cross", ["B1", "B2"])])]):
        scene = studio.create_node(NodeCreate(kind="scene", name=scene_name, parent_id=project["id"]))
        scenes[scene_name] = scene
        change(studio, scene, visible_cast=[mara["id"]], required_props=[], location_id=(road if si == 0 else door)["id"])
        for shot_name, names in shots:
            shot = studio.create_node(NodeCreate(kind="shot", name=shot_name, parent_id=scene["id"]))
            for n in names:
                cut = studio.create_node(NodeCreate(kind="cut", name=n, parent_id=shot["id"], notes="she moves"))
                change(studio, cut, duration_seconds=4, **{"camera.framing": "wide", "camera.angle": "eye"})
                cuts[n] = cut
    return SimpleNamespace(studio=studio, project=project, mara=mara, road=road, door=door, scenes=scenes, cuts=cuts)


def codes(result):
    return [f["code"] for f in result["findings"]]


def test_direction_reversal_inside_a_scene_is_flagged(film):
    change(film.studio, film.cuts["A1"], screen_direction="right")
    change(film.studio, film.cuts["A2"], screen_direction="left")
    result = film.studio.sequence(film.project["id"])
    assert "direction_reversed" in codes(result)
    finding = next(f for f in result["findings"] if f["code"] == "direction_reversed")
    assert finding["cut"] == "A2" and "no declared crossing" in finding["message"]
    # a declared crossing in the action makes it deliberate
    change(film.studio, film.cuts["A2"], action="She crosses the road to the far side")
    change(film.studio, film.cuts["A3"], screen_direction="left")
    assert "direction_reversed" not in codes(film.studio.sequence(film.project["id"]))
    # a change across a scene boundary is never a reversal
    change(film.studio, film.cuts["B1"], screen_direction="right")
    assert "direction_reversed" not in codes(film.studio.sequence(film.project["id"]))


def test_neighbouring_cuts_that_render_the_same_picture(film):
    result = film.studio.sequence(film.project["id"])
    assert codes(result).count("coverage_repeats") == 3  # A2, A3 and B2 repeat their predecessor
    change(film.studio, film.cuts["A2"], **{"camera.framing": "close"})
    assert [f["cut"] for f in film.studio.sequence(film.project["id"])["findings"] if f["code"] == "coverage_repeats"] == ["B2"]


def test_a_declared_match_cut_is_expected_not_redundant(film):
    change(film.studio, film.cuts["B2"], match_frame=film.cuts["B1"]["id"])
    result = film.studio.sequence(film.project["id"])
    assert "B2" not in [f.get("cut") for f in result["findings"] if f["code"] == "coverage_repeats"]
    # but a match that does not actually match is worse than a repeat
    change(film.studio, film.cuts["B2"], **{"camera.angle": "low"})
    finding = next(f for f in film.studio.sequence(film.project["id"])["findings"] if f["code"] == "match_frame_mismatch")
    assert finding["fields"] == ["camera.angle"] and "cannot cut together" in finding["message"]


def test_match_frame_must_point_backwards_and_exist(film):
    change(film.studio, film.cuts["B1"], match_frame=film.cuts["B2"]["id"])
    assert "match_frame_forward" in codes(film.studio.sequence(film.project["id"]))
    with pytest.raises(StudioError, match="cannot match itself"):
        change(film.studio, film.cuts["A1"], match_frame=film.cuts["A1"]["id"])
    with pytest.raises(StudioError, match="not a cut"):
        change(film.studio, film.cuts["A1"], match_frame=film.road["id"])


def test_rhythm_and_repeated_beats(film):
    result = film.studio.sequence(film.project["id"])
    assert result["declared_runtime_seconds"] == 20 and "runtime_drift" not in codes(result)
    assert "framing_monotony" in codes(result)  # five cuts, all wide
    change(film.studio, film.cuts["A1"], duration_seconds=18)
    drift = next(f for f in film.studio.sequence(film.project["id"])["findings"] if f["code"] == "runtime_drift")
    assert "+70%" in drift["message"]
    for name in ("A1", "A2"):
        change(film.studio, film.cuts[name], **{"beat.visual_point": "She is small against the road"})
    assert "beat_repeats" in codes(film.studio.sequence(film.project["id"]))


def test_sequence_is_a_read_op_and_reports_scene_coverage(film):
    result = invoke(film.studio, "sequence", {"id": film.project["id"]})
    assert result["cuts"] == 5 and set(result["scenes"]) == {"Road", "Door"}
    assert result["scenes"]["Road"] == {"cuts": 3, "selected": 0, "evaluated": 0, "accepted": 0}
    assert result["ok"] is False
    with pytest.raises(StudioError, match="Expected a project ID"):
        film.studio.sequence(film.cuts["A1"]["id"])
