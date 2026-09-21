import json

from PIL import Image

from backend.studio.models import FieldEdit, MediaReview, NodeCreate, NodePatch
from backend.studio.service import Studio
from backend.studio.store import Store
from backend.studio.tools import invoke


def change(studio, node, **fields):
    current = studio.inspect(node["id"])["node"]
    studio.patch_node(
        node["id"],
        NodePatch(
            expected_revision=current["revision"], reason="Fixture",
            changes={k: v if isinstance(v, FieldEdit) else FieldEdit(value=v) for k, v in fields.items()},
        ),
    )


def take(studio, node, path, subjects=None, select=True):
    media = studio.import_media(node["id"], path, node["name"])
    studio.review_media(
        media["id"],
        MediaReview(expected_revision=0, expected_context=studio.media(media["id"])["review_context"],
                    status="approved", user_decision="ok", depicted_assets=subjects or []),
    )
    if select:
        studio.select(node["id"], media["id"], studio.inspect(node["id"])["node"]["revision"])
    return media


def test_export_follows_the_benchmark_layout(tmp_path):
    studio = Studio(Store(tmp_path / "workspace"))
    project = studio.create_node(NodeCreate(kind="project", name="Nine O'Clock — test"))
    change(studio, project, style="Charcoal")
    abhishek = studio.create_node(NodeCreate(kind="character", name="Abhishek — The Dreamer", parent_id=project["id"]))
    change(studio, abhishek, appearance="a tired man in his thirties")
    road = studio.create_node(NodeCreate(kind="location", name="The wide white road", parent_id=project["id"]))
    path = tmp_path / "f.png"
    Image.new("RGB", (32, 32), "grey").save(path)
    take(studio, abhishek, path)
    take(studio, abhishek, path, select=False)
    take(studio, road, path)
    scene = studio.create_node(NodeCreate(kind="scene", name="The White Road", parent_id=project["id"]))
    change(studio, scene, visible_cast=[abhishek["id"]], location_id=road["id"], required_props=[])
    shot = studio.create_node(NodeCreate(kind="shot", name="Running", parent_id=scene["id"]))
    change(studio, shot, **{"camera.framing": "wide"})
    first = studio.create_node(NodeCreate(kind="cut", name="Enters", parent_id=shot["id"], notes="Abhishek enters the frame"))
    second = studio.create_node(NodeCreate(kind="cut", name="Runs", parent_id=shot["id"], notes="Running against traffic"))
    change(studio, second, **{"beat.purpose": "no one stops"})
    take(studio, first, path, [abhishek["id"], road["id"]])
    out = tmp_path / "bench"
    result = invoke(studio, "export_benchmark", {"id": project["id"], "path": str(out)})
    assert result["shots"] == 1 and result["skipped"] == 1
    assert result["characters"] == {"Abhishek — The Dreamer": 2}
    story = json.loads((out / "story.json").read_text())
    assert story["shots"][0]["onstage_characters"] == ["Abhishek — The Dreamer"]
    assert story["shots"][0]["setting_description"] == "The wide white road"
    assert story["shots"][0]["camera"] == {"framing": "wide"}
    assert story["skipped"][0]["script"] == "no one stops"
    assert (out / "shots" / story["story_id"] / "shot_01.png").exists()
    assert sorted(p.name for p in (out / "image" / "Abhishek_The_Dreamer").iterdir()) == ["01.png", "02.png"]
    assert "tired man" in story["characters"][0]["prompt"]
