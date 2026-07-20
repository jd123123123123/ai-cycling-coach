"""deviation_window_start — the plan-deviation lookback clamp (audit P0-5).

'You skipped Tuesday' must never reference last week: the trailing-7-day
window is clamped to the Monday of the current athlete-local week.
"""
from __future__ import annotations

from datetime import date, timedelta

from app.api.weeks import deviation_window_start


class TestDeviationWindowClamp:
    def test_midweek_clamps_to_monday(self):
        wednesday = date(2026, 7, 15)  # a Wednesday
        assert wednesday.weekday() == 2
        assert deviation_window_start(wednesday) == date(2026, 7, 13)  # Monday

    def test_sunday_clamps_to_monday_not_seven_days(self):
        sunday = date(2026, 7, 19)
        assert sunday.weekday() == 6
        # 7 days back would be last Sunday — clamp keeps it at this Monday.
        assert deviation_window_start(sunday) == date(2026, 7, 13)

    def test_monday_yields_empty_window(self):
        monday = date(2026, 7, 13)
        assert monday.weekday() == 0
        # win_start == today → [today, today) is empty: nothing citable from
        # the current week yet, and last week is out of bounds by design.
        assert deviation_window_start(monday) == monday

    def test_never_earlier_than_current_monday(self):
        for offset in range(14):
            d = date(2026, 7, 6) + timedelta(days=offset)
            monday = d - timedelta(days=d.weekday())
            assert deviation_window_start(d) >= monday
