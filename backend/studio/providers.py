from __future__ import annotations

import json
import math
import re
import subprocess
from pathlib import Path

from backend.studio.store import StudioError, digest

REJECTION_SIGNATURES = ("nsfw content detected", "content policy", "moderation", "safety system", "rejected by the provider")


class ProviderRejected(Exception):
    """The provider refused the request before creating a job. Definitive; nothing to reconcile."""


class SubmissionUnknown(Exception):
    """A billable operation may have succeeded; never retry automatically."""


class Higgsfield:
    name = "higgsfield"
    verified_cli_version = "0.1.28"
    reference_params = ("input_images", "medias")

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
                if isinstance(exc, ValueError) and any(sig in str(exc).lower() for sig in REJECTION_SIGNATURES):
                    raise ProviderRejected(str(exc).strip()) from exc
                raise SubmissionUnknown(f"Submission needs reconciliation: {exc}") from exc
            raise StudioError("provider_error", str(exc), 502) from exc

    def contract(self, model):
        version = self.command(["version"], raw=True)
        if not re.search(rf"\b{re.escape(self.verified_cli_version)}\b", version):
            raise StudioError(
                "cli_unsupported",
                "This adapter is verified against Higgsfield CLI 0.1.28; verify compatibility before using another version",
            )
        schema = self.command(["model", "get", model, "--json"])
        if not isinstance(schema, dict) or schema.get("job_set_type") != model:
            raise StudioError("provider_schema", "Unexpected model schema")
        return {"cli_version": version, "schema": schema, "schema_hash": digest(schema)}

    @staticmethod
    def _params(schema):
        rows = schema.get("params", [])
        if not isinstance(rows, list) or any(not isinstance(row, dict) or not row.get("name") for row in rows):
            raise StudioError("provider_schema", "Unexpected model parameter schema")
        return {row["name"]: row for row in rows}

    @classmethod
    def _reference_param(cls, params):
        declared = [name for name in cls.reference_params if name in params]
        if len(declared) > 1:
            raise StudioError("provider_schema", "Model declares ambiguous image-reference parameters")
        return params[declared[0]] if declared else None

    def catalog(self, media_type="image"):
        version = self.command(["version"], raw=True)
        if not re.search(rf"\b{re.escape(self.verified_cli_version)}\b", version):
            raise StudioError(
                "cli_unsupported",
                "This adapter is verified against Higgsfield CLI 0.1.28; verify compatibility before using another version",
            )
        rows = self.command(["model", "list", "--json"])
        if not isinstance(rows, list):
            raise StudioError("provider_schema", "Unexpected model catalog")
        models = []
        for row in rows:
            if not isinstance(row, dict) or row.get("type") != media_type:
                continue
            model = row.get("job_set_type")
            name = row.get("display_name")
            if not isinstance(model, str) or not model or not isinstance(name, str) or not name:
                raise StudioError("provider_schema", "Model catalog entry is incomplete")
            models.append({"model": model, "display_name": name, "media_type": media_type})
        models.sort(key=lambda item: (item["display_name"].casefold(), item["model"]))
        return {
            "provider": self.name,
            "cli_version": version,
            "media_type": media_type,
            "models": models,
        }

    def describe(self, model):
        contract = self.contract(model)
        schema = contract["schema"]
        if schema.get("type") != "image":
            raise StudioError("model_scope", "Strawberry currently supports image-storyboarding models only")
        params = self._params(schema)
        reference_param = self._reference_param(params)
        return {
            "provider": self.name,
            "model": model,
            "display_name": schema.get("display_name", model),
            "media_type": schema["type"],
            "cli_version": contract["cli_version"],
            "schema_hash": contract["schema_hash"],
            "capabilities": {
                "prompt": "prompt" in params,
                "image_references": reference_param is not None,
                "reference_parameter": reference_param.get("name") if reference_param else None,
                "minimum_references": reference_param.get(
                    "minItems", 1 if reference_param and reference_param.get("required") else 0
                )
                if reference_param
                else 0,
                "maximum_references": reference_param.get("maxItems") if reference_param else 0,
            },
            "parameters": list(params.values()),
        }

    def prepare(self, request):
        contract = self.contract(request.model)
        schema = contract["schema"]
        params = self._params(schema)
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
            if "prompt" not in params:
                raise StudioError("capability_unverified", "This image utility does not accept a Strawberry prompt")
            media_param = self._reference_param(params)
            if request.references and media_param is None:
                raise StudioError("reference_unsupported", "Model does not declare image inputs")
            if any(r.role in {"start_frame", "end_frame"} for r in request.references):
                raise StudioError("reference_role", "Video frame roles cannot be used for this image model")
            minimum = (
                media_param.get("minItems", 1 if media_param.get("required") else 0) if media_param else 0
            )
            maximum = media_param.get("maxItems", 32) if media_param else 0
            if len(request.references) < minimum or len(request.references) > maximum:
                raise StudioError("reference_count", "Reference count exceeds the model's declared input bounds")
            if settings.get("batch_size", 1) != 1:
                raise StudioError("setting_unsupported", "Strawberry currently requires one provider job per recipe")
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
        spec = {
            "model": request.model,
            "prompt": request.prompt,
            "settings": settings,
            "references": [r.model_dump() for r in request.references],
        }
        return {"settings": settings, "provider_contract": contract, "estimate": self.estimate(spec)}

    def estimate(self, spec):
        args = ["generate", "cost", spec["model"], "--prompt", spec["prompt"]]
        for key, value in spec["settings"].items():
            args.extend(["--" + key, value if isinstance(value, str) else json.dumps(value)])
        try:
            result = self.command([*args, "--json"])
            amount = result.get("credits") if isinstance(result, dict) else None
            if type(amount) not in {int, float} or not math.isfinite(amount) or amount < 0:
                raise StudioError("cost_response", "Unrecognized credit estimate")
            return {
                "credits": None if spec["references"] else amount,
                "unit": "provider_credits",
                "settings_only_credits": amount,
                "source": "higgsfield.generate.cost",
                "reason": "Exact reference-input pricing is unverified; no files uploaded"
                if spec["references"]
                else "Estimate, not a provider-enforced billing cap",
            }
        except StudioError:
            return {
                "credits": None,
                "unit": "provider_credits",
                "reason": "Provider estimate unavailable; no files uploaded",
            }

    def preflight(self, spec):
        if self.contract(spec["model"]) != spec["provider_contract"]:
            raise StudioError("provider_changed", "CLI/model schema changed; prepare and approve a new recipe")
        return self.estimate(spec)

    def submit(self, job_id, spec, files):
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

    def inspect(self, provider_id):
        result = self.command(["generate", "get", provider_id, "--json"])
        if not isinstance(result, dict) or result.get("id") != provider_id:
            raise StudioError("provider_response", "Unexpected job response", 502)
        return result

    def poll(self, provider_id):
        result = self.inspect(provider_id)
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


