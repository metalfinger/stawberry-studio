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
