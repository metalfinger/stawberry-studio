---
name: strawberry-production
description: Operate Strawberry Studio from Codex using its local production engine and viewer. Use for story development, scene/shot/cut breakdown, casting, location/prop sheets, continuity, reference preparation, generation approvals, and take review.
---

# Human-directed filmmaking in Strawberry

## Operating boundary

One Codex conversation coordinates the user. You perform the creative reasoning;
the engine persists structured work and executes frozen, approved recipes. Do
not invoke the old Berry/Sage/Atlas/Pixel LLM runtime or call Higgsfield directly
for production work, bypassing Strawberry's receipts and approval records.

Run from this repository. CLI entry: `venv/bin/python -m backend.studio`.
Use `--home PATH` before the command only when operating an explicitly chosen
isolated store. The default is `.strawberry/`; never mix project IDs across stores.
Read the command help when unsure. JSON input commands accept a file or `-`.
Errors are structured JSON on stderr and nonzero exits; don't claim success
from a natural-language response without a successful persisted operation.

The current implementation is a migration proof, not full parity. Missing
features and release gates are recorded in `MIGRATION_PLAN.md`. Do not pretend
the offline fixture proves visual quality or that a skill is an enforcement layer.

## Resume and capture

1. List `projects`; inspect the requested `project ID`. Never invent IDs from
   prose. Resolve scene/shot/cut by the actual parent IDs and stored positions.
2. Capture relevant user instructions with `capture NODE_ID input.json`, preserving
   the original text. Payload: `text`, `author` (user/assistant/observation),
   `status` (instruction/proposal/approved/observation). Do not log unrelated chat
   or claim automatic access to messages that the host did not provide.
3. Read `inspect NODE_ID` and `context NODE_ID`, including notes and provenance.
   Retrieve related nodes and original sources as needed. Store all meaningful
   detail; don't replace it with a lossy summary to save tokens.
4. Separate user intent, your suggestions and approved decisions. Use `patch`
   only at the correct scope with the current `expected_revision`, a reason and
   relevant `source_id`. Do not overwrite an intervening user edit on conflict.

## Creative roles

Use these as responsibilities, not greetings or required model calls:

- **Director (Berry):** clarify intent and develop the story/visual direction.
  Preserve explicit casting, era, style, duration and constraints. Do not silently
  replace a named person with a fictional character. Report actual provider
  restrictions/errors rather than guessing their cause.
- **Story Architect (Sage/Nova):** break the narrative into scenes, shots and
  visual cuts, with action, timing, dialogue and camera intent. Preserve story
  chronology separately from editorial order. Ask before materially changing
  the user's story, not before every routine saved record.
- **Production Designer (Atlas):** derive characters, locations/sublocations,
  props, wardrobe and states from the whole breakdown. Reconcile aliases and
  reuse identities. Decide useful sheet views from planned shot coverage.
- **Prompt Director (Pixel):** inspect actual source images; choose a fresh
  composition or an edit base; select precise versions, roles and image order;
  write the final model-appropriate prompt against that list.
- **Script Supervisor:** check state transitions, screen direction, geography,
  eyelines, costume, prop ownership and lighting/story time. Flag discrepancies
  and propose changes. The human remains the visual critic.

These roles can be revisited or combined. Structure is a dependency guide, not
a one-way phase lock. Parent edits must not silently rewrite existing take
recipes or trigger billable regeneration. Use sub-agents only when authorized,
for bounded proposals with explicit node scope and revisions. They do not
independently approve, mutate canonical production records, or submit jobs.

## Node operations

`create input.json` accepts `kind`, `name`, `parent_id` and optional `notes`.
Kinds: project, scene, shot, cut, character, location, prop. Assets are linked
under the project; nested locations are permitted. Existing shot/cut terminology
is retained during this proof. Scene/shot/cut positions are assigned atomically.

`patch NODE_ID input.json` accepts `expected_revision`, `reason`, optional
`source_id`, `name`, `notes`, and `changes`. Changes use dotted leaf field names:

```json
{
  "expected_revision": 1,
  "reason": "User approved the rainy platform scene",
  "changes": {
    "lighting.color": {"op": "set", "value": "cool dawn"},
    "visible_cast": {"op": "set", "value": []},
    "music": {"op": "clear"}
  }
}
```

Absent local values inherit. `set` overrides, `clear` suppresses inheritance,
`inherit` removes a local override. `add`/`remove` apply to collections. Read
`PRODUCTION_CONTRACTS.md` for validated relationship and continuity fields.

- `available_cast` lists possible characters; `visible_cast` declares the actual
  intended frame. Both use stored character IDs, never names. An empty visible
  list means nobody. Missing visible cast means unknown, not "everyone available".
- `location_id` identifies the exact location/sublocation. Explicit `clear` means
  no location requirement. A parent location does not silently cover a sublocation.
- `required_props` uses prop IDs; explicitly set `[]` when no props appear.
- Cuts require `style` (normally inherited), and an `action` or local action notes.
- Cut-local `story_order` is chronology. `reorder PARENT_ID input.json` changes
  editorial positions using `kind`, `ordered_ids`, `expected_revisions` for every
  sibling of that kind, and `reason`. It never changes story chronology.
