"""Put every judge run side by side: the 8B, the 27B with thinking off, the 27B with thinking on.

    PYTHONPATH=. venv/bin/python autoloop/judge_tests/compare_models.py

Ice head: on the questions where the host and the blind evaluator disagreed, which side each model
takes, plus overall agreement with the blind evaluator. Thinking runs: how often the reasoning hit
the host's token cap, and whether capped answers agree with the blind evaluator less often.
Nine O'Clock: every question where any model answered no.
"""
import json
from pathlib import Path

from backend.studio.service import Studio
from backend.studio.store import Store

HERE = Path("autoloop/judge_tests")
RUNS = {"8b": Path("autoloop/semif/results_qwen8b.jsonl"),
        "27b": HERE / "results_qwen35-27b_ice.jsonl",
        "27b-think": HERE / "results_qwen35-27b-think_ice.jsonl"}
NINE = {"8b": HERE / "nine_oclock_results.json",
        "27b": HERE / "results_qwen35-27b_nine.json",
        "27b-think": HERE / "results_qwen35-27b-think_nine.json"}


def verdict(p):
    return "nv" if p is None else ("yes" if p >= 0.5 else "no")


def load(path):
    out = {}
    for line in path.read_text().splitlines():
        if line.strip():
            r = json.loads(line)
            cut, qid = r["id"].split("|", 1)
            total = r["yes"] + r["no"]
            out[(cut, qid)] = {**r, "p": r["yes"] / total if total > 0 else 0.5}
    return out


studio = Studio(Store(Path("autoloop/store")))
plan = {f"cut{p['n']}": p for p in json.loads(Path("autoloop/semif/plan.json").read_text())}
host, blind = {}, {}
for cut, p in plan.items():
    history = studio.evaluations(p["media"])
    h = next(e for e in history if e["kind"] == "facts")
    b = next(e for e in history if e["kind"] == "stranger" and e["evaluator"] == "stranger:general-purpose")
    for rec, dest in ((h, host), (b, blind)):
        for e in rec["evidence"]:
            dest[(cut, e["question_id"])] = None if e.get("not_visible") else e.get("probability")

runs = {name: load(path) for name, path in RUNS.items() if path.exists()}
keys = sorted(set(host) & set(blind) & set.intersection(*(set(r) for r in runs.values())))
contested = [k for k in keys if verdict(host[k]) != verdict(blind[k])]

print(f"Ice head: {len(keys)} questions answered by every model, {len(contested)} contested (host vs blind)\n")
print(f"{'':12}" + "".join(f"{n:>12}" for n in runs))
for label, fn in (("= blind", lambda k, r: verdict(r[k]["p"]) == verdict(blind[k])),
                  ("= host", lambda k, r: verdict(r[k]["p"]) == verdict(host[k]))):
    print(f"{'all ' + label:12}" + "".join(f"{sum(fn(k, r) for k in keys):>9}/{len(keys)}" for r in runs.values()))
    print(f"{'contested ' + label:12}" + "".join(f"{sum(fn(k, r) for k in contested):>10}/{len(contested)}"
                                                   for r in runs.values()))
print("\n  cut    question         host blind " + " ".join(f"{n:>10}" for n in runs))
for k in contested:
    cells = " ".join(f"{verdict(r[k]['p']):>4} {r[k]['p']:.2f}".rjust(10) for r in runs.values())
    print(f"  {k[0]:6} {k[1].split(':')[0]:16} {verdict(host[k]):4} {verdict(blind[k]):5} {cells}")

if "27b-think" in runs:
    t = runs["27b-think"]
    capped = [k for k in keys if t[k].get("reasoning_capped")]
    free = [k for k in keys if not t[k].get("reasoning_capped")]
    def agree(ks):
        return sum(verdict(t[k]["p"]) == verdict(blind[k]) for k in ks)
    ms = sorted(x["think_ms"] for x in t.values() if x.get("think_ms"))
    print(f"\nThinking run: reasoning capped on {len(capped)}/{len(keys)} ice-head answers")
    print(f"  agreement with blind: capped {agree(capped)}/{len(capped)}, not capped {agree(free)}/{len(free)}")
    print(f"  contested and capped: {sum(1 for k in contested if k in capped)}/{len(contested)}")
    if ms:
        print(f"  think_ms median {ms[len(ms) // 2]}, max {ms[-1]}")

print("\nNine O'Clock: every question any model answered no (P(yes))")
nine = {n: json.loads(p.read_text()) for n, p in NINE.items() if p.exists()}
by = {n: {(f["n"], r["id"]): r for f in frames for r in f["rows"]} for n, frames in nine.items()}
common = set.intersection(*(set(v) for v in by.values()))
flagged = sorted(k for k in common if any(v[k]["p_yes"] < 0.5 for v in by.values()))
print(f"  {'frame':5} {'question':28}" + "".join(f"{n:>11}" for n in by))
for k in flagged:
    print(f"  {k[0]:<5} {k[1][:28]:28}" + "".join(f"{v[k]['p_yes']:>11.2f}" for v in by.values()))
for n, v in by.items():
    capped = sum(1 for k in common if v[k].get("reasoning_capped"))
    print(f"  {n}: {sum(v[k]['p_yes'] < 0.5 for k in common)}/{len(common)} answered no"
          + (f", reasoning capped on {capped}" if n.endswith("think") else ""))
