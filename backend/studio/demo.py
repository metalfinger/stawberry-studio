"""Explicit offline fixture for verifying the production viewer and recovery."""

from __future__ import annotations

import time

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
from backend.studio.worker import Worker


def seed_demo(studio):
    name = "The Last Train / Continuity Proof"
    for project in studio.projects():
        if project["name"] == name:
            return {"project_id": project["id"], "existing": True, "url": f"/studio/{project['id']}"}
    project = studio.create_node(
        NodeCreate(
            kind="project",
            name=name,
            notes="Offline mechanical proof. All preview images are labeled test fixtures, not AI outputs.",
        )
    )
    source = studio.capture(
        project["id"],
        SourceCreate(
            text="A 20-second scene. Mara waits on a rainy railway platform, reads a ticket, then looks toward an arriving train. Keep the navy coat and brass ticket clip consistent."
        ),
    )
    studio.patch_node(
        project["id"],
        NodePatch(
            expected_revision=studio.inspect(project["id"])["node"]["revision"],
            source_id=source["id"],
            reason="Offline fixture setup",
            changes={
                "style": FieldEdit(value="Cinematic realism"),
                "era": FieldEdit(value="1980s"),
                "aspect_ratio": FieldEdit(value="16:9"),
            },
        ),
    )
    assets = []
    for kind, title, note in [
        ("character", "Mara", "Navy coat, round glasses; short dark hair."),
        ("location", "Platform 4", "Rainy station platform. A clock above the eastern entrance."),
        ("prop", "Train ticket", "Cream card with a brass clip. The clip remains on its upper-left edge."),
    ]:
        assets.append(studio.create_node(NodeCreate(kind=kind, name=title, notes=note, parent_id=project["id"])))
    clock = [time.time() + 10]
    worker = Worker(studio, clock=lambda: clock[0])

    def render(node, title, refs=None):
        recipe = studio.prepare(
            RecipeCreate(
                node_id=node["id"],
                provider="fake",
                model="offline_fixture",
                prompt=title,
                intent=title,
                references=refs or [],
            )
        )
        studio.approve(
            recipe["id"],
            Approval(
                fingerprint=recipe["fingerprint"], user_decision="Approved offline contract test; no paid provider"
            ),
        )
        job = studio.enqueue(recipe["id"])
        for _ in range(6):
            clock[0] += 10
            worker.tick(job_id=job["id"])
            if studio.job(job["id"])["state"] == "ready":
                break
        media = studio.inspect(node["id"])["media"][0]
        scope = studio.context(node["id"])["production"]["scope"]
        studio.review_media(
            media["id"],
            MediaReview(
                expected_revision=0,
                expected_context=studio.media(media["id"])["review_context"],
                status="approved",
                user_decision="Offline mechanical fixture approval, not a claim about generated pixels",
                depicted_assets=studio.rules.asset_ids(scope) if node["kind"] == "cut" else [],
            ),
        )
        current = studio.inspect(node["id"])["node"]
        studio.select(node["id"], media["id"], current["revision"])
        return media

    sheets = [render(a, a["name"] + " reference sheet") for a in assets]
    scene = studio.create_node(
        NodeCreate(
            kind="scene",
            name="The platform",
            parent_id=project["id"],
            notes="Mara waits for the last train. Story day 1, dawn.",
        )
    )
    studio.patch_node(
        scene["id"],
        NodePatch(
            expected_revision=1,
            reason="Scene defaults",
            changes={
                "lighting.color": FieldEdit(value="Cool dawn"),
                "weather": FieldEdit(value="Rain"),
                "available_cast": FieldEdit(value=[assets[0]["id"]]),
                "visible_cast": FieldEdit(value=[assets[0]["id"]]),
                "location_id": FieldEdit(value=assets[1]["id"]),
                "required_props": FieldEdit(value=[assets[2]["id"]]),
            },
        ),
    )
    cut_media = []
    cuts = []
    for index, title in enumerate(["Waiting under the clock", "The ticket in her hand", "The train arrives"]):
        shot = studio.create_node(NodeCreate(kind="shot", name=title, parent_id=scene["id"]))
        cut = studio.create_node(
            NodeCreate(
                kind="cut",
                name=title,
                parent_id=shot["id"],
                notes=f"Beat {index + 1}. Preserve the coat, location geography and ticket clip.",
            )
        )
        cuts.append(cut)
        changes = {"story_order": FieldEdit(value=index + 1)}
        if index == 0:
            changes["continuity.after"] = FieldEdit(
                value={assets[2]["id"]: {"owner_id": assets[0]["id"], "clip_position": "upper_left"}}
            )
        if index == 2:
            changes["continuity_from"] = FieldEdit(value=[cuts[0]["id"]])
        studio.patch_node(
            cut["id"], NodePatch(expected_revision=1, reason="Offline story-state coverage", changes=changes)
        )
        refs = [
            Reference(media_id=sheets[0]["id"], role="identity", instruction="Preserve identity and navy coat"),
            Reference(media_id=sheets[1]["id"], role="location", instruction="Preserve platform geography"),
            Reference(media_id=sheets[2]["id"], role="prop", instruction="Preserve brass clip"),
        ]
        if index == 2:
            refs.append(
                Reference(
                    media_id=cut_media[0]["id"],
                    role="composition",
                    instruction="Borrow the establishing composition, not the earlier action",
                )
            )
        cut_media.append(render(cut, title, refs))
    render(
        cuts[0],
        "Waiting under the clock / revised framing",
        [Reference(media_id=cut_media[0]["id"], role="base", instruction="Preserve scene; tighten framing")],
    )
    return {"project_id": project["id"], "offline": True, "url": f"/studio/{project['id']}"}
