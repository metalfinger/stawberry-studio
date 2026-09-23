#!/usr/bin/env bash
# Qwen3-VL-8B (W8A8 INT8) on GPU 0 only, localhost only. Never exposed; judge-host fronts it.
set -euo pipefail
cd "$HOME/judge-host"
export CUDA_VISIBLE_DEVICES=0
# FlashInfer's top-k/top-p sampler JIT-compiles with nvcc, which WSL has no toolkit for;
# judging is greedy (temperature 0), so the PyTorch sampler costs nothing.
export VLLM_USE_FLASHINFER_SAMPLER=0
exec vllm-env/bin/vllm serve "$HOME/models/qwen3-vl-8b-w8a8" \
  --served-model-name amd/Qwen3-VL-8B-Instruct-w8a8-llmcompressor \
  --host 127.0.0.1 --port 8000 \
  --gpu-memory-utilization "${VLLM_GPU_UTIL:-0.65}" \
  --max-model-len 4096 \
  --max-logprobs 20 \
  --limit-mm-per-prompt '{"image": 1, "video": 0}' \
  --enable-prefix-caching \
  --max-num-seqs 32
