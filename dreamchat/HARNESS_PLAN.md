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
| Tags | shot role (pov, over-the-shoulder, insert, single, two-shot, group, wide, close-up), move from the cut before (first, same setup, same side, other side, reverse, other place, jump, seat), establishing, line, change here/carried, turned, held, crowd, group, animal, vehicle, what a floor plan cannot stage (flight, water, weather, transformation, jump), dreamlike, writing, planned | `cutsheet.ts` (built, S3; logged per moment in shadow, listed in the corpus dump) |
| Checks (Jev layer 2) | only the questions a cut's tags call for, from a library of film-making and continuity rules, each question with its labelled set | to build |
| Assembly | `assembleCut(sheet)`: the prompt, each fact once, and the references (sketches, earlier cuts, in-between pictures, the grey mock-up only when its tags say it helps), each with its instruction | `assemble.ts` (built, S3: a word-for-word port of `framePrompt` with today's choice of images, reading only the sheet; S5 and S6 change it) |
| Drawing, then judging | fal draws; the judge (Claude, for now) checks the picture | exists |

## Steps and status

| # | Step | Status | Eval that proves it |
| --- | --- | --- | --- |
| S0 | Eval foundation: a prompt-case set from the person's 122 verdicts and notes, a runner that rebuilds prompts from saved dreams and scores them, the free simulation corpus as regression | done: reviewed, fixed, merged (26 Sep) | Every noted fault has a case; the runner reproduces today's failures. Baseline: 6 of 33 counted fault cases met (all six guards against editing the picture before), 36 of 36 passing cases met (below) |
| S1 | Story record carries state (water, suitcase, who holds what, presence) into continuity, in-between pictures and prompts | done (27 Sep): reviewed twice, merged behind DREAMCHAT_RECORD=on | The S1 cases pass (`--step S1`: library-2 m5/m9 water, snow-train m4/m5, snow-train-2 m1, lighthouse-fresh m13, orchard m7; library-1 m3/m5, library-3 m7, snow-train-2 m5/m7 need a model step); no regressions on the corpus |
| S2 | Stop stand-in checks deciding: the pre-draw prompt check and storyboard check only log | building (27 Sep) | No moment held or reworded; corpus unchanged otherwise |
| S3 | The cut sheet: tree (vertical) + record (horizontal) + relations + tags, one per cut | built, reviewed, fixed, merged behind DREAMCHAT_CUT_SHEET (27 Sep); sheet-as-sent proof on fresh replays running | Every input the prompt needs comes from the sheet; no fact computed in two places. Met: `assembleCut` reads only the sheet and writes what framePrompt writes on every moment (0 differences in 1052 rebuilds: frozen 115 and live 411, record off and on), prompt cases unchanged on against off; what the sheet still computes twice is listed under S3 below |
| S4 | Camera rules and shot roles: the scene's line, a reverse angle turns the room (what is now left, right, behind), point-of-view shots show at most hands, vehicle screen direction, same setup means the same camera | not started | The S4 cases pass (`--step S4`: snow-train m2 reverse and m3 seat, snow-train-2 m2 same setup, lighthouse-fresh m12 heading, lighthouse-first m3, night-market m2, library-1 m4/m5, orchard m4 hands and m7 legs; lighthouse-fresh m10 needs a new floor plan) |
| S5 | References and variants: one image per subject; in-between pictures only when an edit carries several changes; variants kept and reusable; the grey mock-up as a reference chosen by tag | not started | The S5 cases stay met or pass (`--step S5`: never editing a picture from another side; library-1 m5 wall); its hypotheses (mock-up only, one image per subject) are for a paid check, not proven here |
| S6 | `assembleCut`: prompt and references from the sheet, each fact once, action as visible facts; retire the regex clean-ups one by one | not started | All S0 cases pass; word-level diff reviewed on every saved dream |
| S7 | Jev layer 2: checks routed by tags, a question library from the film rules, a labelled set per question; a check may hold a picture only if it predicts pictures | not started | Each question meets its bar on its labelled set |
| S8 | Listening: every reply checked against its move; major picture gaps asked openly, minor ones imagined and marked; the retelling ends with the moments | built and merged behind DREAMCHAT_LISTEN (off); review: fixes in progress (circle-back rule, choice readings, retelling latency) | `evals/listening.ts` against the frozen before (`evals/listening-before`, 40 fresh simulated conversations): listening-turn compliance at least 90%, either/or under 5%, leading 0, said but not in their words 0, every way of drawing it kept, every retelling ends with a list of the breakdown's moments, no answer misread; floors not below the before (below) |
| S8 | Listening: every reply checked against its move; major picture gaps asked openly, minor ones imagined and marked; the retelling ends with the moments | built on branch `s8-listening` behind DREAMCHAT_LISTEN=on (off by default, and off is today word for word), 27 Sep; measured on 40 fresh conversations at ee6c1e3: compliance 96%, either/or 0%, style offers 40/40, no answer misread and the floors on questions and on facts kept as said met; leading 3 (2 real by hand), said but not in their words 12 (breakdown fields graded whole), 3 retellings changed by the correction that followed, and dream-file facts told or asked 0.944 against 0.949 (3 facts): see the log; not yet reviewed | `evals/listening.ts` against the frozen before (`evals/listening-before`, 40 fresh simulated conversations): listening-turn compliance at least 90%, either/or under 5%, leading 0, said but not in their words 0, every way of drawing it kept, every retelling ends with a list of the breakdown's moments, no answer misread; floors not below the before (below) |
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
- **S8 (listening).** Measured on fresh simulated conversations, never on the saved ones: those span four days of
  changing listener code (listening compliance 72% down to 58% by day) and replays from other branches. **The before**
  (`evals/listening-before/`, 40 conversations frozen with what the test reads, 1.4 MB): the 20 dreams with a
  simulated conversation, twice each, simulated at 4c0e52c (the base S8 starts from, S1 merged and off) with nothing
  paid for, scored into `evals/listening-before-scores.json`. **The after** is made the same way at S8's head:
  `DREAMCHAT_PROVIDER=fake DREAMCHAT_JUDGE=off STRAWBERRY_PYTHON=<venv python> DREAMCHAT_STRAWBERRY_HOME=<own folder>
  bun --env-file=$HOME/.config/strawberry/dreamchat.env run simulate.ts dreams/<a>.md … --max 30` (all 20 dreams, twice;
  `--max 30` reaches the style offer, the retelling and the profiles, where 16 cut off the style offer in 29 of 50),
  `bun run evals/listening.ts --freeze runs/listening-after runs/sim-<stamp>-…-low.json`, then
  `bun --env-file=… run evals/listening.ts --label after --data runs/listening-after --against
  evals/listening-before-scores.json`. `--data` (or DREAMCHAT_DATA) always names the folder read; the run file keeps it,
  the hash of every conversation, and the hash of the question wordings (runs whose hashes differ are not the same
  measure). The headline is the simulated conversations only; `--against` compares dream by dream (conversations
  pair by dream, never by id) and checks the floors.
  What is asked, each reply: one Jev question shaped by its move (a thread older than the message answered passes on
  the thread or on the newest message: answering what was just said is the move's fault, not the reply's); on every
  listening reply whether it leads, by its question (puts forward an answer) or by what it states (a detail of the
  dream nobody gave, "juggling, just for you"); either/or where it asks. Every clause marked said (a moment's action
  whole) is asked as said of its subject, never inside a field's stem ("the light in the tiny lift is stuffy" was a
  claim nobody made), against everything the person said and against the dream file; the dream file's 276 facts
  (`evals/listening-facts.json`) as told, asked, and kept as said. A retelling's closing list is held to the
  breakdown's moments, every one. Answers to a profile or a retelling are misread both ways: clear but read unclear
  (after a reply that asked), and no answer but read as settled. `--audit` scores the 20 hand-labelled replies
  (`evals/listening-audit.json`): move 20/20, either/or 10/11, leading 11/12.
  **Targets:** listening-turn compliance at least 90%; either/or under 5% of listening questions; leading 0; said but
  not in their words 0; every way of drawing it kept; every retelling ends with a list of every moment; no answer
  misread. A target of 0 is met when every remaining flag (`--flags`) is hand-checked and found wrong; said facts
  Jev reads 0.3-0.5 are listed apart (near the bar), hand-checked, and not counted.
  **Floors** (S8 must not buy its targets by asking less or recording less; each against the before): questions per
  listening reply at least 0.89; dream-file facts told or asked at least 0.95, never asked nor told at most 0.05; told
  dream-file facts kept as said at least 0.87.
  **The before (40 conversations):** reached the retelling 40, the style offer 39, a profile 38. Listening-turn
  compliance 335/555 (60%): follow 39/112, goal questions 91/202 (45%), explore_thread 165/201 (121 name a message older
  than the one answered); before the pictures 567/809 (70%). Either/or 107/447 (24%). Leading 129/515 (25%): by the
  question 108, by what it states 23, both leading and either/or 75, answered only "yeah" 11. Said but not in their
  words 273/1227 (22%; 258 from sketch profiles), 70 more near the bar. Every way kept in 36/38 offers (the repair
  emptied 2). Retellings ending with a list of the moments 0/42. Misread: clear read unclear 10 profile and 4
  retelling answers (of 84 and 50; 9 more followed a reply that never asked); no answer read as settled 0. Shown:
  dream-file facts told 511/552, kept as said 443; goals read as told whose message tells them 344/402; picture turns
  213/350.

  | dream | listen | either/or | leading | unsaid | told or asked | retelling/style/profile |
  | --- | --- | --- | --- | --- | --- | --- |
  | car-park | 55% | 43% | 31% | 13% | 96% | 2/2/2 |
  | crayon-cat | 77% | 10% | 20% | 15% | 88% | 2/2/2 |
  | desert-station | 52% | 21% | 28% | 6% | 96% | 2/2/2 |
  | flooded-library | 26% | 41% | 36% | 26% | 93% | 2/2/2 |
  | glass-window | 42% | 35% | 29% | 21% | 100% | 2/2/2 |
  | grandma-kitchen | 80% | 8% | 8% | 19% | 97% | 2/2/2 |
  | hotel-orchard | 50% | 0% | 5% | 17% | 96% | 2/2/2 |
  | icehead | 58% | 12% | 21% | 24% | 100% | 2/2/2 |
  | jellyfish-city | 72% | 13% | 13% | 28% | 94% | 2/2/2 |
  | lighthouse | 62% | 24% | 31% | 27% | 82% | 2/2/2 |
  | meads-house | 75% | 42% | 32% | 31% | 100% | 2/2/1 |
  | moon-market | 77% | 33% | 35% | 9% | 100% | 2/1/1 |
  | night-bus | 71% | 23% | 25% | 17% | 94% | 2/2/2 |
  | night-market | 65% | 5% | 14% | 23% | 91% | 2/2/2 |
  | office-snow | 50% | 24% | 27% | 17% | 88% | 2/2/2 |
  | paper-city | 71% | 17% | 17% | 28% | 88% | 2/2/2 |
  | school-bird | 67% | 44% | 36% | 11% | 100% | 2/2/2 |
  | sea-school | 80% | 28% | 28% | 15% | 100% | 2/2/2 |
  | snow-train | 44% | 20% | 22% | 33% | 100% | 2/2/2 |
  | streetcar | 50% | 15% | 24% | 44% | 100% | 2/2/2 |

  Two conversations per dream: a dream's row moves by chance alone; read the totals, and a dream only where it moves
  far.

