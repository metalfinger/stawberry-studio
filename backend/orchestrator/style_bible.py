"""Style-bible extraction (Phase L1).

After BRIEF is confirmed, we run a cheap one-shot LLM call that turns the
brief's prose `art_style` / `color_palette` / `lighting_style` into:

  - palette_hex: ~6 concrete hex codes the renderer can quote
  - style_tokens: 4-6 short shared phrases ("halftone Ben-Day dots, cyan/
    magenta offset 2px", "matte film grain", "ink-line contour 2px") that
    every Atlas + Pixel prompt appends verbatim — this is what binds the
    visual look across assets that are otherwise generated independently
  - lighting_rules: 2-3 sentences describing how light behaves in this
    world (key direction, color temp, contrast)

The whole thing persists into `briefs.palette_hex / style_tokens /
lighting_rules` (JSON / text). Quiet on failure — never blocks the BRIEF
handoff.
"""
from __future__ import annotations

import json
from typing import Any

import structlog

log = structlog.get_logger(__name__)

_SYSTEM = """You are a film-style supervisor.
Given a project's brief globals, produce a STRICT JSON object that downstream
prompt builders can quote verbatim. No prose, no markdown.

Schema:
{
  "palette_hex": ["#RRGGBB", ...],       // 4-6 entries, the project's locked palette
  "style_tokens": ["...", ...],           // 4-6 short phrases (each <= 90 chars)
                                          // describing concrete render look:
                                          // halftone density, line weight, chroma
                                          // offset, grain, finish, paper texture
  "lighting_rules": "<2-3 sentences>"     // how light behaves in this world:
                                          // key direction, color temperature,
                                          // contrast, fall-off, practicals
}

Rules:
- Anchor palette_hex to the brief's color_palette text. If the user gave hex
  codes, use them; otherwise infer 4-6 hex codes that match the description
  (don't invent wildly different colors).
- style_tokens MUST be concrete. "Spider-Verse art style" is not a token.
  "Halftone Ben-Day dots, cyan/magenta offset 2px" IS a token.
- lighting_rules paraphrases the brief's lighting_style into actionable
  cinematography direction. Keep it short.
- If a field cannot be inferred, return [] or "" for it. Never invent.
"""


import re

_HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _safe_list(value: Any, max_items: int = 6) -> list[str]:
    if not isinstance(value, list):
        return []
    out = []
    for v in value[:max_items]:
        s = str(v).strip()
        if s:
            out.append(s[:120])
    return out


def _safe_palette(value: Any, max_items: int = 8) -> list[str]:
    """Like _safe_list but enforces #RRGGBB. Drops anything that doesn't
    parse — corrupted hex codes from a flaky Gemini response should not
    propagate into prompt builders that quote them verbatim."""
    if not isinstance(value, list):
        return []
    out = []
    for v in value:
        s = str(v).strip()
        if s.startswith("#") and _HEX_RE.match(s):
            out.append(s.upper())
        if len(out) >= max_items:
            break
    return out


def _safe_text(value: Any, max_len: int = 600) -> str:
    if value is None:
        return ""
    return str(value).strip()[:max_len]


async def extract_style_bible(brief: dict[str, Any]) -> dict[str, Any]:
    """Best-effort extraction. Returns dict with palette_hex / style_tokens
    / lighting_rules. On any error the dict has sensible empty defaults so
    callers can persist without branching."""
    art_style = (brief.get("art_style") or "").strip()
    color_palette = (brief.get("color_palette") or "").strip()
    lighting_style = (brief.get("lighting_style") or "").strip()
    world_logic = (brief.get("world_logic") or "").strip()

    if not (art_style or color_palette or lighting_style):
        # Nothing to anchor against — don't waste a call.
        return {"palette_hex": [], "style_tokens": [], "lighting_rules": ""}

    try:
        from backend.config import get_settings
        from backend.orchestrator.runner import _make_pai_model
        from pydantic_ai import Agent

        s = get_settings()
        model_name = s.llm.role("qa") or s.llm.role("planner") or "gemini-2.5-flash"
        model = _make_pai_model(model_name)
        agent = Agent(model=model, system_prompt=_SYSTEM)

        user_msg = (
            f"art_style: {art_style or '(unspecified)'}\n"
            f"color_palette: {color_palette or '(unspecified)'}\n"
            f"lighting_style: {lighting_style or '(unspecified)'}\n"
            f"world_logic: {world_logic or '(unspecified)'}\n\n"
            "Return the JSON now."
        )
        result = await agent.run(user_msg)
        text = (getattr(result, "output", None) or "").strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else ""
            text = text.rsplit("```", 1)[0].strip()
        data = json.loads(text)
        return {
            "palette_hex": _safe_palette(data.get("palette_hex"), max_items=8),
            "style_tokens": _safe_list(data.get("style_tokens"), max_items=8),
            "lighting_rules": _safe_text(data.get("lighting_rules")),
        }
    except Exception as e:  # noqa: BLE001
        log.warning("style_bible_extract_failed", error=str(e))
        return {"palette_hex": [], "style_tokens": [], "lighting_rules": ""}


async def persist_style_bible(project_id: str, bible: dict[str, Any]) -> None:
    """Write palette_hex / style_tokens / lighting_rules onto the brief row.
    Idempotent — safe to re-run."""
    from backend.database.core import get_async_connection

    palette = json.dumps(bible.get("palette_hex") or [])
    tokens = json.dumps(bible.get("style_tokens") or [])
    rules = bible.get("lighting_rules") or ""

    async with get_async_connection() as conn:
        await conn.execute(
            """
            UPDATE briefs
               SET palette_hex = ?,
                   style_tokens = ?,
                   lighting_rules = ?
             WHERE project_id = ?
            """,
            (palette, tokens, rules, project_id),
        )
        await conn.commit()


async def compile_style_bible_for_project(project_id: str) -> dict[str, Any]:
    """Read the brief, extract, persist. Returns the bible dict."""
    from backend.database.core import get_async_connection

    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT * FROM briefs WHERE project_id = ?", (project_id,)
        ) as cur:
            row = await cur.fetchone()
    if not row:
        return {"palette_hex": [], "style_tokens": [], "lighting_rules": ""}
    brief = dict(row)
    bible = await extract_style_bible(brief)
    await persist_style_bible(project_id, bible)
    return bible


def get_style_bible_sync(project_id: str) -> dict[str, Any]:
    """Sync read for use inside Atlas prompt-builder helpers. Returns parsed
    palette_hex (list[str]) / style_tokens (list[str]) / lighting_rules (str)."""
    from backend.db import get_brief

    brief = get_brief(project_id) or {}
    raw_palette = brief.get("palette_hex") or "[]"
    raw_tokens = brief.get("style_tokens") or "[]"
    try:
        palette = json.loads(raw_palette) if isinstance(raw_palette, str) else list(raw_palette)
    except Exception:
        palette = []
    try:
        tokens = json.loads(raw_tokens) if isinstance(raw_tokens, str) else list(raw_tokens)
    except Exception:
        tokens = []
    return {
        "palette_hex": palette,
        "style_tokens": tokens,
        "lighting_rules": brief.get("lighting_rules") or "",
    }
