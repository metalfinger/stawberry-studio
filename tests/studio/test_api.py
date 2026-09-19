from fastapi.testclient import TestClient

from backend.studio.api import create_app


def test_local_mutations_and_revisions(tmp_path):
    client = TestClient(create_app(tmp_path))
    health = client.get("/api/studio/health")
    assert health.status_code == 200 and health.json()["schema"] == 5
    body = {"kind": "project", "name": "Test"}
    assert client.post("/api/studio/nodes", json=body).status_code == 403
    headers = {"X-Strawberry-Action": "1"}
    assert (
        client.post("/api/studio/nodes", json=body, headers={**headers, "Origin": "https://evil.example"}).status_code
        == 403
    )
    response = client.post("/api/studio/nodes", json=body, headers=headers)
    assert response.status_code == 200
    node = response.json()
    patch = {"expected_revision": 1, "reason": "Test", "changes": {"era": {"value": "1980"}}}
    assert client.patch(f"/api/studio/nodes/{node['id']}", json=patch, headers=headers).status_code == 200
    assert client.patch(f"/api/studio/nodes/{node['id']}", json=patch, headers=headers).status_code == 409
    assert client.get("/api/studio/projects").json()[0]["id"] == node["id"]
    assert client.get("/api/studio/projects", headers={"Host": "evil.example"}).status_code == 400


def test_asset_requirement_api(tmp_path):
    client = TestClient(create_app(tmp_path))
    headers = {"X-Strawberry-Action": "1"}
    project = client.post("/api/studio/nodes", json={"kind": "project", "name": "Test"}, headers=headers).json()
    asset = client.post(
        "/api/studio/nodes",
        json={"kind": "location", "name": "Station", "parent_id": project["id"]},
        headers=headers,
    ).json()
    requirement = client.post(
        f"/api/studio/assets/{asset['id']}/requirements",
        json={"kind": "view", "label": "East", "instruction": "Establish east geography", "priority": 1},
        headers=headers,
    )
    assert requirement.status_code == 200
    changed = client.put(
        f"/api/studio/requirements/{requirement.json()['id']}",
        json={"label": "West", "instruction": "Establish west geography", "priority": 2},
        headers=headers,
    )
    assert changed.status_code == 200 and changed.json()["priority"] == 2


def test_provider_catalog_api_is_read_only(tmp_path, monkeypatch):
    from backend.studio.providers import Higgsfield

    monkeypatch.setattr(
        Higgsfield,
        "catalog",
        lambda _self: {
            "provider": "higgsfield",
            "cli_version": "0.1.28",
            "media_type": "image",
            "models": [{"model": "gpt_image_2_5", "display_name": "GPT Image 2.5", "media_type": "image"}],
        },
    )
    monkeypatch.setattr(
        Higgsfield,
        "describe",
        lambda _self, model: {"provider": "higgsfield", "model": model, "media_type": "image"},
    )
    client = TestClient(create_app(tmp_path))
    assert client.get("/api/studio/providers/higgsfield/models").json()["models"][0]["model"] == "gpt_image_2_5"
    assert client.get("/api/studio/providers/higgsfield/models/gpt_image_2_5").json()["model"] == "gpt_image_2_5"


def test_workflow_api_guides_without_advancing_phases(tmp_path):
    client = TestClient(create_app(tmp_path))
    headers = {"X-Strawberry-Action": "1"}
    project = client.post("/api/studio/nodes", json={"kind": "project", "name": "Film"}, headers=headers).json()
    initial = client.get(f"/api/studio/projects/{project['id']}/workflow").json()
    assert initial["next_actions"][0]["kind"] == "capture_intent"
    kinds = {item["kind"] for item in initial["next_actions"]}
    assert {"capture_intent", "break_down_story"} <= kinds
    assert initial["stages"][0]["status"] == "needs_attention"


def test_offline_proof_reaches_reviewable_workflow_without_paid_provider(tmp_path):
    from backend.studio.demo import seed_demo
    from backend.studio.service import Studio
    from backend.studio.store import Store

    studio = Studio(Store(tmp_path))
    project_id = seed_demo(studio)["project_id"]
    workflow = studio.workflow(project_id)
    assert [stage["status"] for stage in workflow["stages"]] == ["ready", "ready", "ready", "ready"]
    assert workflow["next_actions"] == [
        {
            "kind": "review_production",
            "message": "Review the complete storyboard and record any refinement notes",
            "node_id": project_id,
            "priority": 4,
        }
    ]
