# Strawberry assistant-operated filmmaking migration

Date: 2026-09-16
Status: Approved, implementation in progress. The first isolated engine/viewer
proof is running; full parity is not complete. See [current checkpoint](MIGRATION_STATUS.md),
[research and product thesis](MIGRATION_RESEARCH.md) and
[proposed context/reference rules](WORKFLOW_RULES.md).

Planning additions: local viewer, detailed node memory, and role/skill boundaries
specified below. Read-only Higgsfield access verified; generation integration
and visual quality are not yet verified.

## Decision

Keep Strawberry's filmmaking workflow and persistent production relationships.
Move creative reasoning/conversation into the user's assistant host. Expose a
single validated production engine through CLI/MCP and HTTP for a local visual
workspace. Start with Higgsfield CLI behind a provider adapter.

The web workspace is for sequence, reference inspection, review, selection,
history and progress. It must not require a second conversational agent.

### Alternatives considered

- Continue the existing app/chat runtime: preserves the UI but retains duplicate
  reasoning, tool dispatch and chat lifecycle complexity. Not the chosen path.
- Skills plus loose files and direct Higgsfield calls: fast demo, but weak
  transactional approval, reference provenance and interrupted-job recovery.
- Assistant plus local engine/viewer: chosen direction. Adds a small tool/worker
  boundary but centralizes validation, state and ownership. Requires explicit
  local-host integration; cloud access is not assumed.

### Initial boundaries

- Single user, local engine, SQLite and project media files; no graph database,
  public SDK, distributed workers or new agent framework.
- Codex local is the only assistant host required for this migration. Cloud and
  second-host integrations are deferred. Keep tool contracts host-neutral without
  building or testing additional transports until needed.
- Higgsfield is the first provider. A fake adapter is mandatory for tests. A
  second paid provider is not necessary to prove the interface boundary.
- Preserve user-as-critic and approval-before-generation. No automatic visual
  rejection/retry or speculative pre-caching.
- Keep existing projects untouched during the proof. Use an isolated project
  store and a verified backup before any eventual storage switch. Historical
  data migration is not a prerequisite; destructive reset is not implicit.
- Improve code required by this path; do not modernize unrelated files simply
  because the repository is old.

## Local workspace and viewer

The web UI is a required deliverable, not an optional future feature. The initial
local viewer now runs in Codex's in-app browser; the complete required surface
below remains a release checklist, not a claim of current parity.

One documented startup command should start/check the engine, worker and viewer,
report health and the actual local URL, detect occupied ports, and shut down
cleanly. Installing/updating dependencies is separate from normal startup.
Jobs remain independent of browser closure and assistant turns; stopping the
worker explicitly is handled by persisted recovery state.

Required workspace views:

1. Storyboard: scenes/shots/cuts in editorial order, active take, durations,
   image/video preview, generation and approval state.
2. Production library: characters, locations and props; approved sheets, named
   views/crops, states/variants, all take versions and their provenance.
3. Context inspector: local node facts, inherited values with source breadcrumbs,
   explicit overrides, full notes, pending decisions and revision history.
4. Generation review: exact prompt/settings, ordered reference previews and
   roles, preserve/change instructions, missing inputs, cost when available,
   take comparison and version-specific feedback/selection.
5. Activity: queued/running/collecting/ready/failed jobs, remote/local identifiers,
   elapsed time, known costs and explicit recovery actions.

Keep a navigable scene/shot/cut tree or graph alongside sequence review. The
node system is not removed merely because the chat moves to Codex. Graph nodes
summarize; the inspector reveals full details without filling the canvas with
every stored field. Cross-reference relationships must be inspectable without
turning the default view into an unreadable network.

Viewer and Codex operate the same revisions through the same validated service.
Use revision checks to reject stale updates, and query authoritative job state
after reconnect. A selection/navigation action does not need an LLM. Creative
instructions remain in Codex; the viewer is not a second chat application.

## Detailed node memory

Store rich information without making one opaque prompt the database:

- Original project-related user instructions and attachments, including scope
  and capture time. Keep the source text intact; a summary is an additional index,
  never its replacement. Capture only inputs actually available to the host.
- Structured creative facts plus extensible notes: story purpose, action,
  dialogue, camera intent, staging, style, era, lighting, sound, timing and
  continuity as applicable to the node. Unknown values remain unknown.
- Local patches and inheritance provenance rather than duplicated parent facts.
- Asset identities, approved versions, relevant states, reference relationships
  and required/missing views. Existing take references can cross the hierarchy.
- Decisions, rejected alternatives and rationale; separate user instruction,
  assistant proposal, approved decision and observed result.
