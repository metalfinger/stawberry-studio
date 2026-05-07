"""
Sheet cell cropping.

Most modern image models can attend to a specific cell of a multi-panel sheet
when the prompt names it explicitly ("the front-view panel of @Image1").
For models that can't, or for cases where we want a tight reference of just
the right panel, this module crops the cell on-the-fly using bbox metadata
from `element_sheets.layout_json` and stores the crop in `sheet_cell_crops`
for reuse.

API:
    crop_cell_url(sheet_id, cell_label)  → URL of cropped image (cached)
    iter_cells(sheet)                     → yields (label, bbox) pairs

The crops are saved under /storage/generated/sheet_cells/.
"""
from __future__ import annotations

import json
import uuid
from io import BytesIO
from pathlib import Path
from typing import Any

import structlog

from backend.database.core import get_async_connection
from backend.providers.image._storage import fetch_url_or_data_uri

log = structlog.get_logger(__name__)

_STORAGE_ROOT = Path(__file__).parent.parent / "storage" / "generated" / "sheet_cells"


def iter_cells(sheet: dict[str, Any]):
    """Yield (label, bbox) for every cell of a sheet row."""
    layout = sheet.get("layout") or json.loads(sheet.get("layout_json") or "{}")
    for cell in layout.get("cells", []):
        yield cell["label"], cell["bbox"]


def _bbox_to_pixels(bbox: list[float], width: int, height: int) -> tuple[int, int, int, int]:
    """Convert normalised bbox [x, y, w, h] → pixel (left, top, right, bottom)."""
    x, y, w, h = bbox
    left = int(round(x * width))
    top = int(round(y * height))
    right = int(round((x + w) * width))
    bottom = int(round((y + h) * height))
    return (left, top, right, bottom)


async def _get_cached(sheet_id: str, cell_label: str) -> str | None:
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT cropped_image_url FROM sheet_cell_crops WHERE sheet_id = ? AND cell_label = ?",
            (sheet_id, cell_label),
        ) as cur:
            row = await cur.fetchone()
    return row["cropped_image_url"] if row else None


async def _store_crop(sheet_id: str, cell_label: str, url: str, bbox: list[float]) -> None:
    crop_id = f"crop_{uuid.uuid4().hex[:12]}"
    async with get_async_connection() as conn:
        await conn.execute(
            """
            INSERT INTO sheet_cell_crops (id, sheet_id, cell_label, cropped_image_url, bbox_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (crop_id, sheet_id, cell_label, url, json.dumps(bbox)),
        )
        await conn.commit()


async def crop_cell_url(sheet_id: str, cell_label: str) -> str | None:
    """Return a /storage URL pointing to the cropped cell image. Cached.
    Returns None if the sheet or cell isn't found.
    """
    cached = await _get_cached(sheet_id, cell_label)
    if cached:
        return cached

    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT image_url, layout_json FROM element_sheets WHERE id = ?",
            (sheet_id,),
        ) as cur:
            row = await cur.fetchone()
    if row is None:
        log.warning("crop_cell_sheet_not_found", sheet_id=sheet_id)
        return None

    image_url = row["image_url"]
    layout = json.loads(row["layout_json"] or "{}")
    bbox = None
    for c in layout.get("cells", []):
        if c["label"] == cell_label:
            bbox = c["bbox"]
            break
    if bbox is None:
        log.warning("crop_cell_label_not_found", sheet_id=sheet_id, cell_label=cell_label)
        return None

    # Pull image bytes (handles /storage/, http(s), data:)
    try:
        from PIL import Image
    except ImportError as e:
        raise RuntimeError("Pillow is required for sheet cell cropping; pip install Pillow") from e

    raw = await fetch_url_or_data_uri(image_url)
    img = Image.open(BytesIO(raw)).convert("RGB")
    box = _bbox_to_pixels(bbox, img.width, img.height)
    cropped = img.crop(box)

    _STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
    fname = f"{sheet_id}_{cell_label}.png"
    out_path = _STORAGE_ROOT / fname
    cropped.save(out_path, format="PNG")
    url = f"/storage/generated/sheet_cells/{fname}"

    await _store_crop(sheet_id, cell_label, url, bbox)
    log.info("sheet_cell_cropped", sheet_id=sheet_id, label=cell_label, url=url)
    return url
