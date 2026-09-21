"""Copy-paste guard: perceptual-hash similarity of a take against its sibling cuts and its own references.

A high identity score paired with a near-identical frame is the degenerate solution to
consistency — a storyboard with no camera language. This records the number so the host
can see it next to the identity score.
"""

from __future__ import annotations

from PIL import Image

from backend.studio import lineage
from backend.studio.models import Discrepancy, EvaluationCreate, Evidence

EVALUATOR = "local:duplicate"
VERSION = "dhash8+ahash8"
COPY_PASTE_THRESHOLD = 0.92


def _bits_to_int(bits):
    value = 0
    for bit in bits:
        value = (value << 1) | (1 if bit else 0)
    return value


def dhash(image: Image.Image, size: int = 8) -> int:
    grey = image.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    pixels = list(grey.getdata())
    bits = [pixels[row * (size + 1) + col] > pixels[row * (size + 1) + col + 1] for row in range(size) for col in range(size)]
    return _bits_to_int(bits)


def ahash(image: Image.Image, size: int = 8) -> int:
    grey = image.convert("L").resize((size, size), Image.Resampling.LANCZOS)
    pixels = list(grey.getdata())
    mean = sum(pixels) / len(pixels)
    return _bits_to_int(p > mean for p in pixels)


def similarity(a: tuple[int, int], b: tuple[int, int], bits: int = 64) -> float:
    """1.0 = identical hashes, 0.0 = every bit differs; mean of the two hash families."""
    return 1.0 - (bin(a[0] ^ b[0]).count("1") + bin(a[1] ^ b[1]).count("1")) / (2 * bits)


def _hashes(path) -> tuple[int, int]:
    with Image.open(path) as image:
        return dhash(image), ahash(image)


def compare(studio, media_id: str):
    """Read-only: gather the comparison set and score it. Returns (request, matches)."""
    with studio.store.connection() as conn:
        media = studio.store.one(conn, "media", media_id)
        owner = studio.store.one(conn, "nodes", media["node_id"])
        context = studio.rules.review_context(conn, media)
        candidates = []
        matched = set()
        if owner["kind"] == "cut":
            values = studio._context(conn, owner["id"])["values"]
            if values.get("match_frame"):
                matched.add(values["match_frame"])
            for row in conn.execute("SELECT id FROM nodes WHERE project_id=? AND kind='cut'", (owner["project_id"],)):
                other = studio._context(conn, row["id"])["values"]
                if other.get("match_frame") == owner["id"]:
                    matched.add(row["id"])
            for row in conn.execute(
                "SELECT id,name,active_media_id FROM nodes WHERE parent_id=? AND kind='cut' AND id<>? AND active_media_id IS NOT NULL",
                (owner["parent_id"], owner["id"]),
            ):
                relation = "match_frame" if row["id"] in matched else "sibling"
                candidates.append((relation, row["name"], row["active_media_id"]))
        _, references = lineage._recipe_references(conn, media_id)
        for ref in references:
            ref_media = studio.store.one(conn, "media", ref["media_id"])
            ref_owner = studio.store.one(conn, "nodes", ref_media["node_id"])
            candidates.append((f"reference:{ref['role']}", ref_owner["name"], ref["media_id"]))
        target = _hashes(studio.store.media_dir / media["path"])
        matches = []
        for relation, name, other_id in candidates:
            other = studio.store.one(conn, "media", other_id)
            score = similarity(target, _hashes(studio.store.media_dir / other["path"]))
            matches.append({"media_id": other_id, "name": name, "relation": relation, "similarity": round(score, 4)})
    matches.sort(key=lambda item: -item["similarity"])
    top = matches[0]["similarity"] if matches else 0.0
    request = EvaluationCreate(
        expected_context=context,
        evaluator=EVALUATOR,
        version=VERSION,
        kind="duplicate",
        scores={"max_similarity": top, "distinct": round(1.0 - top, 4)},
        evidence=[
            Evidence(
                question=f"Perceptual similarity to {item['relation']} {item['name']}",
                answer=f"{item['similarity']:.2f}",
                probability=item["similarity"],
            )
            for item in matches
        ],
        confidence=1.0,
        # a base-conditioned take is expected to share most of its pixels with its base; the
        # collapse worth tagging is a different beat that came out as the same picture
        discrepancies=[
            Discrepancy(
                tag="copy_paste",
                note=f"Near-identical to {item['relation']} {item['name']} (similarity {item['similarity']:.2f})",
            )
            for item in matches
            if item["similarity"] >= COPY_PASTE_THRESHOLD and item["relation"] == "sibling"
        ],
    )
    return request, matches


def evaluate_duplicate(studio, media_id: str):
    """Score, then record. Two connections on purpose: the read cannot straddle a definition change."""
    request, matches = compare(studio, media_id)
    record = studio.evaluate(media_id, request)
    return {**record, "matches": matches}
