"""
Strawberry Studio — agent-callable tools.

Importing any module here triggers @tool registration in tools/registry.
The agent runtime then looks up tools by name from the registry. Nothing
imports these symbols by name from this package (callers either use the
agent path or import directly from the submodule), so this file is just
the registration trigger.
"""
from backend.tools import briefing as _briefing  # noqa: F401
from backend.tools import blueprint as _blueprint  # noqa: F401
from backend.tools import generation as _generation  # noqa: F401
from backend.tools import assets as _assets  # noqa: F401
