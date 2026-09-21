import pytest
from PIL import Image

from backend.studio.models import Approval, FieldEdit, MediaReview, NodeCreate, NodePatch, RecipeCreate, Reference
from backend.studio.service import Studio
from backend.studio.store import Store
from backend.studio.tools import invoke
from backend.studio.worker import Worker


@pytest.fixture
def studio(tmp_path):
    return Studio(Store(tmp_path / "workspace"))


def approve_take(studio, media_id):
    studio.review_media(
        media_id,
        MediaReview(
            expected_revision=0,
            expected_context=studio.media(media_id)["review_context"],
            status="approved",
            user_decision="Offline fixture review",
        ),
    )


def generate(studio, node, references, clock):
    """Prepare → approve → enqueue → drive the fake provider to a collected take. Returns (recipe, media)."""
    recipe = studio.prepare(
        RecipeCreate(
            node_id=node["id"],
            provider="fake",
            model="fixture",
            prompt="Offline chain frame",
            intent="Test",
            references=references,
        )
    )
    studio.approve(recipe["id"], Approval(fingerprint=recipe["fingerprint"], user_decision="Offline test"))
    job = studio.enqueue(recipe["id"])
    worker = Worker(studio, clock=lambda: clock[0])
    for _ in range(3):
        assert worker.tick()
        clock[0] += 10
    assert studio.job(job["id"])["state"] == "ready"
    media = next(m for m in studio.inspect(node["id"])["media"] if m["job_id"] == job["id"])
    approve_take(studio, media["id"])
    return recipe, media


def chain(media_id):
    return [Reference(media_id=media_id, role="composition", instruction="Continue from this frame")]


def test_depth_counts_generations_from_the_sheet(studio):
    node = studio.create_node(NodeCreate(kind="project", name="Chain"))
    clock = [10**12]
    first_recipe, first = generate(studio, node, [], clock)
    assert first["depth"] == 0
    assert first_recipe["warnings"] == []
    second_recipe, second = generate(studio, node, chain(first["id"]), clock)
    assert second["depth"] == 1
    assert second_recipe["warnings"] == []
    third_recipe, third = generate(studio, node, chain(second["id"]), clock)
    assert third["depth"] == 2
    assert third_recipe["warnings"] == []
    fourth_recipe, fourth = generate(studio, node, chain(third["id"]), clock)
    assert fourth["depth"] == 3
    warning = fourth_recipe["warnings"][0]
    assert warning["code"] == "reference_depth"
    assert (warning["reference_depth"], warning["output_depth"], warning["cap"]) == (2, 3, 2)
    assert "warnings" not in fourth_recipe["spec"] and "warnings" not in fourth_recipe["context"]
    assert studio.recipe(fourth_recipe["id"])["fresh"]

    tree = invoke(studio, "lineage", {"id": fourth["id"]})
    assert tree["depth"] == 3
    assert tree["references"][0]["role"] == "composition"
    assert tree["references"][0]["references"][0]["references"][0]["media_id"] == first["id"]
    assert tree["references"][0]["references"][0]["references"][0]["references"] == []


def test_imported_media_is_depth_zero_and_cap_is_a_project_policy(studio):
    node = studio.create_node(NodeCreate(kind="project", name="Imports"))
    path = studio.store.home / "sheet.png"
    Image.new("RGB", (16, 16), "green").save(path)
    studio.patch_node(
        node["id"],
        NodePatch(
            expected_revision=studio.inspect(node["id"])["node"]["revision"],
            reason="Strict policy for the test",
            changes={"policy.reference_depth_cap": FieldEdit(value=0)},
        ),
    )
    sheet = studio.import_media(node["id"], path, "Sheet")
    assert studio.inspect(node["id"])["media"][0]["depth"] == 0
    approve_take(studio, sheet["id"])
    clock = [10**12]
    _, take = generate(studio, node, chain(sheet["id"]), clock)
    assert take["depth"] == 1
    recipe = studio.prepare(
        RecipeCreate(
            node_id=node["id"], provider="fake", model="fixture", prompt="Deeper", intent="Test",
            references=chain(take["id"]),
        )
    )
    assert [w["code"] for w in recipe["warnings"]] == ["reference_depth"]
    assert recipe["warnings"][0]["cap"] == 0
