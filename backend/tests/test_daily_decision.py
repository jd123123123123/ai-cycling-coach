"""Unit tests for the ONE Daily Decision producer (usability audit P0-3).

Covers:
    - precedence: sick > trained_already > planned_rest > readiness mapping
    - sport-awareness: a gym session on a bike-plan day does NOT flip the
      state to trained_already — the bike plan stays the instruction and the
      strength work is acknowledged in the reason
    - strain_target is ALWAYS tss_target/8 (0-21 scale), null on rest days
    - directive deload caps the plan (state 'recover'), never contradicts it
    - audit copy: well-recovered planned rest day banks freshness for tomorrow
"""
from __future__ import annotations

from datetime import date

import pytest

from app.schemas.coach import DailyDecisionReadiness
from app.services.adaptive_readiness import Directive
from app.services.daily_decision import (
    TodayContext,
    decide,
    strain_from_tss,
)

TODAY = date(2026, 7, 20)


def _directive(directive="push", ceiling="hard", vol=1.0) -> Directive:
    return Directive(
        directive=directive,
        intensity_ceiling=ceiling,
        volume_modifier=vol,
        hrv_state="in",
        headline="x",
    )


def _bike_plan(target_tss=68.0, category="sweet_spot") -> dict:
    return {
        "sport": "cycling",
        "title": "Sweet Spot 2x20",
        "template_id": "sweet_spot_2x20",
        "target_tss": target_tss,
        "duration_minutes": 75,
        "category": category,
    }


def _decide(**kw):
    defaults = dict(
        today=TODAY,
        status_state=None,
        ctx=TodayContext(),
        directive=_directive(),
        readiness=DailyDecisionReadiness(score=75, tier="push"),
        language="simple",
        locale="de",
    )
    defaults.update(kw)
    return decide(**defaults)


# ---------------------------------------------------------------------------
# Strain derivation — the ONLY tss→strain point
# ---------------------------------------------------------------------------

class TestStrainDerivation:
    def test_strain_is_tss_over_eight(self):
        assert strain_from_tss(80.0) == 10.0
        assert strain_from_tss(68.0) == 8.5

    def test_strain_null_passthrough(self):
        assert strain_from_tss(None) is None

    def test_strain_caps_at_21(self):
        assert strain_from_tss(500.0) == 21.0


# ---------------------------------------------------------------------------
# Precedence
# ---------------------------------------------------------------------------

class TestPrecedence:
    def test_sick_beats_everything(self):
        ctx = TodayContext(
            planned=_bike_plan(),
            activities=[{"sport": "cycling", "duration_minutes": 90, "tss": 80}],
        )
        d = _decide(status_state="sick", ctx=ctx)
        assert d.state == "sick"
        assert d.tss_target is None
        assert d.strain_target is None

    def test_injured_and_break_states(self):
        assert _decide(status_state="injured").state == "injured"
        assert _decide(status_state="break").state == "break"

    def test_trained_beats_planned_rest(self):
        # Rode 45 min on a planned rest day → the day is trained, not rest.
        ctx = TodayContext(
            planned_is_rest=True,
            activities=[{"sport": "cycling", "duration_minutes": 45, "tss": 40}],
        )
        d = _decide(ctx=ctx)
        assert d.state == "trained_already"
        assert d.tss_target is None
        assert d.strain_target is None

    def test_planned_rest_beats_readiness(self):
        # Fresh athlete + planned rest → planned_rest, never 'hard'.
        ctx = TodayContext(planned_is_rest=True)
        d = _decide(ctx=ctx, directive=_directive("escalate", "push", 1.25))
        assert d.state == "planned_rest"
        assert d.tss_target is None

    def test_readiness_mapping_when_nothing_overrides(self):
        ctx = TodayContext(planned=_bike_plan())
        d = _decide(ctx=ctx)
        assert d.state == "quality"
        assert d.tss_target == 68.0
        assert d.strain_target == 8.5


# ---------------------------------------------------------------------------
# Sport-awareness (audit: gym-on-bike-day)
# ---------------------------------------------------------------------------

class TestSportAwareness:
    def test_gym_session_does_not_complete_bike_plan(self):
        ctx = TodayContext(
            planned=_bike_plan(),
            activities=[{"sport": "gym", "duration_minutes": 58, "tss": 25}],
        )
        d = _decide(ctx=ctx)
        # Bike plan remains the instruction — NOT trained_already.
        assert d.state == "quality"
        assert d.planned is not None
        assert d.planned.template_id == "sweet_spot_2x20"
        # …and the strength work is acknowledged (cross-sport credit).
        assert "Krafttraining" in d.reason
        assert "58" in d.reason

    def test_gym_session_english_label(self):
        ctx = TodayContext(
            planned=_bike_plan(),
            activities=[{"sport": "gym", "duration_minutes": 58, "tss": 25}],
        )
        d = _decide(ctx=ctx, locale="en")
        assert "strength session" in d.reason

    def test_matching_ride_completes_bike_plan(self):
        ctx = TodayContext(
            planned=_bike_plan(),
            activities=[{"sport": "cycling", "duration_minutes": 74, "tss": 66}],
        )
        d = _decide(ctx=ctx)
        assert d.state == "trained_already"
        assert "Ausfahrt" in d.verdict

    def test_no_plan_any_sport_counts(self):
        ctx = TodayContext(
            activities=[{"sport": "running", "duration_minutes": 30, "tss": 30}],
        )
        d = _decide(ctx=ctx)
        assert d.state == "trained_already"
        assert "Lauf" in d.verdict

    def test_short_activity_does_not_trigger_trained(self):
        ctx = TodayContext(
            planned=_bike_plan(),
            activities=[{"sport": "cycling", "duration_minutes": 12, "tss": 8}],
        )
        d = _decide(ctx=ctx)
        assert d.state != "trained_already"


