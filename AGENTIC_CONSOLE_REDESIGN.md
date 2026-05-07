# Agentic Console Redesign — Source of Truth

**Status**: design locked, ready to implement.
**Created**: 2026-05-07.
**Authors**: Hiren (product) + Claude (synthesis).
**Read this first.** This document is the canonical specification of the next-generation UX. If a future session conflicts with anything here, this wins until Hiren explicitly amends.

---

## 0. Why this document exists

Strawberry Studio's chat interface and asset workflow were built incrementally during Phase 4. The Phase 4.x work shipped (asset DAG, references-first, sheet generation, picker_v2, cut composer with vision critic). Live testing with Hiren on 2026-05-07 surfaced UX gaps that can't be fixed by tweaking — they require a **rebuild of the chat surface and a new flow model**.

This document captures everything decided during that conversation so the work can be executed across multiple sessions without losing context. **Keep it updated as commits land.**

---

## 1. Mental model — three pillars

```
┌──────────────────────────────────────────────────────────────────┐
│ Phase Rail (BRIEF · STORY · CAST · BLUEPRINT · STORYBOARD · ...) │
├────────────┬─────────────────────────────────────┬───────────────┤
│            │                                     │               │
│   CANVAS   │           CONSOLE                   │   SIDE PANEL  │
│ (artifact  │      (operating console)            │   (read-only  │
│  viewer)   │   agents work, user steers          │    artifact   │
│            │                                     │     detail)   │
├────────────┴─────────────────────────────────────┴───────────────┤
│  LIBRARY DRAWER — visual memory bank, drag source, always-on    │
└──────────────────────────────────────────────────────────────────┘
```

**Canvas** = tree viewer, selection target only. No mutation buttons.
**Console** (renamed from "chat") = THE control plane. Every state change flows through agent tool calls invoked here. Rich-typed messages, not plain text.
**Side panel** = detailed read-only context for the selected canvas node. No buttons that mutate state.
**Library drawer** = bottom collapsible drawer showing every reference ever generated, with metadata. Drag source for everything. Universal hover-preview.

**Discipline**: state changes happen exclusively through agent tool calls invoked from the Console. This makes everything traceable, undoable, replayable.

---

## 2. Core principles

1. **Plan-as-artifact** — every multi-step agent action proposes a structured plan in chat, waits for user signal, then executes step-by-step.
2. **No black box** — every step visible (TODO list with live status), every reference shown with provenance, every cost surfaced upfront.
3. **No automatic generation** — including pre-caching turnarounds. Agent suggests, user approves, agent executes.
4. **User is the critic** — vision critic loop removed. User's natural-language feedback drives refinement.
5. **Reference reuse first** — agent always proposes cached refs before suggesting new generation, with "use existing" alternatives shown when close-enough refs exist.
6. **Every generation persists** — no version is ever lost. Library = visual memory bank. Old versions are flagged superseded but visible / revertible.
7. **Drag-drop is universal** — same gesture across library, chat, cut nodes, asset nodes, pinned tray.
8. **Console is purpose-built** — drop the constraint of preserving the legacy `FloatingChat.tsx`. Build for the new model.

---

## 3. Current shipped state (as of 2026-05-07)

Branch: `main`. Recent commits (newest first):

| Commit | Summary |
|---|---|
| `b31e581` | Restore SetActiveRequest dropped by awk trim. |
| `e8eb57b` | Kill legacy Generate Visual + thread previous-cut continuity + canvas refresh after compose. |
| `c2dd8a4` | Commit 7/7 references-first — delete sheet code, drop legacy tables, docs. |
| `8b3b1ab` | Commit 6/7 — generate_all_missing_sheets uses references_v2. |
| `84acd22` | Commit 5/7 — frontend AssetMasterNode renders references grid. |
| `0e9098c` | Commit 4/7 — cut composer routes through picker_v2. |
| `4da9688` | Commit 3/7 — picker_v2 with label ranking + lazy fill. |
| `5185332` | Commit 2/7 — references_v2 module. |
| `0a012d1` | Commit 1/7 — migration 007 references_first columns. |
| `9b1462f` | Single-call sheet replaces two-step master+sheet. |
| `c541e8f` | Race fix in scene/shot/cut auto-numbering. |
| `a5c187d` | Phase gate field names against actual schema. |
| `01787d8` | Asset DAG — parent_asset_id + wardrobe glossary + cleanup. |
| `81d7acd` | Structural moat — stale cascade + parent-chain in cut composer. |

