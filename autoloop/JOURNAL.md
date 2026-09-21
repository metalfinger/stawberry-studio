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

## Iteration 5 — 22 Sep, 03:50 IST — the frame invented a sculptor

**Credits** 298.1 → 293.1 (5 spent: the block, the channels, three takes of the angles). Hard stop 200.

**Where the story stands.** Nine of eleven cuts accepted and selected. The sculpturing chain is
three frames in: the block in close, the first meltwater channels, and the planes falling away with
a long form legible inside the ice. Two cuts left — the horse's head and the closing wide.

**A verb cast an actor nobody hired.** "Angles round away" came back with a pair of arms and hands
holding a chisel, carving a second mass of ice in her lap. Every declared fact in that frame was
present and correct: she was there, the block was there, the room was right, the style held. The
cause was one word in the cut's own `action` — "the sculpturing goes on rapidly" reads as something
a person does, and the world logic saying the melting carves itself was three paragraphs further
down the prompt and lost to the verb.

Nothing in the rubric could have caught it. Every question asks whether a declared thing is
present; not one asks whether anything *undeclared* is. So there is now a capped question that runs
the other way: name every object and every body part in the frame, strike off the ones the cut
casts, and answer on what is left. It scored 0.05 on that frame — two forearms, two hands, a chisel
and a second block of ice — and the take was rejected at 0.22. Rewriting the action without an
agent removed the sculptor entirely; the retake scores 0.82. Eight earlier frames were carried onto
the new question with `reanswer.py` and all eight answered it cleanly, which is the right result:
the check earns its keep on the one frame that needed it, not by finding faults everywhere.

**Chaining, and where it is allowed.** The sculpturing is one object transforming across five
frames, so each cut must continue the last — the only place in this harness where a generated image
is fed back in. Two things had to be true for that to be safe. First, the scene declares a deeper
`policy.reference_depth_cap`, because the default of two forbids chaining at all and here chaining
*is* the content; a scene that merely happens in order does not get that. Second, `base_from`:
which frame the visual continues need not be which frame the story continues. Chaining each cut
onto its predecessor deepens the lineage by one per cut and lets the form drift a step at a time,
so every frame after the first now continues *the frame that established the block* instead. Depth
is flat at four across the whole scene rather than climbing to six.

And a chained frame is now asked whether it actually continued: `continues:<cut>`, capped, weight
three. A sheet match cannot cover it, because the reference is a cut and not an asset.

**Measuring corrected me.** I was about to reject the channels frame for a block that had visibly
grown. Measured, it is 402 by 388 pixels against 404 by 372, in the same place within twenty
pixels. The drift was in my eye. The answer records the numbers so the next reader can check it
rather than trust it.

**Two bugs, both mine.** The autopilot read a take's status *before* running the duplicate check
that can add a reason to refuse it, so it decided a take was accepted and then crashed when `select`
disagreed. And `repair`'s `can_retry` still counted every take rather than the ones sharing the
latest prompt, so a cut whose story had been rewritten reported its budget as spent on a frame it
no longer describes.

**A shot size is a word to a director and nothing to a generator.** "Close" came back as a medium
three times, and two beats declared one size apart came back as near-identical pictures — the
duplicate check flagged the pair. The prompt builder now expands the declared framing into how much
of the frame the subject is to occupy, and the retake pushed in.

**Harness deltas.** The `undeclared` question, `continues`, `base_from`, scene-level depth caps,
framing expansion, the autopilot ordering fix, prompt-scoped `can_retry`. One new failure class —
the summoned agent. 161 tests, Ruff clean.

**Next.** The horse's head and the closing wide, which carries a `match_frame` back to the opening;
then the blind evaluator's report on an accepted frame.

## Iteration 5b — 22 Sep, 04:20 IST — the stranger, again, and on the same axis

A blind evaluator was run on "Standing naturally", which I had passed at 0.885. It had the image,
the question list and nothing else. It scored the frame **0.40**. The gap is 0.48, and it is almost
entirely one axis: I gave style 0.89, it gave 0.44.

