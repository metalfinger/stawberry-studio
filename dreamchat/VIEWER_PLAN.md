# The harness viewer: plan (draft 2)

Status: draft 1 by the S6 pane (81a3c5e); critiqued by the Mac pane; draft 2 folds the critique in, with the S6
pane's answers, and the Mac pane's two amendments to draft 2, 29 Sep. Signed by both panes; nothing is built until
the owner signs the "Agreed" section at the end.

## Why

The harness is the preparation of every picture: the breakdown of a dream into sequences, scenes, shots and cuts;
the sheets (each person's, place's and thing's sketch); how each cut connects to what is above it, to the cuts
before it and to its in-between pictures; the camera; and, from all of it, one prompt with its references, each
named with one instruction. Drawing is the last step. The aim is to know the whole chain is right before anything
is drawn; what is left after that is passing the prompts and references to the image model.

Today the owner cannot see that chain. The evidence is written as text counts ("states said twice 107 to 30"),
and those counts can pass while pictures get worse: S5's text measures and prompt cases were all unmoved while its
picture check fell to 7/17 against 12/17, because the faults were in which images were sent, which no words-only
check reads. The viewer shows the owner the chain itself, cut by cut, and takes his verdicts. Those verdicts are
the bar for any change to the chain (references, in-between pictures, the edit base, the camera), ahead of the
text counts, prompt cases and Jev.

## What it shows, and on what assumption

**The viewer derives nothing.** Every prompt, image list, fact and mock-up it shows is taken as it is from the
harness's own functions at the current commit: one `rebuild()` (plan.ts) of the dream, its cut sheets
(cutsheet.ts), the plan (`planContinuity`, continuity.ts), the tree (`resolveTree`, tree.ts) and the drawing
path's own mock-up (`previsFor`, session.ts).

**What a rebuild is, in words** (Mac pane, critique 1): a rebuild treats every sketch and every earlier picture as
drawn and approved. The drawing path sends only what is drawn, ready and not withheld (S5: judged wrong; S9:
stale). So the viewer shows **each cut as it will be sent once everything before it is drawn and approved, in
story order**, and its header says so (`header.assumes`). For a live dream it also shows, beside it, what was
really sent on the night (the as-drawn record; `corpus.ts` reads it for 62 frozen moments), marked wherever the
two differ.

**The profile** (critique 10): one named set of switches is "the harness": record, cut sheet, camera rules and
references on, `DREAMCHAT_ONE_BUILDER` at the latest merged step. The header names the profile and the commit,
and warns when the switches are not the full profile. The prompt with today's defaults is shown only on request,
as a diff.

For one dream (frozen, on any machine; live, from `DREAMCHAT_DATA`):

1. **The dream.** Its style and look, and the dreamer's own words: the conversation, searchable, with the words of
   the selected moment highlighted where they appear (critique 9). A moment does not record which turn it came
   from, so the exact passage per moment is phase two (a producer field or a small reading). Frozen copies keep no
   conversation; it is read from the live copy of the same dream where this machine has one.
2. **The sheets** (critique 5: the chain starts there). Each person, place and thing: its sketch, the prompt it
   was drawn from, its look as the cut sheets say it, the cuts and in-between pictures that use it, and a verdict.
3. **The tree.** Dream → sequence → scene → shot → cut. The plan's scene and shot (`CutPlan.scene`, `shot`) are the
   primary labels, since prompts are built from them; the tree's sequences (tree.ts: split where the story starts
   again or jumps) group them; where the tree and the plan disagree (ledger row 2, "one tree", still open) the cut
   carries a badge saying how. Each level shows its tags and what it passes down.
4. **Across the cuts.** For each cut, the earlier cuts and in-between pictures it is drawn from, with the plan's
   relation (same setup, same side, reverse, jump, other side, seat) and role as the plan has them. Each in-between
   picture is a node like a cut (critique 5): the change it makes, what it is edited from, its own references and
   prompt, the cuts that use it, its depth, and a verdict.
