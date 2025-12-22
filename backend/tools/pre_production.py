"""
Pre-Production Tools
Tools for reference image preparation through i2i chaining.
"""

import uuid
import json
from typing import Dict, Any, List, Optional
from datetime import datetime

from backend.database import core as db


def get_pre_production_requirements(project_id: str, cut_id: str) -> Dict[str, Any]:
    """
    Analyze what pre-production is needed for a cut.
    Returns list of requirements with suggested approach.
    """
    from backend.tools.generation import get_cut_context, get_cut_assets, get_previous_cut
    
    ctx = get_cut_context(project_id, cut_id)
    if "error" in ctx:
        return ctx
    
    cut = ctx["cut"]
    assets = get_cut_assets(project_id, cut_id)
    prev_cut = get_previous_cut(project_id, cut_id)
    
    requirements = []
    ready_references = []
    
    # Check each character
    for char in assets["characters"]:
        if char.get("image_url"):
            # Character master exists - can use as reference
            ready_references.append({
                "type": "character",
                "name": char.get("name"),
                "asset_id": char.get("id"),
                "image_url": char["image_url"],
                "purpose": "face_consistency"
            })
        else:
            # No master - needs generation
            requirements.append({
                "type": "character_master",
                "name": char.get("name"),
                "asset_id": char.get("id"),
                "action": "generate",
                "details": {
                    "appearance": char.get("appearance"),
                    "consistency_tokens": char.get("consistency_tokens"),
                    "wardrobe_lock": char.get("wardrobe_lock")
                }
            })
        
        # Check if cut action requires new pose/expression
        action = cut.get("action", "").lower()
        expression = cut.get("expression", "")
        if expression and char.get("image_url"):
            # May need pose/expression variant
            requirements.append({
                "type": "expression_variant",
                "name": char.get("name"),
                "asset_id": char.get("id"),
                "action": "i2i_edit",
                "base_reference": char.get("image_url"),
                "details": {
                    "target_expression": expression,
                    "action_context": action
                }
            })
    
    # Check locations
    for loc in assets["locations"]:
        if loc.get("image_url"):
            ready_references.append({
                "type": "location",
                "name": loc.get("name"),
                "asset_id": loc.get("id"),
                "image_url": loc["image_url"],
                "purpose": "environment"
            })
        else:
            requirements.append({
                "type": "location_master",
                "name": loc.get("name"),
                "asset_id": loc.get("id"),
                "action": "generate",
                "details": {
                    "description": loc.get("description"),
                    "style": loc.get("style")
                }
            })
    
    # Check if previous cut can be used for continuity
    continuity_option = None
    if prev_cut and prev_cut.get("generated_image_url"):
        continuity_option = {
            "type": "previous_cut",
            "cut_id": prev_cut.get("id"),
            "image_url": prev_cut.get("generated_image_url"),
            "action": prev_cut.get("action"),
            "use_for": "i2i_base_if_minor_change"
        }
    
    return {
        "cut_id": cut_id,
        "cut_action": cut.get("action"),
        "requirements": requirements,
        "ready_references": ready_references,
        "continuity_option": continuity_option,
        "pre_production_needed": len(requirements) > 0
    }


def compile_pre_production_step(
    project_id: str,
    cut_id: str,
    step_number: int,
    requirement_type: str,
    target_asset_name: str,
    reference_images: List[Dict[str, Any]],
    instruction: str
) -> Dict[str, Any]:
    """
    Compile a single pre-production step prompt.
    Returns Nano Banana Pro format prompt for this step.
    """
    prompt_parts = []
    
    # Build natural language prompt based on requirement type
    if requirement_type == "character_master":
        prompt_parts.append(f"Create a high-quality character portrait of {target_asset_name}.")
        prompt_parts.append("")
        prompt_parts.append(f"SUBJECT:")
        prompt_parts.append(f"{instruction}")
        prompt_parts.append("")
        prompt_parts.append("STYLE:")
        prompt_parts.append("Photorealistic portrait, detailed facial features, professional lighting.")
        prompt_parts.append("High quality reference image suitable for character consistency.")
        
    elif requirement_type == "expression_variant":
        prompt_parts.append(f"Edit the character in @Image1 to show a new expression/pose.")
        prompt_parts.append("")
        prompt_parts.append("EDIT INSTRUCTION:")
        prompt_parts.append(instruction)
        prompt_parts.append("")
        prompt_parts.append("CONSTRAINTS:")
        prompt_parts.append("- Face 100% same as @Image1 reference")
        prompt_parts.append("- Maintain exact facial features, hair, and distinguishing marks")
        prompt_parts.append("- Only change expression and pose as specified")
        
    elif requirement_type == "location_master":
        prompt_parts.append(f"Create a detailed environment shot of {target_asset_name}.")
        prompt_parts.append("")
        prompt_parts.append("ENVIRONMENT:")
        prompt_parts.append(instruction)
        prompt_parts.append("")
        prompt_parts.append("STYLE:")
        prompt_parts.append("Cinematic, high quality, suitable as location reference.")
        
    elif requirement_type == "wardrobe_change":
        prompt_parts.append(f"Edit the character in @Image1 to change their wardrobe.")
        prompt_parts.append("")
        prompt_parts.append("WARDROBE CHANGE:")
        prompt_parts.append(instruction)
        prompt_parts.append("")
        prompt_parts.append("CONSTRAINTS:")
        prompt_parts.append("- Face 100% same as @Image2 (character master)")
        prompt_parts.append("- Use @Image1 as pose reference")
        prompt_parts.append("- Only change clothing, keep everything else identical")
    
    else:
        # Generic pre-production step
        prompt_parts.append(f"Pre-production step for {target_asset_name}:")
        prompt_parts.append(instruction)
    
    # Add reference legend
    if reference_images:
        prompt_parts.append("")
        prompt_parts.append("REFERENCE IMAGES:")
        for i, ref in enumerate(reference_images, 1):
            status = "✓" if ref.get("image_url") else "○"
            prompt_parts.append(f"@Image{i}: {ref.get('name', 'reference')} ({ref.get('purpose', 'reference')}) [{status}]")
    
    compiled_prompt = "\n".join(prompt_parts)
    
    return {
        "step_number": step_number,
        "requirement_type": requirement_type,
        "target_asset": target_asset_name,
        "prompt": compiled_prompt,
        "reference_images": reference_images,
        "mode": "pre_production"
    }