- **S3 eval (the cut sheet).** Switch `DREAMCHAT_CUT_SHEET=off|shadow|on`. One `CutSheet` per cut built from the
  tree (vertical), the story record (horizontal), relations and tags (`docs/cut-sheet-map.md`), and an
  `assembleCut` ported word for word: in shadow its prompt and references are identical to today's on every moment
  of the frozen (15) and live (59) corpora, with the record off and on; every input the prompt uses is read from the
  sheet, and a test fails if the assembler reads anything else; the tree's looks and stages come from the record
  (one source); the tags exist per cut and are listed per moment in the corpus dump. Live-flow check: a saved
  dream's drawing path and rebuild give the same sheet. Review: what the sheet still computes twice, and what S4-S6
  will need.

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
| S1 | S2 | The live-flow check (`evals/live-flow.ts`) passes a moment the checks acted on: drawn again from a list of what went wrong, or drawn without its brief because the pre-draw check set it aside (5 of 26 moments on the fake replays, 27 Sep). A rebuild cannot know these; once S2 makes the checks log only, those moments should rebuild word for word. |
| S1 | S9 | The Strawberry production is written at `start`, before planning and the implied reading, so implied changes have no production coverage. |
| S2 | S7 | S2 makes the checks log only; their logged readings become S7's labelled sets. |
| S7 | S8 | Done in S8 (27 Sep, behind DREAMCHAT_LISTEN=on): `jev.ts choiceByAction` sums the labels that lead to one action before the bar (profile, retelling, "would you like to see it"); clear answers read as unclear 14 before, 0 in three after-runs. |
| S8 | S1 | 22% of "said" facts were never said (the before: 273 of 1227, 258 from sketch profiles). S8 fixed the sketch side (a reworded or revised profile keeps their words apart from ours: 1% left, 12 of 912), but the breakdown's own fields are still graded whole by `ground.ts` ("the corridor: perhaps lockers or doors" passes because the corridor was said): every one of the 12 left. A `Detail` holds one said flag, so a field with their words and a guess is either said whole or not at all; the basis belongs per clause in the breakdown, the record and the sheet (S1, S3). |
| S8 | S8 | Done: an explore_thread move follows only what the message just answered raised (0 of 131 older, from 121 of 201 in the before); an older thread is come back to as earlier (circle_back) once the story is told. |
| S8 | S7 | Every reply is checked against its move (`jev.ts replyCheck`), and the check is kept in each turn's detail (`replyCheck`). Picture turns are checked but not sent back: their briefs hold conditions ("if they ask, say…") a check on the brief cannot read, a second try fixed none of five, and their compliance by the listening test was 54% (61% before, in shorter conversations). S7 can label these checks; the picture briefs need their own questions. |
| S8 | S1 | `test/record.test.ts` ("every saved session derives, and derives again to nothing new") fails on a simulated flooded-library conversation of this step's smoke run: "round window open" is both a change at m9 and the window's first look (`passing` then `first_look`). It reads saved sessions, so only a checkout with them sees it. |
| S8 | S3 | The producer can write "not applicable" into a field (the lighthouse dog's wardrobe, third after-run), which `VAGUE` does not catch and the Strawberry engine refuses as a placeholder: that conversation's production failed. |
| S8 | every step | Cost of listening: a listening reply now takes a median 4.5 s (p90 13 s) with the check and, for about half of them, a second try that thinks first; the retelling waits for the breakdown (median 14 s) and takes a median 27 s to write. The check shares its judge, and close wording, with the listening test: in the second round they agreed on 554 of 564 move verdicts, and the test found 10 the check had passed, none the other way. |
| best-of-takes branch | S5, S10 | Built, off by default (9371476), parked; touches session.ts; merge after S1 lands. |
| S1 | S6 | The in-between picture's instruction "Image N: the newspaper's newspaper … draw their newspaper" repeats a thing's name (3 prompts, off and on): same class as the fixed "its the block of ice", only fixed in the "Except" sentence. |
| S8 | S1 | `test/record.test.ts` failed on one newly saved simulated session ("round window open" folded twice) — the record's first-look fold on implied states; check when saved sessions change. |
| S8 | S3 | The producer can write "not applicable" into a field, which the Strawberry engine rejects (one conversation's production failed): the breakdown's empty values should be null. |
| S8 | S8 | Said-but-not-told residue (12/912) comes from breakdown fields `ground.ts` passes whole ("perhaps lockers or doors"): a field holds one said flag, so per-clause basis must come from the record/sheet. |
| S3 | S6 | `docs/cut-sheet-map.md` lists every prompt input and where it is computed today; S6's `assembleCut` reads only the sheet S3 builds. |
| S3 | S6 | The sheet still does framePrompt's text clean-ups while it is built (`withoutGone`, `lookIn`'s `withoutWords`/`VAGUE`/`withoutPose`/`inShades`, `writingIn`), so the port stays word for word; S6 retires them for typed facts. `assembleCut` returns each paragraph with an id (`framing`, `shot`, `manifest`, `now` …) and the sheet fields it says: the gate's line-text matching in session.ts (`startsWith('The shot')`, `'around: "What the camera sees'`) can use the ids. |
| S3 | S2 | On the drawing path the gate drops a moment's brief when it finds the prompt at odds on "The shot" line; a rebuild cannot know it did. A moment now keeps a print of the sheet it was sent with (`sentSheet`), and the live-flow check counts a sheet that differs only in the brief as explained where the prompt is (jellyfish-city m5, sea-school m2 and m7 of the record-fake flow replays, drawn before the print was kept). It goes once S2 makes the checks only log. |
| S3 | S4 | Tags `move`, `crossed` and `role` are the camera rules' inputs: a reverse is the camera turned at least 135° from the cut before in the same place (snow-train m2 and lighthouse-fresh m12 read as reverses); `crossed` is its side of the scene's line (the tree's, from the scene's first two-shot) differing from the cut before's; `role` is counted from who is in view and the size, with the tree's over-the-shoulder, since `outsideShot` still returns only words. Consecutive sheets (`prev`) are what S4's rules read. |
| S3 | S4 | `relationIn` (continuity.ts) calls the moment after a jump "another place" from the jump's own picture in the same place (the key-and-boat dream m7 and m9, the lift m5): a jump moment counts as a boundary behind itself. The move tag and the plan's references both read it; fixing it changes plans and prompts, so it is S4's, measured. |
| S3 | S5 | The sheet's `inView[].image` is the sketch only; `earlier` is the plan's choice. S5's `chooseRefs` needs each element's image of the stage in force (its in-between picture, drawn and approved, or its sketch) from the tree's ledger, and chooses image 1 by the tags. |
| S3 | S7 | Every cut has its tags (logged in shadow, listed per moment by `evals/corpus.ts`); S7 routes questions by them. |
| S3 | S9 | A re-plan updates the moments' plans but not `build.plan`; the drawing path's sheet reads each moment's own plan. A sheet is flagged `record_moved` where the record now differs from the typed facts its plan was made from: stale, for S9. Frames saved before S3 carry the plan's words without typed facts (`nowWords` on the sheet). |
| S3 | S1 | The story record is made three times from the same inputs: for the plan (`recordForPlan`), for the sheet (`sheetDream`, once per drawing of a moment) and for the panel's tree. One record per dream, passed to all three, is the next step once the sheet is on. |
## Known debt, by the step that clears it

Found in the S1 review (26 Sep) and left for the step it belongs to, so S1 stays one change.

- **S3 (the cut sheet).** Cleared: the record hands typed facts (`factsAt`: a part as it is now, shut, held by)
  to the plan and the sheet, and they are said once, at assembly (`sayNow`); `nowAt` is now only their words.
  Left, and moved: the production is written into Strawberry at the start, before what the moments imply is read
  (S9); `shutAway` shuts anything opened once it is carried to another place, and should be a typed fact about
  containers (S6, with the record's other word lists).
- **What the cut sheet still computes twice or more (S3 review).** The prompt reads the first of each, as
  framePrompt did; S6 makes the record and the tree the one source.
  - The story record is made three times: for the plan (`recordForPlan`), for the sheet (`sheetDream`, once per
    drawing of a moment, again after its words change), and for the panel's tree (`treeInputOf`).
  - Two trees: the panel's (with the pictures drawn and the conversation's goals) and the sheet's (without them,
    so that drawing and a rebuild read the same). The sheet's has no drawn or approved state in its ledger, which
    S5's choice of images needs.
  - Who is in view: `inViewOf` runs three times for one prompt (the sheet, framePrompt beside it, the gate), and
    three sources say it (`inView` from the plan's lists and view, the record's `shows`/`present`, the tree's `at`).
  - How each one is now, four ways: the plan's words (`now`), the plan's typed facts (`facts`, what the prompt says),
    the record's facts at the sheet (`record.facts`, flagged `record_moved` where they differ), and the tree's
    stages and parts.
  - How each looks, two ways: the sketch's words through `lookIn`, and the record's repaired `base` facts, which reach
    the prompt only as `unsaid`.
  - The changes in force: the plan's (`states`, `inView[].changes`) beside the record's typed `own`/`carried`, and with
    the record off from the breakdown's own `states`.
  - The relation to the cut before, three ways: the plan's refs, `relationIn` for the move tag, and the tree's side
    and camera for the reverse and crossed tags.
  - Names three ways (`pictureName` of the sketch, the record's `called`, the tree's `calledIn`); the camera two
    ways (the plan's view and words, the tree's `camera`, `side`, `screen`, `background`).
  - Tags read from several sources where one is missing: a crowd, a group or an animal is the record's kind, else
    the sketch's words, else the tree's category; `line` is the tree's line, or the plan's left-to-right order, or
    its staging.
- **S4 (camera rules).** A thing held in a view through the dreamer's eyes is placed at its floor-plan spot, not
  in the hands that hold it; and the "Nobody else is in the picture" line can stand beside a list of people who
  are in it.
- **S6 (`assembleCut`).** The record's new word lists (`FILLS`, `OPENS`, `STATE_VERB`, `NOT_THERE`, `SELF`,
  `TAKEN`, `HOLDS_NAME`, which has 'bowl' twice) overlap what the implied reading now reads with a model and Jev;
  each should be retired once the reading covers it. `withoutWords` in `frames.ts` is one more text clean-up to
  retire with the others.