5. **Each cut**, in order:
   - the moment's own words: action, what the camera faces, feeling, the one thing it must show, whose eyes;
   - the camera: size, eyes, what it faces, lens, height, and its words;
   - **the top view** (critique 3): the scene's floor plan from above with everyone and everything on it, this
     cut's camera (position, direction, field of view) and the cut before's. Mirroring, reverses and a crossed line
     show here directly (orchard m3's fault was a mirror);
   - **the grey mock-up**: exactly the file the drawing path attaches as its Image 1 (`previsFor`), with its
     sha256, beside the cut before's. Labelled a mock-up: mock-ups can mislead (orchard m2 renders as a large
     egg-shaped head on a box; the white horse as a person-shaped figure; lighthouse-first m8 has no tractor);
   - the references in the prompt's order, Image 1 to Image N: key (sketch:p1, ghost:g2, picture:m3, previs:m5),
     role, instruction, the prompt's line for it, whom it is for, and the image itself;
   - **the references the plan chose and did not send, each with a coded reason** (gap 1);
   - the cut sheet's facts: who and what is in view, what this moment changes, what carries from earlier, how
     each one is now; the plan's issues that name this cut;
   - the prompt, folded by paragraph id;
   - for a live dream: the picture drawn on the night, the images really sent, and whether the prompt sent was
     this one.
6. **Images** (critique 4): every sketch, in-between picture and drawn picture is shown wherever its file is on
   this machine. Frozen copies strip their media ids, so they are read from the live copy of the same dream (on the
   Mac, the files the S4 and S5 checks drew from); "not on this machine" only where it is not. The server serves
   only from the media folder and `runs/viewer/`, by basename, as `serveJudge` does. The live copy may have moved on since the dream was frozen (a sketch redrawn, a picture
   made again): each image is matched by item id and version, and where they differ it is shown with the mark "the
   live copy has changed since this dream was frozen", never silently (amendment a).

Not in the first version: pasting a new transcript (phase two); editing anything from the page; drawing; Jev.

## Verdicts

The Mac pane proposed three verdicts per cut (layout, references, words), each with its own hash, so that a wording
change does not wipe the layout and references verdicts (critique 6). The S6 pane agrees on the hashes and
disagrees on three clicks per cut: most cuts will be right, and the owner's time is the scarce thing. Draft 2:

- **One verdict per cut by default**: right, wrong or unsure (r / w / u), and a note. "Right" means the whole chain
  of that cut is right: one key.
- **Wrong names what is wrong**: at least one of layout (top view and mock-up), references (the set and their
  instructions), words (the prompt and facts), keys 1 / 2 / 3, with the note.
- **Every verdict stores three hashes**: chain (the image keys, their roles and order, the mock-up's sha256, the
  camera), words (the prompt), facts (the sheet's facts).
- **To read again, by what moved**: when the chain hash moves, the cut is read again in full; when only the words
  or facts move, the page shows the diff alone and one key confirms it (the layout and references verdict stands).
  So an S6 wording row costs the owner a skim of diffs, not a re-reading.
- The sheets and in-between pictures get the same verdict, with their own hashes (the prompt they were drawn from,
  their references).

Saved to `evals/viewer/<dream>.json`, committed like the picture checks' answers, written whole with a temp file
and a rename.

## From verdicts to an eval

`evals/viewer-report.ts`: for each dream, at the current commit, the cuts read, right, wrong and to read again, and
**exactly the cuts whose chain hash moved** since their verdict, so the owner reads only those (critique 7).

The bar has two passes. **Pass 1**, the viewer, gates every change to the chain: no cut the owner called right may
become wrong, or be left "to read again" unread. It is necessary, not sufficient: the image model adds its own
errors (S4's mock-up cuts were 15/20, not 20/20). **Pass 2**, a drawn sample judged blind by the owner (the picture
checks), confirms before a change is called proven.

## The data: `ViewDream`

`dreamchat/viewer/types.ts`, revised with the critique (critique 11): a header (dream, source, commit, profile,
switches, `assumes`), the dream's words, the sheets as nodes, the tree, the cuts (with the camera's eye on the floor
plan and the scene's spots for the top view, the mock-up's sha256, the plan's roles as they are, the cut's issues,
what was really sent), the in-between pictures as nodes with their own references, and verdicts with their hashes.
Where each part comes from:

