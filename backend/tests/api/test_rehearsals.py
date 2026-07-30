"""POST /rehearsals -- upload a GPX, get a rehearsal back.

Same strategy as tests/api/test_weeks.py: dependency_overrides replace the auth
and db dependencies, and the one service that would hit real Postgres
(latest_critical_power) is patched at the router's import site. No database.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.rehearsals import _DAYLIGHT_FROM_H, _DAYLIGHT_TO_H, _forecast_for_route
from app.dependencies import get_current_active_user, get_current_user, get_db_for_user
from app.main import app
from app.models.route_rehearsal import RouteRehearsal
from app.services.rehearsal.orchestrator import route_from_json, route_to_json, run_rehearsal
from app.services.rehearsal.rider_model import build_rider_model
from app.services.rehearsal.route_source import route_from_gpx
from app.services.rehearsal.simulator import Assumptions
from app.services.rehearsal.weather import FORECAST_HORIZON_DAYS

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


def _query_user_id(query) -> int | None:
    """Pull the bound `user_id` value out of a compiled ownership filter.

    `_load_owned` and `list_rehearsals` both filter on `RouteRehearsal.user_id
    == current_user.id`; this reads that bound parameter back out so the mock
    can genuinely honour ownership rather than string-matching the table name
    and answering any user's request with the same row (which is exactly the
    gap this tightens -- the ownership filter itself was never exercised).
    """
    params = query.compile().params
    for key, value in params.items():
        if key.startswith("user_id"):
            return value
    return None


def _make_mock_db(profile: MagicMock | None, stored: object | None = None):
    """AsyncMock session returning `profile`, and assigning ids on commit.

    A query against route_rehearsals returns `stored` only when the query's
    bound `user_id` matches the row's own `user_id` -- a request from a
    different athlete genuinely sees nothing, the same as a real ownership
    filter would produce.
    """
    db = AsyncMock()
    added: list = []

    async def _execute(query, *args, **kwargs):  # noqa: ANN001
        result = MagicMock()
        is_rehearsal = "route_rehearsals" in str(query)
        if is_rehearsal:
            requested_user_id = _query_user_id(query)
            owned = (
                stored is not None
                and requested_user_id is not None
                and getattr(stored, "user_id", None) == requested_user_id
            )
            result.scalar_one_or_none.return_value = stored if owned else None
            result.scalars.return_value.all.return_value = [stored] if owned else []
        else:
            result.scalar_one_or_none.return_value = profile
            result.scalars.return_value.all.return_value = []
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
    app.dependency_overrides.clear()
    try:
        yield TestClient(app, raise_server_exceptions=True)
    finally:
        app.dependency_overrides.clear()


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


@pytest.fixture
def client_as_other_user():
    """A different, authenticated athlete -- the row above still belongs to user 1."""
    _install(_make_profile(), user_id=2, stored=_stored_row())
    try:
        with patch(
            "app.api.rehearsals.latest_critical_power", new=AsyncMock(return_value=None)
        ):
            yield TestClient(app, raise_server_exceptions=True)
    finally:
        app.dependency_overrides.clear()


def _forecast_body(*, speed_kmh: float, dir_deg: float, temp_c: float) -> dict:
    """A 24-hour Open-Meteo body, index i == hour i UTC (timezone=UTC, one day)."""
    return {
        "hourly": {
            "wind_speed_10m": [speed_kmh] * 24,
            "wind_direction_10m": [dir_deg] * 24,
            "temperature_2m": [temp_c] * 24,
        }
    }


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
        # No stored durability measurement yet -- the fade must say so rather
        # than silently applying (or implying) a number nobody measured.
        assert body["durability_is_default"] is True
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

    def test_a_file_that_is_not_gpx_at_all_is_422(self, client_with_athlete):
        """gpxpy raises its own exception types; crew_tour normalises them to
        ValueError, which the router's narrowed `except ValueError` catches."""
        resp = client_with_athlete.post(
            "/rehearsals", json={"source_kind": "gpx", "gpx": "not a gpx at all"}
        )
        assert resp.status_code == 422
        assert "gpx" in resp.json()["detail"].lower()


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


class TestOwnership:
    """`_load_owned` filters on user_id -- another athlete must never see this row."""

    def test_get_by_a_different_user_is_404(self, client_as_other_user):
        resp = client_as_other_user.get("/rehearsals/7")
        assert resp.status_code == 404

    def test_patch_by_a_different_user_is_404(self, client_as_other_user):
        resp = client_as_other_user.patch("/rehearsals/7", json={"effort": "race"})
        assert resp.status_code == 404

    def test_list_by_a_different_user_is_empty(self, client_as_other_user):
        resp = client_as_other_user.get("/rehearsals")
        assert resp.status_code == 200
        assert resp.json()["rehearsals"] == []


class TestPersistence:
    """The JSONB payloads a row carries survive being written and read back."""

    def test_route_survives_a_json_round_trip(self):
        route = route_from_gpx(_GPX, name="Stored")
        raw = route_to_json(route)
        # JSONB round-trips through actual JSON on the wire to Postgres; go
        # through json.dumps/loads rather than trusting the Python dict alone.
        restored = route_from_json(json.loads(json.dumps(raw)))
        assert restored.total_distance_m == pytest.approx(route.total_distance_m)
        assert restored.total_ascent_m == pytest.approx(route.total_ascent_m)
        assert restored.name == route.name
        assert [p.elevation_m for p in restored.points] == [
            p.elevation_m for p in route.points
        ]

    def test_result_survives_a_json_round_trip(self, client_with_stored):
        body = client_with_stored.get("/rehearsals/7").json()
        row = _stored_row()
        restored = json.loads(json.dumps(row.result))
        assert restored["total_time_s"] == pytest.approx(row.result["total_time_s"])
        assert restored["band"] == row.result["band"]
        assert restored["climbs"] == row.result["climbs"]
        # And the API response served from the same stored row matches.
        assert body["total_time_s"] == pytest.approx(row.result["total_time_s"])


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


