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


# Written into a field to mean "there isn't one", these reach the prompt and the rubric as if
# they were content: a frame asked to show "none available", a question asking whether the
# subject's expression is "none available". The engine already has a word for an absent thing,
# and it is `clear`, which every reader — inheritance, readiness, facts — understands.
PLACEHOLDERS = {"none", "none available", "n/a", "na", "nil", "null", "tbd", "tba", "unknown",
                "not applicable", "not specified", "-", "--", "???"}


def validate_field(field: str, value, node: dict | None = None) -> None:
    """Type-check a resolved value for a canonical field. Unknown fields are not checked."""
    if isinstance(value, str) and value.strip().lower() in PLACEHOLDERS:
        _fail(field, f"'{value.strip()}' is a placeholder, not a declaration — clear the field instead, "
                     "which says the same thing in a way the prompt and the rubric both understand")
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
        # A face is not the only performance. A figure seen from behind, at distance, in
        # silhouette, masked — or, in one real dream, with a block of ice where its head is —
        # still acts, through posture and gaze. Any performance field satisfies this.
        if values.get("visible_cast") and not any(
            _present(values, cleared, f"performance.{name}")
            for name in ("expression", "body_language", "gaze", "gesture", "state")
        ):
            warn(
                "performance_missing",
                "Say how the visible cast acts — expression, body language, gaze, gesture or state; "
                "a figure with no readable face still has posture",
                "performance.body_language",
            )
        if not any(_present(values, cleared, f) for f in ("sound.sfx", "sound.music", "sound.ambient")):
            warn("sound_missing", "Declare what is heard: sound.sfx, sound.music, or an inherited sound.ambient", "sound.sfx")
    for clash in palette_conflicts(values):
        warn(
            "palette_conflict",
            f"{clash['field']} says '{clash['word']}', and no colour in bible.palette_hex is near it. "
            f"Either say in the prompt that the {clash['word']} is depicted in the declared inks rather than "
            f"printed in its own colour, or widen the palette",
            clash["field"],
        )
    return out


# A restricted palette and the story's own material vocabulary can contradict each other
# silently. "brass and riveted steel" is a true description of an 1898 autoclave, and in a
# four-ink woodblock it is also an instruction to print a colour the bible forbids — which is
# exactly what happened the first time a location sheet was drawn from that field. The word
# is usually right and the palette is usually right; what is missing is the sentence saying
# the material is *depicted*, not *coloured*. So: warn, name both sides, and let the host
# decide which one to rewrite. Approximate RGB is enough — the check only has to notice that
# nothing in the declared palette is anywhere near the named colour.
COLOUR_WORDS = {
    "black": (0, 0, 0), "white": (255, 255, 255), "grey": (128, 128, 128), "gray": (128, 128, 128),
    "silver": (192, 192, 192), "red": (200, 30, 30), "crimson": (170, 20, 40), "scarlet": (220, 40, 20),
    "maroon": (110, 20, 30), "pink": (240, 150, 170), "orange": (240, 130, 30), "amber": (230, 160, 40),
    "ochre": (200, 150, 60), "yellow": (240, 210, 50), "gold": (200, 170, 60), "golden": (200, 170, 60),
    "brass": (181, 166, 66), "bronze": (150, 110, 60), "copper": (184, 110, 70), "rust": (160, 80, 40),
    "green": (50, 140, 70), "emerald": (30, 150, 90), "olive": (120, 120, 50), "teal": (40, 130, 130),
    "cyan": (60, 200, 220), "blue": (50, 90, 190), "navy": (25, 35, 90), "indigo": (70, 60, 150),
    "violet": (140, 90, 200), "purple": (120, 60, 160), "magenta": (220, 60, 170), "lavender": (200, 180, 230),
    "brown": (120, 80, 50), "tan": (190, 160, 120), "beige": (225, 210, 180), "cream": (245, 235, 210),
    "ivory": (250, 245, 230), "sepia": (110, 80, 50), "charcoal": (45, 45, 45), "slate": (110, 120, 130),
}
# validated against this project: an in-palette word lands under 40, "brass" lands at 118
PALETTE_DISTANCE = 90
# fields that describe a thing rather than the printing language; the bible's own fields are
# excluded because a palette is allowed to name its own colours
COLOUR_BEARING = (
    "materials", "identity", "appearance", "wardrobe", "distinctive_features", "set_decoration",
    "atmosphere", "mood", "action", "props", "subject",
)


def _rgb(text):
    text = text.lstrip("#")
    return tuple(int(text[i : i + 2], 16) for i in (0, 2, 4))


def palette_conflicts(values: dict) -> list[dict]:
    palette = values.get("bible.palette_hex") or []
    if not palette:
        return []
    swatches = []
    for entry in palette:
        try:
            swatches.append(_rgb(str(entry)))
        except (ValueError, IndexError):
            continue
    if not swatches:
        return []
    out = []
    for field, value in sorted(values.items()):
        if not isinstance(value, str) or field.startswith("bible.") or field == "negative_prompts":
            continue
        if not (field in COLOUR_BEARING or field.endswith(".color") or field.endswith(".colour")):
            continue
        for word in sorted(set(re.findall(r"[a-z]+", value.lower())) & set(COLOUR_WORDS)):
            rgb = COLOUR_WORDS[word]
            near = min(sum((a - b) ** 2 for a, b in zip(rgb, s, strict=True)) ** 0.5 for s in swatches)
            if near > PALETTE_DISTANCE:
                out.append({"field": field, "word": word, "distance": round(near)})
    return out
