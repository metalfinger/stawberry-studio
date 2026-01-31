"""
Phase Confirmation Tools
Centralized logic for requesting and confirming phase transitions.
All phase changes MUST go through user confirmation.
"""
from backend import db


def request_phase_change(project_id: str, from_phase: str, to_phase: str, summary: str) -> dict:
    """
    Request a phase change - this does NOT perform the transition.
    The agent MUST ask the user for confirmation, then call confirm_phase_change.
    
    Args:
        project_id: The current project ID
        from_phase: Current phase (BRIEF, STORY, ASSETS, GENERATE)
        to_phase: Target phase to transition to
        summary: Summary of what was completed in the current phase
    
    Returns:
        A structured response indicating confirmation is needed
    """
    return {
        "status": "CONFIRMATION_REQUIRED",
        "message": f"⏳ Ready to move from {from_phase} to {to_phase}. User confirmation required.",
        "from_phase": from_phase,
        "to_phase": to_phase,
        "summary": summary,
        "instruction": f"🚨 ASK THE USER: 'Are you ready to move to the {to_phase} phase? Type YES to confirm or tell me what changes you'd like to make first.'"
    }


def confirm_phase_change(project_id: str, target_phase: str) -> dict:
    """
    Confirm and execute a phase change - ONLY call this after user says YES.
    
    Args:
        project_id: The current project ID
        target_phase: The phase to transition to (STORY, ASSETS, GENERATE)
    
    Returns:
        Success or error message
    """
    # Validate target phase
    valid_phases = ["STORY", "ASSETS", "GENERATE"]
    if target_phase not in valid_phases:
        return {
            "status": "ERROR",
            "message": f"❌ Invalid target phase: {target_phase}. Valid phases: {', '.join(valid_phases)}"
        }
    
    # Get current project
    project = db.get_project(project_id)
    if not project:
        return {
            "status": "ERROR",
            "message": "❌ Project not found."
        }
    
    current_phase = project.get("current_phase", "BRIEF")
    
    # Validate phase transition order
    phase_order = ["BRIEF", "STORY", "ASSETS", "GENERATE"]
    current_idx = phase_order.index(current_phase) if current_phase in phase_order else 0
    target_idx = phase_order.index(target_phase) if target_phase in phase_order else -1
    
    if target_idx <= current_idx:
        return {
            "status": "ERROR",
            "message": f"❌ Cannot move from {current_phase} to {target_phase}. Invalid transition."
        }
    
    # Perform the phase transition
    db.update_project_phase(project_id, target_phase)
    
    return {
        "status": "SUCCESS",
        "message": f"🎉 Phase transition complete! Now in {target_phase} phase.",
        "from_phase": current_phase,
        "to_phase": target_phase
    }
