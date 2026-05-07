"""
Generation Queue Service — async-native progress tracking + file management.

All DB operations use aiosqlite (no event-loop blocking). The synchronous image
generation call (`generate_image_text_to_image`) is wrapped in `asyncio.to_thread`
so the underlying `fal_client.subscribe` runs off-loop. File downloads use
`httpx.AsyncClient`.
"""
from __future__ import annotations

import asyncio
import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import httpx
import structlog

from backend.database.core import get_async_connection, get_connection

log = structlog.get_logger(__name__)


class GenerationRequest:
    """Tracks progress of a single generation request — async DB writes."""

    def __init__(self, request_id: str):
        self.request_id = request_id
        self.cancelled = False

    async def update_progress(
        self,
        percentage: int,
        step: str,
        status: str = "generating",
    ) -> None:
        async with get_async_connection() as conn:
            await conn.execute(
                """
                UPDATE generation_requests
                SET progress_percentage = ?, current_step = ?, status = ?
                WHERE id = ?
                """,
                (percentage, step, status, self.request_id),
            )
            await conn.commit()

    async def mark_complete(
        self,
        output_url: str,
        file_path: str,
        cost: float,
        metadata: Dict[str, Any],
    ) -> None:
        async with get_async_connection() as conn:
            await conn.execute(
                """
                UPDATE generation_requests
                SET status = 'complete',
                    progress_percentage = 100,
                    output_image_url = ?,
                    output_file_path = ?,
                    output_metadata = ?,
                    cost_usd = ?,
                    completed_at = ?
                WHERE id = ?
                """,
                (
                    output_url,
                    file_path,
                    json.dumps(metadata),
                    cost,
                    datetime.now().isoformat(),
                    self.request_id,
                ),
            )
            await conn.commit()

    async def mark_failed(self, error: str) -> None:
        async with get_async_connection() as conn:
            await conn.execute(
                """
                UPDATE generation_requests
                SET status = 'failed',
                    error_message = ?,
                    completed_at = ?
                WHERE id = ?
                """,
                (error, datetime.now().isoformat(), self.request_id),
            )
            await conn.commit()


