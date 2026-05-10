"""
Agent tools for Asset Extraction and Management — used by Atlas in the
ASSETS phase.
"""

from backend.database import assets as asset_db
from backend import db
from backend import db
mark_phases_stale = db.mark_phases_stale
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


@tool("create_asset", description="Create a new asset (character/location/prop/frame). Pass parent_asset_id when this asset's identity is defined by another (Mara's gun → parent_asset_id=mara.id, ramen stall in alley → parent_asset_id=alley.id). Pass reference_strategy='derived' alongside.", tags=["assets", "write"])
def create_asset(
    project_id: str,
    asset_type: str,
    name: str,
    description: str = None,
    appearance: str = None,
    style: str = None,
    parent_asset_id: str = None,
    reference_strategy: str = "standalone",
) -> dict:
    """
    Create a new MASTER asset (character, location, prop, or frame).
    For variants, use create_variant instead.

    Args:
        project_id: The current project ID
        asset_type: 'character' | 'location' | 'prop' | 'frame'
        name: Name of the asset (e.g., "Dr. Sarah Chen", "Mars Colony")
        description: Detailed description of the asset
        appearance: Visual appearance details (for characters)
        style: Style notes (for locations/props)
        parent_asset_id: Optional. The asset whose visual identity defines this
            one. Sheet generation will pin the parent's sheet/master into slot
            @Image1 so identity locks. Use for character-bound props ("Mara's
            gun" → Mara), set-dressing ("ramen stall in the alley" → alley),
            or sub-locations ("the alcove inside the alley" → alley).
        reference_strategy: 'standalone' (default) | 'derived' (uses parent
            as reference) | 'variant' (use create_variant instead).

    Returns:
        The created asset with its ID
    """
    if asset_type not in ["character", "location", "prop", "frame", "sublocation", "location_angle"]:
        return {"error": f"Invalid asset_type: {asset_type}. Must be one of: 'character', 'location', 'prop', 'frame', 'sublocation', 'location_angle'."}

    # L4 — sublocations and angles MUST point at a parent location.
    if asset_type in ("sublocation", "location_angle") and not parent_asset_id:
        return {
            "error": (
                f"asset_type='{asset_type}' requires parent_asset_id pointing at "
                "a Location asset. Sub-locations and angles cannot exist standalone."
            )
        }

    if parent_asset_id and reference_strategy == "standalone":
        # If the agent passed a parent, default the strategy to 'derived'
        # so the sheet generator picks it up.
        reference_strategy = "derived"

    asset = asset_db.create_asset(
        project_id=project_id,
        asset_type=asset_type,
        name=name,
        description=description,
        appearance=appearance,
        style=style,
        parent_asset_id=parent_asset_id,
        reference_strategy=reference_strategy,
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


@tool("set_scene_wardrobe_override", description="Override a character's wardrobe for a specific scene only (without duplicating the character asset). Use when the same character wears different clothes in different scenes — Mara in everyday coat in scene 1 vs gala dress in scene 3.", tags=["assets", "write"])
def set_scene_wardrobe_override(scene_id: str, character_id: str, wardrobe_text: str) -> dict:
    """Set a per-scene wardrobe override for a character.

    Args:
        scene_id: The scene where the override applies.
        character_id: The character asset ID.
        wardrobe_text: Description of what they're wearing in this scene.

    Returns:
        The updated overrides map.
    """
    import json as _json
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT character_wardrobe_overrides FROM scenes WHERE id = ?", (scene_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return {"error": f"scene {scene_id} not found"}
    try:
        overrides = _json.loads(row["character_wardrobe_overrides"] or "{}")
    except _json.JSONDecodeError:
        overrides = {}
    overrides[character_id] = wardrobe_text
    cursor.execute(
        "UPDATE scenes SET character_wardrobe_overrides = ? WHERE id = ?",
        (_json.dumps(overrides), scene_id),
    )
    conn.commit()
    conn.close()
    return {"success": True, "scene_id": scene_id, "overrides": overrides}


_WARDROBE_GLOSSARY = {
    "coat", "jacket", "blazer", "suit", "dress", "shirt", "t-shirt", "tshirt",
    "pants", "jeans", "trousers", "skirt", "shoes", "boots", "sneakers",
    "heels", "hat", "cap", "beanie", "helmet", "scarf", "tie", "gloves",
    "sunglasses", "glasses", "earrings", "necklace", "ring", "watch",
    "bag", "backpack", "mask", "makeup", "tattoo", "scar", "birthmark",
    "piercing", "robe", "cloak", "armor", "armour", "uniform",
}


@tool("cleanup_misclassified_assets", description="Apply the asset decision tree retroactively to a project. Wardrobe-named assets get merged into the most-likely character's wardrobe_lock; the rogue asset rows are deleted. Use on legacy projects extracted before the DAG refactor.", tags=["assets", "write", "cleanup"])
def cleanup_misclassified_assets(project_id: str) -> dict:
    """Find prop/character assets whose name is a wardrobe noun and merge them
    into the most-likely-wearing character's wardrobe_lock, then delete them."""
    assets = asset_db.get_assets(project_id)
    chars = [a for a in assets if a.get("type") == "character"]
    moved: list[dict] = []
    deleted: list[dict] = []
    for a in assets:
        name_low = (a.get("name") or "").lower()
        if a.get("type") == "character":
            continue
        # Match wardrobe glossary
        if not any(g in name_low.split() or g == name_low for g in _WARDROBE_GLOSSARY):
            continue
        # Pick the character that is linked to the most overlapping nodes.
        target = None
        if chars:
            target = chars[0]  # default — most projects have a single hero
            # Heuristic: if the asset's name contains a character's name token,
            # prefer that character.
            for c in chars:
                if (c.get("name") or "").split()[0].lower() in name_low:
                    target = c
                    break
        if target is None:
            continue
        # Re-read target so we accumulate wardrobe instead of overwriting on
        # the second wardrobe item.
        target = asset_db.get_asset(target["id"]) or target
        existing_wardrobe = (target.get("wardrobe_lock") or "").strip()
        descriptor = (a.get("name") or "") + (
            f" ({a.get('appearance')})" if a.get("appearance") else ""
        )
        new_wardrobe = (existing_wardrobe + "; " + descriptor).strip("; ")
        asset_db.update_asset(target["id"], wardrobe_lock=new_wardrobe)
        moved.append({"from": a["id"], "to": target["id"], "descriptor": descriptor})
        asset_db.delete_asset(a["id"])
        deleted.append({"id": a["id"], "name": a["name"]})
    return {
        "success": True,
        "moved_to_wardrobe": moved,
        "deleted": deleted,
        "summary": f"Merged {len(moved)} wardrobe assets; deleted {len(deleted)} rows.",
    }


@tool("compose_cut", description="One-button compose: bundle full tree → resolve references → render → register. NO automatic critic. For richer flow with user approval, use propose_cut_plan + execute_cut_plan instead.", tags=["cut", "write", "phase"])
async def compose_cut_tool(cut_id: str, feedback: str = "") -> dict:
    """Run the auto-approve compose pipeline for one cut.

    Inlined from the deleted cut_composer.py wrapper: plan → mark every
    item approved → execute. This is the legacy fast path for callers
    that don't want the user to see the PlanCard before render. Modern
    flows use propose_cut_plan + execute_cut_plan.
    """
    from backend.orchestrator.cut_planner import plan_compose_cut
    from backend.orchestrator.cut_executor import execute_plan
    from backend.orchestrator.plans import save_plan, update_plan_status

    plan = await plan_compose_cut(cut_id, feedback=feedback or None)
    for item in plan.items:
        item.approved = True
    await save_plan(plan)
    await update_plan_status(plan.id, "approved")
    result = await execute_plan(plan.id)
    return {
        "cut_id": cut_id,
        "image_url": result.image_url,
        "score": None,
        "attempts": 1,
        "error": result.error,
    }


@tool("propose_cut_plan", description="Propose a Plan for composing a cut WITHOUT executing. Emits a typed PlanCard to the user's chat — the agent should NOT also print the plan as text. Returns plan summary (id, totals, items) for the agent's bookkeeping. Pass feedback + parent_plan_id to fork from a prior plan with cumulative refinement notes.", tags=["cut", "plan"])
async def propose_cut_plan_tool(cut_id: str, feedback: str = "", parent_plan_id: str = "") -> dict:
    """Build a Plan and surface it as a PlanCard. The card is the canonical
    UI for plan approval — the agent's text reply should be a single
    sentence (e.g. "Plan ready — approve below.") and never duplicate the
    plan contents."""
    from backend.orchestrator.cut_planner import plan_compose_cut
    from backend.orchestrator.intents import _set_plan_message_id
    from backend.orchestrator.narrator import Narrator
    from backend.orchestrator.plans import load_plan, save_plan

    parent = None
    if parent_plan_id:
        parent = await load_plan(parent_plan_id)

    plan = await plan_compose_cut(
        cut_id,
        feedback=feedback or None,
        parent_plan=parent,
    )
    await save_plan(plan)

    # Emit the typed PlanCard via the project bus so the user sees it
    # regardless of how the plan was triggered (chat tool vs UI button).
    try:
        narrator = Narrator(plan.project_id)
        msg_id = await narrator.plan(plan)
        await _set_plan_message_id(plan.id, msg_id)
    except Exception:
        pass

    return {
        "plan_id": plan.id,
        "cut_id": plan.cut_id,
        "items_total": len(plan.items),
        "items_cached": sum(1 for i in plan.items if i.cached),
        "items_new_gen": sum(1 for i in plan.items if not i.cached and i.kind == "reference_generate"),
        "total_cost_usd": plan.total_cost_usd,
        "total_eta_s": plan.total_eta_s,
        "ui_emitted": True,
    }


@tool("execute_cut_plan", description="Execute an approved Plan. Pass plan_id from a previous propose_cut_plan call. Optionally pass approved_item_ids to override default approval (cached items always auto-approved; new gens need explicit approval unless cost is below auto_approve_under_usd). Per-item progress is streamed to the chat as PlanCard updates — the agent should not narrate each step.", tags=["cut", "plan"])
async def execute_cut_plan_tool(plan_id: str, approved_item_ids: list[str] | None = None, deny_item_ids: list[str] | None = None) -> dict:
    """Approve items per-id and execute. Streams plan_update events to the
    Console PlanCard so the user sees per-item progress in real time."""
    from backend.orchestrator.cut_executor import execute_plan
    from backend.orchestrator.intents import _get_plan_message_id
    from backend.orchestrator.narrator import Narrator
    from backend.orchestrator.plans import PlanItem, load_plan, save_plan, update_plan_status

    plan = await load_plan(plan_id)
    if plan is None:
        return {"error": f"plan {plan_id} not found"}

    approved_set = set(approved_item_ids or [])
    deny_set = set(deny_item_ids or [])

    # Default approval: cached items auto-approved, new gens require approved_item_ids.
    for item in plan.items:
        if item.id in deny_set:
            item.approved = False
        elif item.cached or item.id in approved_set:
            item.approved = True
        elif not approved_item_ids:
            # No explicit approval list provided — auto-approve everything (legacy fast path).
            item.approved = True

    await save_plan(plan)
    await update_plan_status(plan_id, "approved")

    # Wire on_step → narrator.update_plan_item so the existing PlanCard
    # patches in place. Also emit the final image as an ImageMessage
    # via cut_executor (already handled there).
    plan_msg_id = await _get_plan_message_id(plan_id)
    narrator = Narrator(plan.project_id)
    import asyncio as _asyncio

    def _on_step(item: PlanItem) -> None:
        if not plan_msg_id:
            return
        try:
            _asyncio.create_task(
                narrator.update_plan_item(
                    plan_msg_id,
                    item.id,
                    status=item.status,
                    result=item.result,
                    error=item.error,
                )
            )
        except Exception:
            pass

    result = await execute_plan(plan_id, on_step=_on_step)
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


@tool("generate_all_missing_sheets", description="Generate identity cards + standard turnaround for every project asset that has a suggested_prompt but no identity reference yet. Runs parents-before-derived, identity-then-turnaround. Returns per-asset status.", tags=["assets", "write", "phase"])
async def generate_all_missing_sheets(project_id: str) -> dict:
    """One-button unblock for the ASSETS → GENERATE handoff.

    For each asset: ensure identity exists (generate if missing), then fire
    the standard turnaround set in parallel. Parents (parent_asset_id /
    master_id) generated before their children so derived assets can
    condition on the parent's identity.
    """
    import asyncio
    from backend.orchestrator import references

    assets = asset_db.get_assets(project_id)
    if not assets:
        return {"success": True, "generated": [], "skipped": [], "errors": [],
                "message": "No assets in this project."}

    # Topo-sort: parents/variant-bases must be generated before children.
    by_id = {a["id"]: a for a in assets}
    waves: list[list[dict]] = []
    remaining = list(assets)
    placed: set[str] = set()
    while remaining:
        wave = [
            a for a in remaining
            if (not a.get("parent_asset_id") or a["parent_asset_id"] in placed or a["parent_asset_id"] not in by_id)
            and (not a.get("master_id") or a["master_id"] in placed or a["master_id"] not in by_id)
        ]
        if not wave:
            wave = remaining[:]
        for a in wave:
            placed.add(a["id"])
        waves.append(wave)
        remaining = [a for a in remaining if a["id"] not in placed]

    async def _process(a: dict):
        if not (a.get("suggested_prompt") or "").strip():
            return ("skipped", a, "no suggested_prompt — Atlas must save one first")
        existing = await references.get_identity_card(a["id"])
        if existing:
            return ("skipped", a, f"already has identity {existing['id']}")
        try:
            refs = await references.precache_standard_turnaround(a["id"])
            return ("generated", a, {
                "identity_id": refs[0]["id"],
                "image_url": refs[0]["image_url"],
                "extra_views": [r["label"] for r in refs[1:]],
            })
        except Exception as e:
            return ("error", a, str(e))

    generated, skipped, errors = [], [], []
    for wave in waves:
        outcomes = await asyncio.gather(*[_process(a) for a in wave], return_exceptions=False)
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
        "summary": f"Generated identity+turnaround for {len(generated)} asset(s); skipped {len(skipped)}; {len(errors)} error(s).",
    }


