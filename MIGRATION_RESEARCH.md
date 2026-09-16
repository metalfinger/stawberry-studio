# Assistant-operated Strawberry: migration research

Date: 2026-09-16
Status: Research and recommendations, not implemented architecture.

## Agreed direction

Use Claude/Codex as the creative reasoning and conversation surface. Retain a
local production engine, persistent project data, media files, and a visual
storyboard/library viewer. Higgsfield CLI is the first generation adapter, not
the canonical project format. Other providers must be possible later.

The user remains the visual critic. Do not reintroduce automatic aesthetic
rejection or unapproved speculative reference generation.

## Product thesis: filmmaking first

The engine, adapters, and jobs are supporting infrastructure, not the product
thesis. Strawberry follows a human-directed filmmaking process: develop the
story, break it down, prepare the cast/locations/props, then produce and review
storyboard cuts using those approved visual foundations.

The migration must retain this sequence:

1. Develop the intent, story, format, duration, and visual language with the user.
2. Break the story into scenes, shots, and storyboard cuts, with editable order,
   timing, action, coverage, and camera intent.
3. Work backward from that breakdown to a production requirements list: recurring
   characters, locations/sublocations, props, wardrobe, era, style, and continuity
   requirements. Reconcile mentions to stable entities; do not create a new
   identity for a different pose or an alternate name.
4. Perform casting, location scouting/design, and prop design through approved
   character, location, and prop sheets/reference sets. Decide which views are
   needed from actual shot requirements, not a universal hardcoded grid.
5. Prepare each cut using relevant approved sheets/views, continuity state, and
   selected existing takes from anywhere in the project, defaulting to approved
   sources. Propose missing views or asset states for
   approval; do not silently invent or pre-generate all possibilities.
6. Generate, show the user the take in sequence, record feedback, and revise or
   continue as authorized. Default to incremental cut review; offer batch approval
   only as an explicit user choice. Approvals are creative decisions, not repeated
   permission to perform every internal bookkeeping step.

### Sheets and continuity

- A sheet is an approved visual specification of an asset, not an incidental
  scene image. Character sheets distinguish identity/body/wardrobe from temporary
  actions or carried props; prop sheets show useful construction/detail/state;
  location sheets establish spatial relationships, landmarks, entrances, and
  relevant viewpoints. Neutral character/prop backgrounds can aid inspection;
  locations should not inherit a white product-studio background rule.
- Keep the full sheet and identifiable approved views/crops where useful. A
  generated multi-angle sheet is not proof of coherent 3D geometry or a true 360
  capture. User review remains necessary, particularly for new/reverse angles.
- The assistant can inspect all relevant project context. The image model gets
  an explicitly selected reference package within its actual input capabilities,
  not every image in the project. Missing required references must be surfaced,
  not silently trimmed. The prompt identifies the role of each attached image.
- Preserve independent asset references alongside continuity references. Do not
  recursively depend only on the immediately previous generated image.
- Track story chronology, editorial order, and generation history separately.
  A next cut can be a continuation, reverse angle, insert, flashback, or a new
  scene. Store the chosen continuity source and what must match/change; it need
  not be the immediately preceding cut or the most recently generated take.
- A Script Supervisor skill should prepare/check continuity notes (identity,
  prop hand/ownership, wardrobe, screen direction/eyelines, location geography,
  lighting/time, and story state). This is not an autonomous aesthetic critic.
  Code validates IDs, versions, ordering and required references; the assistant
  reasons about narrative continuity; the human approves visual results.

### Story hierarchy plus reusable visual references

Clarification from the user: every generated cut/take joins the reference
library alongside character, location, and prop sheets. Reuse is not limited
to adjacent cuts or a small list of transitions such as reverse angles and
flashbacks. Any existing image can supply a useful visual property for a new
generation, including when its cut is later in editorial order.

Maintain two connected structures:

