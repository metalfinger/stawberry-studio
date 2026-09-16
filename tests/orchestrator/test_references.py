"""Unit tests for references — identity card, pose generation, get_or_generate,
parent-asset reference threading, precache turnaround."""
import pytest

from backend.database import assets as asset_db
from backend import db
create_project = db.create_project
update_brief = db.update_brief
from backend.orchestrator import references


def _patch_provider(monkeypatch, fake_image):
    """Wire the fake image provider into the registry for the test."""
    from backend.providers.registry import get_registry
    reg = get_registry()
    monkeypatch.setattr(reg, "image_for_role", lambda role: (fake_image, "test-model"))


@pytest.mark.asyncio
async def test_generate_identity_card_creates_reference(tmp_db, monkeypatch, fake_image):
    _patch_provider(monkeypatch, fake_image)
    p = create_project("RefV2")
    update_brief(p["id"], title="T", logline="L", genre="G", art_style="A")
    mara = asset_db.create_asset(
        p["id"], "character", "Mara",
        description="detective", appearance="emerald eyes",
    )
    asset_db.update_asset(mara["id"], suggested_prompt="cinematic anime, mara, emerald eyes")

    ref = await references.generate_identity_card(mara["id"])
    assert ref["label"] == "identity"
    assert ref["asset_id"] == mara["id"]
    assert ref["image_url"].startswith("/storage/generated/fake_")

    # Idempotent — second call returns existing.
    ref2 = await references.generate_identity_card(mara["id"])
    assert ref2["id"] == ref["id"]
    assert len(fake_image.calls) == 1


@pytest.mark.asyncio
async def test_generate_pose_threads_identity_as_reference(tmp_db, monkeypatch, fake_image):
    _patch_provider(monkeypatch, fake_image)
    p = create_project("RefV2Pose")
    update_brief(p["id"], title="T", logline="L", genre="G", art_style="A")
    mara = asset_db.create_asset(p["id"], "character", "Mara")
    asset_db.update_asset(mara["id"], suggested_prompt="...")

    pose = await references.generate_pose(mara["id"], "side_right")
    assert pose["label"] == "side_right"
    assert pose["parent_reference_id"] is not None  # threaded from identity

    # Two API calls: one identity (auto-bootstrap), one pose.
    assert len(fake_image.calls) == 2
    pose_req = fake_image.calls[1]
    assert any(r.name == "identity" for r in pose_req.reference_images), \
        "pose generation should pass identity as reference image"


@pytest.mark.asyncio
async def test_get_or_generate_caches(tmp_db, monkeypatch, fake_image):
    _patch_provider(monkeypatch, fake_image)
    p = create_project("RefV2Cache")
    update_brief(p["id"], title="T", logline="L", genre="G", art_style="A")
    mara = asset_db.create_asset(p["id"], "character", "Mara")
    asset_db.update_asset(mara["id"], suggested_prompt="...")

    a = await references.get_or_generate(mara["id"], "side_right")
    b = await references.get_or_generate(mara["id"], "side_right")
    assert a["id"] == b["id"]
    # 2 calls total: identity + side_right. Cached on second invocation.
    assert len(fake_image.calls) == 2


@pytest.mark.asyncio
async def test_derived_asset_uses_parent_identity(tmp_db, monkeypatch, fake_image):
    _patch_provider(monkeypatch, fake_image)
    p = create_project("Derived")
    update_brief(p["id"], title="T", logline="L", genre="G", art_style="A")
    mara = asset_db.create_asset(p["id"], "character", "Mara")
    asset_db.update_asset(mara["id"], suggested_prompt="...")
    gun = asset_db.create_asset(
        p["id"], "prop", "Mara's Gun",
        parent_asset_id=mara["id"], reference_strategy="derived",
    )
    asset_db.update_asset(gun["id"], suggested_prompt="...")

    # Generate Mara's identity first so the gun's identity can use it.
    await references.generate_identity_card(mara["id"])
    gun_id = await references.generate_identity_card(gun["id"])

    # The gun's identity request should have included Mara's identity as ref slot 1.
    gun_req = fake_image.calls[-1]
    assert any(r.name == "parent_identity" for r in gun_req.reference_images)


@pytest.mark.asyncio
async def test_list_references_returns_identity_first(tmp_db, monkeypatch, fake_image):
    _patch_provider(monkeypatch, fake_image)
    p = create_project("List")
    update_brief(p["id"], title="T", logline="L", genre="G", art_style="A")
    mara = asset_db.create_asset(p["id"], "character", "Mara")
    asset_db.update_asset(mara["id"], suggested_prompt="...")

    await references.generate_pose(mara["id"], "side_right")
    refs = await references.list_references(mara["id"])
    assert len(refs) == 2
    assert refs[0]["label"] == "identity"  # identity ranked first


@pytest.mark.asyncio
async def test_precache_standard_turnaround_for_character(tmp_db, monkeypatch, fake_image):
    _patch_provider(monkeypatch, fake_image)
    p = create_project("Pre")
    update_brief(p["id"], title="T", logline="L", genre="G", art_style="A")
    mara = asset_db.create_asset(p["id"], "character", "Mara")
    asset_db.update_asset(mara["id"], suggested_prompt="...")

    # Conservative precache after C1 — just identity + one extra angle.
    # Per-cut variants get lazy-filled by the planner when needed.
    out = await references.precache_standard_turnaround(mara["id"])
    labels = sorted(r["label"] for r in out)
    assert labels == sorted(["identity", "three_quarter_right"])
