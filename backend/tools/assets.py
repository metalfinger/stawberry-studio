"""
Agent tools for Asset Extraction and Management
Used by the Analyst agent in STORYBOARD phase
"""

from backend.database import assets as asset_db
from backend import db
from backend.database.core import mark_phases_stale
from backend.tools.registry import tool


@tool("get_full_blueprint_for_analysis", description="Flatten the blueprint (scenes->shots->cuts) into one structure for asset extraction.", tags=["assets", "read"])
def get_full_blueprint_for_analysis(project_id: str) -> dict:
    """
    Get the complete blueprint structure for asset analysis.
    Returns all scenes, shots, and cuts with their descriptions.
    
    Args:
        project_id: The current project ID
    
    Returns:
        Full blueprint hierarchy with all scenes, shots, and cuts
    """
    scenes = db.get_scenes(project_id)
    result = {"scenes": []}
    
    for scene in scenes:
        scene_data = dict(scene)
        shots = db.get_shots(scene["id"])
        scene_data["shots"] = []
        
        for shot in shots:
            shot_data = dict(shot)
            cuts = db.get_cuts(shot["id"])
            shot_data["cuts"] = [dict(c) for c in cuts]
            scene_data["shots"].append(shot_data)
        
        result["scenes"].append(scene_data)
    
    return result


def _match_asset_in_text(asset_name: str, text: str) -> bool:
    """
    Match asset name in text using word boundary detection.
    Handles partial matches, plurals, and possessives.
    
    Examples:
    - "Veer" matches "Veer kicks" ✓
    - "Veer" matches "Veer's boots" ✓
    - "Boot" matches "Boots" ✓
    - "Veer" does NOT match "Veeru" ✗
    """
    import re
    
    # Escape special regex characters in asset name
    escaped_name = re.escape(asset_name.lower())
    
    # Build pattern with word boundaries
    # Allow optional 's (possessive) or 's' at end (plurals)
    pattern = r'\b' + escaped_name + r"(?:'s|s)?\b"
    
    return bool(re.search(pattern, text.lower(), re.IGNORECASE))


@tool("auto_link_assets_to_blueprint", description="Auto-link assets to scene/shot/cut nodes by matching names in descriptions.", tags=["assets"])
def auto_link_assets_to_blueprint(project_id: str) -> dict:
    """
    Auto-link all project assets to appropriate blueprint nodes.
    Uses word boundary matching for robust asset detection.
    
    Call this AFTER creating all assets to establish the links.
    
    Args:
        project_id: The current project ID
    
    Returns:
        Summary of links created
    
    Linking Logic:
    - Locations → linked to Scenes (where location text matches)
    - Characters/Props → linked to Cuts (where action/dialogue mentions them)
    - If mentioned in Shot subject → linked to Shot
    
    Matching Rules:
    - Word boundary detection (Veer ≠ Veeru)
    - Handles plurals (Boot → Boots)
    - Handles possessives (Veer → Veer's)
    """
    # Get all assets
    all_assets = asset_db.get_assets(project_id)
    if not all_assets:
        return {"error": "No assets found. Create assets first."}
    
    # Get full blueprint
    scenes = db.get_scenes(project_id)
    
    links_created = {
        "scene_links": 0,
        "shot_links": 0,
        "cut_links": 0,
        "details": []
    }
    
    for scene in scenes:
        scene_text = " ".join([
            str(scene.get("location", "")),
            str(scene.get("location_detail", "")),
            str(scene.get("description", "")),
            str(scene.get("title", "")),
        ])
        
        shots = db.get_shots(scene["id"])
        
        for shot in shots:
            shot_text = " ".join([
                str(shot.get("subject", "")),
                str(shot.get("description", "")),
                str(shot.get("foreground", "")),
                str(shot.get("background", "")),
            ])
            
            cuts = db.get_cuts(shot["id"])
            
            for cut in cuts:
                cut_text = " ".join([
                    str(cut.get("action", "")),
                    str(cut.get("dialogue", "")),
                    str(cut.get("expression", "")),
                    str(cut.get("gesture", "")),
                ])
                
                # Match each asset using word boundary matching
                for asset in all_assets:
                    asset_name = asset.get("name", "")
                    asset_type = asset.get("type", "prop")
                    asset_id = asset["id"]
                    
                    if not asset_name:
                        continue
                    
                    # Determine where to link
                    if asset_type == "location":
                        # Locations match at scene level
                        if _match_asset_in_text(asset_name, scene_text):
                            result = asset_db.link_asset_to_node(asset_id, "scene", scene["id"], "primary")
                            if result.get("id"):  # New link created
                                links_created["scene_links"] += 1
                                links_created["details"].append(f"{asset['name']} → Scene {scene.get('scene_number')}")
                    else:
                        # Characters/Props - check cut first, then shot, then scene
                        if _match_asset_in_text(asset_name, cut_text):
                            result = asset_db.link_asset_to_node(asset_id, "cut", cut["id"], "primary")
                            if result.get("id"):
                                links_created["cut_links"] += 1
                                links_created["details"].append(f"{asset['name']} → Cut {cut.get('cut_number')}")
                        elif _match_asset_in_text(asset_name, shot_text):
                            result = asset_db.link_asset_to_node(asset_id, "shot", shot["id"], "primary")
                            if result.get("id"):
                                links_created["shot_links"] += 1
                                links_created["details"].append(f"{asset['name']} → Shot {shot.get('shot_number')}")
                        elif _match_asset_in_text(asset_name, scene_text):
                            result = asset_db.link_asset_to_node(asset_id, "scene", scene["id"], "primary")
                            if result.get("id"):
                                links_created["scene_links"] += 1
                                links_created["details"].append(f"{asset['name']} → Scene {scene.get('scene_number')}")
    
    total = links_created["scene_links"] + links_created["shot_links"] + links_created["cut_links"]
    
    return {
        "success": True,
        "total_links": total,
        "breakdown": {
            "scene_links": links_created["scene_links"],
            "shot_links": links_created["shot_links"],
            "cut_links": links_created["cut_links"],
        },
        "details": links_created["details"][:20],  # First 20 for brevity
        "message": f"Linked {total} assets to blueprint nodes."
    }