**Its claims, checked before acting on them.** It reported 73,209 unique colours in the frame and
660 distinct 8-step tonal bins inside the ice block. Measured independently: 73,209 exactly, and 740
bins in my own crop of the block — against **287** in a same-sized crop of her skirt *in the same
frame*, and 193 to 244 in equivalent crops of approved frames and the anchor. The block carries
three times the tonal complexity of anything else in this production. It is airbrushed. The token
says "flat black ink, no gradients anywhere" and I had scored it 0.93.

Where it was too harsh I said so rather than deferring. It scored palette 0.28 on 25% of pixels
sitting beyond 40 RGB units from the nearest declared colour. Baselined: an approved frame is 27.0%
and the style anchor itself is 18.0%, against this frame's 33.9%. The paper tone is warmer than the
declared `#F2EFE6` in **every image in the production including the anchor** — measured `#F2E5CE`
and `#EFE3CF` — so that part is a bible number that was never achievable, not a fault in this frame.
Scored 0.65 with the baseline in the evidence.

**Two things it found that no question asks.** The ice block is drawn from a viewpoint about 150
pixels above the horizon the room establishes — its top facet is visible although it sits well above
eye level — so it reads as a separately rendered object pasted onto the figure. And a detached grey
tab hangs under the collar, connecting to nothing, which reads as an unerased remnant of the neck
the head substitution removed.

**My corrected record now agrees with it exactly: 0.40 against 0.40**, and the take is rejected. The
same thing happened in the earlier production, on the same axis, and that is the finding: I read a
frame as being in the style when it is *mostly* in the style, and I do not test the tokens that are
phrased as prohibitions. The transferable fix is in the rubric — a token containing "no", "never" or
"without" now carries an instruction to answer it by counting: crop the object most likely to break
it, crop a region that is printed correctly, and compare.

**A second scorer built, tested and deleted.** Tonal complexity per patch, compared *within* the
frame so that paper, ink and grain cancel — the flaw the palette attempt had. Hand-cropped onto the
block it is decisive at 740 against 200. On a blind grid it vanishes: the airbrushed frame scores
2.50 against an approved frame's 2.13, and the frame with *more* ice scores 1.99. A fixed patch
dilutes a localised object and finely hatched glassware is legitimately busy. Knowing where to crop
is the whole problem, and that is segmentation, which is a model. Recorded in HARNESS.md §4b beside
the first attempt; two independent failures for the same structural reason is a stronger result than
one.

**Next, and it is a production fix rather than a harness one.** The ice is airbrushed in all five
frames that contain it. The bible never says how ice is printed — only that it "reads as white paper
held inside black contour" in the lighting rules, which is a sentence the generator has ignored five
times. It needs a token of its own, the paper hex needs correcting to what this style actually
prints, and the five ice frames need regenerating. That stales every review in the project, so it
wants a whole iteration.

## Iteration 6 — 22 Sep, 05:10 IST — one sentence in the bible, measured

**Credits** 293.1 → 291.1 (2 spent, both on "She returns"). Hard stop 200.

**The fix was a sentence, and the effect is measurable.** The bible had six tokens about ink, edges,
gouges, grain and tone, and nothing at all about how this style prints something transparent. The
lighting rules mentioned ice in passing and the generator ignored it five times. Added as a token:
*ice and window glass are flat plates of the cold ink with white gouged in, never graded.*

Counted inside the block against a matched crop of her own skirt in the same frame:

| | block | cloth | ratio |
|---|---|---|---|
| Before the token | 592 | 253 | 2.34 |
| After the token | 156 | 238 | **0.66** |
| After the token, two facets | 264 | 189 | 1.40 |

The third row matters as much as the second. The frame with two flat facets in two tones counts
higher than the one with a single plate, and that is correct — two plates cost twice the tones and
are still flat. The measurement is a pointer to where to look, not a verdict, and the evidence now
says so in as many words.

**The paper hex was a number nothing ever met.** `#F2EFE6` is missed by every image in the
production including the style anchor, measured `#F2E5CE` and `#EFE3CF`. Corrected to `#F0E4CE`. A
palette question the production cannot pass is not a check, it is noise.

