"""Run the remote image judge over takes, from any machine, through the public endpoint.

    JUDGE_URL=https://judge.<domain> JUDGE_API_KEY=... PYTHONPATH=. venv/bin/python autoloop/judge_remote.py --check
    ... autoloop/judge_remote.py --record MEDIA_ID [MEDIA_ID ...]

--check  health + one unauthenticated call (must be refused) + one timed /judge on a single frame,
         recording nothing. The client-side half of the host's acceptance tests.
--record ask every single-image question of each take and record it as a stranger evaluation.
"""
import json
import sys
import time
from pathlib import Path

import httpx

from backend.studio.evaluators.remote_judge import JudgeClient, evaluate_remote
from backend.studio.service import Studio
from backend.studio.store import Store

studio = Studio(Store(Path("autoloop/store")))
client = JudgeClient()
args = sys.argv[1:]

if not args or args[0] == "--check":
    print("health:", json.dumps(client.health()))
    anon = httpx.post(client.url + "/judge", json={"image": "", "questions": []}, timeout=30)
    print("unauthenticated /judge ->", anon.status_code, "(must be 401)")
    plan = json.loads(Path("autoloop/semif/plan.json").read_text())[0]
    media = studio.media(plan["media"])["media"]
    questions = [{"id": q["id"], "text": q["question"]}
                 for q in studio.facts(media["node_id"], media["id"])["questions"]][:5]
    started = time.perf_counter()
    out = client.judge(studio.store.media_dir / media["path"], questions)
    print(f"/judge 5 questions: wall {round((time.perf_counter() - started) * 1000)} ms, "
          f"server {out.get('total_ms')} ms, image {out.get('image_ms')} ms")
    for a in out["answers"]:
        print(f"  {a['id'][:40]:40} p_yes {a['p_yes']:.2f}  p_no {a['p_no']:.2f}  sum {a['p_yes'] + a['p_no']:.2f}")
elif args[0] == "--record":
    for media_id in args[1:]:
        r = evaluate_remote(studio, media_id, client)
        print(media_id[:8], "min_group", r["scores"]["min_group"], "capped", r["scores"]["capped"], "timing", r["timing"])