@tool("create_asset", description="Create a new asset (character/location/prop/frame).", tags=["assets", "write"])
def create_asset(
    project_id: str,
    asset_type: str,
    name: str,
    description: str = None,
    appearance: str = None,
    style: str = None
) -> dict:
    """
    Create a new MASTER asset (character, location, prop, or frame).
    For variants, use create_variant instead.
    
    Args:
        project_id: The current project ID
        asset_type: Type of asset - 'character', 'location', 'prop', or 'frame'
        name: Name of the asset (e.g., "Dr. Sarah Chen", "Mars Colony")
        description: Detailed description of the asset
        appearance: Visual appearance details (for characters)
        style: Style notes (for locations/props)
    
    Returns:
        The created asset with its ID
    """
    if asset_type not in ["character", "location", "prop", "frame"]:
        return {"error": f"Invalid asset_type: {asset_type}. Must be 'character', 'location', 'prop', or 'frame'"}
    
    asset = asset_db.create_asset(
        project_id=project_id,
        asset_type=asset_type,
        name=name,
        description=description,
        appearance=appearance,
        style=style
    )

    # Mark downstream phases as stale when assets change
    mark_phases_stale(project_id, "ASSETS")

    return {"success": True, "asset": asset}


@tool("create_variant", description="Create a variant of an existing master asset.", tags=["assets", "write"])
def create_variant(
    master_id: str,
    variant_name: str,
    variant_diff: str
) -> dict:
    """
    Create a VARIANT of an existing master asset.
    Use this when the same character/location appears differently in another scene.
    
    Args:
        master_id: ID of the master asset (from get_assets)
        variant_name: Name for this variant (e.g., "Dr. Chen - Spacesuit")
        variant_diff: What's different from the master (e.g., "Wearing EVA suit, helmet on")
    
    Returns:
        The created variant asset
    
    Example:
        Master: "Dr. Sarah Chen" (lab coat, indoor)
        Variant: "Dr. Chen - Spacesuit" (variant_diff: "EVA suit with helmet, outdoor lighting")
    """
    variant = asset_db.create_variant(
        master_id=master_id,
        variant_name=variant_name,
        variant_diff=variant_diff
    )
    if "error" in variant:
        return variant
    return {"success": True, "variant": variant}