- Context hierarchy: project -> scene -> shot -> cut, with asset entities
  linked at the applicable scopes. Parent defaults normally flow downward.
  Any child can override parent creative context; overrides are explicit,
  field-aware, scoped and traceable. Appearance changes do not silently mutate
  canonical identities. Sibling context is available for reasoning but is not
  blindly inherited as state. See [context rules](WORKFLOW_RULES.md).
- Reference relationships: immutable media versions linked to a new take with
  their intended purpose. Roles may include edit base, identity, wardrobe,
  environment geometry, prop detail, pose, composition, lighting, or texture.
  Each link records what to preserve/borrow and what not to copy, plus any
  crop/region used. A single image can serve multiple declared purposes.

Editorial sequence is distinct from the primary image used as an edit base.
The assistant chooses between editing a suitable existing take and composing
a fresh frame from references. An edit base is optional; do not force one when
the required camera/action change makes it inappropriate. Model adapters map
these semantic roles to actual supported inputs rather than pretending every
provider implements the same conditioning controls.

For each generation, assemble a reviewable recipe: current inherited context,
explicit cut intent, candidate references and rationale, selected exact media
versions, optional base image, preserve/change/exclude instructions, and the
final prompt with matching upload order. Resolve conflicts before submission.
Reasoning can use broad project context while the rendering request stays
selective and within the selected model's supported limits.

Every take remains discoverable, including superseded or rejected takes. Default
to approved sources; rejected takes are not silently promoted into identity
truth, though the user may explicitly reuse a good composition or other part.
Store the scope of that reuse. Taking an old image as a reference never changes
the historical source image or its approval state.

Generation lineage points from existing immutable media versions to a newly
created take. Re-editing an earlier cut using a later cut therefore produces a
new version without creating a circular dependency among the actual versions.
Changing a parent context or active source flags dependent work for review;
it does not rewrite completed recipes or automatically spend on regeneration.

### Evidence and limits

