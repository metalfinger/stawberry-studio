"""
Strawberry Studio - Pydantic Models
"""
from pydantic import BaseModel
from typing import List, Optional

class ProjectCreate(BaseModel):
    name: str

class Project(BaseModel):
    id: str
    name: str
    current_phase: str
    created_at: str
    updated_at: str

class Brief(BaseModel):
    project_id: str
    title: str = ""
    logline: str = ""
    genre: str = ""
    aesthetic_tags: List[str] = []
    artist_refs: List[str] = []

class BriefUpdate(BaseModel):
    title: Optional[str] = None
    logline: Optional[str] = None
    genre: Optional[str] = None
    aesthetic_tags: Optional[List[str]] = None
    artist_refs: Optional[List[str]] = None

class ChatMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
