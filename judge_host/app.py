"""Image-judge host: one authenticated FastAPI service in front of two models on GPU 0.

    /judge   Qwen3-VL-8B on vLLM (127.0.0.1:8000) - P(yes)/P(no) per question from next-token logprobs
    /locate  SAM 3 in-process - boxes, scores, counts (and optional RLE masks) per noun
    /health  GPU name, VRAM, both model names

Contract: Engram projects/strawberry-studio/specs/2026-09-image-judge-host.md.
Run with CUDA_VISIBLE_DEVICES=0 and JUDGE_API_KEY in the environment (see scripts/run_api.sh).
"""
import asyncio
import base64
import hmac
import io
import math
import os
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
DEVICE = "cuda:0"
# vLLM's fixed share of the card (--gpu-memory-utilization). Under WSL/WDDM a process cannot see
# another process's allocations, so /health adds this to what this process sees itself.
VLLM_GPU_UTIL = float(os.environ.get("VLLM_GPU_UTIL", "0.65"))

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


@app.get("/health")
async def health():
    free, total = torch.cuda.mem_get_info(DEVICE)
    used = (total - free) + int(VLLM_GPU_UTIL * total)
    try:
        judge_up = (await http.get("/health")).status_code == 200
    except httpx.HTTPError:
        judge_up = False
    return {
        "ok": judge_up and "model" in sam,
        "gpu": torch.cuda.get_device_name(DEVICE),
        "vram_used_mb": used // 2**20,
        "vram_total_mb": total // 2**20,
        "vram_source": f"this process + vLLM budget ({VLLM_GPU_UTIL:.2f} x total); WDDM hides cross-process use",
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


async def ask(data_uri: str, context: str | None, q: Question) -> dict:
    # Image first, then the shared context, then the question: everything before the question is
    # an identical prefix across the request, so vLLM's prefix cache reuses the image's KV.
    text = (f"{context}\n\n" if context else "") + f"Question: {q.text}\nAnswer with one word: yes or no."
    body = {
        "model": JUDGE_MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": data_uri}},
            {"type": "text", "text": text},
        ]}],
        "temperature": 0,
        "max_tokens": 1,
        "logprobs": True,
        "top_logprobs": TOP_LOGPROBS,
    }
    t0 = time.perf_counter()
    r = await http.post("/v1/chat/completions", json=body)
    r.raise_for_status()
    top = r.json()["choices"][0]["logprobs"]["content"][0]["top_logprobs"]
    p_yes, p_no = yes_no(top)
    return {"id": q.id, "p_yes": p_yes, "p_no": p_no, "ms": ms_since(t0)}


@app.post("/judge")
async def judge(req: JudgeRequest):
    t0 = time.perf_counter()
    _, data_uri = decode_image(req.image)
    if not req.questions:
        return {"model": JUDGE_MODEL, "answers": [], "image_ms": 0, "total_ms": ms_since(t0)}
    # The first question pays for encoding the image and filling the cache; the rest run
    # concurrently against the cached prefix.
    first = await ask(data_uri, req.context, req.questions[0])
    rest = await asyncio.gather(*(ask(data_uri, req.context, q) for q in req.questions[1:]))
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
    return results


@app.post("/locate")
async def locate(req: LocateRequest):
    t0 = time.perf_counter()
    img, _ = decode_image(req.image)
    async with sam_lock:
        results = await asyncio.to_thread(run_sam3, img, req.nouns, req.threshold, req.masks)
    return {"model": LOCATOR_MODEL, "results": results, "total_ms": ms_since(t0)}
