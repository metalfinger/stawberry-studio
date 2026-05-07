"""Per-model LLM cost table.

Pricing per 1M tokens (USD). Conservative defaults that round up rather
than down — we'd rather over-report than surprise the user with a bill.
Update this table whenever provider pricing changes.

If the model isn't recognized, falls back to a mid-tier default
($1.50 / $7.50) so unknown models still register a non-zero cost.
"""
from __future__ import annotations

# Each entry: (input_per_M, output_per_M)
_TABLE: dict[str, tuple[float, float]] = {
    # Google
    "gemini-3-pro-preview": (1.25, 10.0),
    "gemini-3-pro-image-preview": (0.0, 0.0),  # billed per image, not tokens
    "gemini-2.5-pro": (1.25, 10.0),
    "gemini-2.5-pro-preview": (1.25, 10.0),
    "gemini-2.5-flash": (0.30, 2.50),
    "gemini-2.5-flash-image": (0.0, 0.0),
    # Moonshot
    "kimi-k2-turbo-preview": (0.60, 2.50),
    "kimi-k2": (0.60, 2.50),
    # Anthropic
    "claude-opus-4-7": (15.0, 75.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-haiku-4-5": (0.80, 4.0),
    # OpenAI
    "gpt-4.1": (2.0, 8.0),
    "gpt-4o": (2.50, 10.0),
    "gpt-4o-mini": (0.15, 0.60),
}

_DEFAULT = (1.50, 7.50)


def cost_for(model: str | None, input_tokens: int, output_tokens: int) -> float:
    """Return USD cost for a single LLM turn."""
    if not model:
        in_rate, out_rate = _DEFAULT
    else:
        m = model.lower()
        in_rate, out_rate = _TABLE.get(m, _DEFAULT)
        if (in_rate, out_rate) == _DEFAULT:
            # Try a prefix match (e.g. 'gemini-2.5-pro-001' → 'gemini-2.5-pro').
            for key, rates in _TABLE.items():
                if m.startswith(key):
                    in_rate, out_rate = rates
                    break
    return (input_tokens or 0) * in_rate / 1_000_000 + (output_tokens or 0) * out_rate / 1_000_000