**The viewpoint question, first use.** The blind evaluator had found the ice block drawn from its
own eye level — a top surface visible on an object well above the horizon, so it read as composited.
Added as a capped question: find the horizon from two objects you trust, then check everything else
against it, especially whatever the frame had to invent. On its first real frame it scored 0.40 and
rejected the take. The remedy was not a prompt trick: `camera.height` was already in the vocabulary
and the prompt builder was throwing it away along with lens, movement and depth of field. Declaring
*chest height, below the block — its underside is the face we see and its top is never visible*
produced a block showing a front and a left side face and no top plane, and the question scored 0.90.

**A token that swept in too much.** As first written it said "transparent things — ice, glass,
water", which made every retort and test tube take the cold ink, contradicting the lighting rule and
every frame approved so far. Narrowed to the cold things, with the glassware exception put where the
rest of the ink placement lives. The lesson is small and general: a style token is a rule about
technique, and a rule that names a category rather than the things in it will collect things you did
not mean.

**What a bible change costs, paid in full.** Amending it staled every review and every evaluation in
the project — nine cuts and five sheets. The sheets carry forward unchanged; the cuts were
re-answered onto the new rubric with `reanswer.py`, which turned out to carry only the facts record
and leave the judge record stale, so four takes read as unevaluated however carefully their facts
had been re-answered. It carries both now.

**Still open.** "She returns" and "Standing naturally" collapsed into near-identical pictures — the
duplicate check flagged them and my own action score of 0.75 said the same thing: the walk does not
read as a walk. Four ice frames still need regenerating against the corrected bible.

**Harness deltas.** The transparency token, the corrected paper hex, the `viewpoint` question and
its failure class, camera fields reaching the prompt, `reanswer.py` carrying judge records. 161
tests, Ruff clean.

## Iteration 7 — 22 Sep, 06:05 IST — four frames reprinted, and a control that lied

**Credits** 291.1 → 287.1 (4 spent). Hard stop 200.

**Where the story stands.** Eight of eleven cuts current and accepted against the corrected bible.
Three left: the angles, the horse's head, and the closing wide.

**The walk that was not a walk.** "She returns" and "Standing naturally" had collapsed into the same
picture — the duplicate check flagged the pair and my own action score of 0.75 said the same thing
in different words. The cut declared *mid-stride* and the generator produced a stance, because
"mid-stride" names a thing instead of describing it. Replaced with what mid-stride looks like: the
rear boot lifted clear with its sole showing, the forward boot planted and already weighted, the
skirt swinging out behind the rear leg, the arms slightly out of phase. The frame came back
unmistakably in motion, and the pair no longer collapses.

**A control that lied, and the instruction that now guards against it.** The counting method from
last iteration gave the same ice block a ratio of 1.85 against her apron and 0.62 against her skirt.
The apron is nearly blank, and a blank area has few tones whatever the style does, so measured
against it anything looks graded. Sampling three controls across the frame's range settled it: the
block at 196 tones sits below the skirt at 318, the barrel at 305 and the bench at 222 — flatter
than most of the frame. The instruction now says to use two or three controls of comparable ink
density at equal crop size and read the spread, not a single number, and HARNESS.md carries the
numbers that made the point.

**Four frames reprinted against the corrected bible**, each measured rather than eyeballed:

| Frame | block tones | frame's correctly-printed range |
|---|---|---|
| She returns | 196 | 222 – 318 |
| Standing naturally | 382 | 244 – 341 |
| The block (close) | 203 | 222 – 350 |
| The first channels | 236 | 239 – 334 |

Three of the four are at or below the flattest correctly printed area in their own frame. The one
that sits above the range is the full-figure standing shot, where the block is small and its facet
edges make up a larger share of its area — worth watching rather than rejecting.

The meltwater is the clearest single result: two takes ago the drips were smooth gradients, and
they are now flat rivulets of the cold ink with gouged white edges, from the same token that fixed
the block.

**Harness deltas.** The counting instruction now requires several controls of comparable ink
density; HARNESS.md §4b records the apron-versus-skirt discrepancy that motivated it. 161 tests,
Ruff clean.

**Next.** The angles, the horse's head — the frame the whole dream is for — and the closing wide,
which carries a `match_frame` back to the opening.
