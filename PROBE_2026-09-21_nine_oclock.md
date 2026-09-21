# Probe: Nine O'Clock, 21 September 2026

What the consistency layers actually did on the one real production in the store, read
off the engine after the depth, evaluation and candidate work landed. Run with
`venv/bin/python -m scripts.probe_report --home .strawberry-probe 045f766b-… --prepare fake`
on an isolated import of the production; nothing here touched the live workspace.

## Finding 1 — the whole film is one unbroken generation chain

Every cut from the second onward used the previous cut's selected take as its `base`,
across all five scenes and eleven shots. Depth by story order: 2, 3, 4, … 23. The final
frame, "Collapse", is **generation depth 23**. The identity, location and prop sheets it
also references are depth 1 (they were generated from a depth-0 style image), so the
sheets did their job — the base chain simply never reset.

| Cut | depth | references (role: depth) |
| --- | --- | --- |
| The road before Abhishek | 2 | location:1, style:0 |
| Abhishek enters the frame | 3 | base:2, identity:1, identity:1, prop:1 |
| Running against traffic | 4 | base:3, prop:1 |
| The quiet passenger | 5 | base:4 |
| No sound from the child | 6 | base:5 |
| … | … | base:n-1 plus depth-1 sheets |
| Collapse | 23 | base:22, location:1, identity:1 |

With the default `policy.reference_depth_cap` of 2, `prepare` would now warn on twenty
of the twenty-two cuts. The historical run helper chained unconditionally; the old
runtime's chaining decision (`cut_planner._should_chain_prev_cut`) would have stopped
chaining at every shot boundary — eleven times — and the modulo rule would have reset
five more. Whether that would have looked *better* is exactly the experiment below; what
is settled is that the production never had the information to decide.

## Finding 2 — five near-duplicate frames, two of them a genuine copy-paste

`evaluate-local` (perceptual hashes against siblings and references) flags five takes at
or above 0.92 similarity:

- "The road before Abhishek" ↔ "Abhishek enters the frame": 0.97 — the same plate with a
  figure added. Expected for an edit-based beat; not a defect.
