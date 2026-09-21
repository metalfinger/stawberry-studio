# Portable workflow checkpoint

Updated 2026-09-21. This file supersedes host restrictions and stale task status
in earlier migration documents for the portable-workflow extension.

- [x] Shared host-neutral JSON tool catalogue and dispatcher over Studio.
- [x] CLI tools/call commands and optional local stdio MCP server.
- [x] Generic entry point and Claude Code instructions using the same contracts.
- [x] Full-context prompt/reference and resume procedure, independent of story.
- [x] Preserve existing viewer, provider abstraction and production history.
- [ ] Persist autonomous run policy with budget/retry limits and honest unverified
      take continuation, separate from human-confirmed visual facts.
- [ ] Replace historical story-specific shell runners with generic resumable
      operations and durable provider-submission handoffs.
- [ ] Structured prompt-binding validator and generation-packet API.
- [x] Optional evaluator records (`evaluate` / `evaluations` / `facts`; append-only,
      bound to review context, never review status). Bounded repair execution remains
      open.
- [ ] Fresh production and interrupted-run handoff in actual Claude Code and Codex.

The dream project completed 22 generated cuts. That demonstrates a production
example, not general unattended execution. The old helper inferred depicted
assets from intended requirements and must not be reused for new productions.
No claim of automated visual correctness or tested cross-host UI integration.

Verification: 177 offline tests pass, including a real stdio MCP client/server
roundtrip and shared-store revision-conflict handling. Scoped Ruff and frontend
production build pass (existing legacy bundle-size warning retained). No paid
generation was submitted. The MCP SDK is an optional pinned dependency; its
roundtrip test skips on installations without that extra.