## Open questions for the owner

- **Blocking (27 Sep, ~03:30): DeepSeek balance is empty** (402 Insufficient Balance). Simulations, replays, the
  implied-state reading and the listening re-proof are stalled until it is topped up; code, unit tests and rescoring
  stored conversations continue. The S3 sheet-as-sent replay (`runs/s3-flow`) died on it and must be rerun.
- **DeepSeek balance (27 Sep, ~03:00):** simulations hit DeepSeek's concurrency limit tied to the remaining
  balance (it fell from 121 to 84 during S8's rounds). Simulations and the implied-state reading use it; it may need
  a top-up before S10. Until then, prefer rescoring stored conversations over new simulations.

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
- 26 Sep: S8's eval written on branch `s8-evals` (`evals/listening.ts`, above), before the step. Baseline: move
  compliance 63%, either/or 35%, leading 37%, said but not in their words 21%, 0 retellings ending with the moments,
  16 clear answers read as unclear. Found on the way: most explore_thread misses are the move, not the reply (a
  thread older than the message answered, done 30 of 135 times, against 156 of 191 when it is the latest), and in
  15 of the 16 clear answers read as unclear (the 16th kept no turn detail) the choice summed to settled while its top
  label fell under the bar (confirmed 0.55, you_choose 0.45). Hand audit: Jev's answers agreed on 20 of 20 moves,
  22 of 24 question shapes, 16 of 16 answers and 20 of 20 facts, after fixing eight misreads (generic criteria read
  "would you like to see it drawn?" 0.45-0.49; a guessed next event passed as following; joined conditions; ways of
  drawing named in other words; dream facts joining two things; answers to a reply that never asked). Not measured
  yet: details a reply's reaction invents outside its question.
- 26-27 Sep: S8's eval reviewed (merge after fixes; the scorer agreed with the reviewer's hand reading on ~33/36
  moves, 24/24 leading, 0.6% of answers flipped when asked again) and fixed. The before is now 40 fresh simulated
  conversations at 4c0e52c, frozen in the repository (an earlier set was simulated and thrown away: Jev's credits ran
  out mid-run); the saved conversations are no longer the measure. The compliance target is on listening turns alone,
  with floors so it cannot be met by asking or recording less; leading is read on the whole reply (by its question or
  by what it states: one joined question agreed with 7 of 12 hand labels, two apart with 11 of 12); the code
  either/or check is dropped (right in 3 of 11 disagreements); moments are asked whole and said facts as said of their
  subject; retelling lists are held to the breakdown's moments; answers are counted misread both ways; a reply
  following the newest message over a stale thread passes; the audit is a regression set. Hand checks of the before's
  flags (seed 5): 10/10 said-but-not-told real, near-bar mixed as meant (2 of 6 said after all), 9/10 leading real
  (one restated what was said).
