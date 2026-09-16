import json
import zipfile

import pytest

from backend.studio.backup import backup, restore
from backend.studio.demo import seed_demo
from backend.studio.models import Approval, RecipeCreate
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError


def test_complete_offline_proof_backup_restore_and_no_repeated_spend(tmp_path):
    studio = Studio(Store(tmp_path / "original"))
    project_id = seed_demo(studio)["project_id"]
    project = studio.project(project_id)
    assert len(project["media"]) == 7
    cuts = [n for n in project["nodes"] if n["kind"] == "cut"]
    assert len(cuts) == 3
    assert all(n["active_media_id"] for n in cuts)
    assert all(j["state"] == "ready" for j in project["jobs"])
    assert [event["state"] for event in studio.job(project["jobs"][0]["id"])["events"]] == [
        "queued",
        "submitting",
        "running",
        "collecting",
        "ready",
    ]
    recipe = studio.prepare(
        RecipeCreate(node_id=project_id, provider="fake", model="test", prompt="Style swatch", intent="pending")
    )
    studio.approve(recipe["id"], Approval(fingerprint=recipe["fingerprint"], user_decision="Offline test"))
    job = studio.enqueue(recipe["id"])
    archive = tmp_path / "backup.zip"
    backup(studio.store, archive)
    destination = tmp_path / "restored"
    restore(archive, destination)
    resumed = Studio(Store(destination))
    assert len(resumed.project(project_id)["media"]) == 7
    assert resumed.job(job["id"])["state"] == "submission_unknown"
    assert studio.job(job["id"])["state"] == "queued"
    for image in project["media"]:
        path, _ = resumed.media_path(image["id"])
        assert resumed._file_hash(path) == image["sha256"]
    for cut in cuts:
        assert resumed.inspect(cut["id"])["node"]["active_media_id"] == cut["active_media_id"]
    with pytest.raises(StudioError, match="new directory"):
        restore(archive, destination)
    with pytest.raises(StudioError, match="already exists"):
        backup(studio.store, archive)


@pytest.mark.parametrize("name", ["../escaped", "/tmp/escaped", "media/../../escaped", "media\\escaped"])
def test_restore_rejects_traversal(tmp_path, name):
    archive = tmp_path / "bad.zip"
    with zipfile.ZipFile(archive, "w") as out:
        out.writestr(
            "manifest.json",
            json.dumps(
                {
                    "format": "strawberry-workspace",
                    "version": 1,
                    "files": {name: {"bytes": 1, "sha256": "nope"}, "production.sqlite": {}},
                }
            ),
        )
        out.writestr(name, "x")
        out.writestr("production.sqlite", "x")
    with pytest.raises(StudioError, match="archive path"):
        restore(archive, tmp_path / "restored")
    assert not (tmp_path / "restored").exists()


def test_store_rejects_incomplete_restore(tmp_path):
    (tmp_path / ".restore-in-progress").touch()
    with pytest.raises(StudioError, match="interrupted"):
        Store(tmp_path)