**What works today**:
- Backend: 35/35 tests passing, frontend tsc clean.
- Asset DAG (parent_asset_id, master_id) for derived/variant assets.
- References-first: `references_v2` module, identity card + lazy fill, `precache_standard_turnaround` (still callable but no longer auto-fired).
- Picker v2: label-aware keyword scoring + lazy fill.
- Cut composer: bundles tree, picks via picker_v2, threads previous-cut, renders Nano Banana Pro, vision critic with auto-retry, registers result.
- Phase gates on BRIEF, BLUEPRINT, CAST_SCOUT.
- Atlas decision tree + wardrobe glossary + cleanup tool.
- Pixel has compose_cut + generate_all_missing_sheets tools.
- Frontend: AssetMasterNode renders references grid, NodeProperties side panel for cuts shows compose button + ComposeProgress timeline.
- Live cut compose end-to-end demonstrated working.

**What's broken / awkward today**:
- Vision critic too strict — rejects valid creative drift, adds 30s+ retry latency.
- Compose UX is opaque — user doesn't know what's happening or why.
- No way to see/override which references the agent picked.
- No version history visible for cuts.
- No library/gallery — generated images vanish into the DB.
- Side panel has buttons that mutate; should be read-only.
- Chat is plain-text only; can't render images, cards, plans, or actions.
- Pre-caching is opt-in but feels wasteful when most poses won't be needed.

**State of legacy paths** (deprecated but not yet deleted):
- `vision_critic.py` — kept on disk, no longer invoked by compose_cut after Phase A.
- `element_masters` / `element_variants` tables — kept; `routes/elements.py` and `tools/element_generation.py` still write. Defer deletion.
- `services/gemini_image.py` — referenced by legacy generation flow; provider abstraction lives in `providers/image/`.
- `precache_standard_turnaround` — stays callable; not auto-invoked.

---

## 4. The redesign — full spec

### 4.1 Console (new chat surface)

Replaces `frontend/src/components/chat/FloatingChat.tsx`. Build from scratch as `frontend/src/components/console/`. Don't preserve legacy assumptions.

**Structure**:
```
┌───────────────────────────────────────────────────────────────────┐
│ CONSOLE HEADER                                                    │
│   project name · agent dropdown · cost meter · settings cog       │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│   MESSAGE STREAM (virtualized scroll)                             │
│                                                                   │
│   [TextMessage / PlanCard / ProgressCard / ImageMessage /         │
│    ReferenceCard / ComparisonView / RecommendationCard /          │
│    ToolCallTag / BatchProgressCard / IdleSuggestion /             │
│    ActivityCard / FailureCard]                                    │
│                                                                   │
│                                                                   │
├───────────────────────────────────────────────────────────────────┤
│ PINNED TRAY                                                       │
│   [thumb chip] [thumb chip] [thumb chip] [+]                      │
├───────────────────────────────────────────────────────────────────┤
│ INPUT DOCK                                                        │
│   REFERENCE CHIPS: [chip ×] [chip ×] [+ add ref]                  │
│   ──────────────────────────────────────────────                  │
│   text input area...                                              │
│   ──────────────────────────────────────────────                  │
│   /compose /refine /batch /list   Pixel ▼   [→ send]              │
└───────────────────────────────────────────────────────────────────┘
```

**Component breakdown**:

- `Console` — top-level container, owns WS connection, message stream state, input state.
- `ConsoleHeader` — agent selector, cost meter, settings.
- `MessageStream` — virtualized list of typed messages.
- `PinnedTray` — references that stay visible, drop target.
- `InputDock` — reference chip rail + textarea + command bar + send button.
- `ReferenceChip` — used inside input dock and pinned tray; hoverable, removable, draggable.

**Message components** (one file each in `console/messages/`):

| Component | Purpose | Mutates? |
|---|---|---|
| `TextMessage` | Markdown prose | No |
| `PlanCard` | Interactive plan with checkable items, drag-swap, alternatives, costs | Yes — emits modify/approve intents |
| `ProgressCard` | Live-updating TODO with elapsed counters and sub-thumbs | No |
| `ImageMessage` | Inline image, click-fullscreen, drag source | No |
| `ReferenceCard` | Thumbnail + label + asset + status badge | Drag source |
| `ComparisonView` | v1 vs v2 with slider, [Keep] [Revert] | Yes |
| `RecommendationCard` | Agent's primary suggestion + alternatives + reasoning | Yes — emits choice intent |
| `ToolCallTag` | Collapsible tool invocation: name, args, result, cost, latency | No |
| `BatchProgressCard` | Multi-cut compose with sub-tiles, pause/resume | Yes |
| `IdleSuggestion` | Proactive "want me to do X?" surface | Yes |
| `ActivityCard` | Recent operations timeline | No |
| `FailureCard` | Error + recovery options inline | Yes |

**Universal thumbnail behavior** (extracted into `ThumbnailHover` provider):

| Interaction | Behavior |
|---|---|
| Hover (200ms) | Floating tooltip — 2× preview + label + asset + created + cost + used-in count |
| Click | Opens reference detail in side panel |
| Drag | Begins drag with ghost preview; drop zones light up |
| Right-click | Quick menu: Use / Pin / ★ Favorite / ⚓ Anchor / Show in library / Reveal generation tree / Delete |
| Shift+click | Multi-select for batch operations |

