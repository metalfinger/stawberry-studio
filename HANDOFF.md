# Strawberry Studio — Revamp Handoff

> Last updated: 2026-05-07. This file is the single source of truth for an LLM
> session continuing the revamp work. If you're a fresh Claude session reading
> this: stop. Read this whole document. Then read the plan file referenced in
> §1. Then start.

---

## 0. Operating contract (read first)

- **User: Hiren** — game dev / creative technologist, builds Unreal/Python/JS
  apps. Works alone. Money pressure on this project — he said "my money depends
  on this." Take it seriously.
- **API keys he has:** `GEMINI_API_KEY`, `MOONSHOT_API_KEY` (Kimi via Moonshot),
  `FAL_KEY`. **No Anthropic, no OpenAI.** The adapters for those exist but are
  inert until keys are added.
- **He runs `./start.sh`** which boots both backend (`:8000`) and frontend
  (`:5173`). Don't break this.
- **Decided philosophy:** *best models + max context + one-shot success.* Do
  NOT default to flash models for creative roles. Pro tier is fine; cost is a
  rounding error per cut (~$0.08).
- **Working style:**
  - Don't ask confirmation for trivia. Only pause for: API keys, runtime
    browser tests, things only he can verify visually.
  - Test that backend boots after every meaningful change.
  - Maintain backwards compatibility through transitions; legacy paths stay
    until new path is verified.
  - Use the auto-memory system at
    `/Users/hirenk/.claude/projects/-Users-hirenk-Documents-code-stawberry-studio/memory/`
    for cross-session knowledge.

---

## 1. Where to find prior context

| Document | Purpose |
|---|---|
| `~/.claude/plans/lets-plan-rewamp-of-cryptic-lovelace.md` | The original 8-phase plan (approved) |
| **This file** (`HANDOFF.md`) | Current state, decisions, what's next |
| `~/.claude/projects/-Users-hirenk-Documents-code-stawberry-studio/memory/MEMORY.md` | Auto-memory index (user prefs, project facts, decisions) |
| `backend/database/migrations/*.sql` | Schema source of truth |

---

## 2. Project at a glance

**Strawberry Studio** is a visual AI storyboarding tool. Started Dec 2025, 2
commits, ~22 K LOC originally. The user wants to graduate it from "first
working version" to a polished, consistent-output tool.

**Stack:** FastAPI · Pydantic AI · aiosqlite · WebSockets · React 19 · Vite ·
React Flow · Zustand. **Image gen:** Nano Banana Pro (`gemini-3-pro-image-preview`)
+ Fal.ai. **LLMs:** Gemini, Kimi K2, OpenAI, Anthropic (latter two are inert).

**The 6-phase production pipeline** (replacing the old 4-phase BRIEF/STORY/ASSETS/GENERATE):

```
DEVELOP → DESIGN → CAST_SCOUT → BLUEPRINT → STORYBOARD → ANIMATIC
```

Legacy phase names map via `canonical_phase()` in `backend/database/core.py`.
Both naming systems coexist; canonical is preferred.

---

## 3. What's done (phases 0–7, current session bug fixes)

### Phase 0 — Stop the bleeding ✅
- `pyproject.toml` + editable install (`pip install -e .`) — backend boots
  from any cwd.
- CORS env-driven. README rewritten. Stale legacy files deleted.

### Phase 1 — Foundations ✅
- Async DB shim (`backend/db_async.py` wraps sync `backend/db.py` with
  `asyncio.to_thread`).
- Migration runner (`backend/database/migrations/__init__.py`).
- `pydantic-settings` config (`backend/config.py`) with nested
  `LLMConfig`/`ImageConfig`/`StorageConfig`/`CORSConfig`.
- `structlog` + FastAPI exception handlers (`backend/errors.py`).
- Pydantic v2 models (`backend/models.py`) — single source of truth.
- `pydantic2ts` generates `frontend/src/api/generated.ts`.
- FastAPI lifespan runs migrations on startup.

### Phase 2 — Provider abstraction ✅
- `backend/providers/`:
  - `base.py` — `LLMProvider`, `ImageProvider`, `Message`, `LLMResponse`,
    `ImageGenRequest`, `ImageGenResult`, `ReferenceImage`, `ToolCall`, `ToolDef`,
    `ProviderError`.
  - `llm/{gemini,openai,anthropic}.py` + `KimiLLM` subclasses `OpenAILLM` with
    `https://api.moonshot.ai/v1`.
  - `image/{gemini,fal,_storage}.py`.
  - `registry.py` — role-based resolution
    (`reg.llm_for_role("planner") → (provider, model)`), model→provider inference.
- Live-tested with Gemini + Kimi keys: both LLMs respond, Nano Banana Pro
  generates images.
- `services/gemini_image.py` is now a 337-line shim delegating to the new
  providers (was 695 LOC). Legacy `google.generativeai` import gone.

### Phase 3 — Pydantic AI agent system ✅
- All 8 agents ported off Google ADK: **Berry, Sage, Nova, Atlas, Pixel, Iris,
  Spark, Scout**.
- Declarative specs in `backend/agents/specs/*.yaml`, prompts in
  `backend/agents/prompts/*.md`.
- Tool registry (`backend/tools/registry.py`) with `@tool` decorator.
  **78 tools registered** across tags: brief / blueprint / assets / generation /
  elements / navigation / preprod / phase / handoff / qa.
- `backend/orchestrator/`:
  - `agent_spec.py` (YAML loader)
  - `runner.py` (Pydantic AI `Agent` factory + provider routing)
  - `events.py` (event-sourced run log → `agent_events` table)
  - `critic.py` (4 built-in rubrics: BRIEF / BLUEPRINT / ASSETS / CONTINUITY)
  - `chat_bridge.py` (opt-in surface — feature-flag gated)
