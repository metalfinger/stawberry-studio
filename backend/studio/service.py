from __future__ import annotations

import hashlib
import json
import re
import shutil
import time
from pathlib import Path

from backend.studio.execution import Execution, validate_cost
from backend.studio.models import (
    Approval,
    AssetRequirementCreate,
    AssetRequirementUpdate,
    BatchApproval,
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
                return self.rules.resolve(conn, node_id)["readiness"]
            cuts = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM nodes WHERE project_id=? AND kind='cut' ORDER BY position,created_at", (node_id,)
                )
            ]
            results = [
                {"node_id": cut["id"], "name": cut["name"], **self.rules.resolve(conn, cut["id"])["readiness"]}
                for cut in cuts
            ]
            return {
                "ready": bool(results) and all(cut["ready"] for cut in results),
                "cuts": results,
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

    def inspect(self, node_id: str):
        with self.store.connection() as conn:
            node = self.store.one(conn, "nodes", node_id)
            context = self._generation_context(conn, node_id)
            return {
                "node": self._node(node),
                "context": context,
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
        }

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
            self.rules.validate_recipe(conn, node["id"], references)
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
            return self._recipe(self.store.one(conn, "recipes", recipe_id))

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
        self.rules.validate_recipe(conn, recipe["node_id"], json.loads(recipe["spec"])["references"])

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
                    definition_hash,subject_hashes,created_at,requirement_ids,requirement_hashes
                ) VALUES (?,?,?,?,?,?,?,?,?,?)""",
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
