#!/usr/bin/env bash
# The judge-host FastAPI service (+ SAM 3 in-process) on GPU 0, localhost:8001.
# JUDGE_API_KEY comes from ~/judge-host/judge.env, which is never in git.
set -euo pipefail
cd "$HOME/judge-host"
set -a; . ./judge.env; set +a
export CUDA_VISIBLE_DEVICES=0
exec judge-env/bin/uvicorn app:app --app-dir "$(cd "$(dirname "$0")/.." && pwd)" \
  --host 127.0.0.1 --port 8001 --workers 1
