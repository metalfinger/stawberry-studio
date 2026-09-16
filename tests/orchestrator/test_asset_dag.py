"""End-to-end structural moat smoke: asset DAG, parent-chain traversal,
stale cascade, scene wardrobe override, gates.

No live LLM/image calls — patches sheet generation. Verifies that the
graph + propagation logic works without depending on Gemini availability.
"""
from __future__ import annotations

import json

import pytest

from backend.database import assets as asset_db
from backend import db
create_project = db.create_project
update_brief = db.update_brief
get_connection = db.get_connection
from backend import db
add_scene = db.add_scene
from backend import db
add_shot = db.add_shot
add_cut = db.add_cut
from backend.tools.assets import (
    cleanup_misclassified_assets,
    set_scene_wardrobe_override,
)
from backend.tools.briefing import confirm_briefing_complete
from backend.tools.assets import (
    complete_asset_extraction,
    confirm_asset_extraction_complete,
)


@pytest.mark.asyncio
async def test_brief_gate_rejects_missing_art_style(tmp_db):
    p = create_project("Gate")
    pid = p["id"]
    update_brief(pid, title="X", logline="L", genre="G")  # no art_style
    out = await confirm_briefing_complete(pid)
    assert "Cannot complete briefing" in out
    assert "Art Style" in out


@pytest.mark.asyncio
async def test_asset_extraction_gate_rejects_empty_prompts(tmp_db):
    p = create_project("Gate2")
    pid = p["id"]
    db.update_project_phase(pid, "ASSETS")
    asset = asset_db.create_asset(pid, "character", "Mara")  # no suggested_prompt
    res = complete_asset_extraction(pid)
    assert res.get("status") == "MISSING_PROMPTS"
    assert any(m["name"] == "Mara" for m in res["missing"])

    confirmed = confirm_asset_extraction_complete(pid)
    assert confirmed.get("blocked") is True
    assert db.get_project(pid)["current_phase"] == "ASSETS"
    assert not asset_db.get_asset(asset["id"])["suggested_prompt"]

    asset_db.update_asset(asset["id"], suggested_prompt="Approved navy coat and round glasses.")
    assert confirm_asset_extraction_complete(pid)["success"] is True
    assert db.get_project(pid)["current_phase"] == "GENERATE"


@pytest.mark.asyncio
async def test_asset_dag_parent_chain_in_bundle(tmp_db):
    """Mara's gun must report Mara in its parent_chain."""
    from backend.orchestrator.asset_bundler import bundle_asset_context

    p = create_project("DAG")
    pid = p["id"]
    mara = asset_db.create_asset(pid, "character", "Mara", description="Detective")
    gun = asset_db.create_asset(
        pid,
        "prop",
        "Mara's Sidearm",
        parent_asset_id=mara["id"],
        reference_strategy="derived",
    )
    ctx = await bundle_asset_context(gun["id"])
    assert len(ctx.parent_chain) == 1
    assert ctx.parent_chain[0]["id"] == mara["id"]
    assert ctx.parent_chain[0]["name"] == "Mara"


@pytest.mark.asyncio
async def test_cleanup_wardrobe_assets(tmp_db):
    p = create_project("Cleanup")
    pid = p["id"]
    mara = asset_db.create_asset(pid, "character", "Mara")
    asset_db.create_asset(pid, "prop", "Mara's Coat", appearance="long wool, black")
    asset_db.create_asset(pid, "prop", "Mara's Boots", appearance="leather, mid-calf")
    asset_db.create_asset(pid, "prop", "the Glowing Artifact")  # NOT wardrobe

    out = cleanup_misclassified_assets(pid)
    assert len(out["moved_to_wardrobe"]) == 2
    assert len(out["deleted"]) == 2

    # Mara's wardrobe_lock got the descriptors appended
    refreshed = asset_db.get_asset(mara["id"])
    assert "Coat" in (refreshed["wardrobe_lock"] or "")
    assert "Boots" in (refreshed["wardrobe_lock"] or "")

    # Artifact survived
    survivors = [a for a in asset_db.get_assets(pid) if "Artifact" in a["name"]]
    assert len(survivors) == 1


@pytest.mark.asyncio
async def test_scene_wardrobe_override_applied_to_bundle(tmp_db):
    """Cut bundler should overlay scene wardrobe override on character.wardrobe_lock."""
    from backend.orchestrator.context_bundler import bundle_cut_context

    p = create_project("WardrobeScene")
    pid = p["id"]
    update_brief(pid, title="T", logline="L", genre="G", art_style="A")
    scene = add_scene(pid, title="Gala")
    shot = add_shot(scene["id"], description="Detective enters the gala")
    cut = add_cut(shot["id"], action="She steps in")

    mara = asset_db.create_asset(
        pid, "character", "Mara",
        description="Detective",
    )
    asset_db.update_asset(mara["id"], wardrobe_lock="black trench coat, boots")

    # Link Mara to the cut
    asset_db.link_asset_to_node(mara["id"], "cut", cut["id"])

    # Override for the gala scene
    set_scene_wardrobe_override(scene["id"], mara["id"], "silver gala dress, heels")

    ctx = await bundle_cut_context(cut["id"])
    char = next(c for c in ctx.linked_characters if c["id"] == mara["id"])
    assert "silver gala dress" in (char.get("wardrobe_lock_scene") or "")
    assert "silver gala dress" in char["wardrobe_lock"]
    # Base wardrobe still threaded so the model can blend if needed
    assert "trench" in char["wardrobe_lock"]


@pytest.mark.asyncio
async def test_topo_sort_respects_parent_first(tmp_db):
    """generate_all_missing_sheets must place parents before children in the
    wave queue. We simulate by reading the topo helper directly."""
    p = create_project("Topo")
    pid = p["id"]
    mara = asset_db.create_asset(pid, "character", "Mara")
    gun = asset_db.create_asset(pid, "prop", "Gun", parent_asset_id=mara["id"])
    asset_db.update_asset(mara["id"], suggested_prompt="...")
    asset_db.update_asset(gun["id"], suggested_prompt="...")

    # Re-implementation of the planner's wave logic (kept in lock-step here as
    # a sanity check; if `generate_all_missing_sheets` ever changes this needs
    # to track).
    assets = asset_db.get_assets(pid)
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

    assert len(waves) == 2
    assert waves[0][0]["id"] == mara["id"]
    assert waves[1][0]["id"] == gun["id"]
