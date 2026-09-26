# Dream chat harness: the root-fix plan

The single source of truth for rebuilding the dream chat harness from its root. Read this first in any new
session; update the status table and the log at the end of every step.

## The aim

Every picture of a dream right on the first take, because the preparation is right. The harness is the
preparation: the breakdown into dream, sequence, scene, shot and cut; how each cut connects to its shot, scene,
the sketches, the cuts before it and its in-between pictures; the camera and every other parameter; and from all
of it, the best prompt for that cut with the best references attached, each named in the prompt with a clear
instruction. Drawing the picture is the last step. Jev is the fast judge of the decisions inside the preparation.
General film-making rules apply to every dream; nothing is patched for one dream.

## Standing rules for this work

1. **No new pictures** until the harness passes its evals. Tests use prompts rebuilt from saved dreams
   (`plan.ts`), fake-picture simulations (`simulate.ts`, `evals/replay.ts` with `DREAMCHAT_PROVIDER=fake`) and
   labelled sets. Paid drawing needs the owner's go-ahead.
2. **Each step has its eval written before it is built**, and is not done until the eval passes and an
   independent review confirms it serves its purpose.
3. **Fix the mechanism, never the dream.** Every failure is classified against the root causes first; a fix adds
   or corrects a general rule; no incident-specific regex or word list without a test over every saved dream.
4. **Behind a switch** until measured; the default stays today's behaviour until the step passes.
5. **Tests green, typecheck clean** on every commit; commit prefixes `feat:`/`fix:`/`test:`/`docs:`.
6. **Report every finished step to the owner:** what improved, the tests run and their results, with a push
   notification. Otherwise keep going step by step until the whole harness is ready.
7. **Improve from every test.** When a step's tests or review find a gap or a better way, fix it (as a general
   rule) before moving on, and log what was found and what changed.
8. **Money:** $21 is left and there is no more after it. Spend only where a picture is the only way to prove a
   step (planned: about $3 after S4, about $3 after S5, about $10 for S10), redrawing only the moments that failed
   for that reason, old against new, judged by the owner. Record every cost in the log.

## The system being built

One **cut sheet** per cut is the spine everything is assembled from:

| Layer | What it holds | Where |
| --- | --- | --- |
| Vertical: the tree | dream -> sequence -> scene -> shot -> cut; each value inherited from the level above, with where it came from (said, chosen, read, derived, guessed, default) | `tree.ts` (built; only the panel reads it today) |
| Horizontal: the story record | each person, place and thing's look before any change, typed changes, and at each cut who and what is in view, how each looks now, who holds what | `record.ts` (shadow; being wired in) |
| Relations | each cut's relation to earlier cuts (same setup, same side, reverse, new place, jump) and its in-between pictures | `continuity.ts` |
| Tags | shot role (pov, over-the-shoulder, insert, master, two-shot, reaction, wide), camera relation, change, held thing, crowd, animal, vehicle, weather, flight/water/transformation | to build from the three above |
| Checks (Jev layer 2) | only the questions a cut's tags call for, from a library of film-making and continuity rules, each question with its labelled set | to build |
| Assembly | `assembleCut(sheet)`: the prompt, each fact once, and the references (sketches, earlier cuts, in-between pictures, the grey mock-up only when its tags say it helps), each with its instruction | to build; replaces `framePrompt`'s block joining |
| Drawing, then judging | fal draws; the judge (Claude, for now) checks the picture | exists |

## Steps and status

