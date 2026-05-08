"""Post-turn ordering pass.

Runs after every Pydantic-AI agent turn. Walks the model's response in
author-intended order, finds every add_scene / add_shot / add_cut tool
call, extracts the new ids from each tool's return value, and reorders
the rows so the on-disk numbering matches the *position in the model
response* — not the order in which pydantic-ai dispatched them.

Why this lives here, not in the tools:
- pydantic-ai parallelizes tool execution. Atomic INSERTs prevent
  duplicate numbers but can't preserve author intent.
- The model's `ModelResponse` parts are emitted in a deterministic order
  that reflects what the agent intended.
- Reordering AFTER the turn is idempotent and safe to repeat.

Heuristic for safety:
- We only auto-reorder when the agent's batch created 2+ siblings AND
  those siblings cover EVERY child of that parent (so we're not
  re-shuffling an existing project the user already curated).
- Mid-project insertions still use the explicit `scene_number` /
  `shot_number` / `cut_number` parameter on add_*.
"""
from __future__ import annotations

import json
import re
from typing import Any

import structlog

from backend import db

log = structlog.get_logger(__name__)

_SCENE_ID_RE = re.compile(r"(scene_[0-9a-f]+)")
_SHOT_ID_RE = re.compile(r"(shot_[0-9a-f]+)")
_CUT_ID_RE = re.compile(r"(cut_[0-9a-f]+)")


def _coerce_args(args: Any) -> dict:
    if args is None:
        return {}
    if isinstance(args, dict):
        return args
    if isinstance(args, str):
        try:
            return json.loads(args)
        except Exception:
            return {}
    return {}


def _extract_id(text: Any, regex: re.Pattern) -> str | None:
    if text is None:
        return None
    m = regex.search(str(text))
    return m.group(1) if m else None


def _scan_tool_calls(result_messages: list[Any]) -> tuple[list[str], dict[str, list[str]], dict[str, list[str]]]:
    """Walk all messages and return:
        scenes_in_order — list of scene_ids added this turn, author-order
        shots_in_scene  — { scene_id: [shot_id, ...] }, author-order per scene
        cuts_in_shot    — { shot_id:  [cut_id, ...] },  author-order per shot
    """
    from pydantic_ai.messages import ModelRequest, ModelResponse, ToolCallPart, ToolReturnPart

    scenes_in_order: list[str] = []
    shots_in_scene: dict[str, list[str]] = {}
    cuts_in_shot: dict[str, list[str]] = {}

    # Map tool_call_id -> (tool_name, args, position) preserving
    # response-stream order.
    calls: dict[str, tuple[str, dict, int]] = {}
    pos = 0
    for msg in result_messages or []:
        if isinstance(msg, ModelResponse):
            for part in msg.parts:
                if isinstance(part, ToolCallPart):
                    calls[part.tool_call_id] = (part.tool_name, _coerce_args(part.args), pos)
                    pos += 1
    # Map tool_call_id -> return content
    returns: dict[str, Any] = {}
    for msg in result_messages or []:
        if isinstance(msg, ModelRequest):
            for part in msg.parts:
                if isinstance(part, ToolReturnPart):
                    returns[part.tool_call_id] = part.content

    # Walk in stream position order.
    for call_id, (name, args, _p) in sorted(calls.items(), key=lambda kv: kv[1][2]):
        ret = returns.get(call_id)
        if ret is None:
            continue
        if name == "add_scene":
            sid = _extract_id(ret, _SCENE_ID_RE)
            if sid:
                scenes_in_order.append(sid)
        elif name == "add_shot":
            scene_id = args.get("scene_id")
            shot_id = _extract_id(ret, _SHOT_ID_RE)
            if scene_id and shot_id:
                shots_in_scene.setdefault(scene_id, []).append(shot_id)
        elif name == "add_cut":
            shot_id = args.get("shot_id")
            cut_id = _extract_id(ret, _CUT_ID_RE)
            if shot_id and cut_id:
                cuts_in_shot.setdefault(shot_id, []).append(cut_id)

    return scenes_in_order, shots_in_scene, cuts_in_shot


def reorder_from_turn(project_id: str, result_messages: list[Any]) -> dict[str, int]:
    """Inspect a finished agent turn and renumber to match author order.

    Returns a small dict counting what was reordered. Best-effort —
    failures are logged and swallowed; nothing here should ever break a
    chat turn.
    """
    if not project_id:
        return {"scenes": 0, "shots": 0, "cuts": 0, "skipped": "no project_id"}

    try:
        scenes, shots_by_scene, cuts_by_shot = _scan_tool_calls(result_messages)
    except Exception as e:  # noqa: BLE001
        log.warning("turn_ordering.scan_failed", error=str(e))
        return {"scenes": 0, "shots": 0, "cuts": 0, "skipped": "scan failed"}

    counts = {"scenes": 0, "shots": 0, "cuts": 0}

    # Avoid a circular import — these tools are simple sync DB writes.
    from backend.tools.blueprint import reorder_scenes, reorder_shots, reorder_cuts

    # Scenes: only auto-reorder when this turn covers EVERY scene in the
    # project (the "fresh blueprint" case). Mid-project insertions go
    # through the explicit scene_number arg on add_scene.
    if len(scenes) >= 2:
        try:
            existing = db.get_scenes(project_id) or []
            if len(existing) == len(scenes) and set(scenes) == {s["id"] for s in existing}:
                msg = reorder_scenes(project_id, scenes)
                if msg.startswith("✅"):
                    counts["scenes"] = len(scenes)
                    log.info("turn_ordering.scenes_reordered", project_id=project_id, n=len(scenes))
        except Exception as e:  # noqa: BLE001
            log.warning("turn_ordering.scene_reorder_failed", error=str(e))

    # Shots: per scene, reorder when the turn added every shot of that scene.
    for scene_id, shot_ids in shots_by_scene.items():
        if len(shot_ids) < 2:
            continue
        try:
            existing = db.get_shots(scene_id) or []
            if len(existing) == len(shot_ids) and set(shot_ids) == {s["id"] for s in existing}:
                msg = reorder_shots(scene_id, shot_ids)
                if msg.startswith("✅"):
                    counts["shots"] += len(shot_ids)
                    log.info("turn_ordering.shots_reordered", scene_id=scene_id, n=len(shot_ids))
        except Exception as e:  # noqa: BLE001
            log.warning("turn_ordering.shot_reorder_failed", scene_id=scene_id, error=str(e))

    # Cuts: per shot, reorder when the turn added every cut of that shot.
    for shot_id, cut_ids in cuts_by_shot.items():
        if len(cut_ids) < 2:
            continue
        try:
            existing = db.get_cuts(shot_id) or []
            if len(existing) == len(cut_ids) and set(cut_ids) == {c["id"] for c in existing}:
                msg = reorder_cuts(shot_id, cut_ids)
                if msg.startswith("✅"):
                    counts["cuts"] += len(cut_ids)
                    log.info("turn_ordering.cuts_reordered", shot_id=shot_id, n=len(cut_ids))
        except Exception as e:  # noqa: BLE001
            log.warning("turn_ordering.cut_reorder_failed", shot_id=shot_id, error=str(e))

    return counts
