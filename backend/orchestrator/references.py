"""
References-first asset generator.

Replaces the sheets-as-grid abstraction with single-purpose reference
images. Every visual representation of an asset is one row in
`reference_pool` with a label and (optionally) a parent_reference_id
linking back to the identity card it was conditioned on.

Public API:
    generate_identity_card(asset_id) -> dict
        First-ever reference for an asset. Front view, full body / wide
        establishing / 3-quarter studio depending on type. The eternal
        anchor — every future reference conditions on this image so
        identity stays locked.

    generate_pose(asset_id, label, *, story_context=None) -> dict
        New reference of the asset in a specific state (side, sad, running,
        glowing, etc.). Uses the asset's identity card as ReferenceImage
        slot @Image1 and asks Nano Banana Pro to render the asset in the
        named pose.

    get_or_generate(asset_id, label, *, story_context=None) -> dict
        Cache lookup. If a reference for this asset exists with a matching
        label, return it. Otherwise generate via generate_pose() and
        return.

    list_references(asset_id) -> list[dict]
        Every reference for an asset, newest first. Used by the
        AssetMasterNode UI to render the "sheet view" client-side.

    get_identity_card(asset_id) -> dict | None
        Fast lookup of the identity reference for an asset.

    standard_turnaround_set(asset_type) -> list[str]
        The pose labels every asset of a given type benefits from
        ("front", "three_quarter_right", "side_right", "back" for
        characters; "wide_establishing", "key_detail" for locations;
        etc.). Used by the optional pre-cache action.

    precache_standard_turnaround(asset_id) -> list[dict]
        Generate every label in the standard turnaround set in parallel,
        skipping any that already exist. Returns the list of resulting
        references.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime
from typing import Any

import structlog

from backend import db
get_async_connection = db.get_async_connection
from backend.providers import ImageGenRequest, ProviderError, ReferenceImage, get_registry

log = structlog.get_logger(__name__)


# ============================================================================
# Pose vocabulary — controlled labels per asset type
# ============================================================================

# Replaces sheet_planner's template registry. The vocabulary is what the
# system can name a reference; the picker uses these labels to address
# specific views during cut composition.

_POSE_DIRECTIVES: dict[str, str] = {
    # Character — angles
    "identity": "front view, full body, neutral confident pose, eye level, perfectly centered",
    "front": "front view, full body, neutral pose",
    "three_quarter_right": "three-quarter view from camera left (45° angle), full body",
    "three_quarter_left": "three-quarter view from camera right (45° angle), full body",
    "side_right": "perfect side profile facing right, full body",
    "side_left": "perfect side profile facing left, full body",
    "back": "back view, full body, character facing away from camera",
    "hero_pose": "signature action pose, three-quarter angle, confident and dynamic",
    "face_close_up": "close-up portrait, neutral expression, eye level",
    # Character — expressions
    "expression_focused": "close-up portrait, focused intense expression",
    "expression_angry": "close-up portrait, angry intense expression",
    "expression_sad": "close-up portrait, sad sorrowful expression",
    "expression_happy": "close-up portrait, joyful smiling expression",
    "expression_terrified": "close-up portrait, terrified fearful expression",
    "expression_smug": "close-up portrait, smug confident smirk",
    # Character — states / actions
    "running": "full body in mid-run, dynamic motion, three-quarter angle",
    "fighting_stance": "full body in fighting stance, ready posture",
    "wounded": "full body, visibly wounded, weakened posture",
    "kneeling": "full body, kneeling down",
    "gun_drawn": "full body, weapon drawn and aimed",
    # Location — angles
    "wide_establishing": "wide establishing shot of the location, no characters",
    "medium": "medium-distance view emphasising key features, no characters",
    "key_detail": "close-up of a key landmark or focal point within the location",
    "alt_lighting": "the location at an alternative lighting state (different time of day or weather)",
    # Location — reference plate (L3): flat-lit clean reference, the
    # identity-style anchor for a place. NOT a story shot. Stays in the
    # project's art_style; just removes dramatic lighting so geometry +
    # palette read clearly.
    "plate": (
        "Reference plate of the location: full set / environment in "
        "frame, even ambient lighting (no harsh single-source key, no "
        "colored gels), all key set pieces visible. Stay in the "
        "project's art_style. No characters."
    ),
    "establishing": (
        "FINAL ESTABLISHING SHOT: same location as the plate but with "
        "this world's dramatic lighting fully applied (per the brief's "
        "lighting rules). Cinematic framing, story-ready."
    ),
    # Prop — angles
    "prop_front": "front view of the prop, isolated on neutral background",
    "prop_three_quarter": "three-quarter view of the prop (45° angle), isolated",
    "prop_side": "side view of the prop, isolated",
    "prop_rear": "rear view of the prop, isolated",
    "prop_in_use": "the prop being held or used, three-quarter angle",
    # Prop / state
    "state_glowing": "the prop in its glowing / activated state",
    "state_dormant": "the prop in its dormant / inactive state",
}


_STANDARD_TURNAROUND: dict[str, list[str]] = {
    # `identity` always comes first (auto-bootstrap); these are the
    # additional views to pre-cache. Conservative defaults — only the
    # variants we actually expect most projects to need. Per-cut variants
    # get lazy-filled by the planner when a specific cut requests them
    # (see picker.rank_labels_for_cut + cut_planner REFERENCE_GENERATE
    # plan items). Test1 generated 16 prop turnaround views that zero
    # cuts ever picked up — pure waste.
    "character": ["three_quarter_right"],
    "location": [],
    "prop": [],
}


def standard_turnaround_set(asset_type: str) -> list[str]:
    """The labels we pre-cache for an asset of this type."""
    return list(_STANDARD_TURNAROUND.get(asset_type.lower(), ["identity"]))


def pose_directive(label: str) -> str:
    """Human-readable directive for a pose label. Falls back to the
    label itself made readable if not in the vocabulary."""
    return _POSE_DIRECTIVES.get(label, label.replace("_", " "))


# ============================================================================
# Internal helpers
# ============================================================================

async def _fetch_one(conn, sql, params):
    async with conn.execute(sql, params) as cur:
        row = await cur.fetchone()
    return dict(row) if row else None


async def _fetch_all(conn, sql, params):
    async with conn.execute(sql, params) as cur:
        return [dict(r) for r in await cur.fetchall()]


def _row_to_dict(row) -> dict[str, Any]:
    out = dict(row)
    out["tags"] = json.loads(out.pop("tags_json", None) or "{}")
    out["character_ids"] = json.loads(out.pop("character_ids_json", None) or "[]")
    out["is_anchor"] = bool(out.get("is_anchor", 0))
    out["is_style_anchor"] = bool(out.get("is_style_anchor", 0))
    out["is_favorite"] = bool(out.get("is_favorite", 0))
    out.pop("embedding", None)
    return out


def _aspect_ratio_for(asset_type: str) -> str:
    """Default AR per asset type. Each reference is one image; AR isn't
    constrained by a grid the way sheet templates were."""
    t = asset_type.lower()
    if t == "location":
        return "16:9"
    return "1:1"


async def _build_prompt(
    asset: dict[str, Any], brief: dict[str, Any], label: str, story_context: str | None
) -> str:
    """Compose the prompt for a single reference image.

    Order: identity → identity-lock clause → style → pose directive →
    sheet-style constraints → negatives. Identity-first is the documented
    Nano Banana Pro best practice (Nov-2026)."""
    name = asset.get("name") or "the subject"
    description = (asset.get("description") or "").strip()
    appearance = (asset.get("appearance") or "").strip()
    tokens = (asset.get("consistency_tokens") or "").strip()
    distinctive = (asset.get("distinctive_features") or "").strip()
    wardrobe = (asset.get("wardrobe_lock") or "").strip()
    suggested = (asset.get("suggested_prompt") or "").strip()

    identity_lines: list[str] = [f"**Subject:** {name}."]
    if description:
        identity_lines.append(f"Description: {description}")
    if appearance:
        identity_lines.append(f"Appearance: {appearance}")
    if distinctive:
        identity_lines.append(f"Distinctive (verbatim, must appear): {distinctive}")
    if tokens:
        identity_lines.append(f"Consistency tokens (verbatim, must appear): {tokens}")
    if wardrobe:
        identity_lines.append(f"Wardrobe lock: {wardrobe}")
    if suggested and not appearance:
        identity_lines.append(f"Foundation: {suggested}")

    # L3 — if the asset is a location nested inside a parent location (e.g.
    # "Fake Moon Set" inside "Film Studio"), inject the parent's identity
    # context so the child looks correct in-world.
    parent_aid = asset.get("parent_asset_id")
    if parent_aid:
        try:
            _gac = db.get_async_connection
            async with _gac() as _conn:
                _row = await _fetch_one(
                    _conn,
                    "SELECT name, type, appearance, suggested_prompt FROM assets WHERE id = ?",
                    (parent_aid,),
                )
            if _row and (_row.get("type") or "").lower() == "location" and asset_type == "location":
                pname = _row.get("name") or ""
                p_app = (_row.get("appearance") or "").strip()
                p_sp = (_row.get("suggested_prompt") or "").strip()
                inherit = p_app or p_sp[:300]
                if pname:
                    identity_lines.append(
                        f"Located inside: {pname}. Inherit set context: {inherit}"
                    )
        except Exception:
            pass

    asset_type = (asset.get("type") or "").lower()
    if asset_type == "character":
        do_not_vary = (
            "DO NOT change: face geometry, eye color, eye shape, hair color, hair "
            "length, skin tone, body proportions, age. Only the listed pose / "
            "expression / state changes."
        )
    elif asset_type == "location":
        do_not_vary = (
            "DO NOT change: architecture, set decoration, geometry, color story. "
            "Only the camera framing / vantage changes."
        )
    else:
        do_not_vary = (
            "DO NOT change: object geometry, materials, color, scale, detailing. "
            "Only the camera angle or state changes."
        )

    art_style = (brief.get("art_style") or "").strip()
    color_palette = (brief.get("color_palette") or "").strip()
    lighting = (brief.get("lighting_style") or "").strip()
    negatives = (brief.get("negative_prompts") or "").strip()

    # Phase L1: pull the compiled style bible if present so every reference
    # carries the same locked palette + style tokens. This is what binds the
    # cross-asset look — text alone, before the style anchor image lands.
    import json as _json
    try:
        palette_hex = _json.loads(brief.get("palette_hex") or "[]")
    except Exception:
        palette_hex = []
    try:
        style_tokens = _json.loads(brief.get("style_tokens") or "[]")
    except Exception:
        style_tokens = []
    lighting_rules = (brief.get("lighting_rules") or "").strip()

    style_lines: list[str] = []
    if art_style:
        style_lines.append(f"Art style: {art_style}")
    if color_palette:
        style_lines.append(f"Color palette: {color_palette}")
    if palette_hex:
        style_lines.append("Locked palette (hex): " + ", ".join(palette_hex))
    if lighting:
        style_lines.append(f"Lighting: {lighting}")
    if lighting_rules:
        style_lines.append(f"Lighting rules: {lighting_rules}")
    if style_tokens:
        # Verbatim shared tokens — these MUST appear in every prompt, the
        # model re-uses verbatim phrasing more reliably than paraphrase.
        style_lines.append("Shared style tokens (apply verbatim): " + " | ".join(style_tokens))

    directive = pose_directive(label)

    if asset_type == "location":
        # L3 — the location IDENTITY is the flat-lit reference plate, but
        # KEEP the art_style intact (Spider-Verse stays Spider-Verse).
        # Earlier wording ("neutral white-cyc edges") was overpowering the
        # art_style and pushing the model toward photoreal soundstage refs.
        if label == "identity":
            constraints = (
                "Full set / environment in frame, every key set piece "
                "readable. Use even, ambient lighting that exposes "
                "geometry and palette (no harsh single-source key, no "
                "colored gels — save dramatic lighting for the "
                "`establishing` view). "
                "STAY in the project's art_style — this is a styled "
                "reference plate, NOT a photoreal soundstage shot. "
                "No text, no labels, no captions, no characters in frame."
            )
        else:
            constraints = (
                "Full set / environment in frame. Apply the brief's "
                "lighting rules. No text, no labels, no captions, no UI."
            )
    else:
        constraints = (
            "Single subject in frame. PURE WHITE BACKGROUND (#FFFFFF), "
            "flat even key + soft fill, no cast shadow on backdrop, "
            "subject only — sheet/turnaround style. "
            "No on-image text, no labels, no captions, no UI."
        )

    negatives_full = "no text, no labels, no captions, no watermarks, no signatures"
    if negatives:
        negatives_full += f"; {negatives}"

    parts: list[str] = [
        f"Reference image of {name} — view: {label.replace('_', ' ')}.",
        "## Identity\n" + "\n".join(identity_lines),
        f"## Identity lock\n{do_not_vary}",
    ]
    if style_lines:
        parts.append("## Style\n" + "\n".join(style_lines))
    parts.append(f"## Pose / view\n{directive}")
    if story_context:
        parts.append(f"## Story context\n{story_context}")
    parts.append(f"## Constraints\n{constraints}")
    parts.append(f"## Negatives\n{negatives_full}.")
    return "\n".join(parts)


async def _save_reference_row(
    *,
    project_id: str,
    asset_id: str,
    image_url: str,
    label: str,
    parent_reference_id: str | None,
    aspect_ratio: str,
    cost_usd: float,
    model: str,
    request_id: str | None,
    tags: dict | None = None,
    is_anchor: bool = False,
    is_style_anchor: bool = False,
    scope: str = "project",
    scope_id: str | None = None,
) -> str:
    """Insert a reference into reference_pool and return its id.

    Persists `cost_usd`, `model_used`, and `prompt` on the row so the
    Library can show real spend per asset and the cost meter has data
    beyond render-time. Earlier code dropped these on the floor."""
    rid = f"ref_{uuid.uuid4().hex[:12]}"
    async with get_async_connection() as conn:
        await conn.execute(
            """
            INSERT INTO reference_pool
                (id, project_id, image_url, tags_json, character_ids_json,
                 location_id, aspect_ratio, lighting_signature, source_type,
                 source_master_id, source_request_id,
                 is_anchor, is_style_anchor,
                 asset_id, label, parent_reference_id, status, scope, scope_id,
                 cost_usd, model_used, prompt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rid,
                project_id,
                image_url,
                json.dumps(tags or {"label": label}),
                json.dumps([asset_id] if (tags or {}).get("asset_type") == "character" else []),
                asset_id if (tags or {}).get("asset_type") == "location" else None,
                aspect_ratio,
                "",  # lighting_signature — set later when we wire scene context
                "reference",
                asset_id,
                request_id,
                1 if is_anchor else 0,
                1 if is_style_anchor else 0,
                asset_id,
                label,
                parent_reference_id,
                "complete",
                scope,
                scope_id,
                float(cost_usd or 0),
                model or "",
                "",
            ),
        )
        await conn.commit()
    return rid


