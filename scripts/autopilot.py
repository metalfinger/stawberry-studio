"""Drive a production through generate → evaluate → gate → select, stopping only where pixels must be looked at.

    venv/bin/python -m scripts.autopilot step --home STORE PROJECT_ID [--cuts ID,ID] [--max-ticks N]

Requires `policy.autonomous` on the project. Everything deterministic is done here: approving
fresh recipes within `policy.credit_ceiling_per_take`, enqueueing, driving the worker, the
local duplicate check, writing an evidence-backed review and selecting a take that passes the
gate, and producing repair proposals when one does not. Two things are returned as tasks for
the host, because they need eyes or authorship: `evaluate` (answer the facts questions and
write a judge record) and `prepare` (write the next recipe from `candidates` and `repair`).
Nothing paid is retried automatically; a cut past `policy.max_takes_per_cut` stops.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from backend.studio.evaluators.duplicate import evaluate_duplicate
from backend.studio.models import Approval, MediaReview
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError
from backend.studio.worker import Worker


def story_order(studio, project_id):
    with studio.store.connection() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT c.* FROM nodes c JOIN nodes sh ON sh.id=c.parent_id JOIN nodes sc ON sc.id=sh.parent_id "
            "WHERE c.project_id=? AND c.kind='cut' ORDER BY sc.position, sh.position, c.position", (project_id,))]


def latest_recipe(studio, cut_id):
    with studio.store.connection() as conn:
        row = conn.execute("SELECT * FROM recipes WHERE node_id=? ORDER BY created_at DESC LIMIT 1", (cut_id,)).fetchone()
        job = conn.execute("SELECT * FROM jobs WHERE recipe_id=?", (row["id"],)).fetchone() if row else None
    return (studio.recipe(row["id"]) if row else None), (dict(job) if job else None)


def approve_within_policy(studio, recipe, pol, log):
    estimate = recipe["spec"].get("estimate") or {}
    credits = estimate.get("credits")
    if credits is None:
        if not pol["allow_unknown_cost"]:
            log.append({"recipe": recipe["id"], "skipped": "cost unknown and policy.allow_unknown_cost is false"})
            return None
        approval = Approval(fingerprint=recipe["fingerprint"], user_decision="autopilot: within policy, cost unknown acknowledged",
                            max_credits=None, allow_unknown_cost=True)
    else:
        if credits > pol["credit_ceiling_per_take"]:
            log.append({"recipe": recipe["id"], "skipped": f"estimate {credits} exceeds policy.credit_ceiling_per_take {pol['credit_ceiling_per_take']}"})
            return None
        approval = Approval(fingerprint=recipe["fingerprint"], user_decision="autopilot: within policy ceiling", max_credits=pol["credit_ceiling_per_take"])
    studio.approve(recipe["id"], approval)
    job = studio.enqueue(recipe["id"])
    log.append({"recipe": recipe["id"], "approved": True, "estimate": estimate, "job": job["id"]})
    return job


def drive_job(studio, job_id, max_ticks, clock=time.time, sleep=time.sleep, fake=False):
    worker = Worker(studio, allow_higgsfield=not fake, clock=clock)
    for _ in range(max_ticks):
        state = studio.job(job_id)["state"]
        if state in {"ready", "failed", "collection_failed", "submission_unknown", "cancelled"}:
            return state
        worker.tick(job_id=job_id)
        sleep(5)  # the worker backs off between states; tests pass a clock-advancing sleep
    return studio.job(job_id)["state"]


def take_media(studio, cut_id):
    with studio.store.connection() as conn:
        row = conn.execute("SELECT * FROM media WHERE node_id=? ORDER BY created_at DESC LIMIT 1", (cut_id,)).fetchone()
    return dict(row) if row else None


def evidence_backed_review(studio, media_id):
    detail = studio.media(media_id)
    facts = next((e for e in detail["evaluations"] if e["kind"] == "facts"), None)
    seen = sorted({e["asset_id"] for e in facts["evidence"]
                   if (e.get("question_id") or "").split(":")[0] in {"cast", "location", "prop"} and (e.get("probability") or 0) >= 0.5})
    review = detail["media"]["review"]
    studio.review_media(media_id, MediaReview(
        author="assistant", expected_revision=review["revision"], expected_context=detail["review_context"], status="approved",
        user_decision="autopilot: approved for use on the strength of the current facts and judge records; depicted assets are those the facts record sees",
        depicted_assets=seen))


def step(studio, project_id, only=None, max_ticks=120, fake=False, clock=time.time, sleep=time.sleep):
    pol = studio.workflow(project_id)["policy"]
    if not pol["autonomous"]:
        raise StudioError("not_autonomous", "Set policy.autonomous on the project before running the autopilot")
    cuts = [c for c in story_order(studio, project_id) if not only or c["id"] in only]
    report, tasks, log = [], [], []
    for cut in cuts:
        entry = {"cut_id": cut["id"], "name": cut["name"]}
        readiness = studio.readiness(cut["id"])
        if not readiness["ready"]:
            entry["stage"] = "not_ready"
            entry["issues"] = [i["code"] for i in readiness["issues"]]
            tasks.append({"task": "fix_readiness", "cut_id": cut["id"], "issues": readiness["issues"]})
            report.append(entry)
            continue
        recipe, job = latest_recipe(studio, cut["id"])
        media = take_media(studio, cut["id"])
        # 1. a fresh, unapproved recipe → approve within policy and run it
        if recipe and job is None and recipe["fresh"] and not recipe["approved_at"]:
            job = approve_within_policy(studio, recipe, pol, log)
            if not job:
                entry["stage"] = "blocked_by_policy"
                report.append(entry)
                continue
        if job and job["state"] not in {"ready", "failed", "collection_failed", "submission_unknown", "cancelled"}:
            state = drive_job(studio, job["id"], max_ticks, clock=clock, sleep=sleep, fake=fake)
            job = {**job, "state": state}
            media = take_media(studio, cut["id"])
        if job and job["state"] in {"failed", "collection_failed", "submission_unknown"}:
            entry["stage"] = f"job_{job['state']}"
            tasks.append({"task": "recover_job", "cut_id": cut["id"], "job_id": job["id"], "state": job["state"]})
            report.append(entry)
            continue
        if job and job["state"] in {"queued", "submitting", "running", "collecting"}:
            entry["stage"] = "in_flight"
            entry["job_state"] = job["state"]
            report.append(entry)
            continue
        if not media:
            entry["stage"] = "needs_prepare"
            tasks.append({"task": "prepare", "cut_id": cut["id"], "repair": studio.repair(cut["id"])})
            report.append(entry)
            continue
        # 2. the latest take: duplicate check, then the gate
        with studio.store.connection() as conn:
            status = studio.rules.take_status(conn, media, pol)
            has_duplicate = studio.rules.current_evaluation(conn, media, "duplicate") is not None
        if not has_duplicate:
            try:
                evaluate_duplicate(studio, media["id"])
            except StudioError as error:
                log.append({"media": media["id"], "duplicate_check": error.code})
        if not status["evaluated"]:
            entry["stage"] = "awaiting_evaluation"
            facts = studio.facts(cut["id"])
            tasks.append({"task": "evaluate", "cut_id": cut["id"], "media_id": media["id"],
                          "path": str(studio.store.media_dir / media["path"]),
                          "questions": facts["questions"], "scoring": facts["scoring"],
                          "instruction": "Answer every question with a probability, name the region you inspected, then write kind=facts and kind=judge records"})
            report.append(entry)
            continue
        if status["accepted"]:
            selected = cut["active_media_id"] == media["id"]
            if not selected:
                detail = studio.media(media["id"])["media"]["review"]
                if detail["status"] != "approved" or detail["stale"] or not detail["complete"]:
                    evidence_backed_review(studio, media["id"])
                revision = studio.inspect(cut["id"])["node"]["revision"]
                studio.select(cut["id"], media["id"], revision)
                log.append({"cut": cut["id"], "selected": media["id"], "score": status["score"]})
            entry["stage"] = "accepted"
            entry["score"] = status["score"]
        else:
            repair = studio.repair(cut["id"])
            entry["stage"] = "rejected" if repair["can_retry"] else "budget_exhausted"
            entry["reasons"] = status["reasons"]
            if repair["can_retry"]:
                tasks.append({"task": "prepare", "cut_id": cut["id"], "repair": repair,
                              "instruction": "Write the next recipe: apply the suggestions, choose references with `candidates`, quote every lock"})
        report.append(entry)
    workflow = studio.workflow(project_id)
    return {"project_id": project_id, "policy": pol, "cuts": report, "tasks": tasks, "log": log,
            "evaluation_coverage": workflow["evaluation_coverage"],
            "summary": {stage: sum(1 for c in report if c["stage"] == stage) for stage in sorted({c["stage"] for c in report})}}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["step"])
    parser.add_argument("project_id")
    parser.add_argument("--home", default=".strawberry")
    parser.add_argument("--cuts", help="Comma-separated cut IDs to drive; default all")
    parser.add_argument("--max-ticks", type=int, default=120)
    parser.add_argument("--fake", action="store_true", help="Offline: never enable the paid provider")
    args = parser.parse_args()
    studio = Studio(Store(Path(args.home)))
    try:
        result = step(studio, args.project_id, only=set(args.cuts.split(",")) if args.cuts else None, max_ticks=args.max_ticks, fake=args.fake)
    except StudioError as error:
        print(json.dumps({"error": error.code, "message": str(error)}), file=sys.stderr)
        raise SystemExit(1) from error
    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
