"""The rails must never take intensity away — only space it out."""
from datetime import date

import pytest

from app.services.age_rails import (
    age_years, rails_for_age, rails_for_profile,
)


class TestAgeYears:
    def test_reads_a_birthday(self):
        assert age_years("1960-05-01", today=date(2026, 8, 26)) == 66

    def test_has_not_had_this_years_birthday_yet(self):
        assert age_years("1960-12-31", today=date(2026, 8, 26)) == 65

    def test_an_unknown_birthday_is_unknown_rather_than_old(self):
        # The whole point: a blank field must not quietly shrink somebody's plan.
        assert age_years(None) is None
        assert age_years("") is None
        assert age_years("not-a-date") is None


class TestTheRailsNeverRemoveIntensity:
    """The claim this module exists to refuse: 'he is 85, drop the VO₂ work'."""

    @pytest.mark.parametrize("age", [25, 55, 65, 75, 85, 95])
    def test_every_age_still_gets_hard_sessions(self, age):
        assert rails_for_age(age).max_hard_per_week >= 1

    def test_an_eighty_five_year_old_still_trains_hard_every_week(self):
        r = rails_for_age(85)
        assert r.max_hard_per_week == 1
        assert r.min_recovery_days == 3
        assert r.note and "VO₂" in r.note


class TestWhatDoesChange:
    def test_hard_days_fall_with_age_and_never_rise(self):
        ages = [30, 55, 65, 75, 85]
        hard = [rails_for_age(a).max_hard_per_week for a in ages]
        assert hard == sorted(hard, reverse=True)

    def test_recovery_between_them_grows_and_never_shrinks(self):
        ages = [30, 55, 65, 75, 85]
        rec = [rails_for_age(a).min_recovery_days for a in ages]
        assert rec == sorted(rec)

    def test_the_ramp_flattens_with_age(self):
        ages = [30, 55, 65, 75, 85]
        ramp = [rails_for_age(a).ramp_cap_pct for a in ages]
        assert ramp == sorted(ramp, reverse=True)

    def test_a_young_rider_keeps_friels_eight_percent(self):
        assert rails_for_age(30).ramp_cap_pct == pytest.approx(0.08)
        assert rails_for_age(None).ramp_cap_pct == pytest.approx(0.08)

    def test_the_reason_is_shown_not_hidden(self):
        # Anything restricted carries a sentence the rider can read.
        for age in (55, 65, 75, 85):
            assert rails_for_age(age).note
        assert rails_for_age(30).note is None


class TestFromTheProfile:
    def test_reads_straight_off_a_stored_birth_date(self):
        r = rails_for_profile("1941-01-01", today=date(2026, 8, 26))
        assert r.max_hard_per_week == 1

    def test_a_profile_with_no_birthday_trains_unrestricted(self):
        assert rails_for_profile(None).max_hard_per_week == 3


class TestTheRailsActuallyReachThePlan:
    """Reachability, not just correctness.

    A rails module that computes the right ceiling and is called by nothing is
    this codebase's most common failure. These drive `weekly_tss_target` — the
    function the mesocycle generator uses for every week of every plan.
    """

    @staticmethod
    def _ramp(cap):
        from app.services.mesocycle_generator import weekly_tss_target
        # Accumulation on a rider with a settled CTL: the ramp is what varies.
        return weekly_tss_target(
            ctl=60.0, phase="build", block_position="accumulation",
            weekly_hours=8.0, ramp_cap_pct=cap,
        )

    def test_an_older_rider_gets_a_flatter_week_than_a_younger_one(self):
        young = self._ramp(rails_for_age(30).ramp_cap_pct)
        old = self._ramp(rails_for_age(85).ramp_cap_pct)
        assert old < young, "the age rails are not reaching the weekly target"

    def test_no_cap_behaves_exactly_as_before(self):
        from app.services.mesocycle_generator import (
            FRIEL_RAMP_CAP_PCT, weekly_tss_target,
        )
        default = weekly_tss_target(
            ctl=60.0, phase="build", block_position="accumulation", weekly_hours=8.0,
        )
        friel = self._ramp(FRIEL_RAMP_CAP_PCT)
        assert default == friel

    def test_a_rider_with_no_birthday_is_unaffected(self):
        from app.services.mesocycle_generator import weekly_tss_target
        default = weekly_tss_target(
            ctl=60.0, phase="build", block_position="accumulation", weekly_hours=8.0,
        )
        assert self._ramp(rails_for_profile(None).ramp_cap_pct) == default


