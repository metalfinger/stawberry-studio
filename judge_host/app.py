"""Image-judge host: one authenticated FastAPI service in front of two models.

    /judge   the judge VLM on vLLM (127.0.0.1:8000) - P(yes)/P(no) per question from next-token
             logprobs; optional "think": reason first, then read the answer token
    /locate  SAM 3 in-process on GPU 0 - boxes, scores, counts (and optional RLE masks) per noun
    /health  per-GPU VRAM (WDDM counters), both model names

Which judge model, and on which GPUs, comes from a profile (profiles/*.env via scripts/run_*.sh).
Contract: Engram projects/strawberry-studio/specs/2026-09-image-judge-host.md ("As built").
"""
import asyncio
import base64
import hmac
import io
import math
import os
import re
import subprocess
import time

import httpx
import torch
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel

API_KEY = os.environ["JUDGE_API_KEY"]
VLLM_URL = os.environ.get("VLLM_URL", "http://127.0.0.1:8000")
JUDGE_MODEL = os.environ.get("JUDGE_MODEL", "amd/Qwen3-VL-8B-Instruct-w8a8-llmcompressor")
SAM3_PATH = os.environ.get("SAM3_PATH", os.path.expanduser("~/models/sam3"))
LOCATOR_MODEL = "facebook/sam3"
DEVICE = "cuda:0"  # SAM 3; the judge's GPUs are whatever CUDA_VISIBLE_DEVICES lists (see profiles/)
THINK_TOKENS = int(os.environ.get("THINK_TOKENS", "512"))  # reasoning cap for "think": true
POWERSHELL = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"

YES, NO = "yes", "no"
TOP_LOGPROBS = 20

app = FastAPI(title="judge-host", docs_url=None, redoc_url=None, openapi_url=None)
http = httpx.AsyncClient(base_url=VLLM_URL, timeout=300)
sam = {}  # model, processor - loaded at startup
sam_lock = asyncio.Lock()  # one SAM 3 forward pass at a time on the GPU


@app.middleware("http")
async def require_key(request: Request, call_next):
    """Every path, including /health and unknown ones, needs the bearer key."""
    got = request.headers.get("authorization", "")
    if not hmac.compare_digest(got.encode(), f"Bearer {API_KEY}".encode()):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return await call_next(request)


@app.on_event("startup")
def load_sam3():
    from transformers import Sam3Model, Sam3Processor

    sam["processor"] = Sam3Processor.from_pretrained(SAM3_PATH)
    sam["model"] = Sam3Model.from_pretrained(SAM3_PATH, torch_dtype=torch.bfloat16).to(DEVICE).eval()


def decode_image(b64: str) -> tuple[Image.Image, str]:
    """Returns the image and a data URI for vLLM (the original bytes, so every question shares one hash)."""
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    img = Image.open(io.BytesIO(raw))
    mime = "image/png" if img.format == "PNG" else "image/jpeg"
    return img.convert("RGB"), f"data:{mime};base64,{b64}"


def ms_since(t0: float) -> int:
    return round((time.perf_counter() - t0) * 1000)


def wddm_used_mb() -> dict[int, int] | None:
    """Per-physical-GPU VRAM in use, from Windows' WDDM counters (via WSL interop). Processes under
    WDDM cannot see each other's allocations, so this is the only whole-card figure on this box.
    The two A5000s appear as one linked adapter with phys_0 / phys_1 = CUDA order (bus 01, 02)."""
    try:
        out = subprocess.run(
            [POWERSHELL, "-NoProfile", "-Command",
             "(Get-Counter '\\GPU Adapter Memory(*)\\Dedicated Usage').CounterSamples | "
             "ForEach-Object { $_.InstanceName + ' ' + [int64]$_.CookedValue }"],
            capture_output=True, text=True, timeout=10).stdout
    except (OSError, subprocess.TimeoutExpired):
        return None
    by_luid: dict[str, dict[int, int]] = {}
    for line in out.splitlines():
        m = re.match(r"luid_(\S+)_phys_(\d+) (\d+)", line.strip())
        if m:
            by_luid.setdefault(m[1], {})[int(m[2])] = int(m[3]) // 2**20
    return max(by_luid.values(), key=len) if by_luid else None


