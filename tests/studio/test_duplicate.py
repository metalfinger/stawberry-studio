import pytest
from PIL import Image, ImageDraw

from backend.studio.evaluators.duplicate import COPY_PASTE_THRESHOLD, evaluate_duplicate, similarity
from backend.studio.models import FieldEdit, MediaReview, NodeCreate, NodePatch
from backend.studio.service import Studio
from backend.studio.store import Store


def approve(studio, media_id):
    studio.review_media(
        media_id,
        MediaReview(
            expected_revision=0,
            expected_context=studio.media(media_id)["review_context"],
            status="approved",
            user_decision="Offline fixture review",
        ),
    )


def picture(path, seed):
    image = Image.new("RGB", (96, 96), (30, 30, 30))
    draw = ImageDraw.Draw(image)
    draw.ellipse((10 + seed, 10, 50 + seed, 60), fill=(200, 200, 200))
    draw.rectangle((5, 70 + seed % 7, 90, 90), fill=(90 + seed, 60, 40))
    image.save(path)
    return path


def patch(studio, node, **changes):
    studio.patch_node(
        node["id"],
        NodePatch(
            expected_revision=studio.inspect(node["id"])["node"]["revision"],
            reason="Fixture",
            changes={k: v if isinstance(v, FieldEdit) else FieldEdit(value=v) for k, v in changes.items()},
        ),
    )


@pytest.fixture
def shot(tmp_path):
    studio = Studio(Store(tmp_path / "workspace"))
    project = studio.create_node(NodeCreate(kind="project", name="Duplicates"))
    patch(studio, project, style="Ink wash")
    scene = studio.create_node(NodeCreate(kind="scene", name="S", parent_id=project["id"]))
    patch(studio, scene, visible_cast=[], required_props=[], location_id=FieldEdit(op="clear"))
    shot = studio.create_node(NodeCreate(kind="shot", name="Shot", parent_id=scene["id"]))
    cuts = [
        studio.create_node(NodeCreate(kind="cut", name=f"Cut {i}", parent_id=shot["id"], notes="Empty platform"))
        for i in range(3)
    ]
    return studio, cuts, tmp_path


def select(studio, cut, path):
    media = studio.import_media(cut["id"], path, cut["name"])
    approve(studio, media["id"])
    studio.select(cut["id"], media["id"], studio.inspect(cut["id"])["node"]["revision"])
    return media


def test_identical_sibling_is_flagged_and_a_different_one_is_not(shot):
    studio, cuts, tmp = shot
    same = picture(tmp / "a.png", 0)
    first = select(studio, cuts[0], same)
    second = select(studio, cuts[1], picture(tmp / "b.png", 0))  # pixel-identical content, new file
    third = select(studio, cuts[2], picture(tmp / "c.png", 37))
    record = evaluate_duplicate(studio, first["id"])
    assert record["kind"] == "duplicate" and record["evaluator"] == "local:duplicate"
    by_name = {m["name"]: m["similarity"] for m in record["matches"]}
    assert by_name["Cut 1"] == 1.0
    assert by_name["Cut 2"] < COPY_PASTE_THRESHOLD
    assert record["scores"]["max_similarity"] == 1.0
    assert [d["tag"] for d in record["discrepancies"]] == ["copy_paste"]
    assert "Cut 1" in record["discrepancies"][0]["note"]
    assert studio.media(first["id"])["media"]["evaluations"]["duplicate"]["scores"]["distinct"] == 0.0
    distinct = evaluate_duplicate(studio, third["id"])
    assert distinct["discrepancies"] == []
    assert second["id"] in {m["media_id"] for m in distinct["matches"]}


def test_similarity_is_symmetric_and_bounded():
    assert similarity((0, 0), (0, 0)) == 1.0
    assert similarity((0, 0), ((1 << 64) - 1, (1 << 64) - 1)) == 0.0
    assert similarity((5, 9), (9, 5)) == similarity((9, 5), (5, 9))


def test_review_stays_untouched(shot):
    studio, cuts, tmp = shot
    media = select(studio, cuts[0], picture(tmp / "a.png", 3))
    evaluate_duplicate(studio, media["id"])
    review = studio.media(media["id"])["media"]["review"]
    assert review["status"] == "approved" and review["revision"] == 1
