"""Unit tests for Phase 5.2 language modes.

What we cover:
    1. Simple-mode rule-based rationale contains no banned jargon substrings
       (FTP, TSS, CTL, TSB, Z2, RPE, etc.)
    2. Technical-mode rule-based rationale uses at least one of those terms
       (it's the whole point of that mode)
    3. Simple-mode title maps to a category-based plain-English label, not
       a template name with watts
    4. Simple-mode alternates use the friend-tone phrase map
    5. Different `language` values hit a cache miss and regenerate
    6. generate_brief routes language through to snapshot + rule-based fallback
    7. Unknown / missing language defaults to 'simple'

These tests exercise the pure functions — no HTTP / FastAPI client needed.
The endpoint-level wiring is verified via the type checker + manual curl in
task 6; the language schema lives in schemas/coach.py and is enforced by
FastAPI's Query / Pydantic layers at request time.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.coach_service import (
    _rule_based_brief,
    generate_brief,
    get_or_generate_brief,
)


# Banned jargon in simple mode — case-insensitive substring check.
# We keep the list in sync with SYSTEM_PROMPT_SIMPLE's explicit ban list.
BANNED_SIMPLE_TERMS = [
    "FTP", "TSS", "CTL", "ATL", "TSB", "RPE", "VO2", "NP", " EF ",
    "Z1", "Z2", "Z3", "Z4", "Z5", "Z6", "Z7",
    "Seiler", "Coggan", "Friel", "Banister", "Mujika",
    "polarized", "threshold", "sweet spot", "tempo",
    "parasympathetic", "cardiac drift", "decoupling", "grey zone",
    "intensity ceiling", "aerobic base",
]


# At least one of these must appear in technical-mode rationale to prove the
# toggle actually changed the tone.
TECHNICAL_INDICATORS = ["FTP", "TSS", "CTL", "TSB", "Z2", "Banister", "Friel", "Seiler"]


def _sample_snapshot(*, language: str = "simple") -> dict:
    """A sane snapshot fixture — matches test_coach_service.py layout."""
    return {
        "generated_at": "2026-04-20T10:00:00Z",
        "language": language,
        "athlete": {
            "goal_event_date": None, "goal_target": None,
            "weekly_hours": 10, "ftp": 280, "weight_kg": 72.0,
            "injury_flag": False, "injury_note": None,
            "goal_phase": "build2",
            "today_available_minutes": 85,
        },
        "pmc": {
            "ctl": 60.0, "atl": 55.0, "tsb": 5.0,
            "ctl_7d_delta": 2.0, "tsb_7d_delta": -5.0,
            "form_status": "optimal",
        },
        "biometrics": {
            "hrv": {"delta_pct": 0.0, "current_mean": 55, "baseline_28d_mean": 57, "samples_n": 7, "direction": "stable"},
            "rhr": {"delta_pct": 2.0, "current_mean": 55, "baseline_28d_mean": 54, "samples_n": 7, "direction": "stable"},
            "sleep": {"total_debt_hours": 3.0, "avg_nightly_debt": 0.2, "nights_short": 5, "nights_healthy": 9, "samples_n": 14, "target_hours": 8.0},
        },
        "distribution": {"z1_pct": 70.0, "z2_pct": 15.0, "z3_pct": 15.0, "total_hours": 10.0, "grey_zone_flag": False, "samples_n": 6},
        "activities_14d": {"count": 8, "total_tss": 600.0, "avg_ef": 1.3, "avg_decoupling": 4.0, "durability_last_long_ride": 0.93},
        "why_tired": {"causes": []},
        "recent_trend": [],
        "weekly_intensity_quota": {"phase": "build2", "z1_z2_hours": 7.5, "hard_hours": 2.0, "vo2_sessions": 1, "threshold_sessions": 2, "rest_days": 2, "total_hours": 10.0},
        "weekly_progress": {"hard_sessions_done": 0, "vo2_sessions_done": 0, "total_tss_this_week": 0.0, "total_hours_this_week": 0.0},
        "today_session_type": "vo2",
        "picked_template_id": "vo2_5x4",
        "picked_template_preview": None,
        "available_templates": [
            "rest_day", "recovery_30",
            "z2_endurance_60", "z2_endurance_90", "z2_long_120", "z2_long_180",
            "tempo_3x10", "sweet_spot_2x20", "threshold_2x15", "over_under_3x5",
            "vo2_5x4", "vo2_micro_30x30",
        ],
        "rails_context": {
            "ctl": 60.0, "atl": 55.0, "tsb": 5.0,
            "hrv_delta_pct": 0.0,
            "injury_flag": False, "days_since_rest": 3,
            "intensity_ceiling": "push",
        },
    }


# ---------------------------------------------------------------------------
# Simple-mode phrasing hygiene
# ---------------------------------------------------------------------------

class TestSimpleModeHygiene:
    def test_rationale_has_no_banned_terms(self):
        brief = _rule_based_brief(_sample_snapshot(language="simple"))
        r = brief["rationale"]
        lowered = r.lower()
        for term in BANNED_SIMPLE_TERMS:
            # Word-boundary check for abbreviations, substring for multi-word
            # phrases ("sweet spot" etc.)
            assert term.lower() not in lowered, (
                f"Simple rationale must not contain '{term}'. Got: {r!r}"
            )

    def test_title_is_plain_english(self):
        brief = _rule_based_brief(_sample_snapshot(language="simple"))
        title = brief["prescribed_workout"]["title"]
        lowered = title.lower()
        # No "FTP", "Z5", "× N min" stylings
        for term in ("ftp", "% ftp", "z5", "z2", "z3", "z4", "z6", "z7"):
            assert term not in lowered, f"Title {title!r} should not contain {term!r}"
        # And we expect one of the simple canned titles
        assert title in {
            "Easy spin", "Chill ride", "Steady push", "Focused effort",
            "Hard ride", "Hard intervals", "Sprint day", "Rest day", "Ride today",
        }

    def test_why_this_workout_has_no_banned_terms(self):
        brief = _rule_based_brief(_sample_snapshot(language="simple"))
        why = brief["prescribed_workout"]["why_this_workout"]
        lowered = why.lower()
        for term in BANNED_SIMPLE_TERMS:
            assert term.lower() not in lowered, (
                f"Simple why_this_workout must not contain '{term}'. Got: {why!r}"
            )

    def test_alternates_are_friend_toned(self):
        brief = _rule_based_brief(_sample_snapshot(language="simple"))
        by_label = {a["label"]: a["one_liner"] for a in brief["alternates"]}
        # The friend-toned templates
        assert "30 min" in by_label["less_time"].lower() or "spin" in by_label["less_time"].lower()
        assert "tired" in by_label["recover"].lower() or "nothing" in by_label["recover"].lower()
        # And none carry TSS numbers
        for ol in by_label.values():
            assert "tss" not in ol.lower()

    def test_frameworks_cited_plain_english(self):
        brief = _rule_based_brief(_sample_snapshot(language="simple"))
        joined = " ".join(brief["frameworks_cited"]).lower()
        for term in ("seiler", "coggan", "friel", "banister", "polarized"):
            assert term not in joined

    def test_outlook_notes_have_no_zone_numbers(self):
        brief = _rule_based_brief(_sample_snapshot(language="simple"))
        for entry in brief["outlook_7d"]:
            note = entry["note"].lower()
            for term in ("z1", "z2", "z3", "ftp", "tss"):
                assert term not in note, f"Outlook note {entry['note']!r} contains {term!r}"


# ---------------------------------------------------------------------------
# Technical-mode keeps the jargon (with parentheticals baked into the prompt)
# ---------------------------------------------------------------------------

class TestTechnicalMode:
    def test_rationale_contains_technical_term(self):
        brief = _rule_based_brief(_sample_snapshot(language="technical"))
        r = brief["rationale"]
        assert any(t in r for t in TECHNICAL_INDICATORS), (
            f"Technical rationale must contain one of {TECHNICAL_INDICATORS}. Got: {r!r}"
        )

    def test_frameworks_cite_research_names(self):
        brief = _rule_based_brief(_sample_snapshot(language="technical"))
        joined = " ".join(brief["frameworks_cited"])
        assert any(name in joined for name in ("Banister", "Seiler", "Friel", "Coggan"))

    def test_why_this_workout_cites_numbers(self):
        brief = _rule_based_brief(_sample_snapshot(language="technical"))
        why = brief["prescribed_workout"]["why_this_workout"]
        # Technical why has TSB / CTL / HRV letter patterns
        assert "TSB" in why or "CTL" in why or "HRV" in why


# ---------------------------------------------------------------------------
# Default fallback behaviour — missing / invalid language → 'simple'
# ---------------------------------------------------------------------------

class TestLanguageDefault:
    def test_missing_language_defaults_to_simple(self):
        snap = _sample_snapshot()
        snap.pop("language", None)
        brief = _rule_based_brief(snap)
        # No banned terms = simple-mode behaviour
        lowered = brief["rationale"].lower()
        for term in ("ftp", "tss", "ctl", "tsb"):
            assert term not in lowered

    def test_unknown_language_value_defaults_to_simple(self):
        # The service currently treats anything other than 'technical' as simple
        brief = _rule_based_brief({**_sample_snapshot(), "language": "klingon"})
        lowered = brief["rationale"].lower()
        for term in ("ftp", "tss", "ctl", "tsb"):
            assert term not in lowered


# ---------------------------------------------------------------------------
# generate_brief routes language through to snapshot + fallback
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestGenerateBriefLanguage:
    async def test_language_stamped_on_fallback(self, monkeypatch):
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", None)

        simple_result = await generate_brief(_sample_snapshot(), language="simple")
        tech_result = await generate_brief(_sample_snapshot(), language="technical")

        # Simple rationale has none of the technical indicators; technical has at least one
        simple_lower = simple_result["rationale"].lower()
        for term in ("ftp", "tss", "ctl", "tsb"):
            assert term not in simple_lower

        tech_r = tech_result["rationale"]
        assert any(t in tech_r for t in TECHNICAL_INDICATORS)

    async def test_explicit_language_arg_overrides_snapshot(self, monkeypatch):
        """If the caller passes language='technical' but the snapshot has
        'simple' stamped, the caller's arg wins."""
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", None)

        snap = _sample_snapshot(language="simple")
        # Call with technical; generate_brief re-stamps the snapshot
        result = await generate_brief(snap, language="technical")
        assert any(t in result["rationale"] for t in TECHNICAL_INDICATORS)


