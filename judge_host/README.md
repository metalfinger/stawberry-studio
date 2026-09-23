# judge-host: running it

The contract is Engram `projects/strawberry-studio/specs/2026-09-image-judge-host.md`; the job is
`BRIEF.md`. This file covers operating the service on the NVIDIA PC.

```
https://judge.metalfinger.xyz  (my-pc tunnel, ingress -> 127.0.0.1:8001)
  judge-host  FastAPI + SAM 3 (GPU 0)   WSL judge-env   127.0.0.1:8001   app.py
  vLLM        the judge model           WSL vllm-env    127.0.0.1:8000   never exposed
  GPU 0 = UUID GPU-c5c9552e, bus 01:00.0; GPU 1 = bus 02:00.0 (ComfyUI's card unless Hiren says otherwise)
```

## Which judge model: profiles

`profiles/*.env` set the model, GPUs, tensor parallelism and memory share; `~/judge-host/profile` (in WSL)
names the active one, default `qwen3-vl-8b`.

| profile | model | GPUs | notes |
|---|---|---|---|
| `qwen3-vl-8b` | amd/Qwen3-VL-8B-Instruct-w8a8-llmcompressor (W8A8 INT8) | 0 | 23 Sep baseline, commit 539d933, results_qwen.jsonl |
| `qwen3.5-27b` | Qwen/Qwen3.5-27B-FP8 (block FP8 -> W8A16 Marlin on Ampere) | 0,1 (TP=2) | thinking model; `think` flag on /judge |

Switch: `wsl -d Ubuntu -- bash -c 'echo qwen3-vl-8b > ~/judge-host/profile'`, then run `scripts/stop.sh` and start
the `judge-host-vllm` task, and once vLLM is up, the `judge-host-api` task. Check that GPU 1 is free before using a two-GPU profile.

## Start / stop

Three Windows scheduled tasks under `\judge-host\`. They have no trigger, so start them by hand after a reboot:

```powershell
Start-ScheduledTask -TaskPath '\judge-host\' -TaskName 'cloudflared-my-pc'   # the whole my-pc tunnel
Start-ScheduledTask -TaskPath '\judge-host\' -TaskName 'judge-host-vllm'     # ~1.5 min to ready
Start-ScheduledTask -TaskPath '\judge-host\' -TaskName 'judge-host-api'      # after vLLM is up
```

To stop the two model processes, run `wsl -d Ubuntu -- bash <repo>/judge_host/scripts/stop.sh`. The tunnel task
also carries Engram and every other metalfinger.xyz hostname, so leave it running.
Logs: `~/judge-host/logs/{vllm,api}.log` in WSL, `C:\Users\Admin\.cloudflared\my-pc.log`.

## Setup from scratch

1. `scripts/setup_envs.sh` creates both venvs in WSL. It needs `build-essential` and `python3.12-dev`
   (`wsl -u root -- apt-get install -y build-essential python3.12-dev`), because Triton compiles at startup.
2. `python scripts/fetch_parallel.py ...` on Windows fetches the two big `model.safetensors` into `D:\models-staging`,
   then `scripts/fetch_all.sh` copies them into `~/models` and fetches the small files (see both headers).
3. `scripts/make_key.sh` writes `~/judge-host/judge.env` with `JUDGE_API_KEY`. That file is not in git.
4. `JUDGE_API_KEY=... python judge_host/acceptance.py https://judge.metalfinger.xyz` from the repo root
   runs the six acceptance tests and rewrites `autoloop/semif/results_qwen.jsonl`.

## Things this machine does that you would not guess

- **Downloads.** A single HTTP connection from WSL sags to ~1 MB/s after a burst. Parallel 64 MB range
  requests from Windows hold ~10 MB/s. Every file is checked against the HF sha256.
- **VRAM.** Under WDDM, a process only sees its own allocations: `torch.cuda.mem_get_info` in the API
  misses vLLM, and `nvidia-smi` reports one figure for both cards because they appear as a single
  linked WDDM adapter. `/health` therefore reports this process plus vLLM's fixed budget. The true
  per-card figure is Windows' `\GPU Adapter Memory(*phys_0)\Dedicated Usage`, about 17.7 GB with both
  models loaded.
- **vLLM needs gcc in WSL** (Triton) and runs with `VLLM_USE_FLASHINFER_SAMPLER=0`, because FlashInfer's
  sampler JIT needs nvcc. Decoding is greedy, so the change costs nothing.
- **SAM 3 is prompt-sensitive to rare bare words.** On the autoclave frame, "autoclave" scores 0.0001
  on the correct box and "an autoclave" scores 0.41. `/locate` tries each noun both bare and with an
  article, keeps the better one, and reports it as `prompt`. The default `threshold` is 0.3 (SAM 3's own).