# ============================================================================
# Public API
# ============================================================================

async def get_identity_card(asset_id: str) -> dict[str, Any] | None:
    """Return the identity reference for an asset, or None if not generated yet."""
    async with get_async_connection() as conn:
        row = await _fetch_one(
            conn,
            "SELECT * FROM reference_pool WHERE asset_id = ? AND label = 'identity' "
            "ORDER BY created_at DESC LIMIT 1",
            (asset_id,),
        )
    return _row_to_dict(row) if row else None


async def list_references(asset_id: str) -> list[dict[str, Any]]:
    """All references for an asset, newest first. Used by the UI grid."""
    async with get_async_connection() as conn:
        rows = await _fetch_all(
            conn,
            "SELECT * FROM reference_pool WHERE asset_id = ? "
            "ORDER BY (label = 'identity') DESC, created_at DESC",
            (asset_id,),
        )
    return [_row_to_dict(r) for r in rows]


async def find_reference_by_label(asset_id: str, label: str) -> dict[str, Any] | None:
    """Exact label match for an asset's existing references."""
    async with get_async_connection() as conn:
        row = await _fetch_one(
            conn,
            "SELECT * FROM reference_pool WHERE asset_id = ? AND label = ? "
            "ORDER BY created_at DESC LIMIT 1",
            (asset_id, label),
        )
    return _row_to_dict(row) if row else None


