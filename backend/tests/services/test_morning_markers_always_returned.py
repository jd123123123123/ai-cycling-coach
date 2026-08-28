"""A marker that is FINE is still worth returning.

The detector used to append only `triggered` signals, and that one condition
was why HRV was missing from two separate screens: the Today nudge had no HRV
row to draw and the morning report's HRV spectrum had no series to build a band
from. The app measured the marker, decided it was unremarkable, and dropped it —
so a health screen could only ever deliver bad news.
"""
from datetime import date, timedelta

from app.services.morning_health_detector import detect_morning_health


def _days(n: int = 28, **today):
    """A steady rider, with today overridable per marker."""
    out = []
    for i in range(n):
        d = date(2026, 8, 28) - timedelta(days=n - 1 - i)
        row = {"date": d, "rhr": 48.0, "hrv": 70.0, "respiration": 14.0,
               "spo2": 97.0, "sleep_score": 80.0}
        if i == n - 1:
            row.update(today)
        out.append(row)
    return out


def _metrics(verdict) -> set[str]:
    return {s["metric"] for s in verdict["signals"]}


def test_hrv_is_returned_on_a_perfectly_normal_morning():
    """The bug, stated directly. Nothing is wrong with this rider and HRV must
    still be on the response — "your HRV is where it should be" is only legible
    if the number survives being fine."""
    v = detect_morning_health(_days())
    assert "hrv" in _metrics(v)


def test_a_normal_morning_carries_every_marker_it_measured():
    v = detect_morning_health(_days())
    assert {"resting_hr", "hrv", "respiration"} <= _metrics(v)


def test_a_calm_marker_is_not_flagged_as_a_reason():
    """Being visible and being a warning are different things, and conflating
    them is what produced the original bug."""
    v = detect_morning_health(_days())
    hrv = next(s for s in v["signals"] if s["metric"] == "hrv")
    assert hrv["triggered"] is False


def test_a_marker_that_really_deviates_is_still_flagged():
    """The fix must not make the flag meaningless — a genuine deviation still
    says so, which is what the nudge sorts on."""
    v = detect_morning_health(_days(rhr=62.0, hrv=38.0))
    flagged = {s["metric"] for s in v["signals"] if s["triggered"]}
    assert "hrv" in flagged or "resting_hr" in flagged


def test_every_returned_marker_carries_its_series():
    """The series is what the spectrum builds its band from. A marker returned
    without one draws nothing, which is the same bug wearing a different hat."""
    v = detect_morning_health(_days())
    assert all(len(s["series"]) > 0 for s in v["signals"])
