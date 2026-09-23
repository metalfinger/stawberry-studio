# Running the SemIf image-judge test on the NVIDIA PC

**What this tests:** can an open model that reads yes/no probabilities from an image — SemIf, a
community "vision Jev" on Qwen3.5-4B — judge our frames more like the blind evaluator than like
Claude did? 208 questions across the 8 frames that were reviewed blind.

**Needs:** an NVIDIA GPU with at least 10 GB free VRAM (the 4B model is about 8 GB in BF16), about
15 GB of disk for the model download, Python 3.10+. SemIf's README does not mention Windows, so run it
in **WSL2 (Ubuntu)**, which has CUDA passthrough. Native Windows may work but is untested.

## 1. One-time setup (in WSL2 Ubuntu)

```bash
# check the GPU is visible from WSL
nvidia-smi

# the repo, on this branch
git clone <your stawberry-studio remote> stawberry-studio && cd stawberry-studio
git checkout lab/agent-portability && git pull

# SemIf, beside it
cd .. && git clone https://github.com/jiangxiluning/Visual-Jev semif && cd semif
python3 -m venv .venv && source .venv/bin/activate
# install the CUDA build of PyTorch first — pick the line for your CUDA version at https://pytorch.org/get-started/locally/
pip install torch --index-url https://download.pytorch.org/whl/cu128
pip install -e '.[test]'
```

## 2. Run it (about 5–10 minutes, most of it the first model download)

```bash
cd ~/stawberry-studio            # paths in frames.jsonl are relative to the repo root
source ~/semif/.venv/bin/activate
CUDA_VISIBLE_DEVICES=0 semif-score \
  --mode direct \
  --model Qwen/Qwen3.5-4B \
  --revision 851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a \
  --input autoloop/semif/frames.jsonl \
  --output autoloop/semif/results.jsonl
```

## 3. Send the results back

```bash
git add autoloop/semif/results.jsonl
git commit -m "test: SemIf answers for the eight blind-reviewed frames"
git push
```

Then on the Mac: `git pull` and
`PYTHONPATH=. venv/bin/python autoloop/semif/compare.py autoloop/semif/results.jsonl`.

The line that matters is **"On the N questions where host and blind DISAGREED — SemIf sides with
…"**. If it sides with the blind evaluator most of the time, it's a real replacement for Claude as
the judge. If it sides with Claude, it has the same generosity.

## What this first run leaves out, on purpose

- Questions that need a second image (matches a reference sheet, continues the previous frame).
  SemIf takes one image per row; those come next, on a side-by-side canvas.
- Crops. It judges the whole frame, which is the fair comparison with how the blind evaluator was
  *scored* but not with how it *looked*. SAM 3 crops are the second experiment.
- Calibration. Raw probabilities first; calibrating them needs more labelled frames than eight.
