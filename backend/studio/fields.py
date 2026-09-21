"""Canonical creative vocabulary: typed validation and advisory warnings for named fields.

The field namespace stays open — any dotted lower_case name is still accepted. The names
below additionally get type checks at write time and readiness *warnings* when absent.
Warnings never block generation and are never part of the frozen generation context.
"""

from __future__ import annotations

import re

from backend.studio.store import StudioError

HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
MAX_TEXT = 2000

# Sheet-only directives. When they leak into consistency tokens they get re-quoted in every
# cut prompt and contradict the cut's own background and lighting.
TOKEN_BLOCKLIST = (
    "background",
    "no shadow",
    "no cast shadow",
    "no labels",
    "no text",
    "no captions",
    "no ui",
    "soft even lighting",
    "studio lighting",
    "pure white",
    "neutral background",
    "white backdrop",
    "flat lit",
)
TOKEN_MAX_WORDS = 6

ASSETS = {"character", "location", "prop"}

POLICY_DEFAULTS = {
    "policy.reference_depth_cap": 2,
    "policy.require_evaluation_for_reference": False,
    "policy.autonomous": False,
    "policy.min_take_score": 0.6,
    "policy.max_takes_per_cut": 4,
    "policy.credit_ceiling_per_take": 0.0,
    "policy.allow_unknown_cost": False,
    "policy.require_stranger": False,
}


def policy(values: dict) -> dict:
    """Resolved project policy with defaults; keys are the short names."""
    return {key.split(".", 1)[1]: values.get(key, default) for key, default in POLICY_DEFAULTS.items()}

# field -> {"type", "kinds", limits...}
# kinds lists where the field natively belongs; validation applies wherever the name resolves.
FIELD_SPECS: dict[str, dict] = {
    # project: the style bible, world rules, policy
    "bible.palette_hex": {"type": "hex_list", "kinds": {"project"}, "max_items": 8},
    "bible.tokens": {"type": "text_list", "kinds": {"project"}, "max_items": 8, "max_len": 120},
    "bible.lighting_rules": {"type": "text", "kinds": {"project"}, "max_len": 600},
    "world_logic": {"type": "text", "kinds": {"project"}},
    "negative_prompts": {"type": "text", "kinds": {"project"}},
    "policy.reference_depth_cap": {"type": "int", "kinds": {"project"}, "min": 0},
    "policy.require_evaluation_for_reference": {"type": "bool", "kinds": {"project"}},
    # autonomous mode: every evaluation gate becomes an issue, approvals happen within the ceiling
    "policy.autonomous": {"type": "bool", "kinds": {"project"}},
    "policy.min_take_score": {"type": "float", "kinds": {"project"}, "min": 0.0, "max": 1.0},
    "policy.max_takes_per_cut": {"type": "int", "kinds": {"project"}, "min": 1},
    "policy.credit_ceiling_per_take": {"type": "float", "kinds": {"project"}, "min": 0.0},
    "policy.allow_unknown_cost": {"type": "bool", "kinds": {"project"}},
    "policy.require_stranger": {"type": "bool", "kinds": {"project"}},
    # scene: atmosphere and ambient sound
    "lighting.source": {"type": "text", "kinds": {"scene"}},
    "atmosphere": {"type": "text", "kinds": {"scene"}},
    "mood": {"type": "text", "kinds": {"scene"}},
    "set_decoration": {"type": "text", "kinds": {"scene"}},
    "sound.ambient": {"type": "text", "kinds": {"scene"}},
    # shot: the lens
    "camera.height": {"type": "text", "kinds": {"shot", "cut"}},
    "camera.lens": {"type": "text", "kinds": {"shot", "cut"}},
    "camera.depth_of_field": {"type": "text", "kinds": {"shot", "cut"}},
    "camera.foreground": {"type": "text", "kinds": {"shot", "cut"}},
    "camera.background": {"type": "text", "kinds": {"shot", "cut"}},
    # cut: the beat, the performance, the sound, the edit
    "beat.purpose": {"type": "text", "kinds": {"cut"}},
    "beat.emotional_intent": {"type": "text", "kinds": {"cut"}},
    "beat.visual_point": {"type": "text", "kinds": {"cut"}},
    "beat.theme": {"type": "text", "kinds": {"cut"}},
    "beat.type": {"type": "text", "kinds": {"cut"}, "max_len": 60},
    "performance.expression": {"type": "text", "kinds": {"cut"}},
    "performance.body_language": {"type": "text", "kinds": {"cut"}},
    "performance.gaze": {"type": "text", "kinds": {"cut"}},
    "performance.gesture": {"type": "text", "kinds": {"cut"}},
    "performance.state": {"type": "text", "kinds": {"cut"}},
    "sound.sfx": {"type": "text", "kinds": {"cut"}},
    "sound.music": {"type": "text", "kinds": {"cut"}},
    "transition": {"type": "text", "kinds": {"cut"}, "max_len": 120},
    # the 180-degree rule, declared: which way the subject travels across the frame
    "screen_direction": {"type": "enum", "kinds": {"scene", "shot", "cut"},
                         "options": ("left", "right", "toward", "away", "neutral")},
    # this cut's framing must match another cut's exactly (a match cut); a designed duplicate
    "match_frame": {"type": "text", "kinds": {"cut"}, "max_len": 64},
    "chain_from_prev": {"type": "enum", "kinds": {"cut"}, "options": ("yes", "no")},
    # assets: identity locks, and which continuity attributes are locked (capped when checked)
    "consistency_tokens": {"type": "token_list", "kinds": ASSETS, "max_items": 6},
    "locks": {"type": "attr_list", "kinds": ASSETS, "max_items": 8},
    # "text": the asset's identity travels as quoted locks, not an image — for when a provider refuses the image
    "reference_mode": {"type": "enum", "kinds": ASSETS, "options": ("image", "text")},
    "inspired_by": {"type": "text", "kinds": ASSETS, "max_len": 240},
}


