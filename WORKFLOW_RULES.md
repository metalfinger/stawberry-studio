# Strawberry context and reference preparation

2026-09-21 extension: local assistant hosts now include Claude Code and Codex.
See `START_HERE.md` and `workflow/PORTABLE_WORKFLOW.md`. Earlier single-host
scope below is historical; context inheritance and reference contracts remain.

Date: 2026-09-16
Status: Agreed target contract. The isolated proof implements field inheritance,
source retention, exact recipes and take history. Story-state relationships,
complete semantic readiness and real-provider visual validation remain pending.
See [implementation status](MIGRATION_STATUS.md); do not assume full completion.
Related: [migration plan](MIGRATION_PLAN.md), [product thesis](MIGRATION_RESEARCH.md).

## Confirmed scope

Local Codex operates Strawberry. No cloud or second-assistant integration is
required for this migration. Keep provider-neutral domain operations, but do
not implement speculative transports. The user reviews creative decisions and
generation requests during development/testing.

Any child may override a parent. Image selection, reference order, edit-base
choice and prompt writing are creative reasoning tasks for Codex. The engine
validates and faithfully executes the prepared request; it does not silently
substitute references or impose a universal prompt template.

## Context rules

1. An absent local field inherits its closest applicable ancestor value.
2. An explicit local value overrides that field, not every other field in the
   same object. Scene lighting.direction can change while lighting.temperature
   stays inherited. Typed structured fields avoid contradictory prose merging.
3. Explicit removal is distinct from absence. "No music" or "no visible people"
   must not fall back to a parent's default. Restoring inheritance is a separate
   operation from clearing a value. Do not overload blank text/null to mean all
   of clear, unknown and inherit.
4. Collections have explicit replace/add/remove operations. Do not automatically
   union lists of people or props into every child frame. A scene's available
   cast is distinct from a cut's visible cast, which may explicitly be empty.
5. All creative fields can have scoped overrides, including style or appearance.
   Record intent and scope; an older version of a character may refer to a
   deliberate age/wardrobe state without mutating the canonical identity or
   silently creating another unrelated character.
6. Save the local patch and the origin of each resolved value. A new request
   resolves current approved revisions; a submitted request stores a frozen
   context snapshot. Parent changes flag affected work, not rewrite history.
7. Story mutations proposed in a chat are pending until approved during testing.
   Missing facts are unknown, not invented defaults presented as user decisions.
   The assistant can propose reasonable choices together for efficient approval.

### Context is not the same as story state

Hierarchy controls defaults. Continuity links control state across story beats.
A handoff of a prop, wet clothing or an injury may persist in connected later
cuts, while a camera change normally belongs only to a shot/cut. Do not copy all
fields from the preceding cut or automatically spread a cut override to siblings.

Record each meaningful change as local-only or as a story-state transition with
a declared scope/continuity link. Start with explicit links and state records,
not a general-purpose simulation engine. A flashback or alternative edit follows
its own declared state. Contradictory source states require resolution rather
than an arbitrary "most recently generated wins" policy.

### Example

Project: realistic 1980s film; warm palette.
Scene: railway platform, dawn, rain, Mara in a navy coat; porter available.
Shot: medium close-up of Mara; porter outside frame.
Cut A: Mara turns left; no other visible people.
Cut B: Mara hands the ticket to the porter; ticket ownership changes here.
Cut C: connected later beat inherits that ticket state, but not Cut B's framing.

Each level can override relevant inherited fields. Cut A does not gain a porter
in frame merely because the scene includes him. Cut B's handoff is not inferred
to have happened solely because the image model was instructed to render it:
the user reviews whether the take actually depicts it correctly.

## Prompt Director responsibility

Implement as a Codex workflow skill, not another hosted LLM process.

1. Retrieve resolved context, intended action, constraints, scene/story state,
   linked assets, and relevant prior takes. Search beyond immediate neighbors.
2. Inspect shortlisted images, not only descriptions or their original prompts.
   A requested detail is not proof that a generated image actually contains it.
3. Choose editing an existing take or creating a fresh composition. An edit
   base is optional and chosen for the task, not fixed by sequence position.
4. Choose precise image versions, views/crops, their order and purpose. Explicitly
   state what each supplies and what should not transfer from it.
5. Reconcile conflicts with the intended cut: e.g. a useful pose reference has
   the wrong clothes, so borrow the pose only. Ask for a decision when the
   conflict changes creative intent rather than silently replacing that intent.
6. Write the final model-appropriate prompt against that exact reference list.
   Use the chosen provider's supported input roles/labeling; do not assume a
   literal @ImageN syntax is universal or that the first image is always a base.
7. Present the recipe for approval: intended outcome, reference previews and
   roles, preserve/change/exclude instructions, prompt, settings and known cost.

The engine validates referenced files/versions, model capabilities, input count,
matching bindings and approved revision. It submits exactly that request.
Any post-approval prompt, reference or settings change requires reapproval.
Validation cannot guarantee that the image model obeys the prompt; user review
remains the final visual decision.

## Sheets and useful views

Support both a single multi-view sheet and multiple base-conditioned images.
Choose based on required detail, asset complexity and tested model behavior.
Do not require identity-image-then-sheet as two paid steps, or always force a
grid. A good sheet may itself be the first approved identity reference.

- Character: recognizable identity, whole-body proportions, clothing, useful
  angles and detail views; temporary props/actions are separate scoped choices.
- Prop: dimensions/scale, construction, important details and relevant states.
- Location: connected geography, entrances, landmarks and planned viewpoints.
  A layout sketch/blocking diagram may supplement photographic references.

Grid cells can be cropped as derived views with parent provenance and the user's
approval scope retained. A crop or a generated reverse angle is not automatically
a new independent identity, a true 360 capture, or proof of geometric consistency.
Generate extra views only when a cut needs them and the user approves the work.

Planned view/state/detail/scale requirements are persistent asset records, not
free-form prompt fragments. Human review of an exact take confirms which current
requirements it visibly covers. Changing a requirement invalidates that coverage;
it does not rewrite or delete the old image or review. A generation batch contains
only frozen, current recipes with explicit estimate ceilings and one recorded
user decision. One stale or mismatched recipe rejects the whole batch.

## Approval loop during testing

Review story/breakdown decisions and sheet plans as coherent groups. For each
generation approve a frozen recipe (or an explicitly bounded set of recipes),
then review the results. Saving, downloading, showing progress and registering
outputs do not require repeated confirmation. Regeneration is a new approved
request; restoration/selection of an existing take does not generate anything.

Portable project archives preserve creative records, visual reviews, prompts,
recipes, job history and managed media. They are data, not a transfer of tool
permission: importing an archive clears executable generation approval and moves
in-flight work to explicit reconciliation. The user must inspect and approve any
new provider request in the destination workspace.

## First contract-test cases

- Missing value inherits; local value overrides one field; clear stays cleared.
- Removing an override restores inheritance without touching siblings.
- Empty visible-cast list does not inherit the scene cast.
- Story-state transition affects only declared connected beats.
- A non-adjacent take supplies pose without overriding approved identity.
- Changing a reference after approval invalidates that request's approval.
- Parent revision flags relevant work but leaves completed takes unchanged.
- Prompt preview and provider submission share identical image order/bindings.
