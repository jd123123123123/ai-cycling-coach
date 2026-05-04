"""Unit tests for the weekly rationale generator (Phase 7.0, Plan 03).

Coverage:
  1. Simple-mode jargon discipline — 36 phase × block combinations
  2. Technical-mode includes scientific vocabulary
  3. Sentence count in [3, 5] for all phase × block × language combos
  4. Race-week copy — simple and technical
  5. No-event / maintenance copy — both languages
  6. Recovery-week positive framing — no rest-punishment
  7. PMC sentence direction — grows vs. drops
  8. Event sentence presence rules by days_to_event
  9. Determinism — byte-identical on same inputs

No database, no fixtures, no LLM dependency.
"""
from __future__ import annotations

import re

import pytest

from app.services.weekly_rationale import build_weekly_rationale

# ---------------------------------------------------------------------------
# Jargon banned in simple mode (case-insensitive, word-boundary checked)
# ---------------------------------------------------------------------------

_BANNED_SIMPLE = [
    r"\bCTL\b",
    r"\bTSS\b",
    r"\bTSB\b",
    r"\bIF\b",
    r"\bZ[1-7]\b",
    r"\bSeiler\b",
    r"\bMujika\b",
    r"\bIssurin\b",
    r"\bFriel\b",
    r"\bCoggan\b",
    r"\bsweet[- ]spot\b",
    r"\bthreshold\b",
    r"\bVO2\b",
    r"\bpolarized\b",
    r"\bpyramidal\b",
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ALL_PHASES = [
    "offseason", "base1", "base2", "build1", "build2",
    "peak", "taper", "race", "maintenance",
]
_ALL_BLOCKS = ["accumulation", "transmutation", "realization", "recovery"]

# Common keyword arguments — a mid-build, 35-day-out scenario
_BASE_KWARGS = dict(
    block_index_in_meso=1,
    weekly_tss_target=420,
    ctl_now=55.0,
    ctl_delta_7d=3.2,
    days_to_event=35,
    target_event_type="race",
    seiler_z3_pct=0.20,
)


def _count_sentences(text: str) -> int:
    """Count sentence-ending periods in a paragraph, using split logic from plan spec."""
    return len([s for s in text.split(".") if s.strip()])


def _has_jargon(text: str) -> list[str]:
    """Return list of banned tokens that appear in `text` (case-insensitive)."""
    hits = []
    for pattern in _BANNED_SIMPLE:
        if re.search(pattern, text, re.IGNORECASE):
            hits.append(pattern)
    return hits


# ===========================================================================
# Test 1: Simple-mode jargon discipline — parametrized 36 combos
# ===========================================================================

@pytest.mark.parametrize("phase", _ALL_PHASES)
@pytest.mark.parametrize("block", _ALL_BLOCKS)
def test_simple_mode_jargon_discipline(phase: str, block: str) -> None:
    """Simple mode must contain ZERO banned jargon tokens for every phase×block."""
    result = build_weekly_rationale(
        phase=phase,  # type: ignore[arg-type]
        block_position=block,  # type: ignore[arg-type]
        language="simple",
        **_BASE_KWARGS,
    )
    hits = _has_jargon(result)
    assert not hits, (
        f"Jargon found in simple mode ({phase}×{block}): {hits}\n"
        f"Output was: {result!r}"
    )


# ===========================================================================
# Test 2: Technical mode includes scientific vocabulary
# ===========================================================================

def test_technical_mode_includes_jargon() -> None:
    """Technical mode must cite at least one term from {Friel, Issurin, Seiler, CTL, ramp}."""
    result = build_weekly_rationale(
        phase="build1",
        block_position="accumulation",
        language="technical",
        **_BASE_KWARGS,
    )
    scientific_terms = ["Friel", "Issurin", "Seiler", "CTL", "ramp"]
    found = [t for t in scientific_terms if t.lower() in result.lower()]
    assert found, (
        f"Technical mode produced no scientific vocabulary. Output: {result!r}"
    )


# ===========================================================================
# Test 3: Sentence count in [3, 5] for all combos
# ===========================================================================

@pytest.mark.parametrize("phase", _ALL_PHASES)
@pytest.mark.parametrize("block", _ALL_BLOCKS)
@pytest.mark.parametrize("language", ["simple", "technical"])
def test_sentence_count_3_to_5(phase: str, block: str, language: str) -> None:
    """Sentence count must be in [3, 5] for every phase × block × language combo."""
    result = build_weekly_rationale(
        phase=phase,  # type: ignore[arg-type]
        block_position=block,  # type: ignore[arg-type]
        language=language,  # type: ignore[arg-type]
        **_BASE_KWARGS,
    )
    count = _count_sentences(result)
    assert 3 <= count <= 5, (
        f"Sentence count {count} out of [3,5] for {phase}×{block} ({language}).\n"
        f"Output: {result!r}"
    )


# ===========================================================================
# Test 4: Race-week copy (simple)
# ===========================================================================

def test_race_week_copy_simple() -> None:
    """Simple race-week output: mentions 'race week', has 'easy' or 'short', no jargon."""
    result = build_weekly_rationale(
        phase="race",
        block_position="realization",
        block_index_in_meso=2,
        weekly_tss_target=150,
        ctl_now=62.0,
        ctl_delta_7d=-1.5,
        days_to_event=3,
        target_event_type="race",
        seiler_z3_pct=0.05,
        language="simple",
    )
    lower = result.lower()
    assert "race week" in lower, f"'race week' not found in simple output: {result!r}"
    assert "easy" in lower or "short" in lower, (
        f"Neither 'easy' nor 'short' found in race-week simple output: {result!r}"
    )
    hits = _has_jargon(result)
    assert not hits, f"Jargon in race-week simple output: {hits}\n{result!r}"


# ===========================================================================
# Test 5: Race-week copy (technical)
# ===========================================================================

def test_race_week_copy_technical() -> None:
    """Technical race-week output mentions Mujika or taper, plus intensity preserved."""
    result = build_weekly_rationale(
        phase="race",
        block_position="realization",
        block_index_in_meso=2,
        weekly_tss_target=150,
        ctl_now=62.0,
        ctl_delta_7d=-1.5,
        days_to_event=3,
        target_event_type="race",
        seiler_z3_pct=0.05,
        language="technical",
    )
    lower = result.lower()
    has_taper_ref = "mujika" in lower or "taper" in lower
    assert has_taper_ref, (
        f"Expected 'Mujika' or 'taper' in technical race-week output: {result!r}"
    )
    has_intensity = "intensity preserved" in lower or "intensity" in lower
    assert has_intensity, (
        f"Expected 'intensity' in technical race-week output: {result!r}"
    )


# ===========================================================================
# Test 6: No event / maintenance copy
# ===========================================================================

@pytest.mark.parametrize("language", ["simple", "technical"])
def test_no_event_maintenance_copy(language: str) -> None:
    """Maintenance mode: no 'race', 'event', or 'goal' copy."""
    result = build_weekly_rationale(
        phase="maintenance",
        block_position="accumulation",
        block_index_in_meso=0,
        weekly_tss_target=300,
        ctl_now=45.0,
        ctl_delta_7d=0.2,
        days_to_event=None,
        target_event_type="maintenance",
        seiler_z3_pct=0.15,
        language=language,  # type: ignore[arg-type]
    )
    lower = result.lower()
    for forbidden in ("race", "event", "goal"):
        assert forbidden not in lower, (
            f"'{forbidden}' found in maintenance {language} output: {result!r}"
        )
    if language == "simple":
        assert "fit" in lower or "ready" in lower, (
            f"'fit' or 'ready' not found in maintenance simple output: {result!r}"
        )
    else:
        assert "maintenance" in lower, (
            f"'maintenance' not found in technical maintenance output: {result!r}"
        )
        assert "polarized" in lower, (
            f"'polarized' not found in technical maintenance output: {result!r}"
        )


# ===========================================================================
# Test 7: Recovery-week positive framing
# ===========================================================================

def test_recovery_week_positive_framing() -> None:
    """Recovery week in simple mode must use positive framing; no punitive language."""
    result = build_weekly_rationale(
        phase="build1",
        block_position="recovery",
        block_index_in_meso=3,
        weekly_tss_target=280,
        ctl_now=52.0,
        ctl_delta_7d=-1.0,
        days_to_event=56,
        target_event_type="race",
        seiler_z3_pct=0.05,
        language="simple",
    )
    lower = result.lower()

    # Must contain at least one positive signal
    positive_words = ["absorbs", "back-off", "step-down", "lands", "absorb"]
    has_positive = any(w in lower for w in positive_words)
    assert has_positive, (
        f"Recovery-week simple output lacks positive framing. "
        f"Expected one of {positive_words}.\nOutput: {result!r}"
    )

    # Must NOT contain punitive language
    punitive_words = ["missed", "behind", "catch up", "behind schedule"]
    for word in punitive_words:
        assert word not in lower, (
            f"Punitive word '{word}' found in recovery-week simple output: {result!r}"
        )


# ===========================================================================
# Test 8: PMC sentence direction — grows vs. drops
# ===========================================================================

def test_pmc_sentence_grows_vs_drops() -> None:
    """
    Positive ctl_delta → 'climbed', 'grown', 'up', 'ticking', or 'climbing'.
    Negative ctl_delta → 'stepped back', 'settled', 'back', or 'reset'.
    Neither should say 'lost', 'declining', or 'detraining'.
    """
    pos = build_weekly_rationale(
        phase="build1",
        block_position="accumulation",
        block_index_in_meso=1,
        weekly_tss_target=420,
        ctl_now=55.0,
        ctl_delta_7d=3.2,
        days_to_event=35,
        target_event_type="race",
        seiler_z3_pct=0.20,
        language="simple",
    )
    pos_lower = pos.lower()
    positive_signals = ["climbed", "grown", "up", "ticking", "climbing", "nicely", "steady"]
    assert any(s in pos_lower for s in positive_signals), (
        f"Positive delta ({3.2}) simple mode should signal fitness gain. "
        f"Expected one of {positive_signals}. Output: {pos!r}"
    )

    neg = build_weekly_rationale(
        phase="build1",
        block_position="transmutation",
        block_index_in_meso=2,
        weekly_tss_target=350,
        ctl_now=53.0,
        ctl_delta_7d=-2.1,
        days_to_event=35,
        target_event_type="race",
        seiler_z3_pct=0.20,
        language="simple",
    )
    neg_lower = neg.lower()
    negative_signals = ["stepped back", "settled", "back", "reset", "absorbing"]
    assert any(s in neg_lower for s in negative_signals), (
        f"Negative delta ({-2.1}) simple mode should signal planned step-back. "
        f"Expected one of {negative_signals}. Output: {neg!r}"
    )

    # Neither mode should use discouraging language
    for output, label in [(pos, "positive-delta"), (neg, "negative-delta")]:
        for bad in ["lost", "declining", "detraining"]:
            assert bad not in output.lower(), (
                f"Discouraging word '{bad}' found in {label} simple output: {output!r}"
            )


# ===========================================================================
# Test 9: Event sentence presence rules
# ===========================================================================

def test_event_sentence_only_when_relevant() -> None:
    """
    days_to_event=200 → no event sentence (too far).
    days_to_event=35  → event sentence present.
    days_to_event=3   → race-week shape (no generic event sentence).
    """
    event_indicators = ["days away", "days to", "goal is", "your race"]

    # Too far out — no event sentence
    far = build_weekly_rationale(
        phase="build1",
        block_position="accumulation",
        block_index_in_meso=0,
        weekly_tss_target=400,
        ctl_now=48.0,
        ctl_delta_7d=2.0,
        days_to_event=200,
        target_event_type="race",
        seiler_z3_pct=0.20,
        language="simple",
    )
    far_lower = far.lower()
    has_event = any(ind in far_lower for ind in event_indicators)
    assert not has_event, (
        f"Event sentence should be absent at 200 days. Output: {far!r}"
    )

    # 35 days — event sentence should be present
    near = build_weekly_rationale(
        phase="build1",
        block_position="accumulation",
        block_index_in_meso=1,
        weekly_tss_target=420,
        ctl_now=55.0,
        ctl_delta_7d=3.0,
        days_to_event=35,
        target_event_type="race",
        seiler_z3_pct=0.20,
        language="simple",
    )
    near_lower = near.lower()
    has_event_near = any(ind in near_lower for ind in event_indicators)
    assert has_event_near, (
        f"Event sentence should be present at 35 days. Output: {near!r}"
    )

    # Race week (3 days) — different shape; no generic "X days away" event sentence
    race = build_weekly_rationale(
        phase="race",
        block_position="realization",
        block_index_in_meso=2,
        weekly_tss_target=150,
        ctl_now=62.0,
        ctl_delta_7d=-2.0,
        days_to_event=3,
        target_event_type="race",
        seiler_z3_pct=0.05,
        language="simple",
    )
    race_lower = race.lower()
    # Race-week shape: no "35 days away" style sentence; should mention "race week"
    assert "race week" in race_lower, (
        f"Race-week output should mention 'race week'. Output: {race!r}"
    )
    # Generic "days away" should not appear for a 3-day-out race
    for ind in ["days away", "days to your"]:
        assert ind not in race_lower, (
            f"Generic event sentence '{ind}' should not appear in race-week output. "
            f"Output: {race!r}"
        )


# ===========================================================================
# Test 10: Determinism — byte-identical on same inputs
# ===========================================================================

def test_determinism() -> None:
    """Same inputs must produce byte-identical output on repeated calls."""
    kwargs = dict(
        phase="peak",
        block_position="transmutation",
        block_index_in_meso=2,
        weekly_tss_target=480,
        ctl_now=65.0,
        ctl_delta_7d=1.5,
        days_to_event=28,
        target_event_type="fondo",
        seiler_z3_pct=0.20,
        language="technical",
    )
    first = build_weekly_rationale(**kwargs)  # type: ignore[arg-type]
    second = build_weekly_rationale(**kwargs)  # type: ignore[arg-type]
    assert first == second, (
        "build_weekly_rationale is not deterministic:\n"
        f"  first:  {first!r}\n"
        f"  second: {second!r}"
    )
    # Also check simple mode
    kwargs_simple = {**kwargs, "language": "simple"}
    simple_first = build_weekly_rationale(**kwargs_simple)  # type: ignore[arg-type]
    simple_second = build_weekly_rationale(**kwargs_simple)  # type: ignore[arg-type]
    assert simple_first == simple_second, (
        "build_weekly_rationale (simple) is not deterministic.\n"
        f"  first:  {simple_first!r}\n"
        f"  second: {simple_second!r}"
    )


# ===========================================================================
# Bonus: Smoke test — all 36 × 2 combos produce non-empty strings
# ===========================================================================

@pytest.mark.parametrize("phase", _ALL_PHASES)
@pytest.mark.parametrize("block", _ALL_BLOCKS)
@pytest.mark.parametrize("language", ["simple", "technical"])
def test_always_produces_non_empty_output(phase: str, block: str, language: str) -> None:
    """build_weekly_rationale should never return empty or whitespace-only string."""
    result = build_weekly_rationale(
        phase=phase,  # type: ignore[arg-type]
        block_position=block,  # type: ignore[arg-type]
        language=language,  # type: ignore[arg-type]
        **_BASE_KWARGS,
    )
    assert result and result.strip(), (
        f"Empty output for {phase}×{block} ({language})"
    )
