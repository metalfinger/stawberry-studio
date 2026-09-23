"""Record a blind evaluator's JSON as a kind="stranger" evaluation and compare it with the host's.

    PYTHONPATH=. venv/bin/python autoloop/record_stranger.py N   # reads autoloop/scratch/stranger/resultN.json

The stranger sees the image, the question list and the reference sheets, nothing else. Its record
sits beside the host's facts record; take_status already refuses a take when the two disagree by
more than 0.25 or the stranger's own score is below policy. This only transcribes — it never edits
an answer.
"""
import json
import sys
from pathlib import Path

from backend.studio.models import Discrepancy, EvaluationCreate, Evidence
from backend.studio.service import Studio
from backend.studio.store import Store

n = sys.argv[1]
plan = {str(p["n"]): p for p in json.loads(Path("autoloop/scratch/stranger/plan.json").read_text())}[n]
raw = Path(f"autoloop/scratch/stranger/result{n}.json").read_text().strip()
raw = raw[raw.index("{"): raw.rindex("}") + 1]
result = json.loads(raw)

studio = Studio(Store(Path("autoloop/store")))
media = plan["media"]
questions = {q["id"]: q for q in studio.facts(plan["cut"], media)["questions"]}
evidence, missing = [], set(questions)
for a in result["answers"]:
    q = questions.get(a.get("id"))
    if not q:
        continue
    missing.discard(q["id"])
    unseen = bool(a.get("not_visible")) or a.get("probability") is None
    where = " — ".join(x for x in (a.get("measured"), a.get("where")) if x)[:240] or "frame"
    evidence.append(Evidence(question=q["question"], answer="not visible" if unseen else
                             ("yes" if a["probability"] >= 0.5 else "no"),
                             probability=None if unseen else float(a["probability"]), not_visible=unseen,
                             asset_id=q["asset_id"], question_id=q["id"], region=where))
discrepancies = [Discrepancy(tag="other", region=(p.get("where") or "")[:240],
                             note=f"[{p.get('severity','?')}] [{p.get('introduced_or_inherited','?')[:40]}] {p['what']}"[:1000])
                 for p in result.get("unasked_problems", [])]
detail = studio.media(media)
rec = studio.evaluate(media, EvaluationCreate(
    expected_context=detail["review_context"], evaluator="stranger:general-purpose", version="blind-v2",
    kind="stranger", evidence=evidence, confidence=0.85, discrepancies=discrepancies))
mine = detail["media"]["evaluations"]["facts"]["scores"]
theirs = rec["scores"]
take = studio.repair(plan["cut"])["take"]
print(json.dumps({
    "cut": f"{n} {plan['name']}",
    "mine": mine["min_group"], "stranger": theirs["min_group"],
    "gap": round(abs(mine["min_group"] - theirs["min_group"]), 3),
    "stranger_capped": bool(theirs["capped"]),
    "stranger_groups": theirs["groups"],
    "unanswered": sorted(missing),
    "unasked_high": [p["what"][:140] for p in result.get("unasked_problems", []) if p.get("severity") == "high"],
    "accepted_now": take["accepted"], "reasons": take["reasons"],
    "overall": result.get("overall", ""),
}, indent=1))
