from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend import db

router = APIRouter(prefix="/api/projects/{project_id}", tags=["assets"])


@router.get("/assets/{asset_id}")
async def get_asset(project_id: str, asset_id: str):
    """Return the asset row + its identity reference summary so the
    ContextPanel can show name / type / suggested_prompt for editing."""
    from backend.database import assets as assets_db
    asset = assets_db.get_asset(asset_id) if hasattr(assets_db, "get_asset") else None
    if not asset:
        # Fall back to direct query
        get_async_connection = db.get_async_connection
        async with get_async_connection() as conn:
            async with conn.execute(
                "SELECT * FROM assets WHERE id = ? AND project_id = ?",
                (asset_id, project_id),
            ) as cur:
                row = await cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Asset not found")
        asset = dict(row)
    return {
        "id": asset["id"],
        "name": asset.get("name"),
        "type": asset.get("type"),
        "description": asset.get("description"),
        "suggested_prompt": asset.get("suggested_prompt"),
        "appearance": asset.get("appearance"),
        "distinctive_features": asset.get("distinctive_features"),
        "wardrobe_lock": asset.get("wardrobe_lock"),
        "image_url": asset.get("image_url"),
        "parent_asset_id": asset.get("parent_asset_id"),
    }


@router.get("/assets/{asset_id}/references")
async def list_asset_references(
    project_id: str, asset_id: str, include_history: bool = False
):
    """Every reference for this asset, identity first.

    When `include_history=True`, superseded identities (is_active=0,
    label='identity') are returned too — the ContextPanel uses this to
    render a small "previous versions" gallery."""
    from backend.orchestrator import references
    refs = await references.list_references(asset_id)
    if not include_history:
        refs = [r for r in refs if r.get("is_active", True) or r.get("label") != "identity"]
    return {"references": refs}


class PromptUpdate(BaseModel):
    prompt: str


@router.put("/assets/{asset_id}/prompt")
async def update_asset_prompt_route(project_id: str, asset_id: str, body: PromptUpdate):
    """Direct REST patch for the ContextPanel's Save action — bypasses the
    chat WS so the UI doesn't have to wait on a narrator round-trip just to
    persist a prompt edit. Re-runs trait extraction so appearance /
    distinctive_features / wardrobe_lock stay in sync."""
    get_async_connection = db.get_async_connection
    from backend.orchestrator.identity_traits import extract_identity_traits

    new_prompt = (body.prompt or "").strip()
    if not new_prompt:
        raise HTTPException(status_code=400, detail="Prompt is empty")

    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT type, name FROM assets WHERE id = ? AND project_id = ?",
            (asset_id, project_id),
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Asset not found")
        asset_type = row["type"] or "character"
        asset_name = row["name"] or ""
        await conn.execute(
            "UPDATE assets SET suggested_prompt = ? WHERE id = ? AND project_id = ?",
            (new_prompt, asset_id, project_id),
        )
        await conn.commit()

    traits = await extract_identity_traits(new_prompt, asset_type=asset_type, asset_name=asset_name)
    if any(traits.values()):
        async with get_async_connection() as conn:
            await conn.execute(
                "UPDATE assets SET appearance = ?, distinctive_features = ?, "
                "wardrobe_lock = ?, consistency_tokens = ? "
                "WHERE id = ? AND project_id = ?",
                (
                    traits.get("appearance") or "",
                    traits.get("distinctive_features") or "",
                    traits.get("wardrobe_lock") or "",
                    traits.get("consistency_tokens") or "",
                    asset_id,
                    project_id,
                ),
            )
            await conn.commit()
    return {"ok": True, "asset_id": asset_id, "traits": traits}


@router.post("/assets/{asset_id}/references/identity")
async def generate_asset_identity_route(project_id: str, asset_id: str):
    """Generate (or return existing) identity card for the asset."""
    from backend.orchestrator import references
    try:
        ref = await references.generate_identity_card(asset_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ref


@router.post("/assets/{asset_id}/references/identity/regenerate")
async def regenerate_asset_identity_route(project_id: str, asset_id: str):
    """Mark the prior identity reference as superseded and mint a fresh one
    from the current `suggested_prompt`. Used by the ContextPanel /
    AssetMasterNode regen buttons. Direct REST so the chat console stays out
    of the per-asset busy state — the frontend can show a card-level spinner
    and a toast, no confusing chat dialogue."""
    get_async_connection = db.get_async_connection
    from backend.orchestrator import references

    # Find existing identity, if any. DO NOT supersede yet — only after the
    # new card lands successfully. Earlier code marked old inactive first,
    # so a failed regen left the asset with NO identity card at all.
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT id FROM reference_pool WHERE asset_id = ? "
            "AND label = 'identity' AND COALESCE(is_active, 1) = 1",
            (asset_id,),
        ) as cur:
            old = await cur.fetchone()

    # `generate_identity_card` short-circuits if any active identity exists,
    # so go through `_generate_one` directly to force a fresh render.
    try:
        asset, brief = await references._load_asset_and_brief(asset_id)
        new_ref = await references._generate_one(
            asset=asset, brief=brief, label="identity",
            parent_reference_id=None, story_context=None,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        # Don't touch the old card — it's still the only identity the asset has.
        raise HTTPException(status_code=502, detail=f"Identity regen failed: {e}") from e

    if old and new_ref.get("id"):
        async with get_async_connection() as conn:
            await conn.execute(
                "UPDATE reference_pool SET is_active = 0, superseded_by_id = ? "
                "WHERE id = ?",
                (new_ref["id"], old["id"]),
            )
            await conn.commit()

    # Notify any WS listeners so the canvas / context panel refresh.
    try:
        from backend.orchestrator.bus import bus
        await bus.publish(project_id, {"type": "asset_updated", "asset_id": asset_id})
    except Exception:
        pass
    return new_ref


@router.post("/assets/{asset_id}/references/precache")
async def precache_asset_turnaround(project_id: str, asset_id: str):
    """Generate the standard turnaround set for the asset (identity + a few
    canonical poses, in parallel)."""
    from backend.orchestrator import references
    try:
        refs = await references.precache_standard_turnaround(asset_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"references": refs}


# /sheet routes were removed when the references-first model landed —
# /assets/{id}/references endpoints above replace them.
# /assets/swap-input was removed too — frontend swapCutAssetLink had
# zero consumers; cut-asset reassignment now goes through chat
# ("Pixel, swap X for Y in cut C") which uses the existing tool path.
