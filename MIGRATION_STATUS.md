# Migration checkpoint - 2026-09-18

Current extension (2026-09-21): read `PORTABILITY_STATUS.md` and `START_HERE.md`
for the host-neutral CLI/MCP kit. Dated entries below are historical checkpoints;
the dream production has 22 generated selected cuts, not pending asset creation.

## Read this first

The user approved planning and starting a local, Codex-operated migration. This
includes the executable proof plus shared production contracts, **not full replacement parity or a production
release**. Preserve the existing app and `strawberry.db` until the release gates
in [MIGRATION_PLAN.md](MIGRATION_PLAN.md) pass. On 2026-09-18 the user approved
the four-image visual proof: all four Higgsfield jobs completed, with no retries.
See `VISUAL_PROOF_BATCH.md` for exact records and initial observations.

The creative contract is [WORKFLOW_RULES.md](WORKFLOW_RULES.md). The migration
research is [MIGRATION_RESEARCH.md](MIGRATION_RESEARCH.md). Repository instructions
are in [AGENTS.md](AGENTS.md); the operating skill is
[strawberry-production](.agents/skills/strawberry-production/SKILL.md).
Typed relationships, continuity and review semantics are specified in
[PRODUCTION_CONTRACTS.md](PRODUCTION_CONTRACTS.md).

## Working now

- 2026-09-18 storyboard auto-run checkpoint: dream production
  `045f766b-efdb-445f-a888-19852e251bad` now has a selected, locally managed
  take for **all 22 chronological cuts**. The user explicitly authorized this
  bounded auto-approval run after approving the assets. Every new cut was
  prepared as an immutable Strawberry recipe, submitted through the connected
  Higgsfield plugin using ordered provider references, receipt-reconciled,
  collected locally and selected before the next cut was prepared. No image
  pixels were visually judged by the assistant. The local viewer reports all
  storyboard stages ready. The remaining `cover_asset_views` suggestions are
  optional coverage expansion, not blockers for the completed storyboard.
  `scripts/auto_storyboard_run.sh` now emits one connector-ready payload only;
  it deliberately has no direct Higgsfield CLI submission path because the CLI
  local-reference upload path remains unreliable. Use
  `scripts/finalize_connector_cut.sh` only after the connected plugin returns a
  completed provider job ID.

- 2026-09-18 dream-production checkpoint: project
  `045f766b-efdb-445f-a888-19852e251bad` has 5 scenes, 11 shots, 22 cuts,
  9 assets and 19 reference requirements. The user rejected the initial
  silver-memory realistic candidate and adopted a handmade monochrome
  charcoal-and-cut-paper dream-collage treatment. Ten new character, prop and
  location candidates were generated with GPT Image 2.5, collected into managed
  local media and are pending human review. Nothing is selected and no cuts have
  been generated. See `DREAM_PRODUCTION_2026-09-18.md`.

- The connected Higgsfield app can now be used as a submission transport without
  bypassing Strawberry's records. External jobs are linked only after an exact
  receipt preview verifies model, prompt, settings and ordered inputs; the worker
  then polls and collects them through the normal provider adapter. CLI reference
  upload currently fails with an upstream signed-S3 `SignatureDoesNotMatch` error,
  while plugin upload and generation succeed. No matching provider generation was
  created by the failed CLI upload attempts.

- Latest execution: user accepted cut 1 and authorized cuts 2 and 3. Cut 3
  completed using non-adjacent cut 1 as base; pending human-only visual review.
  Cut 2 failed at Higgsfield with no detailed reason or output. No retries were
  submitted and no subsequent images were visually inspected by the assistant.
  Exact recipes and receipts remain stored; see `STORYBOARD_PROOF.md`.

- 2026-09-18 checkpoint: new recipe requests default to `gpt_image_2_5`, per
  user choice; explicit alternatives and historical recipes remain unchanged.
  GPT Mara, NORTH-panel location baseline and side-clipped ticket are selected.
  First three-reference GPT cut completed after explicit approval. Reference
  upload, submission, receipt and local collection are now verified end to end.
  Output awaits human review; architecture shifts and tiny prop details remain
  continuity concerns. See `STORYBOARD_PROOF.md`. Final billed cost is unknown.
  Latest local checks: **174 passed**, scoped Ruff clean, frontend build passes
  with retained legacy chunk-size warning. No commit, push or CI run performed.

