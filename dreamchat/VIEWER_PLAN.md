# The harness viewer: plan (draft 1, for critique)

Status: draft by the S6 pane, 29 Sep, to be critiqued by the Mac pane before anything is built. Nothing below is
agreed until both panes sign it off in the "Agreed" section at the end.

## Why

The harness is the preparation of every picture: the breakdown of a dream into sequences, scenes, shots and cuts;
how each cut connects to what is above it, to the cuts before it and to its in-between pictures; the camera; and,
from all of it, one prompt with its references, each named with one instruction. Drawing is the last step. The aim
is to know the whole chain is right before anything is drawn.

Today the owner cannot see that chain. The evidence is written as text counts ("states said twice 107 to 30"),
and those counts can pass while pictures get worse: S5's text measures and prompt cases were all unmoved while its
picture check fell to 7/17 against 12/17, because the faults were in which images were sent, which no words-only
check reads. The viewer shows the owner the chain itself, cut by cut, and takes his verdict on each. Those
verdicts become the pass bar for any change to the chain (references, in-between pictures, the edit base, the
camera), ahead of the text counts, prompt cases and Jev.

## What it shows, and nothing it makes up

**One rule above all: the viewer shows what the drawing path would send, by calling the same functions.** It never
re-implements a step. Every number, word and image in it comes from `rebuild()` (plan.ts), `assembleCut`
(assemble.ts), the cut sheet (cutsheet.ts), the plan (`planContinuity`, continuity.ts), the tree (`resolveTree`,
tree.ts) and the mock-up renderer (`previsFor`, session.ts), at the current commit and under the switches set.
The page's header shows the commit and every `DREAMCHAT_*` switch. A test checks that the viewer's prompt and image
list equal `rebuild()`'s for every cut of every frozen dream.

For one dream, from its saved conversation (frozen, on any machine; or live, from `DREAMCHAT_DATA`):

1. **The tree, top down.** Dream → sequence → scene → shot → cut, from `tree.ts resolveTree` (sequences split where
   the story starts again or jumps; shots are cuts sharing one camera setup). Each level shows its tags and what
   it passes down: the style and look of the dream, a scene's place, mood and floor plan, a shot's lead and locks.
   Where the tree and the plan the prompts are made from disagree (ledger row 2, "one tree", still open), the cut
   shows both and says so. The viewer must not hide that disagreement.
2. **Across the cuts.** For each cut, the earlier cuts and in-between pictures it is drawn from, with their
   relation (same setup, same side, reverse, jump, other side, seat) and their use (edit base, composition,
   identity, light). Every in-between picture is shown with the change it makes, what it is edited from, the cuts
   that use it, its depth (edits from a sketch or a drawn cut) and its prompt.
