from typing import Dict, Any
from datetime import datetime
from .core import get_connection
from .scenes import get_scenes
from .shots import get_shots

def get_full_struct(project_id: str) -> Dict[str, Any]:
    """Get full blueprint with scenes and shots."""
    scenes = get_scenes(project_id)
    scene_list = []
    
    for scene in scenes:
        s_dict = dict(scene)
        s_dict['shots'] = get_shots(scene['id'])
        scene_list.append(s_dict)
        
    return {"project_id": project_id, "scenes": scene_list}

def complete_blueprint(project_id: str) -> bool:
    """Advance project to STORYBOARD phase if blueprint is complete."""
    scenes = get_scenes(project_id)
    if not scenes:
        return False
    
    # Check each scene has at least one shot
    for scene in scenes:
        shots = get_shots(scene['id'])
        if not shots:
            return False
    
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE projects SET current_phase = 'ASSETS', updated_at = ?
        WHERE id = ?
    """, (datetime.now().isoformat(), project_id))
    conn.commit()
    conn.close()
    return True
