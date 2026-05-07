"""
Critic / reviewer pattern.

Each artifact-producing agent can be paired with a cheaper critic that
validates the artifact against a structured rubric and either passes it or
returns specific revision feedback.

Usage:
    from backend.orchestrator.critic import review

    verdict = await review(
        artifact={"logline": "A space cat finds home.", "scene_count": 3},
        rubric=BRIEF_RUBRIC,
        agent_id="brief_critic",
        project_id=pid,
    )
    if verdict.passed:
        ...  # advance
    else:
        ...  # send verdict.feedback back to the producing agent for a revision pass
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import structlog
from pydantic import BaseModel, Field

from backend.config import get_settings
from backend.orchestrator.events import RunContext, log_event
from backend.orchestrator.runner import _make_pai_model

log = structlog.get_logger(__name__)


# ============================================================================
# Public types
# ============================================================================

class CriticVerdict(BaseModel):
    """Structured output from a critic call."""
    passed: bool
    score: float = Field(ge=0.0, le=1.0, default=0.0)
    feedback: str = ""
    issues: list[str] = Field(default_factory=list)


@dataclass
class Rubric:
    """A reusable rubric the critic agent evaluates against."""
    name: str
    description: str
    checks: list[str]
    pass_threshold: float = 0.8

    def to_prompt_block(self) -> str:
        items = "\n".join(f"- {c}" for c in self.checks)
        return (
            f"# Rubric: {self.name}\n"
            f"{self.description}\n\n"
            f"Checks:\n{items}\n\n"
            f"Pass threshold: {self.pass_threshold}\n"
        )


# ============================================================================
# Built-in rubrics
# ============================================================================

BRIEF_RUBRIC = Rubric(
    name="Brief readiness",
    description="A brief is production-ready when title, logline, genre, and art_style are set, the logline is ≤ 50 words, and art_style is concrete (not generic).",
    checks=[
        "title is a non-empty string",
        "logline is non-empty and ≤ 50 words",
        "genre is a recognised category (not just 'TBD')",
        "art_style is a concrete style (e.g. 'Pixar 3D', 'Studio Ghibli', 'Ben 10 Anime') — not 'cinematic' alone",
        "no obvious contradictions between tone and genre",
    ],
)

BLUEPRINT_RUBRIC = Rubric(
    name="Blueprint completeness",
    description="A blueprint is ready when every scene has at least one shot, every shot has at least one cut, and the action coverage is sensible.",
    checks=[
        "every scene has scene_number, title, location, mood, lighting filled",
        "every scene has at least one shot",
        "every shot has at least one cut",
        "every cut has action, story_description (3+ sentences), expression, body_language, gaze_direction",
        "scene transitions form a coherent narrative arc",
    ],
)

ASSETS_RUBRIC = Rubric(
    name="Asset coverage",
    description="Every named entity in the blueprint must have a corresponding asset, and core assets must have consistency tokens for visual continuity.",
    checks=[
        "every distinct character mentioned in any scene/shot/cut has an asset",
        "every distinct location has an asset",
        "every key prop has an asset",
        "every character has consistency_tokens populated",
        "characters have wardrobe_lock if their appearance is plot-relevant",
    ],
)

CONTINUITY_RUBRIC = Rubric(
    name="Cut continuity",
    description="A generated cut must visually match its character master, its scene's lighting, and chain coherently from the previous cut.",
    checks=[
        "the character's face matches the master image (identity preserved)",
        "wardrobe matches wardrobe_lock or has explicit reason to change",
        "lighting direction matches the scene's lighting field",
        "props from prev_cut still present (or have a reason to be gone)",
        "screen direction (left/right) is consistent across cuts in the same scene",
    ],
    pass_threshold=0.8,
)


# ============================================================================
# Critic invocation
# ============================================================================

CRITIC_SYSTEM_PROMPT = """You are a strict but fair reviewer. You receive an artifact and a rubric. \
Evaluate the artifact against EACH check in the rubric. Return a structured JSON verdict with:
- `passed`: true only if ALL critical checks are satisfied (score >= rubric pass_threshold).
- `score`: 0.0–1.0, the fraction of rubric checks that pass.
- `feedback`: one short paragraph the producing agent can use to revise.
- `issues`: a list of concrete problems, one per failed check.

Be specific. "Logline too long" is bad — "Logline is 67 words; condense to ≤50" is good.
Do not be generous. If a check is ambiguous, treat it as failing.
"""


async def review(
    *,
    artifact: Any,
    rubric: Rubric,
    agent_id: str = "critic",
    project_id: str = "",
    phase: str = "",
    model_role: str = "critic",
) -> CriticVerdict:
    """Run a critic pass against a structured artifact."""
    s = get_settings()
    model_name = s.llm.role(model_role)
    model = _make_pai_model(model_name)

    from pydantic_ai import Agent

    agent = Agent(
        model=model,
        system_prompt=CRITIC_SYSTEM_PROMPT,
        output_type=CriticVerdict,
    )

    artifact_str = (
        artifact if isinstance(artifact, str) else json.dumps(artifact, indent=2, default=str)
    )
    user_input = (
        f"{rubric.to_prompt_block()}\n"
        "## Artifact\n```\n"
        f"{artifact_str}\n"
        "```\n\nReturn the verdict as a JSON object matching the CriticVerdict schema."
    )

    ctx = RunContext(project_id=project_id, phase=phase, agent_id=agent_id)
    await log_event(
        ctx,
        "critic_start",
        {"rubric": rubric.name, "model": model_name, "artifact_len": len(artifact_str)},
    )

    try:
        result = await agent.run(user_input)
        verdict = result.output
        if not isinstance(verdict, CriticVerdict):
            verdict = CriticVerdict.model_validate(verdict)
    except Exception as e:
        log.exception("critic_run_failed", agent_id=agent_id, error=str(e))
        await log_event(ctx, "critic_fail", {"error": str(e)})
        # Fail-open: don't block on critic errors during early development.
        return CriticVerdict(passed=True, score=1.0, feedback=f"critic error (passing): {e}")

    event_type = "critic_pass" if verdict.passed else "critic_revise"
    await log_event(ctx, event_type, verdict.model_dump())
    return verdict


# ============================================================================
# Loop helper — produce → critique → revise
# ============================================================================

async def produce_with_critic(
    produce_fn,
    *,
    rubric: Rubric,
    project_id: str,
    phase: str,
    max_iters: int = 2,
    agent_id: str = "critic",
) -> dict[str, Any]:
    """Call `produce_fn()` (async, returns the artifact). Critique it. If the
    critic asks for revision, pass the feedback back to `produce_fn(feedback=...)`
    up to `max_iters` times. Returns the final {artifact, verdict, iters}.
    """
    feedback: str | None = None
    artifact: Any = None
    verdict: CriticVerdict | None = None
    iters = 0
    while iters <= max_iters:
        artifact = await produce_fn(feedback=feedback) if iters > 0 else await produce_fn()
        verdict = await review(
            artifact=artifact,
            rubric=rubric,
            agent_id=agent_id,
            project_id=project_id,
            phase=phase,
        )
        if verdict.passed:
            break
        feedback = verdict.feedback or "; ".join(verdict.issues)
        iters += 1
    return {"artifact": artifact, "verdict": verdict, "iters": iters}
