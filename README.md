# Strawberry Studio

Visual AI storyboarding tool. Agentic, canvas-driven, multi-provider (Gemini / Fal / Anthropic / OpenAI / Kimi). Pipeline mimics real film production: Develop → Design → Cast/Scout → Blueprint → Storyboard → Animatic.

## Stack

- **Backend:** FastAPI · Pydantic AI · aiosqlite · WebSockets
- **Frontend:** React 19 · Vite · React Flow · Zustand
- **Image gen:** Gemini 3 Pro Image · Fal Nano Banana Pro · OpenAI gpt-image-2 · Replicate (FLUX/SDXL)

## Prerequisites

- Python 3.10+ (3.11+ recommended)
- Node 18+
- pnpm or npm

## Setup

```bash
# Backend (one-time)
python -m venv venv
source venv/bin/activate          # Windows: .\venv\Scripts\activate
pip install -e .                   # editable install — works from any cwd

# Frontend
cd frontend && npm install && cd ..

# Environment
cp .env.example .env               # then fill in keys
```

`.env` keys:

```
GEMINI_API_KEY=
FAL_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
MOONSHOT_API_KEY=
CORS_ORIGINS=http://localhost:5173
```

## Run

```bash
./start.sh
```

Or run each side in its own terminal:

```bash
# Terminal 1 — backend (works from any cwd thanks to editable install)
source venv/bin/activate
python -m uvicorn backend.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend && npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:8000
- API docs: http://localhost:8000/docs

## Project layout

```
strawberry-studio/
├── backend/
│   ├── agents/        # ADK agents (migrating to Pydantic AI)
│   ├── database/      # SQLite + migrations
│   ├── routes/        # FastAPI routers
│   ├── services/      # Image gen + queue (migrating to providers/)
│   ├── tools/         # Agent tools (per-phase)
│   └── main.py        # FastAPI entrypoint
├── frontend/
│   └── src/           # React 19 + React Flow canvas
├── storage/           # Generated images + project files (gitignored)
├── pyproject.toml
└── requirements.txt
```

## Pipeline

| Phase | Lead agent | Output |
|---|---|---|
| BRIEF | Berry | Brief |
| STORY | Sage / Nova | Scenes → Shots → Cuts |
| ASSETS | Atlas | Characters, locations, props |
| GENERATE | Pixel / Iris / Spark / Scout | Storyboard panels |

The pipeline is being expanded to a 6-phase film-production flow (Develop / Design / Cast & Scout / Blueprint / Storyboard / Animatic) — see `~/.claude/plans/lets-plan-rewamp-of-cryptic-lovelace.md` for the revamp plan.

## License

MIT