class Fal:
    """fal.ai's queue API. Images only, one image per job.

    Reference images are uploaded to fal's storage first. Outputs are fal CDN URLs, which the
    worker downloads like any provider's. The provider job id is fal's own result URL for the
    request, because polling needs the app it ran on as well as the request id.
    """

    name = "fal"
    QUEUE = "https://queue.fal.run/"
    REST = "https://rest.fal.ai"
    # Recipe model ids carry no slashes, so fal endpoints get short names here. Prices are
    # fal's published per-image list prices in US dollars, by resolution.
    MODELS = {
        "nano_banana_pro": {
            "generate": "fal-ai/nano-banana-pro",
            "edit": "fal-ai/nano-banana-pro/edit",
            "max_references": 14,
            "usd": {"1K": 0.15, "2K": 0.15, "4K": 0.30},
        },
    }
    SETTINGS = {
        "aspect_ratio": ("auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"),
        "resolution": ("1K", "2K", "4K"),
        "output_format": ("png", "jpeg", "webp"),
        "safety_tolerance": ("1", "2", "3", "4", "5", "6"),
    }
    DEFAULTS = {"aspect_ratio": "16:9", "resolution": "1K", "output_format": "png"}

    def __init__(self, key=None, client=None):
        import httpx

        self.key = key
        self.client = client or httpx.Client(timeout=60)

    def _headers(self):
        import os

        key = self.key or os.environ.get("FAL_KEY")
        if not key:
            raise StudioError("provider_unconfigured", "Set FAL_KEY to generate with fal")
        return {"Authorization": f"Key {key}"}

    def _model(self, model):
        entry = self.MODELS.get(model)
        if not entry:
            raise StudioError("model_unknown", f"fal model not verified in Strawberry: {model}")
        return entry

    def contract(self, model):
        entry = self._model(model)
        return {"api": "fal queue", "model": model, "generate": entry["generate"], "edit": entry["edit"]}

    def prepare(self, request):
        entry = self._model(request.model)
        settings = {**self.DEFAULTS, **request.settings}
        for key, value in settings.items():
            allowed = self.SETTINGS.get(key)
            if allowed is None:
                raise StudioError("setting_unknown", f"fal model does not take {key}")
            if value not in allowed:
                raise StudioError("setting_invalid", f"Unsupported {key}: {value}")
        if any(r.role in {"start_frame", "end_frame"} for r in request.references):
            raise StudioError("reference_role", "Video frame roles cannot be used for this image model")
        if len(request.references) > entry["max_references"]:
            raise StudioError("reference_count", "Reference count exceeds the model's declared input bounds")
        spec = {"model": request.model, "settings": settings}
        return {"settings": settings, "provider_contract": self.contract(request.model), "estimate": self.estimate(spec)}

    def estimate(self, spec):
        entry = self._model(spec["model"])
        price = entry["usd"][spec["settings"].get("resolution", "1K")]
        return {
            "credits": price,
            "unit": "usd",
            "source": "fal.list_price",
            "reason": "fal's published per-image price; fal bills the account, not Strawberry",
        }

    def preflight(self, spec):
        if self.contract(spec["model"]) != spec["provider_contract"]:
            raise StudioError("provider_changed", "fal model mapping changed; prepare and approve a new recipe")
        return self.estimate(spec)

    CDN = "https://v3.fal.media"

    def _upload(self, path):
        """Upload a reference image the way fal's own client does: a short-lived CDN token, then
        the bytes to fal's CDN. The older storage route is the fallback, as in fal's client."""
        import mimetypes

        content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        data = Path(path).read_bytes()
        try:
            token = self.client.post(
                f"{self.REST}/storage/auth/token?storage_type=fal-cdn-v3",
                json={},
                headers={**self._headers(), "Accept": "application/json"},
            )
            token.raise_for_status()
            t = token.json()
            uploaded = self.client.post(
                f"{self.CDN}/files/upload",
                content=data,
                headers={
                    "Authorization": f"{t['token_type']} {t['token']}",
                    "Content-Type": content_type,
                    "X-Fal-File-Name": Path(path).name,
                },
            )
            uploaded.raise_for_status()
            return uploaded.json()["access_url"]
        except Exception:
            init = self.client.post(
                f"{self.REST}/storage/upload/initiate?storage_type=gcs",
                json={"file_name": Path(path).name, "content_type": content_type},
                headers={**self._headers(), "Accept": "application/json"},
            )
            init.raise_for_status()
            target = init.json()
            put = self.client.put(target["upload_url"], content=data, headers={"Content-Type": content_type})
            put.raise_for_status()
            return target["file_url"]

    def submit(self, job_id, spec, files):
        import httpx

        entry = self._model(spec["model"])
        # Uploading happens before any job exists, so a failure here costs nothing.
        try:
            urls = [self._upload(file) for file in files]
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise ProviderRejected(f"reference upload failed before submission: {exc}") from exc
        endpoint = entry["edit"] if urls else entry["generate"]
        body = {"prompt": spec["prompt"], "num_images": 1, **spec["settings"]}
        if urls:
            body["image_urls"] = urls
        try:
            response = self.client.post(self.QUEUE + endpoint, json=body, headers=self._headers())
        except httpx.HTTPError as exc:
            raise SubmissionUnknown(f"Submission needs reconciliation: {exc}") from exc
        if 400 <= response.status_code < 500:
            # A 4xx is a refusal before any job was created: validation, moderation, auth, balance.
            raise ProviderRejected(f"fal refused the request ({response.status_code}): {response.text[:500]}")
        if response.status_code >= 500:
            raise SubmissionUnknown(f"fal returned {response.status_code}; inspect fal requests before any retry")
        result = response.json()
        provider_id = result.get("response_url")
        if not isinstance(provider_id, str) or not provider_id.startswith(self.QUEUE) or not result.get("request_id"):
            raise SubmissionUnknown("fal returned no recognized request; inspect fal requests before any retry")
        return provider_id, {
            "request_id": result["request_id"],
            "endpoint": endpoint,
            "reference_urls": urls,
            "status_url": result.get("status_url"),
        }

    def _get(self, url):
        import httpx

        if not url.startswith(self.QUEUE):
            raise StudioError("provider_response", "Unexpected fal request URL", 502)
        try:
            return self.client.get(url, headers=self._headers())
        except httpx.HTTPError as exc:
            raise StudioError("provider_error", str(exc), 502) from exc

    def inspect(self, provider_id):
        response = self._get(provider_id + "/status")
        if response.status_code >= 400:
            raise StudioError("provider_response", f"fal status {response.status_code}", 502)
        return response.json()

    def poll(self, provider_id):
        status = str(self.inspect(provider_id).get("status", "")).upper()
        if status in {"IN_QUEUE", "IN_PROGRESS"}:
            return "running", [], {"status": status}
        if status != "COMPLETED":
            raise StudioError("provider_status", f"Unknown fal status: {status}", 502)
        # A request that failed also reads COMPLETED; the result says which.
        response = self._get(provider_id)
        body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
        if response.status_code >= 400:
            return "failed", [], {"status": status, "error": body or response.text[:1000]}
        images = body.get("images") if isinstance(body, dict) else None
        url = images[0].get("url") if isinstance(images, list) and images and isinstance(images[0], dict) else None
        if not isinstance(url, str) or not url:
            raise StudioError("provider_output", "Completed fal request has no image URL", 502)
        return "collecting", [url], {"status": status, "description": body.get("description"), "images": images}


