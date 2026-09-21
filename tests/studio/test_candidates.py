from types import SimpleNamespace

import pytest
from PIL import Image

from backend.studio.models import FieldEdit, MediaReview, NodeCreate, NodePatch
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError
from backend.studio.tools import invoke


def change(studio, node, **fields):
    current = studio.inspect(node["id"])["node"]
    return studio.patch_node(
        node["id"],
        NodePatch(
            expected_revision=current["revision"],
            reason="Explicit test decision",
            changes={k: v if isinstance(v, FieldEdit) else FieldEdit(value=v) for k, v in fields.items()},
        ),
    )


def take(studio, node, path, subjects=None, select=True):
    media = studio.import_media(node["id"], path, node["name"], metadata={"fake": True})
    studio.review_media(
        media["id"],
        MediaReview(
            expected_revision=0,
            expected_context=studio.media(media["id"])["review_context"],
            status="approved",
            user_decision="Offline fixture review",
            depicted_assets=subjects or [],
        ),
    )
    if select:
        studio.select(node["id"], media["id"], studio.inspect(node["id"])["node"]["revision"])
    return media


@pytest.fixture
def world(tmp_path):
    studio = Studio(Store(tmp_path / "workspace"))
    project = studio.create_node(NodeCreate(kind="project", name="Candidates"))
    change(studio, project, style="Ink")
    mara = studio.create_node(NodeCreate(kind="character", name="Mara", parent_id=project["id"]))
    station = studio.create_node(NodeCreate(kind="location", name="Station", parent_id=project["id"]))
    alley = studio.create_node(NodeCreate(kind="location", name="Alley", parent_id=project["id"]))
    path = tmp_path / "f.png"
    Image.new("RGB", (32, 32), "green").save(path)
    sheets = {n["name"]: take(studio, n, path) for n in (mara, station, alley)}
    scene = studio.create_node(NodeCreate(kind="scene", name="Arrival", parent_id=project["id"]))
    change(studio, scene, visible_cast=[mara["id"]], location_id=station["id"], required_props=[])
    shot_a = studio.create_node(NodeCreate(kind="shot", name="Shot A", parent_id=scene["id"]))
    shot_b = studio.create_node(NodeCreate(kind="shot", name="Shot B", parent_id=scene["id"]))
    a1 = studio.create_node(NodeCreate(kind="cut", name="A1", parent_id=shot_a["id"], notes="Mara arrives"))
    a2 = studio.create_node(NodeCreate(kind="cut", name="A2", parent_id=shot_a["id"], notes="Mara waits"))
    b1 = studio.create_node(NodeCreate(kind="cut", name="B1", parent_id=shot_b["id"], notes="Moments later she turns"))
    b2 = studio.create_node(NodeCreate(kind="cut", name="B2", parent_id=shot_b["id"], notes="Elsewhere"))
    change(studio, b2, location_id=alley["id"])
    change(studio, a1, **{"continuity.after": {mara["id"]: {"cloak": "wet"}}})
    change(studio, a2, **{"continuity.after": {mara["id"]: {"cloak": "dry"}}})
    takes = {n["name"]: take(studio, n, path, [mara["id"], station["id"]]) for n in (a1, a2)}
    return SimpleNamespace(
        studio=studio, project=project, mara=mara, station=station, alley=alley, scene=scene,
        shot_a=shot_a, shot_b=shot_b, a1=a1, a2=a2, b1=b1, b2=b2, sheets=sheets, takes=takes, path=path,
    )


def by_media(result):
    return {c["media_id"]: c for c in result["candidates"]}


def test_candidates_rank_scope_assets_and_linked_takes(world):
    w = world
    change(w.studio, w.b1, continuity_from=[w.a1["id"]])
    result = invoke(w.studio, "candidates", {"id": w.b1["id"]})
    items = by_media(result)
    mara = items[w.sheets["Mara"]["id"]]
    assert mara["roles_possible"] == ["identity"] and mara["relevance"]["in_scope_asset"] and mara["depth"] == 0
    station = items[w.sheets["Station"]["id"]]
    assert station["relevance"]["same_location"] and station["relevance"]["in_scope_asset"]
    alley = items[w.sheets["Alley"]["id"]]
    assert not alley["relevance"]["in_scope_asset"] and not alley["relevance"]["same_location"]
    a1 = items[w.takes["A1"]["id"]]
    assert a1["relevance"]["continuity_linked"] and a1["relevance"]["shared_cast"] == 1
    assert a1["relevance"]["same_location"] and not a1["relevance"]["same_shot"]
    assert set(a1["roles_possible"]) == {"base", "composition", "pose", "lighting", "style"}
    assert a1["relevance_score"] > alley["relevance_score"]
    assert [c["media_id"] for c in result["candidates"]][:1] != [w.sheets["Alley"]["id"]]


def test_state_mismatch_is_flagged_not_hidden(world):
    w = world
    change(w.studio, w.b1, continuity_from=[w.a1["id"]])
    # A2 leaves Mara's cloak dry, contradicting the wet state B1 inherits from A1
    items = by_media(w.studio.candidates(w.b1["id"]))
    a2 = items[w.takes["A2"]["id"]]
    assert a2["state_flags"] == [
        {"tag": "state_mismatch", "field": f"{w.mara['id']}/cloak", "candidate_value": "dry", "expected_value": "wet"}
    ]
    assert items[w.takes["A1"]["id"]]["state_flags"] == []
    # a take whose definition changed after review is stale and is no longer offered
    change(w.studio, w.a2, **{"continuity.after": {w.mara["id"]: {"cloak": "torn"}}})
    assert w.takes["A2"]["id"] not in by_media(w.studio.candidates(w.b1["id"]))


def test_chain_recommendation_follows_the_four_rules(world):
    w = world
    assert w.studio.candidates(w.a1["id"])["chain"]["reason"] == "no previous cut"
    same_shot = w.studio.candidates(w.a2["id"])["chain"]
    assert same_shot["chain"] and same_shot["reason"] == "same shot" and same_shot["previous_cut"]["name"] == "A1"
    language = w.studio.candidates(w.b1["id"])["chain"]
    assert language["previous_cut"]["name"] == "A2" and language["chain"] and "moments later" in language["reason"]
    change(w.studio, w.b1, chain_from_prev="no")
    assert w.studio.candidates(w.b1["id"])["chain"] == {
        "previous_cut": {"id": w.a2["id"], "name": "A2"}, "media_id": w.takes["A2"]["id"],
        "chain": False, "reason": "explicit chain_from_prev",
    }
    change(w.studio, w.b1, chain_from_prev=FieldEdit(op="inherit"))
    change(w.studio, w.project, **{"policy.reference_depth_cap": 0})
    capped = w.studio.candidates(w.b1["id"])["chain"]
    assert not capped["chain"] and "cap" in capped["reason"]
    b2 = w.studio.candidates(w.b2["id"])["chain"]
    assert b2["previous_cut"]["name"] == "B1" and b2["reason"] == "previous cut has no selected take"


def test_only_cuts_have_candidates(world):
    with pytest.raises(StudioError, match="computed for cuts"):
        world.studio.candidates(world.scene["id"])