class TestWeatherForecast:
    """_forecast_for_route -- unexercised until a `ride_date` is posted.

    Pins two things the reviewer verified are currently correct but that
    nothing protected: the client asks Open-Meteo for `wind_speed_unit=kmh`
    so the /3.6 conversion to m/s is right, and `timezone=UTC` so index i is
    hour i UTC and the `06 <= i % 24 <= 18` daylight window is the right
    slice. If either of those upstream request params ever changes, these
    tests catch it.
    """

    @staticmethod
    def _route(ride_date):
        return route_from_gpx(_GPX, name="W", ride_date=ride_date)

    async def test_km_h_is_converted_to_m_s(self):
        route = self._route(date.today() + timedelta(days=1))
        body = _forecast_body(speed_kmh=36.0, dir_deg=90.0, temp_c=15.0)
        with patch(
            "app.api.rehearsals.fetch_window_forecast", new=AsyncMock(return_value=body)
        ):
            forecast = await _forecast_for_route(route, date.today())
        assert forecast is not None
        assert forecast["wind_speed_ms"] == pytest.approx(10.0)  # 36 km/h / 3.6
        assert forecast["temperature_c"] == pytest.approx(15.0)

    async def test_only_daylight_hours_are_averaged(self):
        route = self._route(date.today() + timedelta(days=1))
        speeds: list[float | None] = [None] * 24
        dirs: list[float | None] = [None] * 24
        temps: list[float | None] = [None] * 24
        # Outside the 06:00-18:00 UTC window: a wildly different reading that
        # the average must NOT include.
        speeds[2], dirs[2], temps[2] = 100.0, 0.0, -5.0
        assert not (_DAYLIGHT_FROM_H <= 2 <= _DAYLIGHT_TO_H)
        # Inside the window: the only reading the average should reflect.
        speeds[12], dirs[12], temps[12] = 18.0, 90.0, 20.0
        assert _DAYLIGHT_FROM_H <= 12 <= _DAYLIGHT_TO_H
        body = {
            "hourly": {
                "wind_speed_10m": speeds,
                "wind_direction_10m": dirs,
                "temperature_2m": temps,
            }
        }
        with patch(
            "app.api.rehearsals.fetch_window_forecast", new=AsyncMock(return_value=body)
        ):
            forecast = await _forecast_for_route(route, date.today())
        assert forecast is not None
        assert forecast["wind_speed_ms"] == pytest.approx(18.0 / 3.6)
        assert forecast["temperature_c"] == pytest.approx(20.0)

    async def test_beyond_the_forecast_horizon_returns_none(self):
        route = self._route(date.today() + timedelta(days=FORECAST_HORIZON_DAYS + 5))
        body = _forecast_body(speed_kmh=36.0, dir_deg=90.0, temp_c=15.0)
        with patch(
            "app.api.rehearsals.fetch_window_forecast", new=AsyncMock(return_value=body)
        ) as mock_fetch:
            forecast = await _forecast_for_route(route, date.today())
        assert forecast is None
        mock_fetch.assert_not_called()


class TestWeatherEndToEnd:
    """POST /rehearsals with a `ride_date` -- weather_used flips on the horizon."""

    def test_dated_rehearsal_inside_horizon_uses_weather(self, client_with_athlete):
        ride_date = (date.today() + timedelta(days=1)).isoformat()
        body = _forecast_body(speed_kmh=18.0, dir_deg=45.0, temp_c=12.0)
        with patch(
            "app.api.rehearsals.fetch_window_forecast", new=AsyncMock(return_value=body)
        ):
            resp = client_with_athlete.post(
                "/rehearsals",
                json={"source_kind": "gpx", "gpx": _GPX, "ride_date": ride_date},
            )
        assert resp.status_code == 201
        assert resp.json()["weather_used"] is True

    def test_dated_rehearsal_beyond_horizon_skips_weather(self, client_with_athlete):
        ride_date = (date.today() + timedelta(days=FORECAST_HORIZON_DAYS + 5)).isoformat()
        body = _forecast_body(speed_kmh=18.0, dir_deg=45.0, temp_c=12.0)
        with patch(
            "app.api.rehearsals.fetch_window_forecast", new=AsyncMock(return_value=body)
        ) as mock_fetch:
            resp = client_with_athlete.post(
                "/rehearsals",
                json={"source_kind": "gpx", "gpx": _GPX, "ride_date": ride_date},
            )
        assert resp.status_code == 201
        assert resp.json()["weather_used"] is False
        mock_fetch.assert_not_called()

    def test_an_undated_rehearsal_never_uses_weather(self, client_with_athlete):
        body = _forecast_body(speed_kmh=18.0, dir_deg=45.0, temp_c=12.0)
        with patch(
            "app.api.rehearsals.fetch_window_forecast", new=AsyncMock(return_value=body)
        ) as mock_fetch:
            resp = client_with_athlete.post(
                "/rehearsals", json={"source_kind": "gpx", "gpx": _GPX}
            )
        assert resp.status_code == 201
        assert resp.json()["weather_used"] is False
        mock_fetch.assert_not_called()
