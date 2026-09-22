"""Cross the real adjustment serializer -> stored plan -> week/history boundary."""
from copy import deepcopy
from datetime import date
from types import SimpleNamespace

import pytest

from app.api.weeks import _build_day_plan
from app.services.plan_history import target_tss
from app.services.plan_intervals import week_interval
from app.services.workout_modifier import materialize_template
from app.services.workout_templates import TEMPLATES


def stored_workout(blocks, template_id=None, duration=3660):
    return SimpleNamespace(
        template_id=template_id, title="Adjusted session", sport="cycling",
        duration_seconds_target=duration, interval_structure={"intervals": blocks},
    )


def api_day(row):
    return _build_day_plan(date(2026, 9, 22), row, date(2026, 9, 22), "cycling", "simple", "de")


def test_current_adjusted_endurance_prescription_is_visible_without_rebuilding():
    blocks, minutes, _, _ = materialize_template(
        "z2_endurance_60", 240, duration_min_target=61, indoor=False,
    )
    before = deepcopy(blocks)
    row = stored_workout(blocks, "z2_endurance_60", minutes * 60)
    day = api_day(row)
    assert day.duration_seconds_target == 3660
    assert len(day.intervals) == 1
    assert day.intervals[0].duration_seconds == 3660
    assert day.intervals[0].power_target_pct_ftp == .65
    assert day.intervals[0].zone == 2
    assert day.intervals[0].target_watts_low == 144
    assert day.intervals[0].cadence_low == 85
    assert target_tss(row) == pytest.approx(43.0)
    assert blocks == before  # Reading must not rewrite the rider's plan/history.


@pytest.mark.parametrize("template_id", sorted(TEMPLATES))
def test_all_materialized_templates_keep_durations_and_power(template_id):
    blocks, minutes, _, _ = materialize_template(template_id, 240, duration_min_target=None, indoor=False)
    day = api_day(stored_workout(blocks, template_id, minutes * 60))
    assert len(day.intervals) == len(blocks)
    for original, decoded in zip(blocks, day.intervals):
        assert decoded.duration_seconds == original["duration_s"]
        assert decoded.power_target_pct_ftp == original["target_pct_ftp"]
        for name in ("reps", "on_s", "off_s", "off_pct_ftp"):
            assert getattr(decoded, name) == original.get(name)


def test_mixed_formats_keep_order_and_precise_zone_duration():
    blocks = [
        {"duration_seconds": 600, "power_target_pct_ftp": .5, "zone": 1},
        {"duration_s": 3000, "target_pct_ftp": .7, "zone": 2},
    ]
    day = api_day(stored_workout(blocks, duration=3600))
    assert [(b.duration_seconds, b.power_target_pct_ftp) for b in day.intervals] == [(600, .5), (3000, .7)]
    assert target_tss(stored_workout(blocks, duration=3600)) == 45


@pytest.mark.parametrize("canonical", [None, 0, .6])
def test_explicit_canonical_power_is_authoritative(canonical):
    block = {"duration_seconds": 600, "duration_s": 999, "power_target_pct_ftp": canonical, "target_pct_ftp": .9}
    decoded = week_interval(block)
    assert decoded["duration_seconds"] == 600
    assert decoded["power_target_pct_ftp"] == canonical
    assert block == decoded


def test_absent_power_stays_unknown_even_for_a_known_template():
    row = stored_workout([{"duration_s": 3600, "zone": 2}], "z2_endurance_60", 3600)
    assert api_day(row).intervals[0].power_target_pct_ftp is None
    assert target_tss(row) is None


def test_rest_and_missing_blocks_stay_empty():
    assert api_day(stored_workout([], "rest_day", 0)).intervals == []
    assert target_tss(stored_workout([], "rest_day", 0)) == 0
    assert api_day(stored_workout([], "z2_endurance_60", 3600)).intervals == []
    assert target_tss(stored_workout([], "z2_endurance_60", 3600)) is None
