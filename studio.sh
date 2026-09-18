#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python="${STRAWBERRY_PYTHON:-venv/bin/python}"
if [[ ! -x "$python" ]]; then
  printf 'The Studio Python environment is missing. Run ./install-studio.sh first.\n' >&2
  exit 1
fi
if [[ ! -d frontend/node_modules ]]; then
  printf 'Frontend dependencies are missing. Run ./install-studio.sh first.\n' >&2
  exit 1
fi
exec "$python" -m backend.studio start "$@"