def provider_for(name, home):
    """The provider behind a recipe's `provider` name."""
    if name == "fake":
        return FakeProvider(home / "fixtures")
    if name == "higgsfield":
        return Higgsfield()
    if name == "fal":
        return Fal()
    raise StudioError("provider_unknown", f"Unknown provider: {name}")


class FakeProvider:
    """Offline contract test provider. Outputs are visibly marked, never presented as AI."""

    name = "fake"

    def __init__(self, directory: Path):
        self.directory = directory
        self.directory.mkdir(exist_ok=True)

    def prepare(self, request):
        return {
            "settings": request.settings,
            "provider_contract": {"fixture_version": 1},
            "estimate": self.preflight(None),
        }

    def preflight(self, spec):
        return {"credits": 0, "unit": "provider_credits", "source": "offline_fixture"}

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
        (self.directory / f"{job_id}.json").write_text(
            json.dumps(
                {
                    "id": job_id,
                    "job_set_type": spec["model"],
                    "status": "completed",
                    "params": {**spec["settings"], "prompt": spec["prompt"], "input_images": [str(f) for f in files]},
                }
            )
        )
        return job_id, {"fake": True, "path": str(path)}

    def inspect(self, provider_id):
        path = self.directory / f"{provider_id}.json"
        if not path.is_file():
            raise StudioError("fixture_missing", "Offline job receipt missing")
        return json.loads(path.read_text())

    def poll(self, provider_id):
        path = self.directory / f"{provider_id}.png"
        if not path.is_file():
            raise StudioError("fixture_missing", "Offline fixture output missing")
        return "collecting", [str(path)], {"fake": True}
