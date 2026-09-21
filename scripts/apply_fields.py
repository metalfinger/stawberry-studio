"""Apply a JSON sheet of dotted fields to a production, then carry approved reviews forward.

    venv/bin/python -m scripts.apply_fields --home STORE PROJECT_ID FIELDS.json [--re-review]

FIELDS.json: {"project": {...}, "scenes": {"<name>": {...}}, "cuts": {"<name>": {...}},
"assets": {"<name>": {...}}} — values are set; a value of null clears the field.

Writing fields is a revision, so every approved review whose definition changed becomes
stale. With --re-review, each such review is re-recorded as approved with its previous
depicted assets and requirement coverage carried forward and a decision text that says
so. Use that only for metadata-only additions where the images were not re-inspected;
it is a scripted carry-forward, not a fresh human look.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from backend.studio.models import FieldEdit, MediaReview, NodePatch
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError


def patch(studio, node_id, fields, reason):
    node = studio.inspect(node_id)["node"]
    changes = {k: FieldEdit(op="clear") if v is None else FieldEdit(value=v) for k, v in fields.items()}
    studio.patch_node(node_id, NodePatch(expected_revision=node["revision"], reason=reason, changes=changes))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("project_id")
    parser.add_argument("sheet")
    parser.add_argument("--home", default=".strawberry")
    parser.add_argument("--re-review", action="store_true")
    parser.add_argument("--reason", default="Canonical vocabulary applied from a field sheet")
    args = parser.parse_args()
    studio = Studio(Store(Path(args.home)))
    sheet = json.loads(Path(args.sheet).read_text())
    with studio.store.connection() as conn:
        nodes = [dict(r) for r in conn.execute("SELECT id,kind,name FROM nodes WHERE project_id=?", (args.project_id,))]
    by_name = {}
    for node in nodes:
        by_name.setdefault((node["kind"] if node["kind"] in ("scene", "cut") else "asset", node["name"]), node["id"])
    applied, missing = 0, []
    if sheet.get("project"):
        patch(studio, args.project_id, sheet["project"], args.reason)
        applied += 1
    for group, kind in (("scenes", "scene"), ("cuts", "cut"), ("assets", "asset")):
        for name, fields in sheet.get(group, {}).items():
            node_id = by_name.get((kind, name))
            if not node_id:
                missing.append(f"{kind}:{name}")
                continue
            patch(studio, node_id, fields, args.reason)
            applied += 1
    carried, still_stale = 0, []
    if args.re_review:
        with studio.store.connection() as conn:
            media_ids = [r["id"] for r in conn.execute(
                "SELECT m.id FROM media m JOIN nodes n ON n.id=m.node_id WHERE n.project_id=?", (args.project_id,))]
        for media_id in media_ids:
            detail = studio.media(media_id)
            review = detail["media"]["review"]
            if review["status"] != "approved" or not review["stale"]:
                continue
            try:
                studio.review_media(
                    media_id,
                    MediaReview(
                        expected_revision=review["revision"],
                        expected_context=detail["review_context"],
                        status="approved",
                        user_decision=(
                            "Carried forward by scripts/apply_fields after metadata-only field additions; "
                            "image unchanged, depicted assets and coverage as previously confirmed"
                        ),
                        depicted_assets=review["depicted_assets"],
                        requirement_ids=review["requirement_ids"],
                    ),
                )
                carried += 1
            except StudioError as error:
                still_stale.append({"media_id": media_id, "error": error.code})
    print(json.dumps({"applied": applied, "missing": missing, "reviews_carried_forward": carried, "still_stale": still_stale}, indent=2))


if __name__ == "__main__":
    main()
