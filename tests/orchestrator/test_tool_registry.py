"""Tool registry: @tool decorator + JSON-schema export."""
import pytest

from backend.tools.registry import export_mcp_manifest, get_schema, list_tools, tool


def test_decorator_registers():
    @tool("ut_hello", description="say hi", tags=["unit"])
    def hello(name: str = "world") -> str:
        return f"hello {name}"

    assert "ut_hello" in list_tools()
    assert "ut_hello" in list_tools(tag="unit")


def test_schema_extraction():
    @tool("ut_add", description="add two")
    def add(a: int, b: int) -> int:
        return a + b

    schema = get_schema("ut_add")
    assert schema["name"] == "ut_add"
    assert schema["description"] == "add two"
    props = schema["inputSchema"]["properties"]
    assert props["a"]["type"] == "integer"
    assert props["b"]["type"] == "integer"
    assert set(schema["inputSchema"]["required"]) == {"a", "b"}


def test_mcp_manifest_export():
    # Trigger registration via package import.
    import backend.tools  # noqa: F401

    manifest = export_mcp_manifest()
    assert isinstance(manifest, list)
    assert len(manifest) >= 50  # we have ~78 tools
    every = {m["name"] for m in manifest}
    # A few canonical tools must be present
    assert "get_brief" in every
    assert "add_scene" in every
    assert "propose_cut_plan" in every