3. **Each cut.** In order:
   - the moment's own words: action, what the camera faces, feeling, the one thing it must show, whose eyes;
   - the camera: size, eyes, what it faces, lens, height, and its words;
   - **the grey mock-up** rendered through this camera, beside the cut before's (free, local). The owner can
     judge camera and layout on it without drawing anything. Mock-ups can mislead (orchard m2 renders as a large
     egg-shaped head on a box; the white horse as a person-shaped figure; lighthouse-first m8 has no tractor), so
     it is labelled as a mock-up and is judged on its own;
   - the references in the prompt's order, Image 1 to Image N, each with its key (sketch:p1, ghost:g2,
     picture:m3, previs:m5), its instruction, its line in the prompt, whom it is for, and the image itself where
     one was drawn (else "not drawn", and for an in-between picture its prompt);
   - **the references the plan chose and did not send, each with why** (the gate: a camera or state that does
     not match, a reverse, judged wrong, stale; the image cap);
   - the cut sheet's facts: who and what is in view, what this moment changes, what carries from earlier, how
     each one is now;
   - the prompt, folded by paragraph id (the one builder's `assembled` lines), and optionally a diff against the
     prompt today's defaults would make;
   - the picture drawn on the night, where there is one (live dreams only).
4. **The verdict.** Right, wrong or unsure, and a note, per cut; optionally per reference and on the mock-up
   alone. Saved with the commit and a hash of what was shown (prompt, image keys, mock-up), so a verdict on a
   prompt that has since changed reads "to read again", never as current.

Not in the first version: pasting a new transcript (it needs the writer's breakdown and the planning path's model
steps first: phase two); editing anything from the page; drawing; Jev.

## The data: `ViewDream`

`dreamchat/viewer/types.ts` (draft, uncommitted): a header (dream, source, commit, switches), the elements with
their sketch keys, the tree, the cuts, the in-between pictures and the plan's issues; `ViewVerdict` for the
answers. The Mac pane may change it; any change is agreed before either side builds on it. Where each field
comes from:

| field | source |
| --- | --- |
| tree, sequences, shots | `resolveTree(treeInputOf(s))` (tree.ts, session.ts); the plan's `CutPlan.scene`/`shot` beside it |
| tags | `tagWords(sheet.tags)` (cutsheet.ts); needs the cut sheet on |
| camera | `sheet.camera`; the lens and height from `CutPlan.eye` |
| mock-up | `previsFor` (session.ts) or `previsOf` (evals/paired-arms.ts): `previsImage`, pure CPU, no model; written to `runs/viewer/<dream>/previs-<cut>.png` |
| references sent | `assembled.references` (`AssembledRef`: image, role, instruction, source, of, subjects) and `assembled.lines`; `imageName` for the key |
| references not sent | `CutPlan.unsent` (continuity.ts `chooseInPlan`), `sheet.rules.dropped` (`notDrawnFrom`), `withheldOf` (verdicts.ts), the image cap: **only `withheldOf` gives a reason today** (gap 1) |
| facts | `sheet.inView`, `sheet.record.own` / `carried`, `sheet.now` |
| prompt | `RebuiltPicture.prompt`; the default prompt from a second rebuild with the switches unset |
| images on disk | frozen: none (stand-ins, shown as "not drawn"); live: `<data>/strawberry-home/media/<mediaPath>`, served by basename only, as `serveJudge` does |

## Gaps to close before the viewer can be truthful

1. **Why a reference was not sent.** `CutPlan.unsent` holds the dropped `PlanRef`s with no reason; `notDrawnFrom`
   keeps only a flag string; the image cap drops silently. Add a reason where each drop is decided (one field,
   e.g. `unsent: { ref, why }[]`), with a test per reason. Output unchanged: no prompt may move (checked on the
   corpus, frozen and live).
2. **One tree.** The viewer shows the tree (tree.ts) and the plan's shots side by side and marks where they differ,
   until ledger row 2 makes them one. It does not pick one silently.
3. **Tags need the cut sheet on.** The viewer runs with the cut sheet on (as every S6 measure does). With it off,
   there are no tags, and the page says so.
4. **Mock-ups need a floor plan.** A cut with no floor plan has no mock-up; the page says so rather than showing
   nothing.

## The page

A local Bun page like the picture-check judging page (`evals/checkpoint-judge.ts serveJudge`: `127.0.0.1`, any free
port, images served by basename from one folder, answers written whole with a temp file and a rename).

- Left: pick a dream; its tree, each cut marked with its verdict state (not read, right, wrong, to read again).
- Right: the cut panel, in the order of "Each cut" above; the mock-up and the cut before's side by side.
- Keyboard: next/previous cut, r / w / u for the verdict, n for a note.
- Answers: `evals/viewer/<dream>.json`, committed like the picture check's answers.

## From verdicts to an eval

`evals/viewer-report.ts`: for each dream, the cuts read, right, wrong and to read again at the current commit
(a verdict whose hash no longer matches what the viewer shows now). A change to the chain passes only if no cut the
owner called right becomes wrong or "to read again" without being read again. The report sits beside
`corpus.ts --verdicts`, `retire.ts --checks` and the prompt cases; for changes to references, in-between pictures,
the edit base or the camera it is the bar.

## Work split (each builds one side, and critiques the other's)

| | S6 pane (me) | Mac pane |
| --- | --- | --- |
| build | `viewer/data.ts`: `viewDream(session, opts): ViewDream`; the parity test (prompt and images equal `rebuild()` on every frozen cut); mock-ups written to `runs/viewer/`; gap 3 and 4; `evals/viewer-report.ts` | the page and its server (`viewer/serve.ts`, `viewer/page.html`), images from disk, verdicts saved; gap 1 (the reasons live in `chooseInPlan`, `notDrawnFrom` and the gate, its files); live dreams (only its folder has `state/`) |
| critique | the page: does it show every field, hide nothing, and save verdicts safely | the data: is every field what the drawing path uses, and is anything missing |
| fixture | a `ViewDream` JSON of one frozen dream committed early (`viewer/fixtures/`), so the page is built against real data in parallel | |

Each side also gets an independent reviewer agent before merge, as every row does.

## Order

0. This plan agreed (both panes, then the owner).
1. First: the S5 anchor merged, then the S6 stack (rows 8, 11-16) merged into lab, so the viewer shows today's
   harness. The viewer is built on a branch `viewer` from lab after those merges.
2. The data for one frozen dream, and its fixture; the page against the fixture, at the same time.
3. Every frozen dream (15), the parity test green; gap 1's reasons in; the report.
4. Live dreams (the Mac pane).
5. The owner's first reading: the dreams of the S4 and S5 picture checks first, since his picture verdicts on them
   exist and the two can be compared.
6. Then decide, from his verdicts, which S6 rows (17-34) and which S5 follow-ups matter.

## Jev in this (both panes' reading, 29 Sep)

- No Jev gate on pictures: S7 measured the gate and "storyboard complete?" at chance (AUC 0.36-0.56); 0 of 28
  checks earned acting.
- Near its bar Jev's answer moves between draws (the tractor case: 0.46, 0.63, 0.56, 0.53), and the implied
  readings have 32 answers close to the bar on the live dreams, with no calibration against the owner's verdicts.
- So: Jev only for cheap, high-volume typed readings, with a bar calibrated on the owner's verdicts before it is
  trusted; structural checks as code; reading and writing facts by Claude; pictures judged by the owner in the
  viewer (first on the mock-ups, free; then on drawn pictures). The one picture judge that beat chance was a
  language-model vision judge (`evals/picture-judge.md`: 16 of 20 picks matched the owner's), a later safety net
  and not a harness fix.
- The viewer shows no Jev readings in its first version.

## Open questions for the owner

- The tree splits sequences where the story starts again or jumps (tree.ts). Is that the sequence he means?
- Which dreams first (proposed: the S4 and S5 check dreams)?
- A verdict per cut only, or also per reference and on the mock-up alone?

## Critique (Mac pane)

_To be written by the Mac pane._

## Agreed

_Not yet._
