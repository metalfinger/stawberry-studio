#!/usr/bin/env bash
# Stop the judge host's two processes (vLLM and the API) inside WSL.
pkill -f "vllm serve" || true
pkill -f "uvicorn app:app" || true
sleep 3
pgrep -fa "vllm serve|uvicorn app:app" >/dev/null && echo "still running" || echo "stopped"
