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

## The three — real dreams, three non-realistic styles

Real reports only (DreamBank, UCSC — Domhoff & Schneider, CC BY-NC-SA 4.0). Invention
produces the dream you think dreams are like; real reports carry a weirdness nobody would
make up. All three styles are deliberately **non-realistic** — Nine O'Clock's whole failure
was drifting to photoreal-under-a-filter, so every style here has to be something a
photograph cannot be mistaken for.

### 1 · The ice head — Stiles #047, 18 March 1898
Talking to a young woman by the autoclave. She excuses herself, walks to the end of the
room and returns *"with an irregular block of glittering ice set upon her shoulders in
place of her head."* She stands before him naturally, without speaking. The ice melts and
trickles, channels form, angles round away — *"the sculpturing went on rapidly"* — and it
becomes *"a beautifully molded head of a horse; eyes, ears, and nostrils faithfully carved
out in the clearest ice."*
**The turn:** the melting is not destruction, it is carving.
**Style — woodblock / linocut:** flat black ink, hard carved edges, white gouged
highlights, visible block grain, one cold spot colour, no gradients anywhere.
*Chosen because the medium rhymes with the dream: the image is made by carving.*
**Stresses:** hard-edged flat ink (models default to soft rendering), a strict two-colour
palette, and a transformation held across frames without a cut.

### 2 · The half-built effigy — Lawrence #193, 20 November 2009
A future version of his home town, *"flatter, wider and larger"*. In the distance
*"a gigantic carnival effigy being constructed of a tubby male character… It's enormous,
lying on its side, half built. It must be about as high as a twenty story building.
There's going to be a great celebration, but I don't know what about."*
**The turn:** the scale resolves, and then the purpose refuses to.
**Style — risograph screen print:** two or three flat spot inks, coarse halftone dots,
deliberate misregistration, paper show-through, no blending.
**Stresses:** a limited **spot-colour** palette rather than monochrome; monumental scale
against a human figure; and misregistration as a declared style token — the exact class of
token generative models silently ignore.

### 3 · The departure board — Stiles #068, 1905
A railway announcement board fixed to his kitchen wall: twenty black slats, all blank but
one, bearing *"the strange word zikery."*
**The turn:** a station's apparatus in a kitchen, announcing a word that is not a word.
**Style — sumi ink and wash:** single loaded brush, wet-into-wet bleed, enormous negative
space, one dry-brush accent, paper fibre visible.
**Stresses:** **legible text in frame** — the weakest domain in every published benchmark,
and the one thing the harness has never once been asked to check. "zikery" has to be
readable and correctly spelled, twenty slats have to be countable.

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
