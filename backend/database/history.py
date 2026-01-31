from datetime import datetime
from typing import List, Dict, Any
from .core import get_connection


def get_chat_history(project_id: str, phase: str = None, limit: int = 50, include_noise: bool = True) -> List[Dict[str, Any]]:
    """
    Get chat history for display purposes.

    Args:
        project_id: The project ID
        phase: Optional phase filter
        limit: Max messages to return
        include_noise: If True, includes delegation/tool noise messages for display

    Returns:
        List of message dicts with role, content, agent_name, phase, is_noise
    """
    conn = get_connection()
    cursor = conn.cursor()

    if phase:
        cursor.execute("""
            SELECT role, agent_name, content, timestamp, phase, is_noise FROM chat_history
            WHERE project_id = ? AND phase = ?
            ORDER BY timestamp DESC LIMIT ?
        """, (project_id, phase, limit))
    else:
        cursor.execute("""
            SELECT role, agent_name, content, timestamp, phase, is_noise FROM chat_history
            WHERE project_id = ?
            ORDER BY timestamp DESC LIMIT ?
        """, (project_id, limit))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in reversed(rows)]


def get_chat_history_for_context(project_id: str, phase: str = None, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Get chat history for AI context - excludes noise messages.
    Use this when building prompts for the AI.

    Args:
        project_id: The project ID
        phase: Optional phase filter
        limit: Max messages to return

    Returns:
        List of message dicts (noise messages excluded)
    """
    conn = get_connection()
    cursor = conn.cursor()

    if phase:
        cursor.execute("""
            SELECT role, agent_name, content, timestamp, phase FROM chat_history
            WHERE project_id = ? AND phase = ? AND is_noise = 0
            ORDER BY timestamp DESC LIMIT ?
        """, (project_id, phase, limit))
    else:
        cursor.execute("""
            SELECT role, agent_name, content, timestamp, phase FROM chat_history
            WHERE project_id = ? AND is_noise = 0
            ORDER BY timestamp DESC LIMIT ?
        """, (project_id, limit))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in reversed(rows)]


def add_chat_message(project_id: str, role: str, content: str, phase: str = "BRIEFING", agent_name: str = None, is_noise: bool = False):
    """
    Add a chat message to history.

    Args:
        project_id: The project ID
        role: Message role (user, assistant, tool, delegation, sub_tool)
        content: Message content
        phase: Current phase
        agent_name: Optional agent name for attribution
        is_noise: If True, message is stored but excluded from AI context
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO chat_history (project_id, phase, role, agent_name, content, timestamp, is_noise)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (project_id, phase, role, agent_name, content, datetime.now().isoformat(), 1 if is_noise else 0))
    conn.commit()
    conn.close()