| part                       | source                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tree, sequences, shots     | `CutPlan.scene`/`shot` (primary); `resolveTree(treeInputOf(s))` (tree.ts, session.ts) for sequences and the disagreement badge                                                     |
| tags                       | `tagWords(sheet.tags)` (cutsheet.ts); needs the cut sheet on (the profile has it)                                                                                                  |
| camera, top view           | `sheet.camera`; `CutPlan.eye` (position, direction, height, lens); `shotPlan(b, cut, rec)` for the floor plan and its spots                                                        |
| mock-up                    | `previsFor(b, frame, called, rec)` (session.ts): `previsImage`, pure CPU, no model; written to `runs/viewer/<dream>/` by its sha256, rendered lazily, the tree never waiting on it |
| references sent            | `assembled.references` (`AssembledRef`: image, role, instruction, source, of, subjects) and `assembled.lines`; `imageName` for the key                                             |
| references not sent        | `unsent: { key, code, detail }[]`, from gap 1                                                                                                                                      |
| facts                      | `sheet.inView`, `sheet.record.own` / `carried`, `sheet.now`; `plan.issues` naming the cut                                                                                          |
| sheets                     | the items' fields and looks; the sketch prompt from the sheet prompt builder; users from the plan's refs                                                                           |
| what was sent on the night | the as-drawn record (S9) and the saved frames' images                                                                                                                              |
| images                     | `<data>/strawberry-home/media/<mediaPath>` from the live copy                                                                                                                      |
| the dreamer's words        | the live copy's transcript                                                                                                                                                         |

## Gaps to close before the viewer is truthful

1. **Why a reference was not sent** (the Mac pane takes it, critique 8). `unsent[] = { key, code, detail }`, the
   code one of: `reverse`, `camera_far` (metres, degrees, height), `state_differs` (which states),
   `no_cameras_words_differ`, `judged_wrong`, `stale`, `light_only`, `has_sketch` (an identity picture for someone
   with a sketch), `seat_replaced_by_view`, `cap`, `edit_to_own_camera` (s5-anchor: why an edit became its own
   cut). One test per code; no prompt or image moves, byte for byte, frozen and live. On the viewer branch after
   s5-anchor merges.
2. **One tree**: the badge until ledger row 2 makes them one.
3. **Tags need the cut sheet on**: the profile has it; off, the page says there are none.
4. **Mock-up and top view need a floor plan**: a cut without one says so.

## Tests

- **Projection** (critique 1a): `viewDream` takes every prompt, image list, fact and mock-up verbatim from one
  `Rebuilt` and derives none; checked field by field on every frozen cut.
- **The drawing path** (critique 1b): for every frozen cut, the drawing path's inputs (`plannedInputsOf`, then
  `cutSheet` and `assembleCut`), with everything before the cut drawn and approved, give the same prompt and images
  as the viewer. `refs.test.ts` "the drawing path" does this for one dream; extended to all 15.
- **In-between pictures and sheets too** (amendment b): each in-between picture's prompt and references are
  `buildGhosts`/`ghostPrompt`'s own, and each sheet's prompt is the sheet prompt builder's own, byte for byte, in
  both tests.
- **Mock-up**: the file the viewer shows is byte for byte the one the drawing path attaches (its sha256).
- **Verdict hashes**: a words-only change moves only the words hash; a reference change moves the chain hash.
- The page: its own tests (Mac pane), and a check that no path outside the two folders is served.

## The page

A local Bun page like the picture checks' judging page (`evals/checkpoint-judge.ts serveJudge`: `127.0.0.1`, any
free port, images by basename from its folders, answers written whole). Left: pick a dream; its sheets and tree,
each node marked not read, right, wrong or to read again. Right: the selected node's panel, in the order above.
The frame shows as soon as the dream is picked; images and mock-ups stream in, and nothing waits on its slowest
part. Keys: next and previous, r / w / u, 1 / 2 / 3 with w, n for a note, d for the diff on a cut to read again.

## Work split (each builds one side and critiques the other's)

|          | S6 pane                                                                                                                                                                                                                                                             | Mac pane                                                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| build    | `viewer/data.ts` `viewDream(session, opts)`; the three hashes; the projection, drawing-path and mock-up tests; mock-ups to `runs/viewer/`; the top view's data (eyes and spots); the sheets and in-between pictures as nodes; `evals/viewer-report.ts`; the fixture | the page and its server; the top view's drawing (SVG from the data); verdicts saved; gap 1; live dreams, what was sent on the night, the media and transcript lookup from the live copy |
| critique | the page: every field shown, nothing hidden, verdicts saved safely, keys                                                                                                                                                                                            | the data: every field what the drawing path uses, nothing missing                                                                                                                       |

Each side also gets an independent reviewer agent before merge, as every row does. The fixture (one frozen dream's
`ViewDream`, `viewer/fixtures/`) is committed from `s6-states` early and replaced once lab has the stack.

## Order

