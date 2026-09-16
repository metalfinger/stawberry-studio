"""Portable workspace snapshots. Restore never overwrites an existing workspace."""

from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
import tempfile
import time
import zipfile
from pathlib import Path, PurePosixPath

from backend.studio.store import Store, StudioError, encoded

MAX_ARCHIVE_BYTES = 4 * 1024**3


def checksum(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def backup(store: Store, destination: str | Path):
    destination = Path(destination).resolve()
    if destination.exists():
        raise StudioError("backup_exists", "Backup destination already exists")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="strawberry-backup-") as temporary:
        snapshot = Path(temporary) / "production.sqlite"
        with store.connection() as live, sqlite3.connect(snapshot) as copy:
            live.backup(copy)
            copy.execute("PRAGMA journal_mode=DELETE")
            media = copy.execute("SELECT path,sha256 FROM media").fetchall()
        entries = {"production.sqlite": snapshot}
        for name, expected in media:
            path = (store.media_dir / name).resolve()
            if not path.is_relative_to(store.media_dir) or checksum(path) != expected:
                raise StudioError("backup_corrupt", "Media is missing or changed; backup refused")
            entries["media/" + name] = path
        manifest = {
            "format": "strawberry-workspace",
            "version": 1,
            "created_at": time.time(),
            "files": {name: {"sha256": checksum(path), "bytes": path.stat().st_size} for name, path in entries.items()},
        }
        if sum(item["bytes"] for item in manifest["files"].values()) > MAX_ARCHIVE_BYTES:
            raise StudioError("backup_size", "Workspace exceeds the current 4 GiB portable backup limit")
        # Exclusive creation avoids clobbering another writer's archive.
        with destination.open("xb") as output:
            try:
                with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                    archive.writestr("manifest.json", encoded(manifest))
                    for name, path in entries.items():
                        archive.write(path, name)
            except BaseException:
                destination.unlink(missing_ok=True)
                raise
    return {"path": str(destination), "files": len(entries), "bytes": destination.stat().st_size}


def restore(archive_path: str | Path, destination: str | Path):
    try:
        return _restore(archive_path, destination)
    except (KeyError, TypeError, ValueError, zipfile.BadZipFile, sqlite3.DatabaseError) as exc:
        raise StudioError("archive_invalid", "Backup is malformed or incompatible") from exc


def _restore(archive_path: str | Path, destination: str | Path):
    destination = Path(destination).resolve()
    if destination.exists():
        raise StudioError("restore_exists", "Restore requires a new directory; existing data is never replaced")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".strawberry-restore-", dir=destination.parent) as temporary:
        staging = Path(temporary) / "workspace"
        staging.mkdir()
        with zipfile.ZipFile(archive_path) as archive:
            members = archive.infolist()
            if len({item.filename for item in members}) != len(members):
                raise StudioError("archive_invalid", "Duplicate archive entries")
            info = archive.getinfo("manifest.json")
            if info.file_size > 8 * 1024**2:
                raise StudioError("archive_invalid", "Manifest is too large")
            manifest = json.loads(archive.read(info))
            if manifest.get("format") != "strawberry-workspace" or manifest.get("version") != 1:
                raise StudioError("archive_invalid", "Unsupported backup format")
            files = manifest.get("files", {})
            if "production.sqlite" not in files or set(files) | {"manifest.json"} != {
                item.filename for item in members
            }:
                raise StudioError("archive_invalid", "Backup contents do not match the manifest")
            if sum(item.file_size for item in members) > MAX_ARCHIVE_BYTES:
                raise StudioError("archive_invalid", "Backup exceeds the current 4 GiB restore limit")
            for name, expected in files.items():
                parts = PurePosixPath(name).parts
                if name != "production.sqlite" and not (
                    len(parts) == 2 and parts[0] == "media" and parts[1] not in {".", ".."} and "\\" not in name
                ):
                    raise StudioError("archive_invalid", "Unexpected archive path")
                target = staging / name
                target.parent.mkdir(parents=True, exist_ok=True)
                if archive.getinfo(name).file_size != expected["bytes"]:
                    raise StudioError("archive_invalid", "File size differs from manifest")
                with archive.open(name) as source, target.open("xb") as output:
                    shutil.copyfileobj(source, output)
                if checksum(target) != expected["sha256"]:
                    raise StudioError("archive_invalid", "File checksum differs from manifest")
        with sqlite3.connect(staging / "production.sqlite") as conn:
            conn.execute("PRAGMA trusted_schema=OFF")
            if (
                conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok"
                or conn.execute("PRAGMA foreign_key_check").fetchone()
            ):
                raise StudioError("archive_invalid", "Database integrity check failed")
            if conn.execute("SELECT name FROM sqlite_master WHERE type IN ('trigger','view')").fetchone():
                raise StudioError("archive_invalid", "Unexpected executable database objects")
            if conn.execute("PRAGMA user_version").fetchone()[0] != 1:
                raise StudioError("archive_invalid", "Unsupported database schema")
            for name, expected in conn.execute("SELECT path,sha256 FROM media"):
                item = files.get("media/" + name)
                if not item or item["sha256"] != expected:
                    raise StudioError("archive_invalid", "Media database and manifest disagree")
            # The original may have submitted these jobs after the snapshot was taken.
            # Never re-spend credits because an older backup was restored.
            for job_id, state in conn.execute(
                "SELECT id,state FROM jobs WHERE state IN ('queued','submitting')"
            ).fetchall():
                conn.execute(
                    "UPDATE jobs SET state='submission_unknown',error=?,updated_at=? WHERE id=?",
                    (
                        "Restored pending job. Reconcile provider history before any new submission.",
                        time.time(),
                        job_id,
                    ),
                )
                Store.event(
                    conn,
                    job_id,
                    "submission_unknown",
                    {"reason": "restored_backup", "previous_state": state},
                    time.time(),
                )
            conn.execute("UPDATE jobs SET owner=NULL,lease_until=NULL")
        # Reserve the destination exclusively. An interrupted final move is never
        # accepted as a usable workspace, and cannot overwrite an existing folder.
        try:
            destination.mkdir()
        except FileExistsError as exc:
            raise StudioError("restore_exists", "Restore destination was created by another process") from exc
        marker = destination / ".restore-in-progress"
        marker.touch(exist_ok=False)
        for child in staging.iterdir():
            child.rename(destination / child.name)
        marker.unlink()
    return {"home": str(destination), "restored": True, "pending_submissions": "require reconciliation"}
