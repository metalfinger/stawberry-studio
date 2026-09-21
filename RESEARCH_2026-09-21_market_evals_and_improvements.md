# Where Strawberry stands, what the market did, and what to change

21 September 2026. Brainstorm, not a plan. Everything about the repo below was
verified against code in this worktree; everything about the market is from
sources dated 2026 and linked at the end.

## 1. What Strawberry actually is today

Two engines live in one repo, and the thesis has already moved between them.

| | Old runtime (`backend/orchestrator`, `backend/tools`, `backend/routes`) | New engine (`backend/studio`) |
|---|---|---|
| Who reasons | Five in-app agents (Berry, Sage, Nova, Atlas, Pixel) | The host — Codex or Claude Code |
| Reference picking | `_prioritize_refs` in `cut_executor.py:116`, `max_refs=4`, fixed order style_anchor → identity → prev_cut → plate → props | None. Host chooses from the full library; recipe freezes the ordered list |
| Visual check | `vision_critic.py` — Gemini multimodal, weakest-axis score, pass at 0.8, emits `critic_pass` / `critic_revise` | None. `PRODUCTION_CONTRACTS.md`: "structural consistency, not visual truth" |
| What's persisted | Chat history, agent events, generation history | Nodes, revisions, media, recipes, jobs, append-only `media_reviews`, `asset_requirements` |
| Status | Historical; not to be started | Live; 177 offline tests; MCP + CLI transport done |

Three things the earlier chat got wrong or couldn't know:

- **"Re-anchor every 4th cut"** — no code matches `re_anchor` / `reanchor`. Either it lives
  under another name or it was a doc-level intention. Unverified; do not build on it.
- **Lineage is already recoverable in the new engine.** `media.job_id → jobs.recipe_id →
  recipes.spec.references[]` (ordered, each with `role` and `subjects`). Generation depth
  is a recursive query, not a schema change.
- **Identity traits already exist as data.** `wardrobe_lock` (12 files) and
  `consistency_tokens` (9 files). They are the input a capped rubric needs, and today
  nothing reads them back.

And one thing the repo says about itself that defines the gap:
`PORTABILITY_STATUS.md` lists "Optional evaluator records and bounded repair execution"
as pending, and `workflow/PORTABLE_WORKFLOW.md` already specifies the record's shape —
evaluator, evidence, confidence, discrepancies, kept separate from human review.
The design decision has been made. The table hasn't been created.

## 2. The market, September 2026

### Systems with the same thesis

