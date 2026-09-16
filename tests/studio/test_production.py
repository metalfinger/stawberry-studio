from types import SimpleNamespace

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
    Reorder,
)
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError
from backend.studio.worker import Worker


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


def take(studio, node, path, subjects=None, approve=True, select=True):
    media = studio.import_media(node["id"], path, node["name"], metadata={"fake": True})
    if approve:
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
        if select:
            studio.select(node["id"], media["id"], studio.inspect(node["id"])["node"]["revision"])
    return media


@pytest.fixture
def world(tmp_path):
    studio = Studio(Store(tmp_path / "workspace"))
    project = studio.create_node(NodeCreate(kind="project", name="Continuity", notes="Test production"))
    change(studio, project, style="Comic animation")
    assets = [
        studio.create_node(NodeCreate(kind=kind, name=name, parent_id=project["id"]))
        for kind, name in [("character", "Mara"), ("location", "Station"), ("prop", "Ticket")]
    ]
    path = tmp_path / "fixture.png"
    Image.new("RGB", (64, 64), "green").save(path)
    media = [take(studio, node, path) for node in assets]
    scene = studio.create_node(NodeCreate(kind="scene", name="Arrival", parent_id=project["id"]))
    change(
        studio,
        scene,
        available_cast=[assets[0]["id"]],
        visible_cast=[assets[0]["id"]],
        location_id=assets[1]["id"],
        required_props=[assets[2]["id"]],
    )
    shot = studio.create_node(NodeCreate(kind="shot", name="Ticket handover", parent_id=scene["id"]))
    cuts = [
        studio.create_node(
            NodeCreate(
                kind="cut",
                name=f"Beat {i}",
                parent_id=shot["id"],
                notes="Mara holds the ticket on the station platform",
            )
        )
        for i in range(3)
    ]
    refs = [
        Reference(media_id=image["id"], role=role, instruction="Preserve the approved appearance")
        for image, role in zip(media, ("identity", "location", "prop"), strict=True)
    ]
    return SimpleNamespace(
        studio=studio,
        project=project,
        scene=scene,
        shot=shot,
        cuts=cuts,
        assets=assets,
        media=media,
        refs=refs,
        path=path,
    )


def recipe(w, cut=None, refs=None):
    return w.studio.prepare(
        RecipeCreate(
            node_id=(cut or w.cuts[0])["id"],
            provider="fake",
            model="test",
            intent="Offline frame",
            prompt="Mara holds the ticket",
            references=w.refs if refs is None else refs,
        )
    )


def test_available_cast_never_implicitly_becomes_visible(world):
    w = world
    change(w.studio, w.scene, visible_cast=FieldEdit(op="inherit"))
    context = w.studio.context(w.cuts[0]["id"])
    assert context["production"]["scope"]["characters"] == []
    assert not context["production"]["readiness"]["ready"]
    assert any(i.get("field") == "visible_cast" for i in context["production"]["readiness"]["issues"])
    with pytest.raises(StudioError, match="visible_cast"):
        recipe(w)


def test_explicit_empty_scope_does_not_request_people_or_props(world):
    w = world
    change(w.studio, w.cuts[0], visible_cast=[], required_props=[], location_id=FieldEdit(op="clear"))
    result = recipe(w, refs=[])
    assert result["context"]["production"]["assets"] == []
    assert w.studio.readiness(w.cuts[0]["id"])["ready"]


def test_relationship_validation_is_project_and_kind_scoped(world):
    w = world
    for bad in ([w.assets[1]["id"]], ["invented-id"]):
        with pytest.raises(StudioError):
            change(w.studio, w.cuts[0], visible_cast=bad)
    other = w.studio.create_node(NodeCreate(kind="project", name="Other"))
    foreign = w.studio.create_node(NodeCreate(kind="character", name="Mara", parent_id=other["id"]))
    with pytest.raises(StudioError, match="this project"):
        change(w.studio, w.cuts[0], visible_cast=[foreign["id"]])
    assert w.studio.context(w.cuts[0]["id"])["values"]["visible_cast"] == [w.assets[0]["id"]]


def test_reference_role_must_actually_cover_identity(world):
    w = world
    wrong = [w.refs[0].model_copy(update={"role": "composition"}), *w.refs[1:]]
    with pytest.raises(StudioError) as error:
        recipe(w, refs=wrong)
    assert any(i["code"] == "reference_coverage" for i in error.value.issues)
    assert recipe(w)["context"]["production"]["readiness"]["ready"]


