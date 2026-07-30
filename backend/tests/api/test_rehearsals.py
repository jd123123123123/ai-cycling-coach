"""POST /rehearsals -- upload a GPX, get a rehearsal back.

Same strategy as tests/api/test_weeks.py: dependency_overrides replace the auth
and db dependencies, and the one service that would hit real Postgres
(latest_critical_power) is patched at the router's import site. No database.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_current_active_user, get_current_user, get_db_for_user
from app.main import app
from app.models.route_rehearsal import RouteRehearsal
from app.services.rehearsal.orchestrator import route_to_json, run_rehearsal
from app.services.rehearsal.rider_model import build_rider_model
from app.services.rehearsal.route_source import route_from_gpx
from app.services.rehearsal.simulator import Assumptions

_GPX = """<?xml version="1.0"?>
<gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
""" + "\n".join(
    f'    <trkpt lat="{46.0 + i * 0.001:.4f}" lon="11.0"><ele>{1000 + i * 8}</ele></trkpt>'
    for i in range(60)
) + """
  </trkseg></trk>
</gpx>"""


def _make_user(user_id: int = 1) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.is_active = True
    return user


def _make_profile(ftp_watts: int | None = 250, weight_kg: float | None = 72.0) -> MagicMock:
    profile = MagicMock()
    profile.ftp_watts = ftp_watts
    profile.weight_kg = weight_kg
    return profile


def _make_mock_db(profile: MagicMock | None, stored: object | None = None):
    """AsyncMock session returning `profile`, and assigning ids on commit.

    A query against route_rehearsals returns `stored` (or nothing), so the
    read/patch paths can be exercised without a database.
    """
    db = AsyncMock()
    added: list = []

    async def _execute(query, *args, **kwargs):  # noqa: ANN001
        result = MagicMock()
        is_rehearsal = "route_rehearsals" in str(query)
        result.scalar_one_or_none.return_value = stored if is_rehearsal else profile
        result.scalars.return_value.all.return_value = (
            [stored] if is_rehearsal and stored is not None else []
        )
        return result

    def _add(obj):
        added.append(obj)

    async def _commit():
        for obj in added:
            if getattr(obj, "id", None) is None:
                obj.id = 1
            if getattr(obj, "created_at", None) is None:
                obj.created_at = datetime.now(timezone.utc)

    db.execute = _execute
    db.add = _add
    db.commit = _commit
    db.refresh = AsyncMock()
    db.close = AsyncMock()
    return db


def _install(profile: MagicMock | None, user_id: int = 1, stored: object | None = None):
    user = _make_user(user_id)
    mock_db = _make_mock_db(profile, stored)

    async def _override_user():
        return user

    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_current_active_user] = _override_user
    app.dependency_overrides[get_current_user] = _override_user
    app.dependency_overrides[get_db_for_user] = _override_db


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture
def client_with_athlete():
    _install(_make_profile())
    try:
        with patch(
            "app.api.rehearsals.latest_critical_power", new=AsyncMock(return_value=None)
        ):
            yield TestClient(app, raise_server_exceptions=True)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def client_no_ftp():
    _install(_make_profile(ftp_watts=None))
    try:
        with patch(
            "app.api.rehearsals.latest_critical_power", new=AsyncMock(return_value=None)
        ):
            yield TestClient(app, raise_server_exceptions=True)
    finally:
        app.dependency_overrides.clear()


def _stored_row():
    """A RouteRehearsal as POST would have written it, without a database."""
    route = route_from_gpx(_GPX, name="Stored")
    model = build_rider_model(
        cp_watts=250.0, w_prime_j=None, weight_kg=72.0, cda_m2=None,
        durability_drop_pct=0.0,
    )
    assumptions = Assumptions(draft="solo", effort="fondo", use_weather=True)
    row = RouteRehearsal(
        id=7,
        user_id=1,
        source_kind="gpx",
        source_ref=None,
        name="Stored",
        distance_m=route.total_distance_m,
        ascent_m=route.total_ascent_m,
        route=route_to_json(route),
        assumptions={"draft": "solo", "effort": "fondo", "use_weather": True},
        result=run_rehearsal(route, model, assumptions, today=date.today()),
    )
    row.created_at = datetime.now(timezone.utc)
    return row


@pytest.fixture
def client_with_stored():
    _install(_make_profile(), stored=_stored_row())
    try:
        with patch(
            "app.api.rehearsals.latest_critical_power", new=AsyncMock(return_value=None)
        ):
            yield TestClient(app, raise_server_exceptions=True)
    finally:
        app.dependency_overrides.clear()


class TestCreateRehearsal:
    def test_unauthenticated_is_rejected(self, client):
        resp = client.post("/rehearsals", json={"source_kind": "gpx", "gpx": _GPX})
        assert resp.status_code == 401

    def test_returns_a_band_and_climbs(self, client_with_athlete):
        resp = client_with_athlete.post(
            "/rehearsals", json={"source_kind": "gpx", "gpx": _GPX, "name": "Test"}
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["can_predict"] is True
        assert body["band"]["p10_s"] < body["band"]["p90_s"]
        assert body["climbs"]
        assert body["segments"]
        # A time is never returned without the band around it.
        assert body["total_time_s"] is not None
        assert body["assumptions"] == {
            "draft": "solo",
            "effort": "fondo",
            "use_weather": True,
        }

    def test_effort_is_an_assumption_the_athlete_sets(self, client_with_athlete):
        resp = client_with_athlete.post(
            "/rehearsals",
            json={"source_kind": "gpx", "gpx": _GPX, "effort": "race", "draft": "bunch"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["assumptions"]["effort"] == "race"
        assert body["assumptions"]["draft"] == "bunch"

    def test_a_route_without_elevation_is_refused_with_a_reason(self, client_with_athlete):
        flat = _GPX.replace("<ele>", "<!--").replace("</ele>", "-->")
        resp = client_with_athlete.post(
            "/rehearsals", json={"source_kind": "gpx", "gpx": flat}
        )
        assert resp.status_code == 422
        assert "elevation" in resp.json()["detail"].lower()

    def test_an_athlete_without_ftp_gets_terrain_but_no_time(self, client_no_ftp):
        resp = client_no_ftp.post("/rehearsals", json={"source_kind": "gpx", "gpx": _GPX})
        assert resp.status_code == 201
        body = resp.json()
        assert body["can_predict"] is False
        assert "cp" in body["missing"]
        assert body["climbs"]          # the terrain still renders
        assert body["total_time_s"] is None
        assert body["band"] is None

    def test_a_source_kind_that_is_not_wired_yet_is_refused(self, client_with_athlete):
        resp = client_with_athlete.post(
            "/rehearsals", json={"source_kind": "crew_event", "source_ref": 3}
        )
        assert resp.status_code == 422


class TestReadAndPatch:
    def test_get_returns_the_stored_answer(self, client_with_stored):
        resp = client_with_stored.get("/rehearsals/7")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == 7
        assert body["can_predict"] is True
        assert body["band"]["p50_s"] > 0

    def test_list_carries_the_headline_without_the_segments(self, client_with_stored):
        resp = client_with_stored.get("/rehearsals")
        assert resp.status_code == 200
        rows = resp.json()["rehearsals"]
        assert len(rows) == 1
        assert rows[0]["total_time_s"] is not None
        assert rows[0]["band"] is not None      # never a bare time
        assert "segments" not in rows[0]

    def test_patching_the_effort_re_runs_from_the_stored_route(self, client_with_stored):
        before = client_with_stored.get("/rehearsals/7").json()["total_time_s"]
        resp = client_with_stored.patch("/rehearsals/7", json={"effort": "race"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["assumptions"]["effort"] == "race"
        # Untouched assumptions survive the patch.
        assert body["assumptions"]["draft"] == "solo"
        # Racing is faster than riding a fondo over the same road.
        assert body["total_time_s"] < before

    def test_patching_a_rehearsal_that_is_not_there_is_404(self, client_with_athlete):
        resp = client_with_athlete.patch("/rehearsals/999", json={"effort": "race"})
        assert resp.status_code == 404


class TestMalformedProfile:
    """A profile the physics would raise on is a 422, never a 500."""

    def test_a_non_finite_weight_is_refused_with_a_reason(self):
        _install(_make_profile(weight_kg=float("nan")))
        try:
            with patch(
                "app.api.rehearsals.latest_critical_power",
                new=AsyncMock(return_value=None),
            ):
                resp = TestClient(app, raise_server_exceptions=True).post(
                    "/rehearsals", json={"source_kind": "gpx", "gpx": _GPX}
                )
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 422
        assert "weight" in resp.json()["detail"].lower()
