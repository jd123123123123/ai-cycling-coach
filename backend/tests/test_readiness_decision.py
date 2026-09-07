"""Readiness as a decision with a receipt — `services/readiness_decision.py`.

The four days that matter, all exercised through the REAL collaborators
(`hrv_state.estimate_hrv_state` for the band, `daily_decision.decide` for both
sides of the counterfactual) rather than stubs:

    * a normal day        — no downgrade, counterfactual == the plan
    * a bad-HRV day       — downgrade, counterfactual differs, HRV is the driver
    * a stale wearable    — NO verdict at all
    * a new athlete       — no baseline is invented, and no driver is named

Plus the gate port itself (`utils/readinessGate.ts` had no backend twin) and
the "meaningfully off" thresholds.
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.schemas.coach import DailyDecisionReadiness
from app.services.adaptive_readiness import Directive
from app.services.daily_decision import TodayContext, decide
from app.services.hrv_state import estimate_hrv_state
from app.services.readiness_decision import (
    BASELINE_DAYS,
    MIN_BASELINE_N,
    SINGLE_NIGHT_BAND_SD,
    MetricDay,
    build_inputs,
    build_readiness_decision,
    classify_gate,
    pick_driver,
    withhold_verdict,
)

TODAY = date(2026, 9, 7)

# A deterministic wobble so every synthetic baseline has real dispersion —
# a flat reference is a stuck sensor, and the service refuses to judge one.
_WOBBLE = (0.0, 1.0, -1.0, 2.0, -2.0, 0.5, -0.5)


def _wob(i: int, scale: float = 1.0) -> float:
    return _WOBBLE[i % len(_WOBBLE)] * scale


# ---------------------------------------------------------------------------
#  Builders
# ---------------------------------------------------------------------------


def _days(
    *,
    n: int = 35,
    end_offset: int = 0,
    hrv_recent: float = 60.0,
    hrv_baseline: float = 60.0,
    resting_hr: float = 48.0,
    sleep_score: float = 78.0,
    sleep_h: float = 7.6,
    sleep_deep_h: float = 1.5,
    body_battery: int = 72,
    stress: int = 22,
    today: date = TODAY,
) -> list[MetricDay]:
    """`n` consecutive days ending `end_offset` days before `today`.

    Readings inside the last 7 days use `hrv_recent`; older ones use
    `hrv_baseline`, which is how a suppression is staged.
    """
    out: list[MetricDay] = []
    for i in range(n):
        day = today - timedelta(days=end_offset + i)
        age = (today - day).days
        hrv = hrv_recent if age < 7 else hrv_baseline
        out.append(
            MetricDay(
                day=day,
                hrv_status=hrv + _wob(i, 1.5),
                resting_hr=resting_hr + _wob(i, 1.0),
                sleep_score=sleep_score + _wob(i, 3.0),
                sleep_total_s=int((sleep_h + _wob(i, 0.2)) * 3600),
                sleep_deep_s=int((sleep_deep_h + _wob(i, 0.1)) * 3600),
                body_battery_wake=int(body_battery + _wob(i, 4.0)),
                stress_wake=int(stress + _wob(i, 3.0)),
            )
        )
    return sorted(out, key=lambda d: d.day)


def _hrv_of(days: list[MetricDay], today: date = TODAY):
    return estimate_hrv_state(
        [(d.day, d.hrv_status) for d in days if d.hrv_status], today=today
    )


def _plan(
    template_id: str = "sweet_spot_2x20",
    category: str = "sweet_spot",
    target_tss: float = 68.0,
    duration_minutes: int = 75,
) -> dict:
    return {
        "sport": "cycling",
        "title": "Sweet Spot 2x20",
        "title_de": "Sweetspot — 2×20 min",
        "template_id": template_id,
        "target_tss": target_tss,
        "duration_minutes": duration_minutes,
        "category": category,
    }


def _directive(directive="push", ceiling="hard", vol=1.0, hrv_state="in") -> Directive:
    return Directive(
        directive=directive,
        intensity_ceiling=ceiling,
        volume_modifier=vol,
        hrv_state=hrv_state,
        headline="x",
    )


def _build(
    *,
    days: list[MetricDay],
    directive: Directive | None,
    readiness: DailyDecisionReadiness,
    ctx: TodayContext | None = None,
    status_state: str | None = None,
    today: date = TODAY,
    recorded=None,
):
    """Assemble a decision exactly the way the service's I/O wrapper does."""
    ctx = ctx if ctx is not None else TodayContext(planned=_plan())
    hrv = _hrv_of(days, today)
    inputs = build_inputs(days, hrv, today=today)
    gate, age, last_day = classify_gate(days, today=today)
    common = dict(
        today=today, status_state=status_state, ctx=ctx, language="simple", locale="de"
    )
    actual = decide(directive=directive, readiness=readiness, **common)
    counterfactual = decide(
        directive=None, readiness=DailyDecisionReadiness(), **common
    )
    return build_readiness_decision(
        today=today,
        gate=gate,
        data_age_days=age,
        last_measured_on=last_day,
        inputs=inputs,
        hrv=hrv,
        ctx=ctx,
        actual=actual,
        counterfactual=counterfactual,
        readiness=readiness,
        recorded=recorded,
        trained_today=ctx.total_minutes >= 20.0,
        sidelined=status_state in ("sick", "injured", "break"),
    )


