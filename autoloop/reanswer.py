"""Carry a facts record forward onto the current rubric, answering only what is new.

    PYTHONPATH=. venv/bin/python autoloop/reanswer.py new_answers.json

new_answers.json: {"<media_id>": {"<question id or prefix>": [probability|null, "where you looked"]}}

This harness adds questions as it learns what nobody asked, which leaves earlier frames graded
against a weaker rubric — `take_status` says so. Re-answering everything by hand would be worse
than the problem: the old answers were looked at, and retyping them invites drift. So carry the
matching evidence forward verbatim and answer only the questions that did not exist yet.
"""
import json
import sys
from pathlib import Path

from backend.studio.models import EvaluationCreate, Evidence
from backend.studio.service import Studio
from backend.studio.store import Store

studio = Studio(Store(Path("autoloop/store")))
for media_id, new in json.loads(Path(sys.argv[1]).read_text()).items():
    detail = studio.media(media_id)
    node_id = detail["media"]["node_id"]
    previous = detail["media"]["evaluations"].get("facts")
    if not previous:
        raise SystemExit(f"{media_id}: no facts record to carry forward")
    questions = {q["id"]: q for q in studio.facts(node_id, media_id)["questions"]}
    carried = {e["question_id"]: e for e in previous["evidence"] if e.get("question_id") in questions}
    answers = {}
    for key, value in new.items():
        matches = [q for q in questions if q == key or q.startswith(key + ":")]
        if len(matches) != 1:
            raise SystemExit(f"{media_id}: {key!r} matched {matches}")
        answers[matches[0]] = value
    missing = set(questions) - set(carried) - set(answers)
    if missing:
        raise SystemExit(f"{media_id}: the current rubric asks {sorted(missing)} and nothing answers them")
    evidence = []
    for qid, q in questions.items():
        if qid in answers:
            probability, where = answers[qid]
            evidence.append(Evidence(question=q["question"], answer="not visible" if probability is None
                                     else ("yes" if probability >= 0.5 else "no"),
                                     probability=probability, not_visible=probability is None,
                                     asset_id=q["asset_id"], question_id=qid, region=where[:240]))
        else:
            e = carried[qid]
            evidence.append(Evidence(question=q["question"], answer=e["answer"], probability=e.get("probability"),
                                     not_visible=e.get("not_visible", False), asset_id=e.get("asset_id"),
                                     question_id=qid, region=e.get("region")))
    record = studio.evaluate(media_id, EvaluationCreate(
        expected_context=detail["review_context"], evaluator=previous["evaluator"],
        version=previous["version"] + "+carried", kind="facts", evidence=evidence,
        confidence=previous.get("confidence"), discrepancies=previous["discrepancies"]))
    status = studio.rules_take_status if False else None
    # A judge record goes stale with the definition exactly as the facts record does, and a judge
    # note about an unchanged image is still true when only the rubric moved. Carry it too, or the
    # take reads as unevaluated however carefully its facts were re-answered.
    judge = detail["media"]["evaluations"].get("judge")
    if judge:
        studio.evaluate(media_id, EvaluationCreate(
            expected_context=detail["review_context"], evaluator=judge["evaluator"],
            version=judge["version"] + "+carried", kind="judge",
            scores={k: v for k, v in judge["scores"].items() if k in {"sc", "pq"}},
            evidence=[Evidence(question=e["question"], answer=e["answer"], probability=e.get("probability"),
                               asset_id=e.get("asset_id"), region=e.get("region")) for e in judge["evidence"]],
            confidence=judge.get("confidence"), discrepancies=judge["discrepancies"]))
    print(f"{media_id[:8]} {record['scores']['min_group']:.2f} capped {int(record['scores']['capped'])} "
          f"answered {int(record['scores']['answered'])}+{int(record['scores']['not_visible'])} "
          f"of {int(record['scores']['asked'])} (was {int(previous['scores']['asked'])})")
