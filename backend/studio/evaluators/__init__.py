"""Deterministic local scorers. No model calls.

Each scorer reads the store, computes a score with local code, and records it through
`Studio.evaluate` as an ordinary evaluation bound to the image's current review context.
Only `duplicate` ships in the core runtime (Pillow only). Scorers that need torch —
subject-cropped identity similarity and cross-panel scene diversity — belong to the
optional eval extra and are not part of this package yet.
"""
