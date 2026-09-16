from __future__ import annotations

import ipaddress
import json
import socket
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx

from backend.studio.providers import FakeProvider, Higgsfield, SubmissionUnknown
from backend.studio.service import Studio
from backend.studio.store import StudioError, encoded, identifier


def download(url: str, directory: Path) -> Path:
    """Collect a provider artifact; forbid local addresses and unbounded payloads."""
    for _ in range(5):
        parsed = urlparse(url)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.port not in {None, 443}
        ):
            raise StudioError("output_url", "Provider output must be a public HTTPS URL")
        addresses = socket.getaddrinfo(parsed.hostname, 443)
        if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
            raise StudioError("output_url", "Local/private provider output address refused")
        with httpx.stream("GET", url, timeout=90, follow_redirects=False, trust_env=False) as response:
            if response.is_redirect:
                url = urljoin(url, response.headers["location"])
                continue
            response.raise_for_status()
            mime = response.headers.get("content-type", "").split(";")[0]
            extension = {
                "image/png": ".png",
                "image/jpeg": ".jpg",
                "image/webp": ".webp",
                "video/mp4": ".mp4",
                "video/webm": ".webm",
            }.get(mime)
            if not extension:
                raise StudioError("output_type", f"Unsupported output content type: {mime}")
            target = directory / (identifier() + extension)
            size = 0
            try:
                with target.open("wb") as handle:
                    for chunk in response.iter_bytes():
                        size += len(chunk)
                        if size > 256 * 1024 * 1024:
                            raise StudioError("output_size", "Output exceeds the current 256 MiB collection limit")
                        handle.write(chunk)
                return target
            except BaseException:
                target.unlink(missing_ok=True)
                raise
    raise StudioError("output_redirect", "Too many provider redirects")


class Worker:
    def __init__(self, studio: Studio, providers=None, *, allow_higgsfield=False, clock=time.time):
        self.studio, self.clock = studio, clock
        self.owner = identifier()
        self.providers = providers or {"fake": FakeProvider(studio.store.home / "fixtures"), "higgsfield": Higgsfield()}
        self.allow_higgsfield = allow_higgsfield

    def _save(self, job_id, **fields):
        if not set(fields) <= {"state", "provider_id", "outputs", "receipt", "error", "owner", "lease_until"}:
            raise ValueError("Invalid job fields")
        fields["updated_at"] = self.clock()
        with self.studio.store.connection(write=True) as conn:
            previous = self.studio.store.one(conn, "jobs", job_id)
            if fields.get("state") == "submitting":
                # Bind the final readiness check to the submission state transition.
                self.studio._fresh(conn, self.studio.store.one(conn, "recipes", previous["recipe_id"]))
            assignments = ",".join(f"{key}=?" for key in fields)
            values = [encoded(value) if key in {"outputs", "receipt"} else value for key, value in fields.items()]
            cursor = conn.execute(
                f"UPDATE jobs SET {assignments} WHERE id=? AND owner=?", (*values, job_id, self.owner)
            )
            if cursor.rowcount != 1:
                raise StudioError("lease_lost", "Job is no longer owned by this worker", 409)
            recorded = {k: v for k, v in fields.items() if k not in {"owner", "lease_until", "updated_at"}}
            if any(previous[k] != (encoded(v) if k in {"outputs", "receipt"} else v) for k, v in recorded.items()):
                self.studio.store.event(conn, job_id, fields.get("state", previous["state"]), recorded, self.clock())

    def tick(self, *, job_id: str | None = None):
        store, now = self.studio.store, self.clock()
        with store.connection(write=True) as conn:
            row = conn.execute(
                """SELECT * FROM jobs WHERE
                state IN ('queued','submitting','running','collecting')
                AND (owner IS NULL OR lease_until < ?)
                AND (state='queued' OR updated_at <= ?)
                AND (? IS NULL OR id=?)
                ORDER BY updated_at LIMIT 1""",
                (now, now - 5, job_id, job_id),
            ).fetchone()
            if not row:
                return False
            job = dict(row)
            if job["state"] == "submitting":
                conn.execute(
                    "UPDATE jobs SET state='submission_unknown',owner=NULL,lease_until=NULL,error=?,updated_at=? WHERE id=?",
                    (
                        "Worker stopped during submission. Reconcile provider history; do not resubmit blindly.",
                        now,
                        job["id"],
                    ),
                )
                store.event(
                    conn,
                    job["id"],
                    "submission_unknown",
                    {"reason": "Submission lease expired; reconcile provider history"},
                    now,
                )
                return True
            conn.execute("UPDATE jobs SET owner=?,lease_until=? WHERE id=?", (self.owner, now + 300, job["id"]))
        recipe = self.studio.recipe(job["recipe_id"])
        spec = recipe["spec"]
        submitting = False
        try:
            provider = self.providers[spec["provider"]]
            if spec["provider"] == "higgsfield" and not self.allow_higgsfield:
                raise StudioError(
                    "provider_disabled", "Higgsfield execution requires the worker's explicit enable flag"
                )
            if job["state"] == "queued":
                with store.connection() as conn:
                    self.studio._fresh(conn, store.one(conn, "recipes", recipe["id"]))
                files = []
                for ref in spec["references"]:
                    path, mime = self.studio.media_path(ref["media_id"])
                    if not mime.startswith("image/") or self.studio._file_hash(path) != ref["sha256"]:
                        raise StudioError("reference_changed", "Reference bytes changed or are not an image")
                    files.append(path)
                self._save(job["id"], state="submitting", error=None)
                submitting = True
                provider_id, receipt = provider.submit(job["id"], spec, files)
                self._save(
                    job["id"], provider_id=provider_id, receipt=receipt, state="running", owner=None, lease_until=None
                )
            elif job["state"] == "running":
                state, outputs, receipt = provider.poll(job["provider_id"])
                self._save(
                    job["id"],
                    state=state,
                    outputs=outputs,
                    receipt=receipt,
                    error="Provider reported failure" if state == "failed" else None,
                    owner=None,
                    lease_until=None,
                )
            else:
                for index, output in enumerate(json.loads(job["outputs"])):
                    self._save(job["id"], lease_until=self.clock() + 300)
                    local = Path(output) if spec["provider"] == "fake" else download(output, store.home)
                    try:
                        self.studio.import_media(
                            spec["node_id"],
                            local,
                            f"Take {job['id'][:8]} / {index + 1}",
                            job_id=job["id"],
                            metadata={
                                "recipe_id": recipe["id"],
                                "fingerprint": recipe["fingerprint"],
                                "provider": spec["provider"],
                                "model": spec["model"],
                                "fake": spec["provider"] == "fake",
                            },
                        )
                    finally:
                        if spec["provider"] != "fake":
                            local.unlink(missing_ok=True)
                self._save(job["id"], state="ready", error=None, owner=None, lease_until=None)
        except SubmissionUnknown as exc:
            self._save(job["id"], state="submission_unknown", error=str(exc), owner=None, lease_until=None)
        except Exception as exc:
            if isinstance(exc, StudioError) and exc.code == "lease_lost":
                return True
            # Poll errors stay attached to the known job; collection errors never regenerate.
            state = (
                "submission_unknown"
                if submitting
                else {"running": "running", "collecting": "collection_failed"}.get(job["state"], "failed")
            )
            self._save(job["id"], state=state, error=str(exc)[:2000], owner=None, lease_until=None)
        return True

    def run(self):
        while True:
            if not self.tick():
                time.sleep(2)
