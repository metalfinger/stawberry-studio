#!/usr/bin/env bash
# The judge model on vLLM, localhost only; judge-host fronts it. Which model is set by the
# profile named in ~/judge-host/profile (default qwen3-vl-8b); see judge_host/profiles/.
#   restore the 8B baseline:  echo qwen3-vl-8b > ~/judge-host/profile, then restart both tasks
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
profile="$(cat "$HOME/judge-host/profile" 2>/dev/null || echo qwen3-vl-8b)"
set -a; . "$here/../profiles/$profile.env"; set +a
cd "$HOME/judge-host"
export CUDA_VISIBLE_DEVICES="$GPUS"
# FlashInfer's top-k/top-p sampler JIT-compiles with nvcc, which WSL has no toolkit for;
# judging is greedy (temperature 0), so the PyTorch sampler costs nothing.
export VLLM_USE_FLASHINFER_SAMPLER=0
# NCCL's cuMem allocator fails under WSL ("unhandled cuda error" at init); the legacy path works.
export NCCL_CUMEM_ENABLE=0
# shellcheck disable=SC2086
exec vllm-env/bin/vllm serve "$MODEL_PATH" \
  --served-model-name "$JUDGE_MODEL" \
  --host 127.0.0.1 --port 8000 \
  --tensor-parallel-size "$TP" \
  --gpu-memory-utilization "$VLLM_GPU_UTIL" \
  --max-model-len "$MAX_MODEL_LEN" \
  --max-logprobs 20 \
  --limit-mm-per-prompt '{"image": 1, "video": 0}' \
  --enable-prefix-caching \
  --max-num-seqs 32 $EXTRA_ARGS
