"""Selective, portable production archives with no executable permissions."""

from __future__ import annotations

import json
import shutil
import sqlite3
import tempfile
import time
import zipfile
from pathlib import Path, PurePosixPath

from backend.studio.backup import MAX_ARCHIVE_BYTES, checksum
from backend.studio.store import Store, StudioError, encoded

FORMAT = "strawberry-project"
VERSION = 1
DATA_FILE = "project.json"
MAX_DATA_BYTES = 128 * 1024**2

TABLE_COLUMNS = {
    "nodes": [
        "id", "project_id", "parent_id", "kind", "name", "position", "revision", "fields", "notes",
        "active_media_id", "created_at", "updated_at",
    ],
    "sources": ["id", "node_id", "author", "status", "text", "created_at"],
    "revisions": ["node_id", "revision", "snapshot", "reason", "source_id", "created_at"],
    "media": ["id", "node_id", "path", "sha256", "mime_type", "label", "job_id", "metadata", "created_at"],
    "recipes": [
        "id", "node_id", "fingerprint", "spec", "context", "approved_at", "user_decision", "created_at",
    ],
    "jobs": [
        "id", "recipe_id", "state", "provider_id", "outputs", "receipt", "error", "owner", "lease_until",
        "created_at", "updated_at",
    ],
    "feedback": ["id", "media_id", "text", "created_at"],
    "job_events": ["job_id", "state", "details", "created_at"],
    "media_reviews": [
        "media_id", "revision", "status", "user_decision", "depicted_assets", "definition_hash",
        "subject_hashes", "created_at", "requirement_ids", "requirement_hashes",
    ],
    "recipe_approvals": ["recipe_id", "policy", "batch_id"],
    "approval_batches": ["id", "project_id", "user_decision", "created_at"],
    "asset_requirements": [
        "id", "asset_id", "kind", "label", "instruction", "priority", "created_at", "updated_at",
    ],
    "evaluations": [
        "media_id", "evaluator", "version", "kind", "scores", "evidence", "confidence", "discrepancies",
        "context_hash", "review_revision", "created_at",
    ],
}
OPTIONAL_TABLES = {"evaluations"}

INSERT_ORDER = (
    "nodes", "sources", "revisions", "media", "recipes", "approval_batches", "jobs", "feedback",
    "job_events", "media_reviews", "asset_requirements", "evaluations",
)
PENDING_STATES = {"queued", "submitting", "running", "collecting"}


def _rows(conn, sql: str, parameters=()):
    return [dict(row) for row in conn.execute(sql, parameters)]