### 4.2 Plan-as-artifact pattern

Every multi-step agent action follows the same flow:

```
1. User: "compose cut 2"
2. Agent (Pixel): proposes Plan in chat (PlanCard message).
3. User: approves / modifies / cancels.
4. Agent: executes plan, emits ProgressCard updates per step.
5. Agent: presents result (ImageMessage + RecommendationCard for refinement).
6. User: feedback → step 2 (re-plan with feedback).
```

**Plan data model**:

```python
@dataclass
class PlanItem:
    id: str
    kind: str  # 'reference_check' | 'reference_generate' | 'reference_swap' | 'render' | 'register' | ...
    description: str  # human-readable
    cost_usd: float  # estimate
    eta_s: int  # estimate
    cached: bool  # is this already done?
    approved: bool  # gates execution; default True for cached, False for new gens (depending on auto-approve threshold)
    dependencies: list[str]  # other item ids
    alternatives: list[dict]  # for "use existing" offerings
    result: dict | None  # filled when done
    status: str  # 'pending' | 'approved' | 'running' | 'done' | 'skipped' | 'error'

@dataclass
class Plan:
    id: str
    cut_id: str | None  # for compose plans
    items: list[PlanItem]
    total_cost_usd: float
    total_eta_s: int
    created_at: str
    feedback_round: int  # 0 = initial, 1+ = refinement
    parent_plan_id: str | None  # for refinement chains
```

**Plan persistence**: stored in a new `plans` table for audit + replay.

```sql
CREATE TABLE plans (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    cut_id TEXT,
    parent_plan_id TEXT,
    feedback_round INTEGER DEFAULT 0,
    items_json TEXT NOT NULL,
    total_cost_usd REAL DEFAULT 0,
    total_eta_s INTEGER DEFAULT 0,
    status TEXT DEFAULT 'proposed',  -- proposed | approved | executing | done | cancelled
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
);
```

**Auto-approve threshold**: per-project setting in `briefs.auto_approve_under_usd` (default 0 = always confirm). When set, items below the threshold auto-flip `approved=True` and execute immediately.

### 4.3 Library drawer

Bottom collapsible drawer. Always available. ~30% screen height when open, 40px tall when collapsed.

**Layout**:
```
[≡ collapse] [Filter: Asset ▼] [Label ▼] [Scope ▼] [Status ▼] [Search]   $1.42 today · 18 refs
─── Tabs: All · By Asset · By Scene · By Session · ★ Favorites · Unused · Superseded ───
[thumb] [thumb] [thumb] [thumb] [thumb] [thumb] [thumb] [thumb] [thumb] [thumb]
 ★      ⚓      Mara    cut1    cut1    cut2    alley   flag   Mara     ...
 ident  ident  focused  v1      v2      v1      ident   3q     focused  
                                ⊘ superseded
─────────────────────────────────────────────────────────────────────────
```

**Smart collections** (saved filters):
- "All" — every active reference.
- "By Asset" — group by asset_id.
- "By Scene" — group by which scene's cuts use the ref.
- "By Session" — today / this week / older.
- "★ Favorites" — `is_favorite=1`.
- "Unused" — never appears in `used_in_cuts_json`.
- "Superseded" — `is_active=0`, opt-in show.

**Detail view**: clicking a thumb replaces side panel content with `ReferenceDetail`:
- Full-size image (click for fullscreen).
- Provenance graph: parent → this → children.
- Metadata: label, asset, created, cost, model, prompt (collapsible).
- "Appears in" cuts list.
- Actions: ★ Favorite, ⚓ Anchor, Replace with new, Delete.

### 4.4 Side panel — read-only rich context per node type

Per-node-type detail components in `frontend/src/components/sidepanel/`:

- `CutNodeDetails` — current image, story fields, linked assets, last compose summary (refs used + prompt + render time), feedback history, version history strip with revert.
- `AssetNodeDetails` — identity card, accumulated references grouped by label, "appears in" list, derived-from chain.
- `SceneNodeDetails` — structure stats, linked assets, wardrobe overrides, anchor cut, "missing for production" actionable cards.
- `ShotNodeDetails` — camera + composition + lens info.
- `BriefNodeDetails` — read-only display of every brief field.

Each panel ends with a `💬 Talk to [agent] in chat →` link that focuses the Console input and prefills a context-aware prompt.

### 4.5 Power features (Phase F)

- **Cmd+K command palette** — fuzzy search every action: compose / refine / regenerate / open library / pin / favorite / revert / batch.
- **Keyboard navigation** — `J/K` cycle cuts, `Space` compose selected, `R` refine selected, `/` focus chat, `←/→` step versions, `?` shortcuts overlay.
- **Comparison slider** — auto-shown after refines; v1 vs v2 with drag slider for overlay.
- **Provenance graph** — DAG visualization of any reference's generation tree.
- **Diff narration** — agent describes visual delta between versions ("v2 has stronger neon rim, jacket detail visible").
- **Browser notifications** — long-running batch ops ping when done.
- **Activity log** — per-scene timeline in side panel.

