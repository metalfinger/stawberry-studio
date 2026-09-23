#!/usr/bin/env bash
# Fetch both judge models into ~/models (WSL). Reads the HF token from the Windows cache.
# The two big weight files are downloaded on the Windows side first (fetch_parallel.py ->
# D:\models-staging, ~10x faster than a single WSL connection here) and copied in; this
# script then fetches the small config/tokenizer files. SAM 3's duplicate sam3.pt is skipped.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export HF_TOKEN="$(cat /mnt/c/Users/Admin/.cache/huggingface/token)"
stage=/mnt/d/models-staging
for m in qwen3-vl-8b-w8a8 sam3; do
  mkdir -p "$HOME/models/$m"
  [ -f "$stage/$m/model.safetensors" ] && [ ! -f "$HOME/models/$m/model.safetensors" ] \
    && cp "$stage/$m/model.safetensors" "$HOME/models/$m/"
done
rm -f "$HOME/models/qwen3-vl-8b-w8a8/model.safetensors.part"
SKIP='^model\.safetensors$' bash "$here/fetch_model.sh" amd/Qwen3-VL-8B-Instruct-w8a8-llmcompressor "$HOME/models/qwen3-vl-8b-w8a8"
SKIP='^(model\.safetensors|sam3\.pt)$' bash "$here/fetch_model.sh" facebook/sam3 "$HOME/models/sam3"
ls -la "$HOME/models"/*/model.safetensors
