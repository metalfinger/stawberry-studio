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
