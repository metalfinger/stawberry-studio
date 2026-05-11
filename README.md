# Strawberry Studio

Visual AI storyboarding tool. Agentic, canvas-driven, single-chat interface. Pipeline: **Brief → Story → Cast & Scout → Generate**.

## Stack

- **Backend:** FastAPI · pydantic-AI · aiosqlite · WebSockets (WAL-mode SQLite)
- **Frontend:** React 19 · Vite · React Flow · Zustand
- **Image gen:** Gemini 3 Pro Image (Nano Banana Pro) · Fal · Higgsfield (planned)
- **LLM:** Gemini Pro for agent tool-calling, Kimi (Moonshot) for cheap roles, optional Anthropic / OpenAI

## Prerequisites

- Python 3.10+ (3.11+ recommended)
- Node 18+
- pnpm or npm

## Setup

```bash
# Backend (one-time)
python -m venv venv
source venv/bin/activate          # Windows: .\venv\Scripts\activate
pip install -e .                  # editable install — works from any cwd

# Frontend
cd frontend && npm install && cd ..

# Environment — fill in only the keys you have
cp .env.example .env
```

`.env` keys:

```
GEMINI_API_KEY=
FAL_KEY=
ANTHROPIC_API_KEY=     # optional
OPENAI_API_KEY=        # optional
MOONSHOT_API_KEY=      # for Kimi
CORS_ORIGINS=http://localhost:5173
```

## Run

```bash
./start.sh
```

Or run each side in its own terminal:

```bash
# Terminal 1 — backend
source venv/bin/activate
python -m uvicorn backend.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend && npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:8000
- API docs: http://localhost:8000/docs

## Pipeline

| Phase | Agent | What happens |
|---|---|---|
| **Brief** | Berry | Capture project pitch + brief globals (title, logline, genre, art_style, color_palette, lighting_style). At BRIEF→STORY, the style bible compiles (palette_hex + style_tokens + lighting_rules) and the abstract style anchor image is minted. |
| **Story** | Sage / Nova | Scenes → Shots → Cuts. Sage proposes structure; Nova details individual scenes. Auto-orders by author intent. |
| **Cast & Scout** | Atlas | Extract every character / location / prop / sub-location from the blueprint. Variant-fold detector flags duplicate identities. Each asset gets a suggested_prompt + identity-trait extraction (appearance / distinctive features / wardrobe_lock / consistency_tokens). |
| **Generate** | Pixel | Compose cuts via PlanCard flow: propose_cut_plan → user approves → execute_cut_plan. Per-cut variants generated lazily; Iris (internal function) auto-fills missing identities via PREPROD_FILL plan items. |

Iris is no longer a chat agent — she's an internal gap-filler called from `cut_executor` when a cut's linked asset has no identity reference yet.

## Architecture

```
strawberry-studio/
├── backend/
│   ├── agents/specs/      # YAML agent declarations (Berry/Sage/Nova/Atlas/Pixel)
│   ├── agents/prompts/    # MD system prompts
│   ├── database/          # SQLite + migrations (WAL mode)
│   ├── orchestrator/      # pydantic-AI runner, intent dispatch, planner+executor,
│   │                      # references, picker, prompt_dsl, style_bible/anchor,
│   │                      # continuity, vision_critic, narrator, iris, gen_stats
│   ├── providers/         # Image (gemini, fal) + LLM (gemini, kimi, openai, anthropic)
│   ├── routes/            # FastAPI routers (chat, projects, assets, cuts, library,
│   │                      # repair, batch)
│   ├── tools/             # Agent-callable tools (briefing, blueprint, generation,
│   │                      # assets) — 52 live tools
│   ├── db.py              # Single canonical DB surface
│   └── main.py
├── frontend/
│   └── src/               # React 19 + React Flow canvas + typed Console message
│                          # stream + chat-driven repair flow
├── tests/                 # 67 backend tests, all green
├── storage/               # Generated images (gitignored)
├── pyproject.toml
└── requirements.txt
```

## Consistency stack

Every cut render flows through:

1. **Style anchor** — abstract designer-swatch image (palette stripe + halftone gradient + ink-line texture) attached as ref slot 1 to every gen. Locks palette/line/grain without copying composition.
2. **Style bible** — compiled at BRIEF confirm: `palette_hex` (verbatim hex codes), `style_tokens` (4-6 short shared phrases), `lighting_rules`. Every prompt quotes these verbatim via `prompt_dsl`'s [STYLE] block.
3. **Identity-traits extraction** — when Atlas saves a suggested_prompt, a Flash call extracts `appearance / distinctive_features / wardrobe_lock / consistency_tokens` so the DSL has structured grounding (not just free text).
4. **Per-cut variants** — picker reads cut text, requests `hero_pose / kneeling / expression_X / etc` for each linked character; planner emits PREPROD_FILL when identity is missing.
5. **Reference-priority cap** — Nano Banana Pro takes ~4 refs optimally; `_prioritize_refs` sorts by importance (anchor → identity → prev_cut → location plate → props) and caps at 4.
6. **Identity re-anchor every 4th cut** — drops prev_cut from refs to let original identity dominate, fights long-chain drift.

## Chat-native UX

Every action lives in chat — no separate UIs:

- **Repair** (regenerate identities / recompile bible / re-mint anchor) — chat ActionsBar inline, no standalone menu
- **Cut composition** — PlanCard in chat with approve/modify/edit-prompt
- **Asset prompt edits** — ContextPanel (small top-left overlay) shows the selected asset; edits via REST, no chat round-trip
- **Phase advancement** — `→ Next phase` button on PhaseRail. Gates respect Berry/Sage/Atlas readiness. Always-clickable; surfaces toast on not-ready
- **Live activity** — generation counter badge between phase chips and the advance button: "🎨 N generating" pulses cyan while in flight

## License

MIT
