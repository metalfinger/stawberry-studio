#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -x venv/bin/python ]]; then
  printf 'The project virtual environment is missing. Install the backend first.\n' >&2
  exit 1
fi
exec venv/bin/python -m backend.studio start "$@"
