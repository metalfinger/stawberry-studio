# Strawberry: portable filmmaking workspace

Give this repository to a local tool-capable assistant with your story, any
identity/style references, and the desired scope. Codex, Claude Code and other
hosts use the same engine. The host performs creative reasoning; Strawberry
persists production facts and exact execution records.

## Setup

Run `./install-studio.sh` once, then `./studio.sh --port 8788` for the viewer.
Use the absolute checkout path when the host starts in another directory.
Read `.agents/skills/strawberry-production/PLAYBOOKS.md` for creative roles and
`workflow/PORTABLE_WORKFLOW.md` for the portable execution procedure.

Shell-capable hosts discover operations with:

```sh
venv/bin/python -m backend.studio tools
venv/bin/python -m backend.studio call projects -
```

The second command takes `{}` on stdin. `call OPERATION FILE.json` also works.
Schemas, validation and persistence are shared with the existing service.
Existing CLI commands remain available for export, model discovery and workers.

## MCP hosts

Install the optional transport using
`venv/bin/python -m pip install -r requirements-studio-mcp.txt`.
Configure a local stdio MCP server with these fields, replacing CHECKOUT with
the absolute path. Hosts differ in where they store this configuration.

```json
{
  "mcpServers": {
    "strawberry": {
      "command": "CHECKOUT/venv/bin/python",
      "args": ["-m", "backend.studio.mcp_server", "--home", "CHECKOUT/.strawberry"],
      "env": {"PYTHONPATH": "CHECKOUT"}
    }
  }
}
```

Call `strawberry_tools`, then `strawberry_call(operation, arguments)`.
Claude Code can use this configuration in its project MCP settings; Codex can
register the same command/arguments/environment in its MCP settings. Neither
requires another conversational model inside Strawberry. Shell access is the
fallback when a host cannot use MCP.

Higgsfield must be authenticated separately in the host. Its connector submits
images; Strawberry stores the frozen recipe and reconciles the receipt. The
MCP server does not install, authenticate, or impersonate that connector.

## Evaluations

The engine records evaluations as observations beside human review — never as review
status. `call facts` turns a cut's declared facts into questions the host answers with
its own vision; `call evaluate` records the answers, a judge score or a pairwise choice;
`evaluate-local MEDIA_ID` records the deterministic copy-paste check (perceptual hashes
against sibling cuts and the image's own references; Pillow only, no model). Scorers
that need torch — subject-cropped identity similarity, cross-panel scene diversity —
are planned as an optional extra and are not installed by the base runtime.

## Autonomous mode

Set `policy.autonomous` (and a cost ceiling) on the project, then run
`venv/bin/python -m scripts.autopilot step PROJECT_ID --home STORE`. The engine approves,
generates, collects, checks and selects within policy; the host answers the two tasks it
hands back — evaluate a take, or write the next recipe. See `PLAYBOOKS.md`.

## Current limits

The portable transport and operating instructions are implemented. A real
Claude Code session handoff has not yet been exercised. Budget-enforced run policies and automated repair remain pending; evaluation is
recorded, not enforced.
Do not use `scripts/auto_storyboard_run.sh` or `finalize_connector_cut.sh` for
new projects: they are historical dream-run helpers with story-specific logic
and unverified depiction assumptions.

Use `PORTABILITY_STATUS.md` for current portable-workflow scope. Older dated
production notes describe individual experiments, not current task state.