@tool("save_suggested_asset_prompt", description="Persist a suggested generation prompt on an asset. Also auto-extracts structured identity locks (appearance, distinctive_features, wardrobe_lock) so the cut DSL has rich text grounding for continuity.", tags=["assets", "write"])
async def save_suggested_asset_prompt(asset_id: str, prompt: str) -> dict:
    """Save a suggested prompt and run a cheap identity-trait extraction
    so that downstream cut renders can lean on structured columns rather
    than a single big blob. Without this, characters appear in cut
    prompts as bare "@Image1 The Director" with no text grounding —
    which is exactly how we lost glasses on Test 2 / cut C2."""
    import asyncio
    from backend.orchestrator.identity_traits import extract_identity_traits

    # Pull the asset type for type-aware extraction.
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT type FROM assets WHERE id = ?", (asset_id,))
    row = cursor.fetchone()
    asset_type = (dict(row).get("type") if row else "character") or "character"
    cursor.execute(
        "UPDATE assets SET suggested_prompt = ? WHERE id = ?",
        (prompt, asset_id),
    )
    conn.commit()
    conn.close()

    # Extract identity traits in the same coroutine so callers get a
    # consistent post-state. Best-effort — empty traits if the LLM
    # call fails; the DSL still uses suggested_prompt as fallback.
    traits = await extract_identity_traits(prompt, asset_type=asset_type)
    appearance = traits.get("appearance") or ""
    distinctive = traits.get("distinctive_features") or ""
    wardrobe = traits.get("wardrobe_lock") or ""
    tokens = traits.get("consistency_tokens") or ""
    if appearance or distinctive or wardrobe or tokens:
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE assets SET appearance = ?, distinctive_features = ?, "
            "wardrobe_lock = ?, consistency_tokens = ? WHERE id = ?",
            (appearance, distinctive, wardrobe, tokens, asset_id),
        )
        conn.commit()
        conn.close()

    return {
        "success": True,
        "asset_id": asset_id,
        "suggested_prompt": prompt,
        "identity_traits": traits,
    }


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

    # Variant-fold detector — flag assets that share a long prefix and same
    # type. They're almost certainly variants the agent should have folded
    # via create_variant (e.g. "Astronaut Actor" + "Astronaut Actor —
    # Cracked Helmet"). Two siblings with overlapping identities lose their
    # face/wardrobe lock; one master + variant doesn't.
    variant_warnings: list[dict] = []
    by_type: dict[str, list[dict]] = {}
    for a in all_assets:
        if (a.get("master_id") or "").strip():
            continue  # already a variant
        by_type.setdefault((a.get("type") or "").lower(), []).append(a)
    for t, group in by_type.items():
        if t in ("frame", "sublocation", "location_angle"):
            continue
        names = [(g["id"], (g.get("name") or "").strip()) for g in group]
        for i, (id_a, n_a) in enumerate(names):
            for id_b, n_b in names[i + 1:]:
                if not n_a or not n_b:
                    continue
                # Same first 2+ words OR shared prefix > 60% of shorter.
                a_words = n_a.split()
                b_words = n_b.split()
                shared_words = 0
                for x, y in zip(a_words, b_words):
                    if x.lower() == y.lower():
                        shared_words += 1
                    else:
                        break
                short = min(len(n_a), len(n_b))
                long = max(len(n_a), len(n_b))
                if shared_words >= 2 and short / long >= 0.4:
                    variant_warnings.append({
                        "type": t,
                        "candidate_master": id_a if len(n_a) <= len(n_b) else id_b,
                        "candidate_variant": id_b if len(n_a) <= len(n_b) else id_a,
                        "names": [n_a, n_b],
                    })

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
    
    variant_block = ""
    if variant_warnings:
        lines = []
        for vw in variant_warnings:
            a, b = vw["names"]
            lines.append(f"  - `{a}` + `{b}` ({vw['type']})")
        variant_block = (
            "\n\n⚠️ **Possible variants flagged** — these look like sibling "
            "states of the same identity. Consider folding the second into "
            "the first via `create_variant(master_id=..., variant_name=..., "
            "variant_diff=...)` instead of two top-level assets:\n"
            + "\n".join(lines)
        )

    return {
        "status": "CONFIRMATION_REQUIRED",
        "summary": {
            "characters": {"masters": len(characters), "variants": all_variants},
            "locations": len(locations),
            "props": len(props),
            "frames": len(frames),
            "total_slots": total_slots,
            "variant_warnings": variant_warnings,
        },
        "message": f"""✅ **Asset extraction is ready to complete!**

📦 **Assets Summary:**
- **Characters:** {len(characters)} masters + {all_variants} variants
- **Locations:** {len(locations)}
- **Props:** {len(props)}
- **Frames:** {len(frames)}
- **Total Slots:** {total_slots}{variant_block}

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