- Revision history, source links and the frozen context used by each generation.

Use a shared NodeContext concept with typed fields appropriate to each level;
do not require every node to fill every conceivable field. An image's intended
prompt is not proof of its depicted contents. Observations must have their own
source/review status rather than overwriting creative requirements.

Codex must capture relevant user input before translating it into changes, then
attach the interpreted facts to the appropriate node(s). An input can initially
be project-scoped and linked to specific nodes later. This requires an explicit
capture operation/skill discipline: a local server cannot automatically read
every Codex message or future host conversation. Do not promise invisible global
chat logging. A fresh session resumes from project state, unresolved decisions
and source records, not from an assumed full chat transcript.

Context retrieval supports concise overview, resolved node context, original
notes, ancestor chain, related assets and reference candidates. Store detail
comprehensively; retrieve it deliberately. Never truncate required references
or critical constraints silently to fit a prompt budget.

## Roles: one coordinator, specialist skills, optional sub-agents

Codex is the coordinator and user-facing conversation. Skills are reusable
procedures/output contracts, not separately running models. Historical names
can remain aliases for familiarity, not forced greetings or chat handoffs.

| Responsibility | Historical role | Persistent output |
| --- | --- | --- |
| Development and creative direction | Berry | User intent, story/brief, visual direction, open decisions |
| Story structure and shot planning | Sage + Nova | Scene/shot/cut breakdown, action, timing, coverage and camera intent |
| Production design | Atlas | Reconciled character/location/prop identities, relationships, states and sheet/view requirements |
| Prompt direction | Pixel | Image inspection, chosen references/order/base, preserve/change instructions and final GenerationSpec |
| Script supervision | Cross-cut responsibility | Continuity dependencies, state changes, discrepancies and proposed fixes |
| Execution and recordkeeping | Engine/worker, not an LLM agent | Validated jobs, provider receipts, local media, takes and status |

Audit old prompts before converting them into skills. Preserve useful filmmaking
rules, not obsolete fixed grids, unsupported provider assumptions, silent recasts,
or handoff/confirmation loops. Host reasoning also replaces hidden style/trait
text-model calls on this path; there must not be a second background LLM stack.

Use sub-agents only for bounded independent work when delegation is authorized
and available, such as proposing a scene breakdown or inspecting references for
a location. Do not require a sub-agent per role or per cut. A sequential execution
of the same skills must work without a sub-agent facility.

Sub-agents receive explicit scope and project/node revisions. They return proposed
changes, evidence and unresolved questions. The coordinator reconciles proposals
and presents creative decisions to the user. Default production sub-agents do
not independently commit canonical project changes, grant approval or launch paid
jobs. Independent implementation work may use disjoint write scopes separately.

Approval means a recorded user decision for a specific recipe/revision or bounded
batch, not agreement inferred from another agent's output. Keep the permission
model realistic for a local full-access Codex host; no tamper-proof claim.

## Core contracts to settle in milestone 1

- Story hierarchy: project -> scene -> shot -> cut; explicitly distinguish
  story chronology, editorial sequence, and generation order. Define existing
  shot/cut terminology before changing schemas or user-facing labels.
- Context: typed parent defaults and explicit child overrides with provenance;
  linked asset and relevant sibling/reference context is available on demand.
  Revisions flag affected descendants without rewriting historical inputs.
- Asset: stable character/location/prop identity; sheets and views are versioned
  media. Asset state (wardrobe, prop ownership, damage, etc.) is not identity.
- ReferenceUse: exact media version, semantic role, optional region/transform,
  what to preserve/borrow, and what not to copy. Existing takes are reusable
  from anywhere in the project; approved sources are the default.
- GenerationSpec: exact prompt and ordered references, optional edit base,
  target model/capabilities, effective provider settings and output destination.
  The preview and submission must share this snapshot. No silent ref trimming.
- Plan/Approval: approval binds a plan/spec revision and bounded work, not a
  mutable cut ID. Record who authorized it and the source of authorization.
  CLI access is not proof of a human click; host confirmation integration must
  be explicit, with no claim of tamper resistance against a full-access host.
- Job/Attempt: durable execution and submission receipts, independent of chat.
  Unknown submission outcomes require reconciliation. A retry is not necessarily
  a new creative take. Local deduplication does not imply remote exactly-once.
- Take: immutable output/provenance, producing job, exact references, model and
  parameters. Selection, feedback and approval bind exact versions.
- Media: verified local original plus derived previews, checksums and provider
  receipts. Database and media together form the backup/export unit.

