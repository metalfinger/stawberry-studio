from types import SimpleNamespace

import pytest
from PIL import Image

from backend.studio.models import (
    Approval,
    EvaluationCreate,
    Evidence,
    FieldEdit,
    MediaReview,
    NodeCreate,
    NodePatch,
    RecipeCreate,
    Reference,
)
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError
from backend.studio.tools import invoke
from scripts.autopilot import step


def change(studio, node, **fields):
    current = studio.inspect(node["id"])["node"]
    studio.patch_node(node["id"], NodePatch(
        expected_revision=current["revision"], reason="Fixture",
        changes={k: v if isinstance(v, FieldEdit) else FieldEdit(value=v) for k, v in fields.items()}))


def sheet(studio, node, path):
    media = studio.import_media(node["id"], path, node["name"])
    studio.review_media(media["id"], MediaReview(expected_revision=0, expected_context=studio.media(media["id"])["review_context"],
                                                 status="approved", user_decision="ok"))
    studio.select(node["id"], media["id"], studio.inspect(node["id"])["node"]["revision"])
    return media


def answer(studio, media_id, probability=0.95, **per):
    owner = studio.media(media_id)["media"]["node_id"]
    return [Evidence(question=q["question"], answer="yes", probability=per.get(q["id"].split(":")[0], probability), asset_id=q["asset_id"],
                     question_id=q["id"], region="crop" if q["asset_id"] else "frame") for q in studio.facts(owner)["questions"]]


def record(studio, media_id, **per):
    ctx = studio.media(media_id)["review_context"]
    studio.evaluate(media_id, EvaluationCreate(expected_context=ctx, evaluator="host:test", version="1", kind="facts", evidence=answer(studio, media_id, **per)))
    studio.evaluate(media_id, EvaluationCreate(expected_context=ctx, evaluator="host:test", version="1", kind="judge", scores={"sc": 0.9, "pq": 0.9},
                                               evidence=[Evidence(question="note", answer="fine")]))


@pytest.fixture
def world(tmp_path):
    studio = Studio(Store(tmp_path / "workspace"))
    project = studio.create_node(NodeCreate(kind="project", name="Autopilot"))
    change(studio, project, style="Ink", **{"policy.autonomous": True, "policy.credit_ceiling_per_take": 1.0, "policy.max_takes_per_cut": 2,
                                            "bible.tokens": ["torn paper"]})
    mara = studio.create_node(NodeCreate(kind="character", name="Mara", parent_id=project["id"]))
    change(studio, mara, consistency_tokens=["amber eyes"])
    station = studio.create_node(NodeCreate(kind="location", name="Station", parent_id=project["id"]))
    path = tmp_path / "f.png"
    Image.new("RGB", (32, 32), "green").save(path)
    sheets = {n["name"]: sheet(studio, n, path) for n in (mara, station)}
    scene = studio.create_node(NodeCreate(kind="scene", name="S", parent_id=project["id"]))
    change(studio, scene, visible_cast=[mara["id"]], location_id=station["id"], required_props=[])
    shot = studio.create_node(NodeCreate(kind="shot", name="Shot", parent_id=scene["id"]))
    cut = studio.create_node(NodeCreate(kind="cut", name="Beat", parent_id=shot["id"], notes="Mara waits"))
    return SimpleNamespace(studio=studio, project=project, mara=mara, station=station, cut=cut, sheets=sheets, path=path)


def prepare(w, prompt="Mara waits. amber eyes. torn paper"):
    return w.studio.prepare(RecipeCreate(node_id=w.cut["id"], provider="fake", model="fixture", intent="take", prompt=prompt,
                                         references=[Reference(media_id=w.sheets["Mara"]["id"], role="identity", instruction="keep"),
                                                     Reference(media_id=w.sheets["Station"]["id"], role="location", instruction="keep")]))


