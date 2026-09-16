import json
import threading
import time

import pytest
from PIL import Image

from backend.studio.execution import Execution, validate_cost
from backend.studio.models import Approval, MediaReview, NodeCreate, RecipeCreate, Reconciliation, Reference
from backend.studio.providers import Higgsfield, SubmissionUnknown
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError, encoded
from backend.studio.worker import Worker


@pytest.fixture
def studio(tmp_path):
    return Studio(Store(tmp_path / "workspace"))


def queued(studio, with_reference=False):
    node = studio.create_node(NodeCreate(kind="project", name="Offline recovery"))
    refs = []
    if with_reference:
        asset = studio.create_node(NodeCreate(kind="character", name="Offline actor", parent_id=node["id"]))
        path = studio.store.home / "ref.png"
        Image.new("RGB", (16, 16), "green").save(path)
        image = studio.import_media(asset["id"], path, "Offline identity")
        studio.review_media(
            image["id"],
            MediaReview(
                expected_revision=0,
                expected_context=studio.media(image["id"])["review_context"],
                status="approved",
                user_decision="Offline test",
            ),
        )
        refs = [Reference(media_id=image["id"], role="identity", instruction="Preserve identity")]
    recipe = studio.prepare(
        RecipeCreate(
            node_id=node["id"],
            provider="fake",
            model="fixture",
            prompt="Offline recovery frame",
            intent="Test",
            references=refs,
        )
    )
    studio.approve(recipe["id"], Approval(fingerprint=recipe["fingerprint"], user_decision="Offline test"))
    return node, recipe, studio.enqueue(recipe["id"])


def uncertain(studio, monkeypatch, with_reference=False):
    node, recipe, job = queued(studio, with_reference)
    worker = Worker(studio)
    submit = worker.providers["fake"].submit

    def accepted_but_lost(*args):
        submit(*args)
        raise SubmissionUnknown("Lost receipt after acceptance")

    monkeypatch.setattr(worker.providers["fake"], "submit", accepted_but_lost)
    worker.tick(job_id=job["id"])
    assert studio.job(job["id"])["state"] == "submission_unknown"
    return node, recipe, job


def test_cost_policy_rechecked_at_dispatch(studio, monkeypatch):
    _, recipe, job = queued(studio)
    worker = Worker(studio)
    with studio.store.connection(write=True) as conn:
        conn.execute(
            "UPDATE recipe_approvals SET policy=? WHERE recipe_id=?", (encoded({"max_credits": 5}), recipe["id"])
        )

    def preflight(_spec):
        with studio.store.connection(write=True) as conn:
            conn.execute(
                "UPDATE recipe_approvals SET policy=? WHERE recipe_id=?", (encoded({"max_credits": 1}), recipe["id"])
            )
        return {"credits": 2}

    calls = []
    monkeypatch.setattr(worker.providers["fake"], "preflight", preflight)
    monkeypatch.setattr(worker.providers["fake"], "submit", lambda *args: calls.append(args))
    worker.tick(job_id=job["id"])
    assert studio.job(job["id"])["state"] == "failed"
    assert "ceiling" in studio.job(job["id"])["error"]
    assert not calls


def test_disabled_paid_queue_is_not_consumed(studio):
    _, recipe, job = queued(studio)
    with studio.store.connection(write=True) as conn:
        spec = recipe["spec"] | {"provider": "higgsfield"}
        conn.execute("UPDATE recipes SET spec=? WHERE id=?", (encoded(spec), recipe["id"]))
    assert not Worker(studio).tick()
    assert studio.job(job["id"])["state"] == "queued"
    studio.execution.cancel(job["id"])
    assert studio.job(job["id"])["state"] == "cancelled"


def test_runtime_distinguishes_responsive_stale_stopped(studio):
    clock = [100.0]
    worker = Worker(studio, clock=lambda: clock[0], allow_higgsfield=True)
    execution = Execution(studio, clock=lambda: clock[0])
    assert not execution.status()["responsive"]
    worker.pulse()
    assert execution.status()["higgsfield_enabled"]
    clock[0] += 31
    assert not execution.status()["responsive"]
    worker.pulse(stopped=True)
    assert not execution.status()["responsive"]


