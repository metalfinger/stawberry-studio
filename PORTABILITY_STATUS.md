# Portable workflow checkpoint

Updated 2026-09-21. This file supersedes host restrictions and stale task status
in earlier migration documents for the portable-workflow extension.

- [x] Shared host-neutral JSON tool catalogue and dispatcher over Studio.
- [x] CLI tools/call commands and optional local stdio MCP server.
- [x] Generic entry point and Claude Code instructions using the same contracts.
- [x] Full-context prompt/reference and resume procedure, independent of story.
- [x] Preserve existing viewer, provider abstraction and production history.
- [x] Autonomous run policy (`policy.autonomous`, `min_take_score`, `max_takes_per_cut`,
      `credit_ceiling_per_take`, `allow_unknown_cost`, `require_stranger`) with the
      evaluation gate on every take, evidence-backed assistant reviews kept distinct from
      human ones, and `scripts/autopilot.py` driving generate → evaluate → gate → select.
- [ ] Replace historical story-specific shell runners with generic resumable
      operations and durable provider-submission handoffs.
- [x] Canonical creative vocabulary (beat, performance, sound, bible, identity locks)
      with typed validation and advisory readiness warnings.
- [x] Generation depth on every image, full lineage, depth-cap warning at prepare.
- [x] `candidates` — reference retrieval scored against a cut, with state flags and the
      chaining decision.
- [x] `evaluate-local` copy-paste check; `export_benchmark` (ViStoryBench layout).
- [ ] Optional eval extra (subject-cropped identity similarity, cross-panel diversity).
- [x] Prompt-binding validator: in autonomous mode `prepare` refuses a prompt that does not
      quote every lock of every asset in scope. Generation-packet API remains open.
- [x] Evaluator records (`evaluate` / `evaluations` / `facts`) and bounded repair:
      `repair CUT_ID` proposals, a per-cut take budget, definitive `provider_rejected`
      failures with `abandon`, and `reference_mode: text` for a likeness a provider refuses.
- [ ] Fresh production and interrupted-run handoff in actual Claude Code and Codex.

The dream project completed 22 generated cuts. That demonstrates a production
example, not general unattended execution. The old helper inferred depicted
assets from intended requirements and must not be reused for new productions.
No claim of automated visual correctness or tested cross-host UI integration.

Probe of the real Nine O'Clock production and the live autonomous re-cut of eight of its
frames: `PROBE_2026-09-21_nine_oclock.md`. Why the first evaluation pass missed what it
missed, and the contracts that followed: `POSTMORTEM_2026-09-21_evaluation_misses.md`.

Verification: 142 studio tests pass, including a real stdio MCP client/server
roundtrip and shared-store revision-conflict handling. Scoped Ruff and frontend
production build pass (existing legacy bundle-size warning retained). No paid
generation was submitted. The MCP SDK is an optional pinned dependency; its
roundtrip test skips on installations without that extra.