async def _load_asset_and_brief(asset_id: str) -> tuple[dict, dict]:
    async with get_async_connection() as conn:
        asset = await _fetch_one(conn, "SELECT * FROM assets WHERE id = ?", (asset_id,))
        if asset is None:
            raise ValueError(f"asset {asset_id} not found")
        brief = await _fetch_one(
            conn, "SELECT * FROM briefs WHERE project_id = ?", (asset["project_id"],)
        )
    return asset, brief or {}


async def _generate_one(
    *,
    asset: dict,
    brief: dict,
    label: str,
    parent_reference_id: str | None,
    story_context: str | None,
) -> dict:
    """Shared call path for identity + pose generation."""
    prompt = await _build_prompt(asset, brief, label, story_context)

    refs: list[ReferenceImage] = []

    # L2 — attach the project's style anchor as the FIRST reference so it
    # carries palette, line, grain across every subsequent generation. We
    # skip self-reference (the anchor itself shouldn't reference itself if
    # somebody marks the asset that way later).
    try:
        from backend.orchestrator.style_anchor import get_style_anchor_url
        anchor_url = await get_style_anchor_url(asset["project_id"])
        if anchor_url and anchor_url != asset.get("image_url"):
            refs.append(
                ReferenceImage(image_url=anchor_url, slot=len(refs) + 1, name="style_anchor")
            )
    except Exception:  # noqa: BLE001
        pass

    if parent_reference_id:
        async with get_async_connection() as conn:
            parent = await _fetch_one(
                conn, "SELECT image_url FROM reference_pool WHERE id = ?",
                (parent_reference_id,),
            )
        if parent and parent["image_url"]:
            refs.append(ReferenceImage(image_url=parent["image_url"], slot=len(refs) + 1, name="identity"))

    # If the asset has a parent_asset_id (Mara's gun → Mara), thread the
    # parent's identity card into the request too.
    if asset.get("parent_asset_id") and not any(r.name == "identity" for r in refs):
        parent_identity = await get_identity_card(asset["parent_asset_id"])
        if parent_identity and parent_identity.get("image_url"):
            refs.append(
                ReferenceImage(
                    image_url=parent_identity["image_url"], slot=len(refs) + 1, name="parent_identity"
                )
            )

    reg = get_registry()
    img_provider, model = reg.image_for_role("pro")
    req = ImageGenRequest(
        prompt=prompt,
        model=model,
        aspect_ratio=_aspect_ratio_for(asset.get("type") or ""),
        resolution="2048x2048",
        num_images=1,
        reference_images=refs,
    )
    result = await img_provider.generate(req)
    image_url = result.image_urls[0]

    tags = {
        "label": label,
        "asset_type": (asset.get("type") or "").lower(),
        "asset_name": asset.get("name") or "",
    }
    rid = await _save_reference_row(
        project_id=asset["project_id"],
        asset_id=asset["id"],
        image_url=image_url,
        label=label,
        parent_reference_id=parent_reference_id,
        aspect_ratio=req.aspect_ratio,
        cost_usd=result.cost_usd,
        model=result.model_used,
        request_id=result.image_id,
        tags=tags,
        is_anchor=(label == "identity"),
    )
    # Backfill the prompt — _save_reference_row writes "" because it doesn't
    # see it; we have it here so persist directly.
    try:
        async with get_async_connection() as conn:
            await conn.execute(
                "UPDATE reference_pool SET prompt = ? WHERE id = ?", (prompt, rid),
            )
            await conn.commit()
    except Exception:
        log.exception("prompt_persist_failed", reference_id=rid)
    log.info(
        "reference_generated",
        asset_id=asset["id"],
        label=label,
        reference_id=rid,
        cost_usd=result.cost_usd,
    )
    # Mirror onto assets.image_url when it's the identity (so legacy code
    # that reads asset.image_url still finds something useful).
    if label == "identity":
        async with get_async_connection() as conn:
            await conn.execute(
                "UPDATE assets SET image_url = ? WHERE id = ?",
                (image_url, asset["id"]),
            )
            await conn.commit()
    return {
        "id": rid,
        "asset_id": asset["id"],
        "label": label,
        "image_url": image_url,
        "parent_reference_id": parent_reference_id,
        "cost_usd": result.cost_usd,
        "model_used": result.model_used,
    }


