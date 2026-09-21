"""Export one production in the ViStoryBench layout for an offline audit outside this repo.

    <destination>/
      story.json                       plot, per-shot description, setting, on-stage characters
      image/<Character name>/NN.png    approved reference images per character
      shots/<story_id>/shot_NN.png     the selected take of each cut, in story order

The benchmark's identity metric is face-based and will not read stylized or non-human
subjects; treat its numbers as one audit signal, not the in-engine evaluator.
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

from backend.studio.store import Store, StudioError


def _slug(text: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_")
    return slug or "unnamed"


def _story_order(conn, project_id):
    """Cuts in story order: scene, shot, then cut position; a declared story_order wins inside a shot."""
    rows = conn.execute(
        "SELECT c.*, sh.position AS shot_position, sc.position AS scene_position, sh.id AS shot_id, sc.id AS scene_id "
        "FROM nodes c JOIN nodes sh ON sh.id=c.parent_id JOIN nodes sc ON sc.id=sh.parent_id "
        "WHERE c.project_id=? AND c.kind='cut' ORDER BY sc.position, sh.position, c.position",
        (project_id,),
    ).fetchall()
    cuts = [dict(r) for r in rows]
    for cut in cuts:
        cut["fields_parsed"] = json.loads(cut["fields"])
    return cuts


def export_benchmark(studio, project_id: str, destination: str | Path):
    destination = Path(destination).resolve()
    if destination.exists():
        raise StudioError("export_exists", "Benchmark export destination already exists")
    with studio.store.connection() as conn:
        project = Store.one(conn, "nodes", project_id)
        if project["kind"] != "project":
            raise StudioError("not_project", "Expected a project ID")
        characters = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM nodes WHERE project_id=? AND kind='character' ORDER BY position,created_at", (project_id,)
            )
        ]
        story_id = _slug(project["name"])
        shots_dir = destination / "shots" / story_id
        shots_dir.mkdir(parents=True)
        (destination / "image").mkdir()
        approved_media = {}
        for character in characters:
            folder = destination / "image" / _slug(character["name"])
            folder.mkdir()
            count = 0
            for media in conn.execute(
                "SELECT * FROM media WHERE node_id=? ORDER BY created_at", (character["id"],)
            ):
                review = studio.rules.review(conn, dict(media))
                if review["status"] != "approved" or review["stale"]:
                    continue
                count += 1
                shutil.copy2(studio.store.media_dir / media["path"], folder / f"{count:02d}{Path(media['path']).suffix}")
            approved_media[character["id"]] = count
        shots, skipped = [], []
        for index, cut in enumerate(_story_order(conn, project_id), start=1):
            context = studio._context(conn, cut["id"])["values"]
            scope = studio.rules.scope({"values": context})
            location = Store.one(conn, "nodes", scope["location"])["name"] if scope["location"] else ""
            on_stage = [Store.one(conn, "nodes", cid)["name"] for cid in scope["characters"]]
            entry = {
                "index": index,
                "shot_id": f"shot_{index:02d}",
                "cut_id": cut["id"],
                "cut_name": cut["name"],
                "scene": Store.one(conn, "nodes", cut["scene_id"])["name"],
                "shot": Store.one(conn, "nodes", cut["shot_id"])["name"],
                "setting_description": location,
                "onstage_characters": on_stage,
                "plot_correspondence": str(context.get("action") or cut["notes"] or "").strip(),
                "script": str(context.get("beat.purpose") or "").strip(),
                "camera": {k.split(".", 1)[1]: v for k, v in context.items() if k.startswith("camera.")},
            }
            if not cut["active_media_id"]:
                skipped.append({**entry, "reason": "no selected take"})
                continue
            media = Store.one(conn, "media", cut["active_media_id"])
            shutil.copy2(studio.store.media_dir / media["path"], shots_dir / f"shot_{index:02d}{Path(media['path']).suffix}")
            shots.append(entry)
        story = {
            "story_id": story_id,
            "title": project["name"],
            "characters": [
                {
                    "name": c["name"],
                    "folder": _slug(c["name"]),
                    "reference_images": approved_media[c["id"]],
                    "prompt": " ".join(
                        str(v) for k, v in json.loads(c["fields"]).items() if k in ("identity", "appearance", "wardrobe")
                        for v in [v.get("value") if isinstance(v, dict) else v] if v
                    ),
                }
                for c in characters
            ],
            "shots": shots,
            "skipped": skipped,
            "note": "Generated by Strawberry Studio benchmark export. CIDS is face-based; stylized subjects will score as noise.",
        }
        (destination / "story.json").write_text(json.dumps(story, indent=2, ensure_ascii=False))
    return {"path": str(destination), "story_id": story_id, "shots": len(shots), "skipped": len(skipped),
            "characters": {c["name"]: approved_media[c["id"]] for c in characters}}
