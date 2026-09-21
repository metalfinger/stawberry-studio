# Overnight run journal

Newest last. One entry per loop iteration: what was attempted, what the harness did, what
it got wrong, and what changed as a result.

## Iteration 0 — setup (21 Sep, evening)

State file written, three stories chosen to stress axes Nine O'Clock did not: a flat
woodblock print with one spot colour, a warm colour two-hander built around
repetition-with-variation, and a technical graphite style with legible text in frame.
Budget ceiling 120 credits against a 317 balance, hard stop at 200.

Nothing generated yet.

## Iteration 2 — 22 Sep, 00:20 IST — "The ice head": the anchor, four sheets, and a fifth ink

**Credits** 317 → 311.1 (6 spent: 1 anchor, 4 sheets, 1 sheet redone). Hard stop 200.

**What ran.** Evaluated the style anchor against the project rubric enabled last iteration —
0.945 min group, uncapped, and it is what an anchor should be: swatches, a gouge-tone band, a
carved-highlight panel, a grain panel, and nothing a viewer could mistake for a frame of the
film. Selected it as the project's reference. Generated four asset sheets against it — the
young woman, the dreamer, the laboratory, the autoclave — and evaluated all four at full
resolution, cropping hands and faces rather than judging at sheet size.

Three passed cleanly (0.91 / 0.92 / 0.92 min group). The woman's sheet holds one face across
front, three-quarter, profile and back; her hands are correct at 4× in every view. The
dreamer's sheet never shows his face once, which is the asset's whole point. The autoclave's
sheet draws brass in black ink.

**The laboratory failed, twice, and both failures were new.**

*Failure one — a fifth ink.* Every brass fitting on the bench was printed in warm gold-ochre.
The project's palette declares four inks and its negative prompts say "colour outside the
declared palette" in as many words, so `palette` scored 0.15 and `excluded` 0.2, capping the
record at 0.40. The cause was not the generator being careless: the prop's own `materials`
field says *"brass and riveted steel"*, which is true of an 1898 autoclave and is also, to a
model, an instruction to print brass. **The story's material vocabulary and the story's palette
contradicted each other and nothing in the harness compared them.** In a realistic style this
never surfaces. In any restricted palette — which is all three of these dreams — it is
guaranteed. → new check `palette_conflict`: a colour word in a content field that is far from
every declared swatch is warned about, naming both sides, because usually the fix is one
sentence in the prompt (*the material is depicted in the declared inks, never printed in its
own colour*) rather than a rewrite of either field. It fires on the real case and stays silent
on the woman, whose wardrobe says "dark dress".

*Failure two — a second version.* The machine in the laboratory was not the autoclave. It was a
wheel-clamped vertical vessel; the prop sheet has a horizontal cylinder with a hinged door and
eight wing bolts. Both sheets satisfied every one of their own questions. Nothing asked whether
they were the same object, and nothing had required the location prompt to look at the prop's
sheet — I generated all four in parallel. → two checks: `sheet_unreferenced` refuses, before
generation, a prompt that names an asset holding a selected sheet without referencing it
(exempting `reference_mode: text`, which is a declared choice, not an omission — the existing
provider-refusal test caught that immediately); and `matches_sheet:<asset>`, a capped question
added to `facts` whenever a media's recipe referenced another asset's sheet: *is this the same
object with the same construction, not a second version of it?*

Also: asset sheets were never asked `lighting_rules` or `excluded` — only cuts and the anchor
were. A sheet is inherited by every frame that references it, so it has at least as much to
answer for. Added.

**The redo.** Regenerated the laboratory carrying the anchor *and* the autoclave sheet, with the
ink rule stated explicitly. 0.93 min group: no fifth ink anywhere, blue confined to the window
glass, floor clean and unlit, and `matches_sheet` at 0.85 — same cylinder, same hinged door,
same stand, two gauges where the sheet has one gauge and one stopcock. Approved and selected.

**Story state.** Filled `performance.body_language` on the three ice-block close-ups (the
generalised performance warning from iteration 1 earned its keep immediately: a block of ice has
no expression, but her shoulders are doing something). All cut warnings now clear. 5 of 11 cuts
ready to prepare; the remaining 6 are waiting on `continuity_take`, which is the chain
unblocking in story order, exactly as designed.

**Harness deltas.** `palette_conflict`, `sheet_unreferenced`, `matches_sheet`, sheet-level
`lighting_rules`/`excluded`. Two new failure classes in HARNESS.md: *Palette conflict* and
*The second version*. 158 tests, Ruff clean.

