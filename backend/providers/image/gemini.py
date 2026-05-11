"""
Gemini image adapter — uses google-genai for `gemini-3-pro-image` (Nano Banana Pro)
and `gemini-2.5-flash-image` (Nano Banana). Supports text-to-image and
image-to-image (edit) with multi-image reference slots.
"""
from __future__ import annotations

import uuid

from backend.providers.base import (
    ImageGenRequest,
    ImageGenResult,
    ImageProvider,
    ProviderError,
)
from backend.providers.image._storage import fetch_url_or_data_uri, save_image_bytes

# Approximate Gemini image pricing (USD per image, as of model release).
_COST_PER_IMAGE = {
    "gemini-3-pro-image-preview": 0.039,   # Nano Banana Pro
    "nano-banana-pro-preview": 0.039,      # alias
    "gemini-3.1-flash-image-preview": 0.020,
    "gemini-2.5-flash-image": 0.020,       # Nano Banana
    "imagen-4.0-generate-001": 0.040,
    "imagen-4.0-fast-generate-001": 0.020,
    "imagen-4.0-ultra-generate-001": 0.060,
}


class GeminiImage(ImageProvider):
    name = "gemini"

    def __init__(self, *, api_key: str | None) -> None:
        self.api_key = api_key

    def _client(self):
        from google import genai

        if not self.api_key:
            raise ProviderError(self.name, "API key not configured")
        return genai.Client(api_key=self.api_key)

    async def _build_contents(self, req: ImageGenRequest) -> list:
        """Compose [text_prompt, ref_image_1, ref_image_2, ...] for multimodal input."""
        from google.genai import types as gtypes

        parts: list = [req.prompt]
        # Sort refs by slot order so @Image1 lands first
        refs = sorted(req.reference_images, key=lambda r: r.slot)
        for ref in refs:
            data = await fetch_url_or_data_uri(ref.image_url)
            mime = "image/png" if ref.image_url.lower().endswith(".png") else "image/jpeg"
            parts.append(gtypes.Part.from_bytes(data=data, mime_type=mime))
        return parts

    async def _generate_internal(self, req: ImageGenRequest) -> ImageGenResult:
        from google.genai import types as gtypes

        client = self._client()
        contents = await self._build_contents(req)

        config = gtypes.GenerateContentConfig(
            response_modalities=["IMAGE"],
            image_config=gtypes.ImageConfig(aspect_ratio=req.aspect_ratio),
            seed=req.seed,
        )

        try:
            resp = await client.aio.models.generate_content(
                model=req.model,
                contents=contents,
                config=config,
            )
        except Exception as e:
            raise ProviderError(self.name, str(e)) from e

        image_id = uuid.uuid4().hex[:8]
        image_urls: list[str] = []
        if resp.candidates:
            for idx, part in enumerate(resp.candidates[0].content.parts or []):
                inline = getattr(part, "inline_data", None)
                if inline and inline.data:
                    fname = f"gemini_{image_id}_{idx}.png"
                    image_urls.append(save_image_bytes(inline.data, fname))

        if not image_urls:
            # Surface why. Gemini emits no IMAGE part when prompt_feedback
            # blocks the request (real-person likeness, copyrighted IP,
            # safety filter) or when finish_reason is non-STOP. Without
            # this, the user sees a generic "no image returned" and has
            # no path to fix the prompt.
            reasons: list[str] = []
            try:
                pf = getattr(resp, "prompt_feedback", None)
                if pf:
                    br = getattr(pf, "block_reason", None)
                    if br:
                        reasons.append(f"prompt_blocked={br}")
                    br_msg = getattr(pf, "block_reason_message", None)
                    if br_msg:
                        reasons.append(str(br_msg))
                cands = resp.candidates or []
                if cands:
                    fr = getattr(cands[0], "finish_reason", None)
                    if fr:
                        reasons.append(f"finish_reason={fr}")
                    fr_msg = getattr(cands[0], "finish_message", None)
                    if fr_msg:
                        reasons.append(str(fr_msg))
            except Exception:
                pass
            detail = "; ".join(reasons) if reasons else "no image returned"
            raise ProviderError(self.name, detail)

        cost = _COST_PER_IMAGE.get(req.model, 0.039) * len(image_urls)
        return ImageGenResult(
            image_urls=image_urls,
            cost_usd=cost,
            model_used=req.model,
            image_id=image_id,
            metadata={
                "prompt": req.prompt,
                "aspect_ratio": req.aspect_ratio,
                "resolution": req.resolution,
                "seed": req.seed,
                "num_refs": len(req.reference_images),
            },
        )

    async def generate(self, req: ImageGenRequest) -> ImageGenResult:
        return await self._generate_internal(req)

    async def edit(self, req: ImageGenRequest) -> ImageGenResult:
        if not req.reference_images:
            raise ProviderError(self.name, "edit() requires at least one reference image")
        return await self._generate_internal(req)

    def models(self) -> list[str]:
        return list(_COST_PER_IMAGE.keys())