0. This plan agreed by both panes, then the owner.
1. The S5 anchor merged, then the S6 stack (rows 8, 11-16) merged into lab: the viewer shows today's harness.
2. The viewer branch from lab. The fixture first; the page against it while the data grows (critique 12).
3. Every frozen dream, all tests green; gap 1's reasons; the report.
4. Live dreams: what was sent on the night; media and conversation.
5. The owner's first reading: the dreams of the S4 and S5 picture checks first, since his picture verdicts on them
   exist and can be compared with his reading of their chains.
6. From his verdicts, decide which S6 rows (17-34) and S5 follow-ups matter.

## Jev in this (both panes, 29 Sep)

- No Jev gate on pictures: S7 measured the gate and "storyboard complete?" at chance (AUC 0.36-0.56); 0 of 28
  checks earned acting.
- Near its bar Jev's answer moves between draws (the tractor case: 0.46, 0.63, 0.56, 0.53); the implied readings
  have 32 answers close to the bar on the live dreams, with no calibration against the owner's verdicts.
- So: Jev only for cheap, high-volume typed readings, with a bar calibrated on the owner's verdicts before it is
  trusted; structural checks as code; reading and writing facts by Claude; pictures judged by the owner in the
  viewer (pass 1 on mock-ups, free; pass 2 on drawn pictures). The one picture judge that beat chance was a
  language-model vision judge (`evals/picture-judge.md`: 16 of 20 picks matched the owner's), a later safety net
  and not a harness fix.
- No Jev readings in the viewer's first version.

## Open questions for the owner

- The tree splits sequences where the story starts again or jumps (tree.ts). Is that the sequence he means?
- Which dreams first (proposed: the S4 and S5 check dreams)?
- One verdict per cut with what is wrong named, or three verdicts per cut? Both panes recommend one (draft 2): the
  same "read again by what moved", with a third of the decisions.

## Critique (Mac pane, on draft 1, 29 Sep) and answers

1. The truth rule was stated too strongly and its parity test was a tautology: a rebuild is not the drawing path
   (it treats everything as drawn and approved). _Accepted_: the assumption is stated in the header, what was sent
   on the night is shown beside it, and the tests are a projection test and a drawing-path test on all 15 dreams.
2. The mock-up must be the drawing path's own (`previsFor`), with its sha256, rendered lazily. _Accepted._
3. A top view with this cut's and the cut before's cameras, since the mock-up can mislead and the top view shows
   mirrors and reverses directly. _Accepted_; split: the S6 pane gives the data (the floor plan's spots, each
   camera's position, direction, height and field of view), the page draws it as SVG.
4. Frozen dreams must show their images, from wherever the media is on this machine. _Accepted_, through the live
   copy of the same dream (the frozen copies strip media ids).
5. Sheets and in-between pictures as full nodes with their prompts, references and verdicts. _Accepted._
6. Verdicts hashed per aspect, three verdicts per cut. _Accepted in part_: three hashes, and "to read again" by
   what moved; but one verdict per cut, with the wrong aspect named only when wrong. The Mac pane withdrew three
   verdicts per cut on draft 2: one key for "right" gives the same with a third of the decisions.

## Amendments (Mac pane, on draft 2, 29 Sep)

a. Images from the live copy of a frozen dream are matched by item id and version, and marked where the live copy
has changed since the dream was frozen. _Folded in_ (What it shows, 6).
b. The projection and drawing-path tests cover the in-between pictures and the sheets, byte for byte. _Folded in_
(Tests). 7. The viewer is necessary, not sufficient; pass 2 on drawn pictures confirms; the report lists the cuts whose
chain moved. _Accepted._ 8. Gap 1 with coded reasons; the Mac pane builds it after s5-anchor. _Accepted._ 9. The dreamer's own words beside each cut. _Accepted_: the conversation, searchable, the moment's words
highlighted; the exact passage per moment is phase two (moments do not record their turn). 10. One named profile as "the harness"; the default-prompt diff on request only. _Accepted._ 11. The types: the plan's roles as they are, hashes on verdicts, issues per cut, eye coordinates, what was sent,
sheets as nodes. _Accepted._ 12. The page against the fixture while the merges happen; its work starts after the S5 anchor merges. _Accepted._

## Agreed

- S6 pane: signed draft 2 (89e1e87), with amendments a and b.
- Mac pane: signed draft 2 (89e1e87), 29 Sep.
- Owner, 29 Sep, on the open questions: a sequence is tree.ts's (a new one where the story starts again or
  jumps); the S4 and S5 picture checks' dreams are read first; one verdict per cut (right is one key; wrong names
  layout, references or words).
