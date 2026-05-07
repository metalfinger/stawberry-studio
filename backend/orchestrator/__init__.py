"""
Strawberry Studio orchestrator — agent runtime, tool registry, event log.

Public API:
    from backend.orchestrator import load_agent, run_agent, RunContext, log_event

The orchestrator wraps `pydantic_ai.Agent` with:
- declarative agent specs loaded from backend/agents/specs/*.yaml
- a project-aware tool registry
- structured event logging to the agent_events table
- hookable critic loops

This package is the Phase 3 successor to backend/agents/{berry,planner,...}.py
which used Google ADK. New code lives here; old factories stay alive in parallel
during the migration.
"""
from backend.orchestrator.agent_spec import AgentSpec, list_agent_ids, load_agent_spec
from backend.orchestrator.critic import (
    ASSETS_RUBRIC,
    BLUEPRINT_RUBRIC,
    BRIEF_RUBRIC,
    CONTINUITY_RUBRIC,
    CriticVerdict,
    Rubric,
    produce_with_critic,
    review,
)
from backend.orchestrator.events import RunContext, log_event, replay_run
from backend.orchestrator.pipeline import (
    fork_artifact,
    freeze_and_advance,
    get_artifact,
    get_pipeline_state,
    list_versions,
    mark_phase_in_progress,
    save_artifact_version,
)
from backend.orchestrator.runner import build_pai_agent, run_agent, stream_agent

__all__ = [
    "AgentSpec",
    "load_agent_spec",
    "list_agent_ids",
    "RunContext",
    "log_event",
    "replay_run",
    "build_pai_agent",
    "run_agent",
    "stream_agent",
    "CriticVerdict",
    "Rubric",
    "review",
    "produce_with_critic",
    "BRIEF_RUBRIC",
    "BLUEPRINT_RUBRIC",
    "ASSETS_RUBRIC",
    "CONTINUITY_RUBRIC",
    "get_pipeline_state",
    "get_artifact",
    "list_versions",
    "save_artifact_version",
    "fork_artifact",
    "freeze_and_advance",
    "mark_phase_in_progress",
    # Phase 4.5
    "compile_continuity_bible",
    "get_continuity_bible",
    "render_bible_prefix",
    "register_image",
    "search_references",
    "get_anchors",
    "get_style_anchor",
    "set_style_anchor",
    "pick_for_cut",
    "compile_prompt",
    "review_cut",
    "ContinuityScore",
]


from backend.orchestrator.continuity import (
    compile_continuity_bible,
    get_continuity_bible,
    render_bible_prefix,
)
from backend.orchestrator.picker import pick_for_cut
from backend.orchestrator.prompt_dsl import compile_prompt
from backend.orchestrator.references import (
    get_anchors,
    get_style_anchor,
    register_image,
    set_style_anchor,
)
from backend.orchestrator.references import (
    search as search_references,
)
from backend.orchestrator.vision_critic import ContinuityScore, review_cut
from backend.orchestrator.context_bundler import CutContext, bundle_cut_context, render_context_summary
from backend.orchestrator.asset_bundler import AssetContext, bundle_asset_context
from backend.orchestrator.plans import (
    Plan,
    PlanItem,
    make_plan,
    make_item,
    save_plan,
    load_plan,
    update_plan_status,
    update_item_status,
    fork_plan_for_refinement,
    list_plans_for_cut,
)
from backend.orchestrator.cut_planner import plan_compose_cut
from backend.orchestrator.cut_executor import execute_plan, ExecuteResult
from backend.orchestrator.references_v2 import (
    generate_identity_card,
    generate_pose,
    get_or_generate as get_or_generate_reference,
    list_references,
    get_identity_card,
    standard_turnaround_set,
    precache_standard_turnaround,
)
from backend.orchestrator.cut_composer import (
    ComposeResult,
    ComposeStep,
    compose_cut,
    stream_compose_cut,
)
