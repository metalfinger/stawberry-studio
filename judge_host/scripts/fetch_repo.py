"""Fetch a whole Hugging Face repo into a Windows folder: big files through fetch_parallel.py
(parallel ranges + sha256), small files directly. Re-runnable; finished files are skipped.

    python fetch_repo.py <repo_id> <dest_dir>
"""
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

repo, dest = sys.argv[1], Path(sys.argv[2])
token = (Path.home() / ".cache/huggingface/token").read_text().strip()
auth = {"Authorization": f"Bearer {token}"}
tree = json.load(urllib.request.urlopen(urllib.request.Request(
    f"https://huggingface.co/api/models/{repo}/tree/main?recursive=true", headers=auth)))
here = Path(__file__).parent
for f in (x for x in tree if x["type"] == "file"):
    out = dest / f["path"]
    if out.exists() and out.stat().st_size == f["size"]:
        continue
    lfs = f.get("lfs")
    if lfs and f["size"] > 64 * 2**20:
        subprocess.run([sys.executable, "-u", str(here / "fetch_parallel.py"), repo, f["path"], str(out),
                        str(f["size"]), lfs["oid"]], check=True)
    else:
        out.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(f"https://huggingface.co/{repo}/resolve/main/{f['path']}", headers=auth)
        out.write_bytes(urllib.request.urlopen(req, timeout=120).read())
        print("ok", f["path"], flush=True)
print("OK", repo, "->", dest)
