# Overnight autonomous run — three stories through the harness

Started 21 September 2026, on Hiren's instruction to run unattended and have outputs ready
by morning. This file is the durable state: any session picking this up should read it
first and continue from `autoloop/state.json`.

## Goal

Carry **three different stories, in three deliberately different visual styles**, through
the whole Strawberry Studio pipeline — brief → breakdown → assets → sheets → cuts —
with the evaluation harness on, in autonomous mode. The point is not the three films. The
point is to find out **where the harness fails on material it was not built around**, and
to fix it. Nine O'Clock was charcoal monochrome, one adult, one child, one journey. If the
harness only works on that, it is not a harness.

## The three, chosen to stress different axes

| # | Story | Style | What it stresses that Nine O'Clock did not |
|---|---|---|---|
| 1 | **The Lantern-Keeper's Last Night** — an old woman climbs a lighthouse for the last time before it is automated; the light is her whole life | Woodblock print: flat inks, hard edges, one spot colour, no gradients, visible grain of the block | A style generative models resist hardest (they default to soft rendering); a **limited palette with one accent**; night interiors and exteriors; machinery |
| 2 | **Small Hours** — a night-shift nurse and a patient who cannot sleep play a wordless game across four nights | Gouache and cut paper, warm domestic colour, soft edges | **Colour** rather than monochrome; two characters holding a two-hander; repetition-with-variation across four near-identical settings — the copy-paste trap by design |
| 3 | **The Surveyors** — two figures map a building that keeps changing behind them | Hard graphite and blueprint line, cold, technical, with legible drawn annotation | **Text and symbols in frame** (the weakest domain in every published benchmark); architecture that must stay coherent while deliberately changing; two figures at a distance |

Each: 5 scenes / 8–12 cuts, 16:9, one style bible, 3–5 assets.

## Budget, and the hard stop

- Higgsfield balance at the start: **317 credits**. `gpt_image_2_5` with references has been
  costing **1 credit per image**.
- Ceiling for the whole run: **120 credits**. If the balance drops below **200**, stop
  generating, finish evaluating what exists, and write up.
- Per project: `max_takes_per_cut: 2`, `credit_ceiling_per_take: 2`, `autonomous: true`,
  `min_take_score: 0.6`.
- Never submit without a prepared, policy-approved recipe. Never auto-retry a paid failure.

## Method per story

1. Write the brief and capture it verbatim as a source.
2. Style bible **first** — tokens, palette, lighting rules, exclusions — before any review.
   (Nine O'Clock's bible was written after the fact and staled every review.)
3. Breakdown: scenes → shots → cuts with beat, performance, sound, camera, screen
   direction, and `match_frame` wherever two frames must cut together.
4. Assets with consistency tokens and **locks** — the continuity attributes that must never
   drift. Name them explicitly; they are what the gate defends.
5. Sheets first, evaluated against the style contract before any cut is built on them.
6. Cuts: references from `candidates`, prompt quoting every lock, depth cap 2, no chaining.
7. `autopilot step` → answer `evaluate` tasks (crop every subject, answer every question,
   check hands) → write `prepare` recipes from `repair` → repeat until all accepted.
8. A **blind evaluator** on at least every third take and on every take reused as a
   reference. Its free note is where new failure classes appear.
9. `sequence` before calling the story done.

## Standing instruction

**When the harness cannot express something a story needs, change the harness, not the
story.** Every such change goes into `HARNESS.md` with the failure class it belongs to,
and into the engram runbook. That is the actual deliverable.

## Log

See `autoloop/state.json` for machine state and `autoloop/JOURNAL.md` for what happened
and what it taught.