def _project_records(conn, project_id: str):
    node_ids = [row["id"] for row in conn.execute("SELECT id FROM nodes WHERE project_id=?", (project_id,))]
    if not node_ids:
        raise StudioError("not_found", f"Project not found: {project_id}", 404)
    placeholders = ",".join("?" for _ in node_ids)
    sources = _rows(conn, f"SELECT * FROM sources WHERE node_id IN ({placeholders})", node_ids)
    source_ids = [row["id"] for row in sources]
    media = _rows(conn, f"SELECT * FROM media WHERE node_id IN ({placeholders})", node_ids)
    media_ids = [row["id"] for row in media]
    recipes = _rows(conn, f"SELECT * FROM recipes WHERE node_id IN ({placeholders})", node_ids)
    recipe_ids = [row["id"] for row in recipes]
    jobs = _rows(
        conn,
        f"SELECT * FROM jobs WHERE recipe_id IN ({','.join('?' for _ in recipe_ids)})",
        recipe_ids,
    ) if recipe_ids else []
    job_ids = [row["id"] for row in jobs]

    records = {
        "nodes": _rows(conn, "SELECT * FROM nodes WHERE project_id=? ORDER BY created_at,id", (project_id,)),
        "sources": sources,
        "revisions": _rows(
            conn,
            f"SELECT * FROM revisions WHERE node_id IN ({placeholders}) ORDER BY node_id,revision",
            node_ids,
        ),
        "media": media,
        "recipes": recipes,
        "jobs": jobs,
        "feedback": _rows(
            conn,
            f"SELECT * FROM feedback WHERE media_id IN ({','.join('?' for _ in media_ids)})",
            media_ids,
        ) if media_ids else [],
        "job_events": _rows(
            conn,
            f"SELECT job_id,state,details,created_at FROM job_events WHERE job_id IN ({','.join('?' for _ in job_ids)}) ORDER BY sequence",
            job_ids,
        ) if job_ids else [],
        "evaluations": _rows(
            conn,
            "SELECT media_id,evaluator,version,kind,scores,evidence,confidence,discrepancies,context_hash,"
            f"review_revision,created_at FROM evaluations WHERE media_id IN ({','.join('?' for _ in media_ids)}) ORDER BY sequence",
            media_ids,
        ) if media_ids else [],
        "media_reviews": _rows(
            conn,
            f"SELECT * FROM media_reviews WHERE media_id IN ({','.join('?' for _ in media_ids)}) ORDER BY media_id,revision",
            media_ids,
        ) if media_ids else [],
        "recipe_approvals": _rows(
            conn,
            f"SELECT * FROM recipe_approvals WHERE recipe_id IN ({','.join('?' for _ in recipe_ids)})",
            recipe_ids,
        ) if recipe_ids else [],
        "approval_batches": _rows(
            conn, "SELECT * FROM approval_batches WHERE project_id=? ORDER BY created_at,id", (project_id,)
        ),
        "asset_requirements": _rows(
            conn,
            f"SELECT * FROM asset_requirements WHERE asset_id IN ({placeholders}) ORDER BY asset_id,priority,created_at",
            node_ids,
        ),
    }
    if source_ids and any(row["source_id"] and row["source_id"] not in source_ids for row in records["revisions"]):
        raise StudioError("project_boundary", "Revision history references a source outside this production")
    return records


def export_project(store: Store, project_id: str, destination: str | Path):
    destination = Path(destination).resolve()
    if destination.exists():
        raise StudioError("export_exists", "Project export destination already exists")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with store.connection() as conn:
        project = Store.one(conn, "nodes", project_id)
        if project["kind"] != "project" or project["project_id"] != project_id:
            raise StudioError("not_project", "Expected a project ID")
        records = _project_records(conn, project_id)

    data = encoded({"schema_version": 5, "project_id": project_id, "tables": records}).encode()
    if len(data) > MAX_DATA_BYTES:
        raise StudioError("export_size", "Project metadata exceeds the current portable export limit")
    entries: dict[str, Path | bytes] = {DATA_FILE: data}
    for row in records["media"]:
        if PurePosixPath(row["path"]).name != row["path"] or "\\" in row["path"]:
            raise StudioError("export_corrupt", "Managed media has a non-portable path")
        path = (store.media_dir / row["path"]).resolve()
        if not path.is_relative_to(store.media_dir) or not path.is_file() or checksum(path) != row["sha256"]:
            raise StudioError("export_corrupt", "Media is missing or changed; project export refused")
        archive_name = "media/" + row["path"]
        existing = entries.get(archive_name)
        if existing is not None and Path(existing) != path:
            raise StudioError("export_corrupt", "Multiple media records disagree about one managed file")
        entries[archive_name] = path

    file_manifest = {}
    for name, value in entries.items():
        if isinstance(value, bytes):
            import hashlib

            file_manifest[name] = {"sha256": hashlib.sha256(value).hexdigest(), "bytes": len(value)}
        else:
            file_manifest[name] = {"sha256": checksum(value), "bytes": value.stat().st_size}
    if sum(item["bytes"] for item in file_manifest.values()) > MAX_ARCHIVE_BYTES:
        raise StudioError("export_size", "Project exceeds the current 4 GiB portable export limit")
    manifest = {
        "format": FORMAT,
        "version": VERSION,
        "created_at": time.time(),
        "project": {"id": project_id, "name": project["name"]},
        "files": file_manifest,
        "authorization": "generation approvals are historical only and are reset on import",
    }
    with destination.open("xb") as output:
        try:
            with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("manifest.json", encoded(manifest))
                for name, value in entries.items():
                    archive.writestr(name, value) if isinstance(value, bytes) else archive.write(value, name)
        except BaseException:
            destination.unlink(missing_ok=True)
            raise
    return {
        "path": str(destination),
        "project_id": project_id,
        "project_name": project["name"],
        "files": len(entries),
        "bytes": destination.stat().st_size,
    }


