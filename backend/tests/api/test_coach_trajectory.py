"""GET /coach/trajectory — regression for the carried 500.

Root cause: goal_trajectory's honesty guard emits on_track='unknown'
(insufficient history / no projectable basis), but GoalTrajectoryRead's
Literal did not include it -> pydantic ValidationError -> 500 on every
dashboard load (surfaced in the browser as a CORS error).

Pattern mirrors tests/api/test_plan_build.py: dependency_overrides for
auth + db, patch on the service module the endpoint resolves at call time.
"""
from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_current_user, get_db_for_user
from app.schemas.coach import GoalTrajectoryRead


def _profile(**overrides) -> SimpleNamespace:
    base = dict(
        user_id=1,
        ftp_watts=240,
        primary_sport="cycling",
        target_event_date=date(2026, 12, 5),
        target_event_type="fondo",
        target_priority="A",
        timezone="Europe/Berlin",
        goals={"target_event": {"name": "Maratona dles Dolomites", "date": "2026-12-05"}},
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _make_db(profile):
    db = AsyncMock()

    async def _execute(query, *args, **kwargs):  # noqa: ANN001
        result = MagicMock()
        result.scalar_one_or_none.return_value = profile
        result.scalars.return_value.all.return_value = []
        return result

    db.execute = AsyncMock(side_effect=_execute)
    return db


@pytest.fixture()
def client_factory():
    def _make(profile):
        user = MagicMock()
        user.id = 1
        user.is_active = True
        app.dependency_overrides[get_current_active_user] = lambda: user
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db_for_user] = lambda: _make_db(profile)
        return TestClient(app)

    yield _make
    app.dependency_overrides.clear()


# The honest-null payload compute_goal_trajectory emits when there is not
# enough history for a projection (projection_basis='none').
_UNKNOWN_PAYLOAD = {
    "days_to_goal": None,
    "ctl_now": 0.0,
    "ctl_7d_delta": 0.0,
    "ctl_projected_at_goal": None,
    "ctl_target": None,
    "tsb_projected_at_goal": None,
    "taper_window": "unknown",
    "on_track": "unknown",
    "weekly_tss_required": None,
    "weekly_tss_actual": 0.0,
    "narrative_hook": "Noch nicht genug Trainingshistorie für eine Prognose.",
    "projection_basis": "none",
}


def test_trajectory_unknown_on_track_is_200_not_500(client_factory):
    """The producer's honesty guard ('unknown') must serialize, not 500."""
    client = client_factory(_profile())
    with patch(
        "app.services.goal_trajectory.compute_goal_trajectory",
        new=AsyncMock(return_value=dict(_UNKNOWN_PAYLOAD)),
    ):
        r = client.get("/coach/trajectory?lang=de")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["on_track"] == "unknown"
    assert body["projection_basis"] == "none"
    # Event metadata is still enriched from the profile column.
    assert body["event_date"] == "2026-12-05"
    assert body["event_name"] == "Maratona dles Dolomites"


def test_trajectory_schema_accepts_every_service_on_track_value():
    """Schema Literal must cover the full OnTrack alphabet of the service."""
    from app.services.goal_trajectory import OnTrack
    import typing

    for value in typing.get_args(OnTrack):
        GoalTrajectoryRead(on_track=value)  # must not raise