- `routes/chat.py` has a feature flag `USE_PYDANTIC_AI=1` that routes through
  `chat_bridge` instead of legacy ADK runner.

### Phase 4 — Production pipeline (6-phase) ✅
- Migration 003 — `phases` + `artifacts` tables.
- `backend/orchestrator/pipeline.py`:
  - `get_pipeline_state`, `get_artifact`, `list_versions`,
    `save_artifact_version`, `fork_artifact`, `freeze_and_advance`,
    `mark_phase_in_progress`.
- REST routes in `backend/routes/pipeline.py` (`GET /phases`, `GET/POST
  /artifacts/{phase}`, `POST /phases/{phase}/freeze`).
- `mark_phases_stale` in `database/core.py` walks **canonical** PIPELINE_PHASES
  only (not the legacy + new union — that was the cascade bug).

### Phase 4.5 — Consistency / reference moat ✅ (foundation, not yet wired into UX)
- Migration 004 — `reference_pool` + `continuity_bible` tables.
- `backend/orchestrator/continuity.py`:
  - `compile_continuity_bible` aggregates brief globals + character profiles +
    location set bibles + lighting state per scene.
  - `render_bible_prefix` returns markdown-formatted prefix injectable into any
    agent's system prompt.
- `backend/orchestrator/references.py`:
  - `register_image`, `search`, `get_anchors`, `get_style_anchor`,
    `set_style_anchor`, `auto_register_master`, `auto_register_cut`.
- `backend/orchestrator/picker.py` — Smart Reference Picker scores candidates
  on character match / location / lighting / aspect / anchor / style anchor.
  Returns ranked top-K with rationale + slot assignments.
- `backend/orchestrator/prompt_dsl.py` — Composable Prompt DSL:
  `[STYLE]`, `[CHARACTER:asset_id]`, `[SETTING:asset_id]`, `[LIGHTING:scene_id]`,
  `[ACTION]`, `[CAMERA]`, `[NEGATIVE]`. Returns `{final_prompt, slots,
  used_assets, missing}`.
- `backend/orchestrator/vision_critic.py` — vision-LLM continuity critic with
  `ContinuityScore{face, wardrobe, lighting, props, overall}`.
- **NOT YET wired into the cut generation hot path.** That's Phase 4.8 below.

### Phase 5 — God-module splits ⏸ Deferred
- High risk, low value (modules work). Tackle in calm time.

### Phase 6 — Frontend refactor 🟡 Partial
- ✅ Deleted `ElementsNew.tsx` (dead code).
- ✅ Hooks: `useProjectWebSocket`, `useGenerationPoll` in `frontend/src/hooks/`.
- ✅ Zustand store: `frontend/src/stores/projectStore.ts`.
- ✅ `PhaseRail.tsx` component wired into `ProjectLayout` showing all 6 phases
  with status (pending/in_progress/frozen/stale).
- ⏸ Deferred: nodes.css split, BaseNode shared component, NodeProperties split.

### Phase 7 — Tests + CI + DX ✅
- 15 pytest tests passing across `tests/{db,orchestrator,providers}/`.
- `pyproject.toml`: ruff (clean), mypy (strict on new modules), pytest config.
- `.github/workflows/ci.yml`.
- `.pre-commit-config.yaml` (ruff + prettier + standard hooks).
- `Makefile` targets: `dev`, `backend`, `frontend`, `types`, `lint`, `mypy`,
  `test-backend`, `test-frontend`, `test`, `migrate`, `ci`.
- `frontend/.prettierrc` (printWidth 120, single quotes, semi).

---

## 4. Bug fixes from last conversation (verify these stuck)

User tested with `USE_PYDANTIC_AI=1`. Five bugs surfaced + fixed:

1. **No message_history threading.** Every agent run was fresh memory. Made
   Atlas need 6+ "yes/confirm" loops. Fix: `chat_bridge._load_history_for_pai`
   pulls recent chat from DB and converts to Pydantic AI `ModelMessage`s. Wired
   into `stream_turn`. ✅
2. **Pixel master-readiness refusal too soft.** Said "ready to start, but…"
   instead of "STOP, generate masters first." Fix: rewrote
   `chat_bridge.build_prompt_vars` for the `pixel` branch to inject a hard-stop
   readiness block with explicit "DO NOT call any tools" directive. ✅
3. **`stale_phases` cascade polluted with all 9 names** (legacy + new). Fix:
   `database/core.py:mark_phases_stale` now uses `canonical_phase()` and
   walks `PIPELINE_PHASES` only. ✅
4. **Stream path didn't log tool_call/agent_message events.** Diagnostic blind
   spot. Fix: `runner.stream_agent` now reads `last_resp.all_messages()` after
   the stream ends and logs `tool_call` events + final `agent_message`. ✅
5. **`asyncio.run() cannot be called from a running event loop`** when a cut
   was generated through an async route. Fix: `services/gemini_image.py:_run`
   detects a running loop and trampolines into a worker thread via
   `concurrent.futures.ThreadPoolExecutor`. Works from any context now. ✅

All five fixes verified: 15 tests passing, backend boots clean.

---

## 5. APPROVED: Phase 4.6 / 4.7 / 4.8 / 6.B (the next big push)

User explicitly approved this plan and said "I am okay to use best models and
as much context required but we should aim to get things right in one go as we
have almost all the context right. through individual nodes and its parent and
children and siblings."

### The philosophy (don't violate)

