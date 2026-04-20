"""Unit tests for the PMC narrative generator (Phase 5.4).

Coverage:
  1. Every intensity label threshold (rest / easy / moderate / hard / big)
  2. Rest-day narratives in both languages
  3. Multi-activity prefix
  4. Simple mode NEVER leaks FTP/TSS/CTL/ATL/TSB/EF/VI/NP/Z1-Z7/RPE/
     Coggan/Banister/Seiler/polarized
  5. Technical mode contains CTL/ATL/TSB notation on non-rest days,
     at least CTL+TSB on rest days
  6. Every narrative is <= 140 chars
"""
from __future__ import annotations

from datetime import date

import pytest

from app.services.pmc_narratives import (
    MAX_NARRATIVE_CHARS,
    DayActivity,
    build_pmc_narrative,
    classify_intensity,
)


# ---------------------------------------------------------------------------
# Jargon block list (simple mode must avoid ALL of these, case-insensitive
# and word-boundary aware where ambiguous)
# ---------------------------------------------------------------------------

BANNED_SIMPLE_TERMS = [
    "FTP", "TSS", "CTL", "ATL", "TSB",
    "EF", "VI", "NP", "IF", "RPE",
    "Z1", "Z2", "Z3", "Z4", "Z5", "Z6", "Z7",
    "Seiler", "Coggan", "Banister", "Friel", "Mujika",
    "polarized", "San Millán",
]

# At least one of these must appear in technical mode to prove the toggle
# actually changed the tone.
TECHNICAL_INDICATORS = ["CTL", "ATL", "TSB", "TSS"]


def _sample_entry(
    *,
    d: date = date(2026, 4, 20),
    ctl: float = 50.0,
    atl: float = 45.0,
    tsb: float = 5.0,
    tss: float = 0.0,
) -> dict:
    return {"date": d, "ctl": ctl, "atl": atl, "tsb": tsb, "tss": tss}


def _prev_entry(ctl: float = 49.5, atl: float = 42.0) -> dict:
    return {
        "date": date(2026, 4, 19),
        "ctl": ctl,
        "atl": atl,
        "tsb": ctl - atl,
        "tss": 0.0,
    }


# ---------------------------------------------------------------------------
# classify_intensity()
# ---------------------------------------------------------------------------

class TestClassifyIntensity:
    def test_zero_tss_is_rest(self):
        assert classify_intensity(0.0, 0.0) == "rest"

    def test_zero_duration_is_rest(self):
        assert classify_intensity(50.0, 0.0) == "rest"

    def test_easy_when_low_tss_per_hour(self):
        # 20 TSS over 60 min -> 20 TSS/h -> easy
        assert classify_intensity(20.0, 60.0) == "easy"

    def test_easy_upper_boundary(self):
        # Just below 45 TSS/h -> easy
        assert classify_intensity(44.0, 60.0) == "easy"

    def test_moderate_at_threshold(self):
        # Exactly 45 TSS/h -> moderate
        assert classify_intensity(45.0, 60.0) == "moderate"

    def test_moderate_upper_boundary(self):
        # Just below 75 TSS/h -> moderate
        assert classify_intensity(74.0, 60.0) == "moderate"

    def test_hard_at_threshold(self):
        # Exactly 75 TSS/h -> hard
        assert classify_intensity(75.0, 60.0) == "hard"

    def test_hard_upper_boundary(self):
        # 100 TSS over 60 min -> 100 TSS/h -> hard
        assert classify_intensity(100.0, 60.0) == "hard"

    def test_big_above_110_tss_per_hour(self):
        # 115 TSS over 60 min -> 115 TSS/h -> big
        assert classify_intensity(115.0, 60.0) == "big"

    def test_big_by_absolute_tss_cap(self):
        # Long easy day: 130 TSS over 300 min = 26 TSS/h (easy rate)
        # But absolute TSS >= 120 trumps -> big
        assert classify_intensity(130.0, 300.0) == "big"


# ---------------------------------------------------------------------------
# build_pmc_narrative() — rest days
# ---------------------------------------------------------------------------

class TestRestDay:
    def test_simple_rest_day(self):
        entry = _sample_entry(ctl=50.0, atl=42.0, tsb=8.0, tss=0.0)
        prev = _prev_entry(ctl=50.2, atl=46.0)  # -> ctl_delta -0.2
        out = build_pmc_narrative(entry, prev, activity=None, language="simple")
        assert "Rest day" in out
        assert len(out) <= MAX_NARRATIVE_CHARS

    def test_technical_rest_day_has_ctl_and_tsb(self):
        entry = _sample_entry(ctl=50.0, atl=42.0, tsb=8.0, tss=0.0)
        prev = _prev_entry(ctl=50.2, atl=46.0)
        out = build_pmc_narrative(entry, prev, activity=None, language="technical")
        assert "CTL" in out
        assert "TSB" in out
        assert "Rest day" in out
        assert len(out) <= MAX_NARRATIVE_CHARS

    def test_simple_rest_day_no_jargon(self):
        entry = _sample_entry()
        out = build_pmc_narrative(entry, None, activity=None, language="simple")
        for term in BANNED_SIMPLE_TERMS:
            assert term not in out, f"banned term '{term}' leaked: {out!r}"