## Milestone 0: trustworthy baseline and bounded integration checks

- [x] Track the existing real tests; remove the blanket test ignore rule.
- [x] Fix frontend build errors and resolve the asset-gate test disagreement
  against intended behavior, rather than merely changing the assertion.
- [ ] Record tested dependency/runtime versions and reproducible install steps.
- [ ] Verify installed Higgsfield CLI version, schema discovery, accepted media
  inputs/order, account access, cost units, output formats, get/list/status,
  cancellation and error semantics. Read-only checks first; no generation.
- [ ] Verify how Codex local invokes Strawberry and sees image/video results.
  Do not spend this milestone on cloud or second-host transport research.
- [x] Identify every hidden direct LLM call on the intended path, including
  style_bible and identity_traits, not only the conversational agent runner.

Verified read-only on 2026-09-16: installed Higgsfield CLI is 0.1.28, build
e7a475eb57e8824321309a9f5add6a88181b3079 (2026-05-04). `account status` succeeds
and reports an active Pro plan. `model` exposes list/get; `generate` exposes
create/cost/get/list/wait. The installed help does not expose cancellation.
That is not proof the remote provider lacks cancellation; inspect supported
capabilities before deciding the adapter behavior. No generation was submitted.
Current online docs describe a broader command surface, so verify compatibility
and test/pin a supported version before relying on newer commands.

Exit: baseline checks have recorded results and the adapter contract is based
on the installed CLI, not assumptions. Unsupported capabilities are explicit.

## Milestone 1: extract the domain engine

- [ ] Implement the contracts above using existing database/domain conventions
  where sound. Keep the first schema limited to the three-cut proof.
- [x] Separate domain operations from chat events, narrator messages and HTTP.
- [ ] Implement validated project/story/asset changes, context retrieval and
  reference selection with actionable structured errors.
- [x] Implement source-input capture, scoped notes, provenance, proposal/approval
  distinctions and revision-checked edits. Test faithful retention of long notes.
- [x] Freeze approved generation specs; ensure prompt labels match actual media.
- [ ] Centralize phase readiness so UI and tools cannot disagree or skip required
  pre-production silently. Returning to earlier work is an explicit revision.
- [x] Preserve old active takes until replacement outputs are locally ready.

Exit: domain tests cover ordering, inheritance, reference roles, missing inputs,
approval invalidation and immutable version history without any provider calls.

## Milestone 2: durable execution and Higgsfield adapter

- [x] Add a local worker that runs independently of the requesting assistant.
- [ ] Persist jobs before submission, record attempts and remote IDs, use
  ownership/leases, and remove broad project-wide running-state resets.
- [ ] Add fake and Higgsfield adapters with capability-aware validation.
- [ ] Model unsupported cancellation and uncertain submission honestly; reconcile
  by known remote ID and never blindly repeat ambiguous billable submissions.
- [x] Separate provider success from output collection and local registration.
  Retrying a download must not regenerate the image/video.
- [x] Expose durable status/events, with queryable state after reconnect.
- [ ] Treat unknown prices as unknown; record provider credits separately from
  currency estimates. No implicit unlimited-generation assumption.

Exit: fake-provider restart, duplicate-request, concurrent-job, provider-error,
partial-output and collection-failure tests pass. No cross-job status corruption.

## Milestone 3: assistant tools and the first vertical proof

- [ ] Expose a small CLI surface with structured output backed by the engine:
  inspect/context, validated changes, prepare, approve/execute, status, review,
  select and export. Add MCP only if Codex integration needs it, as a thin
  transport over the same operations rather than a parallel implementation.
- [x] Write concise host skills for story development, production breakdown,
  casting/locations/props, cut preparation, and script supervision. No second
  internal LLM agent stack. Host reasoning supplies structured style/trait data.
- [x] Provide a minimal browser sequence/reference/take view using reusable
  frontend pieces, not a new chat interface.
- [ ] Open the local viewer in Codex and verify visible data updates after a
  tool mutation, approved generation, active-version change and browser refresh.
- [ ] Complete one story, one character, recurring prop, location/sublocation,
  three connected cuts and one revision with fake media/jobs first.
- [ ] Run a bounded user-approved Higgsfield proof. Inspect actual images and
  usage, not just successful responses. Test one video job from an approved
  still when the chosen model supports it.
- [ ] Resume from a new assistant session; reconcile an interrupted known job;
  reuse a non-adjacent take for an explicitly different visual purpose.

Exit: the full filmmaking loop works with preserved inputs, outputs, approvals
and history. The user reviews this proof before broadening the workflow.

