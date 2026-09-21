"""Deterministic execution visibility and explicit, non-billable recovery."""

import json
import time

from backend.studio.providers import FakeProvider, Higgsfield
from backend.studio.store import StudioError, digest, encoded

HEARTBEAT_TTL = 30


def validate_cost(estimate, policy):
    credits = estimate.get("credits")
    maximum = policy.get("max_credits")
    if credits is None:
        if maximum is not None or not policy.get("allow_unknown_cost"):
            raise StudioError(
                "cost_unknown",
                "Exact credit estimate unavailable; acknowledge unknown cost explicitly without a numeric ceiling",
                409,
            )
    elif maximum is not None and credits > maximum:
        raise StudioError("cost_exceeded", "Current credit estimate exceeds the approved estimate ceiling", 409)


class Execution:
    def __init__(self, studio, providers=None, clock=time.time):
        self.studio, self.store, self.clock = studio, studio.store, clock
        self.providers = providers

    def _provider(self, name):
        if self.providers is not None:
            return self.providers[name]
        return Higgsfield() if name == "higgsfield" else FakeProvider(self.store.home / "fixtures")

    def status(self):
        now = self.clock()
        with self.store.connection() as conn:
            workers = [
                {
                    **dict(row),
                    "enabled_providers": json.loads(row["enabled_providers"]),
                    "responsive": row["stopped_at"] is None and 0 <= now - row["heartbeat_at"] < HEARTBEAT_TTL,
                }
                for row in conn.execute("SELECT * FROM workers ORDER BY heartbeat_at DESC LIMIT 20")
            ]
        return {
            "workers": workers,
            "responsive": any(w["responsive"] for w in workers),
            "higgsfield_enabled": any(w["responsive"] and "higgsfield" in w["enabled_providers"] for w in workers),
            "remote_cancellation": False,
            "checked_at": now,
        }

    def abandon(self, job_id):
        """Close a submission_unknown job whose recorded error is a definitive provider rejection."""
        from backend.studio.providers import REJECTION_SIGNATURES

        with self.studio.store.connection(write=True) as conn:
            job = self.studio.store.one(conn, "jobs", job_id)
            if job["state"] != "submission_unknown":
                raise StudioError("job_state", "Only a submission_unknown job can be abandoned", 409)
            if not any(sig in (job["error"] or "").lower() for sig in REJECTION_SIGNATURES):
                raise StudioError("job_state", "This job's error is not a definitive rejection; reconcile it instead", 409)
            now = time.time()
            conn.execute("UPDATE jobs SET state='failed',error=?,updated_at=? WHERE id=?",
                         (f"provider_rejected: {job['error']}"[:2000], now, job_id))
            self.studio.store.event(conn, job_id, "failed", {"reason": "abandoned: provider rejected the submission"}, now)
            return self.studio._job(self.studio.store.one(conn, "jobs", job_id))

    def cancel(self, job_id):
        with self.store.connection(write=True) as conn:
            job = self.store.one(conn, "jobs", job_id)
            if job["state"] == "cancelled":
                return self.studio._job(job)
            if job["state"] != "queued":
                raise StudioError(
                    "cancellation_unavailable", "Only an unsubmitted queued job can be cancelled locally", 409
                )
            conn.execute(
                "UPDATE jobs SET state='cancelled',owner=NULL,lease_until=NULL,updated_at=? WHERE id=?",
                (self.clock(), job_id),
            )
            self.store.event(conn, job_id, "cancelled", {"reason": "User cancelled before submission"}, self.clock())
            return self.studio._job(self.store.one(conn, "jobs", job_id))

    @staticmethod
    def _settings_match(expected, remote):
        """Compare provider receipts after normalizing equivalent app defaults."""
        implicit = {"batch_size": 1}
        return all(
            encoded(remote.get(key, implicit.get(key))) == encoded(value)
            for key, value in expected.items()
            if key in remote or key in implicit
        ) and all(key in remote or key in implicit for key in expected)

    def _preview_submission(self, job_id, provider_id, *, states):
        import re

        if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]*", provider_id):
            raise StudioError("provider_id", "Invalid provider job ID")
        with self.store.connection() as conn:
            job = self.store.one(conn, "jobs", job_id)
            recipe = self.studio._recipe(self.store.one(conn, "recipes", job["recipe_id"]))
        if job["state"] not in states:
            raise StudioError("reconciliation_state", "This job cannot accept a provider submission in its current state", 409)
        spec = recipe["spec"]
        remote = self._provider(spec["provider"]).inspect(provider_id)
        if remote.get("id") != provider_id:
            raise StudioError("provider_response", "Remote receipt ID does not match the requested job", 502)
        params = remote.get("params") or {}
        if not isinstance(params, dict):
            raise StudioError("provider_response", "Remote job has no recognized input record", 502)
        checks = {
            "model": remote.get("job_set_type") == spec["model"],
            "prompt": params.get("prompt") == spec["prompt"],
            "settings": self._settings_match(spec["settings"], params),
        }
        remote_refs = params.get("input_images", params.get("medias", [])) or []
        checks["reference_count"] = isinstance(remote_refs, list) and len(remote_refs) == len(spec["references"])
        evidence = {k: remote.get(k) for k in ("id", "job_set_type", "created_at", "params")}
        fingerprint = digest(
            {"job_id": job_id, "updated_at": job["updated_at"], "recipe": recipe["fingerprint"], "evidence": evidence}
        )
        return {
            "job_id": job_id,
            "provider_id": provider_id,
            "fingerprint": fingerprint,
            "checks": checks,
            "can_link": all(checks.values()),
            "requires_reference_confirmation": bool(spec["references"]),
            "remote": remote,
            "recipe_id": recipe["id"],
            "local_prompt": spec["prompt"],
            "local_references": spec["references"],
        }

    def preview_reconciliation(self, job_id, provider_id):
        return self._preview_submission(job_id, provider_id, states={"submission_unknown"})

    def preview_external_submission(self, job_id, provider_id):
        return self._preview_submission(job_id, provider_id, states={"queued"})

    def reconcile(self, job_id, request):
        preview = self.preview_reconciliation(job_id, request.provider_id)
        return self._link_submission(job_id, request, preview, expected_state="submission_unknown", external=False)

    def attach_external_submission(self, job_id, request):
        preview = self.preview_external_submission(job_id, request.provider_id)
        with self.store.connection() as conn:
            job = self.store.one(conn, "jobs", job_id)
            recipe = self.store.one(conn, "recipes", job["recipe_id"])
            if not recipe["approved_at"]:
                raise StudioError("approval_required", "Approve the exact recipe before external submission", 409)
            self.studio._fresh(conn, recipe)
        return self._link_submission(job_id, request, preview, expected_state="queued", external=True)

    def _link_submission(self, job_id, request, preview, *, expected_state, external):
        if preview["fingerprint"] != request.fingerprint:
            raise StudioError("reconciliation_changed", "Recovery evidence changed; inspect a fresh preview", 409)
        if not preview["can_link"]:
            raise StudioError(
                "reconciliation_mismatch",
                "Remote model, prompt, settings or reference count does not match this recipe",
                409,
            )
        if preview["requires_reference_confirmation"] and not request.confirm_reference_match:
            raise StudioError(
                "reference_confirmation", "Confirm the remote input images match this recipe in the shown order", 409
            )
        with self.store.connection(write=True) as conn:
            job = self.store.one(conn, "jobs", job_id)
            recipe = self.studio._recipe(self.store.one(conn, "recipes", job["recipe_id"]))
            evidence = {k: preview["remote"].get(k) for k in ("id", "job_set_type", "created_at", "params")}
            current = digest(
                {
                    "job_id": job_id,
                    "updated_at": job["updated_at"],
                    "recipe": recipe["fingerprint"],
                    "evidence": evidence,
                }
            )
            if job["state"] != expected_state or current != request.fingerprint:
                raise StudioError("reconciliation_changed", "Job changed during recovery", 409)
            duplicate = conn.execute(
                """SELECT j.id FROM jobs j JOIN recipes r ON r.id=j.recipe_id
                WHERE j.provider_id=? AND j.id<>? AND json_extract(r.spec,'$.provider')=?""",
                (request.provider_id, job_id, recipe["spec"]["provider"]),
            ).fetchone()
            if duplicate:
                raise StudioError("provider_job_linked", "Remote job is already linked to another local job", 409)
            conn.execute(
                "UPDATE jobs SET state='running',provider_id=?,receipt=?,error=NULL,owner=NULL,lease_until=NULL,updated_at=? WHERE id=?",
                (request.provider_id, encoded(preview["remote"]), self.clock(), job_id),
            )
            self.store.event(
                conn,
                job_id,
                "running",
                {
                    "reconciled": not external,
                    "external_submission": external,
                    "provider_id": request.provider_id,
                    "user_decision": request.user_decision,
                    "evidence": request.fingerprint,
                    "reference_match_confirmed": request.confirm_reference_match,
                },
                self.clock(),
            )
            return self.studio._job(self.store.one(conn, "jobs", job_id))
