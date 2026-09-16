from __future__ import annotations

import hashlib
import json
import re
import shutil
import time
from pathlib import Path

from backend.studio.models import Approval, NodeCreate, NodePatch, RecipeCreate, SourceCreate
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
            return self._context(conn, node_id)

    def inspect(self, node_id: str):
        with self.store.connection() as conn:
            node = self.store.one(conn, "nodes", node_id)
            context = self._context(conn, node_id)
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
                    self._media(dict(r))
                    for r in conn.execute("SELECT * FROM media WHERE node_id=? ORDER BY created_at DESC", (node_id,))
                ],
            }

    def revision(self, node_id, revision):
        with self.store.connection() as conn:
            self.store.one(conn, "nodes", node_id)
            row = conn.execute("SELECT * FROM revisions WHERE node_id=? AND revision=?", (node_id, revision)).fetchone()
            if not row:
                raise StudioError("not_found", "Revision not found", 404)
            return {**dict(row), "snapshot": self._node(json.loads(row["snapshot"]))}

    def media(self, media_id):
        with self.store.connection() as conn:
            media = self._media(self.store.one(conn, "media", media_id))
            recipe_id = media["metadata"].get("recipe_id")
            return {
                "media": media,
                "feedback": [
                    dict(r)
                    for r in conn.execute("SELECT * FROM feedback WHERE media_id=? ORDER BY created_at,id", (media_id,))
                ],
                "recipe": self._recipe(self.store.one(conn, "recipes", recipe_id)) if recipe_id else None,
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
                    self._media(dict(r))
                    for r in conn.execute(
                        "SELECT m.* FROM media m JOIN nodes n ON n.id=m.node_id WHERE n.project_id=? ORDER BY m.created_at DESC",
                        (project_id,),
                    )
                ],
                "recipes": [
                    self._recipe(dict(r))
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

    @staticmethod
    def _media(row):
        return {**row, "metadata": json.loads(row["metadata"]), "url": f"/api/studio/media/{row['id']}/file"}

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
                    return self._media(dict(existing))
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
            return self._media(self.store.one(conn, "media", media_id))

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
            context = self._context(conn, node["id"])
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
                    }
                )
            slots = [int(n) for n in re.findall(r"@Image(\d+)", request.prompt)]
            if any(n < 1 or n > len(references) for n in slots):
                raise StudioError("reference_binding", "Prompt names an image that is not attached")
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

    def recipe(self, recipe_id):
        with self.store.connection() as conn:
            return self._recipe(self.store.one(conn, "recipes", recipe_id))

    def _fresh(self, conn, recipe):
        if self._context(conn, recipe["node_id"]) != json.loads(recipe["context"]):
            raise StudioError("context_changed", "Context changed; prepare and approve a new recipe", 409)
        for ref in json.loads(recipe["spec"])["references"]:
            owner = self.store.one(conn, "nodes", ref["source_node_id"])
            if owner["revision"] != ref["source_revision"] or (
                "source_context" in ref and self._context(conn, owner["id"]) != ref["source_context"]
            ):
                raise StudioError("reference_changed", "A reference source changed; review a new recipe", 409)

    def approve(self, recipe_id: str, approval: Approval):
        with self.store.connection(write=True) as conn:
            row = self.store.one(conn, "recipes", recipe_id)
            if row["fingerprint"] != approval.fingerprint:
                raise StudioError("approval_mismatch", "Approval does not match the prepared request", 409)
            self._fresh(conn, row)
            conn.execute(
                "UPDATE recipes SET approved_at=?,user_decision=? WHERE id=?",
                (time.time(), approval.user_decision, recipe_id),
            )
            return self._recipe(self.store.one(conn, "recipes", recipe_id))

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
            conn.execute(
                "UPDATE nodes SET active_media_id=?,revision=revision+1,updated_at=? WHERE id=?",
                (media_id, time.time(), node_id),
            )
            node = self.store.one(conn, "nodes", node_id)
            self.store.revision(conn, node, "Selected take " + media_id)
            return self._node(node)

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
