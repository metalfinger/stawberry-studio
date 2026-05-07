"""
Database operations for Assets (Characters, Locations, Props)
"""
import uuid
import json
from typing import List, Dict, Any, Optional
from .core import get_connection


def get_assets(project_id: str, asset_type: str = None) -> List[Dict[str, Any]]:
    """Get all assets for a project, optionally filtered by type."""
    conn = get_connection()
    cursor = conn.cursor()
    
    if asset_type:
        cursor.execute("""
            SELECT * FROM assets WHERE project_id = ? AND type = ?
            ORDER BY type, name
        """, (project_id, asset_type))
    else:
        cursor.execute("""
            SELECT * FROM assets WHERE project_id = ?
            ORDER BY type, name
        """, (project_id,))
    
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_asset(asset_id: str) -> Optional[Dict[str, Any]]:
    """Get a single asset by ID."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM assets WHERE id = ?", (asset_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def create_asset(
    project_id: str,
    asset_type: str,
    name: str,
    description: str = None,
    appearance: str = None,
    style: str = None,
    metadata: dict = None,
    master_id: str = None,
    variant_diff: str = None
) -> Dict[str, Any]:
    """Create a new asset (master or variant)."""
    asset_id = f"asset_{uuid.uuid4().hex[:12]}"
    
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO assets (id, project_id, type, name, description, appearance, style, metadata, master_id, variant_diff)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        asset_id, project_id, asset_type, name, description,
        appearance, style, json.dumps(metadata) if metadata else None,
        master_id, variant_diff
    ))
    conn.commit()
    conn.close()
    
    return {
        "id": asset_id,
        "project_id": project_id,
        "type": asset_type,
        "name": name,
        "description": description,
        "appearance": appearance,
        "style": style,
        "metadata": metadata,
        "master_id": master_id,
        "variant_diff": variant_diff,
        "slot_filled": False,
        "image_url": None
    }


def create_variant(
    master_id: str,
    variant_name: str,
    variant_diff: str,
    description: str = None
) -> Dict[str, Any]:
    """Create a variant of an existing master asset."""
    master = get_asset(master_id)
    if not master:
        return {"error": f"Master asset not found: {master_id}"}
    
    if master.get("master_id"):
        return {"error": "Cannot create variant of a variant. Use the master asset."}
    
    return create_asset(
        project_id=master["project_id"],
        asset_type=master["type"],
        name=variant_name,
        description=description or master.get("description"),
        appearance=master.get("appearance"),
        style=master.get("style"),
        master_id=master_id,
        variant_diff=variant_diff
    )


def get_variants(master_id: str) -> List[Dict[str, Any]]:
    """Get all variants of a master asset."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM assets WHERE master_id = ?", (master_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_masters(project_id: str, asset_type: str = None) -> List[Dict[str, Any]]:
    """Get only master assets (not variants)."""
    conn = get_connection()
    cursor = conn.cursor()
    
    if asset_type:
        cursor.execute("""
            SELECT * FROM assets WHERE project_id = ? AND type = ? AND master_id IS NULL
            ORDER BY name
        """, (project_id, asset_type))
    else:
        cursor.execute("""
            SELECT * FROM assets WHERE project_id = ? AND master_id IS NULL
            ORDER BY type, name
        """, (project_id,))
    
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def update_asset(asset_id: str, **updates) -> Optional[Dict[str, Any]]:
    """Update an asset's fields."""
    allowed = [
        "name", "description", "appearance", "style", "metadata",
        "slot_filled", "image_url", "variant_diff",
        # Continuity fields used by the Sheet Planner + Continuity Bible.
        "consistency_tokens", "distinctive_features", "wardrobe_lock",
        "suggested_prompt", "face_embedding_url",
    ]
    updates = {k: v for k, v in updates.items() if k in allowed}
    
    if not updates:
        return get_asset(asset_id)
    
    # Handle metadata JSON
    if "metadata" in updates and isinstance(updates["metadata"], dict):
        updates["metadata"] = json.dumps(updates["metadata"])
    
    set_clause = ", ".join([f"{k} = ?" for k in updates.keys()])
    values = list(updates.values()) + [asset_id]
    
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(f"UPDATE assets SET {set_clause} WHERE id = ?", values)
    conn.commit()
    conn.close()
    
    return get_asset(asset_id)


def delete_asset(asset_id: str) -> bool:
    """Delete an asset, its links, and its variants."""
    conn = get_connection()
    cursor = conn.cursor()
    # Delete variants first
    cursor.execute("DELETE FROM asset_links WHERE asset_id IN (SELECT id FROM assets WHERE master_id = ?)", (asset_id,))
    cursor.execute("DELETE FROM assets WHERE master_id = ?", (asset_id,))
    # Then delete the asset itself
    cursor.execute("DELETE FROM asset_links WHERE asset_id = ?", (asset_id,))
    cursor.execute("DELETE FROM assets WHERE id = ?", (asset_id,))
    conn.commit()
    conn.close()
    return True


# Asset Link Operations

def link_asset_to_node(
    asset_id: str,
    node_type: str,
    node_id: str,
    usage: str = "primary",
    variant_notes: str = None
) -> Dict[str, Any]:
    """Link an asset to a scene, shot, or cut. Returns existing link if already linked."""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Check for existing link
    cursor.execute("""
        SELECT * FROM asset_links WHERE asset_id = ? AND node_type = ? AND node_id = ?
    """, (asset_id, node_type, node_id))
    existing = cursor.fetchone()
    
    if existing:
        conn.close()
        return dict(existing)  # Already linked
    
    link_id = f"link_{uuid.uuid4().hex[:12]}"
    cursor.execute("""
        INSERT INTO asset_links (id, asset_id, node_type, node_id, usage, variant_notes)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (link_id, asset_id, node_type, node_id, usage, variant_notes))
    conn.commit()
    conn.close()
    
    return {
        "id": link_id,
        "asset_id": asset_id,
        "node_type": node_type,
        "node_id": node_id,
        "usage": usage,
        "variant_notes": variant_notes
    }


def get_node_assets(node_type: str, node_id: str) -> List[Dict[str, Any]]:
    """Get all assets linked to a specific node."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.*, al.usage, al.variant_notes
        FROM assets a
        JOIN asset_links al ON a.id = al.asset_id
        WHERE al.node_type = ? AND al.node_id = ?
    """, (node_type, node_id))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_asset_nodes(asset_id: str) -> List[Dict[str, Any]]:
    """Get all nodes that use a specific asset."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM asset_links WHERE asset_id = ?
    """, (asset_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def unlink_asset(link_id: str) -> bool:
    """Remove an asset link."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM asset_links WHERE id = ?", (link_id,))
    conn.commit()
    conn.close()
    return True
