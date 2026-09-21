from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path


def identifier() -> str:
    return str(uuid.uuid4())


def encoded(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def digest(value) -> str:
    return hashlib.sha256(encoded(value).encode()).hexdigest()


class StudioError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code, self.status = code, status


SCHEMA = """
CREATE TABLE IF NOT EXISTS nodes (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, parent_id TEXT REFERENCES nodes(id),
 kind TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, fields TEXT NOT NULL DEFAULT '{}',
 notes TEXT NOT NULL DEFAULT '', active_media_id TEXT,
 created_at REAL NOT NULL, updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS nodes_project ON nodes(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS nodes_order ON nodes(parent_id,kind,position);
CREATE TABLE IF NOT EXISTS sources (
 id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES nodes(id),
 author TEXT NOT NULL, status TEXT NOT NULL, text TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS revisions (
 node_id TEXT NOT NULL REFERENCES nodes(id), revision INTEGER NOT NULL,
 snapshot TEXT NOT NULL, reason TEXT NOT NULL, source_id TEXT REFERENCES sources(id),
 created_at REAL NOT NULL, PRIMARY KEY(node_id,revision)
);
CREATE TABLE IF NOT EXISTS media (
 id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES nodes(id),
 path TEXT NOT NULL, sha256 TEXT NOT NULL, mime_type TEXT NOT NULL,
 label TEXT NOT NULL, job_id TEXT, metadata TEXT NOT NULL DEFAULT '{}',
 created_at REAL NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS media_job_file ON media(job_id,sha256);
CREATE TABLE IF NOT EXISTS recipes (
 id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES nodes(id),
 fingerprint TEXT NOT NULL, spec TEXT NOT NULL, context TEXT NOT NULL,
 approved_at REAL, user_decision TEXT, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL UNIQUE REFERENCES recipes(id),
 state TEXT NOT NULL, provider_id TEXT, outputs TEXT NOT NULL DEFAULT '[]',
 receipt TEXT NOT NULL DEFAULT '{}', error TEXT, owner TEXT, lease_until REAL,
 created_at REAL NOT NULL, updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback (
 id TEXT PRIMARY KEY, media_id TEXT NOT NULL REFERENCES media(id),
 text TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS job_events (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL REFERENCES jobs(id),
 state TEXT NOT NULL, details TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS job_events_job ON job_events(job_id,sequence);
CREATE TABLE IF NOT EXISTS media_reviews (
 media_id TEXT NOT NULL REFERENCES media(id), revision INTEGER NOT NULL,
 status TEXT NOT NULL, user_decision TEXT NOT NULL, depicted_assets TEXT NOT NULL,
 definition_hash TEXT NOT NULL, subject_hashes TEXT NOT NULL, created_at REAL NOT NULL,
 PRIMARY KEY(media_id,revision)
);
CREATE TABLE IF NOT EXISTS workers (
 id TEXT PRIMARY KEY, pid INTEGER NOT NULL, enabled_providers TEXT NOT NULL,
 current_job TEXT, heartbeat_at REAL NOT NULL, stopped_at REAL
);
CREATE TABLE IF NOT EXISTS recipe_approvals (
 recipe_id TEXT PRIMARY KEY REFERENCES recipes(id), policy TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approval_batches (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES nodes(id),
 user_decision TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS asset_requirements (
 id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES nodes(id),
 kind TEXT NOT NULL, label TEXT NOT NULL, instruction TEXT NOT NULL,
 priority INTEGER NOT NULL, created_at REAL NOT NULL, updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS asset_requirements_asset ON asset_requirements(asset_id,priority,created_at);
CREATE TABLE IF NOT EXISTS evaluations (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, media_id TEXT NOT NULL REFERENCES media(id),
 evaluator TEXT NOT NULL, version TEXT NOT NULL, kind TEXT NOT NULL,
 scores TEXT NOT NULL, evidence TEXT NOT NULL, confidence REAL,
 discrepancies TEXT NOT NULL, context_hash TEXT NOT NULL, review_revision INTEGER NOT NULL,
 created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS evaluations_media ON evaluations(media_id,sequence);
"""


class Store:
    def __init__(self, home: str | Path | None = None):
        default = Path(__file__).resolve().parents[2] / ".strawberry"
        self.home = Path(home or os.environ.get("STRAWBERRY_HOME", default)).resolve()
        if (self.home / ".restore-in-progress").exists():
            raise StudioError(
                "restore_incomplete", "This restore was interrupted; restore the archive into a new directory"
            )
        self.home.mkdir(parents=True, exist_ok=True)
        self.media_dir = self.home / "media"
        self.media_dir.mkdir(exist_ok=True)
        self.path = self.home / "production.sqlite"
        with self.connection() as conn:
            version = conn.execute("PRAGMA user_version").fetchone()[0]
            if version not in {0, 1, 2, 3, 4, 5, 6}:
                raise StudioError("schema_unsupported", "This workspace requires a different engine version")
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(SCHEMA)
            columns = {row[1] for row in conn.execute("PRAGMA table_info(media_reviews)")}
            if "requirement_ids" not in columns:
                conn.execute("ALTER TABLE media_reviews ADD COLUMN requirement_ids TEXT NOT NULL DEFAULT '[]'")
            if "requirement_hashes" not in columns:
                conn.execute("ALTER TABLE media_reviews ADD COLUMN requirement_hashes TEXT NOT NULL DEFAULT '{}'")
            approval_columns = {row[1] for row in conn.execute("PRAGMA table_info(recipe_approvals)")}
            if "batch_id" not in approval_columns:
                conn.execute("ALTER TABLE recipe_approvals ADD COLUMN batch_id TEXT REFERENCES approval_batches(id)")
            conn.execute("PRAGMA user_version=5")

    @contextmanager
    def connection(self, *, write=False):
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=10000")
        try:
            if write:
                conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def one(conn, table: str, item_id: str) -> dict:
        if table not in {"nodes", "sources", "media", "recipes", "jobs"}:
            raise ValueError("Invalid table")
        row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (item_id,)).fetchone()
        if not row:
            raise StudioError("not_found", f"{table} item not found: {item_id}", 404)
        return dict(row)

    @staticmethod
    def event(conn, job_id, state, details, created_at):
        conn.execute(
            "INSERT INTO job_events(job_id,state,details,created_at) VALUES (?,?,?,?)",
            (job_id, state, encoded(details), created_at),
        )

    @staticmethod
    def revision(conn, node: dict, reason: str, source_id=None):
        conn.execute(
            "INSERT INTO revisions VALUES (?,?,?,?,?,?)",
            (
                node["id"],
                node["revision"],
                encoded(node),
                reason,
                source_id,
                time.time(),
            ),
        )
