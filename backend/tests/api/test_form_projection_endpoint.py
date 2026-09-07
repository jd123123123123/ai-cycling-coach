"""GET /analytics/form-projection — auth, validation, shape, honesty passthrough.

The router is mounted on a local FastAPI app rather than app.main, so this
module passes whether or not the router has been registered in main.py yet.
Pattern otherwise mirrors tests/api/test_season_trends.py: dependency_overrides
for auth + db, service patched to keep the endpoint DB-free.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.form import router as form_router
from app.dependencies import get_current_active_user, get_db_for_user

ROUTE = "/analytics/form-projection"


def _make_app() -> FastAPI:
    api = FastAPI()
    api.include_router(form_router)
    return api


def _make_user(user_id: int = 5) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.is_active = True
    return user


@pytest.fixture()
def api():
    return _make_app()


@pytest.fixture()
def client(api):
    db = MagicMock()
    db.execute = AsyncMock()
    api.dependency_overrides[get_current_active_user] = lambda: _make_user()
    api.dependency_overrides[get_db_for_user] = lambda: db
    yield TestClient(api)
    api.dependency_overrides.clear()


def _payload(**over) -> dict:
    base = {
        "available": True,
        "model": "individual",
        "model_reason": "Fitted to your own load-versus-performance history.",
        "fallback_reason": None,
        "confidence_pct": 62,
        "confidence_threshold_pct": 30,
        "range_required": False,
        "today": {"date": "2026-09-07", "fitness": 71.4, "fatigue": 66.2, "form": 5.2},
        "standard_today": {"date": "2026-09-07", "fitness": 68.1, "fatigue": 64.9, "form": 3.2},
        "constants": {
            "tau1_days": 54.0, "tau2_days": 12.0,
            "standard_tau1_days": 42.0, "standard_tau2_days": 7.0,
            "k1": 0.08, "k2": 0.12, "p0": 250.0,
            "r_squared": 0.94, "standard_r_squared": 0.81,
            "aicc": 12.4, "standard_aicc": 21.9,
            "selection_criterion": "AICc (lower wins)",
            "n_observations": 14, "n_observations_required": 8,
        },
        "performance_series": {
            "source": "activity_stream.mmp_curve[1200]",
            "metric": "best 20-minute mean-maximal power",
            "unit": "watts",
            "gate": "at least 90% of the window best",
            "gate_watts": 270.0, "window_best_watts": 300.0,
            "n_candidate_days": 31, "n_observations": 14,
            "points": [{"date": "2026-08-30", "watts": 291.0}],
        },
        "load": {
            "source": "plan", "assumption": None, "rolling_7d_tss": 74.3,
            "planned_days": 14, "horizon_days": 14,
            "uncertainty": {
                "sigma_tss_per_day": 21.4, "source": "plan_compliance", "n": 11,
                "band": "80%", "covers": "future load only",
            },
        },
        "history_days": 180,
        "projection": [{
            "date": "2026-09-08", "days_out": 1, "tss": 80.0, "load_source": "plan",
            "fitness": 71.6, "fatigue": 67.3, "form": 4.3,
            "fitness_low": 71.2, "fitness_high": 72.0,
            "fatigue_low": 65.1, "fatigue_high": 69.5,
            "form_low": 2.1, "form_high": 6.5,
        }],
    }
    base.update(over)
    return base


def test_requires_auth(api):
    api.dependency_overrides.clear()
    assert TestClient(api).get(ROUTE).status_code == 401


def test_rejects_out_of_range_horizon(client):
    assert client.get(f"{ROUTE}?horizon_days=0").status_code == 422
    assert client.get(f"{ROUTE}?horizon_days=999").status_code == 422


def test_returns_the_individual_model_with_its_constants(client):
    with patch("app.api.form.build_form_projection",
               new=AsyncMock(return_value=_payload())):
        res = client.get(ROUTE)
    assert res.status_code == 200
    body = res.json()
    assert body["model"] == "individual"
    assert body["constants"]["tau1_days"] == 54.0
    # The standard PMC number ships alongside, so the difference is visible.
    assert body["standard_today"]["fitness"] == 68.1
    assert body["constants"]["standard_aicc"] > body["constants"]["aicc"]
    assert body["projection"][0]["form_low"] < body["projection"][0]["form_high"]


def test_standard_fallback_is_reported_not_hidden(client):
    payload = _payload(
        model="standard",
        model_reason="Standard constants (fitness 42 d / fatigue 7 d).",
        fallback_reason="too_few_performance_observations",
        confidence_pct=25,
        range_required=True,
    )
    payload["constants"] = {**payload["constants"],
                            "tau1_days": 42.0, "tau2_days": 7.0,
                            "k1": None, "k2": None, "p0": None, "r_squared": None}
    with patch("app.api.form.build_form_projection", new=AsyncMock(return_value=payload)):
        body = client.get(ROUTE).json()
    assert body["model"] == "standard"
    assert body["fallback_reason"] == "too_few_performance_observations"
    assert body["constants"]["r_squared"] is None
    # The 30% rule arrives pre-resolved for the client.
    assert body["range_required"] is True
    assert body["confidence_pct"] < body["confidence_threshold_pct"]


def test_unplanned_horizon_surfaces_the_assumption(client):
    payload = _payload()
    payload["load"] = {**payload["load"], "source": "recent-average",
                       "assumption": "No plan covers this horizon. …not a prescription.",
                       "planned_days": 0}
    payload["projection"][0]["load_source"] = "recent-average"
    with patch("app.api.form.build_form_projection", new=AsyncMock(return_value=payload)):
        body = client.get(ROUTE).json()
    assert body["load"]["source"] == "recent-average"
    assert "not a prescription" in body["load"]["assumption"]
    assert body["projection"][0]["load_source"] == "recent-average"


def test_unavailable_is_passed_through_not_faked(client):
    with patch("app.api.form.build_form_projection",
               new=AsyncMock(return_value={"available": False, "reason": "no_history"})):
        res = client.get(ROUTE)
    assert res.status_code == 200
    body = res.json()
    assert body["available"] is False
    assert body["reason"] == "no_history"
    assert body["today"] is None
    assert body["projection"] == []


def test_service_failure_is_503_not_a_fabricated_curve(client):
    with patch("app.api.form.build_form_projection",
               new=AsyncMock(side_effect=RuntimeError("boom"))):
        assert client.get(ROUTE).status_code == 503
