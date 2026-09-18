from fastapi.testclient import TestClient

from backend.studio.api import create_app


def test_local_mutations_and_revisions(tmp_path):
    client = TestClient(create_app(tmp_path))
    assert client.get("/api/studio/health").status_code == 200
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
