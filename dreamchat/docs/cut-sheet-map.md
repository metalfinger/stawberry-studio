# The cut sheet: what each cut needs and where it comes from today

A map of the code as of 26 Sep 2026 (lab/dream-chat at 68ecd85), for step S3 of HARNESS_PLAN.md.

`tree.ts` already holds most of what a cut needs, but only the panel reads it (`server.ts:145`). The prompt is still built from four other sources, each working things out again: the moment's copy on the item (`Item.frame`/`Item.fields`), the continuity plan (`CutPlan`), the sketch items, and the view text.

## 1. What a cut's prompt and references need

| Input | Worked out today | In tree.ts | In record.ts | Gap or duplicate |
|---|---|---|---|---|
| Who and what is in view | `continuity.seenIn` :329; `frames.inViewOf` :192; `session.recordOf` :2424; `storyboardState` :628; `around` :660 | `CutNode.at` / `elements` (presence :1179-1383, with `inPicture`) | `AtMoment.shows` :515 | **Computed in 6 places** |
| How each looks now | `frames` `lookOf` :314 (with the vague-word, colour-shade, pose and group-member clean-ups); changes from `plan.own`/`states` :370, :385, :426 | `Element.look` :820, `ElementAt.stage`/`parts` :1222-1275, `lookAt()` :2597 | `RecElement.base`, `AtMoment.looks` :1706 | **3 copies**; record.ts :4-8 says so itself |
| What it is called now | `continuity.calledIn` :219, `now()` :742; `session` `called` :1948; `frames` `nameOf` :209 | `ElementAt.called` | `called`, `looks.becomes` | **4 copies** |
| What changes here vs. what carries | `continuity` :366-374, :520-534; `strawberry.cutRecord` :55 | ledger stages :1035-1115, `CutNode.differs` | `own`/`carried`, `inForce` :1553 | **3 copies**; the record is meant to win |
| Who holds what | `rawPlanBy` :306; `previs.thingWords` :1093 | `ElementAt.holder` :1348 | `AtMoment.held` :521, `heldBoth` :1637 | **Gap:** framePrompt never says it. Only the view text does, so edit-based and no-plan cuts lose it |
| Place and its state | `frames` location lines :400-422 | `place`, place morph :1928, place `parts` | kind `place` | OK |
| Light and time | the place sketch's light words; `styleBlock` `Light:` (sheets :425); a light-only reference is dropped :511 | `lightSource` :1675, `lightGrade` :1597, `time` | – | **Gap:** `time` is always `null` (:1717). The breakdown's own colours, light and texture never reach a prompt, though `FIELDS` says the prompt reads them (:224-226) |
| Camera position, height, lens | `continuity` :790-850 via `dreamerShot` :899 / `outsideShot` :1184 | `camera`, `lens`, `background`, per-cut override :1934 | – | Seen-through-the-dreamer's-eyes cameras carry no lens (:966), so tree falls back to a default 24mm |
| Framing and size | `FRAMING` :37, `SHAPE_WORDS` :84; `previs.framing()` :1139 | `size`, `framing` | – | Size is said twice: in the header and again in the view text |
| Shot role | tree guesses it with a regex on the view text :1798-1805 | `role` (pov / ots / insert, shot level only) | – | **Duplicate:** `outsideShot` already knows apart / pair / facing / from behind (:1256, :1435) but only returns words |
| Relation to the previous cut | `continuity.relation()` :401 (a closure, not exported); `evals/paired-arms.ts relationTo` :121 copies it | `refs[].relation` (story links, not "previous"), `camera_moved` flag :1961, `SAME_CAMERA` :53 | – | **Gap:** no per-cut "move" field. Two rules decide "same setup" |
| Scene's line and left-to-right order | `continuity` staging :709 (order of first naming), `across` :843; `outsideShot` :1487; frames :611 | `line` :1686, `side` :1806, `screen` :1821 | – | **3 copies.** Nothing reads tree's `side` |
| Through the dreamer's eyes | frames :559-573, the "you" line :644; `seat` relation :501 | `eyes` (shot level, locked) | `eyes` | OK |
| Action, visual point, dream, feeling | frames reads `Item.fields` (`buildFrames` :137), the gone-words clean-up (`withoutGone`) :62 | cut fields :1912 | `words` | **Two copies of the words**, kept in step by `keepWords` (session :2253) |
| The dream's jump | frames :529-538 | only `Break.said` and the sequence's `opens` | `shift` | No per-cut jump text |
| Which images, and what to take from each | `continuity` refs and their `carries` text :417-707; `frames` attaching images :250-553; `MAX_IMAGES` :480 | `refs` (no `carries`, `turned`, media or approval), `Stage.ghost`/`drawn`, `LedgerRow.views` | – | **Gap:** the mock-up is attached whenever it exists and there is no edit base (:301); nothing decides. `gate.checkReferences` re-reads "Image N" out of the prompt text :221 |
| Style | `styleBlock` sheets :387, `shadesOf` :338 | `style`, `medium`, `oneColour` | – | OK |
| Writing in the picture | `writingIn` :103 | – | – | Missing from both |
| Group, animal | `groupMembers` :492, `isAnimal` :521 | `Element.group`, no animal category | kinds `animal` / `group` | Tree lacks animal |
| Can't be staged (flying, water, weather, a turning) | – | – | `UNSTAGED` :1696, `stageable` :1737 | Only in record |
| Repairs and strays | `repairFor` :622, strays :266 | – | – | These belong to a take, not the sheet; keep them as a separate input |

