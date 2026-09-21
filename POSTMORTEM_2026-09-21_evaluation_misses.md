# Post-mortem: why the evaluation pass missed an inverted head and three missing children

21 September 2026. Nine O'Clock, probe copy. The host evaluate pass (Claude) recorded
`facts` and `judge` evaluations and reported step 3 done. A person then noticed, in one
glance, that a child's head was upside down and that in several frames the child was not
there at all. Seven of fourteen child frames were wrong. None were flagged.

This is written so the fixes become contracts other workflows cannot skip, not advice
the next host may or may not follow.

## Root causes, in the order they compounded

### 1. Coverage was chosen by the evaluator, and nothing measured it

I evaluated 8 of 22 cuts — the ones that seemed interesting. Cuts 9, 10 and 11, where the
child is missing, were not in the sample. The engine warns `reference_unevaluated` for an
*asset reference* a cut depends on, but has no warning for a *cut's own selected take*
having no evaluation, and `workflow` reports no coverage number. A partial pass looked
identical to a complete one.

### 2. The evaluator looked at the wrong resolution, and nothing said where to look

I viewed 1200-pixel contact sheets. The child is 3–5% of the frame; an inverted head at
that size is a dark blob on a chest. `facts` told me *what* to check and nothing about
*where* or *how close*. My first record for cut 8 gave perceptual quality 0.75. The
record carried no statement of what region I had inspected, so nobody could tell I had
not looked.

### 3. The questions were derived from declarations, and nobody declares "head upright"

`facts` asked presence, identity tokens, wardrobe, location, props, continuity states,
action, beat, style. There was no question about whether the body is physically
plausible, because no field said so — and no field ever will, because it is assumed.
The carrier's `worn_position` state *was* asked, but as a weight-2 uncapped question,
so "on his back" cost a little instead of failing the frame. The one lock the film has
was encoded as prose in a `continuity.priority` note, unreadable by the engine.

### 4. The headline score diluted the one atom that mattered

Each character contributes three token questions plus wardrobe; the cut's action is one
question. "Running against traffic" scored 0.69 on facts with its action at 0.3 — the
counterflow that the beat exists for — because nine identity atoms averaged it up. A
single geometric mean hides which *kind* of fact failed.

### 5. The reviews were written by a script, and the engine could not tell

Every review reads "User enabled auto-approval for the sequential storyboard run" with the
toddler and carrier listed as depicted — including frames with neither. The historical
run helper inferred `depicted_assets` from the cut's requirements and submitted them as
confirmations. `review_media` accepts `depicted_assets` from any caller with no
provenance, so a script's guess and a person's look are the same fact to readiness,
coverage and the promotion gate. `START_HERE.md` already says not to use that helper;
the engine still cannot distinguish its output from a human's.

### 6. One evaluator, checking its own work

The playbook describes a stranger pass — a fresh context that sees only the frame and the
questions. It was optional and I did not run it. A second evaluator with the same
question list would have disagreed with my cut 8 score by 0.3 and produced a signal;
there was no mechanism for disagreement to become a warning.

### 7. "Done" was declared without a coverage line

I reported step 3 complete. The report showed scores for eight cuts and did not say
"8 of 22". The playbook said score every take; nothing checked that I had.

## Root fixes — contracts, not advice

Each fix is stated as a thing the engine enforces or reports, so a host that skips it is
caught by readiness, by the record, or by the report.

| # | Cause | Fix | Enforced where |
| --- | --- | --- | --- |
| 1 | self-chosen coverage | `take_unevaluated` warning per cut whose selected take has no current `facts`+`judge`; `workflow.evaluation_coverage = {evaluated, total}`; `probe_report` prints coverage first and refuses to summarise below 100% | `ProductionRules.warnings`, `Studio.workflow`, `scripts/probe_report.py` |
| 2 | wrong resolution, no trail | `facts` returns `look_at` per question ("crop the region containing X at full resolution; X is expected small — inspect the crop, not the frame"); `EvaluationCreate` **requires `region`** on every evidence item that names an asset when `kind` is `facts` or `judge` — a record that does not say where it looked is refused (`evidence_region_missing`) | `Studio.facts`, `models.EvaluationCreate`, `Studio.evaluate` |
| 3 | no default checks; locks as prose | (a) default capped atoms per visible character: pose plausibility (done), limb/face count; (b) assets get a typed `locks` field (list of state attributes, e.g. `["presence","worn_position"]`); state questions on locked attributes become **capped, weight 3**; a cut that declares a character visible gets an implicit `presence` lock | `fields.py` (`locks`), `Studio.facts` |
| 4 | diluted headline | `facts` records carry **group scores** — `scope`, `identity`, `state`, `action`, `style` — and the headline is `min_group`; action or beat below 0.5 caps the record ("the frame did not do its job") | playbook computes; `Studio.evaluate` validates the score keys for `kind=facts` |
| 5 | script reviews indistinguishable | `MediaReview.author: human \| assistant \| script` (required, stored); only `human` confirmations count for `complete`, `take_ready`, reference coverage and the promotion gate; `assistant`/`script` reviews can approve for reference-only use; readiness warns `review_contradicted` when a current `facts` record puts a confirmed depicted asset's presence below 0.2 | `models.MediaReview`, `ProductionRules.review/selected`, `warnings` |
| 6 | single evaluator | a take needs a `stranger` record before it can be **selected** as final or reused as a reference (readiness issue, not warning, when `policy.require_stranger` is true; warning otherwise); `evaluator_disagreement` warning when two current records of the same kind differ by more than 0.25 on `overall` or `min_group` | `warnings`, `validate_recipe`, `select` |
| 7 | "done" without coverage | every evaluation summary the engine or a script emits leads with `evaluated N of M`; the playbook's Evaluate step ends with that line and the coverage must be 100% before "review-ready" is claimed | `probe_report`, `workflow`, `PLAYBOOKS.md` |

Two things are deliberately **not** fixes:

- A model-based detector inside the engine to find the child automatically. That would
  make the engine a second LLM stack; the crop-and-say-where-you-looked contract puts
  the burden on the evaluator and leaves a trail instead.
- Making evaluations block generation by default. They stay records; policy fields turn
  them into gates per project.

## The one-sentence version

The engine asked *whether the child was declared*, the evaluator answered *from too far
away*, a script had already *confirmed the child was there*, and nobody counted how many
frames had been looked at. Every fix above makes one of those four things impossible
to do silently.
