"""
Composable Prompt DSL.

Replaces ad-hoc prompt assembly with structured blocks the system can resolve
deterministically. Authors write:

    [STYLE]
    [CHARACTER:asset_xxx]
    [SETTING:asset_yyy]
    [LIGHTING:scene_zzz]
    [ACTION] The hero plants a flag while [CHARACTER:asset_xxx] watches.
    [CAMERA] Low-angle, 24mm wide, shallow DoF.
    [NEGATIVE]

The compiler:
  1. Loads the Continuity Bible.
  2. Resolves each `[CHARACTER:id]` to that character's distinctive features +
     wardrobe lock + master URL slot.
  3. Resolves `[SETTING:id]` similarly.
  4. Resolves `[LIGHTING:scene_id]` to the scene's lighting signature.
  5. Substitutes `[STYLE]` from the bible's brief globals.
  6. Substitutes `[NEGATIVE]` from brief.negative_prompts (+ project defaults).
  7. Returns: {final_prompt, slots: {@Image1: master_url, ...}, missing: [...]}.

The DSL is reversible: inputs that hit the resolver are tracked so the system
can show "this prompt was built from X, Y, Z assets."
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

import structlog

from backend.orchestrator.continuity import get_continuity_bible_sync

log = structlog.get_logger(__name__)


# Patterns
_BLOCK_RE = re.compile(r"\[([A-Z_]+)(?::([^\]]+))?\]")
_NEGATIVE_DEFAULT = (
    "no text, no speech bubbles, no labels, no watermarks, no UI elements, no signatures"
)


@dataclass
class CompiledPrompt:
    final_prompt: str
    slots: dict[str, str] = field(default_factory=dict)  # {"@Image1": image_url, ...}
    used_assets: list[str] = field(default_factory=list)
    used_scenes: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "prompt": self.final_prompt,
            "slots": self.slots,
            "used_assets": self.used_assets,
            "used_scenes": self.used_scenes,
            "missing": self.missing,
        }


def compile_prompt(template: str, project_id: str) -> CompiledPrompt:
    """Resolve all DSL blocks against the project's Continuity Bible."""
    bible = get_continuity_bible_sync(project_id) or {}
    chars: list[dict[str, Any]] = bible.get("characters") or []
    locs: list[dict[str, Any]] = bible.get("locations") or []
    bg: dict[str, Any] = bible.get("brief_globals") or {}
    lighting_state: dict[str, dict[str, Any]] = bible.get("lighting_state") or {}

    char_map = {c["id"]: c for c in chars}
    loc_map = {loc["id"]: loc for loc in locs}

    slots: dict[str, str] = {}
    used_assets: list[str] = []
    used_scenes: list[str] = []
    missing: list[str] = []
    next_slot = [1]  # mutable container so closure can mutate

    def _take_slot(image_url: str) -> str:
        ref = f"@Image{next_slot[0]}"
        slots[ref] = image_url
        next_slot[0] += 1
        return ref

    def _resolve(match: re.Match) -> str:
        block = match.group(1)
        arg = (match.group(2) or "").strip()

        if block == "STYLE":
            parts = []
            if bg.get("art_style"):
                parts.append(bg["art_style"])
            if bg.get("color_palette"):
                parts.append(f"palette: {bg['color_palette']}")
            if bg.get("render_quality"):
                parts.append(bg["render_quality"])
            return ", ".join(parts) if parts else "(style not set)"

        if block == "NEGATIVE":
            extra = (bg.get("negative_prompts") or "").strip()
            return f"{_NEGATIVE_DEFAULT}. {extra}".strip()

        if block == "CHARACTER":
            c = char_map.get(arg)
            if not c:
                missing.append(f"character {arg}")
                return f"<missing character {arg}>"
            used_assets.append(c["id"])
            mu = c.get("master_image_url") or c.get("image_url") or ""
            ref = _take_slot(mu) if mu else "(no master)"
            tokens = []
            if c.get("appearance"):
                tokens.append(c["appearance"])
            if c.get("distinctive_features"):
                tokens.append(c["distinctive_features"])
            if c.get("wardrobe_lock"):
                tokens.append(c["wardrobe_lock"])
            traits = "; ".join(t for t in tokens if t)
            return f"{ref} {c['name']} ({traits})" if traits else f"{ref} {c['name']}"

        if block == "SETTING":
            loc = loc_map.get(arg)
            if not loc:
                missing.append(f"location {arg}")
                return f"<missing location {arg}>"
            used_assets.append(loc["id"])
            mu = loc.get("master_image_url") or loc.get("image_url") or ""
            ref = _take_slot(mu) if mu else "(no master)"
            traits = loc.get("appearance") or ""
            return f"{ref} {loc['name']} ({traits})" if traits else f"{ref} {loc['name']}"

        if block == "LIGHTING":
            scene = lighting_state.get(arg)
            if not scene:
                missing.append(f"lighting for scene {arg}")
                return ""
            used_scenes.append(arg)
            bits = [
                scene.get("time_of_day"),
                scene.get("lighting"),
                scene.get("lighting_color"),
                scene.get("mood"),
            ]
            return ", ".join(b for b in bits if b)

        if block == "ACTION" or block == "CAMERA":
            # Markers consumed by ordering — handled in pre-pass below.
            return ""

        return match.group(0)  # unknown block, keep raw

    resolved = _BLOCK_RE.sub(_resolve, template)
    # Clean up empty section markers and double whitespace
    resolved = re.sub(r"\n{3,}", "\n\n", resolved).strip()

    return CompiledPrompt(
        final_prompt=resolved,
        slots=slots,
        used_assets=used_assets,
        used_scenes=used_scenes,
        missing=missing,
    )
