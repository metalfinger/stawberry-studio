"""
Continuity Bible — project-level singleton aggregating brief globals,
character profiles, location set bibles, and lighting state.

Compiled at every freeze. Auto-injectable as a system-prompt prefix into
every downstream agent run via `bible_prefix(project_id)`.

The bible is the single most leveraged primitive for visual consistency —
it ensures every prompt automatically knows the project's art style, every
character's distinctive features and wardrobe, and every location's master plate.
"""
from __future__ import annotations

import json
from typing import Any

import structlog

from backend import db
get_async_connection = db.get_async_connection
get_connection = db.get_connection

log = structlog.get_logger(__name__)


# ============================================================================
# Compilation
# ============================================================================

async def compile_continuity_bible(project_id: str) -> dict[str, Any]:
    """Build the full bible from current DB state and persist."""
    async with get_async_connection() as conn:
        # Brief globals
        async with conn.execute(
            "SELECT * FROM briefs WHERE project_id = ?", (project_id,)
        ) as cur:
            brief_row = await cur.fetchone()
        brief = dict(brief_row) if brief_row else {}
        # Phase L1: parse the compiled style bible (palette_hex + style_tokens
        # + lighting_rules) so the DSL's [STYLE] block expands to a verbatim,
        # cross-asset-locked phrase set on every prompt.
        try:
            palette_hex = json.loads(brief.get("palette_hex") or "[]")
            if not isinstance(palette_hex, list):
                palette_hex = []
        except Exception:
            palette_hex = []
        try:
            style_tokens = json.loads(brief.get("style_tokens") or "[]")
            if not isinstance(style_tokens, list):
                style_tokens = []
        except Exception:
            style_tokens = []

        brief_globals = {
            "art_style": brief.get("art_style", ""),
            "color_palette": brief.get("color_palette", ""),
            "lighting_style": brief.get("lighting_style", ""),
            "aspect_ratio": brief.get("aspect_ratio", "16:9"),
            "world_logic": brief.get("world_logic", ""),
            "era_setting": brief.get("era_setting", ""),
            "tone": brief.get("tone", ""),
            "negative_prompts": brief.get("negative_prompts", ""),
            "render_quality": brief.get("render_quality", ""),
            "character_design_notes": brief.get("character_design_notes", ""),
            "environment_design_notes": brief.get("environment_design_notes", ""),
            "palette_hex": palette_hex,
            "style_tokens": style_tokens,
            "lighting_rules": brief.get("lighting_rules", ""),
        }

        # Characters with master image lookup. We also pull suggested_prompt
        # so the DSL has TEXT grounding even when the structured columns
        # (appearance/distinctive_features/wardrobe_lock) are empty — which
        # is the common case after Atlas extraction (it only writes
        # suggested_prompt today).
        # Pull characters then resolve master_image_url from reference_pool's
        # identity row. element_masters is gone — reference_pool is the
        # single source of truth for asset master images.
        async with conn.execute(
            """
            SELECT a.id, a.name, a.description, a.appearance, a.consistency_tokens,
                   a.distinctive_features, a.wardrobe_lock, a.image_url,
                   a.suggested_prompt
            FROM assets a
            WHERE a.project_id = ? AND a.type = 'character' AND (a.master_id IS NULL OR a.master_id = '')
            """,
            (project_id,),
        ) as cur:
            char_rows = [dict(r) for r in await cur.fetchall()]

        for ch in char_rows:
            ch["master_image_url"] = ""
            async with conn.execute(
                "SELECT image_url FROM reference_pool WHERE asset_id = ? AND label = 'identity' "
                "AND COALESCE(is_active, 1) = 1 ORDER BY created_at DESC LIMIT 1",
                (ch["id"],),
            ) as cur:
                row = await cur.fetchone()
            if row and row["image_url"]:
                ch["master_image_url"] = row["image_url"]

        # Locations — same lookup. L4 includes sublocation + location_angle
        # so the prompt DSL can resolve them via [SETTING:id] just like a
        # regular location, and so the parent walker has every node it needs.
        async with conn.execute(
            """
            SELECT a.id, a.name, a.type, a.description, a.appearance, a.image_url,
                   a.suggested_prompt, a.parent_asset_id
            FROM assets a
            WHERE a.project_id = ?
              AND a.type IN ('location','sublocation','location_angle')
              AND (a.master_id IS NULL OR a.master_id = '')
            """,
            (project_id,),
        ) as cur:
            loc_rows = [dict(r) for r in await cur.fetchall()]
        for lo in loc_rows:
            lo["master_image_url"] = ""
            async with conn.execute(
                "SELECT image_url FROM reference_pool WHERE asset_id = ? AND label = 'identity' "
                "AND COALESCE(is_active, 1) = 1 ORDER BY created_at DESC LIMIT 1",
                (lo["id"],),
            ) as cur:
                row = await cur.fetchone()
            if row and row["image_url"]:
                lo["master_image_url"] = row["image_url"]

        # Lighting state per scene
        async with conn.execute(
            """
            SELECT id, scene_number, time_of_day, lighting, lighting_color, mood
            FROM scenes WHERE project_id = ? ORDER BY scene_number
            """,
            (project_id,),
        ) as cur:
            scenes = [dict(r) for r in await cur.fetchall()]
        lighting_state = {
            s["id"]: {
                "scene_number": s["scene_number"],
                "time_of_day": s["time_of_day"] or "",
                "lighting": s["lighting"] or "",
                "lighting_color": s["lighting_color"] or "",
                "mood": s["mood"] or "",
            }
            for s in scenes
        }

        # Persist (upsert)
        async with conn.execute(
            "SELECT version FROM continuity_bible WHERE project_id = ?", (project_id,)
        ) as cur:
            row = await cur.fetchone()
        version = (row["version"] + 1) if row else 1

        await conn.execute(
            """
            INSERT INTO continuity_bible
                (project_id, version, brief_globals_json, characters_json, locations_json, lighting_state_json, last_compiled_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(project_id) DO UPDATE SET
                version = excluded.version,
                brief_globals_json = excluded.brief_globals_json,
                characters_json = excluded.characters_json,
                locations_json = excluded.locations_json,
                lighting_state_json = excluded.lighting_state_json,
                last_compiled_at = CURRENT_TIMESTAMP
            """,
            (
                project_id,
                version,
                json.dumps(brief_globals),
                json.dumps(char_rows),
                json.dumps(loc_rows),
                json.dumps(lighting_state),
            ),
        )
        await conn.commit()

    log.info(
        "continuity_bible_compiled",
        project_id=project_id,
        version=version,
        characters=len(char_rows),
        locations=len(loc_rows),
        scenes=len(scenes),
    )
    # Expose the pinned style_anchor_url so agents/runtime callers reading
    # the bible see what's locked. The compile path doesn't WRITE this
    # column (style_anchor.py is the writer); we just surface it on read.
    style_anchor_url = ""
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT style_anchor_url FROM continuity_bible WHERE project_id = ?",
            (project_id,),
        ) as cur:
            r = await cur.fetchone()
        if r:
            style_anchor_url = (r["style_anchor_url"] or "").strip()

    return {
        "project_id": project_id,
        "version": version,
        "brief_globals": brief_globals,
        "characters": char_rows,
        "locations": loc_rows,
        "lighting_state": lighting_state,
        "style_anchor_url": style_anchor_url,
    }


