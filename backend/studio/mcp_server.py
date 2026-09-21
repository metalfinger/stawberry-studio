"""Optional stdio MCP transport; no provider or conversational runtime."""

import argparse
import json

from mcp.server.fastmcp import FastMCP

from backend.studio.service import Studio
from backend.studio.store import Store
from backend.studio.tools import catalog, invoke


def build_server(home=None):
    studio = Studio(Store(home))
    server = FastMCP("Strawberry Studio")

    @server.tool()
    def strawberry_tools() -> list[dict]:
        """Discover exact production operation names and JSON input schemas."""
        return catalog()

    @server.tool()
    def strawberry_call(operation: str, arguments: dict) -> str:
        """Execute a discovered operation using the shared production engine.

        Consult strawberry_tools first. Mutations persist immediately; prepare
        freezes a recipe, approve records actual authorization, enqueue schedules
        execution. These are not visual quality checks.
        """
        return json.dumps(invoke(studio, operation, arguments), ensure_ascii=False)

    return server


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--home", required=True, help="Absolute production store directory")
    args = parser.parse_args()
    build_server(args.home).run(transport="stdio")


if __name__ == "__main__":
    main()