def test_autopilot_runs_the_loop_and_stops_only_for_eyes(world):
    w = world
    clock = [10**12]
    first = step(w.studio, w.project["id"], fake=True, clock=lambda: clock[0], sleep=lambda s: clock.__setitem__(0, clock[0] + 10))
    assert first["cuts"][0]["stage"] == "needs_prepare" and first["tasks"][0]["task"] == "prepare"
    assert first["tasks"][0]["repair"]["suggestions"][0]["code"] == "first_take"
    prepare(w)
    second = step(w.studio, w.project["id"], fake=True, clock=lambda: clock[0], sleep=lambda s: clock.__setitem__(0, clock[0] + 10))
    assert second["log"][0]["approved"] is True
    assert second["cuts"][0]["stage"] == "awaiting_evaluation"
    task = second["tasks"][0]
    assert task["task"] == "evaluate" and task["questions"] and "look_at" in task["questions"][0]
    media_id = task["media_id"]
    assert w.studio.media(media_id)["media"]["evaluations"]["duplicate"]["kind"] == "duplicate"
    # a failing take: pose miss → rejected → repair proposal, retry allowed
    record(w.studio, media_id, pose=0.1)
    third = step(w.studio, w.project["id"], fake=True, clock=lambda: clock[0], sleep=lambda s: None)
    assert third["cuts"][0]["stage"] == "rejected"
    codes = {s["code"] for s in third["tasks"][0]["repair"]["suggestions"]}
    assert "pose_in_prompt" in codes and third["tasks"][0]["repair"]["can_retry"]
    # second take passes → evidence-backed review → selected
    prepare(w, prompt="Mara waits upright. amber eyes. torn paper")
    fourth = step(w.studio, w.project["id"], fake=True, clock=lambda: clock[0], sleep=lambda s: clock.__setitem__(0, clock[0] + 10))
    media2 = fourth["tasks"][0]["media_id"]
    record(w.studio, media2)
    fifth = step(w.studio, w.project["id"], fake=True, clock=lambda: clock[0], sleep=lambda s: None)
    assert fifth["cuts"][0]["stage"] == "accepted" and fifth["tasks"] == []
    node = w.studio.inspect(w.cut["id"])
    assert node["node"]["active_media_id"] == media2
    review = w.studio.media(media2)["media"]["review"]
    assert review["author"] == "assistant" and review["complete"] and set(review["depicted_assets"]) == {w.mara["id"], w.station["id"]}
    assert fifth["evaluation_coverage"] == {"evaluated": 1, "selected": 1, "total": 1}
    # budget: two takes used, a third prepare is refused in autonomous mode
    with pytest.raises(StudioError) as caught:
        prepare(w)
    assert any(i["code"] == "take_budget" for i in caught.value.issues)


def test_prompt_binding_is_enforced_in_autonomous_mode(world):
    with pytest.raises(StudioError) as caught:
        prepare(world, prompt="Mara waits")
    assert any(i["code"] == "prompt_unbound" and i["token"] == "amber eyes" for i in caught.value.issues)
    assert invoke(world.studio, "repair", {"id": world.cut["id"]})["takes_used"] == 0


def test_autopilot_requires_the_policy(tmp_path):
    studio = Studio(Store(tmp_path / "w"))
    project = studio.create_node(NodeCreate(kind="project", name="Manual"))
    with pytest.raises(StudioError, match="policy.autonomous"):
        step(studio, project["id"], fake=True)


def test_provider_rejection_is_definitive_and_repairable(world, monkeypatch):
    from backend.studio.providers import Higgsfield, ProviderRejected
    from backend.studio.worker import Worker

    w = world
    w.studio.patch_node(w.mara["id"], NodePatch(expected_revision=w.studio.inspect(w.mara["id"])["node"]["revision"], reason="t",
                                                 changes={"reference_mode": FieldEdit(value="text")}))
    for m in w.sheets.values():  # the field write staled the sheet reviews; carry them forward
        detail = w.studio.media(m["id"])
        if detail["media"]["review"]["stale"]:
            w.studio.review_media(m["id"], MediaReview(expected_revision=detail["media"]["review"]["revision"], expected_context=detail["review_context"],
                                                        status="approved", user_decision="carried forward"))
    # a text-only asset satisfies coverage through its quoted locks, without an image
    recipe = w.studio.prepare(RecipeCreate(node_id=w.cut["id"], provider="fake", model="fixture", intent="take", prompt="Mara waits. amber eyes. torn paper",
                                           references=[Reference(media_id=w.sheets["Station"]["id"], role="location", instruction="keep")]))
    assert recipe["warnings"] == []
    # a CLI rejection at submit is a failure with a repair, not an unknown submission
    from types import SimpleNamespace as NS

    def refuse(argv, **kw):
        return NS(returncode=1, stdout="", stderr="Error: NSFW content detected\n")
    provider = Higgsfield(run=refuse)
    with pytest.raises(ProviderRejected):
        provider.submit("j", {"model": "m", "prompt": "p", "references": [], "settings": {}}, [])
    w.studio.approve(recipe["id"], Approval(fingerprint=recipe["fingerprint"], user_decision="t", max_credits=1))
    job = w.studio.enqueue(recipe["id"])
    worker = Worker(w.studio, {"fake": provider}, allow_higgsfield=False, clock=lambda: 10**12)
    monkeypatch.setattr(worker.providers["fake"], "preflight", lambda spec: {"credits": 0, "unit": "provider_credits"})
    worker.tick(job_id=job["id"])
    assert w.studio.job(job["id"])["state"] == "failed" and w.studio.job(job["id"])["error"].startswith("provider_rejected")
    out = step(w.studio, w.project["id"], fake=True, clock=lambda: 10**12, sleep=lambda s: None)
    assert out["cuts"][0]["stage"] == "provider_rejected"
    assert out["tasks"][0]["repair"]["suggestions"][0]["code"] == "provider_rejected"
