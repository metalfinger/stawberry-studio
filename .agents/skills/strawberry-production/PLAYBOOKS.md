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

## Review and refinement

1. Show the actual image at useful size with prompt, model, references and take
   history available nearby.
2. Record the user's decision and the entities/requirements they confirm are
   visibly present. A prompt claim is not confirmation.
3. Selection is separate from review. A redo creates a new recipe and take; the
   previous selected image stays selected until its replacement is approved.
4. Read cumulative feedback from the exact take. Prepare a precise edit or fresh
   recipe, explaining which references are reused and why.
5. Never run an automatic vision critic or auto-retry paid work.

## Going backward

Any earlier node can be revised. Use optimistic revisions and preserve original
sources. Re-run workflow/readiness, then prepare new recipes only for affected
work. Historical recipes and takes remain inspectable; no parent edit silently
rewrites them or spends credits.
