"""
Declarative agent specs.

Each agent is described by a YAML file in backend/agents/specs/<id>.yaml:

    id: berry
    role: "Creative Producer"
    model_role: planner_model        # resolved via Settings.llm.role()
    system_prompt_path: prompts/berry.md
    tools: [get_brief, update_brief, complete_briefing]
    output_schema: null              # optional Pydantic class name for structured output
    critics: []                      # optional list of critic agent ids

The prompt body lives next to the spec at backend/agents/prompts/<id>.md and
may use `{var}` placeholders that get filled at run time from RunContext.
"""
from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field

_BACKEND_DIR = Path(__file__).parent.parent
_SPECS_DIR = _BACKEND_DIR / "agents" / "specs"
_PROMPTS_DIR = _BACKEND_DIR / "agents" / "prompts"


class AgentSpec(BaseModel):
    """Declarative spec for one agent."""

    model_config = ConfigDict(extra="ignore")

    id: str
    role: str = ""
    model_role: str = "default"  # logical role -> Settings.llm.role(model_role)
    system_prompt_path: str = ""  # path relative to backend/agents/
    tools: list[str] = Field(default_factory=list)
    output_schema: str | None = None
    critics: list[str] = Field(default_factory=list)
    description: str = ""

    def load_prompt(self) -> str:
        """Read the prompt .md file referenced by this spec.

        `system_prompt_path` is resolved relative to backend/. Examples:
          - "agents/prompts/berry.md" → backend/agents/prompts/berry.md
          - "/abs/path/x.md" → absolute (use sparingly)
        """
        if not self.system_prompt_path:
            return ""
        p = Path(self.system_prompt_path)
        path = (p if p.is_absolute() else (_BACKEND_DIR / p)).resolve()
        if not path.exists():
            raise FileNotFoundError(f"Prompt file not found: {path}")
        return path.read_text(encoding="utf-8")


def load_agent_spec(agent_id: str) -> AgentSpec:
    """Load `<agent_id>.yaml` from backend/agents/specs/."""
    path = _SPECS_DIR / f"{agent_id}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"Agent spec not found: {path}")
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return AgentSpec.model_validate(data)


def list_agent_ids() -> list[str]:
    if not _SPECS_DIR.exists():
        return []
    return sorted(p.stem for p in _SPECS_DIR.glob("*.yaml"))
