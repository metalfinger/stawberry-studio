"""Identity-trait extraction.

Atlas writes one big `suggested_prompt` per asset. The DSL prefers
structured columns (`appearance`, `distinctive_features`, `wardrobe_lock`)
because they let the bible deduplicate and the cut prompt stay tight.

This module bridges the two: given a raw asset prompt + asset type, we
ask a cheap LLM (Gemini Flash) to extract canonical trait fields with
strict JSON output. Quiet on failure — empty strings if the call errors,
the DSL still has `suggested_prompt` as fallback.
"""
from __future__ import annotations

import json
from typing import Any

import structlog

log = structlog.get_logger(__name__)

_SYSTEM = """You distill a long visual prompt into structured identity locks.
Return STRICT JSON, no prose. Schema:
{
  "appearance": "<one short sentence describing the body / face / age / style>",
  "distinctive_features": "<comma-separated identity locks that MUST persist across every generation: glasses, scars, hair color/length, eye color, build>",
  "wardrobe_lock": "<comma-separated wardrobe items the character wears by default>"
}
Each value is plain text, no JSON, no quotes inside, no markdown.
If the prompt is for a location or prop, return appearance only and leave the others as "".
Keep each field under 240 chars. Be specific and concrete. Never invent details not in the prompt.
"""


def _safe_strip(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()[:240]


async def extract_identity_traits(prompt: str, *, asset_type: str = "character") -> dict[str, str]:
    """Best-effort extraction. On any error returns empty fields so the
    caller can still persist the raw prompt and fall back to the DSL's
    suggested_prompt path."""
    prompt = (prompt or "").strip()
    if not prompt:
        return {"appearance": "", "distinctive_features": "", "wardrobe_lock": ""}

    try:
        from backend.config import get_settings
        from backend.orchestrator.runner import _make_pai_model
        from pydantic_ai import Agent

        s = get_settings()
        # Cheapest tier — extraction is mechanical.
        model_name = s.llm.role("qa") or s.llm.role("planner") or "gemini-2.5-flash"
        model = _make_pai_model(model_name)
        agent = Agent(model=model, system_prompt=_SYSTEM)
        result = await agent.run(
            f"Asset type: {asset_type}\n\nPrompt:\n{prompt}\n\nReturn the JSON now."
        )
        text = (getattr(result, "output", None) or "").strip()
        # Strip markdown code fences if the model added them.
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else ""
            text = text.rsplit("```", 1)[0].strip()
        data = json.loads(text)
        return {
            "appearance": _safe_strip(data.get("appearance")),
            "distinctive_features": _safe_strip(data.get("distinctive_features")),
            "wardrobe_lock": _safe_strip(data.get("wardrobe_lock")),
        }
    except Exception as e:  # noqa: BLE001
        log.warning("identity_traits_extract_failed", error=str(e))
        return {"appearance": "", "distinctive_features": "", "wardrobe_lock": ""}