async def generate_identity_card(asset_id: str) -> dict:
    """First-ever reference for the asset. Locks the look."""
    asset, brief = await _load_asset_and_brief(asset_id)
    existing = await get_identity_card(asset_id)
    if existing:
        return existing
    return await _generate_one(
        asset=asset, brief=brief, label="identity",
        parent_reference_id=None, story_context=None,
    )


async def generate_pose(
    asset_id: str,
    label: str,
    *,
    story_context: str | None = None,
) -> dict:
    """New reference labeled `label`, conditioned on the asset's identity."""
    asset, brief = await _load_asset_and_brief(asset_id)
    identity = await get_identity_card(asset_id)
    parent_id = identity["id"] if identity else None
    if parent_id is None:
        # Auto-bootstrap: identity must come first so this pose locks identity.
        identity = await _generate_one(
            asset=asset, brief=brief, label="identity",
            parent_reference_id=None, story_context=None,
        )
        parent_id = identity["id"]
    return await _generate_one(
        asset=asset, brief=brief, label=label,
        parent_reference_id=parent_id, story_context=story_context,
    )


async def get_or_generate(
    asset_id: str,
    label: str,
    *,
    story_context: str | None = None,
) -> dict:
    """Cache-first: return existing reference, or generate it."""
    existing = await find_reference_by_label(asset_id, label)
    if existing:
        return existing
    if label == "identity":
        return await generate_identity_card(asset_id)
    return await generate_pose(asset_id, label, story_context=story_context)


