"""
Element Generation Tools - For Element Generator Agent
Generate master images and variants for characters, locations, and props
"""
import uuid
import json
from datetime import datetime
from typing import Dict, Any, List, Optional

from backend import db
from backend.services.gemini_image import (
    generate_image_text_to_image,
    generate_image_image_to_image,
    enhance_prompt_for_consistency,
    get_variant_prompt_suffix
)


# ============================================================================
# MASTER GENERATION
# ============================================================================

def generate_element_master(
    asset_id: str,
    prompt: Optional[str] = None,
    auto_generate: bool = True,
    model: str = "gemini-3-pro-image",
    resolution: str = "2048x2048",
    view_type: Optional[str] = None,
    params: Optional[Dict[str, Any]] = None,
    reference_images: Optional[List[Dict[str, Any]]] = None
) -> str:
    """
    Generate master reference image for an asset element.
    """
    # Get asset
    asset = db.get_asset(asset_id)
    if not asset:
        raise ValueError(f"Asset {asset_id} not found")

    element_type = asset.get('type', 'character')
    
    # Default view type if not provided
    if not view_type:
        view_type = 'front_full' if element_type == 'character' else 'hero_shot'

    # Compile prompt if needed
    if auto_generate or not prompt:
        prompt_data = compile_element_master_prompt(asset_id)
        prompt = prompt_data['prompt']
        resolution = prompt_data.get('resolution', resolution)

    # Create master record
    master_id = f"master_{uuid.uuid4().hex[:8]}"

    conn = db.get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO element_masters (
            id, asset_id, element_type, master_prompt,
            background_type, view_type, resolution, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        master_id,
        asset_id,
        element_type,
        prompt,
        'white',
        view_type,
        resolution,
        'generating'
    ))
    conn.commit()

    # Generate image
    if params and params.get('reference_image_url'):
        result = generate_image_image_to_image(
            prompt=prompt,
            reference_image_url=params.get('reference_image_url'),
            model=model,
            resolution=resolution,
            num_images=1,
            params=params,
            reference_images=reference_images
        )
    else:
        result = generate_image_text_to_image(
            prompt=prompt,
            model=model,
            resolution=resolution,
            num_images=1,
            params=params,
            reference_images=reference_images
        )

    # Update master with result
    if result.get('success'):
        cursor.execute("""
            UPDATE element_masters
            SET master_image_url = ?,
                master_generation_params = ?,
                status = 'complete',
                updated_at = ?
            WHERE id = ?
        """, (
            result['image_url'],
            json.dumps(result.get('generation_params', {})),
            datetime.now().isoformat(),
            master_id
        ))

        # Always update asset.image_url to master reference image
        # This makes the master the default/"slot" image for generation prompts
        cursor.execute("""
            UPDATE assets
            SET image_url = ?
            WHERE id = ?
        """, (result['image_url'], asset_id))

    else:
        cursor.execute("""
            UPDATE element_masters
            SET status = 'failed',
                error_message = ?
            WHERE id = ?
        """, (result.get('error', 'Unknown error'), master_id))

    conn.commit()

    # Save to generation history
    project_id = asset.get('project_id')
    if project_id:
        gen_method = 'image_to_image' if (params and params.get('reference_image_url')) else 'text_to_image'
        _save_to_history(
            project_id=project_id,
            target_type='element_master',
            target_id=master_id,
            prompt=prompt,
            model=model,
            method=gen_method,
            reference_images=reference_images,
            result=result
        )

    conn.close()

    return master_id