- **Best models, period — cost optimization is later.** User said explicitly:
  *"use best of best models for image generation right now, we will cost
  optimize once we have this fully working."* Currently best = Nano Banana Pro
  (`gemini-3-pro-image-preview`) for multi-reference image, `gemini-3-pro-preview`
  for vision/creative text, `kimi-k2-0905-preview` for cheap-ish structured
  text. Imagen 4 Ultra (`imagen-4.0-ultra-generate-001`, $0.06/img) is
  available if a specific situation calls for it, but Nano Banana Pro is
  better at multi-reference (which is our moat) so it stays the default.
- **Max context — bundle the full production tree before composing anything.**
  The tree (Project → Brief → Continuity Bible → Scene → Shot → Cut → siblings
  + linked assets + prior cut images) is OUR moat. Pure prompt-to-image tools
  don't have it.
- **Tree context drives sheet & pre-production decisions too.** The Sheet
  Planner doesn't just look at asset.type — it reads where the asset is used
  (which scenes / cuts / what poses are demanded by those cuts) and tailors
  the sheet to actually cover those needs. Same for Iris: pre-production gen
  decisions are made with full knowledge of what reference the system already
  has and what gaps the bundler proves are real.
- **Aim for one-shot success.** Critic = safety net, not the expected path.
- **Cost is fine** — ~$0.08 per cut average. A 60-cut storyboard is ~$5. Don't
  let imagined budget pressure justify downgrading models.

### Model routing (final, after this push)

| Role | Default | Why |
|---|---|---|
| `prompter_model` | `gemini-3-pro-preview` | composes with full context |
| `qa_model` (vision critic) | `gemini-3-pro-preview` | needs to see images |
| `critic_model` (text rubric) | `kimi-k2-0905-preview` | cheaper, structured |
| `planner_model` (Berry/Sage) | `gemini-3-pro-preview` | creative quality |
| `detailer_model` (Nova) | `gemini-3-pro-preview` | shot-list quality |
| Sheet / cut image | `gemini-3-pro-image-preview` | best multi-panel |

Update these in `backend/config.py:LLMConfig` defaults — env vars still
override.

### Phase 4.6 — Element Sheets (replaces hardcoded variants)

**Why:** Modern image models (Nano Banana Pro especially) can produce
multi-panel "model sheets" in one generation pass, with internal coherence
across panels. Replaces the dumb 7-variant approach (`side_left, side_right,
3_4_left, 3_4_right, back, face_detail, face_expression_*`).

**Schema (Migration 005):**
```sql
CREATE TABLE element_sheets (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  sheet_type TEXT NOT NULL,            -- 'character_full' | 'character_3view' | …
  template_id TEXT NOT NULL,
  image_url TEXT,
  layout_json TEXT,                    -- {grid:[3,3], cells:[{label,bbox}…]}
  panels_json TEXT,                    -- semantic ['front','3/4','side',…]
  prompt TEXT,
  generation_request_id TEXT,
  is_active INTEGER DEFAULT 0,
  created_at TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);
CREATE INDEX idx_sheets_asset_active ON element_sheets(asset_id, is_active);
```

**Sheet templates** (in `backend/orchestrator/sheet_planner.py`):

| Template | Layout | Panels |
|---|---|---|
| `character_full` | 3×3 | front · 3/4 · side · back · hero pose · face close-up · happy · sad · angry |
| `character_3view` | 3×1 | front · 3/4 · side |
| `character_solo` | 1×1 | one definitive |
| `location_full` | 2×2 | wide · medium · key detail · alt-lighting |
| `location_solo` | 1×1 | wide |
| `prop_3view` | 1×3 | front · 3/4 · side |
| `prop_solo` | 1×1 | one |
| `vehicle_full` | 2×3 | front · 3/4 · side · rear · cockpit · in-motion |
| `costume_flat` | 1×2 | flat front · flat back |

**Sheet Planner rules** — drive choice from the **full tree context**, not
just the asset row. The planner reads:
- How many cuts the asset is linked to
- What poses/expressions/angles those cuts demand (parsed from cut.action +
  cut.expression + cut.body_language)
- What lighting states the asset appears under
- Whether the asset has explicit `wardrobe_lock` / `consistency_tokens`
- Whether the asset is named (asset.name set explicitly) vs incidental
- Brief.art_style (anime benefits from more panels; minimal flat-design less)

Then picks the template:
- Character in **2+ cuts with named role** → `character_full`
- Character with `wardrobe_lock` and dialogue → always `character_full`
- Character in 1 cut only, named → `character_3view`
- Character unnamed / silhouette / extra → `character_solo`
- Location used in 2+ scenes → `location_full`
- Location with multiple time-of-day appearances → `location_full` (forces
  alt-lighting cell)
- Hero prop (linked to >1 cut, named) → `prop_3view`
- Background prop (one-cut, unnamed) → `prop_solo`
- User can always override via UI dropdown.

The point: **a one-shot character sheet generation knows exactly which cells
will actually be needed by the storyboard.** No wasted panels; no missing
ones. This is the tree-context payoff for sheets.

**Sheet Generator** (`generate_element_sheet`):
- Builds a Pro-tier multi-panel prompt using:
  - Brief globals (art_style, palette, world_logic, negatives)
  - Character/location/prop description, consistency_tokens, wardrobe_lock
  - Story usage context (which cuts/scenes the asset appears in)
- Single Nano Banana Pro generation call (one image, multi-panel layout).
- Stores: `image_url`, `layout_json` (cell bboxes), `panels_json` (cell labels),
  `prompt`, marks `is_active=1`.
- Auto-registers in `reference_pool` with `source_type='sheet'`,
  `tags={role: 'sheet', layout: ..., cells: [...]}`.