[ScreenSkills' script supervisor profile](https://www.screenskills.com/job-profiles/browse/film-and-tv-drama/technical/script-supervisor-film-and-tv-drama/)
describes a pre-production continuity breakdown covering cast, actions,
wardrobe, props, and story days. This directly supports the production-breakdown
approach, rather than merely the storage architecture.

[Google's image-generation documentation](https://ai.google.dev/gemini-api/docs/image-generation)
describes multiple-reference image generation, and the
[DeepMind prompt guide](https://deepmind.google/models/gemini-image/prompt-guide/)
recommends clear references and distinct subject names for consistency. These
support the mechanism, not guaranteed cross-shot fidelity. Check the chosen
Higgsfield model's exposed schema rather than assuming direct-API feature parity.

The external research did not establish a turnkey open-source system that fully
proves this whole loop. Our plan combines documented filmmaking practice,
available generative capabilities, and selected production/review patterns.

## Research method

Two research agents examine production/storyboarding tools and execution/review
architectures independently. The parent checks Strawberry's actual contracts
and the Higgsfield integration boundary. Prefer official repositories and docs.
Documented capability is not proof of reliability or image quality. This is not
a hands-on benchmark or a claim that any product is universally state of the art.

## Local evidence

- `backend/orchestrator/plans.py` already persists plan items, dependencies,
  approval flags, and refinement chains. Keep the concept; strengthen revision
  validation and execution safety.
- `backend/providers/base.py` has an image-oriented generate/edit interface.
  It does not yet expose a durable submission/status/result job contract or
  typed video inputs such as start/end frames.
- `backend/orchestrator/gen_stats.py` explicitly keeps counters in process
  memory. These cannot be the authoritative job ledger after restart.
- `backend/orchestrator/cut_executor.py` compiles a prompt independently of
  subsequent reference ordering/trimming. Replace that separation with one
  approved, immutable generation specification.
- The same executor resets other in-progress cuts in its finalizer. Replace
  this with job ownership and explicit recovery, not project-wide status resets.

## Integration boundary

The official [Higgsfield CLI](https://github.com/higgsfield-ai/cli) documents
model/workflow schema discovery, create/get/list/wait job operations and cost
estimates for supported operations. Use capability discovery and record the
CLI version/schema used. Do not infer universal cancellation, idempotency,
reference limits, or price estimation from this command list.

[Higgsfield credit rules](https://higgsfield.ai/creator-hub/help-center/credits/how-credits-work)
state that MCP/CLI generations consume credits even for website Unlimited
models. Show unknown costs as unknown, not zero.

## Proposed acceptance benchmark

One character, one recurring prop, one location with a sublocation, and three
connected cuts. Use a fake provider first; a paid run needs a bounded approved
plan.

1. Resume in a fresh assistant session from saved state, not conversation memory.
2. Inspect the exact prompt and ordered media references before approval.
3. Execute the approved revision; a prompt/reference change invalidates approval.
4. Repeated submission of the same local execution key does not launch another
   job. An ambiguous remote submission becomes reconciliation-needed, not an
   automatic retry: remote exactly-once behavior is not assumed.
5. Restart the local worker during a known remote job and reconcile by provider
   job ID. Surface an unknown submission outcome explicitly.
6. Refine one cut while retaining all earlier outputs and their provenance.
7. Change an asset's active version and show dependent cuts as potentially stale,
   without silently regenerating or changing their historical reference bindings.
8. Review sequence and versions in the viewer. Selecting an existing version
   requires no LLM call and no generation credits.
9. Export and restore records plus media; provider URLs are not the sole archive.

## Scope guardrails

- No new custom conversational agent platform.
- No public SDK, distributed workflow cluster, or full video editor in the first slice.
- No assumption that local folder access implies cloud-to-local server access.
- No wholesale dependency adoption based on feature lists or GitHub popularity.
- Check licenses before copying code; architectural inspiration is distinct from reuse.

## External comparison

These are complementary references, not interchangeable competitors. Agents
inspected primary documentation/source; no external application was run.
Moving-branch source links should be pinned to commits before implementation
depends on their behavior.

| System | Useful evidence | Lesson for Strawberry | Boundary / caution |
| --- | --- | --- | --- |
| FireRed-OpenStoryline | Typed media/clip schemas and per-node persisted artifacts; Claude Code integration | Assistant-accessible production operations and inspectable intermediate artifacts | Integration invokes its own agent; do not import a second reasoning runtime. Shot storyboard planning is an open proposal, not an established shipped feature. |
| StoryToolkitAI | Shared engine for GUI/CLI, source media/timecode provenance | One domain engine shared by tools and viewer | A shared in-process engine alone is not a restart-safe daemon. Separate transport/reconnect work is documented as deferred. |
| Storyboarder | Board UIDs, timing, image layers and embedded staging state | Sequence-first review and portable scene assets | Not a continuity guarantee. Repository license terms need legal verification before code reuse; do not assume public source means permissive reuse. |
| Kitsu / Zou | Entity relationships, asset casting, preview revisions and review comments | Explicit asset-to-shot relationships; approval/comments bound to a particular take | Production tracking, not automatic visual consistency. Do not adopt its full deployment for a single-user local tool. |
| ComfyUI | Validated submission, prompt IDs, separate queue/history/progress endpoints | Freeze a request and give it an ID; status must be queryable without the live event stream | Inspected core queue/history is in memory, not the durable ledger we need. |
| InvokeAI | SQLite queue, gallery boards and metadata/workflow recall | Persistent jobs and an artifact library independent of chat | Inspected startup code cancels interrupted states; persistence is not automatic resumption. |
| Remotion | Agent skills, parameterized compositions, independent preview and renderer | Existing assistant + visual preview + explicit execution boundary | Not a replacement for generative identity management or a durable local queue. Licensing needs review before adopting it as a dependency. |

### Primary sources

- OpenStoryline: [schema](https://github.com/FireRedTeam/FireRed-OpenStoryline/blob/main/src/open_storyline/nodes/node_schema.py),
  [artifact storage](https://github.com/FireRedTeam/FireRed-OpenStoryline/blob/main/src/open_storyline/storage/agent_memory.py),
  [assistant integration](https://github.com/FireRedTeam/FireRed-OpenStoryline/blob/main/.claude/skills/openstoryline-use/SKILL.md),
  [storyboard proposal](https://github.com/FireRedTeam/FireRed-OpenStoryline/issues/100).
- StoryToolkitAI: [architecture](https://github.com/octimot/StoryToolkitAI/blob/main/docs/DEVELOPMENT.md),
  [story model](https://github.com/octimot/StoryToolkitAI/blob/main/storytoolkitai/core/toolkit_ops/story.py).
- Storyboarder: [board model](https://github.com/wonderunit/storyboarder/blob/master/src/js/models/board.js),
  [scene assets](https://github.com/wonderunit/storyboarder/blob/master/src/js/models/shot-generator-data.js),
  [license caveat](https://github.com/wonderunit/storyboarder/blob/master/build/license_en.txt).
- Zou: [entities](https://github.com/cgwire/zou/blob/main/zou/app/models/entity.py),
  [preview revisions](https://github.com/cgwire/zou/blob/main/zou/app/models/preview_file.py),
  [comments](https://github.com/cgwire/zou/blob/main/zou/app/models/comment.py).
- ComfyUI: [API routes](https://docs.comfy.org/development/comfyui-server/comms_routes),
  [queue implementation](https://github.com/Comfy-Org/ComfyUI/blob/master/execution.py).
- InvokeAI: [workflow API](https://github.com/invoke-ai/InvokeAI/blob/main/docs/src/content/docs/development/Guides/workflow-api.mdx),
  [SQLite queue](https://github.com/invoke-ai/InvokeAI/blob/main/invokeai/app/services/session_queue/session_queue_sqlite.py),
  [gallery](https://invoke.ai/features/gallery/).
- Remotion: [agent skills](https://www.remotion.dev/docs/ai/skills),
  [parameterized compositions](https://www.remotion.dev/docs/parameterized-rendering),
  [renderer](https://www.remotion.dev/docs/renderer/render-media).

## Proposed changes to the migration plan

1. Separate an asset's logical identity, immutable media versions, and the active
   selection. Every cut take pins exact input versions. Feedback and approval
   reference the take, not just the cut or latest output.
2. Store continuity state explicitly: who is present, location/sublocation,
   wardrobe, prop ownership and relevant state changes. Stable identity is not
   the same as changing scene state. Let the assistant propose this data; let
   the engine validate relationships. This is our recommendation, not a claim
   that any compared system fully implements it.
3. Define a normalized GenerationSpec before writing adapters: prompt, typed
   ordered media roles, pinned inputs, capability snapshot, effective settings,
   output destination and approval revision. Provider-specific settings remain
   available without becoming the project schema.
4. Persist Job and Attempt separately from creative Take. A retry is not
   necessarily a new creative version. Capture remote receipts and explicit
   uncertain-submission states; never claim exactly-once remote execution.
5. Separate remote generation completion from local artifact readiness. An
   output download/import failure retries collection, not paid generation.
6. Have CLI, MCP and viewer invoke one application service. Host skills explain
   the workflow but do not implement validation or own production state. Tool
   responses should contain stable IDs and structured actionable errors.
7. Scope the viewer to sequence, selected takes, reference inspection, lineage,
   job status and revision comparison. Defer full editing/compositing tooling.
8. Make export/import and restart tests part of the first proof, not a later
   polishing phase. Bind locally by default and keep credentials out of exports.

## What not to adopt

Do not fork an entire competing app, adopt a node editor merely to run a CLI,
build an autonomous critic, or call a system state-of-the-art based on its
README. No external code or dependencies have been imported by this research.

## Next planning deliverable

Produce the architecture decision and staged implementation backlog with exact
existing modules to retain, replace, and delete. The first stage must prove
the acceptance benchmark above with fake adapters before approved paid testing.
Resolve Higgsfield's actual schema, upload ordering, job lookup, cancellation,
cost and ambiguous-submission behavior against the installed CLI at that stage.
