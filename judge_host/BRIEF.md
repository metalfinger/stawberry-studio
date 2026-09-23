# Brief: host the image judges on this NVIDIA PC

**You are a fresh Claude session on Hiren's NVIDIA PC (24 GB VRAM, Windows).** This branch,
`judge-host`, is your whole job. Start by typing `realign` — the repo is pinned to the Engram
project `strawberry-studio`, and the thread `judge-host` carries the goal and exit condition.
If Engram is not reachable from this machine, everything you need is in this file.

## Read first
- **The contract (source of truth):** Engram `projects/strawberry-studio/specs/2026-09-image-judge-host.md`.
  A copy of its essentials is below; if they ever differ, Engram wins.
- Why this exists: Engram `projects/strawberry-studio/decisions/2026-09-23-blind-review-and-open-judges.md`
  and `RESEARCH_2026-09-23_image_judges.md` in this repo.
- The test data: `autoloop/semif/frames.jsonl` (208 questions, 8 frames, image paths relative to
  the repo root), `autoloop/semif/plan.json`, and `autoloop/semif/compare.py` (reads your output).

## Build
One FastAPI service `judge_host/` on `127.0.0.1:8001`, the only thing exposed:
- `GET /health` → GPU name, VRAM used/total, both model names.
- `POST /judge` `{image: base64, questions: [{id, text}], context?}` →
  `{model, answers: [{id, p_yes, p_no, ms}], image_ms, total_ms}`. Backed by **Qwen3-VL-8B on
  vLLM** at `127.0.0.1:8000` (OpenAI API): temperature 0, `max_tokens=1`, `logprobs` on; P(yes)
  and P(no) from next-token probabilities, summed over case/space variants, renormalised. Never
  generate prose. Send the image once per request so prefix caching makes extra questions cheap.
- `POST /locate` `{image, nouns: [..], threshold?, masks?}` →
  `{model, results: [{noun, count, instances: [{box: [x0,y0,x1,y1], score, mask_rle}]}], total_ms}`.
  Backed by **SAM 3**.
- Auth on every endpoint: `Authorization: Bearer <JUDGE_API_KEY>`, key in an env file on this PC,
  never in git. 401 otherwise.
- Expose through Cloudflare. Proposed hostname `judge.metalfinger.xyz` — confirm with Hiren.

## Acceptance tests (not done until all pass)
1. `/health` through the public hostname returns the GPU and both models.
2. Any request without the key → 401, **through the tunnel**.
3. `/judge`, one frame, 5 questions → 5 answers, `p_yes + p_no ≈ 1`.
4. `/locate` on the "Talking by the autoclave" frame (`1c16c6f7…png`) with `["woman","autoclave"]` → ≥1 box each.
5. Run all 208 questions of `autoloop/semif/frames.jsonl` through `/judge`; write
   `autoloop/semif/results_qwen.jsonl`, one line per question:
   `{"id": "<same id>", "yes": p_yes, "no": p_no, "ms": ms}`. Commit and push on this branch.
6. Timing table: `/judge` image cost, per-question cost, total for a 26-question frame; `/locate`
   per call with 4 nouns. Post it on the Engram thread `judge-host` and in the commit message.

## Hard constraints
- **vLLM does not run on native Windows** — WSL2 (Ubuntu) or Docker with GPU passthrough.
- **Share the 24 GB**: `--gpu-memory-utilization 0.75`, or an FP8/AWQ Qwen3-VL-8B, so SAM 3 fits.
- **This may be the main PC that runs the `my-pc` Cloudflare tunnel for Engram
  (engram.metalfinger.xyz) and the Survey MCP (mcp.metalfinger.xyz).** If so: add an ingress
  hostname to that tunnel — no second tunnel, and no restart of the tunnel service without
  confirming Engram and Survey come back. **Ask Hiren before editing that tunnel's config or
  touching DNS.** Breaking it takes Engram down.
- Never expose vLLM or SAM 3 directly; bind them to localhost.
- Don't touch `.env` files, and don't change `backend/studio` — the Mac session owns the harness
  client and builds against the same contract.
- Commit prefixes `feat:`/`fix:`/`docs:`/`build:`/`test:`/`chore:`. Push only this branch.

## Out of scope
Crop-then-judge pipelines, two-image questions, calibration, and wiring into the engine gate.