def create_generation_request(
    project_id: str,
    target_type: str,
    prompt: str,
    model: str,
    params: Dict[str, Any],
    target_asset_id: Optional[str] = None,
    target_cut_id: Optional[str] = None,
    candidate_group_id: Optional[str] = None,
    reference_image_url: Optional[str] = None,
    reference_images: Optional[List[Dict[str, Any]]] = None,
    method: str = "text_to_image",
) -> str:
    """Create a new generation request and return request_id. Sync — called from sync route handlers."""
    request_id = f"gen_{uuid.uuid4().hex[:8]}"

    if not candidate_group_id:
        if target_type == "master" and target_asset_id:
            candidate_group_id = f"master_group_{target_asset_id}"
        elif target_type == "variant" and target_asset_id:
            variant_type = params.get("variant_type", "unknown")
            candidate_group_id = f"variant_group_{target_asset_id}_{variant_type}"
        elif target_type == "cut" and target_cut_id:
            candidate_group_id = f"cut_group_{target_cut_id}"

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO generation_requests (
            id, project_id, target_type, target_asset_id, target_cut_id,
            prompt, model, method, reference_image_url, reference_images, params,
            status, candidate_group_id, started_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)
        """,
        (
            request_id,
            project_id,
            target_type,
            target_asset_id,
            target_cut_id,
            prompt,
            model,
            method,
            reference_image_url,
            json.dumps(reference_images) if reference_images else None,
            json.dumps(params),
            candidate_group_id,
            datetime.now().isoformat(),
        ),
    )
    conn.commit()
    conn.close()
    return request_id


def start_generation_task(request_id: str) -> None:
    """Entry point from FastAPI BackgroundTasks (sync). Schedules the async runner."""
    asyncio.run(execute_generation(request_id))


async def execute_generation(request_id: str) -> None:
    """Execute generation with progress tracking — fully async."""
    request = GenerationRequest(request_id)

    try:
        async with get_async_connection() as conn:
            async with conn.execute(
                "SELECT * FROM generation_requests WHERE id = ?", (request_id,)
            ) as cursor:
                row = await cursor.fetchone()
        if row is None:
            raise RuntimeError(f"generation_request not found: {request_id}")
        req_data = dict(row)

        await request.update_progress(5, "Preparing prompt...", "preparing")
        await asyncio.sleep(0.2)

        from backend.services.gemini_image import generate_image_text_to_image

        params = json.loads(req_data["params"])

        reference_images = None
        num_refs = 0
        if req_data.get("reference_images"):
            try:
                reference_images = json.loads(req_data["reference_images"])
                num_refs = len([r for r in reference_images if r.get("image_url")])
            except Exception:
                pass

        if num_refs > 0:
            await request.update_progress(20, f"Uploading {num_refs} reference image(s)...", "uploading")
        else:
            await request.update_progress(15, "No references to upload...", "preparing")

        await request.update_progress(40, "Generating image with AI...", "generating")

        # Image gen is sync (fal_client / google.generativeai are sync libs).
        # Run in a thread so we don't block the event loop.
        result = await asyncio.to_thread(
            generate_image_text_to_image,
            prompt=req_data["prompt"],
            model=req_data["model"],
            resolution=params.get("resolution", "2048x2048"),
            aspect_ratio=params.get("aspect_ratio", "1:1"),
            seed=params.get("seed"),
            num_images=1,
            reference_images=reference_images,
        )

        if not result.get("success"):
            raise RuntimeError(result.get("error", "Image generation failed"))

        await request.update_progress(70, "Downloading generated image...", "downloading")

        async def _on_progress(pct: int) -> None:
            await request.update_progress(75 + int(pct * 0.20), f"Saving... {pct}%")

        file_info = await save_generated_file_from_url(
            image_url=result["image_url"],
            project_id=req_data["project_id"],
            target_type=req_data["target_type"],
            asset_id=req_data["target_asset_id"],
            request_id=request_id,
            progress_callback=_on_progress,
        )

        await request.update_progress(95, "Finalizing...", "complete")
        await request.mark_complete(
            output_url=file_info["url"],
            file_path=file_info["path"],
            cost=result.get("cost_usd", 0.039),
            metadata={
                "resolution": params.get("resolution"),
                "seed": params.get("seed"),
                "model": req_data["model"],
                "image_id": result.get("image_id"),
                "tokens_used": result.get("tokens_used", 0),
            },
        )
        log.info("generation_complete", request_id=request_id)
    except Exception as e:
        await request.mark_failed(str(e))
        log.error("generation_failed", request_id=request_id, error=str(e))


async def save_generated_file_from_url(
    image_url: str,
    project_id: str,
    target_type: str,
    asset_id: Optional[str],
    request_id: str,
    progress_callback: Optional[Callable[[int], Any]] = None,
) -> Dict[str, str]:
    """
    Move generated file into project storage:
        backend/storage/projects/{project_id}/elements/{asset_id}/{target_type}_{request_id}.jpg
    """
    backend_dir = Path(__file__).parent.parent
    base_dir = backend_dir / "storage" / "projects" / project_id / "elements"
    if asset_id:
        base_dir = base_dir / asset_id
    base_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{target_type}_{request_id}.jpg"
    dest_path = base_dir / filename

    async def _emit(pct: int) -> None:
        if progress_callback is None:
            return
        result = progress_callback(pct)
        if asyncio.iscoroutine(result):
            await result

    if image_url.startswith("/storage/generated/"):
        source_path = backend_dir / image_url.lstrip("/")
        await _emit(50)
        await asyncio.to_thread(shutil.copy2, source_path, dest_path)
        await _emit(100)
    else:
        async with httpx.AsyncClient(timeout=30.0) as client:
            async with client.stream("GET", image_url) as response:
                response.raise_for_status()
                total_size = int(response.headers.get("content-length", 0) or 0)
                downloaded = 0
                with open(dest_path, "wb") as f:
                    async for chunk in response.aiter_bytes(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total_size > 0:
                                await _emit(int((downloaded / total_size) * 100))

    url_path = f"/storage/projects/{project_id}/elements"
    if asset_id:
        url_path += f"/{asset_id}"
    return {"url": f"{url_path}/{filename}", "path": str(dest_path)}


def get_generation_status(request_id: str) -> Optional[Dict[str, Any]]:
    """Sync — used by sync route handlers polling status."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM generation_requests WHERE id = ?", (request_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def list_generation_requests(
    project_id: str,
    status: Optional[str] = None,
    target_asset_id: Optional[str] = None,
    limit: int = 50,
) -> list[Dict[str, Any]]:
    """Sync — list endpoints."""
    conn = get_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM generation_requests WHERE project_id = ?"
    params: list[Any] = [project_id]

    if status:
        query += " AND status = ?"
        params.append(status)
    if target_asset_id:
        query += " AND target_asset_id = ?"
        params.append(target_asset_id)

    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def cancel_generation(request_id: str) -> bool:
    """Cancel a pending/generating request."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE generation_requests
        SET status = 'cancelled', completed_at = ?
        WHERE id = ? AND status IN ('queued', 'preparing', 'generating', 'downloading')
        """,
        (datetime.now().isoformat(), request_id),
    )
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0
