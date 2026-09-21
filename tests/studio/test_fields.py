from types import SimpleNamespace

import pytest
from PIL import Image

from backend.studio.fields import FIELD_SPECS
from backend.studio.models import FieldEdit, MediaReview, NodeCreate, NodePatch, RecipeCreate, Reference
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError


def change(studio, node, **fields):
    current = studio.inspect(node["id"])["node"]
    return studio.patch_node(
        node["id"],
        NodePatch(
            expected_revision=current["revision"],
            reason="Explicit test decision",
            changes={k: v if isinstance(v, FieldEdit) else FieldEdit(value=v) for k, v in fields.items()},
        ),
    )


def take(studio, node, path, subjects=None):
    media = studio.import_media(node["id"], path, node["name"], metadata={"fake": True})
    studio.review_media(
        media["id"],
        MediaReview(
            expected_revision=0,
            expected_context=studio.media(media["id"])["review_context"],
            status="approved",
            user_decision="Offline fixture review",
            depicted_assets=subjects or [],
        ),
    )
    studio.select(node["id"], media["id"], studio.inspect(node["id"])["node"]["revision"])
    return media


@pytest.fixture
def world(tmp_path):
    studio = Studio(Store(tmp_path / "workspace"))
    project = studio.create_node(NodeCreate(kind="project", name="Vocabulary", notes="Test production"))
    change(studio, project, style="Charcoal collage")
    mara = studio.create_node(NodeCreate(kind="character", name="Mara", parent_id=project["id"]))
    station = studio.create_node(NodeCreate(kind="location", name="Station", parent_id=project["id"]))
    path = tmp_path / "fixture.png"
    Image.new("RGB", (64, 64), "green").save(path)
    media = [take(studio, node, path) for node in (mara, station)]
    scene = studio.create_node(NodeCreate(kind="scene", name="Arrival", parent_id=project["id"]))
    change(studio, scene, visible_cast=[mara["id"]], location_id=station["id"], required_props=[])
    shot = studio.create_node(NodeCreate(kind="shot", name="Platform", parent_id=scene["id"]))
    cut = studio.create_node(NodeCreate(kind="cut", name="Beat 0", parent_id=shot["id"], notes="Mara waits"))
    return SimpleNamespace(
        studio=studio, project=project, mara=mara, station=station, scene=scene, shot=shot, cut=cut, media=media
    )


def codes(items):
    return {item["code"] for item in items}


def test_vocabulary_names_are_leaves_and_lower_case():
    for name in FIELD_SPECS:
        assert name == name.lower()
        for other in FIELD_SPECS:
            assert other == name or not other.startswith(name + "."), f"{name} prefixes {other}"


def test_palette_rejects_bad_hex(world):
    with pytest.raises(StudioError, match="RRGGBB"):
        change(world.studio, world.project, **{"bible.palette_hex": ["#GGG123"]})
    change(world.studio, world.project, **{"bible.palette_hex": ["#0a0e27", "#FF3366"]})
    assert world.studio.context(world.cut["id"])["values"]["bible.palette_hex"] == ["#0a0e27", "#FF3366"]


def test_tokens_must_be_short_distinct_locks(world):
    with pytest.raises(StudioError, match="longer than 6 words"):
        change(world.studio, world.mara, consistency_tokens=["a very long descriptive sentence about her"])
    with pytest.raises(StudioError, match="repeats the asset name"):
        change(world.studio, world.mara, consistency_tokens=["Mara"])
    with pytest.raises(StudioError, match="sheet-only"):
        change(world.studio, world.mara, consistency_tokens=["pure white background"])
    with pytest.raises(StudioError, match="duplicated"):
        change(world.studio, world.mara, consistency_tokens=["amber eyes", "Amber Eyes"])
    change(world.studio, world.mara, consistency_tokens=["amber eyes", "bone clasp", "scar on chin"])


def test_typed_scalars(world):
    with pytest.raises(StudioError, match="integer"):
        change(world.studio, world.project, **{"policy.reference_depth_cap": "2"})
    with pytest.raises(StudioError, match="true or false"):
        change(world.studio, world.project, **{"policy.require_evaluation_for_reference": "yes"})
    with pytest.raises(StudioError, match="one of"):
        change(world.studio, world.cut, chain_from_prev="maybe")
    with pytest.raises(StudioError, match="expected text"):
        change(world.studio, world.cut, **{"beat.purpose": ["not", "text"]})


def test_unknown_fields_remain_open(world):
    change(world.studio, world.cut, **{"anything.goes": {"nested": True}})
    assert world.studio.context(world.cut["id"])["values"]["anything.goes"] == {"nested": True}


def test_warnings_are_advisory_and_clear_when_declared(world):
    readiness = world.studio.readiness(world.cut["id"])
    assert readiness["ready"]
    assert codes(readiness["warnings"]) == {"beat_missing", "performance_missing", "sound_missing", "reference_unevaluated"}
    assert codes(world.studio.readiness(world.project["id"])["warnings"]) == {"bible_missing"}
    change(world.studio, world.scene, **{"sound.ambient": "platform hum, distant announcement"})
    change(
        world.studio,
        world.cut,
        **{"beat.purpose": "Mara realises the train will not stop", "performance.expression": "held breath"},
    )
    change(world.studio, world.project, **{"bible.tokens": ["torn matte paper", "graphite linework"]})
    assert codes(world.studio.readiness(world.cut["id"])["warnings"]) == {"reference_unevaluated"}
    assert world.studio.readiness(world.project["id"])["warnings"] == []
    assert codes(world.studio.inspect(world.cut["id"])["warnings"]) == {"reference_unevaluated"}
    assert "warnings" not in world.studio.context(world.cut["id"])


def test_explicit_silence_is_a_declaration(world):
    change(world.studio, world.cut, **{"sound.sfx": FieldEdit(op="clear"), "sound.music": FieldEdit(op="clear")})
    assert "sound_missing" not in codes(world.studio.readiness(world.cut["id"])["warnings"])


def test_workflow_and_project_readiness_carry_cut_warnings(world):
    workflow = world.studio.workflow(world.project["id"])
    assert "beat_missing" in codes(workflow["cuts"][0]["warnings"])
    project = world.studio.readiness(world.project["id"])
    assert "beat_missing" in codes(project["cuts"][0]["warnings"])


def test_field_write_stales_prepared_recipe_and_reviews(world):
    recipe = world.studio.prepare(
        RecipeCreate(
            node_id=world.cut["id"],
            provider="fake",
            model="test",
            intent="Offline frame",
            prompt="Mara waits on the platform",
            references=[
                Reference(media_id=world.media[0]["id"], role="identity", instruction="Keep Mara"),
                Reference(media_id=world.media[1]["id"], role="location", instruction="Keep the station"),
            ],
        )
    )
    change(world.studio, world.cut, **{"beat.purpose": "The wait becomes a decision"})
    assert world.studio.recipe(recipe["id"])["fresh"] is False
    # writing the bible on the project changes every definition: approved reviews go stale
    assert world.studio.media(world.media[0]["id"])["media"]["review"]["stale"] is False
    change(world.studio, world.project, **{"bible.tokens": ["torn matte paper"]})
    assert world.studio.media(world.media[0]["id"])["media"]["review"]["stale"] is True
