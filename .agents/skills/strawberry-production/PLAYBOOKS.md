# Strawberry production playbooks

These are operating procedures for one Codex coordinator. They are not separate
chatbots, phase greetings or hidden model calls. Save facts through the engine,
return to earlier work whenever needed, and use `workflow PROJECT_ID` to identify
mechanical gaps without spending an LLM call.

## Interaction cadence

- Capture the user's original request before translating it.
- Ask only when an unresolved choice materially changes story, visual direction,
  casting, scope or spend. Group related choices into one concise question.
- Once direction is clear, create a coherent non-billable proposal across all
  relevant scenes/shots/cuts or assets. Do not ask “continue?” after every node.
- Report what was actually saved and any deterministic blockers. A navigation
  action, phase completion or readiness check never requires user confirmation.
- Before paid work, present exact frozen recipes, references, models, settings
  and known/unknown total cost. Approval is required only at that boundary.
- Show every output and retain every take. The user decides whether it is
  approved, rejected, reference-only, selected or revised.

## Development / Director

Inputs: raw user brief, attachments and existing production records.

1. Capture the raw request at project scope.
2. Extract, without embellishing named facts: format, duration, audience, title,
   premise, story goal, genre, tone, style, era, aspect ratio, casting, locations,
   must-show moments, forbidden content and delivery constraints.
3. Put defaults at project scope only when the user stated or approved them.
4. Preserve named people/brands as requested. If provider policy or likeness
   constraints arise later, report the real provider response; do not silently
   recast the subject.
5. Present one compact creative brief and only the material open decisions.
6. When the user names a film, show, artist or era as a reference, ask what the *art
   style* is before anything else — a reference is not a style.
7. Compile the **style bible** yourself and write it as typed project fields, before the
   first review pass (later edits stale every review in the project):
   - `bible.palette_hex` — 4–6 `#RRGGBB` codes, quoted verbatim in every prompt;
   - `bible.tokens` — 4–6 concrete, re-quotable technique phrases. "Halftone Ben-Day
     dots, cyan/magenta offset 2px" is a token. "Spider-Verse art style" is not;
   - `bible.lighting_rules` — 2–3 sentences on default light, shadow and edge;
   - `world_logic` (animals talk? magic exists? fake moon set?) and `negative_prompts`.

Output: captured source plus typed project fields (including the bible) and rich notes.

## Story / Story Architect

Inputs: resolved project context and captured brief.

1. Design the complete narrative arc before generating assets.
2. Create scenes in story chronology. Each scene records purpose, location/time,
   turning point, cast availability, action and continuity-relevant state.
3. Break every scene into shots with camera intent, framing/distance, angle,
   movement, staging, duration and coverage purpose.
4. Break every shot into visual cuts. Each cut must define its action, timing,
   actual visible cast, exact location/sublocation and required props, including
   explicit empty lists where appropriate.
5. Write the **beat** as fields, not prose: `beat.purpose` (what this moment
   accomplishes), `beat.emotional_intent` (what the audience should feel),
   `beat.visual_point` (why it matters visually — the one thing the frame must carry),
   `beat.theme` (what it advances). One decisive still moment per cut; a beat with two
   actions is two cuts.
6. Write the **performance** for the visible cast: `performance.expression`,
   `performance.body_language`, `performance.gaze`, and where useful
   `performance.gesture`, `performance.state`. Expression comes from these fields and
   the action text, never from a second reference image.
7. Write **sound** at the level it belongs: `sound.ambient` on the scene,
   `sound.sfx` and `sound.music` on the cut, and `transition` out of the cut. Declare
   silence explicitly by clearing the field; an absent field is an omission and the
   engine warns about it.
8. Shots carry the lens: `camera.framing`, `camera.angle`, `camera.movement`,
   `camera.height`, `camera.lens`, `camera.depth_of_field`, `camera.foreground`,
   `camera.background`. Scenes carry `lighting.source/color/direction`, `atmosphere`,
   `mood`, `set_decoration`.
9. Script mode: when the user pastes a script or scene text, parse it as written into
   scenes, shots and cuts. Do not propose an alternative structure first.
10. Keep editorial position and `story_order` distinct. Link `continuity_from`
    to any relevant earlier cut, not automatically just the previous cut.
11. Run project workflow/readiness. Fill mechanical omissions directly when they
    follow from the approved breakdown; ask only if the fix changes intent.
    Readiness *warnings* (`beat_missing`, `performance_missing`, `sound_missing`,
    `bible_missing`) are advisory: fill them or state why not.

