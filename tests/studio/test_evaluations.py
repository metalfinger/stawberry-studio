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


def answers(studio, media_id, probability=0.95, **per_question):
    """Evidence for every current question of the media's owner, at one probability unless overridden."""
    owner = studio.media(media_id)["media"]["node_id"]
    out = []
    for q in studio.facts(owner)["questions"]:
        p = per_question.get(q["id"], per_question.get(q["id"].split(":")[0], probability))
        out.append(Evidence(question=q["question"], answer="yes" if p >= 0.5 else "no", probability=p,
                            asset_id=q["asset_id"], question_id=q["id"], region="crop of the subject" if q["asset_id"] else "whole frame"))
    return out


def refresh(studio, media):
    """Carry approved reviews forward after a definition change (the documented staleness consequence)."""
    for item in media:
        detail = studio.media(item["id"])
        review = detail["media"]["review"]
        if review["status"] == "approved" and review["stale"]:
            studio.review_media(item["id"], MediaReview(
                expected_revision=review["revision"], expected_context=detail["review_context"], status="approved",
                user_decision="carried forward", depicted_assets=review["depicted_assets"], requirement_ids=review["requirement_ids"]))


def evaluation(studio, media_id, kind="facts", **overrides):
    base = {
        "expected_context": studio.media(media_id)["review_context"],
        "evaluator": "host:test",
        "version": "1",
        "kind": kind,
        "scores": {"sc": 0.9, "pq": 0.9} if kind == "judge" else {},
        "evidence": answers(studio, media_id) if kind in {"facts", "stranger"} else [Evidence(question="note", answer="fine")],
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
    second = world.studio.evaluate(media_id, evaluation(world.studio, media_id, kind="judge", scores={"sc": 0.7, "pq": 0.9}))
    assert first["sequence"] < second["sequence"]
    records = world.studio.evaluations(media_id)
    assert [r["kind"] for r in records] == ["judge", "facts"]
    assert records[1]["evidence"][0]["probability"] == 0.95
    assert records[1]["scores"]["min_group"] == 0.95 and records[1]["scores"]["capped"] == 0.0
    assert records[0]["scores"]["overall"] == 0.794
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
    with pytest.raises(StudioError, match="cuts, assets and a project"):
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


def test_engine_computes_scores_and_refuses_unplaced_evidence(world):
    media_id = world.media[0]["id"]
    with pytest.raises(StudioError, match="Say where you looked"):
        world.studio.evaluate(media_id, evaluation(world.studio, media_id, evidence=[
            Evidence(question="Is Mara in frame?", answer="yes", probability=0.9, asset_id=world.mara["id"], question_id=f"subject:{world.mara['id']}")]))
    with pytest.raises(StudioError, match="question_id"):
        world.studio.evaluate(media_id, evaluation(world.studio, media_id, evidence=[
            Evidence(question="Is Mara in frame?", answer="yes", probability=0.9, region="crop")]))
    # a host-supplied headline is replaced by the engine's computation
    record = world.studio.evaluate(media_id, evaluation(world.studio, media_id, scores={"geometric_mean": 1.0},
                                                         evidence=answers(world.studio, media_id, detail=0.2)))
    assert record["scores"]["capped"] == 1.0 and record["scores"]["min_group"] <= 0.4
    assert record["scores"]["groups"]["identity"] < 0.75


def test_locks_make_state_questions_capped_and_gate_the_take(world):
    change(world.studio, world.ticket, locks=["owner_id"])
    refresh(world.studio, world.media)
    change(world.studio, world.cuts[0], **{"continuity.after": {world.ticket["id"]: {"owner_id": world.mara["id"]}}})
    cut = world.cuts[1]
    change(world.studio, cut, continuity_from=[world.cuts[0]["id"]])
    q = {x["id"]: x for x in world.studio.facts(cut["id"])["questions"]}[f"state:{world.ticket['id']}/owner_id"]
    assert q["cap_on_miss"] and q["weight"] == 3 and q["group"] == "state" and "Crop" in q["look_at"]
    # take on cut[0] (the source) must be accepted before it is fit as a reference in autonomous mode
    change(world.studio, world.project, **{"policy.autonomous": True})
    refresh(world.studio, world.media)
    take_media = take(world.studio, world.cuts[0], world.path, [world.mara["id"], world.station["id"], world.ticket["id"]], select=False)
    world.studio.evaluate(take_media["id"], evaluation(world.studio, take_media["id"], evidence=answers(world.studio, take_media["id"], pose=0.1)))
    world.studio.evaluate(take_media["id"], evaluation(world.studio, take_media["id"], kind="judge"))
    with world.studio.store.connection() as conn:
        status = world.studio.rules.take_status(conn, world.studio.store.one(conn, "media", take_media["id"]))
    assert not status["accepted"] and "capped" in " ".join(status["reasons"])
    with pytest.raises(StudioError, match="evaluation gate"):
        world.studio.select(world.cuts[0]["id"], take_media["id"], world.studio.inspect(world.cuts[0]["id"])["node"]["revision"])
    with pytest.raises(StudioError) as caught:
        world.studio.prepare(RecipeCreate(node_id=cut["id"], provider="fake", model="t", intent="i", prompt="p",
                                          references=[Reference(media_id=take_media["id"], role="base", instruction="continue"),
                                                      Reference(media_id=world.media[1]["id"], role="location", instruction="keep"),
                                                      Reference(media_id=world.media[2]["id"], role="prop", instruction="keep")]))
    codes = {i["code"] for i in caught.value.issues}
    assert "reference_unfit" in codes and "prompt_unbound" in codes


def test_autonomous_selection_needs_an_accepted_take_and_evidence_backed_review(world):
    change(world.studio, world.project, **{"policy.autonomous": True, "policy.min_take_score": 0.5})
    assert world.studio.media(world.media[0]["id"])["media"]["review"]["stale"] is False  # policy never stales a review
    cut = world.cuts[0]
    media = world.studio.import_media(cut["id"], world.path, "Take", metadata={"fake": True})
    subjects = [world.mara["id"], world.station["id"], world.ticket["id"]]
    world.studio.review_media(media["id"], MediaReview(author="script", expected_revision=0,
        expected_context=world.studio.media(media["id"])["review_context"], status="approved", user_decision="auto", depicted_assets=subjects))
    # a script's confirmation is not complete until a facts record shows the assets
    assert world.studio.media(media["id"])["media"]["review"]["complete"] is False
    with pytest.raises(StudioError, match="evaluation gate"):
        world.studio.select(cut["id"], media["id"], world.studio.inspect(cut["id"])["node"]["revision"])
    world.studio.evaluate(media["id"], evaluation(world.studio, media["id"]))
    world.studio.evaluate(media["id"], evaluation(world.studio, media["id"], kind="judge"))
    assert world.studio.media(media["id"])["media"]["review"]["complete"] is True
    world.studio.select(cut["id"], media["id"], world.studio.inspect(cut["id"])["node"]["revision"])
    workflow = world.studio.workflow(world.project["id"])
    assert workflow["evaluation_coverage"] == {"evaluated": 1, "selected": 1, "total": 2}
    assert workflow["cuts"][0]["take"]["accepted"] and workflow["cuts"][0]["take_ready"]
    assert "review_contradicted" not in {w["code"] for w in world.studio.readiness(cut["id"])["warnings"]}


def test_a_partial_answer_sheet_is_not_an_evaluation(world):
    change(world.studio, world.project, **{"policy.autonomous": True})
    media_id = world.media[0]["id"]
    full = answers(world.studio, media_id)
    world.studio.evaluate(media_id, evaluation(world.studio, media_id, evidence=full[:2]))
    world.studio.evaluate(media_id, evaluation(world.studio, media_id, kind="judge"))
    with world.studio.store.connection() as conn:
        status = world.studio.rules.take_status(conn, world.studio.store.one(conn, "media", media_id))
    assert not status["evaluated"] and "answers 2 of" in " ".join(status["reasons"])
    world.studio.evaluate(media_id, evaluation(world.studio, media_id, evidence=full))
    with world.studio.store.connection() as conn:
        assert world.studio.rules.take_status(conn, world.studio.store.one(conn, "media", media_id))["evaluated"]


def test_a_second_opinion_counts_even_when_it_is_not_required(world):
    change(world.studio, world.project, **{"policy.autonomous": True, "policy.min_take_score": 0.5})
    media_id = world.media[0]["id"]
    world.studio.evaluate(media_id, evaluation(world.studio, media_id))
    world.studio.evaluate(media_id, evaluation(world.studio, media_id, kind="judge"))
    with world.studio.store.connection() as conn:
        assert world.studio.rules.take_status(conn, world.studio.store.one(conn, "media", media_id))["accepted"]
    # a blind evaluator that scores the same take far lower stops it, with the policy flag still off
    world.studio.evaluate(media_id, evaluation(world.studio, media_id, kind="stranger",
                                               evidence=answers(world.studio, media_id, subject=0.2)))
    with world.studio.store.connection() as conn:
        status = world.studio.rules.take_status(conn, world.studio.store.one(conn, "media", media_id))
    assert not status["accepted"] and status["second_opinion"] is not None
    assert any("second evaluator disagrees" in r for r in status["reasons"])
    assert "identity" in " ".join(status["reasons"])


def test_the_style_contract_is_asked_token_by_token(world):
    change(world.studio, world.project, **{
        "bible.tokens": ["torn fibrous paper edges", "graphite linework"],
        "bible.palette_hex": ["#F1ECE2", "#12100E"],
        "bible.lighting_rules": "Flat grey daylight; no cast shadows.",
        "negative_prompts": "colour accents, glossy painting, invented props",
    })
    refresh(world.studio, world.media)
    ids = {q["id"]: q for q in world.studio.facts(world.cuts[0]["id"])["questions"]}
    assert ids["style_token:0"]["question"] == "Does the image actually show this: torn fibrous paper edges?"
    assert ids["style_token:1"]["group"] == "style" and ids["palette"]["group"] == "style"
    assert ids["lighting_rules"]["group"] == "style"
    assert ids["excluded"]["cap_on_miss"] and "invented props" in ids["excluded"]["question"]
    # an asset sheet is held to the same visual contract
    assert "style_token:0" in {q["id"] for q in world.studio.facts(world.mara["id"])["questions"]}
    # a frame that does not look like the production is capped, however well it scores elsewhere
    media_id = world.media[0]["id"]
    record = world.studio.evaluate(media_id, evaluation(
        world.studio, media_id, evidence=answers(world.studio, media_id, style_token=0.2, palette=0.3, style=0.3)))
    assert record["scores"]["groups"]["style"] < 0.5
    assert record["scores"]["capped"] == 1.0 and record["scores"]["min_group"] <= 0.4


def test_hands_are_their_own_question(world):
    ids = {q["id"]: q for q in world.studio.facts(world.cuts[0]["id"])["questions"]}
    hands = ids[f"hands:{world.mara['id']}"]
    assert hands["cap_on_miss"] and hands["weight"] == 2 and hands["group"] == "identity"
    assert "five separate readable fingers" in hands["question"]
    assert "8x" in hands["look_at"]  # a number, because "highest magnification" was obeyed at 4x and answered wrongly
    media_id = world.media[0]["id"]
    record = world.studio.evaluate(media_id, evaluation(
        world.studio, media_id, evidence=answers(world.studio, media_id, hands=0.1)))
    assert record["scores"]["capped"] == 1.0


def test_a_sheet_that_failed_its_own_evaluation_cannot_be_built_on(world):
    change(world.studio, world.project, **{"policy.autonomous": True, "policy.min_take_score": 0.6})
    refresh(world.studio, world.media)
    sheet = world.media[0]["id"]
    refs = [Reference(media_id=m["id"], role=role, instruction="keep")
            for m, role in zip(world.media, ("identity", "location", "prop"), strict=True)]
    prompt = "Mara holds the ticket. amber eyes. bone clasp"
    # an unevaluated sheet is fine — sheets are not gated on having been looked at
    world.studio.prepare(RecipeCreate(node_id=world.cuts[0]["id"], provider="fake", model="t", intent="i",
                                      prompt=prompt, references=refs))
    # but one that was looked at and failed is refused, and the message names the weakest group
    world.studio.evaluate(sheet, evaluation(world.studio, sheet, evidence=answers(world.studio, sheet, subject=0.1, detail=0.2)))
    with pytest.raises(StudioError) as caught:
        world.studio.prepare(RecipeCreate(node_id=world.cuts[0]["id"], provider="fake", model="t", intent="i",
                                          prompt=prompt, references=refs))
    unfit = [i for i in caught.value.issues if i["code"] == "reference_unfit"]
    assert unfit and "failed its own evaluation" in unfit[0]["message"] and "identity" in unfit[0]["message"]


def test_a_project_style_anchor_is_checkable(world):
    """The anchor is the one image every other image inherits; it was unevaluatable."""
    with pytest.raises(StudioError, match="no style bible"):
        world.studio.facts(world.project["id"])
    change(world.studio, world.project, **{
        "bible.tokens": ["flat black ink, no gradients"], "bible.palette_hex": ["#12100E", "#F2EFE6"],
        "negative_prompts": "photorealism, gradients"})
    ids = {q["id"]: q for q in world.studio.facts(world.project["id"])["questions"]}
    anchor = ids[f"anchor:{world.project['id']}"]
    assert anchor["cap_on_miss"] and "mistaken for a frame" in anchor["question"]
    assert ids["style_token:0"]["weight"] == 3 and ids["palette"]["group"] == "style"
    assert ids["excluded"]["cap_on_miss"]
    # nothing about cast, scope or action is asked of a swatch card
    # a swatch card is asked nothing about cast, scope, state or action
    assert {q["group"] for q in world.studio.facts(world.project["id"])["questions"]} == {"style"}
    with pytest.raises(StudioError, match="cuts, assets and a project"):
        world.studio.facts(world.scene["id"])