@app.get("/health")
async def health():
    try:
        judge_up = (await http.get("/health")).status_code == 200
    except httpx.HTTPError:
        judge_up = False
    used = await asyncio.to_thread(wddm_used_mb) or {}
    gpus = []
    for i in range(torch.cuda.device_count()):
        props = torch.cuda.get_device_properties(i)
        gpus.append({"index": i, "name": props.name, "vram_used_mb": used.get(i),
                     "vram_total_mb": props.total_memory // 2**20})
    return {
        "ok": judge_up and "model" in sam,
        "gpu": gpus[0]["name"],
        "vram_used_mb": sum(g["vram_used_mb"] or 0 for g in gpus),
        "vram_total_mb": sum(g["vram_total_mb"] for g in gpus),
        "gpus": gpus,
        "vram_source": "Windows WDDM per-card counters (whole card, all processes)",
        "models": {"judge": JUDGE_MODEL if judge_up else None, "locator": LOCATOR_MODEL if "model" in sam else None},
    }


# ---------- /judge ----------

class Question(BaseModel):
    id: str
    text: str


class JudgeRequest(BaseModel):
    image: str
    questions: list[Question]
    context: str | None = None
    think: bool = False


def yes_no(top_logprobs: list[dict]) -> tuple[float, float]:
    """Sum next-token probability over case/space variants of yes and no, renormalised to 1."""
    mass = {YES: 0.0, NO: 0.0}
    for t in top_logprobs:
        word = t["token"].strip().lower()
        if word in mass:
            mass[word] += math.exp(t["logprob"])
    total = mass[YES] + mass[NO]
    if total == 0:
        return 0.5, 0.5
    return mass[YES] / total, mass[NO] / total


async def chat(body: dict) -> dict:
    r = await http.post("/v1/chat/completions", json=body)
    r.raise_for_status()
    return r.json()


def first_word(tokens: list[dict]) -> list[dict] | None:
    """top_logprobs of the first generated token that is not whitespace."""
    return next((t["top_logprobs"] for t in tokens if t["token"].strip()), None)


async def ask(data_uri: str, context: str | None, q: Question, think: bool) -> dict:
    # Image first, then the shared context, then the question: everything before the question is
    # an identical prefix across the request, so vLLM's prefix cache reuses the image's KV.
    text = (f"{context}\n\n" if context else "") + f"Question: {q.text}\nAnswer with one word: yes or no."
    user = {"role": "user", "content": [
        {"type": "image_url", "image_url": {"url": data_uri}},
        {"type": "text", "text": text},
    ]}
    body = {"model": JUDGE_MODEL, "messages": [user], "temperature": 0,
            "logprobs": True, "top_logprobs": TOP_LOGPROBS}
    t0 = time.perf_counter()
    if not think:
        # enable_thinking is ignored by templates without a thinking mode (Qwen3-VL-8B).
        r = await chat({**body, "max_tokens": 1, "chat_template_kwargs": {"enable_thinking": False}})
        p_yes, p_no = yes_no(r["choices"][0]["logprobs"]["content"][0]["top_logprobs"])
        return {"id": q.id, "p_yes": p_yes, "p_no": p_no, "ms": ms_since(t0)}

    # Reason first (capped), then read the answer from the first word after </think>.
    r = await chat({**body, "max_tokens": THINK_TOKENS + 8, "chat_template_kwargs": {"enable_thinking": True}})
    think_ms = ms_since(t0)
    tokens = r["choices"][0]["logprobs"]["content"]
    end = next((i for i, t in enumerate(tokens) if t["token"] == "</think>"), None)
    reasoning = "".join(t["token"] for t in tokens[:end]).strip()
    top = first_word(tokens[end + 1:]) if end is not None else None
    if top is None:
        # The cap cut the reasoning off (or nothing followed it): close the reasoning block and
        # force the answer as the next word.
        assistant = {"role": "assistant", "content": f"<think>\n{reasoning}\n</think>\n\n"}
        r = await chat({**body, "messages": [user, assistant], "max_tokens": 4,
                        "add_generation_prompt": False, "continue_final_message": True})
        top = first_word(r["choices"][0]["logprobs"]["content"])
    p_yes, p_no = yes_no(top or [])
    return {"id": q.id, "p_yes": p_yes, "p_no": p_no, "ms": ms_since(t0),
            "think_ms": think_ms, "reasoning": reasoning, "reasoning_capped": end is None}


@app.post("/judge")
async def judge(req: JudgeRequest):
    t0 = time.perf_counter()
    _, data_uri = decode_image(req.image)
    if not req.questions:
        return {"model": JUDGE_MODEL, "answers": [], "image_ms": 0, "total_ms": ms_since(t0)}
    # The first question pays for encoding the image and filling the cache; the rest run
    # concurrently against the cached prefix.
    first = await ask(data_uri, req.context, req.questions[0], req.think)
    rest = await asyncio.gather(*(ask(data_uri, req.context, q, req.think) for q in req.questions[1:]))
    return {"model": JUDGE_MODEL, "answers": [first, *rest], "image_ms": first["ms"], "total_ms": ms_since(t0)}


# ---------- /locate ----------

class LocateRequest(BaseModel):
    image: str
    nouns: list[str]
    threshold: float = 0.3  # SAM 3's own post-processing default
    masks: bool = False


def rle(mask) -> dict:
    from pycocotools import mask as mask_utils

    enc = mask_utils.encode(mask.cpu().numpy().astype("uint8", order="F"))
    return {"size": enc["size"], "counts": enc["counts"].decode()}


def prompts_for(noun: str) -> list[str]:
    """The noun as given, plus an article form. SAM 3's text encoder can miss a rare bare word:
    on the autoclave frame "autoclave" scores 0.0001 on the right box and "an autoclave" 0.41,
    while common nouns (woman, hand, boot, window) score the same either way."""
    words = noun.strip().split()
    if not words or words[0].lower() in ("a", "an", "the"):
        return [noun]
    return [noun, ("an " if noun[0].lower() in "aeiou" else "a ") + noun]


@torch.inference_mode()
def run_sam3(img: Image.Image, nouns: list[str], threshold: float, masks: bool) -> list[dict]:
    processor, model = sam["processor"], sam["model"]
    # Encode the image once, then prompt it with each noun (and its article form).
    img_inputs = processor(images=img, return_tensors="pt").to(DEVICE)
    vision = model.get_vision_features(pixel_values=img_inputs.pixel_values.to(torch.bfloat16))
    sizes = img_inputs.get("original_sizes").tolist()
    results = []
    for noun in nouns:
        best = None
        for prompt in prompts_for(noun):
            text_inputs = processor(text=prompt, return_tensors="pt").to(DEVICE)
            out = model(vision_embeds=vision, **text_inputs)
            found = processor.post_process_instance_segmentation(
                out, threshold=0.0, mask_threshold=0.5, target_sizes=sizes)[0]
            top = float(found["scores"].max()) if len(found["scores"]) else 0.0
            if best is None or top > best[0]:
                best = (top, prompt, found)
        _, prompt, found = best
        instances = [
            {"box": [round(float(v), 1) for v in box], "score": round(float(score), 4),
             "mask_rle": rle(m) if masks else None}
            for box, score, m in zip(found["boxes"], found["scores"], found["masks"])
            if score >= threshold
        ]
        results.append({"noun": noun, "prompt": prompt, "count": len(instances), "instances": instances})
    # Hand SAM 3's activation memory back: GPU 0 is shared with a slice of the judge model.
    torch.cuda.empty_cache()
    return results


@app.post("/locate")
async def locate(req: LocateRequest):
    t0 = time.perf_counter()
    img, _ = decode_image(req.image)
    async with sam_lock:
        results = await asyncio.to_thread(run_sam3, img, req.nouns, req.threshold, req.masks)
    return {"model": LOCATOR_MODEL, "results": results, "total_ms": ms_since(t0)}
