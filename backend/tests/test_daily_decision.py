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
    _split_load_line,
    decide,
    personalize_decision,
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
        # ONE load number (5-reviewer gate, Jul 2026): nothing downstream scales
        # the served workout UP, so the day's target must equal the prescription
        # — never planned × an upside modifier the athlete will never ride.
        assert d.tss_target == pytest.approx(78.0, abs=0.1)

    def test_upside_volume_never_inflates_load_target(self):
        # All-in ambition (×1.25) — Recovery's "Belastungsziel heute" must still
        # equal the session Today shows, not an independently computed +25%.
        ctx = TodayContext(planned=_bike_plan(category="sweet_spot", target_tss=61.0))
        d = _decide(ctx=ctx, directive=_directive("escalate", "push", 1.25))
        assert d.tss_target == pytest.approx(61.0, abs=0.1)
        assert "~61 TSS" in d.reason

    def test_downside_volume_still_caps_load_target(self):
        ctx = TodayContext(planned=_bike_plan(target_tss=68.0))
        d = _decide(ctx=ctx, directive=_directive("hold", "easy", 0.8))
        assert d.tss_target == pytest.approx(68.0 * 0.8, abs=0.1)

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
# Composite readiness caps intensity alongside the HRV-primary directive
# ---------------------------------------------------------------------------

class TestReadinessCap:
    def test_moderate_readiness_caps_hard_vo2_to_quality(self):
        # The reported bug: readiness 55 (moderate) next to a hard VO2 day.
        # HRV in-band → directive push/hard, but the composite says moderate,
        # so the session dials back one notch to quality.
        ctx = TodayContext(planned=_bike_plan(category="vo2", target_tss=54.0))
        d = _decide(
            ctx=ctx,
            directive=_directive("push", "hard", 1.0),
            readiness=DailyDecisionReadiness(score=55, tier="moderate"),
        )
        assert d.state == "quality"
        # Quality and hard share the full planned load — only the copy changes.
        assert d.tss_target == pytest.approx(54.0, abs=0.1)
        assert "Gang zurück" in d.reason
        assert "55" in d.reason

    def test_push_readiness_leaves_hard_vo2_hard(self):
        ctx = TodayContext(planned=_bike_plan(category="vo2", target_tss=54.0))
        d = _decide(
            ctx=ctx,
            directive=_directive("push", "hard", 1.0),
            readiness=DailyDecisionReadiness(score=75, tier="push"),
        )
        assert d.state == "hard"
        assert "zurückgeschaltet" not in d.reason

    def test_moderate_readiness_leaves_quality_day_quality(self):
        # A sweet-spot day is already quality — moderate readiness doesn't
        # push it lower.
        ctx = TodayContext(planned=_bike_plan(category="sweet_spot", target_tss=61.0))
        d = _decide(
            ctx=ctx,
            directive=_directive("push", "hard", 1.0),
            readiness=DailyDecisionReadiness(score=55, tier="moderate"),
        )
        assert d.state == "quality"

    def test_easy_readiness_caps_hard_and_reduces_load(self):
        ctx = TodayContext(planned=_bike_plan(category="vo2", target_tss=78.0))
        d = _decide(
            ctx=ctx,
            directive=_directive("push", "hard", 1.0),
            readiness=DailyDecisionReadiness(score=38, tier="easy"),
        )
        assert d.state == "easy"
        # Readiness is the binding constraint, so the load comes down too.
        assert d.tss_target == pytest.approx(78.0 * 0.8, abs=0.1)

    def test_rest_readiness_forces_recover(self):
        ctx = TodayContext(planned=_bike_plan(category="vo2", target_tss=78.0))
        d = _decide(
            ctx=ctx,
            directive=_directive("push", "hard", 1.0),
            readiness=DailyDecisionReadiness(score=22, tier="rest"),
        )
        assert d.state == "recover"
        assert d.tss_target == pytest.approx(78.0 * 0.55, abs=0.1)

    def test_readiness_never_overrides_more_conservative_directive(self):
        # Directive deload already says recover; a moderate composite must not
        # bump it back UP to quality.
        ctx = TodayContext(planned=_bike_plan(category="vo2", target_tss=78.0))
        d = _decide(
            ctx=ctx,
            directive=_directive("deload", "easy", 0.55),
            readiness=DailyDecisionReadiness(score=55, tier="moderate"),
        )
        assert d.state == "recover"
        assert d.tss_target == pytest.approx(78.0 * 0.55, abs=0.1)

    def test_missing_readiness_tier_does_not_cap(self):
        ctx = TodayContext(planned=_bike_plan(category="vo2", target_tss=54.0))
        d = _decide(
            ctx=ctx,
            directive=_directive("push", "hard", 1.0),
            readiness=DailyDecisionReadiness(score=None, tier=None),
        )
        assert d.state == "hard"