Output: complete scene -> shot -> cut hierarchy, not a teaser followed by repeated
nudges to finish the remaining scenes.

## Cast & Scout / Production Designer

Inputs: the whole approved breakdown, not just the first scene.

1. Check world logic first (`world_logic`): in a realistic or sci-fi story animals do
   not talk or wear clothes unless stated; an ambiguous name ("Ram", "Rose", "Hunter")
   is human until the verbs say otherwise ("grips his staff" → human).
2. Run the **asset decision tree** for every noun in the breakdown; the first yes wins:
   1. off-screen or a thought → not an asset;
   2. ambient atmosphere (rain, fog, neon haze) → scene `weather` / `atmosphere` /
      `lighting.*`, not an asset;
   3. generic crowd or background ("two cops in the corner", "a poster") → not an
      asset; the cut prompt describes it inline;
   4. wardrobe, makeup or a body feature of a character → merge into that character's
      `wardrobe` / `distinctive_features` / `consistency_tokens`; never a separate node;
   5. an object whose look is defined by another asset ("Mara's locket", "the stall in
      the alley") → a prop or sublocation under that parent;
   6. a different *state* of an existing asset (wet, at dawn, glowing, aged) → a
      continuity state or an `asset_requirements` entry of kind `state`, not a new asset;
   7. a named region inside a location → a sublocation under it;
   8. a recurring named vantage on a location → an `asset_requirements` entry of kind
      `view` on that location, with the camera intent in its instruction;
   9. otherwise → a primary asset.
   Reconcile aliases before creating records ("Dr. Chen" and "the scientist" are one
   node). Separate asset identity from wardrobe, damage, possession, time-of-day and
   other story states.
3. Write identity locks as fields. `consistency_tokens`: 3–6 short verbatim phrases the
   renderer must echo every time ("amber eyes", "bone clasp", "scar on chin") — each at
   most six words, never the asset's own name, never a sheet directive ("pure white
   background", "soft even lighting"). `distinctive_features` and `wardrobe` hold the
   rest. If a real person is preserved as requested and the provider later refuses,
   report the provider's response; if the user chooses a recast, record the original
   in `inspired_by` so the substitution is visible.
4. Model sublocations under their parent location when geography matters.
5. Link each cut through typed visible cast, location and required props.
6. Derive reference requirements from actual planned coverage:
   - character: identity, full-body proportions, required body angles, wardrobe,
     expressions or story states visible in planned cuts;
   - location: connected geography, entrances/exits, landmarks, reverse angles
     and planned viewpoints, not a generic white-background object sheet;
   - prop: shape, scale, construction, readable details and planned states.
7. Choose one multi-view sheet or base-conditioned views per asset based on the
   requirements. Do not force one hardcoded grid or speculative precaching.
8. Prepare all useful sheet recipes as a bounded reviewable batch. Initial sheets
   need no prior identity generation unless an existing approved source is used.

Output: canonical assets, cut scope, requirements and proposed sheet recipes.

## Continuity / Script Supervisor

Run after breakdown, before each cut recipe, and whenever a take is reviewed.

1. Read hierarchy defaults and explicit story-state links separately.
2. Track stable identity, wardrobe, prop ownership/state, location geography,
   screen direction, eyeline, lighting/time and action progression.
3. Search all approved takes for useful evidence, including non-adjacent cuts.
4. Do not infer that a generated image fulfilled its prompt. Only human-confirmed
   depicted assets and requirement coverage are usable facts.
5. When incoming states conflict, surface the conflict and author an explicit
   before-state resolution. Never choose “latest generated” automatically.
6. Treat a continuity discrepancy as a proposed fix, not an automatic rejection.

Output: `continuity_from`, before/after facts, blockers and reference candidates.

## Prompt / Reference Director

Inputs: resolved cut context, asset requirements, approved exact media, continuity
facts and user feedback on prior takes.

1. Decide fresh composition versus editing one existing take. Use at most one
   `base`; an earlier cut is not automatically the base.
2. Rank references by what this exact cut must preserve. A practical order is:
   edit base (if any), visible character identity/wardrobe, exact location,
   hero props, then pose/composition/lighting/style evidence. This is reasoning,
   not a hardcoded global cap.
   Start from `candidates CUT_ID`: every approved image in the project scored against
   this cut — in-scope asset sheets, shared cast, same location, same shot, continuity
   links, depth and trust, requirement coverage, latest evaluations, and
   `state_flags` where a take's leaving state contradicts this cut's entering state.
   The list is ranked but the choice is yours; fill the slots by relevance × trust ×
   *diversity* against what you have already chosen, so four near-identical
   front-facing frames never fill the stack. Its `chain` field applies the chaining
   rules below to the editorial predecessor.
   Read each candidate's `depth` (on every media row, and `lineage MEDIA_ID` for the
   full tree). Depth 0 is a sheet or an import; depth n was generated from depth n-1
   images. Error compounds with depth — prefer the shallowest image that carries what
   you need, and when only deep candidates exist for an asset, reach back to its
   approved sheet. `prepare` returns `warnings` when a reference exceeds
   `policy.reference_depth_cap`; treat them as a reason to reconsider, not a block.
   Whether to chain from the previous cut is a decision, in this order: the cut's
   explicit `chain_from_prev` (`yes`/`no`) wins; otherwise do not chain when the
   previous take's depth already meets the cap; otherwise chain when this cut is in
   the same shot (same `parent_id`) or its `action` / `transition` / notes use
   continuity language ("moments later", "still ", "match cut", "continues",
   "a moment later", "without cut", "carries on", "right after"); otherwise do not.
   A chosen previous cut is declared through `continuity_from` and attached as a
   `base` or `composition` reference — never silently.
