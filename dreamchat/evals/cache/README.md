# Paid-reading caches

Copies of the caches the evals build under `runs/` (which git ignores), so another machine or a new session can
rerun every eval without paying for the same Jev and writer calls again. Each is the union of every copy that
existed on 29 Sep 2026; where two copies disagreed on a key, the main checkout's answer was kept.

Restore before running evals:

    cd dreamchat
    mkdir -p runs/prompt-cases runs/listening
    cp evals/cache/implied-cache.json runs/implied-cache.json
    cp evals/cache/typed-cache.json runs/typed-cache.json
    cp evals/cache/prompt-cases-jev-cache.json runs/prompt-cases/jev-cache.json
    cp evals/cache/listening-jev-cache.json runs/listening/jev-cache.json
    cp evals/cache/cast-cache.json runs/cast-cache.json
