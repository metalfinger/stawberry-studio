"""Tests for picker — label ranking + reference resolution + lazy fill +
the auto-linker that decides which assets each scene/shot/cut needs."""
import pytest

from backend.database import assets as asset_db
from backend import db
create_project = db.create_project
update_brief = db.update_brief
from backend.orchestrator import picker
from backend.tools.assets import _match_asset_in_text


# ============================================================================
# Auto-linker partial-name fallback (C1 / I1)
# ============================================================================

def test_linker_matches_full_name():
    assert _match_asset_in_text("Mara", "Mara walks into the room")
    assert not _match_asset_in_text("Mara", "Maraaa walks")


def test_linker_matches_last_word_when_full_name_misses():
    """The Test1 bug: cuts say 'astronaut' but assets are named
    'The Astronaut Actor'. Full-name match fails — must fall back to last word."""
    assert _match_asset_in_text("The Astronaut Actor", "the astronaut steps onto the moon")
    assert _match_asset_in_text("The Director", "the director screams into a megaphone")


def test_linker_matches_content_words():
    """When name has multiple content words, any one should match."""
    assert _match_asset_in_text("Director's Megaphone", "screams into a megaphone")
    assert _match_asset_in_text("Lunar Lander Prop", "the lander touches down")


def test_linker_skips_stopwords():
    """Articles and 'set/shot/scene' qualifiers shouldn't trigger matches."""
    assert not _match_asset_in_text("The", "the the the")
    # "Fake Lunar Set" should match "lunar surface" via "lunar" content word,
    # but not via the stopword "set".
    assert _match_asset_in_text("Fake Lunar Set", "the lunar surface")
    assert not _match_asset_in_text("Set", "in the film set")


def test_linker_word_boundary_still_holds():
    assert _match_asset_in_text("Veer", "Veer kicks")
    assert not _match_asset_in_text("Veer", "Veeru runs")


def test_linker_handles_possessive_and_plural():
    assert _match_asset_in_text("Boot", "Boots")
    assert _match_asset_in_text("Mara", "Mara's locket")


# ============================================================================
# Existing label-ranking + reference-resolution tests below
# ============================================================================



def _patch_provider(monkeypatch, fake_image):
    from backend.providers.registry import get_registry
    reg = get_registry()
    monkeypatch.setattr(reg, "image_for_role", lambda role: (fake_image, "test-model"))


def test_rank_labels_picks_emotional_match():
    cut = {
        "action": "She runs through the rain, tears streaking down her face.",
        "expression": "sad",
        "body_language": "running",
    }
    asset = {"type": "character"}
    labels = picker.rank_labels_for_cut(cut, asset, top_n=3)
    assert "running" in labels
    assert "expression_sad" in labels


def test_rank_labels_for_prop_matches_state():
    cut = {"action": "The artifact lights up, glowing brightly in the dark."}
    asset = {"type": "prop"}
    labels = picker.rank_labels_for_cut(cut, asset, top_n=2)
    assert "state_glowing" in labels


def test_rank_labels_falls_back_to_identity_when_no_match():
    cut = {"action": "Empty action."}
    asset = {"type": "character"}
    labels = picker.rank_labels_for_cut(cut, asset, top_n=2)
    assert labels == ["identity"]


@pytest.mark.asyncio
async def test_resolve_references_lazy_fills_missing(tmp_db, monkeypatch, fake_image):
    _patch_provider(monkeypatch, fake_image)
    p = create_project("Resolve")
    update_brief(p["id"], title="T", logline="L", genre="G", art_style="A")
    mara = asset_db.create_asset(p["id"], "character", "Mara")
    asset_db.update_asset(mara["id"], suggested_prompt="...")

    cut = {
        "action": "Mara sprints down the alley, focused intense expression.",
        "expression": "focused",
        "body_language": "running",
    }
    refs = await picker.resolve_references([mara], cut, max_per_asset=2)
    labels = sorted(r["label"] for r in refs)
    # Should include identity + at least one ranked match (running or focused).
    assert "identity" in labels
    assert any(l in labels for l in ("running", "expression_focused"))


@pytest.mark.asyncio
async def test_resolve_references_no_lazy_uses_identity_fallback(tmp_db, monkeypatch, fake_image):
    _patch_provider(monkeypatch, fake_image)
    p = create_project("ResolveNoLazy")
    update_brief(p["id"], title="T", logline="L", genre="G", art_style="A")
    mara = asset_db.create_asset(p["id"], "character", "Mara")
    asset_db.update_asset(mara["id"], suggested_prompt="...")

    # Pre-generate identity only.
    from backend.orchestrator import references
    await references.generate_identity_card(mara["id"])
    calls_before = len(fake_image.calls)

    cut = {"action": "Mara sprints, focused intense expression.", "expression": "focused"}
    refs = await picker.resolve_references([mara], cut, allow_lazy=False)
    # No new generations.
    assert len(fake_image.calls) == calls_before
    # Identity used as fallback.
    assert any(r["label"] == "identity" for r in refs)


# ============================================================================
# Reference budget cap (Nano Banana Pro limit) — _prioritize_refs
# ============================================================================

def _make_ref(name: str):
    """Lightweight stand-in for the provider's ReferenceImage type."""
    class _R:
        pass
    r = _R()
    r.name = name
    r.slot = 0
    r.image_url = f"/{name}.png"
    return r


def test_prioritize_refs_keeps_anchor_and_identity_first():
    """When over budget, anchor + char identities + prev_cut survive;
    prop turnarounds and side angles get dropped first."""
    from backend.orchestrator.cut_executor import _prioritize_refs

    refs = [
        _make_ref("prop_megaphone"),       # priority 5 — drop first
        _make_ref("identity_astronaut"),   # priority 1
        _make_ref("style_anchor"),         # priority 0
        _make_ref("hero_pose"),            # priority 3
        _make_ref("plate"),                # priority 4
        _make_ref("identity_director"),    # priority 1
        _make_ref("prop_chair"),           # priority 5 — drop
    ]
    out = _prioritize_refs(refs, ctx=None, max_refs=4)
    names = [r.name for r in out]
    # Anchor MUST be first. Two character identities MUST survive.
    assert names[0] == "style_anchor"
    assert "identity_astronaut" in names
    assert "identity_director" in names
    # The 4th slot is whichever priority-3 ref was first (hero_pose here).
    assert "hero_pose" in names
    # Plate (priority 4) and props (priority 5) got dropped.
    assert "plate" not in names
    assert all(not n.startswith("prop_") for n in names)


def test_prioritize_refs_under_budget_just_reorders():
    """When refs fit under the cap, no truncation — just sort by priority."""
    from backend.orchestrator.cut_executor import _prioritize_refs

    refs = [
        _make_ref("prop_megaphone"),
        _make_ref("style_anchor"),
        _make_ref("identity_astronaut"),
    ]
    out = _prioritize_refs(refs, ctx=None, max_refs=4)
    assert len(out) == 3
    assert out[0].name == "style_anchor"
    assert out[1].name == "identity_astronaut"
    assert out[2].name == "prop_megaphone"
    # Slot numbers re-assigned 1..N
    assert [r.slot for r in out] == [1, 2, 3]
