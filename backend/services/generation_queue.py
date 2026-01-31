"""
Generation Queue Service
Handles async generation with progress tracking and file management
"""
import uuid
import json
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any, Callable, List
from pathlib import Path

from backend.database.core import get_connection


class GenerationRequest:
    """Tracks progress of a single generation request"""

    def __init__(self, request_id: str):
        self.request_id = request_id
        self.cancelled = False

    def update_progress(self,
                       percentage: int,
                       step: str,
                       status: str = 'generating'):
        """Update generation progress"""
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE generation_requests
            SET progress_percentage = ?,
                current_step = ?,
                status = ?
            WHERE id = ?
        """, (percentage, step, status, self.request_id))
        conn.commit()
        conn.close()

    def mark_complete(self,
                     output_url: str,
                     file_path: str,
                     cost: float,
                     metadata: Dict[str, Any]):
        """Mark generation as complete"""
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE generation_requests
            SET status = 'complete',
                progress_percentage = 100,
                output_image_url = ?,
                output_file_path = ?,
                output_metadata = ?,
                cost_usd = ?,
                completed_at = ?
            WHERE id = ?
        """, (output_url, file_path, json.dumps(metadata), cost,
              datetime.now().isoformat(), self.request_id))
        conn.commit()
        conn.close()

    def mark_failed(self, error: str):
        """Mark generation as failed"""
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE generation_requests
            SET status = 'failed',
                error_message = ?,
                completed_at = ?
            WHERE id = ?
        """, (error, datetime.now().isoformat(), self.request_id))
        conn.commit()
        conn.close()


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
    method: str = 'text_to_image'
) -> str:
    """Create a new generation request and return request_id"""
    request_id = f"gen_{uuid.uuid4().hex[:8]}"

    # Generate candidate_group_id if not provided
    if not candidate_group_id:
        if target_type == 'master' and target_asset_id:
            candidate_group_id = f"master_group_{target_asset_id}"
        elif target_type == 'variant' and target_asset_id:
            variant_type = params.get('variant_type', 'unknown')
            candidate_group_id = f"variant_group_{target_asset_id}_{variant_type}"
        elif target_type == 'cut' and target_cut_id:
            candidate_group_id = f"cut_group_{target_cut_id}"

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO generation_requests (
            id, project_id, target_type, target_asset_id, target_cut_id,
            prompt, model, method, reference_image_url, reference_images, params,
            status, candidate_group_id, started_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)
    """, (request_id, project_id, target_type, target_asset_id, target_cut_id,
          prompt, model, method, reference_image_url, json.dumps(reference_images) if reference_images else None, 
          json.dumps(params), candidate_group_id, datetime.now().isoformat()))
    conn.commit()
    conn.close()

    return request_id


def start_generation_task(request_id: str):
    """Start generation task in background - call this from endpoint with BackgroundTasks"""
    asyncio.run(execute_generation(request_id))


