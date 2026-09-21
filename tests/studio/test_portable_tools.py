import pytest
from pydantic import ValidationError

from backend.studio.service import Studio
from backend.studio.store import Store, StudioError
from backend.studio.tools import catalog, invoke


def test_hosts_share_persisted_state_and_revision_checks(tmp_path):
    first = Studio(Store(tmp_path))
    project = invoke(first, "create", {"kind": "project", "name": "Portable"})
    second = Studio(Store(tmp_path))
    assert invoke(second, "project", {"id": project["id"]})["project"] == project
    patch = {"id": project["id"], "request": {
        "expected_revision": 1, "reason": "Host handoff", "changes": {
            "style": {"op": "set", "value": "Ink"}}}}
    invoke(second, "patch", patch)
    with pytest.raises(StudioError, match="Node changed"):
        invoke(first, "patch", patch)
    assert invoke(first, "inspect", {"id": project["id"]})["node"]["revision"] == 2


def test_discovery_and_invalid_operations(tmp_path):
    studio = Studio(Store(tmp_path))
    names = [tool["name"] for tool in catalog()]
    assert len(names) == len(set(names))
    assert {"prepare", "external_preview", "attach_external", "context", "lineage", "evaluate", "evaluations", "facts", "candidates", "repair"} <= set(names)
    with pytest.raises(StudioError, match="Unknown Studio tool"):
        invoke(studio, "shell", {"command": "echo bad"})
    with pytest.raises(ValidationError):
        invoke(studio, "projects", {"unexpected": True})


def test_real_stdio_mcp_roundtrip(tmp_path):
    import asyncio
    import json
    import sys

    pytest.importorskip("mcp")
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    async def run():
        parameters = StdioServerParameters(command=sys.executable, args=[
            "-m", "backend.studio.mcp_server", "--home", str(tmp_path)])
        async with stdio_client(parameters) as (reader, writer):
            async with ClientSession(reader, writer) as session:
                await session.initialize()
                names = {tool.name for tool in (await session.list_tools()).tools}
                assert names == {"strawberry_tools", "strawberry_call"}
                result = await session.call_tool("strawberry_call", {
                    "operation": "create", "arguments": {"kind": "project", "name": "MCP proof"}})
                assert not result.isError
                project = json.loads(result.content[0].text)
                assert Studio(Store(tmp_path)).project(project["id"])["project"]["name"] == "MCP proof"
                invalid = await session.call_tool("strawberry_call", {
                    "operation": "shell", "arguments": {}})
                assert invalid.isError

    asyncio.run(run())
