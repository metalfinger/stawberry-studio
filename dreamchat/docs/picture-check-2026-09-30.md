# The first full-harness picture check on fal (30 Sep 2026)

50 pictures on Nano Banana Pro (fal, 2K, 16:9), drawn through the Strawberry engine from lab `bc1a049` with every
switch on (record, cut sheet, camera rules, references, the one builder's every step), $7.50, every job id and receipt
kept (`runs/checkpoint/fal-*/results.json` in the checkout with the saved conversations). The owner judged each moment
blind, the old picture and the new as A and B in a balanced order (`evals/checkpoint.ts --judge`), and three readers
then read every picture against its prompt and the images sent (`runs/fal-read/group-{A,B,C}.md`, kept out of the
owner's sight until he had judged).

## The result

| Set | What | Owner: new right | Owner: old right |
| --- | --- | --- | --- |
| fal-judged, faults (12) | moments whose night picture he had called partly or wrong | 8 | 5 |
| fal-judged, guards (24) | moments whose night picture he had called right | 23 | 15 |
| fal-pairs (7) | never judged: the harness as it stands (every switch off) drawn now, against every change on | 5 | 5 |
| **All 43** | | **36** | **25** |

Guards lost: one (orchard m2). Faults not put right: night-market m2, lighthouse-fresh m10, lighthouse-fresh m13,
snow-train m2 (new "more correct", not right). Pairs not right: night-market m5, heron m2.

## The seven new pictures not right, each at its root

| Moment | The owner | Root (the readers' reading, checked against the prompt sent) | Owner of the fix | Status |
| --- | --- | --- | --- | --- |
| heron m2 | "it's not clear that it is looking through that small window"; the space changed | The floor plan put the students the dreamer sees *through the door's round window* in the corridor, on the camera's side; the typed reading had `beyond: students through the small round window`, but nothing read it | S6 | **On lab**: `plan_beyond` (typed `beyond` facts reach the floor plan; the students are out past the door, "Out past the wooden door with the small round window…") |
| lighthouse-fresh m13 | "the driver is sitting on the opposite side" | The camera words say the driver faces the camera from 3 m in front, while the opening line and the story say *profile*; the model drew a side view, and in a one-seat cab put the dreamer on the fender. Also: a riding pair never set the scene's line, so the camera could turn round on them | Mac | keep-sides (branch): riders hold the line; facing from the moment (next); the one-seat cab is story data |
| snow-train m2 | new "more correct", but the dreamer "might have gotten up and sat next to him" | The words never said *across from* each other, only "on the seats facing each other" | Mac | branch: "sitting on the seats facing each other, across from" the other |
| night-market m5 | "The orientation of the cycle is wrong" | The plan had no bridge: the mock-up showed a bicycle box on nothing, and the model laid the bridge across it; the shot brief also invented "soft, even daylight" on a night ride | Mac (deck), S6 (the brief's light) | path-deck (branch); the brief's light: next |
| night-market m2 | not right (his old note: "would have liked the dreamer looking towards fish") | Everyone faces "front", the camera, by default: the dreamer stares out, the sister past the old man; nothing says who looks at what | Mac | facing from the typed acts (next) |
| lighthouse-fresh m10 | "who is that third person in the frame?" | The camera stood behind the dreamer for a must-show held *in their hands*; the model added a second pair of hands from the camera. The old picture failed the same way | Mac | never from behind when the must-show is in the dreamer's hands (next) |
| orchard m2 | "doesn't look like a continuation of the previous image … it should be from the perspective of the dreamer. There can't be two people in the frame" | A close first-person mock-up of a head on a block, unreadable at that distance; the model fell back to the lift sketch's own layout (a large hall, the gate centred) and turned the block under Tomas into a box he stands on, pushed by the image-1 line "the unlabelled shapes under people become what they sit on" | Mac (near-blank close mock-ups), S6 (that line) | the line said only where someone sits: branch `s6-picwords`, **not landed**: it rewords 82 of 127 mock-up pictures and wants a picture test first |

## What the owner's notes teach (keep)

- **Through the dreamer's eyes is right when it shows no body and no other person**: "A is more right because it is
  from the dreamer's perspective" (snow-train m6); "There can't be two people in the frame" (orchard m2).
- **The environment must continue from the picture before**: "the environment is consistent from the previous frame"
  (orchard m5, m6, the reason he chose them); "doesn't look like a continuation of the previous image" (orchard m2).
- **Sides must hold between pictures of the same people** (the 180° rule): "the grandfather is sitting on the wrong
  side, since the camera flipped 180°" (snow-train m2, old); "the driver is sitting on the opposite side" (m13). Turning
  round to look at another side of the place is fine: 6 of the 7 new pictures that turned round were right.
- **Everyone the moment names is visible**: "I can clearly see both sisters there" (night-market m1).
- **Any legible text is a fault**: "A has text, which makes it wrong by default" (lighthouse-fresh m3); none of the 43
  new pictures had any.
- **Small geometry he reads at once**: a window bar cut by the frame (lighthouse-fresh m9); the dreamer too far from a
  door to open it (snow-train m6, old).

## What visibly worked (the readers, confirmed by the owner's verdicts)

Through the dreamer's own eyes with no body (library-3 m8, lighthouse m3, orchard m7); a handover drawn mid-act
(night-market m4, snow-train m5, snow-train-2 m6); who holds what; the fish on the stall; riders one behind the other on
one bicycle; unreadable marks for writing (no legible text anywhere); faces and clothes held to the sketches across a
dream; the dream's own colours kept in one-colour styles; the tractor kept outside the window ("far off outside and
never inside the place"); the mock-up's layout followed where its shapes are clear.

## What the readers found that the owner's verdicts did not fault (lower weight: test before changing words)

- **Mock-up shapes** (Mac): animals as human mannequins (lighthouse m1, m3; orchard m6); held props as boxes floating
  beside the hands, far too big (the key, the paper boat); the tractor as one box that lands in front of the camera
  whichever way it looks (m12); a train slab people stand on (snow-train m4); near-blank close and first-person
  mock-ups (library-3 m8, snow-train m6, heron m2) give the weakest pictures.
- **The place sketch pasted as the backdrop**, torn-paper border and all (night-market m5, m7; orchard m2, m5), and
  places showing what this camera should not see (the sea behind the lighthouse, m3).
- **Light and time of day from the shot brief**, not the story ("flat white daylight" at night: snow-train m4, m5;
  night-market m5), and the night light line dropping once the scene leaves the market.
- **A state in progress written as done**: "a trail of footprints … toward the red door" drew a trail already at the
  door (snow-train-2 m5, m6).
- **Contradictory face words**: the face "will not stay in memory" against the identity line's "exactly" (m13); a
  generated picture sent for how someone looks carries its drift forward (m11 → m13).
- **Story data**: a one-seat cab for two riders; a brass key in a silver-only palette; Tomas's sketch already the
  ten-year-old of m2.

## What was done with it (30 Sep, evening)

On lab (`b82362d`), each measured on every saved dream with its changes classified, prompt cases unchanged, the suite
green both ways:

- **Seen through an opening** (`plan_beyond`, S6): heron m2's students are out past the door, seen through its window.
- **Colours said once stay told** (`carried_colours`, S6): a colour the dreamer gave something at an earlier moment is
  still told wherever it is in view: heron's "green corridor" (drawn beige at m2), the silver fish, the yellow boat,
  the brown leather suitcase, the white lighthouse.
- **The shot brief's light** (S6): the brief gives the light's source and side, never a time of day the facts do not
  give ("flat white daylight" at night).
- **Sides hold** (keep-sides, Mac): riders in one vehicle hold and set the scene's line like anyone; lighthouse-fresh
  m13 stays on m12's side, and a crossing the moment makes is said.
- **Across from** (Mac): two sat facing each other are said to sit across from each other (snow-train m2).
- **The bridge deck** (path-deck, Mac): a way out of doors with no ground on its plan gets its deck under whoever is
  there, along the way they ride (night-market m5).
- **Seen looking at it** (lookers, Mac): a camera that those looking at what the moment looks at would stare into costs
  more, so they are seen from beside, looking (night-market m2).
- **The breakdown's eyes** (S6, the writer's rule, new dreams only): a moment whose point is what the dreamer holds,
  with what they look at beyond it, is through their eyes. lighthouse-fresh m10 was told that way ("still holding it
  in both hands, just in front of me, but I was looking past it at the field") and broken down as seen from outside;
  no outside camera shows both the hands and the field, and the model added a second pair of hands. The frozen dream
  keeps its eyes, so m10 is not redrawn.

Drawn from `b82362d` for the owner to judge blind (\$2.40; \$9.90 spent today in all):

- **fal-redo**: six of the seven he judged not right, drawn again, each against the picture he failed.
- **pw-a / pw-b**: a blind test of `picture_words` (not on lab): five moments, each drawn with and without the step,
  the two prompts differing by exactly one line and the images and briefs identical. It drops "the unlabelled shapes
  under people become what they sit on" where nobody in the picture may be sat (43 of 127 frozen pictures; orchard m2's
  box), and edits an earlier picture keeping faces and clothes but not poses (snow-train-2 m3). It lands only if the
  owner's verdicts favour it.

## Next

1. The owner's verdicts on fal-redo and pw-b; `picture_words` lands or is dropped on them.
2. Mock-up shapes (Mac): animals, held small props at the hands and at their size, the tractor as parts, near-blank
   close and first-person mock-ups.
3. The place sketch pasted as the backdrop (its border and vignette), and states still in progress written as done.