- The authenticated Higgsfield CLI is the first execution adapter. Read-only
  discovery exposes its live image-model catalog and normalized model details in
  both the Strawberry CLI and viewer. Recipes support Higgsfield schemas using
  either `input_images` or `medias`, so model choice is no longer tied to Nano
  Banana Pro. GPT Image 2.5, FLUX.2 and Seedream 5 Pro are visible candidates;
  their visual continuity quality is not yet proven. See `MODEL_ROUTING.md`.

- Local SQLite engine with project/scene/shot/cut and character/location/prop
  nodes, nested locations, atomic sibling numbering, structured errors and
  revision-checked changes. Parent edits cannot invalidate a child's collection
  operations without an error and transaction rollback.
- Context inheritance with explicit set/clear/inherit/add/remove; field origins,
  ancestor notes, and original source instructions are queryable. Raw inputs are
  not replaced by summaries. Adding a source invalidates earlier affected plans.
- Typed in-frame cast, exact location/sublocation and required props, separate
  from available cast. Relationships use real same-project IDs. Missing scope,
  style, action or approved asset references blocks cut preparation.
- Explicit non-adjacent continuity sources, before/after state, prop ownership
  validation and cycle/conflict checks. Camera context is not copied across cuts.
  Conflicts require an authored resolution; these are not inferred pixel facts.
- Reference roles must cover actual required subjects. A composition reference
  cannot substitute for character identity; a parent location is not silently
  substituted for its sublocation. Multi-asset references name confirmed subjects.
- Immutable generation recipes freeze the exact prompt, ordered media IDs,
  reference roles/instructions, byte hashes, resolved context, source contexts,
  provider schema/version and effective settings. Context changes require a new
  approval. References are never silently dropped or reordered.
- Exact-recipe approval, idempotent enqueue, persisted job state and append-only
  job events. Worker ownership and leases avoid the old project-wide sweeper.
  A crash during submission becomes `submission_unknown`, never an automatic
  paid retry. A failed download can be retried without regeneration.
- Managed local media, all take versions, explicit active-take selection,
  per-take feedback, full revision snapshots and recipe inspection.
- Append-only visual approvals/rejections bind exact media and definitions.
  Reviews enforce both decision revisions and an inspection-context fingerprint.
  Changed definitions make prior reviews stale; changed open review windows fail.
  Partial images can be approved for reference use but cannot become final cuts
  or accepted continuity sources. Rejected/partial selections remain visible,
  never silently swapped. The worker rechecks readiness in the transaction that
  changes a job to submitting, including edits made while reading references.
- Atomic editorial reorder with complete sibling revision checks. Story order
  and continuity links stay unchanged. No irreversible phase staircase.
- Local browser viewer: production list, hierarchical navigation, storyboard,
  asset library, job activity, context/notes, original sources, take history,
  prompt/reference preview, approve/queue, feedback and download recovery.
  Inspector now shows frame requirements, linked assets, continuity state and
  specific blockers; review dialogs include confirmed-visible-asset checklists,
  rejection/reapproval history, and reference-only versus final-take actions.
- The inspector now edits common filmmaking details through explicit Inherit,
  Override and Clear controls. Saves use optimistic node revisions, preserve
  original source notes, and make parent provenance visible before editing.
- Asset reference requirements are stable records for views, states, details and
  scale coverage. Coverage is confirmed only during human review of an exact
  take and is bound to the requirement definition; editing a requirement removes
  obsolete coverage without deleting review history.
- Frozen asset recipes can be approved as an explicit bounded batch. Batch
  validation is atomic, records one batch provenance ID, preserves every recipe's
  fingerprint and estimate ceiling, and queues nothing if any item is stale.
  Stale recipe snapshots remain inspectable but cannot be approved or batched.
- CLI and HTTP use the same domain service. No internal LLM runtime is invoked
  by the new path. Codex performs creative roles using one coordinating skill.
