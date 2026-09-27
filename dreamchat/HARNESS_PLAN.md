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
| S2 | Stop stand-in checks deciding: the pre-draw prompt check and storyboard check only log | merged behind DREAMCHAT_CHECKS=log (acting by default), review fixes merged (50dbd8c, 27 Sep); eval met on the picture path of 10 dreams (redrawn with fake pictures, Jev only); the whole-conversation replays wait for DeepSeek to be topped up | No moment held or reworded; corpus unchanged otherwise. Met on the picture path: 0 of 61 moments held, reworded, planned again or left undrawn by the gate or "storyboard complete?" (planning again a scene on Jev's plan facts, `planFacts`, still acts: overlaps S2 → S7) (acting: 18-19 rewordings, 10-11 re-plans and 11-13 sketch rewordings asked for, 1-3 moments left undrawn; the saved runs: 4 undrawn, 3 reworded, 17 scenes and 13 moments planned again); every moment drawn; every moment's gate reading and every camera's storyboard reading logged; Jev 23.6 calls a dream against 106-111 acting and 245 in the saved runs; prompt cases and corpus unchanged (below) |
| S3 | The cut sheet: tree (vertical) + record (horizontal) + relations + tags, one per cut | built, reviewed, fixed, merged behind DREAMCHAT_CUT_SHEET (27 Sep); sheet-as-sent proven on fresh replays written by Claude (27 Sep): met wherever no check acted | Every input the prompt needs comes from the sheet; no fact computed in two places. Met: `assembleCut` reads only the sheet and writes what framePrompt writes on every moment (0 differences in 1052 rebuilds: frozen 115 and live 411, record off and on), prompt cases unchanged on against off; what the sheet still computes twice is listed under S3 below. Sheet as sent (fresh replays, writer Claude): while drawing, `assembleCut` wrote what framePrompt writes on 48 of 48 builds (24 moments sent); against a rebuild 22 of 24 sheets as sent, the other 2 a check acting (below) |
| S4 | Camera rules and shot roles: the scene's line, a reverse angle turns the room (what is now left, right, behind), point-of-view shots show at most hands, vehicle screen direction, same setup means the same camera | not started | The S4 cases pass (`--step S4`: snow-train m2 reverse and m3 seat, snow-train-2 m2 same setup, lighthouse-fresh m12 heading, lighthouse-first m3, night-market m2, library-1 m4/m5, orchard m4 hands and m7 legs; lighthouse-fresh m10 needs a new floor plan) |
| S5 | References and variants: one image per subject; in-between pictures only when an edit carries several changes; variants kept and reusable; the grey mock-up as a reference chosen by tag | not started; eval written on branch `s5-eval` (27 Sep, below) | The reference check (`evals/references.ts`) at its bars on the frozen and live dreams: 0 subjects shown twice or not by their stage in force, 0 pictures from another side drawn from, 0 pictures waited for and never sent, every in-between picture meeting the owner's rule with no picture left carrying several changes; the S5 cases stay met or pass (`--step S5`: never editing a picture from another side; library-1 m5 wall); guards 36/36; its hypotheses (image 1 by tag, one image per subject on pictures the owner called right) are for the paid check, not proven here |
| S6 | `assembleCut`: prompt and references from the sheet, each fact once, action as visible facts; retire the regex clean-ups one by one | not started | All S0 cases pass; word-level diff reviewed on every saved dream |
| S7 | Jev layer 2: checks routed by tags, a question library from the film rules, a labelled set per question; a check may hold a picture only if it predicts pictures | not started | Each question meets its bar on its labelled set |
| S8 | Listening: every reply checked against its move; major picture gaps asked openly, minor ones imagined and marked; the retelling ends with the moments | built and merged behind DREAMCHAT_LISTEN (off); review fixes on `s8-listening` (27 Sep): the come-back rule restricted, choice readings that keep changes, the retelling's breakdown started early, and the test's move-selection floors; proven offline (replayed moves, re-read answers, a hand-labelled set), and a fresh simulation still owed (the writer model's balance is spent) | `evals/listening.ts` against the frozen before (`evals/listening-before`, 40 fresh simulated conversations): listening-turn compliance at least 90%, either/or under 5%, leading 0, said but not in their words 0, every way of drawing it kept, every retelling ends with a list of the breakdown's moments, no answer misread; floors not below the before (below) |
| S9 | Record of what was drawn, and staleness; sequences and look keys | eval written (27 Sep, below), being built on branch `s9-as-drawn` behind DREAMCHAT_AS_DRAWN | Every picture drawn keeps what it was sent and drawn from; a rebuild reading it gives each as sent (live-flow's four moments and the in-between pictures' look lines included); 0 stale where nothing changed; each made change makes exactly its dependent pictures stale, with the reason; stale pictures found on saved dreams, a sample hand-checked; corpora unchanged (below) |
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
- S5's reference check: `bun run evals/references.ts --label <name> [--live] [--against <name>] [--show]` reads
  every moment's images for one image per subject, its stage in force, pictures from another side, what the plan
  waits for and never sends, images for light alone, image 1 by tag, and each in-between picture against the
  owner's rule; writes `runs/references/<label>.json` (S5 eval below).
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
  **What DREAMCHAT_CHECKS=log does** (27 Sep, branch `s2-checks-log`; unset, everything is as before, and each
  action a check takes is now logged as a `check` transition): the gate's questions, "storyboard complete?" (when
  the shots are planned and again when a moment's view changes) and the sketch gate all still run; every reading
  is logged per picture in its Jev log (`gate` transitions: each answer with its bar, and what it found;
  `previs` transitions for the storyboard check), and what a check found is kept on the picture as drawn
  (`overrode`, which S7 labels against it). Nothing is held, reworded (a moment's words, a sketch's look, a
  redraw's instruction), planned again (before drawing or while drawing), drawn without its brief, or left
  undrawn because of a reading, and a reading is never put on a line (that search was 4 in 5 of the gate's
  calls; it only told a rewording where to look and excused a long prompt's diffuse rise, which the finding
  now says it might be). **What keeps acting**, because code knows it is wrong and no picture can put it
  right (`gate.ts` `actsWhenLogging`): the images attached and the prompt disagree (an image attached with no
  word on it, one described but not attached, two edit bases or a base not first, one attached twice, more than
  twelve, an unapproved picture, someone in view without their sketch), and a plan that points at a picture
  not earlier (an in-between picture's own plan issues never reach the gate, so none of them is claimed). A
  prompt Jev could not read is read once more, then drawn without a reading, which is logged. The continuity
  plan's own warnings (a state carried in words only, many changes at once, no
  visible action) are guesses never measured on pictures: logged. Not checks, and unchanged: the rewording of
  "you" into the third person (code, rule E3), a scene with no plan planned again (`planUnplanned`), and a scene
  whose camera faces something its plan lacks planned once more with Jev's plan facts (`planFacts`; a fact the
  plan is built from, not a check of a picture: S7 to decide). So "0 planned again" below is the gate's and
  "storyboard complete?"'s only: a scene can still be planned again on a Jev reading with the checks logging.
  **Readings pinned for S7** (review fixes, 27 Sep): each gate transition carries `ref` (the prompt's hash, the
  take it was read for, the hash of the questions as worded) and every answer with its bar, a sketch's parts of
  its look (`has_age` …, bar 0.5) included; each storyboard transition carries the view Jev was given; each
  picture keeps `checkedTakes`, one per take drawn (its prompt's hash, the gate's reading, what the checks
  found), where `gate` and `overrode` hold the latest only. The Stages panel says "would hold (only logged)"
  when the checks log (`/api/jev` returns `checks`), and a moment is not shown waiting at the shot for a
  storyboard reading only logged; `plan.ts --gate` prints "would hold" for what is only logged.
  **The eval as run (27 Sep).** The whole-conversation replays (`evals/replay.ts`) could not run: DeepSeek, which
  the producer, the host and the simulated dreamer call, refused every call (402, out of balance). The picture
  path was measured instead with `evals/redraw.ts`: a saved dream's picture path driven again with fake
  pictures and only Jev (the shots checked again on the floor plans it has, every sketch put through its gate
  and drawn, then every moment and in-between picture, the sketches taken as approved and a judge passing
  every take; every model step a check asks for is counted and fails, so the acting arm is a lower bound).
  Ten dreams: the five benchmark dreams (their record-on fake replays, `runs/record-fake/flow`) and five
  other simulated dreams (desert-station e130, grandma-kitchen e127, moon-market 2c51, paper-city d359,
  snow-train a44a), each acting and logging, with DREAMCHAT_RECORD off and on (DREAMCHAT_CUT_SHEET=shadow);
  counted by `evals/checks-log.ts` (the saved runs counted from what they kept, their logs predating the
  `check` transitions):

  | 10 dreams | saved runs (acting, 26 Sep) | acting, record off | acting, record on | logging, record off | logging, record on |
  | --- | --- | --- | --- | --- | --- |
  | moments drawn | 57/61 | 60/61 | 57/61 | 61/61 | 61/61 |
  | left undrawn or held by a check | 4 | 1 | 3 | 0 | 0 |
  | moments reworded (asked for) | 3 | (18) | (19) | 0 | 0 |
  | planned again: scenes before drawing / moments while drawing (asked for) | 17 / 13 | (10) | (11) | 0 | 0 |
  | brief set aside | not logged | 6 | 3 | 0 | 0 |
  | drawn although a check held it | 28 | 46 | 50 | 0 (73 and 78 readings only logged) | 0 |
  | sketches reworded, held or drawn although held; in-between pictures left undrawn | 10; 4 | 11 (11 rewordings asked); 0 | 13 (13 asked); 0 | 0; 0 | 0; 0 |
  | gate reading logged / storyboard reading logged | 0 of 61 / 53 of 53 | 61/61, 53/53 | 60/61, 53/53 | 61/61, 53/53 | 61/61, 53/53 |
  | Jev calls a dream (gate, storyboard and plan sites) | 245 (215) | 106 (105) | 111 (110) | 23.5 (22.7) | 23.6 (22.8) |

  The eight moments without a storyboard reading have no camera worked out on a floor plan, and are never
  asked, acting or logging. The acting runs' one undrawn moment not by a check (snow-train, record on), and
  snow-train m5-m7 waiting in the first logging run, were a take whose verdict was lost: not a race of the
  redraw but a live bug (`judgeWhenReady` kept the judge's verdict on a copy saved only after acting on it; a
  throw on the way, in vouching or in starting the next picture, lost it while the take stayed marked judged,
  so it was never asked again and what is drawn from it waited for a verdict or a restart). Fixed in the review
  fixes: the verdict is saved before it is acted on, a take is marked judged only once saved, and a picture that
  throws while it is started fails on its own ("could not be started", resumed like any unpaid failure) instead
  of taking the queue with it; a test throws after a verdict. The throw itself was not reproduced (8 more
  redraws of snow-train and sea-school ran clean); it is now logged (`judge` transitions, `after judging`).
  The redraw's resume workaround is gone. Model steps asked for that are not a check's:
  a new brief where a moment's view no longer matches the saved briefs (25-37 a run, both ways, the redraw's
  own: its moments go without their brief) and words for a look nobody described (3).
  Rewordings the checks made that no longer happen: in the saved runs sea-school m4 (its action; then left
  undrawn), moon-market m7 (its visual point and purpose; then left undrawn) and snow-train m7 (its action); asked
  for in the acting redraws, record off: crayon-cat m2 and m4, desert-station m2, m5 and m6, grandma-kitchen m2
  and m5, jellyfish-city m2 and m5, moon-market m5 and m7, office-snow m5, paper-city m3, sea-school m3, m4, m6 and
  m7, snow-train m3; record on: crayon-cat m2, desert-station m3-m6, grandma-kitchen m5 and m6, jellyfish-city m2
  and m5, moon-market m4 and m7, office-snow m4-m6, paper-city m3, sea-school m3, m5 (read by its findings) and
  m7, snow-train m2. Two thirds were for "its instructions may contradict each other" at 0.46-0.76, the rest "what
  to take from each image" at 0.41-0.59. Sketch looks asked to be reworded: 11 and 13 (the dreamer or a
  character in 8 dreams, a place or a thing in the rest).
  **Unchanged.** Prompt cases, acting against logging: no case changed, record off (6/33 counted, 36/36 guards)
  and on (18/33, 36/36). Corpus: frozen, record off 140 pictures the same, 0 changed; record on 139 the same, 0
  changed (both without the implied readings: their writer is DeepSeek); live, record off, 477 the same, 0
  changed. A rebuild never reads the checks, so the corpus cannot show the rewordings that no longer happen;
  they are listed above. **Live flow** (`evals/live-flow.ts`, which now reads a redraw too and counts the
  moments that differ only because a check acted): the saved record-fake flow replays 3 (jellyfish-city m5,
  sea-school m2 and m7, drawn without their brief); acting redraw, record on, 2 (sea-school m2 and m7 again);
  logging, record on, 0: jellyfish-city m5 and sea-school m2 and m7 rebuild word for word, and 57 of 61 moments
  do. The 4 that do not are no check's: a colour the dream gives something drawn later is in the rebuild's colour
  line and not in what was sent (sea-school m4 "orange octopus", snow-train m7 "red door"), and an earlier
  picture taken as a rebuild takes it (desert-station m6, paper-city m5); overlaps below.
  **Still to run once DeepSeek is topped up** (`runs/s2/run-arm.sh <label> act|log off|on`, the ten dreams
  replayed whole with fake pictures, off against on, record off and on): moments held, reworded, planned again
  and undrawn with the conversation driving them (the plan-time re-plans and rewordings above are counted as
  asked for, not done); Jev calls per whole dream, the turns' included; the live-flow check on those replays.
  They are the real measure: a redraw's logging arm starts from dreams planned and worded while the checks
  acted, so it inherits their plans and rewordings (moon-market m7, sea-school m4 and snow-train m7 were
  reworded then, and every scene the saved runs planned again stays planned again).
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
  **The sheet as sent, on fresh replays (27 Sep, writer Claude).** The five benchmark dreams replayed from the
  style choice with fake pictures (`DREAMCHAT_WRITER=claude DREAMCHAT_RECORD=on DREAMCHAT_CUT_SHEET=shadow
  DREAMCHAT_PROVIDER=fake bun --env-file=… run evals/replay.ts --out runs/s3-flow-claude2`, the checks acting as
  by default), then `DREAMCHAT_RECORD=on DREAMCHAT_CUT_SHEET=shadow bun run evals/live-flow.ts
  runs/s3-flow-claude2`. While drawing, every time a moment's prompt was built the sheet's was the same as
  framePrompt's: 48 of 48 builds, 24 moments sent (a first run, `runs/s3-flow-claude`: 34 of 34, 18 sent).
  Against a rebuild: every dream reads the record drawing read and places its cameras as drawn; 24 moments drawn,
  22 sheets as sent, 21 prompts word for word, 23 with the same images. The ones that differ are each a check
  acting: jellyfish-city m3 drawn without its brief (the pre-draw check set it aside; explained), crayon-cat m3
  (an earlier picture it takes was never drawn; explained), and jellyfish-city m7, which takes m6, a moment a
  check left undrawn: sent without it, rebuilt with it, so only the no-layering line and the sheet's names
  differ, no image, and live-flow does not explain it (it looks for a missing image) and marks the dream FAIL.
  With the checks logging none of the three can happen (S2's log arms). 8 of 32 moments were left undrawn by the
  checks acting ("still unsure of its instructions after rewording", jellyfish-city 4, sea-school 3, crayon-cat
  1). The first run: 18 moments drawn, 16 word for word, 18 as sent in images, 2 differing only in the brief the
  check set aside (explained); two of its dreams drew no moment (the simulated dreamer left once the sketches were
  up: fixed, 7c5df33).

- **S4 eval (camera rules).** Switch `DREAMCHAT_CAMERA=on`. Film grammar from `docs/rules.md` group A as rules over
  consecutive cut sheets: a reverse angle (the `reverse` tag) says what is now left, right and behind the camera,
  worked out from the floor plan, and is never edited from the picture before; a crossing of the line is flagged;
  a cut to the same subject must move the camera or change size; through the dreamer's eyes at most hands show and a
  held thing sits at the hands, not its floor-plan spot; what is seen beyond a place stays out of it; the mock-up's
  heights follow the record (water level, a boat rowed up to a window); the moment after a jump in the same place is
  not "another place" (relationIn bug). Proven on the S4 prompt cases (camera_turn_layout, pov, and the two S1
  water-level cases left for S4), guards all still met, the corpus diff reviewed, S3's tags as the input, and a
  live-flow check. Picture checkpoint after S4 (~$3, owner-judged) only if the prompt cases pass.

- **S5 eval (references and variants).** Written 27 Sep on branch `s5-eval`, before S5, from `lab/dream-chat`
  (a1e7d48; S4 is on `s4-camera`, not merged). S5 goes behind its own switch (for instance `DREAMCHAT_REFS=on`),
  off by default and off byte for byte (0 pictures moved, frozen and live, record and sheet off and on). S5 builds
  `chooseRefs` over the cut sheet (`docs/cut-sheet-map.md` §3), so it is measured with `DREAMCHAT_RECORD=on
  DREAMCHAT_CUT_SHEET=on`, and with the record off as a second reading.
  **What is measured.** Three instruments, none of which draws:
  1. `evals/references.ts` (new, deterministic, no model): every frozen dream (15, 115 moments) and every live one
     (59, 411; `--live --no-imply` with the record on, as S3 measured live) rebuilt as `plan.ts` rebuilds it,
     each moment's images read against the owner's rules. `bun run evals/references.ts --label <name> [--live]
     [--against <name>] [--show]` writes `runs/references/<label>.json`; tags come from the sheet (built in shadow
     when the switch is unset). It reads the images through `evals/prompt-cases.ts refsOf` (who each image is for),
     now also right for a crowd the record puts in view that framePrompt attaches a picture for.
  2. The prompt cases with four new code checks on the chosen references (`evals/prompt-cases.ts`):
     `first_image {is|not: mockup, edit, free}` (image 1 by the paired test's three ways), `none_from_other_side
     {roles?, degrees?}` (no earlier picture facing another side edited or taken for its layout: `other_side` by the
     words, or the cameras turned at least 135°; the jump's own picture and the seat are exempt),
     `waits_only_on_sent {moment?}` (nothing in the plan's `needs` goes unattached), `stage_image {who}` (one
     image of them, and it is their stage in force: the latest in-between picture of their changes the plan draws
     from one, else their sketch, else for someone with no sketch the picture they were last drawn in). Each is
     tested on frozen dreams, record off and on (`test/references.test.ts`).
  3. The paid checkpoint (~$3, owner-judged), for what only pictures settle (below).
  **Pass bars** (S5 on, record and sheet on, frozen and live; the before is today's code):

  | the reference check | bar | before frozen, record on (off) | before live, record on (off) |
  | --- | --- | --- | --- |
  | moments showing a subject by two images or more (D1) | 0 | 35 moments, 40 subjects (37, 45) | 91, 113 (95, 124) |
  | subjects not shown by their stage in force | 0 | 40 (45); 2 with two unchained in-between pictures of one place (6081 m9, 6e80 m7) | 113 (124) |
  | earlier pictures from another side edited or for layout (A2, C7) | 0 | 3 (3): affd m3, 09ea m7, aeea m10, all compositions the words call same side with the cameras turned 140-180° | 10 (10) |
  | pictures waited for and never sent | 0 | 67 in 65 moments: 44 kept for light alone, 23 kept for who someone is while each has a sketch (68 in 66) | 216 in 208: 122, 94 (218 in 210) |
  | images for their light alone (D2) | 0 | 0 (0) | 0 (0) |
  | in-between pictures under the owner's rule (D3) | 0 at the bar the owner sets | 25 (24 of a change, 1 of a side): 9 meet it at 3 changes, 21 at 2 (25: 7, 20) | 67: 18 at 3, 45 at 2 (66: 18, 46) |
  | moments still carrying 3 changes or more at once | 0 | 0 (0) | 0 (0) |
  | images a moment, most | at most 12 | mean 5, most 10 | mean 4.3, most 10 |

  How each is read. *One image per subject*: an image of the mock-up or the picture edited is not counted (they say
  where, not who). *Stage in force*: the ledger's approved in-between picture is what the rule names; a rebuild takes
  every picture as approved, so on the drawing path the stage falls back to the sketch until its in-between picture
  is approved (live-flow check). *In-between pictures*: each is kept only if some moment it serves would, without
  it, carry at least the bar's changes as the plan counts them (`CutPlan.changes`: the action, a reframing, a side
  never drawn, each change in force shown in no reference; a change the moment makes itself is its action);
  `evals/prompt-cases.ts ghostNeeds`. The plan's own bar is 3 (`continuity.ts TOO_MANY`: the action and two more);
  whether "several" means 2 or 3 is the owner's to settle (open questions). Dropping two in-between pictures from one
  moment can put it over the bar, so "moments still carrying 3 or more" must stay 0. *Variants kept and reusable*:
  an in-between picture is keyed by subject, kind and change (`ghostKey`) and is the one image of its subject for
  every moment its stage is in force, which the stage check reads; that a re-plan or a correction reuses a drawn one
  rather than drawing it again is a live-flow check (below). *Across a reverse*: S4 drops the picture before from
  the sheet's images, not from `needs` (overlaps S4 → S5); on this base the same shape is far wider, every picture
  kept for its light alone (the plan's `other_side` role) and every earlier picture kept for people who all have
  sketches is waited for and never sent. S5's `chooseRefs` owns both lists: what it does not attach, the plan does
  not wait for.
  **Image 1 by tag: reported, no bar.** The routing in `docs/cut-sheet-map.md` (the mock-up from outside, not
  through the dreamer's eyes, not across a jump or to another place, not a close-up) is not settled by the
  verdicts. The paired test (20 moments) has the mock-up right in 8 of 10 moments on that routing and 2 of 10 off
  it (through the dreamer's eyes 1 of 6); the story pictures, drawn with the mock-up as image 1, disagree: right in
  7 of 11 through the dreamer's eyes (seven guards among them), 5 of 17 two-shots, 8 of 11 wide shots. Today the
  mock-up is image 1 off that routing in 40 frozen moments (live 108) and the sketches alone on it in 1 (live 61).
  S5 may change image 1 only behind its switch and only as far as the paid check supports; the check's table
  (`image 1 by role`) is kept for S5's after.
  **Never edit a picture drawn from another side** is the owner's rule and is kept as a guard, not a win: today's
  routing never edits across a move of the camera. The verdicts do not make it a picture rule on their own: across a
  reverse by the cameras (9 paired moments) the edit of the picture before was right in 6 (orchard m6 and m7,
  library-1 m5, library-3 m2, lighthouse-fresh m3 and m12), partly right in 2 whose notes name the background kept
  (lighthouse-fresh m2, snow-train m2) and wrong in 1 (library-1 m4). A composition taken from the other side is
  the same fault in a weaker form (the three frozen moments above); no verdict tests it, so it is held by the
  check, not by a case.
  **Prompt cases** (`--step S5`, 27 cases; `evals/prompt-cases.json` gains 9, all hypotheses, from the paired
  verdicts: image 1 as the version the owner called right, against the version with the fault). Before, record and
  sheet on (record off the same but snow-train-2-m6-two-suitcases not met, its in-between picture still attached):
  counted 6/7 met (library-1-m4-edit, snow-train-2-m6-size, orchard-m2-edit, lighthouse-first-m8-edit,
  lighthouse-fresh-m2-reverse and -key-size met; library-1-m5-window not met: "still a solid wall" 0.23, which may
  need S4's windows on walls rather than a reference); guards 2/2 (pass-library-1-m1, pass-library-2-m1); model only
  4/4 met (lighthouse-fresh-m14, snow-train-m4, library-3-m5, night-market-m2 identity); hypotheses 5/14: met
  snow-train-2-m6-two-suitcases and the four new ones that keep the mock-up from outside (snow-train-2-m6-route,
  snow-train-2-m5-route, night-market-m2-route, library-1-m4-route); not met orchard-m2-mockup (the mock-up, and
  Tomas in three images: his sketch and two in-between pictures), lighthouse-first-m7-room, lighthouse-first-m8-mockup,
  snow-train-m6-open-door, and the five new ones that move image 1 off the mock-up (snow-train-m6-route,
  orchard-m7-route, lighthouse-first-m7-route, heron-m4-route through the dreamer's eyes, in another place or for a
  crowd; lighthouse-first-m8-route, the sketches alone across a jump). All 94 cases: 18/33 counted (4/8 needing a
  model step), guards 36/36, hypotheses 6/18; record off 6/33, 36/36, 4/18; against the 85-case run no case moved.
  **Must not move:** guards 36/36 (record on and off); the six counted "no edit across a move" cases; the four
  model-only identity cases (one image of the dreamer); 18/33 counted with the record on; images for light alone
  0; at most 12 images.
  **What only the paid checkpoint proves** (~$3 at $0.15 a picture: about ten moments, old against new, one take
  each, judged blind by the owner; redraw only moments S5 changed):
  - One image per subject on pictures the owner called right: 14 guards were drawn with a subject's sketch beside
    its in-between pictures and called right (library-2 m2, m3, m4, m6, m7, m8; library-3 m3, m4, m6; snow-train
    m6; snow-train-2 m3; orchard m2, m3, m5), so D1 is unproven as a picture rule. Redraw orchard m2 (Tomas, three
    images to one), library-3 m4 (the room's sketch and two in-between pictures to one), snow-train-2 m3.
  - Dropping an in-between picture under the owner's rule: at a bar of 3 six guards lose one (library-2 m2,
    snow-train m6, snow-train-2 m3, orchard m2, m3, m5), at 2 only snow-train-2 m3. Redraw two of them; the bar
    the owner sets decides which.
  - A place's one image: D5 says a place's state has one carrier and the mock-up without the state beat the
    in-between picture that had it (the library runs), so whether a place's in-between picture replaces its sketch
    needs one library moment (library-3 m3).
  - Image 1 by tag, only if S5 changes it: two through the dreamer's eyes (snow-train m6, orchard m7) and two
    from outside (night-market m2, snow-train-2 m6), the mock-up against S5's choice.
  **Live-flow check** (owed, needs fresh fake replays and so DeepSeek): the references on the drawing path equal a
  rebuild's (the sheet's print), the stage image falls back to the sketch until its in-between picture is approved,
  a re-plan or a correction reuses a drawn in-between picture by its key, and nothing waits on a picture it is
  not sent.

- **S9 eval (the record of what was drawn, and staleness).** Written 27 Sep on branch `s9-as-drawn`, before S9,
  from `lab/dream-chat` (9655d62). Switch `DREAMCHAT_AS_DRAWN=on` (off by default). Off, nothing is kept and every
  prompt is as before: 0 pictures moved on the frozen (115 moments, 25 in-between pictures) and live corpora, record
  and sheet off and on. On, the corpora do not move either, since none of their dreams was drawn with the switch on
  and a rebuild reads a record only where a picture has one. Staleness is reported, never acted on: nothing is
  drawn again, held or planned again because of it (what to do with a stale picture is the owner's to decide).
  **What S9 keeps.** For every take of every picture drawn (moment and in-between picture), on the picture: what was
  sent (the prompt, and each image by what it is, `sketch:p1`, `picture:m3`, `ghost:t1:lid`, `previs:m5`, with its
  role and instruction), the take, the picture as it held itself then (a moment's words and whether each was said,
  who and what is in it, its plan, its brief; an in-between picture's plan), each sketch and earlier picture it was
  drawn from with the take it was then, the story record's facts in force on everyone in it, the look it was drawn
  in, its cut sheet's print where one was built, and each input by name with a hash (what staleness compares).
  **Staleness.** After any change (a correction in the chat, a re-plan, a change to the story record, an earlier
  picture drawn again, a sketch drawn again or its look reworded, the look changed), each drawn picture's record is
  compared, input by input, with what drawing it again now would read: its words and cast as it holds them now,
  the plan as a re-plan makes it now, the sketches, earlier pictures, record and look as they are now. A picture is
  stale where an input differs, and says which (its words; who is in it; its camera or brief; what it is drawn
  from; the record's facts; a sketch; an earlier picture's take; the look). *Sequences*: a picture drawn from a stale
  one, or from an earlier take of one drawn again since, is stale in turn, down the chain it was drawn along. *Look
  keys*: a picture whose look (the chosen style) or whose subjects' looks (a sketch's words and take) changed.
  **What is measured** (nothing is drawn but fake pictures; only Jev is called, in the redraws):
  1. The ten dreams of S2's redraws drawn again with the switch on (`evals/redraw.ts`, DREAMCHAT_CHECKS=log,
     DREAMCHAT_RECORD=on, DREAMCHAT_CUT_SHEET=shadow, fake pictures), read by a new `evals/as-drawn.ts` and by
     `evals/live-flow.ts`.
  2. Changes made to copies of those dreams after drawing, one at a time, each with the pictures it must make stale
     worked out apart from the staleness code, from what each picture was sent (its images by name): a moment's
     words corrected (the first moment others were drawn from); the dreamer's sketch drawn again; a sketch's look
     reworded, words only; an earlier picture drawn again (a new take); the look changed; a lasting change told
     otherwise in the breakdown (the record changes).
  3. The saved dreams, drawn before S9 and so with no record: stale pictures found from what their Strawberry store
     kept (each image a picture was sent that is no longer the take its picture or sketch has now; the look named
     in its prompt against the look chosen now), then down the chain; a sample hand-checked.
  4. Committed tests (`test/asdrawn.test.ts`): a dream drawn with the switch on keeps a record for every take; with
     nothing changed no picture is stale; a correction to a moment makes exactly the pictures drawn from it stale; a
     sketch drawn again makes exactly the pictures showing it, and those drawn from them, stale; the look changed
     makes every picture stale; with the switch off nothing is kept.

  **Bars:**

  | measure | bar | before |
  | --- | --- | --- |
  | pictures drawn with the switch on that have a record for their take (moments; in-between pictures) | all | none kept |
  | a rebuild reading the records gives every picture drawn as sent, prompt and images (moments; in-between pictures), where nothing changed | all | S2's log-on redraws: 57 of 61 moments; 6 of 16 in-between pictures |
  | live-flow on the redraws: dreams failing; sheets as sent | 0; all | 4 of 10; 54 of 61 |
  | pictures stale on dreams nothing changed in after drawing | 0 | (nothing reported) |
  | each made change: pictures found stale against those it must make stale | the same set, each with the right reason | (nothing reported) |
  | each made change: a rebuild reading the records still gives every picture as sent | all | (no record) |
  | saved dreams: stale pictures found, with reasons; a hand-checked sample | reported; none of the sample wrong | (nothing reported) |
  | corpora, switch off and on, against the base | 0 pictures moved | |

  How each is read. *The four moments that differ from a rebuild* (S2's live-flow: sea-school m4 and snow-train m7,
  a colour in the colour line; desert-station m6 and paper-city m5, the images) and the in-between pictures whose
  look lines differ are, found while writing this eval, one fault: a picture holds its own copy of itself, made
  from the plan of the day it was first put in (a moment's words, reworded before drawing and so no longer marked
  said, while the breakdown keeps them said; the people and things in it, which a re-plan does not update, only its
  plan; an in-between picture's plan, made before the record gave the look before its change), and a rebuild makes
  every picture afresh from the breakdown and the plan now. Drawing reads the copy. The record keeps the copy as
  drawn, so a rebuild reading it gives what was sent; desert-station m3-m6's sheets differ in `tree` for the same
  reason (the drawing path's tree reads each moment's own plan). Whether the copy itself was already behind the
  dream when drawn (paper-city m5 was drawn without the red paper bird the record now puts in the dreamer's hands)
  is reported apart, as drawn behind the dream, and is not staleness (nothing changed after drawing). *A made
  change* is counted right only where the pictures found stale are exactly those it must make stale; a picture
  found stale by the plan made again (a change can move later cameras) is listed and hand-checked, not counted
  wrong. *Saved dreams*: their prompts were written by older code, so a whole prompt cannot say what changed; only
  images, which name a take, and the look's name are read; words, cast and record are not.
  **Must not move:** the corpora (0 pictures, switch off and on); `bun test` and the typecheck with the switch off
  and on; the prompt cases (no case moves: they read `rebuild`, and the frozen dreams have no records).

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
| S1 | S2 | The live-flow check (`evals/live-flow.ts`) passes a moment the checks acted on: drawn again from a list of what went wrong, or drawn without its brief because the pre-draw check set it aside (5 of 26 moments on the fake replays, 27 Sep). A rebuild cannot know these; once S2 makes the checks log only, those moments should rebuild word for word. Done on the picture path (27 Sep): with DREAMCHAT_CHECKS=log the redraws of those dreams have 0 moments differing because a check acted (jellyfish-city m5, sea-school m2 and m7 rebuild word for word); to confirm on whole replays once DeepSeek is back. |
| S2 | S7 | The checks' readings, logged per picture with DREAMCHAT_CHECKS=log: `gate` transitions in each dream's Jev log (every answer with its bar, what it found, and whether it acted), `previs` transitions for "storyboard complete?", and `overrode` on the picture as drawn. S7's labelled sets are these against the pictures. A reading is not put on a line when logging (the line search was 4 in 5 of the gate's calls): if S7 needs the line a reading rests on, it asks for it on the logged prompt. Each reading carries `ref` (prompt hash, take, question-wording hash) and each picture keeps `checkedTakes`, so a label joins the take it was read for. |
| S2 | S7 | Still acting with the checks only logging, and not a check of a picture: `planFacts` plans a scene once more where Jev reads that its camera faces something the plan lacks (a Jev reading acting on the plan: S7 decides whether it earns it, like any check); `planUnplanned` where a scene has no plan. Only code faults hold a picture (`actsWhenLogging`); the continuity plan's warnings (carried in words only, many changes at once, no visible action) are logged, and S7 decides whether any earns acting. |
| S2 | S9, S3 | A redraw (`evals/redraw.ts`) found moments a rebuild does not give as sent, no check's doing: the style's colour line takes a colour the dream gives something drawn later (sea-school m4 "orange octopus", snow-train m7 "red door"); an earlier picture taken as a rebuild takes it (desert-station m6, paper-city m5); desert-station m3-m6's sheets differ in `tree`; the in-between pictures' look lines are sent with commas and rebuilt with semicolons (desert-station, grandma-kitchen, paper-city, snow-train). What a rebuild reads should be the dream as it stood when the picture was drawn (S9's record of what was drawn). |
| S1 | S9 | The Strawberry production is written at `start`, before planning and the implied reading, so implied changes have no production coverage. |
| S2 | S7 | S2 makes the checks log only; their logged readings become S7's labelled sets. |
| S7 | S8 | Done in S8 for now (behind DREAMCHAT_LISTEN=on), and S7's to own: `jev.ts choiceByAction` sums the labels that lead to one action before the bar; the action that loses nothing (revise a profile, take a correction) is taken from 0.25, "you choose" beside a change is the change, and otherwise a rival at 0.25 is asked again; the profile's answer is worded so a detail beside "leave the rest to you" is a change (`PROFILE_REPLY_S8`). Read again over the three after-runs' stored answers: changes read as settled 31/26/17 to 9/7/3, clear answers read as unclear 0, and answers changing nothing now read as changes 12/18/12 (27 of 37 a profile answer that only restates it, which the revision keeps; 10 a plain "yes, that's right" to a retelling, which costs a turn telling back). These bars, and the reply check's questions (`jev.ts replyCheck`), are hand-set: each needs the labelled set S7 builds for its questions. The check lets through follows that guess what happened next ("did you go through it?", 3 of 4 on `evals/listening-audit-s8.json`, where the listening test catches all 4). |
| S8 | S1 | `producer.ts inTheirWords` is provisional: whether a reworded or revised profile field is still the dreamer's words is a word-overlap rule over their messages (read from the conversation as kept, not the rendered text), standing in for the per-clause said basis S1 owns; it goes once the record carries the basis per clause. 22% of "said" facts were never said (the before: 273 of 1227, 258 from sketch profiles). S8 fixed the sketch side (a reworded or revised profile keeps their words apart from ours: 1% left, 12 of 912), but the breakdown's own fields are still graded whole by `ground.ts` ("the corridor: perhaps lockers or doors" passes because the corridor was said): every one of the 12 left. A `Detail` holds one said flag, so a field with their words and a guess is either said whole or not at all; the basis belongs per clause in the breakdown, the record and the sheet (S1, S3). |
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
| S3 | S2 | On the drawing path the gate drops a moment's brief when it finds the prompt at odds on "The shot" line; a rebuild cannot know it did. A moment now keeps a print of the sheet it was sent with (`sentSheet`), and the live-flow check counts a sheet that differs only in the brief as explained where the prompt is (jellyfish-city m5, sea-school m2 and m7 of the record-fake flow replays, drawn before the print was kept). It goes once S2 makes the checks only log. With DREAMCHAT_CHECKS=log the brief is never set aside (0 in 20 redraws, against 3-6 acting) and those sheets match; the explanation in live-flow can go when log is the default. |
| S3 | S4 | Tags `move`, `crossed` and `role` are the camera rules' inputs: a reverse is the camera turned at least 135° from the cut before in the same place (snow-train m2 and lighthouse-fresh m12 read as reverses); `crossed` is its side of the scene's line (the tree's, from the scene's first two-shot) differing from the cut before's; `role` is counted from who is in view and the size, with the tree's over-the-shoulder, since `outsideShot` still returns only words. Consecutive sheets (`prev`) are what S4's rules read. |
| S3 | S4 | `relationIn` (continuity.ts) calls the moment after a jump "another place" from the jump's own picture in the same place (the key-and-boat dream m7 and m9, the lift m5): a jump moment counts as a boundary behind itself. The move tag and the plan's references both read it; fixing it changes plans and prompts, so it is S4's, measured. |
| S3 | S5 | The sheet's `inView[].image` is the sketch only; `earlier` is the plan's choice. S5's `chooseRefs` needs each element's image of the stage in force (its in-between picture, drawn and approved, or its sketch) from the tree's ledger, and chooses image 1 by the tags. |
| S3 | S7 | Every cut has its tags (logged in shadow, listed per moment by `evals/corpus.ts`); S7 routes questions by them. |
| S3 | S9 | A re-plan updates the moments' plans but not `build.plan`; the drawing path's sheet reads each moment's own plan. A sheet is flagged `record_moved` where the record now differs from the typed facts its plan was made from: stale, for S9. Frames saved before S3 carry the plan's words without typed facts (`nowWords` on the sheet). |
| S3 | S1 | The story record is made three times from the same inputs: for the plan (`recordForPlan`), for the sheet (`sheetDream`, once per drawing of a moment) and for the panel's tree. One record per dream, passed to all three, is the next step once the sheet is on. |
| S4 | S5 | Found by S4 (branch `s4-camera`, not merged): across a reverse the picture before is dropped from the sheet's images (`rules.dropped`), not from the plan, which still lists it in `needs`, so the moment still waits for it. On `lab/dream-chat` the same holds far wider (S5 eval): every picture kept for its light alone and every earlier picture kept for people who all have sketches is waited for and never sent, 67 pictures in 65 of 115 frozen moments and 216 in 208 of 411 live. S5's `chooseRefs` owns it: what it does not attach, the plan does not wait for (`waits_only_on_sent`, bar 0). |
| S5 | S4, S3 | Three frozen moments (10 live) take an earlier picture's layout (composition) that the words call the same side while the cameras on the floor plan face 140-180° apart (affd m3, 09ea m7, aeea m10): `relationIn` reads words only. S4's `sidesByCamera` may reclassify them; S5's `none_from_other_side` reads the cameras either way. Measure on S4's merge. |
| S5 | S1 | Whether an in-between picture meets the owner's rule depends on what the record carries: with the record off the suitcase's open lid is carried to snow-train-2 m5 and its in-between picture meets the bar (3 changes); with it on the lid is shut again and it serves only m3 (1 change). S5's measure is taken with the record on. |
| S5 | S3, S9 | The stage in force is "the approved in-between picture, else the sketch", but the sheet's tree has no drawn or approved state in its ledger (S3 debt) and a rebuild takes every picture as approved: the fall-back to the sketch on the drawing path is only seen in a live-flow check. |
| S5 | S6 | The evals re-derive who each attached image is for (`prompt-cases.ts refsOf`): it missed a crowd the record puts in view, which framePrompt attaches a picture for (four live moments read as images for their light alone; fixed in the S5 eval). `assembleCut` knows each image's subject; S6 could return it with `references`, so the evals read it instead of working it out again. |
| S5 | S5 | Contradictions S5 must not settle by code alone (owner or paid check): D1 (one image per subject) against 14 guards drawn with a sketch beside its in-between pictures; D3's bar (2 or 3 changes); D5 (a place's state has one carrier, the mock-up beat the in-between picture) against a place's in-between picture as its one image; the mock-up through the dreamer's eyes (paired 1 of 6 right, story 7 of 11). |
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

- **The writer is now Claude (27 Sep).** DeepSeek's balance is empty (402), so every writer call (Berry's replies,
  the producer, the floor plans and briefs, the rewordings, the implied-state reading, the simulated dreamer) runs
  through the Claude Code CLI with `DREAMCHAT_WRITER=claude` (55afcd1; Claude Opus 5.5, about 5 s a call, on the
  owner's subscription). What it changes: a measure taken with DeepSeek and one taken with Claude are not the same
  measure, so every before/after is made again with both arms on Claude (S8's before is simulated again at 4c0e52c
  with the switch cherry-picked; S2's arms are all on Claude); the DeepSeek numbers stay in this plan for reference
  only. Caches (implied readings) are keyed by the writer's model, so Claude's readings are fresh. Two faults of
  Claude's replies were found and fixed: a JSON reply with an unescaped quote (one breakdown in 13) ended that
  dream's pictures (e49ce98: asked again, told why, three tries), and the simulated dreamer thanked Berry and left
  once the sketches were up (7c5df33: it stays until the dream is drawn; S8's arms keep the dreamer they started
  with, the same in both). DeepSeek is still the default; whether to top it up, or keep Claude as the writer, is
  the owner's call.
- **Resolved (27 Sep):** Jev credits restored by the owner. Was: the Jev (TypeSafe) account ran out of credits; every Jev call returns 402
  billing_error. Every test that asks Jev (prompt-case questions, the implied-state reading's checks, listening
  scores, simulations) is stalled until it is topped up. Work that needs no Jev continues meanwhile.

- **For S5: how many changes make "several"** (the in-between picture rule). The plan's bar is the action and two
  more (3): 9 of the 25 frozen in-between pictures meet it, and six guards the owner called right lose one
  (library-2 m2, snow-train m6, snow-train-2 m3, orchard m2, m3, m5). At the action and one more (2): 21 meet it and
  only snow-train-2 m3 loses one. The paid checkpoint redraws two of them either way.

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

- 27 Sep: S8 review fixes on `s8-listening`, rebased on the merge (all behind DREAMCHAT_LISTEN; off unchanged, the prompt
  cases and the frozen corpus with the switch off and on: no case changed, 140 of 140 pictures the same). No fresh
  simulation: the writer model's balance is spent (402), so each fix is proven offline.
  - Rule 6b (come back to an earlier thread) fires only once the dream is told, never twice in a row, only on a
    thread older than the turn before, and counts toward the follow cap (`lib.ts followStreakOf`). Move selection
    replayed on the stored conversations (`evals/probes/listen-moves.ts`; at the merged head it picks the recorded
    move 552 of 552 times): of the third after-run's 117 circle_backs, 4 still fire, none while the dream is still
    being told and none on the message just before the latest (before: 40 and 72); in the first after-run, which
    had no rule 6b, it would fire 75 times, all once the dream was told. Replayed one step at a time, the other
    decisions shift because the stored history holds the old circle_backs.
  - The listening test gains move selection (review: the reply checks passed the interrogation): answers "I don't
    remember", questions asked again, retellings begun as "told all they remember", and, shown, replies reading like
    a form; misread gains "a change read as settled". Rescored (the before's own numbers reproduce exactly):

    | measure | before | after1 (ce869f0) | after2 (1b62461) | after3 (ee6c1e3) |
    | --- | --- | --- | --- | --- |
    | answered "I don't remember" | 43/515 (8%) | 38/445 (9%) | 52/564 (9%) | 65/512 (13%) |
    | asked again about what was asked | 50/408 (12%) | 68/407 (17%) | 151/523 (29%) | 112/471 (24%) |
    | retellings begun as told all they remember | 2 | 3 | 2 | 11 |
    | "what happened next" / "what did X look like" | 26 / 10 | 84 / 15 | 116 / 13 | 107 / 131 |
    | a change read as settled | 11 | 31 | 26 | 17 |
    | retelling words, mean | 133 | 249 | 256 | 258 |

    Asked again comes from follow ("and then what happened?" word for word: 62 of 131 follows in after3) and from
    circle_back (29 of 117); the follow brief no longer gives the example and asks for other words than last time.
    Not provable without a simulation.
  - Choice readings: see the S7-S8 overlap (changes read as settled 31/26/17 to 9/7/3 on the stored answers).
  - The retelling's breakdown is started once the dream looks told (at most every third turn) and used at the
    retelling when nothing told since added to what happened; its prose is two or three short sentences before the
    list. Latency and length need a simulation.
  - Independence: `evals/listening-audit-s8.json`, 38 replies written with S8 on, labelled by hand and used to tune
    neither the test nor the check. The test agrees on 38/38 moves, 37/37 either/or, 36/38 leading; the check on
    35/38, 37/37, 34/38 (it passes 3 follows that guess or ask a detail; at 0.3 it reads 4 open questions as leading).
  - Still to prove with a fresh simulation (20 dreams once, at low concurrency, stopping on a writer-model error):
    every target and floor, above all "I don't remember", asked again, retellings begun as told all they remember,
    and the retelling's wait and length.
- 27 Sep: S2 built on branch `s2-checks-log` (DREAMCHAT_CHECKS=log; acting, as before, by default). The gate, the
  storyboard check and the sketch gate run and log every reading per picture; nothing is held, reworded, planned
  again, drawn without its brief or left undrawn for one; only code faults in the images keep acting (listed
  under S2's eval above). Every action a check takes when acting is now logged too (`check` transitions), so the
  two can be counted alike (`evals/checks-log.ts`). DeepSeek ran out of balance, so the whole-conversation replays
  could not run; the picture path of the ten dreams was redrawn instead with fake pictures and Jev only
  (`evals/redraw.ts`). Logging: 61/61 moments drawn, 0 actions by a check, every gate and storyboard reading
  logged, Jev 23.6 calls a dream (acting 106-111, the saved runs 245); prompt cases and corpus unchanged; live
  flow 0 moments differing because a check acted (3 in the saved replays). Found on the way: a redraw that started
  moments before the sketches were approved (fixed in the redraw), a take whose verdict was lost (at first
  worked round in the redraw; a live bug, fixed in the review fixes below), and four rebuild differences no check explains (overlaps S2 → S9, S3).
  `bun test` 487 pass in every combination of DREAMCHAT_CHECKS, DREAMCHAT_RECORD and DREAMCHAT_CUT_SHEET with a
  60 s timeout (at the default 5 s, 0-3 of the heaviest rebuild tests timed out while the machine ran at load
  26, in either setting); typecheck clean.
- 27 Sep: S2 merged behind DREAMCHAT_CHECKS=log. Redraw of 10 saved dreams (Jev only, fake pictures): 61/61 drawn, 0
  reworded or re-planned by a check, Jev calls 106 -> 24 per dream; prompt cases and corpus unchanged. Review: OK
  behind the switch; found a real live bug (a judged picture whose save fails is never re-asked, so what follows
  it waits), readings not yet pinned to prompt/take for S7, the Stages panel still says "held". Being fixed.
- 27 Sep: S2 review fixes on `s2-checks-log`. The lost verdict: saved before it is acted on, marked judged only
  once saved, and a picture that throws while starting fails on its own; test added (a throw after judging,
  the dependant resumed and drawn). Readings pinned for S7 (`ref`, sketch facets, the storyboard view,
  `checkedTakes`). The Stages panel and `plan.ts --gate` say "would hold" when only logging. The in-between
  picture's "not a picture" pattern dropped (its plan issues never reached the gate). A prompt Jev could not read
  is read once more when logging. Said plainly: `planFacts` still plans a scene again on a Jev reading (overlap
  S2 → S7). Log-mode tests: a moment failing "storyboard complete?" when drawn is drawn with its reasons kept;
  a code fault still leaves a moment undrawn; an in-between picture is drawn with what the gate found. DeepSeek
  still out: nothing replayed.

- 27 Sep, S2 review fixes merged (50dbd8c): a judged take's verdict is saved before anything acts on it (the
  lost verdict that stalled dependants was not a race; what threw was not reproduced in 8 more redraws, and a
  picture that throws while starting now fails alone and restarts on resume); readings pinned (`ref`,
  `checkedTakes`, facets, the storyboard view text); Stages panel says "would hold (only logged)". 524 tests
  pass, default and log mode. S2 stays open until the whole-dream replays run after the DeepSeek top-up.
  S4 built on `s4-camera` (55815a0): S4 cases 1/11 → 10/11, all counted 18/33 → 27/33, guards 36/36, switch
  off 0 of 618 pictures moved; under independent review. S5 eval being written.
- 27 Sep: S5's eval written on branch `s5-eval`, before S5 (above). New: `evals/references.ts`, a deterministic check
  of every moment's images over the frozen and live dreams, and four prompt-case checks on the chosen references
  (`first_image`, `none_from_other_side`, `waits_only_on_sent`, `stage_image`), with 9 hypothesis cases from the
  paired verdicts for image 1. Before (record and sheet on, frozen): a subject shown by two images or more in 35 of
  115 moments; 67 pictures waited for and never sent; 3 layouts taken from the other side by the cameras; 9 of 25
  in-between pictures meet the owner's rule at 3 changes. Prompt cases unchanged by the new checks (18/33 counted,
  36/36 guards; S5 6/7 counted). Found: the verdicts do not settle image 1 by tag (the paired test and the story
  pictures disagree through the dreamer's eyes) nor one image per subject (14 guards were right with two or three),
  so both are for the paid checkpoint; the rule against editing from another side stays the owner's rule, held as a
  guard. No pictures drawn, no money spent.

- 27 Sep, owner's decision: "several changes" in the in-between picture rule means **2 or more**. An edit that
  carries 2+ changes gets in-between pictures; one change goes straight. S5 builds to this bar (its eval's "at 2"
  column: 21 of 25 frozen, 45 of 67 live meet it today; snow-train-2 m3 is the one guard that loses its
  in-between picture and goes to the paid check).
- 27 Sep: the writer model is now Claude (`DREAMCHAT_WRITER=claude`, 55afcd1), DeepSeek's balance being empty.
  The waiting proofs (S8's fresh simulation, S3's sheet-as-sent replay, S2's replays, new implied readings) are
  running with it, both arms on Claude, since the DeepSeek-made befores are not comparable.
- 27 Sep: S3's sheet-as-sent proof, on five fresh replays written by Claude (record on, sheet in shadow, checks
  acting): `assembleCut` wrote what framePrompt writes on 48 of 48 builds while drawing; against a rebuild 22 of 24
  sheets as sent, 21 prompts word for word; the 3 that differ are each a check acting (a brief set aside, an
  earlier picture left undrawn twice), one of them not explained by live-flow (a missing earlier picture that
  changes a line but no image). Two faults of Claude's replies fixed on the way (e49ce98 JSON asked again, 7c5df33
  the simulated dreamer stays until the dream is drawn). S2's whole replays and S8's fresh simulation running.