# ---------------------------------------------------------------------------
# Directive caps the plan — never contradicts it
# ---------------------------------------------------------------------------

class TestDirectiveCap:
    def test_deload_with_plan_becomes_recover(self):
        ctx = TodayContext(planned=_bike_plan(target_tss=68.0))
        d = _decide(ctx=ctx, directive=_directive("deload", "easy", 0.55))
        assert d.state == "recover"
        # Plan shape survives; load is capped by the volume modifier.
        assert d.planned is not None
        assert d.tss_target == pytest.approx(68.0 * 0.55, abs=0.1)
        assert d.strain_target == pytest.approx(d.tss_target / 8, abs=0.06)

    def test_hold_easy_caps_to_easy(self):
        ctx = TodayContext(planned=_bike_plan(category="vo2"))
        d = _decide(ctx=ctx, directive=_directive("hold", "easy", 0.8))
        assert d.state == "easy"

    def test_escalate_keeps_hard_day_hard(self):
        ctx = TodayContext(planned=_bike_plan(category="vo2", target_tss=78.0))
        d = _decide(ctx=ctx, directive=_directive("escalate", "push", 1.12))
        assert d.state == "hard"
        assert d.tss_target == pytest.approx(78.0 * 1.12, abs=0.1)

    def test_load_target_line_on_training_days(self):
        ctx = TodayContext(planned=_bike_plan(category="endurance", target_tss=45.0))
        d = _decide(ctx=ctx, directive=_directive("push", "hard", 1.0))
        assert d.state == "easy"
        assert "Belastungsziel heute: ~45 TSS (lockerer Tag)" in d.reason

    def test_load_target_line_english(self):
        ctx = TodayContext(planned=_bike_plan(category="endurance", target_tss=45.0))
        d = _decide(ctx=ctx, directive=_directive("push", "hard", 1.0), locale="en")
        assert "Load target today: ~45 TSS (easy day)" in d.reason


# ---------------------------------------------------------------------------
# Planned rest copy (audit exact strings)
# ---------------------------------------------------------------------------

class TestPlannedRestCopy:
    def test_well_recovered_rest_day_banks_freshness_de(self):
        ctx = TodayContext(planned_is_rest=True)
        d = _decide(ctx=ctx, readiness=DailyDecisionReadiness(score=82, tier="push"))
        assert d.state == "planned_rest"
        assert (
            "Gut erholt — und heute ist Ruhetag geplant. "
            "Nimm die Frische mit in die morgige Einheit." in d.reason
        )

    def test_well_recovered_rest_day_banks_freshness_en(self):
        ctx = TodayContext(planned_is_rest=True)
        d = _decide(
            ctx=ctx,
            readiness=DailyDecisionReadiness(score=82, tier="push"),
            locale="en",
        )
        assert (
            "Well recovered — and today is a planned rest day. "
            "Bank it for tomorrow's quality session." in d.reason
        )

    def test_rest_day_never_says_belaste_hart(self):
        ctx = TodayContext(planned_is_rest=True)
        d = _decide(ctx=ctx, directive=_directive("escalate", "push", 1.25))
        blob = f"{d.verdict} {d.reason}"
        assert "belaste hart" not in blob.lower()
        assert "voll draufhalten" not in blob.lower()

    def test_date_is_athlete_local_iso(self):
        d = _decide()
        assert d.date == "2026-07-20"


# ---------------------------------------------------------------------------
# Schema wiring — the decision rides along on both exposure surfaces
# ---------------------------------------------------------------------------

class TestSchemaWiring:
    def test_decision_serializes_into_adaptive_read(self):
        from app.schemas.coach import AdaptiveDirectiveRead

        dd = _decide()
        adr = AdaptiveDirectiveRead(
            directive="hold", intensity_ceiling="easy", volume_modifier=1.0,
            hrv_state="in", headline="x", daily_decision=dd,
        )
        dumped = adr.model_dump()
        assert dumped["daily_decision"]["state"] == dd.state
        assert dumped["daily_decision"]["date"] == "2026-07-20"

    def test_decision_serializes_into_brief_read(self):
        from datetime import datetime, timezone

        from app.schemas.coach import BriefRead

        dd = _decide()
        br = BriefRead(
            id=1, generated_at=datetime.now(timezone.utc),
            verdict="v", rationale="r", evidence={},
            frameworks_cited=[], model_used="rule-based-fallback",
            from_cache=False, daily_decision=dd,
        )
        assert br.model_dump()["daily_decision"]["state"] == dd.state