def compile_element_master_prompt(
    asset_id: str,
    use_preset: bool = True
) -> Dict[str, Any]:
    """
    Compile a prompt for generating element master from asset data.

    Args:
        asset_id: Asset to compile prompt for
        use_preset: Whether to use system presets

    Returns:
        {
            'prompt': str,
            'model': str,
            'resolution': str,
            'aspect_ratio': str,
            'background': str
        }
    """
    asset = db.get_asset(asset_id)
    if not asset:
        raise ValueError(f"Asset {asset_id} not found")

    element_type = asset.get('type') or 'character'
    name = asset.get('name') or 'Unnamed'
    appearance = asset.get('appearance') or ''

    # Get preset template if available
    if use_preset:
        preset = _get_master_preset(element_type)
        if preset:
            # Fill in template
            template = preset.get('prompt_template', '')
            prompt = template.format(
                name=name,
                appearance=appearance,
                time_of_day=asset.get('time_of_day', 'day')
            )

            return {
                'prompt': prompt,
                'model': preset.get('default_model', 'gemini-3-pro-image'),
                'resolution': preset.get('default_resolution', '2048x2048'),
                'aspect_ratio': preset.get('default_aspect_ratio', '1:1'),
                'background': preset.get('default_background', 'white')
            }

    # Fallback: manual prompt compilation
    # Get project style from brief - PRIORITIZE art_style over legacy style
    project_id = asset.get('project_id')
    brief = db.get_brief(project_id) if project_id else {}
    art_style = brief.get('art_style') or brief.get('style') or 'high-quality cinematic'
    color_palette = brief.get('color_palette', '')
    world_logic = brief.get('world_logic', '')
    
    # Build style context header
    style_header = f"UNIVERSE: {world_logic}\n" if world_logic else ""
    style_header += f"ART STYLE: {art_style}\n"
    if color_palette:
        style_header += f"COLOR PALETTE: {color_palette}\n"

    # Detect if this is an animal character (for appropriate template)
    animal_keywords = ['ram', 'deer', 'wolf', 'fox', 'bear', 'lion', 'tiger', 'dog', 'cat',
                       'horse', 'eagle', 'bird', 'fish', 'dragon', 'creature', 'animal',
                       'rabbit', 'mouse', 'elephant', 'monkey', 'ape', 'gorilla', 'snake',
                       'frog', 'owl', 'crow', 'raven', 'stag', 'doe', 'buck']
    is_animal = any(word in appearance.lower() or word in name.lower() for word in animal_keywords)

    if element_type == 'character':
        # Build stylization keywords based on art style
        style_keywords = ""
        if "spider" in art_style.lower() or "comic" in art_style.lower():
            style_keywords = "with bold ink outlines, halftone dot shading, and subtle chromatic aberration"
        elif "ghibli" in art_style.lower() or "anime" in art_style.lower():
            style_keywords = "with soft hand-painted textures and warm, expressive colors"
        elif "pixar" in art_style.lower() or "3d" in art_style.lower():
            style_keywords = "with smooth stylized 3D rendering and soft rim lighting"
        else:
            style_keywords = "with consistent stylized rendering"
            
        if is_animal:
            # Animal character template - no hands, clothing references
            prompt = f"""A full-body character reference of {name}, rendered in {art_style} style {style_keywords}.

{appearance}

The character is shown in a neutral standing pose (on all fours or natural stance), front view facing the camera. Clear anatomical features with detailed eyes and face. High detail on fur, hide texture, and any horns, antlers, or distinctive features. Pure white background with soft studio lighting.

2048x2048 resolution, square composition, character centered in frame.

No text, no speech bubbles, no labels, no watermarks, no UI elements, no signatures.
"""
        else:
            # Humanoid character template
            prompt = f"""A full-body character reference of {name}, rendered in {art_style} style {style_keywords}.

{appearance}

The character is shown in a neutral standing pose with arms slightly away from body, front view facing the camera. Clear facial features with detailed eyes, nose, and mouth. High detail on face, hands, clothing, and accessories. Pure white background with soft studio lighting.

2048x2048 resolution, square composition, character centered in frame.

No text, no speech bubbles, no labels, no watermarks, no UI elements, no signatures.
"""
        resolution = "2048x2048"

    elif element_type == 'location':
        # Build stylization keywords based on art style
        style_keywords = ""
        if "spider" in art_style.lower() or "comic" in art_style.lower():
            style_keywords = "with heavy ink outlines, halftone dot shadows, and subtle chromatic aberration on edges"
        elif "ghibli" in art_style.lower() or "anime" in art_style.lower():
            style_keywords = "with soft hand-painted textures, warm color gradients, and atmospheric depth"
        elif "pixar" in art_style.lower() or "3d" in art_style.lower():
            style_keywords = "with smooth 3D surfaces, subsurface scattering, and cinematic lighting"
        else:
            style_keywords = "with consistent stylized rendering matching the project aesthetic"
            
        prompt = f"""A wide establishing shot of {name}, rendered entirely in {art_style} style {style_keywords}.

{appearance}

The environment features {asset.get('time_of_day', 'day')} lighting with clear spatial depth and atmospheric perspective. Key architectural and environmental features are prominently visible. The composition uses a hero angle that showcases the most important view of this location. All elements are stylized consistently - no photorealistic textures, maintaining the illustrated aesthetic throughout.

2048x1365 resolution, 3:2 landscape aspect ratio, professional quality.

No text, no speech bubbles, no labels, no watermarks, no UI elements, no signatures, no captions.
"""
        resolution = "2048x1365"

    elif element_type == 'prop':
        # Build stylization keywords based on art style
        style_keywords = ""
        if "spider" in art_style.lower() or "comic" in art_style.lower():
            style_keywords = "with bold ink outlines, halftone shading, and slight chromatic aberration on metallic or reflective surfaces"
        elif "ghibli" in art_style.lower() or "anime" in art_style.lower():
            style_keywords = "with soft hand-painted textures and warm, organic color tones"
        elif "pixar" in art_style.lower() or "3d" in art_style.lower():
            style_keywords = "with smooth stylized 3D materials and soft studio lighting"
        else:
            style_keywords = "with consistent stylized rendering matching the project aesthetic"
            
        prompt = f"""A product reference shot of {name}, rendered in {art_style} style {style_keywords}.

{appearance}

The prop is centered on a pure white background with soft studio lighting. All details, textures, and materials are clearly visible. The object maintains proper scale and proportions with the stylized rendering applied consistently to all surfaces.

2048x2048 resolution, square composition, professional quality.

No text, no speech bubbles, no labels, no watermarks, no UI elements, no signatures, no brand names.
"""
        resolution = "2048x2048"

    else:
        prompt = f"Create a high-quality reference image of {name} in {art_style} style. {appearance}"
        resolution = "2048x2048"

    # Enhance prompt for consistency (pass art_style)
    prompt = enhance_prompt_for_consistency(prompt, element_type, art_style)

    return {
        'prompt': prompt,
        'model': 'gemini-3-pro-image',
        'resolution': resolution,
        'aspect_ratio': '1:1' if element_type != 'location' else '3:2',
        'background': 'white'
    }


