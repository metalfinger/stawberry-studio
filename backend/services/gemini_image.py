"""
Image generation — backwards-compatible shim over backend/providers/.

This module preserves the legacy public API (`generate_image_text_to_image`,
`generate_image_image_to_image`, helpers) so existing callers in
`tools/element_generation.py`, `tools/generation.py`, `services/generation_queue.py`
and `tools/pre_production.py` keep working unchanged. Internally it delegates
to the new provider abstraction in `backend.providers`.

Provider routing:
- model starts with "fal-ai/" or FAL_KEY set with no Gemini key → Fal adapter
- model starts with "gemini-" or default → Gemini adapter (via google-genai)
"""
from __future__ import annotations

import asyncio
import uuid
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

from backend.config import get_settings
from backend.providers import (
    ImageGenRequest,
    ProviderError,
    ReferenceImage,
    get_registry,
)
from backend.providers.image._storage import save_image_bytes

load_dotenv()
_settings = get_settings()

# Re-exported for legacy callers that import these constants
GEMINI_API_KEY: Optional[str] = _settings.llm.gemini_api_key
FAL_API_KEY: Optional[str] = _settings.image.fal_api_key


# ============================================================================
# Internal helpers
# ============================================================================

def _provider_for(model: str) -> str:
    """Pick a provider given a logical or model name."""
    m = (model or "").lower()
    if m.startswith("fal-ai/"):
        return "fal"
    if m.startswith("gemini") or "nano_banana" in m or "nano-banana" in m:
        # Prefer Gemini if key set, else fall through to Fal
        return "gemini" if _settings.llm.gemini_api_key else "fal"
    # Default: prefer Fal (richer multi-ref edit), else Gemini
    if _settings.image.fal_api_key:
        return "fal"
    return "gemini"


def _normalize_model(model: str, provider_name: str) -> str:
    """Map legacy model aliases to provider-native model strings."""
    aliases = {
        "nano_banana_pro": "gemini-3-pro-image-preview",
        "nano_banana": "gemini-3.1-flash-image-preview",
        "nano-banana-pro-edit": "fal-ai/nano-banana-pro/edit",
        "nano-banana-pro": "gemini-3-pro-image-preview",
        "gemini-3-pro-image": "gemini-3-pro-image-preview",
        "gemini-2.5-flash-image": "gemini-3.1-flash-image-preview",
    }
    m = aliases.get(model, model)
    # If routing through Fal but model is a Gemini name, use Fal's equivalent
    if provider_name == "fal" and m.startswith("gemini-"):
        m = _settings.image.fal_text_to_image_model
    return m


def _refs_to_pydantic(reference_images: Optional[List[Dict[str, Any]]]) -> List[ReferenceImage]:
    if not reference_images:
        return []
    out: List[ReferenceImage] = []
    for r in reference_images:
        url = r.get("image_url") or r.get("url")
        if not url:
            continue
        out.append(
            ReferenceImage(
                image_url=url,
                slot=int(r.get("slot", len(out) + 1)),
                name=r.get("name"),
                asset_id=r.get("asset_id"),
            )
        )
    return out


def _run(coro):
    """Run a coroutine from sync code, transparently handling 'event loop
    already running' by trampolining into a worker thread.

    This shim is called from sync gen helpers that may be invoked from:
      - sync route handlers (FastAPI thread-pools them) → no running loop, asyncio.run is fine
      - async route handlers / tools called from running event loops → must trampoline
      - tools called from an ADK / Pydantic AI run inside a WebSocket handler → must trampoline
    """
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        # No running loop — safe to use asyncio.run directly.
        return asyncio.run(coro)

    # Already inside an event loop (e.g. async route handler).
    # Run the coroutine in a worker thread so its own asyncio.run is independent.
    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(asyncio.run, coro)
        return future.result()


def _ok(result, *, prompt: str, resolution: str, aspect_ratio: str, seed) -> Dict[str, Any]:
    """Convert ImageGenResult to legacy dict shape."""
    return {
        "success": True,
        "image_url": result.image_urls[0],
        "image_urls": result.image_urls,
        "image_id": result.image_id,
        "model_used": result.model_used,
        "cost_usd": result.cost_usd,
        "tokens_used": 0,
        "generation_params": {
            "prompt": prompt,
            "resolution": resolution,
            "aspect_ratio": aspect_ratio,
            "seed": seed,
            "model": result.model_used,
            **result.metadata,
        },
    }


def _err(e: Exception) -> Dict[str, Any]:
    return {
        "success": False,
        "error": str(e),
        "image_url": None,
        "image_urls": [],
        "cost_usd": 0.0,
    }


# ============================================================================
# Public API
# ============================================================================

