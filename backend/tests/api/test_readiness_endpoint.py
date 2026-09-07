"""Integration smoke tests for GET /readiness/decision.

The router is not mounted in `app.main` yet (registration is the caller's
call), so these tests mount it on a bare FastAPI app and override the same
auth + RLS dependencies the real app injects. That still exercises everything
that matters here: the dependency wiring, the response_model, and the service's
real query → gate → decision → schema path, without Postgres.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.readiness import router as readiness_router
from app.dependencies import (
    get_current_active_user,
    get_current_user,
    get_db_for_user,
)
from app.services.athlete_time import today_local


def _metric(day: date, *, hrv, rhr=48, sleep=78):
    return SimpleNamespace(
        date=day,
        recorded_at=datetime(day.year, day.month, day.day, tzinfo=timezone.utc),
        hrv_status=hrv,
        resting_hr=rhr,
        sleep_score=sleep,
        sleep_total_s=7 * 3600,
        sleep_deep_s=int(1.5 * 3600),
        body_battery_wake=70,
        stress_wake=22,
    )


def _wobble(i: int) -> float:
    return (0.0, 1.0, -1.0, 2.0, -2.0, 0.5, -0.5)[i % 7]


def _history(today: date, *, end_offset: int = 0, recent=60.0, baseline=60.0):
    out = []
    for i in range(35):
        day = today - timedelta(days=end_offset + i)
        age = (today - day).days
        out.append(
            _metric(
                day,
                hrv=(recent if age < 7 else baseline) + _wobble(i) * 1.5,
                rhr=48 + _wobble(i),
                sleep=78 + _wobble(i) * 3,
            )
        )
    return out


def _mock_db(rows):
    """Serves DailyMetric rows to `.scalars().all()` and None to every
    `.scalar_one_or_none()` (no profile, no logged adaptation, no plan row)."""
    db = AsyncMock()

    async def _execute(query, *a, **k):  # noqa: ANN001
        result = MagicMock()
        result.scalars.return_value.all.return_value = rows
        result.scalar_one_or_none.return_value = None
        result.all.return_value = []
        return result

    db.execute = _execute
    db.close = AsyncMock()
    return db


@pytest.fixture
def client_for():
    apps: list[FastAPI] = []

    def _make(rows):
        app = FastAPI()
        app.include_router(readiness_router)
        user = MagicMock()
        user.id = 1
        user.is_active = True
        db = _mock_db(rows)

        async def _u():
            return user

        async def _d():
            yield db

        app.dependency_overrides[get_current_active_user] = _u
        app.dependency_overrides[get_current_user] = _u
        app.dependency_overrides[get_db_for_user] = _d
        apps.append(app)
        return TestClient(app)

    yield _make
    for app in apps:
        app.dependency_overrides.clear()


class TestReadinessDecisionEndpoint:
    def test_route_is_get_readiness_decision(self):
        paths = {r.path for r in readiness_router.routes}
        assert "/readiness/decision" in paths

    def test_fresh_data_returns_a_decision(self, client_for):
        today = today_local()
        r = client_for(_history(today))
        res = r.get("/readiness/decision")
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["date"] == today.isoformat()
        assert body["gate"] == "fresh"
        assert body["withheld"] is False
        assert body["data_age_days"] == 0
        # Every measured input is present, each with its own baseline slot.
        assert {i["key"] for i in body["inputs"]} == {
            "hrv",
            "resting_hr",
            "sleep_score",
            "sleep_duration",
            "sleep_deep",
            "body_battery_wake",
            "stress_wake",
        }

    def test_a_stale_watch_carries_no_verdict(self, client_for):
        today = today_local()
        r = client_for(_history(today, end_offset=5, recent=44.0, baseline=62.0))
        body = r.get("/readiness/decision").json()
        assert body["gate"] == "stale"
        assert body["withheld"] is True
        assert body["verdict"] is None
        assert body["driver"] is None
        assert body["readiness_score"] is None
        assert body["withheld_reason_de"]
        # …but the athlete can still see WHAT is stale.
        assert body["inputs"]
        assert all(i["age_days"] == 5 for i in body["inputs"])

    def test_no_metrics_is_the_honest_empty_state_not_an_error(self, client_for):
        body = client_for([]).get("/readiness/decision").json()
        assert body["gate"] == "none"
        assert body["withheld"] is False
        assert body["baseline_state"] == "none"
        assert body["driver"] is None

    def test_lang_en_is_accepted(self, client_for):
        res = client_for(_history(today_local())).get("/readiness/decision?lang=en")
        assert res.status_code == 200

    def test_a_row_predating_the_newer_columns_does_not_crash(self, client_for):
        """The sleep-vitals and wake-snapshot columns arrived in later
        migrations; historic rows do not carry them. A missing column must
        read as "not measured", never take the decision down."""
        today = today_local()
        rows = [
            SimpleNamespace(
                date=today - timedelta(days=i),
                recorded_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                hrv_status=60.0 + _wobble(i),
                resting_hr=48,
                sleep_score=78,
                # no sleep_total_s / sleep_deep_s / body_battery_wake / stress_wake
            )
            for i in range(35)
        ]
        res = client_for(rows).get("/readiness/decision")
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["gate"] == "fresh"
        deep = next(i for i in body["inputs"] if i["key"] == "sleep_deep")
        assert deep["value"] is None
        assert "keine Messung" in deep["text_de"]

    def test_requires_authentication(self):
        # No dependency overrides → the auth dependency must reject.
        app = FastAPI()
        app.include_router(readiness_router)
        res = TestClient(app).get("/readiness/decision")
        assert res.status_code in (401, 403)