**Next.** Prepare and evaluate the first ready cuts of "The ice head".

## Iteration 3 — 22 Sep, 01:30 IST — eleven frames, and a stranger that was right

**Credits** 311.1 → ~303 (8 spent: 5 cuts, 3 retries). Hard stop 200.

**What ran.** Built `autoloop/cuts.py`: a cut's prompt and its ordered references derived entirely
from the graph — framing, action, performance, resolved incoming states, each asset's identity and
verbatim locks, the bible tokens, palette, lighting rules, world logic and exclusions. Nothing is
hand-written, so a prompt cannot drift from the story it belongs to and `recipe_gaps` has nothing
to find. Generated the five ready cuts, evaluated every one at full resolution, rejected three,
fixed the causes in the graph, regenerated, and re-evaluated.

**Gate results.** First pass: 2 of 5 passed. After repair: 4 of 5 pass on the corrected scoring
below. The three rejections were each a different kind of wrong, and each fix was a data change
rather than a prompt tweak:
- *The laboratory* — the cold ink lay across the tiled floor as cast daylight. The cut's own
  `action` had asked for "daylight from the tall windows falls across the bench", which the bible
  forbids in as many words. Rewrote the action to describe the room. Retry 0.93.
- *She returns* — the block of ice came out as a soft head-shaped mass with rounded contours: it
  took the outline of a head instead of replacing it. Rewrote `head_state` to say what a block is
  ("wider than it is tall, flat facets, hard straight edges, sitting square on her collar, no
  features"). Retry 0.86, and the new wording is inherited by every later cut in the chain.
- *Talking by the autoclave* — the room was rearranged, twice. The sheet shows the space along one
  axis only and this cut shoots it across, so there is no reference for that angle. The workflow
  had already said so (`plan_asset_views`) and I skipped it. Next iteration generates the view.

**Four harness changes.**
- *The unseeable declaration.* At the far door she is a few marks wide: her hands, her collar and
  her locked "quiet hands" are genuinely not in the image rather than wrong. Guessing either way is
  worse than saying so, so `Evidence.not_visible` is a real answer — excluded from the score,
  counted in coverage, and flagged when more than half a frame's declared facts are out of shot,
  because that means the declarations are on a cut that cannot show them.
- *A placeholder is not a declaration.* Two cuts carried `performance.expression: "none available"`,
  which reached both the prompt and the rubric as if it were content. The engine already has a word
  for an absent thing and it is `clear`. Placeholders are now refused outright, with the fix named.
- *Style references do not deepen lineage.* Fixing the laboratory sheet by building it on the prop
  sheet pushed every cut to depth 3 against a cap of 2. But the drift result is about feeding a
  subject back as its own reference, and an anchor carries no subject — that is what it is asked,
  capped, at evaluation. `style` references now contribute no depth, which puts the cuts at exactly
  2 and keeps the cap pointed at the thing it was built for.
- *Scope outranks prose.* `sheet_unreferenced` fired on a cut whose action says "she turns away from
  the dreamer" while `visible_cast` says he is not in frame. For a cut the scope is the declaration;
  the check now applies only to sheets, which have no scope and are where it earns its keep.

**The blind evaluator, which was right and I was not.** Ran a sub-agent on "She excuses herself" —
image only, fresh context. I had passed it at 0.92. It could not read the question file (I gave the
wrong path) so it inspected the frame unprompted at 8× to 16×, and found:
- both hands are **thumbless mittens** — one crease standing in for all fingers. I had recorded
  "five readable fingers on each, no fusion". I cropped and checked at 8×: it is right and I was wrong.
- the apron back has grown **two wide knee-length straps** the character sheet does not have.
- the **right boot** is two merged blobs with no toe, heel or welt. Nothing had looked at feet.
- two wing bolts on the autoclave flange are knots and one has detached from the ring.
- and, separately, that the non-convergent floor grid and the disconnected condenser glassware are
  **inherited verbatim from the laboratory sheet** — it measured the seam positions and found them
  identical to within a pixel — so they should be fixed upstream, not charged to this frame.

Re-scored the take honestly: 0.40, capped, rejected. Two changes followed. `hands` now names a
number — crop each hand alone, enlarge at least 8× nearest-neighbour, and an uncountable hand is a
no rather than a probably — and `feet` is its own capped question. And `inherited_defect`: when a
frame matches its sheet closely and still fails a detail the sheet fixes, the repair is routed to
the sheet, because retrying the frame would only copy it again.

**One negative result, recorded rather than shipped.** Built a deterministic palette scorer to make
the style contract machine-checkable, and tested it against the known pair — the frame with a fifth
ink in its brass fittings, and its corrected replacement. Three measures, none separated them; the
rejected frame scored *better* than the approved one. The reason is structural and is now in
HARNESS.md §4b: the ink-to-paper boundary produces a wide band of intermediate tones that is large
in area and far from every swatch, while a real fifth ink arrives on thin linework and is tiny in
area. Every aggregate over the frame is dominated by the first and blind to the second. Deleted the
scorer; shipping it would have given a false all-clear on exactly the case that motivated it.

**Harness deltas.** `not_visible`, placeholder refusal, style-role depth, scope-over-prose,
capped `lighting_rules`, `feet`, 8× hands instruction, `inherited_defect`. Two new failure classes
plus the recorded negative result. 161 tests, Ruff clean.

**Next.** Generate the laboratory's cross-room reference view, retry "Talking by the autoclave",
then re-cut "She excuses herself" with the hands and apron named — and check whether the apron
straps are the sheet's fault or the frame's.

## Iteration 4 — 22 Sep, 02:40 IST — six of eleven, and the budget learns the difference

**Credits** 303.1 → 298.1 (5 spent: a location view, three repairs, one recut). Hard stop 200.

**Where the story stands.** Six cuts accepted and selected: the empty laboratory, the two-shot by
the autoclave, her walking away, the far door, her return with the block, and her standing before
him. The sequence review now reports one finding — the sculpturing scene is 40% of the runtime,
which is a real editorial note and not a defect — and the `coverage_repeats` complaint from the
first iteration is gone.

**The flipped room was a missing reference, not a stubborn generator.** The two-shot came back with
the laboratory rearranged, twice. The sheet shows the room along one axis; the cut is staged across
it, so nothing held the walls. The workflow had been saying so since the sheets landed
(`plan_asset_views`) and I had skipped it. Declared the requirement, generated the across-the-room
view — window wall filling the frame, bench behind camera, end door where the two walls meet — and
added `location_view` to the prompt builder: a cut names the view it is staged on and gets that
media as its location reference instead of the primary sheet. The retry holds the geography.

**A take budget should count blind retries, not repairs.** `Talking` had used both its takes and the
gate refused a third — but the cause had been found and fixed, and a generation with a reference
that did not exist before is different work. First attempt compared the whole generation context,
which refunded the budget every time any asset in the project moved: too loose. The right signal is
the prompt. `takes_used` now counts takes made from the *same* prompt, so re-running an identical
ask is refused and a repair that changed what the frame asks for starts its own count. The existing
test had encoded the old rule and now documents the distinction.

**The rubric moves, and records do not.** This harness adds questions as it learns what nobody
asked, which quietly leaves earlier frames graded against a weaker rubric while still reading as
complete. `take_status` now says so — "answered against an older rubric: 32 questions then, 34 now"
— and `autoloop/reanswer.py` carries a record forward, keeping the answers that still apply verbatim
and asking only for the ones that did not exist yet. Four records were carried onto the feet
question that way, one of them a take that had already been accepted without it.

**The detail that is not there to have.** Three frames in a row failed the hands question, and
cropping at 8x and 9x showed why: at thirty-five pixels a woodcut hand *is* a paddle with a thumb.
The question was written for a frame where the subject fills it and was being asked of the same
subject at a tenth the size. The instruction now says to measure first — under about sixty pixels a
hand cannot carry five fingers in any drawn idiom, so the answer is `not_visible` with the size
stated, and the same for a shoe under forty. That is not a softening: in the one frame where the
hands are ninety pixels across, they were counted and scored.

**A bug I had just introduced.** `evaluated` still required `answered >= asked` and ignored
`not_visible`, so every frame with an unseeable fact was asked to evaluate something it had already
evaluated, forever. Four cuts sat in that loop before it showed. Fixed, and the autopilot now asks
its evaluation questions media-scoped, so the sheet-match questions — which only exist for a
specific image — are in the task it hands over.

**Harness deltas.** `location_view` in the prompt builder, prompt-scoped take budget, rubric-drift
reporting, `reanswer.py`, scale-aware anatomy questions, the `evaluated` fix, media-scoped autopilot
tasks. One new failure class. 161 tests, Ruff clean.

**Next.** The sculpturing chain — the block, the first channels, the angles, the horse's head — and
a blind evaluator on one of the six accepted frames, since a pass is where a generous evaluator hides.