# ---------------------------------------------------------------------------
#  The staleness gate — the backend port of utils/readinessGate.ts
# ---------------------------------------------------------------------------


class TestGatePort:
    def test_today_is_fresh(self):
        gate, age, day = classify_gate(_days(), today=TODAY)
        assert (gate, age, day) == ("fresh", 0, TODAY)

    def test_yesterday_is_pending(self):
        gate, age, _ = classify_gate(_days(end_offset=1), today=TODAY)
        assert (gate, age) == ("pending", 1)

    def test_two_days_is_stale(self):
        gate, age, _ = classify_gate(_days(end_offset=2), today=TODAY)
        assert (gate, age) == ("stale", 2)

    def test_no_overnight_signal_is_none(self):
        # Body battery and stress alone do NOT make a row an overnight record.
        rows = [
            MetricDay(day=TODAY - timedelta(days=i), body_battery_wake=70, stress_wake=20)
            for i in range(5)
        ]
        assert classify_gate(rows, today=TODAY) == ("none", None, None)

    def test_future_dated_row_cannot_mask_staleness(self):
        rows = _days(end_offset=4) + [MetricDay(day=TODAY + timedelta(days=2), hrv_status=60.0)]
        gate, age, _ = classify_gate(rows, today=TODAY)
        assert (gate, age) == ("stale", 4)

    @pytest.mark.parametrize("gate", ["pending", "stale"])
    def test_withholds_on_pending_and_stale(self, gate):
        assert withhold_verdict(gate, trained_today=False, sidelined=False) is True

    @pytest.mark.parametrize("gate", ["fresh", "none"])
    def test_does_not_withhold_when_fresh_or_absent(self, gate):
        # 'none' is the honest empty state for an athlete with no wearable,
        # not a broken one.
        assert withhold_verdict(gate, trained_today=False, sidelined=False) is False

    def test_a_ride_today_is_fresher_evidence_than_any_record(self):
        assert withhold_verdict("stale", trained_today=True, sidelined=False) is False

    def test_sidelined_carries_its_own_explanation(self):
        assert withhold_verdict("stale", trained_today=False, sidelined=True) is False


# ---------------------------------------------------------------------------
#  Thresholds — every band is in the athlete's OWN variability
# ---------------------------------------------------------------------------


class TestThresholds:
    def test_a_signal_one_sd_off_is_flagged(self):
        days = _days(resting_hr=48.0)
        # Replace today's RHR with a value ~2.5 SD above the reference.
        ref = [d.resting_hr for d in days if 1 <= (TODAY - d.day).days <= BASELINE_DAYS]
        import statistics

        spiked = statistics.mean(ref) + 2.5 * statistics.pstdev(ref)
        days = [
            d if d.day != TODAY else MetricDay(**{**d.__dict__, "resting_hr": spiked})
            for d in days
        ]
        rhr = next(i for i in build_inputs(days, _hrv_of(days), today=TODAY) if i.key == "resting_hr")
        assert rhr.off is True
        assert rhr.direction == "above"
        assert rhr.unfavourable is True  # a HIGH resting HR argues for less load
        assert rhr.z is not None and rhr.z > SINGLE_NIGHT_BAND_SD

    def test_an_ordinary_day_is_not_flagged(self):
        days = _days()
        for i in build_inputs(days, _hrv_of(days), today=TODAY):
            assert i.off is False, f"{i.key} fired on an ordinary day: z={i.z}"

    def test_thresholds_scale_with_the_athletes_own_variability(self):
        """The same absolute deviation is 'off' for a steady athlete and not
        for a variable one — which is the whole reason the band is in SD."""
        import statistics

        def _rhr_z(scale: float) -> float:
            days = [
                MetricDay(
                    day=TODAY - timedelta(days=i),
                    hrv_status=60.0,
                    resting_hr=48.0 + _wob(i, scale),
                )
                for i in range(35)
            ]
            ref = [d.resting_hr for d in days if 1 <= (TODAY - d.day).days <= BASELINE_DAYS]
            spiked = statistics.mean(ref) + 4.0
            days = [
                d if d.day != TODAY else MetricDay(**{**d.__dict__, "resting_hr": spiked})
                for d in days
            ]
            inp = next(
                i for i in build_inputs(days, _hrv_of(days), today=TODAY)
                if i.key == "resting_hr"
            )
            return inp.z

        steady = _rhr_z(0.5)
        variable = _rhr_z(4.0)
        assert steady > variable
        assert steady >= SINGLE_NIGHT_BAND_SD
        assert variable < SINGLE_NIGHT_BAND_SD