# ============================================================================
# VARIANT GENERATION
# ============================================================================

def generate_element_variant(
    master_id: str,
    variant_type: str,
    method: str = 'image_to_image',
    custom_prompt: Optional[str] = None,
    model: str = 'nano-banana-pro-edit',
    strength: float = 0.7
) -> str:
    """
    Generate a variant of an element master.

    Args:
        master_id: Element master to create variant from
        variant_type: 'side_left' | '3_4' | 'back' | 'face_detail' | etc.
        method: 'text_to_image' | 'image_to_image' (default)
        custom_prompt: Override default variant prompt
        model: Model to use (Nano Banana is good for variants)
        strength: For i2i, how much to deviate (0.0-1.0)

    Returns:
        variant_id: ID of created variant

    Example:
        variant_id = generate_element_variant(
            master_id="master_abc123",
            variant_type="side_left",
            method="image_to_image"
        )
    """
    # Get master
    master = _get_element_master(master_id)
    if not master:
        raise ValueError(f"Master {master_id} not found")

    # Compile variant prompt
    if not custom_prompt:
        prompt_data = compile_element_variant_prompt(master_id, variant_type)
        prompt = prompt_data['prompt']
        method = prompt_data.get('method', method)
        strength = prompt_data.get('strength', strength)
    else:
        prompt = custom_prompt

    # Create variant record
    variant_id = f"variant_{uuid.uuid4().hex[:8]}"

    conn = db.get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO element_variants (
            id, master_id, variant_type, variant_description,
            prompt, generation_method, reference_image_id, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        variant_id,
        master_id,
        variant_type,
        get_variant_prompt_suffix(variant_type),
        prompt,
        method,
        master_id,
        'generating'
    ))
    conn.commit()

    # Generate image
    if method == 'image_to_image':
        result = generate_image_image_to_image(
            prompt=prompt,
            reference_image_url=master['master_image_url'],
            model=model,
            strength=strength,
            num_images=1
        )
    else:
        result = generate_image_text_to_image(
            prompt=prompt,
            model=model,
            num_images=1
        )

    # Update variant with result
    if result.get('success'):
        cursor.execute("""
            UPDATE element_variants
            SET image_url = ?,
                generation_params = ?,
                status = 'complete'
            WHERE id = ?
        """, (
            result['image_url'],
            json.dumps(result.get('generation_params', {})),
            variant_id
        ))
    else:
        cursor.execute("""
            UPDATE element_variants
            SET status = 'failed',
                error_message = ?
            WHERE id = ?
        """, (result.get('error', 'Unknown error'), variant_id))

    conn.commit()

    # Save to generation history
    asset = db.get_asset(master['asset_id'])
    if asset and asset.get('project_id'):
        _save_to_history(
            project_id=asset['project_id'],
            target_type='element_variant',
            target_id=variant_id,
            prompt=prompt,
            model=model,
            method=method,
            reference_images=[{
                'id': master_id,
                'url': master['master_image_url'],
                'role': 'base'
            }] if method == 'image_to_image' else None,
            result=result
        )

    conn.close()

    return variant_id


