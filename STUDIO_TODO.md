# Strawberry Studio local work queue

Superseded for current planning by `PORTABILITY_STATUS.md` (2026-09-21).
The pending dream-asset statements below are historical: the dream production
completed all 22 cuts. Retained here as the earlier migration work log.

Updated: 2026-09-18

This is the local source of truth for the Codex-operated migration. Keep it in
sync with `MIGRATION_STATUS.md`; do not infer completion from chat history.

## Operating constraints

- Current product scope is image storyboarding. Video generation is out of scope.
- Work and testing stay local unless the user explicitly asks for a commit/push.
- Higgsfield is an execution provider, not the product architecture. Recipes,
  references, approvals, takes and continuity remain provider-independent.
- No paid generation without approval of the exact frozen recipe or bounded batch.
- Never overwrite an old take, reorder approved references, or silently switch models.

## Completed foundation

- [x] Local SQLite production engine and browser workspace.
- [x] Project/scene/shot/cut and character/location/prop hierarchy.
- [x] Inherited context with explicit override, clear and provenance.
- [x] Typed visible cast, location, props and non-adjacent continuity sources.
- [x] Immutable recipes, exact approval, durable jobs and all-take history.
- [x] Human review, selection, feedback, requirement coverage and batch approval.
- [x] Workspace backup plus selective production export/import.
- [x] Offline fake-provider proof and clean-install test path.

## Current stage: dream-production asset review

- [x] Normalize the live Higgsfield image-model catalog and model details.
- [x] Support both `input_images` and `medias` reference schemas without changing
      ordered Strawberry references.
- [x] Expose read-only model discovery through the Strawberry CLI, local API and viewer.
- [x] Add model-routing guidance to the production skill.
- [x] Verify with mocked provider tests and live read-only discovery; zero credits spent.
- [x] Connect the installed Higgsfield app for reference upload and image submission.
- [x] Add exact-receipt external submission preview/linking so connector jobs remain
      governed by Strawberry recipes, approvals, jobs and local media history.
- [x] Adopt the handmade monochrome charcoal-and-cut-paper dream-collage style.
- [x] Generate and locally collect ten asset candidates for project
      `045f766b-efdb-445f-a888-19852e251bad`.
- [ ] Record human review for all ten candidates; none is currently selected.
- [ ] Select approved character, prop and location references.
- [ ] Prepare the first cut recipe only after the asset review gate passes.

## Next stages

- [x] Add structured creative playbooks for brief, story breakdown, production
      design, continuity supervision and prompt/reference direction.
- [x] Drive one complete offline production from pitch through approved fake takes.
- [x] Improve the viewer's next-action guidance and model/recipe visibility.
- [x] Prepare a small real Higgsfield image proof with exact prompts, ordered
      references, model choices and total estimated credits.
- [x] Obtain user approval and execute the exact four-image batch in `VISUAL_PROOF_BATCH.md`.
- [x] Collect all four real outputs and record initial visual observations; no retries.
- [x] Save three-cut story breakdown and first-cut reference/prompt proposal in `STORYBOARD_PROOF.md`.
- [ ] Validate character identity, location geography, props, previous-cut and
      non-adjacent reference reuse using the resulting real images.
- [ ] Iterate continuity and prompt routing from human review; never auto-reject.
- [x] Complete parity/cutover audit; `CUTOVER_AUDIT.md` blocks deletion until real visual gates pass.

## Input needed later

Dream transcript production `045f766b-efdb-445f-a888-19852e251bad` has the raw
transcript, 5 scenes, 11 shots, 22 cuts/70 seconds, 9 assets, 19 planned reference
requirements and explicit transformation continuity. Abhishek's supplied photo
is the approved selected identity source. Ten charcoal-collage asset candidates
are generated, locally collected and pending human review. Exact media IDs are in
`DREAM_PRODUCTION_2026-09-18.md`. Next: user review and selection, then first cut.

Latest: user accepted cut 1 and requested both remaining cuts. Cut 3 completed
and awaits human review; cut 2 failed remotely with no detailed reason and no
output. Ask for an explicit retry of the unchanged cut 2 recipe; no automatic
retry, model switch or prompt rewrite. See `STORYBOARD_PROOF.md` for IDs.

User preference: human-only visual review; no assistant image inspection by
default. Generate approved cuts and present them in sequence, checking only
technical execution. Current saved breakdown: one scene, three shots, three cuts.
Cuts 2 and 3 depend on cut 1; user acceptance of its pending take is still needed.

The four-image batch and first real three-reference GPT cut are complete.
Prompt, ordered references, receipt, local output and assistant observations are
saved. Next: human review of cut 1, then adjacent and non-adjacent reuse. Do not
promote the pending cut automatically; support placement drift and small prop
details are recorded in `STORYBOARD_PROOF.md`.