async def precache_standard_turnaround(asset_id: str) -> list[dict]:
    """Generate every label in the standard turnaround set in parallel,
    skipping any that already exist. Identity is generated first
    (sequentially) since other poses condition on it."""
    asset, _brief = await _load_asset_and_brief(asset_id)
    asset_type = (asset.get("type") or "").lower()
    labels = standard_turnaround_set(asset_type)

    # Ensure identity exists first.
    identity = await get_identity_card(asset_id)
    if not identity:
        identity = await generate_identity_card(asset_id)

    # Then fan out the rest.
    todo = [l for l in labels if l != "identity"]
    existing_labels = {r["label"] for r in await list_references(asset_id)}
    todo = [l for l in todo if l not in existing_labels]

    if not todo:
        return [identity]

    results = await asyncio.gather(
        *[get_or_generate(asset_id, l) for l in todo],
        return_exceptions=True,
    )
    out = [identity]
    for label, r in zip(todo, results):
        if isinstance(r, Exception):
            log.warning("precache_pose_failed", asset_id=asset_id, label=label, error=str(r))
        else:
            out.append(r)
    return out


# ============================================================================
# Reference-pool service (merged from legacy references.py — single source).
#
# These are the lower-level CRUD / search helpers. The high-level generators
# above (generate_identity_card, generate_pose, ...) are the asset-aware
# entry points; everything below is the reference_pool table service that
# any caller can use directly when they need raw access.
# ============================================================================

