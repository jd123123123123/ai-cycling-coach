"""Unit tests for the Bayesian Fitness-Fatigue performance projection.

Verifies: confidence bands widen with LESS data and narrow with MORE data,
the eFTP-sample extractor gates correctly, and the projection degrades
honestly (fitness mode + wide bands) with no performance series.
"""
from __future__ import annotations

from datetime import date, timedelta

from app.services.performance_projection import (
    K2_OVER_K1,
    _decay_convolutions,
    eftp_samples_from_activities,
    project_performance,
)

TODAY = date(2026, 7, 1)


def _ramp_past(n: int = 120) -> list[dict]:
    """A rising build so the model signal x(t) varies across the window."""
    start = TODAY - timedelta(days=n - 1)
    return [
        {"date": start + timedelta(days=i), "tss": 30.0 + (80.0 * i / (n - 1))}
        for i in range(n)
    ]


def _future(n: int = 84, tss: float = 80.0) -> list[dict]:
    return [{"date": TODAY + timedelta(days=i + 1), "tss": tss} for i in range(n)]


def _x_by_date(past: list[dict]) -> dict[str, float]:
    """Reconstruct the model signal x(t) on past dates (same math as service)."""
    tss = [p["tss"] for p in past]
    g1, g2 = _decay_convolutions(tss)
    x = [a - K2_OVER_K1 * b for a, b in zip(g1, g2)]
    return {p["date"].isoformat(): xi for p, xi in zip(past, x)}


def _obs_from(past: list[dict], n: int) -> list[dict]:
    """n eFTP samples spread across the window, following a clean linear map."""
    xbd = _x_by_date(past)
    dates = [p["date"] for p in past]
    # evenly spaced sample indices across the past window
    idxs = [round(i * (len(dates) - 1) / (n - 1)) for i in range(n)]
    obs = []
    for k in idxs:
        d = dates[k]
        x = xbd[d.isoformat()]
        obs.append({"date": d.isoformat(), "value": 250.0 + 0.08 * x})
    return obs


def _band80_width(proj: dict) -> float:
    lo, hi = proj["band_80"]
    return hi - lo


def test_bands_narrow_with_more_data():
    past = _ramp_past()
    future = _future()
    few = project_performance(
        past, future, ftp_watts=250, observations=_obs_from(past, 3), today=TODAY
    )
    many = project_performance(
        past, future, ftp_watts=250, observations=_obs_from(past, 30), today=TODAY
    )
    assert few["mode"] == "performance"
    assert many["mode"] == "performance"
    # More performance samples ⇒ tighter posterior ⇒ narrower 80% band.
    assert _band80_width(many) < _band80_width(few)


def test_fitness_fallback_when_no_samples_is_wide():
    past = _ramp_past()
    future = _future()
    proj = project_performance(past, future, ftp_watts=250, observations=[], today=TODAY)
    assert proj["mode"] == "fitness"
    assert proj["samples_used"] == 0
    # Fallback bands are deliberately wide vs a well-sampled performance fit.
    fitted = project_performance(
        past, future, ftp_watts=250, observations=_obs_from(past, 30), today=TODAY
    )
    assert _band80_width(proj) > _band80_width(fitted)


def test_band_ordering_and_shape():
    past = _ramp_past()
    proj = project_performance(
        past, _future(), ftp_watts=250, observations=_obs_from(past, 12), today=TODAY
    )
    for pt in proj["path"]:
        # 80% band strictly contains 50% band contains central.
        assert pt["p10"] <= pt["p25"] <= pt["central"] <= pt["p75"] <= pt["p90"]
    assert proj["band_50"][0] >= proj["band_80"][0]
    assert proj["band_50"][1] <= proj["band_80"][1]


def test_goal_date_caps_horizon():
    past = _ramp_past()
    goal = TODAY + timedelta(days=35)
    proj = project_performance(
        past, _future(), ftp_watts=250, observations=_obs_from(past, 8),
        today=TODAY, goal_date=goal,
    )
    assert proj["horizon_date"] == goal.isoformat()
    assert proj["days_out"] == 35


def test_empty_history_degrades_gracefully():
    proj = project_performance([], _future(), ftp_watts=250, today=TODAY)
    assert proj["projected_central"] is None
    assert proj["path"] == []


def _all_finite(proj: dict) -> bool:
    import math

    def fin(v):
        return isinstance(v, (int, float)) and math.isfinite(v)

    if not (fin(proj["current_estimate"]) and fin(proj["projected_central"])):
        return False
    if not proj["projected_outcome"]:
        return False
    if not (proj["band_50"] and proj["band_80"]):
        return False
    for arr in (proj["band_50"], proj["band_80"]):
        if not all(fin(v) for v in arr):
            return False
    for pt in proj["path"]:
        if not all(fin(pt[k]) for k in ("central", "p10", "p90", "p25", "p75")):
            return False
    return True


