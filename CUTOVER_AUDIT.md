# Historical app to local Studio cutover audit

Date: 2026-09-18
Decision: Do not delete the historical app yet. The new path is structurally
stronger, but real-image continuity and a fresh Codex-operated production remain
release gates.

## Intended product path

- Conversation and creative reasoning: Codex using the Strawberry production skill.
- Deterministic state and execution: `backend/studio/` through one CLI/HTTP service.
- Visual workspace: `/studio` local viewer.
- Image execution: approved provider-neutral recipes, currently submitted through
  the authenticated Higgsfield CLI.
- Storage: `.strawberry/production.sqlite` plus managed media.

The old FastAPI app, WebSocket agent runtime, React Flow console and
`strawberry.db` remain isolated fallback/reference material. They are not imported
by the new engine.

## Capability inventory

| Historical capability | New equivalent | Status / evidence |
| --- | --- | --- |
| Project/brief creation | Project node, raw source capture, typed context and notes | Implemented; fresh conversational use still needs a user test |
| Berry/Sage/Nova/Atlas/Pixel chats | One coordinator with role playbooks | Implemented in skill; no repeated greetings or phase confirmations |
| Four phase rail | Deterministic Plan/workflow status | Implemented; navigation never spends an LLM call |
| Scene/shot/cut canvas | Hierarchy tree plus editorial storyboard | Implemented; story order and editorial order remain separate |
| Asset master cards | Asset library, requirements, selected references, all takes | Implemented without a duplicate master/sheet system |
| Character/location/prop prompts | Frozen recipes derived from full context and planned views | Implemented; actual output quality pending |
| Style bible / style anchor | Inherited structured style plus approved media with `style` role | Contract implemented; real stability pending visual proof |
| Pre-production variants | Story-driven asset requirements and versioned reference takes | Implemented; no speculative precaching |
| Compose Cut | Prompt/Reference Director playbook plus exact recipe approval | Implemented structurally; real multi-reference cut pending |
| Previous-cut continuity | Explicit `continuity_from`, any approved non-adjacent take and state facts | Implemented and offline-tested |
| Reference picker/dropdowns | Explicit ordered ReferenceUse records with preserve/change/exclude instructions | Implemented; selection remains creative reasoning in Codex |
| Image generation progress | Durable jobs, events, activity view and worker heartbeat | Implemented and recovery-tested offline |
| Generated image history | Immutable media/takes, reviews, feedback, comparison and active selection | Implemented |
| Library metadata and reuse | Media provenance, exact recipe, reverse usage and confirmed subjects | Implemented |
| Batch generation | Atomic bounded recipe approvals with per-item cost ceilings | Implemented |
| Repair menu | Workflow blockers plus Codex-authored targeted changes | Implemented replacement; no opaque repair-all action |
| Model/provider choice | Live Higgsfield catalog and provider-independent frozen recipes | Implemented for image models; visual benchmark pending |
| Export/import | Checksummed per-production archive with execution approval reset | Implemented |
| Old custom chat UI | Host conversation in Codex | Intentionally replaced, not ported |
| Video generation | None | Intentionally out of current product scope |

## Dormant historical surfaces to remove after gates pass

- `backend/main.py`, `backend/routes/`, `backend/agents/`, `backend/tools/`.
- Historical `backend/orchestrator/` chat/planner/composer/provider logic.
- Old database modules and migrations used only by `strawberry.db`.
- React Flow pages and node components, custom Console/chat, PhaseRail, old
  LibraryDrawer/ContextPanel and their API client surface.
- Old provider registry/direct model SDKs that are not required by `backend/studio/`.
- `start.sh` and legacy dependency entries after the new launcher becomes canonical.

Deletion must follow import-graph and test proof. Do not remove shared utilities
merely because they live near legacy code. Preserve a verified archive/export of
historical user data and media before deleting the old runtime.

## Gates before deletion

1. User approves and reviews the bounded asset-sheet batch in
   `VISUAL_PROOF_BATCH.md`.
2. At least one real cut uses approved character, location and prop references.
3. A continuation cut uses an approved earlier cut plus required asset references;
   a non-adjacent reuse and a feedback-driven replacement take are reviewed.
4. One fresh Codex session starts from a raw pitch, creates the full breakdown,
   derives assets/requirements, prepares recipes and resumes from persisted state.
5. One real interrupted/uncertain Higgsfield job path is reconciled without blind
   resubmission, or the limitation is accepted explicitly for release.
6. The user confirms the new viewer covers daily inspection/review needs.
7. A local backup plus project export is verified immediately before cutover.

## Cutover sequence

1. Freeze feature work on the old app; retain it read-only for comparison.
2. Complete the gates above and record exact evidence in `MIGRATION_STATUS.md`.
3. Make `/studio` and `studio.sh` the sole documented entry points.
4. Run a tracked import/dependency audit and delete one legacy layer at a time.
5. Run the full retained test suite after each deletion; update minimal manifests.
6. Archive historical `strawberry.db` and media outside the runtime path.
7. Remove old routes/UI/startup only when no parity gate relies on them.

There is deliberately no permanent old/new mode switch and no migration of old
development fixtures into the new schema. The user can start fresh; historical
records are preserved until cutover rather than silently rewritten.
