"""Download one large Hugging Face file with parallel range requests, then verify sha256.

    python fetch_parallel.py <repo_id> <path_in_repo> <dest_file> <size> <sha256>

Used for the big safetensors because a single connection from this machine degrades to
~1 MB/s after a burst. Stdlib only; the token is read from the HF cache, never printed.
Chunks already fully written (tracked in <dest>.done) are skipped on re-run.
"""
import hashlib
import os
import sys
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

repo, path, dest, size, sha = sys.argv[1], sys.argv[2], Path(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
CHUNK, WORKERS = 64 * 2**20, 8
token = (Path.home() / ".cache/huggingface/token").read_text().strip()
url = f"https://huggingface.co/{repo}/resolve/main/{path}"

dest.parent.mkdir(parents=True, exist_ok=True)
part = dest.with_name(dest.name + ".part")
done_log = dest.with_name(dest.name + ".done")
if not part.exists():
    with open(part, "wb") as f:
        f.truncate(size)
done = set(int(x) for x in done_log.read_text().split()) if done_log.exists() else set()
lock = threading.Lock()
got = [0]


def fetch(start):
    end = min(start + CHUNK, size) - 1
    for attempt in range(50):
        try:
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Range": f"bytes={start}-{end}"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            if len(data) != end - start + 1:
                raise IOError(f"short read {len(data)}")
            with open(part, "r+b") as f:
                f.seek(start)
                f.write(data)
            with lock:
                with open(done_log, "a") as log:
                    log.write(f"{start}\n")
                got[0] += len(data)
            return
        except Exception as e:  # noqa: BLE001 - retry any network failure on a fresh connection
            time.sleep(min(2 * (attempt + 1), 20))
    raise RuntimeError(f"chunk {start} failed")


todo = [s for s in range(0, size, CHUNK) if s not in done]
print(f"{dest.name}: {len(todo)} of {len(range(0, size, CHUNK))} chunks to fetch", flush=True)
t0 = time.time()
stop = threading.Event()


def report():
    while not stop.wait(30):
        print(f"  {got[0] / 2**20:.0f} MB this run, {got[0] / 2**20 / (time.time() - t0):.1f} MB/s", flush=True)


threading.Thread(target=report, daemon=True).start()
with ThreadPoolExecutor(WORKERS) as pool:
    list(pool.map(fetch, todo))
stop.set()

h = hashlib.sha256()
with open(part, "rb") as f:
    while block := f.read(16 * 2**20):
        h.update(block)
if h.hexdigest() != sha:
    sys.exit(f"SHA MISMATCH {dest.name}")
os.replace(part, dest)
done_log.unlink()
print(f"OK {dest} ({size} bytes, sha256 verified, {time.time() - t0:.0f} s)")