@tool("create_frame_slot", description="Create a frame placeholder asset for a specific cut.", tags=["assets", "write"])
def create_frame_slot(
    project_id: str,
    cut_id: str,
    frame_name: str,
    description: str
) -> dict:
    """
    Create a FRAME slot for a specific cut (storyboard image).
    Each cut should have one frame slot for the visual representation.
    
    Args:
        project_id: The current project ID
        cut_id: ID of the cut this frame belongs to
        frame_name: Name for the frame (e.g., "Scene 1 Shot 2 Cut 3")
        description: Visual description of what this frame should show
    
    Returns:
        The created frame asset, automatically linked to the cut
    """
    # Create frame asset
    frame = asset_db.create_asset(
        project_id=project_id,
        asset_type="frame",
        name=frame_name,
        description=description
    )
    
    # Auto-link to cut
    asset_db.link_asset_to_node(
        asset_id=frame["id"],
        node_type="cut",
        node_id=cut_id,
        usage="primary"
    )
    
    return {"success": True, "frame": frame, "linked_to": cut_id}


@tool("get_asset_usage", description="Show all nodes (scenes/shots/cuts) that link to an asset.", tags=["assets", "read"])
def get_asset_usage(asset_id: str) -> dict:
    """
    Get all nodes that use a specific asset (bidirectional query).
    Useful for impact analysis - "where is this character used?"
    
    Args:
        asset_id: ID of the asset to find usages for
    
    Returns:
        List of nodes (scenes, shots, cuts) that use this asset
    """
    nodes = asset_db.get_asset_nodes(asset_id)
    asset = asset_db.get_asset(asset_id)
    
    # Also get variant usages if this is a master
    variant_usages = []
    if asset and not asset.get("master_id"):
        variants = asset_db.get_variants(asset_id)
        for v in variants:
            variant_nodes = asset_db.get_asset_nodes(v["id"])
            for node in variant_nodes:
                node["variant_name"] = v["name"]
                variant_usages.append(node)
    
    return {
        "asset": asset,
        "direct_usages": nodes,
        "variant_usages": variant_usages,
        "total_usages": len(nodes) + len(variant_usages)
    }


@tool("get_masters_with_variants", description="List master assets grouped with their variants.", tags=["assets", "read"])
def get_masters_with_variants(project_id: str, asset_type: str = None) -> dict:
    """
    Get all master assets with their variants (hierarchical view).
    
    Args:
        project_id: The current project ID
        asset_type: Optional filter - 'character', 'location', 'prop'
    
    Returns:
        List of master assets, each with a 'variants' list
    """
    masters = asset_db.get_masters(project_id, asset_type)
    
    result = []
    for master in masters:
        master_data = dict(master)
        master_data["variants"] = asset_db.get_variants(master["id"])
        result.append(master_data)
    
    return {"masters": result, "count": len(result)}


@tool("get_assets", description="List all assets for a project, optionally filtered by type.", tags=["assets", "read"])
def get_assets(project_id: str, asset_type: str = None) -> dict:
    """
    Get all assets for the current project (masters and variants).
    
    Args:
        project_id: The current project ID
        asset_type: Optional filter - 'character', 'location', 'prop', or 'frame'
    
    Returns:
        List of assets
    """
    assets = asset_db.get_assets(project_id, asset_type)
    return {"assets": assets, "count": len(assets)}


@tool("update_asset", description="Patch fields on an existing asset.", tags=["assets", "write"])
def update_asset(
    asset_id: str,
    name: str = None,
    description: str = None,
    appearance: str = None,
    style: str = None,
    variant_diff: str = None
) -> dict:
    """
    Update an existing asset's details.
    
    Args:
        asset_id: ID of the asset to update
        name: New name (optional)
        description: New description (optional)
        appearance: New appearance details (optional)
        style: New style notes (optional)
        variant_diff: Update variant difference (optional, for variants only)
    
    Returns:
        The updated asset
    """
    updates = {}
    if name: updates["name"] = name
    if description: updates["description"] = description
    if appearance: updates["appearance"] = appearance
    if style: updates["style"] = style
    if variant_diff: updates["variant_diff"] = variant_diff
    
    if not updates:
        return {"error": "No updates provided"}

    asset = asset_db.update_asset(asset_id, **updates)
    if not asset:
        return {"error": f"Asset not found: {asset_id}"}

    # Mark downstream phases as stale when assets change
    if asset.get("project_id"):
        mark_phases_stale(asset["project_id"], "ASSETS")

    return {"success": True, "asset": asset}


