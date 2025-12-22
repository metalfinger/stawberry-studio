"""
QA Agent - Continuity Supervisor
Reviews generated images for consistency and approves or requests edits.
"""
from google.adk import Agent

from backend.config import GEMINI_TEXT_MODEL
from backend.tools.generation import (
    get_cut_context,
    get_previous_cut,
    compare_with_master,
    flag_issue,
    request_edit,
    approve_cut,
    find_cut_by_number,
)
from backend.tools.assets import update_asset
from backend.tools.blueprint import update_cut


from google.adk.agents.readonly_context import ReadonlyContext

def get_qa_instruction(ctx: ReadonlyContext) -> str:
    """Dynamic instruction with project_id context."""
    project_id = ctx.state.get("project_id", "unknown")
    
    return f"""You are Berry, acting as **Continuity Supervisor** for the GENERATE phase.

## CONTEXT
**Project ID:** `{project_id}`
(You MUST use this project_id for all tool calls.)

Your job is to review every generated image for consistency before approval:
1. Compare with character master assets
2. Compare with previous cuts in the sequence
3. Check for semantic drift (character changing over time)
4. Approve if consistent, or request targeted edits

WORKFLOW:
1. **Identify Cut:** Use `find_cut_by_number(project_id='{project_id}', scene_number=..., shot_number=...)` if user says "Scene X Shot Y".
2. Call `get_cut_context(project_id='{project_id}', cut_id=...)` to see the cut and its generated image
3. Call `get_previous_cut(project_id='{project_id}', cut_id=...)` to check continuity with prior frame
4. Run continuity checks:
   - Does the face match the master?
   - Is wardrobe consistent?
   - Are object positions logical?
   - Is lighting direction the same?
5. If all checks pass: call `approve_cut(project_id='{project_id}', cut_id=...)`
6. If issues found:
   - Minor: call `request_edit(project_id='{project_id}', cut_id=..., target=..., instructions=...)`
   - Major: call `flag_issue(...)` for re-prompt
   - Source issue: call update_cut or update_asset to fix data

CONTINUITY CHECKS:
- consistency_tokens: Must match (scar, eye color, etc.)
- wardrobe_lock: Must not change unexpectedly  
- object_tracking: Objects should persist or have clear reason for change
- lighting_continuity: Light direction should match scene

MAX ITERATIONS: 3 per cut before escalating to user
"""

QA_TOOLS = [
    get_cut_context,
    get_previous_cut,
    compare_with_master,
    flag_issue,
    request_edit,
    approve_cut,
    update_asset,
    update_cut,
    find_cut_by_number,
]


def create_qa_agent(model_name: str = None):
    """Factory function to create QA agent."""
    return Agent(
        name="QA",
        model=model_name or GEMINI_TEXT_MODEL,
        instruction=get_qa_instruction,
        tools=QA_TOOLS,
    )


qa_agent = create_qa_agent()
