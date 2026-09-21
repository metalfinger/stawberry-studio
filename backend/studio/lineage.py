"""Reference lineage. A generated image's ancestry is already recorded — media → job → recipe →
ordered references → media — so generation depth is a query, not a schema.

Depth 0: imported media, or media generated with no references (a sheet). Depth n: generated
from a recipe whose deepest reference is depth n-1. Cycles are impossible because a reference
must exist before the recipe that cites it.
"""

from __future__ import annotations

import json

DEFAULT_DEPTH_CAP = 2


def _recipe_references(conn, media_id):
    row = conn.execute("SELECT job_id FROM media WHERE id=?", (media_id,)).fetchone()
    if not row or not row["job_id"]:
        return None, []
    job = conn.execute("SELECT recipe_id FROM jobs WHERE id=?", (row["job_id"],)).fetchone()
    if not job:
        return None, []
    recipe = conn.execute("SELECT id, spec FROM recipes WHERE id=?", (job["recipe_id"],)).fetchone()
    if not recipe:
        return None, []
    return recipe["id"], json.loads(recipe["spec"]).get("references", [])


def depth(conn, media_id, cache=None) -> int:
    cache = {} if cache is None else cache
    if media_id in cache:
        return cache[media_id]
    _, references = _recipe_references(conn, media_id)
    value = 1 + max(depth(conn, ref["media_id"], cache) for ref in references) if references else 0
    cache[media_id] = value
    return value


def lineage(conn, media_id, cache=None) -> dict:
    """The full ancestry tree of one image, each node carrying its own depth."""
    cache = {} if cache is None else cache
    media = conn.execute("SELECT id, node_id, label FROM media WHERE id=?", (media_id,)).fetchone()
    owner = conn.execute("SELECT kind, name FROM nodes WHERE id=?", (media["node_id"],)).fetchone() if media else None
    recipe_id, references = _recipe_references(conn, media_id)
    return {
        "media_id": media_id,
        "label": media["label"] if media else None,
        "owner_node_id": media["node_id"] if media else None,
        "owner_kind": owner["kind"] if owner else None,
        "owner_name": owner["name"] if owner else None,
        "depth": depth(conn, media_id, cache),
        "recipe_id": recipe_id,
        "references": [
            {"role": ref["role"], "subjects": ref.get("subjects", []), **lineage(conn, ref["media_id"], cache)}
            for ref in references
        ],
    }


def depth_warnings(conn, references, cap) -> list[dict]:
    """Advisory: the cap bounds the depth of the image being generated, so a reference at depth
    >= cap would push the output past it. Never part of a recipe's spec or fingerprint."""
    cache = {}
    out = []
    for ref in references:
        value = depth(conn, ref["media_id"], cache)
        if value + 1 > cap:
            out.append(
                {
                    "code": "reference_depth",
                    "media_id": ref["media_id"],
                    "reference_depth": value,
                    "output_depth": value + 1,
                    "cap": cap,
                    "message": (
                        f"Reference {ref['media_id'][:8]} is generation depth {value}; the result would be depth "
                        f"{value + 1}, past the project cap of {cap}. Reach back to an approved sheet or a shallower take"
                    ),
                }
            )
    return out
