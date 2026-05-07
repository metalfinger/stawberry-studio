"""
Strawberry Studio — FastAPI entrypoint.
"""
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

# E402 imports below are intentional: load_dotenv() must run first so settings
# pick up .env values before any module reads from os.environ.
from backend.config import get_settings  # noqa: E402
from backend.database.core import init_db_async  # noqa: E402
from backend.errors import configure_logging, install_exception_handlers  # noqa: E402
from backend.routes import assets, chat, cuts, elements, library, pipeline, projects  # noqa: E402

configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db_async()
    yield


settings = get_settings()
app = FastAPI(title="Strawberry Studio", version="3.0", lifespan=lifespan)
install_exception_handlers(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(chat.router)
app.include_router(elements.router)
app.include_router(cuts.router)
app.include_router(assets.router)
app.include_router(pipeline.router)
app.include_router(library.router)

# Static file mounts
storage_path = Path(__file__).parent / "storage" / "generated"
storage_path.mkdir(parents=True, exist_ok=True)
app.mount("/storage/generated", StaticFiles(directory=storage_path), name="storage_generated")

projects_storage_path = Path(__file__).parent / "storage" / "projects"
projects_storage_path.mkdir(parents=True, exist_ok=True)
app.mount("/storage/projects", StaticFiles(directory=projects_storage_path), name="storage_projects")

frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")


@app.get("/")
async def serve_frontend():
    index_path = frontend_path / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "Frontend not found. API available at /docs"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