- 27 Sep: S8's listening test merged after review fixes: a frozen before of 40 simulated conversations (20 dreams x 2), targets that
  cannot be met by asking or recording less. Before: listening compliance 60%, either/or 24%, leading 25%, said but
  not told 22%, retelling ends with the moments 0/42. The listening fixes are now being built behind DREAMCHAT_LISTEN.
  Known: evals/probes/place-question.ts does not typecheck on its own (top-level await); fix with S1's follow-up.
- 27 Sep: the place question split into four one-fact questions (stays after this moment, asked only where a later
  moment is in the same place; something it is doing now; how the pictures are drawn; what its look already says),
  answers within 0.1 of the bar marked. The review's rejects fail (the train leaning 0.96, "like an old film" 0.87,
  the towering grass 0.74, snow deep 0.97-0.99, dusk 0.95) and both water levels are taken again. S1 11/13 (model
  step 4/6), all faults 18/33, guards 36/36, off unchanged; in-between pictures 25 frozen (as off), 71 live (66
  off). Fake replays with the record on: all five pinned, each rebuilds from drawing's record with its pin as
  drawn; 21 of 26 moments word for word, the other 5 changed by the checks (see the overlaps table).
- 27 Sep: S1's place questions settled. "Stays after this moment" dropped: it rejected true rising water on live
  dreams (0.06-0.59) and caught nothing the others missed. A place is now asked four questions to be answered no:
  a motion, how the pictures are drawn, what its look already says, and how it feels or what is known of it (the
  tiles warm 0.73, the door unlocked 0.70; the water levels 0.07-0.33). A reading that only says its part again
  ("crowd: crowded") is never asked. Live readings 85, 50 taken (43 of 79 before): the rising water in 279d, de6c
  and 6081 is taken now; the tiles, the door and the crowd are not. S1 11/13, all faults 18/33, guards 36/36, no
  case moved; off unchanged.