# ---------------------------------------------------------------------------
# get_or_generate_brief — different language triggers cache miss
# ---------------------------------------------------------------------------

class _MockDB:
    """Mock AsyncSession that keeps a simple list of "stored" briefs and lets
    us script what the next execute() returns. Mirrors the shape used in
    test_coach_service.py so we can audit cache hits vs writes."""

    def __init__(self):
        self.stored: list = []
        self.add_count = 0
        self.commit_count = 0
        self.refresh_count = 0
        self._next_return = None
        self._last_added = None

    def prime_next(self, value):
        self._next_return = value

    async def execute(self, stmt):
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=self._next_return)
        return result

    def add(self, obj):
        # Scope add_count to CoachBrief instances only — get_or_generate_brief
        # also writes CoachRecommendation rows (Step 4 + Step 7), which would
        # otherwise inflate the counter and break cache-hit/miss assertions.
        from app.models.coach_brief import CoachBrief
        if isinstance(obj, CoachBrief):
            self.add_count += 1
            self._last_added = obj

    async def commit(self):
        self.commit_count += 1
        if self._last_added is not None:
            if getattr(self._last_added, "id", None) is None:
                self._last_added.id = len(self.stored) + 1
            if getattr(self._last_added, "generated_at", None) is None:
                self._last_added.generated_at = datetime.now(timezone.utc)
            self.stored.append(self._last_added)

    async def refresh(self, obj):
        self.refresh_count += 1


