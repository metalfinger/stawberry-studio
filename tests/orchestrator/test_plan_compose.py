"""Phase A — plan-driven compose tests.

Covers: plan generation, plan persistence, item approval, execution,
feedback chain refinement, version supersedence."""
import pytest

from backend.database import assets as asset_db
from backend import db
create_project = db.create_project
update_brief = db.update_brief
from backend import db
add_scene = db.add_scene
from backend import db
add_shot = db.add_shot
add_cut = db.add_cut
from backend.orchestrator import references
from backend.orchestrator.cut_planner import plan_compose_cut
from backend.orchestrator.cut_executor import execute_plan
from backend.orchestrator.plans import (
    fork_plan_for_refinement,
    load_plan,
    save_plan,
    update_plan_status,
)


def _patch_provider(monkeypatch, fake_image):
    from backend.providers.registry import get_registry
    reg = get_registry()
    monkeypatch.setattr(reg, "image_for_role", lambda role: (fake_image, "test-model"))


async def _make_minimal_project(name: str):
    p = create_project(name)
    update_brief(p["id"], title="T", logline="L", genre="G", art_style="A")
    scene = add_scene(p["id"], title="S")
    shot = add_shot(scene["id"], description="d")
    cut = add_cut(shot["id"], action="Mara stands focused")
    char = asset_db.create_asset(
        p["id"], "character", "Mara", description="detective",
    )
    asset_db.update_asset(char["id"], suggested_prompt="...")
    asset_db.link_asset_to_node(char["id"], "cut", cut["id"])
    return p, scene, shot, cut, char


@pytest.mark.asyncio
async def test_plan_proposes_items_for_linked_assets(tmp_db, monkeypatch, fake_image):
    _patch_provider(monkeypatch, fake_image)
    _, _, _, cut, char = await _make_minimal_project("PlanTest")

    plan = await plan_compose_cut(cut["id"])
    assert plan.cut_id == cut["id"]
    # At minimum: identity for Mara (generate or reuse), then render + register.
    kinds = [i.kind for i in plan.items]
    assert "render" in kinds
    assert "register" in kinds
    # Mara's identity item exists (generate since fresh project)
    assert any(i.kind in ("reference_generate", "reference_reuse") and "Mara" in i.description for i in plan.items)


@pytest.mark.asyncio
async def test_cached_items_auto_approved_new_gens_not(tmp_db, monkeypatch, fake_image):
    _patch_provider(monkeypatch, fake_image)
    _, _, _, cut, char = await _make_minimal_project("ApproveTest")

    # Pre-generate Mara's identity so it's cached.
    await references.generate_identity_card(char["id"])

    plan = await plan_compose_cut(cut["id"])
    for item in plan.items:
        if item.cached:
            assert item.approved, f"cached item {item.id} should auto-approve"
        elif item.kind in ("reference_generate", "render"):
            assert not item.approved, f"new gen item {item.id} should require approval"


@pytest.mark.asyncio
async def test_execute_plan_renders_cut_and_saves_version(tmp_db, monkeypatch, fake_image):
    _patch_provider(monkeypatch, fake_image)
    _, _, _, cut, char = await _make_minimal_project("ExecTest")

    plan = await plan_compose_cut(cut["id"])
    # Auto-approve everything for the test.
    for item in plan.items:
        item.approved = True
    await save_plan(plan)
    await update_plan_status(plan.id, "approved")

    result = await execute_plan(plan.id)
    assert result.error is None
    assert result.image_url, "render should have produced an image"
    assert result.reference_id, "register step should have created a render_v1 reference"

    # Verify the cut row was updated.
    get_connection = db.get_connection
    cut_row = get_connection().execute(
        "SELECT generated_image_url, generation_status FROM cuts WHERE id = ?", (cut["id"],)
    ).fetchone()
    assert cut_row["generated_image_url"] == result.image_url
    assert cut_row["generation_status"] == "complete"