# ---------------------------------------------------------------------------
#  A normal day
# ---------------------------------------------------------------------------


class TestCopy:
    def test_identical_numbers_never_claim_a_deviation(self):
        """"Stress 22, dein Schnitt ist 22" claims a difference the numbers on
        screen do not show."""
        days = _days()
        for i in build_inputs(days, _hrv_of(days), today=TODAY):
            if i.value is None or i.baseline is None:
                continue
            if ", dein Schnitt ist " in i.text_de:
                shown, shown_baseline = i.text_de.rsplit(", dein Schnitt ist ", 1)
                assert shown.rstrip() != shown_baseline.rstrip(". ")

    def test_no_raw_english_template_id_reaches_the_athlete(self):
        out = _build(
            days=_days(hrv_recent=44.0, hrv_baseline=62.0),
            directive=_directive("deload", "easy", 0.6, "below"),
            readiness=DailyDecisionReadiness(score=43, tier="easy"),
        )
        for text in (out.verdict.text_de, out.verdict.counterfactual_text_de):
            assert "_" not in text, text


class TestNormalDay:
    def _normal(self):
        return _build(
            days=_days(),
            directive=_directive(),
            readiness=DailyDecisionReadiness(score=80, tier="push"),
        )

    def test_no_downgrade(self):
        out = self._normal()
        assert out.withheld is False
        assert out.changed is False
        assert out.verdict is not None

    def test_counterfactual_equals_the_plan(self):
        out = self._normal()
        assert out.session_now is not None and out.session_planned is not None
        assert out.session_now.template_id == out.session_planned.template_id
        assert out.session_now.target_tss == out.session_planned.target_tss
        assert out.session_now.template_id == "sweet_spot_2x20"

    def test_verdict_is_the_plan_as_written(self):
        out = self._normal()
        assert "wie geplant" in out.verdict.text_de
        assert "Sweetspot" in out.verdict.text_de
        assert out.verdict.counterfactual_text_de == "Ohne diese Werte: die gleiche Einheit."

    def test_no_driver_when_nothing_is_off(self):
        # We do not promote a normal Tuesday to a cause.
        assert self._normal().driver is None

    def test_baselines_are_real(self):
        out = self._normal()
        assert out.baseline_state == "ready"
        assert all(i.baseline is not None for i in out.inputs)


# ---------------------------------------------------------------------------
#  A bad-HRV day — the feature
# ---------------------------------------------------------------------------