# ---------------------------------------------------------------------------
# build_pmc_narrative() — each intensity label
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "intensity,duration_min,tss",
    [
        ("easy", 60.0, 30.0),
        ("moderate", 60.0, 60.0),
        ("hard", 60.0, 90.0),
        ("big", 180.0, 180.0),
    ],
)
class TestEachIntensityHasNarrative:
    def test_simple_narrative_is_nonempty_and_short(
        self, intensity, duration_min, tss
    ):
        entry = _sample_entry(tss=tss)
        prev = _prev_entry()
        activity = DayActivity(
            duration_min=duration_min,
            primary_sport="cycling",
            activity_count=1,
            intensity_label=intensity,
        )
        out = build_pmc_narrative(entry, prev, activity=activity, language="simple")
        assert out
        assert len(out) <= MAX_NARRATIVE_CHARS

    def test_technical_narrative_mentions_ctl_or_atl_or_tsb(
        self, intensity, duration_min, tss
    ):
        entry = _sample_entry(tss=tss)
        prev = _prev_entry()
        activity = DayActivity(
            duration_min=duration_min,
            primary_sport="cycling",
            activity_count=1,
            intensity_label=intensity,
        )
        out = build_pmc_narrative(
            entry, prev, activity=activity, language="technical"
        )
        assert any(ind in out for ind in TECHNICAL_INDICATORS), (
            f"technical mode should cite one of {TECHNICAL_INDICATORS}: {out!r}"
        )
        assert len(out) <= MAX_NARRATIVE_CHARS


# ---------------------------------------------------------------------------
# Simple mode jargon block list — all intensities
# ---------------------------------------------------------------------------

class TestSimpleModeNoJargon:
    @pytest.mark.parametrize(
        "intensity,duration_min,tss",
        [
            ("rest", 0.0, 0.0),
            ("easy", 60.0, 30.0),
            ("moderate", 60.0, 60.0),
            ("hard", 60.0, 90.0),
            ("big", 180.0, 180.0),
        ],
    )
    def test_simple_mode_never_contains_banned_terms(
        self, intensity, duration_min, tss
    ):
        entry = _sample_entry(tss=tss)
        prev = _prev_entry()
        activity = None if intensity == "rest" else DayActivity(
            duration_min=duration_min,
            primary_sport="cycling",
            activity_count=1,
            intensity_label=intensity,
        )
        out = build_pmc_narrative(entry, prev, activity=activity, language="simple")
        for term in BANNED_SIMPLE_TERMS:
            assert term not in out, (
                f"banned term '{term}' leaked in simple {intensity} mode: {out!r}"
            )


# ---------------------------------------------------------------------------
# Multi-activity prefix
# ---------------------------------------------------------------------------

class TestMultiActivityPrefix:
    def test_simple_two_sessions_prefix(self):
        entry = _sample_entry(tss=90.0)
        prev = _prev_entry()
        activity = DayActivity(
            duration_min=120.0,
            primary_sport="cycling",
            activity_count=2,
            intensity_label="moderate",
        )
        out = build_pmc_narrative(entry, prev, activity=activity, language="simple")
        assert out.startswith("2 sessions — ")
        assert len(out) <= MAX_NARRATIVE_CHARS

    def test_technical_two_activity_prefix(self):
        entry = _sample_entry(tss=90.0)
        prev = _prev_entry()
        activity = DayActivity(
            duration_min=120.0,
            primary_sport="cycling",
            activity_count=2,
            intensity_label="moderate",
        )
        out = build_pmc_narrative(
            entry, prev, activity=activity, language="technical"
        )
        assert out.startswith("(2x activity) ")
        assert len(out) <= MAX_NARRATIVE_CHARS

    def test_single_activity_no_prefix(self):
        entry = _sample_entry(tss=60.0)
        prev = _prev_entry()
        activity = DayActivity(
            duration_min=60.0,
            primary_sport="cycling",
            activity_count=1,
            intensity_label="moderate",
        )
        out = build_pmc_narrative(entry, prev, activity=activity, language="simple")
        assert not out.startswith("2 sessions")


# ---------------------------------------------------------------------------
# Max length sanity — exhaustive across plausible inputs
# ---------------------------------------------------------------------------

class TestMaxLengthAllPaths:
    @pytest.mark.parametrize(
        "intensity,duration_min,tss",
        [
            ("rest", 0.0, 0.0),
            ("easy", 90.0, 40.0),
            ("moderate", 120.0, 90.0),
            ("hard", 75.0, 120.0),
            ("big", 300.0, 280.0),
        ],
    )
    @pytest.mark.parametrize("language", ["simple", "technical"])
    @pytest.mark.parametrize("activity_count", [1, 2, 3])
    def test_all_paths_fit_in_tooltip(
        self, intensity, duration_min, tss, language, activity_count
    ):
        entry = _sample_entry(tss=tss, ctl=72.3, atl=88.1, tsb=-15.8)
        prev = _prev_entry(ctl=71.2, atl=81.5)
        activity = None if intensity == "rest" else DayActivity(
            duration_min=duration_min,
            primary_sport="cycling",
            activity_count=activity_count,
            intensity_label=intensity,
        )
        out = build_pmc_narrative(entry, prev, activity=activity, language=language)
        assert len(out) <= MAX_NARRATIVE_CHARS, (
            f"narrative too long ({len(out)}): {out!r}"
        )


# ---------------------------------------------------------------------------
# Previous entry handling
# ---------------------------------------------------------------------------

class TestPrevEntryHandling:
    def test_no_prev_entry_treats_delta_as_zero(self):
        """First day of window has no prev_entry — should not crash and
        should not claim a fitness change."""
        entry = _sample_entry(ctl=10.0, atl=8.0, tsb=2.0, tss=0.0)
        out = build_pmc_narrative(entry, None, activity=None, language="simple")
        assert out
        assert len(out) <= MAX_NARRATIVE_CHARS
        # When ctl_delta == 0 the simple-mode rest template says "fitness steady"
        assert "steady" in out.lower() or "+0.0" in out
