from __future__ import annotations

import hashlib
import json
import re
import shutil
import time
from pathlib import Path

from backend.studio import lineage
from backend.studio.execution import Execution, validate_cost
from backend.studio.models import (
    Approval,
    AssetRequirementCreate,
    AssetRequirementUpdate,
    BatchApproval,
    EvaluationCreate,
    MediaReview,
    NodeCreate,
    NodePatch,
    RecipeCreate,
    Reorder,
    SourceCreate,
)
from backend.studio.production import ASSET_KINDS, ProductionRules
from backend.studio.store import Store, StudioError, digest, encoded, identifier

PARENTS = {
    "scene": {"project"},
    "shot": {"scene"},
    "cut": {"shot"},
    "character": {"project"},
    "location": {"project", "location"},
    "prop": {"project", "character", "location"},
}


class Studio:
    def __init__(self, store: Store):
        self.store = store
        self.rules = ProductionRules(self)
        self.execution = Execution(self)

    def create_node(self, request: NodeCreate):
        with self.store.connection(write=True) as conn:
            node_id = identifier()
            if request.kind == "project":
                if request.parent_id:
                    raise StudioError("parent_invalid", "Projects cannot have a parent")
                project_id = node_id
            else:
                parent = self.store.one(conn, "nodes", request.parent_id or "")
                if parent["kind"] not in PARENTS[request.kind]:
                    raise StudioError("parent_invalid", "Invalid parent for this node kind")
                project_id = parent["project_id"]
            position = conn.execute(
                "SELECT COALESCE(MAX(position),0)+1 FROM nodes WHERE parent_id IS ? AND kind=?",
                (request.parent_id, request.kind),
            ).fetchone()[0]
            now = time.time()
            conn.execute(
                "INSERT INTO nodes(id,project_id,parent_id,kind,name,position,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
                (node_id, project_id, request.parent_id, request.kind, request.name, position, request.notes, now, now),
            )
            node = self.store.one(conn, "nodes", node_id)
            self.store.revision(conn, node, "Created")
            return self._node(node)

    @staticmethod
    def _node(node):
        return {**node, "fields": json.loads(node["fields"])}

    def patch_node(self, node_id: str, patch: NodePatch):
        with self.store.connection(write=True) as conn:
            node = self.store.one(conn, "nodes", node_id)
            if node["revision"] != patch.expected_revision:
                raise StudioError("revision_conflict", "Node changed; inspect it before editing again", 409)
            if patch.source_id:
                source = self.store.one(conn, "sources", patch.source_id)
                origin = self.store.one(conn, "nodes", source["node_id"])
                if origin["project_id"] != node["project_id"]:
                    raise StudioError("source_invalid", "Source belongs to another project")
            fields = json.loads(node["fields"])
            for field, edit in patch.changes.items():
                if not re.fullmatch(r"[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*", field):
                    raise StudioError("field_invalid", "Use dotted lower_case field names")
                if edit.op == "inherit":
                    fields.pop(field, None)
                else:
                    fields[field] = {**edit.model_dump(), "source_id": patch.source_id}
            conn.execute(
                "UPDATE nodes SET name=?,notes=?,fields=?,revision=revision+1,updated_at=? WHERE id=?",
                (
                    patch.name if patch.name is not None else node["name"],
                    patch.notes if patch.notes is not None else node["notes"],
                    encoded(fields),
                    time.time(),
                    node_id,
                ),
            )
            # Validate the resolved collection operations before committing the edit.
            self._context(conn, node_id)
            descendants = conn.execute(
                """WITH RECURSIVE children(id) AS (
                    SELECT id FROM nodes WHERE parent_id=? UNION ALL
                    SELECT n.id FROM nodes n JOIN children c ON n.parent_id=c.id
                ) SELECT id FROM children""",
                (node_id,),
            ).fetchall()
            for child in descendants:
                self._context(conn, child["id"])
            self.rules.validate_project(conn, node["project_id"])
            node = self.store.one(conn, "nodes", node_id)
            self.store.revision(conn, node, patch.reason, patch.source_id)
            return self._node(node)

    def capture(self, node_id: str, source: SourceCreate):
        with self.store.connection(write=True) as conn:
            self.store.one(conn, "nodes", node_id)
            source_id = identifier()
            conn.execute(
                "INSERT INTO sources VALUES (?,?,?,?,?,?)",
                (
                    source_id,
                    node_id,
                    source.author,
                    source.status,
                    source.text,
                    time.time(),
                ),
            )
            conn.execute("UPDATE nodes SET revision=revision+1,updated_at=? WHERE id=?", (time.time(), node_id))
            self.store.revision(conn, self.store.one(conn, "nodes", node_id), "Captured source instruction", source_id)
            return self.store.one(conn, "sources", source_id)

    def _context(self, conn, node_id: str):
        chain, seen = [], set()
        current = node_id
        while current:
            if current in seen:
                raise StudioError("cycle", "Hierarchy contains a cycle")
            seen.add(current)
            node = self.store.one(conn, "nodes", current)
            chain.append(node)
            current = node["parent_id"]
        chain.reverse()
        values, provenance, cleared = {}, {}, set()
        for node in chain:
            for field, edit in json.loads(node["fields"]).items():
                for existing in set(values) | cleared:
                    if existing != field and (existing.startswith(field + ".") or field.startswith(existing + ".")):
                        raise StudioError(
                            "field_overlap", f"Use consistent leaf fields: {existing} conflicts with {field}"
                        )
                op, value = edit["op"], edit["value"]
                if op == "clear":
                    values.pop(field, None)
                    cleared.add(field)
                elif op == "set":
                    values[field] = value
                    cleared.discard(field)
                else:
                    base = values.get(field, [])
                    if not isinstance(base, list):
                        raise StudioError("field_type", f"{field} is not a collection")
                    values[field] = (
                        (base + [v for v in value if v not in base])
                        if op == "add"
                        else [v for v in base if v not in value]
                    )
                    cleared.discard(field)
                provenance[field] = {
                    "node_id": node["id"],
                    "revision": node["revision"],
                    "op": op,
                    "source_id": edit.get("source_id"),
                }
        return {
            "values": values,
            "cleared": sorted(cleared),
            "provenance": provenance,
            "ancestors": [
                {"id": n["id"], "name": n["name"], "kind": n["kind"], "revision": n["revision"], "notes": n["notes"]}
                for n in chain
            ],
            "sources": [
                {**dict(source), "node_name": node["name"]}
                for node in chain
                for source in conn.execute(
                    "SELECT * FROM sources WHERE node_id=? ORDER BY created_at,id", (node["id"],)
                )
            ],
        }

    def context(self, node_id: str):
        with self.store.connection() as conn:
            return self._generation_context(conn, node_id)

    def _generation_context(self, conn, node_id):
        node = self.store.one(conn, "nodes", node_id)
        return {
            **self._context(conn, node_id),
            "production": self.rules.resolve(conn, node_id),
            "requirements": self._requirements(conn, node_id) if node["kind"] in ASSET_KINDS else [],
        }

    def readiness(self, node_id):
        with self.store.connection() as conn:
            node = self.store.one(conn, "nodes", node_id)
            if node["kind"] != "project":
                return {**self.rules.resolve(conn, node_id)["readiness"], "warnings": self.rules.warnings(conn, node_id)}
            cuts = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM nodes WHERE project_id=? AND kind='cut' ORDER BY position,created_at", (node_id,)
                )
            ]
            results = [
                {
                    "node_id": cut["id"],
                    "name": cut["name"],
                    **self.rules.resolve(conn, cut["id"])["readiness"],
                    "warnings": self.rules.warnings(conn, cut["id"]),
                }
                for cut in cuts
            ]
            return {
                "ready": bool(results) and all(cut["ready"] for cut in results),
                "cuts": results,
                "warnings": self.rules.warnings(conn, node_id),
                "issues": []
                if cuts
                else [
                    {
                        "code": "story_empty",
                        "message": "Create the scene, shot and cut breakdown first",
                        "node_id": node_id,
                    }
                ],
            }

    def workflow(self, project_id):
        with self.store.connection() as conn:
            project = self.store.one(conn, "nodes", project_id)
            if project["kind"] != "project":
                raise StudioError("not_project", "Expected a project ID")
            nodes = [
                dict(row)
                for row in conn.execute(
                    "SELECT * FROM nodes WHERE project_id=? ORDER BY created_at,id", (project_id,)
                )
            ]
            by_kind = {
                kind: [node for node in nodes if node["kind"] == kind]
                for kind in ("scene", "shot", "cut", "character", "location", "prop")
            }
            child_counts = {
                node["id"]: conn.execute("SELECT COUNT(*) FROM nodes WHERE parent_id=?", (node["id"],)).fetchone()[0]
                for node in by_kind["scene"] + by_kind["shot"]
            }
            source_count = conn.execute(
                "SELECT COUNT(*) FROM sources s JOIN nodes n ON n.id=s.node_id WHERE n.project_id=?",
                (project_id,),
            ).fetchone()[0]
            assets = by_kind["character"] + by_kind["location"] + by_kind["prop"]
            asset_rows = []
            for asset in assets:
                requirements = self._requirements(conn, asset["id"])
                selection = self.rules.selected(conn, asset)
                asset_rows.append(
                    {
                        "node_id": asset["id"],
                        "name": asset["name"],
                        "kind": asset["kind"],
                        "requirements": len(requirements),
                        "requirements_covered": sum(bool(item["covered_by"]) for item in requirements),
                        "reference_ready": bool(
                            selection
                            and selection["status"] == "approved"
                            and not selection["stale"]
                            and selection["complete"]
                        ),
                    }
                )
            cut_rows = []
            pol = self.rules.policy(conn, project_id)
            evaluated = 0
            for cut in by_kind["cut"]:
                readiness = self.rules.resolve(conn, cut["id"])["readiness"]
                selection = self.rules.selected(conn, cut)
                status = self.rules.take_status(conn, self.store.one(conn, "media", cut["active_media_id"]), pol) if cut["active_media_id"] else None
                evaluated += 1 if status and status["evaluated"] else 0
                cut_rows.append(
                    {
                        "node_id": cut["id"],
                        "name": cut["name"],
                        "ready_to_prepare": readiness["ready"],
                        "issues": readiness["issues"],
                        "warnings": self.rules.warnings(conn, cut["id"]),
                        "take": status,
                        "take_ready": bool(
                            selection
                            and selection["status"] == "approved"
                            and not selection["stale"]
                            and selection["complete"]
                            and (not pol["autonomous"] or (status and status["accepted"]))
                        ),
                    }
                )
            counts = {
                "sources": source_count,
                **{kind: len(rows) for kind, rows in by_kind.items()},
                "assets": len(assets),
            }
            coverage = {"evaluated": evaluated, "selected": sum(1 for c in by_kind["cut"] if c["active_media_id"]), "total": len(by_kind["cut"])}
            stages = [
                {
                    "id": "development",
                    "label": "Development",
                    "status": "ready" if source_count else "needs_attention",
                    "summary": f"{source_count} captured source instruction{'s' if source_count != 1 else ''}",
                },
                {
                    "id": "story",
                    "label": "Story breakdown",
                    "status": "ready"
                    if by_kind["cut"] and all(child_counts.get(node["id"], 0) for node in by_kind["scene"] + by_kind["shot"])
                    else "needs_attention",
                    "summary": f"{len(by_kind['scene'])} scenes · {len(by_kind['shot'])} shots · {len(by_kind['cut'])} cuts",
                },
                {
                    "id": "production_design",
                    "label": "Cast & scout",
                    "status": "ready" if assets and all(row["reference_ready"] for row in asset_rows) else "needs_attention",
                    "summary": f"{sum(row['reference_ready'] for row in asset_rows)} of {len(asset_rows)} assets reference-ready",
                },
                {
                    "id": "storyboard",
                    "label": "Storyboard",
                    "status": "ready" if cut_rows and all(row["take_ready"] for row in cut_rows) else "in_progress",
                    "summary": f"{sum(row['take_ready'] for row in cut_rows)} of {len(cut_rows)} cuts have approved selected takes",
                },
            ]
            actions = self._workflow_actions(conn, project, by_kind, child_counts, asset_rows, cut_rows, source_count)
            return {
                "project_id": project_id,
                "counts": counts,
                "evaluation_coverage": coverage,
                "policy": pol,
                "stages": stages,
                "assets": asset_rows,
                "cuts": cut_rows,
                "next_actions": actions,
            }

    def _workflow_actions(self, conn, project, by_kind, child_counts, assets, cuts, source_count):
        actions = []

        def add(kind, message, node_id, priority=1):
            actions.append({"kind": kind, "message": message, "node_id": node_id, "priority": priority})

        if not source_count:
            add("capture_intent", "Capture the user's original brief and constraints", project["id"], 1)
        if not by_kind["scene"]:
            add("break_down_story", "Develop the story and create its scenes", project["id"], 1)
        for scene in by_kind["scene"]:
            if not child_counts.get(scene["id"]):
                add("add_shots", f"Break {scene['name']} into shots", scene["id"], 1)
        for shot in by_kind["shot"]:
            if not child_counts.get(shot["id"]):
                add("add_cuts", f"Define visual cuts for {shot['name']}", shot["id"], 1)
        if by_kind["cut"] and not any((by_kind["character"], by_kind["location"], by_kind["prop"])):
            add("derive_assets", "Derive recurring characters, locations and props from the complete story", project["id"], 1)
        for asset in assets:
            if not asset["requirements"]:
                add("plan_asset_views", f"Plan story-driven reference views for {asset['name']}", asset["node_id"], 2)
            if not asset["reference_ready"]:
                add("create_asset_reference", f"Prepare or review an identity reference for {asset['name']}", asset["node_id"], 2)
            elif asset["requirements_covered"] < asset["requirements"]:
                add("cover_asset_views", f"Cover remaining planned views for {asset['name']}", asset["node_id"], 2)
        for cut in cuts:
            if not cut["ready_to_prepare"]:
                add("resolve_cut_readiness", f"Resolve blockers for {cut['name']}", cut["node_id"], 2)
            elif not cut["take_ready"]:
                recipe = conn.execute(
                    "SELECT id FROM recipes WHERE node_id=? ORDER BY created_at DESC LIMIT 1", (cut["node_id"],)
                ).fetchone()
                add(
                    "review_or_prepare_cut" if recipe else "prepare_cut",
                    f"{'Review the latest work for' if recipe else 'Prepare references and prompt for'} {cut['name']}",
                    cut["node_id"],
                    3,
                )
        if not actions and cuts:
            add("review_production", "Review the complete storyboard and record any refinement notes", project["id"], 4)
        return sorted(actions, key=lambda item: (item["priority"], item["message"]))

    def inspect(self, node_id: str):
        with self.store.connection() as conn:
            node = self.store.one(conn, "nodes", node_id)
            context = self._generation_context(conn, node_id)
            return {
                "node": self._node(node),
                "context": context,
                "warnings": self.rules.warnings(conn, node_id),
                "sources": context["sources"],
                "revisions": [
                    dict(r)
                    for r in conn.execute(
                        "SELECT revision,reason,source_id,created_at FROM revisions WHERE node_id=? ORDER BY revision DESC",
                        (node_id,),
                    )
                ],
                "media": [
                    self._media(conn, dict(r))
                    for r in conn.execute("SELECT * FROM media WHERE node_id=? ORDER BY created_at DESC", (node_id,))
                ],
                "requirements": self._requirements(conn, node_id) if node["kind"] in ASSET_KINDS else [],
            }

    def _requirements(self, conn, asset_id):
        requirements = [
            dict(row)
            for row in conn.execute(
                "SELECT * FROM asset_requirements WHERE asset_id=? ORDER BY priority,created_at,id", (asset_id,)
            )
        ]
        reviews = [
            dict(row)
            for row in conn.execute(
                """SELECT mr.* FROM media_reviews mr JOIN media m ON m.id=mr.media_id
                WHERE m.node_id=? AND mr.revision=(
                    SELECT MAX(latest.revision) FROM media_reviews latest WHERE latest.media_id=mr.media_id
                ) ORDER BY mr.created_at DESC""",
                (asset_id,),
            )
        ]
        for requirement in requirements:
            current_hash = digest(
                {key: requirement[key] for key in ("id", "asset_id", "kind", "label", "instruction", "priority")}
            )
            requirement["covered_by"] = [
                review["media_id"]
                for review in reviews
                if review["status"] == "approved"
                and json.loads(review["requirement_hashes"]).get(requirement["id"]) == current_hash
            ]
        return requirements

    def create_requirement(self, asset_id: str, request: AssetRequirementCreate):
        with self.store.connection(write=True) as conn:
            asset = self.store.one(conn, "nodes", asset_id)
            if asset["kind"] not in ASSET_KINDS:
                raise StudioError("requirement_target", "Planned views and states belong to production assets")
            requirement_id, now = identifier(), time.time()
            conn.execute(
                "INSERT INTO asset_requirements VALUES (?,?,?,?,?,?,?,?)",
                (
                    requirement_id,
                    asset_id,
                    request.kind,
                    request.label,
                    request.instruction,
                    request.priority,
                    now,
                    now,
                ),
            )
            conn.execute("UPDATE nodes SET revision=revision+1,updated_at=? WHERE id=?", (now, asset_id))
            self.store.revision(conn, self.store.one(conn, "nodes", asset_id), "Added planned reference requirement")
            return next(item for item in self._requirements(conn, asset_id) if item["id"] == requirement_id)

    def update_requirement(self, requirement_id: str, request: AssetRequirementUpdate):
        with self.store.connection(write=True) as conn:
            row = conn.execute("SELECT * FROM asset_requirements WHERE id=?", (requirement_id,)).fetchone()
            if not row:
                raise StudioError("not_found", f"asset requirement not found: {requirement_id}", 404)
            now = time.time()
            conn.execute(
                "UPDATE asset_requirements SET label=?,instruction=?,priority=?,updated_at=? WHERE id=?",
                (request.label, request.instruction, request.priority, now, requirement_id),
            )
            conn.execute("UPDATE nodes SET revision=revision+1,updated_at=? WHERE id=?", (now, row["asset_id"]))
            self.store.revision(
                conn, self.store.one(conn, "nodes", row["asset_id"]), "Updated planned reference requirement"
            )
            return next(item for item in self._requirements(conn, row["asset_id"]) if item["id"] == requirement_id)

    def revision(self, node_id, revision):
        with self.store.connection() as conn:
            self.store.one(conn, "nodes", node_id)
            row = conn.execute("SELECT * FROM revisions WHERE node_id=? AND revision=?", (node_id, revision)).fetchone()
            if not row:
                raise StudioError("not_found", "Revision not found", 404)
            return {**dict(row), "snapshot": self._node(json.loads(row["snapshot"]))}

    def media(self, media_id):
        with self.store.connection() as conn:
            media = self._media(conn, self.store.one(conn, "media", media_id))
            recipe_id = media["metadata"].get("recipe_id")
            return {
                "media": media,
                "review_context": self.rules.review_context(conn, media),
                "requirements": self._requirements(conn, media["node_id"])
                if self.store.one(conn, "nodes", media["node_id"])["kind"] in ASSET_KINDS
                else [],
                "feedback": [
                    dict(r)
                    for r in conn.execute("SELECT * FROM feedback WHERE media_id=? ORDER BY created_at,id", (media_id,))
                ],
                "recipe": self._recipe_status(conn, self.store.one(conn, "recipes", recipe_id)) if recipe_id else None,
                "evaluations": [
                    self._evaluation(r)
                    for r in conn.execute("SELECT * FROM evaluations WHERE media_id=? ORDER BY sequence DESC", (media_id,))
                ],
                "review_history": [
                    {
                        **dict(r),
                        "depicted_assets": json.loads(r["depicted_assets"]),
                        "subject_hashes": json.loads(r["subject_hashes"]),
                        "requirement_ids": json.loads(r["requirement_ids"]),
                        "requirement_hashes": json.loads(r["requirement_hashes"]),
                    }
                    for r in conn.execute(
                        "SELECT * FROM media_reviews WHERE media_id=? ORDER BY revision DESC", (media_id,)
                    )
                ],
            }

    def projects(self):
        with self.store.connection() as conn:
            return [
                self._node(dict(r))
                for r in conn.execute("SELECT * FROM nodes WHERE kind='project' ORDER BY updated_at DESC")
            ]

    def project(self, project_id: str):
        with self.store.connection() as conn:
            node = self.store.one(conn, "nodes", project_id)
            if node["kind"] != "project":
                raise StudioError("not_project", "Expected a project ID")
            return {
                "project": self._node(node),
                "nodes": [
                    self._node(dict(r))
                    for r in conn.execute(
                        "SELECT * FROM nodes WHERE project_id=? ORDER BY position,created_at", (project_id,)
                    )
                ],
                "media": [
                    self._media(conn, dict(r))
                    for r in conn.execute(
                        "SELECT m.* FROM media m JOIN nodes n ON n.id=m.node_id WHERE n.project_id=? ORDER BY m.created_at DESC",
                        (project_id,),
                    )
                ],
                "recipes": [
                    self._recipe_status(conn, dict(r))
                    for r in conn.execute(
                        "SELECT r.* FROM recipes r JOIN nodes n ON n.id=r.node_id WHERE n.project_id=? ORDER BY r.created_at DESC",
                        (project_id,),
                    )
                ],
                "jobs": [
                    self._job(dict(r))
                    for r in conn.execute(
                        "SELECT j.* FROM jobs j JOIN recipes r ON r.id=j.recipe_id JOIN nodes n ON n.id=r.node_id WHERE n.project_id=? ORDER BY j.created_at DESC",
                        (project_id,),
                    )
                ],
            }

    def _media(self, conn, row):
        return {
            **row,
            "metadata": json.loads(row["metadata"]),
            "url": f"/api/studio/media/{row['id']}/file",
            "review": self.rules.review(conn, row),
            "depth": lineage.depth(conn, row["id"]),
            "evaluations": self._latest_evaluations(conn, row["id"]),
        }

    @staticmethod
    def _evaluation(row):
        return {
            **dict(row),
            "scores": json.loads(row["scores"]),
            "evidence": json.loads(row["evidence"]),
            "discrepancies": json.loads(row["discrepancies"]),
        }

    def _latest_evaluations(self, conn, media_id):
        latest = {}
        for row in conn.execute("SELECT * FROM evaluations WHERE media_id=? ORDER BY sequence DESC", (media_id,)):
            latest.setdefault(row["kind"], self._evaluation(row))
        return latest

    def evaluations(self, media_id):
        with self.store.connection() as conn:
            self.store.one(conn, "media", media_id)
            return [
                self._evaluation(row)
                for row in conn.execute("SELECT * FROM evaluations WHERE media_id=? ORDER BY sequence DESC", (media_id,))
            ]

    def evaluate(self, media_id, request: EvaluationCreate):
        """Record an observation about one exact image. Append-only; never touches review status."""
        with self.store.connection(write=True) as conn:
            media = self.store.one(conn, "media", media_id)
            context = self.rules.review_context(conn, media)
            if request.expected_context != context:
                raise StudioError("evaluation_context_changed", "Inspect the image again before evaluating it", 409)
            review = self.rules.review(conn, media)
            scores = dict(request.scores)
            if request.kind in {"facts", "judge", "stranger"}:
                for item in request.evidence:
                    if item.asset_id and not item.region:
                        raise StudioError("evidence_region_missing", f"Say where you looked for: {item.question}", 409)
            if request.kind in {"facts", "stranger"}:
                scores.update(self._score_facts(conn, media, request.evidence))
            if request.kind == "judge":
                if "sc" not in scores or "pq" not in scores:
                    raise StudioError("judge_scores", "A judge record needs sc and pq", 409)
                scores["overall"] = round((scores["sc"] * scores["pq"]) ** 0.5, 3)
            conn.execute(
                "INSERT INTO evaluations(media_id,evaluator,version,kind,scores,evidence,confidence,discrepancies,"
                "context_hash,review_revision,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (
                    media_id,
                    request.evaluator,
                    request.version,
                    request.kind,
                    encoded(scores),
                    encoded([item.model_dump() for item in request.evidence]),
                    request.confidence,
                    encoded([item.model_dump() for item in request.discrepancies]),
                    context,
                    review["revision"],
                    time.time(),
                ),
            )
            row = conn.execute("SELECT * FROM evaluations WHERE media_id=? ORDER BY sequence DESC LIMIT 1", (media_id,)).fetchone()
            return self._evaluation(row)

    CONTINUITY_LANGUAGE = (
        "still ", "same ", "continues", "continuing", "continue", "keeps ", "keep ", "remains", "remain ",
        "as before", "from the previous", "moments later", "a moment later", "the next instant", "without cut",
        "no cut", "match cut", "carries on", "follows through", "right after",
    )

    def _previous_cut(self, conn, cut):
        """Editorial predecessor: the prior sibling, else the last cut of the prior shot in the scene."""
        prior = conn.execute(
            "SELECT * FROM nodes WHERE parent_id=? AND kind='cut' AND position<? ORDER BY position DESC LIMIT 1",
            (cut["parent_id"], cut["position"]),
        ).fetchone()
        if prior:
            return dict(prior)
        shot = self.store.one(conn, "nodes", cut["parent_id"])
        prior_shot = conn.execute(
            "SELECT id FROM nodes WHERE parent_id=? AND kind='shot' AND position<? ORDER BY position DESC LIMIT 1",
            (shot["parent_id"], shot["position"]),
        ).fetchone()
        if not prior_shot:
            return None
        last = conn.execute(
            "SELECT * FROM nodes WHERE parent_id=? AND kind='cut' ORDER BY position DESC LIMIT 1", (prior_shot["id"],)
        ).fetchone()
        return dict(last) if last else None

    def candidates(self, cut_id):
        """Every reusable image in the project, scored against this cut. Deterministic; the host chooses."""
        with self.store.connection() as conn:
            cut = self.store.one(conn, "nodes", cut_id)
            if cut["kind"] != "cut":
                raise StudioError("candidates_scope", "Candidates are computed for cuts")
            ctx = self._context(conn, cut_id)
            values = ctx["values"]
            production = self.rules.resolve(conn, cut_id)
            scope = production["scope"]
            scoped = set(self.rules.asset_ids(scope))
            continuity = production["continuity"] or {"incoming": {}, "conflicts": [], "sources": []}
            conflicted = {c["field"] for c in continuity["conflicts"]}
            expected_states = {
                key: candidates[0]["value"]
                for key, candidates in continuity["incoming"].items()
                if key not in conflicted and candidates
            }
            linked = set(values.get("continuity_from", [])) | {s["node_id"] for s in continuity["sources"]}
            cap = values.get("policy.reference_depth_cap", lineage.DEFAULT_DEPTH_CAP)
            depth_cache = {}
            out = []
            rows = conn.execute(
                "SELECT m.*, n.kind AS owner_kind, n.name AS owner_name, n.parent_id AS owner_parent, "
                "n.active_media_id AS owner_active FROM media m JOIN nodes n ON n.id=m.node_id "
                "WHERE n.project_id=? AND m.node_id<>? ORDER BY m.created_at DESC",
                (cut["project_id"], cut_id),
            ).fetchall()
            for row in rows:
                media = dict(row)
                review = self.rules.review(conn, media)
                if review["status"] != "approved" or review["stale"]:
                    continue
                owner_id, owner_kind = media["node_id"], media["owner_kind"]
                depth = lineage.depth(conn, media["id"], depth_cache)
                depicted = set(review["depicted_assets"])
                item = {
                    "media_id": media["id"],
                    "label": media["label"],
                    "owner": {"id": owner_id, "kind": owner_kind, "name": media["owner_name"]},
                    "selected": media["owner_active"] == media["id"],
                    "partial": not review["complete"],
                    "depth": depth,
                    "trust": round(1 / (1 + depth), 3),
                    "over_cap": depth + 1 > cap,
                    "depicted_assets": sorted(depicted),
                    "roles_possible": [],
                    "relevance": {
                        "in_scope_asset": owner_id in scoped,
                        "shared_cast": len(depicted & set(scope["characters"])),
                        "same_location": False,
                        "same_shot": False,
                        "continuity_linked": owner_id in linked,
                    },
                    "state_flags": [],
                    "covers_requirements": [],
                    "evaluations": self._latest_evaluations(conn, media["id"]),
                }
                if owner_kind in ASSET_KINDS:
                    item["roles_possible"] = [{"character": "identity", "location": "location", "prop": "prop"}[owner_kind]]
                    item["relevance"]["same_location"] = owner_id == scope["location"]
                    item["covers_requirements"] = [
                        r["id"] for r in self._requirements(conn, owner_id) if media["id"] in r["covered_by"]
                    ]
                elif owner_kind == "cut":
                    item["roles_possible"] = ["base", "composition", "pose", "lighting", "style"]
                    owner_values = self._context(conn, owner_id)["values"]
                    item["relevance"]["same_location"] = bool(scope["location"]) and owner_values.get("location_id") == scope["location"]
                    item["relevance"]["same_shot"] = media["owner_parent"] == cut["parent_id"]
                    outgoing = self.rules.continuity(conn, owner_id)["outgoing"]
                    for key, expected in expected_states.items():
                        found = outgoing.get(key)
                        if found and encoded(found[0]["value"]) != encoded(expected):
                            item["state_flags"].append(
                                {"tag": "state_mismatch", "field": key, "candidate_value": found[0]["value"], "expected_value": expected}
                            )
                else:
                    continue
                item["relevance_score"] = (
                    3 * item["relevance"]["in_scope_asset"]
                    + item["relevance"]["shared_cast"]
                    + 2 * item["relevance"]["same_location"]
                    + item["relevance"]["same_shot"]
                    + 2 * item["relevance"]["continuity_linked"]
                    - 2 * len(item["state_flags"])
                )
                out.append(item)
            out.sort(key=lambda i: (-i["relevance_score"], -i["trust"], i["label"]))
            return {"cut_id": cut_id, "depth_cap": cap, "chain": self._chain_recommendation(conn, cut, values, cap), "candidates": out}

    def _chain_recommendation(self, conn, cut, values, cap):
        previous = self._previous_cut(conn, cut)
        if not previous:
            return {"previous_cut": None, "chain": False, "reason": "no previous cut"}
        result = {"previous_cut": {"id": previous["id"], "name": previous["name"]}, "media_id": previous["active_media_id"]}
        explicit = values.get("chain_from_prev")
        if explicit in ("yes", "no"):
            return {**result, "chain": explicit == "yes", "reason": "explicit chain_from_prev"}
        if previous["active_media_id"]:
            depth = lineage.depth(conn, previous["active_media_id"])
            if depth + 1 > cap:
                return {**result, "chain": False, "reason": f"previous take is depth {depth}; chaining would pass the cap of {cap}"}
        else:
            return {**result, "chain": False, "reason": "previous cut has no selected take"}
        if previous["parent_id"] == cut["parent_id"]:
            return {**result, "chain": True, "reason": "same shot"}
        text = " ".join(str(values.get(k, "")) for k in ("action", "transition")).lower() + " " + cut["notes"].lower()
        hit = next((token for token in self.CONTINUITY_LANGUAGE if token in text), None)
        if hit:
            return {**result, "chain": True, "reason": f"continuity language: '{hit.strip()}'"}
        return {**result, "chain": False, "reason": "new shot, no continuity language"}

    def sequence(self, project_id):
        from backend.studio import sequence

        return sequence.review(self, project_id)

    def repair(self, cut_id):
        """What to change for the next take, derived from the latest take's records. Deterministic; no model."""
        with self.store.connection() as conn:
            cut = self.store.one(conn, "nodes", cut_id)
            if cut["kind"] != "cut":
                raise StudioError("repair_scope", "Repair proposals are for cuts")
            pol = self.rules.policy(conn, cut_id)
            row = conn.execute("SELECT * FROM media WHERE node_id=? ORDER BY created_at DESC LIMIT 1", (cut_id,)).fetchone()
            used = self.rules.takes_used(conn, cut_id)
            base = {"cut_id": cut_id, "takes_used": used, "max_takes": pol["max_takes_per_cut"], "can_retry": used < pol["max_takes_per_cut"]}
            if not row:
                rejected = conn.execute(
                    "SELECT j.error FROM jobs j JOIN recipes r ON r.id=j.recipe_id WHERE r.node_id=? AND j.state='failed' "
                    "AND j.error LIKE 'provider_rejected%' ORDER BY j.updated_at DESC LIMIT 1", (cut_id,)).fetchone()
                suggestions = [{"code": "first_take", "message": "No take yet; prepare from the sheets"}]
                if rejected:
                    suggestions.insert(0, {"code": "provider_rejected", "message": rejected["error"][:200] +
                                           ". Set reference_mode=text on the asset whose image the provider refuses and quote its consistency_tokens"})
                return {**base, "take": None, "suggestions": suggestions}
            media = dict(row)
            status = self.rules.take_status(conn, media, pol)
            facts = self.rules.current_evaluation(conn, media, "facts")
            judge = self.rules.current_evaluation(conn, media, "judge")
            stranger = self.rules.current_evaluation(conn, media, "stranger")
            duplicate = self.rules.current_evaluation(conn, media, "duplicate")
            production = self.rules.resolve(conn, cut_id)
            sheets = {a["id"]: (a["selection"] or {}).get("media_id") for a in production["assets"]}
            names = {a["id"]: a["name"] for a in production["assets"]}
            _, references = lineage._recipe_references(conn, media["id"])
            ref_facts = {}
            for ref in references:
                ref_media = self.store.one(conn, "media", ref["media_id"])
                if self.store.one(conn, "nodes", ref_media["node_id"])["kind"] == "cut":
                    ref_facts[ref["media_id"]] = (ref["role"], self.rules.current_evaluation(conn, ref_media, "facts"))
            suggestions = []

            def suggest(code, message, **extra):
                if any(s["code"] == code and s["message"] == message for s in suggestions):
                    return
                suggestions.append({"code": code, "message": message, **extra})

            # every current evaluation counts: a blind second opinion is evidence like any other
            seen, failed = set(), []
            for record in (facts, stranger):
                for e in (record["evidence"] if record else []):
                    qid = e.get("question_id")
                    if e.get("probability") is not None and e["probability"] < 0.5 and qid not in seen:
                        seen.add(qid)
                        failed.append(e)
            # A defect can be faithfully copied. When a frame reproduces its sheet closely and still
            # fails a detail about that asset, the detail is wrong on the sheet, and retrying the
            # frame will reproduce it again — the repair belongs upstream. A blind evaluator found
            # four such faults in one frame of this production and correctly refused to charge them
            # to the generation that inherited them.
            matched = {}
            for record in (facts, stranger):
                for e in (record["evidence"] if record else []):
                    if (e.get("question_id") or "").startswith("matches_sheet:") and e.get("probability") is not None:
                        aid = e["question_id"].split(":", 1)[1]
                        matched[aid] = max(matched.get(aid, 0.0), e["probability"])
            for item in failed:
                qid = item.get("question_id") or ""
                kind = qid.split(":")[0]
                asset = item.get("asset_id")
                # only what a sheet actually fixes: identity and costume, which a frame copies.
                # Anatomy is re-generated per frame, so matching the sheet says nothing about it.
                if kind in {"detail", "wardrobe", "features"} and matched.get(asset, 0.0) >= 0.85:
                    suggest("inherited_defect",
                            f"This frame matches {names.get(asset, asset)}'s sheet closely and still fails "
                            f"\"{item['question'].rstrip('?')}\" — the fault is on the sheet, not in this take. "
                            "Fix the sheet and regenerate what was built on it",
                            asset_id=asset, sheet=sheets.get(asset))
                    continue
                if kind == "state":
                    blamed = [mid for mid, (role, f) in ref_facts.items() if f and any(
                        (x.get("question_id") == qid) and (x.get("probability") or 1) < 0.5 for x in f["evidence"])]
                    if blamed:
                        suggest("drop_reference", f"Reference {blamed[0][:8]} fails the same fact ({item['question']}); do not chain from it — use the sheet for {names.get(asset, asset)}",
                                media_id=blamed[0], sheet=sheets.get(asset))
                    else:
                        suggest("state_in_prompt", f"State the lock in the prompt, verbatim: {item['question'].rstrip('?')}", asset_id=asset)
                elif kind in {"cast", "prop", "location"}:
                    suggest("attach_reference", f"Attach the {kind} reference for {names.get(asset, asset)} and name it in the prompt", asset_id=asset, sheet=sheets.get(asset))
                elif kind == "pose":
                    suggest("pose_in_prompt", f"Describe {names.get(asset, asset)}'s posture explicitly (upright, facing, limbs); do not use the previous take as base", asset_id=asset)
                elif kind in {"detail", "wardrobe", "features"}:
                    suggest("token_in_prompt", f"Quote verbatim: {item['question'].rstrip('?')}", asset_id=asset)
                elif kind in {"action", "beat"}:
                    suggest("lead_with_action", "Lead the prompt with the action sentence and beat.visual_point, verbatim; everything else after")
                elif kind == "style":
                    suggest("bible_in_prompt", "Quote bible.tokens and bible.palette_hex verbatim; add negative_prompts")
            for record in (judge, stranger):
                for d in (record["discrepancies"] if record else []):
                    suggest("judge_" + d["tag"], d["note"], asset_id=d.get("asset_id"), region=d.get("region"))
            if stranger:
                note = next((e["answer"] for e in stranger["evidence"] if not e.get("question_id") and e["answer"]), "")
                if note:
                    suggest("second_opinion", "A blind evaluator saw: " + note[:400])
            if duplicate and any(d["tag"] == "copy_paste" for d in duplicate["discrepancies"]):
                suggest("change_camera", "Near-identical to a sibling beat: change camera.framing or camera.angle and do not use the previous take as base")
            # only if nothing has succeeded since: a rejection older than the newest take is history
            failed_job = conn.execute(
                "SELECT j.error FROM jobs j JOIN recipes r ON r.id=j.recipe_id WHERE r.node_id=? AND j.state='failed' "
                "AND j.updated_at > ? ORDER BY j.updated_at DESC LIMIT 1", (cut_id, media["created_at"])).fetchone()
            if failed_job and (failed_job["error"] or "").startswith("provider_rejected"):
                image_refs = [a for a in production["assets"] if a["context"]["values"].get("reference_mode") != "text"]
                suggest("provider_rejected", failed_job["error"][:200] + ". Set reference_mode=text on the asset whose image the provider refuses "
                        "(usually a child's likeness) and quote all its consistency_tokens instead",
                        assets=[a["id"] for a in image_refs])
            if status["accepted"] and not suggestions:
                suggest("accepted", "The latest take passes the gate; nothing to repair")
            return {**base, "take": status, "suggestions": suggestions,
                    "sheets": {names[a]: m for a, m in sheets.items()}}

    def _score_facts(self, conn, media, evidence):
        """The engine, not the evaluator, turns probabilities into the record's scores."""
        import math

        owner = self.store.one(conn, "nodes", media["node_id"])
        try:
            questions = {q["id"]: q for q in self._facts(conn, owner["id"], media["id"])["questions"]}
        except StudioError:
            questions = {}
        groups, capped, answered, unseen = {}, False, 0, 0
        for item in evidence:
            q = questions.get(item.question_id or "")
            if item.not_visible:
                if q:
                    unseen += 1
                continue
            if item.probability is None:
                continue
            if not q:
                if item.question_id is None:
                    raise StudioError("evidence_unbound", f"Evidence must carry the question_id it answers: {item.question}", 409)
                continue  # a question the current definition no longer asks
            answered += 1
            groups.setdefault(q["group"], []).append((item.probability, q["weight"]))
            if q["cap_on_miss"] and item.probability < 0.5:
                capped = True
        if not answered:
            raise StudioError("evidence_empty", "No evidence answers a current question", 409)
        gm = lambda pairs: math.exp(sum(w * math.log(max(p, 1e-3)) for p, w in pairs) / sum(w for _, w in pairs))  # noqa: E731
        group_scores = {name: round(gm(pairs), 3) for name, pairs in groups.items()}
        # a frame that does not do its job, or does not look like the production, is not "mostly fine"
        if group_scores.get("action", 1.0) < 0.5 or group_scores.get("style", 1.0) < 0.5:
            capped = True
        everything = [pair for pairs in groups.values() for pair in pairs]
        headline = round(gm(everything), 3)
        min_group = round(min(group_scores.values()), 3)
        if capped:
            headline, min_group = min(headline, 0.4), min(min_group, 0.4)
        return {
            "groups": group_scores,
            "min_group": min_group,
            "geometric_mean": headline,
            "arithmetic_mean": round(sum(p * w for p, w in everything) / sum(w for _, w in everything), 3),
            "capped": 1.0 if capped else 0.0,
            "answered": float(answered),
            "not_visible": float(unseen),
            "asked": float(len(questions)),
        }

    def facts(self, node_id, media_id=None):
        with self.store.connection() as conn:
            return self._facts(conn, node_id, media_id)

    def _facts(self, conn, node_id, media_id=None):
        """The declared facts of a cut or asset as answerable questions. Deterministic; no model call.

        A host answers each with its own vision and records a kind="facts" evaluation. The
        geometric mean of the answer probabilities is the prompt-level score; a capped question
        that misses caps the whole record (a named detail that does not match is not "close enough").
        """
        if True:
            node = self.store.one(conn, "nodes", node_id)
            production = self.rules.resolve(conn, node_id)
            values = self._context(conn, node_id)["values"]
            names = {asset["id"]: asset["name"] for asset in production["assets"]}
            names[node["id"]] = node["name"]

            def label(value):
                if isinstance(value, str):
                    if value in names:
                        return names[value]
                    row = conn.execute("SELECT name FROM nodes WHERE id=?", (value,)).fetchone()
                    return row["name"] if row else value
                return encoded(value)

            questions = []

            GROUPS = {"cast": "identity", "pose": "identity", "hands": "identity", "detail": "identity",
                      "wardrobe": "identity", "subject": "identity", "features": "identity", "matches_sheet": "identity",
                      "feet": "identity",
                      "location": "scope", "prop": "scope", "state": "state",
                      "action": "action", "beat": "action",
                      "style": "style", "style_token": "style", "palette": "style", "lighting_rules": "style", "anchor": "style",
                      "excluded": "style"}

            def ask(qid, question, *, expected="yes", asset_id=None, weight=1, cap=False, look_at=None):
                prefix = qid.split(":")[0]
                if look_at is None:
                    look_at = (
                        f"Crop the region containing {names.get(asset_id, 'the subject')} at full resolution and inspect the crop, not the frame"
                        if asset_id else "Look at the whole frame"
                    )
                questions.append(
                    {"id": qid, "question": question, "expected": expected, "asset_id": asset_id, "weight": weight,
                     "cap_on_miss": cap, "group": GROUPS.get(prefix, "action"), "look_at": look_at}
                )

            def identity(asset):
                ctx = asset["context"]["values"]
                if asset["kind"] == "character":
                    ask(
                        f"pose:{asset['id']}",
                        f"Is {asset['name']}'s body, head and limbs in a physically plausible position (nothing inverted, "
                        "reversed, duplicated or missing)?",
                        asset_id=asset["id"], weight=2, cap=True,
                    )
                    # The commonest generative defect, and the easiest to skim past. "The highest
                    # magnification the image allows" was the instruction here once, and it was
                    # obeyed at four times and answered wrongly; a blind evaluator looking at eight
                    # times found thumbless mittens in the same frame. So name the number.
                    ask(
                        f"hands:{asset['id']}",
                        f"Are {asset['name']}'s hands and arms correct — both arms emerging and visible where they should be, "
                        "five separate readable fingers AND a thumb on each visible hand, no fused, extra or missing digits?",
                        asset_id=asset["id"], weight=2, cap=True,
                        look_at=f"Crop each of {asset['name']}'s hands on its own and enlarge it at least 8x with nearest-neighbour "
                                "resampling. If you cannot count the fingers and find the thumb, the answer is no, not 'probably'",
                    )
                    # Feet are as malformed as hands and nobody looks at them: "body, head and limbs"
                    # is answered from the torso up. A boot that is two merged blobs passed a pose
                    # question scored 0.95 in this production.
                    ask(
                        f"feet:{asset['id']}",
                        f"Are {asset['name']}'s feet correct — each shoe or foot a single coherent shape with a readable "
                        "toe and heel, both standing on the same floor, neither merged into the other or into the ground?",
                        asset_id=asset["id"], weight=1, cap=True,
                        look_at=f"Crop {asset['name']}'s feet and enlarge at least 8x; check each shoe separately",
                    )
                for i, token in enumerate(ctx.get("consistency_tokens") or []):
                    ask(f"detail:{asset['id']}:{i}", f"Does {asset['name']} show '{token}'?", asset_id=asset["id"], cap=True)
                features = ctx.get("distinctive_features")
                if isinstance(features, str) and features.strip():
                    ask(f"features:{asset['id']}", f"Does {asset['name']} match: {features.strip()}?", asset_id=asset["id"], cap=True)
                wardrobe = ctx.get("wardrobe")
                if asset["kind"] == "character" and isinstance(wardrobe, str) and wardrobe.strip():
                    ask(f"wardrobe:{asset['id']}", f"Is {asset['name']} wearing: {wardrobe.strip()}?", asset_id=asset["id"], cap=True)

            if node["kind"] in ASSET_KINDS:
                asset = {"id": node["id"], "name": node["name"], "kind": node["kind"], "context": self._context(conn, node_id)}
                ask(f"subject:{node['id']}", f"Does the image show {node['name']} and nothing else as the subject?", asset_id=node["id"], weight=3, cap=True)
                identity(asset)
                for position, token in enumerate(values.get("bible.tokens") or []):
                    ask(f"style_token:{position}", f"Does the image actually show this: {token}?", weight=2)
                if values.get("bible.palette_hex"):
                    ask("palette", "Are the image's values confined to this palette, with no colour outside it: "
                        + ", ".join(values["bible.palette_hex"]) + "?", weight=2,
                        look_at="Sample a light area, a mid tone and a shadow, and every metal, fabric and liquid in the image")
                rules = values.get("bible.lighting_rules")
                if isinstance(rules, str) and rules.strip():
                    ask("lighting_rules", f"Does the light in this sheet follow: {rules.strip()}?", weight=2, cap=True)
                # A sheet is inherited by every frame that references it, so it has at least as
                # much to answer for as a cut. It was asked less only because nobody had written
                # the questions down.
                excluded = values.get("negative_prompts")
                if isinstance(excluded, str) and excluded.strip():
                    ask("excluded", f"Is the sheet free of all of these: {excluded.strip()}?", weight=2, cap=True,
                        look_at="Scan the whole sheet, including every small invented detail")
            elif node["kind"] == "cut":
                scope = production["scope"]
                for asset in production["assets"]:
                    if asset["id"] in scope["characters"]:
                        ask(f"cast:{asset['id']}", f"Is {asset['name']} in frame?", asset_id=asset["id"], weight=3, cap=True)
                        identity(asset)
                    elif asset["id"] == scope["location"]:
                        ask(f"location:{asset['id']}", f"Is this {asset['name']}?", asset_id=asset["id"], weight=3, cap=True)
                    elif asset["id"] in scope["props"]:
                        ask(f"prop:{asset['id']}", f"Is {asset['name']} visible?", asset_id=asset["id"], weight=2, cap=True)
                continuity = production["continuity"] or {}
                conflicted = {conflict["field"] for conflict in continuity.get("conflicts", [])}
                in_frame = set(self.rules.asset_ids(scope))
                for key, candidates in continuity.get("incoming", {}).items():
                    if key in conflicted or not candidates:
                        continue
                    fact = candidates[0]
                    if fact["asset_id"] not in in_frame:
                        continue  # a state is only answerable about something the frame shows
                    attribute = fact["attribute"].replace("_", " ")
                    locked = fact["attribute"] in (self._context(conn, fact["asset_id"])["values"].get("locks") or [])
                    ask(f"state:{key}", f"Is {label(fact['asset_id'])}'s {attribute} {label(fact['value'])}?",
                        asset_id=fact["asset_id"], weight=3 if locked else 2, cap=locked)
                action = str(values.get("action") or "").strip() or node["notes"].strip()
                if action:
                    ask("action", f"Does the frame show this happening: {action}?", weight=3)
                point = values.get("beat.visual_point")
                if isinstance(point, str) and point.strip():
                    ask("beat", f"Does the frame carry this: {point.strip()}?", weight=2)
                style = values.get("style")
                if isinstance(style, str) and style.strip():
                    ask("style", f"Is the image rendered in this style: {style.strip()}?", weight=1)
                # A harness exists to hold someone's visual language. One vague question about
                # "the style" is answered generously; each declared token has to be looked for.
                for position, token in enumerate(values.get("bible.tokens") or []):
                    ask(f"style_token:{position}", f"Does the image actually show this: {token}?", weight=2,
                        look_at="Look at the whole frame and at one detail crop; a technique either appears or it does not")
                palette = values.get("bible.palette_hex") or []
                if palette:
                    ask("palette", "Are the image's values confined to this palette, with no colour outside it: "
                        + ", ".join(palette) + "?", weight=2,
                        look_at="Look at the whole frame; sample a light area, a mid tone and a shadow")
                rules = values.get("bible.lighting_rules")
                if isinstance(rules, str) and rules.strip():
                    ask("lighting_rules", f"Does the light in this frame follow: {rules.strip()}?", weight=2, cap=True,
                        look_at="Look at every surface light could fall on — floor, walls, faces — not only at the source")
                excluded = values.get("negative_prompts")
                if isinstance(excluded, str) and excluded.strip():
                    ask("excluded", f"Is the image free of all of these: {excluded.strip()}?", weight=2, cap=True,
                        look_at="Scan the whole frame for anything on the list, including small invented props")
            elif node["kind"] == "project":
                # A project-level image is the style reference every other image inherits. It is the
                # one picture whose only job is the visual contract, so that is all it is asked.
                if not any(values.get(k) for k in ("bible.tokens", "bible.palette_hex", "bible.lighting_rules", "negative_prompts")):
                    raise StudioError("facts_scope", "This project has no style bible to check an anchor against")
                ask(f"anchor:{node['id']}",
                    "Is this a style reference only — no characters, no story location, no narrative "
                    "composition, nothing that could be mistaken for a frame of the film?",
                    asset_id=None, weight=3, cap=True, look_at="Look at the whole image")
                for position, token in enumerate(values.get("bible.tokens") or []):
                    ask(f"style_token:{position}", f"Does the image actually show this: {token}?", weight=3)
                if values.get("bible.palette_hex"):
                    ask("palette", "Are the image's values confined to this palette, with no colour outside it: "
                        + ", ".join(values["bible.palette_hex"]) + "?", weight=3)
                rules = values.get("bible.lighting_rules")
                if isinstance(rules, str) and rules.strip():
                    ask("lighting_rules", f"Does the image demonstrate: {rules.strip()}?", weight=2, cap=True)
                excluded = values.get("negative_prompts")
                if isinstance(excluded, str) and excluded.strip():
                    ask("excluded", f"Is the image free of all of these: {excluded.strip()}?", weight=3, cap=True)
            else:
                raise StudioError("facts_scope", "Facts are derived for cuts, assets and a project's style anchor")
            # An image that was built on another asset's sheet has one more thing to answer for:
            # whether it drew the same object. A location sheet can satisfy every one of its own
            # details and still contain a second, different machine where the prop should be, and
            # nothing else in this rubric would notice.
            for owner_id, owner_name in self._referenced_assets(conn, media_id, node_id):
                ask(f"matches_sheet:{owner_id}",
                    f"Does {owner_name} as it appears here match its own reference sheet — the same "
                    f"object with the same construction, not a second version of it?",
                    asset_id=owner_id, weight=2, cap=True,
                    look_at=f"Crop {owner_name} out of this image and set it beside its sheet")
            return {"node_id": node_id, "kind": node["kind"], "questions": questions,
                    "scoring": "engine computes per-group weighted geometric means from your probabilities; "
                               "min_group is the headline; any capped question below 0.5, or the action group below 0.5, caps the record at 0.4"}

    def _referenced_assets(self, conn, media_id, node_id):
        """Assets whose own sheet was a reference for this media, newest recipe wins."""
        if not media_id:
            return []
        media = self.store.one(conn, "media", media_id)
        if not media["job_id"]:
            return []
        job = self.store.one(conn, "jobs", media["job_id"])
        recipe = self.store.one(conn, "recipes", job["recipe_id"])
        out, seen = [], set()
        for ref in json.loads(recipe["spec"]).get("references") or []:
            row = conn.execute(
                "SELECT n.id,n.name,n.kind FROM media m JOIN nodes n ON n.id=m.node_id WHERE m.id=?",
                (ref.get("media_id"),),
            ).fetchone()
            if row and row["kind"] in ASSET_KINDS and row["id"] != node_id and row["id"] not in seen:
                seen.add(row["id"])
                out.append((row["id"], row["name"]))
        return out

    def lineage(self, media_id):
        with self.store.connection() as conn:
            self.store.one(conn, "media", media_id)
            return lineage.lineage(conn, media_id)

    def import_media(self, node_id: str, path: str | Path, label: str, *, job_id=None, metadata=None):
        from PIL import Image

        source = Path(path).resolve()
        if not source.is_file():
            raise StudioError("media_missing", "Media file does not exist")
        # Decode images instead of trusting a user-controlled extension.
        suffix = source.suffix.lower()
        if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
            with Image.open(source) as img:
                img.verify()
                mime = Image.MIME[img.format]
        elif suffix in {".mp4", ".webm"}:
            mime = "video/mp4" if suffix == ".mp4" else "video/webm"
        else:
            raise StudioError("media_type", "Supported media: PNG, JPEG, WebP, MP4, WebM")
        sha = self._file_hash(source)
        filename = sha + suffix
        destination = self.store.media_dir / filename
        with self.store.connection(write=True) as conn:
            node = self.store.one(conn, "nodes", node_id)
            if job_id:
                job = self.store.one(conn, "jobs", job_id)
                recipe = self.store.one(conn, "recipes", job["recipe_id"])
                if recipe["node_id"] != node["id"]:
                    raise StudioError("job_target", "Job and media target differ")
                existing = conn.execute("SELECT * FROM media WHERE job_id=? AND sha256=?", (job_id, sha)).fetchone()
                if existing:
                    return self._media(conn, dict(existing))
            if not destination.exists():
                temp = self.store.media_dir / (identifier() + ".partial")
                try:
                    shutil.copyfile(source, temp)
                    if self._file_hash(temp) != sha:
                        raise StudioError("media_changed", "Source changed during import")
                    temp.replace(destination)
                finally:
                    temp.unlink(missing_ok=True)
            elif self._file_hash(destination) != sha:
                raise StudioError("media_corrupt", "Stored media checksum mismatch; restore it before importing")
            media_id = identifier()
            conn.execute(
                "INSERT INTO media VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    media_id,
                    node_id,
                    filename,
                    sha,
                    mime,
                    label,
                    job_id,
                    encoded(metadata or {}),
                    time.time(),
                ),
            )
            return self._media(conn, self.store.one(conn, "media", media_id))

    @staticmethod
    def _file_hash(path):
        h = hashlib.sha256()
        with Path(path).open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest()

    def media_path(self, media_id: str):
        with self.store.connection() as conn:
            row = self.store.one(conn, "media", media_id)
            path = (self.store.media_dir / row["path"]).resolve()
            if not path.is_relative_to(self.store.media_dir) or not path.is_file():
                raise StudioError("media_missing", "Stored media is unavailable", 404)
            return path, row["mime_type"]

    def prepare(self, request: RecipeCreate):
        from backend.studio.providers import FakeProvider, Higgsfield

        provider = FakeProvider(self.store.home / "fixtures") if request.provider == "fake" else Higgsfield()
        prepared = provider.prepare(request)
        with self.store.connection(write=True) as conn:
            node = self.store.one(conn, "nodes", request.node_id)
            context = self._generation_context(conn, node["id"])
            references = []
            for ref in request.references:
                media = self.store.one(conn, "media", ref.media_id)
                owner = self.store.one(conn, "nodes", media["node_id"])
                if owner["project_id"] != node["project_id"]:
                    raise StudioError("reference_project", "Reference belongs to another project")
                references.append(
                    {
                        **ref.model_dump(),
                        "sha256": media["sha256"],
                        "source_node_id": owner["id"],
                        "source_revision": owner["revision"],
                        "source_context": self._context(conn, owner["id"]),
                        "review_revision": self.rules.review(conn, media)["revision"],
                    }
                )
            slots = [int(n) for n in re.findall(r"@Image(\d+)", request.prompt)]
            if any(n < 1 or n > len(references) for n in slots):
                raise StudioError("reference_binding", "Prompt names an image that is not attached")
            self.rules.validate_recipe(conn, node["id"], references, request.prompt)
            gaps = self.rules.recipe_gaps(conn, node["id"], references, request.prompt)
            spec = {**request.model_dump(), **prepared, "references": references}
            fingerprint = digest({"spec": spec, "context": context})
            recipe_id = identifier()
            conn.execute(
                "INSERT INTO recipes VALUES (?,?,?,?,?,?,?,?)",
                (
                    recipe_id,
                    node["id"],
                    fingerprint,
                    encoded(spec),
                    encoded(context),
                    None,
                    None,
                    time.time(),
                ),
            )
            cap = context["values"].get("policy.reference_depth_cap", lineage.DEFAULT_DEPTH_CAP)
            return {
                **self._recipe(self.store.one(conn, "recipes", recipe_id)),
                "warnings": lineage.depth_warnings(conn, references, cap) + gaps,
            }

    @staticmethod
    def _recipe(row):
        return {**row, "spec": json.loads(row["spec"]), "context": json.loads(row["context"])}

    def _recipe_status(self, conn, row):
        recipe = self._recipe(row)
        try:
            self._fresh(conn, row)
            return {**recipe, "fresh": True, "stale_reason": None}
        except StudioError as error:
            return {**recipe, "fresh": False, "stale_reason": str(error)}

    def recipe(self, recipe_id):
        with self.store.connection() as conn:
            return self._recipe_status(conn, self.store.one(conn, "recipes", recipe_id))

    def _fresh(self, conn, recipe):
        if self._generation_context(conn, recipe["node_id"]) != json.loads(recipe["context"]):
            raise StudioError("context_changed", "Context changed; prepare and approve a new recipe", 409)
        for ref in json.loads(recipe["spec"])["references"]:
            owner = self.store.one(conn, "nodes", ref["source_node_id"])
            media = self.store.one(conn, "media", ref["media_id"])
            if (
                owner["revision"] != ref["source_revision"]
                or ("source_context" in ref and self._context(conn, owner["id"]) != ref["source_context"])
                or self.rules.review(conn, media)["revision"] != ref.get("review_revision")
            ):
                raise StudioError("reference_changed", "A reference source changed; review a new recipe", 409)
        spec = json.loads(recipe["spec"])
        self.rules.validate_recipe(conn, recipe["node_id"], spec["references"], spec.get("prompt", ""))

    def approve(self, recipe_id: str, approval: Approval):
        with self.store.connection(write=True) as conn:
            row = self.store.one(conn, "recipes", recipe_id)
            if row["fingerprint"] != approval.fingerprint:
                raise StudioError("approval_mismatch", "Approval does not match the prepared request", 409)
            self._fresh(conn, row)
            estimate = json.loads(row["spec"]).get("estimate", {"credits": None})
            policy = approval.model_dump(exclude={"fingerprint", "user_decision"})
            if policy["max_credits"] is None and estimate.get("credits") is not None:
                policy["max_credits"] = estimate["credits"]
            validate_cost(estimate, policy)
            conn.execute(
                "INSERT OR REPLACE INTO recipe_approvals(recipe_id,policy,batch_id) VALUES (?,?,NULL)",
                (recipe_id, encoded(policy)),
            )
            conn.execute(
                "UPDATE recipes SET approved_at=?,user_decision=? WHERE id=?",
                (time.time(), approval.user_decision, recipe_id),
            )
            return self._recipe(self.store.one(conn, "recipes", recipe_id))

    def approve_batch(self, request: BatchApproval):
        with self.store.connection(write=True) as conn:
            prepared = []
            project_id = None
            for item in request.items:
                row = self.store.one(conn, "recipes", item.recipe_id)
                node = self.store.one(conn, "nodes", row["node_id"])
                if project_id is None:
                    project_id = node["project_id"]
                elif project_id != node["project_id"]:
                    raise StudioError("batch_project", "A generation batch cannot span productions", 409)
                if row["fingerprint"] != item.fingerprint:
                    raise StudioError("approval_mismatch", "Batch approval does not match a prepared request", 409)
                self._fresh(conn, row)
                estimate = json.loads(row["spec"]).get("estimate", {"credits": None})
                policy = {"max_credits": item.max_credits, "allow_unknown_cost": False}
                validate_cost(estimate, policy)
                prepared.append((row, policy))
            batch_id, now = identifier(), time.time()
            conn.execute(
                "INSERT INTO approval_batches VALUES (?,?,?,?)", (batch_id, project_id, request.user_decision, now)
            )
            jobs = []
            for row, policy in prepared:
                conn.execute(
                    "INSERT OR REPLACE INTO recipe_approvals(recipe_id,policy,batch_id) VALUES (?,?,?)",
                    (row["id"], encoded(policy), batch_id),
                )
                conn.execute(
                    "UPDATE recipes SET approved_at=?,user_decision=? WHERE id=?",
                    (now, request.user_decision, row["id"]),
                )
                existing = conn.execute("SELECT * FROM jobs WHERE recipe_id=?", (row["id"],)).fetchone()
                if existing:
                    jobs.append(self._job(dict(existing)))
                    continue
                job_id = identifier()
                conn.execute(
                    "INSERT INTO jobs(id,recipe_id,state,created_at,updated_at) VALUES (?,?,'queued',?,?)",
                    (job_id, row["id"], now, now),
                )
                self.store.event(conn, job_id, "queued", {"recipe_id": row["id"], "batch_id": batch_id}, now)
                jobs.append(self._job(self.store.one(conn, "jobs", job_id)))
            return {"batch_id": batch_id, "project_id": project_id, "jobs": jobs}

    def enqueue(self, recipe_id: str):
        with self.store.connection(write=True) as conn:
            row = self.store.one(conn, "recipes", recipe_id)
            existing = conn.execute("SELECT * FROM jobs WHERE recipe_id=?", (recipe_id,)).fetchone()
            if existing:
                return self._job(dict(existing))
            if not row["approved_at"]:
                raise StudioError("approval_required", "Approve the exact recipe before execution", 409)
            self._fresh(conn, row)
            now, job_id = time.time(), identifier()
            conn.execute(
                "INSERT INTO jobs(id,recipe_id,state,created_at,updated_at) VALUES (?,?,'queued',?,?)",
                (job_id, recipe_id, now, now),
            )
            self.store.event(conn, job_id, "queued", {"recipe_id": recipe_id}, now)
            return self._job(self.store.one(conn, "jobs", job_id))

    @staticmethod
    def _job(row):
        return {**row, "outputs": json.loads(row["outputs"]), "receipt": json.loads(row["receipt"])}

    def job(self, job_id):
        with self.store.connection() as conn:
            job = self._job(self.store.one(conn, "jobs", job_id))
            job["events"] = [
                {**dict(r), "details": json.loads(r["details"])}
                for r in conn.execute("SELECT * FROM job_events WHERE job_id=? ORDER BY sequence", (job_id,))
            ]
            return job

    def select(self, node_id, media_id, expected_revision):
        with self.store.connection(write=True) as conn:
            node = self.store.one(conn, "nodes", node_id)
            media = self.store.one(conn, "media", media_id)
            if media["node_id"] != node_id:
                raise StudioError("media_target", "This take belongs to a different node")
            if node["revision"] != expected_revision:
                raise StudioError("revision_conflict", "Node changed; refresh before selecting", 409)
            review = self.rules.review(conn, media)
            if review["status"] != "approved" or review["stale"]:
                raise StudioError(
                    "review_required", "Approve this take against its current definition before selecting it", 409
                )
            if node["kind"] == "cut":
                if self.rules.policy(conn, node_id)["autonomous"]:
                    status = self.rules.take_status(conn, media)
                    if not status["accepted"]:
                        raise StudioError("take_not_accepted", "This take has not passed the evaluation gate: " + "; ".join(status["reasons"]), 409)
                production = self.rules.resolve(conn, node_id)
                if not production["readiness"]["ready"]:
                    raise StudioError(
                        "production_not_ready",
                        "Resolve this cut's readiness issues before selecting its final take",
                        409,
                    )
                missing = set(self.rules.asset_ids(production["scope"])) - set(review["depicted_assets"])
                if missing:
                    names = [self.store.one(conn, "nodes", item)["name"] for item in sorted(missing)]
                    raise StudioError(
                        "depiction_missing",
                        "Confirm these required assets are visible before selecting the final take: "
                        + ", ".join(names),
                        409,
                    )
            conn.execute(
                "UPDATE nodes SET active_media_id=?,revision=revision+1,updated_at=? WHERE id=?",
                (media_id, time.time(), node_id),
            )
            node = self.store.one(conn, "nodes", node_id)
            self.store.revision(conn, node, "Selected take " + media_id)
            return self._node(node)

    def review_media(self, media_id: str, request: MediaReview):
        with self.store.connection(write=True) as conn:
            media = self.store.one(conn, "media", media_id)
            node = self.store.one(conn, "nodes", media["node_id"])
            previous = self.rules.review(conn, media)
            if previous["revision"] != request.expected_revision:
                raise StudioError(
                    "review_conflict", "This take was reviewed elsewhere; inspect the current decision", 409
                )
            if self.rules.review_context(conn, media) != request.expected_context:
                raise StudioError(
                    "review_context_changed",
                    "Production details changed during review; reopen this take before deciding",
                    409,
                )
            if media["job_id"] and self.store.one(conn, "jobs", media["job_id"])["state"] != "ready":
                raise StudioError("output_not_ready", "Wait for this job's outputs to finish collecting", 409)
            subjects = list(
                dict.fromkeys([*([node["id"]] if node["kind"] in ASSET_KINDS else []), *request.depicted_assets])
            )
            for subject in subjects:
                self.rules.target(conn, node, subject, ASSET_KINDS)
            requirements = list(dict.fromkeys(request.requirement_ids))
            if requirements and node["kind"] not in ASSET_KINDS:
                raise StudioError("requirement_target", "Only asset takes can confirm planned view or state coverage")
            known_requirements = {
                row["id"] for row in conn.execute("SELECT id FROM asset_requirements WHERE asset_id=?", (node["id"],))
            }
            if not set(requirements) <= known_requirements:
                raise StudioError("requirement_invalid", "A confirmed requirement does not belong to this asset")
            requirement_hashes = {}
            for requirement in conn.execute(
                "SELECT * FROM asset_requirements WHERE asset_id=? AND id IN ({})".format(
                    ",".join("?" for _ in requirements) or "NULL"
                ),
                (node["id"], *requirements),
            ):
                requirement_hashes[requirement["id"]] = digest(
                    {key: requirement[key] for key in ("id", "asset_id", "kind", "label", "instruction", "priority")}
                )
            conn.execute(
                """INSERT INTO media_reviews(
                    media_id,revision,status,user_decision,depicted_assets,
                    definition_hash,subject_hashes,created_at,requirement_ids,requirement_hashes,author
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    media_id,
                    previous["revision"] + 1,
                    request.status,
                    request.user_decision,
                    encoded(subjects),
                    self.rules.definition(conn, node["id"]),
                    encoded({subject: self.rules.definition(conn, subject) for subject in subjects}),
                    time.time(),
                    encoded(requirements),
                    encoded(requirement_hashes),
                    request.author,
                ),
            )
            return self._media(conn, media)

    def reorder(self, parent_id: str, request: Reorder):
        with self.store.connection(write=True) as conn:
            self.store.one(conn, "nodes", parent_id)
            siblings = {
                r["id"]: dict(r)
                for r in conn.execute("SELECT * FROM nodes WHERE parent_id=? AND kind=?", (parent_id, request.kind))
            }
            if (
                len(request.ordered_ids) != len(set(request.ordered_ids))
                or set(request.ordered_ids) != set(siblings)
                or set(request.expected_revisions) != set(siblings)
            ):
                raise StudioError("order_conflict", "Reorder must include every current sibling exactly once", 409)
            if any(node["revision"] != request.expected_revisions[node_id] for node_id, node in siblings.items()):
                raise StudioError("revision_conflict", "A sibling changed; inspect before reordering", 409)
            conn.execute("UPDATE nodes SET position=-position WHERE parent_id=? AND kind=?", (parent_id, request.kind))
            for position, node_id in enumerate(request.ordered_ids, 1):
                changed = position != siblings[node_id]["position"]
                conn.execute(
                    "UPDATE nodes SET position=?,revision=revision+?,updated_at=? WHERE id=?",
                    (position, int(changed), time.time(), node_id),
                )
                if changed:
                    self.store.revision(conn, self.store.one(conn, "nodes", node_id), request.reason)
            return [self._node(self.store.one(conn, "nodes", node_id)) for node_id in request.ordered_ids]

    def feedback(self, media_id, text):
        with self.store.connection(write=True) as conn:
            self.store.one(conn, "media", media_id)
            feedback_id = identifier()
            conn.execute("INSERT INTO feedback VALUES (?,?,?,?)", (feedback_id, media_id, text, time.time()))
            return {"id": feedback_id, "media_id": media_id, "text": text}

    def retry_collection(self, job_id):
        with self.store.connection(write=True) as conn:
            job = self.store.one(conn, "jobs", job_id)
            if job["state"] != "collection_failed":
                raise StudioError("retry_invalid", "Only failed output collection can be retried here", 409)
            conn.execute("UPDATE jobs SET state='collecting',error=NULL,updated_at=0 WHERE id=?", (job_id,))
            self.store.event(conn, job_id, "collecting", {"action": "retry_collection"}, time.time())
            return self._job(self.store.one(conn, "jobs", job_id))
