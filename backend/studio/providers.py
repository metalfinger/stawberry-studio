from __future__ import annotations

import json
import subprocess
from pathlib import Path

from backend.studio.store import StudioError, digest


class SubmissionUnknown(Exception):
    """A billable operation may have succeeded; never retry automatically."""


class Higgsfield:
    name = "higgsfield"

    def __init__(self, binary="higgsfield", run=subprocess.run):
        self.binary, self.run = binary, run

    def command(self, args, *, submission=False, raw=False):
        try:
            result = self.run([self.binary, *args], capture_output=True, text=True, timeout=120, check=False)
            if result.returncode:
                raise ValueError((result.stderr or result.stdout or "CLI failed")[:2000])
            return result.stdout.strip() if raw else json.loads(result.stdout)
        except (OSError, subprocess.TimeoutExpired, ValueError) as exc:
            if submission:
                raise SubmissionUnknown(f"Submission needs reconciliation: {exc}") from exc
            raise StudioError("provider_error", str(exc), 502) from exc

    def contract(self, model):
        version = self.command(["version"], raw=True)
        schema = self.command(["model", "get", model, "--json"])
        if not isinstance(schema, dict) or schema.get("job_set_type") != model:
            raise StudioError("provider_schema", "Unexpected model schema")
        return {"cli_version": version, "schema": schema, "schema_hash": digest(schema)}

    def prepare(self, request):
        contract = self.contract(request.model)
        schema = contract["schema"]
        params = {p["name"]: p for p in schema.get("params", [])}
        settings = {
            p["name"]: p["default"]
            for p in params.values()
            if p.get("default") is not None and p["name"] not in {"prompt", "input_images", "medias"}
        }
        settings.update(request.settings)
        for key, value in settings.items():
            param = params.get(key)
            if not param:
                raise StudioError("setting_unknown", f"Model does not declare {key}")
            if param.get("enum") and value not in param["enum"]:
                raise StudioError("setting_invalid", f"Unsupported {key}: {value}")
            expected = param.get("type")
            if (
                (expected == "integer" and type(value) is not int)
                or (expected == "number" and type(value) not in {float, int})
                or (expected == "boolean" and type(value) is not bool)
                or (expected == "string" and not isinstance(value, str))
                or (expected == "array" and not isinstance(value, list))
                or (expected == "object" and not isinstance(value, dict))
            ):
                raise StudioError("setting_invalid", f"Invalid value type for {key}")
            if expected in {"number", "integer"}:
                if ("minimum" in param and value < param["minimum"]) or (
                    "maximum" in param and value > param["maximum"]
                ):
                    raise StudioError("setting_invalid", f"{key} is outside the model's declared range")
        for name, param in params.items():
            if param.get("required") and name not in {"prompt", "input_images", "medias"} and name not in settings:
                raise StudioError("setting_missing", f"Model requires setting: {name}")
        if schema.get("type") == "image":
            if request.references and "input_images" not in params:
                raise StudioError("reference_unsupported", "Model does not declare image inputs")
            if any(r.role in {"start_frame", "end_frame"} for r in request.references):
                raise StudioError("reference_role", "Video frame roles cannot be used for this image model")
            media_param = params.get("input_images", {})
            if len(request.references) < media_param.get("minItems", 0) or len(request.references) > media_param.get(
                "maxItems", 32
            ):
                raise StudioError("reference_count", "Reference count exceeds the model's declared input bounds")
        elif schema.get("type") == "video" and request.model == "kling3_0":
            roles = [r.role for r in request.references]
            if any(role not in {"start_frame", "end_frame"} for role in roles) or len(roles) != len(set(roles)):
                raise StudioError(
                    "reference_role", "Kling currently supports one start frame and one end frame in this adapter"
                )
            if "end_frame" in roles and "start_frame" not in roles:
                raise StudioError("reference_role", "This adapter requires a start frame when supplying an end frame")
        else:
            raise StudioError(
                "capability_unverified", "This model's media mapping has not been verified in Strawberry yet"
            )
        return {"settings": settings, "provider_contract": contract}

    def submit(self, job_id, spec, files):
        current = self.contract(spec["model"])
        if current != spec["provider_contract"]:
            raise StudioError("provider_changed", "CLI/model schema changed; prepare and approve a new recipe")
        args = ["generate", "create", spec["model"], "--prompt", spec["prompt"]]
        for key, value in spec["settings"].items():
            args.extend(["--" + key, value if isinstance(value, str) else json.dumps(value)])
        for ref, file in zip(spec["references"], files, strict=True):
            flag = {"start_frame": "--start-image", "end_frame": "--end-image"}.get(ref["role"], "--image")
            args.extend([flag, str(file)])
        result = self.command([*args, "--json"], submission=True)
        rows = result if isinstance(result, list) else [result]
        if len(rows) != 1:
            raise SubmissionUnknown("Unexpected output count; inspect provider jobs before any retry")
        row = rows[0]
        provider_id = row if isinstance(row, str) else row.get("id") if isinstance(row, dict) else None
        if not isinstance(provider_id, str) or not provider_id:
            raise SubmissionUnknown("CLI returned no recognized job ID; inspect provider jobs before any retry")
        return provider_id, result

    def poll(self, provider_id):
        result = self.command(["generate", "get", provider_id, "--json"])
        if not isinstance(result, dict) or result.get("id") != provider_id:
            raise StudioError("provider_response", "Unexpected job response", 502)
        status = str(result.get("status", "")).lower()
        if status in {"failed", "error", "canceled", "cancelled"}:
            return "failed", [], result
        if status in {"completed", "succeeded", "success"}:
            url = result.get("result_url")
            if not isinstance(url, str) or not url:
                raise StudioError("provider_output", "Completed job has no recognized output URL", 502)
            return "collecting", [url], result
        if status not in {"queued", "pending", "running", "processing", "in_progress", "created"}:
            raise StudioError("provider_status", f"Unknown provider status: {status}", 502)
        return "running", [], result


class FakeProvider:
    """Offline contract test provider. Outputs are visibly marked, never presented as AI."""

    name = "fake"

    def __init__(self, directory: Path):
        self.directory = directory
        self.directory.mkdir(exist_ok=True)

    def prepare(self, request):
        return {"settings": request.settings, "provider_contract": {"fixture_version": 1}}

    def submit(self, job_id, spec, files):
        from PIL import Image, ImageDraw

        path = self.directory / f"{job_id}.png"
        image = Image.new("RGB", (960, 540), "#eef0ee")
        draw = ImageDraw.Draw(image)
        draw.rectangle((80, 110, 880, 430), outline="#426057", width=4)
        draw.text((105, 145), "OFFLINE TEST OUTPUT - NOT AN AI GENERATION", fill="#173a2e")
        draw.text((105, 200), spec["intent"][:90].encode("ascii", "replace").decode(), fill="#173a2e")
        draw.text((105, 260), f"References: {len(files)} | Job: {job_id}", fill="#173a2e")
        image.save(path)
        return job_id, {"fake": True, "path": str(path)}

    def poll(self, provider_id):
        path = self.directory / f"{provider_id}.png"
        if not path.is_file():
            raise StudioError("fixture_missing", "Offline fixture output missing")
        return "collecting", [str(path)], {"fake": True}