- Cut-local `continuity_from` lists earlier story-state sources, not necessarily
  adjacent editorial cuts. `continuity.before` / `continuity.after` map asset IDs
  to attribute/value objects. Conflicting incoming states require explicit before
  values. `owner_id` must refer to a character/location or null. Cycles fail.

Read `readiness NODE_ID` and `context NODE_ID` before preparing. Context includes
linked asset definitions and selected references, continuity state/provenance and
actionable blockers. These are authored facts, not simulated physics or verified
pixels. Approved selected upstream cuts are required for continuity dependencies.

## Sheets and reference library

Plan character, location and prop sheets before storyboard generation. A sheet
may be one multi-view image or several base-conditioned views. Do not enforce
a universal grid, identity-first extra generation, or speculative turnarounds.
Every generated take is retained. The current strict execution path accepts only
approved, fresh references. Scoped reuse of rejected images is not implemented;
do not bypass that check or pretend rejection means approved identity truth.

Import approved local inputs with `import-media NODE_ID PATH --label LABEL`.
This copies bytes into managed media storage and records a checksum. Importing
is not visual approval. Inspect `media MEDIA_ID` and show the exact image to the
human. Record their decision with `review MEDIA_ID input.json`:

```json
{
  "expected_revision": 0,
  "expected_context": "COPY_THE_REVIEW_CONTEXT_HASH_FROM_MEDIA_RESPONSE",
  "status": "approved",
  "user_decision": "The user's actual review decision",
  "depicted_assets": ["CONFIRMED_ASSET_ID"]
}
```

Use `media.review.revision`, not the node revision. The returned `review_context`
binds current definitions; stale review windows fail instead of approving unseen
changes. For asset sheets, the owning asset is implicit. On cut images, only
record entities the human confirms are present, not everything the prompt asked
for. An image may be approved as a partial reference without being a final cut.
Select with `select NODE_ID MEDIA_ID --revision N` using the current node revision.
Final cut selection also checks readiness and confirmed visible subject coverage.
Review history is append-only. Changed definitions require explicit re-review;
old media remain stored. Never overwrite a previous take to implement a redo.

## Prepare, approve, execute

1. Inspect the cut context, all relevant assets and selected existing takes,
   including non-adjacent cuts. Inspect pixels, not only old prompts.
2. Prepare a JSON recipe with `node_id`, `provider`, `model`, `intent`, final
   `prompt`, `settings`, and ordered `references`. Each reference has `media_id`,
   `role` and `instruction` describing what to borrow/preserve/exclude. Add
   `subjects` with confirmed asset IDs when borrowing entities from a multi-asset
   cut image. Roles:
   base, identity, wardrobe, location, prop, pose, composition, lighting, style,
   start_frame, end_frame. An edit base is optional, with at most one per recipe.
   Identity, location and prop roles must cover the required assets; composition
   or style cannot stand in for identity. Base/start/end frames can cover their
   confirmed subjects. No automatic choice of the most recent cut.
3. Call `prepare input.json`. Higgsfield preparation discovers schema/defaults
   read-only and freezes the effective settings. Do not assume a model's API
   capability or website subscription benefit is exposed through this CLI.
4. Present the exact prompt, ordered image previews, roles, requested changes,
   provider/model and known cost. Unknown cost is not zero. Obtain the user's
   approval for that recipe or a bounded set of displayed recipes.
5. `approve RECIPE_ID approval.json` requires the returned `fingerprint` and
   the actual `user_decision`. Do not manufacture a human approval from an agent
   suggestion or from the existence of API access.
6. `enqueue RECIPE_ID` returns a durable job. Repeating this operation returns
   the same job. The local worker executes independently of this chat.
7. Inspect `job JOB_ID` or the viewer. No blind resubmission on timeout.
   `submission_unknown` requires reconciliation; `retry-collection JOB_ID`
   retries output collection only. The current proof exposes no generic retry
   for paid failed/uncertain submissions and no unverified remote cancellation.
8. Show locally collected outputs. Ask the user to review, select or refine.
   Record feedback with `feedback MEDIA_ID TEXT`. A revision is a new recipe.
   `media MEDIA_ID` retrieves the original recipe and all feedback for that take;
   read it when refining. `revision NODE_ID NUMBER` retrieves a historical node.

The engine currently verifies selected image models using schema discovery and
Kling v3.0 start/end-frame video mapping. Other video media mappings remain
explicitly unsupported until tested. No internal automatic quality-scoring loop.

## Viewer and execution

`./studio.sh --port 8788` builds/starts the local API, worker and viewer. Choose
another available port rather than killing unrelated listeners. Paid execution
is disabled unless `--allow-higgsfield` is supplied; recipes still need approval.
Open the reported `/studio` URL in Codex's in-app browser. Keep it available
as the user's production workspace.

`demo` creates only labeled fake-provider fixtures for engineering tests. Never
report those fixtures as generated filmmaking outputs or as paid-provider proof.

`backup PATH.zip` snapshots database and managed media with checksums. `restore
PATH.zip --to NEW_DIRECTORY` refuses to replace existing data and prevents old
pending jobs from automatically re-submitting. Do not run a restored workspace's
uncertain submissions without reconciling provider history first.