- 27 Sep: S1 done. Its cases 11/13 (0/13 off), all faults 18/33 (6/33 off), guards 36/36; off and shadow unchanged;
  live flow: every replayed dream rebuilds from the record drawing read. Left for S4: library-1 m5 and library-3 m7
  (water carried to the window, but the mock-up sets the boat low). Switch stays off by default until S10.
- 27 Sep: S3 built on branch `s3-cut-sheet` (DREAMCHAT_CUT_SHEET=off|shadow|on, off by default). `hashOf`/`slug`
  moved to lib.ts, so the tree can read the record; the record hands typed facts (`factsAt`, said once by `sayNow`;
  `nowAt` is their words) and a typed kind of what a floor plan cannot stage; continuity's `relation()` is exported;
  `cutsheet.ts` builds one sheet per cut (the tree's sheet with sources, the record's layer, relations, tags, and
  what the prompt is written from) and `assemble.ts` writes the prompt and images from the sheet alone; with the
  record on, the tree's stages, stage in force, changed parts and holders are the record's. The eval: in shadow,
  0 differences between `assembleCut` and framePrompt, prompt and images, on 115 frozen and 411 live moments with
  the record off and on (frozen with the moments' implied readings from the cache, live without), 33 benchmark
  moments; with `on`, the corpus is unchanged against off (140 and 477/478 pictures the same); a test writes every
  frozen moment both ways in ten variants (repairs, strays, no view, words-only plans, no edit or mock-up, one
  colour, the other eyes, "you", more images than fit, unapproved sketches), and fails if `assembleCut` reads
  anything but the sheet (a guarded copy cut off from every object, the switches flipped, its imports); prompt
  cases 85 of 85 unchanged on against off, record off (6/33 counted, 36/36 guards) and on (18/33, 36/36); the
  live-flow check (evals/live-flow.ts) gives the same sheet on the drawing path and in a rebuild for 23 of 26 drawn
  moments of the five record-fake flow replays, the other 3 only in the brief the gate dropped (overlap S3 → S2).
  `bun test` green with the switches off, shadow, on, and with the record on; typecheck clean. Tags over the frozen
  dreams (115 moments, record off): role two-shot 39, wide 30, pov 17, single 15, close-up 7; move reverse 26, other
  side 24, other place 19, first 15, same setup 12, seat 7, same side 7, jump 5; held 46, animal 27, vehicle 36,
  crowd 20; unstaged weather 10, water 7, flight 6, jump 4, transformation 3; establishing 79.
  The panel's tree with the record on, against the same tree from the breakdown's own changes, over the 59 live
  dreams: 596 stages against 595, 16 stages in force and 32 changed parts differ (the record's ends and part
  names), 25 "stage not carried" and 3 "first look" flags gone (what carries is the record's to say), none new.
- 27 Sep: S3 review fixes (the review: safe to merge behind the switch; fix the tags before S4 and S7 read them).
  A reverse is now only the camera turned at least 135° from the cut before; crossing the scene's line is its own
  tag, `crossed` (the tree's side against the cut before's). The kind, held and change tags count only what is in
  the picture (the record's lists and the place, and whoever the camera takes in), never whoever is only there, and
  take the record's kind before the sketch's. Frozen, record off: reverse 19 (26 before), crossed 7, crowd 11 (20),
  animal 23 (27), held 44 (46), group 0 (6), crowd and group together 0 (9). Live, record on: reverse 41, crossed 17,
  crowd 42, animal 59, held 85, group 11, crowd and group together 0; the review's false reverses (1177 m6,
  2c51 m6, acfd m3) are no longer reverses and the night market's m4 is crossed. Each moment drawn with the sheet
  keeps a print of it (`sentSheet`: its hash with images named by what they are, each part's hash, the earlier
  pictures it had) and the log says so; the live-flow check compares a rebuild against that print (the fake
  replays were drawn before it, so they are counted apart; a session test draws two moments and checks both).
  `assembleCut` is also run with the environment made to throw on any read. A prompt only looked at (/api/prompt)
  is not logged. The dream a sheet reads is made once per drawing of a moment, and again after its words change.
  Re-measured on top of S1's last fix: in shadow, 0 differences between `assembleCut` and framePrompt on 115 frozen,
  411 live and 33 benchmark moments, record off and on; with `on`, every picture the same as off; prompt cases
  unchanged on against off (record off 6/33, 36/36; on 18/33, 36/36); `bun test` 480 pass with each of
  DREAMCHAT_RECORD and DREAMCHAT_CUT_SHEET off, shadow and on; typecheck clean.
- 27 Sep: S3 merged (85e6f6d, 4b9bed1): one cut sheet per picture from tree, record, relations and tags; assembleCut matches
  framePrompt on every moment (frozen 115, live 411, benchmark 33; record off and on); tags fixed after review (reverse
  = turned >=135 deg from the cut before, crossed = other side of the line, kinds count only what is in the picture).
  Fresh fake replays with record on and sheet in shadow are running to prove the sheet-as-sent check. S2 started.

- 27 Sep: S8 built on branch `s8-listening`, behind DREAMCHAT_LISTEN=on (off by default; with it off the prompt cases
  and the frozen corpus are unchanged, 0 cases and 0 of 140 pictures moved, and with it on too). The fixes, each a
  general rule: move selection follows only what the message just answered raised, and once the story is told comes
  back to older threads as earlier; every reply is checked by Jev against its move (on listening replies also for
  leading, either/or, details nobody gave and more than one question; the style offer for each way; the retelling
  for its closing list), and one that fails is written once more, thinking first, with the failure named, the first
  kept on a tie; nothing is cut from a reply any more; listening briefs ask one open question on the dreamer's words,
  each goal by an open example ("who were you, in the dream?", "what did <the lift> look like?"), a thread by what
  could be seen of it; choice readings sum the labels that lead to one action; the retelling waits for the breakdown
  (drafted once more if it failed) and ends with its moments as a numbered list; a profile revised or reworded keeps
  the dreamer's words apart from our guesses, and is said only where the words are theirs; only major gaps in how
  something looks are asked about (in two moments or more and would be rejected if wrong, by Jev, or in the key
  moment or the strange thing), openly and with no guess put forward; minor ones are imagined and marked.
  Measured on 40 fresh conversations each time (the 20 dreams twice, fake pictures, --max 30), against the frozen
  before, three rounds: ce869f0, 1b62461, ee6c1e3. At ee6c1e3 (three of its four simulation processes were stopped
  by DeepSeek's concurrency limit at messages 16-27, after every conversation had reached the retelling, the style
  offer and a profile):

  | measure | before | ce869f0 | 1b62461 | ee6c1e3 | target |
  | --- | --- | --- | --- | --- | --- |
  | listening-turn compliance | 335/555 (60%) | 469/485 (97%) | 583/604 (97%) | 528/552 (96%) | >= 90% |
  | goal questions | 91/202 (45%) | 169/181 (93%) | 107/114 (94%) | 110/116 (95%) | |
  | either/or | 107/447 (24%) | 0/445 | 1/563 | 0/509 | < 5% |
  | leading | 129/515 (25%) | 1/445 | 4/564 | 3/512 | 0 |
  | said but not in their words | 273/1227 (22%) | 14/829 | 20/878 | 12/912 | 0 |
  | style offers keeping every way | 36/38 | 40/40 | 39/40 | 40/40 | all |
  | retellings ending with every moment | 0/42 | 35/41 | 37/40 | 38/41 | all |
  | answers misread | 14 | 0 | 0 | 0 | 0 |
  | questions per listening reply | 0.89 | 1.00 | 1.00 | 0.99 | >= 0.89 |
  | dream-file facts told or asked | 0.949 | 0.942 | 0.938 | 0.944 | >= 0.949 |
  | never asked nor told | 0.051 | 0.058 | 0.062 | 0.056 | <= 0.051 |
  | told facts kept as said | 0.867 | 0.865 | 0.909 | 0.885 | >= 0.867 |

  Hand checks at ee6c1e3. Leading, 3 flags: two real ("did you go through it?", "and the boat, did you go toward
  it?", both follow moves the check read 0.34-0.35), one not ("was anyone else there?"); the check's bar for leading
  is now 0.3 (after ee6c1e3, not simulated again: on the stored checks it sends back 7 more of 512, both real ones
  among them). Said but not in their words, 12: all breakdown fields, graded whole by `ground.ts` and copied into the
  sketches; about 10 real ("the bus: seats", "the sky above the town: open sky" where they said they don't remember
  the sky, "just ordinary cats" where they said "go with whatever"), 2 said after all ("not dim"; "greyish" of the
  light inside): see the S8-S1 overlap. Retellings: all 41 end on the numbered list of the breakdown they were written
  from; the 3 that miss a moment of the final breakdown were followed by the dreamer correcting it (2) or the dream
  going on (1), which is the list doing its job: the test holds the first list to the breakdown drafted after the
  correction, which no list written before it can meet (in the first round, 6 of 6 the same, each missing exactly
  the moments the correction changed). Dream-file facts told or asked: 521 against 524 of 552; per fact, 22 were
  covered less often than before and 19 more often, mostly one conversation of two, and the before's own two halves
  differ as much (0.946 and 0.953; bootstrap over its dreams, 90% of draws 0.929-0.968). Open: what they tell
  answering open questions is a little less than what leading questions drew out ("was it busy?"); the threads
  (explore and circle back) now ask what could be seen of what they raised. Also found: in the second round one style offer
  kept every way but one, reworded past knowing (now: each by its name as written); a retelling
  whose breakdown failed fell back to today's words (now: drafted once more); simulate.ts cannot write its report for
  twenty dreams at once (the file name is too long), so the runs were made in halves.
- 27 Sep: S8 merged behind DREAMCHAT_LISTEN (off). Measured: compliance 60->96%, either/or 24%->0, leading 25%->3/512,
  said-not-told 22%->12/912, misread 14->0. Review: the "come back to earlier" rule fired mid-telling and on the
  last message, turning chats into interrogations ('don't remember' 15->19%, facts pictures need lost), which the
  test could not see; choice readings now lose mixed answers; the retelling waits ~40 s. Not to be switched on
  until fixed; the listening test gains move-selection floors.
