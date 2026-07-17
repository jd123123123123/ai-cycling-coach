"""Unit tests for the illness/overtraining/readiness detector.

Deterministic, pure — no DB. Verifies the signal fires on the classic
HRV-drop + RHR-rise illness fingerprint and stays GREEN on a stable series,
using the athlete's OWN rolling baseline.
"""
from __future__ import annotations

from datetime import date, timedelta

from app.services.readiness_detector import detect_readiness


def _series(hrv_rhr: list[tuple[float | None, float | None]]) -> list[dict]:
    start = date(2026, 6, 1)
    return [
        {"date": start + timedelta(days=i), "hrv": h, "rhr": r}
        for i, (h, r) in enumerate(hrv_rhr)
    ]


def test_green_on_stable_series():
    # 10 stable days + a normal today.
    hist = [(60, 50), (61, 49), (59, 51), (62, 50), (60, 49),
            (61, 50), (59, 51), (60, 50), (61, 49), (60, 50)]
    today = (61, 50)
    out = detect_readiness(_series(hist + [today]))
    assert out["status"] == "green"
    assert out["suggest_easy"] is False


def test_illness_on_hrv_drop_plus_rhr_rise():
    # Stable baseline, then today HRV collapses far below and RHR jumps >5 bpm.
    hist = [(60, 50), (61, 49), (59, 51), (62, 50), (60, 49),
            (61, 50), (59, 51), (60, 50), (61, 49), (60, 50)]
    today = (40, 58)  # HRV << mu-1sigma, RHR +8 over baseline
    out = detect_readiness(_series(hist + [today]))
    assert out["status"] == "illness"
    assert out["suggest_easy"] is True
    assert "resting" in out["reason_en"].lower()


def test_amber_on_mild_hrv_dip_without_rhr_rise():
    # Today dips below SWC but not below 1 sigma, and RHR stays normal.
    hist = [(60, 50), (64, 50), (58, 50), (62, 50), (59, 50),
            (63, 50), (57, 50), (61, 50), (60, 50), (62, 50)]
    today = (56, 50)  # a touch low, RHR unchanged
    out = detect_readiness(_series(hist + [today]))
    assert out["status"] == "amber"
    assert out["suggest_easy"] is True


def test_unknown_when_too_few_readings():
    out = detect_readiness(_series([(60, 50), (61, 50), (None, 50)]))
    assert out["status"] == "unknown"


def test_empty_history():
    assert detect_readiness([])["status"] == "unknown"