@tool("compose_cut", description="One-button compose: bundle full tree → smart picker → fill missing references → DSL prompt → Nano Banana Pro render → vision critic with auto-retry → register reference. Use this for ANY 'generate this cut' request instead of compile_shot_prompt.", tags=["cut", "write", "phase"])
async def compose_cut_tool(cut_id: str) -> dict:
    """Run the production-grade Cut Composer pipeline for one cut."""
    from backend.orchestrator.cut_composer import compose_cut
    result = await compose_cut(cut_id)
    return result.to_dict()


@tool("get_asset_tree_context", description="Walk the project tree from one asset outward — brief globals, linked scenes/shots/cuts, sibling assets, active sheet. Use this BEFORE writing a suggested_prompt so the prompt incorporates lighting/world context.", tags=["assets", "read"])
async def get_asset_tree_context(asset_id: str) -> dict:
    """Return the full tree context around an asset — for Atlas/Pixel."""
    from backend.orchestrator.asset_bundler import bundle_asset_context
    ctx = await bundle_asset_context(asset_id)
    # Compact the response — strip large blobs, keep the bits useful for prompt-writing.
    def _scene_brief(s):
        return {k: s.get(k) for k in ("id", "scene_number", "title", "location", "lighting", "lighting_color", "time_of_day", "mood")}
    def _shot_brief(s):
        return {k: s.get(k) for k in ("id", "shot_number", "camera_distance", "camera_angle", "camera_movement", "description")}
    return {
        "asset": ctx.asset,
        "brief": {k: ctx.brief.get(k) for k in ("title", "art_style", "color_palette", "lighting_style", "world_logic", "era_setting", "tone", "negative_prompts", "aspect_ratio")} if ctx.brief else {},
        "linked_scenes": [_scene_brief(s) for s in ctx.linked_scenes],
        "linked_shots": [_shot_brief(s) for s in ctx.linked_shots],
        "linked_cuts": [{"id": c["id"], "action": c.get("action"), "expression": c.get("expression")} for c in ctx.linked_cuts],
        "sibling_assets": [{"id": a["id"], "type": a["type"], "name": a["name"], "has_prompt": bool(a.get("suggested_prompt"))} for a in ctx.sibling_assets],
        "has_active_sheet": ctx.active_sheet is not None,
        "stats": ctx.stats,
    }


@tool("generate_all_missing_sheets", description="Trigger sheet/master generation for every project asset that has a suggested_prompt but no active sheet. Runs in parallel; returns per-asset status.", tags=["assets", "write", "phase"])
async def generate_all_missing_sheets(project_id: str) -> dict:
    """One-button unblock for the CAST_SCOUT → STORYBOARD handoff.

    Iterates every asset in the project. For each that has a non-empty
    `suggested_prompt` and no active element_sheet, generates a sheet via the
    Sheet Planner + Nano Banana Pro. Skips assets that are already covered.

    Returns a per-asset report: which were generated, which were skipped (and
    why), which failed.
    """
    import asyncio
    from backend.orchestrator.sheet_generator import (
        generate_sheet_for_asset,
        get_active_sheet,
    )

    assets = asset_db.get_assets(project_id)
    if not assets:
        return {"success": True, "generated": [], "skipped": [], "errors": [],
                "message": "No assets in this project."}

    async def _process(a: dict):
        if not (a.get("suggested_prompt") or "").strip():
            return ("skipped", a, "no suggested_prompt — Atlas must save one first")
        existing = await get_active_sheet(a["id"])
        if existing:
            return ("skipped", a, f"already has sheet {existing['id']}")
        try:
            res = await generate_sheet_for_asset(a["id"])
            return ("generated", a, {"sheet_id": res.sheet_id, "image_url": res.image_url, "cost_usd": res.cost_usd})
        except Exception as e:
            return ("error", a, str(e))

    outcomes = await asyncio.gather(*[_process(a) for a in assets], return_exceptions=False)
    generated, skipped, errors = [], [], []
    for status, a, info in outcomes:
        item = {"id": a["id"], "type": a["type"], "name": a["name"], "info": info}
        if status == "generated": generated.append(item)
        elif status == "skipped": skipped.append(item)
        else: errors.append(item)

    return {
        "success": len(errors) == 0,
        "generated": generated,
        "skipped": skipped,
        "errors": errors,
        "summary": f"Generated {len(generated)} sheet(s); skipped {len(skipped)}; {len(errors)} error(s).",
    }


