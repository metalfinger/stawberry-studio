from concurrent.futures import ThreadPoolExecutor

import pytest
from PIL import Image

from backend.studio.models import (
    Approval,
    FieldEdit,
    MediaReview,
    NodeCreate,
    NodePatch,
    RecipeCreate,
    Reference,
    SourceCreate,
)
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError


@pytest.fixture
def studio(tmp_path):
    return Studio(Store(tmp_path / "workspace"))


def tree(studio, *, ready=False):
    nodes = []
    for kind in ("project", "scene", "shot", "cut"):
        nodes.append(studio.create_node(NodeCreate(kind=kind, name=kind, parent_id=nodes[-1]["id"] if nodes else None)))
    if ready:
        nodes[-1] = studio.patch_node(
            nodes[-1]["id"],
            NodePatch(
                expected_revision=1,
                reason="Explicit empty frame for domain tests",
                notes="Empty establishing frame",
                changes={
                    "visible_cast": FieldEdit(value=[]),
                    "required_props": FieldEdit(value=[]),
                    "location_id": FieldEdit(op="clear"),
                    "style": FieldEdit(value="Test style"),
                },
            ),
        )
    return nodes


def patch(studio, node, **changes):
    return studio.patch_node(
        node["id"], NodePatch(expected_revision=node["revision"], reason="User decision", changes=changes)
    )


def asset(studio, project, tmp_path):
    char = studio.create_node(NodeCreate(kind="character", name="Mara", parent_id=project["id"]))
    image = tmp_path / "ref.png"
    Image.new("RGB", (32, 32), "red").save(image)
    media = studio.import_media(char["id"], image, "Identity")
    return studio.review_media(
        media["id"],
        MediaReview(
            expected_revision=0,
            expected_context=studio.media(media["id"])["review_context"],
            status="approved",
            user_decision="Offline test",
        ),
    )


def test_inheritance_clear_and_restore(studio):
    project, scene, shot, cut = tree(studio)
    character = studio.create_node(NodeCreate(kind="character", name="Mara", parent_id=project["id"]))
    patch(
        studio,
        project,
        **{
            "lighting.color": FieldEdit(value="warm"),
            "visible_cast": FieldEdit(value=[character["id"]]),
            "music": FieldEdit(value="piano"),
        },
    )
    scene = patch(studio, scene, **{"lighting.direction": FieldEdit(value="left")})
    cut = patch(
        studio,
        cut,
        **{
            "lighting.color": FieldEdit(value="cool"),
            "visible_cast": FieldEdit(value=[]),
            "music": FieldEdit(op="clear"),
        },
    )
    context = studio.context(cut["id"])
    assert context["values"] == {"lighting.color": "cool", "lighting.direction": "left", "visible_cast": []}
    assert context["cleared"] == ["music"]
    assert context["provenance"]["lighting.direction"]["node_id"] == scene["id"]
    patch(studio, cut, **{"lighting.color": FieldEdit(op="inherit")})
    assert studio.context(cut["id"])["values"]["lighting.color"] == "warm"


def test_collection_edits_do_not_affect_siblings(studio):
    project, scene, shot, cut = tree(studio)
    sibling = studio.create_node(NodeCreate(kind="cut", name="Insert", parent_id=shot["id"]))
    patch(studio, scene, props=FieldEdit(value=["cup", "ticket"]))
    patch(studio, cut, props=FieldEdit(op="remove", value=["cup"]))
    assert studio.context(cut["id"])["values"]["props"] == ["ticket"]
    assert studio.context(sibling["id"])["values"]["props"] == ["cup", "ticket"]


def test_invalid_collection_patch_rolls_back(studio):
    project, scene, shot, cut = tree(studio)
    patch(studio, project, mood=FieldEdit(value="tense"))
    with pytest.raises(StudioError, match="not a collection"):
        patch(studio, cut, mood=FieldEdit(op="add", value=["happy"]))
    assert studio.inspect(cut["id"])["node"]["revision"] == 1


def test_source_and_notes_are_lossless(studio):
    project, _, _, cut = tree(studio)
    original = "  User's detailed instruction\n" * 10000
    source = studio.capture(project["id"], SourceCreate(text=original))
    studio.patch_node(
        cut["id"], NodePatch(expected_revision=1, notes=original, source_id=source["id"], reason="Scoped instruction")
    )
    assert studio.inspect(project["id"])["sources"][0]["text"] == original
    assert studio.inspect(cut["id"])["node"]["notes"] == original
    resumed = Studio(Store(studio.store.home))
    assert resumed.inspect(cut["id"])["node"]["notes"] == original
    assert resumed.context(cut["id"])["sources"][0]["text"] == original


def test_stale_edits_rejected(studio):
    project = tree(studio)[0]
    patch(studio, project, era=FieldEdit(value="1980"))
    with pytest.raises(StudioError) as error:
        patch(studio, project, era=FieldEdit(value="1990"))
    assert error.value.code == "revision_conflict"


def test_parallel_ordering(studio):
    project = tree(studio)[0]

    def create(i):
        return studio.create_node(NodeCreate(kind="scene", name=str(i), parent_id=project["id"]))

    with ThreadPoolExecutor(max_workers=5) as pool:
        nodes = list(pool.map(create, range(15)))
    assert sorted(n["position"] for n in nodes) == list(range(2, 17))


def test_parent_types_and_cross_project_references(studio, tmp_path):
    project, scene, shot, cut = tree(studio)
    with pytest.raises(StudioError):
        studio.create_node(NodeCreate(kind="cut", name="Wrong", parent_id=scene["id"]))
    other = studio.create_node(NodeCreate(kind="project", name="Other"))
    media = asset(studio, other, tmp_path)
    with pytest.raises(StudioError) as error:
        studio.prepare(
            RecipeCreate(
                node_id=cut["id"],
                provider="fake",
                model="test",
                prompt="frame",
                intent="test",
                references=[Reference(media_id=media["id"], role="identity", instruction="keep face")],
            )
        )
    assert error.value.code == "reference_project"


