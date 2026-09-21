"""Shared filmmaking rules. Relationships live in typed node fields, not a second graph."""

from __future__ import annotations

import json
import re

from backend.studio.fields import policy as resolve_policy
from backend.studio.fields import validate_field, warnings_for
from backend.studio.store import StudioError, digest, encoded

ASSET_KINDS = {"character", "location", "prop"}
LINK_FIELDS = {
    "available_cast": "character",
    "visible_cast": "character",
    "required_props": "prop",
    "continuity_from": "cut",
}
CUT_ONLY = {"continuity_from", "continuity.before", "continuity.after", "story_order", "match_frame"}


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
            if values.get("match_frame"):
                if values["match_frame"] == node["id"]:
                    raise StudioError("match_frame", "A cut cannot match itself")
                self.target(conn, node, values["match_frame"], {"cut"})
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
                # policy is about process, not the picture: changing it must not stale a visual review
                "values": {k: v for k, v in ctx["values"].items() if not k.startswith("policy.")},
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
        result.setdefault("author", "human")
        scoped = set(self.asset_ids(self.scope(self.studio._context(conn, node["id"])))) if node["kind"] == "cut" else set()
        covered = scoped <= set(result["depicted_assets"])
        if covered and node["kind"] == "cut" and result["author"] != "human":
            # a non-human confirmation only counts where a current facts record shows the asset
            facts = self.current_evaluation(conn, media, "facts")
            seen = self.assets_seen(facts) if facts else set()
            covered = scoped <= seen
        result["complete"] = node["kind"] != "cut" or covered
        return result

    def current_evaluation(self, conn, media, kind):
        row = conn.execute(
            "SELECT * FROM evaluations WHERE media_id=? AND context_hash=? AND kind=? ORDER BY sequence DESC LIMIT 1",
            (media["id"], self.review_context(conn, media), kind),
        ).fetchone()
        return self.studio._evaluation(row) if row else None

    @staticmethod
    def assets_seen(facts):
        """Assets whose presence question scored >= 0.5 in a facts record."""
        seen = set()
        for item in facts["evidence"]:
            qid = item.get("question_id") or ""
            if qid.split(":")[0] in {"cast", "location", "prop", "subject"} and (item.get("probability") or 0) >= 0.5:
                seen.add(item["asset_id"])
        return seen

    def policy(self, conn, node_id):
        return resolve_policy(self.studio._context(conn, node_id)["values"])

    def take_status(self, conn, media, pol=None):
        """Where a take stands against the project's evaluation gate. Never touches review status."""
        pol = pol or self.policy(conn, media["node_id"])
        facts = self.current_evaluation(conn, media, "facts")
        judge = self.current_evaluation(conn, media, "judge")
        stranger = self.current_evaluation(conn, media, "stranger")
        duplicate = self.current_evaluation(conn, media, "duplicate")
        reasons = []
        if not facts:
            reasons.append("no current facts record")
        if not judge:
            reasons.append("no current judge record")
        score = None
        if facts:
            asked, answered = facts["scores"].get("asked", 0), facts["scores"].get("answered", 0)
            if asked and answered < asked:
                # a partial answer sheet is the question-level form of a partial pass
                reasons.append(f"facts record answers {int(answered)} of {int(asked)} questions")
        if facts and judge:
            score = min(facts["scores"].get("min_group", facts["scores"].get("geometric_mean", 0.0)), judge["scores"].get("overall", 0.0))
            if facts["scores"].get("capped"):
                reasons.append("a capped fact missed")
            if score < pol["min_take_score"]:
                reasons.append(f"score {score:.2f} below policy.min_take_score {pol['min_take_score']}")
        if duplicate and any(d["tag"] == "copy_paste" for d in duplicate["discrepancies"]):
            reasons.append("near-identical to a sibling beat")
        # an existing second opinion always counts; the policy only decides whether one is required
        if stranger and facts:
            gap = abs(stranger["scores"].get("min_group", 0) - facts["scores"].get("min_group", 0))
            if gap > 0.25:
                disputed = sorted(
                    (name for name, value in stranger["scores"].get("groups", {}).items()
                     if abs(value - facts["scores"].get("groups", {}).get(name, value)) > 0.25),
                )
                reasons.append(
                    f"a second evaluator disagrees by {gap:.2f}"
                    + (" on " + ", ".join(disputed) if disputed else "")
                    + "; look again before using this take"
                )
            if stranger["scores"].get("min_group", 1.0) < pol["min_take_score"]:
                reasons.append(f"the second evaluator scores it {stranger['scores']['min_group']:.2f}, below policy.min_take_score")
        elif pol["require_stranger"] and not stranger:
            reasons.append("no stranger record")
        return {
            "media_id": media["id"],
            "evaluated": bool(facts and judge and facts["scores"].get("answered", 0) >= facts["scores"].get("asked", 0)),
            "second_opinion": stranger["scores"].get("min_group") if stranger else None,
            "score": score,
            "accepted": not reasons,
            "reasons": reasons,
            "records": {k: (v["sequence"] if v else None) for k, v in (("facts", facts), ("judge", judge), ("stranger", stranger), ("duplicate", duplicate))},
        }

    def takes_used(self, conn, cut_id):
        return conn.execute(
            "SELECT COUNT(*) FROM media WHERE node_id=? AND job_id IS NOT NULL", (cut_id,)
        ).fetchone()[0]

    def recipe_gaps(self, conn, node_id, references, prompt):
        """Pre-generation checks. Advisory by default; issues in autonomous mode."""
        pol = self.policy(conn, node_id)
        node = self.store.one(conn, "nodes", node_id)
        ctx = self.studio._context(conn, node_id)
        gaps = []
        low = prompt.lower()
        if node["kind"] == "cut":
            for asset_id in self.asset_ids(self.scope(ctx)):
                asset = self.store.one(conn, "nodes", asset_id)
                actx = self.studio._context(conn, asset_id)["values"]
                for token in actx.get("consistency_tokens") or []:
                    if token.lower() not in low:
                        gaps.append({"code": "prompt_unbound", "node_id": asset_id, "token": token,
                                     "message": f"Prompt does not quote {asset['name']}'s lock '{token}'"})
            for token in ctx["values"].get("bible.tokens") or []:
                if token.lower() not in low:
                    gaps.append({"code": "prompt_unbound", "node_id": node["project_id"], "token": token,
                                 "message": f"Prompt does not quote the bible token '{token}'"})
            used = self.takes_used(conn, node_id)
            if used >= pol["max_takes_per_cut"]:
                gaps.append({"code": "take_budget", "node_id": node_id,
                             "message": f"{used} takes already generated for this cut; policy.max_takes_per_cut is {pol['max_takes_per_cut']}"})
        for ref in references:
            media = self.store.one(conn, "media", ref["media_id"])
            owner = self.store.one(conn, "nodes", media["node_id"])
            facts = self.current_evaluation(conn, media, "facts")
            if owner["kind"] != "cut":
                # a sheet need not be evaluated, but an evaluated sheet that failed must not be
                # used: whatever it got wrong is inherited by every cut built on it
                if facts and (facts["scores"].get("capped") or facts["scores"].get("min_group", 1.0) < pol["min_take_score"]):
                    weakest = min(facts["scores"].get("groups", {}).items(), key=lambda kv: kv[1], default=("", 1.0))
                    gaps.append({"code": "reference_unfit", "media_id": media["id"],
                                 "message": f"Reference sheet {media['label']} failed its own evaluation"
                                            f" ({weakest[0]} {weakest[1]:.2f}); fix the sheet before building cuts on it"})
                continue
            if not facts:
                gaps.append({"code": "reference_unevaluated", "media_id": media["id"],
                             "message": f"Reference {media['label']} is a take with no current facts record"})
                continue
            failed = [e for e in facts["evidence"] if e.get("probability") is not None and e["probability"] < 0.5
                      and (e.get("question_id") or "").split(":")[0] in {"cast", "state", "pose", "prop", "location"}]
            if failed or facts["scores"].get("capped"):
                gaps.append({"code": "reference_unfit", "media_id": media["id"],
                             "failed": [e["question"] for e in failed][:5],
                             "message": f"Reference {media['label']} failed its own facts: " + "; ".join(e["question"] for e in failed[:3])})
        # If the prompt is going to draw a thing that has already been drawn, it must look at
        # the drawing. A location sheet that renders a declared prop from its description alone
        # produces a second, different machine — and nothing downstream can tell which one is
        # the prop. The name is the signal: cheap, and wrong only in the harmless direction.
        held = {ref["media_id"] for ref in references}
        for row in conn.execute(
            "SELECT id,name,active_media_id FROM nodes WHERE project_id=? AND kind IN "
            "('character','location','prop') AND active_media_id IS NOT NULL AND id<>? ORDER BY id",
            (node["project_id"], node_id),
        ).fetchall():
            if row["active_media_id"] in held:
                continue
            # an asset carried as text on purpose — a provider refuses its image, so it is
            # described and never shown — is not an unreferenced sheet, it is a declared choice
            if self.studio._context(conn, row["id"])["values"].get("reference_mode") == "text":
                continue
            bare = re.sub(r"^(the|a|an)\s+", "", row["name"].strip().lower())
            if bare and re.search(r"\b" + re.escape(bare) + r"\b", low):
                gaps.append({"code": "sheet_unreferenced", "node_id": row["id"],
                             "media_id": row["active_media_id"],
                             "message": f"The prompt draws {row['name']}, which already has a selected sheet. "
                                        f"Reference that sheet or the two will not be the same object"})
        return gaps


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

    def evaluated(self, conn, media, kinds=("judge", "facts")):
        """True when an evaluation of one of `kinds` is bound to this image's current definitions."""
        context = self.review_context(conn, media)
        placeholders = ",".join("?" for _ in kinds)
        return bool(
            conn.execute(
                f"SELECT 1 FROM evaluations WHERE media_id=? AND context_hash=? AND kind IN ({placeholders}) LIMIT 1",
                (media["id"], context, *kinds),
            ).fetchone()
        )

    def warnings(self, conn, node_id):
        """Advisory gaps. Kept out of resolve() so they never enter a frozen generation context."""
        node = self.store.one(conn, "nodes", node_id)
        ctx = self.studio._context(conn, node_id)
        out = warnings_for(node, ctx["values"], ctx["cleared"])
        if node["kind"] == "cut" and node["active_media_id"]:
            media = self.store.one(conn, "media", node["active_media_id"])
            status = self.take_status(conn, media)
            if not status["evaluated"]:
                out.append({"code": "take_unevaluated", "node_id": node_id, "media_id": media["id"],
                            "message": "The selected take has no current facts and judge records"})
            elif not status["accepted"]:
                out.append({"code": "take_below_threshold", "node_id": node_id, "media_id": media["id"],
                            "message": "The selected take does not pass the evaluation gate: " + "; ".join(status["reasons"])})
            review = self.review(conn, media)
            facts = self.current_evaluation(conn, media, "facts")
            if facts:
                for item in facts["evidence"]:
                    qid = item.get("question_id") or ""
                    if qid.split(":")[0] in {"cast", "prop", "location"} and item.get("probability") is not None \
                            and item["probability"] < 0.2 and item["asset_id"] in review["depicted_assets"]:
                        out.append({"code": "review_contradicted", "node_id": node_id, "media_id": media["id"],
                                    "field": item["asset_id"],
                                    "message": f"Review confirms an asset the facts record does not see: {item['question']}"})
        if node["kind"] == "cut":
            for asset_id in self.asset_ids(self.scope(ctx)):
                asset = self.store.one(conn, "nodes", asset_id)
                if asset["active_media_id"]:
                    media = self.store.one(conn, "media", asset["active_media_id"])
                    if not self.evaluated(conn, media):
                        out.append(
                            {
                                "code": "reference_unevaluated",
                                "node_id": asset_id,
                                "media_id": media["id"],
                                "message": f"No evaluation is recorded for {asset['name']}'s selected reference",
                            }
                        )
        return out

    def validate_recipe(self, conn, node_id, references, prompt=""):
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
        ctx = self.studio._context(conn, node_id)
        pol = resolve_policy(ctx["values"])
        low = (prompt or "").lower()
        for asset in production["assets"]:
            actx = asset["context"]["values"]
            tokens = actx.get("consistency_tokens") or []
            if actx.get("reference_mode") == "text" and tokens and all(t.lower() in low for t in tokens):
                covered[asset["kind"]].add(asset["id"])  # identity carried by its quoted locks
        if pol["autonomous"]:
            for gap in self.recipe_gaps(conn, node_id, references, prompt):
                if gap["code"] in {"reference_unfit", "take_budget"} or (gap["code"] == "prompt_unbound" and gap["node_id"] != node["project_id"]):
                    issues.append(gap)
        explicit = ctx["values"].get("policy.require_evaluation_for_reference") is True
        if explicit or pol["autonomous"]:
            for ref in references:
                media = self.store.one(conn, "media", ref["media_id"])
                owner_kind = self.store.one(conn, "nodes", media["node_id"])["kind"]
                if not explicit and owner_kind != "cut":
                    continue  # autonomous mode gates reused takes; sheets stay a warning unless asked for explicitly
                if not self.evaluated(conn, media):
                    issues.append(
                        {
                            "code": "reference_unevaluated",
                            "media_id": media["id"],
                            "message": f"Project policy requires an evaluation of {media['label']} before it is reused",
                        }
                    )
        if node["kind"] == "cut":
            for asset in production["assets"]:
                if asset["id"] not in covered[asset["kind"]]:
                    text_only = asset["context"]["values"].get("reference_mode") == "text"
                    issues.append(
                        {
                            "code": "reference_coverage",
                            "node_id": asset["id"],
                            "message": (
                                f"{asset['name']} is text-only: quote every one of its consistency_tokens in the prompt"
                                if text_only else
                                f"Attach a reviewed {asset['kind']} reference for {asset['name']} with the matching role"
                            ),
                        }
                    )
        if issues:
            error = StudioError("production_not_ready", "; ".join(issue["message"] for issue in issues), 409)
            error.issues = issues
            raise error
        return production
