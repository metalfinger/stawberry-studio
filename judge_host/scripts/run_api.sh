#!/usr/bin/env bash
# The judge-host FastAPI service (+ SAM 3 in-process) on GPU 0, localhost:8001.
# JUDGE_API_KEY comes from ~/judge-host/judge.env, which is never in git; the model name and
# GPU set come from the same profile run_vllm.sh uses.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
profile="$(cat "$HOME/judge-host/profile" 2>/dev/null || echo qwen3-vl-8b)"
set -a; . "$here/../profiles/$profile.env"; . "$HOME/judge-host/judge.env"; set +a
cd "$HOME/judge-host"
# SAM 3 lives on GPU 0; the judge's GPUs are listed for /health only.
export CUDA_VISIBLE_DEVICES="$GPUS"
exec judge-env/bin/uvicorn app:app --app-dir "$here/.." --host 127.0.0.1 --port 8001 --workers 1
