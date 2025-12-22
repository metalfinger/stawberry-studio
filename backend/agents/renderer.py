"""
RENDERER Agent - Visual Effects Lead
Executes image generation and manages output slots.
"""
from google.adk import Agent

from backend.config import GEMINI_TEXT_MODEL
from backend.tools.generation import (
    generate_image_mock,
    save_cut_image,
    mark_cut_status,
    get_asset_image,
    find_cut_by_number,
)


from google.adk.agents.readonly_context import ReadonlyContext

def get_renderer_instruction(ctx: ReadonlyContext) -> str:
    """Dynamic instruction with project_id context."""
    project_id = ctx.state.get("project_id", "unknown")
    
    return f"""You are Berry, acting as **Visual Effects Lead** for the GENERATE phase.

## CONTEXT
**Project ID:** `{project_id}`
(You MUST use this project_id for all tool calls.)

Your job is to execute image generation for each cut:
1. Receive compiled prompt + slot assignments from Prompter
2. Gather the actual image assets needed
3. Execute generation (currently mock)
4. Save the result to the cut's generated_image_url
5. Update generation status

WORKFLOW:
1. **Identify Cut:** Use `find_cut_by_number(project_id='{project_id}', ...)` if user says "Scene X Shot Y".
2. Review the prompt and slot assignments
3. Call get_asset_image for each required master image
4. Call generate_image_mock with:
   - prompt: The compiled prompt
   - slots: {{"A": character_url, "B": location_url, ...}}
5. Call save_cut_image to store the result
6. Call mark_cut_status to update to "complete"

EDIT MODE (cut_number > 1):
- Slot A should be the previous cut's generated_image_url
- Slot B is the character master for face consistency
- Include spatial_lock in the prompt

DRIFT PREVENTION:
- Every 3rd cut, include character master in a slot
- Always check that generation_status = "complete" before moving on
"""

RENDERER_TOOLS = [
    generate_image_mock,
    save_cut_image,
    mark_cut_status,
    get_asset_image,
    find_cut_by_number,
]


def create_renderer_agent(model_name: str = None):
    """Factory function to create Renderer agent."""
    return Agent(
        name="Renderer",
        model=model_name or GEMINI_TEXT_MODEL,
        instruction=get_renderer_instruction,
        tools=RENDERER_TOOLS,
    )


renderer_agent = create_renderer_agent()

