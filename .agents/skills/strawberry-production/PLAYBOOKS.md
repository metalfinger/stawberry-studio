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

Output: captured source plus typed project fields and rich project notes.

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
5. Keep editorial position and `story_order` distinct. Link `continuity_from`
   to any relevant earlier cut, not automatically just the previous cut.
6. Run project workflow/readiness. Fill mechanical omissions directly when they
   follow from the approved breakdown; ask only if the fix changes intent.

Output: complete scene -> shot -> cut hierarchy, not a teaser followed by repeated
nudges to finish the remaining scenes.

## Cast & Scout / Production Designer

Inputs: the whole approved breakdown, not just the first scene.

1. Extract canonical recurring characters, locations/sublocations and props.
   Reconcile aliases before creating records. Separate asset identity from
   wardrobe, damage, possession, time-of-day and other story states.
2. Model sublocations under their parent location when geography matters.
3. Link each cut through typed visible cast, location and required props.
4. Derive reference requirements from actual planned coverage:
   - character: identity, full-body proportions, required body angles, wardrobe,
     expressions or story states visible in planned cuts;
   - location: connected geography, entrances/exits, landmarks, reverse angles
     and planned viewpoints, not a generic white-background object sheet;
   - prop: shape, scale, construction, readable details and planned states.
5. Choose one multi-view sheet or base-conditioned views per asset based on the
   requirements. Do not force one hardcoded grid or speculative precaching.
6. Prepare all useful sheet recipes as a bounded reviewable batch. Initial sheets
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
3. Inspect pixels and conflicts. Assign exact roles and one instruction per image
   saying what to preserve or borrow and what must not transfer.
4. Read the live model contract. Select a prompt-capable image model that accepts
   the required references. Follow `MODEL_ROUTING.md`; no silent fallback.
5. Write a model-appropriate prompt with explicit outcome, continuity locks,
   required changes, composition/camera, environment/geography, lighting/style
   and exclusions. Reference labels/order must match the frozen recipe.
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