def _checked_archive(archive_path: str | Path, staging: Path):
    with zipfile.ZipFile(archive_path) as archive:
        members = archive.infolist()
        names = [item.filename for item in members]
        if len(set(names)) != len(names):
            raise StudioError("archive_invalid", "Duplicate archive entries")
        info = archive.getinfo("manifest.json")
        if info.file_size > 8 * 1024**2:
            raise StudioError("archive_invalid", "Manifest is too large")
        manifest = json.loads(archive.read(info))
        if manifest.get("format") != FORMAT or manifest.get("version") != VERSION:
            raise StudioError("archive_invalid", "Unsupported project archive format")
        files = manifest.get("files")
        if not isinstance(files, dict) or DATA_FILE not in files or set(files) | {"manifest.json"} != set(names):
            raise StudioError("archive_invalid", "Project archive contents do not match the manifest")
        if sum(item.file_size for item in members) > MAX_ARCHIVE_BYTES:
            raise StudioError("archive_invalid", "Project archive exceeds the current 4 GiB import limit")
        for name, expected in files.items():
            parts = PurePosixPath(name).parts
            allowed = name == DATA_FILE or (
                len(parts) == 2 and parts[0] == "media" and parts[1] not in {".", ".."} and "\\" not in name
            )
            if not allowed or not isinstance(expected, dict):
                raise StudioError("archive_invalid", "Unexpected project archive path")
            target = staging / name
            target.parent.mkdir(parents=True, exist_ok=True)
            if archive.getinfo(name).file_size != expected.get("bytes"):
                raise StudioError("archive_invalid", "File size differs from project manifest")
            with archive.open(name) as source, target.open("xb") as output:
                shutil.copyfileobj(source, output)
            if checksum(target) != expected.get("sha256"):
                raise StudioError("archive_invalid", "File checksum differs from project manifest")
        return manifest


def _validate_records(payload, manifest):
    if payload.get("schema_version") != 5 or payload.get("project_id") != manifest.get("project", {}).get("id"):
        raise StudioError("archive_invalid", "Project metadata version or identity is incompatible")
    tables = payload.get("tables")
    if not isinstance(tables, dict) or not (set(TABLE_COLUMNS) - OPTIONAL_TABLES <= set(tables) <= set(TABLE_COLUMNS)):
        raise StudioError("archive_invalid", "Project archive has an unexpected table set")
    for table in OPTIONAL_TABLES:
        tables.setdefault(table, [])
    for table, columns in TABLE_COLUMNS.items():
        rows = tables[table]
        if not isinstance(rows, list) or any(not isinstance(row, dict) or set(row) != set(columns) for row in rows):
            raise StudioError("archive_invalid", f"Project archive has invalid {table} records")
    project_id = payload["project_id"]
    nodes = tables["nodes"]
    node_ids = {row["id"] for row in nodes}
    roots = [row for row in nodes if row["id"] == project_id and row["kind"] == "project" and row["parent_id"] is None]
    if (
        len(roots) != 1
        or roots[0]["name"] != manifest.get("project", {}).get("name")
        or any(row["project_id"] != project_id for row in nodes)
    ):
        raise StudioError("archive_invalid", "Project archive does not contain exactly one valid production root")
    if any(row["parent_id"] is not None and row["parent_id"] not in node_ids for row in nodes):
        raise StudioError("archive_invalid", "Project hierarchy references a node outside the archive")
    media_names = {"media/" + row["path"] for row in tables["media"]}
    if media_names != {name for name in manifest["files"] if name.startswith("media/")}:
        raise StudioError("archive_invalid", "Project media records and files disagree")
    for row in tables["media"]:
        if manifest["files"]["media/" + row["path"]]["sha256"] != row["sha256"]:
            raise StudioError("archive_invalid", "Project media checksum does not match its record")
    return tables


