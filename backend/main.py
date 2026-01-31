"""
Strawberry Studio - FastAPI Backend
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from backend.routes import projects, chat, elements, cuts, assets
from backend.database.core import init_db

# Initialize database on startup
init_db()

app = FastAPI(title="Strawberry Studio", version="3.0")

# CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(projects.router)
app.include_router(chat.router)
app.include_router(elements.router)
app.include_router(cuts.router)
app.include_router(assets.router)

# Serve generated images from local storage
storage_path = Path(__file__).parent / "storage" / "generated"
storage_path.mkdir(parents=True, exist_ok=True)
app.mount("/storage/generated", StaticFiles(directory=storage_path), name="storage_generated")

# Serve project storage (elements, cuts, etc.)
projects_storage_path = Path(__file__).parent / "storage" / "projects"
projects_storage_path.mkdir(parents=True, exist_ok=True)
app.mount("/storage/projects", StaticFiles(directory=projects_storage_path), name="storage_projects")

# Serve frontend static files
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")

@app.get("/")
async def serve_frontend():
    """Serve the main frontend page."""
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