### 4.6 Proactive features (Phase G)

- **Idle suggestions** — when user idles >30s, agent surfaces useful next actions in chat.
- **Plan templates** — "for every cut, always include previous cut + scene anchor + 1 expression." Saved to user preferences.
- **Onboarding ghost** — first-time tour overlay, dim everything except chat input.
- **External web search** — agent can search the web for visual refs (opt-in per query) and add to library.
- **Failure recovery flows** — every error message includes recovery options.
- **Pre-flight summaries** — single-line cost+time summary above every plan before execution.

---

## 5. Backend protocol — typed messages

### 5.1 WebSocket message envelope

All chat WS messages now have:
```json
{
  "kind": "...",
  "message_id": "msg_xyz",
  "parent_message_id": "msg_abc",
  "timestamp": "2026-05-07T14:23:01Z",
  ...kind-specific fields
}
```

`message_id` is stable; subsequent updates patch by id (e.g. `plan_update` with `item_idx` toggles a checkbox). This avoids re-sending entire plan on every step.

### 5.2 Message kinds

```typescript
type AgentMessage =
  | { kind: "text"; markdown: string }
  | { kind: "plan"; plan_id: string; items: PlanItem[]; total_cost: number; total_eta_s: number; auto_approve_under: number }
  | { kind: "plan_update"; plan_id: string; item_idx: number; status: "running"|"done"|"error"|"skipped"; result?: any }
  | { kind: "image"; url: string; caption?: string; metadata?: ImageMeta }
  | { kind: "reference_card"; ref_id: string; thumb_url: string; label: string; asset_name: string; status: "cached"|"generating"|"newly_generated"; cost_usd?: number; ref_metadata?: object }
  | { kind: "elapsed"; label: string; started_at: string; estimated_total_s?: number }
  | { kind: "comparison"; left_url: string; right_url: string; left_label: string; right_label: string; actions: Action[] }
  | { kind: "recommendation"; primary: ReferenceCardData; alternatives: ReferenceCardData[]; reasoning: string }
  | { kind: "tool_call"; name: string; args: object; status: "running"|"done"|"error"; result?: any; cost_usd?: number; latency_ms?: number }
  | { kind: "batch_progress"; batch_id: string; items: BatchItem[]; can_pause: boolean }
  | { kind: "idle_suggestion"; reasoning: string; actions: Action[] }
  | { kind: "activity"; events: ActivityEvent[] }
  | { kind: "failure"; error: string; suggestion: string; recovery_actions: Action[] }

type Action = { label: string; intent: string; icon?: string; primary?: boolean; payload?: any }
```

### 5.3 User → server messages

Existing: `{ type: "user_message", content: "...", metadata: {...} }`.

New extension: `attachments` field carries reference chip ids the user attached.
```json
{
  "type": "user_message",
  "content": "compose cut 2 with these as anchors",
  "attachments": [
    { "kind": "reference", "ref_id": "ref_abc" },
    { "kind": "reference", "ref_id": "ref_xyz" }
  ],
  "intent": null  // or "approve_plan", "modify_plan", etc.
}
```

When user clicks an action button, the message goes back as:
```json
{
  "type": "user_intent",
  "intent": "approve_plan",
  "payload": { "plan_id": "plan_xyz" },
  "ref_message_id": "msg_..."
}
```

### 5.4 Backend narration helper

```python
class Narrator:
    """Per-turn helper that emits typed messages to the WS."""
    def __init__(self, ws_send_fn):
        self.send = ws_send_fn
        self.message_ids = []

    async def text(self, markdown: str) -> str: ...
    async def plan(self, plan: Plan) -> str: ...
    async def update_plan_item(self, plan_id: str, item_idx: int, status: str, result: dict = None): ...
    async def image(self, url: str, caption: str = "") -> str: ...
    async def reference_card(self, ref: dict, status: str = "cached") -> str: ...
    async def elapsed(self, label: str, started_at: str) -> str: ...
    async def comparison(self, left: dict, right: dict) -> str: ...
    async def recommendation(self, primary: dict, alternatives: list[dict], reasoning: str) -> str: ...
    async def tool_call(self, name: str, args: dict) -> str: ...
    async def batch_progress(self, batch_id: str, items: list) -> str: ...
    async def failure(self, error: str, suggestion: str, recovery: list[Action]) -> str: ...
```

Pixel/Atlas/Berry agents instantiate Narrator from their tool wrapper and emit structured messages instead of plain text.

---

## 6. Database schema additions

### 6.1 Migration 009 — references-first metadata + plans

