"""
Sheet Generator — composes a multi-panel prompt and generates ONE image
covering every cell in the chosen template.

Workflow:
  1. Sheet Planner picks the template (`character_full`, `prop_3view`, …).
  2. Sheet Generator builds a prompt from:
     - Brief globals (art style, palette, world rules, negatives)
     - Asset description + consistency tokens + wardrobe lock
     - Per-cell instructions derived from the template's cell labels
  3. Calls Nano Banana Pro (`gemini-3-pro-image-preview`) once.
  4. Persists the result in `element_sheets` with `panels_json` + `layout_json`
     so the picker can address one cell of the sheet by label.
  5. Auto-registers in `reference_pool` with `tags.cells = [labels]`.

Cost: ~$0.04 per asset (vs ~$0.32 for the old 8-variant approach).
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import structlog

from backend.config import get_settings
from backend.database.core import get_async_connection
from backend.orchestrator.sheet_planner import SheetPlan, plan_sheet
from backend.providers import ImageGenRequest, ProviderError, get_registry
from backend.providers.image._storage import save_image_bytes

log = structlog.get_logger(__name__)


# ============================================================================
# Per-cell rendering instructions
# ============================================================================
# Maps a template cell label → human-readable directive that goes into the
# multi-panel prompt. Tuning these directly affects sheet quality.
_CELL_DIRECTIVES: dict[str, str] = {
    # Character angles
    "front": "front view (camera dead on, full body, neutral pose)",
    "three_quarter_right": "three-quarter view from camera left (45° from front), full body",
    "three_quarter_left": "three-quarter view from camera right (45° from front), full body",
    "side_right": "perfect side profile facing right, full body",
    "side_left": "perfect side profile facing left, full body",
    "back": "back view, character facing away from camera, full body",
    "hero_pose": "signature action pose (3/4 angle), confident stance",
    "face_close_up": "close-up portrait, neutral expression, eye level",
    "expression_happy": "close-up portrait, happy/smiling expression",
    "expression_sad": "close-up portrait, sad expression",
    "expression_angry": "close-up portrait, angry/intense expression",
    # Prop angles
    "three_quarter": "three-quarter view (45° angle), full prop",
    "side": "side view of the prop",
    # Location angles
    "wide_establishing": "wide establishing shot of the location",
    "medium": "medium-distance view emphasising key features",
    "key_detail": "close-up of a key landmark within the location",
    "alt_lighting": "same location at a different time of day or lighting state",
    # Vehicle
    "rear": "rear view of the vehicle",
    "cockpit": "cockpit / interior detail",
    "in_motion": "vehicle in motion at three-quarter angle",
    # Costume
    "flat_front": "flat lay front view of the garment, no model",
    "flat_back": "flat lay back view of the garment, no model",
}


def _humanize_label(label: str) -> str:
    return label.replace("_", " ")


# ============================================================================
# Prompt composition
# ============================================================================

def _grid_layout_text(rows: int, cols: int, cells: list[str]) -> str:
    """Plain-English grid layout description for the model."""
    lines: list[str] = []
    if rows == 1:
        lines.append(f"Layout: a single horizontal row of {cols} panels, left to right.")
    elif cols == 1:
        lines.append(f"Layout: a single vertical column of {rows} panels, top to bottom.")
    else:
        lines.append(f"Layout: a {rows}×{cols} grid (rows × columns), filled row by row, left to right, top to bottom.")
    for idx, cell in enumerate(cells):
        directive = _CELL_DIRECTIVES.get(cell, _humanize_label(cell))
        position = _grid_position_label(idx, rows, cols)
        lines.append(f"  • Panel {idx + 1} ({position}): {directive}")
    return "\n".join(lines)


def _grid_position_label(idx: int, rows: int, cols: int) -> str:
    if rows == 1:
        return f"col {idx + 1}"
    if cols == 1:
        return f"row {idx + 1}"
    r, c = divmod(idx, cols)
    return f"row {r + 1} col {c + 1}"


def _cells_layout_json(plan: SheetPlan) -> dict[str, Any]:
    """Build the layout_json with normalised bbox per cell. Bboxes assume
    the sheet is divided into a perfect grid."""
    rows, cols = plan.template.grid
    out_cells = []
    for idx, label in enumerate(plan.template.cells):
        r, c = divmod(idx, cols)
        bbox = [c / cols, r / rows, 1 / cols, 1 / rows]  # [x, y, w, h] normalised
        out_cells.append({
            "label": label,
            "row": r,
            "col": c,
            "bbox": bbox,
        })
    return {
        "grid": [rows, cols],
        "cells": out_cells,
        "aspect_ratio": plan.template.aspect_ratio,
    }


def _build_prompt(plan: SheetPlan, asset: dict[str, Any], brief: dict[str, Any]) -> str:
    """Compose the multi-panel prompt fed to Nano Banana Pro."""
    rows, cols = plan.template.grid
    cells = plan.template.cells
    layout_text = _grid_layout_text(rows, cols, cells)

    # Identity / consistency block — the absolute non-negotiable bit
    name = asset.get("name") or "the subject"
    description = (asset.get("description") or "").strip()
    appearance = (asset.get("appearance") or "").strip()
    tokens = (asset.get("consistency_tokens") or "").strip()
    distinctive = (asset.get("distinctive_features") or "").strip()
    wardrobe = (asset.get("wardrobe_lock") or "").strip()

    identity_lines: list[str] = [f"Subject: **{name}**."]
    if description:
        identity_lines.append(f"Description: {description}")
    if appearance:
        identity_lines.append(f"Appearance: {appearance}")
    if distinctive:
        identity_lines.append(f"Distinctive features (must match exactly across every panel): {distinctive}")
    if tokens:
        identity_lines.append(f"Consistency tokens (must appear in every panel): {tokens}")
    if wardrobe:
        identity_lines.append(f"Wardrobe lock (do not vary across panels): {wardrobe}")

    # Globals from the brief
    art_style = (brief.get("art_style") or "").strip()
    color_palette = (brief.get("color_palette") or "").strip()
    lighting = (brief.get("lighting_style") or "").strip()
    negatives = (brief.get("negative_prompts") or "").strip()

    style_lines: list[str] = []
    if art_style:
        style_lines.append(f"Art style: {art_style}")
    if color_palette:
        style_lines.append(f"Color palette: {color_palette}")
    if lighting:
        style_lines.append(f"Lighting: {lighting}, applied uniformly across every panel")

    # Sheet-level constraints — these matter a lot for layout fidelity
    constraints = [
        "Plain white seamless background.",
        "Identical character/object proportions, identical lighting, identical render quality across every panel — only the angle/expression/state changes per panel.",
        "Clean borders between panels (thin neutral grey gridlines).",
        "No on-image text labels, no captions, no numbering, no watermarks.",
    ]

    negatives_full = "no text, no labels, no captions, no numbering, no watermarks, no signatures, no UI"
    if negatives:
        negatives_full += f"; {negatives}"

    parts: list[str] = []
    parts.append(f"Generate a single **model sheet** image — a multi-panel reference grid of {name}.")
    parts.append(layout_text)
    parts.append("\n## Identity\n" + "\n".join(identity_lines))
    if style_lines:
        parts.append("\n## Style\n" + "\n".join(style_lines))
    parts.append("\n## Sheet constraints\n" + "\n".join(f"- {c}" for c in constraints))
    parts.append(f"\nNegative: {negatives_full}.")
    return "\n".join(parts)


# ============================================================================
# Generation
# ============================================================================

@dataclass
class SheetGenResult:
    sheet_id: str
    image_url: str
    template_id: str
    sheet_type: str
    panels: list[str]
    layout: dict[str, Any]
    cost_usd: float
    rationale: str


async def _save_sheet_row(
    plan: SheetPlan,
    *,
    image_url: str,
    prompt: str,
    layout_json: dict[str, Any],
    panels_json: list[str],
    cost: float,
    model: str,
    seed: int | None,
    request_id: str | None,
) -> str:
    """Persist the new sheet row, deactivate any prior active sheet for this asset."""
    sheet_id = f"sheet_{uuid.uuid4().hex[:12]}"
    now = datetime.now().isoformat()
    async with get_async_connection() as conn:
        await conn.execute(
            "UPDATE element_sheets SET is_active = 0 WHERE asset_id = ? AND is_active = 1",
            (plan.asset_id,),
        )
        await conn.execute(
            """
            INSERT INTO element_sheets
                (id, asset_id, sheet_type, template_id, image_url, aspect_ratio,
                 layout_json, panels_json, prompt, model, generation_request_id,
                 cost_usd, seed, is_active, status, rationale_json,
                 created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'complete', ?, ?, ?)
            """,
            (
                sheet_id,
                plan.asset_id,
                plan.template.sheet_type,
                plan.template.template_id,
                image_url,
                plan.template.aspect_ratio,
                json.dumps(layout_json),
                json.dumps(panels_json),
                prompt,
                model,
                request_id,
                cost,
                seed,
                json.dumps(plan.to_dict()),
                now,
                now,
            ),
        )
        # Mirror onto assets.image_url so legacy code paths still find the master
        await conn.execute(
            "UPDATE assets SET image_url = ? WHERE id = ?",
            (image_url, plan.asset_id),
        )
        await conn.commit()
    return sheet_id


async def generate_sheet_for_asset(
    asset_id: str,
    *,
    override_sheet_type: str | None = None,
    seed: int | None = None,
) -> SheetGenResult:
    """Plan + generate + persist + auto-register a new element sheet."""
    plan = await plan_sheet(asset_id, override_sheet_type=override_sheet_type)

    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT * FROM assets WHERE id = ?", (asset_id,)
        ) as cur:
            asset_row = await cur.fetchone()
        if asset_row is None:
            raise ValueError(f"asset {asset_id} not found")
        asset = dict(asset_row)

        async with conn.execute(
            "SELECT * FROM briefs WHERE project_id = ?", (asset["project_id"],)
        ) as cur:
            brief_row = await cur.fetchone()
        brief = dict(brief_row) if brief_row else {}

    prompt = _build_prompt(plan, asset, brief)
    layout = _cells_layout_json(plan)

    # Asset DAG: if this asset has a parent or a variant base, pin that
    # asset's sheet/master into slot @Image1 so identity locks across the
    # generation. Mara's gun → Mara's sheet; alley alcove → alley's sheet.
    from backend.providers.base import ReferenceImage
    refs: list[ReferenceImage] = []
    parent_id = asset.get("parent_asset_id") or asset.get("master_id")
    if parent_id:
        async with get_async_connection() as conn:
            async with conn.execute("SELECT * FROM assets WHERE id = ?", (parent_id,)) as cur:
                parent_row = await cur.fetchone()
            parent_sheet_url = None
            if parent_row:
                async with conn.execute(
                    "SELECT image_url FROM element_sheets WHERE asset_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1",
                    (parent_id,),
                ) as cur:
                    sheet_row = await cur.fetchone()
                if sheet_row and sheet_row["image_url"]:
                    parent_sheet_url = sheet_row["image_url"]
        parent_master_url = (parent_row and parent_row["image_url"]) or None
        parent_url = parent_sheet_url or parent_master_url
        if parent_url:
            refs.append(ReferenceImage(image_url=parent_url, slot=1, name="parent"))
            log.info("sheet_using_parent_reference", asset_id=asset_id, parent=parent_id, has_sheet=bool(parent_sheet_url))

    # Provider call — best-of-best per user mandate
    settings = get_settings()
    reg = get_registry()
    img_provider, model = reg.image_for_role("pro")  # Nano Banana Pro
    req = ImageGenRequest(
        prompt=prompt,
        model=model,
        aspect_ratio=plan.template.aspect_ratio,
        resolution="2048x2048",
        num_images=1,
        seed=seed,
        reference_images=refs,
    )

    try:
        result = await img_provider.generate(req)
    except ProviderError as e:
        log.error("sheet_generation_failed", asset_id=asset_id, error=str(e))
        raise

    image_url = result.image_urls[0]
    sheet_id = await _save_sheet_row(
        plan,
        image_url=image_url,
        prompt=prompt,
        layout_json=layout,
        panels_json=plan.template.cells,
        cost=result.cost_usd,
        model=result.model_used,
        seed=seed,
        request_id=result.image_id,
    )

    # Auto-register in reference_pool so the picker can find it
    from backend.orchestrator.references import register_image

    asset_type = (asset.get("type") or "").lower()
    await register_image(
        asset["project_id"],
        image_url,
        source_type="sheet",
        source_master_id=asset_id,
        character_ids=[asset_id] if asset_type == "character" else [],
        location_id=asset_id if asset_type == "location" else None,
        aspect_ratio=plan.template.aspect_ratio,
        tags={
            "role": "sheet",
            "sheet_id": sheet_id,
            "sheet_type": plan.template.sheet_type,
            "cells": plan.template.cells,
            "asset_type": asset_type,
        },
    )

    log.info(
        "sheet_generated",
        asset_id=asset_id,
        sheet_id=sheet_id,
        sheet_type=plan.template.sheet_type,
        panels=len(plan.template.cells),
        cost_usd=result.cost_usd,
        model=result.model_used,
    )

    return SheetGenResult(
        sheet_id=sheet_id,
        image_url=image_url,
        template_id=plan.template.template_id,
        sheet_type=plan.template.sheet_type,
        panels=plan.template.cells,
        layout=layout,
        cost_usd=result.cost_usd,
        rationale=plan.rationale,
    )


# ============================================================================
# Read API
# ============================================================================

async def get_active_sheet(asset_id: str) -> dict[str, Any] | None:
    """Return the currently-active sheet for an asset, or None."""
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT * FROM element_sheets WHERE asset_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1",
            (asset_id,),
        ) as cur:
            row = await cur.fetchone()
    if row is None:
        return None
    out = dict(row)
    out["layout"] = json.loads(out.get("layout_json") or "{}")
    out["panels"] = json.loads(out.get("panels_json") or "[]")
    out["rationale"] = json.loads(out.get("rationale_json") or "{}")
    return out


async def list_sheets_for_asset(asset_id: str) -> list[dict[str, Any]]:
    """All sheet versions for an asset, newest first."""
    async with get_async_connection() as conn:
        async with conn.execute(
            "SELECT id, sheet_type, template_id, image_url, is_active, status, created_at, cost_usd "
            "FROM element_sheets WHERE asset_id = ? ORDER BY created_at DESC",
            (asset_id,),
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]
