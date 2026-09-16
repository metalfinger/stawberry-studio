"""Test the prev-cut conditioning heuristic.

Locks the rule that previous-cut images are only chained as references
when the next cut actually continues the prior beat. Stacking prev_cut
as an unconditional slot was the cause of identity drift on cut C2 of
Test 2 (glasses dropped).
"""
from types import SimpleNamespace

from backend.orchestrator.cut_planner import _should_chain_prev_cut


def _ctx(cut: dict, prev: dict | None) -> SimpleNamespace:
    return SimpleNamespace(cut=cut, previous_cut=prev or {})


def test_same_shot_chains_by_default():
    ctx = _ctx({"shot_id": "sh1", "action": "totally new beat"}, {"shot_id": "sh1"})
    assert _should_chain_prev_cut(ctx) is True


def test_different_shot_does_not_chain():
    ctx = _ctx({"shot_id": "sh2", "action": "the camera cuts to a wide"}, {"shot_id": "sh1"})
    assert _should_chain_prev_cut(ctx) is False


def test_continuity_language_chains():
    ctx = _ctx({"shot_id": "sh2", "action": "still frustrated, the director paces"}, {"shot_id": "sh1"})
    assert _should_chain_prev_cut(ctx) is True


def test_match_cut_phrase_chains():
    ctx = _ctx({"shot_id": "sh2", "action": "match cut: hand opens door"}, {"shot_id": "sh1"})
    assert _should_chain_prev_cut(ctx) is True


def test_explicit_off_overrides_same_shot():
    ctx = _ctx(
        {"shot_id": "sh1", "action": "still frustrated", "chain_from_prev": "0"},
        {"shot_id": "sh1"},
    )
    assert _should_chain_prev_cut(ctx) is False


def test_explicit_on_overrides_different_shot():
    ctx = _ctx(
        {"shot_id": "sh2", "action": "completely new", "chain_from_prev": "1"},
        {"shot_id": "sh1"},
    )
    assert _should_chain_prev_cut(ctx) is True
