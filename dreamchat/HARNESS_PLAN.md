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
| S0 | Eval foundation: a prompt-case set from the person's 122 verdicts and notes, a runner that rebuilds prompts from saved dreams and scores them, the free simulation corpus as regression | built | Every noted fault has a case; the runner reproduces today's failures. Baseline: 2 of 38 failing cases met, 28 of 28 passing cases met (below) |
| S1 | Story record carries state (water, suitcase, who holds what, presence) into continuity, in-between pictures and prompts | building | The state cases in S0 pass; no regressions on the corpus |
| S2 | Stop stand-in checks deciding: the pre-draw prompt check and storyboard check only log | not started | No moment held or reworded; corpus unchanged otherwise |
| S3 | The cut sheet: tree (vertical) + record (horizontal) + relations + tags, one per cut | not started | Every input the prompt needs comes from the sheet; no fact computed in two places |
| S4 | Camera rules and shot roles: the scene's line, a reverse angle turns the room (what is now left, right, behind), point-of-view shots show at most hands, vehicle screen direction, same setup means the same camera | not started | The camera cases in S0 pass (snow train m2/m3, lighthouse m2, orchard m2/m7) |
| S5 | References and variants: one image per subject; in-between pictures only when an edit carries several changes; variants kept and reusable; the grey mock-up as a reference chosen by tag | not started | Reference cases pass; no moment gets two images of one subject |
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

## Open questions for the owner

- In `evals/paired-verdicts.json`, the sketches-only version of lighthouse-first m7 carries the same note as orchard
  m7 (about Tomas), on a picture rated right: probably typed on the wrong picture. Left as is until confirmed.
- S0, the prompt cases: `evals/prompt-cases.json` (75 cases: 47 from faults the owner noted, of which 7 are the
  image model's alone and 2 are set aside as disagreeing with the dream as told, and 28 moments the owner called
  right, as regression guards). `bun --env-file=$HOME/.config/strawberry/dreamchat.env run evals/prompt-cases.ts
  --label <name> [--against <name>] [--only <case> …] [--show]` rebuilds each moment exactly as `plan.ts` does
  (`rebuild`, under the environment's switches), runs its code checks and asks Jev its yes-or-no questions about
  the prompt (answers cached by hash, `runs/prompt-cases/jev-cache.json`), and writes
  `runs/prompt-cases/<label>.json`. The rebuild matches the prompts sent on 25-26 Sep in 620 of 699 paragraphs;
  the rest is code changed since. Cases by step: S1 the state_carried, holding and presence cases; S4
  camera_turn_layout and pov; S5 reference_conflict and the one-image-per-subject checks; S6 all.
- S0, the corpus: `bun run evals/corpus.ts --label <name> [--against <name>] [--set benchmark]` rebuilds every
  saved dream with a settled breakdown and look (54 dreams, 379 moments, 58 in-between pictures on 26 Sep) and
  writes `runs/corpus/<label>.json`; `--against` writes what changed, picture by picture. No model calls.
- Baseline (26 Sep, today's defaults), failing cases met per class: state_carried 0/11, presence 0/2, holding 0/2,
  camera_turn_layout 1/7, pov 0/5, action 0/4, reference_conflict 1/4, proportion_or_paste 0/3; all 2/38. The two
  met are faults of the edit version only, which today's routing does not draw (lighthouse-fresh m2, library-1
  m4). Passing cases 28/28; the 9 kept out all met. Jev is reliable on one concrete fact per question and not on
  joined, implied or consistency questions: every question is one fact, and answers within 0.1 of the bar are
  marked.

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