def _fail(field, message):
    raise StudioError("field_type", f"{field}: {message}")


def validate_field(field: str, value, node: dict | None = None) -> None:
    """Type-check a resolved value for a canonical field. Unknown fields are not checked."""
    spec = FIELD_SPECS.get(field)
    if spec is None:
        return
    kind = spec["type"]
    if kind == "text":
        if not isinstance(value, str):
            _fail(field, "expected text")
        if len(value) > spec.get("max_len", MAX_TEXT):
            _fail(field, f"text longer than {spec.get('max_len', MAX_TEXT)} characters")
    elif kind == "int":
        if type(value) is not int or value < spec.get("min", 0):
            _fail(field, f"expected an integer >= {spec.get('min', 0)}")
    elif kind == "float":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            _fail(field, "expected a number")
        if value < spec.get("min", float("-inf")) or value > spec.get("max", float("inf")):
            _fail(field, f"expected a number between {spec.get('min', '-inf')} and {spec.get('max', 'inf')}")
    elif kind == "bool":
        if type(value) is not bool:
            _fail(field, "expected true or false")
    elif kind == "attr_list":
        if not isinstance(value, list) or any(not isinstance(v, str) or not re.fullmatch(r"[a-z][a-z0-9_]*", v) for v in value):
            _fail(field, "expected a list of lower_case attribute names")
        if len(value) > spec["max_items"] or len(set(value)) != len(value):
            _fail(field, f"at most {spec['max_items']} distinct attribute names")
    elif kind == "enum":
        if value not in spec["options"]:
            _fail(field, f"expected one of {', '.join(spec['options'])}")
    elif kind in {"text_list", "hex_list", "token_list"}:
        if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
            _fail(field, "expected a list of strings")
        if len(value) > spec["max_items"]:
            _fail(field, f"at most {spec['max_items']} items")
        if kind == "hex_list" and any(not HEX.fullmatch(item) for item in value):
            _fail(field, "every item must be a #RRGGBB colour")
        if kind == "text_list" and any(not item.strip() or len(item) > spec["max_len"] for item in value):
            _fail(field, f"items must be non-empty and at most {spec['max_len']} characters")
        if kind == "token_list":
            _validate_tokens(field, value, node)


def _validate_tokens(field, tokens, node):
    name = (node or {}).get("name", "").strip().lower() if (node or {}).get("kind") in ASSETS else ""
    seen = set()
    for token in tokens:
        text = token.strip()
        low = text.lower()
        if not text:
            _fail(field, "tokens must be non-empty")
        if len(text.split()) > TOKEN_MAX_WORDS:
            _fail(field, f"'{text}' is longer than {TOKEN_MAX_WORDS} words; tokens are phrases, not sentences")
        if name and (low == name or low.startswith(name + " ")):
            _fail(field, f"'{text}' repeats the asset name")
        if any(bad in low for bad in TOKEN_BLOCKLIST):
            _fail(field, f"'{text}' is a sheet-only directive, not an identity lock")
        if low in seen:
            _fail(field, f"'{text}' is duplicated")
        seen.add(low)


def _present(values, cleared, field):
    if field in cleared:
        return True  # an explicit "none" is a declaration, not an omission
    value = values.get(field)
    return isinstance(value, str) and bool(value.strip()) or isinstance(value, list) and bool(value)


def warnings_for(node: dict, values: dict, cleared) -> list[dict]:
    """Advisory gaps for a node's resolved values. Never affects readiness."""
    out = []
    cleared = set(cleared)

    def warn(code, message, field=None):
        item = {"code": code, "node_id": node["id"], "message": message}
        if field:
            item["field"] = field
        out.append(item)

    if node["kind"] == "project":
        if not _present(values, cleared, "bible.tokens") and not _present(values, cleared, "bible.palette_hex"):
            warn("bible_missing", "Compile the style bible: bible.tokens and bible.palette_hex", "bible.tokens")
    if node["kind"] == "cut":
        if not _present(values, cleared, "beat.purpose"):
            warn("beat_missing", "State what this beat accomplishes in beat.purpose", "beat.purpose")
        if values.get("visible_cast") and not _present(values, cleared, "performance.expression"):
            warn(
                "performance_missing",
                "Describe the visible cast's performance: performance.expression at minimum",
                "performance.expression",
            )
        if not any(_present(values, cleared, f) for f in ("sound.sfx", "sound.music", "sound.ambient")):
            warn("sound_missing", "Declare what is heard: sound.sfx, sound.music, or an inherited sound.ambient", "sound.sfx")
    return out