```sql
-- Migration 009: console redesign foundation.
--
-- Extends reference_pool with library metadata: is_active flag for revert,
-- superseded_by_id for version chains, prompt + cost_usd + model_used for
-- provenance, used_in_cuts_json for usage analytics.
--
-- Adds plans table for plan-as-artifact persistence + audit.
--
-- Adds cuts.refinement_feedback for cumulative feedback chain.
--
-- Adds briefs.auto_approve_under_usd for the auto-approve threshold setting.

ALTER TABLE reference_pool ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE reference_pool ADD COLUMN superseded_by_id TEXT;
ALTER TABLE reference_pool ADD COLUMN prompt TEXT DEFAULT '';
ALTER TABLE reference_pool ADD COLUMN cost_usd REAL DEFAULT 0;
ALTER TABLE reference_pool ADD COLUMN model_used TEXT DEFAULT '';
ALTER TABLE reference_pool ADD COLUMN used_in_cuts_json TEXT DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_refs_active ON reference_pool(is_active) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_refs_superseded ON reference_pool(superseded_by_id);

ALTER TABLE cuts ADD COLUMN refinement_feedback TEXT DEFAULT '[]';

ALTER TABLE briefs ADD COLUMN auto_approve_under_usd REAL DEFAULT 0;

CREATE TABLE plans (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    cut_id TEXT,
    parent_plan_id TEXT,
    feedback_round INTEGER DEFAULT 0,
    items_json TEXT NOT NULL,
    total_cost_usd REAL DEFAULT 0,
    total_eta_s INTEGER DEFAULT 0,
    status TEXT DEFAULT 'proposed',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (cut_id) REFERENCES cuts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plans_project ON plans(project_id);
CREATE INDEX IF NOT EXISTS idx_plans_cut ON plans(cut_id);
CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
```

### 6.2 No data migration needed

Per Hiren's earlier confirmation, fresh DB is fine. Existing test projects get nuked when migration runs. New projects start clean.

---

## 7. Implementation phases — file-level plan

### Phase A — Backend foundation (commit, ~3 hrs)

**Goal**: critic out, plan-driven compose, library schema, Pixel as planner-executor.

**Files**:
- `backend/database/migrations/009_console_foundation.sql` (new) — see §6.1.
- `backend/orchestrator/cut_composer.py` — strip critic loop entirely. Single render. Add `feedback` parameter. Save cut renders to `reference_pool` with `label='render_v{N}'` and `is_active=true`. Old versions get `is_active=false` and `superseded_by_id` set.
- `backend/orchestrator/plans.py` (new) — Plan + PlanItem dataclasses, plan persistence, plan diff (for refinements).
- `backend/orchestrator/cut_planner.py` (new) — `plan_compose_cut(cut_id, feedback=None) -> Plan` — proposes the plan WITHOUT executing. Returns the Plan structure for the agent to present.
- `backend/orchestrator/cut_executor.py` (new) — `execute_plan(plan_id, on_step) -> ComposeResult` — runs an approved plan, emits step events. Replaces the monolithic compose_cut.
- `backend/orchestrator/cut_composer.py` — becomes a thin wrapper: `compose_cut(cut_id, feedback=None)` = `plan` + `execute` for backwards compat (the simple "fire and forget" path). Production path uses planner+executor separately.
- `backend/agents/prompts/pixel.md` — rewritten as Cut Director persona. Mandates: propose Plan → present in chat (via Narrator) → wait for approval intent → call execute_plan → narrate result → handle refinement feedback (re-plan with cumulative feedback list).
- `backend/agents/specs/pixel.yaml` — add `propose_plan_for_cut` and `execute_approved_plan` tools (or just `propose_compose_plan` + `execute_compose_plan`).
- `backend/orchestrator/references_v2.py` — when generating, set `is_active=true`, `prompt=...`, `cost_usd=result.cost_usd`, `model_used=result.model_used`. When superseding, flip old reference's `is_active=false` and set `superseded_by_id`.
- `tests/orchestrator/test_plan_compose.py` (new) — covers plan generation, plan execution, feedback round chaining, version history.

**Dependencies removed/relaxed**:
- `vision_critic.py` no longer imported by cut_composer — file stays for future QC mode.

**Acceptance**:
- 35+ tests passing.
- `compose_cut(cut_id)` still works (backwards compat) — calls plan + execute.
- `plan_compose_cut(cut_id, feedback="more rim")` returns a Plan with feedback threaded into the prompt.
- Cut versions accumulate in reference_pool with proper `superseded_by_id` chains.

### Phase B — Console rebuild (commit, ~6 hrs) — biggest

**Goal**: replace FloatingChat with the new typed-message Console.