# ---------------------------------------------------------------------------
# Planned rest copy (audit exact strings)
# ---------------------------------------------------------------------------

class TestPlannedRestCopy:
    def test_well_recovered_rest_day_banks_freshness_de(self):
        ctx = TodayContext(planned_is_rest=True)
        d = _decide(ctx=ctx, readiness=DailyDecisionReadiness(score=82, tier="push"))
        assert d.state == "planned_rest"
        assert (
            "Frischer als sonst — und heute steht Ruhetag. "
            "Nimm den Rückenwind mit in morgen." in d.reason
        )

    def test_well_recovered_rest_day_banks_freshness_en(self):
        ctx = TodayContext(planned_is_rest=True)
        d = _decide(
            ctx=ctx,
            readiness=DailyDecisionReadiness(score=82, tier="push"),
            locale="en",
        )
        assert (
            "Fresher than usual — and today's a rest day. "
            "Carry that tailwind into tomorrow." in d.reason
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
# Personalization — the small-model voice layer on top of decide()
# ---------------------------------------------------------------------------

class TestPersonalization:
    def test_split_load_line_de(self):
        flavor, suffix = _split_load_line(
            "Alles steht auf grün — jetzt reinhauen. "
            "Belastungsziel heute: ~54 TSS (harter Tag).",
            de=True,
        )
        assert flavor == "Alles steht auf grün — jetzt reinhauen."
        assert suffix == "Belastungsziel heute: ~54 TSS (harter Tag)."

    def test_split_load_line_absent(self):
        flavor, suffix = _split_load_line("Ruhetag — Füße hoch.", de=True)
        assert flavor == "Ruhetag — Füße hoch."
        assert suffix == ""

    async def test_personalize_falls_back_without_api_key(self, monkeypatch):
        from app.config import settings

        monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
        d = _decide(ctx=TodayContext(planned=_bike_plan(category="vo2")))
        # No key → returns the deterministic decision unchanged, never touches db.
        out = await personalize_decision(db=None, user_id=1, decision=d, locale="de")
        assert out is d

    async def test_personalize_preserves_state_and_load_number(self, monkeypatch):
        # Stub the model + name lookup so the test is offline and deterministic.
        from app.config import settings
        import app.services.daily_decision as dd

        monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")
        monkeypatch.setattr(dd, "_lookup_first_name", _async_return("Jannis"))

        async def _fake_complete(**kwargs):
            from types import SimpleNamespace

            # The model must never see (or emit) the TSS number.
            assert "TSS" not in kwargs["user"]
            return SimpleNamespace(
                text='{"verdict": "Ab aufs Rad, Jannis!", "reason": "Beine sind bereit — gib Gas."}',
                provider="anthropic",
                model="claude-haiku-4-5",
            )

        monkeypatch.setattr(dd, "complete_text", _fake_complete, raising=False)
        import app.services.llm_client as llm_client
        monkeypatch.setattr(llm_client, "complete_text", _fake_complete)

        d = _decide(
            ctx=TodayContext(planned=_bike_plan(category="vo2", target_tss=54.0)),
            directive=_directive("push", "hard", 1.0),
        )
        assert d.state == "hard" and d.tss_target == pytest.approx(54.0, abs=0.1)

        out = await personalize_decision(db=None, user_id=1, decision=d, locale="de")
        # Voice is rewritten…
        assert out.verdict == "Ab aufs Rad, Jannis!"
        assert "Beine sind bereit" in out.reason
        # …but state, load, and the factual TSS line are untouched.
        assert out.state == "hard"
        assert out.tss_target == pytest.approx(54.0, abs=0.1)
        assert "Belastungsziel heute: ~54 TSS" in out.reason


def _async_return(value):
    async def _inner(*args, **kwargs):
        return value

    return _inner


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
