"""
Strawberry Studio agents package.

Agents are declared via:
  backend/agents/specs/<id>.yaml     — model + tool grants + I/O schema
  backend/agents/prompts/<id>.md     — system prompt template

The runtime loader is `backend.orchestrator.agent_spec.load_agent_spec`.
The runner is `backend.orchestrator.runner.stream_agent`.

This file intentionally exports nothing. The legacy google.adk factory
functions (create_berry_agent, create_planner_agent, …) lived here
once and were deleted when the chat WebSocket migrated entirely to
pydantic-AI. New code should call `chat_bridge.stream_turn` from
`backend.orchestrator` rather than ever reaching into this package.
"""