def test_rejected_reference_blocks_but_retains_history(world):
    w = world
    image = w.media[0]
    w.studio.review_media(
        image["id"],
        MediaReview(
            expected_revision=1,
            expected_context=w.studio.media(image["id"])["review_context"],
            status="rejected",
            user_decision="Identity is wrong",
        ),
    )
    with pytest.raises(StudioError, match="reference"):
        recipe(w)
    assert w.studio.inspect(w.assets[0]["id"])["node"]["active_media_id"] == image["id"]
    assert len(w.studio.media(image["id"])["review_history"]) == 2


def test_changed_definition_requires_new_visual_review(world):
    w = world
    recipe_before = recipe(w)
    change(w.studio, w.assets[0], **{"appearance.glasses": "round brass glasses"})
    assert w.studio.media(w.media[0]["id"])["media"]["review"]["stale"]
    with pytest.raises(StudioError, match="Context changed"):
        w.studio.approve(
            recipe_before["id"], Approval(fingerprint=recipe_before["fingerprint"], user_decision="Approve")
        )
    w.studio.review_media(
        w.media[0]["id"],
        MediaReview(
            expected_revision=1,
            expected_context=w.studio.media(w.media[0]["id"])["review_context"],
            status="approved",
            user_decision="Confirmed this existing take already has the correct glasses",
        ),
    )
    assert w.studio.readiness(w.cuts[0]["id"])["ready"]


def test_non_adjacent_cut_can_supply_an_edit_base(world):
    w = world
    subjects = [a["id"] for a in w.assets]
    earlier = take(w.studio, w.cuts[0], w.path, subjects)
    result = recipe(
        w,
        cut=w.cuts[2],
        refs=[
            Reference(
                media_id=earlier["id"], role="base", instruction="Preserve the scene and identities; change the gesture"
            )
        ],
    )
    assert len(result["spec"]["references"]) == 1
    assert result["spec"]["references"][0]["media_id"] == earlier["id"]


def test_unconfirmed_subjects_cannot_be_invented_on_a_cut(world):
    w = world
    earlier = take(w.studio, w.cuts[0], w.path, [w.assets[1]["id"]], select=False)
    with pytest.raises(StudioError) as error:
        recipe(
            w,
            cut=w.cuts[2],
            refs=[
                Reference(
                    media_id=earlier["id"], role="identity", instruction="Use Mara", subjects=[w.assets[0]["id"]]
                ),
                *w.refs[1:],
            ],
        )
    assert any(i["code"] == "reference_subject" for i in error.value.issues)


def test_partial_take_can_be_a_reference_but_not_final_cut(world):
    w = world
    image = take(w.studio, w.cuts[0], w.path, [w.assets[1]["id"]], select=False)
    with pytest.raises(StudioError, match="required assets are visible"):
        w.studio.select(w.cuts[0]["id"], image["id"], 1)
    assert recipe(
        w,
        cut=w.cuts[2],
        refs=[
            w.refs[0],
            Reference(
                media_id=image["id"], role="location", instruction="Use the station only", subjects=[w.assets[1]["id"]]
            ),
            w.refs[2],
        ],
    )


def test_pending_take_cannot_be_selected(world):
    w = world
    image = take(w.studio, w.cuts[0], w.path, approve=False)
    with pytest.raises(StudioError, match="Approve this take"):
        w.studio.select(w.cuts[0]["id"], image["id"], 1)


def test_continuity_is_explicit_and_does_not_copy_camera(world):
    w = world
    change(
        w.studio,
        w.cuts[0],
        **{
            "camera.framing": "wide",
            "continuity.after": {w.assets[2]["id"]: {"owner_id": w.assets[0]["id"], "wet": True}},
        },
    )
    take(w.studio, w.cuts[0], w.path, [a["id"] for a in w.assets])
    assert not w.studio.context(w.cuts[1]["id"])["production"]["continuity"]["incoming"]
    change(w.studio, w.cuts[2], continuity_from=[w.cuts[0]["id"]])
    context = w.studio.context(w.cuts[2]["id"])
    assert "camera.framing" not in context["values"]
    assert context["production"]["continuity"]["incoming"][w.assets[2]["id"] + "/wet"][0]["value"] is True
    assert context["production"]["readiness"]["ready"]
    with pytest.raises(StudioError, match="cycle"):
        change(w.studio, w.cuts[0], continuity_from=[w.cuts[2]["id"]])