## 2. What tree.ts needs to become the spine

**Missing fields:**
- Per cut: jump text, writing, stageable (and why), move, holds, element kind (animal or group), and each element's image (sketch or ghost media, approved or not).
- `refs` need `carries`, `turned` and media.
- `previs` needs to be settable per cut; today only the shot sets it (`FIELDS` :259), but a moved camera has its own mock-up.
- `time` needs a real value.
- `role` needs to be per cut.

**Tags today:** `CutNode.tags` is just the categories of what is present (:2051). It doesn't route well:
- `camera` and `light` are on every cut.
- `held_prop` means held somewhere in the dream, not in this cut.
- `transformation` includes carried changes.

| Tag | Exists? | Source |
|---|---|---|
| role: pov, ots, insert | yes, per shot | tree :1798 |
| role: single, two-shot, group, wide, close-up | no | have `outsideShot` return its setup kind, plus size and the number of cast in view |
| move: same setup, same side, other side, other place, jump, seat | no (inside continuity only) | export `relation()` |
| move: reverse, moved | partly | tree `side` = reverse, `camera_moved` flag |
| change here / carried / turned into something | partly | record `own` / `carried` / `becomes` |
| held thing | per element only | `ElementAt.holder`, record `held` |
| crowd, vehicle, seat, steps | yes | categories |
| animal, group | record only | record `kind` |
| flight, water, weather, turning, jump | record only | `stageable` / `why` |
| establishing (first time a place or side is shown) | no | continuity `sheetLayout` :516, "never drawn" :576 |
| line applies | no | two cast in view and the scene has a line |
| dreamlike, writing | field / no | `dreamlike`, `writingIn` |

## 3. The per-cut sheet and `assembleCut`

```ts
type CutTags = {
  role: 'pov'|'ots'|'insert'|'single'|'two_shot'|'group'|'wide'|'close_up';
  move: 'first'|'same_setup'|'same_side'|'other_side'|'reverse'|'other_place'|'jump'|'seat';
  pov: boolean; establishing: boolean; line: boolean;
  change: 'none'|'here'|'carried'|'both'; turned: boolean; held: boolean;
  crowd: boolean; group: boolean; animal: boolean; vehicle: boolean;
  unstaged: null|'flight'|'water'|'weather'|'transformation'|'jump';
  dreamlike: boolean; writing: boolean; planned: boolean;
};
type InView = {
  id: string; called: string; kind: 'person'|'animal'|'group'|'crowd'|'place'|'thing';
  present: Presence; inPicture: boolean|null;
  look: Field<string>[]; becomes?: string; parts: Record<string, Field<string>>; changedHere: string[];
  holder?: string; holds: string[]; on?: { how: 'in'|'on'; id: string }; count?: number; memberOf?: string;
  image: { kind: 'sketch'|'ghost'; id: string; mediaId?: string; approved: boolean } | null; // stage in force → its ghost, else the sketch
};
type CutSheet = {
  id: string; order: number; hash: string; scene: string; shot: string; prev: string|null;
  story: { action: string; visualPoint?: string; dreamlike?: string; feeling?: string; shift?: string; writing: string[] };
  place: { id: string; called: string; indoors: boolean|null; front?: string; faces?: string; light?: string; time?: string };
  camera: { eyes: 'dreamer'|'outside'; size: 'close'|'medium'|'wide'; eye: Eye|null; lens: number;
            screen: string[]; side: Side|null; view: string|null; brief: string|null; framingIssues: string[] };
  inView: InView[];
  earlier: { cut: string; relation: Relation; mediaId?: string; approved: boolean; who: string[]; turned?: boolean; strays: string[] }[];
  previs: { mediaId?: string } | null;
  style: { ref: StyleRef; medium: string; oneColour: boolean; told: string[] };
  tags: CutTags; checks: string[]; flags: string[]; gaps: string[];
};
type Ref = { image: string; role: 'edit'|'layout'|'identity'|'location'|'prop'|'change'|'view'|'composition';
             source: string; instruction: string };
function chooseRefs(s: CutSheet): Ref[];
function assembleCut(s: CutSheet, refs = chooseRefs(s)):
  { prompt: string; references: Ref[]; lines: { id: string; text: string; fields: string[] }[] };
```

