#!/usr/bin/env bash
# Two venvs in WSL, both separate from ComfyUI's Windows env:
#   vllm-env  - vLLM serving Qwen3-VL-8B
#   judge-env - the FastAPI service + SAM 3 (transformers)
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
mkdir -p "$HOME/judge-host" && cd "$HOME/judge-host"
[ -d vllm-env ] || uv venv -q --python 3.12 vllm-env
VIRTUAL_ENV=vllm-env uv pip install -q vllm
vllm-env/bin/python -c "import vllm, torch, transformers; print('vllm-env', vllm.__version__, torch.__version__, torch.version.cuda, transformers.__version__)"
[ -d judge-env ] || uv venv -q --python 3.12 judge-env
VIRTUAL_ENV=judge-env uv pip install -q torch torchvision transformers accelerate fastapi "uvicorn[standard]" httpx pillow numpy pycocotools
judge-env/bin/python -c "import torch, transformers; from transformers import Sam3Model; print('judge-env', torch.__version__, torch.version.cuda, transformers.__version__)"
