"""
Fal.ai image adapter — Nano Banana Pro (T2I + edit), Flux, etc.

Wraps the synchronous `fal_client.subscribe` call inside `asyncio.to_thread`
to keep the event loop free.
"""
from __future__ import annotations

import asyncio
import os
import uuid
from typing import Any

from backend.providers.base import (
    ImageGenRequest,
    ImageGenResult,
    ImageProvider,
    ProviderError,
)
from backend.providers.image._storage import fetch_url_sync, save_image_bytes

_COST_PER_IMAGE = {
    "fal-ai/nano-banana-pro": 0.039,
    "fal-ai/nano-banana-pro/edit": 0.039,
    "fal-ai/nano-banana": 0.020,
}


def _resolution_to_fal(resolution: str) -> str:
    if "4096" in resolution:
        return "4K"
    if "2048" in resolution:
        return "2K"
    return "1K"


class FalImage(ImageProvider):
    name = "fal"

    def __init__(
        self,
        *,
        api_key: str | None,
        text_to_image_model: str = "fal-ai/nano-banana-pro",
        image_to_image_model: str = "fal-ai/nano-banana-pro/edit",
    ) -> None:
        self.api_key = api_key
        self.t2i_model = text_to_image_model
        self.i2i_model = image_to_image_model

    def _ensure_key(self) -> None:
        if not self.api_key:
            raise ProviderError(self.name, "FAL_KEY not configured")
        os.environ["FAL_KEY"] = self.api_key

    def _call(self, model: str, args: dict[str, Any]) -> dict[str, Any]:
        import fal_client

        try:
            return fal_client.subscribe(model, arguments=args)
        except Exception as e:
            raise ProviderError(self.name, str(e)) from e

    def _process_result(self, result: dict[str, Any], model: str) -> ImageGenResult:
        image_id = uuid.uuid4().hex[:8]
        image_urls: list[str] = []
        for idx, image in enumerate(result.get("images", [])):
            url = image.get("url")
            if not url:
                continue
            data = fetch_url_sync(url)
            fname = f"fal_{image_id}_{idx}.png"
            image_urls.append(save_image_bytes(data, fname))

        if not image_urls:
            raise ProviderError(self.name, "no images returned")

        return ImageGenResult(
            image_urls=image_urls,
            cost_usd=_COST_PER_IMAGE.get(model, 0.039) * len(image_urls),
            model_used=model,
            image_id=image_id,
            metadata={"prompt_used": result.get("prompt")},
        )

    async def generate(self, req: ImageGenRequest) -> ImageGenResult:
        self._ensure_key()
        # If references present, route to edit model
        if req.reference_images:
            return await self.edit(req)

        model = req.model if req.model.startswith("fal-ai/") else self.t2i_model
        args = {
            "prompt": req.prompt,
            "resolution": _resolution_to_fal(req.resolution),
            "aspect_ratio": req.aspect_ratio,
            "num_images": req.num_images,
            "sync_mode": True,
            "output_format": "png",
            "enable_web_search": False,
        }
        if req.seed is not None:
            args["seed"] = req.seed

        result = await asyncio.to_thread(self._call, model, args)
        return self._process_result(result, model)

    async def edit(self, req: ImageGenRequest) -> ImageGenResult:
        self._ensure_key()
        if not req.reference_images:
            raise ProviderError(self.name, "edit() requires at least one reference image")

        model = req.model if req.model.startswith("fal-ai/") else self.i2i_model
        refs_sorted = sorted(req.reference_images, key=lambda r: r.slot)
        args = {
            "prompt": req.prompt,
            "image_urls": [r.image_url for r in refs_sorted],
            "aspect_ratio": req.aspect_ratio,
            "num_images": req.num_images,
            "sync_mode": True,
            "output_format": "png",
        }
        if req.seed is not None:
            args["seed"] = req.seed

        result = await asyncio.to_thread(self._call, model, args)
        return self._process_result(result, model)

    def models(self) -> list[str]:
        return list(_COST_PER_IMAGE.keys())
