"""GET /analytics/power-profile-view — V3 Power Profile screen model.

Mirrors the other tests/api modules: dependency_overrides for auth + db, with
the composer service patched (its heavy DB work is covered by the pure-helper
unit tests in tests/services/test_power_profile_view.py)."""
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
    app.dependency_overrides[get_current_active_user] = lambda: _make_user()
    app.dependency_overrides[get_db_for_user] = lambda: MagicMock()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_requires_auth():
    app.dependency_overrides.clear()
    assert TestClient(app).get("/analytics/power-profile-view").status_code == 401


def test_returns_view_model(client):
    payload = {
        "available": True,
        "curve": [{"seconds": 5, "watts": 1200, "wkg": 16.2, "is_pr": True}],
        "threshold_watts": 286,
        "zones": [{"code": "Z1"}],
        "benchmark": {"category_key": "racer"},
    }
    with patch(
        "app.api.analytics.compute_power_profile_view",
        new=AsyncMock(return_value=payload),
    ) as mocked:
        resp = client.get("/analytics/power-profile-view?lang=de")
    assert resp.status_code == 200
    assert resp.json() == payload
    # lang is threaded through to the service.
    assert mocked.await_args.kwargs["lang"] == "de"


def test_available_false_passthrough(client):
    with patch(
        "app.api.analytics.compute_power_profile_view",
        new=AsyncMock(return_value={"available": False}),
    ):
        resp = client.get("/analytics/power-profile-view")
    assert resp.status_code == 200
    assert resp.json() == {"available": False}
