#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
bootstrap_python="${STRAWBERRY_BOOTSTRAP_PYTHON:-python3}"

if [[ ! -x venv/bin/python ]]; then
  "$bootstrap_python" -m venv venv
fi

venv/bin/python -m pip install -r requirements-studio.txt
npm ci --prefix frontend

printf '\nStrawberry Studio dependencies installed. Start with ./studio.sh\n'
