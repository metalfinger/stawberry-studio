"""
Handoff tool - Allows agents to request a switch to another specialist.
"""
from backend.tools.registry import tool


@tool("request_handoff", description="Hand off control to another agent within the current phase with a context message.", tags=["handoff"])
def request_handoff(target_agent: str, context: str):
    """
    Request to hand off control to another agent.

    Args:
        target_agent: The key of the agent to switch to (e.g., 'pre_production', 'prompter', 'renderer')
        context: The reason for the handoff and context for the next agent.

    Returns:
        dict: A signal dictionary that the system loop interprets to perform the switch.
    """
    return {
        "signal": "handoff",
        "target_agent": target_agent,
        "context": context,
    }