@tool("save_suggested_asset_prompt", description="Persist a suggested generation prompt on an asset.", tags=["assets", "write"])
def save_suggested_asset_prompt(asset_id: str, prompt: str) -> dict:
    """
    Save a suggested prompt for an asset's master image.
    This prompt can be used by the user to generate the first master image.
    
    Args:
        asset_id: ID of the asset to update
        prompt: The suggested generation prompt
        
    Returns:
        Success status and updated asset
    """
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE assets SET suggested_prompt = ? WHERE id = ?",
        (prompt, asset_id)
    )
    conn.commit()
    conn.close()
    
    return {"success": True, "asset_id": asset_id, "suggested_prompt": prompt}


@tool("delete_asset", description="Delete an asset and its links/variants.", tags=["assets", "write"])
def delete_asset(asset_id: str) -> dict:
    """
    Delete an asset, all its variants, and all node links.
    
    Args:
        asset_id: ID of the asset to delete
    
    Returns:
        Success status
    """
    asset_db.delete_asset(asset_id)
    return {"success": True, "deleted": asset_id}


@tool("delete_all_assets", description="Delete every asset in a project.", tags=["assets", "write"])
def delete_all_assets(project_id: str) -> dict:
    """
    Delete ALL assets and their links for a project.
    Use with caution - this removes all characters, locations, and props.
    
    Args:
        project_id: The current project ID
    
    Returns:
        Count of deleted assets
    """
    assets = asset_db.get_assets(project_id)
    count = len(assets)
    
    for asset in assets:
        asset_db.delete_asset(asset["id"])
    
    return {"success": True, "deleted_count": count, "message": f"Deleted {count} assets and all their links"}


@tool("link_asset_to_node", description="Link an asset to a scene/shot/cut node.", tags=["assets", "write"])
def link_asset_to_node(
    asset_id: str,
    node_type: str,
    node_id: str,
    usage: str = "primary",
    variant_notes: str = None
) -> dict:
    """
    Link an asset to a scene, shot, or cut.
    
    Args:
        asset_id: ID of the asset (from create_asset or get_assets)
        node_type: Type of node - 'scene', 'shot', or 'cut'
        node_id: ID of the node (scene_xxx, shot_xxx, or cut_xxx)
        usage: How the asset is used - 'primary', 'background', or 'mentioned'
        variant_notes: Optional notes if this usage has variations
    
    Returns:
        The created link
    """
    if node_type not in ["scene", "shot", "cut"]:
        return {"error": f"Invalid node_type: {node_type}. Must be 'scene', 'shot', or 'cut'"}
    
    link = asset_db.link_asset_to_node(
        asset_id=asset_id,
        node_type=node_type,
        node_id=node_id,
        usage=usage,
        variant_notes=variant_notes
    )
    return {"success": True, "link": link}


@tool("get_node_assets", description="List assets linked to a specific node.", tags=["assets", "read"])
def get_node_assets(node_type: str, node_id: str) -> dict:
    """
    Get all assets linked to a specific node.
    
    Args:
        node_type: Type of node - 'scene', 'shot', or 'cut'
        node_id: ID of the node
    
    Returns:
        List of assets with their usage info
    """
    assets = asset_db.get_node_assets(node_type, node_id)
    return {"assets": assets, "count": len(assets)}


