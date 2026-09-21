import hashlib
import json
import zipfile
from types import SimpleNamespace

import pytest
from PIL import Image
from pydantic import ValidationError

from backend.studio.models import (
    Discrepancy,
    EvaluationCreate,
    Evidence,
    FieldEdit,
    MediaReview,
    NodeCreate,
    NodePatch,
    RecipeCreate,
    Reference,
)
from backend.studio.project_archive import export_project, import_project
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


def take(studio, node, path, subjects=None):
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
    studio.select(node["id"], media["id"], studio.inspect(node["id"])["node"]["revision"])
    return media


def evaluation(studio, media_id, kind="facts", **overrides):
    base = {
        "expected_context": studio.media(media_id)["review_context"],
        "evaluator": "host:test",
        "version": "1",
        "kind": kind,
        "scores": {"geometric_mean": 0.9, "arithmetic_mean": 0.95},
        "evidence": [Evidence(question="Is Mara in frame?", answer="yes", probability=0.95)],
        "discrepancies": [],
    }
    return EvaluationCreate(**{**base, **overrides})


@pytest.fixture
def world(tmp_path):
    studio = Studio(Store(tmp_path / "workspace"))
    project = studio.create_node(NodeCreate(kind="project", name="Evaluated", notes="Test production"))
    change(studio, project, style="Charcoal collage")
    mara = studio.create_node(NodeCreate(kind="character", name="Mara", parent_id=project["id"]))
    change(studio, mara, consistency_tokens=["amber eyes", "bone clasp"], wardrobe="wool cloak")
    station = studio.create_node(NodeCreate(kind="location", name="Station", parent_id=project["id"]))
    ticket = studio.create_node(NodeCreate(kind="prop", name="Ticket", parent_id=project["id"]))
    path = tmp_path / "fixture.png"
    Image.new("RGB", (64, 64), "green").save(path)
    media = [take(studio, node, path) for node in (mara, station, ticket)]
    scene = studio.create_node(NodeCreate(kind="scene", name="Arrival", parent_id=project["id"]))
    change(studio, scene, visible_cast=[mara["id"]], location_id=station["id"], required_props=[ticket["id"]])
    shot = studio.create_node(NodeCreate(kind="shot", name="Platform", parent_id=scene["id"]))
    cuts = [
        studio.create_node(NodeCreate(kind="cut", name=f"Beat {i}", parent_id=shot["id"], notes="Mara holds the ticket"))
        for i in range(2)
    ]
    return SimpleNamespace(
        studio=studio, project=project, mara=mara, station=station, ticket=ticket, scene=scene, cuts=cuts, media=media, path=path
    )


def test_evaluate_is_append_only_and_never_touches_review(world):
    media_id = world.media[0]["id"]
    first = world.studio.evaluate(media_id, evaluation(world.studio, media_id))
    second = world.studio.evaluate(
        media_id, evaluation(world.studio, media_id, kind="judge", scores={"sc": 0.7, "pq": 0.9, "overall": 0.79})
    )
    assert first["sequence"] < second["sequence"]
    records = world.studio.evaluations(media_id)
    assert [r["kind"] for r in records] == ["judge", "facts"]
    assert records[1]["evidence"][0]["probability"] == 0.95
    detail = world.studio.media(media_id)
    assert detail["media"]["review"]["status"] == "approved" and detail["media"]["review"]["revision"] == 1
    assert len(detail["evaluations"]) == 2
    assert set(detail["media"]["evaluations"]) == {"facts", "judge"}
    assert invoke(world.studio, "evaluations", {"id": media_id})[0]["kind"] == "judge"
    assert "evaluations" not in world.studio.context(world.mara["id"])


def test_evaluation_binds_to_the_current_definition(world):
    media_id = world.media[0]["id"]
    request = evaluation(world.studio, media_id)
    change(world.studio, world.mara, appearance="older now")
    with pytest.raises(StudioError, match="Inspect the image again"):
        world.studio.evaluate(media_id, request)
    world.studio.evaluate(media_id, evaluation(world.studio, media_id))


def test_scores_and_tags_are_validated():
    with pytest.raises(ValidationError):
        EvaluationCreate(expected_context="a" * 64, evaluator="x", version="1", kind="judge", scores={"sc": 1.5})
    with pytest.raises(ValidationError):
        Discrepancy(tag="vibes", note="no")
    with pytest.raises(ValidationError):
        EvaluationCreate(expected_context="a" * 64, evaluator="x", version="1", kind="mood")


