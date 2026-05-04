"""Integration smoke tests for GET /weeks/current.

Strategy: dependency_overrides to replace get_current_active_user,
get_db_for_user (and get_current_user, used inside get_db_for_user),
plus module-level patches on the services that hit real Postgres.

Tests:
  1. Unauthenticated → 401
  2. Valid user + full profile → 200, 7 days, preface non-empty, is_today on day[0]
  3. Language=simple default → response.language == 'simple'
  4. Language=technical query → response.language == 'technical'
  5. No FTP → 409 with code='ftp_required'
  6. No AthleteProfile → 409 with code='profile_required'
  7. Maintenance mode → 200, meso_block.days_to_event is None
"""
from __future__ import annotations

import asyncio
from datetime import date, timedelta
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_db_for_user, get_current_user


# ---------------------------------------------------------------------------
# Helpers to build mock objects
# ---------------------------------------------------------------------------

def _make_user(user_id: int = 1) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.is_active = True
    return user


def _make_profile(
    ftp_watts: int | None = 280,
    target_event_date: date | None = None,
    target_event_type: str | None = None,
    primary_sport: str = "cycling",
) -> MagicMock:
    profile = MagicMock()
    profile.ftp_watts = ftp_watts
    profile.primary_sport = primary_sport
    profile.target_event_date = target_event_date
    profile.target_event_type = target_event_type
    return profile


def _make_meso(user_id: int = 1) -> MagicMock:
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    meso = MagicMock()
    meso.id = 1
    meso.user_id = user_id
    meso.plan_start_date = week_start
    meso.phase = "base1"
    meso.weekly_tss_targets = [350, 400, 430, 250]
    meso.seiler_distribution = {"z1_pct": 0.80, "z2_pct": 0.05, "z3_pct": 0.15}
    return meso


# ---------------------------------------------------------------------------
# Shared mock db session (no real DB calls)
# ---------------------------------------------------------------------------

def _make_mock_db(profile: MagicMock | None = None, workouts: list | None = None):
    """Build an AsyncMock session that returns the given profile and workouts."""
    db = AsyncMock()

    # execute() returns a result whose scalar_one_or_none / scalars().all() we control
    async def _execute(query, *args, **kwargs):  # noqa: ANN001
        result = MagicMock()
        result.scalar_one_or_none.return_value = profile
        result.scalars.return_value.all.return_value = workouts or []
        return result

    db.execute = _execute
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.close = AsyncMock()
    return db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

MOCK_PMC_SNAP = {"ctl": 42.0, "atl": 50.0, "tsb": -8.0, "ctl_7d_delta": 1.2}

MOCK_PREFACE = (
    "This week focuses on base aerobic development. "
    "Your fitness is building steadily. "
    "Keep the efforts controlled and enjoy the process."
)


@pytest.fixture
def client():
    """Return a synchronous TestClient for app."""
    return TestClient(app, raise_server_exceptions=True)


# ---------------------------------------------------------------------------
# Test 1: Unauthenticated → 401
# ---------------------------------------------------------------------------

class TestUnauthenticated:
    def test_returns_401(self, client: TestClient):
        response = client.get("/weeks/current")
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# Test 2-4: Authenticated, full profile
# ---------------------------------------------------------------------------

