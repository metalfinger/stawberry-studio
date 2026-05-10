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
  "wardrobe_lock": "<comma-separated wardrobe items the character wears by default>",
  "consistency_tokens": "<comma-separated 3-6 SHORT verbatim phrases the renderer should echo word-for-word every time, e.g. 'amber eyes', 'bone clasp', 'scar on chin'. Pick the MOST distinctive and re-quotable details. Use exact words from the prompt. Each token <= 6 words.>"
}
Each value is plain text, no JSON, no quotes inside, no markdown.
If the prompt is for a location or prop, return appearance + consistency_tokens (geometry / material lock phrases) and leave wardrobe_lock as "" and distinctive_features as "".
Keep each field under 240 chars. Be specific and concrete. Never invent details not in the prompt.
"""


def _safe_strip(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()[:240]


# Phrases the renderer hates seeing in cut prompts. They are sheet-only
# directives — when they leak into consistency_tokens they get re-quoted
# in cut renders and contradict the cut's own background/lighting.
_TOKEN_BLOCKLIST = [
    "background", "no shadow", "no cast shadow", "no labels", "no text",
    "no captions", "no ui", "soft even lighting", "studio lighting",
    "pure white", "neutral background", "white backdrop", "flat lit",
]


def _sanitize_consistency_tokens(raw: str, asset_name: str = "") -> str:
    """Post-process the LLM-returned consistency_tokens string. Drops:
      - tokens longer than 6 words (full prompt fragments)
      - tokens containing sheet-only directives (BACKGROUND, no shadow…)
      - tokens that ARE the asset's own name (already in the prompt)
      - duplicate tokens (case-insensitive)

    Returns a comma-separated string of clean, short, distinctive phrases.
    """
    if not raw:
        return ""
    asset_name_lower = (asset_name or "").strip().lower()
    out: list[str] = []
    seen: set[str] = set()
    for tok in raw.split(","):
        t = tok.strip().strip("'\"")
        if not t:
            continue
        t_low = t.lower()
        # Drop if too long (>6 words means it's a sentence fragment, not a token).
        if len(t.split()) > 6:
            continue
        # Drop if it's the asset's own name.
        if asset_name_lower and (t_low == asset_name_lower or t_low.startswith(asset_name_lower + " ")):
            continue
        # Drop if it contains a sheet-only directive.
        if any(bad in t_low for bad in _TOKEN_BLOCKLIST):
            continue
        # Dedupe.
        if t_low in seen:
            continue
        seen.add(t_low)
        out.append(t)
    return ", ".join(out)


_EMPTY_TRAITS = {
    "appearance": "",
    "distinctive_features": "",
    "wardrobe_lock": "",
    "consistency_tokens": "",
}


async def extract_identity_traits(
    prompt: str,
    *,
    asset_type: str = "character",
    asset_name: str = "",
) -> dict[str, str]:
    """Best-effort extraction. On any error returns empty fields so the
    caller can still persist the raw prompt and fall back to the DSL's
    suggested_prompt path. The consistency_tokens field is sanitized
    post-extraction so prompt fragments (PURE WHITE BACKGROUND, etc.)
    don't pollute it — see _sanitize_consistency_tokens for the rules."""
    prompt = (prompt or "").strip()
    if not prompt:
        return dict(_EMPTY_TRAITS)

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
        raw_tokens = _safe_strip(data.get("consistency_tokens"))
        clean_tokens = _sanitize_consistency_tokens(raw_tokens, asset_name=asset_name)
        return {
            "appearance": _safe_strip(data.get("appearance")),
            "distinctive_features": _safe_strip(data.get("distinctive_features")),
            "wardrobe_lock": _safe_strip(data.get("wardrobe_lock")),
            "consistency_tokens": clean_tokens,
        }
    except Exception as e:  # noqa: BLE001
        log.warning("identity_traits_extract_failed", error=str(e))
        return dict(_EMPTY_TRAITS)
