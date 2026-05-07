from typing import List, Dict, Any
import uuid
from .core import get_connection

# ============== SHOTS ==============

def get_shots(scene_id: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM shots WHERE scene_id = ? ORDER BY shot_number
    """, (scene_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def add_shot(
    scene_id: str,
    description: str,
    camera_angle: str = "",
    camera_movement: str = "",
    subject: str = "",
    composition: str = "",
    override_mood: str = None
) -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()

    shot_id = f"shot_{uuid.uuid4().hex[:8]}"
    cursor.execute("""
        INSERT INTO shots (id, scene_id, shot_number, description, camera_angle, camera_movement, subject, composition, override_mood)
        SELECT ?, ?, COALESCE(MAX(shot_number), 0) + 1, ?, ?, ?, ?, ?, ?
        FROM shots WHERE scene_id = ?
    """, (shot_id, scene_id, description, camera_angle, camera_movement, subject, composition, override_mood, scene_id))
    cursor.execute("SELECT shot_number FROM shots WHERE id = ?", (shot_id,))
    shot_number = cursor.fetchone()[0]

    conn.commit()
    conn.close()

    return {
        "id": shot_id,
        "shot_number": shot_number,
        "description": description,
        "camera_angle": camera_angle
    }


def add_shot_raw(shot_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Add a shot with pre-constructed data dict.
    Used by inference system to add shots with rich metadata.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Build INSERT dynamically
    fields = list(shot_data.keys())
    placeholders = ', '.join(['?' for _ in fields])
    field_names = ', '.join(fields)
    values = [shot_data[f] for f in fields]

    cursor.execute(
        f"INSERT INTO shots ({field_names}) VALUES ({placeholders})",
        values
    )

    conn.commit()
    conn.close()

    return shot_data

def update_shot(shot_id: str, updates: Dict[str, Any]) -> bool:
    if not updates:
        return False
        
    set_clause = ", ".join([f"{k} = ?" for k in updates.keys()])
    values = list(updates.values()) + [shot_id]
    
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(f"UPDATE shots SET {set_clause} WHERE id = ?", values)
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return success

def delete_shot(shot_id: str) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM cuts WHERE shot_id = ?", (shot_id,))
    cursor.execute("DELETE FROM shots WHERE id = ?", (shot_id,))
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return success

def delete_all_shots(scene_id: str) -> bool:
    """Delete all shots (and their cuts) in a scene."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM cuts WHERE shot_id IN (SELECT id FROM shots WHERE scene_id = ?)", (scene_id,))
    cursor.execute("DELETE FROM shots WHERE scene_id = ?", (scene_id,))
    success = True
    conn.commit()
    conn.close()
    return success

# ============== CUTS ==============

def get_cuts(shot_id: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM cuts WHERE shot_id = ? ORDER BY cut_number", (shot_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def add_cut(
    shot_id: str,
    action: str,
    dialogue: str = "",
    beat_type: str = "",
    transition: str = "cut"
) -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()

    cut_id = f"cut_{uuid.uuid4().hex[:8]}"
    cursor.execute("""
        INSERT INTO cuts (id, shot_id, cut_number, action, dialogue, beat_type, transition)
        SELECT ?, ?, COALESCE(MAX(cut_number), 0) + 1, ?, ?, ?, ?
        FROM cuts WHERE shot_id = ?
    """, (cut_id, shot_id, action, dialogue, beat_type, transition, shot_id))
    cursor.execute("SELECT cut_number FROM cuts WHERE id = ?", (cut_id,))
    cut_number = cursor.fetchone()[0]
    
    conn.commit()
    conn.close()
    
    return {
        "id": cut_id,
        "cut_number": cut_number,
        "action": action,
        "beat_type": beat_type
    }

def update_cut(cut_id: str, updates: Dict[str, Any]) -> bool:
    if not updates:
        return False
        
    set_clause = ", ".join([f"{k} = ?" for k in updates.keys()])
    values = list(updates.values()) + [cut_id]
    
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(f"UPDATE cuts SET {set_clause} WHERE id = ?", values)
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return success

def delete_cut(cut_id: str) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM cuts WHERE id = ?", (cut_id,))
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return success

def delete_all_cuts(shot_id: str) -> bool:
    """Delete all cuts in a shot."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM cuts WHERE shot_id = ?", (shot_id,))
    success = True
    conn.commit()
    conn.close()
    return success