@tool("complete_asset_extraction", description="Validate assets are extracted and ASK user to confirm advancing to GENERATE phase.", tags=["assets", "phase"])
def complete_asset_extraction(project_id: str) -> dict:
    """
    Request to complete asset extraction - REQUIRES USER CONFIRMATION
    AND every asset must have a non-empty `suggested_prompt`.

    DO NOT proceed to the next phase without explicit user confirmation.

    Args:
        project_id: The current project ID

    Returns:
        Either a "missing prompts" failure (so Atlas can fix in-loop) or
        a CONFIRMATION_REQUIRED summary asking the user to advance.
    """
    # Hard pre-check: every asset must have a suggested_prompt before we can
    # even *ask* the user to advance. This is the gate that previously failed.
    all_assets = asset_db.get_assets(project_id)
    missing_prompts = [a for a in all_assets if not (a.get("suggested_prompt") or "").strip()]
    if missing_prompts:
        return {
            "status": "MISSING_PROMPTS",
            "blocking": True,
            "missing": [
                {"id": a["id"], "type": a["type"], "name": a["name"]}
                for a in missing_prompts
            ],
            "message": (
                "❌ Cannot advance — these assets have no `suggested_prompt`. "
                "Call `save_suggested_asset_prompt(asset_id, prompt)` on each one "
                "with a full master-image prompt (full-body or establishing shot, "
                "applying brief.art_style + color_palette, neutral background) before "
                "trying to complete the phase again.\n\n" +
                "\n".join(f"- {a['type']}/{a['name']} ({a['id']})" for a in missing_prompts)
            ),
        }

    # Get summary (masters only for clean count)
    characters = asset_db.get_masters(project_id, "character")
    locations = asset_db.get_masters(project_id, "location")
    props = asset_db.get_masters(project_id, "prop")
    frames = asset_db.get_assets(project_id, "frame")
    
    # Count variants
    all_variants = sum(len(asset_db.get_variants(c["id"])) for c in characters)
    all_variants += sum(len(asset_db.get_variants(l["id"])) for l in locations)
    all_variants += sum(len(asset_db.get_variants(p["id"])) for p in props)
    
    total_slots = len(characters) + len(locations) + len(props) + len(frames) + all_variants
    
    return {
        "status": "CONFIRMATION_REQUIRED",
        "summary": {
            "characters": {"masters": len(characters), "variants": all_variants},
            "locations": len(locations),
            "props": len(props),
            "frames": len(frames),
            "total_slots": total_slots
        },
        "message": f"""✅ **Asset extraction is ready to complete!**

📦 **Assets Summary:**
- **Characters:** {len(characters)} masters + {all_variants} variants
- **Locations:** {len(locations)}
- **Props:** {len(props)}
- **Frames:** {len(frames)}
- **Total Slots:** {total_slots}

🚨 **CONFIRMATION REQUIRED:**
Are you ready to move to the **GENERATE** phase where we'll create visual references for each asset?

👉 **Please say "yes" or "proceed" to confirm**, or tell me what changes you'd like to make first."""
    }


@tool("confirm_asset_extraction_complete", description="Actually advance to GENERATE phase. Call only after explicit user confirmation.", tags=["assets", "phase"])
def confirm_asset_extraction_complete(project_id: str) -> dict:
    """
    Actually complete asset extraction and transition to GENERATE phase.
    ONLY call this AFTER the user has explicitly confirmed (said "yes", "proceed", "confirm", etc.)
    
    Args:
        project_id: The current project ID
    
    Returns:
        Success message with summary, OR a hard-block payload if any asset
        is still prompt-less (the same gate as `complete_asset_extraction`).
    """
    # Hard gate: refuse to transition if anything is still prompt-less.
    all_assets = asset_db.get_assets(project_id)
    missing = [a for a in all_assets if not (a.get("suggested_prompt") or "").strip()]
    if missing:
        return {
            "success": False,
            "blocked": True,
            "missing": [{"id": a["id"], "type": a["type"], "name": a["name"]} for a in missing],
            "message": (
                "Refusing to advance — assets without `suggested_prompt` exist:\n" +
                "\n".join(f"- {a['type']}/{a['name']}" for a in missing) +
                "\nFix them with `save_suggested_asset_prompt` first."
            ),
        }

    # Get summary for the success message
    characters = asset_db.get_masters(project_id, "character")
    locations = asset_db.get_masters(project_id, "location")
    props = asset_db.get_masters(project_id, "prop")
    frames = asset_db.get_assets(project_id, "frame")

    # Count variants
    all_variants = sum(len(asset_db.get_variants(c["id"])) for c in characters)
    all_variants += sum(len(asset_db.get_variants(l["id"])) for l in locations)
    all_variants += sum(len(asset_db.get_variants(p["id"])) for p in props)

    # Update project phase
    db.update_project_phase(project_id, "GENERATE")
    
    return {
        "success": True,
        "summary": {
            "characters": {"masters": len(characters), "variants": all_variants},
            "locations": len(locations),
            "props": len(props),
            "frames": len(frames),
            "total_slots": len(characters) + len(locations) + len(props) + len(frames) + all_variants
        },
        "next_phase": "GENERATE",
        "message": "🎉 Asset extraction complete! Project advancing to GENERATE phase. Ready to create visual references."
    }