3. Inspect pixels and conflicts. Assign exact roles and one instruction per image
   saying what to preserve or borrow and what must not transfer.
4. Read the live model contract. Select a prompt-capable image model that accepts
   the required references. Follow `MODEL_ROUTING.md`; no silent fallback.
5. Write a model-appropriate prompt with explicit outcome, continuity locks,
   required changes, composition/camera, environment/geography, lighting/style
   and exclusions. Reference labels/order must match the frozen recipe.
   Quote the bible **verbatim** in every prompt, in this order: art style →
   `bible.palette_hex` → `bible.tokens` → `bible.lighting_rules`. For each visible
   character quote `appearance; distinctive_features; wardrobe` and every
   `consistency_tokens` entry word-for-word. Put the `beat.visual_point` and the
   `performance.*` fields into the action sentence; put `sound.*` nowhere — it is not
   for the image model. Close with `negative_prompts`.
6. Present the complete recipe and estimate. After approval, enqueue exactly it.

Output: immutable GenerationSpec plus approval request, never an opaque “compose.”

## Evaluate / Script Supervisor's instruments

Evaluations are observations you record about one exact image. They never set review
status — the human does that — and they are kept outside the frozen generation context,
so recording one never stales a recipe. Each record binds to the image's current
`review_context`; if definitions change, evaluate again. Run them after collection,
before asking the human to review.

1. **Facts.** Answer **every** question — a partial answer sheet is not an evaluation and
   the engine will not count it. `facts CUT_ID` returns the cut's declared facts as questions — each visible
   cast member, each identity lock, the location, each prop, each entering continuity
   state, the action, the beat's visual point, the style. Look at the take and answer
   every question with a probability that the answer is yes. Record
   `evaluate` with `kind: facts`, one `evidence` entry per question, and two scores:
   `arithmetic_mean` (how many atoms landed) and `geometric_mean` (whether the *whole*
   declaration landed — one failed atom sinks it). If a question marked `cap_on_miss`
   scores below 0.5, cap `geometric_mean` at 0.4: a named detail that does not match is
   not close enough.
2. **Judge.** Two prompts to yourself, each the minimum of its sub-scores, on 0–1:
   - semantic consistency — every declared fact present *and* nothing changed that was
     not asked to change (compare against the `base` reference when there is one);
   - perceptual quality — anatomy, naturalness, artifacts, readable text. **Crop and
     look at every visible cast member at full resolution before scoring**: a head
     tilted the wrong way, a child carried on the back when the carrier is on the
     chest, a missing strap, are invisible at contact-sheet size and are the defects
     that matter most. Score every frame that declares the cast, not a sample.
     Check **hands and arms** on every figure specifically — fused digits, mitts with no
     fingers, an arm that never emerges from a garment. They are the commonest defect and
     the easiest to skim past: three independent evaluators each found one in frames that
     had already been cropped and passed by a careful reader.
     Score style against the project's `bible.*` **as written**, not against how this
     frame compares to the last one. "Better than before" is not "meets the contract".
   Be strict: if the face drifted, score identity low; if wardrobe changed without a
   declared state, score it low. `overall = sqrt(sc * pq)`. Record `kind: judge` with
   scores `sc`, `pq`, `overall` and every problem as a tagged `discrepancy`
   (`identity_drift`, `wardrobe_mismatch`, `prop_missing`, `location_mismatch`,
   `state_mismatch`, `instruction_not_followed`, `artifact`, `copy_paste`, …) with the
   asset and region it concerns. Tags, not adjectives.
