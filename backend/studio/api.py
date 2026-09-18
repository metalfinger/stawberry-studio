from __future__ import annotations

import os
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask
from starlette.middleware.trustedhost import TrustedHostMiddleware

from backend.studio.models import (
    Approval,
    AssetRequirementCreate,
    AssetRequirementUpdate,
    BatchApproval,
    Feedback,
    MediaReview,
    NodeCreate,
    NodePatch,
    RecipeCreate,
    Reconciliation,
    Reorder,
    Selection,
    SourceCreate,
)
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError


def create_app(home=None):
    studio = Studio(Store(home))
    app = FastAPI(title="Strawberry Production Engine", version="0.1")
    app.state.studio = studio
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]", "testserver"])

    @app.middleware("http")
    async def local_mutations(request: Request, call_next):
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            origin = request.headers.get("origin")
            if origin and urlparse(origin).netloc != request.headers.get("host"):
                return JSONResponse({"error": "origin_forbidden"}, status_code=403)
            if request.headers.get("x-strawberry-action") != "1":
                return JSONResponse({"error": "action_header_required"}, status_code=403)
        return await call_next(request)

    @app.exception_handler(StudioError)
    async def studio_error(_request, error):
        return JSONResponse(
            {"error": error.code, "message": str(error), "issues": getattr(error, "issues", [])},
            status_code=error.status,
        )

    @app.get("/api/studio/health")
    def health():
        return {"status": "ok", "mode": "local", "schema": 5}

    @app.get("/api/studio/runtime")
    def runtime():
        return studio.execution.status()

    @app.post("/api/studio/generation-batches")
    def approve_batch(body: BatchApproval):
        return studio.approve_batch(body)

    @app.get("/api/studio/projects")
    def projects():
        return studio.projects()

    @app.get("/api/studio/projects/{project_id}")
    def project(project_id: str):
        return studio.project(project_id)

    @app.get("/api/studio/projects/{project_id}/export")
    def export(project_id: str):
        from backend.studio.project_archive import export_project

        handle, path = tempfile.mkstemp(prefix="strawberry-project-", suffix=".zip")
        os.close(handle)
        Path(path).unlink()
        try:
            result = export_project(studio.store, project_id, path)
            filename = f"{result['project_name']}.strawberry.zip"
            return FileResponse(path, media_type="application/zip", filename=filename, background=BackgroundTask(os.unlink, path))
        except BaseException:
            Path(path).unlink(missing_ok=True)
            raise

    @app.post("/api/studio/projects/import")
    async def import_archive(request: Request):
        from backend.studio.backup import MAX_ARCHIVE_BYTES
        from backend.studio.project_archive import import_project

        declared = request.headers.get("content-length")
        if declared:
            try:
                too_large = int(declared) > MAX_ARCHIVE_BYTES
            except ValueError as exc:
                raise StudioError("archive_size", "Invalid project archive size", 400) from exc
            if too_large:
                raise StudioError("archive_size", "Project archive exceeds the current 4 GiB import limit", 413)
        handle, path = tempfile.mkstemp(prefix="strawberry-project-upload-", suffix=".zip")
        size = 0
        try:
            with os.fdopen(handle, "wb") as output:
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > MAX_ARCHIVE_BYTES:
                        raise StudioError("archive_size", "Project archive exceeds the current 4 GiB import limit", 413)
                    output.write(chunk)
            return import_project(studio.store, path)
        finally:
            Path(path).unlink(missing_ok=True)

    @app.post("/api/studio/nodes")
    def create_node(body: NodeCreate):
        return studio.create_node(body)

    @app.get("/api/studio/nodes/{node_id}")
    def node(node_id: str):
        return studio.inspect(node_id)

    @app.post("/api/studio/assets/{asset_id}/requirements")
    def create_requirement(asset_id: str, body: AssetRequirementCreate):
        return studio.create_requirement(asset_id, body)

    @app.put("/api/studio/requirements/{requirement_id}")
    def update_requirement(requirement_id: str, body: AssetRequirementUpdate):
        return studio.update_requirement(requirement_id, body)

    @app.get("/api/studio/nodes/{node_id}/readiness")
    def readiness(node_id: str):
        return studio.readiness(node_id)

    @app.post("/api/studio/nodes/{node_id}/reorder")
    def reorder(node_id: str, body: Reorder):
        return studio.reorder(node_id, body)

    @app.patch("/api/studio/nodes/{node_id}")
    def patch(node_id: str, body: NodePatch):
        return studio.patch_node(node_id, body)

    @app.get("/api/studio/nodes/{node_id}/revisions/{revision}")
    def revision(node_id: str, revision: int):
        return studio.revision(node_id, revision)

    @app.post("/api/studio/nodes/{node_id}/sources")
    def capture(node_id: str, body: SourceCreate):
        return studio.capture(node_id, body)

    @app.post("/api/studio/nodes/{node_id}/selection")
    def select(node_id: str, body: Selection):
        return studio.select(node_id, body.media_id, body.expected_revision)

    @app.get("/api/studio/media/{media_id}/file")
    def media_file(media_id: str):
        path, mime = studio.media_path(media_id)
        return FileResponse(path, media_type=mime, headers={"X-Content-Type-Options": "nosniff"})

    @app.get("/api/studio/media/{media_id}")
    def media_detail(media_id: str):
        return studio.media(media_id)

    @app.post("/api/studio/media/{media_id}/review")
    def review(media_id: str, body: MediaReview):
        return studio.review_media(media_id, body)

    @app.post("/api/studio/media/{media_id}/feedback")
    def feedback(media_id: str, body: Feedback):
        return studio.feedback(media_id, body.text)

    @app.post("/api/studio/recipes")
    def prepare(body: RecipeCreate):
        return studio.prepare(body)

    @app.get("/api/studio/recipes/{recipe_id}")
    def recipe(recipe_id: str):
        return studio.recipe(recipe_id)

    @app.post("/api/studio/recipes/{recipe_id}/approval")
    def approve(recipe_id: str, body: Approval):
        return studio.approve(recipe_id, body)

    @app.post("/api/studio/recipes/{recipe_id}/jobs")
    def execute(recipe_id: str):
        return studio.enqueue(recipe_id)

    @app.get("/api/studio/jobs/{job_id}")
    def job(job_id: str):
        return studio.job(job_id)

    @app.post("/api/studio/jobs/{job_id}/retry-collection")
    def retry_collection(job_id: str):
        return studio.retry_collection(job_id)

    @app.post("/api/studio/jobs/{job_id}/cancel")
    def cancel(job_id: str):
        return studio.execution.cancel(job_id)

    @app.get("/api/studio/jobs/{job_id}/reconciliation")
    def reconciliation_preview(job_id: str, provider_id: str):
        return studio.execution.preview_reconciliation(job_id, provider_id)

    @app.post("/api/studio/jobs/{job_id}/reconciliation")
    def reconcile(job_id: str, body: Reconciliation):
        return studio.execution.reconcile(job_id, body)

    dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/")
    def root():
        return RedirectResponse("/studio")

    @app.get("/studio")
    @app.get("/studio/{project_id}")
    def viewer(project_id: str = ""):
        index = dist / "index.html"
        if not index.is_file():
            raise HTTPException(503, "Build the frontend before opening the viewer")
        return FileResponse(index)

    return app