| System | Who orchestrates | Consistency mechanism | Beats / story | Evaluation | What Strawberry has that it doesn't |
|---|---|---|---|---|---|
| **OpenMontage** (Jun 2026, #1 trending) | "Your coding assistant IS the orchestrator" — YAML manifests + Markdown stage skills, JSON checkpoints | **None explicit.** Style playbooks; consistency handled at prompt level. Stills pinned as first/last frame for video | research → proposal → script → scene_plan → assets → edit → compose. Scene plan is its own approval gate | Rule-based: slideshow-risk score, ffprobe, frame extraction, delivery-promise check. No critic | A typed production graph: cast / location / prop requirements per cut, append-only review, recipes with ordered references and confirmed subjects, `continuity_from` |
| **ViMax** (HKUDS) | Director / Screenwriter / Producer / Video Generator, TUI agent loop | Reference images + a "consistency check" + AutoCameo (person from photo into story) | Script → storyboard → shot design | "Automated quality control" claimed, mechanism unnamed | Same as above; plus ViMax admits "may generate unusable images even given correct references" |
| **Movie-Agent** | Multi-agent | A "visual bible" | Brief → script → locked dialogue | QC stage exists | Persistence contract |
| **MUSE** (paper) | Plan → execute → verify → revise loop | "Machine-executable controls over identity, spatial composition, temporal continuity"; multimodal feedback corrects violations mid-generation | Long-sequence narrative intent | **MUSEBench**, reference-free, human-validated | Nothing — this is the closest to where Strawberry should go; read it |

Verdict: Strawberry's architecture — host reasons, engine persists facts, human confirms
visual truth — is now the shape the most-adopted open-source system uses. That thesis is
validated. What nobody in this set has is a **consistency engine**: every one of them does
continuity at the prompt level. Strawberry's typed graph is the moat. The gap is that the
graph validates declarations and never looks at a pixel.

### Products

LTX Studio, Katalist, Boords, Storyboarder.ai — script → scenes → shots → frames, consistency
sold as the feature. Every 2026 roundup ends the same way: character and location continuity
between frames is "the consistent complaint" and "no tool has fully solved" it.
Higgsfield — the connected provider — now has **Cinema Studio Cast** (permanent character
asset with front / side / back sheet) and **Soul ID** (identity trained from 5+ photos,
reused as a Reference Element across Cinema Studio, Seedance, Kling). That is a
multi-view sheet and a trained identity anchor, offered by the provider itself. Strawberry
should be able to *hold* a Soul ID as a depth-0 reference rather than re-uploading a PNG.

### Models

Roundups converge on: Nano Banana 2 for balance, FLUX.2 Max/Pro when each reference needs a
**declared role**, Seedream 5.0 Pro for multi-source scenes, GPT Image 2 for instruction
density, Midjourney omni-reference for single-character fidelity. The recipe model already
allows 32 references with roles — the 4-cap is a Nano Banana Pro prior, and FLUX.2's
per-reference roles map directly onto Strawberry's `role` + `subjects` fields.

### Evals

- **ViStoryBench** — CVPR 2026, code public, 80 stories / 344 characters / 1,317 shots,
  12 metrics including **copy-paste detection**; NanoBanana-Pro scored in v4.
- **MultiBanana** — multi-reference, up to 8 refs; scores fall as reference count rises;
  the **detail cap** rule (named details miss → score capped at 4).
- **MaSC** — masked similarity, pip-installable; crop the subject before comparing.
- **GEdit-Bench v2 / ImgEdit-Bench** — editing and multi-turn with version backtracking.
- **GenEval 2** — benchmark drift; atoms right, whole prompt wrong.
- **Iterative Generative Drift** (SCHEMA paper on Gemini 3 Pro Image) — using an output as a
  reference degrades visibly at generation 2, moderately at 3, severely at 4+, and the
  error is **multiplicative**. This is the published number behind the depth-cap idea.

## 3. Improvements that keep the thesis

Thesis, stated so nothing below violates it: **the engine records facts, the host does
creative reasoning, a human confirms visual truth.** Evals are therefore *records the engine
keeps*, computed by a worker or the host, never a gate that silently approves.

### 3.1 Generation depth — a query, then a policy

Depth-0 = imported or human-approved sheet media. Depth-n = generated from a recipe whose
deepest reference is depth n-1. Expose it in `inspect` and `context` so the host sees
"candidate reference: depth 3, lineage cut-07 → cut-04 → sheet" when it chooses.
Then one readiness rule: a recipe whose references exceed a per-project depth cap gets a
**warning**, not a block. Re-anchoring stops being a counter and becomes a consequence of
the host reading the depth. Retroactively explains any drift already in the dream project.

Touches: `studio/store.py` (one recursive query), `studio/service.py` (surface it),
`studio/production.py` (readiness warning). No schema change. Smallest, highest leverage.

### 3.2 Evaluator records — the pending item, built as specified

Append-only table beside `media_reviews`: `media_id, evaluator, version, evidence (JSON),
confidence, discrepancies (JSON), crop_mask_ref, created_at`. Three consumers:

- **Promotion gate.** A generated cut is reference-eligible when a human approved it **or**
  an evaluator record clears threshold *and* the human has confirmed `depicted_assets`.
  This is the one gate that stops accumulation at the source; it fits
  `PRODUCTION_CONTRACTS.md`'s existing rule that a reference must depict its owning asset.
- **Cut gate.** Post-generation: identity vs the resolved entity state, style vs the bible,
  prompt adherence, and an attribute-binding check when `visible_cast` has more than one
  character — Strawberry's multi-subject + plate stack is exactly the setup that leaks
  attributes between people.
- **Scene gate.** Aggregate drift across sibling cuts; the host is told, it decides whether
  to reach back to the sheet.

The workflow doc already promises "evaluator, evidence, confidence, discrepancies separately
from human review". Build that sentence.

### 3.3 Port the critic as a worker, not an agent

`orchestrator/vision_critic.py` already has the weakest-axis scoring and the pass threshold.
Move the scoring into a `studio/worker.py` job that writes evaluator records. Two changes
while porting:

- **Rubric from data.** `wardrobe_lock` + `distinctive_features` become the named details;
  miss one and the score is capped (MultiBanana's rule, on input Strawberry already has).
- **Crop before compare.** Segment the subject, then MaSC or DINOv2. Uncropped similarity
  with location plates and a style anchor in the stack is measuring background match — the
  reason published CLIP-I numbers flatter overfit outputs.
- **Pair every identity score with sibling variance** (size, position, pose). High identity
  + low variance is the Story2Board collapse, and `prev_cut` references produce it by
  construction. The critic must be able to say "consistent because it copy-pasted".

### 3.4 Beats become fields

`workflow/PORTABLE_WORKFLOW.md` already tells the host to record "each beat's purpose,
duration, framing, action, emotional change and transition" — as prose in notes. Make them
fields on the cut node. Then two things become checkable that are not today: the
"one decisive still moment per frame" rule (a beat with two actions is a smell), and
**scene-level rhythm** — total duration, redundant coverage, reveal timing, breathing room —
which the doc asks for and nothing can compute. This is also what the fever-dream
post-mortem found: the turn has to be *in the image*, and a beat field is where the host
declares which frame carries it.

### 3.5 Sheets as sets, states over time — mostly already there

`asset_requirements` already plans views per asset; extend it to name the view
(front / three-quarter / profile / full / expression) so the host can pick the view nearest
the cut's camera instead of asking the model to rotate a portrait.
`continuity.before / after` already carries per-asset state transitions — wet clothes,
a cut above the eye, a costume change. Make the reference resolver **state-aware**: a cut
resolves to the entity state valid at its `story_order`, and the candidate references it is
offered are filtered to that state. This is the upgrade that separates a storyboard tool
from a consistency demo, and the data model is already shaped for it.

### 3.6 Reference selection as retrieval, in the host

Keep the choosing in the host — that is the thesis — but give it a better menu. One engine
read op, `candidates(cut_id)`, returns every eligible reference with: relevance to this
cut (shared location / cast / state / camera), **trust** (from depth), and **diversity**
against references already chosen. The playbook tells the host to fill four slots by
relevance × trust × diversity, not by a global priority order. The diversity term is what
stops four near-identical front-facing frames.

### 3.7 Multi-agents — roles the host plays, gates it stops at

OpenMontage and ViMax both confirm: roles as **playbooks the one host reads**, not runtimes.
Strawberry already has `PLAYBOOKS.md`. What the fever-dream agency work adds, from five
failed builds: roles must hand back **artefacts**, not opinions; everyone looks at the
artefact **together at the gate**; and a **stranger** — a fresh context that sees only the
frame and the cut's declared facts, never the thread — reviews every gate. The stranger is
an evaluator record with `evaluator = "fresh-context-vlm"`. Its whole value is that it
cannot be talked into approving.

## 4. The eval harness for the pipeline itself

A fixed probe production, offline, in `tests/fixtures/`. **Nine O'Clock is the candidate**:
22 cuts, real lineage already in `.strawberry/production.sqlite`, one character, a paper
style that is unusually easy to drift. Then the hypotheses the pipeline currently encodes
by feel, each a one-afternoon experiment once 3.1–3.3 exist:

| Baked-in assumption | Where | Experiment |
|---|---|---|
| 4 references is the cap | old `max_refs=4`; recipe model allows 32 | Same cut at 2 / 3 / 4 / 5 / 6 refs, scored |
| anchor → identity → prev_cut → plate → props is the right order | `cut_executor.py:81-103` | Six permutations, one production |
| A previous cut is a good reference | `PORTABLE_WORKFLOW.md` says "not automatically" | Depth-1 vs depth-3 references, identity + variance |
| Style anchor locks palette without dragging composition | `references.py:512-518` already found it dragged an astronaut into a location | ViStoryBench style-similarity vs copy-paste split |
| Verbatim style-bible tokens beat paraphrase | `style_bible.py` | GenEval 2's atomicity finding says more atoms can cost the whole prompt |
| Lazily filled identity (PREPROD_FILL) holds as well as a pre-authored sheet | `iris.py` | Never compared |

Deliverable is one page: which layer earns its cost, which is decoration, which magic
number moves. Then decide whether evaluator records become a real production contract.

## 4a. ViStoryBench, specifically — what to run, what to steal, what not to

**Runnable on our own storyboards: yes, with an adapter.** `bench_run.py --outputs_path`
accepts custom paths; `vistorybench/dataset_loader/adapt_base.py` is the template. Layout
it wants is `method/mode/lang/timestamp/shots/story_id/shot_XX.png` plus a `story.json`
(plot correspondence, setting, on-stage characters per shot) and
`image/[Character]/` reference dirs. Strawberry already holds every field:

| ViStoryBench | Strawberry |
|---|---|
| shot description | cut `action` + camera |
| on-stage characters | `visible_cast` |
| setting | `location_id` |
| character reference images | approved media on the character node |
| generated shot | selected take on the cut |

One export op from `.strawberry/` to that layout is a day's work and it becomes the offline
audit for every production, Nine O'Clock first.

**The limit that matters: CIDS is face-based.** GroundingDINO + ArcFace / AdaFace /
FaceNet. It measures the identity of *realistic human faces*. It has nothing to say about
props, locations, or a charcoal-and-cut-paper Abhishek who is "non-realistic but
identity-readable". Copy-paste detection is inside CIDS and inherits the limit — and when a
character has only one reference it uses a *mirrored* copy, which is a shortcut, not a
measurement. So on stylized work the headline metric is likely noise. Running it once on
Nine O'Clock and finding that out is itself the result: it tells us the in-engine evaluator
cannot be ViStoryBench's.

**Weight, not a library.** ~15 GB of weights, 24 GB VRAM recommended (CPU fallback exists),
conda env, its own config. A benchmark harness, not something a `studio/worker.py` job
imports per cut.

**Therefore:** ViStoryBench is the **offline audit**, run occasionally on an exported
production to check whether our numbers and Hiren's eye agree. The **in-engine evaluator
record** (3.2–3.3) should be the VLM judge with the capped rubric plus MaSC / DINOv2 on the
*cropped subject* — that works for props, locations and stylized characters, which ArcFace
cannot, and it runs on a CPU worker.

**What to steal outright:**
- the `story.json` schema as validation that Strawberry's fields are the right ones;
- **OOCM** (on-screen character detection) — it is the machine form of `depicted_assets`,
  the one thing the human currently has to confirm by hand. Even a weak automatic version
  can pre-fill the review and let the human correct rather than author;
- **Prompt Align** — GPT/Gemini as judge with `--base_url` override, i.e. exactly the
  evaluator-record shape;
- their v4 leaderboard row for NanoBanana-Pro, which is Strawberry's own model — a free
  published baseline for where it drifts.

## 4b. Four more benchmarks, same treatment

### Story2Board — Rich Storyboard Benchmark (FLUX.1-dev, training-free)

**How it works.** 100 original stories, each with a 7-panel breakdown. Three metrics:
character consistency via **DreamSim** (panel-level), prompt alignment via **VQAScore**, and
the one that matters — **Scene Diversity**: Grounding DINO finds the subject per panel,
normalised bbox variance captures framing / position / scale; for humans, **ViTPose** adds 17
keypoints and per-keypoint variance across panels; score = ½(bbox + pose). Their own
sentence on why: *"The Flux baseline attains strong consistency scores by rendering nearly
identical characters across panels, but lacks sensitivity to prompt-specific content."*
Consistency methods are **Latent Panel Anchoring** (a shared reference latent across
panels — the training-free cousin of Strawberry's identity anchor) and RAVM (attention
value mixing, model-internal, unreachable through an API).

**Runnable on ours:** the metric is, the method isn't. Grounding DINO + ViTPose run on CPU
in seconds per panel. The benchmark stories themselves are for comparing *generators*,
not productions.

**Steal:** Scene Diversity, verbatim. It is the copy-paste guard the pipeline needs, it
works on props and stylized characters (bbox does not need a face), and pairing it with
identity similarity is the single chart that says "consistent because it copy-pasted".
Sibling cuts of one shot are exactly where it bites.

### GEdit-Bench (Step1X-Edit) and VIEScore

**How it works.** 11 categories — `background_change, color_alter, material_alter,
motion_change, ps_human, style_change, subject-add, subject-remove, subject-replace,
text_change, tone_transfer` — real user instructions. Scoring is **VIEScore**: judge
(GPT-4o or Qwen2.5-VL-72B) sees source + edited image at 512², answers two prompts on 0–10 —
**Semantic Consistency** (edit followed *and* untouched content preserved) and **Perceptual
Quality** (naturalness, artifacts) — each as the *minimum* of its sub-scores, and
**Overall = √(SC × PQ)**. Weakest link wins, then geometric mean. The v2 paper adds a
pairwise judge (PVC-Judge) because pointwise 0–10 aligns worse with humans than "which of
these two is better".

**Runnable on ours:** yes — `run_gedit_score.py --edited_images_dir …` over a
`results/{method}/fullset/{task}/{en}/key.png` layout; needs a judge API key, no GPU.

**Steal:** the two-prompt split and the geometric-mean Overall. `vision_critic.py` already
does weakest-axis; VIEScore is the published, human-validated version of the same
instinct. And the categories are a ready taxonomy for *what kind of edit* a cut recipe is —
a cut generated from a previous cut with a costume change is `subject-replace` +
`motion_change`, and the judge prompt should know that. Pairwise beats pointwise: when the
host has two takes for a cut, ask "which" not "how good".

### GenEval 2 (Meta) and Soft-TIFA

**How it works.** 800 prompts built from **atoms** — objects, attributes, relations, counts
— at 3–10 atoms each, with a pre-written VQA pair per atom in `geneval2_data.jsonl`.
**Soft-TIFA** asks a VQA model each question and takes the probability of the right
answer: arithmetic mean = atom-level, **geometric mean = prompt-level** (one failed atom
sinks the prompt). The finding: models score high per atom and low per prompt — the
individual elements land and the *conjunction* fails. Old GenEval had drifted up to 17.7%
from human judgment; Soft-TIFA drifts less because it scores probabilities, not verdicts.

**Runnable on ours:** `evaluation.py --benchmark_data … --image_filepath_data … --method
soft_tifa_gm`, a JSON of prompt → image path, `pip install torch transformers`. Trivially.

**Steal — the most direct of the four.** A Strawberry cut *is* an atom list already:
`visible_cast` (each a presence atom), `required_props` (each an atom), `location_id`
(a setting atom), `continuity.after` states (each an attribute atom: "is the jacket wet"),
and the beat's action. Generate one VQA question per declared fact, score with Soft-TIFA,
take the geometric mean. That is a **prompt-level "did every declared fact land"** number
that comes straight from the typed graph, needs no rubric writing, and by construction
answers ImagenWorld's complaint that VLM judges cannot attribute errors — because each
question *is* an attribution. This becomes the `evidence` field of the evaluator record.

### ImagenWorld (ICLR 2026)

**How it works.** Six tasks (T2I, single-ref gen, multi-ref gen, T2I edit, single-ref
edit, multi-ref edit) × six domains (artworks, photoreal, information graphics, textual
graphics, computer graphics, screenshots). ~20K human annotations that are **tags, not
scalars**: object-level and segment-level failures — instruction-following problems,
numerical inconsistencies, segment/labeling issues, "generated a new image instead of
editing", plot/chart errors, unreadable text. VLM judges reach Kendall 0.79 against human
*ranking* but cannot do the fine-grained attribution the tags do.

**Runnable on ours:** the taxonomy is described, the annotation tool is not released in the
README. It is a finding, not a harness.

**Steal:** the shape of the record. `discrepancies (JSON)` in the evaluator record should be
a list of *tagged, localised* failures — `{tag, asset_id, region}` — never a number alone.
And the findings set expectations: editing is harder than generation, local edits hardest,
multi-reference hardest of all — which is precisely Strawberry's mode every time it
generates a cut from a base + refs. Expect the cut gate to fail more than the sheet gate;
that is the model, not the pipeline.

### One playground

All four plus ViStoryBench, side by side:

| | Measures | Needs | Runs on stylized / props | Take for Strawberry |
|---|---|---|---|---|
| ViStoryBench | face identity, style, copy-paste, prompt align | 15 GB weights, big GPU | no (ArcFace) | offline audit; OOCM; story.json |
| Story2Board | **scene diversity**, DreamSim, VQAScore | Grounding DINO + ViTPose, CPU | yes | the collapse guard, verbatim |
| GEdit / VIEScore | edit fidelity + quality, √(SC·PQ) | judge API | yes | two-prompt judge; pairwise for take choice |
| GenEval 2 / Soft-TIFA | per-atom VQA, geometric mean | small VQA model | yes | **declared facts → questions**; the evidence field |
| ImagenWorld | tagged, localised failures | humans | — | discrepancies as tags, not scores |

So the in-house evaluator is not one metric; it is a **composition** the engine already has
the inputs for: Soft-TIFA over the cut's declared facts (did it land), VIEScore-style
weakest-axis judge (is it good), MaSC on the cropped subject (is it the same one), Scene
Diversity across siblings (or did it just copy), all written as tagged discrepancies. Each
part is public, human-validated and cheap. What is new is only that the questions come
from the production graph instead of a benchmark file — which is the whole reason the
graph exists.

## 5. Build order

1. Depth query + surface in `inspect` / `context` (3.1). Days, no schema.
2. Evaluator records table + promotion rule as a readiness warning (3.2).
3. Critic worker (3.3), composed per 4b: Soft-TIFA over declared facts, VIEScore-style
   judge, MaSC on the cropped subject, Story2Board Scene Diversity across siblings,
   discrepancies as tags.
4. Nine O'Clock as fixture; run the ref-count and ref-order experiments (4). Export it to
   ViStoryBench layout once and run the offline audit (4a).
5. Beat fields (3.4) and named views + state-aware resolver (3.5).
6. `candidates` read op and the retrieval playbook (3.6). Stranger evaluator (3.7).

Not now: video, training a reward model, reproducing a leaderboard, a second orchestrator.

## Sources

Market and tools: [Higgsfield — consistent characters](https://higgsfield.ai/blog/tools-for-consistent-ai-characters) · [Fastio — character generators tested](https://fast.io/resources/best-ai-character-generators-2026/) · [Linocut — multi-reference models tested](https://linocut.ai/blogs/multi-reference-ai-image-models/) · [ToonyStory — 140-image consistency test](https://toonystory.com/blog/best-ai-for-character-consistency-2026) · [Luma — storyboard generators](https://lumalabs.ai/news/ai-storyboard-generators) · [Morphic — storyboard tools](https://morphic.com/resources/tools/best-ai-storyboard-tools) · [M Studio — consistency in storyboards](https://mstudio.ai/blog/storyboarding/ai-character-consistency-storyboards) · [Storyflow — 12 tools](https://storyflow.so/blog/best-ai-storyboarding-tools-2026) · [Higgsfield Soul ID](https://higgsfield.ai/blog/sould-id-best-character-consistency) · [Higgsfield character sheets](https://geo.higgsfield.ai/task/blog/specific-character-reference-sheets-video-generation) · [Higgsfield prompt skill (Claude)](https://github.com/OSideMedia/higgsfield-ai-prompt-skill)

Agentic systems: [OpenMontage](https://github.com/nguyenquanvan/OpenMontage) · [ViMax](https://github.com/hkuds/vimax) · [Movie-Agent](https://github.com/YidanPan/Movie-Agent) · [MUSE](https://arxiv.org/pdf/2602.03028) · [LogiStory](https://arxiv.org/pdf/2603.28082)

Evals and papers: [Story2Board](https://github.com/daviddinkevich/Story2Board) · [Story2Board arXiv](https://arxiv.org/abs/2508.09983) · [GEdit-Bench / Step1X-Edit](https://github.com/stepfun-ai/Step1X-Edit) · [GenEval 2](https://github.com/facebookresearch/GenEval2) · [ImagenWorld](https://tiger-ai-lab.github.io/ImagenWorld/) · [ImagenWorld repo](https://github.com/TIGER-AI-Lab/ImagenWorld) · [ViStoryBench (CVPR 2026)](https://github.com/vistorybench/vistorybench) · [ViStoryBench leaderboard](https://vistorybench.github.io/) · [ViStoryBench arXiv](https://arxiv.org/abs/2505.24862) · [SCHEMA / Iterative Generative Drift](https://arxiv.org/pdf/2602.18903) · [UniCustom multi-reference](https://arxiv.org/pdf/2605.12088) · [LCG long-context consistency](https://arxiv.org/pdf/2606.26171) · [ReMix consistent characters](https://arxiv.org/pdf/2510.10156) · [Visual-Aware CoT](https://arxiv.org/pdf/2512.19686)
