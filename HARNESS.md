# The harness: how to bring any story through, and what it cost us to learn

Status: written 21 September 2026 from one production carried end to end twice — first
badly, then under the harness. Every rule below is here because something went wrong
without it. Nothing here is specific to that story; where an example is needed it is
marked as an example.

This is the document to read before starting a new production, and the one to update
when a new failure class is found.

---

## 1. The thesis, in one line

**The engine records facts, the host does the creative reasoning, and nobody claims to
have seen something they have not looked at.**

Everything else follows. The engine never generates prose, never judges a picture, and
never approves anything. The host — a tool-capable assistant — writes the story, chooses
the references, writes the prompts, and looks at the results. The engine's whole job is
to make it impossible to skip a step quietly.

## 2. What a story declares

A production is scenes → shots → cuts, each inheriting from its parent, plus characters,
locations and props linked into the cuts that show them. Fields are dotted leaves
(`beat.purpose`, `camera.framing`) and any child can override its parent.

What every cut must say before anything can be generated:

| | |
|---|---|
| **who** | `visible_cast` — an explicit list, and an explicit empty list when nobody appears |
| **where** | `location_id`, or an explicit clear when the frame has no place |
| **what** | `required_props`, explicit empty list included |
| **what happens** | `action`, one decisive moment — a beat with two actions is two cuts |
| **why it exists** | `beat.purpose`, `beat.emotional_intent`, `beat.visual_point`, `beat.theme` |
| **how it is performed** | `performance.expression`, `.body_language`, `.gaze` |
| **how it is seen** | `camera.framing`, `.angle`, `.movement`, and `screen_direction` if the subject travels |
| **what is heard** | `sound.sfx`, `sound.music`; `sound.ambient` on the scene |
| **how it leaves** | `transition`, and `match_frame` if it must cut together with an earlier frame |

What the project declares once — **the style bible** — and what makes a harness a harness:

- `bible.tokens` — 4–6 concrete, re-quotable techniques. *"Halftone Ben-Day dots,
  cyan/magenta offset 2px"* is a token. *"Spider-Verse style"* is not.
- `bible.palette_hex`, `bible.lighting_rules`, `world_logic`, `negative_prompts`.

What every asset declares:

- `consistency_tokens` — 3–6 short verbatim phrases the renderer must echo every time,
  each at most six words, never the asset's own name, never a sheet directive.
- `locks` — the continuity attributes that must never drift. *(In the example
  production: the carrier's `worn_position` and the child's `presence`. Those two locks
  are the whole film.)*

**The rule underneath all of it:** anything that matters must be a field. Prose in notes
cannot be checked, cannot be quoted into a prompt, and cannot be asked about. Beats,
performance, sound and identity locks existed as prose in the first pass of the example
production and were invisible to every subsequent check.

## 3. What is checked, and when

### Before a credit is spent — five refusals

1. **Readiness.** Cast, location, props, style, action declared.
2. **Prompt binding.** The prompt must quote every lock of every asset in the frame,
   verbatim. *(Six of eight hand-written prompts were refused for this on first attempt.)*
3. **Reference fitness.** A previous take that failed its own evaluation cannot be used
   as a reference. This is the single check that stops one bad frame becoming twenty.
4. **Depth cap.** How many generations removed from the original sheets. Default 2.
   *(The first pass of the example production reached depth 23 — every cut built on the
   one before, all the way down.)*
5. **Budget.** Takes per cut, credits per take, unknown cost acknowledged explicitly.

### After the image arrives — four records

6. **Facts.** The engine turns the cut's own declarations into questions, one per atom:
   each cast member present, each identity token, hands and pose, each prop, the
   location, each entering continuity state, the action, the beat's visual point, each
   style token, the palette, the lighting rules, the exclusions. The evaluator answers
   each with a probability **and the crop it inspected**. The engine — never the
   evaluator — computes the score: grouped into identity / scope / state / action /
   style, headline is the **worst group**, and a missed locked fact, a failed action
   group or a failed style group caps the record.
7. **Judge.** Semantic consistency and perceptual quality, each the minimum of its
   sub-scores, overall = √(sc·pq). Problems as **tagged discrepancies** with an asset and
   a region — `identity_drift`, `prop_missing`, `state_mismatch`, `copy_paste` — never
   adjectives.
8. **Duplicate.** Perceptual hash against sibling cuts. A declared `match_frame` pair is
   expected to look alike and is exempt.
9. **Stranger.** A second evaluator in a fresh context, given only the image and the
   questions. See §5 — this is the one that earns its keep.

### The gate

A take cannot be **selected** as a cut's final frame or **reused as a reference** until
facts and judge clear the project's threshold. A review written by a script or an
assistant only counts where the facts record actually saw the asset.

