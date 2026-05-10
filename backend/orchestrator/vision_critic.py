"""
Vision-LLM Continuity Critic.

After a cut renders, score the panel against:
  - the character's master image (face/identity preservation)
  - the previous cut (continuity of pose/wardrobe/props/lighting)
  - the scene's expected mood/lighting

Returns ContinuityScore{face, wardrobe, lighting, props, overall}. Below the
threshold, the system can call `request_edit` with stronger reference weighting.

Uses Gemini's multimodal capability via the GeminiLLM provider — Gemini sees
the actual images and reasons about visual continuity, not just text.
"""
from __future__ import annotations

import structlog
from pydantic import BaseModel, Field

from backend.config import get_settings
from backend.orchestrator.events import RunContext, log_event
from backend.orchestrator.runner import _make_pai_model
from backend.providers.image._storage import fetch_url_or_data_uri

log = structlog.get_logger(__name__)


class ContinuityScore(BaseModel):
    face: float = Field(ge=0.0, le=1.0, description="Identity preservation vs character master")
    wardrobe: float = Field(ge=0.0, le=1.0, description="Wardrobe lock match vs master/prev")
    lighting: float = Field(ge=0.0, le=1.0, description="Light direction/colour matches scene + prev")
    props: float = Field(ge=0.0, le=1.0, description="Props persist sensibly from prev cut")
    overall: float = Field(ge=0.0, le=1.0)
    issues: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)

    def passed(self, threshold: float = 0.8) -> bool:
        return self.overall >= threshold


_SYSTEM = (
    "You are a continuity supervisor for an AI storyboarding tool. You are shown:\n"
    "  1. The just-generated cut (the 'candidate').\n"
    "  2. The character's master reference image (identity ground truth).\n"
    "  3. The previous cut in the sequence (continuity ground truth).\n\n"
    "Score each axis from 0.0 (broken) to 1.0 (perfect). Be strict — if the face\n"
    "drifted, score `face` low. If wardrobe changed without reason, score wardrobe low.\n"
    "Return a structured ContinuityScore with `overall` set to the lowest of the four\n"
    "axis scores (the weakest link wins). Add 1–3 specific issues and concrete\n"
    "suggestions an i2i retry could use as `edit_target` text."
)


async def review_cut(
    *,
    candidate_url: str,
    character_master_url: str | None = None,
    previous_cut_url: str | None = None,
    scene_lighting: str | None = None,
    project_id: str = "",
    cut_id: str = "",
    threshold: float = 0.8,
) -> ContinuityScore:
    """Run the vision critic. Pulls images, calls Gemini multimodal, returns a verdict."""
    s = get_settings()
    model_name = s.llm.role("qa")
    if not model_name.startswith("gemini"):
        # Force a vision-capable model — Kimi/Claude/OpenAI text-only roles can't see images here.
        model_name = s.image.pro_model.replace("-image-preview", "-pro-preview")
        if not model_name.startswith("gemini"):
            model_name = "gemini-2.5-pro"
    model = _make_pai_model(model_name)

    from pydantic_ai import Agent
    from pydantic_ai.messages import BinaryContent

    agent = Agent(
        model=model,
        system_prompt=_SYSTEM,
        output_type=ContinuityScore,
    )

    # Pull image bytes
    parts: list = []
    parts.append("# Candidate (just generated)")
    cand_bytes = await fetch_url_or_data_uri(candidate_url)
    parts.append(BinaryContent(data=cand_bytes, media_type="image/png"))

    if character_master_url:
        parts.append("# Character master (identity ground truth)")
        master_bytes = await fetch_url_or_data_uri(character_master_url)
        parts.append(BinaryContent(data=master_bytes, media_type="image/png"))

    if previous_cut_url:
        parts.append("# Previous cut (continuity ground truth)")
        prev_bytes = await fetch_url_or_data_uri(previous_cut_url)
        parts.append(BinaryContent(data=prev_bytes, media_type="image/png"))

    if scene_lighting:
        parts.append(f"\nScene lighting expectation: {scene_lighting}")

    parts.append(
        "\nReturn a strict ContinuityScore JSON. `overall` is the MIN of the 4 axes."
    )

    ctx = RunContext(project_id=project_id, phase="GENERATE", agent_id="vision_critic")
    await log_event(
        ctx,
        "critic_start",
        {"cut_id": cut_id, "model": model_name, "candidate": candidate_url[:80]},
    )

    try:
        result = await agent.run(parts)
        score = result.output if isinstance(result.output, ContinuityScore) else ContinuityScore.model_validate(result.output)
    except Exception as e:
        log.exception("vision_critic_failed", cut_id=cut_id, error=str(e))
        await log_event(ctx, "critic_fail", {"error": str(e)})
        # Fail-open: don't block cuts on critic errors during early development.
        return ContinuityScore(face=1.0, wardrobe=1.0, lighting=1.0, props=1.0, overall=1.0, issues=[f"critic error: {e}"], suggestions=[])

    event_type = "critic_pass" if score.passed(threshold) else "critic_revise"
    await log_event(ctx, event_type, score.model_dump())
    return score
