"""Compare SemIf's answers with the host's (Claude's) and the blind evaluator's, question by question.

    PYTHONPATH=. venv/bin/python autoloop/semif/compare.py autoloop/semif/results.jsonl   # on the Mac

The number that matters is on the questions where the host and the blind evaluator DISAGREED:
which side does an independent, probability-reading model come down on? If it sides with the blind
evaluator most of the time, it can replace the host as the judge; if it sides with the host, it has
the same generosity and is no use to us.
"""
import json
import sys
from pathlib import Path

from backend.studio.service import Studio
from backend.studio.store import Store

OPTS = ("yes", "no", "not_visible")


def option_probs(record):
    """SemIf's output format is not documented in detail; find {option_id: probability} wherever it is."""
    found = {}

    def walk(x):
        if isinstance(x, dict):
            if all(k in x for k in ("yes", "no")) and all(isinstance(x[k], (int, float)) for k in ("yes", "no")):
                found.update({k: float(x[k]) for k in OPTS if isinstance(x.get(k), (int, float))})
                return
            oid = x.get("id") or x.get("option") or x.get("option_id")
            prob = next((x[k] for k in ("probability", "prob", "p", "score") if isinstance(x.get(k), (int, float))), None)
            if oid in OPTS and prob is not None:
                found[oid] = float(prob)
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    walk({k: v for k, v in record.items() if k not in ("state", "question", "options")})
    return found


def verdict(p):
    """yes / no / nv from a probability, None meaning 'not visible'."""
    return "nv" if p is None else ("yes" if p >= 0.5 else "no")


results_path = Path(sys.argv[1] if len(sys.argv) > 1 else "autoloop/semif/results.jsonl")
studio = Studio(Store(Path("autoloop/store")))
plan = {f"cut{p['n']}": p for p in json.loads(Path("autoloop/semif/plan.json").read_text())}

theirs = {}
unparsed = 0
for line in results_path.read_text().splitlines():
    if not line.strip():
        continue
    rec = json.loads(line)
    probs = option_probs(rec)
    if "yes" not in probs or "no" not in probs:
        unparsed += 1
        if unparsed == 1:
            print("Could not find option probabilities in this record — adjust option_probs():\n", json.dumps(rec)[:800])
        continue
    cut, qid = rec["id"].split("|", 1)
    nv = probs.get("not_visible", 0.0)
    if nv > max(probs["yes"], probs["no"]):
        theirs[(cut, qid)] = None
    else:
        theirs[(cut, qid)] = probs["yes"] / (probs["yes"] + probs["no"])

rows, agree_blind, agree_host, contested, side_blind, side_host = [], 0, 0, 0, 0, 0
for key, semif in theirs.items():
    cut, qid = key
    # pick the records by who wrote them, not by recency: a remote judge recorded later is also a
    # "stranger", and must not quietly replace the blind reviewer this comparison is anchored on
    history = studio.evaluations(plan[cut]["media"])
    host_rec = next(e for e in history if e["kind"] == "facts")
    blind_rec = next(e for e in history if e["kind"] == "stranger" and e["evaluator"] == "stranger:general-purpose")
    host = {e["question_id"]: (None if e.get("not_visible") else e.get("probability")) for e in host_rec["evidence"]}
    blind = {e["question_id"]: (None if e.get("not_visible") else e.get("probability")) for e in blind_rec["evidence"]}
    if qid not in host or qid not in blind:
        continue
    s, h, b = verdict(semif), verdict(host[qid]), verdict(blind[qid])
    agree_blind += s == b
    agree_host += s == h
    if h != b:
        contested += 1
        side_blind += s == b
        side_host += s == h
        rows.append((cut, qid.split(":")[0], h, b, s, semif))

n = len(theirs)
print(f"\nSemIf answered {n} questions ({unparsed} unparsed)")
print(f"  agrees with the BLIND evaluator on {agree_blind}/{n} ({agree_blind / max(n, 1):.0%})")
print(f"  agrees with the HOST (Claude)    on {agree_host}/{n} ({agree_host / max(n, 1):.0%})")
print(f"\nOn the {contested} questions where host and blind DISAGREED:")
print(f"  SemIf sides with blind: {side_blind}   with host: {side_host}   with neither: {contested - side_blind - side_host}")
print("\n  cut    question        host  blind semif  P(yes)")
for cut, q, h, b, s, p in sorted(rows):
    print(f"  {cut:6} {q:15} {h:5} {b:5} {s:5}  {'—' if p is None else f'{p:.2f}'}")
