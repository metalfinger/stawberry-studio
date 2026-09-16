# Migration checkpoint - 2026-09-16

## Read this first

The user approved planning and starting a local, Codex-operated migration. This
is the first executable proof, **not full replacement parity or a production
release**. Preserve the existing app and `strawberry.db` until the release gates
in [MIGRATION_PLAN.md](MIGRATION_PLAN.md) pass. No paid generation was submitted
in this implementation session.

The creative contract is [WORKFLOW_RULES.md](WORKFLOW_RULES.md). The migration
research is [MIGRATION_RESEARCH.md](MIGRATION_RESEARCH.md). Repository instructions
are in [AGENTS.md](AGENTS.md); the operating skill is
[strawberry-production](.agents/skills/strawberry-production/SKILL.md).

## Working now

- Local SQLite engine with project/scene/shot/cut and character/location/prop
  nodes, nested locations, atomic sibling numbering, structured errors and
  revision-checked changes. Parent edits cannot invalidate a child's collection
  operations without an error and transaction rollback.
- Context inheritance with explicit set/clear/inherit/add/remove; field origins,
  ancestor notes, and original source instructions are queryable. Raw inputs are
  not replaced by summaries. Adding a source invalidates earlier affected plans.
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
- Local browser viewer: production list, hierarchical navigation, storyboard,
  asset library, job activity, context/notes, original sources, take history,
  prompt/reference preview, approve/queue, feedback and download recovery.
- CLI and HTTP use the same domain service. No internal LLM runtime is invoked
  by the new path. Codex performs creative roles using one coordinating skill.
- Workspace backup/restore includes database, media and checksummed manifest.
  Restore refuses existing destinations, checks archive/database/media integrity,
  and blocks old pending submissions so a restored snapshot cannot re-spend.

## Run it

Existing dependencies are used for this checkpoint; dependency pruning and a
clean-install recipe are part of cutover. No packages install during startup.

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
venv/bin/python -m backend.studio recipe RECIPE_ID
venv/bin/python -m backend.studio job JOB_ID
venv/bin/python -m backend.studio media MEDIA_ID
venv/bin/python -m backend.studio revision NODE_ID NUMBER
venv/bin/python -m backend.studio backup /absolute/path/workspace.zip
venv/bin/python -m backend.studio restore /absolute/path/workspace.zip --to /absolute/path/new-workspace
```

`backup` is a whole-workspace snapshot, not yet a selective project export. It
includes private production notes, prompts and provider receipts; treat the ZIP
as private. It does not copy `.env` or Higgsfield credential files. Current
portable backup/restore size limit is 4 GiB. Incomplete restores are blocked.

## Offline proof and verification

`venv/bin/python -m backend.studio demo` seeds an explicitly labeled fake-provider
production, "The Last Train / Offline Proof". It creates one character, one
location, one prop, three cuts and a revised first cut. Cut three references cut
one for composition. All seven images are **test fixtures, not AI generations**.
This is not evidence that visual identity or geography is solved.

Verified in this checkout:

- Original baseline: 67 tests pass; missing-prompt phase gate and TypeScript build
  failures fixed. Previously ignored test files are tracked in git.
- New engine suite: 33 tests. Total `pytest -q -m 'not live'`: **100 passed**.
- Fake-provider proof, worker restart, active lease, uncertain submit, collection
  retry, duplicate enqueue, parent override, missing reference, raw-note retention,
  source-context staleness, revision conflicts, history and backup/restore tested.
  CLI JSON/error handling, provider input bounds, and demo isolation are covered.
- Frontend production build passes. The retained old bundle still has Vite's
  large-chunk warning; this is not a new-viewer runtime failure.
- New Python modules/tests pass scoped Ruff. New viewer/App pass scoped ESLint.
- Browser checks: storyboard renders, active take changes immediately, earlier
  take remains available, feedback saves and is visible on the same take, source
  instructions and inherited values render. Refresh preserves stored selection.
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

Read-only verification found an authenticated Pro account and installed CLI
0.1.28 (build e7a475eb57e8824321309a9f5add6a88181b3079). Credentials were not
copied into the app, browser or repo. The adapter uses the user's installed CLI.

Model schema is discovered with `model get`; schema and CLI version are frozen
with each recipe and rechecked before submission. Image references use repeated
`--image` arguments in exact recipe order. Video currently supports the verified
`kling3_0` start/end-frame mapping only. Other video mappings fail explicitly.

`generate get` was inspected on an existing completed job. **The create/upload
receipt shape and real multi-reference quality have not been verified through a
new paid request.** Unexpected receipts are classified as uncertain rather than
silently retried. Installed help does not expose cancellation. Costs remain
unknown unless supplied by an actual estimate/receipt; account access is not
proof that generation is free or covered by unlimited website usage.

## Next work, in order

1. **Semantic production contracts and readiness.** The current engine validates
   structure/context/recipes, not a complete filmmaking schema. Add typed asset
   links, explicit visible cast versus available cast, story chronology versus
   editorial order, reorder operations, continuity state records, reference
   approval/rejection and readiness reasons shared by CLI/viewer. Do not silently
   render a cut with missing required cast, prop or location identity.
2. **Stronger execution recovery.** Add provider-enabled/worker-health visibility,
   guarded reconciliation of uncertain submissions using verified remote IDs,
   cost estimates/limits, and tested model-capability bounds. Harden output URL
   collection against DNS rebinding; current HTTPS/private-address checks do not
   pin DNS through the request. Test long-running leases and partial outputs.
3. **Bounded visual proof with the user.** Present exact character/location/prop
   sheet recipes, reference order and known/unknown credit costs. Obtain approval,
   generate and inspect pixels. Then three cuts, non-adjacent reuse, one revision
   and one supported video job. Do not infer this approval from this migration task.
4. **Viewer parity.** Add comparison, reference-network navigation, planned missing
   views/states, approved batches, fuller field editing and selective project
   export/import. Persisted feedback is available but no automatic refinement
   prompt synthesis runs in the server; the host must read it and compose a recipe.
5. **Cutover and cleanup.** Verify the old feature inventory, then remove old
   conversational agents/chat surfaces/direct LLM calls and redundant storage
   paths. Switch to one normal launch path, trim dependencies, add CI and a
   clean-checkout test. No permanent old/new selector.

The first two items can proceed without spending credits. The full migration is
not complete merely because the isolated proof works. In particular, do not mark
all of Milestones 1-3 complete until their remaining gates pass.

## File map

- `backend/studio/models.py`: input contracts.
- `backend/studio/store.py`: isolated schema, transactions, revisions, events.
- `backend/studio/service.py`: shared domain operations, context, media/recipes.
- `backend/studio/providers.py`: fake adapter and installed Higgsfield CLI adapter.
- `backend/studio/worker.py`: durable execution and output collection.
- `backend/studio/api.py`, `__main__.py`: thin HTTP and CLI interfaces.
- `backend/studio/backup.py`, `launch.py`, `demo.py`: operations and offline proof.
- `frontend/src/studio/`: viewer, separate from the old custom chat UI.
- `tests/studio/`: deterministic offline tests; no paid provider calls.

Old hidden LLM call sites identified for retirement: `orchestrator/runner.py`,
`style_bible.py`, `identity_traits.py`, and dormant `vision_critic.py`. The new
engine does not import them. Their creative responsibilities belong in host
skills; their useful structured outputs still belong in production records.