**Files**:
- `frontend/src/components/console/Console.tsx` (new) — top-level container.
- `frontend/src/components/console/ConsoleHeader.tsx` (new).
- `frontend/src/components/console/MessageStream.tsx` (new) — virtualized scroll.
- `frontend/src/components/console/PinnedTray.tsx` (new).
- `frontend/src/components/console/InputDock.tsx` (new).
- `frontend/src/components/console/ReferenceChip.tsx` (new).
- `frontend/src/components/console/messages/TextMessage.tsx` (new) + 11 more typed message components — see §4.1 table.
- `frontend/src/components/console/types.ts` (new) — TypeScript types for AgentMessage union.
- `frontend/src/api/console.ts` (new) — WS client, message dispatcher, intent emitter.
- `backend/orchestrator/narrator.py` (new) — Narrator helper class.
- `backend/orchestrator/chat_bridge.py` — extend stream_turn to emit typed messages via Narrator.
- `backend/routes/chat.py` — WS handler accepts typed user messages including `attachments` and `intent`.
- `frontend/src/components/chat/FloatingChat.tsx` — DELETED. Console replaces it.
- `frontend/src/pages/ProjectLayout.tsx` — swap FloatingChat → Console.
- `tests/orchestrator/test_narrator.py` (new) — covers all 12 message kinds.

**Acceptance**:
- Console renders all 12 message types end-to-end.
- Pixel composes a cut by emitting plan → user clicks ✅ → executor runs → progress card updates → image message shown.
- TypeScript clean.

### Phase C — Library drawer + thumbnail interactions (commit, ~4 hrs)

**Files**:
- `frontend/src/components/library/LibraryDrawer.tsx` (new) — bottom drawer, collapsible.
- `frontend/src/components/library/LibraryFilters.tsx` (new) — sidebar.
- `frontend/src/components/library/SmartCollections.tsx` (new) — saved filter tabs.
- `frontend/src/components/library/ReferenceGrid.tsx` (new).
- `frontend/src/components/library/ReferenceDetail.tsx` (new) — replaces side panel content for that selection.
- `frontend/src/components/shared/ThumbnailHover.tsx` (new) — universal hover-preview tooltip provider, used everywhere.
- `frontend/src/api/library.ts` (new) — list/filter/search.
- `backend/routes/library.py` (new) — `GET /api/projects/{id}/library` paginated, filterable.
- `frontend/src/pages/ProjectLayout.tsx` — add LibraryDrawer at bottom.

**Acceptance**:
- Library drawer shows every reference with badges (★, ⚓, ⊘).
- Filters work (asset / label / scope / status / search).
- Smart collections (by asset, by scene, by session, favorites, unused, superseded) filter correctly.
- Hover any thumbnail shows tooltip after 200ms.
- Click any thumbnail opens ReferenceDetail in side panel.

### Phase D — Drag-drop everywhere + chat input rich (commit, ~3 hrs)