def compile_element_variant_prompt(
    master_id: str,
    variant_type: str
) -> Dict[str, Any]:
    """
    Compile prompt for generating element variant.

    Args:
        master_id: Master to create variant from
        variant_type: Type of variant to create

    Returns:
        {
            'prompt': str,
            'method': 'image_to_image' | 'text_to_image',
            'strength': float,
            'model': str
        }
    """
    master = _get_element_master(master_id)
    if not master:
        raise ValueError(f"Master {master_id} not found")

    asset = db.get_asset(master['asset_id'])
    if not asset:
        raise ValueError(f"Asset {master['asset_id']} not found")

    # Get variant instructions
    variant_instruction = get_variant_prompt_suffix(variant_type)

    # Build prompt
    prompt = f"""
{variant_instruction}

Use the reference image as the EXACT character/element to replicate.

CONSISTENCY REQUIREMENTS:
- 100% same appearance as reference
- Same styling, colors, details
- Pure white background
- Same lighting style
- High photorealistic quality
"""

    return {
        'prompt': prompt,
        'method': 'image_to_image',
        'strength': 0.6,  # Keep character consistent
        'model': 'gemini-2.5-flash-image'  # Nano Banana is good for variants
    }


def generate_all_standard_variants(
    master_id: str,
    variant_types: Optional[List[str]] = None
) -> List[str]:
    """
    Generate a full set of standard variants for a master.

    Args:
        master_id: Master to create variants for
        variant_types: List of variant types (uses defaults if None)

    Returns:
        List of variant_ids created
    """
    master = _get_element_master(master_id)
    if not master:
        raise ValueError(f"Master {master_id} not found")

    element_type = master['element_type']

    # Default variant sets
    if not variant_types:
        if element_type == 'character':
            variant_types = [
                'side_left', 'side_right', '3_4_left', '3_4_right',
                'back', 'face_detail'
            ]
        elif element_type == 'location':
            variant_types = [
                'angle_north', 'angle_south', 'angle_east', 'angle_west'
            ]
        elif element_type == 'prop':
            variant_types = ['side', 'back', '3_4']

    # Generate each variant
    variant_ids = []
    for variant_type in variant_types:
        try:
            variant_id = generate_element_variant(
                master_id=master_id,
                variant_type=variant_type
            )
            variant_ids.append(variant_id)
        except Exception as e:
            print(f"Failed to generate variant {variant_type}: {e}")

    return variant_ids