- Workspace backup/restore includes database, media and checksummed manifest.
  Restore refuses existing destinations, checks archive/database/media integrity,
  and blocks old pending submissions so a restored snapshot cannot re-spend.
- Selective project export/import moves one production, its managed media and
  complete history without exposing other productions. Imports are atomic,
  reject identity collisions/tampering, reset generation authorization and move
  in-flight jobs to reconciliation instead of resubmission.

## Run it

The new workspace has a pinned minimal runtime separate from the old provider
stack. Installation and startup are deliberately separate; startup never installs
or updates packages.

```bash
./install-studio.sh
```

```bash
./studio.sh --port 8788
```

This builds the viewer and starts its loopback-only server plus worker. The
viewer is at `http://127.0.0.1:8788/studio`. Default port is 8787; 8788 was used
because 8787 already had a listener. Startup never kills unrelated processes.
Control-C stops only the processes owned by this launcher.

Default data directory: `.strawberry/`, ignored by git. Use `--home` on the CLI
to choose a separate store. Original `.env`, `strawberry.db`, media, `start.sh`
and the old UI remain intact.

Higgsfield execution is disabled in this proof's running worker. After approving
a bounded real-generation test, start with `--allow-higgsfield`. This enables
the adapter, **not blanket approval**: every recipe must still be approved.

```bash
venv/bin/python -m backend.studio projects
venv/bin/python -m backend.studio inspect NODE_ID
venv/bin/python -m backend.studio context NODE_ID
venv/bin/python -m backend.studio readiness NODE_ID
venv/bin/python -m backend.studio recipe RECIPE_ID
venv/bin/python -m backend.studio job JOB_ID
venv/bin/python -m backend.studio media MEDIA_ID
venv/bin/python -m backend.studio review MEDIA_ID review.json
venv/bin/python -m backend.studio reorder PARENT_ID order.json
venv/bin/python -m backend.studio revision NODE_ID NUMBER
venv/bin/python -m backend.studio backup /absolute/path/workspace.zip
venv/bin/python -m backend.studio restore /absolute/path/workspace.zip --to /absolute/path/new-workspace
venv/bin/python -m backend.studio export-project PROJECT_ID /absolute/path/production.zip
venv/bin/python -m backend.studio import-project /absolute/path/production.zip
```

`backup` is a whole-workspace snapshot. `export-project` is the selective,
shareable production archive used by the viewer's Export/Import controls. Both
include private production notes, prompts and provider receipts; treat the ZIP
as private. It does not copy `.env` or Higgsfield credential files. Current
portable archive size limit is 4 GiB. Incomplete restores are blocked. Imported
project records retain historical decisions but require fresh generation approval.

## Offline proof and verification

`venv/bin/python -m backend.studio demo` seeds an explicitly labeled fake-provider
production, "The Last Train / Continuity Proof". It creates one character, one
location, one prop, three cuts and a revised first cut. Cut three references cut
one for composition and an explicit ticket-ownership/clip-position dependency.
All seven images are **test fixtures, not AI generations**.
This is not evidence that visual identity or geography is solved.
The current fixture is at `/studio/9a0a939b-8fa3-4933-9b3c-7fc3f497ec09` in this
checkout. Earlier Offline Proof data remains untouched. Isolated workspace
schema 5 adds execution heartbeat, cost policies, planned reference requirements
and batch provenance alongside review records;
existing images are not implicitly approved.

Verified in this checkout:

- Original baseline: 67 tests pass; missing-prompt phase gate and TypeScript build
  failures fixed. Previously ignored test files are tracked in git.
- New engine suite: 96 tests. Total `pytest -q -m 'not live'`: **163 passed**.
- Fake-provider proof, worker restart, active lease, uncertain submit, collection
  retry, duplicate enqueue, parent override, missing reference, raw-note retention,
  source-context staleness, revision conflicts, history and backup/restore tested.
  CLI JSON/error handling, provider input bounds, and demo isolation are covered.
- Added coverage for visible versus available cast, explicit empty frames,
  same-project/type relationships, sublocations, reference-role coverage,
  stale/rejected/partial reviews, review-window races, queued-job invalidation,
  pre-submit reference-read races, non-adjacent bases, continuity cycles,
  conflicting states/ownership, downstream invalidation and atomic reorder.
