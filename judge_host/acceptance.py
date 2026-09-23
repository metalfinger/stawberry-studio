"""Run the six acceptance tests from the spec against a judge-host URL.

    JUDGE_API_KEY=... python judge_host/acceptance.py https://judge.metalfinger.xyz

Run from the repo root (frame paths in autoloop/semif/frames.jsonl are relative to it).
Writes autoloop/semif/results_qwen.jsonl and prints the timing table.
Standard library only, so it runs from any Python on either side.
"""
import base64
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8001").rstrip("/")
KEY = os.environ["JUDGE_API_KEY"]
FRAMES = Path("autoloop/semif/frames.jsonl")
OUT = Path("autoloop/semif/results_qwen.jsonl")
AUTOCLAVE = "autoloop/store/media/1c16c6f7f2480ceda664e469c2b795f6e455616d1a26fc577c9ead1e849d7983.png"
LOCATE_NOUNS = ["woman", "autoclave", "hand", "boot"]


def call(method, path, body=None, key=KEY):
    headers = {"Content-Type": "application/json", "User-Agent": "judge-host-acceptance"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, None


def b64(path):
    return base64.b64encode(Path(path).read_bytes()).decode()


def check(n, ok, detail):
    print(f"[{'PASS' if ok else 'FAIL'}] {n}. {detail}")
    return ok


rows = [json.loads(line) for line in FRAMES.read_text().splitlines() if line.strip()]
by_frame = defaultdict(list)
for r in rows:
    by_frame[r["Image"]].append(r)

passed = []

# 1. health
status, h = call("GET", "/health")
passed.append(check(1, status == 200 and h["ok"] and all(h["models"].values()),
                    f"/health {status}: {h}"))

# 2. no key -> 401, on every endpoint and with a wrong key
codes = [call("GET", "/health", key=None)[0], call("POST", "/judge", {}, key=None)[0],
         call("POST", "/locate", {}, key=None)[0], call("GET", "/health", key="wrong")[0],
         call("GET", "/docs", key=None)[0]]
passed.append(check(2, all(c == 401 for c in codes), f"unauthenticated codes {codes}"))

# 3. five questions on one frame; runs on the last frame so test 5's first frame starts cold
image, frame_rows = list(by_frame.items())[-1]
warm_image = image  # its prefix is cached after this, so it is left out of the timing table
status, j = call("POST", "/judge", {"image": b64(image), "context": frame_rows[0]["state"],
                                     "questions": [{"id": r["id"], "text": r["question"]} for r in frame_rows[:5]]})
ok = status == 200 and len(j["answers"]) == 5 and all(abs(a["p_yes"] + a["p_no"] - 1) < 1e-3 for a in j["answers"])
passed.append(check(3, ok, f"/judge 5 questions: {[(round(a['p_yes'], 3), a['ms']) for a in j['answers']] if j else status}"))

# 4. SAM 3 finds the woman and the autoclave
status, loc = call("POST", "/locate", {"image": b64(AUTOCLAVE), "nouns": ["woman", "autoclave"]})
counts = {r["noun"]: r["count"] for r in loc["results"]} if loc else {}
passed.append(check(4, status == 200 and all(counts.get(n, 0) >= 1 for n in ("woman", "autoclave")),
                    f"/locate counts {counts} in {loc and loc['total_ms']} ms"))

# 5. all 208 questions, one /judge call per frame
timings, out = [], []
for image, frame_rows in by_frame.items():
    t0 = time.perf_counter()
    status, j = call("POST", "/judge", {"image": b64(image), "context": frame_rows[0]["state"],
                                         "questions": [{"id": r["id"], "text": r["question"]} for r in frame_rows]})
    assert status == 200, (image, status)
    out += [{"id": a["id"], "yes": a["p_yes"], "no": a["p_no"], "ms": a["ms"]} for a in j["answers"]]
    n = len(j["answers"])
    if image == warm_image:
        continue
    timings.append({"n": n, "wall_ms": round((time.perf_counter() - t0) * 1000), "image_ms": j["image_ms"], "total_ms": j["total_ms"],
                    "per_q_ms": (j["total_ms"] - j["image_ms"]) / max(n - 1, 1)})
OUT.write_text("".join(json.dumps(r) + "\n" for r in out))
ids_ok = sorted(r["id"] for r in out) == sorted(r["id"] for r in rows)
passed.append(check(5, ids_ok and len(out) == len(rows), f"{len(out)} rows written to {OUT}"))

# 6. timing table (locate: 4 nouns on every frame, first call discarded as warm-up)
loc_ms, loc_wall = [], []
for image in by_frame:
    t0 = time.perf_counter()
    loc_ms.append(call("POST", "/locate", {"image": b64(image), "nouns": LOCATE_NOUNS})[1]["total_ms"])
    loc_wall.append(round((time.perf_counter() - t0) * 1000))
med = statistics.median
table = f"""| measure | median | min | max |
|---|---|---|---|
| /judge first question (image encode + 1 question), ms | {med(t['image_ms'] for t in timings):.0f} | {min(t['image_ms'] for t in timings)} | {max(t['image_ms'] for t in timings)} |
| /judge each further question (marginal, concurrent), ms | {med(t['per_q_ms'] for t in timings):.0f} | {min(t['per_q_ms'] for t in timings):.0f} | {max(t['per_q_ms'] for t in timings):.0f} |
| /judge whole 26-question frame, ms | {med(t['total_ms'] for t in timings):.0f} | {min(t['total_ms'] for t in timings)} | {max(t['total_ms'] for t in timings)} |
| /judge whole 26-question frame, client round trip, ms | {med(t['wall_ms'] for t in timings):.0f} | {min(t['wall_ms'] for t in timings)} | {max(t['wall_ms'] for t in timings)} |
| /locate 4 nouns, ms | {med(loc_ms[1:]):.0f} | {min(loc_ms[1:])} | {max(loc_ms[1:])} |
| /locate 4 nouns, client round trip, ms | {med(loc_wall[1:]):.0f} | {min(loc_wall[1:])} | {max(loc_wall[1:])} |"""
print(f"\nTimings via {BASE} ({len(timings)} cold frames, {sum(t['n'] for t in timings)} questions; "
      f"server-side unless marked round trip):\n{table}")
passed.append(check(6, True, "timing table above"))

print(f"\n{sum(passed)}/6 passed")
sys.exit(0 if all(passed) else 1)