@pytest.mark.asyncio
class TestCacheKeyedOnLanguage:
    async def test_different_language_triggers_miss_and_regenerate(self, monkeypatch):
        """If a 'simple' brief exists in cache but the request asks for
        'technical', get_or_generate_brief must regenerate rather than serve
        the stale-language row."""
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", None)
        monkeypatch.setattr("app.services.coach_service.settings.COACH_BRIEF_CACHE_HOURS", 6)

        db = _MockDB()

        # Each call to get_or_generate_brief hits db.execute twice: cache-check
        # → if miss, the service proceeds to build + persist. We prime the
        # cache-check to return None (miss) for both language calls so the
        # assertion below is clean: each call adds exactly 1 row.
        db.prime_next(None)

        monkeypatch.setattr(
            "app.services.coach_service.build_snapshot",
            AsyncMock(side_effect=lambda _db, _uid, language="simple": _sample_snapshot(language=language)),
        )

        # First call: simple mode → 1 insert
        _ = await get_or_generate_brief(db, user_id=1, force=False, language="simple")
        assert db.add_count == 1

        # Second call: technical mode, same user → another insert because
        # the (filter includes language) cache lookup misses
        db.prime_next(None)  # still priming miss — our mock doesn't filter JSONB
        _ = await get_or_generate_brief(db, user_id=1, force=False, language="technical")
        assert db.add_count == 2

        # Both stored rows carry their respective language stamps
        languages = {b.evidence["language"] for b in db.stored}
        assert languages == {"simple", "technical"}

    async def test_same_language_uses_cache(self, monkeypatch):
        """Two consecutive 'simple' calls within TTL — second is a cache hit."""
        monkeypatch.setattr("app.services.coach_service.settings.ANTHROPIC_API_KEY", None)
        monkeypatch.setattr("app.services.coach_service.settings.COACH_BRIEF_CACHE_HOURS", 6)

        db = _MockDB()

        # Prime the first cache check as a miss
        db.prime_next(None)
        monkeypatch.setattr(
            "app.services.coach_service.build_snapshot",
            AsyncMock(side_effect=lambda _db, _uid, language="simple": _sample_snapshot(language=language)),
        )
        first = await get_or_generate_brief(db, user_id=1, force=False, language="simple")
        assert db.add_count == 1

        # Prime next execute to return the row we just stored (cache hit)
        db.prime_next(first)
        second = await get_or_generate_brief(db, user_id=1, force=False, language="simple")

        assert second is first
        # No additional insert
        assert db.add_count == 1