# ============================================================================
# Read API
# ============================================================================

async def get_continuity_bible(project_id: str) -> dict[str, Any] | None:
    """Fetch the persisted bible. Returns None if never compiled."""
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT * FROM continuity_bible WHERE project_id = ?", (project_id,)
        ) as cur:
            row = await cur.fetchone()
    if row is None:
        return None
    out = dict(row)
    for key, target in [
        ("brief_globals_json", "brief_globals"),
        ("characters_json", "characters"),
        ("locations_json", "locations"),
        ("lighting_state_json", "lighting_state"),
    ]:
        try:
            out[target] = json.loads(out.get(key) or "{}" if key.endswith("_json") and "globals" in key else out.get(key) or "[]")
        except json.JSONDecodeError:
            out[target] = {} if "globals" in key or "lighting" in key else []
    return out


def get_continuity_bible_sync(project_id: str) -> dict[str, Any] | None:
    """Synchronous read for prompt-build paths still on the sync layer."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM continuity_bible WHERE project_id = ?", (project_id,))
    row = cursor.fetchone()
    conn.close()
    if row is None:
        return None
    out = dict(row)
    out["brief_globals"] = json.loads(out.get("brief_globals_json") or "{}")
    out["characters"] = json.loads(out.get("characters_json") or "[]")
    out["locations"] = json.loads(out.get("locations_json") or "[]")
    out["lighting_state"] = json.loads(out.get("lighting_state_json") or "{}")
    return out


# ============================================================================
# Prompt-prefix renderer — drop into any agent's system prompt.
# ============================================================================

def render_bible_prefix(bible: dict[str, Any]) -> str:
    """Compact, agent-friendly markdown rendering of the bible."""
    if not bible:
        return ""
    bg = bible.get("brief_globals") or {}
    chars: list[dict[str, Any]] = bible.get("characters") or []
    locs: list[dict[str, Any]] = bible.get("locations") or []

    lines: list[str] = ["# CONTINUITY BIBLE (auto-injected — never contradict this)"]

    # Brief globals
    glob_bits = []
    for k in ["art_style", "color_palette", "lighting_style", "aspect_ratio", "tone", "world_logic", "era_setting"]:
        v = (bg.get(k) or "").strip()
        if v:
            glob_bits.append(f"**{k}:** {v}")
    if glob_bits:
        lines.append("\n## Globals\n" + "\n".join(f"- {b}" for b in glob_bits))
    if (bg.get("negative_prompts") or "").strip():
        lines.append(f"\n**Always negative:** {bg['negative_prompts']}")

    # Characters
    if chars:
        lines.append("\n## Characters (preserve these EXACTLY across every panel)")
        for c in chars:
            line = f"- **{c['name']}** (`{c['id']}`)"
            extras = []
            if c.get("appearance"):
                extras.append(c["appearance"])
            if c.get("distinctive_features"):
                extras.append(f"distinctive: {c['distinctive_features']}")
            if c.get("consistency_tokens"):
                extras.append(f"tokens: {c['consistency_tokens']}")
            if c.get("wardrobe_lock"):
                extras.append(f"wardrobe-lock: {c['wardrobe_lock']}")
            mu = c.get("master_image_url") or c.get("image_url") or ""
            if mu:
                extras.append(f"master: {mu}")
            else:
                extras.append("⚠ NO MASTER IMAGE — generate before referencing")
            line += "  \n  " + " · ".join(extras) if extras else ""
            lines.append(line)

    # Locations
    if locs:
        lines.append("\n## Locations")
        for loc in locs:
            line = f"- **{loc['name']}** (`{loc['id']}`)"
            extras = []
            if loc.get("appearance"):
                extras.append(loc["appearance"])
            mu = loc.get("master_image_url") or loc.get("image_url") or ""
            if mu:
                extras.append(f"master: {mu}")
            else:
                extras.append("⚠ NO MASTER")
            line += "  \n  " + " · ".join(extras) if extras else ""
            lines.append(line)

    return "\n".join(lines) + "\n\n---\n"