async def register_image(
    project_id: str,
    image_url: str,
    *,
    source_type: str,
    source_cut_id: str | None = None,
    source_master_id: str | None = None,
    source_variant_id: str | None = None,
    source_request_id: str | None = None,
    character_ids: list[str] | None = None,
    location_id: str | None = None,
    aspect_ratio: str = "",
    lighting_signature: str = "",
    tags: dict[str, Any] | None = None,
    is_anchor: bool = False,
    is_style_anchor: bool = False,
) -> str:
    """Index a new reference. Returns its row id."""
    rid = f"ref_{uuid.uuid4().hex[:12]}"
    async with get_async_connection() as conn:
        await conn.execute(
            """
            INSERT INTO reference_pool
                (id, project_id, image_url, tags_json, character_ids_json, location_id,
                 aspect_ratio, lighting_signature, source_type, source_cut_id,
                 source_master_id, source_variant_id, source_request_id,
                 is_anchor, is_style_anchor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rid,
                project_id,
                image_url,
                json.dumps(tags or {}),
                json.dumps(character_ids or []),
                location_id,
                aspect_ratio,
                lighting_signature,
                source_type,
                source_cut_id,
                source_master_id,
                source_variant_id,
                source_request_id,
                1 if is_anchor else 0,
                1 if is_style_anchor else 0,
            ),
        )
        await conn.commit()
    log.info("reference_registered", project_id=project_id, source_type=source_type, id=rid)
    return rid


async def set_style_anchor(project_id: str, image_url: str) -> str:
    """Pin a single image as the project's canonical style reference. Replaces any prior."""
    async with get_async_connection() as conn:
        await conn.execute(
            "UPDATE reference_pool SET is_style_anchor = 0 WHERE project_id = ? AND is_style_anchor = 1",
            (project_id,),
        )
        await conn.commit()
    return await register_image(
        project_id, image_url, source_type="upload", is_style_anchor=True, tags={"role": "style_anchor"}
    )


async def set_anchor(reference_id: str, is_anchor: bool = True) -> None:
    async with get_async_connection() as conn:
        await conn.execute(
            "UPDATE reference_pool SET is_anchor = ? WHERE id = ?",
            (1 if is_anchor else 0, reference_id),
        )
        await conn.commit()


async def toggle_favorite(reference_id: str, is_favorite: bool) -> None:
    """Cross-project favorites — searchable from any project."""
    async with get_async_connection() as conn:
        await conn.execute(
            "UPDATE reference_pool SET is_favorite = ? WHERE id = ?",
            (1 if is_favorite else 0, reference_id),
        )
        await conn.commit()


async def search(
    project_id: str,
    *,
    character_id: str | None = None,
    location_id: str | None = None,
    source_type: str | None = None,
    is_anchor: bool | None = None,
    aspect_ratio: str | None = None,
    include_favorites: bool = False,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Filter the pool. Cross-project favorites included if `include_favorites=True`."""
    clauses = ["(project_id = ?" + (" OR is_favorite = 1" if include_favorites else "") + ")"]
    params: list[Any] = [project_id]
    if location_id:
        clauses.append("location_id = ?")
        params.append(location_id)
    if source_type:
        clauses.append("source_type = ?")
        params.append(source_type)
    if is_anchor is True:
        clauses.append("is_anchor = 1")
    if aspect_ratio:
        clauses.append("aspect_ratio = ?")
        params.append(aspect_ratio)

    where = " AND ".join(clauses)
    sql = f"SELECT * FROM reference_pool WHERE {where} ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    async with get_async_connection() as conn:
        async with conn.execute(sql, params) as cur:
            rows = await cur.fetchall()

    out = [_row_to_dict(r) for r in rows]
    if character_id:
        out = [r for r in out if character_id in r["character_ids"]]
    return out


async def get_anchors(project_id: str) -> list[dict[str, Any]]:
    return await search(project_id, is_anchor=True)


async def get_style_anchor(project_id: str) -> dict[str, Any] | None:
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT * FROM reference_pool WHERE project_id = ? AND is_style_anchor = 1 ORDER BY created_at DESC LIMIT 1",
            (project_id,),
        ) as cur:
            row = await cur.fetchone()
    return _row_to_dict(row) if row else None


async def auto_register_master(asset_id: str, image_url: str, request_id: str | None = None) -> str | None:
    """Hook: called after a master image is generated."""
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT project_id, type FROM assets WHERE id = ?", (asset_id,)
        ) as cur:
            row = await cur.fetchone()
    if not row:
        return None
    project_id = row["project_id"]
    asset_type = row["type"]
    return await register_image(
        project_id,
        image_url,
        source_type="master",
        source_master_id=asset_id,
        source_request_id=request_id,
        character_ids=[asset_id] if asset_type == "character" else [],
        location_id=asset_id if asset_type == "location" else None,
        tags={"role": "master", "asset_type": asset_type},
    )


async def auto_register_cut(cut_id: str, image_url: str, request_id: str | None = None) -> str | None:
    """Hook: called after a cut image is rendered. Pulls scene/character/location from blueprint."""
    async with get_async_connection() as conn:
        async with conn.execute(
            """
            SELECT c.id AS cut_id, c.shot_id,
                   s.id AS scene_id, s.project_id, s.location, s.lighting, s.lighting_color, s.time_of_day, s.mood
            FROM cuts c
            JOIN shots sh ON sh.id = c.shot_id
            JOIN scenes s ON s.id = sh.scene_id
            WHERE c.id = ?
            """,
            (cut_id,),
        ) as cur:
            ctx = await cur.fetchone()
        if ctx is None:
            return None
        ctx = dict(ctx)
        async with conn.execute(
            """
            SELECT a.id AS asset_id, a.type
            FROM asset_links al JOIN assets a ON a.id = al.asset_id
            WHERE al.node_type = 'cut' AND al.node_id = ?
            """,
            (cut_id,),
        ) as cur:
            links = [dict(r) for r in await cur.fetchall()]

    char_ids = [r["asset_id"] for r in links if r["type"] == "character"]
    loc_ids = [r["asset_id"] for r in links if r["type"] == "location"]
    lighting_sig = ":".join(
        x for x in [ctx.get("time_of_day") or "", ctx.get("lighting_color") or "", ctx.get("mood") or ""] if x
    )
    return await register_image(
        ctx["project_id"],
        image_url,
        source_type="cut",
        source_cut_id=cut_id,
        source_request_id=request_id,
        character_ids=char_ids,
        location_id=loc_ids[0] if loc_ids else None,
        lighting_signature=lighting_sig,
        tags={"role": "cut", "scene_id": ctx["scene_id"], "shot_id": ctx["shot_id"]},
    )
