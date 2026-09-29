# Dream chat harness: the root-fix plan

The single source of truth for rebuilding the dream chat harness from its root. Read this first in any new
session; update the at-a-glance table, the status table and the log at the end of every step.

## At a glance (27 Sep)

The owner's view of where every step stands, kept current at the end of every step (the detail is in the status
table below). This file, on `lab/dream-chat`, is the record any account or session can read; Engram's fever-dream
context mirrors it.

| Step | Status | Latest result |
| --- | --- | --- |
| S0 The test set from the owner's verdicts | Done | 85 prompt cases from 122 verdicts |
| S1 The story record carries state | Done | faults met 6/33 to 18/33, guards 36/36; with Claude reading what the moments imply, 19/33 and S1's cases 12/13 |
| S2 Checks only log | Done | whole-dream replays on Claude: logging drew 127/127 moments, 0 held or reworded, Jev ~41 calls a dream (acting: 14 undrawn, 54 reworded, 306-324 calls); logging is the default since 27 Sep (`DREAMCHAT_CHECKS=act` brings acting back) |
| S3 One cut sheet per picture | Done | the sheet's prompt equals the old builder's on 1052 rebuilds and 48 of 48 live builds |
| S4 Camera rules | Merged behind DREAMCHAT_CAMERA (off; needs the cut sheet and, since 29 Sep, the story record on); picture check judged and its misses traced | owner's blind A/B on 20 moments ($3, spent): new right 15/20 against old 10/20; faults put right 5/7; guards 10/13 new, 9/13 old; 5 misses traced to root causes; 1 of 5 fixed on lab (fixtures up their walls, the front wall never labelled with a fixture's name), 4 left, each with where it starts (log) |
| S5 References and in-between pictures | Merged behind DREAMCHAT_REFS (off; needs the cut sheet on); second review's fixes (earlier pictures, their gate, sides) merged 29 Sep with the review's own two fixes; the S5 picture check not yet re-proposed (see "S5 fix round two") | the reference check, record and sheet on, frozen / live (with implied readings): a subject by two images 40 / 103 moments to 0 / 0; waited for and never sent 67 / 215 to 1 / 1 (a picture judged wrong, drawn); from another side 2 / 8 to 0 / 0; earlier pictures sent against the cut's camera or state, for layout 2 / 37 to 0 / 0 (16 live edits with no floor plan to compare), for look 22 / 51 to 0 / 0; in-between pictures not needed 17 of 29 / 44 of 79 to 0 of 12 / 0 of 37. Prompt cases: guards 36/36, counted 19/33 and 27/33 (camera) with S5 off and on, hypotheses 5 to 10 and 7 to 12 of 18 |
| S6 One prompt builder, clean-ups retired | Merged 29 Sep behind DREAMCHAT_ONE_BUILDER (off; off is today byte for byte); stopped at a clean point (27 Sep): ledger rows 1, 3, 4 done, row 2 stopped (needs row 17), rows 5-34 open in order | rows 1-4 move no prompt (0 of 128 / 482 pictures, all switches; 0 of 144 / 490, record and sheet only), prompt cases as before (27/33 counted and 36/36 guards, all switches; 19/33 and 36/36, record and sheet); the fact-twice and action measures are still the base's (frozen 2324 facts twice, 21 moments an action no picture shows; live 6505, 134): no row that moves them is built yet |
| S7 Jev checks routed by tags | Done (routing switch off; every Jev reading logs) | measured on the 122 pictures the owner judged (as sent): the gate and "storyboard complete?" are at chance (AUC 0.36-0.56); 16 library questions not measurable yet; 0 of 28 checks earn acting; a check earns acting only at its measured bar, counted by moments. Run the picture checkpoints with `DREAMCHAT_JEV_ROUTED=on` so the library questions' readings join the owner's new verdicts |
| S8 Listening | Done: on by default since 27 Sep (`DREAMCHAT_LISTEN=off` brings the old listening back) | 20 dreams on Claude: either/or 23% to 0, leading 17% to 0, "I don't remember" 0.24 to 0.14, listening ended early 6/20 to 3/20; told facts kept as said 0.942 vs 0.949 (within noise) |
| S9 Record of what was drawn, staleness | Merged behind DREAMCHAT_AS_DRAWN (off); fresh send (DREAMCHAT_FRESH_SEND, off) in review | every picture keeps what it was sent; rebuild as sent 57/61 to 61/61 moments, 6/16 to 16/16 in-between pictures; 258/258 stale pictures found after 56 changes, 0 false; switch or code drift reads unknown, never stale; fresh send: pictures drawn behind the dream 14 to 0 on ten redrawn dreams |
| S10 Paid benchmark judged by the owner | Not started | about $10 |

Money: $18 left of $30 — the S4 picture check ($3) has been drawn and judged (see "Where we stopped" below for the
current figure and what's next). Writer model: Claude (`DREAMCHAT_WRITER=claude`).

## Where we stopped (27-29 Sep): read this to resume

**To resume in a new session:** open this file (`dreamchat/HARNESS_PLAN.md` on `lab/dream-chat`,
`metalfinger/stawberry-studio`) and start from this section. Everything named below is pushed to GitHub — nothing
depends on this machine or this session. The owner's claude.ai plan doc is retired; Engram's fever-dream project
(`kb_load('fever-dream')`) mirrors the same state and carries any messages left since.

The owner paused the loop for the usage limit on 27 Sep, and on 29 Sep confirmed everything is pushed and asked for
this section to be kept current so any session can pick the work back up from here.

**On lab and working.** S0 test set, S1 story record, S2 checks only log (default), S3 cut sheet, S4 camera rules,
S5 references, S7 checks routed by tags, S8 listening (default), S9 record of what was drawn; the picture-check tool;
the typed readings of the 526 saved moments; the Claude writer (`DREAMCHAT_WRITER=claude`, waits out a usage limit).
Defaults on: checks log (S2), listening (S8). Behind switches, off by default: `DREAMCHAT_RECORD`,
`DREAMCHAT_CUT_SHEET`, `DREAMCHAT_CAMERA` (needs the sheet), `DREAMCHAT_REFS` (needs the sheet),
`DREAMCHAT_JEV_ROUTED`, `DREAMCHAT_AS_DRAWN`, `DREAMCHAT_FRESH_SEND`. The whole suite passes with them off and on.

**Picture evidence.** The S4 check ($3, 20 moments, blind, old against new): new right 15 of 20, old 10 of 20; faults
put right 5 of 7; guards 10 of 13 against 9 of 13. Its five misses are traced (log, 27 Sep): none is image-model noise.

**In flight when paused: four branches, each at a clean, tested commit, not merged, not reviewed.** All four, and
every other branch of this work (worktree branches included), are pushed to GitHub (29 Sep) to
`metalfinger/stawberry-studio` — currently a **public** repo; ask to make it private, or move this work to a private
one, before it carries anything sensitive. `git fetch origin` then `git worktree add <path> <branch>` resumes any of
them, on this Mac or any other. Each branch's own HARNESS_PLAN.md says what it did.
- `s5-fix2` (4 commits on ca71e3e, head 9372c28): S5's second-review fixes. Earlier pictures sent for their look
  now say exactly what to take and "nobody and nothing from it comes into this picture but who and what this picture
  has in it" — in S5 and in today's default prompts (default prompts change: frozen 25 of 140, live 80 of 477;
  images unchanged). The gate: never send a picture the owner judged wrong or one S9 finds stale; an earlier picture
  carries the room only when its camera is close on the same floor plan and the place is in the same state (sent
  with a different camera or state, for layout: frozen 2→0, live 37→0). A never-drawn side is no change anywhere
  (43 live side pictures gone); the crowd rule is for people only. Guards 36/36 with S5 off and on. Left: the S5
  picture-check set (steps in its "S5 fix round two" section), review, merge.
- `s6-build` (6 commits on 4746967, head 0d733de): S6 started behind `DREAMCHAT_ONE_BUILDER`. Ledger rows 1 (one
  record per state of the dream), 3 (one image cap) and 4 (each image and paragraph carries who it is for) done;
  row 2 (one tree) stopped until row 17; rows 5-34 not started (row 5 next: names and ids in words). Row 34 added:
  the brief built from the sheet's facts, a handover drawn mid-act, after-the-fact briefs refused. No prompt changes
  yet (0 pictures moved); suite passes with every switch on.
- `postcheck-fixes` (2 commits on d3b8cb2, head 45d82e4): fixture heights done (behind the camera switch): fixtures
  said high, at the top or on the ceiling are drawn on the wall at that height, above the water; no wall is labelled
  with a fixture's name (library-1 m5's window now 4.4-5.9 m up, above 4.4 m of water; counted cases 28/33 → 29/34
  with the new window-height case; 0 worse in the corpus). Traced but not built: carried things through the
  dreamer's eyes (out of view unless named; the steep camera tilt that showed legs), entering a place set outside
  it (needs a small cached reading), floor plans following the described layout (the planner gets thin place
  words, not the sketch's), room sides said on every cut.
- `checkpoint-order` (2 commits on d3b8cb2, head 5a053ed): the picture-check tool draws a dream's moments in story
  order, each from the earlier one's new picture; the judging page shows the frame each was drawn from; a guard the
  owner has since called wrong becomes a fault; a picture the owner judged wrong is never sent. Not yet run on real
  data.
Merge order suggested: checkpoint-order, postcheck-fixes, s5-fix2 (then the S5 check), s6-build. `s5-fix2`,
`s6-build` and `postcheck-fixes` all change `continuity.ts` and `evals/prompt-cases.ts`: reconcile when merging.

**New direction from the 28 Sep call (Charu, Shreyas, Abhishek; Engram
`projects/fever-dream/2026-09-28-charu-call-cards-and-cocreation.md`). Fold into the plan; do not build the sidebar
before the owner says at which step each artifact appears.**
- The conversation is too long (Charu dropped off halfway). Make it snappier while it still feels co-created: find
  which listen, retell and confirm turns can be cut or merged. Measure it the S8 way (fresh simulations, before and
  after): turns and minutes to the first picture, with S8's targets and floors as guards. Overlaps S8.
- Show intermediate artifacts live in a sidebar while the person talks: sketch, storyboard, character, clips, the
  full video. The stage machine's transitions (sheets, floor plan, previs, frames) decide when each appears; the
  free grey previs could come first. **Open question for the owner (Charu and Saurabh are also deciding): at which
  step does each artifact surface?**
- Elicitation stays agent-driven and co-created with an artist persona, never a plain prompt box.
- Conversational colour: "320 people told me dreams like this"; common dream tropes (teeth falling out, snakes);
  naming the film technique as the person describes it (a "dolly zoom" moment).
- Milestone bar: sharing your dream is fun, and watching the video is fun. For video: organic "dirtiness" and a human
  presence (real voice, room sound, real photo or video fragments).

**Reviewed and fixed (29 Sep, cloud session).** All four branches reviewed; the one blocking fix each needed is pushed:
`checkpoint-order` fbfe07a (a new picture judged wrong is never drawn from), `postcheck-fixes` a187b5c ("high" no
longer lifts what stands by a high thing or is tall), `s5-fix2` 0e0cbf6 (no prompt contradicting itself without a
mock-up; a note alone judges nothing); `s6-build` merges as it is. `S9 keys` now passes on any machine (6d7e23a: the
floor plan keyed rounded, KEYS_VERSION 3). Verdicts, follow-ups and the checklist for the Mac:
https://github.com/metalfinger/stawberry-studio/issues/1. Sessions hand work to each other through GitHub issues.

**Merged (29 Sep, cloud session).** At the owner's go, the four branches are merged into lab in order (fd7d978):
`checkpoint-order`, `postcheck-fixes` (with the owner's decision: `DREAMCHAT_CAMERA=on` needs `DREAMCHAT_RECORD=on`
as it needs the cut sheet, d671003), `s5-fix2`, `s6-build`. `bun test` after each merge and at the end: 810 pass,
2 skip, 0 fail with every switch unset and with every one on; typecheck clean; the one builder on moves 0 of 127
frozen pictures (record, sheet, camera, references) and 0 of 139 (record, sheet). The reviews' non-blocking
follow-ups are in issue #1.

**Next, in order.** 1) Done: the four branches merged. 2) The S5 picture check (about $3; draw with
`evals/checkpoint.ts`, judged on the local page). 3) Finish S6 (the rest of the ledger), review, merge. 4) The owner
chooses the writer the harness ships with (DeepSeek or another API; the Claude CLI is for testing only). 5) S10,
the paid benchmark on the five dreams (about $10), judged by the owner. Money: $18 left of $30.

**Caches (paid readings).** The evals read them from `dreamchat/runs/` (gitignored). Copies of all of them, merged
from every worktree on 29 Sep, are committed in `dreamchat/evals/cache/`; its README gives the four `cp` lines to
restore them on a new machine or checkout, so no reading is paid for twice.