- Frontend production build passes. The retained old bundle still has Vite's
  large-chunk warning; this is not a new-viewer runtime failure.
- New Python modules/tests pass scoped Ruff. New viewer/App pass scoped ESLint.
- CI enforces the minimal Studio runtime on Python 3.10 and 3.12, Studio-only
  Ruff/ESLint, the production frontend build and the full retained regression
  suite. Existing-app frontend lint debt remains visible as an advisory step.
- A fresh temporary virtual environment installed only
  `requirements-studio-dev.txt`; all 96 Studio tests passed. The normal launcher
  then built, started on an unused port with paid execution disabled, reported
  healthy, and shut down both owned processes cleanly.
- Browser checks: storyboard renders, active take changes immediately, earlier
  take remains available, feedback saves and is visible on the same take, source
  instructions and inherited values render. Refresh preserves stored selection.
- Additional browser checks: rejecting Mara blocks cut readiness; reapproval
  restores it and preserves all three review decisions. Approving a cut with
  missing confirmed cast leaves it reference-only and blocks downstream use;
  the selection error is visible inside the dialog. Explicit full review restores
  readiness. Reordering shots changes the storyboard while story beat 3 remains
  story beat 3; restored original order and refreshed to verify persistence.
  Review controls/checklists were inspected at 1440x960 and 390x844 requested
  viewport sizes; narrow layout had no horizontal overflow. No browser errors.
- Desktop and narrow viewport inspection is recorded in the session (1440/390
  requested viewport widths; browser zoom reported 1200/325 CSS widths). All
  three images loaded, narrow layout had no horizontal overflow, and hierarchy
  navigation plus the mobile inspector were usable. Fixtures render without
  paid-provider or old-agent calls. Automated browser regression coverage remains
  a cutover task; these were actual browser checks, not a committed E2E suite.

Tested runtime: Python 3.10.13; FastAPI 0.123.10; Pydantic 2.12.5; HTTPX 0.28.1;
Uvicorn 0.38.0; Pillow 12.2.0; pytest 9.0.3; Ruff 0.15.12; Vite 7.3.0.
These record the working checkout, not a claim of a verified minimal install.

## Higgsfield boundary

The current product scope is image storyboarding. Video generation and video
provider migration are deferred and are not part of the visual-proof or cutover
gate. Generic stored-video preview support is not evidence of a video workflow.

Read-only verification found an authenticated Pro account and installed CLI
0.1.28 (build e7a475eb57e8824321309a9f5add6a88181b3079). Credentials were not
copied into the app, browser or repo. The adapter uses the user's installed CLI.

Model schema is discovered with `model get`; schema and CLI version are frozen
with each recipe and rechecked before submission. Image references use repeated
`--image` arguments in exact recipe order.

Four earlier approved text-to-image requests completed successfully: three Nano
Banana Pro sheets and one GPT Image 2.5 sheet. Create receipts, polling, local
collection and original-media registration worked end to end. The connected app
has since verified reference upload and generated the ten-image dream asset batch.
Those external submissions were attached to their frozen Strawberry jobs with
exact provider receipts, then collected locally through the normal worker path.
This verifies transport and provenance, not human-reviewed multi-reference visual
quality. Unexpected receipts are classified as uncertain rather than silently
retried. Installed help does not expose cancellation. Costs remain unknown unless
supplied by an actual estimate/receipt; account access is not proof that generation
is free or covered by unlimited website usage.

## Next work, in order

0. **Dream asset review gate.** Present the ten generated candidates for project
   `045f766b-efdb-445f-a888-19852e251bad`. Record the user's decision and feedback
   on each exact media item, select only approved references, and do not prepare
   or generate cuts until that review is complete.
