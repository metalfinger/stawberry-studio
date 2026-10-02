"""The packet contract's stable ids and version 7 to version 8 mapping, in Python: the twin of contract.ts that
test/packet-contract.test.ts holds equal to it, byte for byte, on every saved dream (docs/packet-contract.md).

    python3 packet_contract.py v8 < packet.v7.json > packet.v8.json   # a version 7 packet as version 8
    python3 packet_contract.py words < words.json                     # each string's plain words and hash, as JSON
"""

import bisect
import hashlib
import json
import os
import re
import sys
import unicodedata

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "packet-chars.json"), encoding="utf-8") as f:
    _CHARS = json.load(f)
# Unicode 15.0's letters, marks and digits, as inclusive [first, last] code point ranges.
_RANGES = _CHARS["ranges"]
_STARTS = [a for a, _ in _RANGES]
_APOSTROPHE = 0x27
_LIKE_APOSTROPHES = {0x27, 0x2018, 0x2019, 0x60}

CONTRACT_FIELDS = [
    "camera", "world_at", "told_facts", "presence", "actions", "attention", "turns_on", "refs", "readiness",
    "must_show", "must_be_absent", "identity_marks", "counts", "relations", "scale", "beat", "after", "dial",
]


def _kept(cp):
    i = bisect.bisect_right(_STARTS, cp) - 1
    return i >= 0 and cp <= _RANGES[i][1]


def _only_kept(s, also):
    return "".join(ch if _kept(ord(ch)) or also(ord(ch)) else " " for ch in s)


def plain_words(x):
    """A moment's words as its id hashes them (contract.ts plainWords)."""
    s = _only_kept(x, lambda cp: cp in _LIKE_APOSTROPHES)
    s = unicodedata.normalize("NFC", s).lower()
    s = s.replace("‘", "'").replace("’", "'").replace("`", "'")
    s = _only_kept(s, lambda cp: cp == _APOSTROPHE)
    return re.sub(" +", " ", s).strip(" ")


def words_hash(words):
    return hashlib.sha256(plain_words(words).encode("utf-8")).hexdigest()[:6]


def stable_id(scene, place, ordinal, words, taken, collisions):
    base = f"{scene or '-'}/{place or '-'}/{ordinal}-{words_hash(words)}"
    if base not in taken:
        taken.add(base)
        return base
    k = 2
    while f"{base}~{k}" in taken:
        k += 1
    collisions.append(f"{base} -> {base}~{k}")
    taken.add(f"{base}~{k}")
    return f"{base}~{k}"


def place_of(cut):
    for e in cut["who"]["inView"]:
        if e["kind"] == "location":
            return e["id"]
    return "-"


def moment_words(cut):
    point = cut["story"]["point"]
    return f"{cut['story']['action']} {'' if point is None else point}"


def stable_ids(pk):
    ordinals, taken = {}, set()
    out = {"moments": {}, "cuts": {}, "collisions": []}
    for c in sorted(pk["cuts"], key=lambda c: c["identity"]["order"]):
        scene = c["identity"]["scene"] or "-"
        place = place_of(c)
        n = ordinals.get((scene, place), 0) + 1
        ordinals[(scene, place)] = n
        mid = stable_id(scene, place, n, moment_words(c), taken, out["collisions"])
        out["moments"][c["identity"]["cut"]] = mid
        out["cuts"][c["identity"]["cut"]] = f"{mid}.1"
    return out


def to_v8(pk, moved=None):
    """A version 7 packet as version 8 (contract.ts toV8); `moved` the aliases only Dream Chat's id history has."""
    ids = stable_ids(pk)
    cam_of = {}
    for pl in pk["places"]:
        for cam in pl["cameras"]:
            for cut in cam["cuts"]:
                cam_of.setdefault(cut, {"eye": cam["eye"], "through": cam["through"]})
    cuts = []
    for c in pk["cuts"]:
        cid = c["identity"]["cut"]
        contract = {
            "id": ids["cuts"][cid],
            "moment": ids["moments"][cid],
            "scene": c["identity"]["scene"],
            "shot": c["identity"]["shot"],
            **{f: None for f in CONTRACT_FIELDS},
            "basis": {f: "unknown" for f in CONTRACT_FIELDS},
        }
        own = c["camera"]["eye"]
        cam = cam_of.get(cid)
        eye = own if own is not None else (cam["eye"] if cam else None)
        if eye is not None:
            through = ids["cuts"].get(cam["through"]) if own is None and cam and cam["through"] != cid else None
            contract["camera"] = {"role": None, "eye": eye, "lens": eye.get("lens"), "through": through}
            contract["basis"]["camera"] = "derived"
        turned = [e for e in c["who"]["inView"] if e.get("facing")]
        if turned:
            contract["attention"] = [
                {
                    "entity": e["id"],
                    "facing": {"view": e["facing"]["view"], "side": e["facing"]["side"]},
                    "gaze_at": None,
                    "expression": None,
                    "basis": "derived",
                    "by": "code.previs.facingOf",
                }
                for e in turned
            ]
            contract["basis"]["attention"] = "derived"
        cuts.append({**c, "contract": contract})
    return {
        **pk,
        "version": 8,
        "aliases": {**ids["cuts"], **(moved or {})},
        "collisions": ids["collisions"],
        "world": None,
        "tree": None,
        "basis": {"world": "unknown", "tree": "unknown"},
        "cuts": cuts,
    }


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else ""
    given = json.load(sys.stdin)
    if what == "v8":
        json.dump(to_v8(given), sys.stdout, ensure_ascii=False)
    elif what == "words":
        json.dump([{"plain": plain_words(w), "hash": words_hash(w)} for w in given], sys.stdout, ensure_ascii=False)
    else:
        sys.exit("usage: packet_contract.py v8|words < input.json")
