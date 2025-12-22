from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class Brief(BaseModel):
    """Project-level settings that apply globally."""
    # Core
    title: str = ""
    logline: str = ""
    genre: str = ""
    tone: str = ""
    target_audience: str = ""
    key_themes: str = ""
    
    # Visual Style (Global Defaults)
    art_style: str = ""           # "Cinematic 35mm film, slight grain"
    color_palette: str = ""       # "Warm earth tones, amber highlights"
    aspect_ratio: str = "16:9"    # "16:9", "9:16", "2.35:1"
    render_quality: str = ""      # "Photorealistic", "Stylized anime"
    lighting_style: str = ""      # "Natural, high contrast"
    
    # World Rules
    world_logic: str = ""         # "Low gravity, dust floats slowly"
    era_setting: str = ""         # "Near-future 2087"


class Cut(BaseModel):
    """Atomic unit of generation - a single frame."""
    # Core
    id: str
    shot_id: str
    cut_number: int
    action: str                   # What happens in this exact moment
    
    # Character Action
    dialogue: Optional[str] = None
    expression: str = ""          # "Determined, slight frown"
    body_language: str = ""       # "Leaning forward, tense"
    gesture: str = ""             # "Pointing at horizon"
    gaze_direction: str = ""      # "Looking at object in hand"
    
    # Beat & Timing
    beat_type: Optional[str] = None  # "Reveal", "Reaction", "Tension"
    duration_hint: str = ""       # "Hold 2 seconds"
    transition: Optional[str] = "cut"  # "cut", "dissolve", "fade"
    
    # Continuity Tracking
    prev_cut_ref: str = ""        # ID of previous cut (for chaining)
    continuity_notes: str = ""    # "Hand position matches Cut 2"
    character_state: str = ""     # "Sweating, helmet off, suit dirty"
    object_tracking: str = ""     # "Scanner in left hand"
    lighting_continuity: str = "" # "Same golden hour as Cut 1-3"
    
    # Edit Chain (for image-to-image)
    edit_target: str = ""         # "Change helmet visor to reflect Mars"
    spatial_lock: str = ""        # "Keep pose and background unchanged"
    
    # Generation State
    generated_image_url: str = "" # Output slot
    generation_status: str = "pending"  # pending|generating|complete|failed
    generation_notes: str = ""    # Issues or QA feedback
    
    # Overrides
    override_camera_distance: str = ""
    override_focus_point: str = ""
    override_lighting: str = ""
    override_mood: str = ""


class Shot(BaseModel):
    """Camera setup and framing."""
    # Core
    id: str
    scene_id: str
    shot_number: int
    description: str              # What happens in this shot
    
    # Camera
    camera_angle: Optional[str] = None    # "Low angle", "Birds eye"
    camera_height: str = ""       # "Ground level", "Eye level"
    camera_movement: Optional[str] = None  # "Slow push in", "Static"
    camera_distance: str = ""     # "Extreme close-up", "Medium", "Wide"
    
    # Lens & Technical
    lens_type: str = ""           # "35mm", "85mm portrait"
    depth_of_field: str = ""      # "Shallow, background blurred"
    focus_point: str = ""         # "Character's eyes"
    
    # Composition
    subject: Optional[str] = None
    subject_position: str = ""    # "Center frame", "Rule of thirds left"
    composition: Optional[str] = None
    foreground: str = ""          # "Dust particles close to camera"
    background: str = ""          # "Distant mountains out of focus"
    
    # Overrides
    override_mood: Optional[str] = None
    override_lighting: str = ""
    override_art_style: str = ""
    
    cuts: List[Cut] = []


class Scene(BaseModel):
    """A location and time where a sequence occurs."""
    # Core
    id: str
    project_id: str
    scene_number: int
    title: str
    description: Optional[str] = None
    
    # Location
    location: Optional[str] = None       # "Mars surface - rocky terrain"
    location_detail: str = ""    # "Red rocks, dust, distant mountains"
    time_of_day: Optional[str] = None    # "Golden hour"
    
    # Atmosphere
    lighting: Optional[str] = None       # "Harsh directional sunlight"
    lighting_color: str = ""     # "Orange-tinted natural light"
    weather: str = ""            # "Dust storm approaching"
    atmosphere: str = ""         # "Hazy, particles in air"
    mood: Optional[str] = None
    ambient_sound: str = ""      # "Wind howling, suit breathing"
    
    # Overrides (blank = use Brief)
    override_art_style: str = ""
    override_color_palette: str = ""
    
    # Continuity
    anchor_cut_id: str = ""      # Hero cut for scene
    scene_continuity_log: str = ""  # Running log of state changes
    location_master_url: str = ""  # Empty set image
    
    shots: List[Shot] = []


class Project(BaseModel):
    """Root container for the entire story."""
    id: str
    name: str
    current_phase: str
    created_at: datetime
    updated_at: datetime
    brief: Optional[Brief] = None
    scenes: List[Scene] = []