class TestBadHrvDay:
    def _bad(self):
        # 7-day mean well below a 28-day reference → estimate_hrv_state 'below'.
        days = _days(hrv_recent=44.0, hrv_baseline=62.0)
        assert _hrv_of(days).state == "below"
        return _build(
            days=days,
            directive=_directive(directive="deload", ceiling="easy", vol=0.6, hrv_state="below"),
            readiness=DailyDecisionReadiness(score=43, tier="easy"),
        )

    def test_the_day_is_downgraded(self):
        out = self._bad()
        assert out.withheld is False
        assert out.changed is True
        assert out.verdict.state == "recover"

    def test_the_counterfactual_differs_from_what_happens(self):
        out = self._bad()
        assert out.session_planned.template_id == "sweet_spot_2x20"
        assert out.session_now.template_id != "sweet_spot_2x20"
        assert out.session_now.target_tss < out.session_planned.target_tss

    def test_the_verdict_is_an_action_not_an_adjective(self):
        out = self._bad()
        # "Grundlagenausdauer — 90 min statt Sweetspot — 2×20 min."
        assert " statt " in out.verdict.text_de
        assert "Sweetspot" in out.verdict.text_de
        assert out.verdict.text_de.split(" statt ")[0] != "Sweetspot — 2×20 min"

    def test_the_counterfactual_line_names_what_was_lost(self):
        out = self._bad()
        assert out.verdict.counterfactual_text_de.startswith("Ohne diese Werte:")
        assert "Sweetspot — 2×20 min" in out.verdict.counterfactual_text_de

    def test_hrv_is_named_as_the_driver_with_its_number(self):
        out = self._bad()
        assert out.driver is not None
        assert out.driver.key == "hrv"
        assert "unter deinem Schnitt" in out.driver.text_de
        assert "ms" in out.driver.text_de
        # A real measured gap, not a category.
        digits = [c for c in out.driver.text_de if c.isdigit()]
        assert digits

    def test_the_receipt_is_recomputed_and_not_yet_applied(self):
        out = self._bad()
        assert out.counterfactual_source == "recomputed"
        assert out.applied is False  # the plan row on disk is untouched
        assert out.can_modify is True  # …and /workouts/today/modify can act

    def test_a_worse_single_night_signal_can_outrank_hrv(self):
        """The driver is whichever input is furthest outside its OWN band."""
        import statistics

        days = _days(hrv_recent=58.0, hrv_baseline=60.0)  # HRV in band
        ref = [d.sleep_score for d in days if 1 <= (TODAY - d.day).days <= BASELINE_DAYS]
        crashed = statistics.mean(ref) - 6.0 * statistics.pstdev(ref)
        days = [
            d if d.day != TODAY else MetricDay(**{**d.__dict__, "sleep_score": crashed})
            for d in days
        ]
        driver = pick_driver(build_inputs(days, _hrv_of(days), today=TODAY))
        assert driver is not None and driver.key == "sleep_score"


# ---------------------------------------------------------------------------
#  A stale wearable — no verdict at all
# ---------------------------------------------------------------------------


class TestStaleWearable:
    def _stale(self, end_offset: int = 4):
        days = _days(end_offset=end_offset, hrv_recent=44.0, hrv_baseline=62.0)
        return _build(
            days=days,
            directive=_directive(directive="deload", ceiling="easy", vol=0.6, hrv_state="unknown"),
            readiness=DailyDecisionReadiness(score=43, tier="easy"),
        )

    def test_there_is_no_verdict(self):
        out = self._stale()
        assert out.gate == "stale"
        assert out.withheld is True
        assert out.verdict is None

    def test_no_counterfactual_is_claimed_either(self):
        out = self._stale()
        assert out.session_planned is None
        assert out.changed is False
        assert out.counterfactual_source is None
        assert out.driver is None

    def test_the_readiness_number_is_withheld_with_the_verdict(self):
        # A confident 43 next to a withheld verdict is the same lie, smaller.
        out = self._stale()
        assert out.readiness_score is None
        assert out.readiness_tier is None

    def test_the_reason_names_the_age(self):
        out = self._stale()
        assert out.withheld_reason_de is not None
        assert "4 Tagen" in out.withheld_reason_de
        assert out.data_age_days == 4

    def test_the_plan_still_stands_and_the_inputs_are_still_shown(self):
        # Honest absence, not a blank screen: the athlete can see WHAT is stale.
        out = self._stale()
        assert out.session_now is not None
        assert out.session_now.template_id == "sweet_spot_2x20"
        assert out.inputs
        hrv = next(i for i in out.inputs if i.key == "hrv")
        assert hrv.age_days == 4

    def test_every_stale_reading_is_dated(self):
        """Withholding the verdict is only half the rule — the other half is
        that no measurement is ever stated in the present tense off an old
        reading."""
        out = self._stale()
        for i in out.inputs:
            assert i.note_de is not None, f"{i.key} is undated at age {i.age_days}"
            assert "vor 4 Tagen" in i.note_de

    def test_a_yesterday_reading_says_yesterday(self):
        out = self._stale(end_offset=1)
        rhr = next(i for i in out.inputs if i.key == "resting_hr")
        assert "Gemessen gestern." in rhr.note_de

    def test_todays_readings_carry_no_age_note(self):
        out = _build(
            days=_days(),
            directive=_directive(),
            readiness=DailyDecisionReadiness(score=80, tier="push"),
        )
        for i in out.inputs:
            assert i.note_de is None

    def test_a_morning_that_has_not_synced_yet_also_withholds(self):
        out = self._stale(end_offset=1)
        assert out.gate == "pending"
        assert out.withheld is True
        assert out.verdict is None
        assert "gestern" in out.withheld_reason_de


