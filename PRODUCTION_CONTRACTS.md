# Production contracts

This implements the next part of [MIGRATION_PLAN.md](MIGRATION_PLAN.md). Creative
reasoning remains in Codex; the engine validates declared facts, not image truth.

## One representation

Relationships use typed, ID-valued fields in the existing node records. The
hierarchy and these fields form the production graph; do not add a second asset
link store. The existing set/clear/inherit/add/remove rules still apply.

- `available_cast`: character IDs that may participate in this scope.
- `visible_cast`: character IDs actually intended in frame. An empty list means
  nobody; absence is unknown, never copied from available cast.
- `location_id`: exact location/sublocation ID. Explicit clear means no location
  requirement, for example a graphic insert. A parent location is not silently
  interchangeable with a sublocation.
- `required_props`: prop IDs intended in the frame, including an explicit empty
  list when no props are required.
- `story_order`: optional positive integer on a cut. Editorial reordering changes
  sibling positions, never this story chronology declaration.
- `continuity_from`: cut IDs supplying story state. Cut-local, explicit, acyclic;
  they need not be the adjacent cuts in editorial order.
- `continuity.before` / `continuity.after`: cut-local maps from asset ID to
  attribute/value pairs, e.g. `{ "ticket-id": { "owner_id": "mara-id" } }`.
  Before values resolve the entering state; after values declare a transition.
  These are user-authored decisions, not facts inferred from requested pixels.

Continuity follows only declared links. Matching upstream states merge;
conflicting values remain conflicts unless explicitly resolved by a before
value. Camera/framing/style values do not propagate along continuity links.
Upstream cuts need approved, selected takes before downstream generation can
rely on their transitions. No automatic simulation or automatic visual critic.

## Review and references

Every media item starts pending. Review decisions are append-only, revision
checked, and bind the exact media and production definition. Selection is a
separate deterministic action; selecting a take does not implicitly approve it.
Review requests bind both the latest review revision and the `review_context`
fingerprint returned by media inspection. A changed production during review
requires reopening it; the server cannot quietly approve unseen definitions.
An approved asset reference depicts its owning asset. For cut/reference images,
record the asset IDs the human actually confirms are visible. A prompt requesting
an object does not prove the image contains it.

Reference recipes declare `subjects` when borrowing an entity from a multi-asset
image. Those IDs must be confirmed on the source image. Identity/base references
can satisfy character coverage, location/base references location coverage, and
prop/base references prop coverage. Composition or style alone cannot stand in
for character identity. A previous cut may be the right reference; it is not
automatically the right reference merely because it was generated last.
Partial images may be approved as references, but cannot be selected as a final
cut or supply an accepted continuity transition. Re-reviewing an active take as
partial/rejected retains its selection pointer and history, with explicit status
and blocked downstream use; it never silently chooses another version.

Changing a relevant production definition makes an old media review stale. The
image is retained and can be explicitly re-reviewed or replaced, never silently
regenerated or deleted. Rejected media cannot be used by the initial strict
execution path. Deliberate scoped reuse of rejected material is deferred until
it has its own explicit approval contract.

## Evaluations

Evaluations are observations with their own append-only record (`evaluations`),
separate from human review. Each binds to the image's `review_context` at the time it
was made; a changed definition means it no longer counts. They carry an evaluator,
version, kind (`facts`, `judge`, `pairwise`, `stranger`, `similarity`, `diversity`,
`duplicate`), unit-interval scores, question-level evidence and tagged, localised
discrepancies. They never set review status, selection, approval or readiness, and
they live outside the frozen generation context so recording one stales nothing.
`facts NODE_ID` derives a cut's or asset's declared facts as questions deterministically;
the host answers them. Readiness warns (`reference_unevaluated`) when a selected
reference has no current `judge`/`facts` record; the project field
`policy.require_evaluation_for_reference` turns that into a `prepare` refusal.

## Readiness

The same service returns readiness to Codex and the viewer and enforces it before
generation. Cuts must declare cast, location/no-location, props, style and action.
Required assets need approved selected references, and the exact generation
recipe must cover them with compatible roles. Generation approval does not
bypass readiness. Recheck before approval, enqueue and submission.

Readiness also returns `warnings` — advisory gaps in the canonical vocabulary
(`WORKFLOW_RULES.md`: beat, performance, sound, bible). Warnings never change `ready`,
are computed outside the frozen generation context, and appear on `readiness`,
`workflow` cut rows and `inspect`, never inside `context`.

There is no irreversible phase staircase. Earlier work can be revised, with
dependent reviews/recipes becoming stale and with existing takes preserved.
Writing canonical fields is such a revision: project-level `bible.*` and asset
identity fields change every dependent definition and stale their reviews.
Editorial reorder is one transaction, validates the entire sibling set and its
revisions, and never changes story order or continuity links.

## Current scope and limitations

Implemented in `backend/studio/production.py`, shared by CLI, HTTP and worker;
the viewer shows requirements/state and records reviews through that service.
Schema 2 adds only the append-only review table to the isolated workspace. Old
proof media remain pending, not implicitly approved; original app data is not
converted or deleted. Use the new Continuity Proof fixture for current checks.

These checks establish structural consistency, not visual truth. There is no
automatic prompt-semantic validation, visual scoring, identity recognition or
asset extraction. Sheet planning and model-appropriate prompts remain Codex's
responsibility, and human approval is still needed for visual quality. Asset
creation itself does not require an existing approved image; cuts do. Broad
phase completeness, specific camera-field schemas and automatic view-gap
planning are not implemented by this milestone. Review fingerprints deliberately
invalidate an open review if any project asset definition changes, a conservative
guard against approving subjects that changed while the modal was open.