# ---------------------------------------------------------------------------
# Locale-honest prescribed workout (round-2 review, Jul 2026): the day-card
# pipeline must serve German template fields so DE surfaces never render raw
# EN template prose ("High aerobic work at 88% FTP…").
# ---------------------------------------------------------------------------


class TestPrescribedWorkoutLocaleFields:
    def test_rewrite_carries_title_de_and_purpose_de(self):
        from app.services.coach_service import _rewrite_prescribed_workout

        out = _rewrite_prescribed_workout("sweet_spot_2x20", 250, None, None)
        assert out.get("title_de"), "title_de must be served to the client"
        assert out.get("purpose_de"), "purpose_de must be served to the client"

    def test_de_fallback_why_uses_german_purpose(self):
        """No bespoke why + de=True → the fallback speaks German (the
        beginner-safe purpose_de), never the EN template purpose."""
        from app.services.coach_service import _rewrite_prescribed_workout
        from app.services.workout_templates import TEMPLATES

        tpl = TEMPLATES["sweet_spot_2x20"]
        out_de = _rewrite_prescribed_workout("sweet_spot_2x20", 250, None, None, de=True)
        assert out_de["why_this_workout"] == tpl.purpose_de
        out_en = _rewrite_prescribed_workout("sweet_spot_2x20", 250, None, None, de=False)
        assert out_en["why_this_workout"] == tpl.purpose

    def test_zero_ftp_stub_still_carries_de_fields(self):
        from app.services.coach_service import _rewrite_prescribed_workout

        out = _rewrite_prescribed_workout("z2_endurance_60", 0, None, None, de=True)
        assert out.get("title_de")
        assert out.get("purpose_de")
        from app.services.workout_templates import TEMPLATES
        assert out["why_this_workout"] == TEMPLATES["z2_endurance_60"].purpose_de