## Milestone 4: production viewer and full workflow

- [ ] Sequence-first overview, asset/sheet library, context hierarchy inspector,
  source previews and traceable reference relationships.
- [ ] Take comparison, active selection, version-specific feedback, prompt/spec
  inspection and actionable missing-reference/continuity notes.
- [ ] Support planned missing views/states and user-approved batches without
  speculative automatic generation. Preserve all versions and derived crops.
- [ ] Show queued/running/collecting/failed/ready states, known costs and recovery
  actions. No indefinite spinner or undocumented false progress percentage.
- [ ] Support video artifacts and their actual reference/input roles; do not
  build a full NLE. Export/import the project with media and manifests.
- [ ] Verify desktop/narrow layouts, image/video loading and interaction through
  browser tests. Deterministic selection/navigation must not spend LLM tokens.

Exit: a fresh user can inspect, approve, revise and recover the complete project
without guessing which take is active or which references were used.

## Milestone 5: cutover, deletion and release checks

- [ ] Replace the custom chat entry point with documented assistant setup and a
  single start command for engine, worker and viewer; separate install from run.
- [ ] Bind locally by default, protect mutation endpoints, validate media paths,
  keep credentials out of browser/export/logs, and constrain CLI invocation.
- [ ] Delete replaced agent/chat code as each replacement is verified, with
  dependency checks. No permanently exposed legacy/new switch.
- [ ] Reconcile docs, startup scripts, dependency manifests and CI. Pin a tested
  CLI compatibility range and provide an explicit unsupported-version message.
- [ ] Exercise backup/restore, no-network startup, concurrent requests, duplicate
  approval clicks, refresh/reconnect and process interruption.
- [ ] Verify fresh-session resume in local Codex. Explicitly document cloud and
  second-host integration as out of scope, not uncompleted release requirements.
- [ ] Commit scoped milestones, push after verification, and record tests and
  known limitations. Do a final anatomy review for duplicate/dormant paths.

Exit: one documented operational path with a reproducible clean-checkout test
run, verified restore, and no dependency on old chat messages to resume work.

## Existing-code disposition

Retain/rework: `backend/database/`, project/story/asset operations in
`backend/tools/`, context bundlers, continuity records, persisted plans and
reference metadata. Extract those useful rules behind the new engine contract.

Replace narrowly: `backend/orchestrator/cut_executor.py`, prompt/reference
assembly, `backend/providers/base.py`, `gen_stats.py`, and `start.sh`. Reuse
working helpers, but do not carry known mismatched-slot or global-sweeper behavior.

Reuse viewer pieces after verification: Canvas, CutNode, asset nodes,
LibraryDrawer, ContextPanel, image comparison and hover previews. Remove their
dependency on global chat-window events and duplicate action implementations.

Retire after proof: `backend/routes/chat.py`, conversational runner/chat_bridge,
agent-persona handoffs/spec dispatch, `frontend/src/components/console/` as a chat
surface, and direct text-provider calls replaced by host reasoning. Extract any
useful non-chat components before deleting their former container. Audit imports
before removing dependencies or the dormant visual critic.

## Research still justified

Only bounded checks needed to implement the next milestone: installed provider
capabilities, actual host transport, approval UX, and a small visual continuity
benchmark. Broader competitor scans and model rankings are not on the critical
path. Revisit research only when a concrete test exposes a missing capability.

## Human checkpoints

Ask for account authentication only if required, explicit bounded generation
spend, visual judgment on sheets/cuts and changes to creative intent. Do not ask
the user to debug routine engineering failures or repeatedly approve bookkeeping.

## Current progress

- [x] Product thesis and reference-network clarification recorded.
- [x] Two-agent external research and local architectural assessment recorded.
- [x] Proposed implementation sequence and acceptance gates documented.
- [x] Local viewer, node-memory and skill/sub-agent design documented.
- [x] Installed Higgsfield CLI and authenticated account checked read-only.
- [x] Baseline restored: 67 original tests and frontend build pass.
- [x] First isolated CLI/engine/worker/viewer proof with 33 additional tests.
- [x] Fake three-cut loop, one revision, non-adjacent reuse and backup/restore.
- [ ] Milestone 0 complete (clean-install and full provider-contract checks remain).
- [ ] Milestones 1-5 implemented and verified.

See [MIGRATION_STATUS.md](MIGRATION_STATUS.md) for actual commands, file ownership,
test results, provider limitations and the prioritized next implementation work.
Unchecked compound tasks may be partially implemented; no unchecked item is
implicitly waived by the proof. Real Higgsfield generation still needs approval.
