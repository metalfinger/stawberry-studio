"""
Production-flow pipeline REST routes (Phase 4).

GET    /api/projects/{pid}/phases                          → all 6 phases + status + version
GET    /api/projects/{pid}/artifacts/{phase}               → current version
GET    /api/projects/{pid}/artifacts/{phase}/{version}     → specific version
GET    /api/projects/{pid}/artifacts/{phase}/versions      → version list
POST   /api/projects/{pid}/artifacts/{phase}               → save new version
POST   /api/projects/{pid}/artifacts/{phase}/fork          → fork from base version
POST   /api/projects/{pid}/phases/{phase}/freeze           → freeze + advance
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.orchestrator.pipeline import (
    fork_artifact,
    freeze_and_advance,
    get_artifact,
    get_pipeline_state,
    list_versions,
    save_artifact_version,
)

router = APIRouter(prefix="/api/projects", tags=["pipeline"])


class SaveArtifactBody(BaseModel):
    schema_id: str
    payload: dict[str, Any]
    notes: str = ""
    created_by: str = "api"
    set_as_current: bool = True


class ForkArtifactBody(BaseModel):
    base_version: int
    payload: dict[str, Any]
    notes: str = "fork"
    created_by: str = "api"


@router.get("/{project_id}/phases")
async def get_phases(project_id: str):
    return await get_pipeline_state(project_id)


@router.get("/{project_id}/artifacts/{phase}/versions")
async def get_artifact_versions(project_id: str, phase: str):
    return {"phase": phase, "versions": await list_versions(project_id, phase)}


@router.get("/{project_id}/artifacts/{phase}")
async def get_current_artifact(project_id: str, phase: str):
    art = await get_artifact(project_id, phase)
    if art is None:
        raise HTTPException(status_code=404, detail="No artifact for this phase")
    return art


@router.get("/{project_id}/artifacts/{phase}/{version}")
async def get_artifact_version(project_id: str, phase: str, version: int):
    art = await get_artifact(project_id, phase, version)
    if art is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return art


@router.post("/{project_id}/artifacts/{phase}")
async def save_artifact(project_id: str, phase: str, body: SaveArtifactBody):
    return await save_artifact_version(
        project_id,
        phase,
        body.schema_id,
        body.payload,
        notes=body.notes,
        created_by=body.created_by,
        set_as_current=body.set_as_current,
    )


@router.post("/{project_id}/artifacts/{phase}/fork")
async def fork_artifact_route(project_id: str, phase: str, body: ForkArtifactBody):
    try:
        return await fork_artifact(
            project_id,
            phase,
            body.base_version,
            body.payload,
            notes=body.notes,
            created_by=body.created_by,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/{project_id}/phases/{phase}/freeze")
async def freeze_phase(project_id: str, phase: str):
    try:
        return await freeze_and_advance(project_id, phase)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
