"""
Core database operations and schema initialization.
"""
import sqlite3
import os
import uuid
import json
from datetime import datetime
from typing import Dict, Any, Optional
from pathlib import Path

# Use absolute path relative to this file's directory
DB_PATH = str(Path(__file__).parent.parent.parent / "strawberry.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database with full GENERATION-phase schema."""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Projects Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            current_phase TEXT DEFAULT 'BRIEF',
            created_at TEXT,
            updated_at TEXT
        )
    """)
    
    # Briefs Table (Extended for GENERATION)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS briefs (
            project_id TEXT PRIMARY KEY,
            title TEXT,
            logline TEXT,
            genre TEXT,
            style TEXT,
            tone TEXT,
            target_audience TEXT,
            key_themes TEXT,
            -- Visual Style (Global)
            art_style TEXT DEFAULT '',
            color_palette TEXT DEFAULT '',
            aspect_ratio TEXT DEFAULT '16:9',
            render_quality TEXT DEFAULT '',
            lighting_style TEXT DEFAULT '',
            -- World Rules
            world_logic TEXT DEFAULT '',
            era_setting TEXT DEFAULT '',
            FOREIGN KEY (project_id) REFERENCES projects(id)
        )
    """)
    
    # Scenes Table (Extended)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS scenes (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            scene_number INTEGER,
            title TEXT,
            description TEXT,
            -- Location
            location TEXT,
            location_detail TEXT DEFAULT '',
            time_of_day TEXT,
            -- Atmosphere
            lighting TEXT,
            lighting_color TEXT DEFAULT '',
            weather TEXT DEFAULT '',
            atmosphere TEXT DEFAULT '',
            mood TEXT,
            ambient_sound TEXT DEFAULT '',
            -- Overrides
            override_art_style TEXT DEFAULT '',
            override_color_palette TEXT DEFAULT '',
            -- Continuity
            anchor_cut_id TEXT DEFAULT '',
            scene_continuity_log TEXT DEFAULT '',
            location_master_url TEXT DEFAULT '',
            FOREIGN KEY (project_id) REFERENCES projects(id)
        )
    """)
    
    # Shots Table (Extended)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS shots (
            id TEXT PRIMARY KEY,
            scene_id TEXT,
            shot_number INTEGER,
            description TEXT,
            -- Camera
            camera_angle TEXT,
            camera_height TEXT DEFAULT '',
            camera_movement TEXT,
            camera_distance TEXT DEFAULT '',
            -- Lens
            lens_type TEXT DEFAULT '',
            depth_of_field TEXT DEFAULT '',
            focus_point TEXT DEFAULT '',
            -- Composition
            subject TEXT,
            subject_position TEXT DEFAULT '',
            composition TEXT,
            foreground TEXT DEFAULT '',
            background TEXT DEFAULT '',
            -- Overrides
            override_mood TEXT,
            override_lighting TEXT DEFAULT '',
            override_art_style TEXT DEFAULT '',
            FOREIGN KEY (scene_id) REFERENCES scenes(id)
        )
    """)
    
    # Cuts Table (Extended for GENERATION)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cuts (
            id TEXT PRIMARY KEY,
            shot_id TEXT,
            cut_number INTEGER,
            action TEXT,
            story_description TEXT DEFAULT '',  -- Narrative intent written in STORY phase
            -- Character Action
            dialogue TEXT,
            expression TEXT DEFAULT '',
            body_language TEXT DEFAULT '',
            gesture TEXT DEFAULT '',
            gaze_direction TEXT DEFAULT '',
            -- Beat
            beat_type TEXT,
            duration_hint TEXT DEFAULT '',
            transition TEXT DEFAULT 'cut',
            -- Continuity
            prev_cut_ref TEXT DEFAULT '',
            continuity_notes TEXT DEFAULT '',
            character_state TEXT DEFAULT '',
            object_tracking TEXT DEFAULT '',
            lighting_continuity TEXT DEFAULT '',
            -- Edit Chain
            edit_target TEXT DEFAULT '',
            spatial_lock TEXT DEFAULT '',
            -- Generation
            generated_image_url TEXT DEFAULT '',
            generation_status TEXT DEFAULT 'pending',
            generation_notes TEXT DEFAULT '',
            -- Overrides
            override_camera_distance TEXT DEFAULT '',
            override_focus_point TEXT DEFAULT '',
            override_lighting TEXT DEFAULT '',
            override_mood TEXT DEFAULT '',
            FOREIGN KEY (shot_id) REFERENCES shots(id)
        )
    """)
    
    # Chat History
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT,
            phase TEXT,
            role TEXT,
            agent_name TEXT,
            content TEXT,
            timestamp TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id)
        )
    """)
    
    # Assets (Extended with consistency tokens + source tracking)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            type TEXT,
            name TEXT,
            description TEXT,
            appearance TEXT,
            style TEXT,
            metadata TEXT,
            master_id TEXT,
            variant_diff TEXT,
            slot_filled INTEGER DEFAULT 0,
            image_url TEXT,
            -- Continuity tokens
            consistency_tokens TEXT DEFAULT '',
            distinctive_features TEXT DEFAULT '',
            wardrobe_lock TEXT DEFAULT '',
            -- Source tracking (for pre-production)
            source_type TEXT DEFAULT 'global',
            source_cut_id TEXT,
            generation_chain TEXT DEFAULT '[]',
            face_embedding_url TEXT,
            created_at TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (master_id) REFERENCES assets(id)
        )
    """)
    
    # Asset Links
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS asset_links (
            id TEXT PRIMARY KEY,
            asset_id TEXT,
            node_type TEXT,
            node_id TEXT,
            usage TEXT,
            variant_notes TEXT,
            FOREIGN KEY (asset_id) REFERENCES assets(id)
        )
    """)
    
    # Generation History (for pre-production and final outputs) - REMOVED
    # This table is now created with the element generation tables below

    # Element Generation Tables
    # Element Masters - Core reference images for assets
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS element_masters (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,
            element_type TEXT NOT NULL,
            master_image_url TEXT,
            master_prompt TEXT,
            master_generation_params TEXT,
            background_type TEXT DEFAULT 'white',
            view_type TEXT,
            resolution TEXT DEFAULT '2048x2048',
            aspect_ratio TEXT DEFAULT '1:1',
            status TEXT DEFAULT 'pending',
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
        )
    """)

    # Element Variants - Different views/variations
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS element_variants (
            id TEXT PRIMARY KEY,
            master_id TEXT NOT NULL,
            variant_type TEXT NOT NULL,
            variant_description TEXT,
            image_url TEXT,
            prompt TEXT,
            generation_method TEXT DEFAULT 'image_to_image',
            reference_image_id TEXT,
            generation_params TEXT,
            status TEXT DEFAULT 'pending',
            error_message TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (master_id) REFERENCES element_masters(id) ON DELETE CASCADE
        )
    """)

    # Generation Requests - Track all generation requests with progress
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS generation_requests (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_asset_id TEXT,
            target_cut_id TEXT,
            prompt TEXT NOT NULL,
            model TEXT DEFAULT 'gemini-3-pro-image',
            method TEXT DEFAULT 'text_to_image',
            reference_image_url TEXT,
            params TEXT,
            status TEXT DEFAULT 'queued',
            progress_percentage INTEGER DEFAULT 0,
            current_step TEXT,
            output_image_url TEXT,
            output_file_path TEXT,
            output_metadata TEXT,
            error_message TEXT,
            cost_usd REAL,
            started_at TIMESTAMP,
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            saved_to_master_id TEXT,
            saved_to_variant_id TEXT,
            candidate_group_id TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (target_asset_id) REFERENCES assets(id) ON DELETE CASCADE,
            FOREIGN KEY (target_cut_id) REFERENCES cuts(id) ON DELETE CASCADE
        )
    """)

    # Generation History - Full traceability (kept for backwards compatibility)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS generation_history (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT,
            prompt TEXT NOT NULL,
            model TEXT DEFAULT 'gemini_3_pro_image',
            generation_method TEXT DEFAULT 'text_to_image',
            reference_images TEXT,
            params TEXT,
            output_image_url TEXT,
            output_image_id TEXT,
            status TEXT DEFAULT 'pending',
            error_message TEXT,
            cost_usd REAL DEFAULT 0.039,
            tokens_used INTEGER DEFAULT 1290,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
    """)

    # Element Presets - Reusable templates
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS element_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            element_type TEXT NOT NULL,
            preset_type TEXT NOT NULL,
            variant_type TEXT,
            prompt_template TEXT NOT NULL,
            required_fields TEXT,
            default_model TEXT DEFAULT 'gemini_3_pro_image',
            default_resolution TEXT DEFAULT '2048x2048',
            default_aspect_ratio TEXT DEFAULT '1:1',
            default_background TEXT DEFAULT 'white',
            default_params TEXT,
            is_system BOOLEAN DEFAULT TRUE,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Indexes for element tables
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_element_masters_asset_id ON element_masters(asset_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_element_variants_master_id ON element_variants(master_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_generation_history_project_id ON generation_history(project_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_generation_requests_project ON generation_requests(project_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_generation_requests_status ON generation_requests(status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_generation_requests_asset ON generation_requests(target_asset_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_generation_requests_candidate_group ON generation_requests(candidate_group_id)")

    conn.commit()
    conn.close()


# Project Operations
def create_project(name: str) -> Dict[str, Any]:
    project_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (project_id, name, now, now)
    )
    cursor.execute(
        "INSERT INTO briefs (project_id) VALUES (?)",
        (project_id,)
    )
    conn.commit()
    conn.close()
    
    return {
        "id": project_id, 
        "name": name, 
        "current_phase": "BRIEF",
        "created_at": now, 
        "updated_at": now
    }


def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def list_projects() -> list[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM projects ORDER BY updated_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def update_phase(project_id: str, new_phase: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE projects SET current_phase = ?, updated_at = ? WHERE id = ?",
        (new_phase, datetime.now().isoformat(), project_id)
    )
    conn.commit()
    conn.close()
    

# Brief Operations
def get_brief(project_id: str) -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM briefs WHERE project_id = ?", (project_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else {}


def update_brief(project_id: str, **kwargs) -> Dict[str, Any]:
    if not kwargs:
        return get_brief(project_id)
        
    set_clause = ", ".join([f"{k} = ?" for k in kwargs.keys()])
    values = list(kwargs.values()) + [project_id]
    
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(f"UPDATE briefs SET {set_clause} WHERE project_id = ?", values)
    conn.commit()
    conn.close()
    
    return get_brief(project_id)


def complete_briefing(project_id: str) -> bool:
    """Advance project to BLUEPRINT phase."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE projects SET current_phase = 'STORY', updated_at = ? WHERE id = ?",
        (datetime.now().isoformat(), project_id)
    )
    conn.commit()
    conn.close()
    return True