**Files**:
- `frontend/src/components/console/InputDock.tsx` — extend with reference chip drop zone, paste handler, autocomplete (@ # /).
- `frontend/src/components/library/ReferenceGrid.tsx` — items become drag sources.
- `frontend/src/components/canvas/CutNode.tsx` — accepts dropped references as slot overrides.
- `frontend/src/components/canvas/AssetMasterNode.tsx` — accepts dropped reference as identity override.
- `frontend/src/components/console/PinnedTray.tsx` — drop target for pinning.
- `frontend/src/hooks/useDragDrop.ts` (new) — shared drag-drop primitives.
- `frontend/src/api/client.ts` — extend user_message with attachments field.
- `backend/orchestrator/chat_bridge.py` — surface `attachments` to agents as additional context.

**Acceptance**:
- Drag library item → chat input dock → ref chip appears.
- Drag library item → cut node → manual slot override.
- Drag library item → asset node → identity override.
- Paste image into chat → uploaded + chip created.
- `@Mara` autocomplete inserts asset chip.
- `/compose` autocomplete inserts command prefix.

### Phase E — Side panel rewrite (commit, ~3 hrs)

**Files**:
- `frontend/src/components/sidepanel/SidePanel.tsx` (rewrite) — node-type router.
- `frontend/src/components/sidepanel/CutNodeDetails.tsx` (new).
- `frontend/src/components/sidepanel/AssetNodeDetails.tsx` (new).
- `frontend/src/components/sidepanel/SceneNodeDetails.tsx` (new).
- `frontend/src/components/sidepanel/ShotNodeDetails.tsx` (new).
- `frontend/src/components/sidepanel/BriefNodeDetails.tsx` (new).
- `frontend/src/components/sidepanel/ReferenceDetail.tsx` (new) — used by Library detail view.
- `frontend/src/components/canvas/NodeProperties.tsx` — DELETED.

**Acceptance**:
- Each node type shows its rich detail.
- Cut shows version history strip; click any → revert.
- Asset shows reference grid by label.
- Scene shows missing-for-production cards with [Fix] buttons that open chat.
- All side panel content is read-only (no mutation buttons except revert/favorite/anchor flag flips).

### Phase F — Power features (commit, ~3 hrs)

**Files**:
- `frontend/src/components/shared/CommandPalette.tsx` (new) — Cmd+K, fuzzy search.
- `frontend/src/hooks/useKeyboardNav.ts` (new) — J/K/Space/R/Arrow handlers.
- `frontend/src/components/shared/ComparisonSlider.tsx` (new).
- `frontend/src/components/shared/ProvenanceGraph.tsx` (new) — DAG viz.
- `frontend/src/components/shared/CostMeter.tsx` (new) — live cost ticker.
- `backend/orchestrator/diff_narrator.py` (new) — vision LLM compares two images.
- Browser notification API integration in Console.

**Acceptance**:
- Cmd+K opens palette, searches all actions.
- J/K cycles cuts on canvas.
- Comparison slider shows v1/v2 with drag overlay.
- Provenance graph clickable to navigate references.
- Diff narration appears after refines.

### Phase G — Proactive features + onboarding (commit, ~3 hrs)

**Files**:
- `backend/orchestrator/idle_observer.py` (new) — watches user activity, surfaces suggestions when idle >30s.
- `backend/orchestrator/plan_templates.py` (new) — load/save user plan templates.
- `frontend/src/components/onboarding/OnboardingTour.tsx` (new).
- `backend/tools/web_search.py` (new) — opt-in web reference search tool.
- `frontend/src/components/console/messages/FailureCard.tsx` — recovery action buttons.

**Acceptance**:
- Idle suggestions appear in chat when user pauses.
- Plan templates can be saved and applied.
- First-time tour overlay walks user through canvas / chat / library.
- Failure cards offer retry / fallback / cancel inline.

---

## 8. Open decisions / TBDs

- **Auto-approve threshold default**: 0 (always confirm). Document: change to $0.10 if testing shows clicks-per-cut > 5.
- **Comparison view default**: shown automatically after every refine. Consider toggle if it gets too noisy.
- **Web search opt-in scope**: per-query? per-project? per-account? Default: per-query (user explicitly says "search the web for X").
- **Pinned references persistence**: local-only or persisted to DB? Default: local-only (browser session).
- **Plan template scope**: per-user or per-project? Default: per-user (saved to localStorage initially, can promote to DB later).
- **Vision critic future**: keep `vision_critic.py` alive for opt-in QC mode. Surface as a "QC pass" toggle in plan settings later. Phase H?

---

## 9. How a future Claude session resumes this work

If you're a new session reading this:

1. **Read this entire document first.** It's the source of truth for the redesign.
2. Check `git log --oneline -20` to see what's been committed since this doc was written. Match commits to phases A-G.
3. Check the §3 "Current shipped state" table — extend it with new commits.
4. Check `tests/` to understand what's covered.
5. Check the most recent open phase (last "todo" item not yet shipped) and continue.
6. **Don't re-litigate the design.** Hiren approved this design on 2026-05-07. Implementation only. If a real problem emerges, propose a small amendment and ask before changing direction.
7. Commit small, document each commit's `Files changed` block clearly.

**Working contract** (from memory + this conversation):
- Don't ask trivia. Only pause for things only Hiren can verify (live browser tests, API keys, runtime sanity).
- Use best models (Gemini 2.5 Pro for text, Nano Banana Pro for images). Don't downgrade for cost.
- Repo conventions: commit prefixes `feat:` / `fix:` / `docs:` / `test:`. No `--no-verify`. No `.env` writes. No `*.db` writes.
- Bundle full tree context aggressively for any agent generation.
- Test before claiming success: `pytest -x -q` and `cd frontend && npx tsc --noEmit`.
- After every commit, update §3 of this doc with the new entry.

---

## 10. Reference: file locations

```
backend/
├── orchestrator/
│   ├── cut_composer.py        ← will be slimmed Phase A
│   ├── cut_planner.py         ← NEW Phase A
│   ├── cut_executor.py        ← NEW Phase A
│   ├── plans.py               ← NEW Phase A
│   ├── narrator.py            ← NEW Phase B
│   ├── references_v2.py       ← extended Phase A
│   ├── picker_v2.py           ← already shipped
│   ├── context_bundler.py     ← already shipped
│   ├── asset_bundler.py       ← already shipped
│   ├── cut_composer.py
│   ├── chat_bridge.py         ← extended Phase B
│   ├── continuity.py
│   ├── critic.py              ← legacy, keep for now
│   ├── vision_critic.py       ← legacy, keep for now
│   ├── iris.py
│   ├── prompt_dsl.py
│   ├── references.py
│   ├── runner.py
│   ├── agent_spec.py
│   ├── events.py
│   ├── pipeline.py
│   ├── idle_observer.py       ← NEW Phase G
│   ├── plan_templates.py      ← NEW Phase G
│   └── diff_narrator.py       ← NEW Phase F
├── tools/
│   ├── assets.py              ← extended Phase A (plan-aware)
│   ├── web_search.py          ← NEW Phase G
│   └── ...
├── routes/
│   ├── chat.py                ← extended Phase B
│   ├── library.py             ← NEW Phase C
│   └── ...
├── agents/
│   ├── prompts/pixel.md       ← rewritten Phase A
│   └── specs/pixel.yaml       ← updated Phase A
└── database/
    └── migrations/
        └── 009_console_foundation.sql   ← NEW Phase A

frontend/src/
├── components/
│   ├── console/                ← NEW Phase B (replaces chat/)
│   │   ├── Console.tsx
│   │   ├── ConsoleHeader.tsx
│   │   ├── MessageStream.tsx
│   │   ├── PinnedTray.tsx
│   │   ├── InputDock.tsx
│   │   ├── ReferenceChip.tsx
│   │   ├── types.ts
│   │   └── messages/
│   │       ├── TextMessage.tsx
│   │       ├── PlanCard.tsx
│   │       ├── ProgressCard.tsx
│   │       ├── ImageMessage.tsx
│   │       ├── ReferenceCard.tsx
│   │       ├── ComparisonView.tsx
│   │       ├── RecommendationCard.tsx
│   │       ├── ToolCallTag.tsx
│   │       ├── BatchProgressCard.tsx
│   │       ├── IdleSuggestion.tsx
│   │       ├── ActivityCard.tsx
│   │       └── FailureCard.tsx
│   ├── library/                ← NEW Phase C
│   │   ├── LibraryDrawer.tsx
│   │   ├── LibraryFilters.tsx
│   │   ├── SmartCollections.tsx
│   │   ├── ReferenceGrid.tsx
│   │   └── ReferenceDetail.tsx
│   ├── sidepanel/              ← NEW Phase E (replaces canvas/NodeProperties.tsx)
│   │   ├── SidePanel.tsx
│   │   ├── CutNodeDetails.tsx
│   │   ├── AssetNodeDetails.tsx
│   │   ├── SceneNodeDetails.tsx
│   │   ├── ShotNodeDetails.tsx
│   │   ├── BriefNodeDetails.tsx
│   │   └── ReferenceDetail.tsx
│   ├── shared/                 ← NEW Phase C/F
│   │   ├── ThumbnailHover.tsx
│   │   ├── CommandPalette.tsx
│   │   ├── ComparisonSlider.tsx
│   │   ├── ProvenanceGraph.tsx
│   │   └── CostMeter.tsx
│   ├── onboarding/             ← NEW Phase G
│   │   └── OnboardingTour.tsx
│   ├── chat/                   ← DELETED Phase B
│   └── canvas/
│       ├── CutNode.tsx           ← extended Phase D (drop target)
│       ├── AssetMasterNode.tsx   ← extended Phase D (drop target)
│       ├── NodeProperties.tsx    ← DELETED Phase E
│       └── ...
├── hooks/
│   ├── useDragDrop.ts           ← NEW Phase D
│   └── useKeyboardNav.ts        ← NEW Phase F
└── api/
    ├── console.ts               ← NEW Phase B
    └── library.ts               ← NEW Phase C
```

---

## 11. Phase commit log (update after every phase ships)

| Phase | Commit | Date | Notes |
|---|---|---|---|
| A | _pending_ | | |
| B | _pending_ | | |
| C | _pending_ | | |
| D | _pending_ | | |
| E | _pending_ | | |
| F | _pending_ | | |
| G | _pending_ | | |

---

## 12. Things Hiren needs to verify (out-of-band)

These are flagged inline in this doc but aggregated here so Hiren can sanity-check after each phase ships:

- **Phase A**: live test that compose_cut produces a plan, plan persists, refinement chain accumulates feedback.
- **Phase B**: live test of Console rendering all 12 message types in a real session.
- **Phase C**: live test of library filters + smart collections + hover previews.
- **Phase D**: live test of drag-drop from library → chat / cut / asset.
- **Phase E**: live test of side panel detail per node type.
- **Phase F**: live test of Cmd+K + keyboard nav.
- **Phase G**: live test of idle suggestions + onboarding tour.

---

## 13. Notes from the conversation that produced this doc

Key Hiren statements that shaped the design:

- *"chat = control plane, side panel = read-only, library = visual memory"* — three-pillar model.
- *"user is the best critic"* — vision critic loop removed.
- *"plan-driven, agent suggests, user approves"* — no auto-anything.
- *"don't get stuck with current chat design"* — green light to rebuild.
- *"Higgsfield prompt input UI"* — reference for the input dock design.
- *"every generation stored in library, agent recommends use existing or create new"* — library as visual memory.
- *"todo list in chat like CLI tools"* — TodoUpdate message type.
- *"hover over images for preview, click for detail"* — universal thumbnail behavior.
- *"share between user and agent"* — drag-drop + reference chips.

---

**END OF DOCUMENT.**

Update §3 (current state), §11 (commit log), §12 (verifications) after every commit. Treat the rest as immutable unless Hiren explicitly amends.