@pytest.mark.asyncio
async def test_feedback_round_supersedes_prior(tmp_db, monkeypatch, fake_image):
    _patch_provider(monkeypatch, fake_image)
    _, _, _, cut, char = await _make_minimal_project("FeedbackTest")

    # Round 1
    plan1 = await plan_compose_cut(cut["id"])
    for item in plan1.items:
        item.approved = True
    await save_plan(plan1)
    await update_plan_status(plan1.id, "approved")
    r1 = await execute_plan(plan1.id)
    assert r1.image_url

    # Round 2 with feedback
    plan1_loaded = await load_plan(plan1.id)
    plan2 = await plan_compose_cut(
        cut["id"], feedback="more rim light", parent_plan=plan1_loaded,
    )
    assert plan2.feedback == ["more rim light"]
    assert plan2.parent_plan_id == plan1.id
    assert plan2.feedback_round == 1
    for item in plan2.items:
        item.approved = True
    await save_plan(plan2)
    await update_plan_status(plan2.id, "approved")
    r2 = await execute_plan(plan2.id)
    assert r2.image_url

    # Verify v1 superseded by v2 in reference_pool
    get_connection = db.get_connection
    rows = get_connection().execute(
        "SELECT id, label, is_active, superseded_by_id FROM reference_pool WHERE source_cut_id = ? ORDER BY created_at",
        (cut["id"],),
    ).fetchall()
    labels = [(r["label"], r["is_active"], r["superseded_by_id"]) for r in rows]
    # Two render versions exist
    render_versions = [r for r in labels if r[0] and r[0].startswith("render_v")]
    assert len(render_versions) == 2
    # v1 is superseded (is_active=0 and superseded_by_id set)
    v1 = [r for r in render_versions if r[0] == "render_v1"][0]
    assert v1[1] == 0
    assert v1[2] is not None
    # v2 is active
    v2 = [r for r in render_versions if r[0] == "render_v2"][0]
    assert v2[1] == 1


@pytest.mark.asyncio
async def test_fork_plan_carries_cumulative_feedback(tmp_db, monkeypatch, fake_image):
    _patch_provider(monkeypatch, fake_image)
    _, _, _, cut, char = await _make_minimal_project("ForkTest")

    plan1 = await plan_compose_cut(cut["id"])
    plan2 = await plan_compose_cut(cut["id"], feedback="round 2", parent_plan=plan1)
    plan3 = await plan_compose_cut(cut["id"], feedback="round 3", parent_plan=plan2)

    assert plan3.feedback_round == 2
    assert plan3.feedback == ["round 2", "round 3"]
    assert plan3.parent_plan_id == plan2.id


@pytest.mark.asyncio
async def test_plan_emits_preprod_fill_for_asset_without_identity(
    tmp_db, monkeypatch, fake_image,
):
    """C3 / P3 — when a linked asset has no active identity reference,
    the planner must emit a PREPROD_FILL plan item so Iris generates one
    before the render. Without this, cuts render with missing @ImageN
    slots and the model invents the asset from text."""
    from backend.orchestrator.plans import ITEM_KIND_PREPROD_FILL

    _patch_provider(monkeypatch, fake_image)
    p, scene, shot, cut, char = await _make_minimal_project("PreprodFill")
    # IMPORTANT: do NOT call generate_identity_card on the asset.
    # The planner should detect the missing identity and emit PREPROD_FILL.

    plan = await plan_compose_cut(cut["id"])
    preprod_items = [i for i in plan.items if i.kind == ITEM_KIND_PREPROD_FILL]
    assert len(preprod_items) == 1, "expected exactly one PREPROD_FILL item"
    assert preprod_items[0].payload["asset_id"] == char["id"]
    assert preprod_items[0].payload["asset_type"] == "character"


@pytest.mark.asyncio
async def test_plan_skips_preprod_fill_when_identity_exists(
    tmp_db, monkeypatch, fake_image,
):
    """Inverse of the above — once an identity reference exists for a
    linked asset, the planner uses REFERENCE_REUSE, not PREPROD_FILL."""
    from backend.orchestrator.plans import ITEM_KIND_PREPROD_FILL

    _patch_provider(monkeypatch, fake_image)
    p, scene, shot, cut, char = await _make_minimal_project("PreprodSkip")
    # Pre-generate identity so the gap doesn't exist.
    await references.generate_identity_card(char["id"])

    plan = await plan_compose_cut(cut["id"])
    preprod_items = [i for i in plan.items if i.kind == ITEM_KIND_PREPROD_FILL]
    assert preprod_items == [], "should not emit PREPROD_FILL when identity exists"