def _sort_nodes(rows):
    ordered, remaining, inserted = [], list(rows), set()
    while remaining:
        ready = [row for row in remaining if row["parent_id"] is None or row["parent_id"] in inserted]
        if not ready:
            raise StudioError("archive_invalid", "Project hierarchy contains a cycle")
        for row in ready:
            ordered.append(row)
            inserted.add(row["id"])
            remaining.remove(row)
    return ordered


def _insert(conn, table: str, rows):
    columns = TABLE_COLUMNS[table]
    sql = f"INSERT INTO {table}({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})"
    conn.executemany(sql, [[row[column] for column in columns] for row in rows])


def import_project(store: Store, archive_path: str | Path):
    created_files: list[Path] = []
    try:
        with tempfile.TemporaryDirectory(prefix="strawberry-project-import-") as temporary:
            staging = Path(temporary)
            manifest = _checked_archive(archive_path, staging)
            data_path = staging / DATA_FILE
            if data_path.stat().st_size > MAX_DATA_BYTES:
                raise StudioError("archive_invalid", "Project metadata is too large")
            tables = _validate_records(json.loads(data_path.read_text()), manifest)
            project_id = manifest["project"]["id"]
            with store.connection(write=True) as conn:
                if conn.execute("SELECT 1 FROM nodes WHERE project_id=? OR id=?", (project_id, project_id)).fetchone():
                    raise StudioError("project_conflict", "A production with this identity already exists", 409)
                for table in ("sources", "media", "recipes", "jobs", "feedback", "approval_batches", "asset_requirements"):
                    ids = [row["id"] for row in tables[table] if "id" in row]
                    if ids and conn.execute(
                        f"SELECT 1 FROM {table} WHERE id IN ({','.join('?' for _ in ids)}) LIMIT 1", ids
                    ).fetchone():
                        raise StudioError("project_conflict", f"Imported {table} identity already exists", 409)

                for media in tables["media"]:
                    source = staging / "media" / media["path"]
                    destination = (store.media_dir / media["path"]).resolve()
                    if not destination.is_relative_to(store.media_dir):
                        raise StudioError("archive_invalid", "Imported media path escapes the workspace")
                    if destination.exists():
                        if checksum(destination) != media["sha256"]:
                            raise StudioError("media_conflict", "Managed media filename has different content", 409)
                    else:
                        shutil.copyfile(source, destination)
                        created_files.append(destination)

                imported = {table: [dict(row) for row in rows] for table, rows in tables.items()}
                imported["nodes"] = _sort_nodes(imported["nodes"])
                # Archive decisions remain auditable, but imported data never grants permission to spend.
                for recipe in imported["recipes"]:
                    recipe["approved_at"] = None
                for job in imported["jobs"]:
                    job["owner"], job["lease_until"] = None, None
                    if job["state"] in PENDING_STATES:
                        previous = job["state"]
                        job["state"] = "submission_unknown"
                        job["error"] = "Imported in-flight job. Reconcile provider history before any submission."
                        job["updated_at"] = time.time()
                        imported["job_events"].append(
                            {
                                "job_id": job["id"],
                                "state": "submission_unknown",
                                "details": encoded({"reason": "imported_project", "previous_state": previous}),
                                "created_at": time.time(),
                            }
                        )
                for table in INSERT_ORDER:
                    _insert(conn, table, imported[table])
                if conn.execute("PRAGMA foreign_key_check").fetchone():
                    raise StudioError("archive_invalid", "Imported project relationships are inconsistent")
            return {
                "project_id": project_id,
                "project_name": manifest["project"]["name"],
                "imported": True,
                "generation_approvals_reset": len(tables["recipe_approvals"]),
                "pending_jobs_require_reconciliation": sum(job["state"] in PENDING_STATES for job in tables["jobs"]),
            }
    except StudioError:
        for path in created_files:
            path.unlink(missing_ok=True)
        raise
    except (KeyError, TypeError, ValueError, zipfile.BadZipFile, sqlite3.DatabaseError) as exc:
        for path in created_files:
            path.unlink(missing_ok=True)
        raise StudioError("archive_invalid", "Project archive is malformed or incompatible") from exc
    except BaseException:
        for path in created_files:
            path.unlink(missing_ok=True)
        raise