# ---------------------------------------------------------------------------
#  Too little history — never a fabricated baseline
# ---------------------------------------------------------------------------


class TestNoBaselineYet:
    def _new_athlete(self):
        return _build(
            days=_days(n=MIN_BASELINE_N - 5),
            directive=_directive(),
            readiness=DailyDecisionReadiness(score=None, tier=None),
        )

    def test_no_baseline_is_invented(self):
        out = self._new_athlete()
        assert out.baseline_state == "building"
        for i in out.inputs:
            assert i.baseline is None, f"{i.key} claimed a baseline"
            assert i.deviation is None
            assert i.z is None

    def test_the_payload_says_how_much_history_is_missing(self):
        out = self._new_athlete()
        hrv = next(i for i in out.inputs if i.key == "hrv")
        assert hrv.note_de is not None
        assert str(MIN_BASELINE_N) in hrv.note_de
        assert "noch keine Basislinie" in hrv.text_de

    def test_the_measured_values_are_still_reported(self):
        out = self._new_athlete()
        hrv = next(i for i in out.inputs if i.key == "hrv")
        assert hrv.value is not None  # what was measured is real; the reference is not

    def test_nothing_is_named_as_a_driver(self):
        out = self._new_athlete()
        assert out.driver is None
        assert out.changed is False

    def test_the_plan_still_gets_a_verdict(self):
        # No baseline is not the same as no plan.
        out = self._new_athlete()
        assert out.withheld is False
        assert out.verdict is not None
        assert "wie geplant" in out.verdict.text_de

    def test_no_metrics_at_all_is_the_honest_empty_state(self):
        out = _build(
            days=[],
            directive=_directive(),
            readiness=DailyDecisionReadiness(),
        )
        assert out.gate == "none"
        assert out.withheld is False  # an athlete with no wearable is not "stale"
        assert out.baseline_state == "none"
        assert out.driver is None
        assert all(i.value is None for i in out.inputs)
        assert out.verdict is not None  # the plan is still the plan


# ---------------------------------------------------------------------------
#  The recorded receipt — the plan engine's own before/after image
# ---------------------------------------------------------------------------


class TestRecordedCounterfactual:
    def test_a_logged_adaptation_beats_a_recomputation(self):
        from app.services.readiness_decision import _session_from_diff

        before = _session_from_diff(
            {"template_id": "sweet_spot_2x20", "title": "Sweet Spot 2x20", "target_tss": 68}
        )
        after = _session_from_diff(
            {"template_id": "z2_endurance_90", "title": "Z2 Endurance 90", "target_tss": 63}
        )
        out = _build(
            days=_days(hrv_recent=44.0, hrv_baseline=62.0),
            directive=_directive(directive="deload", ceiling="easy", vol=0.6, hrv_state="below"),
            readiness=DailyDecisionReadiness(score=43, tier="easy"),
            recorded=(before, after),
        )
        assert out.counterfactual_source == "recorded"
        assert out.applied is True  # the plan row already carries the change
        assert out.changed is True
        assert out.session_planned.template_id == "sweet_spot_2x20"
        assert out.session_now.template_id == "z2_endurance_90"
        # German template names, never a raw English row title.
        assert "Sweetspot" in out.session_planned.title
        assert "Grundlagen" in out.session_now.title


# ---------------------------------------------------------------------------
#  States where readiness did not author the day
# ---------------------------------------------------------------------------


class TestNonTrainingStates:
    def test_a_rest_day_gets_a_plain_line_and_no_counterfactual(self):
        out = _build(
            days=_days(),
            directive=_directive(),
            readiness=DailyDecisionReadiness(score=80, tier="push"),
            ctx=TodayContext(planned=None, planned_is_rest=True),
        )
        assert out.verdict.text_de == "Ruhetag."
        assert out.session_planned is None
        assert out.changed is False
        assert out.can_modify is False

    def test_sick_is_not_withheld_even_on_a_stale_watch(self):
        out = _build(
            days=_days(end_offset=6),
            directive=None,
            readiness=DailyDecisionReadiness(),
            status_state="sick",
        )
        assert out.gate == "stale"
        assert out.withheld is False  # the sick card carries its own explanation
        assert out.verdict.text_de == "Krank gemeldet. Kein Training."
