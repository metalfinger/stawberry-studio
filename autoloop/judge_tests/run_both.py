"""Rerun both judge test sets against whatever model the host is serving now.

    source ~/.config/strawberry/judge.env
    PYTHONPATH=. venv/bin/python autoloop/judge_tests/run_both.py <label> [--think]

Writes, per label (e.g. qwen35-27b, qwen35-27b-think):
  autoloop/judge_tests/results_<label>_nine.json   the 94 prompt-derived questions, 3 Nine O'Clock frames
  autoloop/judge_tests/results_<label>_ice.jsonl   the 208 ice-head questions, compare.py format
The earlier Qwen3-VL-8B runs stay where they are, so every model can be compared on the same questions.
"""
import json
import sys
import time
from pathlib import Path

from backend.studio.evaluators.remote_judge import JudgeClient

label = sys.argv[1]
think = "--think" in sys.argv
client = JudgeClient(timeout=1800.0)
print("host:", client.health().get("models"), "| think:", think)
here = Path("autoloop/judge_tests")

# 1. Nine O'Clock — 3 frames, 94 questions
spec = json.loads((here / "nine_oclock_questions.json").read_text())
nine = []
for f in spec["frames"]:
    t0 = time.perf_counter()
    r = client.judge(f["image"], [{"id": q["id"], "text": q["text"]} for q in f["questions"]], spec["context_sent"], think)
    by = {a["id"]: a for a in r["answers"]}
    rows = [{**q, "p_yes": round(by[q["id"]]["p_yes"], 4), "ms": by[q["id"]].get("ms"),
             "reasoning": by[q["id"]].get("reasoning")} for q in f["questions"] if q["id"] in by]
    nine.append({"n": f["n"], "name": f["name"], "image": f["image"], "model": r.get("model"), "think": think,
                 "server_ms": r.get("total_ms"), "wall_ms": round((time.perf_counter() - t0) * 1000), "rows": rows})
    print(f"nine frame {f['n']:2}: {len(rows)} answers, server {r.get('total_ms')} ms, "
          f"no -> {[x['id'] for x in rows if x['p_yes'] < 0.5]}")
(here / f"results_{label}_nine.json").write_text(json.dumps(nine, indent=1))

# 2. Ice head — 8 frames, 208 questions (grouped by frame, one request per frame)
frames = {}
for line in Path("autoloop/semif/frames.jsonl").read_text().splitlines():
    row = json.loads(line)
    frames.setdefault(row["Image"], []).append(row)
out = []
for image, rows in frames.items():
    t0 = time.perf_counter()
    r = client.judge(image, [{"id": x["id"], "text": x["question"]} for x in rows],
                     "Answer only from what is visible in the attached image.", think)
    for a in r["answers"]:
        out.append({"id": a["id"], "yes": a["p_yes"], "no": a["p_no"], "ms": a.get("ms"), "reasoning": a.get("reasoning")})
    print(f"ice {Path(image).name[:10]}: {len(r['answers'])} answers, {round((time.perf_counter() - t0) * 1000)} ms")
(here / f"results_{label}_ice.jsonl").write_text("\n".join(json.dumps(x) for x in out) + "\n")
print("done:", here / f"results_{label}_nine.json", here / f"results_{label}_ice.jsonl")
