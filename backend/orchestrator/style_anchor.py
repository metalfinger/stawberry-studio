"""Style anchor — one pinned key-art image per project (Phase L2).

After the style bible is compiled, we mint exactly one image that visually
embodies it: palette, line, grain, finish, lighting. The URL is saved into
`continuity_bible.style_anchor_url` (column already exists) and then
attached as a reference image to EVERY downstream generation:

  - asset identity cards / pose references (`references._generate_one`)
  - cut renders (`tools/generation.py`, the cut composer's reference list)

A single image moves visual cohesion farther than any text prompt can.
Idempotent — calling `ensure_style_anchor` a second time returns the
existing URL without burning credits. Use `recompile_style_anchor` for
the explicit "regenerate" path (Phase L6 repair button).
"""
from __future__ import annotations

import json
from typing import Any

import structlog

log = structlog.get_logger(__name__)


def _build_anchor_prompt(brief: dict[str, Any]) -> str:
    """Compose the prompt for the project's style anchor.

    I3 (Test1 audit): the old prompt asked for "single key-art frame" /
    "wide cinematic frame, one striking subject" — and the model
    interpreted that as a story shot (in Test1: a moon set with an
    astronaut planting a flag). The anchor was then attached as ref slot 1
    on every downstream gen, dragging the moon-set composition into
    locations and cuts.

    The fix: ask for an ABSTRACT STYLE SWATCH — a designer's reference
    sheet, not a story shot. Color palette stripe + halftone gradient +
    ink-line texture sample + paper grain. No subjects, no setting, no
    narrative. The model sees the swatch and re-uses its line/grain/
    palette without copying any composition.
    """
    art_style = (brief.get("art_style") or "").strip()
    color_palette = (brief.get("color_palette") or "").strip()
    lighting_rules = (brief.get("lighting_rules") or "").strip()

    try:
        palette_hex = json.loads(brief.get("palette_hex") or "[]")
    except Exception:
        palette_hex = []
    try:
        style_tokens = json.loads(brief.get("style_tokens") or "[]")
    except Exception:
        style_tokens = []

    palette_str = ", ".join(palette_hex) if palette_hex else color_palette
    tokens_str = " | ".join(style_tokens) if style_tokens else ""

    parts: list[str] = [
        "ABSTRACT STYLE SWATCH SHEET — not a scene, not a story. A "
        "designer's reference card showing the visual language of this "
        "project. Layout: a horizontal palette strip across the bottom "
        "(swatches of the locked colors), a halftone gradient panel in "
        "the middle (density and dot pattern), an ink-line texture "
        "sample on top showing line weight + chromatic edge offset.",
    ]
    parts.append(
        f"## Style language\n"
        f"Art style: {art_style or '(unspecified)'}\n"
        + (f"Locked palette (hex, render swatches of EACH): {palette_str}\n" if palette_str else "")
        + (f"Style tokens (render examples of each technique): {tokens_str}\n" if tokens_str else "")
        + (f"Lighting rules (sample shadow + edge): {lighting_rules}\n" if lighting_rules else "")
    )
    parts.append(
        "## Hard constraints\n"
        "- ZERO subjects (no characters, no faces, no objects from a story).\n"
        "- ZERO settings (no rooms, no landscapes, no skies, no environments).\n"
        "- ZERO narrative composition (no foreground/background, no perspective).\n"
        "- This is a flat designer's swatch sheet on a paper-textured background.\n"
        "- The swatch sheet should look like something a colorist would tape "
        "  to the wall as a reference, NOT like a movie still."
    )
    parts.append(
        "## Negatives\nno text, no labels, no UI, no captions, no watermarks, "
        "no signatures, no recognizable celebrity faces, no characters, no "
        "story moments, no narrative scenes, no people, no buildings, no "
        "vehicles, no creatures."
    )
    return "\n\n".join(parts)


async def _persist_anchor_url(project_id: str, url: str) -> None:
    """Pin the anchor in both storage locations so every render path sees it.

    Two storage locations exist for historical reasons:
      - continuity_bible.style_anchor_url   — read by L2-aware paths
      - reference_pool row with is_style_anchor=1, scope='project'
        — read by cut_planner / cut_executor (the modern Pixel path)

    The L2 commit only wrote to the first one, which meant the modern
    cut-render path never saw the anchor. This unifies: write both, every
    time. set_style_anchor() handles deactivating any prior is_style_anchor
    row so we don't accumulate stale anchors."""
    from backend import db
    get_async_connection = db.get_async_connection
    from backend.orchestrator import references as refs

    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT project_id FROM continuity_bible WHERE project_id = ?",
            (project_id,),
        ) as cur:
            row = await cur.fetchone()
        if row:
            await conn.execute(
                "UPDATE continuity_bible SET style_anchor_url = ?, "
                "last_compiled_at = CURRENT_TIMESTAMP WHERE project_id = ?",
                (url, project_id),
            )
        else:
            await conn.execute(
                "INSERT INTO continuity_bible (project_id, style_anchor_url) "
                "VALUES (?, ?)",
                (project_id, url),
            )
        await conn.commit()

    # Mirror to reference_pool so cut_planner/cut_executor see it too.
    if url:
        try:
            await refs.set_style_anchor(project_id, url)
        except Exception as e:  # noqa: BLE001
            log.warning("set_style_anchor_mirror_failed", project_id=project_id, error=str(e))


async def get_style_anchor_url(project_id: str) -> str:
    """Read the pinned anchor URL. Empty string when not yet generated."""
    from backend import db
    get_async_connection = db.get_async_connection

    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT style_anchor_url FROM continuity_bible WHERE project_id = ?",
            (project_id,),
        ) as cur:
            row = await cur.fetchone()
    if not row:
        return ""
    return (row["style_anchor_url"] or "").strip()


async def ensure_style_anchor(project_id: str) -> str:
    """If a style anchor exists, return it. Otherwise generate one from
    the current brief + style bible and persist. Returns the URL."""
    existing = await get_style_anchor_url(project_id)
    if existing:
        return existing

    from backend import db
    get_async_connection = db.get_async_connection
    from backend.providers import ImageGenRequest, get_registry

    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT * FROM briefs WHERE project_id = ?", (project_id,)
        ) as cur:
            row = await cur.fetchone()
    if not row:
        return ""
    brief = dict(row)
    if not (brief.get("art_style") or brief.get("color_palette")):
        return ""  # Nothing to anchor against.

    prompt = _build_anchor_prompt(brief)
    reg = get_registry()
    img_provider, model = reg.image_for_role("pro")
    req = ImageGenRequest(
        prompt=prompt,
        model=model,
        aspect_ratio="16:9",
        resolution="2048x2048",
        num_images=1,
        reference_images=[],
    )
    try:
        result = await img_provider.generate(req)
    except Exception as e:  # noqa: BLE001
        log.warning("style_anchor_generation_failed", project_id=project_id, error=str(e))
        return ""
    url = result.image_urls[0] if result.image_urls else ""
    if url:
        await _persist_anchor_url(project_id, url)
        log.info("style_anchor_minted", project_id=project_id, url=url, cost_usd=result.cost_usd)
    return url


async def recompile_style_anchor(project_id: str) -> str:
    """Force-replace the anchor (Phase L6 repair path)."""
    await _persist_anchor_url(project_id, "")
    return await ensure_style_anchor(project_id)
