"""GET /analytics/season-trends — monthly VO₂max / weight / durability / p20 trends.

Auth + validation + shape. The composer's SQL is exercised against real data via
the pure-helper tests; here we patch it to keep the endpoint test DB-free.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_db_for_user


def _make_user(user_id: int = 5) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.is_active = True
    return user


@pytest.fixture()
def client():
    user = _make_user()
    db = MagicMock()
    db.execute = AsyncMock()
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db_for_user] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_requires_auth():
    app.dependency_overrides.clear()
    assert TestClient(app).get("/analytics/season-trends").status_code == 401


def test_rejects_out_of_range_year(client):
    assert client.get("/analytics/season-trends?year=1900").status_code == 400


def test_returns_series_and_summaries(client):
    payload = {
        "available": True,
        "year": 2026,
        "points": [
            {"month": "2026-05", "month_en": "May", "month_de": "Mai",
             "vo2max": 50.6, "weight_kg": None, "durability_pct": -1.8, "p20min_w": 221},
            {"month": "2026-06", "month_en": "Jun", "month_de": "Jun",
             "vo2max": 51.5, "weight_kg": None, "durability_pct": 6.2, "p20min_w": 241},
            {"month": "2026-07", "month_en": "Jul", "month_de": "Jul",
             "vo2max": 54.1, "weight_kg": None, "durability_pct": 18.2, "p20min_w": 244},
        ],
        "vo2max": {"first": 50.6, "latest": 54.1, "delta": 3.5, "n_points": 3, "lower_is_better": False},
        "weight_kg": {"first": None, "latest": None, "delta": None, "n_points": 0, "lower_is_better": True},
        "durability_pct": {"first": -1.8, "latest": 18.2, "delta": 20.0, "n_points": 3, "lower_is_better": True},
        "p20min_w": {"first": 221, "latest": 244, "delta": 23, "n_points": 3, "lower_is_better": False},
    }
    with patch("app.api.analytics.compute_season_trends", new=AsyncMock(return_value=payload)):
        res = client.get("/analytics/season-trends")
    assert res.status_code == 200
    body = res.json()
    assert body["available"] is True
    assert len(body["points"]) == 3
    assert body["vo2max"]["delta"] == 3.5
    # Weight has no data for this athlete → honest empty, not fabricated.
    assert body["weight_kg"]["n_points"] == 0
    assert body["points"][0]["weight_kg"] is None
    assert body["p20min_w"]["latest"] == 244


def test_empty_athlete_available_false(client):
    payload = {
        "available": False,
        "year": 2026,
        "points": [],
        "vo2max": {"first": None, "latest": None, "delta": None, "n_points": 0, "lower_is_better": False},
        "weight_kg": {"first": None, "latest": None, "delta": None, "n_points": 0, "lower_is_better": True},
        "durability_pct": {"first": None, "latest": None, "delta": None, "n_points": 0, "lower_is_better": True},
        "p20min_w": {"first": None, "latest": None, "delta": None, "n_points": 0, "lower_is_better": False},
    }
    with patch("app.api.analytics.compute_season_trends", new=AsyncMock(return_value=payload)):
        res = client.get("/analytics/season-trends")
    assert res.status_code == 200
    assert res.json()["available"] is False
    assert res.json()["points"] == []