3. **Pairwise.** When two takes compete for one cut, ask "which is better on each axis",
   not "how good is each"; record `kind: pairwise` on the preferred take with the loser's
   media id in the evidence.
4. **Stranger.** Give a sub-agent only the image file and the `facts` questions — never
   the notes, the sources, the prompt, your scores or this conversation. Tell it to crop
   every named subject before answering, to answer every question, and to add a free note
   on anything wrong that no question asked about. Record as `kind: stranger`. Run one on
   at least every third take and on every take about to be reused as a reference. Its
   value is that it cannot be talked into approving, and that free note is where error
   classes nobody has named yet appear — here it found malformed hands and a style drift
   the named questions could not have caught. A gap over 0.25, or a second opinion below
   the threshold, stops the take by itself.
5. Read `evaluations MEDIA_ID` before reusing any take as a reference. The readiness
   warning `reference_unevaluated` names selected references with no `judge`/`facts`
   record; with `policy.require_evaluation_for_reference` set on the project, `prepare`
   refuses such references instead.

## Autonomous mode

With `policy.autonomous` on the project, the evaluation gate is enforced rather than
advised, and `scripts/autopilot.py step PROJECT_ID` drives everything that needs no eyes:
it approves fresh recipes within `policy.credit_ceiling_per_take` (acknowledging unknown
cost only if `policy.allow_unknown_cost`), enqueues, drives the worker, runs the duplicate
check, and — once a take has current `facts` and `judge` records that clear
`policy.min_take_score` — writes an evidence-backed review (author `assistant`, depicted
assets = what the facts record saw) and selects it. It hands back exactly two kinds of
task: `evaluate` (look at the take, answer every question with a probability and a
region, write facts and judge) and `prepare` (write the next recipe from `candidates`
and `repair`). In this mode `prepare` refuses a prompt that does not quote every lock of
every asset in scope, a reference that failed its own facts, and a cut past
`policy.max_takes_per_cut`; `select` refuses a take that has not passed the gate.
Loop: `step` → do the tasks → `step`, until the summary shows only `accepted`.

If a provider refuses a submission on content grounds the job fails as
`provider_rejected` and `repair` says what to do; a likeness the provider will not accept
as an image becomes `reference_mode: text` on the asset, and its identity travels as its
quoted `consistency_tokens`. Coverage then requires those tokens in the prompt; the facts
gate still requires the asset to appear in the take.

## Edit review

Frames pass one at a time; an edit fails between them. Run `sequence PROJECT_ID` after any
batch of cuts lands and before calling a production finished. It reports, deterministically
and without a model: a subject reversing screen direction inside a scene with no declared
crossing; neighbouring cuts that would render the same picture; a declared `match_frame`
pair whose framing does not actually match; runtime drift against `target_duration_seconds`;
one scene taking more than 40% of the film; four or more consecutive cuts at one framing;
two cuts carrying the same `beat.visual_point`; and evaluation coverage per scene, so a gap
cannot hide in a project-wide average. Declare `screen_direction` on cuts that travel and
`match_frame` on any frame that must cut together with an earlier one — a declared match is
expected to look alike and is not reported as a duplicate.

## Review and refinement

1. Show the actual image at useful size with prompt, model, references and take
   history available nearby.
2. Record the user's decision and the entities/requirements they confirm are
   visibly present. A prompt claim is not confirmation.
3. Selection is separate from review. A redo creates a new recipe and take; the
   previous selected image stays selected until its replacement is approved.
4. Read cumulative feedback from the exact take. Prepare a precise edit or fresh
   recipe, explaining which references are reused and why.
5. Never auto-retry paid work. Evaluations inform the human's review; they do not
   replace it, and they never approve, reject, select or regenerate anything.

## Going backward

Any earlier node can be revised. Use optimistic revisions and preserve original
sources. Re-run workflow/readiness, then prepare new recipes only for affected
work. Historical recipes and takes remain inspectable; no parent edit silently
rewrites them or spends credits.