def test_cancel_before_dispatch_wins_race(studio, monkeypatch):
    _, _, job = queued(studio)
    worker = Worker(studio)

    def preflight(_spec):
        studio.execution.cancel(job["id"])
        return {"credits": 0}

    calls = []
    monkeypatch.setattr(worker.providers["fake"], "preflight", preflight)
    monkeypatch.setattr(worker.providers["fake"], "submit", lambda *args: calls.append(args))
    worker.tick()
    assert studio.job(job["id"])["state"] == "cancelled"
    assert not calls
    assert studio.execution.cancel(job["id"])["state"] == "cancelled"


def test_submitted_job_cannot_be_cancelled_locally(studio):
    _, _, job = queued(studio)
    Worker(studio).tick()
    with pytest.raises(StudioError, match="unsubmitted"):
        studio.execution.cancel(job["id"])


def test_heartbeat_renews_long_call_lease(studio, monkeypatch):
    _, _, job = queued(studio)
    clock = [100.0]
    worker = Worker(studio, clock=lambda: clock[0])
    entered, release = threading.Event(), threading.Event()
    original = worker.providers["fake"].submit

    def slow(*args):
        entered.set()
        assert release.wait(3)
        return original(*args)

    monkeypatch.setattr(worker.providers["fake"], "submit", slow)
    with worker.keepalive(interval=0.01):
        thread = threading.Thread(target=worker.tick)
        thread.start()
        try:
            assert entered.wait(2)
            clock[0] = 350
            deadline = time.monotonic() + 2
            while studio.job(job["id"])["lease_until"] < 650 and time.monotonic() < deadline:
                time.sleep(0.01)
            assert studio.job(job["id"])["lease_until"] == 650
            assert not Worker(studio, clock=lambda: 401).tick()
        finally:
            release.set()
            thread.join(3)
    assert studio.job(job["id"])["state"] == "running"
    assert not Execution(studio, clock=lambda: 350).status()["responsive"]


def test_recovery_collects_without_second_submission(studio, monkeypatch):
    node, _, job = uncertain(studio, monkeypatch)
    preview = studio.execution.preview_reconciliation(job["id"], job["id"])
    assert preview["can_link"]
    studio.execution.reconcile(
        job["id"],
        Reconciliation(
            provider_id=job["id"], fingerprint=preview["fingerprint"], user_decision="Verified offline receipt"
        ),
    )
    worker = Worker(studio, clock=lambda: 10**12)
    calls = []
    monkeypatch.setattr(worker.providers["fake"], "submit", lambda *args: calls.append(args))
    worker.tick()
    worker.clock = lambda: 10**12 + 10
    worker.tick()
    assert studio.job(job["id"])["state"] == "ready"
    assert len(studio.inspect(node["id"])["media"]) == 1
    assert not calls
    assert any(e["details"].get("reconciled") for e in studio.job(job["id"])["events"])


def test_recovery_rejects_changed_or_mismatched_evidence(studio, monkeypatch):
    _, _, job = uncertain(studio, monkeypatch)
    preview = studio.execution.preview_reconciliation(job["id"], job["id"])
    path = studio.store.home / "fixtures" / f"{job['id']}.json"
    receipt = json.loads(path.read_text())
    receipt["params"]["prompt"] = "Different generation"
    path.write_text(json.dumps(receipt))
    with pytest.raises(StudioError, match="evidence changed"):
        studio.execution.reconcile(
            job["id"],
            Reconciliation(provider_id=job["id"], fingerprint=preview["fingerprint"], user_decision="Old preview"),
        )
    updated = studio.execution.preview_reconciliation(job["id"], job["id"])
    with pytest.raises(StudioError, match="does not match"):
        studio.execution.reconcile(
            job["id"],
            Reconciliation(provider_id=job["id"], fingerprint=updated["fingerprint"], user_decision="Wrong job"),
        )


def test_remote_job_cannot_be_attached_twice(studio, monkeypatch):
    _, _, first = uncertain(studio, monkeypatch)
    _, _, second = uncertain(studio, monkeypatch)
    for index, job in enumerate([first, second]):
        preview = studio.execution.preview_reconciliation(job["id"], first["id"])
        request = Reconciliation(
            provider_id=first["id"], fingerprint=preview["fingerprint"], user_decision="Offline recovery"
        )
        if index:
            with pytest.raises(StudioError, match="already linked"):
                studio.execution.reconcile(job["id"], request)
        else:
            studio.execution.reconcile(job["id"], request)


