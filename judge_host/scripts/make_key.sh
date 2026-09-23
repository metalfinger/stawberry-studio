#!/usr/bin/env bash
# Create ~/judge-host/judge.env with a fresh JUDGE_API_KEY, once. Never overwrites.
set -euo pipefail
f="$HOME/judge-host/judge.env"
[ -f "$f" ] && { echo "exists: $f"; exit 0; }
umask 077
echo "JUDGE_API_KEY=$(openssl rand -hex 32)" > "$f"
echo "created: $f"
