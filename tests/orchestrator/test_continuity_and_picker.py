"""Phase 4.5 — continuity bible + reference pool + picker."""
import pytest

from backend import db
from backend.orchestrator.continuity import compile_continuity_bible, render_bible_prefix
from backend.orchestrator.picker import rank_labels_for_cut
from backend.orchestrator.references import register_image, search


@pytest.mark.asyncio
async def test_compile_continuity_bible_empty(tmp_db):
    proj = db.create_project("p")
    bible = await compile_continuity_bible(proj["id"])
    assert bible["version"] == 1
    assert bible["characters"] == []
    assert bible["locations"] == []
    prefix = render_bible_prefix(bible)
    assert "CONTINUITY BIBLE" in prefix


@pytest.mark.asyncio
async def test_register_and_search_reference(tmp_db):
    proj = db.create_project("p")
    pid = proj["id"]
    rid = await register_image(
        pid,
        "/storage/generated/x.png",
        source_type="cut",
        character_ids=["asset_abc"],
        aspect_ratio="16:9",
        lighting_signature="golden_hour:warm",
    )
    assert rid.startswith("ref_")
    found = await search(pid)
    assert len(found) == 1
    assert found[0]["id"] == rid
    assert found[0]["character_ids"] == ["asset_abc"]


def test_picker_ranks_identity_first():
    """Default ranking always includes 'identity' for any character cut."""
    asset = {"id": "a1", "type": "character", "name": "Mara"}
    cut = {"action": "Mara stands by the door"}
    labels = rank_labels_for_cut(cut, asset, top_n=2)
    assert "identity" in labels