def test_conflicting_states_require_explicit_resolution(world):
    w = world
    for cut, wet in zip(w.cuts[:2], (True, False), strict=True):
        change(w.studio, cut, **{"continuity.after": {w.assets[2]["id"]: {"wet": wet}}})
        take(w.studio, cut, w.path, [a["id"] for a in w.assets])
    change(w.studio, w.cuts[2], continuity_from=[c["id"] for c in w.cuts[:2]])
    assert any(i["code"] == "state_conflict" for i in w.studio.readiness(w.cuts[2]["id"])["issues"])
    change(w.studio, w.cuts[2], **{"continuity.before": {w.assets[2]["id"]: {"wet": True}}})
    assert w.studio.readiness(w.cuts[2]["id"])["ready"]


def test_reorder_is_atomic_and_does_not_rewrite_story_order(world):
    w = world
    for i, cut in enumerate(w.cuts, 1):
        change(w.studio, cut, story_order=i)
    revisions = {c["id"]: w.studio.inspect(c["id"])["node"]["revision"] for c in w.cuts}
    order = [c["id"] for c in reversed(w.cuts)]
    result = w.studio.reorder(
        w.shot["id"], Reorder(kind="cut", ordered_ids=order, expected_revisions=revisions, reason="Reverse the edit")
    )
    assert [n["id"] for n in result] == order
    assert [n["position"] for n in result] == [1, 2, 3]
    assert [w.studio.context(n["id"])["values"]["story_order"] for n in result] == [3, 2, 1]
    with pytest.raises(StudioError, match="sibling changed"):
        w.studio.reorder(
            w.shot["id"], Reorder(kind="cut", ordered_ids=order, expected_revisions=revisions, reason="Stale request")
        )


def test_duplicate_review_cannot_overwrite_concurrent_decision(world):
    w = world
    with pytest.raises(StudioError, match="reviewed elsewhere"):
        w.studio.review_media(
            w.media[0]["id"],
            MediaReview(
                expected_revision=0,
                expected_context=w.studio.media(w.media[0]["id"])["review_context"],
                status="rejected",
                user_decision="Stale UI",
            ),
        )
    assert w.studio.media(w.media[0]["id"])["media"]["review"]["status"] == "approved"


@pytest.mark.parametrize("during_reference_read", [False, True])
def test_worker_rechecks_review_before_submission(world, monkeypatch, during_reference_read):
    w = world
    prepared = recipe(w)
    w.studio.approve(prepared["id"], Approval(fingerprint=prepared["fingerprint"], user_decision="Offline approval"))
    job = w.studio.enqueue(prepared["id"])

    def reject():
        w.studio.review_media(
            w.media[0]["id"],
            MediaReview(
                expected_revision=1,
                expected_context=w.studio.media(w.media[0]["id"])["review_context"],
                status="rejected",
                user_decision="Wrong glasses discovered before execution",
            ),
        )

    if during_reference_read:
        original_path = w.studio.media_path

        def change_during_file_read(media_id):
            if media_id == w.media[0]["id"]:
                reject()
            return original_path(media_id)

        monkeypatch.setattr(w.studio, "media_path", change_during_file_read)
    else:
        reject()
    worker = Worker(w.studio)

    def forbidden(*args):
        raise AssertionError("Stale recipes must not reach a provider")

    calls = []
    monkeypatch.setattr(worker.providers["fake"], "submit", lambda *args: calls.append(args) or forbidden(*args))
    worker.tick(job_id=job["id"])
    assert not calls
    result = w.studio.job(job["id"])
    assert result["state"] == "failed"
    assert "Context changed" in result["error"]


def test_upstream_state_change_invalidates_downstream_review(world):
    w = world
    subjects = [a["id"] for a in w.assets]
    change(w.studio, w.cuts[0], **{"continuity.after": {w.assets[2]["id"]: {"wet": True}}})
    take(w.studio, w.cuts[0], w.path, subjects)
    change(w.studio, w.cuts[2], continuity_from=[w.cuts[0]["id"]])
    downstream = take(w.studio, w.cuts[2], w.path, subjects)
    change(w.studio, w.cuts[0], **{"continuity.after": {w.assets[2]["id"]: {"wet": False}}})
    assert w.studio.media(downstream["id"])["media"]["review"]["stale"]
    assert not w.studio.readiness(w.cuts[2]["id"])["ready"]


