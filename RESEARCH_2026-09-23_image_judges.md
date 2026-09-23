# Image judges: is there a Jev for images?

Research date 23 Sep 2026. Three parallel research passes: Jev-style image judges; grounding and
artifact detectors; reward models and the 2026 landscape. Every claim below carries its source in
the original research outputs; the key ones are linked here. **[V]** = read from the source,
**[I]** = inference.

## The short answer

**No finished "Jev for images" exists.** TypeSafe's models page says "Text only... No image,
audio, or video input", and the launch post says images are "not yet" [V]
([models](https://docs.typesafe.ai/models)). A community project, Visual-Jev / SemIf, added vision
on 2026-09-22 and is experimental [V] ([repo](https://github.com/jiangxiluning/Visual-Jev)).

**But every part of one exists, and the method it would use is the best-measured method there is.**
Breaking a frame's declared facts into atomic yes/no questions and reading P("yes") from an open
vision model is what GenEval 2's Soft-TIFA does. It reaches **94.5% AUROC against humans**, ahead of
VQAScore (92.4) and TIFA (91.6) [V] ([GenEval 2](https://arxiv.org/abs/2512.16853)). That is the
harness's existing `facts` design with a different answerer.

**Our 0.5 generosity is a published, named failure.** "VLM Judges Can Rank but Cannot Score"
(Apr 2026): judges including Gemini 2.5 Flash over-score bad items by +0.89 to +1.73 on a 1–5 scale
while still ordering them correctly [V] ([arXiv 2604.25235](https://arxiv.org/html/2604.25235)).
SycoPhantasy found the same inflation on fantasy-character art [V]
([arXiv 2604.24346](https://arxiv.org/html/2604.24346)). The fixes are all measured:
probabilities instead of generated scores, pairwise comparison, calibration, and ensembles.

## Why our two pixel scorers failed, and what fixes that

HARNESS.md §4b records two whole-frame scorers that could not separate a real fault from print
texture, because a real fault is small in area and "knowing where to crop is segmentation, which is
a model". That model now exists and is cheap: **SAM 3** takes a short noun phrase or an exemplar
and returns every instance with masks, in 30 ms, for **$0.005/image on fal.ai** [V]
([paper](https://arxiv.org/abs/2511.16719), [fal](https://fal.ai/models/fal-ai/sam-3/image)).
Segment first, then measure inside the mask in code (colour quantisation against the palette,
tone-bin counts). That is the missing half of the approach §4b abandoned.

## Proposed two-level gate

### Level 1 — before generation (inputs)

| Check | Tool | Notes |
|---|---|---|
| Prompt contradicts style contract; a verb implies an uncast agent; material vs palette | **Jev** (text) | Needs a TypeSafe key. Its citation-check recipe is the shape. Convert hex to colour *names* first; Jev is weak on RGB [V] |
| Two reference sheets disagree (the two-gauge autoclave) | **Qwen3-VL-Reranker 2B/8B**, native P(yes), images on both sides, Apache-2.0 [V] ([HF](https://huggingface.co/Qwen/Qwen3-VL-Reranker-2B)) + **SAM 3 counts** on a stitched canvas of the two sheets | Trained for relevance, not fact checking; strong for "same entity?", weak for fine anatomy [I] |
| Each sheet matches its own description | P(yes) per declared detail, same judge as level 2 | |

### Level 2 — after generation (the frame)

| Step | Tool | Replaces |
|---|---|---|
| **Locate** every declared entity, and list *everything* | SAM 3 (fal) per cast/prop noun; YOLOE prompt-free or Florence-2 dense regions (fal) to list all objects | Claude guessing where to crop |
| **Undeclared** content | Code diff: listed objects minus declared cast/props/location contents | Claude's `undeclared` answer |
| **Declared facts** | Qwen3-VL-8B via vLLM `classifier_from_token ["no","yes"]` → P(yes) per atomic question, run on the *crop*, not the frame. About 1 s per decision on one consumer GPU, faster with prefix caching [V] | Claude's probabilities |
| **Calibration** | Isotonic / Platt per question type, fitted on blind-audit labels: cut calibration error from about 0.24 to about 0.04 in a 2026 study [V] ([arXiv 2604.02543](https://arxiv.org/html/2604.02543)) | Our uncalibrated 0.9s |
| **Anatomy and artifacts** | ImageDoctor (Apache-2.0, heatmaps, about 512 px input) [V]; ArtifactLens-style fine-tune on a few hundred of our own labels [V] ([ArtifactLens](https://arxiv.org/abs/2602.09475)); SDG defect boxes (Jun 2026) [V] | `hands`, `feet`, `pose` |
| **Palette / ink inside a region** | SAM 3 mask → per-mask colour quantisation and tone bins in code | The two deleted scorers |
| **Identity against sheet** | DINOv2 on matched crops (content-biased, good on artwork instances) [V]; score only entities judged correctly rendered first, the EntityBench rule [V] | `matches_sheet` |
| **Continuity with previous frame** | Pairwise judge on new vs previous frame, both orders to cancel position bias (MMRB2 protocol) [V]; SAM 3.1 video tracking for shape of a tracked object across frames | `continues` |
| **Style against anchor** | CSD with the CSLS readout fix (raw CSD fails for 23 of 91 artists; CSLS brings it to 4) [V] ([arXiv 2605.09030](https://arxiv.org/abs/2605.09030)) | `style_token:*` partly |
| **Second opinion** | UnifiedReward 2.0 (MIT, Qwen3-VL bases) as a different-family judge; disagreement = low confidence [V] | the blind Claude stranger, for disagreements only |

Claude's role moves from being the gate to orchestrating it and breaking ties.

## What is not solved, honestly

- **Nothing is validated on woodblock or print styles.** The only woodblock-specific grounding
  result (Ukiyo-eVG / CIGAr) needed fine-tuning; art surveys say photo-trained detectors
  "generalise poorly to art", and ViStoryBench saw Grounding DINO return nothing on stylised
  characters [V]. Of the open-vocabulary detectors, OWLv2 did best on art [V].
- **Counting fingers.** Hand pose models (MediaPipe, HaMeR/MANO) assume five fingers and fill them
  in on malformed hands [V]. No tool counts digits reliably. **Feet have no dedicated tool** at all [V].
- **Fine comparisons against a reference** (one gauge vs two, costume trim): both embeddings and
  VLMs are weak. The best VLM scores 77.8% vs humans' 95.5% on subtle differences [V]
  ([VLM-SubtleBench](https://arxiv.org/html/2603.07888v1)). Explicit counting via detection is the
  better route [I].
- **Gemini is not a probability source.** Logprobs were withdrawn from 2.5 and 3.x through 2026, and
  it has no segmentation on 3.x [V].
- **Every judge needs our own labels.** Calibration and fine-tuning both assume a few hundred
  labelled examples of *our* style. Today we have 8 blind-reviewed frames and ~120 host records
  known to be biased. **Building that label set is the actual prerequisite.**
- **Judges can be gamed.** Text inside an image pushed every judge tested; learned noise raised
  VQAScore by up to +35.6 points [V]. Our generator puts invented monograms in corners, so this is
  not hypothetical [I].

## First experiment (cheap, uses data we already have)

1. Take the 8 frames with blind-review records.
2. SAM 3 on fal to crop each declared entity (about $0.04 total).
3. Qwen3-VL-8B P(yes) on the same `facts` questions, per crop.
4. Compare: does the open judge agree with the **blind** evaluator more than with the host (me)?
   If yes, the path is validated on our own data before anything is built into the engine.

Needs: a GPU for Qwen3-VL-8B (about 16–24 GB at bf16, or a 4-bit build on less) or an on-demand
host (Fireworks lists Qwen3-VL-8B on-demand) [V]; a fal key, which we have.
