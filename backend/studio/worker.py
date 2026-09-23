from __future__ import annotations

import json
import os
import threading
import time
from contextlib import contextmanager
from pathlib import Path

from backend.studio.collection import download
from backend.studio.execution import validate_cost
from backend.studio.providers import FakeProvider, Fal, Higgsfield, ProviderRejected, SubmissionUnknown
from backend.studio.service import Studio
from backend.studio.store import StudioError, encoded, identifier


class Worker:
    def __init__(self, studio: Studio, providers=None, *, allow_higgsfield=False, allow_fal=False, clock=time.time):
        self.studio, self.clock = studio, clock
        self.owner = identifier()
        self.providers = providers or {
            "fake": FakeProvider(studio.store.home / "fixtures"),
            "higgsfield": Higgsfield(),
            "fal": Fal(),
        }
        self.allow_higgsfield = allow_higgsfield
        self.allow_fal = allow_fal
        self.current_job = None

    @property
    def enabled_providers(self):
        """Paid providers run only when switched on; the offline fixture always runs."""
        return ["fake", *(["higgsfield"] if self.allow_higgsfield else []), *(["fal"] if self.allow_fal else [])]

    def pulse(self, *, stopped=False):
        now = self.clock()
        with self.studio.store.connection(write=True) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO workers VALUES (?,?,?,?,?,?)",
                (
                    self.owner,
                    os.getpid(),
                    encoded(self.enabled_providers),
                    self.current_job,
                    now,
                    now if stopped else None,
                ),
            )
            if self.current_job and not stopped:
                conn.execute(
                    "UPDATE jobs SET lease_until=? WHERE id=? AND owner=?", (now + 300, self.current_job, self.owner)
                )

    @contextmanager
    def keepalive(self, interval=10):
        stop = threading.Event()
        self.pulse()

        def heartbeat():
            while not stop.wait(interval):
                try:
                    self.pulse()
                except Exception:
                    # Stale status/lease are visible; never claim a failed heartbeat succeeded.
                    pass

        thread = threading.Thread(target=heartbeat, daemon=True)
        thread.start()
        try:
            yield
        finally:
            stop.set()
            thread.join(timeout=12)
            self.current_job = None
            self.pulse(stopped=True)

    def _save(self, job_id, **fields):
        if not set(fields) <= {"state", "provider_id", "outputs", "receipt", "error", "owner", "lease_until"}:
            raise ValueError("Invalid job fields")
        fields["updated_at"] = self.clock()
        with self.studio.store.connection(write=True) as conn:
            previous = self.studio.store.one(conn, "jobs", job_id)
            if previous["owner"] != self.owner:
                raise StudioError("lease_lost", "Job is no longer owned by this worker", 409)
            if fields.get("state") == "submitting":
                # Bind the final readiness check to the submission state transition.
                self.studio._fresh(conn, self.studio.store.one(conn, "recipes", previous["recipe_id"]))
                approval = conn.execute(
                    "SELECT policy FROM recipe_approvals WHERE recipe_id=?", (previous["recipe_id"],)
                ).fetchone()
                if not approval:
                    raise StudioError("approval_policy", "Recipe cost approval is missing", 409)
                validate_cost(fields["receipt"]["preflight_estimate"], json.loads(approval["policy"]))
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
                AND (state<>'queued' OR recipe_id IN (
                    SELECT id FROM recipes WHERE json_extract(spec,'$.provider') IN (SELECT value FROM json_each(?))))
                AND (owner IS NULL OR lease_until < ?)
                AND (state='queued' OR updated_at <= ?)
                AND (? IS NULL OR id=?)
                ORDER BY updated_at LIMIT 1""",
                (encoded(self.enabled_providers), now, now - 5, job_id, job_id),
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
        self.current_job = job["id"]
        self.pulse()
        recipe = self.studio.recipe(job["recipe_id"])
        spec = recipe["spec"]
        submitting = False
        try:
            provider = self.providers[spec["provider"]]
            if job["state"] == "queued":
                with store.connection() as conn:
                    self.studio._fresh(conn, store.one(conn, "recipes", recipe["id"]))
                    approval = conn.execute(
                        "SELECT policy FROM recipe_approvals WHERE recipe_id=?", (recipe["id"],)
                    ).fetchone()
                if not approval:
                    raise StudioError("approval_policy", "Reapprove this recipe with its explicit cost policy", 409)
                estimate = provider.preflight(spec)
                validate_cost(estimate, json.loads(approval["policy"]))
                files = []
                for ref in spec["references"]:
                    path, mime = self.studio.media_path(ref["media_id"])
                    if not mime.startswith("image/") or self.studio._file_hash(path) != ref["sha256"]:
                        raise StudioError("reference_changed", "Reference bytes changed or are not an image")
                    files.append(path)
                self._save(job["id"], state="submitting", error=None, receipt={"preflight_estimate": estimate})
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
        except ProviderRejected as exc:
            self._save(job["id"], state="failed", error=f"provider_rejected: {exc}"[:2000], owner=None, lease_until=None)
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
        finally:
            self.current_job = None
            self.pulse()
        return True

    def run(self):
        with self.keepalive():
            while True:
                if not self.tick():
                    time.sleep(2)
