import json
import zipfile

import pytest
from fastapi.testclient import TestClient

from backend.studio.api import create_app
from backend.studio.demo import seed_demo
from backend.studio.models import Approval, NodeCreate, RecipeCreate
from backend.studio.project_archive import export_project, import_project
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError


def approved_recipe(studio, project_id, intent):
    recipe = studio.prepare(
        RecipeCreate(node_id=project_id, provider="fake", model="test", prompt=intent, intent=intent)
    )
    studio.approve(
        recipe["id"],
        Approval(fingerprint=recipe["fingerprint"], user_decision="Approved before export", max_credits=0),
    )
    return recipe


def test_selective_project_round_trip_preserves_history_but_resets_execution_permission(tmp_path):
    source = Studio(Store(tmp_path / "source"))
    project_id = seed_demo(source)["project_id"]
    source.create_node(NodeCreate(kind="project", name="Do not export"))
    pending_recipe = approved_recipe(source, project_id, "Pending style proof")
    pending_job = source.enqueue(pending_recipe["id"])
    approved_only = approved_recipe(source, project_id, "Approved but not submitted")

    archive = tmp_path / "project.zip"
    result = export_project(source.store, project_id, archive)
    assert result["project_id"] == project_id
    with zipfile.ZipFile(archive) as bundle:
        payload = json.loads(bundle.read("project.json"))
        assert {row["project_id"] for row in payload["tables"]["nodes"]} == {project_id}
        assert all(row["name"] != "Do not export" for row in payload["tables"]["nodes"])

    target = Studio(Store(tmp_path / "target"))
    unrelated = target.create_node(NodeCreate(kind="project", name="Keep me"))
    imported = import_project(target.store, archive)
    assert imported["project_id"] == project_id
    assert imported["generation_approvals_reset"] >= 2
    assert imported["pending_jobs_require_reconciliation"] == 1
    assert {item["id"] for item in target.projects()} == {project_id, unrelated["id"]}

    original = source.project(project_id)
    restored = target.project(project_id)
    assert len(restored["nodes"]) == len(original["nodes"])
    assert len(restored["media"]) == len(original["media"])
    assert target.job(pending_job["id"])["state"] == "submission_unknown"
    assert target.recipe(approved_only["id"])["approved_at"] is None
    with pytest.raises(StudioError, match="Approve the exact recipe"):
        target.enqueue(approved_only["id"])
    for media in restored["media"]:
        path, _mime = target.media_path(media["id"])
        assert target._file_hash(path) == media["sha256"]
    with pytest.raises(StudioError, match="already exists"):
        import_project(target.store, archive)


def test_project_archive_rejects_tampering_and_does_not_leave_partial_project(tmp_path):
    source = Studio(Store(tmp_path / "source"))
    project_id = seed_demo(source)["project_id"]
    archive = tmp_path / "project.zip"
    export_project(source.store, project_id, archive)
    tampered = tmp_path / "tampered.zip"
    with zipfile.ZipFile(archive) as original, zipfile.ZipFile(tampered, "w") as changed:
        for item in original.infolist():
            data = original.read(item)
            changed.writestr(item, data + b"changed" if item.filename == "project.json" else data)
    target = Studio(Store(tmp_path / "target"))
    with pytest.raises(StudioError, match="size differs"):
        import_project(target.store, tampered)
    assert target.projects() == []


def test_project_export_import_http_surface(tmp_path):
    source_home = tmp_path / "source"
    source = Studio(Store(source_home))
    project_id = seed_demo(source)["project_id"]
    source_client = TestClient(create_app(source_home))
    download = source_client.get(f"/api/studio/projects/{project_id}/export")
    assert download.status_code == 200
    assert download.headers["content-type"] == "application/zip"

    target_client = TestClient(create_app(tmp_path / "target"))
    response = target_client.post(
        "/api/studio/projects/import",
        content=download.content,
        headers={"Content-Type": "application/zip", "X-Strawberry-Action": "1"},
    )
    assert response.status_code == 200
    assert response.json()["project_id"] == project_id
    assert target_client.get(f"/api/studio/projects/{project_id}").status_code == 200
