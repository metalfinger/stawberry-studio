"""Turn every blind-reviewed frame's questions into SemIf's JSONL input.

    PYTHONPATH=. venv/bin/python autoloop/semif/make_input.py   # on the Mac, where the store lives

One row per (frame, question). The image path is relative to the repo root so the file works on any
machine that has pulled the branch. Questions that need a second image (matches a reference sheet,
continues the previous frame) are skipped here: SemIf takes one image per row. They come back in
the next experiment, on a stitched side-by-side canvas.
"""
import json
from pathlib import Path

from backend.studio.service import Studio
from backend.studio.store import Store

STATE = ("A single storyboard frame, printed as a woodblock relief print: flat black ink, warm paper, "
         "one cold spot blue. Answer only from what is visible in the attached image.")
OPTIONS = [
    {"id": "yes", "description": "Yes — looking at the image, this is plainly so."},
    {"id": "no", "description": "No — looking at the image, this is not so."},
    {"id": "not_visible", "description": "Cannot be judged — the thing asked about is out of frame, hidden, or too small to see."},
]
TWO_IMAGE = ("matches_sheet", "continues")

studio = Studio(Store(Path("autoloop/store")))
plan = json.loads(Path("autoloop/scratch/stranger/plan.json").read_text())
rows, skipped = [], 0
for p in plan:
    for q in studio.facts(p["cut"], p["media"])["questions"]:
        if q["id"].startswith(TWO_IMAGE):
            skipped += 1
            continue
        rows.append({
            "id": f"cut{p['n']}|{q['id']}",
            "state": STATE,
            "question": q["question"],
            "options": OPTIONS,
            "Image": p["frame"],  # repo-relative: autoloop/store/media/<sha>.png
        })
out = Path("autoloop/semif/frames.jsonl")
out.write_text("\n".join(json.dumps(r) for r in rows) + "\n")
# the key for comparing afterwards: which media each cut row belongs to
Path("autoloop/semif/plan.json").write_text(json.dumps(
    [{"n": p["n"], "name": p["name"], "cut": p["cut"], "media": p["media"]} for p in plan], indent=1))
print(f"{len(rows)} rows across {len(plan)} frames; {skipped} two-image questions skipped -> {out}")
