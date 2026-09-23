#!/usr/bin/env bash
# Download a Hugging Face repo with curl (resumable) and verify every LFS file's
# size and sha256 against the HF API. hf_xet hangs silently on this machine, and a
# single curl connection can degrade to ~1 MB/s, so a stalled transfer is aborted
# (below 2 MB/s for 30 s) and resumed on a fresh connection.
# usage: fetch_model.sh <repo_id> <dest_dir>   (HF_TOKEN in env for gated repos;
#        SKIP=<regex> leaves out matching paths, e.g. weights fetched by fetch_parallel.py)
set -euo pipefail
repo="$1"; dest="$2"; mkdir -p "$dest"
# The auth header goes through a file so the token never shows in the process list.
hdr="$(mktemp)"; trap 'rm -f "$hdr"' EXIT; chmod 600 "$hdr"
[ -n "${HF_TOKEN:-}" ] && echo "Authorization: Bearer $HF_TOKEN" > "$hdr"
curl -sfL -H @"$hdr" "https://huggingface.co/api/models/$repo/tree/main?recursive=true" \
  | python3 -c 'import sys,json
for f in json.load(sys.stdin):
    if f["type"]=="file":
        l=f.get("lfs") or {}
        print(f["path"], f.get("size",0), l.get("oid",""))' > "$dest/.manifest"
while read -r path size oid; do
  if [ -n "${SKIP:-}" ] && [[ "$path" =~ $SKIP ]]; then continue; fi
  out="$dest/$path"; mkdir -p "$(dirname "$out")"
  if [ -f "$out" ] && [ "$(stat -c%s "$out")" = "$size" ]; then continue; fi
  echo "fetch $path ($size bytes)"
  for attempt in $(seq 1 200); do
    have=$( [ -f "$out.part" ] && stat -c%s "$out.part" || echo 0 )
    [ "$have" = "$size" ] && break
    curl -sL -C - -H @"$hdr" --speed-limit 2000000 --speed-time 30 \
      -o "$out.part" "https://huggingface.co/$repo/resolve/main/$path" < /dev/null || true
  done
  got=$(stat -c%s "$out.part")
  [ "$got" = "$size" ] || { echo "SIZE MISMATCH $path: $got != $size"; exit 1; }
  if [ -n "$oid" ]; then
    sum=$(sha256sum "$out.part" | cut -d' ' -f1)
    [ "$sum" = "$oid" ] || { echo "SHA MISMATCH $path"; rm -f "$out.part"; exit 1; }
  fi
  mv "$out.part" "$out"
  echo "ok $path"
done < "$dest/.manifest"
echo "OK $repo -> $dest"
