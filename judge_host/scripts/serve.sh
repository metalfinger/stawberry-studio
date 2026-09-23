#!/usr/bin/env bash
# Entry point for the Windows scheduled tasks: serve.sh vllm|api, logging to ~/judge-host/logs.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HOME/judge-host/logs"
case "$1" in
  vllm) exec bash "$here/run_vllm.sh" >> "$HOME/judge-host/logs/vllm.log" 2>&1 ;;
  api)  exec bash "$here/run_api.sh"  >> "$HOME/judge-host/logs/api.log"  2>&1 ;;
  *) echo "usage: serve.sh vllm|api"; exit 2 ;;
esac
