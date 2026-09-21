"""Sequence-level checks: whether the cuts hold together as an edit, not one frame at a time.

Individual takes are checked by `facts` and `judge`. Nothing there can see that two
consecutive cuts are the same picture, that the subject reverses direction mid-scene, that a
scene runs twice its share of the runtime, or that a declared match cut does not actually
match. These are deterministic reads over the declared graph; no pixels, no model.
"""

from __future__ import annotations

CAMERA_MATCH_FIELDS = ("camera.framing", "camera.angle", "camera.movement", "camera.height", "camera.lens")
DIRECTIONS = {"left", "right"}


def _cuts(studio, conn, project_id):
    rows = conn.execute(
        "SELECT c.*, sh.id AS shot_id, sh.name AS shot_name, sc.id AS scene_id, sc.name AS scene_name "
        "FROM nodes c JOIN nodes sh ON sh.id=c.parent_id JOIN nodes sc ON sc.id=sh.parent_id "
        "WHERE c.project_id=? AND c.kind='cut' ORDER BY sc.position, sh.position, c.position",
        (project_id,),
    ).fetchall()
    out = []
    for index, row in enumerate(rows, start=1):
        cut = dict(row)
        ctx = studio._context(conn, cut["id"])
        cut["values"] = ctx["values"]
        cut["index"] = index
        out.append(cut)
    return out


