"""Prepare, approve within policy, and run the non-cut sheets of a project (style anchor, assets).

    PYTHONPATH=. venv/bin/python autoloop/sheets.py PROJECT_ID plan.json
plan.json: [{"node": "<id>", "label": "...", "prompt": "...", "refs": [[media_id, role, instruction], ...]}]
Nothing is approved outside `policy.credit_ceiling_per_take`. Nothing is retried.
"""
import json
import sys
import time
from pathlib import Path

from backend.studio.models import RecipeCreate, Reference
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError
from scripts.autopilot import approve_within_policy, drive_job

studio = Studio(Store(Path("autoloop/store")))
project_id, plan_path = sys.argv[1], sys.argv[2]
pol = studio.workflow(project_id)["policy"]
plan = json.loads(Path(plan_path).read_text())
log, out = [], {}
for item in plan:
    refs = [Reference(media_id=m, role=r, instruction=i) for m, r, i in item.get("refs", [])]
    try:
        recipe = studio.prepare(RecipeCreate(node_id=item["node"], provider="higgsfield", model="gpt_image_2_5",
                                             intent=item["label"], prompt=item["prompt"], references=refs,
                                             settings={"aspect_ratio": item.get("aspect", "16:9")}))
    except StudioError as e:
        print(f"REFUSED {item['label']}: {str(e)[:200]}")
        log.append({"label": item["label"], "refused": [i.get("code") for i in getattr(e, "issues", [])] or e.code})
        continue
    if recipe["warnings"]:
        print(f"  warn {item['label']}: {[w['code'] for w in recipe['warnings']]}")
    job = approve_within_policy(studio, recipe, pol, log)
    if not job:
        print(f"SKIPPED {item['label']}: outside policy")
        continue
    state = drive_job(studio, job["id"], 80, sleep=lambda s: time.sleep(5))
    if state != "ready":
        err = (studio.job(job["id"]).get("error") or "")[:160]
        print(f"FAILED {item['label']}: {state} {err}")
        log.append({"label": item["label"], "job_state": state, "error": err})
        continue
    with studio.store.connection() as conn:
        row = conn.execute("SELECT id FROM media WHERE job_id=? ORDER BY created_at DESC LIMIT 1", (job["id"],)).fetchone()
    out[item["label"]] = row["id"]
    print(f"READY   {item['label']}  media {row['id'][:8]}")
Path("autoloop/scratch/sheets_out.json").write_text(json.dumps({"media": out, "log": log}, indent=1))
print(json.dumps(out, indent=1))