# ============================================================================
# QUERY & MANAGEMENT
# ============================================================================

def get_element_master(asset_id: str) -> Optional[Dict[str, Any]]:
    """Get element master for an asset (if exists)."""
    conn = db.get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM element_masters
        WHERE asset_id = ?
        ORDER BY created_at DESC
        LIMIT 1
    """, (asset_id,))

    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


def get_element_variants(master_id: str, active_only: bool = True) -> List[Dict[str, Any]]:
    """Get all variants for a master."""
    conn = db.get_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM element_variants WHERE master_id = ?"
    params = [master_id]

    if active_only:
        query += " AND is_active = 1"

    query += " ORDER BY created_at ASC"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_asset_elements_summary(asset_id: str) -> Dict[str, Any]:
    """
    Get complete element summary for an asset.

    Returns:
        {
            'has_master': bool,
            'master': {...} | None,
            'variants': [...],
            'variant_count': int,
            'variant_types': ['side_left', ...]
        }
    """
    master = get_element_master(asset_id)

    if not master:
        return {
            'has_master': False,
            'master': None,
            'variants': [],
            'variant_count': 0,
            'variant_types': []
        }

    variants = get_element_variants(master['id'])

    return {
        'has_master': True,
        'master': master,
        'variants': variants,
        'variant_count': len(variants),
        'variant_types': [v['variant_type'] for v in variants]
    }


def get_generation_history(
    project_id: str,
    target_type: Optional[str] = None,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """
    Get generation history for a project.

    Args:
        project_id: Project to get history for
        target_type: Filter by type ('element_master' | 'element_variant' | 'cut_final')
        limit: Max results

    Returns:
        List of generation history entries
    """
    conn = db.get_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM generation_history WHERE project_id = ?"
    params = [project_id]

    if target_type:
        query += " AND target_type = ?"
        params.append(target_type)

    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def delete_element_variant(variant_id: str) -> bool:
    """Delete a variant (hard delete)."""
    conn = db.get_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM element_variants WHERE id = ?", (variant_id,))
    conn.commit()
    success = cursor.rowcount > 0
    conn.close()

    return success


def deactivate_element_variant(variant_id: str) -> bool:
    """Deactivate a variant (soft delete)."""
    conn = db.get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE element_variants
        SET is_active = 0
        WHERE id = ?
    """, (variant_id,))

    conn.commit()
    success = cursor.rowcount > 0
    conn.close()

    return success


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _get_element_master(master_id: str) -> Optional[Dict[str, Any]]:
    """Internal: Get master by ID."""
    conn = db.get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM element_masters WHERE id = ?", (master_id,))
    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


def _get_master_preset(element_type: str) -> Optional[Dict[str, Any]]:
    """Internal: Get system preset for element type."""
    conn = db.get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM element_presets
        WHERE element_type = ?
          AND preset_type = 'master'
          AND is_system = TRUE
        LIMIT 1
    """, (element_type,))

    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


def _save_to_history(
    project_id: str,
    target_type: str,
    target_id: str,
    prompt: str,
    model: str,
    method: str,
    reference_images: Optional[List[Dict]] = None,
    result: Optional[Dict[str, Any]] = None
) -> str:
    """Internal: Save generation to history."""
    history_id = f"history_{uuid.uuid4().hex[:8]}"

    conn = db.get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO generation_history (
            id, project_id, target_type, target_id,
            prompt, model, generation_method, reference_images,
            params, output_image_url, output_image_id,
            status, cost_usd, tokens_used, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        history_id,
        project_id,
        target_type,
        target_id,
        prompt,
        model,
        method,
        json.dumps(reference_images) if reference_images else None,
        json.dumps(result.get('generation_params', {})) if result else None,
        result.get('image_url') if result else None,
        result.get('image_id') if result else None,
        'success' if result and result.get('success') else 'failed',
        result.get('cost_usd', 0.039) if result else 0.0,
        result.get('tokens_used', 1290) if result else 0,
        datetime.now().isoformat()
    ))

    conn.commit()
    conn.close()

    return history_id