### Across the edit — the sequence check

`sequence` reads the whole cut list: screen-direction reversals inside a scene without a
declared crossing, neighbouring cuts that would render the same picture, declared match
cuts whose framing does not match, runtime drift, one scene eating the film, four cuts in
a row at one framing, two cuts carrying the same visual point, coverage per scene.

### When it fails — repair

Failed atoms become instructions: drop the reference that fails the same fact, attach the
sheet, quote the lock, describe the posture explicitly, change the camera, the provider
refused the likeness so carry that identity as text. Bounded by the take budget.

## 4. The failure classes, and why each is general

Every one of these was found in a real production. None of them is about that story.

| Class | What it looks like | Why it recurs anywhere | What holds it |
|---|---|---|---|
| **Compounding drift** | Each cut built on the last; by the twentieth the character is someone else | Chaining is the obvious way to get continuity and the error is multiplicative — published as *Iterative Generative Drift*: visible at generation 2, severe at 4+ | Depth cap, lineage on every image, reference fitness |
| **Silent absence** | The thing the story is about is simply not in the frame, and the review says it is | Nothing asks "is it there?" — the prompt asked for it, so everyone assumes | Presence as a capped atom; a machine-written review only counts where the facts record saw it |
| **Anatomy** | Fused fingers, mitts without fingers, an arm that never emerges, a head the wrong way up | The commonest generative defect and the easiest to skim past at any size below full resolution | `pose` and `hands` as capped atoms, with an instruction to crop at maximum magnification |
| **Style drift** | Near-photoreal figures under a filter; the declared palette quietly abandoned | One vague question — "is this in the style?" — is answered generously by anyone who has seen the last twenty frames | One question per `bible.tokens` entry, plus palette, lighting rules and exclusions; the style group failing caps the record |
| **The degenerate solution** | Two different beats rendered as the same picture, scoring beautifully on consistency | Consistency and expressiveness trade off; a naive consistency metric rewards copying | Duplicate scoring against siblings, paired with identity, and `match_frame` to declare the deliberate case |
| **Declaration lag** | The picture is right and the graph is wrong — a state transition written on the wrong cut | Continuity is authored by hand and the story moves faster than the bookkeeping | Facts scored against `continuity.incoming`; a low score with a good picture points at the declaration |
| **The generous evaluator** | Scores drift upward across a session; the evaluator checks the defect it was told about and stops looking | Whoever writes the story cannot un-know it | The stranger (§5) |
| **Partial coverage** | Eight frames evaluated out of twenty-two, reported as "done" | Choosing your own sample is the easiest thing in the world | Coverage counted per take *and per question*; a partial answer sheet is not an evaluation |
| **Provider refusal** | A submission refused on content grounds, looking like a transport failure | Every provider has rules, and a likeness is the usual trigger | Definitive `provider_rejected` failure; `reference_mode: text` carries the identity as quoted locks instead |
| **The inherited defect** | A frame faithfully reproduces a fault that was in the sheet it was built from, and the per-frame rubric charges it to the frame | Every question is asked of one image, so a defect that was copied looks exactly like a defect that was invented; retrying the frame reproduces it | `matches_sheet` high *and* an identity detail failing routes the repair upstream as `inherited_defect`. Only what a sheet fixes — detail, wardrobe, features — routes; anatomy is regenerated per frame |
| **The under-magnified answer** | A capped anatomy question answered "yes, fingers separate" about a hand that is a thumbless mitten | "The highest magnification the image allows" is satisfied by any crop, and at four times a mitten still reads as a hand | The instruction names a number — crop each hand alone, enlarge at least 8× nearest-neighbour — and says outright that an uncountable hand is a no, not a probably. Feet are their own capped question, because "body, head and limbs" is answered from the torso up |
| **Palette conflict** | The story's own material vocabulary names a colour the style cannot print — "brass and riveted steel" in a four-ink woodblock — and the generator obeys the material field over the bible | Material words are true and are written by whoever knows the object; the palette is true and is written by whoever knows the print. Neither is wrong and nobody compares them | `palette_conflict` warns when a colour word in a content field is far from every declared swatch. The fix is usually a sentence, not a rewrite: *the material is depicted in the declared inks, never printed in its own colour* |
| **The second version** | A sheet draws a thing that already has its own sheet, from the description alone, and produces a different object — same words, different machine | A location contains props and a prompt describing one is easy to write; nothing connects the two sheets, and the cuts inherit whichever one they happened to reference | `sheet_unreferenced` refuses a prompt that names an asset holding a selected sheet without referencing it. After generation, `matches_sheet` asks, capped, whether it is the same object |

## 4b. One thing that cannot be automated, and the evidence

The palette question — *are the image's values confined to this palette* — looks like the one
part of a style contract a machine could settle exactly, and it is worth writing down that it
is not, because it will look tempting again.