def test_shared_api_readiness_reviews_and_reordering(world):
    from fastapi.testclient import TestClient

    from backend.studio.api import create_app

    w = world
    client = TestClient(create_app(w.studio.store.home))
    headers = {"X-Strawberry-Action": "1"}
    assert client.get(f"/api/studio/nodes/{w.cuts[0]['id']}/readiness").json()["ready"]
    response = client.post(
        f"/api/studio/media/{w.media[0]['id']}/review",
        json={
            "expected_revision": 1,
            "expected_context": w.studio.media(w.media[0]["id"])["review_context"],
            "status": "rejected",
            "user_decision": "Incorrect face",
        },
        headers=headers,
    )
    assert response.status_code == 200
    assert not client.get(f"/api/studio/nodes/{w.cuts[0]['id']}/readiness").json()["ready"]
    order = [c["id"] for c in reversed(w.cuts)]
    response = client.post(
        f"/api/studio/nodes/{w.shot['id']}/reorder",
        json={
            "kind": "cut",
            "ordered_ids": order,
            "expected_revisions": {c["id"]: 1 for c in w.cuts},
            "reason": "New edit",
        },
        headers=headers,
    )
    assert response.status_code == 200
    assert [n["id"] for n in response.json()] == order


def test_review_cannot_silently_approve_a_changed_production(world):
    w = world
    snapshot = w.studio.media(w.media[0]["id"])
    change(w.studio, w.assets[0], **{"wardrobe.coat": "red"})
    with pytest.raises(StudioError, match="changed during review"):
        w.studio.review_media(
            w.media[0]["id"],
            MediaReview(
                expected_revision=1,
                expected_context=snapshot["review_context"],
                status="approved",
                user_decision="Old browser still shows navy coat",
            ),
        )
    assert len(w.studio.media(w.media[0]["id"])["review_history"]) == 1


def test_selected_cut_reapproved_as_partial_cannot_supply_continuity(world):
    w = world
    image = take(w.studio, w.cuts[0], w.path, [a["id"] for a in w.assets])
    change(w.studio, w.cuts[2], continuity_from=[w.cuts[0]["id"]])
    assert w.studio.readiness(w.cuts[2]["id"])["ready"]
    w.studio.review_media(
        image["id"],
        MediaReview(
            expected_revision=1,
            expected_context=w.studio.media(image["id"])["review_context"],
            status="approved",
            user_decision="Useful station reference but Mara is missing",
            depicted_assets=[w.assets[1]["id"]],
        ),
    )
    assert w.studio.media(image["id"])["media"]["review"]["complete"] is False
    assert any(i["code"] == "continuity_take" for i in w.studio.readiness(w.cuts[2]["id"])["issues"])
    assert w.studio.inspect(w.cuts[0]["id"])["node"]["active_media_id"] == image["id"]


def test_sublocation_requires_its_own_declared_reference(world):
    w = world
    entrance = w.studio.create_node(NodeCreate(kind="location", name="Eastern entrance", parent_id=w.assets[1]["id"]))
    media = take(w.studio, entrance, w.path)
    change(w.studio, w.cuts[0], location_id=entrance["id"])
    with pytest.raises(StudioError, match="Eastern entrance"):
        recipe(w)
    assert recipe(
        w,
        refs=[
            w.refs[0],
            Reference(media_id=media["id"], role="location", instruction="Use the eastern entrance"),
            w.refs[2],
        ],
    )


def test_prop_ownership_is_validated_and_conflicts_are_explicit(world):
    w = world
    ticket, mara, station = w.assets[2]["id"], w.assets[0]["id"], w.assets[1]["id"]
    with pytest.raises(StudioError, match="not a"):
        change(w.studio, w.cuts[0], **{"continuity.after": {ticket: {"owner_id": ticket}}})
    for cut, owner in zip(w.cuts[:2], (mara, station), strict=True):
        change(w.studio, cut, **{"continuity.after": {ticket: {"owner_id": owner}}})
        take(w.studio, cut, w.path, [a["id"] for a in w.assets])
    change(w.studio, w.cuts[2], continuity_from=[c["id"] for c in w.cuts[:2]])
    assert (
        w.studio.context(w.cuts[2]["id"])["production"]["continuity"]["conflicts"][0]["field"] == ticket + "/owner_id"
    )
    change(w.studio, w.cuts[2], **{"continuity.before": {ticket: {"owner_id": mara}}})
    assert w.studio.readiness(w.cuts[2]["id"])["ready"]