**The owner's decisions (27 Sep).** Checks only log by default; listening on by default; "several changes" means 2
or more; a never-drawn side of a place is no change where the floor plan lays out the picture; through the dreamer's
eyes a carried thing stays out of view unless the moment names it; the snow-train-2 suitcase is shut at m5 and m6;
the S6 typed readings approved and done; picture checks about $3 each, S10 about $10; records live in local files and
Engram, not account-bound pages; when the usage limit hits, wait for the reset and carry on.

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
8. **Money:** $18 is left (of $30) and there is no more after it — the S4 check ($3) is spent. Spend only where a
   picture is the only way to prove a step (planned: about $3 for S5, about $10 for S10), redrawing only the
   moments that failed for that reason, old against new, judged by the owner. Record every cost in the log.

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
| S2 | Stop stand-in checks deciding: the pre-draw prompt check and storyboard check only log | merged behind DREAMCHAT_CHECKS=log (acting by default), review fixes merged (50dbd8c, 27 Sep); eval met on the picture path of 10 dreams (redrawn with fake pictures, Jev only) and on the whole-conversation replays of the same 10 dreams, writer Claude (27 Sep, below) | No moment held or reworded; corpus unchanged otherwise. Met on the picture path: 0 of 61 moments held, reworded, planned again or left undrawn by the gate or "storyboard complete?" (planning again a scene on Jev's plan facts, `planFacts`, still acts: overlaps S2 → S7) (acting: 18-19 rewordings, 10-11 re-plans and 11-13 sketch rewordings asked for, 1-3 moments left undrawn; the saved runs: 4 undrawn, 3 reworded, 17 scenes and 13 moments planned again); every moment drawn; every moment's gate reading and every camera's storyboard reading logged; Jev 23.6 calls a dream against 106-111 acting and 245 in the saved runs; prompt cases and corpus unchanged (below) |
| S3 | The cut sheet: tree (vertical) + record (horizontal) + relations + tags, one per cut | done (27 Sep): built, reviewed, fixed, merged behind DREAMCHAT_CUT_SHEET; sheet-as-sent proven on fresh replays written by Claude (27 Sep): met wherever no check acted | Every input the prompt needs comes from the sheet; no fact computed in two places. Met: `assembleCut` reads only the sheet and writes what framePrompt writes on every moment (0 differences in 1052 rebuilds: frozen 115 and live 411, record off and on), prompt cases unchanged on against off; what the sheet still computes twice is listed under S3 below. Sheet as sent (fresh replays, writer Claude): while drawing, `assembleCut` wrote what framePrompt writes on 48 of 48 builds (24 moments sent); against a rebuild 22 of 24 sheets as sent, the other 2 a check acting (below) |
| S4 | Camera rules and shot roles: the scene's line, a reverse angle turns the room (what is now left, right, behind), point-of-view shots show at most hands, vehicle screen direction, same setup means the same camera | built on branch `s4-camera` behind DREAMCHAT_CAMERA=on, which needs DREAMCHAT_CUT_SHEET=on (off by default; off is today byte for byte: 0 of 144 frozen and 0 of 490 live pictures moved, record and sheet on; 0 of 140 and 0 of 477 with them off), 27 Sep; its faults found and fixed. With Claude's readings, record and sheet on: `--step S4` 9/11 counted (1/11 off), guards 8/8; all cases 28/33 (19/33 off), guards 36/36; open: night-market m2 (the floor plan's facing), lighthouse-fresh m12 (its words never say the tractor moves), snow-train m6 hand (a hypothesis) | The S4 cases pass (`--step S4`: snow-train m2 reverse and m3 seat, snow-train-2 m2 same setup, lighthouse-fresh m12 heading, lighthouse-first m3, night-market m2, library-1 m4/m5, orchard m4 hands and m7 legs; lighthouse-fresh m10 needs a new floor plan) |
| S5 | References and variants: one image per subject; in-between pictures only when an edit carries several changes; variants kept and reusable; the grey mock-up as a reference chosen by tag | built on branch `s5-refs` behind DREAMCHAT_REFS=on (`refs.ts`; needs DREAMCHAT_CUT_SHEET=on; off by default and off byte for byte: 0 of 428 frozen and 0 of 1,436 live pictures moved against lab 3392d83, record, sheet and camera off and on), 27 Sep; reviewed, and the review's seven fixes in (the owner's rule that a side the floor plan lays out is no change, each thing once in what an in-between picture shows, a place's state said beside the mock-up, image 1 routed only as far as the verdicts go, a crowd by its flag, view pictures edited from the place's state not another side, tests that fail without each rule). `DREAMCHAT_REFS=sketch` is all of it but one image per subject. Every bar of the reference check met, frozen and live, record and sheet on and off, camera on, but one live in-between picture a moment does not need (927a g6); prompt cases: guards 36/36, no case lost, 5 hypotheses more met |
| S7 | Jev layer 2: checks routed by tags, a question library from the film rules, a labelled set per question; a check may hold a picture only if it predicts pictures | built behind DREAMCHAT_JEV_ROUTED=on (off by default) on branch `s7-jev-routed` (27 Sep): eval written first and run, routing built, independently reviewed, review fixes in (an earned check acts under the default logging; each library question held to its measured bar; the bar counts moments and noise; the storyboard measured on the pictures drawn from its shot) | Each question meets its bar on its labelled set. Run on the 122 pictures the owner judged (62 moments): no check meets the bar to act (0 of 28 distinct checks). The gate's four questions and "storyboard complete?" are measured and at chance; the 16 new questions, planFacts's re-plan and the continuity plan's warnings are not measurable yet (too few flags, and the questions were written after reading these verdicts, so only later pictures can test them). Routed, every Jev reading only logs until a check is earned; off unchanged; Jev calls a dream on the ten redrawn dreams: acting 115.8, logging 23.1, routed 23.3 (below) |
| S6 | `assembleCut`: prompt and references from the sheet, each fact once, action as visible facts; retire the regex clean-ups one by one | building on branch `s6-build` (from lab 4746967) behind DREAMCHAT_ONE_BUILDER (off by default; `on` every step built, a step's name the steps up to it, `none` the builder on with no step); stopped at a clean point on 27 Sep: the switch and each moment's typed facts on its sheet, ledger rows 1, 3 and 4 done and measured (0 prompts moved), row 2 stopped, rows 5-34 open; see "S6 built so far" under the S6 eval | Every clean-up and duplicate of the ledger retired in its order, each step its own measured change (`evals/retire.ts`, `evals/corpus.ts --verdicts`): every change on every saved dream classified, 0 unclassified, 0 regressions; each fact once (0 facts said twice outside the shot's words, of the look, colour and state kinds, and of the story kind with the typed action; 0 facts on two kinds of field); the action as visible facts (0 moments breaking its rules); 0 ids in words; counted cases: every one met on its base stays met, library-1-m2-books met, lighthouse-fresh-m12-heading once motion is typed; guards 36/36 |
| S8 | Listening: every reply checked against its move; major picture gaps asked openly, minor ones imagined and marked; the retelling ends with the moments | built and merged behind DREAMCHAT_LISTEN (off); review fixes on `s8-listening` (27 Sep): the come-back rule restricted, choice readings that keep changes, the retelling's breakdown started early, and the test's move-selection floors; proven offline (replayed moves, re-read answers, a hand-labelled set), and a fresh simulation on the Claude writer, both arms (27 Sep): every target met or met by hand but two (said but not in their words, about 9 real of 518; answers misread, 2 real of 99), and one floor fails beyond noise (retellings begun as told all they remember, 6 to 12 of 20: 10 of the 12 right after a come-back to an earlier thread); not to be switched on until that rule is fixed (below) | `evals/listening.ts` against the frozen before (`evals/listening-before`, 40 fresh simulated conversations): listening-turn compliance at least 90%, either/or under 5%, leading 0, said but not in their words 0, every way of drawing it kept, every retelling ends with a list of the breakdown's moments, no answer misread; floors not below the before (below) |
| S9 | Record of what was drawn, and staleness; sequences and look keys | built on branch `s9-as-drawn` behind DREAMCHAT_AS_DRAWN (off by default); eval met (27 Sep, below); review fixes done (27 Sep): records keep their switches and keys' version (drift: unknown, never stale), the pictures drawn behind the dream reported, staleness worked out when a picture lands, and the fresh send behind DREAMCHAT_FRESH_SEND (off) | Every picture drawn keeps what it was sent and drawn from; a rebuild reading it gives each as sent (live-flow's four moments and the in-between pictures' look lines included); 0 stale where nothing changed; each made change makes exactly its dependent pictures stale, with the reason; stale pictures found on saved dreams, a sample hand-checked; corpora unchanged (below) |
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
- S7's checks: `checks.ts` (the question library, routing by tags, `EARNED`: the checks that may act),
  `evals/checks-set.json` (the 122 pictures the owner judged, each with what every check read before it was drawn;
  built by `evals/build-checks-set.ts`), `bun --env-file=… run evals/jev-checks.ts --label <name> [--no-ask] [--logs
  <dir> …]` (every check measured on it; Jev's answers kept in `evals/checks-answers.json`, so a run again is free;
  each picture's readings in `runs/jev-checks/<label>.json`).
- S5's choice of references (`refs.ts`, DREAMCHAT_REFS=on with DREAMCHAT_CUT_SHEET=on): `chooseRefs` over the cut
  sheet (image 1 by the tags, each one in view by the image of its stage in force), kept on the sheet as `refs` and
  written by `assembleCut`; the plan's side is in `continuity.ts` (`chooseInPlan`: what a cut is not drawn from is
  not among its references, kept as `unsent` for the judge and the camera plan; a new framing or a side never drawn
  is no change where the cut's camera is worked out on a floor plan; an in-between picture drawn only where it takes
  a change off a cut that would otherwise carry two; of a subject's in-between pictures only the latest, which shows
  each thing its chain changed, once, `GhostPlan.shows`); the pre-draw check takes a subject's in-between picture
  for its sketch (`standsFor`). `DREAMCHAT_REFS=sketch` keeps each sketch beside its in-between pictures. The
  reference check counts each moment's changes itself (`evals/prompt-cases.ts storyChanges`), from the dream and
  the images sent, never from the plan's count.
- S5's reference check: `bun run evals/references.ts --label <name> [--live] [--against <name>] [--show]` reads
  every moment's images for one image per subject, its stage in force, pictures from another side, what the plan
  waits for and never sends, images for light alone, image 1 by tag, and each in-between picture against the
  owner's rule; writes `runs/references/<label>.json` (S5 eval below).
- S6's typed readings (`typed.ts`, `evals/typed.ts`, `evals/typed-cache.ts`): each saved moment's acts, motion,
  water level, the dreamer's hands and own body, containers, what is seen beyond the place and who is named but not
  there, proposed by the Claude writer and checked by Jev, cached in `runs/typed-cache.json` (gitignored; another
  path with `DREAMCHAT_TYPED_CACHE`). `DREAMCHAT_WRITER=claude bun --env-file=… run evals/typed.ts --label <name>
  [--live] [--no-ask] [--show] [--sample N]` reads (with `--no-ask` only looks up) every moment and writes
  `runs/typed/<label>.json` and `.txt`: facts per kind, Jev's answers, and each word list set against the facts.
- S6's retirement check: `bun run evals/retire.ts --label <name> [--live] [--no-imply] [--only <clean-up> …]
  [--checks]` turns each clean-up and word list of `cleanups.ts` off on its own (`DREAMCHAT_RETIRE`) and writes its
  footprint, reads each fact once, the action as visible facts, and where two sources disagree, to
  `runs/retire/<label>.json` and `.txt`; `evals/corpus.ts --against <before> --verdicts <file> [--came-back <retire
  label>:<clean-up>]` classifies every change of a step (S6 eval below).
- **Checkpoint tool** (`evals/checkpoint.ts`), for the paid picture checkpoints (S4, S5, S10): a few moments drawn
  once more by today's full harness under the switches as set, each old against new, judged blind by the owner.
  A set (`evals/checkpoint-<name>.json`) names each moment by dream and moment, why it is there (a counted fault
  case of the step, or a guard the owner called right), his verdict and note on the old picture and its file; it
  pins its cap (`cap_usd`) and where its ledger is (`results`). `bun run evals/checkpoint.ts --set-from-cases S4`
  proposes one: every counted fault case of the step and every guard whose prompt or images change against the
  step's own switch unset (`--base NAME=VALUE`, or `--base old` for the prompt the old picture was drawn with),
  that the run's pictures can be drawn from; faults first, then guards, most changed first, trimmed to the cap.
  `--dry <set>` builds each moment as the harness would send it (plan.ts `rebuild`, every image mapped to the
  run's own approved file, in-between pictures matched by what they show, the mock-up rendered as `layoutFor`
  renders it), prints its images, the word diff against the old prompt and the cost ($0.15 a picture), and refuses
  (never a stand-in) a moment with an image not found or never approved, a code fault the pre-draw check acts on,
  words calling the dreamer "you" (the harness rewords them with a model first), or no shot brief for its view:
  `--brief` has the writer brief it exactly as the harness does (`shotFor`, `DREAMCHAT_WRITER`), kept in
  `briefs.json` and in the hash; `--allow-briefless` draws it from the view's own words. With the record on,
  implied readings come from the cache only (`--implied-cache`, `--read-implied` to read, `--no-imply` to skip),
  and a cache is written back only when a reading was added. `--draw <set>` (with `--env-file`) draws only what
  the last dry run printed and did not refuse, with the set, switches and hashes unchanged and the checks only
  logging (the default), one draw at a time (`draw.lock`), into the checkpoint's own store; the cap is the set's
  (`--cap` only lowers it), counts every earlier attempt, refuses to start over it, and each picture is approved
  for at most what is left; every attempt is saved (`starting`) before the engine is asked, a job in the store the
  results do not know, in any state, stops the draw, and nothing is drawn again on its own (paired.ts's rules).
  `--judge <set>` serves a local page on 127.0.0.1 (no account): each moment's two pictures as A and B (re-encoded
  alike by sips or ImageMagick, or refused), old first in half of the faults and half of the guards drawn, beside
  the picture before, with the moment's line and the dreamer's words; A right, B right, both or neither, and a
  note, each answer written to `answers.json` with the pictures it was given on; the key (`key.json`) is written
  once per moment and never served. `--score <set>` reads the answers against it, leaving out any given on pictures
  changed since. The S4 set is proposed after `s4-camera` merges (on lab the camera switch changes nothing):
  `DREAMCHAT_RECORD=on DREAMCHAT_CUT_SHEET=on DREAMCHAT_CAMERA=on DREAMCHAT_WRITER=claude`, then `--dry --brief`.
  Earlier pictures (27 Sep, after the S4 check drew snow-train m3 against the old m2 the owner had called wrong
  while a new m2 was in the same set): two moments of one dream in a set are drawn in story order, and a later
  one that attaches the earlier one's picture is drawn from its new picture, as the harness would. `--dry`
  prints that image as "depends on <moment>'s new picture" (`depends` in `dry.json`, the dependency in the hash
  in place of a file) and refuses the later one when the earlier cannot be drawn or is left out by `--only`;
  `--draw` draws in waves, the earlier first, waits for it, builds the later again with the new picture (put
  into the store in place of the run's), and refuses it (nothing sent, drawn by a later `--draw`) when the
  earlier was not drawn or anything but that picture changed since the dry run. An earlier picture of the run
  the owner judged wrong (a story verdict, or not right in any checkpoint's answers: `key.json`,
  `answers.json`, `judge/made.json`, `results.json` beside this one) is never sent: the moment is refused unless
  that moment is in the set. The judging page's picture before is the one the new picture was drawn from, as
  sent (the new earlier picture where one was drawn first), else the moment before, new where drawn again.
  `--set-from-cases` proposes a guard whose old picture the owner has since called not right in a checkpoint as
  a fault ("a guard no more", his later verdict and note on the old picture, ranked after the step's own
  faults; lighthouse-fresh m4 now), and a moment that draws from another candidate's new picture comes with it,
  else is drawn from the run's picture where that may be sent, else is left out. Left: none of this has been
  run on the real S4 or S5 data yet (`--set-from-cases S5` and `--dry` against the saved conversations, no
  drawing); the page's picture before still skips an earlier moment the run never drew even when the checkpoint
  drew it.
- S9's record of what was drawn and staleness (`asdrawn.ts`, DREAMCHAT_AS_DRAWN=on): each picture's record is
  `Item.asDrawn`; a dream's stale pictures, those drawn behind the dream and those not comparable are
  `GET /api/stale?id=<session>` (`routes.ts`) and the `as_drawn` lines of its Jev log, written when a picture lands;
  `rebuild(s, { asDrawn: true })` (or `plan.ts --as-drawn`) rebuilds a picture from its record, and every eval
  passes `asDrawn` explicitly (the corpus, prompt cases and references `false`; live-flow both, its exit code on
  the rebuild as the dream stands); `bun run evals/as-drawn.ts <redraw folder> [--show]` reads dreams drawn with
  the switch on (records, rebuilds as sent both ways, staleness where nothing changed, under other switches, the
  pictures drawn behind the dream, changes made after drawing), `--saved <state folder> --store <sqlite>` or
  `--replays <folder>` dreams drawn before it, from their stores (S9 eval below). DREAMCHAT_FRESH_SEND=on (off by
  default) refreshes a picture's copy of itself from the plan in force when it is sent.
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
  **The whole-conversation replays (27 Sep, writer Claude, both arms).** The ten dreams replayed whole from the
  style choice with fake pictures (`runs/s2c/run-arm.sh <label> act|log off|on`: `runs/s2/run-arm.sh` with
  `DREAMCHAT_WRITER=claude`, five dreams at a time), the checks acting against logging, record off and on (sheet in
  shadow); counted by `evals/checks-log.ts`, the turns' Jev calls included:

  | 10 dreams, whole replays | acting, record off | logging, record off | acting, record on | logging, record on |
  | --- | --- | --- | --- | --- |
  | moments drawn | 60/64 | 64/64 | 48/58 | 63/63 |
  | left undrawn by a check | 4 | 0 | 10 | 0 |
  | moments reworded | 26 | 0 | 28 | 0 |
  | brief set aside | 14 | 0 | 17 | 0 |
  | planned again: scenes before drawing / moments while drawing | 14 / 14 | 0 / 0 | 13 / 11 | 0 / 0 |
  | drawn although a check held it | 55 | 0 (115 readings only logged) | 49 | 0 (128 only logged) |
  | sketches reworded or held; in-between pictures | 42; 1 | 0; 0 | 47; 0 | 0; 0 |
  | gate reading logged / storyboard reading logged | 64/64, 53 of 52 | 64/64, 49/49 | 58/58, 52/52 | 63/63, 49/49 |
  | Jev calls a dream, all (gate, storyboard and plan sites) | 306 (288) | 40.2 (21.0) | 324 (305) | 40.9 (20.9) |

  The eval is met on the whole conversations: with the checks logging no moment is held, reworded, planned again
  or left undrawn, every moment is drawn and every reading is logged, and Jev's calls fall from 306-324 a dream to
  about 41. Every moment left undrawn when acting was the gate's "still unsure of its instructions after rewording"
  (mostly "its instructions may contradict each other" at 0.6-0.8, and state "carried in words only"). The acting
  arm's "53 of 52" is paper-city, where a moment re-planned while drawing lost its camera after its storyboard
  reading. **Live flow** on these replays (record on): logging, 10 dreams, 62 of 63 moments rebuild word for word
  and 63 of 63 with the same images, 0 differing because a check acted; the one left is no check's (car-park m4:
  the dreamer corrected the moment's words while drawing, the moment was drawn again from the corrected words, and
  the breakdown kept the old ones, so a rebuild reads "rain falls upward" where "it is already raining upward" was
  sent: overlap S2 → S9). Acting: 31 of 48 word for word, 16 differing only because a check acted, and 2 dreams
  failing on sheets a check changed that live-flow does not explain (snow-train m3, planned again while drawing,
  differs in view, names and tree; grandma-kitchen m5, drawn again from the dreamer's correction, differs in the
  take). As S3 found, logging removes every difference a check makes.
  On the owner's decision logging is now the default (1ab262d; `DREAMCHAT_CHECKS=act` brings acting back): it only
  changes what the checks do, and the picture path and whole conversations both show nothing a check found is lost.
  The earlier plan ("once DeepSeek is topped up") is superseded by the table above; DeepSeek never ran it.
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
  **Targets:** listening-turn compliance at least 90%; either/or under 5% of listening questions; one question per
  listening reply (0 asking more than one); leading 0; said but not in their words 0; every way of drawing it kept;
  every retelling ends with a list of every moment; no answer misread. A target of 0 is met when every remaining flag
  (`--flags`) is hand-checked and found wrong; said facts Jev reads 0.3-0.5 are listed apart (near the bar),
  hand-checked, and not counted.
  **Floors** (S8 must not buy its targets by asking less or recording less; each against the before): listening
  replies that ask at least the before's share; dream-file facts told or asked at least 0.95, never asked nor told at
  most 0.05; told dream-file facts kept as said at least 0.87; and the move-selection floors (answered "I don't
  remember", asked again, retellings begun as told all they remember) at most the before's. The first floor was
  questions per listening reply (0.89 on DeepSeek), which a second question in one reply raises: on the Claude writer
  every listening reply asked in both arms (133 of 133, 143 of 143) and the before's 1.13 was 17 replies asking two at
  once, a fault S8 removes, so as written it could only be met by that fault. It now counts the replies that ask, and
  one question per reply is its own target (27 Sep: the Claude before 17 of 133; the first after 0 of 143).
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

  **On the Claude writer (27 Sep).** DeepSeek's balance is spent, and a before and an after made with different
  writers are not the same measure: the Claude before below follows its move 98% of the time where DeepSeek's did
  60%, and its simulated dreamer answers "I don't remember" three times as often (0.24 against 0.08). So both arms
  were made again with `DREAMCHAT_WRITER=claude`, the 20 dreams once each, two at a time, fake pictures, `--max 30`,
  each arm from a worktree of its own (simulate.ts saves into its checkout's `state/`): **the before** at 4c0e52c
  with the writer switch (55afcd1) and the transport fixes (e49ce98, 987d911, 62e0d70, 6befc18) cherry-picked, frozen
  in `evals/listening-before-claude/` and scored into `evals/listening-before-claude-scores.json`; **the after** at
  this head with `DREAMCHAT_LISTEN=on` (`runs/listening-claude-after`, not kept in the repository). From now on an
  after is scored `--against evals/listening-before-claude-scores.json`. Every conversation of both arms reached the
  retelling, the style offer and a profile; three were cut by the writer (a JSON reply, a usage limit) and simulated
  again whole.

  | measure | before, Claude | after, Claude | target | met |
  | --- | --- | --- | --- | --- |
  | listening-turn compliance | 150/153 (98%) | 159/163 (98%) | >= 90% | yes |
  | either/or | 31/133 (23%) | 0/143 | < 5% | yes |
  | leading | 22/133 (17%) | 0/143 | 0 | yes |
  | said but not in their words | 235/755 (31%) | 14/518 (3%), 20 near the bar | 0 | no: about 9 real by hand |
  | style offers keeping every way | 19/20 | 20/20 | all | yes |
  | retellings ending with a list of every moment | 0/20 | 15/21 by the test, 21/21 by hand | all | yes, by hand |
  | answers misread | 22 (9 clear read unclear, 13 changes read as settled) | 3 changes read as settled | 0 | no: 2 real by hand |
  | floor: questions per listening reply | 1.13 | 1.00 | >= before | as written no; see below |
  | floor: dream-file facts told or asked; never | 1.00; 0 | 1.00; 0 | >=; <= | yes |
  | floor: told facts kept as said | 262/276 (0.949) | 261/276 (0.946) | >= before | no, by one fact: noise |
  | floor: answered "I don't remember" | 32/133 (0.24) | 40/143 (0.28) | <= before | no, within noise |
  | floor: retellings begun as told all they remember | 6/20 | 12/20 | <= before | no, beyond noise |
  | floor: asked again about what was asked | 7/113 (0.06) | 11/123 (0.09) | <= before | no, within noise |

  Noise is read by resampling the 20 dreams, both arms together (4000 draws, 90% of the differences): kept as said
  -0.004 [-0.035, +0.027]; "I don't remember" +0.04 [-0.04, +0.11]; asked again +0.03 [-0.03, +0.08]; told all
  they remember +0.30 [+0.05, +0.55]. Questions per listening reply: every listening reply asks, in both arms (133
  of 133, 143 of 143); the before's 1.13 is a second question in the same reply, which S8 counts as a fault, so this
  floor as written can only be met by asking two at once: it should count the listening replies that ask.
  Hand checks. Said but not in their words, 14: about 9 real, all guesses in a breakdown or sketch field graded
  whole (the roof's "stairwell door" and "edge wall", Tomas's "everyday adult clothes", the pied piper man "a
  stranger", the back stairs "narrow", the paper city's "creases", the corridor's "classroom doors", and the place
  of the autoclave and of the kitchen door), the rest said after all ("the night sky" over a roof at night, "the
  jellyfish ahead", "outdoors" of a street, "open sky above a town", "looks like an older sister"): the S8 -> S1
  overlap. Retellings: all 21 end on a numbered list of the breakdown they were written from; 5 of the 6 the test
  failed were followed by the dreamer correcting or adding to it (the test holds the list to the breakdown drafted
  after), and the sixth (snow-train) lists every moment, the test missing "the suitcase on his knees" from the
  later breakdown. Misread, 3: 2 real and small ("he's my younger brother" beside "go with your guess"; "still
  holding the chalk at the end" beside "that's it"), 1 not (jellyfish-city "and then i woke up", where the list
  ends). **What the floors show.** The come-back rule (6b, circle_back, once the dream is told) still turns the
  end of listening into an interrogation: 17 of its 21 questions were answered "I don't remember", and 10 of the 12
  retellings begun as told all they remember came right after one; without its answers, "I don't remember" is
  23/122 (0.19), under the before. Next for S8: drop rule 6b, or come back only to a thread whose look a picture
  needs, then simulate the after once more against the Claude before. **Not run:** a second round. The floors
  within noise would need far more than 20 more conversations a side to settle (kept as said differs by one fact
  of 276), and the one beyond noise has a found cause; a second round would not change the verdict.

  **The fixes, and the after simulated again (27 Sep, branch `s8-fix`).** Each is a general rule, behind
  `DREAMCHAT_LISTEN=on`; off, nothing changes (every test green with the switch off and on).
  1. *The come-back rule is dropped* (19ee092). Measured on the first after before choosing: its 21 questions all
     asked how something looked, where it was or what else was there; 17 were answered "I don't remember". 10 of
     the 21 were about something the profiles then asked openly anyway (the gaps a guess cannot fill, F2), and the
     other 11 about looks F2 leaves to be imagined: coming back "only to a thread a picture needs" would have been
     the profiles' question asked twice, so the rule went rather than narrowed. What they raised earlier waits for
     rule 8, after every gap, now never one already taken up and never twice in a row (it did not fire once).
  2. *The floor counts the replies that ask* (3fa5ad6), and one question a reply is its own target (above).
  3. *Said is kept claim by claim* (cda80ce). The 9 real said-but-never-said of the first after had three
     mechanisms, 3 each: a value graded whole by `ground.ts` passed on their words with a guess in it ("a
     stranger", "creases", "the kitchen door behind"); a look folded in while planning, after grounding, marked a
     guessed value said whole ("the stairwell door, the edge wall; rain falling upwards"); and a profile revised
     from an answer was marked theirs by the overlap of their words (Tomas's "everyday adult clothes", the
     autoclave "at one end", the back stairs "narrow"). Now a said value of several claims is asked claim by
     claim, each as a part of the whole note (`ground.ts claimsOf`, `CLAIM_BAR` 0.5), and keeps only the claims
     they said; a profile revised or reworded is asked the same way wherever the rewrite marked a value said
     (`groundRevised`); a look folded after grounding never makes a value said. Offline on the first after's
     breakdowns: of 256 claims, 13 under the bar, 8 of the 9 the test reads as never said and 2 it reads as said
     (asked after the field's stem instead, 15 fell at that bar, 4 of them said); on its 43 revised values the 4
     real ones from rewrites went, with 2 told parts lost ("seats facing each other") and a told value marked a
     guess.
  4. *Answers misread* (85b44f8, bb2739c). Of the first after's 3, by hand 1 was real: "just that he's my younger
     brother ... you can go with your guess", read as leaving it to us at 0.91 because a profile's change counted
     only a detail of how it looks. The other two were not: "and then i woke up", where the list ends, and "still
     holding the chalk at the end", already item 4 of the list and in the breakdown (the plan's earlier "2 real"
     counted it). A profile's change is now any detail it lacked (who or what it is, how it looks, what it wears,
     what is in it or what it is made of). Read again, the retellings showed the same mechanism at the bar: "yep
     that's it, you got it all right. only small thing is the tractor stops at the edge of the field ..." read
     0.76 right and 0.16-0.25 a change, either side of `RIVAL` each time it was asked. So whether the answer puts
     anything right or adds to it is asked beside the choice (`retell_adds`, a change at 0.5), of the answer to the
     whole telling back only: after one corrected part told back, the 5 restatements the choice read as right all
     read as adding. Over both arms' stored answers, as S8 now reads them (`evals/probes/listen-readings.ts`):
     changes read as settled, first after 3 to 1 (a restatement), Claude before 13 to 1, and clear answers read as
     unclear 8 to 0; plain confirmations read 0.07-0.38 on the new question.
  Six conversations were simulated first and set aside when their answers showed the last two refinements (a
  place's "what is in it", and not asking after a corrected part); the 20 were then simulated whole at bb2739c.
  **The after, again**: the 20 dreams once each, two at a time, `DREAMCHAT_LISTEN=on DREAMCHAT_WRITER=claude
  DREAMCHAT_PROVIDER=fake DREAMCHAT_JUDGE=off`, `--max 30`, a Strawberry home of its own per conversation, and
  `DREAMCHAT_CHECKS=act`: the checks acted by default when the before and the first after were simulated (logging
  became the default at 1ab262d), so the arms differ only by S8. All 20 ran through (100 minutes, no usage-limit
  wait); frozen in `runs/listening-after-fix` (not kept in the repository) and scored exactly as the before,
  `--against evals/listening-before-claude-scores.json` (the first after rescored the same way for its column):

  | measure | before, Claude | first after | after, fixed | target | met |
  | --- | --- | --- | --- | --- | --- |
  | listening-turn compliance | 150/153 (98%) | 159/163 (98%) | 158/158 (100%) | >= 90% | yes |
  | either/or | 31/133 (23%) | 0/143 | 0/138 | < 5% | yes |
  | listening replies asking more than one question | 17/133 (13%) | 0/143 | 0/138 | 0 | yes |
  | leading | 22/133 (17%) | 0/143 | 0/138 | 0 | yes |
  | said but not in their words | 235/755 (31%) | 14/518 (3%), 20 near | 4/465 (1%), 15 near | 0 | 1 real by hand, small |
  | style offers keeping every way | 19/20 | 20/20 | 20/20 | all | yes |
  | retellings ending with a list of every moment | 0/20 | 15/21 (21/21 by hand) | 12/20 (20/20 by hand) | all | yes, by hand |
  | answers misread | 22 | 3 (1 real by hand) | 5, all changes read as settled (0 real by hand) | 0 | yes, by hand |
  | floor: listening replies that ask | 133/133 | 143/143 | 138/138 | >= before | yes |
  | floor: dream-file facts told or asked; never | 276/276; 0 | 276/276; 0 | 275/276; 1 | >=; <= | by hand yes: the one was told (Jev 0.36) |
  | floor: told facts kept as said | 262/276 (0.949) | 261/276 (0.946) | 259/275 (0.942) | >= before | no, within noise |
  | floor: answered "I don't remember" | 32/133 (0.24) | 40/143 (0.28) | 20/138 (0.14) | <= before | yes |
  | floor: retellings begun as told all they remember | 6/20 | 12/20 | 3/20 | <= before | yes |
  | floor: asked again about what was asked | 7/113 (0.06) | 11/123 (0.09) | 5/118 (0.04) | <= before | yes |

  Noise, resampling the 20 dreams both arms together as before (after against the Claude before): kept as said
  -0.007 [-0.046, +0.030]; told or asked -0.004 [-0.011, 0]; "I don't remember" -0.10 [-0.16, -0.04]; told all
  they remember -0.15 [-0.35, 0]; asked again -0.02 [-0.09, +0.05]. So the floor that failed beyond noise is met
  (12 of 20 to 3, under the before's 6), "I don't remember" falls beyond noise, asked again within it, and kept as
  said stays within noise below the before; told or asked misses by one fact the test read as not told.
  Move selection: no come-back fired (21 in the first after); retellings began "story understood and told to the
  end" 17 times and "told all they remember" 3 (the before 14 and 6), none of the 3 after a come-back; forms: "what
  happened next" 17, "what did X look like" 14 of 138 listening replies (first after 11 and 27); retelling words,
  mean 158. Revisions that changed a value marked theirs: 39, asked claim by claim (76 questions), none taken
  out; the adds question made one answer a change ("and then i woke up right after the pink glow part", a
  turn telling it back); 19 corrections told back in all (first after 18).
  Hand checks. Said but not in their words, 4: 1 real and small (jellyfish city's look "flat bright colour": they
  said "sharp lines and really saturated colours", "flat" is ours, kept as a part of "like an anime" in context),
  3 said after all ("indoors" of the parents' house they walked through, "the dreamer's aunt" of "my aunt", the
  classroom "reached through the wooden door at the end of the corridor", both told). Retellings: all 20 end on a
  numbered list of the breakdown they were written from; the 8 the test fails were each answered with a correction
  or an addition, told back, that the breakdown drafted after took in (each list differs from it by exactly those
  moments). Misread, 5: none real. Two are restatements of a corrected part told back (glass window, paper city);
  three are profile answers whose extra detail is no part of a look ("the ramp's right, that's where the dog was
  sitting"; "it was morning too", already the kitchen's guessed light; "calm while i was the only scared one", as
  described). Told or asked: streetcar "another family is sitting on top of the train too" was told in the second
  message ("it was with a family who was sitting up on top of the train with me"), read 0.36.
  **Left, found on the way.** Kept as said (within noise, 16 told facts not kept against 14): of them, told facts
  in values the producer itself marked a guess because it put a guess beside them (jellyfish city's "orange sunset
  sky" and "roof of the apartment block"), a told moment with one inferred detail graded whole ("the water has
  risen over the desks, the green lamps just above it, and hundreds of books ..." went to the retelling as "(my
  guess)" in the set-aside six), and values whose every claim was said made a guess because no single message says
  the whole value, the evidence rule (7 values here: the paper city's "really bright colours, reds and yellows and
  blues", the snow train's and the night market's colours). All three are before S8, in both arms; asking which
  message says each claim, and grading moments claim by claim, are the next rules to try, measured (S8 -> S1).
  With the saved sessions of this run in `state/`, `test/record.test.ts` fails on one of them (lighthouse: "the
  lighthouse door open" both a passing change at m6 and the door's first look), the known S8 -> S1 fault; set
  aside, the suite is green. **Not run:** a second round: kept as said is within noise and does not decide the
  verdict.

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
  differ, no image. live-flow first marked it FAIL (it looked only for a missing image); it now explains a moment
  taking an earlier picture a check left undrawn and counts it as a check acting (43aa749, with a test): re-run on
  both replays, 10 dreams, 0 failing, 42 moments drawn, 37 word for word, the other 5 each a check acting (three
  briefs set aside, jellyfish-city m7 and crayon-cat m3 taking a picture left undrawn). With the checks logging
  none of these can happen (S2's log arms). 8 of 32 moments were left undrawn by the
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
  **What DREAMCHAT_REFS=on does** (27 Sep, branch `s5-refs`, review fixes in; needs DREAMCHAT_CUT_SHEET=on, and
  unset, or with the sheet off or in shadow, everything is as before).
  - *The plan* (`continuity.ts chooseInPlan`, once the cameras are placed). An earlier picture is among a cut's
    references only if the cut is drawn from it, so the plan waits for nothing it does not send: never for its
    light alone, for who someone is only where they have no sketch (a crowd), never one whose camera is turned 135
    degrees or more from this one on the same floor plan (the jump's own picture and the seat excepted; cameras on
    two floor plans are not compared). What it leaves out is kept as the cut's `unsent`: the judge still compares
    the light and the people against it, and the camera plan still settles its relation.
  - *What counts as a change* (the owner, 27 Sep): the action, and each change in force shown in no image sent;
    a new framing or a side of the place never drawn only where no floor plan lays the picture out (the cut's
    camera is worked out on one: its mock-up, or its view said from it). An in-between picture is drawn where it
    takes a change off a cut that would otherwise carry two or more (the owner's bar), the latest first, and never
    one another is edited from; one that takes none of a cut's changes off it is not drawn, however many that cut
    carries. A side never drawn where nothing lays it out gets its in-between picture at two (the plan's own bar
    was three), drawn by editing the place's in-between picture of its state in force where there is one (so the
    cut takes one picture of the place), else its sketch, and waits for no earlier picture (which faces another
    side and was never sent to it).
  - *One image per subject.* Of a subject's in-between pictures in force a cut takes only the latest, which shows
    each thing its chain changed, once, as its latest change left it (`GhostPlan.shows`).
  - *On the sheet* (`refs.ts chooseRefs`, kept as `sheet.refs`). Image 1 is the picture edited where the plan
    edits one, else the mock-up where the verdicts have it help (not across a jump; through the dreamer's eyes only
    with nothing but the place in view, orchard m7; not a close-up, an insert or the seat; to another place only
    for a wide shot; not where the moment is about a crowd with no sketch of its own, by the group flag, unless it
    is a wide shot establishing the place), else nothing before the sketches. Each one in view is shown by one
    image, its in-between picture where one is drawn and approved, else its sketch, said as that ("who Tomas is,
    as they are now (age: about ten; wardrobe: old school uniform): … as this picture shows them"); what the moment
    has newer than the picture is said as an exception, never both as now. A place shown by its state's in-between
    picture beside the mock-up keeps its state said outright ("only what it is made of and its colours …, and its
    water exactly as in this picture (water: …)"; rules.md D5). Where a view is worked out on the floor plan and no
    mock-up is image 1, the place's sketch gives only its materials. The pre-draw check takes a subject's
    in-between picture for its sketch (`gate.ts`, `standsFor`), on the drawing path, in `plan.ts --gate` and in the
    checkpoint tool.
  **The eval as run (27 Sep, after the review; lab 3392d83; writer Claude; implied readings from the cache: 0
  calls).** The review found the check measured the code against itself (it copied the plan's count of changes):
  `evals/prompt-cases.ts storyChanges` now counts each moment's changes from the dream and the images the moment is
  sent (the action; each change in force no image sent shows, an in-between picture showing it or one edited from
  it, or an earlier picture drawn at or after it showing its subject; a side never shown and a new framing only
  where nothing lays the picture out), and an in-between picture is needed where it takes one of them off a moment
  that would otherwise carry two (or another is edited from it). Earlier fixes kept: cameras compared on one floor
  plan only. So the befores below differ from the first reading: under the owner's rule many of today's in-between
  pictures are not needed.

  | the reference check | bar | frozen, record and sheet on | record off | camera too | live, record and sheet on | record off | camera too |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | moments showing a subject by two images or more (D1) | 0 | 40 to 0 | 37 to 0 | 38 to 0 | 91 to 0 | 95 to 0 | 95 to 0 |
  | subjects not shown by their stage in force | 0 | 46 to 0 | 45 to 0 | 46 to 0 | 113 to 0 | 124 to 0 | 111 to 0 |
  | earlier pictures from another side, edited or for layout | 0 | 2 to 0 | 2 to 0 | 0 to 0 | 8 to 0 | 8 to 0 | 0 to 0 |
  | pictures waited for and never sent | 0 | 67 in 65 to 0 | 68 in 66 to 0 | 58 in 54 to 0 | 216 in 208 to 0 | 218 in 210 to 0 | 204 in 193 to 0 |
  | images for their light alone | 0 | 0 to 0 | 0 to 0 | 0 to 0 | 0 to 0 | 0 to 0 | 0 to 0 |
  | in-between pictures not needed (owner's rule) / all | 0 | 17 / 29 to 0 / 14 | 12 / 25 to 0 / 15 | 17 / 29 to 0 / 13 | 32 / 67 to 1 / 74 | 28 / 66 to 1 / 77 | 34 / 70 to 1 / 72 |
  | of them, a side's (view) | - | 5 to 2 | 0 to 2 | 5 to 2 | 0 to 43 | 0 to 43 | 3 to 43 |
  | moments carrying 3 changes or more | 0 | 1 to 1 | 0 to 0 | 2 to 2 | 0 to 0 | 0 to 0 | 0 to 0 |
  | moments carrying 2 or more (reported) | - | 9 to 7 | 2 to 0 | 6 to 4 | 57 to 15 | 58 to 17 | 60 to 18 |
  | images a moment, most (mean) | 12 | 10 to 8 (5 to 4.2) | 10 to 8 (5 to 4.1) | 10 to 8 (5.2 to 4.4) | 10 to 8 (4.3 to 3.7) | 10 to 8 (4.3 to 3.6) | 10 to 8 (4.4 to 3.8) |
  | the mock-up off the routing (reported) | - | 35 to 0 | 36 to 0 | 35 to 0 | 92 to 0 | 95 to 0 | 90 to 0 |

  Left, and why. Frozen, every moment still carrying two changes carries changes the moments imply, said in words
  and never drawn on their own (S1): 09ea m7 (the rain and the wet iron: three with the action), fdd7 m3-m5 (the
  shelves emptied), 6081 m7 (the water deep enough for a boat), a44a m6 (the deep snow). Live, besides those, 13-16
  moments carry a new framing where nothing lays the picture out (no in-between picture carries a framing), two a
  side never drawn with no in-between picture (279d m2, m5), and one in-between picture is not needed (927a g6, a
  side). The 43 live in-between pictures of a side are the owner's bar applied where no floor plan lays the picture
  out (older saved dreams without floor plans): each is a picture to pay for if those dreams are drawn again.
  Image 1, frozen with the record and sheet on (mock-up / edit / free): through the dreamer's eyes 16/1/0 to 1/1/15
  (orchard m7 keeps it), close-ups 6/0/0 to 0/0/6, wide 26/3/1 to 25/3/2 (another place keeps it).
  **Prompt cases** (the Jev answers cached by the review, and 65 asked now: the before with the camera 12, S5 on 31,
  with the camera 22). Switch unset, against lab: unchanged (6/33, 36/36; record and sheet on 19/33, 36/36; camera
  too 27/33, 36/36). S5 on, record and sheet on / camera too: counted 19/33 / 27/33 (as before), model step 5/8 /
  6/8 (as before), guards 36/36 / 36/36, hypotheses 5/18 to 10/18 / 7/18 to 12/18: orchard-m2-mockup,
  snow-train-m6-route, lighthouse-first-m7-route, heron-m4-route and lighthouse-first-m8-route met, none lost;
  orchard-m7-route stays not met (the mock-up is kept there, as its verdicts say: the sketches alone wrong, the
  mock-up partly right) and night-market-m2-route met. `--step S5`: counted 6/7, hypotheses 5/14 to 10/14 (6 to 11
  with the camera), guards 2/2, model only 4/4. Must not move: the six "no edit across a move" cases 6/6, the
  model-only identity cases 5/5, images for light alone 0, at most 12 images.
  **Corpus, S5 on against off, by cause** (a picture can have more than one). Frozen, record and sheet on, 144
  pictures: 91 changed, 17 not drawn, 2 new. A sketch replaced by its in-between picture 31; the mock-up no longer
  image 1 35 (through the dreamer's eyes 15, a jump, another place or the seat 12, a close-up or insert 6, a moment
  about a crowd 2); the plan only, nothing sent differing 24; in-between pictures not drawn 17 (heron: Mrs Okafor
  into a heron; snow-train: the suitcase, the door; library-1: its three sides laid out by the mock-up; library-2:
  the city under water outside, the window open; library-3: the window open; snow-train-2: the lid, the door, the
  light, a side; the classroom's window side, which m6 edits from m5; the city lights; the manager into a snowman;
  the car park's water) and 15 moments no longer drawn from them; an in-between picture carried by the later one
  edited from it 14; the place's picture now one of its side 3 (library-2's two inserts with no floor plan get a
  side's picture each, edited from the flood); earlier pictures not sent 4. Camera on: 87 changed, 18 not drawn, 2
  new, the same causes. Live, record and sheet on, 478 pictures: 296 changed, 36 not drawn, 43 new (the side's
  pictures above): a sketch replaced 112, the plan only 96, the mock-up no longer image 1 92, in-between pictures
  not drawn 36 and the moments drawn from them 37, carried by the later one 31, earlier pictures not sent 22.
  Checked by name: lighthouse-first m9, lighthouse-fresh m14, snow-train m4, snow-train-2 m4, acfd m4 and 538d m4
  (wide, another place), night-market m1, b91f m1, 8ceb m3 and m5 (wide, establishing) keep the mock-up; 8ceb m7 (a
  two-shot about the fish, not establishing) loses it by the rule as given; heron m4 loses it.
  **Tests.** `test/refs.test.ts` (24): each rule on a dream made up for it, and each fails without its rule:
  mutating the code (the chain carrying earlier changes, camera changes counted where a floor plan lays the
  picture out, a side's picture counted +1, no chain start kept, no latest-only filter, what a picture shows not
  kept once, a picture kept that takes no change off) fails 1-5 tests each. `test/references.test.ts`: the
  independent count and the needs on frozen dreams. `bun test`: 777 pass with the switches unset; with the record,
  sheet, camera and references on 775 of 777 (two tests of today's plans not pinned; pinned, their files pass both
  ways); typecheck clean.
  **The drawing path** (offline, `test/refs.test.ts`): on orchard, every picture drawn and approved, each moment's
  sheet on the drawing path equals the rebuild's, and every picture a moment waits for is sent; with an in-between
  picture not yet approved, its subject is shown by the sketch. The fresh fake replays (a re-plan or a correction
  reusing a drawn in-between picture by its key) are still owed.
  **The paid check (proposed, not drawn: 20 pictures, $3.00; record, sheet, camera and references on).**
  `checkpoint.ts --set-from-cases S5` proposes 19 (4 faults, 15 guards), and night-market m1 is added by hand:
  - faults: orchard m2 (image 1 off through the dreamer's eyes and Tomas from three images to one: two changes at
    once), lighthouse-fresh m2, lighthouse-first m8 (the mock-up off across a jump), library-1 m4 (its side's
    in-between picture gone: the mock-up lays it out);
  - one image per subject, clean: orchard m3 (an edit, Tomas's one image), library-3 m4 (the room's sketch and two
    in-between pictures to the water's); orchard m5 (Tomas's one image carries two of his changes, his age and his
    uniform), library-2 m3, library-3 m3 and m6 (a place's one image, D5);
  - an in-between picture not drawn: snow-train-2 m3 (the lid), snow-train m6 (the door; and image 1 off through
    the dreamer's eyes);
  - image 1 off: lighthouse-first m7 (through the eyes);
  - guards whose prompts change: orchard m6, lighthouse-fresh m4, m9 and m11, library-3 m8, snow-train-2 m4;
  - night-market m1 (by hand): unchanged by S5 (a wide shot establishing the market keeps the mock-up), so its
    redraw measures the drawing's own noise.
  Not drawable: library-2 m2, m4 and m7 (their side's in-between pictures were never drawn by the run; m7 also the
  boat's sketch), lighthouse-first m6, library-2 m6 and m8. The set is kept for the owner to confirm, not committed.
  If one image per subject loses, `DREAMCHAT_REFS=sketch` is the rest of S5 without it; each rule of image 1 is
  one line of `mockupHelps`.
  **S5 fix round two (27 Sep, branch `s5-fix2` from lab ca71e3e; committed, not merged).** The second review's
  findings, and the gate the S4 picture check's root causes asked for. Done:
  - *An earlier picture brings nobody and nothing of its own* (A), in today's prompts too (both builders, word for
    word: `frames.ts samePlaceLine`, `NOTHING_ELSE`): a room picture says what to take (how the place looks, its
    light; where things stand only from the mock-up, from the shot worked out on the floor plan, or, for the same
    view drawn afresh, from the picture itself; from the same side, the walls, doors and furniture), that the
    dreamer in it is the camera through their eyes, and "Nobody and nothing from it comes into this picture but who
    and what this picture has in it, as listed below"; someone's look from another place says the same. Where a
    view is worked out and no mock-up is image 1, the place's sketch points to the shot (S5 only). With S5 off this
    moves today's prompts, by cause: frozen 25 of 140 (23 room pictures beside the mock-up, 1 room picture that
    took where everyone is, 1 look from another place), camera on 41 of 144, live 80 of 477 (51, 18, 11); images
    unchanged. Prompt cases with S5 off unchanged (6/33, 19/33, 27/33, guards 36/36).
  - *The gate on every earlier picture* (the S4 check's root causes): with S5, never one the owner judged wrong
    (`verdicts.ts`: evals/story-pictures.json, and each checkpoint's answers under runs/checkpoint in this folder
    and DREAMCHAT_DATA's; unknown is allowed) nor one S9 finds stale (on the drawing path, where the records are
    kept; a rebuild reads no staleness) (`session.ts plannedInputsOf`, `plan.ts rebuild`); and one is drawn from
    (edited, or taken for the room) only where its camera is near this cut's on one floor plan (1.5 m, 30
    degrees, 1 m of height) and what both show stands alike (every change in force in one is in force in the
    other, an edit's own changes aside); with no cameras to compare, only an edit or the same view by the words.
    Otherwise the sketches carry the look and it is not sent (`continuity.ts chooseInPlan`, kept as `unsent`).
    The check counts it itself (`evals/prompt-cases.ts sentAgainst`): sent against the cut's camera or state, for
    layout frozen 2 to 0, live 37 to 0 but 16-17 edits with no floor plan (camera unknown); for look 22 to 0, live
    51 to 0.
  - *A side of a place is no change, with or without a floor plan* (C, the owner's decision applied everywhere):
    with S5 no side's in-between picture is made (the 43 live ones gone: 17 of them faced a person or thing yet
    said "with nobody in it"), and a new framing is no change either. The view picture edited from the place's
    state is gone with them; its words (B) are right anyway if one is ever made (`ghostPrompt`: image 1 the place
    as it is now, image 2 its sketch).
  - *Image 1:* the crowd rule reads crowds of people only (8ceb m7's fish keep the mock-up); heron m4 still loses
    it.
  - *Wording* (E): a thing's state said once ("water starts coming under the doors", not "water: water starts …");
    "as this picture shows them" dropped where Image 1 already shows them; refs.ts's comment on the bar corrected.
  - *The count* (`storyChanges`): only story changes, no side or framing.
  Measured after (S5 on against off, record and sheet on, frozen / live): 97 of 144 changed and 17 not drawn /
  321 of 490 and 42; by cause frozen: a sketch replaced by its in-between picture 31, a room picture not sent (its
  camera or state not this cut's) 23, the plan only 21, in-between pictures not drawn 17 (and 15 moments no longer
  drawn from them), the mock-up no longer image 1 34 (through the dreamer's eyes 15, a jump, another place or the
  seat 12, a close-up or insert 6, a crowd 1), the later in-between picture carrying the earlier 11; live alike
  (room pictures not sent 68). Moments carrying three changes rise, frozen 1 to 3 and live 2 to 8: every one of
  their changes is implied, said in words (S1), and was carried before by a room picture from another camera,
  which the gate no longer sends. Prompt cases (111 Jev calls asked, the rest cached): S5 off 6/33, 19/33, 27/33,
  guards 36/36; S5 on (it needs the sheet on) 19/33 and 27/33, guards 36/36, hypotheses 10 and 12 of 18 (5 and 7
  with S5 off). D: with the camera,
  library-3-m7-level is not met on lab with S5 off either ("the boat low in the room", Jev 0.51, over the bar; the
  S4 report's 28/33 had it at 0.49): the lab's later camera fixes moved it, and S5's prompt moves it to 0.58. Tests:
  `test/refs.test.ts` 28, each failing without its rule (mutations: sides counted, the picture-takes-a-change rule,
  the nothing-else clause, the dreamer clause, the place's layout from the earlier picture, a shoal as a crowd, no
  camera gate, no state gate, no verdicts); `tsc` clean; `bun test` run once: 785 of 787 with the switches
  unset, 784 of 787 with record, sheet, camera and references on; the three were tests of the old wording and of
  today's plan (a room picture's line, a side counted, the plan's link with S5 on), updated, and their files pass
  both ways (68 of 68).
  **Left, to resume from here:**
  - Merge `s5-fix2` to lab once reviewed (it changes today's prompts, by A, with S5 off).
  - Re-propose the S5 picture check with the reviewer's changes, and do not draw: `bun run evals/checkpoint.ts
    --set-from-cases S5 --name s5 --cap 3` under record, sheet, camera and references on, then against today's S4
    pictures (camera on, references off) for the 9 moments both share (library-3 m3, m4, m6; lighthouse-first m7,
    m8; lighthouse-fresh m4, m9; orchard m5, m6: the owner's S4 verdicts are in runs/checkpoint/s4/answers.json and
    key.json); orchard-m2's old picture is orchard-m2-c, library-1-m4's library-1-m4-b; swap out lighthouse-fresh
    m2, snow-train-2 m4 and library-3 m6; add 8ceb m7, night-market m6 and heron m4; snow-train m6, orchard m6 and
    lighthouse-first m7 may go back in now A is fixed; at most $3.
  - The gate's staleness is read on the drawing path only; a picture judged wrong is still in the plan's needs
    (drawn already, so nothing waits: lighthouse-first m8 on m7, the one "waited for and never sent").
  - Moments carrying three changes (all implied changes said in words) rose with the gate; whether an implied state
    should be drawn when no picture carries it is S1's question (overlaps).

- **S7 eval (checks routed by tags).** Written 27 Sep on branch `s7-jev-routed`, before the routing is built.
  Switch `DREAMCHAT_JEV_ROUTED=on`, off by default and off byte for byte.
  **The question library** (`checks.ts`, `LIBRARY`). One narrow question for each film rule of `docs/rules.md` that
  Jev can test on text, each asked only of the cuts whose tags (S3) route to it. Where a rule is about a named fact
  (a held thing, a change carried from earlier) it is asked once for each fact and the cut's reading is the worst.
  Jev reads text only (it takes no image: docs.typesafe.ai/models), so no Jev question reads a picture: a question
  reads the prompt sent to the image model, or the shot as "storyboard complete?" is given it. What only a drawn
  picture shows is the picture judge's (Claude, `evals/picture-judge.md`), measured beside them for comparison.

  | question | rule | reads | routed by | a finding when |
  | --- | --- | --- | --- | --- |
  | `r_state_said` | B1 | prompt | change:carried or change:both | it does not say a change carried from earlier onto someone or something in the picture (one question a change) |
  | `r_held_said` | B6 | prompt | held | it does not say who holds a thing in the picture (one question a held thing) |
  | `r_gone_drawn` | C4 | prompt | every cut | it asks to draw someone or something it also says is gone |
  | `r_pov_body` | A4 | prompt | pov | through the dreamer's eyes, it asks for more of the dreamer than hands, arms or feet |
  | `r_background` | A2 | prompt | move:reverse, crossed | it does not say what fills the background once the camera has turned |
  | `r_keep_earlier` | A2, C7 | prompt | move:reverse, other_side, crossed | it keeps an earlier picture's camera, framing, layout or background |
  | `r_line_order` | A1 | prompt | line | it does not say who stands where, left to right |
  | `r_size` | C2 | prompt | held, animal, vehicle, role:insert or close_up | it does not say how big the main thing is against something beside it |
  | `r_turned_both` | B4 | prompt | turned | it describes someone both as they were and as what they turned into |
  | `r_action_seen` | E2 | prompt | role:single, two_shot, group, ots, close_up | it does not say what they do as something seen (a pose, a movement, the hands, the gaze) |
  | `r_story_words` | E4 | prompt | every cut | story words ("the turn", "suddenly") stand in for what is seen |
  | `r_quoted` | C3 | prompt | every cut not tagged writing | it quotes words not meant as writing in the picture |
  | `r_beyond_inside` | A6 | prompt | every cut (no tag says "seen beyond the place" yet) | it brings inside something only seen far off or through a window |
  | `r_look_twice` | E1 | prompt | every cut | it describes one look twice, in words that do not match |
  | `sb_held_hands` | B6, A4 | shot | pov and held | the shot puts what the dreamer holds away from their hands |
  | `sb_beyond` | A6 | shot | planned | the shot brings inside something the moment sees only far off |

  Rules not asked of Jev, and why. Known to code, and a step's: A3 and C7 (an edit of the picture before, where
  the camera moves), C1, C5, D1, D2, D3, D5, D6 (which images are attached, image 1, in-between pictures: S5),
  B2-B4's typed changes and presence (the record, S1), E3 and E5 (the "you" rewording, the style's colours), C6 (a
  style is its medium). Already asked: A5, B5, B8 and the line's sides by "storyboard complete?" (four facts), B7 by
  the gate's "twice", D2 by its "what to take from each image". Not a picture rule: F1-F6 (listening, S8's reply
  checks), G1-G6 (how checks are measured). What only a drawn picture shows (a pose copied from an image,
  proportions, a see-through person, a face that is someone else): the picture judge's.
  **The labelled set** (`evals/checks-set.json`, built by `evals/build-checks-set.ts`). Every picture the owner has
  judged: the 62 drawn on the nights of 25-26 Sep (`evals/story-pictures.json`) and the 60 of the paired test
  (`evals/paired-verdicts.json`, three a moment differing only in image 1), 122 in all: 66 right, 35 partly, 21
  wrong. For each, what each check read, or would have read, before it was drawn: the prompt exactly as sent (the
  frozen dreams keep it; the paired test kept its prompts only in `runs/paired/results.json` of the checkout that
  drew them, now frozen into the set), the shot and readings "storyboard complete?" logged then, and what planFacts
  read the camera to face on the floor plan it was drawn from. **How labels are assigned:** a picture's label is the
  owner's own verdict on it and nothing else; "not right" is partly or wrong (the owner would keep a partly picture
  but ask for a fix); no label is invented, and no judge's verdict is a label. **Hypotheses**, used but not as
  labels: the fault classes of the owner's notes (S0's reading of them, `evals/prompt-cases.json`), only for each
  question's "own faults flagged"; each moment's tags and routed facts, from today's cut sheet (the frozen dream
  rebuilt with the record on and the sheet in shadow, without implied readings), which describe today's plan of the
  moment and not always the night's.
  **The split.** Tune: the five dreams the picture judge was written from (lighthouse-fresh, library-2, snow-train,
  orchard, night-market: 69 pictures, 31 not right). Held out: the five it was run on blind (lighthouse-first,
  heron, library-1, library-3, snow-train-2: 53 pictures, 25 not right). A library question's bar is chosen on the
  tune pictures only (the best precision flagging pictures of at least three moments and at most half the
  pictures; else its first bar, 0.5); no bar is ever chosen on a held-out picture. **Moments, not pictures:** a
  moment's story picture and its three paired pictures are near-identical prompts, read alike by every check, so
  the 122 pictures are 62 moments; the bar counts flagged moments, and its lower bound resamples moments.
  **S2's logged readings.** Every judged picture was drawn on 25-26 Sep, before S2 pinned readings to their prompt
  and take (`ref`, `checkedTakes`), and none was drawn with the checks logging, so no logged reading is of a prompt
  the owner judged: `--logs` joins S2's redraws (`runs/s2`, every arm) to 0 judged prompts, and 57 of their
  readings to snow-train-2's 7 moments by moment only (rebuilt prompts, not the ones drawn), which are listed, not
  counted; S2's whole replays (`runs/s2c`, 40 conversations, 670 gate readings with `ref`) are simulated dreams with
  fake pictures, never judged: 0 by prompt, 0 by moment. Instead each check is asked again of exactly what it read
  before the picture was drawn (the prompt as sent, the shot as checked): the reading it would have logged. The
  storyboard's readings logged then are used as logged, and asked again for how much they move. From now on a
  picture drawn with the checks logging or routed keeps each reading by its prompt's hash, and once the owner judges
  it, `--logs` joins it to the set.
  **The bar to act** (docs/rules.md G1, "at least 0.7 on at least 60 labels", as applied here; `evals/jev-checks.ts`
  `BAR`, `verdictOf`). On the labelled pictures it was not tuned on, at least 60 of them; flagging pictures of at
  least 5 distinct moments, each by a reading more than 0.1 past its bar (G4: nearer is noise); a precision of at
  least 0.7 (of the pictures it flags, the share the owner did not call right) whose 90% lower bound, resampling
  moments, is above the share of those pictures not right (a flag must say more than being asked does). Otherwise
  it only logs. **How G1 applies:** for a check already in the harness, its bar set before these verdicts existed,
  every picture it is asked of counts (122; "storyboard complete?" the 60 drawn from the shot it read). A library
  question is judged two ways, the moments its rule was written from left out (`checks.ts` `from`, the owner's
  pictures its rule's evidence in `docs/rules.md` names): at its first bar, never tuned, on every picture it is
  asked of; at the bar chosen on the tune pictures, on the held-out ones, at most 53, so never 60 on this set. And
  on this set it may not act at all: it was written after its author read the owner's notes on these very pictures
  (every not-right note of the 62), so no picture here is new to it; only pictures judged later can earn it acting.
  A check that meets the bar joins `checks.ts EARNED` with the bar it met it at, and a test holds `EARNED` to the
  eval's rows; nothing else acts when the checks are routed.
  **What is measured** (`bun --env-file=… run evals/jev-checks.ts --label <name> [--no-ask] [--logs <dir> …]`, Jev
  asked by name, jev-1.13.0, each state once with all its questions, as the harness asks them; every answer kept in
  `evals/checks-answers.json` by the hash of the model, the question as sent and the state, so a run again asks
  nothing and costs nothing; `runs/jev-checks/<label>.json` keeps every picture's readings): every check in the
  harness (the gate's four questions as logged and as acting, with the line search it makes between 0.45 and 0.55;
  the gate as a whole; "storyboard complete?"'s four facts as logged then and asked again, and as a whole, on the
  pictures drawn from the shot it read (the shot word for word in the prompt: 33 of the 54 story pictures with a
  reading, 27 of the 60 paired; a camera placed again after the check, a prompt saying its shot as a brief, or
  through the dreamer's eyes in other words, cannot be told to be that shot);
  planFacts's "the camera faces something the plan lacks", which plans a scene again even with the checks logging,
  as kept on the plan and asked again of it; the continuity plan's warnings), every library question, and the
  picture judge for comparison. For each: pictures routed, flagged, precision and recall of not right and of wrong,
  its own faults flagged, and its cost in Jev calls.
  **The build's eval.** Tests: routing picks each cut's questions from its tags; a question not in `EARNED` never
  holds, rewords, plans again or leaves a picture undrawn; with the switch off nothing changes (the same questions
  asked, the same findings, the same acting). Routing never touches a prompt, so the prompt cases and the corpus are
  unchanged by it. Jev calls per dream on the ten saved dreams S2 redrew (`evals/redraw.ts`, fake pictures, Jev
  only): acting, logging and routed.
  **The results (27 Sep, after review; `runs/jev-checks/s7.json`, 801 Jev calls, every answer kept, a run again
  free).** No check earns the right to act: 0 of 28 distinct checks (36 rows with their variants, asked again or as
  they act, and the picture judge). Of the 122 pictures (62 moments), 56 are not right (0.46); the bar is 0.7. AUC
  is how well a reading orders the pictures whatever the bar (0.5 is a coin). Flagged moments are given with those
  flagged past the noise of the bar.

  Measured, and at chance: the checks already in the harness, judged on every picture they are asked of.

  | check | reads, routed by | bar | pictures (moments) | not right / flagged (moments; past noise) | recall | lower bound / base | AUC | verdict |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | gate: contradicts | prompt, every moment | > 0.45 | 122 (62) | 22/52 = 0.42 (32; 18) | 0.39 | 0.31 / 0.46 | 0.48 | log only: precision 0.42 |
  | gate: contradicts, as it acts (> 0.55, or a line carries 0.08) | the same | | 122 (62) | 22/52 = 0.42 | 0.39 | 0.31 / 0.46 | 0.48 | log only |
  | gate: someone drawn twice | prompt, every moment | > 0.4 | 122 (62) | 2/2 (1; 0) | 0.04 | | 0.55 | log only: one moment |
  | gate: not clear | prompt, every moment | < 0.7 | 122 (62) | 0/0 | 0 | | 0.39 | log only: flags nothing |
  | gate: what to take from each image | prompt, images attached | < 0.6 | 122 (62) | 3/10 = 0.30 (7; 4) | 0.05 | 0.00 / 0.46 | 0.48 | log only |
  | the gate as it acts (any of the four) | prompt | | 122 (62) | 24/58 = 0.41 (35) | 0.43 | 0.31 / 0.46 | | log only |
  | storyboard: everyone in it, as logged | shot, planned | < 0.6 | 60 (33) | 2/7 = 0.29 (4; 2) | 0.06 | 0.00 / 0.52 | 0.39 | log only |
  | storyboard: contradicts the moment, as logged | shot, planned | >= 0.5 | 60 (33) | 5/11 = 0.45 (8; 5) | 0.16 | 0.08 / 0.52 | 0.41 | log only |
  | storyboard: camera where the moment needs it, as logged | shot, planned | < 0.6 | 60 (33) | 1/6 = 0.17 (6; 5) | 0.03 | 0.00 / 0.52 | 0.43 | log only |
  | storyboard: anything extra, as logged | shot, planned | >= 0.65 | 60 (33) | 0/0 | 0 | | 0.56 | log only: flags nothing |
  | "storyboard complete?" as it acts (any fact) | shot, planned | | 60 (33) | 6/17 = 0.35 (11) | 0.19 | 0.11 / 0.52 | | log only |
  | for comparison: the picture judge (Claude, reads the picture; not Jev) | the picture | not right | 122 (62) | 38/55 = 0.69 (33) | 0.68 | 0.57 / 0.46 | | log only: 0.69 |

  Not measurable yet: too few flags, or written after reading these verdicts.

  | check | reads, routed by | pictures (moments) | at its first bar, 0.5, untuned: not right / flagged (moments; past noise), of | tuned bar | at it, held out: not right / flagged (moments), of | AUC | why it cannot say more |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | planFacts: the camera faces what the plan lacks (plans the scene again) | plan, looks_at | 122 (62) | 2/3 (3; 3), as kept and asked again | | | | 3 moments |
  | the continuity plan's warnings (code) | today's plan | 122 (62) | 0/0 | | | | flags nothing on today's plans |
  | `r_state_said` (B1) | prompt, change:carried or both | 25 (16) | 5/10 = 0.50 (7; 7), of 20 | 0.5 | 3/4 (1), of 12 | 0.55 | precision 0.50 |
  | `r_held_said` (B6) | prompt, held | 55 (25) | 1/3 (3; 3), of 48 | 0.5 | 0/1, of 17 | 0.46 | precision 0.33 |
  | `r_gone_drawn` (C4) | prompt, every cut | 122 (62) | 1/4 (3; 3), of 118 | 0.6 | 0/0, of 53 | 0.50 | precision 0.25 |
  | `r_pov_body` (A4) | prompt, pov | 29 (11) | 0/0, of 21 | 0.5 | 0/0, of 7 | 0.68* | flags nothing |
  | `r_background` (A2) | prompt, reverse, crossed | 40 (13) | 0/0, of 32 | 0.8 | 3/3 (2), of 14 | 0.54 | two moments |
  | `r_keep_earlier` (A2, C7) | prompt, reverse, other_side, crossed | 73 (31) | 27/58 = 0.47 (28; 28), of 61 | 0.5 | 15/28 = 0.54 (12), of 30 | 0.49 | precision 0.47 |
  | `r_line_order` (A1) | prompt, line | 62 (35) | 3/5 (2; 2), of 61 | 0.8 | 3/4 (1), of 33 | 0.61 | one or two moments |
  | `r_size` (C2) | prompt, held, animal, vehicle, insert, close_up | 86 (44) | 28/61 = 0.46 (35; 22), of 69 | 0.3 | 2/8 (5), of 25 | 0.33 | precision 0.46 |
  | `r_turned_both` (B4) | prompt, turned | 0 | | | | | no judged picture is tagged turned |
  | `r_action_seen` (E2) | prompt, someone in view | 63 (33) | 1/1 (1; 0), of 55 | 0.9 | 5/10 = 0.50 (7), of 21 | 0.45 | precision 0.50 |
  | `r_story_words` (E4) | prompt, every cut | 122 (62) | 5/16 = 0.31 (10; 4), of 122 | 0.2 | 8/15 = 0.53 (9), of 53 | 0.46 | precision 0.31 |
  | `r_quoted` (C3) | prompt, not writing | 122 (62) | 0/4 (1; 1), of 122 | 0.4 | 0/1, of 53 | 0.43 | precision 0 |
  | `r_beyond_inside` (A6) | prompt, every cut | 122 (62) | 5/6 = 0.83 (5; 0), of 118 | 0.4 | 4/6 = 0.67 (5), of 53 | 0.63 | every flag within 0.1 of its bar |
  | `r_look_twice` (E1) | prompt, every cut | 122 (62) | 14/27 = 0.52 (15; 4), of 121 | 0.6 | 0/0, of 52 | 0.54 | precision 0.52 |
  | `sb_held_hands` (B6, A4) | shot, pov and held | 5 (2) | 4/5 (2; 2), of 5 | 0.5 | 0/0 | 1.00 | two moments |
  | `sb_beyond` (A6) | shot, planned | 60 (33) | 3/8 (5; 0), of 60 | 0.4 | 3/6 (3), of 31 | 0.51 | precision 0.38 |

  (The tuned bar is 0.5 where no bar flags three tune moments, or every bar that does flags over half of them.
  * `r_pov_body` reads 0.05-0.11 on every picture: its order is noise, under G4's 0.11.) **What it says.**
  Measured and at chance: the checks that acted until 27 Sep read the prompt or the shot the way a coin would read
  the pictures. The gate's contradiction reads 0.445 on the pictures called right, 0.44 partly, 0.454 wrong; the
  gate's four questions have an AUC of 0.39-0.55, "storyboard complete?"'s four facts 0.36-0.56, and as it acts the
  storyboard flags pictures less often not right (0.35, 6 of 17) than being asked alone gives (0.52). They are
  stable, not predictive: asked again, the storyboard's facts pass or fail as logged in 315 of 324 readings (a mean
  move of 0.02-0.04). The gate's line search excused nothing (all 23 readings between 0.45 and 0.55 had a line
  carrying 0.08 or more) at 26 calls a prompt. A prompt check cannot see what most separates a right picture from
  a wrong one: in 15 of the 20 paired moments the owner judged the three pictures apart from prompts differing only
  in image 1 (G5). Not measurable yet: every library question, planFacts's re-plan (three moments) and the
  continuity plan's warnings (none on today's plans). The nearest, `r_beyond_inside`, would pass the bar at its
  first bar on the pictures it was not written from (5 of 6, five moments, lower bound 0.50 over 0.45), but every
  one of its flags reads 0.52-0.58 against a bar of 0.5, inside G4's noise, and its flagged pictures are wrong for
  other reasons (a camera not turned, a bag with the wrong person, the dreamer gone), not for bringing something
  inside; the tractor its rule was written from is left out. `r_state_said`'s held-out 7/9 of the first run was
  library-1's water, the pictures B1 was written from: left out, 3 of 4 on one moment. `r_line_order` (A1, written
  from snow-train-2 m7) has one or two flagged moments either way; `sb_held_hands` two (S4's debt: through the
  dreamer's eyes a held thing is placed at its floor-plan spot, not the hands; code's to fix). The picture judge,
  which sees the picture, stays just under the bar (0.69).
  **What owner verdicts would settle it.** More labels cannot make a check act whose precision is under 0.7 on
  these pictures: the gate's questions, "storyboard complete?", eight library questions (`r_held_said`,
  `r_gone_drawn`, `r_keep_earlier`, `r_size`, `r_story_words`, `r_quoted`, `r_look_twice`, `sb_beyond`), and
  `r_state_said` and `r_action_seen` on the path where they flag more moments. The rest are unmeasured, not failed:
  planFacts's re-plan, the continuity plan's warnings, `r_background`, `r_line_order`, `r_pov_body`,
  `sb_held_hands`, `r_turned_both`, and `r_beyond_inside` once it is asked of pictures where its reading is clear of
  its bar. To be tested they need pictures judged after 27 Sep, drawn with the checks logging (the
  default) so each keeps its readings by its prompt's hash (`ref`), and added to `evals/build-checks-set.ts`. A
  question that flags one moment in twenty needs about 100 newly judged moments (one picture each) for its five
  flagged moments; one asked of a fifth of the moments (`r_background`, `r_state_said`) about 500 moments to reach
  60 labels of its own. The paid checkpoints the owner judges anyway (S4 about 20 pictures, S5 about 20, S10 about
  66) give about 100: enough to test the questions asked of every cut, not those asked of few (a hypothesis, at
  about half a minute a verdict: an hour).
  **The build (27 Sep, with the review's fixes).** `DREAMCHAT_JEV_ROUTED=on`: the gate asks each moment, in its one
  call, the library questions its cut sheet's tags route to (from the sheet it is sent with, or one built for the
  tags alone when the sheet is off), and logs every answer with its bar beside the gate's (`gate` transitions,
  `overrode` on the picture). A library question's reading is logged against the bar chosen on the tune pictures
  (`LIBRARY[].bar`). A finding acts only when its check is in `checks.ts EARNED` (by id, `moment.contradicts`,
  `moment.sb_camera`, `plan.looks_missing`, `moment.r_line_order` …, with the bar it earned acting at), and then
  whether the checks log (the default since 27 Sep) or act; `DREAMCHAT_CHECKS=log` set on purpose stops even an
  earned check. `EARNED` is empty, so routed, the gate's questions, "storyboard complete?" (before drawing and while
  drawing), the sketch and in-between gates, the continuity plan's warnings and planFacts's re-plan (which acts
  even when logging, unrouted) all log; a fault code knows for certain (`actsWhenLogging`) does what it does
  unrouted (with the checks logging, the moment is left undrawn). The shot's own library questions
  (`sb_held_hands`, `sb_beyond`) are measured, not asked while drawing: a shot is checked before the cut has a
  sheet. Off, nothing changes: the tests ask the same questions, find the same and act the same with the switch
  unset or off; the whole suite passes with it on and off, and on, every test not pinned to acting as before
  (`withChecks('act')`) runs routed. A routed check never touches a prompt, so the prompt cases and the corpus
  cannot move. **Not measured:** routed, planFacts's re-plan only logs; the redraw has no planner (every model step
  is a stand-in that fails), so neither its arms nor the routed-against-logging comparison below exercise it.
  **Jev calls a dream** (the ten dreams S2 redrew, `evals/redraw.ts`, fake pictures, Jev only, record on, sheet in
  shadow, 27 Sep):

  | 10 dreams, picture path redrawn | acting (`DREAMCHAT_CHECKS=act`) | logging (the default) | routed (`DREAMCHAT_JEV_ROUTED=on`) |
  | --- | --- | --- | --- |
  | moments drawn | 58/61 | 61/61 | 61/61 |
  | left undrawn or held by a check | 3 | 0 | 0 |
  | actions by a check (rewordings, briefs set aside, sketches reworded); drawn although held | 21; 49 | 0; 0 | 0; 0 |
  | gate readings logged / storyboard readings logged | 61/61, 53/53 | 61/61, 53/53 | 61/61, 53/53 |
  | gate calls carrying the library's questions | 0 | 0 | 61 (every moment) |
  | Jev calls a dream (gate, storyboard, plan; what changes 0.8 in each) | 115.8 (105.5, 7.3, 2.2) | 23.1 (13.0, 7.1, 2.2) | 23.3 (13.0, 7.3, 2.2) |
  | Jev input tokens, all ten dreams | 1.84 million | 0.33 million | 0.39 million |

  Routed costs what logging costs in calls (the library rides in the gate's call) and 17% more tokens (the gate's
  calls 27% more), a fifth of acting's calls and tokens. (The routed arm ran with `DREAMCHAT_CHECKS=act`, before
  the review's fix that lets an earned check act under the default; with nothing earned it makes no difference
  to what acts.) What each picture was sent, routed against logging: 76 of 77 the same; the other (car-park m1) had its camera face the wall's painted number in one arm and the wall in the
  other, a plan-fact reading asked afresh in each redraw that moves between runs (G4), so its brief no longer
  matched its view: not routing's doing. The first routed arm ended with snow train m4-m7 never
  started: the redraw returned while m3's verdict was still coming (not routing's doing; fixed in `evals/redraw.ts`,
  run again: 61/61).
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
  **The eval as run (27 Sep).** Built as `asdrawn.ts` (the record, its keys, staleness), each picture's record kept
  when it is sent (session.ts, `Item.asDrawn`, the sketches and looks once in `Build.copies`), `rebuild` reading
  the records (plan.ts), staleness logged (`as_drawn` transitions) and served (`/api/stale`). The ten dreams drawn
  again with the switch on (`evals/redraw.ts`, the checks logging, record on, sheet in shadow, fake pictures, Jev
  only, one dream at a time), read by `bun run evals/as-drawn.ts <folder> [--show]` and `evals/live-flow.ts`;
  saved dreams by `bun run evals/as-drawn.ts --saved <state folder> --store <production.sqlite>` or
  `--replays <folder>`:

  | measure | bar | before (a rebuild without the records) | S9 |
  | --- | --- | --- | --- |
  | pictures drawn with a record for their take, holding what was sent | all | none kept | 77 of 77 (61 moments, 16 in-between pictures) |
  | what each picture was sent, against S2's logging redraws of the same dreams (switch off) | the same | | 77 of 77, prompt and images |
  | a rebuild gives each picture as sent: moments; in-between pictures | all | 57 of 61; 6 of 16 | 61 of 61; 16 of 16 |
  | live-flow: dreams failing; moments word for word; sheets as sent | 0; all; all | 4 of 10; 57 of 61; 54 of 61 | 0; 61 of 61; 61 of 61 |
  | pictures stale where nothing changed after drawing | 0 | | 0 of 77 |
  | made changes: pictures found stale against those they must make stale | the same set, right reason | | 56 of 56 changes: 258 expected, 258 found, 0 extra, 0 missed, every reason right |
  | made changes: a rebuild reading the records still gives every picture as sent | all | | 56 of 56 |
  | saved dreams: stale pictures found, hand-checked | reported; none wrong | | 2 of 173 read (47 dreams), both right; S2's whole replays 0 of 279 |
  | corpora against the base, switch off and on | 0 moved | | frozen 140, and 139 with record and sheet; live 477, and 478 with the record: 0 moved either way |

  The made changes, one per dream each (four dreams sent no lasting change in words): a moment's words corrected
  (10 changes; 31 pictures expected stale, 31 found), a sketch drawn again (56, 56), a sketch's look reworded, words
  only (49, 49), an earlier picture drawn again (21, 21), the look changed (77, 77), a lasting change told otherwise
  (6 changes; 24, 24). The reasons read: "m3: earlier:m2 (picture:m2 take 1 → picture:m2 take 2)"; "m7: sketch:p1
  (the dreamer (sketch:p1 take 1) → the dreamer (sketch:p1 take 2)); drawn from m5, which is stale".
  **Drawn behind the dream** (reported apart; not staleness, since nothing changed after drawing): 12 pictures. The
  10 in-between pictures whose look lines differed (grandma-kitchen g1-g3, paper-city g1-g4, snow-train g1-g3) were
  drawn from the plan they were first put in with, made before the record gave the look before their change;
  paper-city m5 was drawn without the red paper bird the plan now puts in the dreamer's hands, and desert-station m6
  with its people in another order, each from the cast it was first put in with (a re-plan updates only a moment's
  plan). Found on the way: live-flow's "an earlier picture it takes was not drawn as a rebuild takes it" for those
  two was the cast, not an earlier picture; sea-school m4 and snow-train m7 lost `said` on their action when they
  were reworded in the saved runs ("you" into the third person) while the breakdown kept it, so a rebuild's colour
  line took the colours of the moment's own words; desert-station m3-m6's sheets differed in `tree` because drawing's
  tree reads the plan kept since the moments began, which a rebuild reading the records now reads too.
  **Saved dreams** (drawn before S9, so only their stores are read): 47 with pictures, 283 pictures, 173 whose
  recipes the live store keeps (the rest were simulated into stores not kept). 2 stale, both right by hand:
  glass-window (a446) m3 took its composition from m2's second take, and m2 was drawn a third time three minutes
  later; meads-house (502a) m5 took its light from m4's first take, which the dreamer then rejected and whose redraw
  failed at the picture limit (whether their correction touches its light is the follow-up's to judge). Checked by
  hand for misses: the six dreams with the most pictures drawn again (bbba, 9ddd, f085, 502a, a446, e11a; 41
  pictures), each picture's images against the takes of their sources and when each was made: none missed. A
  first reading of the look took the prompt's whole style line for its name (older code went on after the name on
  the same line) and flagged 31 wrongly; fixed before counting. S2's whole replays (four arms, 39 dreams, 279
  pictures): 0 stale; in car-park's logging replay the dreamer corrected m4 before anything was drawn from it (m5
  and m7 took its second take).
  **The correction the breakdown does not keep** (car-park m4 of S2's whole replays, overlap S2 → S9): covered. A
  session test corrects a moment's words while it is drawn: the new take's record keeps the corrected words, the
  breakdown the old ones; a rebuild reading the records gives the moment as sent, one without them the old words;
  the close-up drawn from its first take is stale ("earlier:m1 (picture:m1 take 1 → picture:m1 take 2)"), logged,
  and not drawn again.
  **Found and fixed on the way:** `settle` (the test and simulation helper) returned while a take's verdict was
  still being asked for, so a redraw under load ended with the moments drawn from that take never started (4 of 10
  dreams in the first run); it now waits for verdicts. Staleness is worked out off the save (a quarter second after
  it, and when `settle` ends), never inside it.
  **Tests:** `test/asdrawn.test.ts` (a frozen dream drawn with stand-in pictures: every take recorded and nothing
  stale; a sketch drawn again, a moment's words corrected, an earlier picture drawn again and the look changed each
  make exactly their pictures stale, with the reason; a picture without a record is counted apart; a rebuild
  reading the records gives every picture as sent after the dream has changed) and three session tests (the records
  and `/api/stale` on a drawn dream; a correction while drawing; the switch off keeps nothing). `bun test`: 554
  pass, 1 skipped, 0 fail with the switch off and on; typecheck clean.
  **Cost:** a record is about 20 KB a picture (the prompt 7 KB, the picture's own copy with its plan 8 KB): a
  dream of eight pictures grows from about 240 KB to 400 KB.
  **Review fixes (27 Sep, independent review: switch off safe, eval reproduced, staleness held on extra cases).**
  - *Switches and code drift made everything stale.* A record compared what the dream gave a picture then (worked
    out by the code and switches of the day) with what it gives now: the redraws read with the record off gave 77
    of 77 stale with empty reasons, and the owner works on three machines with different switches. Each record now
    keeps the switches it was drawn under (every DREAMCHAT_ switch except those that never change what a picture
    is told, listed in `asdrawn.ts`, a new one counting until listed) and the version of the keys
    (`KEYS_VERSION`, 2); a record kept under others is listed as not comparable (`unknown`, with why), never stale,
    as a picture without a record is. A test holds the keys of two frozen dreams, record off and on, and fails when
    they move, so a change to the plan, the sheet or the record that moves them raises the version. Read under the
    other record switch, the redraws: 77 of 77 not comparable, 0 stale.
  - *Pictures drawn behind the dream were hidden live, and live-flow's 4 to 0 was by construction.* The report now
    has `behind` (what was sent against what the dream gave the picture then), served, logged (`behind`
    transitions) and counted by the eval; the words a moment holds are now read with `said` as the breakdown says
    where it tells the same words, so a rewording that lost `said` is behind too (sea-school m4, snow-train m7):
    14 pictures on the redraws (12 before). live-flow rebuilds both ways: as the dream stands (the check and its
    exit code) and reading the records (reported beside it).
  - *The fresh send* (DREAMCHAT_FRESH_SEND=on, off by default and off byte for byte): a picture's copy of itself is
    refreshed from the plan in force when it is sent. A moment takes who and what is in it from its plan, as
    buildFrames puts a moment in, and its words' `said` from the breakdown where the words are the same (also after
    a rewording, `keepWords`, where rewording lives); an in-between picture takes the plan's for its change, made
    now; the dream's own copy of its plan (`build.plan`, read by the cut sheet's tree) follows a re-plan. Its eval is
    S9's own: on the ten dreams redrawn with it on, pictures drawn behind the dream 14 to 0; a fresh rebuild gives 61
    of 61 moments and 16 of 16 in-between pictures as sent (57 and 6 with it off); live-flow as the dream stands 0 of
    10 dreams failing (4 with it off); still 0 stale where nothing changed and 56 of 56 made changes exact. What it
    changes in what is sent is exactly the 14 pictures that were behind: paper-city m5 now has the red paper bird in
    the dreamer's hands, desert-station m6 its people in the plan's order, the 10 in-between pictures their look
    before the change as the record gives it (grandma-kitchen g2 no longer "mid-toned cardigan" for a change of
    clothes), and sea-school m4 and snow-train m7 their colours in the colour line. A session test rewords a moment
    told as "you": off, its colour leaves the colour line; on, it stays.
  - *Staleness blocked the server* (0.1 to 0.5 s a pass on the main thread, a quarter second after every burst of
    saves). It is now worked out when a picture lands and when `/api/stale` asks, and the dream planned again (the
    costly part) is kept by what it is made from: under load 185 a dream costs 0.1 to 0.9 s the first time and 2 to
    4 ms again. The log's check of what changed, which missed inputs, is gone: it logs whenever what it finds
    differs from what it last logged.
  - *Rebuilds default to the dream as it stands* (`asDrawn` false unless asked), and every rebuild-based eval
    passes it explicitly, so a record never hides a fix.
  - *The mock-up is keyed by the floor plan it is rendered from* (a hash of the moment's floor plan through its
    camera), not whether it has one.
  - *In-between pictures are matched by their change*, not their name alone: two changes of one part share a name
    (`ghost:l1:desks`), and a rebuild read the other's record (found on sea-school, the tests' second dream).
  - `settle` is also used by `resume.ts`, `evals/redraw.ts` and `simulate.ts`; waiting for a verdict being asked for
    only makes them wait for it, as they meant to.
  - Tests: expected pictures come from the images each picture was sent, never the record's own list; two frozen
    dreams; cast, camera (the floor plan planned again), a moment dropped from the plan, drift to unknown (switches,
    version, no switches kept), behind and the fresh send putting it right, words kept said, a sketch copy not
    kept, a record that cannot be made, `settle` waiting for a verdict (fails without the fix), and `/api/stale`.
  - Unchanged: the corpora against the base with both switches off and with both on (frozen 140, and 139 with the
    record and sheet; live 477, and 478 with the record: 0 moved); the saved dreams (2 of 173 stale, as before).
  - Redraws of the same dreams differ in a moment or two from run to run, whatever the switches: a redraw plans its
    shots again with Jev, whose reading of what a camera faces varies (crayon-cat m2 and desert-station m3 between
    two runs, car-park m1 and moon-market m5 between two others). With the record switch on and the fresh send off,
    76 of 77 pictures were sent as S2's redraws sent them, the other crayon-cat m2's camera read otherwise.
- **S6 eval (one prompt builder, the clean-ups retired).** Written 27 Sep on branch `s6-eval`, before S6, from
  `lab/dream-chat` (6667b0f). S6 is built on S4 (`s4-camera`, not merged) and S5 (eval only), so its first commit
  takes every before below again on that base, with the same commands, and its bars are against that base. S6 goes
  behind its own switch (for instance `DREAMCHAT_TYPED=on`), off byte for byte (0 pictures moved, frozen and live,
  record and sheet off and on), and is measured with `DREAMCHAT_WRITER=claude DREAMCHAT_RECORD=on
  DREAMCHAT_CUT_SHEET=on` (and S4's and S5's switches once merged), frozen and live, what the moments imply read
  from the cache (Claude's readings: all 15 frozen and all 59 live dreams are cached), with the record off as a
  second reading of the prompt's own clean-ups. Nothing in this eval calls a model.
  **Instruments (new, committed).**
  1. `cleanups.ts`: each text clean-up and word list S6 retires, by name, with a switch that turns it off where it
     runs (`DREAMCHAT_RETIRE=<name>,…`: the text passes through as it came, a word list matches nothing; unset,
     everything runs as ever; a name not in the list throws). `assembleCut`, which writes from the sheet alone,
     reads none. S6 retires them through it: with S6's switch on, each step adds one name to those it turns off
     and puts the typed fact in its place, in the order of the ledger, one measured change at a time.
  2. `evals/retire.ts --label <name> [--live] [--no-imply] [--only <clean-up> …] [--checks] [--dreams <id> …]`
     rebuilds every dream as `plan.ts` does and writes `runs/retire/<label>.json` and `.txt`: (a) each clean-up's
     footprint: turned off on its own, every picture whose prompt, images or plan change, with the runs of words
     it removes today and the runs it puts in; (b) each fact once; (c) the action as visible facts; (d) where two
     sources of one fact disagree, and ids standing in words. Readings of what the moments imply come from the
     cache only: a dream whose readings are not all cached is measured without them and listed.
  3. `evals/corpus.ts --label <after> --against <before> --verdicts evals/s6-verdicts.json [--came-back <retire
     label>:<clean-up>]`: every change of a step one by one (a paragraph changed in place, paired by its part of
     the prompt, gone or added; a picture's images; a field of its plan; a picture gone or new), each with a key
     that is the same for the same change in any run, classified: the verdict in the step's committed verdicts
     file (intended, regression or neutral, with why), else neutral by rule where only the order, case or
     punctuation of its words changed, else a regression by rule where it brings back into a picture a run of
     words the retired clean-up removes there today (its footprint), else unclassified. It writes
     `runs/corpus/<after>-vs-<before>-verdicts.json`, the unclassified with their word diffs to fill in.
  4. `test/retire.test.ts`: each switch turns off only its piece (the moment's words, each of a look's five
     clean-ups, the writing and its speech rule, each record word list on a frozen dream where it acts, the others
     not moving it); the assembler reads none; word runs, change keys, the classification and the came-back rule;
     the readings on a frozen dream (a look said twice, a sequence in what happens, "outside it l2").
  **Each fact once, defined** (`evals/retire.ts factsOf`, `saidTwice`). A fact is one clause of the dream that the
  cut sheet gives the prompt: of the look of each one in view, what one has turned into, how each one is now (or a
  state carried), what an in-between picture shows, the moment's own words (what happens, what it must show, the
  dream in it, the feeling, the jump), and the colours the dream gives. It counts with at least two words that say
  something (lower case, no little words, a plural as its singular), and never when it is only a name. A prompt
  says it where its words stand, in order and together, in a line: a paragraph, or one row of the images, of "In
  it" or of the repairs. Said twice: in two lines or more, or twice in one. Two readings of it: *no fact's words
  twice in one prompt*, by kind of repetition (first that fits: *shot*, said once by the prompt's own lines and
  again only in the view's or brief's words, which the floor plan or a model wrote; *state*, how one is now, a state
  carried or what an in-between picture shows; *story*, the moment's own words repeating each other or a look;
  *colour*, a colour the dream gives said again in the style; *look*, a look in its image's line and again in "In
  it"); and *one source per fact on the sheet*: no clause carried by two kinds of field (a state and an in-between
  picture, a look and the colours told, the action and the dream).
  **The action as visible facts, defined.** Typed: the sheet carries the moment's acts (who, from those in view;
  what they do, one act a picture shows at one instant; to or toward what, in view or a part of the place; with
  which hand, where they hold or touch something; where they look, where the moment names it), and "What happens
  in this frame" is written from the acts alone, a test holding it to them as S3's holds `assembleCut` to the
  sheet. Read on the paragraph as sent (`evals/retire.ts NOT_SEEN`, the eval's own reading of the words sent, never
  a harness word list): no sequence or time ("then", "starts coming", "keeps rising", "suddenly"), nothing heard,
  felt, thought or known as the act ("listens", "knows", "feels"), no "you", no story word ("the turn", "at that
  moment"), no one or nothing the record has gone, nobody called by the name of what they were before they turned
  into something else, and every person or animal in view the subject of an act (read today as named in the
  paragraph; "they" is not read, so the before is an upper bound). The acts of the saved dreams need a model step:
  a writer reading of each moment, checked by Jev and cached as the implied reading is (115 frozen and 411 live
  moments; the writer is Claude, on the subscription).
  **The ledger: every clean-up and duplicated computation S6 retires, in its order.** A footprint is what changes
  with the clean-up turned off and nothing in its place (moments + in-between pictures, frozen / live, record on;
  record off in brackets where it differs): every such change is a regression if the clean-up were only deleted,
  so it names the pictures whose change is intended when the typed fact takes its place, and the words that must
  never come back (`--came-back`). A duplicate's footprint is the moments where its sources disagree today: those
  prompts change when one source wins, and each change is classified. Every step also classifies any change
  outside its footprint.

  | # | What, and where it runs | Replaced by | Footprint today, frozen / live | Retired right when |
  | --- | --- | --- | --- | --- |
  | 1 | The story record made three times from the same inputs: for the plan (`recordForPlan`), the sheet (`sheetDream`) and the panel's tree (`treeInputOf`), and again for the shadow log (the implied reading's own record is made without the readings, on purpose, and stays) | One record per state of the dream, passed to the plan, the sheet, the tree and the log | 0 (the same inputs) | a test holds a rebuild to one record object read by all three; corpus 0 changed |
  | 2 | Two trees: the panel's (pictures drawn, the conversation's goals) and the sheet's | One tree whose ledger holds what is drawn and approved (S5's stage image reads it) | 0 | corpus 0 changed; the panel's tree unchanged |
  | 3 | The image cap three times (`assemble.ts MAX_IMAGES`, `gate.ts MAX_REFERENCES`, `frames.ts`) | One constant | 0 | corpus 0 changed |
  | 4 | Who each image is for, worked out again (`prompt-cases.ts refsOf`, `gate.checkReferences` reading "Image N" back out of the prompt), and the gate's line-text matching (`startsWith('The shot')`, `'around: "What the camera sees'`) | `assembleCut` returns each image's subject and each paragraph's id; the gate and the evals read them | 0 | corpus 0 changed; the 94 prompt cases unchanged |
  | 5 | Names three ways (`pictureName` of the sketch, the record's `called`, the tree's `calledIn`), and ids in words: a saved floor plan's view words carry a place's id ("facing the high round window; outside it l2") | The record's `called`; an id in saved words resolved to its name once, when read; the floor-plan step writes names | names differ in 4 / 15 moments; ids in words 1 moment + 1 in-between picture / the same (library-1 m5) | ids in words 0; each name change classified |
  | 6 | Kinds: the sheet's person, animal or people by the `isAnimal` and `isGroup` word lists, the record's kind, the tree's category; the tags read from whichever has one | The record's kind | 5 / 13 moments | classified; the tags from one source |
  | 7 | Who is in view: `inViewOf` three times (the sheet, framePrompt, the gate), three sources (the plan's lists and view, the record's `shows`/`present`, the tree's `at`) | The record's `shows` and the camera's view (`sees`), on the sheet; the gate reads the sheet | sheet and record differ in 7 / 29 moments; sheet and tree in 2 / 7 | classified |
  | 8 | How each looks, two ways: the sketch's words through `lookIn`, and the record's repaired `base` facts | The record's base facts, each clause with its basis, said at assembly | 50 / 178 moments (60 / 222 looks) | classified (the record's rules, the way of drawing, what is said twice, first looks, after a change, show as intended; a look's words lost is a regression) |
  | 9 | `after_words`: `lookIn`'s `withoutWords` (the record's `unsaid`) | The record's base, which lacks them (step 8) | 7 / 20 (b0cb's glow from the doorway, 0f40's Tomas at ten in school uniform; live 5 dreams) [0 / 0] | 0 changed after step 8; its words never back |
  | 10 | `vague`: `lookIn`'s filter of a field that says nothing (`VAGUE`) | The record's filter, once (step 8): a look field that says it does not know left out whole, as `lookIn` does (clause by clause brought back "with soft edges and muted colors" of an indistinct face, live) | 0 / 42 (7 dreams: "hair: undefined", "not remembered") | 0 changed after step 8; never back |
  | 11 | `pose`: `lookIn`'s `withoutPose` | The record reading the sketch's words once (it strips the pose of people and animals, not yet of places and things); the producer writes a sketch's framing apart from its look for new dreams | 37 / 68 (8 and 17 dreams) [38 / 63] | 0 changed after step 8 for people and animals; a place's or thing's pose words back are regressions until the record reads them too |
  | 12 | `members`: `lookIn`'s filter of a group's words about someone with a sketch of their own | The producer's links (`partOf`) and the group's look without its members' clauses, once in the record | 0 / 3 (the family's baby, e16f and 0199) | never back |
  | 13 | `shades`: `lookIn`'s `inShades` | Moved to assembly: a guessed colour said as a shade of the one colour, from each clause's basis and the style | 15 / 57 (2 and 11 dreams) [15 / 61] | 0 changed; no colour said two ways, shaded in a look and whole in the style (7 / 9 moments today: library-3's "mid-toned … green glass lamps") |
  | 14 | A look said twice: in its image's line and in "In it" | Said once | 115 / 409 of 411 moments (2013 / 5698 facts) | 0 facts of the look kind twice |
  | 15 | The colours the dream gives, twice: `style.told` beside `inView[].colours` (an image's line and the style) | One field | a colour said again in the style in 71 / 193 moments (165 / 474 facts); in a style of one colour in an image's line and the style 20 / 42 | 0 facts of the colour kind twice; 0 facts on a look and the colours told |
  | 16 | How each one is now, four ways (the plan's words `now`, its typed `facts`, the record's facts at the sheet, the tree's stages), the changes in force two ways (the plan's `states` and `inView[].changes`, the record's `own`/`carried`), and one state said in an image's "Except", an in-between picture's line and "How each one is at this moment" | The record's facts at the moment, said once | plan and record states differ in 2 / 8 moments [20 / 33]; a state said twice in 41 / 118 moments (107 / 265 facts); `record_moved` 0 on rebuilds | 0 facts of the state kind twice; 0 facts on a state and an in-between picture (27 / 38 today) |
  | 17 | Each picture's own copy of itself, made when it was first put in (`Item.frame` cast, `Item.fields` words, an in-between picture's plan), which drawing reads while a rebuild reads the dream as it stands: 2 of 61 moments sent with an out-of-date cast, 10 of 16 in-between pictures without the look before the change (S9); S9's `DREAMCHAT_FRESH_SEND` refreshes the copy at send meanwhile | The sheet built from the breakdown, the plan and the record as they stand when a picture is sent | 0 on rebuilds (both read the dream); the live-flow check | live flow: every sheet as sent equals a rebuild's where nothing changed after drawing |
  | 18 | The relation to the cut before, three ways (the plan's refs, `relationIn` for the move tag, the tree's side and camera), and the camera two ways (the plan's view and words, the tree's camera, side and screen) | The plan's cameras (S4's `sidesByCamera`, `sameByCamera`), one relation and one camera on the sheet | plan and sheet differ in 3 / 11 moments (lab; S4 moves both) | measured on S4's base: 0 differing |
  | 19 | `gone`: `withoutGone` | The acts never name what the record has gone or turned into something else | 2 / 3 (affd m9, aeea m14; cbba) | never back; `gone_named` 0 |
  | 20 | `writing` and `spoken`: `writingIn` and its `SPOKEN`/`WRITTEN_ON` lists | The writing the picture shows, a field of the moment and of each thing (what, on what, spelled), speech never writing | writing 3 / 5 (1 and 3 dreams); speech kept from being lettered 2 / 2 (aeea's "come on", acfd's "get on") | the spelled words stay in every footprint picture; pass-lighthouse-fresh-m3 met |
  | 21 | The moment's own words said twice (what happens, what it must show, the dream in it), and the point adding a guess to the action (library-1 m2's books "in the water") | The acts; the point as which act or thing is the focus; the dream as which fact is dreamlike: each said once | 26 / 84 moments (36 / 109 facts) | 0 facts of the story kind twice; library-1-m2-books met |
  | 22 | `self`: `SELF` | The acts (the dreamer looks at themselves); today the dreamer's own change at the moment already puts them in view | 0 / 0 | 0 changed |
  | 23 | `holds_name`: `HOLDS_NAME` ("the fish stall" brings no fish) | Presence from a reading of who is there, or the producer's ids, never a name's next word | 0 / 0 | 0 changed |
  | 24 | `state_verb`: `STATE_VERB` | The producer's change of the thing at its moment, or the implied reading | 0 / 5 + 2 (e130, the desert clock melting) | the same changes from the reading, else not retired |
  | 25 | `fills`: `FILLS` | The implied reading (water, snow, sand in a place) | 4 + 4 / 4 + 4 (library-1 fdd7) | the same states and in-between pictures from the reading, else not retired |
  | 26 | `opens`: `OPENS`, `OPEN_LOOK` | The implied reading, or the producer's change (open from there) | 4 + 2 / 8 + 4 (b0cb, 6081; 5a66, eef3) | covered by the reading, else not retired |
  | 27 | `not_there`: `NOT_THERE` | A reading of who is there, or the producer's presence change ("Tomas is gone") | 2 / 2 (affd m3 the dog, 0f40 m7 Tomas) | covered, else not retired |
  | 28 | `taken`: `TAKEN` | The floor plan's holders from the scene's start (the blocking's moves), never the words | 3 / 3 (09ea) | covered, else not retired |
  | 29 | `shut_away`: `shutAway` | The `undoes` reading (does it stay open once carried away?), a typed fact of containers | 7 / 10 (b0cb, a44a; eef3) | covered, else not retired |
  | 30 | S4's word lists (`camera.ts`, on `s4-camera`): hands (`HAND_VERB`, `handsIn`) and the dreamer's own body (`selfIn`, a second `SELF`) | The acts (what the dreamer's hands do; looking at themselves) | switches added to `cleanups.ts` when S4 merges | as the others |
  | 31 | S4's: a vehicle going (`GOING`, `PROPELLED`, `STOPPING`, `goingIn`) | A lasting state of motion in the record, going until it stops (the producer, or a reading) | when S4 merges | lighthouse-fresh-m12-heading met |
  | 32 | S4's: the water's height (`WATER`, `BODY`, `waterLevel`) | A typed level of a place's water (what it reaches: a fixture, a part of the body, or metres), from the implied reading | when S4 merges | as the others |
  | 33 | S4's: windows and doors on walls (`openingsIn`, `WALL_WORDS`), looking out (`LOOKS_OUT`) | The blocking's fixtures with their wall and height (a model step, not S6's), the plan's camera | when S4 merges | listed so they are not lost |
  | 34 | The shot's brief (`producer.ts shotFor`/`SHOT`, asked in `session.ts shootScenes` and `startFrame`) written from the floor plan's view, the moment's words and the moments before, never the sheet's facts: briefs add facts the sheet says otherwise (added 27 Sep from the S4 picture check's root causes) | The brief asked from the same sheet facts the prompt says (the typed act at one instant, the water's level, open or shut, who holds what, who is in view and where, what the camera rules add); a transfer drawn mid-act (the giver holds it out, or both hold it), the floor plan's holder at that instant agreeing; a brief refused (as `namesEvery` refuses one) that says after-the-fact ("just after", "already", "having", "drawn back from"), places someone not in view, or contradicts a sheet fact; a saved brief that does so falls back to the view's words | library-3 m6 ("a whale passes under the water, out of sight below the boat" beside the rules' "beside the boat, part of it above the surface"), library-1 m5 (a lamp "just above the water" under 4 m of water), snow-train-2 m6 ("his arms just drawn back from handing over the case": the owner judged it wrong, the frame after the handover; its plan has the receiver holding already), orchard m6 (Tomas "just outside the left edge" when he is gone), snow-train m3 ("head cut off") | give or hand-over moments whose plan has the receiver holding already: 0; of the 212 saved briefs and the checkpoint's, after-the-fact phrasing and contradictions with sheet facts: 0; a new prompt case snow-train-2-m6-instant met; a check that flags a brief contradicting a sheet fact |

  **S6 built so far (27 Sep, branch `s6-build` from lab 4746967; stopped at a clean point).** The switch:
  `DREAMCHAT_ONE_BUILDER` (`cleanups.ts oneBuilder`, `builderSteps`, `BUILDER_STEPS`: the steps built, in the
  ledger's order; unset or `off`, every prompt as before; `none`, the builder on with no step; `on`, every step; a
  step's name, the steps up to it, so each step is measured against the one before). A clean-up's step has its
  name, and `retired` reads it as off once built. With the builder on, each moment's typed reading is read while
  the shots are planned (`session.ts typedReadings`, the writer and Jev), kept in `draft.readings.typed`, and put on
  its cut sheet (`CutSheet.typed`, `takenOf`: only the facts Jev took); the evals read it from the typed cache only
  (`evals/typed-cache.ts withTyped`, wired into `corpus.ts`, `retire.ts`, `prompt-cases.ts`, `references.ts` and the
  checkpoint tool), and list a moment not cached. S4's word lists got their switches (`hands`, `own_body`, `going`,
  `water_level`, `openings` in `cleanups.ts`); their footprints on the new base are below. The switch is in
  `test/fakes.ts STEP_SWITCHES` and `evals/checkpoint-set.ts STEP_SWITCHES`. Tests: `test/onebuilder.test.ts`.
  One typed reading was missing with the camera rules on (library-1 m5: `namesForIds` puts "the old city library"
  where the saved words say "l2", so the writer's question differs): read anew, 1 writer call and 1 Jev call, cached.

  | row | status | measured (frozen / live; all: record, sheet, camera and references on; rs: record and sheet only) |
  | --- | --- | --- |
  | 1 one record | done (`one_record`: `record.ts oneRecord`, one record per state of the dream, read by `recordForPlan`, `sheetDream`, the panel's tree and the shadow log; a rebuild makes it once, not twice) | 0 pictures moved, all 128 / 482, rs 144 / 490; prompt cases unchanged |
  | 2 one tree | stopped: not built | the panel's tree is resolved from a plan made again now, with the pictures drawn and the conversation's goals; the sheet's from the plan the moments are drawn from, so that drawing and a rebuild read the same. One tree needs one plan: row 17 (the sheet built from the plan in force when a picture is sent, and S9's fresh send as the default) comes first; then the sheet reads the panel's tree and its ledger's drawn state |
  | 3 one image cap | done (`frames.ts MAX_IMAGES`, read by the assembler, framePrompt and the pre-draw check; the same number, so no switch) | 0 moved |
  | 4 paragraph ids and image subjects | done (`paragraph_ids`: `AssembledRef.subjects`; `Framed.assembled` and `RebuiltPicture.assembled`; `evals/prompt-cases.ts refsOf` reads them, and agreed with its own reading on all 526 moments; `session.ts onBrief`/`onView` tell the brief and the view by paragraph id, which also catches "What the dreamer sees", missed by the words; `gate.checkReferences` still reads "Image N" back from the prompt as sent, on purpose: a check of the assembly by its output) | 0 moved; prompt cases unchanged, case by case |
  | 5 names, no ids in words | done 29 Sep, cloud session (`names`, branch `s6-names`): an id the producer wrote into a moment's words is its name once the dream is read (`producer.ts namesForIds`, before only with the camera rules); the story record's `called` is the one name, a sketch's name winning where it has one (as its words do), and the cut sheet reads it; the producer is told to write names, never ids (`producerSystem`; off, today's prompt byte for byte). The floor-plan step itself (`BLOCK`) is not told: the id came from the producer's `looks_at`, and `namesForIds` at read time is the guarantee | frozen, rs: ids in words 1 moment + 1 in-between (l2) to 0; 1 dream, 2 pictures changed (library-1 m5, g4: "; outside it l2" gone), 4 changes, all intended (`evals/s6-verdicts.json`); all: 0 of 127 changed. Names disagreeing: 4 moments before and after the step under the old measure, 0 and 0 under the corrected one (the 4 were one turned into something else, called by what it is now in the tree and beside its name on the sheet: one fact, not two names; `evals/retire.ts`, tested). Prompt cases, rs, `--no-ask`: counted 19/34 to 18/34 met with 3 unanswered (library-1-m5-water, -level, -window: m5's prompt changed, so Jev has not read it), guards 36/36; all: unchanged. **Open:** live dreams not measured (no `state/` in the cloud); the 3 unanswered cases and m5's typed reading need Jev and the writer (about 5 Jev calls, 1 writer call) |
  | 6 kinds | done 29 Sep, cloud session (`kinds`, branch `s6-kinds`): the story record's kind is the one kind; the record also marks a group or crowd of animals as animals (`RecElement.animal`), so "the little silver fish" (8ceb p3, a shoal kept as a crowd) is a crowd and an animal; the sheet's `said` and `group` read the record where it holds one (else `isAnimal`/`isGroup` as before), and the tags' `animal` reads the record's animals; the record reads what one is from its sketch's words where it has one (as its look and name), else the breakdown's. Still deciding by the word lists: `groupMembers` (who a group's members are), the gate's kind for a sketch sheet, and the old builder off the sheet path | frozen, rs and all: kinds disagreeing 5 moments to 0 (each a crowd of animals the record called a crowd and the sheet an animal: 8ceb p3, "the little silver fish", m3, m5, m6, m7; 3cd7 p3, "the cats in the gardens", m6); 0 prompts changed (the sheet already said it as an animal); tags: `animal` added where the fish is in the picture (8ceb m3, m5, m6, m7), beside `crowd`; prompt cases unchanged (rs 18/34 ?3, 36/36; all 23/34 ?7, 35/36 ?1). Live (the Mac, 29 Sep): rows 5 and 6 move 0 pictures on 59 live dreams |
  | 7 who is in view | done 29 Sep, cloud session (`in_view`, branch `s6-inview`): one computation, `frames.ts inViewOf` given the story record's shows for the moment (with the camera's view, what the floor plan sees, beside them; the place once; the dreamer never through their own eyes); the cut sheet passes the record's shows; the gate reads the sheet's `inView` instead of working it out again; framePrompt (the old builder, off the sheet path) as before | frozen, rs and all: 0 prompts changed (the plan's lists and the record's shows agree on every frozen moment); the step matters where a moment's own copy of its cast is out of date (S9: 2 of 61 live moments), tested. Measure corrected and reported apart: the 7 moments where the sheet had more than the record were all the camera's view (the market's crowd and the sister beside the stall, 09ea m2-m4; the bicycle, 09ea m8; the tractor through the window, aeea m10; the dreamer beside the driver, aeea m13; the dreamer across from the grandfather, b0cb m2): 7 before and after under the old measure, 0 and 0 under the one definition. Sheet and tree still differ in 2 (8ceb m5, m6: the chalk the octopus holds): the sheet's own tree has it as linked to its holder, which the measure does not count as in view; left for the one tree (row 2). Review fixes: the gate reads the sheet's list only when the prompt was assembled from it (the sheet on, not in shadow) and again from each build, after a reword too; the record's shows are read only with the record on; the dreamer is left out by the record's eyes where shows are given (a copy through other eyes than the record's); the rebuild's `inView` (what the prompt cases and the checkpoint read) is the gate's; the parity test of assembleCut against framePrompt is pinned at the step before (`kinds`). Frozen, record and sheet on and with camera and references: still 0 prompts changed |
  | 8 looks | done 29 Sep, cloud session (`looks`, branch `s6-looks`): with the record on, the cut sheet says a look from the story record's base facts (`cutsheet.ts recLook`) where that base is the drawn sketch's own words and they are the sheet's (`RecElement.fromSketch`, the hash of those words: a sketch waiting or failed, or a picture rebuilt as drawn from other words, keeps `lookIn`); clause by clause with its basis (guessed or implied in the style's shades; said, confirmed or read as told), fields apart by ";"; a first look (a change made where the element is first shown) is said as how it is now, never also in the look; a group whose members have sketches of their own in view keeps `lookIn`'s look (its pieces naming them left out) until row 12; the pose of a place or thing still stripped (row 11). With the step, a bare medium word ("crayons", "watercolour") is a way of drawing only where the chosen style names it too (`record.ts styleIn`): "a box of crayons" stays a box of crayons | frozen, rs and all: 71 pictures changed, 142 changes, all classified: 24 intended (the way of drawing out of a look: aeea's key "rendered in faded watercolour", 0f40's orchard "sepia", 538d's dog "belongs in black and white") and 118 neutral (a joining "and" left off, ";" and ":" to ","), 0 regressions, 0 came back (`after_words`, `shades`, `pose`, `gone`). Looks disagreeing (measure: the record's look read as the sheet says it, first looks apart): 30 moments before; with the step 3 (a44a's red door's pose words, row 11's), the 16 moments of 5 sketches never drawn (4c79 heron and sky, aeea father, 6081 boat, 3cd7 roof) no longer compared, their look the sketch's words as before. Facts said twice, look kind 2013 to 2009 (rs). Prompt cases with Jev: counted 19/34 and 29/34, guards 36/36, no case moved (after the fixes, 42 more Jev questions). Reviewed 29 Sep: merge after fixes (never-drawn sketches, members, medium words, as-drawn looks, first looks, record-off gate, tests); all fixed, each tested; live check (the Mac, 29 Sep, 59 dreams, on db4f4aa): 248 pictures changed, 0 regressions by the footprints, 296 changes to classify by hand; read one by one, three were real losses, now fixed and each tested: a look field that says it does not know is left out whole by the record too, not clause by clause (6a4d's dreamer "with soft edges and muted colors", e564's "age range: 20s", bbba's "indoor room" came back); a group whose members have sketches of their own keeps `lookIn`'s look until row 12 (0199's family took the baby's "tiny, with light hair" once the record's clauses lost "baby:"); a clause said again in part keeps its new word (the record's rule of each thing once read "tall, tired everyday look" as said by "a tired everyday look", and Dele lost "tall": its pieces apart by a comma are each said, or it stays). Frozen after: the same 71 pictures and 142 changes, looks disagreeing 3; live asked again of the Mac |
  | 9 after_words, 10 vague | no step, 29 Sep, cloud session: since row 8 the record's look has neither (its base lacks the words from after a change; with the step, a look field that says it does not know is left out whole, as `lookIn` did), so on the record's path there is nothing to retire. `lookIn` still says the look where the record does not (a sketch never drawn, a picture rebuilt as drawn, the record off; a group whose members have sketches of their own until row 12), and there both still act: retired with a step, their words would come back there. So `lookIn`'s clean-ups are read by `offInLookIn` (`cleanups.ts`: off only by `DREAMCHAT_RETIRE`, for the footprints), never by a builder step, and go with `lookIn` itself | 0 changed (nothing built); a first attempt that retired them in `lookIn` measured 0 on the frozen dreams, whose fallbacks (5 sketches never drawn: 4c79's heron and sky, aeea's father, 6081's boat, 3cd7's roof) have no words from after a change and no vague field, and was dropped |
  | 11 pose | done 29 Sep, cloud session (`pose`, branch `s6-pose`): the record strips the pose and framing of a place's or a thing's sketch words clause by clause, as the sheet's look did, as it already did a person's and an animal's (theirs in `record.ts factsOf`); after the record's rules have read the whole look (`withoutThingPose`): a rule that moves a clause to after a change still finds it ("and standing wide open" of a door opened later), and one that rewrites a clause leaves no pose at its start; the sheet's look no longer strips it again; `lookIn` keeps its own for its fallbacks (`offInLookIn`). Known and kept: a place's view words read as pose (4c79's sky, "looking down at a grid of streets and blocks of buildings"), gone from its look before this step too | frozen, rs: 1 picture changed, intended: a44a's in-between picture g2 said the red door's look from the record's base, with its sketch's framing ("standing upright on its own with no house or wall around it"), now gone as in every moment's look; all: 0 changed (S5 makes no such in-between picture); looks disagreeing 3 moments to 0 (every frozen look now the record's, said as the sheet says it); live not yet measured (the pose footprint is 17 live dreams). Reviewed 29 Sep: fix first (the strip ran before the rules: a rewritten clause kept a pose, and a never-drawn door's "standing wide open" was said before it opened); fixed, each tested, frozen the same; re-reviewed: merge |
  | 12 members | done 29 Sep, cloud session (`members`, branch `s6-members`): the record says whom each clause of a group's look is about (`Fact.about`: those with a sketch of their own, the producer's `partOf` links or anyone named, whom its piece up to its ";" names, read without its pose, as `groupMembers` and `lookIn` find them; for everyone who may be a group on the sheet, which reads a group from its own words: the dreamer "in a pair of round glasses" is one), and the sheet's look leaves out a clause whose member is in view, as `lookIn` left out the piece; such a group's look is the record's, no longer `lookIn`'s (row 8's fallback for it goes); the retire measure leaves the same clauses out | frozen, rs and all: 0 changed (no frozen dream has a group with a member sketched apart: the ledger's footprint is 0 / 3); tested on 09ea with the sister made a family that names the old man: with him in view his piece goes, clauses after his name too, and stays without him; live asked of the Mac (0199's family and baby, e16f); reviewed 29 Sep: fix first (the dreamer read as a group on the sheet but a person in the record got no `about`, and a piece's pose naming a member took the piece with it); fixed, each tested; re-reviewed (a clause is also about anyone it names itself: a pose clause naming a member in view goes): merge |
  | 13 shades | done 29 Sep, cloud session (`shades`, branch `s6-shades`): a guessed clause has been said in the style's shades at assembly since row 8 (the clean-up's move); with the step a colour the dream itself gives (the sheet's told colours) its own colours (`toldColours` of the element: "red" said of the door keeps no guessed red scarf on the dreamer) stay whole inside a guessed clause too (`sheets.ts inShades` keeps them, longest first, never one half of two colour words joined by a hyphen; `cutsheet.ts recLook`), and in an in-between picture's look from the record (`frames.ts`, the colours its own style names), so a prompt says it one way; the retire measure reads the look the same way | frozen, rs: 14 pictures changed (all: 12), all intended: library-3's lamps (6e80 m1-m7), said green in its light, were "mid-toned glass lamps" in its filled-in landmarks beside the style's "keeps it exactly: … green glass lamps"; a44a's red door (m5-m7), said "painted bright red", was "painted mid-toned" in its guessed materials; colour said two ways 7 moments to 0; prompt cases with Jev (18 questions asked): counted 19/34 and 29/34, guards 36/36, no case moved; in-between pictures (6e80 g1-g3, a44a g2) the same, said whole; colour said two ways in an in-between picture 3 to 0 (the measure reads them now). Live not yet measured. Reviewed 29 Sep: fix first (in-between pictures still said the colour two ways, a moment's colours kept another thing's guessed colour, "red-brown" came out "red-dark"); fixed, each tested |
  | 14 look_once | done 29 Sep, cloud session (`look_once`, branch `s6-lookonce`): the cut sheet carries `once.look`, and the assembler names in "In it" whoever and whatever has an image of its own without saying its look again: the look is said in that image's line alone; what has no image keeps its look there. The assembler still reads only the sheet | frozen, rs and all: 115 pictures changed, all intended (each line of "In it" checked by script: only a look dropped after one with an image); look facts said twice 1999 to 89 (rs): 4 are someone turned into something else, said in their in-between picture's line and in "In it" (8ceb's Mr Hale, b91f's Dele: a state, row 16's); 34 are one look repeating itself within its own image's line (aeea m11-m14, the tractor cab's "a black steering wheel", "gauges and levers"), which no row yet claims; the rest are two looks within the images' lines (two people with short brown hair; an in-between picture beside its sketch: row 16) or a look beside the moment's own words and the shot (rows 21, 34). Facts counted as the shot's rose 29 to 43 (a clause said once in "In it" and again in the shot is now counted as the shot's). Live dreams not yet measured. Prompt cases with Jev (119 questions asked): rs counted 19/34 unchanged, guards 36/36; all counted 29 to 28 of 34, guards 36/36: lighthouse-fresh-m10-tractor ("Does this prompt say the red tractor is outside the room, in the field beyond the windows?"; the prompt says so at both steps, in the shot: "Out past the window, far off outside and never inside the place: the red tractor") was cached yes 0.66 at `shades` and no 0.46 at `look_once`; asked afresh four times each on the exact prompts: 0.61, 0.60, 0.71, 0.61 before and 0.52, 0.60, 0.54, 0.58 after, all yes. The step lowers Jev's reading a little (the round room's windows said once, in its image's line); the cached 0.46 was a low draw. Counted as this step's move, for the owner to accept. Reviewed 29 Sep: fix first (this case's account, the 89's account, two tests failing on the pushed head); fixed; re-reviewed: merge (the tractor case left for the owner to accept) |
  | 15 colour_once | done 29 Sep, cloud session (`colour_once`, branch `s6-colouronce`): the sheet carries `once.colour`; in a style of many colours, where every colour said above keeps it, the style lists only the colours the dream gives that no look above says (an image's line or "In it", as a whole phrase) and says the rest keep exactly "as said above" (`sheets.ts styleBlock saidAbove`); a colour said only in the moment's own words or the shot (affd's red tractor, 8ceb's silver fish) is of something with no look and stays listed; in one colour the style's list is the one list, and an image's line points to it ("listed under Colours", where the style has a Colours line): the style keeping library-3's boat yellow is what kept it from coming out white (`library-3-m5-continuity`: a first cut that took the boat off the style's list failed that case, and was changed). The measure of a colour in an image's line and the style reads the prompt as sent | frozen, rs and all: 71 pictures changed, all intended (checked by script: the style's list a strict subset with "as said above", or an image's list replaced by the pointer); colour facts said twice 165 to 64 (rs): what is left is by design, one colour's whole list beside the looks that name its colours (the list tells a kept colour from a shade), the style's own Technique and Light words, and colours said in the moment's words beside the style; an image's list of kept colours beside the style's (the new measure, read off the prompt) 17 moments / 28 facts to 0 (the old measure counted places' looks too: 20 / 43 at the base, and those, library-3's lamps and a44a's white and blue, are still said in the look and the style, by design); prompt cases with Jev (after the fixes, 14 questions asked): counted 19/34 and 28/34, guards 36/36, no case moved. Live not yet measured. Reviewed 29 Sep: fix first ("said above" matched inside words and in lines after the style; colours said only in the moment's words left the list; the measure's before and after counted differently); fixed, each tested; re-reviewed: merge |
  | 16 state_once (first part) | built 29 Sep, cloud session (`state_once`, branch `s6-states`): the sheet carries `once.state`; a state is said once, where an image's line says it: a part an in-between picture shows is said there, and its sketch's "Except" says it is now as that image shows (09ea's fish wrapped in newspaper, said three times, now once; 0f40's Tomas, his age and school uniform each as their image shows); "How each one is at this moment" leaves out a changed part an image's line about that one says, as whole words ("wet" of the fish's look is not the newspaper's); who holds what and what is shut stay there, and the closing line still says "as said". Still open in the row: one source for a state (the plan's `states` and the record's facts, which differ in 2 / 8 moments) | frozen, rs: 34 pictures changed (all: 31), 45 and 31 changes, all intended (checked by script: an Except pointing to its in-between picture, or the state paragraph losing a changed part only); states said twice 107 to 30 facts (rs); prompt cases with Jev (48 questions asked): counted 19/34 and 28/34, guards 36/36, no case moved; suite 864 pass switches off and on. Live not yet measured; not yet reviewed |
  | 17-34 | open, in the ledger's order | not started |

  The base these are measured against (lab 4746967, S4 and S5 merged; builder off; Claude's readings from the
  cache; `runs/retire/s6base-*`, `fp-*`):

  | reading | all, frozen | all, live | rs, frozen | rs, live |
  | --- | --- | --- | --- | --- |
  | facts said twice (of all) | 2324 of 2981 | 6505 of 8724 | 2350 of 3003 | 6595 of 8771 |
  | by kind, facts: look; colour; state; story; shot | 2005; 165; 86; 37; 31 | 5694; 474; 175; 113; 49 | 2013; 165; 107; 36; 29 | 5698; 474; 265; 109; 49 |
  | on two kinds of field, moments / facts | 45 / 58 | 107 / 145 | 51 / 69 | 117 / 163 |
  | "What happens" a picture cannot show (moments) | 21 | 134 | 21 | 134 |
  | ids in words (moments; in-between) | 0; 0 | 0; 0 | 1; 1 | 1; 1 |
  | prompt cases: counted (incl. model step); guards; hypotheses | 27/33; 36/36; 12/18 | | 19/33; 36/36; 5/18 | |

  Footprints on the new base, all switches, frozen / live (moments + in-between pictures): gone 2 / 3, after_words 7
  / 19, vague 0 / 42, shades 15 / 54, pose 37 / 68, members 0 / 3, writing 3 / 5, spoken 2 / 2, state_verb 0 / 5+1,
  fills 2 / 2, opens 8+2 / 12+2, not_there 2 / 2, taken 4 / 4, shut_away 11 / 17, self and holds_name 0 / 0; S4's:
  hands 1 / 1, own_body 0 / 1, going 5 / 6, water_level 17 / 26, openings 1 / 1 (none with the camera off).

  **How to resume.** `git checkout s6-build`; symlink `dreamchat/node_modules`; copy `runs/typed-cache.json`,
  `runs/implied-cache.json` and `runs/prompt-cases/jev-cache.json` (merge caches, never lose entries). Each step:
  add its name to `BUILDER_STEPS` in the ledger's order and gate its change on `builds('<name>')` (a clean-up's step
  has the clean-up's name and puts the typed fact in its place; the assembler reads only the sheet, so a step that
  changes what is said puts it on the sheet); a committed test that fails without the typed fact; then measure
  with `DREAMCHAT_WRITER=claude DREAMCHAT_DATA=<the dreamchat folder with state/>` and the switch set both ways (all;
  record and sheet only), frozen and live: `evals/corpus.ts --label <step>-… --against <previous step>-…
  --verdicts evals/s6-verdicts.json --came-back fp-<set>-<frozen|live>:<clean-up>` (every change classified in the
  verdicts file, 0 unclassified, 0 regressions), `evals/retire.ts --checks`, `evals/prompt-cases.ts --no-ask`
  (no counted or guard case lost). `fp-*` are the base's footprints (`evals/retire.ts` with the builder off). Next is
  row 5 (names three ways and ids in words: `namesForIds` to the default with the builder, the record's `called`).

  In all: 16 clean-ups and word lists on lab with a switch each (9, 10, 11, 12, 13, 19, 20 counting two, 22 to 29),
  S4's four groups when it merges (30-33), and 14 duplicated computations or repetitions (1-8, 14-18, 21). Not
  retired, and why: `sentence` (a full stop), `aNoun`'s article, the plan's `carries` cut at its first ";" (the
  harness's own words, not the dream's), and the line that says "you" is the dreamer (rule E3's safety net: 79 of
  411 live moments still say "you" in a rebuild, which the drawing path rewords with a model first; the typed acts
  end it). The order: what changes no prompt first (1-4), then one source for names, kinds and who is in view
  (5-7), the record's looks and then each of the look's own clean-ups (8-13: where the record already does a
  clean-up's work, retiring it changes nothing, which is the proof), each fact said once (14-18), the typed action
  (19-21, after its model step), the record's word lists as the readings cover them (22-29), S4's (30-33).
  **Before** (lab 6667b0f, record and sheet on, Claude's readings; frozen 15 dreams, 115 moments, 29 in-between
  pictures; live 59 dreams, 411 moments, 79 in-between pictures; `runs/retire/frozen-on`, `live-on`, and the same
  with `-checks` for the colours said two ways):

  | reading | frozen | live |
  | --- | --- | --- |
  | moments saying a fact twice or more | 115 of 115 | 411 of 411 |
  | facts said twice (of all facts) | 2350 of 3003 | 6595 of 8771 |
  | leaving out the shot's words | 2321 | 6546 |
  | by kind, moments / facts: look | 115 / 2013 | 409 / 5698 |
  | colour | 71 / 165 | 193 / 474 |
  | state | 41 / 107 | 118 / 265 |
  | story | 26 / 36 | 84 / 109 |
  | shot only | 24 / 29 | 41 / 49 |
  | facts on two kinds of field of the sheet, moments / facts | 51 / 69 | 117 / 163 |
  | moments whose "What happens" a picture cannot show at one instant | 21 | 134 |
  | sequence or time; heard, felt or known; "you"; story word | 12; 6; 0; 0 | 39; 20; 79; 1 |
  | gone named; turned named by the old name | 2; 2 | 8; 6 |
  | someone in view never named in it (upper bound) | 31 | 161 |
  | ids in words (moments; in-between pictures) | 1; 1 | 1; 1 |
  | a colour the dream gives said two ways (a shade in a look, whole in the style) | 7 | 9 |

  With the record off (`frozen-off`, `live-off`): facts said twice 2265 / 6398 (look 1986 / 5653, colour 160 / 462,
  state 66 / 144, story 34 / 105), on two kinds of field 84 / 199 facts, the action's rules broken in the same 21 /
  134 moments, the look's two sources differing in 48 / 146 moments and the states in 20 / 33.

  **Bars** (S6 on, on its own base, frozen and live; the before is that base with S6 off):

  | measure | bar |
  | --- | --- |
  | counted fault cases | every one met on the base stays met; library-1-m2-books met (the typed action, the point as its focus); lighthouse-fresh-m12-heading met once S4's `goingIn` gives way to the record's motion; left for a model step not S6's: night-market-m2-gaze and library-1-m5-level (the blocking), heron-m4-clothes (a look for the students, said nowhere); S5's: library-1-m5-window. On lab today 19/33 with Claude's readings (18/33 with DeepSeek's); 26/33 on `s4-camera` with DeepSeek's |
  | guards | 36/36, record on and off (S6's own: pass-lighthouse-fresh-m3, speech is never writing; -m4 the key in the lighthouse door; pass-library-2-m4 open like birds, the books' change carried; pass-library-2-m7 she rows) |
  | every change of every step on every saved dream, frozen and live | classified: 0 unclassified, 0 regressions (a retired clean-up's words back count as one unless a verdict says why not) |
  | facts said twice, leaving out the shot's words, of the look, colour and state kinds | 0 |
  | of the story kind | 0 with the typed action (its model step); counted until then |
  | facts on two kinds of field of the sheet | 0 |
  | moments whose "What happens" breaks a rule of the action as visible facts | 0; every person or animal in view the subject of an act |
  | ids in words; a colour said two ways | 0; 0 |
  | each duplicate (1-8, 16-18) | one source in the code; its footprint's moments classified |
  | live flow, fresh replays | every sheet as sent equals a rebuild's where nothing changed after drawing |
  | S6's switch off | 0 pictures moved, frozen and live, record and sheet off and on; `bun test`, typecheck |

  **Also for S6.** The checkpoint tool needs S6's switch in `STEP_SWITCHES` and every image still mapped by
  `evals/checkpoint-set.ts todayOf`. Jev's library questions that read the same faults in words (S7: `r_look_twice`,
  `r_action_seen`, `r_story_words`, `r_gone_drawn`, `r_quoted`) earn nothing yet: the bars here are code, and S7's
  labelled sets say later whether the pictures agree.
  **The typed readings (done 27 Sep, branch `s6-readings`, the owner's go-ahead).** Every saved moment read once
  for what its picture shows at one instant, as typed facts (`typed.ts`, the schema S6 imports): `act` (who in view
  does what, to what, where: one act a still picture shows, never a sequence, a sound, a thought or "says"),
  `motion` (every vehicle in view, moving or not, and anyone travelling; the heading only where the words give it),
  `fill` (water, snow, mist … standing in the place, `below`/`at`/`over` something in the place or a part of the
  body, else unmeasured; `levelWords` says it as `camera.ts waterLevel` reads it), through the dreamer's eyes
  `hands`, `holding` and `own_body`, `container` (open or shut as the story last left it: carrying a thing never
  shuts it), `beyond` (seen out through a window or door, or past the place's edges) and `absent` (named, not
  there). The writer (Claude, `claude-opus-5-5`, thinking low) proposes them from the dream's cast, the story
  before and the moment's words; Jev (jev-1.13.0) answers one-fact questions on each (an act: meant, and something
  a still picture shows; a level: said or bound to be so, one at the floor only as a thin layer with nothing afloat;
  …), one call a moment; a fact is taken when every answer is on its side of the bar (yes at 0.6, no under 0.4).
  The writer's answers are cached by its model and a hash of exactly what it was asked, Jev's by its model, state
  and questions (`runs/typed-cache.json`, 0.46 MB), so a rerun asks nothing and the bar can be moved without asking
  again: at 0.5, 45 of the 99 facts turned down would be taken. Before the full run, 20 frozen moments were read
  and every fact checked by hand: 73 of 74 taken right (a view out of a train window the words never gave); the
  prompt was tightened (the act and its object one sentence, riders move with their vehicle, nothing beyond from an
  earlier moment): 76 of 76; then 19 live moments, 42 of 43 (a darkness between streetlights guessed); the prompt
  was tightened again (speech drawn as what the body does, anything afloat is deeper than a floor, a place wholly
  under water is unmeasured, beyond includes past the place's edges) and the motion question made to tell a boat
  floating in one place from one travelling.

  | read | frozen (115 moments) | live (411 moments) |
  | --- | --- | --- |
  | facts proposed, taken | 330, 290 (88%) | 1015, 916 (90%) |
  | act | 144, 138 | 502, 478 |
  | motion | 59, 49 | 180, 152 |
  | fill | 39, 31 | 77, 57 |
  | hands; holding; own body | 17, 14; 4, 3; 17, 16 | 68, 62; 7, 6; 68, 66 |
  | container | 18, 16 | 33, 31 |
  | beyond | 24, 20 | 65, 54 |
  | absent | 8, 3 | 15, 10 |
  | moments with a taken act; with no fact taken | 100; 6 | 358; 25 |
  | a sample of taken facts across every kind, checked by hand against the moment's words | 27 of 27 right | 27 of 27 right |

  The 526 moments are 411 distinct readings (live keeps copies of the frozen dreams, and the replays repeat
  moments). Calls in all, with the pilots and the first prompt: writer 697, Jev about 585 (the final readings
  alone: writer 411, Jev 319); none failed and no limit was hit. Each word list against the typed facts on the live
  dreams (agree / disagree / the list only / the facts only), which is what S6 retires them by (frozen alike, a
  subset; `runs/typed/live.txt` lists every difference):

  | word list | live | the differences |
  | --- | --- | --- |
  | hands and own body (`HAND_VERB`/`handsIn`, `selfIn`) | 60 / 2 / 6 / 0 | cbba m6: the record has the dreamer holding, the facts not; cbba m9: the facts have them holding the paper boat, the words alone not; the 6: Jev took nothing of the hands there |
  | a vehicle going (`goingIn`) | 34 / 7 / 11 / 0 | every disagreement read by hand has the facts right: the tractor moving in the lighthouse m11-m13 (the grass bends away from its wheels: lighthouse-fresh-m12-heading), a boat afloat and still, the aunt's car arriving, a boat rowed out of the window, the bicycle flying to the jellyfish; the 11: a boat just sitting there, which Jev will not read as still |
  | the water's height (`waterLevel` on the record's words) | 16 / 3 / 3 / 17 | the 3: almost up to the high round window, 1.3-1.8 m, where the record's words give 0.95-1 m (the S1 water cases); the 17: water the record never has there (the underwater school, the drowned city outside the window, water to the desk legs in de6c …); the list's 3: water just come in over the floor, which Jev does not confirm |
  | `fills` | 4 / 0 / 0 / 30 | the facts add water, snow and mist standing in a place, which the words never tell coming in |
  | `opens` | 2 / 0 / 2 / 21 | the facts add doors, gates and lids opened in words `OPENS` does not match ("the lift gate opens on its own"), and still open later |
  | `shut_away` | 0 / 6 / 4 / 0 | by design: the facts keep a suitcase open as the story left it, where the list shuts it once carried; the 6 are S6's intended changes |
  | `not_there` | 8 / 0 / 0 / 2 | the facts add the family gone (9ddd m6) and the dog only heard (affd m2) |
  | `taken` | 0 / 0 / 3 / 0 | the night market's fish (09ea): no act of taking in the facts |
  | `state_verb` | 0 / 0 / 4 / 0 | the desert clock melting (e130): not a kind the typed reading has; it stays with the implied reading (ledger 24) |
  | `self`, `holds_name` | no decision on any dream | as the ledger found |
  | beyond (the plan's `outside`, `outThroughWindows`) | 5 / 0 / 0 / 3 | the facts add the students seen through the door's round window, and two figures walking off past the platform |

  Not in the typed reading: a passing state of a thing (melting, broken), who holds what in anyone's hands but the
  dreamer's, and which wall a window is on (ledger 33, the blocking's). S6 reads the cache only (`--no-ask`, or
  `readTypedDream` with `cachedFns(…, { ask: false })`, then `takenOf`): nothing is asked again.

## Where steps overlap (read before starting any step)

Work found in one step that belongs to, or touches, another. Keep this list current; nothing here may be dropped
between sessions.

| From | To | What |
| --- | --- | --- |
| S0 | every step | Frozen dreams have no pins, re-plans or corrections: each step also needs a live-flow check (S1's review found two faults only the live path shows). |
| S1 | S3 | `record.ts` renders English sentences (`nowAt`); the cut sheet should carry typed facts (who, part, now, held by, basis) rendered once at assembly. New word lists in S1 (FILLS, OPENS, STATE_VERB, NOT_THERE, SELF, TAKEN, HOLDS_NAME) overlap the implied-state reading and should give way to it. |
| S1 | S4 | Water level and boat height come from floor-plan heights (library-1 m5, library-3 m7 still fail on the mock-up's layout); a held thing in a through-the-eyes view is placed at its floor-plan spot instead of the hands; the "Nobody else is in the picture" line can list people who are. |
| S1 | S5 | Implied changes make no in-between picture of their own until S5 settles the owner's rule (one only when an edit carries several changes); the per-change in-between pictures from before remain for S5. `shutAway` closes anything opened when carried to another place (right for a suitcase, wrong for an umbrella or book). **S5 (27 Sep, DREAMCHAT_REFS):** at the owner's bar of two, an in-between picture of a change is drawn only where it takes a change off a cut that would otherwise carry two; a change a moment makes itself is drawn in its own edit. |
| S1 | S5 | With Claude reading what the moments imply, the readings bring in-between pictures that turn a place to face something ("the old city library, facing the yellow boat"): frozen 29 against 24 without the readings, live 79 against 67. S1 stops only a state read as implied from getting one; which of these the owner's rule (2 or more changes) keeps is S5's. **Settled (the owner, 27 Sep) and built in S5:** a side the floor plan lays out is no change, so these go (frozen 5 to 0 with the record on); a side is a change only where nothing lays the picture out. |
| S1 | S6 | `withoutWords` is another regex clean-up in frames.ts; S6 retires these. Text rendering bugs of the record land in the prompt until S6 builds it from the sheet. |
| S1 | S2 | The live-flow check (`evals/live-flow.ts`) passes a moment the checks acted on: drawn again from a list of what went wrong, or drawn without its brief because the pre-draw check set it aside (5 of 26 moments on the fake replays, 27 Sep). A rebuild cannot know these; once S2 makes the checks log only, those moments should rebuild word for word. Done on the picture path (27 Sep): with DREAMCHAT_CHECKS=log the redraws of those dreams have 0 moments differing because a check acted (jellyfish-city m5, sea-school m2 and m7 rebuild word for word); to confirm on whole replays once DeepSeek is back. |
| S2 | S7 | The checks' readings, logged per picture with DREAMCHAT_CHECKS=log: `gate` transitions in each dream's Jev log (every answer with its bar, what it found, and whether it acted), `previs` transitions for "storyboard complete?", and `overrode` on the picture as drawn. S7's labelled sets are these against the pictures. A reading is not put on a line when logging (the line search was 4 in 5 of the gate's calls): if S7 needs the line a reading rests on, it asks for it on the logged prompt. Each reading carries `ref` (prompt hash, take, question-wording hash) and each picture keeps `checkedTakes`, so a label joins the take it was read for. |
| S2 | S7 | Still acting with the checks only logging, and not a check of a picture: `planFacts` plans a scene once more where Jev reads that its camera faces something the plan lacks (a Jev reading acting on the plan: S7 decides whether it earns it, like any check); `planUnplanned` where a scene has no plan. Only code faults hold a picture (`actsWhenLogging`); the continuity plan's warnings (carried in words only, many changes at once, no visible action) are logged, and S7 decides whether any earns acting. |
| S2 | S9, S3 | A redraw (`evals/redraw.ts`) found moments a rebuild does not give as sent, no check's doing: the style's colour line takes a colour the dream gives something drawn later (sea-school m4 "orange octopus", snow-train m7 "red door"); an earlier picture taken as a rebuild takes it (desert-station m6, paper-city m5); desert-station m3-m6's sheets differ in `tree`; the in-between pictures' look lines are sent with commas and rebuilt with semicolons (desert-station, grandma-kitchen, paper-city, snow-train). What a rebuild reads should be the dream as it stood when the picture was drawn (S9's record of what was drawn). **Cleared by S9 (27 Sep):** one fault, each picture's own copy of itself (an action reworded without `said`; the cast a moment was first put in with; an in-between picture's plan made before the record's look before the change; drawing's tree reading the plan kept since the moments began); a rebuild reading the records gives all 61 moments and 16 in-between pictures of the redraws as sent. That drawing reads those copies is S9 → S3, S5 below. |
| S1 | S9 | The Strawberry production is written at `start`, before planning and the implied reading, so implied changes have no production coverage. **Partly S9's (27 Sep):** each picture's record keeps the typed facts it was drawn with, an implied one marked, so what a picture was told of an implied change is on record. The production's own coverage is still open (S9 → S6). |
| S2 | S7 | S2 makes the checks log only; their logged readings become S7's labelled sets. |
| S7 | S8 | Done in S8 for now (behind DREAMCHAT_LISTEN=on), and S7's to own: `jev.ts choiceByAction` sums the labels that lead to one action before the bar; the action that loses nothing (revise a profile, take a correction) is taken from 0.25, "you choose" beside a change is the change, and otherwise a rival at 0.25 is asked again; the profile's answer is worded so a detail beside "leave the rest to you" is a change (`PROFILE_REPLY_S8`). Read again over the three after-runs' stored answers: changes read as settled 31/26/17 to 9/7/3, clear answers read as unclear 0, and answers changing nothing now read as changes 12/18/12 (27 of 37 a profile answer that only restates it, which the revision keeps; 10 a plain "yes, that's right" to a retelling, which costs a turn telling back). These bars, and the reply check's questions (`jev.ts replyCheck`), are hand-set: each needs the labelled set S7 builds for its questions. The check lets through follows that guess what happened next ("did you go through it?", 3 of 4 on `evals/listening-audit-s8.json`, where the listening test catches all 4). Added 27 Sep (fresh simulation's fixes): a profile's change is any detail it lacked (who or what it is, how it looks, what it wears, what is in it or what it is made of), and beside the retelling's choice a yes-or-no question (`retell_adds`: does the answer put anything right or add anything), asked only of the answer to the whole telling back, a change at 0.5 (`ADDS_BAR`). Both hand-set, and `retell_adds` is close in intent to the listening test's own `changes` question, so the test's misread count is not an independent check of it: it was read by hand over the stored answers of both arms (`evals/probes/listen-readings.ts`, which now rebuilds a frozen conversation's question). |
| S8 | S1 | `producer.ts inTheirWords` is provisional: whether a reworded or revised profile field is still the dreamer's words is a word-overlap rule over their messages (read from the conversation as kept, not the rendered text), standing in for the per-clause said basis S1 owns; it goes once the record carries the basis per clause. 22% of "said" facts were never said (the before: 273 of 1227, 258 from sketch profiles). S8 fixed the sketch side (a reworded or revised profile keeps their words apart from ours: 1% left, 12 of 912), but the breakdown's own fields are still graded whole by `ground.ts` ("the corridor: perhaps lockers or doors" passes because the corridor was said): every one of the 12 left. A `Detail` holds one said flag, so a field with their words and a guess is either said whole or not at all; the basis belongs per clause in the breakdown, the record and the sheet (S1, S3). 27 Sep: with S8 on, a said value is now grounded claim by claim (`ground.ts claimsOf`, the breakdown and every profile revised or reworded from an answer) and keeps only their claims; a look folded in after grounding never makes a value said. Still S1's and S3's: our claims are dropped, not kept as ours beside theirs, and moments are still graded whole, so a told moment with one inferred detail is a guess whole (the pilot of the fresh after, flooded library: "the water has risen over the desks, the green lamps just above it, and hundreds of books float off the shelves" went to the retelling as "(my guess)", and three told facts were no longer said). |
| S8 | S8 | Done: an explore_thread move follows only what the message just answered raised (0 of 131 older, from 121 of 201 in the before). Coming back to an older thread as earlier once the story is told (rule 6b) was dropped on 27 Sep (below); an aged thread waits for rule 8, after every gap, never one taken up and never twice in a row. |
| S8 | S7 | Every reply is checked against its move (`jev.ts replyCheck`), and the check is kept in each turn's detail (`replyCheck`). Picture turns are checked but not sent back: their briefs hold conditions ("if they ask, say…") a check on the brief cannot read, a second try fixed none of five, and their compliance by the listening test was 54% (61% before, in shorter conversations). S7 can label these checks; the picture briefs need their own questions. |
| S8 | S1 | `test/record.test.ts` ("every saved session derives, and derives again to nothing new") fails on a simulated flooded-library conversation of this step's smoke run: "round window open" is both a change at m9 and the window's first look (`passing` then `first_look`). It reads saved sessions, so only a checkout with them sees it. Again on 27 Sep with the fixed after's saved sessions: the lighthouse's "lighthouse door open" both a passing change at m6 and the door's first look; set aside, the suite is green. |
| S8 | S3 | The producer can write "not applicable" into a field (the lighthouse dog's wardrobe, third after-run), which `VAGUE` does not catch and the Strawberry engine refuses as a placeholder: that conversation's production failed. |
| S8 | every step | Cost of listening: a listening reply now takes a median 4.5 s (p90 13 s) with the check and, for about half of them, a second try that thinks first; the retelling waits for the breakdown (median 14 s) and takes a median 27 s to write. The check shares its judge, and close wording, with the listening test: in the second round they agreed on 554 of 564 move verdicts, and the test found 10 the check had passed, none the other way. |
| best-of-takes branch | S5, S10 | Built, off by default (9371476), parked; touches session.ts; merge after S1 lands. |
| S1 | S6 | The in-between picture's instruction "Image N: the newspaper's newspaper … draw their newspaper" repeats a thing's name (3 prompts, off and on): same class as the fixed "its the block of ice", only fixed in the "Except" sentence. |
| S8 | S1 | `test/record.test.ts` failed on one newly saved simulated session ("round window open" folded twice) — the record's first-look fold on implied states; check when saved sessions change. |
| S8 | S3 | The producer can write "not applicable" into a field, which the Strawberry engine rejects (one conversation's production failed): the breakdown's empty values should be null. |
| S8 | S8 | Done 27 Sep: said-but-not-told residue (12/912 on DeepSeek; on Claude about 9 real of 518) came from values graded whole, by `ground.ts` and by the word overlap that marked a revised profile theirs, and from a look folded into a guess after grounding; a said value is now asked claim by claim (see S8 → S1). |
| S8 | S8 | Done 27 Sep: the come-back rule (6b, circle_back) was answered "I don't remember" 17 of 21 times on the Claude writer and began 10 of the 12 retellings made because they ran out of memory (6 in the before). Dropped rather than kept for a thread a picture needs: what a picture needs of a look is asked openly at the profiles (F2), where 10 of the 21 were asked again, and the other 11 were looks F2 leaves to be imagined; measured again on a fresh after (S8 eval, below). |
| S8 | S1 | Told facts lost from what is said, before S8 and in both arms (kept as said 0.949, 0.946, 0.942 on Claude, within noise): the producer marks a value holding their words and a guess a guess whole; a moment is graded whole, so a told moment with one inferred detail is a guess; and a value whose every claim is said is made a guess when no single message says the whole value (the evidence rule: 7 values in the fixed after, among them the paper city's "really bright colours, reds and yellows and blues"). Next rules to try, measured: which message says each claim, and moments claim by claim. |
| S8 | every step | A Jev outage (a 520 from its host) reads that turn's answer as no answer: a profile answer was read as unclear and asked again (the pilot of the fresh after, crayon cat, 27 Sep). Nothing retries a failed bookkeeper call. |
| S8 | S0 | The simulated dreamer's message once began with a stray "antml:reasoning_effort>" line from the writer's output (first Claude after, night market t13): `simulate.ts` passes the writer's text through as the dreamer's. |
| S1 | S6 | A floor plan's view words can carry a place's id: "facing the high round window; outside it l2" (the key-and-boat library, m5, from the saved plan) reaches 1 prompt without the implied readings and 4 with them (the in-between pictures named after it). |
| S3 | S6 | `docs/cut-sheet-map.md` lists every prompt input and where it is computed today; S6's `assembleCut` reads only the sheet S3 builds. |
| S3 | S6 | The sheet still does framePrompt's text clean-ups while it is built (`withoutGone`, `lookIn`'s `withoutWords`/`VAGUE`/`withoutPose`/`inShades`, `writingIn`), so the port stays word for word; S6 retires them for typed facts. `assembleCut` returns each paragraph with an id (`framing`, `shot`, `manifest`, `now` …) and the sheet fields it says: the gate's line-text matching in session.ts (`startsWith('The shot')`, `'around: "What the camera sees'`) can use the ids. |
| S3 | S2 | On the drawing path the gate drops a moment's brief when it finds the prompt at odds on "The shot" line; a rebuild cannot know it did. A moment now keeps a print of the sheet it was sent with (`sentSheet`), and the live-flow check counts a sheet that differs only in the brief as explained where the prompt is (jellyfish-city m5, sea-school m2 and m7 of the record-fake flow replays, drawn before the print was kept). It goes once S2 makes the checks only log. With DREAMCHAT_CHECKS=log the brief is never set aside (0 in 20 redraws, against 3-6 acting) and those sheets match; the explanation in live-flow can go when log is the default. |
| S3 | S4 | Tags `move`, `crossed` and `role` are the camera rules' inputs: a reverse is the camera turned at least 135° from the cut before in the same place (snow-train m2 and lighthouse-fresh m12 read as reverses); `crossed` is its side of the scene's line (the tree's, from the scene's first two-shot) differing from the cut before's; `role` is counted from who is in view and the size, with the tree's over-the-shoulder, since `outsideShot` still returns only words. Consecutive sheets (`prev`) are what S4's rules read. |
| S3 | S4 | `relationIn` (continuity.ts) calls the moment after a jump "another place" from the jump's own picture in the same place (the key-and-boat dream m7 and m9, the lift m5): a jump moment counts as a boundary behind itself. The move tag and the plan's references both read it; fixing it changes plans and prompts, so it is S4's, measured. |
| S3 | S5 | The sheet's `inView[].image` is the sketch only; `earlier` is the plan's choice. S5's `chooseRefs` needs each element's image of the stage in force (its in-between picture, drawn and approved, or its sketch) from the tree's ledger, and chooses image 1 by the tags. **Built (S5, 27 Sep):** from the sheet's own earlier pictures, which hold only what is drawn and approved (the tree's ledger still has no drawn state: S3 debt). |
| S3 | S7 | Every cut has its tags (logged in shadow, listed per moment by `evals/corpus.ts`); S7 routes questions by them. |
| S2 | S9 | A dreamer's correction while drawing patches the moment it redraws but not the breakdown, so a rebuild reads the old words (car-park m4 of the logging whole replays: sent "it is already raining upward", rebuilt "rain falls upward"). What a rebuild reads should be the moment as drawn. **Covered by S9 (27 Sep):** the record keeps the words a picture was drawn with (the correction), so a rebuild reading it gives the moment as sent (a session test), and a picture drawn from its earlier take is stale. That the breakdown keeps the words as first told is S9 → S1 below. |
| S3 | S9 | A re-plan updates the moments' plans but not `build.plan`; the drawing path's sheet reads each moment's own plan. A sheet is flagged `record_moved` where the record now differs from the typed facts its plan was made from: stale, for S9. Frames saved before S3 carry the plan's words without typed facts (`nowWords` on the sheet). **Cleared by S9 for drawn pictures (27 Sep):** staleness compares each drawn picture with the plan a re-plan makes now (its facts from the record, its camera, its cast, what it is drawn from), so a picture drawn from a plan made from an older record is stale with the facts that moved. The sheet's flag stays, for pictures not yet drawn. With DREAMCHAT_FRESH_SEND=on `build.plan` follows a re-plan too. |
| S9 | S3, S6 | A moment keeps the cast (visible, things) it was first put in with: a re-plan updates only its plan, so drawing reads an older cast than the plan (paper-city m5 drawn without the red paper bird the plan puts in the dreamer's hands; desert-station m6 with its people in another order). S9 reports it as drawn behind the dream; drawing should read the plan's cast (S3's "who is in view, three sources"). **Fixed behind DREAMCHAT_FRESH_SEND (27 Sep):** a moment takes its cast from its plan when it is sent; still to be made the default. |
| S9 | S5 | An in-between picture keeps the plan it was first put in with: a re-plan adds and drops them but never updates one waiting to be drawn, so 10 of the 16 in the redraws were drawn from plans made before the record gave the look before their change. S9 reports them as drawn behind the dream; S5's in-between pictures should be drawn from the plan in force. **Fixed behind DREAMCHAT_FRESH_SEND (27 Sep):** an in-between picture takes the plan's for its change when it is sent. With S5, a moment reads what its in-between picture shows (`GhostPlan.shows`) from the picture's own copy: run S5 with the fresh send on, so one planned before S5 was switched on is refreshed. |
| S9 | S1 | A dreamer's correction of a moment's words is kept on the moment only (a rewording is written back to the breakdown by `keepWords`; a correction is not), so the story record and later moments' plans read the words as first told (car-park m4). With DREAMCHAT_FRESH_SEND=on a rewording written back keeps the breakdown's `said` (the lost-`said` half, where rewording lives); the correction's own words still never reach the breakdown. |
| S9 | S7 | Staleness is reported only (`as_drawn` transitions in the Jev log, `/api/stale`); `followCorrections` (Jev deciding what follows a corrected moment) still acts as before and does not read it. Whether a stale picture is drawn again, shown to the dreamer or left is the owner's to decide; S7 may route by it. |
| S9 | S6 | The production written at `start` still has no coverage for implied changes (S1 → S9 above); the records keep what each picture was told, so a production written again from the sheets could take it from them. |
| S3 | S1 | The story record is made three times from the same inputs: for the plan (`recordForPlan`), for the sheet (`sheetDream`, once per drawing of a moment) and for the panel's tree. One record per dream, passed to all three, is the next step once the sheet is on. |
| S4 | S5 | Found by S4 (branch `s4-camera`, not merged): across a reverse the picture before is dropped from the sheet's images (`rules.dropped`), not from the plan, which still lists it in `needs`, so the moment still waits for it. On `lab/dream-chat` the same holds far wider (S5 eval): every picture kept for its light alone and every earlier picture kept for people who all have sketches is waited for and never sent, 67 pictures in 65 of 115 frozen moments and 216 in 208 of 411 live. S5's `chooseRefs` owns it: what it does not attach, the plan does not wait for (`waits_only_on_sent`, bar 0). **Cleared behind DREAMCHAT_REFS (27 Sep):** 0 waited for and never sent, frozen and live, camera on and off. |
| S5 | S4, S3 | Three frozen moments (10 live) take an earlier picture's layout (composition) that the words call the same side while the cameras on the floor plan face 140-180° apart (affd m3, 09ea m7, aeea m10): `relationIn` reads words only. S4's `sidesByCamera` may reclassify them; S5's `none_from_other_side` reads the cameras either way. Measure on S4's merge. **Measured (27 Sep):** with the camera rules 0 (they turn them); without, lighthouse-fresh m10 is on two floor plans and no longer counted (the eval now compares one plan only), and S5 drops the other two. |
| S5 | S1 | Whether an in-between picture meets the owner's rule depends on what the record carries: with the record off the suitcase's open lid is carried to snow-train-2 m5 and its in-between picture meets the bar (3 changes); with it on the lid is shut again and it serves only m3 (1 change). S5's measure is taken with the record on. **S5 (27 Sep):** so it was (and with the record off as a second reading). |
| S5 | S3, S9 | The stage in force is "the approved in-between picture, else the sketch", but the sheet's tree has no drawn or approved state in its ledger (S3 debt) and a rebuild takes every picture as approved: the fall-back to the sketch on the drawing path is only seen in a live-flow check. **S5 (27 Sep):** shown offline on the drawing path (`test/refs.test.ts`); the fresh replays are still owed. |
| S5 | S6 | The evals re-derive who each attached image is for (`prompt-cases.ts refsOf`): it missed a crowd the record puts in view, which framePrompt attaches a picture for (four live moments read as images for their light alone; fixed in the S5 eval). `assembleCut` knows each image's subject; S6 could return it with `references`, so the evals read it instead of working it out again. With S5 `assembleCut` names each image's source and subject (`source`, `of`); the evals still work it out. |
| S5 | S5 | (Settled since: the bar is two; a side the floor plan lays out is no change; a place's state picture and its side's picture are one, the side's edited from the state's.) Contradictions S5 must not settle by code alone (owner or paid check): D1 (one image per subject) against 14 guards drawn with a sketch beside its in-between pictures; D3's bar (2 or 3 changes); D5 (a place's state has one carrier, the mock-up beat the in-between picture) against a place's in-between picture as its one image; the mock-up through the dreamer's eyes (paired 1 of 6 right, story 7 of 11). **Built to the paid check (27 Sep):** D1 on (and `DREAMCHAT_REFS=sketch` without it), D3 at two (the owner), a place's in-between picture as its one image, the mock-up off through the dreamer's eyes; each has moments in the check. New: a place's state picture and its side's picture in force, neither drawn from the other (library-1 m3), have no one image: drawing the side's picture from the state's would give one. |
| Checkpoint tool | S2, S9, every step | `session.ts`: what a moment calls each one (`calledFor`) and its previs render (`previsFor`) moved out of `startFrame`/`layoutFor` unchanged, so the checkpoint renders the mock-up as the harness does (46 of 54 drawn mock-ups render byte for byte as the run's own; the other 8 are code changed since). `evals/paired-store.ts` sets up any moments (`setUpDream`, the paired test's `setUp` on it); `evals/corpus.ts` word diff shared (`changeLines`); `evals/implied-cache.ts` writes its cache back only when a reading was added (it rewrote an unchanged cache on every run). A step that changes how a moment's images are chosen or named (S5 `chooseRefs`, S6) must keep `evals/checkpoint-set.ts todayOf` mapping every image to the run's file, and add its switch to `STEP_SWITCHES` (S5's is DREAMCHAT_REFS, added 27 Sep; the checkpoint's pre-draw check takes a subject's in-between picture for its sketch). A rebuild models neither the harness's "you" rewording nor a brief for a new view: the checkpoint refuses the first and writes the second with `--brief` (`shotFor`). |
| S7 | S4 | `sb_held_hands` (the shot puts what the dreamer holds away from their hands) flags 6 of the 9 pictures seen through the dreamer's eyes with a thing held, 5 of them not right: S4's debt that a held thing through the dreamer's eyes is placed at its floor-plan spot, not the hands. Code's to put right, not a check's to hold. |
| S7 | S3, S9 | No tag says what is seen beyond the place (A6), so `r_beyond_inside` is asked of every cut; no judged picture is tagged `turned`, so `r_turned_both` has no labels. The labelled set's tags are today's rebuild of each moment, not the night's plan: a moment drawn keeps its sheet only as hashes (`sentSheet`), not the tags it was drawn with (S9's record of what was drawn). |
| S7 | S5 | `r_keep_earlier` flags 67 of 73 pictures after a reverse or a crossing (the prompt keeps an earlier picture's layout, or the mock-up's camera), precision 0.48: which picture's layout a moment may keep is S5's choice of images (`none_from_other_side`), not a question. **S5 (27 Sep):** no layout is taken from the other side of a floor plan (0 frozen and live). |
| S7 | S8 | The reply checks (`jev.ts replyCheck`) and `choiceByAction`'s bars act on replies, not pictures, and only with DREAMCHAT_LISTEN=on; routing does not touch them. Their labelled sets are S8's hand audits (20 and 38 replies), two short of G1's 60; not measured again here. |
| S7 | S9, S10 | A picture drawn with the checks logging (the default) or routed keeps each reading by its prompt's hash (`ref`, `checkedTakes`), but `evals/build-checks-set.ts` reads only the two verdict files of 25-26 Sep: the owner's verdicts on later pictures (S4's and S5's checkpoints, S10's benchmark) must be added to it, joined to their readings by `ref.prompt` (`evals/jev-checks.ts --logs` does the join). |
| S7 | S2 | Logging is the default since 27 Sep. Routed, an earned check (in `EARNED`) acts under that default too; `DREAMCHAT_CHECKS=log` set on purpose stops it. A fault code knows for certain does what it does unrouted (left undrawn when logging). planFacts's re-plan logs when routed (it still acts when only logging, unrouted, as S2 left it). |
| S7 | S9 | `SessionStore.settle` counts a drawn take whose judge is still running as idle, though what is drawn from it waits on its verdict, so settling returns early: a redraw ended with a dream half drawn (the first routed arm, snow train m3), and `simulate.ts` and `resume.ts` can stop the same way (not the live server). S7 fixed only its own measuring tool (`evals/redraw.ts` settles again until every drawn take is judged) and left `settle` alone: S9's branch (`s9-as-drawn`) already changes it to wait for the judge's verdicts. After S9 merges, check that one fix covers both (and the redraw's own loop can go). |
| S7 | S4, S1 | Routed, planFacts's re-plan (a camera facing something the plan lacks: the scene planned again) only logs until it is earned; unrouted it still acts, even logging. Not measured: the redraw has no planner, so no redraw arm exercises it, and on the judged pictures it flags three moments. S4's floor-plan work is where a camera facing a missing thing is put right in code. |
| S4 | S6 | A saved shot brief serves the view it was written for and, with the camera rules, a view that differs from it only in a claim they took out ("Nobody else is in the picture" beside a crowd, "They keep these places" across a crossing): `camera.ts sameView`, read alike by the drawing path (`session.ts`), the rebuild (`plan.ts`), the sheet and the checkpoint tool. A rule that corrects the view's words otherwise (a held thing's size and place, a lap, a camera moved by the water or the line) still drops the moment's saved brief in a rebuild: 13 of 144 frozen and 22 of 490 live pictures fall back to the view's words. What the rules add (the room turned, the water, a heading, what is out past a window, a crossing) is said after the view and its brief (`CutPlan.rules`, `CameraLayer.lines`) so briefs stand. The live path writes briefs again for new views (a model call): measure it once simulations are back. |
| S4 | S5 | Across a reverse the picture before is dropped from the sheet's images (`rules.dropped`), not from the plan: the plan still lists it in `needs`, so the moment still waits for it. S5's `chooseRefs` should own the drop. **Cleared behind DREAMCHAT_REFS (27 Sep):** the plan leaves it out (`unsent`), so nothing waits for it. |
| S4 | S1 | The water's height is read from the words of the record's typed water part (`camera.ts waterLevel`): a body or a thing of the plan it is measured by ("up to their waists", "over the desks", "covering the shelves": over a thing is a little above its top), the ceiling only indoors; the floor or the ground (a few centimetres) only where nothing else measures it and no word says it is deep. Water that fills or floods a place, or is deep enough to float or swim in, with no measure is unmeasured, never a thin layer. Where the record has water there without a measure, the level last measured in the same place carries forward; with none, nothing is said of its height. A boat afloat indoors rides low enough for its riders to sit under the ceiling ("almost up to the ceiling" of a 4 m room is 2.4 m with a boat on it). Every water reading of the frozen dreams, and of what their moments imply (Claude's and DeepSeek's), is labelled in `test/camera.test.ts`; every water moment of the frozen and live dreams was read by hand with the rules on. The record should carry a level as a typed number. The floor plans give windows no height (a "high round window" stands on the floor), so "almost up to the high round window" is 1.8 m; library-1 m5's level is met with the rules on, library-3 m7's with them off and on (on, 0.45 against a 0.5 bar: close). Heights of windows on walls belong to the blocking step (a model step). |
| S4 | S7 | Flags on the sheet for the checks to route by, each the plan's: `crossed_line:<cut>` (`CutPlan.crossed`: the cut whose side of the line it crossed from, not always the one before; `crossedWhy`: it looks past them at what only that side shows, or only from there are they all in it; with the rules on it also sets the sheet's `crossed` tag; 6 frozen, 12 live), `same_camera:<cut>` (`CutPlan.sameCamera`; 0 on the corpus: the plan moves such a camera, so it is a guard), `reverse_not_drawn_from:<cut>` (0 on the corpus: with relations read from the cameras a reverse is never the same side; a guard); and `CameraLayer.body` (self, hands, none) for the point-of-view questions. A deliberate crossing is not one of the plan's `issues`: the pre-draw check takes a picture's issues ("picture N ...") as findings to act on. |
| S4 | S6 | Word lists in `camera.ts`: `HAND_VERB`/`handsIn` (what the dreamer's hands do, by clause, only where the dreamer does it, alone or with someone; at the controls of what they ride; not holding their breath, taking a step, turning a corner or the hands of a clock), `selfIn` (they look down at themselves; a reflection is not it), `openingsIn` (windows and doors on a place's walls, from its look), `WATER`/`DEEP`/`waterLevel`, `GOING`/`PROPELLED`/`STOPPING`/`goingIn` (a vehicle going: named just before a word of going, or driven just after one; parked or sitting still, not). What is out past a window is no word list: a thing on or past the line of a wall where a window is (`outThroughWindows`), for every view of the place; a thing a moment looks at through a window while it stands in the room stays in the room (the same 3 frozen and 6 live pictures as the word list gave). `test/camera.test.ts` labels every point-of-view moment and every water reading of the frozen dreams, and phrases written for it; over the live dreams they were listed and read by hand (not in the repository, so not a committed test). Each should give way to a typed field (the breakdown's action as visible facts, the blocking's fixtures and moves). |
| S4 checkpoint fixes | S6 | New word lists, each to give way to a typed field: `camera.ts` `HEIGHT_WORD` (a later thing the water's words measure it by), `MEASURE`/`HUGE` (`bodyHeight`: how high a creature's body stands, from its look), `continuity.ts bodiesOf`; `producer.ts` `NAME_CLAUSE`/`NAME_OPENER`/`NAME_PLACE` (`namesEvery`, what a brief may call each one). `namesForIds` (S6 ledger 5, ids in words) resolves an id in a moment's words to its name when the dream is read, with the camera rules only: S6 moves it to the default (the floor-plan step writing names). |
| S4 checkpoint fixes | S5 | Deeper water where the words say it is deep enough for a creature (library-2 m8: 1 to 2 metres) moves m8's camera across the line, so m9 takes picture 1 as its composition and picture 8 only for light (frozen and live, 1 picture each). S5's `chooseRefs` owns which earlier picture a cut is drawn from; measure it there with the camera on. |
| S4 checkpoint fixes | test isolation | `test/session.test.ts` "settle waits for a verdict being asked for" times out at 5 s on lab (3ae81f0) as on `precheck-fixes`, in the default suite; with the record, sheet and camera on, the same 11 tests fail on lab and here (tests written for the switches off: checkpoint `--draw`, S9 on a44a and 8ceb, S9 keys). |
| S4 checkpoint fixes | blocking, S1 | `blocking.ts settle` turns whoever rides a vehicle to face its facing, or the place's front where it has none, and ignores the way the plan moves it: a boat rowed up the room had its two facing back down it. Now no heading is said where they face against its move (frozen 2, live 4 pictures); the root is the riders' facing (turned to the way it moves, the cameras placed on them would move: measure before). Motion as a lasting, typed state is S1's (lighthouse-fresh m12). |
| S4 checkpoint fixes | S4, previs | A creature too big for the water is said to be in it beside the boat, part of it above the surface, but the mock-up still draws it as a figure lying on the floor, hidden under the water plane; a fixture high on a wall (library-1's "high round window") is a block standing on the floor, so deep water hides it and it drops out of the view (library-1 m4 and m5, library-2 m8); and a place seen only through a window (library-1's "outside the window", which no moment is set in) has no line in the view. The plan needs heights for wall fixtures and creatures. **Wall fixtures cleared behind DREAMCHAT_CAMERA (27 Sep, `postcheck-fixes`):** a fixture its name or the place's words put high, at the top, on a wall or on the ceiling is lifted there, flat against its wall (`camera.ts mounted`), and a front wall named by a fixture is labelled "the wall"; creatures and the place outside the window are still open. |
| S4 post-check fixes | S6 | `camera.ts mountOf`'s word lists (`ON_CEILING`, `HIGH`, `ON_WALL`) and `wordsAbout` (the few words either side of what a thing is) join S6 ledger row 33 (windows and doors on walls): each gives way to fixtures the blocking places on a wall at a height (a model step). |
| S4 post-check fixes | S5 (`s5-fix2`), S6 (`s6-build`) | `postcheck-fixes` changes `continuity.ts rawPlanBy` (fixtures mounted before the water is measured) and `evals/prompt-cases.ts` (the `up_its_wall` check), which `s5-fix2` and `s6-build` change too: they meet there when merged. With the camera on, the mock-up of every moment whose place has a mounted fixture changes (its hash), so S5's references and S9's staleness see a new mock-up there. |
| S4 checkpoint fixes | S4 briefs | The brief check reads names, not where they are: a brief that names an element in the picture only as "just outside the frame" passes, before and now (checked by sentence it refused 18 of 193 saved briefs, some for a crop, "head out of frame": not taken). Of the 212 briefs the saved dreams keep, 193 pass the word-for-word rule and 198 the new one; none passing before fails now. |
| S4 | blocking (model step) | night-market m2: the floor plan has the sisters facing the old man, not the stall; the camera shows that faithfully (an eyeline rule that kept them from facing the lens also moved snow-train m1, which the owner called right, and was dropped). Only the blocking can meet it. |
| S4 | S3 | `continuity.relation()` (and `evals/paired-arms.ts relationTo`) still read words only; with the camera rules the plan and the sheet read how two moments stand from their cameras on the floor plan (`sidesByCamera`, `sameByCamera`) and the jump fix. An edit counts as the camera it would have drawn fresh (`CutPlan.wouldBe`): a same setup is an edit only from the same camera. The scene's line is kept per floor plan (two places of one scene each have their own). The tree's shots follow the plan's. |
| S4 | every step | Cost: with the camera rules the continuity plan is made again until the relations it draws from are the ones its cameras give: two or three plans for most dreams, settled on every frozen and live dream (0 unsettled); one still unsettled after four plans is said in the plan's issues (never "picture N ...", so no pre-draw check acts on it). Tests that plan several frozen dreams come near bun's 5 s limit on a loaded machine. |
| S4 | S1 | lighthouse-fresh m12 (the tractor's heading) is no longer met: a heading is said only where the moment's own words have the vehicle going and the plan gives its way, and m12's words ("the cab vibrates", "the grass bends away from the wheels") never say it moves; the tractor drives at m9 and stops at m14. Motion is a lasting state (going until it stops): the record should carry it, typed, with its end. |
| S4 | S5 | Measured on S4 (camera rules on, record and sheet on): of the frozen moments that take an earlier picture's layout (base or composition) from a camera turned 135° or more, 5 with the rules off, 2 with them on: aeea m10 from m8 (the same room on two scenes' floor plans, whose cameras cannot be compared, so the words decide) and orchard m4 (the jump's own match cut). affd m3 and 09ea m7 no longer do. S5's eval tests hold today's choices, with the camera off; with the rules on `--step S5` meets 6/7 counted and 6/14 hypotheses (5/14 off; snow-train m6 door now met), guards 2/2. |
| S4 | live flow | The live-flow check (`evals/live-flow.ts`) was not run with the camera rules: its fake replays were drawn with them off, and new replays were not made (no simulations while this was built). With the camera on it now runs the sheet on, and refuses a sheet set otherwise. Rerun on fresh replays. |
| S6 | S9 | Each picture draws from its own copy of itself, made when it was first put in (`Item.frame` cast and place, `Item.fields` words, an in-between picture's plan), while a rebuild reads the dream as it stands: S9 found 2 of 61 moments sent with an out-of-date cast and 10 of 16 in-between pictures without the look before the change. S9's `DREAMCHAT_FRESH_SEND` refreshes the copy at send; S6 builds the sheet from the breakdown, the plan and the record as they stand when a picture is sent (S6 ledger 17), after which the refresh has nothing left to do. Until then the two must agree (live-flow check). |
| S6 | S4 | S4's word lists (`camera.ts`: hands `HAND_VERB`/`handsIn`, the dreamer's own body `selfIn`, a vehicle going `GOING`/`PROPELLED`/`STOPPING`/`goingIn`, the water `WATER`/`BODY`/`waterLevel`, walls `openingsIn`/`WALL_WORDS`, `LOOKS_OUT`) get switches in `cleanups.ts` when S4 merges and are measured as the others (S6 ledger 30-33): hands and own body become the typed acts, going a lasting motion in the record (lighthouse-fresh m12's heading), the water a typed level; `selfIn` and the record's `SELF` read one fact twice. |
| S6 | model step | The typed action (S6 ledger 19-21) needs a writer reading of every saved moment (115 frozen, 411 live), checked by Jev and cached as the implied reading is; so do a lasting motion (31) and a water level (32). The writer is Claude on the subscription; Jev's calls are credits: the owner's go-ahead before it runs. **Done (27 Sep, `s6-readings`):** all 526 read and cached (`runs/typed-cache.json`); motion is read per moment (moving or not), so a vehicle going until it stops is the facts of the moments in between. |
| S6 | S1 | Of the record's word lists, `SELF` and `HOLDS_NAME` act on no saved dream (the dreamer's own change at a moment already puts them in view), and `STATE_VERB` only on desert-station (e130, the clock melting); the others act on a few dreams each (S6 ledger 24-29), and the implied reading covers none of them yet: with Claude's readings in, turning `fills` off still moves library-1's water and its in-between pictures. |
| S6 | S5 | S5's `chooseRefs` rewrites the images' lines, where each look is said the first of its two times (S6 ledger 14), and decides which in-between pictures stay, one of the three places one state is said (an image's "Except", the in-between picture's line, "How each one is at this moment"; ledger 16). S6 takes its befores on S5's base, and chooses where a look is said once after S5. |
| S6 | S7 | S7's questions that read the same faults in words (`r_look_twice`, `r_action_seen`, `r_story_words`, `r_gone_drawn`, `r_quoted`) only log; S6's bars are code. The paragraph ids `assembleCut` returns (S6 ledger 4) are what the gate and S7's routed questions should point at. |
| S6 | S8, producer | New dreams should not need the clean-ups: the producer writes a sketch's framing apart from its look (a pose in 68 live moments' looks), leaves out a look nobody gave rather than writing "undefined" (42 live moments, 7 dreams), writes the moment in the third person (79 of 411 live moments still say "you" in a rebuild) and as visible acts. |
| S6 | checkpoint tool | S6's switch goes into `evals/checkpoint-set.ts STEP_SWITCHES`, and every image stays mapped by `todayOf`. |
| S5 | S9 | Two tests of S9 fail on lab with the record and sheet on, S5 or not ("a moment no longer in the dream is stale because it is no longer planned", a44a and 8ceb: a reason of kind sequence names a picture not gone with the moment). Three more failed with the camera on because the fixture draws with framePrompt and a rebuild sends the camera rules: the fixture now holds the camera rules and S5 off (27 Sep). |
| S5 | S6 | With S5 a subject shown by its in-between picture is said "as they are now (what: now)" and the changes that picture does not show as exceptions; the wording is S5's first and S6's to settle with the rest. |
| S4 checkpoint | S6 | The shot's brief is written from the view and the moments before, never the sheet's facts, so it can contradict them (the whale under the boat, a lamp above 4 m of water, arms drawn back after a handover, someone gone placed at the edge, a head cut off): S6 ledger 34, with its measures and a new prompt case, snow-train-2-m6-instant. |
| S6 | S4, S1 | The typed readings are keyed by exactly what the writer was asked, and with the camera rules `namesForIds` puts a name where the saved words have an id: library-1 m5 was read again with the camera on (1 writer and 1 Jev call). When row 5 moves `namesForIds` to the builder's default, both keys are cached. |
| S6 | S2, S7 | With the builder's paragraph ids, the pre-draw check's acting path (DREAMCHAT_CHECKS=act) tells the view's line by its paragraph, so a finding around "What the dreamer sees" now counts as the plan's, as "What the camera sees" did; logging, the default, is unchanged. |

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
- **S4 (camera rules).** Cleared behind DREAMCHAT_CAMERA=on: a thing the dreamer holds is in their hands before
  their eyes (and said below the picture when out of it), a held thing with no size is hand-sized, a seated holder
  holds it on their lap; "Nobody else is in the picture" is no longer said beside a crowd. Left: see the S4 rows of
  the overlaps table; across a reverse the plan still waits for the picture it no longer draws from (cleared by S5
  behind DREAMCHAT_REFS); a
  composition image from before a deliberate crossing is told only for its look where the mock-up is image 1, which
  every crossing cut has (a crossing cut without a mock-up would be told to keep the old layout). From the picture
  check's dry run (27 Sep, `precheck-fixes`): riders turned by `settle` against the way the plan moves their vehicle
  (no heading said there now); creatures and high wall fixtures without heights in the mock-up; a place seen only
  through a window unsaid; the brief check reads names, not placement (the overlaps table). From the second dry run
  (27 Sep, `brief-fixes`): a place named by where it is ("outside the window") is left out of the view line, not
  said by what it is there: said ("outside it, the whole city underwater"), library-1-m5-level's Jev reading went
  from 0.38-0.43 to 0.44-0.55, at the bar, so whether it helps the picture is for a picture test; the creature the
  camera rules put beside the boat (library-3 m6's whale) is said after the brief, not in the view's list, so no
  brief is asked to name it; a brief kept in a checkpoint's `briefs.json` is not checked again against today's
  rules (a cut one is deleted by hand and briefed again).
  From the picture check's misses (27 Sep, `postcheck-fixes`): fixtures high on a wall or on the ceiling are
  cleared behind the camera switch (the log); left: an ordinary window whose words give no height is still a block
  standing on the floor (the round room's, the carriage's); the front is still said by its name in words ("ahead is
  the high round window side", `frontLine`, `sayTurn`), only its label is "the wall"; and four of the five misses
  (held things through the dreamer's eyes, a moment entering a place set inside it, floor plans that leave out the
  place's described layout, which side the room's windows are on said only across a reverse), each traced in the
  log with where it starts.
- **S1 (`shutAway`), from the picture check's dry run.** The dry run's premise that the owner called snow-train-2 m5
  and m6 right with the suitcase open does not hold for m5: the picture he called right there has it shut, carried by
  its handle, and on the other two drawings of m5 he wrote "the suitcase should be shut" (the counted case
  snow-train-2-m5-shut, met by `shutAway`). His m6 picture has it open, letters showing, handed over; his notes on m6
  say nothing of the lid. So carrying it into another place closing it stays until a verdict says otherwise; what
  stays open (an umbrella, a book) is still the debt above.
- **S5 (references).** Left behind DREAMCHAT_REFS: changes the moments imply are said in words and never drawn on
  their own (S1), so 7 frozen moments still carry two (one three) with the action; a new framing where nothing lays
  the picture out is a change no in-between picture carries (13-16 live); the plan assumes every person but a crowd
  has an approved sketch, so a moment is not held for an earlier picture of someone whose sketch failed (they go
  without an image); a moment reads what its in-between picture shows from the picture's own copy (older copies
  have none: the fresh send refreshes them); a side's in-between picture drawn for several cuts is edited from the
  state in force at the first of them; the pre-draw check takes any in-between picture of a subject for its sketch.
- **S7 (Jev checks).** The labelled set is thin: 122 pictures, 62 moments from ten dreams (20 moments drawn four
  times); the library questions were written after reading the owner's notes on these pictures, so only pictures
  judged after 27 Sep can earn them acting, and `evals/build-checks-set.ts` must be taught to read those verdicts
  (joined by `ref.prompt`). The picture judge, which reads the picture, flags pictures 0.69 not right: under the
  bar too, so it only informs. `r_beyond_inside` has no tag of its own ("seen beyond the place"), and its flags on
  these pictures all sit inside the noise of its bar.
  `evals/` is outside `tsconfig.json` (it includes `*.ts` and `test/`): the S7 eval files were typechecked with a
  config of their own; include `evals/` once S1's probe that does not typecheck is fixed.
- **S6 (`assembleCut`).** The record's new word lists (`FILLS`, `OPENS`, `STATE_VERB`, `NOT_THERE`, `SELF`,
  `TAKEN`, `HOLDS_NAME`, which has 'bowl' twice) overlap what the implied reading now reads with a model and Jev;
  each should be retired once the reading covers it. `withoutWords` in `frames.ts` is one more text clean-up to
  retire with the others.
- **S9 (the record of what was drawn).** The fresh send (DREAMCHAT_FRESH_SEND) is off by default: the copies drawing
  reads stay behind the dream until the owner turns it on (it changes what 14 of 77 pictures of the redraws are
  sent). `KEYS_VERSION` is raised by hand when the keys test fails. A rebuild walks the plan made now, so a drawn
  picture no longer in it (an in-between picture a re-plan dropped) is not rebuilt. Rebuilding a picture from its record, an earlier picture it
  took is read as it is held now (its number, who is in it); only what the judge found in it is kept per take.
  Saved dreams drawn before S9 are read from their stores only (images by their take, the look's name), never their
  words, cast or record. A take resumed after failing before it was sent keeps its number (`resume` puts the version
  back), and its record is replaced when it is sent again. The records add about 20 KB a picture. Staleness reads
  what reaches the prompt only; the sheet's tree and record layers are not compared.
- **S4 (camera rules).** A thing held in a view through the dreamer's eyes is placed at its floor-plan spot, not
  in the hands that hold it; and the "Nobody else is in the picture" line can stand beside a list of people who
  are in it.
- **S6 (`assembleCut`).** Everything S6 retires is in the ledger of the S6 eval, in its order: 16 clean-ups and
  word lists, each with a switch in `cleanups.ts` (the look's `withoutWords`, `VAGUE`, `withoutPose`, member words
  and `inShades`; `withoutGone`; `writingIn` and its speech rule; the record's `STATE_VERB`, `FILLS`, `OPENS`,
  `NOT_THERE`, `SELF`, `TAKEN`, `HOLDS_NAME`, which has 'bowl' twice, and `shutAway`), S4's 4 word lists, and 14
  duplicated computations or repetitions (the list above among them). Found while writing it: the record's
  `factsOf` runs `withoutPose` too, for people and animals (for a place or a thing only the look's own clean-up
  takes a pose out); `SELF` and `HOLDS_NAME` act on no saved dream; values that say nothing ("hair: undefined")
  would reach 42 live moments' looks without `VAGUE`; a look is said twice in 409 of 411 live moments; the
  in-between picture's "the newspaper's newspaper" (S1 -> S6) is one of the renderings a typed part (`partOf`)
  ends.
- **S6, where it stopped (27 Sep, `s6-build`).** Built: the switch, each moment's typed facts on its sheet, ledger
  rows 1, 3 and 4 (no prompt moved). Stopped at row 2 (one tree), which needs row 17 first (see "S6 built so far").
  Left, in order: 5 names and ids in words, 6 kinds, 7 who is in view, 8 looks from the record, 9-13 the look's
  clean-ups, 14 a look said once, 15 colours once, 16 a state once, 17 the sheet at send (then 2), 18 the relation
  to the cut before, 19 gone, 20 writing, 21 the moment's own words from the typed acts (library-1-m2-books), 22-29
  the record's word lists for the typed readings (container facts keep snow-train-2's suitcase shut at m5 and m6:
  the owner's decision below; `snow-train-2-m5-shut` stays met), 30-33 S4's word lists (hands and own body from the
  typed pov, going from the typed motion: lighthouse-fresh-m12-heading; the water from the typed level), 34 the shot's
  brief from the sheet's facts. Row 34, from the S4 picture check's root causes (27 Sep): the brief writer
  (`producer.ts shotFor`, asked with the view and the moments before) is never told the sheet's facts, so a brief
  can add what the sheet says otherwise: library-3 m6 (the whale "out of sight below the boat" beside the camera
  rules' "part of it above the surface"), library-1 m5 (a lamp "just above the water" under 4 m of water),
  snow-train-2 m6 ("his arms just drawn back from handing over the case", judged wrong by the owner: the frame after
  the handover), orchard m6 (Tomas "just outside the left edge" when he is gone), snow-train m3 ("head cut off").
  Under the one builder: (1) the brief is asked from the same sheet facts the prompt says (the typed act at one
  instant, the water's level, open or shut, who holds what, who is in view and where, what the rules add); (2) a
  transfer ("gives", "hands", "passes") is drawn mid-act, the giver holding it out or both holding it, and the floor
  plan's holder at that instant agrees (snow-train-2 m6's plan already had the receiver holding it); (3) a brief is
  refused that says after-the-fact ("just after", "already", "having", "drawn back from") or places someone not in
  view, and a check flags a brief that contradicts a sheet fact (a saved one falls back to the view's words). Its
  measures: give or hand-over moments whose plan has the receiver holding already, to 0; the 212 saved briefs and the
  checkpoint's scanned for after-the-fact phrasing and contradictions with sheet facts, to 0; a new prompt case
  snow-train-2-m6-instant.

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

- **Settled 27 Sep: snow-train-2's suitcase stays shut at m5 and at m6** (the owner, after the S4 picture check):
  S6's container facts must keep it so where they retire `shutAway` (ledger 29), and `snow-train-2-m5-shut` stays met.
- **Settled 27 Sep: "several" is two** (the in-between picture rule): built so in S5.
- **Settled 27 Sep: a side the floor plan lays out is no change** (only story changes count): built so in S5.
- **Settled 27 Sep (applied on `s5-fix2`): a side never drawn is no change, with or without a floor plan**; no side's
  in-between picture is made with S5.

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

- 27 Sep, S3 done. Its eval is met: `assembleCut`, reading only the cut sheet, writes what framePrompt writes on
  every rebuild (1052: frozen 115 and live 411, record off and on) and on every build while drawing fresh dreams
  written by Claude (48 of 48, 24 moments sent). The only differences against a rebuild are a check acting (a brief
  set aside, a moment taking a picture a check left undrawn), which S2's logging removes. What S3 changes is where
  things are computed, not the pictures: S4-S7 now change one sheet instead of framePrompt's many places. One gap
  found: live-flow could not explain a moment taking a picture a check left undrawn (marked FAIL); being fixed.
  The owner's plan doc could not be updated from this session's account (access refused); this file stays the
  record of status.
- 27 Sep: live-flow's gap closed (43aa749): a moment sent without an earlier picture the pre-draw check left
  undrawn is explained and counted as a check acting; on S3's two fresh replays 0 of 10 dreams fail, 37 of 42
  moments word for word, 5 each a check acting. Also: Claude's input now goes on the command line (62e0d70), since
  on a loaded machine the CLI went on without its stdin dozens of times a replay; a CLI failure that passes (no
  input in time, logged out for a moment, a limit) is waited out and run again (987d911).
- 27 Sep: S2's whole-conversation replays, ten dreams, writer Claude in every arm (DeepSeek is out). Logging: 127
  of 127 moments drawn, 0 held, reworded, planned again or left undrawn by a check, every reading logged, Jev about
  41 calls a dream; acting: 108 of 122 drawn, 14 left undrawn, 54 moments reworded, 27 scenes and 25 moments
  planned again, Jev 306-324 a dream. Live flow, logging: 62 of 63 word for word, the one a dreamer's correction the
  breakdown did not keep (S9). S2's eval is met; the switch stays off until the owner turns it on.

- 27 Sep, S2 done, and logging made the default on the owner's decision: `checksMode()` now reads logging unless
  `DREAMCHAT_CHECKS=act`. The live server picks it up on its next restart. The checks still run and log every
  reading (S7's evidence); only code faults (`actsWhenLogging`) still hold a picture. 545 tests pass.
- 27 Sep: S8's fresh simulation on the Claude writer, both arms (20 dreams once each; the before at 4c0e52c with the
  writer switch, now frozen in `evals/listening-before-claude/`). S8's own gains hold on the same writer: either/or
  23% to 0, leading 17% to 0, said but not in their words 31% to 3% (about 9 real of 518), every retelling ending on
  the breakdown's numbered moments (0/20 to 21/21 by hand), misread answers 22 to 3 (2 real). Compliance was already
  98% before on Claude: DeepSeek's 60% to 96% was mostly the writer. One floor fails beyond noise: retellings begun
  because they ran out of memory, 6 to 12 of 20, 10 of them straight after the come-back rule (17 of its 21 answers
  "I don't remember"). Three floors fail within noise (kept as said by one fact, "I don't remember" 0.24 to 0.28,
  asked again 0.06 to 0.09). No second round: it would not change the verdict. S8 stays off until rule 6b is fixed.
- 27 Sep: what the moments imply, read again with Claude (the cache is keyed by the writer, so every reading is
  new; `DREAMCHAT_WRITER=claude DREAMCHAT_RECORD=on evals/corpus.ts`, frozen and `--live`). Frozen, 15 dreams: 41
  readings proposed, 26 taken; live, 59 dreams: 127 proposed, 78 taken (DeepSeek's: 85 and 50). The rising water
  is taken in 279d, de6c and 6081, up to the high window where the boat is; the review's rejects (tiles warm, door
  unlocked, a crowd, a train leaning, an old-film look) are not even proposed now; one true state is lost just
  under the bar (de6c m3, "covering the whole floor, partway up the desk legs"). Prompt cases, record on: counted
  faults 19/33 (18/33 without the readings; DeepSeek's readings gave 18/33), S1's cases 12/13 with model step 5/6
  (DeepSeek's 11/13): library-3 m7's water now reaches the window and the boat is no longer put low; library-1 m5's
  boat is still put low by the mock-up (S4). Guards 36/36. In-between pictures: frozen 29 (24 without the readings,
  25 off), live 79 (67, 66): the readings bring pictures that turn a place to face something (S1 -> S5). A reading
  of 115 moments took about 2.5 minutes, 411 about 12.
- 27 Sep: the checkpoint tool built (`evals/checkpoint.ts`, above); nothing drawn, nothing spent. On lab (no camera
  switch yet) `--set-from-cases S4` proposes nothing against the camera switch unset, as it should; against the old
  pictures' prompts (`--base old`, a sample, cap $1.20) it proposed 5 S4 faults and 3 guards and refused 6 whose
  images the run never drew (earlier pictures lighthouse-first m1 and m5, lighthouse-fresh m8; library-2's boat,
  never sketched); `--dry` built all 8 from the run's own files, $1.20. The judging page and the score were tried
  on stand-in pictures only.
- 27 Sep: the checkpoint tool hardened before the S4 draw. A moment is drawn with the brief the harness would
  write for its view (`--dry --brief`, kept in `briefs.json` and the hash) or refused; words calling the dreamer
  "you" and pictures nobody approved refuse it; `--draw` needs the checks logging (`checksMode()`), the set, the
  switches and every hash as the dry run had them, skips what the dry run refused, holds a lock, saves each attempt
  before the engine is asked, counts and stops on any job in its store it does not know, looks for a job before
  calling an error refused, approves each picture for at most what is left under the cap (the set's, `--cap` only
  lowers it), and writes its results whole; the key is written once per moment and each answer keeps the pictures
  it was given on. Proven offline: 33 tests (a stand-in engine for every guard), and once through the engine itself
  with its fake provider into a throwaway store (`CHECKPOINT_ENGINE_TEST=1`, skipped by default: two moments drawn,
  jobs and receipts kept, $0). On lab with the record and sheet on (the S4 base, readings from the lab's Claude
  cache, left unchanged): library-1 m4 and m5 are refused, since today's plan wants an in-between picture of the
  library facing another way that the run never drew; night-market m1, m2 and library-1 m4 need a brief.
- 27 Sep: S7 built on branch `s7-jev-routed` (DREAMCHAT_JEV_ROUTED=on, off by default), its eval written and run first.
  A library of 16 narrow questions, one for each film rule Jev can test on the text a picture is drawn from (Jev
  takes no image), each routed by the cut's tags; a labelled set of the 122 pictures the owner judged, each with what
  every check read before it was drawn (the prompt as sent, the shot as checked, the plan's facts; the paired test's
  prompts frozen from the checkout that drew them); and a runner that measures every check (801 Jev calls, every
  answer kept, a run again free). No check predicts the owner's verdict well enough to act: 0 of 36 meet the bar
  (precision 0.7 on 60 labels, on pictures they were not tuned on). The gate and "storyboard complete?" order the
  pictures as a coin does (AUC 0.40-0.55; the gate's contradiction reads 0.445, 0.44 and 0.454 on pictures right,
  partly and wrong); in 15 of 20 paired moments the owner judged apart pictures drawn from prompts differing only in
  image 1. Nearest: `r_beyond_inside` 0.67, `r_line_order` 0.75 on four flags, `r_state_said` 0.78 on 25 pictures,
  `sb_held_hands` 5 of 6 on 9. Routing built: every Jev reading logs, only code faults hold; Jev 23.3 calls a dream
  routed, 23.1 logging, 115.8 acting (ten redrawn dreams), tokens 17% over logging. Off changes nothing; tests added
  for routing, for a check not earned never holding, and for off. Found on the way: the redraw returned before a
  take's verdict came (fixed in the redraw). No pictures drawn, no money spent.
- 27 Sep: S7 independently reviewed ("no check earns acting" sound: all 122 judged pictures traced to their prompts
  as sent through the stores, the night's own gate readings agree, AUC 0.55; numbers recompute; off equivalent) and
  its findings fixed. An earned check now acts under the default logging when routed (it never could:
  `DREAMCHAT_CHECKS=log` is the default, and set on purpose it still stops one); a fault code knows for certain keeps
  its unrouted action. Each library question is held to the bar measured on the tune pictures, and `EARNED` maps a
  check to the bar it earned acting at; a test holds both to the eval's rows. The bar counts moments, not pictures (a
  moment's four pictures are one), its lower bound resamples moments, and a flag within 0.1 of its bar is noise
  (G4). "Storyboard complete?" is measured only on the 60 pictures drawn from the shot it read (6 of 17 = 0.35
  against 0.52). A library question is judged without the moments its rule was written from, and may not act on
  these pictures at all: it was written after reading their notes. Result unchanged: 0 of 28 distinct checks may
  act; the gate and the storyboard are at chance; the rest cannot be measured yet. The settle race is left to S9's
  branch (overlaps). The eval takes `--help` and refuses flags it does not know; its scoring has tests.

- 27 Sep, S7 done and merged (ef6f9fc). No check earns the right to act; the routing and the rule that only an
  earned check acts, at its measured bar, are in place for when the owner's new verdicts (S4, S5 and S10
  checkpoints, about 106 pictures) measure the library questions. The builder's added noise rule (a flag within 0.1
  of its bar does not count toward the five flagged moments) is kept: it is conservative and only matters once a
  check could be promoted. 600 tests pass with routing off and on.
- 27 Sep: S9 built on branch `s9-as-drawn` behind DREAMCHAT_AS_DRAWN (off by default; off, nothing is kept and 0
  pictures move on the frozen and live corpora; on, the same, as no saved dream has a record). Every take of a
  picture keeps what it was sent and drawn from; a rebuild reads it back; staleness compares each drawn picture,
  input by input, with the dream as it stands, and down the chains pictures were drawn along; it is logged and
  served at `/api/stale`, never acted on. On the ten dreams drawn again with the switch on: 77 of 77 pictures keep
  their record, sent exactly what S2's redraws sent; a rebuild gives 61 of 61 moments and 16 of 16 in-between
  pictures as sent (57 and 6 without the records; live-flow 0 of 10 dreams failing, from 4); 0 stale where nothing
  changed; 56 changes made after drawing each made exactly the pictures they must stale (258 of 258), with the
  right reason, and a rebuild reading the records still gave every picture as sent. Root cause of live-flow's four
  moments and the look lines: each picture's own copy of itself, made from an earlier plan, which drawing reads and
  a fresh rebuild did not (12 pictures were drawn behind the dream that way: S9 → S3, S5). Saved dreams: 2 stale of
  173 read, both right by hand, none missed in a sample of 41. `settle` now waits for verdicts (a redraw under load
  ended early). `bun test` 554 pass with the switch off and on; typecheck clean. No pictures drawn, no money spent.
- 27 Sep: S9's review fixes on `s9-as-drawn`, merged with lab first (checks logging by default). Records keep their
  switches and the keys' version, and one kept under others is not comparable, never stale (the redraws read under
  the other record switch: 77 not comparable, 0 stale; before, 77 stale with empty reasons). The report, the log and
  `/api/stale` list the pictures drawn behind the dream: 14 of 77 on the redraws. The fresh send behind
  DREAMCHAT_FRESH_SEND (off): behind 14 to 0, a fresh rebuild 61 of 61 moments and 16 of 16 in-between pictures as
  sent (57, 6), live-flow as the dream stands 0 of 10 failing (4); every other bar still met. Staleness worked out
  when a picture lands (2-4 ms when the dream has not changed); rebuilds default to the dream as it stands and every
  eval passes it explicitly; the mock-up keyed by its floor plan; in-between pictures matched by their change.
  Corpora 0 moved with the switches off and on; `bun test` 578 pass (1 skipped) with the switches off, the record
  on, and the record and the fresh send on; typecheck clean. No pictures drawn, no money spent.
- 27 Sep: S4 built on branch `s4-camera`, behind DREAMCHAT_CAMERA=on (off by default; with it off every plan, sheet
  and prompt is today's: 0 of 140 frozen and 0 of 478 live pictures moved, with the record and the sheet off and on).
  The rules live in `camera.ts` and read the floor plan, the camera placed on it and the story record; they feed
  the plan (continuity.ts, previs.ts), the sheet (`CutSheet.rules`, cutsheet.ts) and the assembler, which reads
  only the sheet. Each a general rule:
  (1) a reverse angle (the `reverse` tag) says what is now ahead, on the picture's left and right and behind the
  camera, from the room's walls as the camera's render shows them (`previs.wallsSeen`) and the windows and doors
  the place's words or fixtures put on them, the side walls never named left or right; across it the picture
  before is never a base or composition image (`reverse_not_drawn_from`);
  (2) the scene's line: its first picture from outside with two of the cast sets the side; a later camera of the
  scene that would cross it is scored down, and crosses only where the moment looks somewhere only the other side
  shows, then saying they changed sides, never that they keep them (`crossed_line`; the plan's issues);
  (3) same setup means the same camera: with both cameras placed on one plan, two moments face the same side
  within 60 degrees and are the same setup only from the same camera (0.6 m, 10 degrees); an earlier camera on the
  same people at the same size is moved off (`same_camera`); the plan is made twice where cameras and words
  disagree;
  (4) through the dreamer's eyes: their own body where they look down at it, their hands and arms only where they
  do something with them or hold something, else nothing of them, never feet or legs; what they hold is in their
  hands before their eyes (hand-sized where the plan gives no size), on the lap for a seated holder; someone
  facing them on one long seat sits across from them;
  (5) what stands where only a window is, is out past it (the plan's `outside`), said far off through the window;
  (6) the water's height, read from the record, is a surface in the mock-up: what is ridden floats on it with
  whoever is in it, the camera at their eyes rises, and what is under it is said to be;
  (7) `relationIn`: the jump's own moment is on its far side (affd m7 and m9, 0f40 m5 read as their place again).
  And a ridden vehicle's heading across the picture is said. What the rules add to a view is said after it and after
  its saved brief, so a brief stands while the camera does not move.
  Prompt cases, record and sheet on, off against on: `--step S4` 1/11 -> 10/11 counted, guards 8/8; all 85: 18/33 ->
  27/33 counted, guards 36/36, no guard moved; with the record off 6/33 -> 12/33, 36/36. Met now: snow-train m2
  (windows on the right, 0.09 -> 0.94) and m3 (across from him, 0.39 -> 0.98), snow-train-2 m2 (the same side as
  picture 1, which is attached), lighthouse-fresh m10 (the tractor off the floor plan, 0.81 -> 0.04 for "inside")
  and m12 (heading away), library-1 m4 (the whale under the water, not lined up with them, 0.97 -> 0.04) and m5
  (the camera raised 1.4 m with the boat), orchard m4 (no hands, 0.88 -> 0.05) and m7 (no legs or feet, 0.78 ->
  0.07); also library-2 m5 standing and snow-train m6 door (hypotheses). Not met: night-market m2 (the floor plan
  has them facing the old man; an eyeline rule was tried and dropped: it moved the approved snow-train m1), and the
  S1 level asks (see the overlaps).
  Corpus, on against off (record and sheet on), reviewed moment by moment: frozen 79 of 140 pictures changed (a view
  ghost fewer in 6081, one more in 538d), live 218 of 478 (3 new ghosts). By cause, frozen / live: how a moment
  follows another, read from the cameras and the jump fix 33 / 98 (other side -> same side 12 / 26, other place
  after a jump -> its place 3 / 18, same setup -> same side where the cameras differ 2 / 5), the room turned 18 / 35,
  the dreamer's body 17 / 67 (nothing of them 11 / 57), a ridden vehicle's heading 22 / 36, the water 13 / 16 (under
  it 3 / 3), a deliberate crossing said 9 / 19, "Nobody else" beside a crowd 8 / 15, out past a window or the place
  3 / 6, across from the dreamer 1 / 2; the camera moved 16 / 48 (the water, the line, a same camera); a saved brief
  no longer for its view 14 / 27. Fixed while reviewing: a same setup across a camera merely on the same side
  (red door m5 was made an edit of m4 with staging from the wrong side), water read from what it comes in under
  ("under the doors" as 2.2 m), fixtures under the water said to be outside the picture, "turns" read as hands,
  a wall named twice ("the wall with the doors, with the doors"), 0.3 m said as "about 1 metre".
  `bun test` 519 pass in seven switch combinations (camera off and on, with the record and the sheet off, on and
  shadow); tests that hold today's plans pin the camera off, `test/camera.test.ts` holds the rules on; typecheck
  clean. Not run: the live-flow check (needs fresh fake replays, and DeepSeek is out of balance). No pictures
  drawn, no money spent.
- 27 Sep: S4 review fixes, on `s4-camera`. The review reproduced every number and found faults, each fixed as a
  general rule: the camera rules need the cut sheet on (on without it, the floor plans moved and every rule's words
  were lost: now they stay off and say so); water on an outdoor roof read as 3 m (a roof or ceiling is a level only
  indoors, and outdoors there is no cap), the first measure won over a body ("the floor is flooded, water up to their
  waists" read 0.1 m: a body or a thing it is measured by now wins, a floor only where nothing else measures it, and
  water spread "across the floor and up to the shelves" stays low); every ridden vehicle had a heading made up from
  a default facing (now only where the moment's own words have it going and the plan gives its way: its facing, its
  move, or the place being its inside; 7 frozen and 10 live, from 22 and 36); an edit had no camera in the plan's
  map, so relations to it fell back to words while the sheet read its shot's camera (an edit now has the camera of
  the picture it edits, the sheet reads the plan's cameras, and the plan is made again until they settle: 0
  unsettled, 0 differences between sheet and plan, frozen and live); a reverse could span two floor plans (now one
  plan only: 0); something standing at a window went out through it (now only what a moment looking out of the
  place shows); the line was one rule in the plan and another in the flag, and "changed sides" was said on every
  picture after a crossing (now one definition, the plan's, kept from the cut before, said only at the crossing,
  its reason true, two riding one vehicle exempt and never told they keep their places); a camera avoided in the
  first plan hid a same setup; "their arms" of someone else and "they are close" read as the dreamer's hands, and
  rowing, climbing, driving, throwing and eating did not; the wall a reverse turned away from was said to be out of
  the picture, not behind the camera, and two side walls were both "a side wall". Tests: `test/camera.test.ts` 33
  (synthetic dreams for the line, a deliberate crossing, riders, headings, the same camera, windows, outdoor water;
  sweeps over every frozen dream for plan and sheet agreeing, reverses within one plan, every point-of-view moment
  and water reading labelled, every rule line reaching the prompt).
  Prompt cases, record and sheet on, off against on: `--step S4` 1/11 -> 9/11 counted, guards 8/8; all 85: 18/33 ->
  26/33, guards 36/36; lighthouse-fresh m12 is no longer met (its words never have the tractor move: see the
  overlaps). Switch off: 0 of 140 frozen and 0 of 478 live pictures moved against the base. On against off: frozen
  79 of 140 changed (77 changed, 1 gone, 1 new), live 216 of 478 (213 changed, 3 new). By cause, frozen / live: how a
  moment follows another, from the cameras and the jump fix 31 / 97 (other side -> same side 12 / 26, other place
  after a jump -> its place or a reverse 3 / 18); the room turned 18 / 33; the dreamer's body 17 / 67 (nothing of
  them 11 / 57); the water 13 / 13 (under it 3 / 3); a crossing said 6 / 11; a heading 7 / 10; "Nobody else" beside
  a crowd 8 / 15; out past a window or the place 3 / 6; across from the dreamer 1 / 2; the camera moved 15 / 47; a
  saved brief no longer for its view 15 / 32. `bun test` 533 pass with the switches off and with the camera, record
  and sheet on (and in all seven switch combinations one change before the last), typecheck clean.
- 27 Sep: S4 rebased on lab/dream-chat (S2 fixes, the Claude writer, S5's eval). Unchanged: `--step S4` 1/11 -> 9/11,
  all 85 cases 18/33 -> 26/33 counted, guards 36/36, hypotheses 6/18 -> 8/18 (the case file gained S5's). S5's
  eval tests pin the camera off, as the other tests of today's choices do. `bun test` 568 pass with the switches off,
  with the record and sheet on, and with the camera, record and sheet on.
- 27 Sep: S4 fixes, on `s4-camera`, rebased on lab/dream-chat (S7's routed checks, the checkpoint tool). The water was
  overcorrected, and there were smaller faults; each fixed as a general rule. Water: "fills" or "covering" anything
  read 0.1 m, and "the whole hall is flooded" a thin layer. Now the level is read from the words of the record's typed
  water part: a body or a thing of the plan measures it ("covering the counters" is over them), the floor or the
  ground only where nothing else does and no word says it is deep; filled, flooded or deep enough to float or swim,
  with no measure, is unmeasured and nothing is said; where the record has water without a measure the level last
  measured in the place carries forward; a camera below the surface says only that all of it is under water (the
  underwater classroom); a boat indoors keeps its riders under the ceiling. Windows: anything a moment looking out
  named went outside for every view (a telescope at the window); now only a thing on or past a wall's line where a
  window is (the same 3 frozen and 6 live pictures). Crossings: a deliberate one was a plan issue, which the pre-draw
  check takes as a finding for that picture; now it is the cut's (`crossed`, `crossedWhy`), its flag names the cut
  crossed from, as the plan does, and a same camera is `sameCamera`; the line is kept per floor plan; a plan still
  unsettled after four tries is an issue. An edit counts as the camera it would have drawn fresh, so words calling two
  moments one setup make it an edit only from the same camera. Word lists: holding a breath, taking a step, turning a
  corner, the hands of a clock and a reflection are no longer the dreamer's hands or body; "the dreamer and the sister
  row" and "at the wheel" are; a parked car or one ridden past is not going, a tram that rumbles or a taxi that rushes
  is (tests with phrases of their own). A brief is kept where the rules took out only a claim ("Nobody else", "They
  keep these places"), read alike by the drawing path, the rebuild and the checkpoint tool. `evals/live-flow.ts` runs
  the sheet on with the camera. Tests: `test/camera.test.ts` 36 (the crossing test now puts the clock behind the first
  camera and asserts the crossing; the water carried forward on a record of its own); the checkpoint test of a picture
  the run never drew builds its dream with the camera off, as other tests of today's choices do.
  With Claude reading what the moments imply (cache only, 0 calls), record and sheet on, off against on: `--step S4`
  1/11 -> 9/11 counted, guards 8/8; all 85: 19/33 -> 28/33 counted, model step 5/8 -> 7/8, guards 36/36, hypotheses
  5/18 -> 7/18; `--step S5` 6/7 counted either way, hypotheses 5/14 -> 6/14, guards 2/2. Not met: night-market m2,
  lighthouse-fresh m12, snow-train m6 hand (a hypothesis). Switch off against lab (8ac13ca): 0 of 144 frozen and 0 of
  490 live pictures moved with the record and sheet on, 0 of 140 and 0 of 477 with them off. On against off: frozen 82
  of 144 changed, 3 gone, 3 new; live 219 of 490 changed, 7 gone, 6 new. By cause, frozen / live: the earlier pictures
  drawn from 40 / 107 (images 37 / 91); the room turned 18 / 32; the water 16 / 23 (under it 3 / 3, the camera under
  it 1 / 3); nothing of the dreamer 11 / 57, hands and arms only 6 / 10, held below the picture 1 / 3; a heading 7 /
  10; a crossing said 6 / 12; "Nobody else" beside a crowd 7 / 14; out past a window or the place 3 / 6; across from
  the dreamer 1 / 2; the camera moved 15 / 48; a saved brief no longer for its view 13 / 22. Plan and sheet agree on
  every frozen and live dream: 0 unsettled, 0 differences in how a picture follows the one before, 0 reverses across
  two floor plans, every crossing flag naming the plan's cut. `bun test` 635 pass with the switches off and with the
  camera, record and sheet on; typecheck clean. No pictures drawn, no money spent.
- 27 Sep: S6's eval written on branch `s6-eval`, before S6 (above), from lab at 6667b0f. New: `cleanups.ts` (a switch
  for each clean-up and word list S6 retires, `DREAMCHAT_RETIRE`; unset, everything as before), `evals/retire.ts`
  (each one's footprint, each fact once, the action as visible facts, two sources disagreeing, ids in words) and
  `evals/corpus.ts --verdicts`/`--came-back` (every change of a step classified by key), with
  `test/retire.test.ts`. The ledger: 16 clean-ups and word lists, S4's 4 word lists and 14 duplicates, in their
  order. Before, record and sheet on, Claude's readings, frozen / live: every moment says a fact twice (2350 / 6595
  facts; a look in its image's line and in "In it" 2013 / 5698, a state 107 / 265, the moment's own words 36 /
  109); 21 / 134 moments say an action no picture shows at one instant; `pose` acts on 37 / 68 moments, `shades` 15 /
  57, `vague` 0 / 42, `after_words` 7 / 20, the record's lists on 0-10 each, `SELF` and `HOLDS_NAME` on none; looks
  from the record would change 50 / 178 moments; a place's id in words 1 / 1. Prompt cases unchanged (19/33 counted
  with Claude's readings, 36/36 guards). No model called, no pictures, no money.

- 27 Sep, owner's go-ahead for S6: a one-time typed reading of the 526 saved moments (115 frozen, 411 live) for
  action, motion and water level, written by the Claude writer and checked by Jev (about 2,000-3,000 Jev calls),
  cached so reruns are free. It is what lets S6 retire the word lists (hands, own body, vehicle going, water).

- 27 Sep, owner's decision for S5: a side of a place never drawn before is not a change toward the 2+ bar when the
  mock-up gives the layout. Only story changes count (water rising, a door opening, someone leaving); a new side
  comes from the mock-up for layout and the sketch for looks. S5 built on `s5-refs` (bars: subject by 2+ images
  40→1 frozen, waited-never-sent 67→0, other side 2→0); under independent review.
- 27 Sep: the S4 picture check's dry run, its faults fixed before anything is drawn (branch `precheck-fixes` from lab
  3ae81f0, no pictures, no money). Each fault by cause:
  1. library-3 m6 (called right): the whale, placed as a figure lying on the floor, was said to be all of it under a
     metre of water, beneath the boat; the plan knows no creature's size. Now a creature whose look says how big it is
     (`camera.ts bodyHeight`: a measure, or a clause opening "huge", "very big") is in the water beside the boat, part
     of it above the surface, where the water cannot cover it; the water's level is the highest thing its words
     measure it by, and over a creature it is said to be deep enough for ("deep enough for a whale beneath a boat":
     library-1 m4 and library-2 m8, 1 to 2 metres, the whale under it as in the owner's right library-1 m4 picture).
     Its heading: the boat moved up the room while `settle` turned the two in it to face the room's front, so it was
     said to head at the camera behind them; where those riding a vehicle face against the way it moved, no heading
     is said now (taking their way instead reversed library-3 m7's boat rowing up to the window).
  2. snow-train-2 m5/m6: not a fault. The picture the owner called right at m5 has the suitcase shut, and he wrote
     "should be shut" on the other two; `shutAway` stays (known debt, S1).
  3. Shot briefs refused: the check wanted every name word for word. `producer.ts namesEvery` takes a brief that
     names each one by its whole name or by what it is (the last word before a word of where or what it does, and what
     it is "of"), article- and possessive-blind, singular or plural, a thing in one word with another ("bookshelf" /
     "shelves"), never a person ("grandfather" is not "the father"); two of a kind each need the words that tell them
     apart beside them. Default path: live, more views get their written brief. The saved dreams' 212 briefs: 193 by
     the old rule, 198 now, 0 lost.
  4. "outside it l2": a place's id in the breakdown's `looks_at`; resolved to its name when the dream is read, with the
     camera rules (`namesForIds`; only saved case).
  5. "from a third of the way down to a third of the way down": a span within one band is "around" it now ("a thin
     band" read to Jev as the boat low in the room and cost library-1-m5-level); a saved brief still serves such a view
     (`sameView`).
  6. library-1 m5: the sister stood in the boat to open the window, and `onOf` counted no one standing as in a
     vehicle; afloat, someone standing where a boat is stands in it (as `settle` already had it). Nothing says what is
     seen out of the window: the window is a floor block under 4 metres of water and the place outside it has no spot
     (debt, not fixed here).
  Tests: `test/camera.test.ts` and `test/brief-names.test.ts`, written for them, fail on lab; `tsc` clean;
  `bun test` 694 pass with the switches off (1 fail, a 5 s timeout that fails on lab too) and with record, sheet and
  camera on 684 pass (the same 11 failures as lab). Prompt cases, all 85, Claude's readings from the cache (0 calls):
  on 28/33 counted, 7/8 model step, 36/36 guards, 7/18 hypotheses, no case moved; off 6/33, 36/36, no case moved.
  Corpus on against lab, frozen 12 of 144 pictures changed, live 27 of 489, each classified: a span said around one
  place 9 / 23 better; a contradicting heading no longer said 2 / 4 better; the whale beside the boat, part above
  the water 1 / 1 better; water deeper by "deep enough for a whale" 2 / 2 better (with it library-1 m4's lens and
  the high window's line, and library-2 m8's camera across the line, neutral: the plan's rules on the new level);
  the sister in the boat 1 / 1 better; the id named 1 / 1 better; library-2 m9 drawn from picture 1's layout, picture
  8 for light 1 / 1 neutral (S5); 0 worse. Switches off: 0 of 140 frozen and 0 of 477 live pictures changed.

- 27 Sep: S8's gaps from the fresh simulation fixed on branch `s8-fix` (all behind DREAMCHAT_LISTEN; off, nothing
  changes) and the after simulated again against the frozen Claude before (S8 eval above). The come-back rule (6b)
  is dropped: 17 of its 21 questions were answered "I don't remember", and a narrower rule for threads a picture
  needs would have asked the profiles' questions twice (10 of the 21). Said is kept claim by claim: the 9 real
  said-but-never-said came from values graded whole, a look folded into a guess after grounding, and revised
  profiles marked theirs by word overlap, 3 each; each said value of several claims is now asked claim by claim.
  Answers: a profile's change is any detail it lacked, and a retelling's answer is asked on its own whether it puts
  anything right or adds to it (of the first after's 3 misread, 1 was real by hand, not 2). The listening test's
  first floor counts the replies that ask, and one question a reply is a target. Result on 20 fresh conversations:
  every target met or met by hand; retellings begun as told all they remember 12 to 3 of 20 (the before 6), "I
  don't remember" 0.28 to 0.14 (the before 0.24), asked again 0.09 to 0.04; told facts kept as said 0.942 against
  0.949, within noise, its causes older than S8 (overlap S8 -> S1). 558 tests pass (one skipped); the record test
  fails only on the new saved sessions, as before (S8 -> S1). No pictures, no money.
- 27 Sep: S6's typed readings, on branch `s6-readings` from lab at 3ae81f0 (the owner's go-ahead above). New:
  `typed.ts` (the schema, the writer's ask, Jev's one-fact questions, the bars), `evals/typed-cache.ts` (the cache,
  `runs/typed-cache.json`), `evals/typed.ts` (the run and the report), `test/typed.test.ts`. Three pilots of 20, 20
  and 19 moments checked by hand (73/74, 76/76, 42/43 taken facts right), the prompt tightened twice; then every
  moment: frozen 290 of 330 facts taken, live 916 of 1015; samples of 27 and 27 across every kind, 54 of 54 right.
  Writer 697 calls in all, Jev about 585 (the go-ahead was for 2,000-3,000). Each word list set against the facts
  (above): where they differ, the facts were right in every case read by hand, but for a still boat or water at the
  floor, which Jev will not confirm. No pictures, no money. `bun test` 693 pass, 1 fail (a five-second time limit in `test/session.test.ts`, "settle waits for a verdict", which loads nothing of this change); the typed tests pass; typecheck clean.

- 27 Sep, S8 done and on by default (the owner's decision after the fresh simulation and its review): `listenOn()`
  reads on unless `DREAMCHAT_LISTEN=off`. The live server picks it up on its next restart. Tests that describe the
  listening before S8 now pin it off. Test-isolation fixes and the fresh send's four fixes merged (41e0103,
  c24d284, 20e912b): the suite passes in 8 switch combinations, twice each.
- 27 Sep: S5 built on `s5-refs` behind DREAMCHAT_REFS=on (needs DREAMCHAT_CUT_SHEET=on; `refs.ts`, the plan's side in
  `continuity.ts`, the sheet's `refs`, `assembleCut`, the pre-draw check's `standsFor`; `sketch` keeps each sketch
  beside its in-between pictures). Off: 0 of 428 frozen and 0 of 1,436 live pictures moved (record, sheet and camera
  off and on; S5 on with the sheet off too). The reference check, record and sheet on, frozen / live: a subject
  by two images 40 / 91 moments to 1 / 0, waited for and never sent 67 / 216 to 0 / 0, from another side 2 / 8 to
  0 / 0, in-between pictures under the bar of two 4 / 18 to 0 / 0 (29 to 25, 67 to 46), the mock-up off the paired
  routing 46 / 121 to 0 / 0, most images 10 to 8; the one left is library-1 m3 (a place's two unchained in-between
  pictures). Found and fixed: three faults of the measure (cameras across two floor plans, an in-between picture
  another is edited from, the owner's bar), the camera plan settling one pass early when a relation was left out of
  a cut's references (lighthouse-first m2 lost its room; `unsent`), and a crowd turning the mock-up off even in the
  background (night-market m2; now only where the moment is about it). Prompt cases (cache only): no code check
  fails that passed, hypotheses 5/18 to 11/18; 45-53 Jev questions on changed prompts unanswered, so guards read
  31-32 met, 0 failing. `bun test`: 686 pass with the switches off; with the record, sheet and camera on, and with
  S5 on too, 684 pass and 2 fail, both S9 tests that fail on lab with the record on (overlaps S5 -> S9); typecheck
  clean. The paid check proposed (18 pictures, about $2.70). No pictures drawn, no money spent.
- 27 Sep: S5 review fixes, rebased on lab 3392d83 (new commits on `s5-refs`). The owner's rule applied: a side or a
  new framing the floor plan lays out is no change, so an in-between picture of a side where the mock-up lays it out
  is neither made nor kept, nor one that takes none of a cut's changes off it; a side's in-between picture where
  nothing lays it out is made at two, edited from the place's state in force. What an in-between picture shows is
  each thing once, its latest ("water: rises over the desks", not every level on the way), and what the moment has
  newer is said as an exception; a place's state picture beside the mock-up keeps its state said outright. Image 1
  as far as the verdicts go: another place keeps the mock-up for a wide shot, the crowd rule leaves wide
  establishing shots alone and reads the group flag (a failed sketch is no crowd), through the dreamer's eyes the
  mock-up stays with nothing but the place in view (orchard m7). The check counts changes itself
  (`storyChanges`). Reference check, record and sheet on, frozen / live: a subject by two images 40 / 91 to 0 / 0,
  waited for and never sent 67 / 216 to 0 / 0, from another side 2 / 8 to 0 / 0, in-between pictures not needed 17
  of 29 / 32 of 67 to 0 of 14 / 1 of 74; off: 0 of 1,864 pictures moved against lab. Prompt cases (65 Jev calls):
  guards 36/36 with the record and sheet on and with the camera, counted as before (19/33, 27/33), hypotheses 5 to 10
  and 7 to 12 of 18. `bun test`: 777 pass with the switches unset; with every switch on, two tests of today's plans
  failed and are now pinned (their files pass both ways); typecheck clean. The paid check re-proposed: 20 pictures,
  $3.00, not drawn. No pictures drawn, no money spent.

- 27 Sep: the S4 picture check's second dry run found three faults in the shot briefs; fixed on branch
  `brief-fixes` from lab 3392d83, no pictures, no money.
  1. `shotFor` cut a brief at 1,400 characters mid-word, after its name check had passed (library-1 m5 ended "glow
     fain", library-3 m6 stopped mid-sentence). The writer is now asked for at most 1,200 characters
     (`BRIEF_ASK`, said in the request); one still over 1,400 (`BRIEF_MAX`) is cut after its last whole sentence
     that fits, none fitting is not kept, and the name check reads the brief as kept (`briefKept`), so one that
     loses anyone in the view by the cut is refused. Briefed again by the Claude writer (the only writer calls,
     into a scratch copy of the checkpoint): library-1 m5 1,176 and library-3 m6 1,227 characters, each ending a
     sentence and naming everyone in its view. library-3 m6's whale is not in its view's list: the camera rules
     say it after the brief ("In the water, in the middle of the picture, beside the yellow rowing boat: the whale,
     too big for the water to cover, part of it above the surface").
  2. The id fix (`namesForIds`) doubled a phrase: "facing the high round window; outside it outside the window"
     (library-1 m5; its place l2 is named "outside the window"). A place whose name says only where it is is now
     said by what it is (the first part of its geography, else its landmarks) in a moment's words, set off by a
     comma after words that already say where; in what the camera faces (`looks_at`) those words and the place are
     left out ("facing the high round window"), since the camera faces the window and the moment's own words and
     what it must show already say what is out past it. Said there by what it is, library-1-m5-level dropped: with
     any of four wordings Jev read the boat as low in the room at 0.44-0.55 (14 asks, 13 at 0.47 or more), against
     0.38-0.43 without it (7 asks) (debt, S4).
  3. `fixtureName` took the first fixture with an id across every scene's plan, but ids are each plan's own:
     lighthouse-fresh m9's window (x1 of the round room) was "the lighthouse" (the beach's x1), so no brief of it
     could pass. It now reads the moment's own plan (`placePlan`: its scene's, or the plan of the place the scene
     moves through), in `calledIn` and `calledFor` alike. The mock-up already labelled fixtures from the moment's
     plan; what changes is what a brief must name: frozen 16 fixtures in 14 cuts of 5 dreams, live 61 in 49 cuts
     of 14, each now the fixture on the moment's own floor plan (lighthouse-fresh m4 "the lighthouse door", m6-m8
     "the table", m9-m10 "the window"; snow-train-2 m4 "the stopped train", not "the front seat"; and so on).
  Tests: `test/brief-names.test.ts` (the length asked, a whole sentence kept, a brief that loses a name by the cut
  refused), `test/camera.test.ts` (a place named by where it is), `test/continuity.test.ts` (two plans with an x1
  each, and a place the scene moves through); each fails on lab. `tsc` clean; `bun test` 756 pass, 2 skipped, 0
  fail, with the switches unset and with record, sheet and camera on. Prompt cases, all 85, Claude's readings from
  the cache (0 writer calls), against lab: off 6/33 counted, 0/8 model step, 36/36 guards, 4/18 hypotheses; on
  (record, sheet, camera) 28/33, 7/8, 36/36, 7/18; no case moved either way (5 new Jev questions for library-1
  m5's new prompt). Corpus against lab: switches off, 0 of 140 frozen and 0 of 477 live pictures changed; on,
  1 of 144 frozen and 1 of 489 live, library-1 m5's view line without "outside it outside the window", better;
  0 worse. For the check: delete library-1-m5 and library-3-m6 from `runs/checkpoint/s4/briefs.json` (cut
  there), brief them and lighthouse-fresh-m9 with `--brief`, and dry run again.

- 27 Sep, S4 picture check drawn: 20 moments (7 faults, 13 guards) by today's harness with record, cut sheet, camera
  and routed checks on (checks logging), one take each on fal, $3.00 (cap $3.00). Judged blind by the owner on the
  local page (`evals/checkpoint.ts --judge`), answers in `runs/checkpoint/s4/answers.json`, scored with `--score s4`.
  Known confound: library-3 m6's brief says the whale is under the boat while the camera rule says beside it (the
  brief writer is not told what the sheet places in view; S6 owns the fix). Money left: $18.

- 27 Sep, S4 picture check judged by the owner, blind, old against new (`runs/checkpoint/s4/score.txt`): new right
  14 of 20, old 10 of 20. Faults (old called partly or wrong before): new right 5 of 7, old right 1 of 7. Guards (old
  called right before): new right 9 of 13, old right again 9 of 13 — the owner's second verdict on the same old
  pictures differs on 4, so one verdict on one picture is noisy and the side-by-side is the measure. Misses: library-1
  m5 (the high round window drawn as a whole wall opening: windows have no height on the floor plan), snow-train m3
  (grandpa moved from m2: seat continuity across the reverse), lighthouse-fresh m4 (dreamer inside, should be outside;
  old wrong too), lighthouse-fresh m9 (a boat not in the prompt), snow-train-2 m6 and orchard m6 (no note). Each is
  being traced to its root cause before the S5 check. These verdicts also join S7's labelled sets.

- 27 Sep, owner's notes after seeing the pictures: orchard m6 is right in both (he preferred the new one: its trees
  match the previous frame); the page answer was corrected to "both" (the page's answer kept in
  answers.before-correction.json). snow-train-2 m6: the new picture shows the frame after the handover, not the
  grandfather holding the suitcase out — the action drawn at the wrong instant (S6's typed "action at one instant").
  Score now: new 15 of 20, old 10 of 20; faults 5 of 7; guards new 10 of 13, old 9 of 13.

- 27 Sep, the S4 check's five misses traced (none is image-model noise; each picture followed what it was sent):
  library-1 m5 (the "high" window is a floor block the water hides, and the wall label names it, so the wall
  opened), snow-train m3 (the floor plan lacks the described windows, aisle and rows; the old m2 judged wrong was sent
  as a reference), lighthouse-fresh m4 (the unlocking moment set inside the building; old wrong too), lighthouse-fresh
  m9 (every carried thing is put bottom-centre through the dreamer's eyes), snow-train-2 m6 (the plan had already
  handed the case over; the brief said "arms just drawn back"). Across all 20, an earlier picture sent for its look
  takes over the layout: good when it matches the plan, bad when it doesn't.
- 27 Sep, owner's decisions: through the dreamer's eyes, a carried thing stays out of view unless the moment names
  it; the snow-train-2 suitcase stays shut at m5 and m6.

- 27 Sep: the S4 picture check's misses put right at the root, on branch `postcheck-fixes` from lab d3b8cb2 (no
  pictures, no money). One of the five fixes is done (43a0f84); the other four are traced, each with where it starts.
  **Done: fixtures up their walls (behind DREAMCHAT_CAMERA; nothing on the default path).** Cause: the floor plans
  give fixtures no height, so library-1's "the high round window" (x1) was a 2 x 0.3 x 2 m block on the floor, under
  4 m of water, and the mock-up labelled the front wall with the plan's front, "the high round window side", so the
  whole wall was drawn open onto the city. Change: `camera.ts mountOf` reads what a fixture's own name and the place's
  words say right about it (`wordsAbout`: the few words either side of what it is, up to a "with", "and" or "of"; "a
  round room at the top of the lighthouse with windows" says nothing of its windows): high or at the top, it fills
  the top quarter of the wall, its top 0.1 m under the ceiling; in or hung from the ceiling, its top at the ceiling;
  on a wall, its middle at 1.5 m; only what fits, under three quarters of the room's height (shelves "up to the
  ceiling" and walls stay on the floor). `continuity.ts rawPlanBy` lifts them (`Spot.above`, `camera.ts mounted`),
  flat against the wall they stand by, before the water is measured; `waterLevel` reads a lifted thing's bottom for
  "up to" and its top for "over"; `previs.ts` draws it at its height, counts it under water by its top, aims at its
  middle, says one over the top of the frame "Outside the picture, above it", and labels a front wall named by a
  fixture "the wall" (`frontLabel`, `camera.ts frontNamesFixture`). Measure (`evals/mounts.ts`): fixtures said high,
  at the top, on a wall or on the ceiling standing on the floor, frozen 3 to 0, live 8 to 0 (two more, "the wall with
  the 'Level 4' sign", are walls as tall as the room and stand on the floor as they should); front walls labelled with
  a fixture's name, frozen 10 to 0, live 24 to 0. Mock-ups rendered here from the floor plans (no fal): library-1 m5
  has the window 4.4 to 5.9 m up the front wall, above 4.4 m of water, behind the two in the boat, the wall labelled
  WALL; m4 (water 2.2 m) has it 4.4 m up, behind the camera; library-2 m8 has it 2.9 to 3.9 m up the back wall, above
  2.2 m of water, in the picture's top right. Tests: `test/camera.test.ts` "a fixture up its wall" (the words; what
  stays on the floor; flat against its wall and the water measured by it; the label; library-1 m5 on its frozen
  dream), failing without the change. Prompt cases, all 95 (new: `library-1-m5-window-height`, check `up_its_wall`),
  Claude's readings from the cache (0 writer calls, 0 Jev calls): record, sheet and camera on, counted 28/33 to 29/34
  (the new case met, none lost), model step 7/8, guards 36/36, hypotheses 7/18; library-1-m5-level's "boat low, far
  below the high round window" 0.40 to 0.28 and library-3-m7-level's 0.49 to 0.22, both further from the bar; off
  6/34, no case moved. Corpus against lab, on: frozen 11 of 144 pictures changed, live 17 of 489, each read: the
  window up its wall and in the picture of the moments that look at it (library-1 m5, library-2 m9, library-3 m7,
  de6c m8) better; library-2 m8's window in the picture above the water, hidden under it before, better; high in the
  frame instead of low behind the dreamer (library-1 m1, library-2 m1) better; "Outside the picture, above it"
  instead of standing in the middle of the picture or "off to the right" (library-1 m2 and m3, library-3 m3, de6c m5
  and m7) better; said behind the camera instead of left unsaid under the water (library-1 m4) better; the
  classroom's "windows on one wall" at window height instead of a block on the floor (b5b5 m2 to m4) better;
  library-3 m6's window, at the picture's right edge low before, now out past its top right, neutral; 0 worse. Off:
  0 of 140 frozen and 0 of 477 live pictures moved. `tsc` clean; `bun test` 788 pass, 2 skipped, 0 fail, with the
  switches unset and with every step's switch on.
  **Left, and where each starts** (none built; the owner's decisions above hold):
  1. Held things through the dreamer's eyes. `previs.ts thingBlocks` (its `pov` branch: 0.45 m ahead, 0.5 m under
     the eyes, bottom-centre) and `dreamerShot` (`inHands`: aimed at a point 0.6 m under the eyes, which tilts the
     camera down to -0.6 rad, the legs and knees in all three held-thing pictures) put anything carried in view;
     `camera.ts handsIn(words, holds)` and `cutsheet.ts cameraLayer`'s `holds` count any holding as hands in view;
     and the breakdown's `things` for the moment put the carried thing's sketch and "In it" line into the prompt
     (lighthouse-fresh m9's paper boat, `frames.ts inViewOf`). Start: whether the moment's action, what it must show or
     what it looks at names the thing (`wordsAbout` on its head word); not named, leave it off the render and out of
     the images and "In it", say it below the picture, out of view, with nothing of the dreamer's body; named, held
     low and to one side, the camera aimed at what the moment looks at, near level. New case lighthouse-fresh-m9-boat.
  2. A moment entering a place. lighthouse-fresh m4 ("turns the brass key in the lighthouse door") is set in l2,
     "inside the lighthouse", by the breakdown, and s2's floor plan has the dreamer inside at the door; the typed
     readings (`typed.ts`) hold no fact of which side of a way in the dreamer is. Start: a cached typed reading, "Is
     the dreamer outside <the place> at this moment?", for moments whose action unlocks, opens, knocks at or steps
     through a way in (at most 150 Jev calls, the Claude writer if needed), and with the camera on such a moment set
     on the plan of the place it is entered from; guards orchard m4 (the lift gate) and snow-train-2 m7 (the door
     standing on its own). New case lighthouse-fresh-m4-outside.
  3. Floor plans that follow the place's described layout. snow-train's carriage sketch says "a row of windows along
     each side, and a narrow aisle between two rows of bench seats", but the planner is given the breakdown's place
     words (`producer.ts blockScenes`: its `geography` and `landmarks`), here only "inside an old train car at night;
     seats facing each other, window looking out on snow", and its plan is one 2.5 x 2 m seat across the middle of a
     3 m car, the two on its centre line. Start: give the planner the sketch's words where the place has one; ask
     (`BLOCK`) for windows along the sides, rows of seats and an aisle as fixtures, and whoever sits on a seat; a
     check in `readPlan` (an indoor plan whose words name windows, rows or an aisle but has none; someone sitting on
     no seat) sent back as its `fix`; plans made again only through a cache, by a bounded writer run.
  4. Which side the room's windows are on, on every cut. `cutsheet.ts cameraLayer` builds the room's walls
     (`wallsSeen`, `roomTurn`) only where `tags.move === 'reverse'`; snow-train m3 faced as m2 did and lost which side
     the windows are. Start: build them for every cut on a floor plan the scene has drawn before, said as the room as
     before where it has not turned (`sayTurn`), and extend snow-train-m3-seat to check it.
  Scratch files of this work (the probe that prints a moment's plan and renders its mock-up, the run scripts) are in
  `runs/pc/` of the `postcheck-fixes` worktree, not committed.

- 27 Sep: S5 fix round two on `s5-fix2` (from lab ca71e3e; committed, not merged): an earlier picture brings nobody
  and nothing of its own, in today's prompts too (with S5 off 25 of 140 frozen and 80 of 477 live prompts move,
  images unchanged, prompt cases unchanged); with S5, a gate on every earlier picture (never one judged wrong or
  stale; drawn from only where its camera and what it shows match the cut: sent against them for layout 2 / 37 to 0
  / 0 bar 16 live edits with no floor plan, for look 22 / 51 to 0 / 0); a side is no change anywhere (the 43 live
  side pictures gone); crowds of people only; the count of changes the check's own. Guards 36/36 with S5 off and
  on, record and sheet on and with the camera (111 Jev calls). The S5 picture check is not yet re-proposed (above:
  how to resume). No pictures drawn, no money spent.

- 27 Sep: S6 begun on branch `s6-build` from lab 4746967 (S0-S5, S7-S9 merged), stopped at a clean point at the
  owner's request. Built behind DREAMCHAT_ONE_BUILDER (off by default; off, and on with no step, 0 pictures moved on
  every measured set): the switch and its steps (`cleanups.ts`), each moment's typed reading read while planning and
  put on its cut sheet (the evals read the typed cache only), switches for S4's word lists, and ledger rows 1 (one
  story record per state of the dream), 3 (one image cap) and 4 (the assembler's paragraph ids and image subjects,
  read by the prompt cases and the pre-draw check). Row 2 (one tree) stopped: it needs row 17 first. Rows 1-4 move
  no prompt: 0 of 128 frozen and 0 of 482 live pictures with record, sheet, camera and references on, 0 of 144 and
  0 of 490 with record and sheet only; prompt cases case by case as before (27/33 counted, 36/36 guards, 12/18
  hypotheses; 19/33, 36/36, 5/18). The measures the later rows move are still the base's ("S6 built so far"
  above). Found and fixed: the one record was reused under another clean-up switch (a footprint read as nothing;
  it is now kept by the switches too). Added from the S4 picture check's root causes: ledger row 34, the shot's
  brief from the sheet's facts (transfers drawn mid-act, after-the-fact phrasing refused, a check for a brief
  contradicting a sheet fact, a new case snow-train-2-m6-instant); and the owner's decision that snow-train-2's
  suitcase stays shut at m5 and m6. Model calls: 1 writer and 1 Jev (library-1 m5's typed reading with the camera
  on). `bun test`: 784 pass, 2 skipped, 0 fail, with every step switch unset and with every one on (the builder
  too); typecheck clean. No pictures, no money.

## Owner's direction (29 Sep): reviews and merges move to the cloud session

Hiren's own usage on this Mac session is spent for now. He is not personally reviewing branches; that has always
been an independent agent's job, and from here that job runs in the cloud session, not spawned from this Mac.
Coordination between sessions goes through GitHub issues on `metalfinger/stawberry-studio` from now on (issue #1),
not Engram rooms. This Mac session stays available to push things the cloud session can't (it hit a 403 once; may
be fixed by now) and to answer things only Hiren can decide.

**Go-ahead to merge:** given. Merge the four reviewed branches in the stated order (`checkpoint-order`,
`postcheck-fixes`, `s5-fix2`, `s6-build`), each already marked "merge" by review, then keep going, step by step,
until the harness is complete. That is the priority now, ahead of the sidebar work.

**Decision: the camera switch requires the story record, the same way it already requires the cut sheet.**
`DREAMCHAT_CAMERA=on` should refuse and fall back to camera-off (with the same kind of warning `DREAMCHAT_CUT_SHEET`
already gets) unless `DREAMCHAT_RECORD=on` too. Reasoning: every eval of S4 that mattered was already run with
record on (the S4 picture check, the corpus numbers quoted in the at-a-glance table); record-off-camera-on exists
only as a regression-suite combination, not a mode anyone will ship. Camera rules that need water level, what's
held, or what's open all read that cleanest from the record's typed facts; keeping a word-list fallback alive for a
combination nobody uses is exactly the kind of thing S6 exists to retire, and it's already produced one odd-wording
bug (`postcheck-fixes`'s review note: a lifted window says "outside the picture, above it" with record off). Land
this in `postcheck-fixes` (or wherever S4's switch guard lives after merging) with a test mirroring the existing
sheet-requirement test, and drop the record-off+camera-on rows from S4's eval matrix once it does.

**Parked, not blocking:** which conversation step shows each sidebar artifact (28 Sep call). Don't spend time on it
until the harness itself is complete.