| # | Step | Status | Eval that proves it |
| --- | --- | --- | --- |
| S0 | Eval foundation: a prompt-case set from the person's 122 verdicts and notes, a runner that rebuilds prompts from saved dreams and scores them, the free simulation corpus as regression | done: reviewed, fixed, merged (26 Sep) | Every noted fault has a case; the runner reproduces today's failures. Baseline: 6 of 33 counted fault cases met (all six guards against editing the picture before), 36 of 36 passing cases met (below) |
| S1 | Story record carries state (water, suitcase, who holds what, presence) into continuity, in-between pictures and prompts | merged behind DREAMCHAT_RECORD=on (off by default); last fix pending: the place question | The S1 cases pass (`--step S1`: library-2 m5/m9 water, snow-train m4/m5, snow-train-2 m1, lighthouse-fresh m13, orchard m7; library-1 m3/m5, library-3 m7, snow-train-2 m5/m7 need a model step); no regressions on the corpus |
| S2 | Stop stand-in checks deciding: the pre-draw prompt check and storyboard check only log | not started | No moment held or reworded; corpus unchanged otherwise |
| S3 | The cut sheet: tree (vertical) + record (horizontal) + relations + tags, one per cut | not started | Every input the prompt needs comes from the sheet; no fact computed in two places |
| S4 | Camera rules and shot roles: the scene's line, a reverse angle turns the room (what is now left, right, behind), point-of-view shots show at most hands, vehicle screen direction, same setup means the same camera | not started | The S4 cases pass (`--step S4`: snow-train m2 reverse and m3 seat, snow-train-2 m2 same setup, lighthouse-fresh m12 heading, lighthouse-first m3, night-market m2, library-1 m4/m5, orchard m4 hands and m7 legs; lighthouse-fresh m10 needs a new floor plan) |
| S5 | References and variants: one image per subject; in-between pictures only when an edit carries several changes; variants kept and reusable; the grey mock-up as a reference chosen by tag | not started | The S5 cases stay met or pass (`--step S5`: never editing a picture from another side; library-1 m5 wall); its hypotheses (mock-up only, one image per subject) are for a paid check, not proven here |
| S6 | `assembleCut`: prompt and references from the sheet, each fact once, action as visible facts; retire the regex clean-ups one by one | not started | All S0 cases pass; word-level diff reviewed on every saved dream |
| S7 | Jev layer 2: checks routed by tags, a question library from the film rules, a labelled set per question; a check may hold a picture only if it predicts pictures | not started | Each question meets its bar on its labelled set |
| S8 | Listening: every reply checked against its move; major picture gaps asked openly, minor ones imagined and marked; the retelling ends with the moments | not started | Listening cases on the simulated dreams pass |
| S9 | Record of what was drawn, and staleness; sequences and look keys | not started | Stale pictures found on saved dreams |
| S10 | Only after S0-S9 pass: a paid benchmark on the five replay dreams, judged by the owner | waiting | Owner's first-take rate against today's |

## Where things are

