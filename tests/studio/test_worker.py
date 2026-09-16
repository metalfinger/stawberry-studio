import json

import pytest

from backend.studio.models import Approval, NodeCreate, RecipeCreate
from backend.studio.providers import FakeProvider, Higgsfield, SubmissionUnknown
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError
from backend.studio.worker import Worker


@pytest.fixture
def setup(tmp_path):
    studio = Studio(Store(tmp_path / "workspace"))
    node = studio.create_node(NodeCreate(kind="project", name="Test"))
    recipe = studio.prepare(
        RecipeCreate(node_id=node["id"], provider="fake", model="fixture", prompt="test", intent="Test job")
    )
    studio.approve(recipe["id"], Approval(fingerprint=recipe["fingerprint"], user_decision="Offline fixture"))
    job = studio.enqueue(recipe["id"])
    return studio, node, job


def test_restart_and_collect(setup):
    studio, node, job = setup
    clock = [10**12]
    first = Worker(studio, clock=lambda: clock[0])
    assert first.tick()
    assert studio.job(job["id"])["state"] == "running"
    resumed = Studio(Store(studio.store.home))
    worker = Worker(resumed, clock=lambda: clock[0])
    clock[0] += 10
    assert worker.tick()
    clock[0] += 10
    assert worker.tick()
    assert resumed.job(job["id"])["state"] == "ready"
    media = resumed.inspect(node["id"])["media"]
    assert len(media) == 1
    assert media[0]["metadata"]["fake"]


def test_crash_during_submission_never_resubmits(setup):
    studio, node, job = setup
    with studio.store.connection(write=True) as conn:
        conn.execute("UPDATE jobs SET state='submitting',owner='dead',lease_until=0,updated_at=0")
    worker = Worker(studio)
    assert worker.tick()
    assert studio.job(job["id"])["state"] == "submission_unknown"
    assert not worker.tick()
    assert not studio.inspect(node["id"])["media"]


def test_active_lease_not_stolen(setup):
    studio, _, job = setup
    with studio.store.connection(write=True) as conn:
        conn.execute("UPDATE jobs SET owner='other',lease_until=?", (10**12,))
    assert not Worker(studio).tick()
    assert studio.job(job["id"])["state"] == "queued"


def test_offline_demo_does_not_touch_unrelated_jobs(setup):
    from backend.studio.demo import seed_demo

    studio, node, job = setup
    before = studio.job(job["id"])
    seed_demo(studio)
    assert studio.job(job["id"]) == before
    assert not studio.inspect(node["id"])["media"]


def test_collection_retry_does_not_submit_again(setup, monkeypatch):
    studio, _, job = setup
    clock = [10**12]
    worker = Worker(studio, clock=lambda: clock[0])
    worker.tick()
    clock[0] += 10
    worker.tick()
    original = studio.import_media

    def fail(*args, **kwargs):
        raise OSError("Disk unavailable")

    monkeypatch.setattr(studio, "import_media", fail)
    clock[0] += 10
    worker.tick()
    assert studio.job(job["id"])["state"] == "collection_failed"
    monkeypatch.setattr(studio, "import_media", original)

    def resubmit(*args):
        raise AssertionError("Must not generate again")

    monkeypatch.setattr(worker.providers["fake"], "submit", resubmit)
    studio.retry_collection(job["id"])
    worker.tick()
    assert studio.job(job["id"])["state"] == "ready"


def test_uncertain_submit_is_not_retryable(setup, monkeypatch):
    studio, _, job = setup
    provider = FakeProvider(studio.store.home / "fixtures")

    def fail(*args):
        raise SubmissionUnknown("Timeout after upload")

    monkeypatch.setattr(provider, "submit", fail)
    worker = Worker(studio, {"fake": provider})
    worker.tick()
    assert studio.job(job["id"])["state"] == "submission_unknown"
    with pytest.raises(StudioError):
        studio.retry_collection(job["id"])


def test_higgsfield_argv_preserves_order_and_does_not_use_shell(tmp_path):
    calls = []
    schema = {"job_set_type": "nano_banana_2", "type": "image", "params": []}

    def run(args, **kwargs):
        from types import SimpleNamespace

        calls.append(args)
        assert "shell" not in kwargs
        if args[1] == "version":
            output = "0.1.28"
        elif args[1:3] == ["model", "get"]:
            output = json.dumps(schema)
        else:
            output = json.dumps([{"id": "provider-job"}])
        return SimpleNamespace(returncode=0, stdout=output, stderr="")

    provider = Higgsfield(run=run)
    contract = provider.contract("nano_banana_2")
    spec = {
        "model": "nano_banana_2",
        "provider_contract": contract,
        "prompt": "@Image1 pose; @Image2 identity",
        "settings": {},
        "references": [{"role": "pose"}, {"role": "identity"}],
    }
    provider_id, _ = provider.submit("local", spec, [tmp_path / "pose.png", tmp_path / "identity.png"])
    assert provider_id == "provider-job"
    args = calls[-1]
    assert args.index(str(tmp_path / "pose.png")) < args.index(str(tmp_path / "identity.png"))
    assert "--wait" not in args


def test_higgsfield_unrecognized_receipt_is_uncertain():
    provider = Higgsfield()
    provider.contract = lambda model: {}
    provider.command = lambda *a, **kw: {"unexpected": "accepted"}
    with pytest.raises(SubmissionUnknown):
        provider.submit(
            "local",
            {"model": "model", "provider_contract": {}, "prompt": "frame", "settings": {}, "references": []},
            [],
        )


def test_provider_media_settings_cannot_bypass_ordered_references():
    from pydantic import ValidationError

    with pytest.raises(ValidationError, match="reserved"):
        RecipeCreate(
            node_id="test",
            model="kling3_0",
            prompt="frame",
            intent="test",
            settings={"medias": [{"id": "untracked-reference"}]},
        )


def test_provider_declared_reference_limit_is_not_silently_trimmed():
    from backend.studio.models import Reference

    provider = Higgsfield()
    provider.contract = lambda model: {
        "schema": {"type": "image", "params": [{"name": "input_images", "type": "array", "maxItems": 1}]}
    }
    request = RecipeCreate(
        node_id="test",
        model="test",
        prompt="two references",
        intent="test",
        references=[Reference(media_id=str(i), role="identity", instruction="Preserve identity") for i in range(2)],
    )
    with pytest.raises(StudioError, match="input bounds"):
        provider.prepare(request)
