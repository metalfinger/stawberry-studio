# Paused overnight run — resume instructions

> **Update, 23 Sep — read this first.** A blind review of the eight "accepted" frames rejected all
> eight (my scores 0.90–0.93, blind scores 0.19–0.66). Story 1 is at **0 of 11** independently
> accepted, not 8 of 11. See the reassessment at the end of `autoloop/JOURNAL.md` and the `open`
> list in `state.json` for what to fix before generating anything else. The store is also backed
> up outside git at `~/Documents/Strawberry-Backups/icehead-2026-09-23-reviewed.strawberry.zip` — the
> SQLite store is gitignored, so on another PC restore from that archive rather than a checkout.

Paused 22 Sep 2026, ~06:15 IST, by Hiren's request to conserve Claude usage. Nothing is at risk:
all work is committed and pushed to `origin/lab/agent-portability` (latest `60e5d18`). The store,
the harness code, and the journal all persist exactly as left.

## To resume

Just run `/loop` again with the same prompt that has been driving this all night:

> Continue the overnight Strawberry Studio run. Read AUTOLOOP.md and autoloop/state.json first —
> they hold the goal, the three real dreams, the budget ceiling and the hard stop. Advance the
> current story one meaningful step per iteration (bible, breakdown, assets, sheets, cuts,
> evaluate, repair, sequence), spending credits only inside policy. Evaluate every take properly:
> crop every subject, answer every question, check hands and the style contract token by token.
> Run a blind sub-agent evaluator on every third take. When the harness cannot express something a
> dream needs, change the harness — engine, tests, HARNESS.md and the engram runbook — and record
> the failure class. Append to autoloop/JOURNAL.md and update autoloop/state.json every iteration,
> and commit. Stop generating if the Higgsfield balance falls below the hard stop.

Or just say "continue the overnight run" / "pick up where you left off" — the state files carry
everything a fresh session needs; this file is the pointer to them.

## Exactly where it stopped

**Story 1 of 3 — "The ice head"** (Stiles #047, 1898, DreamBank; woodblock/linocut). Project
`5b0eccc3-70a6-491b-b91d-13b54474d022` in `autoloop/store/`.

8 of 11 cuts accepted and selected, all against the corrected style bible:

| # | Cut | Score |
|---|---|---|
| 1 | The laboratory | 0.93 |
| 2 | Talking by the autoclave | 0.91 |
| 3 | She excuses herself | 0.90 |
| 4 | At the far end | 0.91 |
| 5 | She returns | 0.90 |
| 6 | Standing naturally | 0.90 |
| 7 | The block | 0.91 |
| 8 | The first channels | 0.90 |
| 9 | Angles round away | **generated, not yet evaluated** — media `c54fee12` |
| 10 | The horse's head | not started |
| 11 | She stands, still | not started (carries `match_frame` back to cut 1) |

**Immediate next steps**, in order:
1. Evaluate cut 9 ("Angles round away") — media already generated at
   `autoloop/store/media/6fff78fecf8edbc5de41579702fc24cba60a28b10a1f352c3354b8d875cfaeed.png`.
   Crop, count tones in the ice against 2-3 controls of comparable ink density (see HARNESS.md
   §4b), check `viewpoint` and `undeclared` like every cut since iteration 5.
2. Generate and evaluate cut 10, "The horse's head" — the frame the whole dream exists for. Use
   `base_from` pointing at "The block" (100fcdbf…), not the previous cut, so the form doesn't
   drift — see the chaining rule added iteration 5.
3. Generate and evaluate cut 11, "She stands, still" — declares `match_frame` back to cut 1 ("The
   laboratory"); check `sequence` for `match_frame_mismatch` once it's in.
4. Run `s.sequence(project_id)` for the full edit-level review once all 11 are in.
5. Then: story 2 ("The half-built effigy", risograph, Lawrence #193) and story 3 ("The departure
   board", sumi ink, Stiles #068) — neither has been started. `AUTOLOOP.md` has both dreams and
   their stress axes; follow the same nine-step sequence `build_icehead.py` used as a template
   (`autoloop/build_icehead.py` — bible, breakdown, assets, sheets with `autoloop/sheets.py`, cuts
   with `autoloop/cuts.py`, evaluate, repair, sequence).

## Budget

317 → 287.1 credits spent (all inside the 120-credit ceiling, nowhere near the 200 hard stop).
Check with `higgsfield account status` at the start of the next session.

## What changed in the harness tonight (full detail in JOURNAL.md)

20+ new checks were added, each because a real frame failed in a way nothing had thought to ask:
`undeclared` (catches invented figures/objects), `not_visible` (a fact can be true and
unseeable — scale-aware), `viewpoint` (catches pasted-on elements with the wrong horizon),
`continues`/`base_from` (chains a transformation from its first frame, not its predecessor,
so drift doesn't compound), `matches_sheet`/`inherited_defect` (a fault copied from a sheet is
routed to the sheet, not the frame that inherited it), `palette_conflict`/`sheet_unreferenced`,
prompt-scoped take budgets, rubric-drift detection, and the counting instruction for style tokens
phrased as prohibitions (with the "controls must be comparable" correction).

Two local pixel scorers were built and deliberately deleted after testing — both failed for the
same structural reason (an ink-to-paper boundary or a fixed patch grid dilutes a real, small
fault). That negative result is recorded in HARNESS.md §4b so nobody rebuilds them.

A blind sub-agent evaluator, run twice tonight with only the image and the question list, caught
me passing a frame at 0.89 that was actually a 0.40 — both times on the same axis (style tokens
phrased as prohibitions, answered generously). That is the single most important finding of the
night for the harness's own credibility.
