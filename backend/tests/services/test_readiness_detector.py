"""Unit tests for the illness/overtraining/readiness detector.

Deterministic, pure — no DB. Verifies the signal fires on the classic
HRV-drop + RHR-rise illness fingerprint and stays GREEN on a stable series,
using the athlete's OWN rolling baseline.

Every test passes `today` explicitly: the detector refuses to judge when its
newest row is not dated today (the July-2026 stale-vitals fix), so a fixed-date
fixture must say which day it is pretending to be.
"""
from __future__ import annotations

from datetime import date, timedelta

from app.services.readiness_detector import detect_readiness

_START = date(2026, 6, 1)


def _series(hrv_rhr: list[tuple[float | None, float | None]]) -> list[dict]:
    return [
        {"date": _START + timedelta(days=i), "hrv": h, "rhr": r}
        for i, (h, r) in enumerate(hrv_rhr)
    ]


def _last_day(hrv_rhr: list) -> date:
    """The date the final row of a `_series(...)` carries."""
    return _START + timedelta(days=len(hrv_rhr) - 1)


def _detect(hrv_rhr: list, *, today: date | None = None) -> dict:
    return detect_readiness(_series(hrv_rhr), today=today or _last_day(hrv_rhr))


def test_green_on_stable_series():
    # 10 stable days + a normal today.
    hist = [(60, 50), (61, 49), (59, 51), (62, 50), (60, 49),
            (61, 50), (59, 51), (60, 50), (61, 49), (60, 50)]
    today = (61, 50)
    out = _detect(hist + [today])
    assert out["status"] == "green"
    assert out["suggest_easy"] is False


def test_illness_on_hrv_drop_plus_rhr_rise():
    # Stable baseline, then today HRV collapses far below and RHR jumps >5 bpm.
    hist = [(60, 50), (61, 49), (59, 51), (62, 50), (60, 49),
            (61, 50), (59, 51), (60, 50), (61, 49), (60, 50)]
    today = (40, 58)  # HRV << mu-1sigma, RHR +8 over baseline
    out = _detect(hist + [today])
    assert out["status"] == "illness"
    assert out["suggest_easy"] is True
    assert "resting" in out["reason_en"].lower()


def test_amber_on_mild_hrv_dip_without_rhr_rise():
    # Today dips below SWC but not below 1 sigma, and RHR stays normal.
    hist = [(60, 50), (64, 50), (58, 50), (62, 50), (59, 50),
            (63, 50), (57, 50), (61, 50), (60, 50), (62, 50)]
    today = (56, 50)  # a touch low, RHR unchanged
    out = _detect(hist + [today])
    assert out["status"] == "amber"
    assert out["suggest_easy"] is True


def test_unknown_when_too_few_readings():
    out = _detect([(60, 50), (61, 50), (None, 50)])
    assert out["status"] == "unknown"


def test_empty_history():
    assert detect_readiness([], today=date(2026, 6, 11))["status"] == "unknown"


# ─────────────────────────────────────────────────────────────────────────────
# Staleness gate — the newest row must actually BE today.
#
# Regression cover for the live 2026-07-27 defect: with the freshest
# daily_metrics row dated 2026-07-20 the detector happily reported GREEN
# ("du bist erholt und bereit, wie geplant zu trainieren") off a week-old
# reading, because it took `daily[-1]` as today with no date check.
# ─────────────────────────────────────────────────────────────────────────────

_STABLE = [(60, 50), (61, 49), (59, 51), (62, 50), (60, 49),
           (61, 50), (59, 51), (60, 50), (61, 49), (60, 50), (61, 50)]


class TestStalenessGate:
    def test_newest_row_is_today_keeps_the_verdict(self):
        out = _detect(_STABLE, today=_last_day(_STABLE))
        assert out["status"] == "green"

    def test_newest_row_is_yesterday_returns_unknown(self):
        out = _detect(_STABLE, today=_last_day(_STABLE) + timedelta(days=1))
        assert out["status"] == "unknown"
        assert out["suggest_easy"] is False
        assert out["signals"] == {}

    def test_week_old_row_returns_unknown_and_names_the_date(self):
        # The exact live shape: last reading seven days ago.
        stale_day = _last_day(_STABLE)
        out = _detect(_STABLE, today=stale_day + timedelta(days=7))
        assert out["status"] == "unknown"
        assert stale_day.isoformat() in out["reason_en"]
        assert stale_day.isoformat() in out["reason_de"]
        # And crucially: no confident green claim survives.
        assert "ready to train" not in out["reason_en"]

    def test_stale_gate_also_suppresses_an_illness_verdict(self):
        # A week-old illness fingerprint is not a statement about today either.
        series = _STABLE[:-1] + [(40, 58)]
        assert _detect(series)["status"] == "illness"
        out = _detect(series, today=_last_day(series) + timedelta(days=3))
        assert out["status"] == "unknown"

    def test_iso_string_dates_are_accepted(self):
        rows = [
            {"date": (_START + timedelta(days=i)).isoformat(), "hrv": h, "rhr": r}
            for i, (h, r) in enumerate(_STABLE)
        ]
        fresh = detect_readiness(rows, today=_last_day(_STABLE))
        assert fresh["status"] == "green"
        stale = detect_readiness(rows, today=_last_day(_STABLE) + timedelta(days=1))
        assert stale["status"] == "unknown"

    def test_default_today_is_the_athlete_local_day_not_the_last_row(self):
        # No `today=` passed at all: the default must still gate, so a fixture
        # dated June 2026 can never be mistaken for the real current day.
        out = detect_readiness(_series(_STABLE))
        assert out["status"] == "unknown"