**Cell-cropping helper** (`backend/orchestrator/sheet_cells.py`):
- `crop_cell(image_url, layout_json, panel_label) → cropped_image_url`
- For models that don't reliably attend to one cell of a multi-panel image,
  the picker can crop on the fly. Cropped images saved to
  `/storage/generated/sheet_cells/`.

**Backwards compat:**
- Old `element_masters` rows stay readable. A new sheet generation creates a
  row in `element_sheets` AND deactivates the old master. Pixel checks
  `element_sheets` first, falls back to `element_masters`.
- Old `element_variants` rows stay readable but no new ones are generated.

**Removal (after sheets verified, follow-up migration):**
- Drop the `variant_type` enum + `get_variant_prompt_suffix` (the 17-line
  dictionary in `services/gemini_image.py`).
- Drop `generate_all_standard_variants` tool.
- Mark `element_variants` table for deletion (migration 006).
- Remove "Generate variant" UI buttons.

### Phase 4.7 — Iris reborn as Pre-production Conductor

**Concept change:** Iris is no longer a chat agent in the GENERATE phase. She's
a **function** invoked silently by the Cut Composer when the Smart Picker
reports a gap (e.g., "two characters interacting, no prior cut shows them
together").

**File:** `backend/orchestrator/iris.py`
- `compose_missing_reference(cut_id, gap: GapDescription) → ref_id`
- Inputs: cut context, gap description (e.g., "Kenji + young customer
  shaking hands"), available sheets to combine.
- Generates a single i2i call combining the relevant sheet cells:
  `[CHARACTER:kenji, cell:hand-detail] + [CHARACTER:customer, cell:front]`
  → one composite reference image.
- Auto-registers in `reference_pool` with `source_type='iris_synthesized'`.
- Returns ref_id; the Cut Composer slots it into the prompt.

**For 80%+ of cuts Iris isn't called.** Only when bundler proves the
composition isn't covered by existing sheets/prior cuts.

**Remove from PHASE_AGENTS:** `pre_production` mode in GENERATE phase. Iris
no longer has a chat presence — it's pipeline-internal.

### Phase 4.8 — Cut Composer (one-button pipeline)

**File:** `backend/orchestrator/cut_composer.py`

```python
async def compose_cut(cut_id: str) -> CutComposeResult:
    """7-step pipeline. Streams progress events to WebSocket as it runs."""
    
    # Step 0: bundle context
    ctx = await bundle_cut_context(cut_id)
    
    # Step 1: Smart Reference Picker  
    picks = await pick_for_cut(ctx.project_id, cut_id)
    
    # Step 2: Pre-production check (Iris if needed)
    gaps = detect_composition_gaps(ctx, picks)
    for gap in gaps:
        new_ref = await iris.compose_missing_reference(cut_id, gap)
        picks = update_picks_with_new_ref(picks, new_ref)
    
    # Step 3: Compose prompt via DSL  
    template = build_dsl_template_from_context(ctx, picks)
    compiled = compile_prompt(template, ctx.project_id)
    
    # Step 4: Render via image provider
    result = await image_provider.generate(ImageGenRequest(
        prompt=compiled.final_prompt,
        model="gemini-3-pro-image-preview",
        reference_images=compiled.slots,
        aspect_ratio=ctx.brief_globals.aspect_ratio,
    ))
    
    # Step 5: Continuity critic
    score = await review_cut(
        candidate_url=result.image_urls[0],
        character_master_url=ctx.linked_characters[0].sheet.image_url,
        previous_cut_url=ctx.previous_cut.image_url if ctx.previous_cut else None,
        scene_lighting=ctx.scene.lighting_signature,
    )
    
    # Step 6: Auto-retry if critic fails (max 2)
    retries = 0
    while not score.passed() and retries < 2:
        # boost reference weighting + add critic feedback to prompt
        result, score = await retry_with_feedback(ctx, score)
        retries += 1
    
    # Step 7: Auto-register in reference_pool
    await auto_register_cut(cut_id, result.image_urls[0])
    
    return CutComposeResult(...)
```

**The Context Bundler** (`backend/orchestrator/context_bundler.py`):

```python
@dataclass
class CutContext:
    project_id: str
    brief_globals: dict           # art_style, palette, lighting_style, negatives, aspect_ratio
    continuity_bible: dict        # full bible
    scene: dict                   # meta + lighting state
    shot: dict                    # camera + composition + lens
    cut: dict                     # action + dialogue + beat
    previous_cut: dict | None     # {image_url, action, character_state}
    next_cut: dict | None         # {action} — narrative flow awareness
    sibling_cuts_in_shot: list
    sibling_cuts_in_scene: list[dict]   # all cuts so far this scene
    linked_characters: list[dict] # [{ asset, sheet, cell_hints, tokens, wardrobe }]
    linked_locations: list[dict]
    linked_props: list[dict]
    candidate_refs: list[dict]    # picker's top-K with rationale
    style_anchor: dict | None
    scene_anchor_cut: dict | None
    similar_past_cuts: list[dict]  # vector match against reference_pool tags
    art_style: str
    aspect_ratio: str
```

`bundle_cut_context(cut_id)` traverses tree once, returns this blob (~8-12 K
tokens text + 2-3 reference images). Feeds Step 3 (DSL prompt build).

**REST endpoint:** `POST /api/projects/{id}/cuts/{cut_id}/compose`
- Body: `{notes?: string, retry?: bool}`
- Streams via WebSocket: `compose_step` events with
  `{step: 'bundle' | 'pick' | 'preprod' | 'compose' | 'render' | 'critic' | 'retry' | 'done', status: 'start' | 'success' | 'fail', detail: {...}}`.

**Logging:** every step emits an `agent_event` for replay. The full run is
reconstructible from `agent_events` table.

**Replaces:** the existing `POST /cuts/{id}/generate` route (keep as alias
calling `compose_cut` for backwards compat).

### Phase 6.B — Cut side panel redesign

**File:** `frontend/src/components/canvas/CutSidePanel.tsx` (new — extracts
the cut-specific path out of the giant `NodeProperties.tsx` switch).

**Layout** (top to bottom):
```
[←  Scene 2 · Shot 1 · Cut 3        3 of 5  →]   ← sequence position + arrows
[ thumb · thumb · ●current · thumb · thumb ]    ← horizontal sequence strip
[                                              ]
[          panel image / placeholder            ]
[                                              ]
[ Story-style action text (single textarea):  ]
[ "Kenji looks up as the bell rings.           ]
[  Concern flickers across his face."          ]
[                                              ]
[       [ 🎬  Generate cut ]                    ]   ← ONE button
[                                              ]
[ Refs used:                                    ]
[  [Kenji sheet · 3/4-right cell, concerned]   ]
[  [Bookstore sheet · interior-medium cell]    ]
[                                              ]
[ Director's notes:                             ]
[ [_______________________________________]     ]
[                                              ]
[ ▸ Advanced (camera · lighting · composition) ] ← collapsed
[ ▸ Generation history (5 versions)             ]
```

When user clicks **Generate**, panel image area becomes a progress timeline:
```
○ Reading scene context……………………… ✓ 4 sibling cuts, 3 sheets, 12K tokens
○ Picking references…………………………… ✓ Kenji sheet + Bookstore sheet
○ Pre-production check……………………… ✓ all refs ready
○ Composing prompt…………………………… ✓ 4 slots, 142 tokens
○ Rendering panel……………………………… ✓ Nano Banana Pro · $0.039
○ Continuity check……………………………… ⚠ 0.78 wardrobe (needs ≥0.80)
○ Auto-retry with stronger ref…… ✓ 0.92 overall · pass
✓ Done
```

**Sequence strip** (`SequenceStrip.tsx`):
- Pulls all cuts in current scene
- Horizontal scrollable thumbnails
- Click any → navigate to that cut's side panel
- Current cut highlighted

**Action text collapsing 5 fields → 1:**
The user has 5 separate fields today (`expression`, `body_language`,
`gaze_direction`, `gesture`, plus action). Collapse into a single story-style
textarea. **An LLM extracts** the 5 structured fields from the prose at
save-time (or generation-time). Original prose stored in
`cuts.story_description`. Advanced section still shows the structured fields
for power users / overrides.

**Light-table view** (Phase 6.C, future):
- `/project/{id}/scene/{n}/light-table`
- All cuts in scene as comic strip
- Drag to reorder; multi-select bulk regenerate
- Side-by-side diff vs prior version
- PDF "shooting board" export

---

## 6. Implementation order (what to do, in what order)

When you next sit down to work, follow this order — each is independently
shippable:

### Step 1 — Update model defaults (10 min)
Edit `backend/config.py:LLMConfig` defaults:
```
default_text_model: "kimi-k2-0905-preview"
planner_model:      "gemini-3-pro-preview"
detailer_model:     "gemini-3-pro-preview"
prompter_model:     "gemini-3-pro-preview"
qa_model:           "gemini-3-pro-preview"
critic_model:       "kimi-k2-0905-preview"
```
Verify the registry's `_provider_for_model()` correctly routes these.

### Step 2 — Migration 005 (Element Sheets) (30 min)
Write `backend/database/migrations/005_element_sheets.sql`. Apply via
`make migrate`. Add a test in `tests/db/test_migrations.py`.

### Step 3 — Sheet Planner + Sheet Generator (3 hrs)
- `backend/orchestrator/sheet_planner.py` — rule-based template selection.
- `backend/orchestrator/sheet_generator.py` — Pro-tier multi-panel prompt
  composition + Nano Banana Pro generation + parse layout into `cells_json`.
- `@tool` decorate so the registry knows about them.
- Tests: `tests/orchestrator/test_sheet_planner.py`,
  `tests/orchestrator/test_sheet_generator.py` (using `FakeImageProvider`).

### Step 4 — Sheet cell cropping + auto-register (1 hr)
- `backend/orchestrator/sheet_cells.py` — crop helper using
  `pillow` (add to `requirements.txt`).
- Hook: when sheet generated, also register in `reference_pool` with
  `tags.cells = panels_json`.

### Step 5 — Context Bundler (2 hrs)
- `backend/orchestrator/context_bundler.py` — `bundle_cut_context(cut_id)`.
- Tests with fixture project.

### Step 6 — Cut Composer (3 hrs)
- `backend/orchestrator/cut_composer.py` — the 7-step pipeline.
- WebSocket route `POST /api/projects/{id}/cuts/{cut_id}/compose` that streams
  `compose_step` events.
- Tests with `FakeLLMProvider` + `FakeImageProvider`.

### Step 7 — Iris reborn (1 hr)
- `backend/orchestrator/iris.py` — `compose_missing_reference()`.
- Wire into Cut Composer's Step 2.
- Remove `iris` from `PHASE_AGENTS["GENERATE"]` in `routes/chat.py`.
- Mark `agents/specs/iris.yaml` deprecated (don't delete yet).

### Step 8 — Frontend side panel redesign (4 hrs)
- `CutSidePanel.tsx` + `SequenceStrip.tsx` + `ProgressTimeline.tsx`.
- Wire into existing `NodeProperties` switch (replace cut branch only).
- Story-text → 5 fields LLM extraction (use `kimi-k2-0905-preview`).

### Step 9 — Sheet UI on AssetMasterNode (2 hrs)
- Replace variant grid with single sheet image + cell labels overlay.
- "Override template" dropdown: Auto / Hero / Support / Extra.
- "Regenerate sheet" button.

### Step 10 — Deprecate old variants (1 hr)
- Mark `generate_all_standard_variants`, `get_variant_prompt_suffix`,
  `generate_element_variant` as deprecated in code.
- Migration 006 to drop `element_variants` table (next release; not in this
  push).

**Total: ~17 hours of focused work** to ship the entire arc. Each step is
mergeable on its own.

---

## 7. Existing primitives to reuse (don't reinvent)

| Need | Use this |
|---|---|
| Continuity bible | `orchestrator.compile_continuity_bible` |
| Reference search | `orchestrator.references.search` |
| Smart picker | `orchestrator.picker.pick_for_cut` |
| Prompt DSL | `orchestrator.prompt_dsl.compile_prompt` |
| Vision critic | `orchestrator.vision_critic.review_cut` |
| Provider registry | `providers.get_registry()` |
| Async DB | `database.core.get_async_connection` |
| Event log | `orchestrator.events.log_event` |
| Cascade staleness | `database.core.mark_phases_stale` (uses `canonical_phase`) |

---

## 8. File map (key paths)

```
backend/
  main.py                          FastAPI entrypoint, lifespan migration
  config.py                        pydantic-settings (LLMConfig, ImageConfig…)
  models.py                        canonical Pydantic v2 entity models
  errors.py                        StrawberryError + structlog
  db.py                            sync DB facade (legacy)
  db_async.py                      async shim (asyncio.to_thread wrapper)
  database/
    core.py                        get_connection, get_async_connection,
                                   PIPELINE_PHASES, canonical_phase,
                                   mark_phases_stale, init_db_async
    migrations/
      001_initial.sql              base schema
      002_agent_events.sql
      003_pipeline_phases.sql
      004_reference_pool_continuity.sql
      005_element_sheets.sql       (next)
      __init__.py                  run_migrations
  providers/
    base.py                        interfaces + types
    registry.py                    role resolution + bootstrap
    llm/{gemini,openai,anthropic}.py   ('kimi' = OpenAI subclass with base_url)
    image/{gemini,fal,_storage}.py
  orchestrator/
    agent_spec.py                  YAML spec loader
    runner.py                      build_pai_agent, run_agent, stream_agent
    events.py                      RunContext, log_event, replay_run
    critic.py                      Rubric, CriticVerdict, review,
                                   produce_with_critic, BRIEF/BLUEPRINT/
                                   ASSETS/CONTINUITY rubrics
    pipeline.py                    Phase 4 — versioned artifacts API
    continuity.py                  Continuity Bible compiler + render_prefix
    references.py                  reference_pool service
    picker.py                      Smart Reference Picker
    prompt_dsl.py                  Composable Prompt DSL
    vision_critic.py               vision-LLM ContinuityScore
    chat_bridge.py                 USE_PYDANTIC_AI feature flag bridge
    sheet_planner.py               (next — Phase 4.6)
    sheet_generator.py             (next — Phase 4.6)
    sheet_cells.py                 (next — Phase 4.6)
    context_bundler.py             (next — Phase 4.8)
    cut_composer.py                (next — Phase 4.8)
    iris.py                        (next — Phase 4.7)
  agents/
    specs/{berry,sage,nova,atlas,pixel,iris,spark,scout}.yaml
    prompts/{berry,sage,nova,atlas,pixel,iris,spark,scout}.md
    {berry,planner,detailer,analyst,prompter,pre_production,
     renderer,qa}.py               legacy ADK factories — kept for fallback
  tools/
    registry.py                    @tool decorator + JSON-schema export
    {briefing,blueprint,assets,generation,element_generation,
     navigation,phase_confirmation,pre_production,handoff}.py
  routes/
    {projects,chat,elements,cuts,assets,pipeline}.py
  services/
    gemini_image.py                337-line shim over providers/image
    generation_queue.py            async background gen task

frontend/src/
  api/
    client.ts                      legacy types + fetch helpers
    generated.ts                   pydantic2ts output (regenerate via `make types`)
  hooks/
    useProjectWebSocket.ts
    useGenerationPoll.ts
  stores/
    projectStore.ts                Zustand
  components/
    PhaseRail.{tsx,css}            6-phase status header
    canvas/
      Canvas.tsx                   master React Flow
      NodeProperties.tsx           giant switch (split in Phase 6.7 later)
      AssetMasterNode.tsx          variants UI (split in Phase 4.6)
      ImageGeneratorNode.tsx
      {Scene,Shot,Cut,Brief,AssetGroup}Node.tsx
      nodes.css                    2064 LOC monolith (split deferred)
    chat/
      FloatingChat.tsx
      ProgressCard.tsx
      TimelinePills.tsx
  pages/
    Canvas.tsx · ProjectLayout.tsx · ProjectList.tsx · Elements.tsx · Chat.tsx

tests/
  conftest.py                      tmp_db fixture, FakeLLMProvider, FakeImageProvider
  db/test_migrations.py
  orchestrator/test_pipeline.py
  orchestrator/test_continuity_and_picker.py
  orchestrator/test_tool_registry.py
  providers/test_registry.py
```

---

## 9. How to verify the system is healthy

```bash
# From project root
source venv/bin/activate

# Boot smoke test
python -c "from backend import main; print('OK')"

# Migrations apply cleanly to a fresh db
make migrate

# Tests
make test-backend                  # 15 tests, ~1s
make lint                          # ruff: 0 errors on new code (legacy excluded)

# Live boot
./start.sh                         # backend + frontend
USE_PYDANTIC_AI=1 ./start.sh       # new agent path

# Live model checks (when keys set)
python -c "
import asyncio
from backend.providers import get_registry, Message

async def t():
    reg = get_registry()
    for name in ['gemini', 'kimi']:
        try:
            llm = reg.get_llm(name)
            r = await llm.complete([Message(role='user', content='Say OK')], model=llm.models()[0], max_tokens=2048)
            print(f'{name}: {r.content!r}')
        except Exception as e:
            print(f'{name}: ERR {e}')
asyncio.run(t())
"

# Pipeline API
curl http://localhost:8000/api/projects/{ID}/phases
curl -X POST http://localhost:8000/api/projects/{ID}/artifacts/DEVELOP \
  -H 'Content-Type: application/json' \
  -d '{"schema_id":"treatment_v1","payload":{"logline":"…"}}'

# Inspect agent runs
sqlite3 strawberry.db "SELECT run_id, agent_id, event_type FROM agent_events ORDER BY id DESC LIMIT 30"
```

---

## 10. Open questions to ask the user (NOT before starting — only if blocked)

- **Sheet template defaults** — user implicitly approved "full for 2+ cut
  appearances, minimal for one-cut" but if a clear edge case appears, ask.
- **Pre-production trigger threshold** — when does the picker decide a "gap"
  exists worth invoking Iris vs just using the next-best ref? Default: any
  picker top-1 score < 0.6 → gap. Tune empirically.
- **Side-panel Advanced section** — does it stay collapsible or hide entirely?
  Default: collapsible, expanded if user has set any of the structured fields
  manually (override path).
- **Critic threshold for auto-retry** — currently 0.8 overall. If too strict,
  loosens to 0.7. Easy to tune.

---

## 11. Things to NEVER do (anti-patterns)

- ❌ Default a creative role to a flash model. **User explicitly said use Pro.**
- ❌ Generate per-variant separate images for a character. **Use sheets.**
- ❌ Touch `.env`, `*.db`, `*.uasset`, `*.umap` files.
- ❌ Skip pre-commit hooks (`--no-verify`) without user permission.
- ❌ Run `git push --force` to main.
- ❌ `pip install` without recording in `requirements.txt`.
- ❌ Add a feature flag for "new path on" — at this point new paths are the
  defaults, legacy paths are the opt-out.
- ❌ Re-introduce `google.generativeai` (deprecated). Use `google-genai`.
- ❌ Add comments explaining what code does. Only WHY when non-obvious.
- ❌ Create README/docs files unless explicitly requested.

---

## 12. Memory (cross-session)

Auto-memory is at
`/Users/hirenk/.claude/projects/-Users-hirenk-Documents-code-stawberry-studio/memory/`.

Key entries already saved (or save them if not):
- **user**: Hiren is a solo game dev / creative tech building Strawberry Studio
- **feedback**: use best models, don't optimize for cost over accuracy
- **feedback**: aim for one-shot success with full tree context
- **project**: Phases 0-7 done; 4.6/4.7/4.8/6.B approved next
- **project**: API keys are Gemini + Kimi + Fal only; no Anthropic / OpenAI
- **reference**: handoff doc at `~/Documents/code/stawberry-studio/HANDOFF.md`
- **reference**: plan doc at `~/.claude/plans/lets-plan-rewamp-of-cryptic-lovelace.md`

When resuming work in a new session: read this file → check task list → start
where this section says.

---

## 13. Current state, last verified

- Backend boots from any cwd: ✅
- 15 tests passing: ✅
- ruff: 0 errors on new code: ✅
- Live providers (Gemini + Kimi): ✅
- Live image gen (Nano Banana Pro): ✅
- Migrations 001–004 applied cleanly: ✅
- Frontend TS-check: ✅
- 5 bug fixes from prior testing session: ✅ verified
- USE_PYDANTIC_AI=1 path: working but with the 3 known-future gaps (tool event
  notifications, handoffs, auto-trigger initial messages) — Phase 4.8 obsoletes
  most of these by replacing the scattered chat-driven generation with the
  one-button Cut Composer.

**Branch:** main.

---

## 14. Session 2026-05-07 — bug fix wave + phase gates

This session uncovered and fixed several **systemic** issues that had been
silently breaking every multi-turn agent run.

### Critical fixes (verified end-to-end)

1. **Pydantic AI dropped the system prompt when message_history was non-empty.**
   PA only re-injects `system_prompt` if the history's first ModelRequest
   already contains a `SystemPromptPart`. Our rebuilder produced text-only
   requests, so every turn after turn 1 ran with no project_id, no tool
   instructions, no schema. Symptoms: "I need a project ID", hallucinated
   values like "12345", brief never saved.
   Fix: `runner.run_agent` and `runner.stream_agent` now prepend a
   `SystemPromptPart(content=rendered_system)` to `message_history` whenever
   it's non-empty. Covers ALL Pydantic AI agents.

2. **`run_stream` halts before the tool loop completes.** PA's run_stream
   only streams the first model response — when the model calls a tool, the
   tool never executes. Switched `stream_agent` to `agent.run()` and yield
   the final output as one chunk.

3. **Wrong model IDs hung indefinitely.** `gemini-3-pro-preview` /
   `gemini-3-pro-image-preview` are not real public Gemini IDs. Routed all
   roles to `gemini-2.5-pro`. Kimi was tried as creative-role default but is
   weak at tool-calling — narrates "logging the brief" without actually
   invoking the tool.

4. **`backend.db` facade missed `get_chat_history_for_context`.** Re-exported.

### Phase gates added (the structural fix)

CAST_SCOUT was advancing to STORYBOARD with empty `suggested_prompt` on every
asset. Three gates now hard-block bad transitions:

- **`confirm_briefing_complete`** — blocks unless `title`, `logline`, `genre`,
  `art_style` are all non-empty (`art_style` was previously unchecked).
- **`complete_blueprint` + `confirm_blueprint_complete`** — blocks if any
  scene has no shots, any shot has no cuts, or any shot has no `shot_size`.
- **`complete_asset_extraction` + `confirm_asset_extraction_complete`** —
  blocks if any asset has empty `suggested_prompt`. Returns the missing list
  so Atlas can fix in-loop.

### New tools

- **`generate_all_missing_sheets(project_id)`** — bulk fan-out of sheet
  generation across every prompt-ready asset that lacks an active sheet.
  Pixel calls it as a one-click unblock.
- **`get_asset_tree_context(asset_id)`** — sibling of `bundle_cut_context`
  for upstream phases. Returns brief globals + linked scenes/shots/cuts +
  sibling assets + active sheet. Atlas uses it before writing prompts.
- **`compose_cut(cut_id)`** — Cut Composer pipeline exposed as a tool.
  Pixel's prompt now prefers this single call over manual orchestration.

### New module

- **`backend/orchestrator/asset_bundler.py`** — `bundle_asset_context()`
  walks the tree from one asset outward (asset + brief + linked
  scenes/shots/cuts + sibling assets + active sheet + Continuity Bible).

### Frontend tightening

- **`tree_updated` WebSocket event** — broadcast after every chat turn so
  the canvas re-fetches scenes/shots/cuts/assets. Fixes the stale-asset-id
  bug ("Asset 492c... not found" after Atlas rebuilt extraction).
- **AssetMasterNode sheet UI** replaces the variant grid.
- **ComposeProgress component** — live 7-step timeline next to the cut
  node's Generate panel.

### Verified state

- Backend boots from any cwd: ✅
- 19/19 tests passing: ✅
- Frontend `tsc --noEmit`: ✅
- All chat agents tool-call reliably with Gemini 2.5 Pro: ✅
- Phase gates enforce required state before transitions: ✅

### Still open (not blockers for testing)

- Per-phase critic loops (BRIEF_RUBRIC etc. defined but not invoked).
- Sage doesn't yet call `set_style_anchor` automatically.
- Nova doesn't populate `focal_length_mm` on shots.
- Coverage agent (wide/medium/close trios) — not built.
- 180° / eyeline grammar critic — not built.
- CLIP/SigLIP embeddings on reference_pool — not built.
- Legacy `compile_shot_prompt` flow still exists; not deleted.

### 2026-05-07 (later) — References-first asset architecture

Replaced sheets-as-grid-images with references-as-atomic-units. Every
visual representation of an asset is now one row in `reference_pool`
with a label and (optionally) a parent_reference_id linking back to the
identity card it was conditioned on. Sheets become a client-side
rendering of these references in a grid; no backend "sheet" file.

**Why**: Pre-built 3×3 sheets generated 5/9 panels nobody used per
character, cropped panels lost resolution, and templates couldn't adapt
to story-specific needs. References-first generates exactly what cuts
ask for, at full resolution, accumulated organically.

**Migration shape (7 commits, all on main)**:
1. `0a012d1` — migration 007: extend reference_pool with asset_id,
   label, parent_reference_id, status, scope, scope_id columns.
2. `5185332` — `backend/orchestrator/references_v2.py` core module:
   generate_identity_card, generate_pose, get_or_generate,
   list_references, precache_standard_turnaround. Pose vocabulary
   (~30 labels) replaces template registry. Identity-first prompt
   structure (Nov-2026 Nano Banana Pro best practice).
3. `4da9688` — `backend/orchestrator/picker_v2.py`: label-aware picker
   with deterministic keyword scoring. resolve_references lazy-fills
   missing labels per asset.
4. `0e9098c` — cut composer routes through picker_v2. Per-asset
   identity + ranked extras (running, sad, glowing, etc.) based on
   cut text. Lazy-fill on miss in parallel.
5. `84acd22` — frontend AssetMasterNode renders references grid
   client-side. Identity card on top, accumulated thumbnails below
   (3-col grid). Two buttons: "✨ Generate identity" + "⚡ Pre-cache
   turnaround". REST endpoints: GET /assets/{id}/references, POST
   /assets/{id}/references/identity, POST /assets/{id}/references/precache.
6. `8b3b1ab` — `generate_all_missing_sheets` rewired to use
   references_v2.precache_standard_turnaround. Topological order
   preserved (parents before derived).
7. `<this commit>` — deletes sheet_generator.py / sheet_planner.py /
   sheet_cells.py and the test_sheet_planner test. Migration 008
   drops element_sheets + sheet_cell_crops tables. element_masters
   and element_variants stay alive (legacy routes still write to
   them — defer their removal). Iris updated to call
   precache_standard_turnaround. Bundlers (asset/cut) read identity
   from reference_pool instead of element_sheets.

**Key invariants**:
- Identity card = first reference per asset, label='identity', no
  parent. Eternal anchor. All other poses condition on it.
- Pose generation auto-bootstraps identity if missing.
- Derived assets (parent_asset_id set) thread their parent's identity
  as @Image1, so identity propagates structurally.
- generate_all_missing_sheets does topological waves: parents/variant-
  bases before derived/variants.
- Cut composer's _pick_references hands off entirely to
  picker_v2.resolve_references.

**Verified state after this session**:
- 35/35 tests passing.
- Frontend tsc clean.
- Atlas → suggested_prompt → "Generate identity" → identity reference
  generated → "Pre-cache turnaround" → standard set generated in
  parallel → cut compose → identity + ranked references resolved per
  cut, lazy-filled when missing.
- Sheets, sheet templates, grid math, panel cropping all gone.

**End of session 2026-05-07.**
