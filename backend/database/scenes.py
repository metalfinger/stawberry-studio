from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime
from .core import get_connection

def get_scenes(project_id: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM scenes WHERE project_id = ? ORDER BY scene_number
    """, (project_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def add_scene(
    project_id: str,
    title: str,
    description: str = "",
    location: str = "",
    time_of_day: str = "",
    lighting: str = "",
    mood: str = ""
) -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()

    scene_id = f"scene_{uuid.uuid4().hex[:8]}"
    # Atomic auto-numbering — read MAX inside the INSERT so parallel calls
    # from a single agent turn don't all get the same number.
    cursor.execute("""
        INSERT INTO scenes (id, project_id, scene_number, title, description, location, time_of_day, lighting, mood)
        SELECT ?, ?, COALESCE(MAX(scene_number), 0) + 1, ?, ?, ?, ?, ?, ?
        FROM scenes WHERE project_id = ?
    """, (scene_id, project_id, title, description, location, time_of_day, lighting, mood, project_id))
    cursor.execute("SELECT scene_number FROM scenes WHERE id = ?", (scene_id,))
    scene_number = cursor.fetchone()[0]
    
    cursor.execute("UPDATE projects SET updated_at = ? WHERE id = ?",
                   (datetime.now().isoformat(), project_id))
    conn.commit()
    conn.close()
    
    return {
        "id": scene_id,
        "scene_number": scene_number,
        "title": title,
        "description": description,
        "location": location,
        "time_of_day": time_of_day,
        "lighting": lighting,
        "mood": mood
    }

def update_scene(scene_id: str, updates: Dict[str, Any]) -> bool:
    if not updates:
        return False
        
    set_clause = ", ".join([f"{k} = ?" for k in updates.keys()])
    values = list(updates.values()) + [scene_id]
    
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(f"UPDATE scenes SET {set_clause} WHERE id = ?", values)
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return success

def delete_scene(scene_id: str) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    # Cascading delete
    cursor.execute("DELETE FROM cuts WHERE shot_id IN (SELECT id FROM shots WHERE scene_id = ?)", (scene_id,))
    cursor.execute("DELETE FROM shots WHERE scene_id = ?", (scene_id,))
    cursor.execute("DELETE FROM scenes WHERE id = ?", (scene_id,))
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return success

def delete_all_scenes(project_id: str) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    # Cascading delete manually just in case
    cursor.execute("DELETE FROM cuts WHERE shot_id IN (SELECT id FROM shots WHERE scene_id IN (SELECT id FROM scenes WHERE project_id = ?))", (project_id,))
    cursor.execute("DELETE FROM shots WHERE scene_id IN (SELECT id FROM scenes WHERE project_id = ?)", (project_id,))
    cursor.execute("DELETE FROM scenes WHERE project_id = ?", (project_id,))

    # Update timestamp
    cursor.execute("UPDATE projects SET updated_at = ? WHERE id = ?",
                   (datetime.now().isoformat(), project_id))

    success = True
    conn.commit()
    conn.close()
    return success


def add_scene_raw(scene_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Add a scene with pre-constructed data dict.
    Used by inference system to add scenes with rich metadata.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Extract required fields
    scene_id = scene_data['id']
    project_id = scene_data['project_id']
    scene_number = scene_data['scene_number']

    # Build INSERT dynamically based on provided fields
    fields = list(scene_data.keys())
    placeholders = ', '.join(['?' for _ in fields])
    field_names = ', '.join(fields)
    values = [scene_data[f] for f in fields]

    cursor.execute(
        f"INSERT INTO scenes ({field_names}) VALUES ({placeholders})",
        values
    )

    cursor.execute("UPDATE projects SET updated_at = ? WHERE id = ?",
                   (datetime.now().isoformat(), project_id))
    conn.commit()
    conn.close()

    return scene_data
