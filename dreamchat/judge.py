"""Ask the image judge on the PC about one take, and record its answers in Strawberry.

    venv/bin/python dreamchat/judge.py STORE_HOME MEDIA_ID     (from the repo root)

Uses the engine's own remote judge (backend/studio/evaluators/remote_judge.py): every
single-image question of the take's declared facts, answered as P(yes) by the judge host, and
recorded as a stranger evaluation beside the take. Prints a short summary as JSON. Needs
JUDGE_URL and JUDGE_API_KEY in the environment.
"""

import json
import sys
from pathlib import Path

from backend.studio.evaluators.remote_judge import JudgeClient, evaluate_remote
from backend.studio.service import Studio
from backend.studio.store import Store

studio = Studio(Store(Path(sys.argv[1])))
record = evaluate_remote(studio, sys.argv[2], JudgeClient(timeout=240))
if record is None:
    print(json.dumps({"questions": 0, "passed": 0, "failed": []}))
    sys.exit(0)
evidence = record.get("evidence") or []
failed = [e for e in evidence if e.get("answer") == "no"]
print(
    json.dumps(
        {
            "questions": len(evidence),
            "passed": len(evidence) - len(failed),
            "failed": [e.get("question", "") for e in failed][:8],
            "model": (evidence[0].get("region", "").split(" from ")[-1].split(" in ")[0] if evidence else None),
            "ms": record.get("timing", {}).get("wall_ms"),
        }
    )
)
