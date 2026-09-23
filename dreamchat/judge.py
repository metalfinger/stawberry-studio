"""Ask the image judge on the PC about one take, and record its answers in Strawberry.

    venv/bin/python dreamchat/judge.py STORE_HOME MEDIA_ID [--facts]     (from the repo root)

Uses the engine's own remote judge (backend/studio/evaluators/remote_judge.py): every
single-image question of the take's declared facts, answered as P(yes) by the judge host, and
recorded as a stranger evaluation beside the take. Prints a short summary as JSON. Needs
JUDGE_URL and JUDGE_API_KEY in the environment.

    venv/bin/python dreamchat/judge.py STORE_HOME --continuity < CHECKS_JSON

Continuity: {"media": ID, "checks": [{"with": EARLIER_MEDIA_ID or null, "text": question}]}.
A check against an earlier picture is asked of the two side by side (the earlier on the left),
since the judge host takes one image per request; a check with no earlier picture is asked of
the take alone. Prints the same short summary.
"""

import json
import sys
from pathlib import Path

from backend.studio.evaluators.remote_judge import JudgeClient, evaluate_remote
from backend.studio.service import Studio
from backend.studio.store import Store

studio = Studio(Store(Path(sys.argv[1])))


def continuity(request):
    """Ask each continuity check of the take, beside the earlier picture it compares with."""
    import tempfile
    import time

    from PIL import Image

    client = JudgeClient(timeout=240)
    media_dir = studio.store.media_dir
    path = lambda media_id: media_dir / studio.media(media_id)["media"]["path"]  # noqa: E731
    take = path(request["media"])
    groups = {}
    for check in request["checks"]:
        groups.setdefault(check.get("with"), []).append(check["text"])
    started, answers = time.perf_counter(), []
    with tempfile.TemporaryDirectory() as tmp:
        for earlier, texts in groups.items():
            image, context = take, "Answer only from what is visible in the attached image."
            if earlier:
                a, b = Image.open(path(earlier)).convert("RGB"), Image.open(take).convert("RGB")
                height = min(a.height, b.height, 768)
                a = a.resize((round(a.width * height / a.height), height))
                b = b.resize((round(b.width * height / b.height), height))
                pair = Image.new("RGB", (a.width + b.width + 24, height), "white")
                pair.paste(a, (0, 0))
                pair.paste(b, (a.width + 24, 0))
                image = Path(tmp) / f"pair-{earlier}.png"
                pair.save(image)
                context = (
                    "Two pictures from one storyboard, side by side: the first picture is on the left, the second "
                    "picture, drawn after it, is on the right. Answer only from what is visible in them."
                )
            result = client.judge(image, [{"id": f"q{i}", "text": t} for i, t in enumerate(texts)], context)
            by_id = {f"q{i}": t for i, t in enumerate(texts)}
            for answer in result.get("answers", []):
                p_yes, p_no = float(answer["p_yes"]), float(answer["p_no"])
                p = p_yes / (p_yes + p_no) if p_yes + p_no > 0 else 0.5
                answers.append({"question": by_id.get(answer.get("id"), ""), "p": round(p, 3), "model": result.get("model")})
    failed = [a for a in answers if a["p"] < 0.5]
    print(
        json.dumps(
            {
                "questions": len(answers),
                "passed": len(answers) - len(failed),
                "failed": [f"{a['question']} ({a['p']:.2f})" for a in failed][:8],
                "model": answers[0]["model"] if answers else None,
                "ms": round((time.perf_counter() - started) * 1000),
            }
        )
    )


if sys.argv[2] == "--continuity":
    continuity(json.load(sys.stdin))
    sys.exit(0)

# A moment's check is its facts record: the chat approves a moment for continuity only on it.
kind = "facts" if "--facts" in sys.argv[3:] else "stranger"
record = evaluate_remote(studio, sys.argv[2], JudgeClient(timeout=240), kind=kind)
if record is None:
    print(json.dumps({"questions": 0, "passed": 0, "failed": [], "unseen": []}))
    sys.exit(0)
evidence = record.get("evidence") or []
failed = [e for e in evidence if e.get("answer") == "no"]
PRESENCE = ("cast", "location", "prop", "subject")
print(
    json.dumps(
        {
            "questions": len(evidence),
            "passed": len(evidence) - len(failed),
            "failed": [e.get("question", "") for e in failed][:8],
            # Who or what in the take the judge could not see at all.
            "unseen": [e.get("question", "") for e in failed if (e.get("question_id") or "").split(":")[0] in PRESENCE],
            "model": (evidence[0].get("region", "").split(" from ")[-1].split(" in ")[0] if evidence else None),
            "ms": record.get("timing", {}).get("wall_ms"),
        }
    )
)