def test_facts_are_derived_from_declared_scope_states_and_identity(world):
    cut = world.cuts[1]
    change(world.studio, world.cuts[0], **{"continuity.after": {world.mara["id"]: {"cloak": "wet", "owner_id": None}}})
    change(world.studio, cut, continuity_from=[world.cuts[0]["id"]], **{"beat.visual_point": "the ticket is all she has"})
    facts = invoke(world.studio, "facts", {"id": cut["id"]})
    by_id = {q["id"]: q for q in facts["questions"]}
    assert by_id[f"cast:{world.mara['id']}"]["cap_on_miss"] and by_id[f"cast:{world.mara['id']}"]["weight"] == 3
    assert by_id[f"detail:{world.mara['id']}:0"]["question"] == "Does Mara show 'amber eyes'?"
    assert by_id[f"pose:{world.mara['id']}"]["cap_on_miss"] and "plausible" in by_id[f"pose:{world.mara['id']}"]["question"]
    assert by_id[f"wardrobe:{world.mara['id']}"]["question"] == "Is Mara wearing: wool cloak?"
    assert by_id[f"location:{world.station['id']}"]["question"] == "Is this Station?"
    assert by_id[f"prop:{world.ticket['id']}"]["question"] == "Is Ticket visible?"
    assert by_id[f"state:{world.mara['id']}/cloak"]["question"] == "Is Mara's cloak wet?"
    assert by_id["action"]["question"].endswith("Mara holds the ticket?")
    assert by_id["beat"]["question"] == "Does the frame carry this: the ticket is all she has?"
    assert by_id["style"]["question"] == "Is the image rendered in this style: Charcoal collage?"
    # a conflicting incoming state is not asked
    change(world.studio, cut, **{"continuity.before": {world.mara["id"]: {"cloak": "dry"}}})
    change(world.studio, cut, **{"continuity.before": FieldEdit(op="inherit")})
    other = world.studio.create_node(NodeCreate(kind="cut", name="Beat X", parent_id=world.scene["id"] and cut["parent_id"], notes="x"))
    change(world.studio, other, **{"continuity.after": {world.mara["id"]: {"cloak": "dry"}}})
    change(world.studio, cut, continuity_from=[world.cuts[0]["id"], other["id"]])
    ids = {q["id"] for q in world.studio.facts(cut["id"])["questions"]}
    assert f"state:{world.mara['id']}/cloak" not in ids
    # a state about an asset that is not in this frame is not asked
    empty = world.studio.create_node(NodeCreate(kind="cut", name="Insert", parent_id=cut["parent_id"], notes="clock"))
    change(world.studio, empty, visible_cast=[], required_props=[], continuity_from=[world.cuts[0]["id"]])
    assert not [q for q in world.studio.facts(empty["id"])["questions"] if q["id"].startswith("state:")]
    # assets get identity questions; other kinds are refused
    asset_facts = world.studio.facts(world.mara["id"])
    assert asset_facts["questions"][0]["id"] == f"subject:{world.mara['id']}"
    with pytest.raises(StudioError, match="cuts and assets"):
        world.studio.facts(world.scene["id"])


def test_unevaluated_reference_warns_and_can_be_a_policy(world):
    cut = world.cuts[0]
    warnings = {w["code"] for w in world.studio.readiness(cut["id"])["warnings"]}
    assert "reference_unevaluated" in warnings
    for media in world.media:
        world.studio.evaluate(media["id"], evaluation(world.studio, media["id"]))
    assert "reference_unevaluated" not in {w["code"] for w in world.studio.readiness(cut["id"])["warnings"]}
    refs = [
        Reference(media_id=m["id"], role=role, instruction="Keep")
        for m, role in zip(world.media, ("identity", "location", "prop"), strict=True)
    ]
    world.studio.prepare(RecipeCreate(node_id=cut["id"], provider="fake", model="t", intent="i", prompt="p", references=refs))
    # a new definition on the location invalidates its evaluation; policy then refuses the reference
    change(world.studio, world.project, **{"policy.require_evaluation_for_reference": True})
    take(world.studio, world.station, world.path)  # fresh selected reference with no evaluation
    with pytest.raises(StudioError) as caught:
        world.studio.prepare(
            RecipeCreate(
                node_id=cut["id"], provider="fake", model="t", intent="i", prompt="p",
                references=[
                    Reference(media_id=world.studio.inspect(world.station["id"])["node"]["active_media_id"], role="location", instruction="Keep"),
                    *[r for r in refs if r.role != "location"],
                ],
            )
        )
    assert any(issue["code"] == "reference_unevaluated" for issue in caught.value.issues)


def _rewrite_without_evaluations(archive, target):
    with zipfile.ZipFile(archive) as bundle:
        manifest = json.loads(bundle.read("manifest.json"))
        payload = json.loads(bundle.read("project.json"))
        del payload["tables"]["evaluations"]
        data = json.dumps(payload).encode()
        manifest["files"]["project.json"] = {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
        with zipfile.ZipFile(target, "w") as out:
            for item in bundle.infolist():
                if item.filename == "manifest.json":
                    out.writestr(item.filename, json.dumps(manifest))
                elif item.filename == "project.json":
                    out.writestr(item.filename, data)
                else:
                    out.writestr(item, bundle.read(item.filename))


def test_archives_carry_evaluations_and_older_archives_still_import(world, tmp_path):
    media_id = world.media[0]["id"]
    world.studio.evaluate(media_id, evaluation(world.studio, media_id, discrepancies=[Discrepancy(tag="artifact", note="smudge")]))
    archive = tmp_path / "project.zip"
    export_project(world.studio.store, world.project["id"], archive)
    copy = Studio(Store(tmp_path / "copy"))
    import_project(copy.store, archive)
    imported = copy.evaluations(media_id)
    assert len(imported) == 1 and imported[0]["discrepancies"][0]["tag"] == "artifact"
    older = tmp_path / "older.zip"
    _rewrite_without_evaluations(archive, older)
    legacy = Studio(Store(tmp_path / "legacy"))
    import_project(legacy.store, older)
    assert legacy.evaluations(media_id) == []
