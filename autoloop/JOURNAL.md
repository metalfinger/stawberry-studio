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