def review(studio, project_id):
    """Return the edit's structural findings, ordered worst first within each group."""
    with studio.store.connection() as conn:
        project = studio.store.one(conn, "nodes", project_id)
        if project["kind"] != "project":
            from backend.studio.store import StudioError

            raise StudioError("not_project", "Expected a project ID")
        cuts = _cuts(studio, conn, project_id)
        by_id = {cut["id"]: cut for cut in cuts}
        target = studio._context(conn, project_id)["values"].get("target_duration_seconds")
        findings = []

        def flag(code, message, cut=None, **extra):
            item = {"code": code, "message": message, **extra}
            if cut:
                item["node_id"] = cut["id"]
                item["cut"] = cut["name"]
                item["index"] = cut["index"]
            findings.append(item)

        # 1. screen direction: a reversal inside one scene without a declared crossing
        for previous, cut in zip(cuts, cuts[1:], strict=False):
            a, b = previous["values"].get("screen_direction"), cut["values"].get("screen_direction")
            if a in DIRECTIONS and b in DIRECTIONS and a != b and previous["scene_id"] == cut["scene_id"]:
                if "cross" not in str(cut["values"].get("action", "")).lower() + str(cut["values"].get("transition", "")).lower():
                    flag("direction_reversed",
                         f"Subject travels {a} in '{previous['name']}' and {b} here, inside one scene, with no declared crossing",
                         cut, previous=previous["id"])

        # 2. redundant coverage: neighbouring cuts that would render the same picture
        for previous, cut in zip(cuts, cuts[1:], strict=False):
            same = (
                previous["values"].get("location_id") == cut["values"].get("location_id")
                and previous["values"].get("camera.framing") == cut["values"].get("camera.framing")
                and previous["values"].get("camera.angle") == cut["values"].get("camera.angle")
                and sorted(previous["values"].get("visible_cast") or []) == sorted(cut["values"].get("visible_cast") or [])
            )
            if same and cut["values"].get("match_frame") != previous["id"] and previous["values"].get("camera.framing"):
                flag("coverage_repeats",
                     f"Same location, framing, angle and cast as '{previous['name']}'; either change the camera or declare match_frame",
                     cut, previous=previous["id"])

        # 3. match cuts: the pair must declare identical framing, and point backwards
        for cut in cuts:
            other_id = cut["values"].get("match_frame")
            if not other_id:
                continue
            other = by_id.get(other_id)
            if not other:
                flag("match_frame_missing", "match_frame names a cut outside this production", cut)
                continue
            if other["index"] > cut["index"]:
                flag("match_frame_forward", f"match_frame points forward to '{other['name']}'; a match cut refers to an earlier frame", cut)
            differing = [f for f in CAMERA_MATCH_FIELDS if cut["values"].get(f) != other["values"].get(f)]
            if differing:
                flag("match_frame_mismatch",
                     f"Declared a match with '{other['name']}' but {', '.join(differing)} differ; the pair cannot cut together",
                     cut, fields=differing, previous=other["id"])

        # 4. rhythm
        durations = [(cut, cut["values"].get("duration_seconds")) for cut in cuts]
        missing = [cut for cut, d in durations if not isinstance(d, (int, float))]
        if missing and len(missing) != len(cuts):
            flag("duration_partial", f"{len(missing)} of {len(cuts)} cuts have no duration; the edit's rhythm cannot be read")
        total = sum(d for _, d in durations if isinstance(d, (int, float)))
        if isinstance(target, (int, float)) and target and total:
            drift = (total - target) / target
            if abs(drift) > 0.15:
                flag("runtime_drift", f"Declared cuts total {total:g}s against a target of {target:g}s ({drift:+.0%})")
        scenes = {}
        for cut, d in durations:
            if isinstance(d, (int, float)):
                scenes.setdefault((cut["scene_id"], cut["scene_name"]), []).append(d)
        if total and len(scenes) > 2:
            share = {name: sum(v) / total for (_, name), v in scenes.items()}
            for name, value in sorted(share.items(), key=lambda kv: -kv[1]):
                if value > 0.4:
                    flag("scene_dominates", f"Scene '{name}' is {value:.0%} of the runtime")
        run, previous_framing = [], None
        for cut in cuts:
            framing = cut["values"].get("camera.framing")
            if framing and framing == previous_framing:
                run.append(cut)
            else:
                if len(run) >= 3:
                    flag("framing_monotony", f"{len(run) + 1} consecutive cuts share the framing '{previous_framing}'", run[0])
                run, previous_framing = [], framing
        if len(run) >= 3:
            flag("framing_monotony", f"{len(run) + 1} consecutive cuts share the framing '{previous_framing}'", run[0])

        # 5. beats: each cut should carry its own visual point
        points = {}
        for cut in cuts:
            point = str(cut["values"].get("beat.visual_point") or "").strip().lower()
            if point:
                points.setdefault(point, []).append(cut)
        for group in points.values():
            if len(group) > 1:
                flag("beat_repeats", "Cuts share one visual point: " + ", ".join(c["name"] for c in group), group[1],
                     others=[c["id"] for c in group[:-1]])

        # 6. evaluation coverage, per scene, so a gap cannot hide in an average
        coverage = {}
        for cut in cuts:
            key = cut["scene_name"]
            entry = coverage.setdefault(key, {"cuts": 0, "selected": 0, "evaluated": 0, "accepted": 0})
            entry["cuts"] += 1
            if cut["active_media_id"]:
                entry["selected"] += 1
                status = studio.rules.take_status(conn, studio.store.one(conn, "media", cut["active_media_id"]))
                entry["evaluated"] += 1 if status["evaluated"] else 0
                entry["accepted"] += 1 if status["accepted"] else 0
        for name, entry in coverage.items():
            if entry["selected"] and entry["evaluated"] < entry["selected"]:
                flag("scene_unevaluated", f"Scene '{name}': {entry['evaluated']} of {entry['selected']} selected takes evaluated")

        order = {"direction_reversed": 0, "match_frame_mismatch": 0, "match_frame_forward": 0, "match_frame_missing": 0,
                 "coverage_repeats": 1, "beat_repeats": 1, "scene_unevaluated": 1,
                 "runtime_drift": 2, "scene_dominates": 2, "framing_monotony": 2, "duration_partial": 2}
        findings.sort(key=lambda f: (order.get(f["code"], 3), f.get("index", 0)))
        return {
            "project_id": project_id,
            "cuts": len(cuts),
            "declared_runtime_seconds": total or None,
            "target_duration_seconds": target,
            "scenes": coverage,
            "findings": findings,
            "ok": not findings,
        }
