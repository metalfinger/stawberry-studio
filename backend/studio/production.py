"""Shared filmmaking rules. Relationships live in typed node fields, not a second graph."""

from __future__ import annotations

import json
import re

from backend.studio.fields import validate_field, warnings_for
from backend.studio.store import StudioError, digest, encoded

ASSET_KINDS = {"character", "location", "prop"}
LINK_FIELDS = {
    "available_cast": "character",
    "visible_cast": "character",
    "required_props": "prop",
    "continuity_from": "cut",
}
CUT_ONLY = {"continuity_from", "continuity.before", "continuity.after", "story_order"}


class ProductionRules:
    def __init__(self, studio):
        self.studio = studio
        self.store = studio.store

    def target(self, conn, node, target_id, kinds):
        if not isinstance(target_id, str):
            raise StudioError("relationship_type", "Relationships require stored node IDs")
        target = self.store.one(conn, "nodes", target_id)
        if target["project_id"] != node["project_id"] or target["kind"] not in kinds:
            raise StudioError(
                "relationship_target", f"{target['name']} is not a {', '.join(sorted(kinds))} in this project"
            )
        return target

    def validate_project(self, conn, project_id):
        links = {}
        for row in conn.execute("SELECT * FROM nodes WHERE project_id=?", (project_id,)):
            node = dict(row)
            local = json.loads(node["fields"])
            if node["kind"] != "cut" and CUT_ONLY.intersection(local):
                raise StudioError("field_scope", "Story order and continuity declarations belong to individual cuts")
            values = self.studio._context(conn, node["id"])["values"]
            for field, kind in LINK_FIELDS.items():
                if field not in values:
                    continue
                ids = values[field]
                if (
                    not isinstance(ids, list)
                    or any(not isinstance(item, str) for item in ids)
                    or len(ids) != len(set(ids))
                ):
                    raise StudioError("relationship_type", f"{field} must be a list of distinct node IDs")
                for target_id in ids:
                    self.target(conn, node, target_id, {kind})
            if "location_id" in values:
                self.target(conn, node, values["location_id"], {"location"})
            for field, value in values.items():
                validate_field(field, value, node)
            if "story_order" in values and (type(values["story_order"]) is not int or values["story_order"] < 1):
                raise StudioError("story_order", "Story order must be a positive integer")
            for field in ("continuity.before", "continuity.after"):
                states = values.get(field, {})
                if not isinstance(states, dict):
                    raise StudioError("state_type", f"{field} must map asset IDs to attribute/value objects")
                for asset_id, facts in states.items():
                    self.target(conn, node, asset_id, ASSET_KINDS)
                    if not isinstance(facts, dict) or any(not re.fullmatch(r"[a-z][a-z0-9_]*", key) for key in facts):
                        raise StudioError("state_type", "State attributes must use lower_case names")
                    if "owner_id" in facts and facts["owner_id"] is not None:
                        self.target(conn, node, facts["owner_id"], {"character", "location"})
            if node["kind"] == "cut":
                links[node["id"]] = values.get("continuity_from", [])
        visiting, complete = set(), set()

        def visit(cut_id):
            if cut_id in visiting:
                raise StudioError("continuity_cycle", "Continuity links must not form a cycle")
            if cut_id in complete:
                return
            visiting.add(cut_id)
            for source_id in links.get(cut_id, []):
                visit(source_id)
            visiting.remove(cut_id)
            complete.add(cut_id)

        for cut_id in links:
            visit(cut_id)

    @staticmethod
    def scope(context):
        values = context["values"]
        return {
            "characters": values.get("visible_cast", []),
            "location": values.get("location_id"),
            "props": values.get("required_props", []),
        }

    @staticmethod
    def asset_ids(scope):
        return list(
            dict.fromkeys([*scope["characters"], *([scope["location"]] if scope["location"] else []), *scope["props"]])
        )

    def definition(self, conn, node_id, cache=None, visiting=None):
        cache = {} if cache is None else cache
        visiting = set() if visiting is None else visiting
        if node_id in cache:
            return cache[node_id]
        if node_id in visiting:
            raise StudioError("continuity_cycle", "Cyclic production dependency")
        visiting.add(node_id)
        node = self.store.one(conn, "nodes", node_id)
        ctx = self.studio._context(conn, node_id)
        dependencies = []
        if node["kind"] == "cut":
            dependencies = self.asset_ids(self.scope(ctx)) + ctx["values"].get("continuity_from", [])
        signature = digest(
            {
                "values": ctx["values"],
                "cleared": ctx["cleared"],
                "sources": ctx["sources"],
                "ancestors": [{key: item[key] for key in ("id", "kind", "name", "notes")} for item in ctx["ancestors"]],
                "dependencies": {dep: self.definition(conn, dep, cache, visiting) for dep in dependencies},
            }
        )
        visiting.remove(node_id)
        cache[node_id] = signature
        return signature

    def review_context(self, conn, media):
        node = self.store.one(conn, "nodes", media["node_id"])
        cache = {}
        return digest(
            {
                "media": media["sha256"],
                "owner": self.definition(conn, node["id"], cache),
                "subjects": {
                    row["id"]: self.definition(conn, row["id"], cache)
                    for row in conn.execute(
                        "SELECT id FROM nodes WHERE project_id=? AND kind IN ('character','location','prop') ORDER BY id",
                        (node["project_id"],),
                    )
                },
                "requirements": [
                    {key: row[key] for key in ("id", "kind", "label", "instruction", "priority")}
                    for row in conn.execute(
                        "SELECT * FROM asset_requirements WHERE asset_id=? ORDER BY priority,created_at,id",
                        (node["id"],),
                    )
                ]
                if node["kind"] in ASSET_KINDS
                else [],
            }
        )

    def review(self, conn, media):
        row = conn.execute(
            "SELECT * FROM media_reviews WHERE media_id=? ORDER BY revision DESC LIMIT 1", (media["id"],)
        ).fetchone()
        if not row:
            return {
                "status": "pending",
                "revision": 0,
                "stale": False,
                "complete": False,
                "depicted_assets": [],
                "requirement_ids": [],
                "user_decision": "",
            }
        result = dict(row)
        result["depicted_assets"] = json.loads(result["depicted_assets"])
        result["subject_hashes"] = json.loads(result["subject_hashes"])
        result["requirement_ids"] = json.loads(result["requirement_ids"])
        result["requirement_hashes"] = json.loads(result["requirement_hashes"])
        cache = {}
        result["stale"] = result["definition_hash"] != self.definition(conn, media["node_id"], cache) or any(
            self.definition(conn, subject, cache) != expected for subject, expected in result["subject_hashes"].items()
        )
        node = self.store.one(conn, "nodes", media["node_id"])
        result["complete"] = node["kind"] != "cut" or set(
            self.asset_ids(self.scope(self.studio._context(conn, node["id"])))
        ) <= set(result["depicted_assets"])
        return result

    def selected(self, conn, node):
        if not node["active_media_id"]:
            return None
        media = self.store.one(conn, "media", node["active_media_id"])
        review = self.review(conn, media)
        return {
            "media_id": media["id"],
            "review_revision": review["revision"],
            "status": review["status"],
            "stale": review["stale"],
            "complete": review["complete"],
        }

    def continuity(self, conn, cut_id, cache=None, visiting=None):
        cache = {} if cache is None else cache
        visiting = set() if visiting is None else visiting
        if cut_id in cache:
            return cache[cut_id]
        if cut_id in visiting:
            raise StudioError("continuity_cycle", "Continuity links must not form a cycle")
        visiting.add(cut_id)
        values = self.studio._context(conn, cut_id)["values"]
        incoming, sources, issues = {}, [], []
        for source_id in values.get("continuity_from", []):
            node = self.store.one(conn, "nodes", source_id)
            source = self.continuity(conn, source_id, cache, visiting)
            selection = self.selected(conn, node)
            sources.append({"node_id": source_id, "name": node["name"], "selection": selection})
            if not selection or selection["status"] != "approved" or selection["stale"] or not selection["complete"]:
                issues.append(
                    {
                        "code": "continuity_take",
                        "node_id": source_id,
                        "message": f"Approve and select a current take for continuity source {node['name']}",
                    }
                )
            issues.extend(source["issues"])
            if source["conflicts"]:
                issues.append(
                    {
                        "code": "continuity_source_conflict",
                        "node_id": source_id,
                        "message": f"Resolve conflicting state in continuity source {node['name']}",
                    }
                )
            for key, candidates in source["outgoing"].items():
                incoming.setdefault(key, []).extend(candidates)
        for asset_id, facts in values.get("continuity.before", {}).items():
            for attribute, value in facts.items():
                incoming[f"{asset_id}/{attribute}"] = [
                    {"asset_id": asset_id, "attribute": attribute, "value": value, "source_cut": cut_id}
                ]
        conflicts = []
        for key, candidates in incoming.items():
            incoming[key] = list({encoded(item): item for item in candidates}.values())
            if len({encoded(item["value"]) for item in candidates}) > 1:
                conflicts.append({"field": key, "candidates": incoming[key]})
        outgoing = {key: list(candidates) for key, candidates in incoming.items()}
        for asset_id, facts in values.get("continuity.after", {}).items():
            for attribute, value in facts.items():
                outgoing[f"{asset_id}/{attribute}"] = [
                    {"asset_id": asset_id, "attribute": attribute, "value": value, "source_cut": cut_id}
                ]
        result = {
            "sources": sources,
            "incoming": incoming,
            "outgoing": outgoing,
            "conflicts": conflicts,
            "issues": issues,
        }
        visiting.remove(cut_id)
        cache[cut_id] = result
        return result

    def resolve(self, conn, node_id):
        node = self.store.one(conn, "nodes", node_id)
        ctx = self.studio._context(conn, node_id)
        scope, issues, assets = self.scope(ctx), [], []
        continuity = self.continuity(conn, node_id) if node["kind"] == "cut" else None
        if node["kind"] == "cut":
            values = ctx["values"]
            for field in ("visible_cast", "required_props"):
                if field not in values:
                    issues.append(
                        {
                            "code": "scope_missing",
                            "field": field,
                            "node_id": node_id,
                            "message": f"Declare {field}, including an empty list when none appear",
                        }
                    )
            if "location_id" not in values and "location_id" not in ctx["cleared"]:
                issues.append(
                    {
                        "code": "scope_missing",
                        "field": "location_id",
                        "node_id": node_id,
                        "message": "Choose the exact location or explicitly clear the location requirement",
                    }
                )
            if not isinstance(values.get("style"), str) or not values["style"].strip():
                issues.append({"code": "style_missing", "node_id": node_id, "message": "Set the intended visual style"})
            if not node["notes"].strip() and not str(values.get("action", "")).strip():
                issues.append(
                    {
                        "code": "action_missing",
                        "node_id": node_id,
                        "message": "Describe this cut's action in its notes or action field",
                    }
                )
            for asset_id in self.asset_ids(scope):
                asset = self.store.one(conn, "nodes", asset_id)
                selection = self.selected(conn, asset)
                assets.append(
                    {
                        "id": asset_id,
                        "name": asset["name"],
                        "kind": asset["kind"],
                        "selection": selection,
                        "context": self.studio._context(conn, asset_id),
                    }
                )
                if not selection or selection["status"] != "approved" or selection["stale"]:
                    issues.append(
                        {
                            "code": "asset_reference",
                            "node_id": asset_id,
                            "message": f"Approve and select a current reference for {asset['name']}",
                        }
                    )
            issues.extend(continuity["issues"])
            for conflict in continuity["conflicts"]:
                issues.append(
                    {
                        "code": "state_conflict",
                        "node_id": node_id,
                        "field": conflict["field"],
                        "message": "Resolve contradictory incoming continuity states explicitly",
                    }
                )
        return {
            "scope": scope,
            "assets": assets,
            "continuity": continuity,
            "readiness": {"ready": not issues, "issues": issues},
        }

    def warnings(self, conn, node_id):
        """Advisory gaps. Kept out of resolve() so they never enter a frozen generation context."""
        node = self.store.one(conn, "nodes", node_id)
        ctx = self.studio._context(conn, node_id)
        return warnings_for(node, ctx["values"], ctx["cleared"])

    def validate_recipe(self, conn, node_id, references):
        production = self.resolve(conn, node_id)
        issues = list(production["readiness"]["issues"])
        covered = {"character": set(), "location": set(), "prop": set()}
        for ref in references:
            media = self.store.one(conn, "media", ref["media_id"])
            owner = self.store.one(conn, "nodes", media["node_id"])
            review = self.review(conn, media)
            if review["status"] != "approved" or review["stale"]:
                issues.append(
                    {
                        "code": "reference_review",
                        "media_id": media["id"],
                        "message": f"Review reference {media['label']} against its current definition",
                    }
                )
                continue
            subjects = ref.get("subjects") or (
                [owner["id"]]
                if owner["kind"] in ASSET_KINDS
                else review["depicted_assets"]
                if ref["role"] in {"base", "start_frame", "end_frame"}
                else []
            )
            if not set(subjects) <= set(review["depicted_assets"]):
                issues.append(
                    {
                        "code": "reference_subject",
                        "media_id": media["id"],
                        "message": "Reference subjects must have been confirmed on this exact image",
                    }
                )
            for subject in subjects:
                asset = self.target(conn, owner, subject, ASSET_KINDS)
                kind = asset["kind"]
                if (
                    ref["role"] in {"base", "start_frame", "end_frame"}
                    or ref["role"] == {"character": "identity", "location": "location", "prop": "prop"}[kind]
                ):
                    covered[kind].add(subject)
        node = self.store.one(conn, "nodes", node_id)
        if node["kind"] == "cut":
            for asset in production["assets"]:
                if asset["id"] not in covered[asset["kind"]]:
                    issues.append(
                        {
                            "code": "reference_coverage",
                            "node_id": asset["id"],
                            "message": f"Attach a reviewed {asset['kind']} reference for {asset['name']} with the matching role",
                        }
                    )
        if issues:
            error = StudioError("production_not_ready", "; ".join(issue["message"] for issue in issues), 409)
            error.issues = issues
            raise error
        return production