class TestTheRailsShapeARealWeek:
    """Not "does the rule compute" but "does a built week obey it".

    `build_week_drafts` places one day at a time, so a weekly invariant only
    holds if it is checked as each day lands. These drive the real builder and
    read the field it actually emits — `template_id`. An earlier version of this
    test read `session_type`, which drafts do not carry, so it saw zero hard
    days everywhere and would have passed against a completely broken rail.
    """

    #: Hard work, by the prefix the real templates use: threshold, VO₂, sweet
    #: spot, tempo. Everything else on a draft is z2_* or rest_day.
    HARD_PREFIXES = ("thr_", "vo2_", "ss_", "tempo_")

    @classmethod
    def _hard_days(cls, dob):
        from datetime import date
        from types import SimpleNamespace
        from app.services.mesocycle_generator import build_week_drafts

        athlete = SimpleNamespace(
            id=1, user_id=1, ftp_watts=250, primary_sport="cycling",
            target_event_date=None, target_event_type=None,
            weekly_hours_available=10.0, secondary_sports=[],
            date_of_birth=dob,
        )
        drafts = build_week_drafts(
            athlete=athlete, week_start=date(2026, 9, 7), phase="build2",
            weekly_tss_target_val=450, block_position="accumulation", ftp_w=250,
        )
        return [
            i for i, d in enumerate(drafts)
            if str(getattr(d, "template_id", "")).startswith(cls.HARD_PREFIXES)
        ]

    def test_the_fixture_produces_hard_days_at_all(self):
        # Guard: without this the assertions below pass vacuously on zero.
        assert len(self._hard_days(None)) >= 2

    def test_an_85_year_old_gets_at_most_one_hard_day(self):
        assert len(self._hard_days("1941-01-01")) <= 1

    def test_but_still_gets_one(self):
        # Spacing, never removal — a week with no intensity would be the plan
        # quietly giving up on an older rider.
        assert len(self._hard_days("1941-01-01")) >= 1

    def test_a_60_something_keeps_two_days_at_least_two_apart(self):
        hard = self._hard_days("1961-01-01")
        assert len(hard) <= 2
        gaps = [b - a for a, b in zip(hard, hard[1:])]
        assert all(g > 2 for g in gaps), f"hard days too close together: {hard}"

    def test_a_rider_with_no_birthday_keeps_the_full_week(self):
        assert len(self._hard_days(None)) > len(self._hard_days("1941-01-01"))


class TestTheDefaultIsATrueNoOp:
    """The regression this module caused on its first run.

    The spacing check is `gap <= min_recovery_days`. The first draft gave the
    DEFAULT rails `min_recovery_days=1`, and since two distinct days are always
    at least one apart, that silently banned back-to-back hard days for EVERY
    rider in the app — not just older ones. Four dual-sport tests caught it,
    because the quality-run placer reads the bike week's hard-day pattern.
    """

    def test_a_general_athlete_has_no_spacing_rule_at_all(self):
        assert rails_for_age(30).min_recovery_days == 0
        assert rails_for_age(None).min_recovery_days == 0

    def test_back_to_back_hard_days_stay_legal_by_default(self):
        # gap of 1 (Tue then Wed) must not trip `gap <= min_recovery_days`
        assert 1 > rails_for_age(None).min_recovery_days

    def test_restrictions_begin_at_fifty_not_at_birth(self):
        assert rails_for_age(49) == rails_for_age(None)
        assert rails_for_age(50) != rails_for_age(None)