1. **Execution recovery verification.** Implemented durable worker visibility,
   queued cancellation, guarded two-step reconciliation, explicit known/unknown
   cost approvals, atomic estimate-policy rechecks, DNS-pinned HTTPS collection,
   long-call lease renewal and partial-output preservation. Full offline suite:
   **155 passed**; build and scoped Ruff/ESLint pass. Browser confirms worker
   status and persisted job events. Isolated browser fixture verified uncertain
   submission preview/link, collection to ready without resubmission, and queued
   cancellation. Narrow 390px activity layout has no horizontal overflow. Real
   prepared recipe displays exact prompt/settings, 2-credit estimate and ceiling;
   its approval button was not clicked. Isolated fake-provider browser test
   confirms unknown-cost approval is disabled until acknowledged, then queues
   successfully and shows that no enabled worker is available. See
   `EXECUTION_CONTRACTS.md`.
2. **Bounded visual proof with the user.** Present exact character/location/prop
   sheet recipes, reference order and known/unknown credit costs. Obtain approval,
   generate and inspect pixels. Then three cuts, non-adjacent reuse, one revision
   and one feedback-driven replacement take. Do not infer this approval from this
   migration task.
   Three proposed Nano Banana Pro 2K sheet recipes are saved under
   `/studio/a14b173e-13be-45ab-9efe-e1a399216ed6`, each quoted at 2 credits. A
   same-prompt Mara sheet on GPT Image 2.5 at 2K/xhigh is quoted at 5 credits.
   The exact 11-credit bounded proposal is recorded in `VISUAL_PROOF_BATCH.md`.
   User approval was received on 2026-09-18 and all four jobs completed. No retries
   or cuts were generated. Assistant observations are recorded on each exact take;
   human visual review and active-reference selection remain pending.
3. **Viewer parity.** Side-by-side take comparison now shows exact recipes and
   feedback without changing selected takes. Take inspection includes reverse
   reference usage and navigation to consuming nodes. Planned views/states and
   atomic approved batches are now live. Production-detail editing now supports
   inherited, overridden and explicitly cleared scalar fields. Selective project
   export/import is live in the CLI, API and viewer with checksummed media and
   reset execution permissions. Persisted feedback is available but no automatic refinement
   prompt synthesis runs in the server; the host must read it and compose a recipe.
   Comparison verified with two loaded images at desktop and 390px widths;
   selection remained unchanged. Browser verified Mara's identity-reference
   uses and navigation to the third cut, including its non-adjacent dependency.
   Browser also verified that the proposed sheet batch contains exactly three
   current recipes, totals 6 estimated credits, stays disabled without a written
   decision, and excludes retained stale recipes. Mara's four planned requirements
   render as uncovered. Browser verified the production-detail editor and its
   parent provenance without saving a mutation. No approval, queue, upload or
   generation was triggered.
4. **Cutover and cleanup.** Verify the old feature inventory, then remove old
   conversational agents/chat surfaces/direct LLM calls and redundant storage
   paths after the visual proof. The new path now has a minimal pinned install,
   one launcher and enforced clean-checkout CI; retained legacy code remains
   available until its parity gate passes. No permanent old/new selector.
   The inventory and deletion gates are now explicit in `CUTOVER_AUDIT.md`.

Execution recovery and viewer work can proceed without spending credits. The full migration is
not complete merely because the isolated proof works. In particular, do not mark
all of Milestones 1-3 complete until their remaining gates pass.

## File map

- `backend/studio/models.py`: input contracts.
- `backend/studio/store.py`: isolated schema, transactions, revisions, events.
- `backend/studio/service.py`: shared domain operations, context, media/recipes.
- `backend/studio/production.py`: relationship, continuity, coverage and review rules.
- `backend/studio/providers.py`: fake adapter and installed Higgsfield CLI adapter.
- `backend/studio/worker.py`: durable execution and output collection.
- `backend/studio/api.py`, `__main__.py`: thin HTTP and CLI interfaces.
- `backend/studio/backup.py`, `launch.py`, `demo.py`: operations and offline proof.
- `frontend/src/studio/`: viewer, separate from the old custom chat UI.
- `ProductionInspector.tsx`, `TakeReview.tsx`: readiness/state, reorder and visual decisions.
- `tests/studio/`: deterministic offline tests; no paid provider calls.

Old hidden LLM call sites identified for retirement: `orchestrator/runner.py`,
`style_bible.py`, `identity_traits.py`, and dormant `vision_critic.py`. The new
engine does not import them. Their creative responsibilities belong in host
skills; their useful structured outputs still belong in production records.