- "Running against traffic": 0.95 against its base — the run barely changed the frame.
- **"Crossing the line" ↔ "After the doorway": 0.98** — two different beats ("the toddler
  and carrier vanish", "he is in school uniform") rendered as nearly the same image. This
  is the Story2Board collapse: consistent because it copied.

The 0.92 threshold is tuned for stills, not edit chains; a base-conditioned take *should*
share most of its pixels with its base. The signal to act on is a high score against a
**sibling in a different beat**, not against the base. The scorer reports both; the
playbook should say which one matters.

## Finding 3 — the story was never written down as fields

All 22 cuts warn `beat_missing` and `sound_missing`; 20 warn `performance_missing` (the
two without visible cast do not). The beats exist — in `DREAM_SHOT_LIST.md` and in cut
notes — but nothing in the engine could read them, so nothing could check them. Every
selected reference also warns `reference_unevaluated`, as expected before any host has
run the evaluate pass.

## What was prepared, not run

On "An auto crosses the frame" (the cut with the most references, six), the probe
prepared — unapproved, fake provider, as a rehearsal of the mechanism — ten recipes:
reference count 2/3/4/5 and six role-order permutations of the first four references.
Tokens-verbatim vs paraphrased was skipped because the project has no `bible.tokens`;
shallow-vs-deep was skipped because every non-base reference is depth 1. To run the real
experiment: write the bible on the probe project, re-run with `--prepare higgsfield`,
and approve the set with a cost ceiling.

## What this changes

1. The depth cap and the `candidates` chaining decision should be the default path for
   any new production; the old helper's "always base on the previous cut" must not be
   reused (START_HERE already says so).
2. The duplicate scorer's discrepancy should distinguish "same as base" from "same as a
   sibling beat"; only the second is a `copy_paste` tag.
3. Before evaluating Nine O'Clock further, write `bible.*`, `beat.*`, `performance.*` and
   `sound.*` on the probe copy — it stales every review there, which is the point of
   doing it on the copy.
4. The offline ViStoryBench export (22 shots, 2 characters, `story.json`) is at
   `scratchpad/vistory-export`; its CIDS will not read a charcoal-collage Abhishek, and
   that result is worth having in writing.

## Second pass — bible, beats and the host evaluate run (same day)

On the probe copy: `scripts/apply_fields.py` wrote the style bible, world logic and
negatives on the project; ambient sound, mood and light source on each scene; identity
locks on every asset; and `beat.*`, `performance.*`, `sound.*` and `transition` on all 22
cuts (`scripts/nine_oclock_fields.json`, authored from `DREAM_SHOT_LIST.md` and the
treatment). That staled all 34 approved reviews, which were carried forward by the same
script with a decision text saying so — a metadata-only re-review, not a fresh look.
Afterwards: project ready, no field warnings; only `reference_unevaluated` remained.

Worth knowing: the original host *had* structured the story — `emotion.beat`,
`camera.distance`, `lighting.intent`, `composition`, `soundscape`, `identity.preserve`,
`wardrobe.initial` — under its own names. The vocabulary was not missing; it was
unshared. (`identity.*` and `wardrobe.*` as nested leaves also collide with the viewer's
`identity` / `wardrobe` fields; the engine allows it, the editor cannot show it.)

Then the host (Claude, this session) looked at eight frames and the identity sheet and
answered the engine's `facts` questions, and wrote a VIEScore-style judge record for each.

| Cut | facts GM | judge SC / PQ / overall | what the eye found |
| --- | --- | --- | --- |
| The road before Abhishek | 0.90 | 0.90 / 0.90 / 0.90 | clean opener |
| Running against traffic | 0.69 | **0.45** / 0.80 / 0.60 | he runs **left**, the auto also faces left: the counterflow — the poster idea — is absent; trousers patterned |
| An auto crosses the frame | 0.85 | 0.75 / 0.75 / 0.75 | occlusion works; auto rendered in a coarser paper pass |
| Exactly nine | 0.93 | 0.95 / 0.90 / 0.93 | 9:00, second hand at 12; best style match |
| Before the doorway | 0.66 | **0.40** / 0.85 / 0.58 | rear view; **child carried on his back**, not the locked chest position; nothing here can be match-cut from the front |
| Crossing the line | 0.82 | 0.65 / 0.85 / 0.74 | profile; matches cut 18, not cut 15 |
| After the doorway | **0.19** | 0.70 / 0.85 / 0.77 | the turn lands — same geometry, uniform, empty chest — but a **backpack** was invented and persists to the end |
| Collapse | 0.81 | 0.75 / 0.85 / 0.80 | the intended ending; corridor rather than the declared entrance |
| Abhishek identity sheet | 0.88 | 0.90 / 0.85 / 0.88 | consistent across seven views; the face is near-photographic inside a charcoal body |

Three things the numbers say that neither the slideshow nor the README could:

- **"After the doorway" scores 0.19 on facts and 0.77 on judge, and both are right.**
  The image does what the story needs. The *graph* says the toddler is still present in a
  chest carrier and Abhishek is in ordinary clothes, because the `continuity.after`
  transition was declared on "Collapse", four cuts late. The facts score measured the
  declaration, not the picture. That is the attribution ImagenWorld says judges cannot do,
  and it found a continuity-authoring bug, not a rendering one.
- **The two lowest judge scores are the two most important frames.** The poster image
  lost its direction; the threshold frame lost its carrier position and its front view.
  Facts alone under-report both (0.69, 0.66) because identity atoms outnumber the one
  action atom that mattered; the judge caught them. Both records are needed.
- **The 0.98 "duplicate" between cuts 17 and 18 is the match cut working.** The spec
  demanded exact geometry there. The scorer cannot tell a designed match from a collapse;
  it should read `beat.type == "turn"` or the declared `transition` and stand down. Cut
  3's 0.95 against its base, by contrast, is a real "barely moved".

Engine changes from this pass: `facts` no longer asks about a state whose asset is not in
frame (the clock insert was being asked about the toddler).

## Prepared for approval

Twelve recipes on "An auto crosses the frame" against the live `gpt_image_2_5` contract
(CLI 0.1.28): reference count 2/3/4/5, six role orders, tokens verbatim vs paraphrased.
Every one carries a `reference_depth` warning — the base is depth 8 — which is itself the
argument for the shallow-vs-deep run once a shallow base exists. Reference-input pricing
is unverified by the provider (`credits: None`, settings-only 1 credit each), so approval
needs `allow_unknown_cost` and a ceiling. Nothing has been approved or submitted.

## Third pass — every frame that declares the child, cropped

Hiren's eye caught two things the first pass did not: a child whose head is the wrong
way up, and frames with no child at all. Both were misses of mine — I sampled eight
frames and scored perceptual quality at contact-sheet size. This pass looked at all 14
frames that declare the toddler, with the child cropped at full resolution.

| # | Cut | child | carrier | what is wrong |
| --- | --- | --- | --- | --- |
| 2 | Abhishek enters the frame | ✓ | chest ✓ | runs left, declared right |
| 3 | Running against traffic | ✓ | chest ✓ | counterflow absent |
| 4 | The quiet passenger | ✓ | chest ✓ | — |
| 5 | No sound from the child | ✓ | chest ✓ | — |
| 7 | Searching for transport | ✓ | chest ✓ | **child reclined, head tipped back** |
| 8 | An auto crosses the frame | ✓ | chest ✓ | **head fully inverted — face to the sky, body horizontal.** First pass gave this PQ 0.75; corrected to 0.45 |
| 9 | Keep running | **✗** | **✗** | plain shirt, no straps, no child |
| 10 | Arches through the trees | **✗** | **✗** | over-the-shoulder view; no straps on either shoulder |
| 11 | Arrival at the old school | ✓ | **✗** | child carried in arms, no carrier; sun *and* moon in the sky |
| 13 | Checking the deadline | ✓ | chest ✓ | dark shirt for one cut |
| 14 | Running under the arches | ✓ | chest ✓ | — |
| 15 | Before the doorway | ✓ | **back** | wrong side, rear view |
| 16 | Last view of the child | ✓ | **back** | the last confirmation before the threshold confirms the wrong thing |
| 17 | Crossing the line | ✓ | chest ✓ | — |

Seven of fourteen frames fail the film's one continuity lock. Three have no carrier;
two have it on his back; two have the child's head the wrong way. The child's *look*
(dark hair, round face, light one-piece) is consistent wherever he appears — identity
held, presence and posture did not.

**How this was signed off.** Every one of these reviews reads *"User enabled
auto-approval for the sequential storyboard run"* with the toddler and carrier listed as
depicted — including cut 9, which shows neither. The historical run helper inferred
depicted assets from the cut's requirements and wrote them as confirmations. That is the
exact failure `PRODUCTION_CONTRACTS.md` names ("a prompt requesting an object does not
prove the image contains it"), and it is why `START_HERE.md` says not to reuse that
helper. The engine could not have caught it: nothing asked.

**What changed in the engine.** `facts` now asks, for every visible character, whether
the body, head and limbs are in a physically plausible position — a capped question, so
an inverted head caps the record at 0.4. The playbook's judge step now says to crop every
declared cast member at full resolution and to score every frame, not a sample. Cut 8's
first-pass record stands in the table alongside the corrected one; both are evidence.

**Facts vs judge, again.** On the missing-child frames facts scored 0.02–0.04 and judge
0.36–0.51: the declared-fact questions are the sharper instrument for *absence*; the
judge is sharper for *wrongness of what is present*. Neither found the inverted head
until a person said "look at the head".

## Fourth pass — the loop, live

Same day, after the evaluation gate, repair and autopilot landed. Eight cuts — the seven
that failed the child lock plus the poster image — were re-cut on the probe copy in
autonomous mode: `policy.autonomous`, `min_take_score 0.6`, `max_takes_per_cut 3`, cost
ceiling 10 credits a take with unknown-cost acknowledgement. No approval was asked for.

**What the loop did on its own.** Prepared recipes were checked before spending: three of my
first eight were refused for not quoting a location's locks, three for attaching the wrong
location or none. Fixed by deriving references and the lock block from the cut's scope
rather than by hand. Then it approved within policy, submitted, polled, collected, ran the
duplicate check, and stopped with eight `evaluate` tasks. After the records were written
it wrote evidence-backed reviews (author `assistant`, depicted assets = what the facts
record saw) and selected all eight.

**What the provider did.** Higgsfield's filter rejected every recipe that carried the
toddler's identity sheet ("NSFW content detected", refused at submit, no job, no charge).
Isolated with three receipted diagnostic generations: adult alone → accepted; child in
text only → accepted; child image attached → refused. So the engine gained
`reference_mode: text` — an asset whose identity travels as its quoted locks, satisfying
coverage without an image — and a definitive `provider_rejected` failure with a repair
that says exactly that. The original production had passed the same sheet through a
different route; that route is not available to the CLI today.

**Results.** Every one of the eight passed the gate on the first take. Every take is depth
2 (style image → sheets → take), no base chaining anywhere. No duplicate flags.

| Cut | old take | new take | facts min-group | judge | what the eye found |
| --- | --- | --- | --- | --- | --- |
| Running against traffic | ran left, no counterflow | **runs right, auto faces left, trees bend** | 0.83 | 0.85 | the poster image, finally |
| Searching for transport | child reclined, head back | child upright on chest; he looks back over his shoulder | 0.85 | 0.83 | autos face camera rather than receding |
| An auto crosses the frame | child's head inverted | child upright; auto in foreground, occlusion slight | 0.62 | 0.80 | weakest: he is barely hidden |
| Keep running | **no child, no carrier** | small figure, child on chest, compressed road | 0.84 | 0.90 | — |
| Arches through the trees | **no child, no carrier** | rear ¾, straps on both shoulders, clock at 9 through branches | 0.87 | 0.90 | — |
| Arrival at the old school | no carrier; sun *and* moon | carrier on chest; one flat morning sky | 0.82 | 0.85 | walks toward camera, not screen-right |
| Before the doorway | rear view, child on back | **front, locked, doorway centred, child on chest, both straps** | 0.90 | 0.93 | the match-cut frame now exists |
| Last view of the child | child on back | front detail, both straps, head upright, face to camera | 0.85 | 0.93 | child's face near-photographic |

**Cost.** 10 image generations (8 re-cuts + 2 accepted diagnostics) at **1 credit each** on
`gpt_image_2_5` — the provider's "settings-only" estimate was the real price; reference
inputs added nothing. The three refused submissions cost nothing. The original 22-cut
production had paid 5 credits per frame.

**Where the loop still stops for a person.** Two places, both by design: looking at the
take (facts + judge, with the child cropped at full size) and writing the next recipe.
Everything between — approval within policy, submission, polling, collection, the
duplicate check, the gate, the evidence-backed review, selection, the repair proposal —
ran without a hand on it.

**Left in the probe copy.** A "Diagnostics" shot with three diagnostic cuts (A, B, C); the
engine has no delete, so they stay as history. Cuts 17 and 18 (the match-cut pair) were
not re-cut and still descend from the depth-16/17 chain; cut 3's old take and the seven
replaced takes remain as unselected history.

## Fifth pass — the stranger, and what it cost me

Three takes were handed to blind evaluators: a fresh context each, given only the image
file and the cut's question list. No story, no prompt, no notes, no knowledge of my
scores, no access to this conversation. Each was told to crop every named subject before
answering and to say which crop it used.

All three disagreed with me past the threshold, in the same two directions.

| Take | my min-group | blind | gap | what the blind evaluator saw that I did not |
| --- | --- | --- | --- | --- |
| Before the doorway | 0.90 | **0.45** | 0.45 | "the baby's hands are featureless white mitts with no fingers"; the man is out of scale with the arch; style is "a photoreal portrait with a sketch filter over it… warm sepia rather than true monochrome" |
| Arrival at the old school | 0.82 | **0.40** | 0.42 | "the man's left hand is malformed — the digits fuse into a single curled hook"; no figure casts a shadow on a sunlit plaza; the child reads 12–18 months, not eight |
| An auto crosses the frame | 0.62 | **0.29** | 0.33 | "the auto never actually hides the man"; "the baby's arms are nowhere visible — the carrier panel has no armholes and no hands appear anywhere"; the street is cobblestone, which reads European |

Two systematic errors of mine, found by three independent readers who could not have
coordinated:

1. **Hands.** Every one of the three found an anatomy defect in a hand — mitts without
   fingers, fused digits, arms absent entirely. I had cropped the child on all three and
   scored pose 0.85–0.95. I checked that the head was the right way up, because that was
   the failure I had been told about, and stopped looking.
2. **Style.** I scored style 0.85–0.90 across every frame; the blind readers gave
   0.45, 0.55, 0.68, and each independently described the same thing: near-photoreal
   figures under a filter, warm sepia rather than monochrome, no real spatial
   discontinuity. The project's own bible says *monochrome, no colour accents,
   non-realistic, imperfect registration*. The pictures do not meet it and I had been
   marking them as though they did. That is the single largest unnoticed drift in the
   production, and it is in every frame including the twenty-two originals.

Both are the same mistake in different clothes: I was scoring against my memory of what
the frame was supposed to fix rather than against the declaration in front of me.

**What changed in the engine as a result.**

- A facts record that answers fewer questions than were asked is **not an evaluation**.
  Mine answered 14 of 22 on two takes and 15 of 23 on the third — I had silently skipped
  the identity-token questions. Coverage now reads 0 of 22, which is the truth.
- **An existing second opinion always counts**, whether or not `policy.require_stranger`
  is set. The policy decides whether a missing stranger blocks; it never decides whether
  a present disagreement is heard. A gap over 0.25 names the group it is about
  ("disagrees by 0.45 on style"), and a second opinion below the project threshold stops
  the take on its own.
- **Repair reads the stranger too** — its failing atoms, its tagged discrepancies, and
  its free note, which is where "the auto never actually hides him" and "no armholes"
  live. Those are the instructions for the next take.

All three takes are now rejected by the gate and carry repair proposals. Nothing was
un-selected by hand; the engine did it once the evidence existed.

**The lesson for the harness, stated once.** A single evaluator scoring its own work will
converge on the defects it already knows about. The second opinion is not a nicety at the
end; it is the only mechanism here that can find an error class nobody has named yet. It
cost three subagent runs and found two.
