"""
Shared utilities for image-provider adapters: local storage + remote download.
"""
from __future__ import annotations

import base64
import uuid
from pathlib import Path

import httpx

_STORAGE_ROOT = Path(__file__).parent.parent.parent / "storage" / "generated"


def save_image_bytes(image_bytes: bytes, filename: str | None = None, ext: str = "png") -> str:
    """Save raw bytes to /storage/generated/ and return a /storage/... URL."""
    if not filename:
        filename = f"{uuid.uuid4().hex}.{ext}"
    _STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
    out = _STORAGE_ROOT / filename
    out.write_bytes(image_bytes)
    return f"/storage/generated/{filename}"


async def fetch_url_or_data_uri(url: str) -> bytes:
    """Fetch HTTP(S) URL or decode a data: URI. Async-safe."""
    if url.startswith("data:"):
        _, b64 = url.split(",", 1)
        return base64.b64decode(b64)
    if url.startswith("/storage/generated/"):
        # URL: /storage/generated/<file>; _STORAGE_ROOT already points there.
        filename = url.rsplit("/", 1)[-1]
        return (_STORAGE_ROOT / filename).read_bytes()
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


def fetch_url_sync(url: str) -> bytes:
    """Sync version for use inside `asyncio.to_thread`-wrapped sync libs."""
    if url.startswith("data:"):
        _, b64 = url.split(",", 1)
        return base64.b64decode(b64)
    if url.startswith("/storage/generated/"):
        # URL: /storage/generated/<file>; _STORAGE_ROOT already points there.
        filename = url.rsplit("/", 1)[-1]
        return (_STORAGE_ROOT / filename).read_bytes()
    import requests

    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.content
