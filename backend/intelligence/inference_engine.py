"""
Strawberry Studio - Narrative Intelligence & Metadata Inference Engine
Auto-fills rich cinematic metadata from minimal user input using LLM reasoning
"""
from typing import Dict, List, Optional, Any
from google.genai import Client
import json
import os


class InferenceEngine:
    """
    Analyzes creative intent and infers rich cinematic metadata.
    Transforms sparse user input into production-ready specifications.
    """

    def __init__(self, model: str = "gemini-2.0-flash"):
        self.model = model
        self.client = Client(api_key=os.getenv("GOOGLE_API_KEY"))

    def infer_brief_metadata(self, user_input: str) -> Dict[str, Any]:
        """
        From minimal brief input, infer complete creative vision.

        Input: "A video about discovering water on Mars"
        Output: Full creative context, visual language, emotional arc, etc.
        """
        prompt = f"""You are a world-class creative director analyzing a video project brief.

USER INPUT:
"{user_input}"

Analyze this creative intent and infer rich metadata to guide production. Be specific and opinionated.

Return a JSON object with:

{{
  "creative_intent": "What the creator truly wants to achieve (viral appeal? emotional impact? education?)",
  "target_emotion": "Primary emotions to evoke in audience",
  "reference_works": "3-5 films/commercials that match this vibe (be specific: 'Interstellar landing scene', not just 'Interstellar')",
  "visual_identity": "How should this LOOK? (cinematic realism, stylized, gritty, clean, etc.)",

  "story_structure": "three-act | hero-journey | vignette | experimental",
  "thematic_core": ["list", "of", "3-5", "themes"],
  "emotional_arc": "Beginning emotion → Middle → End",
  "narrative_style": "Show don't tell | Narration-driven | Observational | etc.",

  "cinematic_style": "Grounded sci-fi | Documentary realism | Spielberg wonder | etc.",
  "pacing_preference": "Contemplative | Energetic | Rhythmic montage | etc.",
  "visual_motifs": "Recurring visual symbols/metaphors",
  "color_theory": "Color palette reasoning and emotional use",

  "lighting_philosophy": "Natural motivated | High contrast | Soft ambient | etc.",
  "sensory_palette": "What should this FEEL like? (cold, tactile, quiet, overwhelming, etc.)",

  "suggestions": [
    "Creative suggestion 1 (be specific and inspiring)",
    "Creative suggestion 2",
    "Creative suggestion 3"
  ]
}}

Be opinionated but justify your choices. Think like a visionary director."""

        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt
        )

        # Extract JSON from response
        text = response.text
        # Handle markdown code blocks
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        return json.loads(text)

    def infer_scene_metadata(
        self,
        scene_description: str,
        scene_number: int,
        total_scenes: int,
        brief_context: Dict[str, Any],
        previous_scenes: List[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        From scene description, infer complete cinematic metadata.

        Considers: story position, genre context, previous scenes, emotional arc
        """
        previous_context = ""
        if previous_scenes:
            previous_context = "\n".join([
                f"Scene {s.get('scene_number')}: {s.get('title')} - {s.get('emotional_beat', 'unknown')}"
                for s in previous_scenes[-3:]  # Last 3 scenes for context
            ])

        prompt = f"""You are a master cinematographer and narrative designer.

PROJECT CONTEXT:
- Genre: {brief_context.get('genre', 'Unknown')}
- Creative Intent: {brief_context.get('creative_intent', 'Unknown')}
- Visual Style: {brief_context.get('cinematic_style', 'Unknown')}
- Emotional Arc: {brief_context.get('emotional_arc', 'Unknown')}

STORY POSITION:
- This is Scene {scene_number} of {total_scenes}
- Act: {"Setup" if scene_number <= total_scenes//3 else "Confrontation" if scene_number <= 2*total_scenes//3 else "Resolution"}

PREVIOUS SCENES:
{previous_context or "This is the first scene"}

CURRENT SCENE:
"{scene_description}"

Infer rich cinematic metadata for this scene. Think like Roger Deakins meets Terrence Malick.

Return JSON:
{{
  "story_purpose": "Why this scene exists in the narrative",
  "emotional_beat": "Emotional journey within this scene (start → end)",
  "narrative_function": "Setup | Turning Point | Climax | Denouement | etc.",
  "thematic_focus": "Which themes from the brief this emphasizes",

  "builds_from_previous": "How this continues from what came before",
  "sets_up_next": "What this foreshadows or sets up",
  "emotional_shift": "The emotional transition",
  "pacing_role": "Slow build | Acceleration | Pause | Climax | etc.",

  "visual_motif": "Scene-specific visual metaphors",
  "color_signature": "Dominant colors and their meaning",
  "pacing_rhythm": "Shot rhythm and timing feel",
  "tension_level": 1-10,
  "sensory_priority": "Which senses to emphasize (visual, sound, tactile)",

  "location_personality": "The location as a character",
  "lighting_motivation": "Why the light looks this way (natural sun, practicals, etc.)",
  "temperature": "Physical temperature cue",
  "tactile_detail": "Touch/texture detail",
  "sound_design_notes": "Audio atmosphere",

  "mood": "Overall scene mood",
  "mood_evolution": "How mood changes through scene",

  "reference_films": "Specific scenes from films that match this vibe",

  "camera_approach_suggestions": "How should we shoot this? 3-4 specific shot ideas with reasoning"
}}

Be specific, opinionated, and cinematic."""

        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt
        )

        text = response.text
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        return json.loads(text)

    def infer_shot_metadata(
        self,
        shot_description: str,
        scene_context: Dict[str, Any],
        shot_number: int,
        total_shots_in_scene: int
    ) -> Dict[str, Any]:
        """
        From shot description, infer camera language and visual storytelling.
        """
        prompt = f"""You are a master DP (Director of Photography) and visual storyteller.

SCENE CONTEXT:
- Scene Purpose: {scene_context.get('story_purpose', 'Unknown')}
- Scene Mood: {scene_context.get('mood', 'Unknown')}
- Emotional Beat: {scene_context.get('emotional_beat', 'Unknown')}
- Visual Motif: {scene_context.get('visual_motif', 'Unknown')}
- Tension Level: {scene_context.get('tension_level', 5)}/10

SHOT POSITION:
- Shot {shot_number} of {total_shots_in_scene} in this scene
- Position: {"Establishing" if shot_number == 1 else "Development" if shot_number < total_shots_in_scene else "Closing"}

SHOT DESCRIPTION:
"{shot_description}"

Infer precise camera language and visual storytelling choices.

Return JSON:
{{
  "shot_purpose": "Why this specific shot (establish, reveal, emotion, etc.)",
  "emotional_function": "What emotion this shot creates",
  "story_information": "What the audience learns",

  "camera_angle": "Eye-level | Low | High | Dutch | Bird's eye | Worm's eye",
  "camera_height": "Ground | Knee | Eye-level | High | Overhead",
  "camera_movement": "Static | Pan | Tilt | Dolly in/out | Tracking | Handheld | etc.",
  "camera_distance": "Extreme Wide | Wide | Medium | Close-up | Extreme Close-up",
  "camera_motivation": "WHY this camera choice (POV shows isolation, low = power, etc.)",
  "shot_type_name": "Common name (Cowboy, Dutch Angle, Over-shoulder, etc.)",

  "lens_type": "14mm | 24mm | 35mm | 50mm | 85mm | 100mm macro | etc.",
  "lens_character": "Sharp clinical | Soft dreamy | Distorted wide | Compressed tele",
  "depth_of_field": "Deep focus | Shallow (f/2.8) | Rack focus | etc.",
  "focus_point": "Where focus draws the eye",
  "focus_motivation": "Why focus here (eyes = emotion, hands = action, etc.)",

  "composition": "Centered | Rule of thirds | Symmetrical | Off-balance | etc.",
  "composition_theory": "Why this composition works",
  "visual_balance": "Weight distribution in frame",
  "negative_space": "Use of empty space for meaning",

  "visual_subtext": "What the framing MEANS (small figure = vulnerable, etc.)",
  "symbolic_elements": "Visual metaphors in this shot",
  "color_contrast": "Color relationships",

  "movement_energy": "Static = contemplation | Dynamic = urgency | etc.",
  "eye_flow": "How the eye moves through the frame",

  "reference_shots": "Specific shots from films (be precise: 'Blade Runner 2049 - K walking in desert')"
}}

Think like Emmanuel Lubezki meets Roger Deakins."""

        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt
        )

        text = response.text
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        return json.loads(text)

    def infer_cut_metadata(
        self,
        cut_description: str,
        shot_context: Dict[str, Any],
        scene_context: Dict[str, Any],
        cut_number: int,
        total_cuts_in_shot: int
    ) -> Dict[str, Any]:
        """
        From cut/action description, infer performance, timing, and edit choices.
        """
        prompt = f"""You are a master editor and performance director.

SCENE CONTEXT:
- Emotional Beat: {scene_context.get('emotional_beat', 'Unknown')}
- Mood: {scene_context.get('mood', 'Unknown')}

SHOT CONTEXT:
- Shot Purpose: {shot_context.get('shot_purpose', 'Unknown')}
- Camera: {shot_context.get('camera_distance', 'Unknown')} {shot_context.get('camera_angle', '')}
- Emotional Function: {shot_context.get('emotional_function', 'Unknown')}

CUT POSITION:
- Cut {cut_number} of {total_cuts_in_shot}
- Role: {"Opening beat" if cut_number == 1 else "Development" if cut_number < total_cuts_in_shot else "Climax/Exit"}

CUT ACTION:
"{cut_description}"

Infer performance nuance and edit choices.

Return JSON:
{{
  "beat_purpose": "Narrative purpose of this moment",
  "emotional_peak": "Emotional high point",
  "story_revelation": "What's revealed/understood",
  "subtext": "Unspoken meaning",

  "expression_nuance": "Subtle facial performance detail",
  "internal_state": "Character's inner emotional state",

  "tactile_moment": "Physical/touch detail if present",
  "temperature_cue": "Temperature indicator if relevant",
  "sound_moment": "Key sound element",

  "duration_hint": "Suggested hold time (if this beat needs to breathe)",
  "hold_emphasis": "Where to linger",
  "rhythm_note": "Role in edit rhythm",
  "transition_motivation": "Why cut/dissolve/fade here",

  "framing_choice": "Why this framing for this moment",
  "color_moment": "Key color relationship",
  "light_quality": "How light reveals the moment"
}}

Think like Thelma Schoonmaker meets Phoebe Waller-Bridge (performance nuance)."""

        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt
        )

        text = response.text
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        return json.loads(text)

    def suggest_creative_directions(
        self,
        user_input: str,
        context_type: str = "brief"  # "brief", "scene", "shot"
    ) -> List[str]:
        """
        Given minimal input, suggest multiple creative directions.
        Returns 3-5 distinct, inspiring approaches.
        """
        prompt = f"""You are a visionary creative director brainstorming with a filmmaker.

THEIR INPUT:
"{user_input}"

Suggest 3-5 DISTINCT creative directions they could take. Each should be:
- Specific and visual (not vague)
- Cinematically grounded (reference techniques, films)
- Inspiring and unexpected
- Actionable

Format as JSON array of strings:
[
  "Direction 1: Specific approach with reasoning and reference",
  "Direction 2: Different approach...",
  ...
]

Examples:
- "Go full Terrence Malick: Golden hour, whispered voiceover, macro shots of dust particles. Make Mars feel spiritual, not scientific."
- "Ridley Scott realism: Gritty, used-future aesthetic. Dirty lenses, motivated lighting only, handheld in tight spaces. Think Alien meets The Martian."
- "Wong Kar-wai on Mars: Slow-motion, step-printed, saturated colors. Make it a lonely, beautiful meditation on isolation."

Be bold. Surprise them."""

        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt
        )

        text = response.text
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        return json.loads(text)

    def analyze_narrative_arc(
        self,
        scenes: List[Dict[str, Any]],
        brief: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Analyze overall story structure and suggest improvements.
        """
        scenes_summary = "\n".join([
            f"{s.get('scene_number')}. {s.get('title')}: {s.get('description', '')[:100]}"
            for s in scenes
        ])

        prompt = f"""You are a master screenwriting consultant analyzing story structure.

PROJECT:
- Genre: {brief.get('genre')}
- Emotional Arc Goal: {brief.get('emotional_arc')}
- Theme: {brief.get('thematic_core')}

CURRENT SCENE BREAKDOWN:
{scenes_summary}

Analyze the narrative arc and provide insights:

Return JSON:
{{
  "act_structure_analysis": "How well does this follow dramatic structure?",
  "tension_curve": [
    {{"scene": 1, "tension": 3, "note": "Establishing..."}},
    {{"scene": 2, "tension": 5, "note": "Rising..."}}
  ],
  "emotional_journey": "Beat-by-beat emotional tracking",
  "pacing_assessment": "Is pacing effective?",
  "visual_coherence": "Do visual choices support story?",

  "strengths": ["What works well"],
  "suggestions": [
    "Specific improvement suggestion 1",
    "Suggestion 2"
  ],

  "missing_beats": "Any narrative beats that seem absent?"
}}

Be constructive and specific."""

        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt
        )

        text = response.text
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        return json.loads(text)


# Singleton instance
_inference_engine = None

def get_inference_engine() -> InferenceEngine:
    """Get or create the global inference engine instance."""
    global _inference_engine
    if _inference_engine is None:
        _inference_engine = InferenceEngine()
    return _inference_engine
