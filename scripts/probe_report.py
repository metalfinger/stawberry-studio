"""Probe one production: what its consistency layers actually did, and the experiments that would test them.

Read-only except for evaluation records (the local duplicate check) and, with --prepare,
unapproved experiment recipes. Never approves, never enqueues, never spends.

    venv/bin/python -m scripts.probe_report --home .strawberry-probe PROJECT_ID [--prepare fake|higgsfield]
"""

from __future__ import annotations

import argparse
import csv
import itertools
import json
import sys
from pathlib import Path

from backend.studio import lineage
from backend.studio.evaluators.duplicate import evaluate_duplicate
from backend.studio.models import RecipeCreate, Reference
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError


def cut_rows(studio, project_id):
    rows = []
    with studio.store.connection() as conn:
        cuts = conn.execute(
            "SELECT c.*, sh.name AS shot, sc.name AS scene FROM nodes c JOIN nodes sh ON sh.id=c.parent_id "
            "JOIN nodes sc ON sc.id=sh.parent_id WHERE c.project_id=? AND c.kind='cut' "
            "ORDER BY sc.position, sh.position, c.position",
            (project_id,),
        ).fetchall()
    for cut in cuts:
        cut = dict(cut)
        detail = studio.inspect(cut["id"])
        media_id = cut["active_media_id"]
        row = {
            "scene": cut["scene"], "shot": cut["shot"], "cut": cut["name"], "cut_id": cut["id"],
            "media_id": media_id, "depth": None, "reference_count": 0, "reference_roles": "",
            "reference_depths": "", "warnings": ";".join(w["code"] for w in detail["warnings"]),
            "duplicate_max": None, "duplicate_flag": False, "judge_overall": None, "facts_geometric": None,
        }
        if media_id:
            tree = studio.lineage(media_id)
            row["depth"] = tree["depth"]
            row["reference_count"] = len(tree["references"])
            row["reference_roles"] = ",".join(r["role"] for r in tree["references"])
            row["reference_depths"] = ",".join(str(r["depth"]) for r in tree["references"])
            try:
                dup = evaluate_duplicate(studio, media_id)
                row["duplicate_max"] = dup["scores"]["max_similarity"]
                row["duplicate_flag"] = bool(dup["discrepancies"])
            except StudioError as error:
                row["duplicate_max"] = f"error:{error.code}"
            latest = studio.media(media_id)["media"]["evaluations"]
            row["judge_overall"] = latest.get("judge", {}).get("scores", {}).get("overall")
            row["facts_geometric"] = latest.get("facts", {}).get("scores", {}).get("geometric_mean")
        rows.append(row)
    return rows


def experiments(studio, cut_id, provider):
    """Prepare (never approve) the recipe sets that test each baked-in assumption on one cut."""
    tree_media = studio.inspect(cut_id)["node"]["active_media_id"]
    if not tree_media:
        return {"error": "cut has no selected take to derive references from"}
    base_recipe = studio.media(tree_media)["recipe"]
    if not base_recipe:
        return {"error": "selected take has no recipe"}
    spec = base_recipe["spec"]
    refs = [Reference(media_id=r["media_id"], role=r["role"], instruction=r["instruction"], subjects=r.get("subjects", []))
            for r in spec["references"]]
    prompt, model = spec["prompt"], spec["model"] if provider == "higgsfield" else "fixture"
    prepared = {}

    def prepare(name, references, prompt_text=prompt):
        try:
            recipe = studio.prepare(RecipeCreate(node_id=cut_id, provider=provider, model=model, prompt=prompt_text,
                                                 intent=f"probe:{name}", references=references))
            prepared[name] = {"recipe_id": recipe["id"], "fingerprint": recipe["fingerprint"],
                              "estimate": recipe["spec"].get("estimate"), "warnings": recipe.get("warnings", [])}
        except StudioError as error:
            prepared[name] = {"error": error.code, "message": str(error)}

    for n in (2, 3, 4, 5):
        if len(refs) >= n:
            prepare(f"ref_count_{n}", refs[:n])
    for i, perm in enumerate(itertools.permutations(refs[:4])):
        if i >= 6:
            break
        prepare(f"ref_order_{i}_" + "-".join(r.role for r in perm), list(perm))
    tokens = studio.context(cut_id)["values"].get("bible.tokens") or []
    if tokens:
        prepare("tokens_verbatim", refs, prompt + "\nStyle tokens (verbatim): " + " | ".join(tokens))
        prepare("tokens_paraphrased", refs, prompt + "\nStyle: " + ", ".join(t.split()[0] for t in tokens))
    with studio.store.connection() as conn:
        cache = {}
        depths = {r.media_id: lineage.depth(conn, r.media_id, cache) for r in refs}
    shallow = [r for r in refs if depths[r.media_id] == 0]
    deep = [r for r in refs if depths[r.media_id] >= 2]
    if shallow and deep:
        prepare("depth_shallow_only", shallow)
        prepare("depth_deep_only", deep)
    return {"base_recipe": base_recipe["id"], "prepared_unapproved": prepared,
            "note": "Nothing was approved or enqueued. Approve with a cost ceiling to run."}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("project_id")
    parser.add_argument("--home", default=".strawberry")
    parser.add_argument("--out", default="probe")
    parser.add_argument("--prepare", choices=["fake", "higgsfield"], help="Also prepare unapproved experiment recipes")
    parser.add_argument("--cut", help="Cut to prepare experiments on (default: the cut with the most references)")
    args = parser.parse_args()
    studio = Studio(Store(Path(args.home)))
    project = studio.project(args.project_id)
    rows = cut_rows(studio, args.project_id)
    out = Path(args.out)
    out.mkdir(exist_ok=True)
    (out / f"{args.project_id}.csv").write_text("")
    with (out / f"{args.project_id}.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()) if rows else ["cut"])
        writer.writeheader()
        writer.writerows(rows)
    report = {
        "project": project["node"]["name"] if isinstance(project, dict) and "node" in project else args.project_id,
        "cuts": rows,
        "summary": {
            "cuts": len(rows),
            "depth_histogram": {str(d): sum(1 for r in rows if r["depth"] == d) for d in sorted({r["depth"] for r in rows if r["depth"] is not None})},
            "duplicate_flags": sum(1 for r in rows if r["duplicate_flag"] is True),
            "warned": sum(1 for r in rows if r["warnings"]),
        },
    }
    if args.prepare:
        target = args.cut or max(rows, key=lambda r: r["reference_count"])["cut_id"]
        report["experiments"] = {"cut_id": target, **experiments(studio, target, args.prepare)}
    (out / f"{args.project_id}.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    json.dump(report["summary"], sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