def execute_pre_production_step(
    project_id: str,
    cut_id: str,
    step_number: int,
    prompt: str,
    reference_images: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Execute a pre-production step (currently mock).
    In production, this would call the actual image generation API.
    """
    # Generate mock result
    mock_id = uuid.uuid4().hex[:12]
    mock_url = f"https://placeholder.preprod/{mock_id}.png"
    
    # Record in generation history
    history_id = f"gen_{uuid.uuid4().hex[:8]}"
    now = datetime.now().isoformat()
    
    conn = db.get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT INTO generation_history 
        (id, project_id, cut_id, step_number, stage, prompt, reference_images, 
         output_image_url, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        history_id,
        project_id,
        cut_id,
        step_number,
        "pre_production",
        prompt,
        json.dumps(reference_images),
        mock_url,
        json.dumps({"mock": True}),
        now
    ))
    
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "history_id": history_id,
        "output_image_url": mock_url,
        "step_number": step_number,
        "mock": True
    }


def save_pre_production_output(
    project_id: str,
    cut_id: str,
    asset_id: str,
    image_url: str,
    generation_chain: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Save pre-production output to an asset.
    Updates the asset with the generated image and metadata.
    """
    now = datetime.now().isoformat()
    
    conn = db.get_connection()
    cursor = conn.cursor()
    
    # Update the asset with the pre-production output
    cursor.execute("""
        UPDATE assets SET 
            image_url = ?,
            slot_filled = 1,
            source_type = 'pre_production',
            source_cut_id = ?,
            generation_chain = ?,
            created_at = ?
        WHERE id = ?
    """, (
        image_url,
        cut_id,
        json.dumps(generation_chain),
        now,
        asset_id
    ))
    
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "asset_id": asset_id,
        "image_url": image_url,
        "source_type": "pre_production",
        "source_cut_id": cut_id
    }


def complete_pre_production(project_id: str, cut_id: str) -> Dict[str, Any]:
    """
    Signal that pre-production is complete for a cut.
    Returns summary of all pre-production outputs ready for Prompter.
    """
    conn = db.get_connection()
    cursor = conn.cursor()
    
    # Get all pre-production history for this cut
    cursor.execute("""
        SELECT * FROM generation_history 
        WHERE cut_id = ? AND stage = 'pre_production'
        ORDER BY step_number
    """, (cut_id,))
    
    history = [dict(row) for row in cursor.fetchall()]
    
    # Get all assets updated for this cut
    cursor.execute("""
        SELECT * FROM assets 
        WHERE source_cut_id = ? AND source_type = 'pre_production'
    """, (cut_id,))
    
    updated_assets = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    return {
        "success": True,
        "cut_id": cut_id,
        "pre_production_complete": True,
        "steps_executed": len(history),
        "assets_updated": len(updated_assets),
        "history": history,
        "updated_assets": updated_assets,
        "message": f"Pre-production complete. {len(updated_assets)} reference(s) ready for final prompt."
    }


def get_generation_history(project_id: str, cut_id: str) -> Dict[str, Any]:
    """
    Get full generation history for a cut.
    Includes both pre-production and final generation steps.
    """
    conn = db.get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT * FROM generation_history 
        WHERE cut_id = ?
        ORDER BY stage, step_number
    """, (cut_id,))
    
    history = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    # Parse JSON fields
    for item in history:
        if item.get("reference_images"):
            try:
                item["reference_images"] = json.loads(item["reference_images"])
            except:
                pass
        if item.get("metadata"):
            try:
                item["metadata"] = json.loads(item["metadata"])
            except:
                pass
    
    pre_production = [h for h in history if h.get("stage") == "pre_production"]
    final = [h for h in history if h.get("stage") == "final"]
    
    return {
        "cut_id": cut_id,
        "total_steps": len(history),
        "pre_production_steps": pre_production,
        "final_steps": final,
        "history": history
    }