class TestAuthenticatedHappyPath:
    def _override_deps(self, profile: MagicMock | None = None, user_id: int = 1):
        """Return context managers that install dep overrides."""
        user = _make_user(user_id)
        mock_db = _make_mock_db(profile=profile)

        # Override both auth deps + the db dep that includes RLS logic
        async def _override_user():
            return user

        async def _override_db():
            yield mock_db

        app.dependency_overrides[get_current_active_user] = _override_user
        app.dependency_overrides[get_current_user] = _override_user
        app.dependency_overrides[get_db_for_user] = _override_db

    def _clear_overrides(self):
        app.dependency_overrides.clear()

    def test_returns_200_with_7_days(self, client: TestClient):
        profile = _make_profile(
            target_event_date=date.today() + timedelta(days=60),
            target_event_type="race",
        )
        self._override_deps(profile)
        meso = _make_meso()
        try:
            with (
                patch(
                    "app.api.weeks.generate_mesocycle",
                    new=AsyncMock(return_value=meso),
                ),
                patch(
                    "app.api.weeks.ctl_atl_tsb_snapshot",
                    new=AsyncMock(return_value=MOCK_PMC_SNAP),
                ),
                patch(
                    "app.api.weeks.build_weekly_rationale",
                    return_value=MOCK_PREFACE,
                ),
            ):
                resp = client.get("/weeks/current")
        finally:
            self._clear_overrides()

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["days"]) == 7
        assert data["preface"] != ""
        assert data["days"][0]["is_today"] is True

    def test_language_simple_is_default(self, client: TestClient):
        profile = _make_profile()
        self._override_deps(profile)
        meso = _make_meso()
        try:
            with (
                patch("app.api.weeks.generate_mesocycle", new=AsyncMock(return_value=meso)),
                patch("app.api.weeks.ctl_atl_tsb_snapshot", new=AsyncMock(return_value=MOCK_PMC_SNAP)),
                patch("app.api.weeks.build_weekly_rationale", return_value=MOCK_PREFACE),
            ):
                resp = client.get("/weeks/current")
        finally:
            self._clear_overrides()
        assert resp.status_code == 200
        assert resp.json()["language"] == "simple"

    def test_language_technical_query(self, client: TestClient):
        profile = _make_profile()
        self._override_deps(profile)
        meso = _make_meso()
        technical_preface = "CTL is 42 TSS/day. Issurin accumulation block. Seiler polarized Z3 pct=0.15."
        try:
            with (
                patch("app.api.weeks.generate_mesocycle", new=AsyncMock(return_value=meso)),
                patch("app.api.weeks.ctl_atl_tsb_snapshot", new=AsyncMock(return_value=MOCK_PMC_SNAP)),
                patch("app.api.weeks.build_weekly_rationale", return_value=technical_preface),
            ):
                resp = client.get("/weeks/current?language=technical")
        finally:
            self._clear_overrides()
        assert resp.status_code == 200
        data = resp.json()
        assert data["language"] == "technical"
        assert data["preface"] == technical_preface


# ---------------------------------------------------------------------------
# Test 5: No FTP → 409
# ---------------------------------------------------------------------------

class TestNoFtp:
    def test_returns_409_with_ftp_required_code(self, client: TestClient):
        user = _make_user()
        profile = _make_profile(ftp_watts=0)
        mock_db = _make_mock_db(profile=profile)

        async def _override_user():
            return user

        async def _override_db():
            yield mock_db

        app.dependency_overrides[get_current_active_user] = _override_user
        app.dependency_overrides[get_current_user] = _override_user
        app.dependency_overrides[get_db_for_user] = _override_db

        try:
            resp = client.get("/weeks/current")
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 409
        assert "ftp" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Test 6: No AthleteProfile → 409
# ---------------------------------------------------------------------------

class TestNoProfile:
    def test_returns_409_with_profile_required_code(self, client: TestClient):
        user = _make_user()
        mock_db = _make_mock_db(profile=None)

        async def _override_user():
            return user

        async def _override_db():
            yield mock_db

        app.dependency_overrides[get_current_active_user] = _override_user
        app.dependency_overrides[get_current_user] = _override_user
        app.dependency_overrides[get_db_for_user] = _override_db

        try:
            resp = client.get("/weeks/current")
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 409
        assert "profile" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Test 7: Maintenance mode → 200, days_to_event is None
# ---------------------------------------------------------------------------

class TestMaintenanceMode:
    def test_returns_200_days_to_event_null(self, client: TestClient):
        user = _make_user()
        profile = _make_profile(
            target_event_date=None,
            target_event_type="maintenance",
        )
        mock_db = _make_mock_db(profile=profile)

        async def _override_user():
            return user

        async def _override_db():
            yield mock_db

        app.dependency_overrides[get_current_active_user] = _override_user
        app.dependency_overrides[get_current_user] = _override_user
        app.dependency_overrides[get_db_for_user] = _override_db

        meso = _make_meso()
        meso.phase = "maintenance"

        try:
            with (
                patch("app.api.weeks.generate_mesocycle", new=AsyncMock(return_value=meso)),
                patch("app.api.weeks.ctl_atl_tsb_snapshot", new=AsyncMock(return_value=MOCK_PMC_SNAP)),
                patch("app.api.weeks.build_weekly_rationale", return_value=MOCK_PREFACE),
            ):
                resp = client.get("/weeks/current")
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 200
        data = resp.json()
        assert data["meso_block"]["days_to_event"] is None