async def execute_generation(request_id: str):
    """Execute generation with progress tracking"""
    request = GenerationRequest(request_id)

    try:
        # Load request details
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM generation_requests WHERE id = ?", (request_id,))
        req_data = dict(cursor.fetchone())
        conn.close()

        # Step 1: Prepare (5%)
        request.update_progress(5, "Preparing prompt...", "preparing")
        await asyncio.sleep(0.3)

        # Import generation service
        from backend.services.gemini_image import generate_image_text_to_image

        params = json.loads(req_data['params'])

        # Parse reference_images if present
        reference_images = None
        num_refs = 0
        if req_data.get('reference_images'):
            try:
                reference_images = json.loads(req_data['reference_images'])
                num_refs = len([r for r in reference_images if r.get('image_url')])
            except:
                pass

        # Step 2: Upload references (10-25%) - if there are reference images
        if num_refs > 0:
            request.update_progress(10, f"Uploading {num_refs} reference image(s)...", "uploading")
            await asyncio.sleep(0.3)
            request.update_progress(20, "Uploading references to Fal.ai...", "uploading")
        else:
            request.update_progress(15, "No references to upload...", "preparing")

        # Step 3: Call AI API (25-70%)
        request.update_progress(25, "Starting image generation...", "generating")
        await asyncio.sleep(0.3)
        request.update_progress(40, "Generating image with AI...", "generating")
        await asyncio.sleep(0.5)
        request.update_progress(55, "Rendering image...", "generating")

        # Generate image using actual Gemini service
        result = generate_image_text_to_image(
            prompt=req_data['prompt'],
            model=req_data['model'],
            resolution=params.get('resolution', '2048x2048'),
            aspect_ratio=params.get('aspect_ratio', '1:1'),
            seed=params.get('seed'),
            num_images=1,
            reference_images=reference_images
        )

        if not result.get('success'):
            raise Exception(result.get('error', 'Image generation failed'))

        # Step 4: Download and save (70-95%)
        request.update_progress(70, "Downloading generated image...", "downloading")

        # Download the generated image from the mock service
        image_url = result['image_url']
        file_info = await save_generated_file_from_url(
            image_url=image_url,
            project_id=req_data['project_id'],
            target_type=req_data['target_type'],
            asset_id=req_data['target_asset_id'],
            request_id=request_id,
            progress_callback=lambda pct: request.update_progress(75 + int(pct * 0.20), f"Saving... {pct}%")
        )

        # Step 4: Complete (100%)
        request.update_progress(95, "Finalizing...", "complete")
        request.mark_complete(
            output_url=file_info['url'],
            file_path=file_info['path'],
            cost=result.get('cost_usd', 0.039),
            metadata={
                'resolution': params.get('resolution'),
                'seed': params.get('seed'),
                'model': req_data['model'],
                'image_id': result.get('image_id'),
                'tokens_used': result.get('tokens_used', 0)
            }
        )

    except Exception as e:
        request.mark_failed(str(e))
        print(f"Generation failed for {request_id}: {e}")


async def save_generated_file_from_url(
    image_url: str,
    project_id: str,
    target_type: str,
    asset_id: Optional[str],
    request_id: str,
    progress_callback: Optional[Callable] = None
) -> Dict[str, str]:
    """
    Copy generated file from temp location to structured project storage:
    /storage/projects/{project_id}/elements/{asset_id}/{target_type}_{request_id}.jpg
    """
    import shutil
    import requests

    # Create directory structure under backend/storage
    backend_dir = Path(__file__).parent.parent  # backend/
    base_dir = backend_dir / "storage" / "projects" / project_id / "elements"
    if asset_id:
        base_dir = base_dir / asset_id
    base_dir.mkdir(parents=True, exist_ok=True)

    # Generate filename
    filename = f"{target_type}_{request_id}.jpg"
    dest_path = base_dir / filename

    # If image_url is a local path (starts with /storage/generated/)
    if image_url.startswith('/storage/generated/'):
        # Copy from temp storage to project storage
        source_path = Path(__file__).parent.parent / image_url.lstrip('/')

        if progress_callback:
            progress_callback(50)

        shutil.copy2(source_path, dest_path)

        if progress_callback:
            progress_callback(100)
    else:
        # Download from remote URL
        response = requests.get(image_url, stream=True, timeout=30)
        response.raise_for_status()

        total_size = int(response.headers.get('content-length', 0))
        chunk_size = 8192
        downloaded = 0

        with open(dest_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=chunk_size):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if progress_callback and total_size > 0:
                        progress_pct = int((downloaded / total_size) * 100)
                        progress_callback(progress_pct)

    # Return URL and path
    url_path = f"/storage/projects/{project_id}/elements"
    if asset_id:
        url_path += f"/{asset_id}"
    url = f"{url_path}/{filename}"

    return {
        'url': url,
        'path': str(dest_path)
    }


def get_generation_status(request_id: str) -> Optional[Dict[str, Any]]:
    """Get current status of a generation request"""
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
    limit: int = 50
) -> list[Dict[str, Any]]:
    """List generation requests with filters"""
    conn = get_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM generation_requests WHERE project_id = ?"
    params = [project_id]

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
    """Cancel a pending/generating request"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE generation_requests
        SET status = 'cancelled',
            completed_at = ?
        WHERE id = ? AND status IN ('queued', 'preparing', 'generating', 'downloading')
    """, (datetime.now().isoformat(), request_id))
    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0
