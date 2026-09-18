"""Prepare an assistant-proposed benchmark, without approval or generation.

Run from the repository: venv/bin/python -m scripts.prepare_visual_proof
"""

import json

from backend.studio.models import (
    AssetRequirementCreate,
    FieldEdit,
    NodeCreate,
    NodePatch,
    RecipeCreate,
    SourceCreate,
)
from backend.studio.service import Studio
from backend.studio.store import Store

SHEETS = [
    (
        "character",
        "Mara",
        "3:2",
        """Create a production character reference sheet of ONE fictional woman, Mara, age 32,
short straight dark bob tucked behind both ears, round thin dark-metal glasses,
navy knee-length wool coat with six brass buttons, grey trousers, plain black boots.
Cinematic photographic realism, 1980s clothing and materials, neutral accurate colors.
Four distinct panels: full-body front, full-body left profile, full-body back,
and a large front three-quarter face close-up. Rotate the WHOLE BODY for the profile
and back views: shoulders, torso, hips and feet must match the view, not merely the
head. All views are the SAME person, identical glasses, haircut and clothing.
Standing naturally with hands empty, arms slightly away from coat. No phone,
ticket, bags or other props. White seamless background, even soft studio lighting,
no scene or dramatic colored illumination. Full boots and crown visible in the
three full-body panels. Clean gutters. This is a reference sheet, not a story frame.""",
    ),
    (
        "location",
        "Platform 4",
        "16:9",
        """Create one coherent four-panel location reference sheet for a modest 1980s
railway station Platform 4 at rainy blue hour. Cinematic photographic realism.
Establish ONE shared geography: straight tracks along the SOUTH edge; red brick
station wall to the NORTH; EAST entrance has one round white clock above its
green door; one long green bench sits against the north wall WEST of that door;
steel canopy columns run parallel to the tracks. Warm tungsten canopy lights,
wet grey paving, no modern screens. Panels: wide eye-level view looking EAST;
reverse eye-level view looking WEST; perpendicular view looking NORTH toward
the wall/bench/clock; high oblique establishing view revealing their spatial
relationship. Every view depicts exactly the SAME architecture and layout,
not alternative station designs. No people, trains, character portraits or
handheld props. Full environmental backgrounds in every panel, NOT white studio
backdrops. Clear gutters, restrained labels EAST / WEST / NORTH / OVERVIEW.
Preserve materials, rain, time and color treatment consistently across panels.""",
    ),
    (
        "prop",
        "Train ticket",
        "3:2",
        """Create a three-panel production prop reference sheet of ONE cream paper railway
ticket, 8 by 5 centimeters, softly worn corners, thin burgundy border, heading
PLATFORM 4, small printed serial 0184. A single small brass spring clip is fixed
to its upper-left edge when viewed from the printed front. Cinematic photographic
realism, 1980s printed paper and brass materials, neutral accurate colors.
Panels: straight-on front; straight-on back showing the physically corresponding
reverse position of that SAME clip; close three-quarter detail of the clip and
paper edge. Consistent dimensions, border, wear pattern and clip construction.
No hands, people, extra tickets or additional clips. White seamless background,
soft even product lighting, only a faint contact shadow. Clean gutters. No
decorative cinematic environment or invented alternate designs.""",
    ),
]

REQUIREMENTS = {
    "Mara": [
        (
            "view",
            "Full-body front",
            "Show crown-to-boots proportions and the complete six-button navy coat from the front.",
            1,
        ),
        (
            "view",
            "Full-body left profile",
            "Rotate shoulders, torso, hips and feet into a true left profile; do not rotate only the head.",
            1,
        ),
        ("view", "Full-body back", "Establish the complete rear silhouette, haircut and coat construction.", 1),
        (
            "detail",
            "Three-quarter face",
            "Establish Mara's face, round dark-metal glasses and short tucked bob at useful identity detail.",
            1,
        ),
    ],
    "Platform 4": [
        (
            "view",
            "Looking east",
            "Establish the east entrance, clock, tracks, wall and bench in one coherent geography.",
            1,
        ),
        ("view", "Looking west", "Show the exact reverse direction without redesigning the station.", 1),
        ("view", "Looking north", "Establish the wall, bench and clock relationship from the track side.", 1),
        (
            "scale",
            "High geography overview",
            "Show the spatial relationship of tracks, wall, entrance, bench and canopy columns.",
            1,
        ),
    ],
    "Train ticket": [
        (
            "view",
            "Printed front",
            "Show the exact border, PLATFORM 4 heading, serial 0184 and upper-left brass clip.",
            1,
        ),
        (
            "view",
            "Physical back",
            "Show the same object from behind with the clip in its physically corresponding position.",
            2,
        ),
        ("detail", "Clip construction", "Resolve the spring clip, attachment and paper-edge wear at close range.", 1),
    ],
}


def prepare(studio):
    name = "The Last Train / Proposed Visual Proof"
    existing = next((p for p in studio.projects() if p["name"] == name), None)
    project = existing or studio.create_node(
        NodeCreate(
            kind="project",
            name=name,
            notes="Assistant-proposed real-image benchmark. Awaiting user recipe approval; not an approved production.",
        )
    )
    if not existing:
        source = studio.capture(
            project["id"],
            SourceCreate(
                author="assistant",
                status="proposal",
                text="Proposed bounded visual test: three independent character/location/prop sheets for Mara waiting at Platform 4 with a brass-clipped ticket. Human reviews sheets before any cut recipes are prepared. No paid approval implied.",
            ),
        )
        studio.patch_node(
            project["id"],
            NodePatch(
                expected_revision=studio.inspect(project["id"])["node"]["revision"],
                reason="Record proposed benchmark context",
                source_id=source["id"],
                changes={
                    "style": FieldEdit(value="Cinematic photographic realism, neutral consistent materials"),
                    "era": FieldEdit(value="1980s"),
                },
            ),
        )
    recipes = []
    for kind, name, aspect, prompt in SHEETS:
        data = studio.project(project["id"])
        node = next(
            (item for item in data["nodes"] if item["kind"] == kind and item["name"] == name),
            None,
        ) or studio.create_node(NodeCreate(kind=kind, name=name, parent_id=project["id"], notes=prompt))
        known_labels = {item["label"] for item in studio.inspect(node["id"])["requirements"]}
        for requirement_kind, label, instruction, priority in REQUIREMENTS[name]:
            if label not in known_labels:
                studio.create_requirement(
                    node["id"],
                    AssetRequirementCreate(
                        kind=requirement_kind, label=label, instruction=instruction, priority=priority
                    ),
                )
        data = studio.project(project["id"])
        recipe = next(
            (
                item
                for item in data["recipes"]
                if item["node_id"] == node["id"]
                and item["fresh"]
                and item["spec"]["prompt"] == prompt
                and item["spec"]["settings"] == {"aspect_ratio": aspect, "resolution": "2k"}
            ),
            None,
        )
        if not recipe:
            recipe = studio.prepare(
                RecipeCreate(
                    node_id=node["id"],
                    model="nano_banana_2",
                    prompt=prompt,
                    intent=f"Proposed {name} reference sheet",
                    settings={"aspect_ratio": aspect, "resolution": "2k"},
                )
            )
        recipes.append(
            {
                "name": name,
                "node_id": node["id"],
                "recipe_id": recipe["id"],
                "fingerprint": recipe["fingerprint"],
                "estimate": recipe["spec"]["estimate"],
            }
        )
    return {"project_id": project["id"], "recipes": recipes, "approved": False, "submitted": False}


if __name__ == "__main__":
    print(json.dumps(prepare(Studio(Store())), indent=2))