`assembleCut` builds each of today's roughly 17 blocks from named sheet fields. The regex clean-ups move into the sheet: gone words, pose, vague words, colour shades and the "you" line are done once, when the sheet is built.

The returned `lines` let the gate's line-by-line search point at a field. Today session.ts matches line text instead: `startsWith('The shot')` at :2033 and `'around: "What the camera sees'` at :2046 and :2065.

**How `chooseRefs` picks image 1, by tag:**
- **Edit the previous picture:** same setup, the same people, and fewer than 2 edits in a row (continuity :437, :819).
- **Mock-up (previs):** there is a planned camera, the moment can be staged, the role is two-shot, group, wide or over-the-shoulder, and the move is same side or other side. Not for pov, a jump, another place, or a close-up of something held.
  - In the 20 moments of the paired three-way test (`evals/paired-verdicts.json`), the mock-up was the only right version in the 3 multi-person moments (`snow-train-2-m6`, `night-market-m2`, `snow-train-2-m5`). It was right in 0 of 3 seen through the dreamer's eyes, 0 of 2 in another place, and 0 of 1 jump. It was also right in the one inside wide shot tested (`library-1-m4`); a second one (`library-1-m5`) was wrong.
  - That is a small sample. Treat this as the first routing rule to measure, not a proven one.
- **Nothing:** in every other case.

**Then each element in view:**
- Take the ghost for its stage in force if one is drawn; otherwise its sketch. The tree ledger already links stage to ghost to drawn picture.
- Something that has turned into something else gets only its ghost (today's frames :370-380).
- A place gets its sketch, with the "where things stand" instruction chosen by what image 1 is and whether the sketch shows this side. Add a view ghost (`LedgerRow.views`) when the camera faces a side never drawn.
- Earlier cuts come in only for someone with no sketch, a jump's composition, or a seat with no view. Never for light alone. Cap at 12.

**Jev's two layers:**
- **Always asked:** contradicts, clear, and what to take from each image (when there are images).
- **Routed by tags:**
  - "drawn twice": groups, crowds, or someone with both a sketch and a ghost.
  - held: "in their hands and nowhere else".
  - pov: "no viewer's body".
  - line: "left to right as listed".
  - turned: "nothing of the old self".
  - jump: "composition carried, place new".
- `continuity.criteria()` (:883-973) is already a check list routed by relation, so it is the prototype for this layer.

**Film-making rules for every dream:** a pure `rules.ts` over consecutive sheets, turning out flags and a few prompt lines:
- don't cross the line (uses tree `side`),
- a cut to the same subject must move the camera or change size (`SAME_CAMERA`),
- establish a new place,
- keep screen direction,
- at most 2 edits in a row.

## 4. Safe order, behind `DREAMCHAT_CUT_SHEET=off|shadow|on`

1. **Break an import loop.** Move `hashOf` and `slug` out of tree.ts into lib.ts. record.ts imports them from tree.ts (:14), so tree.ts can't read the record until they move.
2. **Shadow mode.** Add a pure `cutSheet(tree, record, items, frames, cut)`. In `startFrame`, build the sheet, assemble it, and log the difference against framePrompt's prompt and references, following the `recordMode` / `shadowRecord` pattern (record.ts :1931, session.ts :496). Nothing is sent.
3. **Make the record the one source for looks.** Feed tree's stages, look in force, holds and stageable from record.ts. That replaces tree :1031-1115 and :1222-1275.
4. **Export `relation()`** from continuity.ts and add the move tag. Have `outsideShot` return its setup kind and drop the role regex.
5. **Port `assembleCut` word for word first.** Golden tests: the same text as framePrompt on the fixtures (meads, theater, ice-head) and on the paired set. Your rule is that wording only changes through gate-measured tests, so change nothing in the port.
6. **Turn it on for prompts and references, keeping today's image choice.** Then switch `chooseRefs` on under a second flag and measure it on the paired set with the picture judge (whose best-of-three pick was right in 16 of 20).
7. **Route the gate by tags in shadow,** comparing against the fixed questions, then turn it on.

**What it lets you delete:**
- **frames.ts:** `framePrompt` :226-655 and `inViewOf` :192. The look-cutting helpers in `ghostPrompt` (:657-692, :801-822), which `record.lookBefore` (:1804) already does.
- **session.ts:**
  - `called` :1948
  - `around` :649
  - `plannedInputs` :1890
  - the cast building in `recordOf` :2416-2446
  - re-running `planContinuity(...).issues` on every gate call :2212
  - the line-text matching at :2033, :2046, :2065
- **continuity.ts:** staging :709-726, `across`/`camera` :843-848, `now()` :742; `criteria()` gets generated from tags.
- **tree.ts:** the role regex :1798-1805; the stages and look-in-force code once the record feeds it.
- **record.ts:** `describeAt` :1847.
- **gate.ts:** reading "Image N" back out of the prompt :221. The limit of 12 images defined twice (frames :480 and gate :51).
- **evals/paired-arms.ts:** `relationTo` :121.
