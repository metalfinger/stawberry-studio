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