def test_recipe_exact_order_and_duplicate_submit(studio, tmp_path):
    project, scene, shot, cut = tree(studio, ready=True)
    first = asset(studio, project, tmp_path)
    second = asset(studio, project, tmp_path)
    request = RecipeCreate(
        node_id=cut["id"],
        provider="fake",
        model="test",
        prompt="@Image1 pose, @Image2 identity",
        intent="Test",
        references=[
            Reference(media_id=second["id"], role="pose", instruction="pose only"),
            Reference(media_id=first["id"], role="identity", instruction="keep face"),
        ],
    )
    recipe = studio.prepare(request)
    assert [r["media_id"] for r in recipe["spec"]["references"]] == [second["id"], first["id"]]
    with pytest.raises(StudioError, match="Approve"):
        studio.enqueue(recipe["id"])
    studio.approve(recipe["id"], Approval(fingerprint=recipe["fingerprint"], user_decision="Approved this test"))
    first_job = studio.enqueue(recipe["id"])
    assert studio.enqueue(recipe["id"])["id"] == first_job["id"]


def test_parent_change_invalidates_approval_without_rewriting_recipe(studio):
    project, _, _, cut = tree(studio, ready=True)
    recipe = studio.prepare(
        RecipeCreate(node_id=cut["id"], provider="fake", model="test", prompt="frame", intent="test")
    )
    studio.approve(recipe["id"], Approval(fingerprint=recipe["fingerprint"], user_decision="Approved"))
    patch(studio, project, era=FieldEdit(value="Victorian"))
    with pytest.raises(StudioError, match="Context changed"):
        studio.enqueue(recipe["id"])
    assert studio.recipe(recipe["id"])["context"] == recipe["context"]


def test_nonexistent_prompt_reference_rejected(studio):
    cut = tree(studio)[-1]
    with pytest.raises(StudioError, match="not attached"):
        studio.prepare(RecipeCreate(node_id=cut["id"], provider="fake", model="test", prompt="@Image1", intent="test"))


def test_selection_retains_older_versions(studio, tmp_path):
    project = tree(studio)[0]
    first = asset(studio, project, tmp_path)
    second = studio.import_media(first["node_id"], tmp_path / "ref.png", "New attempt")
    studio.review_media(
        second["id"],
        MediaReview(
            expected_revision=0,
            expected_context=studio.media(second["id"])["review_context"],
            status="approved",
            user_decision="Offline test",
        ),
    )
    studio.select(first["node_id"], first["id"], 1)
    studio.select(first["node_id"], second["id"], 2)
    detail = studio.inspect(first["node_id"])
    assert len(detail["media"]) == 2
    assert detail["node"]["active_media_id"] == second["id"]


def test_new_raw_instruction_invalidates_approved_recipe(studio):
    project, _, _, cut = tree(studio, ready=True)
    recipe = studio.prepare(
        RecipeCreate(node_id=cut["id"], provider="fake", model="test", prompt="frame", intent="test")
    )
    studio.approve(recipe["id"], Approval(fingerprint=recipe["fingerprint"], user_decision="Approved"))
    studio.capture(project["id"], SourceCreate(text="Do not use the old red coat; use navy."))
    with pytest.raises(StudioError, match="Context changed"):
        studio.enqueue(recipe["id"])


def test_parent_cannot_invalidate_child_collection_contract(studio):
    project, _, _, cut = tree(studio)
    project = patch(studio, project, props=FieldEdit(value=["ticket"]))
    patch(studio, cut, props=FieldEdit(op="add", value=["clip"]))
    with pytest.raises(StudioError, match="not a collection"):
        patch(studio, project, props=FieldEdit(value="not an array"))
    assert studio.context(cut["id"])["values"]["props"] == ["ticket", "clip"]


def test_source_parent_change_invalidates_reference_recipe(studio, tmp_path):
    project, _, _, cut = tree(studio, ready=True)
    location = studio.create_node(NodeCreate(kind="location", name="Station", parent_id=project["id"]))
    prop = studio.create_node(NodeCreate(kind="prop", name="Clock", parent_id=location["id"]))
    path = tmp_path / "clock.png"
    Image.new("RGB", (32, 32), "blue").save(path)
    image = studio.import_media(prop["id"], path, "Clock")
    studio.review_media(
        image["id"],
        MediaReview(
            expected_revision=0,
            expected_context=studio.media(image["id"])["review_context"],
            status="approved",
            user_decision="Offline test",
        ),
    )
    recipe = studio.prepare(
        RecipeCreate(
            node_id=cut["id"],
            provider="fake",
            model="test",
            prompt="@Image1 clock",
            intent="test",
            references=[Reference(media_id=image["id"], role="prop", instruction="Use clock")],
        )
    )
    patch(studio, location, era=FieldEdit(value="Future"))
    with pytest.raises(StudioError, match="reference source changed"):
        studio.approve(recipe["id"], Approval(fingerprint=recipe["fingerprint"], user_decision="Approved"))


def test_feedback_and_revision_snapshot_survive_restart(studio, tmp_path):
    project = tree(studio)[0]
    image = asset(studio, project, tmp_path)
    studio.feedback(image["id"], "Keep the glasses in the next cut.")
    old = studio.revision(project["id"], 1)
    patch(studio, project, era=FieldEdit(value="Present day"))
    resumed = Studio(Store(studio.store.home))
    assert resumed.media(image["id"])["feedback"][0]["text"] == "Keep the glasses in the next cut."
    assert resumed.revision(project["id"], 1) == old