@pytest.mark.parametrize(
    "estimate,policy,allowed",
    [
        ({"credits": 2}, {"max_credits": 2}, True),
        ({"credits": 3}, {"max_credits": 2}, False),
        ({"credits": None}, {"allow_unknown_cost": False}, False),
        ({"credits": None}, {"allow_unknown_cost": True}, True),
        ({"credits": None}, {"allow_unknown_cost": True, "max_credits": 4}, False),
    ],
)
def test_cost_policy(estimate, policy, allowed):
    if allowed:
        validate_cost(estimate, policy)
    else:
        with pytest.raises(StudioError):
            validate_cost(estimate, policy)


def test_recovery_requires_reference_identity_confirmation(studio, monkeypatch):
    _, _, job = uncertain(studio, monkeypatch, with_reference=True)
    preview = studio.execution.preview_reconciliation(job["id"], job["id"])
    request = Reconciliation(
        provider_id=job["id"], fingerprint=preview["fingerprint"], user_decision="Offline recovery"
    )
    assert preview["can_link"] and preview["requires_reference_confirmation"]
    with pytest.raises(StudioError, match="Confirm the remote input images"):
        studio.execution.reconcile(job["id"], request)
    assert (
        studio.execution.reconcile(job["id"], request.model_copy(update={"confirm_reference_match": True}))["state"]
        == "running"
    )


def test_cost_estimate_never_uploads_references(monkeypatch):
    provider = Higgsfield()
    calls = []
    monkeypatch.setattr(provider, "command", lambda args: calls.append(args) or {"credits": 2})
    quote = provider.estimate(
        {"model": "nano_banana_2", "prompt": "fixture", "settings": {}, "references": [{"media_id": "private-file"}]}
    )
    assert quote["credits"] is None and quote["settings_only_credits"] == 2
    assert "--image" not in calls[0] and "private-file" not in calls[0]


def test_unverified_cli_version_is_rejected(monkeypatch):
    provider = Higgsfield()
    monkeypatch.setattr(provider, "command", lambda *a, **kw: "higgsfield 9.0.0")
    with pytest.raises(StudioError, match="verify compatibility"):
        provider.contract("nano_banana_2")


def test_price_increase_stops_before_billable_submission(studio, monkeypatch):
    _, _, job = queued(studio)
    worker = Worker(studio)
    calls = []
    monkeypatch.setattr(worker.providers["fake"], "preflight", lambda spec: {"credits": 1})
    monkeypatch.setattr(worker.providers["fake"], "submit", lambda *args: calls.append(args))
    worker.tick()
    assert studio.job(job["id"])["state"] == "failed"
    assert "ceiling" in studio.job(job["id"])["error"]
    assert not calls


def test_partial_collection_retry_preserves_first_output(studio, monkeypatch, tmp_path):
    node, _, job = queued(studio)
    worker = Worker(studio, clock=lambda: 10**12)
    outputs = [tmp_path / "first.png", tmp_path / "second.png"]
    for path, color in zip(outputs, ["red", "blue"], strict=True):
        Image.new("RGB", (16, 16), color).save(path)
    worker.tick()
    monkeypatch.setattr(worker.providers["fake"], "poll", lambda _: ("collecting", [str(p) for p in outputs], {}))
    worker.clock = lambda: 10**12 + 10
    worker.tick()
    original = studio.import_media

    def fail_second(node, path, *args, **kwargs):
        if path == outputs[1]:
            raise OSError("Disk temporarily unavailable")
        return original(node, path, *args, **kwargs)

    monkeypatch.setattr(studio, "import_media", fail_second)
    worker.clock = lambda: 10**12 + 20
    worker.tick()
    assert studio.job(job["id"])["state"] == "collection_failed"
    assert len(studio.inspect(node["id"])["media"]) == 1
    monkeypatch.setattr(studio, "import_media", original)
    studio.retry_collection(job["id"])
    worker.tick()
    assert studio.job(job["id"])["state"] == "ready"
    assert len(studio.inspect(node["id"])["media"]) == 2