Three measures were built and tested against a known pair: one frame whose brass fittings were
printed in a fifth ink and had been rejected by eye, and the corrected frame that replaced it.

| Measure | Rejected frame | Corrected frame | Separates? |
|---|---|---|---|
| Share of pixels far from every swatch, downsampled | 1.15% | 2.04% | No — inverted |
| Share of *saturated* pixels far in hue, full resolution | 3 px | 0 px | No |
| Largest colour cluster far from every swatch (16-way quantisation) | #4C4539 at distance 90 | #4C4539 at distance 90 | No — identical |

The reason is structural, and it holds for any print-styled image. The boundary between flat
ink and warm paper generates a wide continuum of intermediate tones which is *large in area* and
genuinely far from every declared swatch. A real fifth ink arrives on thin linework — clamps,
pipes, a collar — and is *tiny in area*. Every aggregate over the frame is dominated by the
first and blind to the second. Telling them apart means separating the drawn objects from the
paper they are printed on, which is a model, not arithmetic, and a model is the thing the engine
does not contain.

So the palette stays a capped question answered by an evaluator with eyes, and the instruction
attached to it — sample a light area, a mid tone, and every metal, fabric and liquid — is the
whole defence. The evidence for a palette answer should name the specific objects sampled, so a
later reader can check the answer rather than trust it.

## 5. The stranger, and why it is not optional

A single evaluator scoring its own work converges on the defects it already knows about.
It is not dishonest; it is looking where it has been told to look.

Three blind evaluators — fresh context, given only an image file and the question list,
with no story, no prompt, no notes, no scores and no conversation — disagreed with the
primary evaluator by 0.33–0.45 on three frames and found **two error classes nobody had
named**: malformed hands in every frame, and a style that did not meet the production's
own written contract in any frame, including all of the originals.

Neither could have been found by asking better questions, because nobody knew to ask.
The free-text note at the end of a stranger's answers — *"anything wrong that no question
asked about"* — is where a new failure class appears. That is why it exists and why the
answer goes into the record.

Rules:

- Run one on at least every third take, and on every take about to be reused as a reference.
- Give it the image and the questions. Nothing else. No scores, no story, no thread.
- Tell it to crop every named subject, to answer **every** question, and to add the note.
- A gap over 0.25 names the group it is about and stops the take. A second opinion below
  the project threshold stops the take on its own. The policy decides whether a *missing*
  stranger blocks; it never decides whether a *present* disagreement is heard.

## 6. Starting a new production

1. Create the project. Capture the source — the transcript, the brief, the pasted script —
   **verbatim**, before interpreting it. It is the only thing that outranks everything else.
2. Write the **bible** before the first review pass: tokens, palette, lighting rules,
   world logic, exclusions. Writing it later stales every review in the project, because
   every definition hash depends on it. Budget a re-review pass if it must change.
3. Break the story into scenes, shots and cuts. Fill the beat, performance, sound and
   camera fields as fields. Keep `story_order` separate from editorial position.
4. Derive assets with the decision tree in the playbook — ambient is not an asset,
   wardrobe merges into its character, a state is not a new character. Write
   `consistency_tokens` and `locks` on each.
5. Plan reference views from the coverage the cuts actually need, not a standard grid.
6. Set the policy: `autonomous`, `min_take_score`, `max_takes_per_cut`,
   `credit_ceiling_per_take`, `require_stranger`.
7. Generate the sheets. Evaluate them — a sheet that misses the style poisons every cut
   built on it, so sheets are held to the same style contract as frames.
8. Run the loop: `autopilot step` → answer its `evaluate` tasks and write its `prepare`
   recipes → `step` again, until the summary is all `accepted`.
9. Run `sequence` before calling it finished.

## 7. The rules that do not bend

- **Nobody claims to have seen what they have not looked at.** Evidence carries the crop.
- **A partial answer is not an answer.** Every question, every time.
- **The engine computes the score.** The evaluator supplies probabilities and regions.
- **Evaluations never approve.** They are records; a human sets status; policy decides
  what a record blocks.
- **A machine's confirmation is not a human's.** Reviews carry their author, and only a
  human confirmation counts where no evidence backs it.
- **Never auto-retry paid work.** A rejected take produces a proposal, not a resubmission.
- **Keep everything.** Rejected takes, superseded reviews, failed jobs, disagreements.
  The record of being wrong is how the next failure class gets found.

## 8. Open

- Subject-cropped identity similarity and cross-panel scene diversity as an optional
  local extra (no model belongs in the engine itself).
- Pairwise comparison between competing takes is defined and unused.
- The style finding in §5 means the example production's own bible has never actually
  been met; the fix is a style-anchor pass, not more frames.