def test_no_nan_realistic_history_with_eftp():
    """Realistic TSS + eFTP history → every emitted number finite (no NaN/None)."""
    past = _ramp_past()
    proj = project_performance(
        past, _future(), ftp_watts=250, observations=_obs_from(past, 10), today=TODAY
    )
    assert proj["mode"] == "performance"
    assert _all_finite(proj)


def test_no_nan_when_bands_exist_but_no_current_eftp_sample():
    """User-5 path: cycling power history, ≥3 eFTP samples but none recent.

    Must still yield finite current/projected/path — never NaN/None.
    """
    past = _ramp_past()
    # All eFTP samples are old (60–100 days ago); none near "today".
    old = [
        {"date": (TODAY - timedelta(days=d)).isoformat(), "value": 240.0}
        for d in (100, 80, 60)
    ]
    proj = project_performance(past, _future(), ftp_watts=250, observations=old, today=TODAY)
    assert proj["mode"] == "performance"
    assert proj["current_estimate"] is not None
    assert proj["projected_central"] is not None
    assert _all_finite(proj)


def test_no_nan_when_inputs_contain_non_finite():
    """NaN normalized_power / NaN eFTP value / NaN TSS must never leak NaN out."""
    past = [dict(p) for p in _ramp_past()]
    past[40]["tss"] = float("nan")  # poison one past day
    obs = [
        {"date": (TODAY - timedelta(days=d)).isoformat(),
         "value": (float("nan") if d == 60 else 240.0)}
        for d in (100, 80, 60, 40)
    ]
    proj = project_performance(past, _future(), ftp_watts=250, observations=obs, today=TODAY)
    assert _all_finite(proj)

    # NaN normalized_power in an activity is rejected by the extractor.
    acts = [
        {"date": TODAY - timedelta(days=5), "normalized_power": float("nan"), "duration_seconds": 1800},
        {"date": TODAY - timedelta(days=6), "normalized_power": float("inf"), "duration_seconds": 1800},
        {"date": TODAY - timedelta(days=7), "normalized_power": 240.0, "duration_seconds": 1800},
    ]
    samples = eftp_samples_from_activities(acts, ftp_watts=250)
    assert samples == [{"date": (TODAY - timedelta(days=7)).isoformat(), "value": 240.0}]


def test_current_estimate_respects_anchor():
    """Audit P0-1: with a stored FTP of 240 the Plan tab must not show 223 —
    the projection is re-anchored so 'today' sits on the canonical threshold,
    even when the eFTP samples pull far below it."""
    past = _ramp_past()
    xbd = _x_by_date(past)
    dates = [p["date"] for p in past]
    idxs = [round(i * (len(dates) - 1) / 9) for i in range(10)]
    low_obs = [
        {"date": dates[k].isoformat(), "value": 200.0 + 0.05 * xbd[dates[k].isoformat()]}
        for k in idxs
    ]
    proj = project_performance(
        past, _future(), ftp_watts=240, observations=low_obs, today=TODAY
    )
    assert proj["mode"] == "performance"
    assert abs(proj["current_estimate"] - 240.0) <= 2.0


def test_fitness_mode_current_estimate_anchored_too():
    past = _ramp_past()
    proj = project_performance(past, _future(), ftp_watts=240, observations=[], today=TODAY)
    assert abs(proj["current_estimate"] - 240.0) <= 2.0


def test_confidence_pct_exposed_and_gated():
    past = _ramp_past()
    none_ = project_performance(past, _future(), ftp_watts=250, observations=[], today=TODAY)
    many = project_performance(
        past, _future(), ftp_watts=250, observations=_obs_from(past, 30), today=TODAY
    )
    assert 0 <= none_["confidence_pct"] <= 100
    assert 0 <= many["confidence_pct"] <= 100
    # No performance samples → below the 30% show-a-range gate; a well-sampled
    # fit → comfortably above it.
    assert none_["confidence_pct"] < 30
    assert many["confidence_pct"] >= 30
    assert many["confidence_pct"] > none_["confidence_pct"]


def test_empty_projection_has_zero_confidence():
    proj = project_performance([], _future(), ftp_watts=250, today=TODAY)
    assert proj["confidence_pct"] == 0


def test_eftp_sample_gate():
    acts = [
        # qualifies: 30 min at NP 240 (IF 240/250=0.96)
        {"date": TODAY, "normalized_power": 240, "duration_seconds": 1800},
        # too short
        {"date": TODAY - timedelta(days=1), "normalized_power": 240, "duration_seconds": 600},
        # too easy (IF 0.6)
        {"date": TODAY - timedelta(days=2), "normalized_power": 150, "duration_seconds": 3600},
        # no power
        {"date": TODAY - timedelta(days=3), "normalized_power": None, "duration_seconds": 3600},
    ]
    samples = eftp_samples_from_activities(acts, ftp_watts=250)
    assert len(samples) == 1
    assert samples[0]["value"] == 240
