"""An independent judge that reads probabilities instead of writing scores.

Calls the image-judge host (spec: Engram projects/strawberry-studio/specs/2026-09-image-judge-host.md):
`POST /judge` returns, for each declared-fact question, the model's probability of answering
"yes" versus "no" — read from its next-token distribution, never generated as prose. That is the
fix the published work points to for judges that rank correctly but score generously, and the
failure a blind review found in this harness's own host-written scores.

The result is recorded as a `stranger` evaluation — an independent second record beside the host's
`facts` — so the gate's existing disagreement and floor rules apply to it unchanged.

Configuration comes from the environment, never from the repo:
    JUDGE_URL      e.g. https://judge.metalfinger.xyz
    JUDGE_API_KEY  the bearer key set on the host
"""

from __future__ import annotations

import base64
import os
import time
from pathlib import Path

import httpx

from backend.studio.models import EvaluationCreate, Evidence
from backend.studio.store import StudioError

EVALUATOR = "remote:judge-host"
VERSION = "judge-v1"
# questions that need a second image (a reference sheet, the previous frame) are not asked here:
# /judge takes one image per request
TWO_IMAGE = ("matches_sheet", "continues")
DEFAULT_CONTEXT = "Answer only from what is visible in the attached image."


class JudgeClient:
    def __init__(self, url: str | None = None, key: str | None = None, timeout: float = 120.0,
                 transport: httpx.BaseTransport | None = None):
        self.url = (url or os.environ.get("JUDGE_URL", "")).rstrip("/")
        self.key = key or os.environ.get("JUDGE_API_KEY", "")
        if not self.url or not self.key:
            raise StudioError("judge_unconfigured", "Set JUDGE_URL and JUDGE_API_KEY to use the remote judge")
        self.http = httpx.Client(base_url=self.url, timeout=timeout, transport=transport,
                                 headers={"Authorization": f"Bearer {self.key}"})

    @staticmethod
    def _image(path: str | Path) -> str:
        return base64.b64encode(Path(path).read_bytes()).decode("ascii")

    def _post(self, route: str, payload: dict) -> dict:
        response = self.http.post(route, json=payload)
        if response.status_code == 401:
            raise StudioError("judge_unauthorized", "The judge host rejected the key", 401)
        if response.status_code >= 400:
            raise StudioError("judge_failed", f"{route} returned {response.status_code}: {response.text[:200]}", 502)
        return response.json()

    def health(self) -> dict:
        response = self.http.get("/health")
        response.raise_for_status()
        return response.json()

    def judge(self, image: str | Path, questions: list[dict], context: str = DEFAULT_CONTEXT) -> dict:
        """questions: [{"id", "text"}] -> {"model", "answers": [{"id", "p_yes", "p_no", "ms"}], ...}"""
        return self._post("/judge", {"image": self._image(image), "questions": questions, "context": context})

    def locate(self, image: str | Path, nouns: list[str], threshold: float = 0.5, masks: bool = False) -> dict:
        return self._post("/locate", {"image": self._image(image), "nouns": nouns,
                                      "threshold": threshold, "masks": masks})


def evaluate_remote(studio, media_id: str, client: JudgeClient | None = None, context: str = DEFAULT_CONTEXT):
    """Ask every single-image question of one take and record the answers as a stranger evaluation."""
    client = client or JudgeClient()
    detail = studio.media(media_id)
    media = detail["media"]
    questions = [q for q in studio.facts(media["node_id"], media_id)["questions"]
                 if not q["id"].startswith(TWO_IMAGE)]
    if not questions:
        return None
    started = time.perf_counter()
    result = client.judge(studio.store.media_dir / media["path"],
                          [{"id": q["id"], "text": q["question"]} for q in questions], context)
    wall_ms = round((time.perf_counter() - started) * 1000)
    by_id = {q["id"]: q for q in questions}
    evidence = []
    for answer in result.get("answers", []):
        q = by_id.get(answer.get("id"))
        if not q:
            continue
        p_yes, p_no = float(answer["p_yes"]), float(answer["p_no"])
        p = p_yes / (p_yes + p_no) if p_yes + p_no > 0 else 0.5
        evidence.append(Evidence(
            question=q["question"], answer="yes" if p >= 0.5 else "no", probability=round(p, 4),
            asset_id=q["asset_id"], question_id=q["id"],
            # the model judges the whole frame; say so, since evidence must name what was inspected
            region=f"whole frame, P(yes) from {result.get('model', 'judge')} in {answer.get('ms', '?')} ms"))
    missing = sorted(set(by_id) - {e.question_id for e in evidence})
    record = studio.evaluate(media_id, EvaluationCreate(
        expected_context=detail["review_context"], evaluator=EVALUATOR, version=VERSION, kind="stranger",
        evidence=evidence, confidence=None, discrepancies=[]))
    return {**record, "timing": {"wall_ms": wall_ms, "server_ms": result.get("total_ms"),
                                 "image_ms": result.get("image_ms"), "questions": len(evidence)},
            "unanswered": missing, "skipped_two_image": len(studio.facts(media["node_id"], media_id)["questions"])
            - len(questions)}