- Evidence: `evals/story-pictures.json` (62 pictures, the owner's verdicts and notes), `evals/paired-verdicts.json`
  (20 moments drawn three ways), `evals/picture-judge.md`, `evals/benchmark.json` + `evals/replay.ts` (five dreams
  replayed from the style choice), `evals/paired.ts`.
- Findings so far: the owner judged 36 of 62 right on the first take. Guiding a picture by the grey mock-up, by an
  edit of the picture before, or by sketches alone made no clear difference (10, 11, 9 of 20), but in 18 of 20
  moments at least one of three draws was right, and a judge keeping the best of three got 16 of 20. The faults the
  owner marked most: state not carried from the picture before, the room not turning when the camera turns,
  point-of-view shots drawn in third person, the dreamer changing, proportions in edits.
- The tree's own design: step 1 was designed in full; steps 2-8 of that design are folded into S3-S9 above.
- `docs/cut-sheet-map.md`: every input a cut's prompt needs, where it is worked out today (often in 3-6 places), what
  the tree already holds, the proposed `CutSheet` and `assembleCut`, and the safe order for S3 and S6.
- `docs/rules.md`: 46 general rules from two days of dreams (film grammar, continuity, the image model's habits,
  references and ghosts, prompt writing, listening, measuring), each with evidence, status and how the system holds
  it, ranked by what the owner's verdicts weigh; and the contradictions to resolve.
- S0, the prompt cases: `evals/prompt-cases.json`, 85 cases. 49 from faults the owner noted: 33 counted (8 of them
  need a model to make something again, a floor plan or a reading of what lasts, since the fact is written nowhere
  in the saved dream), 9 hypotheses (seen in one drawing while another with the same first image was right), 5 the
  image model's alone, 2 set aside (the note disagrees with the dream as told); 36 moments the owner called right,
  one guard each. Each case keeps the owner's verdict on every drawing of its moment and the drawings its fault was
  seen in; a fault seen only in the edit of the picture before is the first image's. Every counted fault has a
  check on the images or floor plan, or a question Jev must answer no about the faulty fact, so rewording the fault
  and adding the right fact beside it does not meet it.
  `bun --env-file=$HOME/.config/strawberry/dreamchat.env run evals/prompt-cases.ts --label <name> [--against
  <name>] [--step S4] [--only <case> …] [--show] [--live]` rebuilds each moment exactly as `plan.ts` does
  (`rebuild`, under the environment's switches) from the frozen dreams in `evals/sources/<session id>.json`,
  runs its checks, asks Jev (jev-1.13.0 by name; answers cached by the model, the question as sent and the prompt)
  and writes `runs/prompt-cases/<label>.json` with the hash of the case file and of every dream it read;
  `--against` warns when two runs read different ones and lists every check and answer that moved.
- The frozen dreams: the ten real dreams and the five benchmark dreams, frozen by `evals/freeze-session.ts` with
  every field `rebuild` reads (`bun run evals/corpus.ts --verify`: each rebuilds as its saved conversation does,
  every picture). For the 62 drawn moments they also keep what was really sent: 15 of 62 prompts rebuild word for
  word and 620 of 699 paragraphs (the rest is code changed since); a rebuild takes every sketch and earlier
  picture as drawn, and 12 moments were drawn without one it now attaches (lighthouse-first m3/m6, night-market
  m1, heron m4, lighthouse-fresh m10, library-2 m5-m9 (the boat was never sketched), library-3 m7, snow-train-2 m7).
- S0, the corpus: `bun run evals/corpus.ts --label <name> [--against <name>] [--set benchmark] [--live]` rebuilds
  the frozen dreams (15 dreams, 115 moments, 25 in-between pictures), or with `--live` every saved conversation and
  the fake replays' (59 dreams, 411 moments, 66 in-between pictures on 26 Sep), and writes `runs/corpus/<label>.json`;
  `--against` writes what changed, picture by picture, each changed paragraph as the words that changed in it.
- Baseline (26 Sep, today's defaults), counted fault cases met per class: state_carried 0/9, presence 0/2, holding
  0/2, camera_turn_layout 0/6, pov 0/2, action 0/2, reference_conflict 6/9, proportion_or_paste 0/1; all 6/33. The
  six met are guards against editing the picture before across a move of the camera, which today's routing never
  does. Passing cases 36/36. Jev reads one concrete fact per question reliably and not joined, implied, absent or
  whole-prompt facts: every question is one fact, and answers within 0.1 of the bar are marked.

## Step evals, written before each step is built

- **S2 (checks only log).** Switch `DREAMCHAT_CHECKS=log`. On the five benchmark dreams and five other simulated
  dreams replayed with fake pictures (`evals/replay.ts`, `DREAMCHAT_PROVIDER=fake`), off against on: moments held,
  reworded, re-planned or left undrawn because of a check go to 0 with the switch on; every moment is drawn; the
  checks' readings are still logged for every moment (so S7 can label them); Jev calls per dream fall; the prompt
  cases and the corpus are unchanged apart from the reworded prompts that no longer happen (listed and explained).
  Review: that nothing a check found is lost, only no longer acted on.

## Where steps overlap (read before starting any step)

Work found in one step that belongs to, or touches, another. Keep this list current; nothing here may be dropped
between sessions.

| From | To | What |
| --- | --- | --- |
| S0 | every step | Frozen dreams have no pins, re-plans or corrections: each step also needs a live-flow check (S1's review found two faults only the live path shows). |
| S1 | S3 | `record.ts` renders English sentences (`nowAt`); the cut sheet should carry typed facts (who, part, now, held by, basis) rendered once at assembly. New word lists in S1 (FILLS, OPENS, STATE_VERB, NOT_THERE, SELF, TAKEN, HOLDS_NAME) overlap the implied-state reading and should give way to it. |
| S1 | S4 | Water level and boat height come from floor-plan heights (library-1 m5, library-3 m7 still fail on the mock-up's layout); a held thing in a through-the-eyes view is placed at its floor-plan spot instead of the hands; the "Nobody else is in the picture" line can list people who are. |
| S1 | S5 | Implied changes make no in-between picture of their own until S5 settles the owner's rule (one only when an edit carries several changes); the per-change in-between pictures from before remain for S5. `shutAway` closes anything opened when carried to another place (right for a suitcase, wrong for an umbrella or book). |
| S1 | S6 | `withoutWords` is another regex clean-up in frames.ts; S6 retires these. Text rendering bugs of the record land in the prompt until S6 builds it from the sheet. |
| S1 | S9 | The Strawberry production is written at `start`, before planning and the implied reading, so implied changes have no production coverage. |
| S2 | S7 | S2 makes the checks log only; their logged readings become S7's labelled sets. |
| S7 | S8 | Jev choice readings apply the confidence bar to the top label instead of summing labels that lead to the same action ("confirmed 0.55 + you_choose 0.45" read as unclear, 15 of 16 cases): fix in the Jev layer, measured by the S8 listening test. |
| S8 | S1 | 21% of "said" facts were never said, 481 of 574 in sketch profiles: the record's basis per clause (S1) and listening (S8) both own this; S8's fact check is the measure. |
| S8 | S8 | 135 of 326 explore-thread moves point at an older message than the one answered: a move-selection fault, not a reply fault. |
| best-of-takes branch | S5, S10 | Built, off by default (9371476), parked; touches session.ts; merge after S1 lands. |
| S3 | S6 | `docs/cut-sheet-map.md` lists every prompt input and where it is computed today; S6's `assembleCut` reads only the sheet S3 builds. |
## Known debt, by the step that clears it

Found in the S1 review (26 Sep) and left for the step it belongs to, so S1 stays one change.

- **S3 (the cut sheet).** `nowAt` writes English inside `record.ts` ("the suitcase is shut, in the grandfather's
  hands"); the record should hand typed facts to the sheet and the words be written once, at assembly. The
  production is written into Strawberry at the start, from the record as it is then, before what the moments imply
  is read, so its cuts lack the implied states the pictures are drawn with. `shutAway` shuts anything opened once it
  is carried to another place, so an umbrella or a book opened there would be closed too; the rule should be a
  typed fact about containers, not every "open".
- **S4 (camera rules).** A thing held in a view through the dreamer's eyes is placed at its floor-plan spot, not
  in the hands that hold it; and the "Nobody else is in the picture" line can stand beside a list of people who
  are in it.
- **S6 (`assembleCut`).** The record's new word lists (`FILLS`, `OPENS`, `STATE_VERB`, `NOT_THERE`, `SELF`,
  `TAKEN`, `HOLDS_NAME`, which has 'bowl' twice) overlap what the implied reading now reads with a model and Jev;
  each should be retired once the reading covers it. `withoutWords` in `frames.ts` is one more text clean-up to
  retire with the others.

## Open questions for the owner

- **Resolved (27 Sep):** Jev credits restored by the owner. Was: the Jev (TypeSafe) account ran out of credits; every Jev call returns 402
  billing_error. Every test that asks Jev (prompt-case questions, the implied-state reading's checks, listening
  scores, simulations) is stalled until it is topped up. Work that needs no Jev continues meanwhile.

- In `evals/paired-verdicts.json`, the sketches-only version of lighthouse-first m7 carries the same note as orchard
  m7 (about Tomas), on a picture rated right: probably typed on the wrong picture. Left as is until confirmed.

## Log

- 26 Sep: plan written. S1 building (story record into continuity and prompts). A keep-the-best-of-takes switch is
  being added, off by default, as a later safety net.
- 26 Sep: the keep-the-best-of-takes switch is built on branch `best-of-takes` (9371476; DREAMCHAT_TAKES=1 by
  default, unchanged; 2-3 takes drawn different ways, the judge picks through the judge queue, the others kept as
  alternates). Parked until S1 lands, since both touch session.ts; merge then, off by default.
- 26 Sep: `docs/cut-sheet-map.md` and `docs/rules.md` written; the owner's plan doc filled in.
- 26 Sep: S0 built. 75 prompt cases from the owner's 122 verdicts, the case runner and the corpus runner, both on
  `plan.ts rebuild` (which now gives a moment its mock-up and saved shot brief, as the harness does when it
  draws). Baseline: 2/38 failing cases met, 28/28 passing. The runners see only what `rebuild` sees
  (planContinuity, framePrompt, plan.ts); a step that changes the preparation must change it there. Floor plans
  and shot briefs are the ones saved with each dream: a fix to how they are made shows once they are made again.
- 26 Sep: S0 hardened. Every counted fault now has a check on the images or floor plan
  or a question expecting no on the faulty fact (a cosmetic rewording, or rewording the fault and adding the fact,
  no longer meets snow-train m2/m3, snow-train-2 m1, night-market m2, orchard m7 legs or the open door); the
  reverse angle and the tractor's heading are checked by their named side; the dreams are frozen in the repository
  and each run keeps their hashes; faults seen in one drawing are counted by one rule, and nine are hypotheses;
  eight that no change to the code alone can meet are marked as needing a model step. Baseline: 6/33 counted,
  36/36 passing.
- 26 Sep: S0 done. An independent review found a reworded prompt could still meet some cases and the camera
  checks did not check the side; fixed (a no-question on every faulty fact, named sides, frozen dreams with hashes,
  word-level corpus diffs, 8 cases tagged as needing a model step), re-measured with the review's own probe prompts
  (cosmetic rewordings now fail, genuine fixes still pass), merged, baseline reproduced on the merged branch:
  6/33 counted faults met, 36/36 guards.
- 26 Sep: S1 built on branch `record-state` (464df89; DREAMCHAT_RECORD=on). Its cases: state 7/9, presence 2/2,
  holding 2/2 (0/13 before), 4 of 6 model-step cases met anyway, guards 36/36; off and shadow identical to before on
  all 59 dreams. Two gaps found and being closed in S1 before review: facts a moment implies about a place are
  written nowhere (the library water rising to the window), so an implied-state reading is being added; and
  planning and drawing built the record from different inputs.
- 26 Sep: S1 gaps closed (implied state read per moment, basis implied; planning and drawing share one record),
  S1 11/13, all faults 18/33, guards 36/36. Independent review: merge after fixes. It found two faults only the live
  flow shows (a re-plan erased the implied states; the shared record was fixed before sketches existed, so
  corrections made while sketching were ignored), implied changes adding ~57% more in-between pictures against the
  owner's rule, place readings letting motion and drawing style through, and broken prompt text. Being fixed.
  Lesson for every step's eval: the frozen dreams do not exercise the live path (pins, re-plans, corrections), so
  each step now also needs a live-flow check.
- 26 Sep: S1 review fixes committed, without Jev (its credits ran out mid-run): a re-plan keeps the implied states;
  the pin is the record's structure only (looks from the sketches as drawn; a scene is placed again before drawing
  where presence or holdings differ); implied changes get no in-between picture (frozen 25, as off); places get a
  second question; broken text fixed. Measured from cached answers: S1 10/13 with 1 unanswered, guards 36/36, off
  unchanged. **First item for S1, once Jev is back:** the place question, asked as one joined question, rejects the
  two water levels (library-1 m5 0.28, library-3 m7 0.26) while rightly rejecting snow deep, grass tall and dusk.
  Split it into four one-fact questions (stays after this moment; a motion; how the pictures are drawn; already in
  its look), tuned on the review's rejects and the two water levels with the probe
  `dreamchat/evals/probes/place-question.ts`;
  then rerun `--step S1` off/on, all cases, the frozen and live corpus with the reading, the in-between counts, and
  the live-flow check on fresh fake replays (`evals/live-flow.ts`), as one follow-up commit.
