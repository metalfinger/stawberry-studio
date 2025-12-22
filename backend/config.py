"""
Strawberry Studio - Configuration
Centralized configuration from environment variables
"""
import os
from dotenv import load_dotenv

load_dotenv()

# =============================================================================
# API KEYS
# =============================================================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")  # Legacy
FAL_KEY = os.getenv("FAL_KEY")

# =============================================================================
# MODEL CONFIGURATION
# =============================================================================

# Text generation model for all agents
GEMINI_TEXT_MODEL = os.getenv("GEMINI_TEXT_MODEL", "gemini-3-flash-preview")

# Image generation models
GEMINI_IMAGE_MODEL_PRO = os.getenv("GEMINI_IMAGE_MODEL_PRO", "gemini-3-pro-image")
GEMINI_IMAGE_MODEL_FLASH = os.getenv("GEMINI_IMAGE_MODEL_FLASH", "gemini-2.5-flash-image")

# =============================================================================
# FEATURE FLAGS
# =============================================================================

# Enable real image generation (vs mock)
ENABLE_REAL_IMAGE_GENERATION = os.getenv("ENABLE_REAL_IMAGE_GENERATION", "false").lower() == "true"