def generate_image_text_to_image(
    prompt: str,
    model: str = "gemini-3-pro-image",
    resolution: str = "2048x2048",
    aspect_ratio: str = "1:1",
    num_images: int = 1,
    seed: Optional[int] = None,
    params: Optional[Dict[str, Any]] = None,
    reference_images: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Text-to-image (with optional multi-image references). Routes via the new provider abstraction."""
    try:
        provider_name = _provider_for(model)
        actual_model = _normalize_model(model, provider_name)
        registry = get_registry()
        provider = registry.get_image(provider_name)

        req = ImageGenRequest(
            prompt=prompt,
            model=actual_model,
            resolution=resolution,
            aspect_ratio=aspect_ratio,
            num_images=num_images,
            seed=seed,
            reference_images=_refs_to_pydantic(reference_images),
            extra=params or {},
        )

        # If references present and the provider supports edit, route via edit
        if req.reference_images:
            result = _run(provider.edit(req))
        else:
            result = _run(provider.generate(req))

        return _ok(result, prompt=prompt, resolution=resolution, aspect_ratio=aspect_ratio, seed=seed)
    except ProviderError as e:
        return _err(e)
    except Exception as e:
        return _err(e)


def generate_image_image_to_image(
    prompt: str,
    reference_image_url: Optional[str] = None,
    model: str = "nano-banana-pro-edit",
    strength: float = 0.7,
    aspect_ratio: str = "1:1",
    num_images: int = 1,
    seed: Optional[int] = None,
    params: Optional[Dict[str, Any]] = None,
    reference_images: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Image-to-image edit. Reference is required."""
    try:
        # Build the unified reference list
        refs: List[Dict[str, Any]] = list(reference_images or [])
        if reference_image_url and not any(r.get("image_url") == reference_image_url for r in refs):
            refs.insert(0, {"image_url": reference_image_url, "slot": 1, "name": "primary"})

        if not refs:
            return _err(ValueError("image_to_image: reference_image_url or reference_images required"))

        # Route to Fal if any of the legacy edit models requested, or fall to Gemini
        provider_name = "fal" if (FAL_API_KEY and "edit" in (model or "").lower()) else _provider_for(model)
        actual_model = _normalize_model(model, provider_name)
        # If model is Gemini's pro-image, edit is the same model
        registry = get_registry()
        provider = registry.get_image(provider_name)

        extra: Dict[str, Any] = dict(params or {})
        extra["strength"] = strength

        req = ImageGenRequest(
            prompt=prompt,
            model=actual_model,
            resolution="2048x2048",
            aspect_ratio=aspect_ratio,
            num_images=num_images,
            seed=seed,
            reference_images=_refs_to_pydantic(refs),
            extra=extra,
        )
        result = _run(provider.edit(req))
        return _ok(result, prompt=prompt, resolution="2048x2048", aspect_ratio=aspect_ratio, seed=seed)
    except ProviderError as e:
        return _err(e)
    except Exception as e:
        return _err(e)


# Legacy aliases (generate_image, generate_image_with_reference) removed
# with tools/pre_production.py — they were the only callers.


# ----------------------------------------------------------------------------
# Storage utilities (delegates to providers/image/_storage.py)
# ----------------------------------------------------------------------------

def save_generated_image(image_data: bytes, filename: Optional[str] = None) -> str:
    """Save raw bytes to /storage/generated/ and return a /storage/... URL."""
    return save_image_bytes(image_data, filename)


def download_image_to_local(image_url: str, filename: Optional[str] = None) -> str:
    """Download an image URL and save locally. Returns the local /storage/... URL."""
    from backend.providers.image._storage import fetch_url_sync

    if not filename:
        filename = f"{uuid.uuid4().hex}.png"
    data = fetch_url_sync(image_url)
    return save_image_bytes(data, filename)


# ----------------------------------------------------------------------------
# Prompt-engineering helpers — pure-functional, kept inline.
# ----------------------------------------------------------------------------

def enhance_prompt_for_consistency(
    base_prompt: str,
    element_type: str = "character",
    art_style: str = "photorealistic",
) -> str:
    """Append consistency instructions to a base prompt as natural language."""
    consistency_instructions = {
        "character": (
            f"Maintain exact facial features, bone structure, and proportions throughout. "
            f"Keep consistent hair color, style, texture, body type, and all clothing and accessories. "
            f"Render in {art_style} style with pure white background and soft studio lighting."
        ),
        "location": (
            f"Maintain consistent architectural details and spatial layout. Keep the same lighting, "
            f"time of day, materials, textures, and perspective throughout. Render in {art_style} style "
            f"with clear depth."
        ),
        "prop": (
            f"Maintain exact shape, size, and proportions. Keep consistent materials, textures, color, "
            f"and finish throughout. Render in {art_style} style with pure white background and product lighting."
        ),
    }
    enhancement = consistency_instructions.get(element_type, "")
    return f"{base_prompt}\n\n{enhancement}".strip() if enhancement else base_prompt


def get_variant_prompt_suffix(variant_type: str) -> str:
    """Variant-specific prompt instructions."""
    variant_instructions = {
        "side_left": "Perfect left profile view (90° from camera). Same character, same pose, white background.",
        "side_right": "Perfect right profile view (90° from camera). Same character, same pose, white background.",
        "3_4_left": "3/4 view from left side (45° angle). Same character, same pose, white background.",
        "3_4_right": "3/4 view from right side (45° angle). Same character, same pose, white background.",
        "back": "Back view facing away from camera. Same character, same pose, white background.",
        "face_detail": "Close-up portrait, head and shoulders only. Neutral expression, looking at camera.",
        "face_expression_happy": "Close-up face with happy/smiling expression.",
        "face_expression_sad": "Close-up face with sad expression.",
        "face_expression_angry": "Close-up face with angry expression.",
        "face_expression_surprised": "Close-up face with surprised expression.",
        "hands_detail": "Close-up of hands in neutral position.",
        "angle_north": "View from the north side of the location.",
        "angle_south": "View from the south side of the location.",
        "angle_east": "View from the east side of the location.",
        "angle_west": "View from the west side of the location.",
        "aerial": "Aerial top-down view of the location.",
        "detail": "Close-up detail shot of key features.",
    }
    return variant_instructions.get(variant_type, f"Alternative view: {variant_type}")
