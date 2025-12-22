from datetime import datetime
from typing import List, Dict, Any
from .core import get_connection

def get_chat_history(project_id: str, phase: str = None, limit: int = 50) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    
    if phase:
        cursor.execute("""
            SELECT role, agent_name, content, timestamp, phase FROM chat_history
            WHERE project_id = ? AND phase = ?
            ORDER BY timestamp DESC LIMIT ?
        """, (project_id, phase, limit))
    else:
        cursor.execute("""
            SELECT role, agent_name, content, timestamp, phase FROM chat_history
            WHERE project_id = ?
            ORDER BY timestamp DESC LIMIT ?
        """, (project_id, limit))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in reversed(rows)]

def add_chat_message(project_id: str, role: str, content: str, phase: str = "BRIEFING", agent_name: str = None):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO chat_history (project_id, phase, role, agent_name, content, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (project_id, phase, role, agent_name, content, datetime.now().isoformat()))
    conn.commit()
    conn.close()

