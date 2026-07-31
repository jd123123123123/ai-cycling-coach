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
from pydantic import ValidationError

from app.api.rehearsals import _DAYLIGHT_FROM_H, _DAYLIGHT_TO_H, _forecast_for_route
from app.dependencies import get_current_active_user, get_current_user, get_db_for_user
from app.main import app
from app.models.athlete_profile import AthleteProfile
from app.models.route_rehearsal import RouteRehearsal
from app.schemas.athlete import (
    MAX_TARGET_EVENT_GPX_BYTES,
    AthleteProfileRead,
    AthleteProfileUpdate,
)
from app.schemas.rehearsal import MAX_GPX_BYTES
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
        # The three physics assumptions, plus every rider/day override sitting
        # at "untouched" -- a rehearsal created without naming a knob must not
        # come back claiming a weight or a target time nobody asked for.
        assert body["assumptions"] == {
            "draft": "solo",
            "effort": "fondo",
            "use_weather": True,
            "weight_kg": None,
            "bike_mass_kg": None,
            "surface": "asphalt",
            "start_hour": None,
            "use_projected_cp": False,
            "target_time_s": None,
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

    def test_an_unpaceable_rehearsal_still_carries_the_whole_profile(
        self, client_no_ftp
    ):
        """The surface PROMISES the profile ("das Streckenprofil siehst du
        trotzdem", spec §6). It used to return `segments: []`, so the promise
        was false and the silhouette simply was not there."""
        resp = client_no_ftp.post("/rehearsals", json={"source_kind": "gpx", "gpx": _GPX})
        body = resp.json()
        segments = body["segments"]
        assert len(segments) > 1
        # The road is measured, so it is all there ...
        assert all(s["elevation_m"] is not None for s in segments)
        assert any(s["gradient_pct"] > 0 for s in segments)
        assert any(s["climb_id"] is not None for s in segments)
        # The map is terrain too: a rider with no CP still gets to see where the
        # road runs, so the coordinates ship on this branch as well.
        assert all(s["lat"] is not None and s["lng"] is not None for s in segments)
        # ... and the ride is not, so none of it is faked as a zero.
        for key in ("power_w", "speed_ms", "elapsed_s", "w_bal_j"):
            assert all(s[key] is None for s in segments), key

    def test_segments_carry_coordinates_for_the_map(self, client_with_athlete):
        """Map and profile are driven by ONE index, so every segment needs its
        own position — a client that had to resample the stored route separately
        would put the scrub dot somewhere the readout does not describe."""
        resp = client_with_athlete.post(
            "/rehearsals", json={"source_kind": "gpx", "gpx": _GPX}
        )
        segments = resp.json()["segments"]

        assert all(s["lat"] is not None and s["lng"] is not None for s in segments)
        # Real coordinates, not a repeated placeholder.
        assert len({(s["lat"], s["lng"]) for s in segments}) > 1
        assert all(-90.0 <= s["lat"] <= 90.0 for s in segments)
        assert all(-180.0 <= s["lng"] <= 180.0 for s in segments)

    def test_a_rider_on_profile_ftp_is_told_no_w_prime_is_known(
        self, client_with_athlete
    ):
        """No CP fit means no W′, which disables the simulator's cap branch
        entirely: no blow-up is reported and the W′ series is flat. That has
        to be stated, or the silence reads as "you never break"."""
        resp = client_with_athlete.post(
            "/rehearsals", json={"source_kind": "gpx", "gpx": _GPX, "effort": "race"}
        )
        body = resp.json()
        assert body["can_predict"] is True
        assert body["w_prime_is_default"] is True
        assert body["blow_ups"] == []

    def test_a_rider_with_a_fitted_cp_curve_carries_a_real_w_prime(self):
        """The other side of the same flag: a measured W′ is not a default."""
        _install(_make_profile())
        try:
            with patch(
                "app.api.rehearsals.latest_critical_power",
                new=AsyncMock(return_value={"cp_watts": 250.0, "w_prime_j": 20000.0}),
            ):
                client = TestClient(app, raise_server_exceptions=True)
                body = client.post(
                    "/rehearsals", json={"source_kind": "gpx", "gpx": _GPX}
                ).json()
        finally:
            app.dependency_overrides.clear()
        assert body["w_prime_is_default"] is False
        assert any(s["w_bal_j"] for s in body["segments"])

    def test_an_oversized_gpx_is_refused_before_it_is_parsed(
        self, client_with_athlete
    ):
        """Unbounded, one authenticated POST can pin a worker on a parse. The
        cap matches the crew tour uploader's MAX_TOUR_BYTES."""
        oversized = "x" * (MAX_GPX_BYTES + 1)
        resp = client_with_athlete.post(
            "/rehearsals", json={"source_kind": "gpx", "gpx": oversized}
        )
        assert resp.status_code == 422
        assert "too large" in json.dumps(resp.json()).lower()

    def test_a_referenced_source_without_a_source_ref_is_refused(
        self, client_with_athlete
    ):
        """crew_event / activity name a row; without an id there is nothing to
        look up, and that is the athlete's request being wrong, not the file."""
        for kind in ("crew_event", "activity"):
            resp = client_with_athlete.post("/rehearsals", json={"source_kind": kind})
            assert resp.status_code == 422, kind
            assert "source_ref" in resp.json()["detail"]

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


# ──────────────────────────────────────────────────────────────────────
# The other three route sources (Task 12)
# ──────────────────────────────────────────────────────────────────────

def _make_source_db(profile: MagicMock | None, rows: dict):
    """A session that answers each table with the row the test put there.

    `rows` keys: 'crew_memberships', 'crew_events', 'activities',
    'activity_streams'. A key that is absent answers None, which is exactly
    what "that row does not exist" looks like to the router.
    """
    db = AsyncMock()
    added: list = []

    def _table_for(query) -> str:
        text = str(query)
        for name in (
            "activity_streams",
            "activities",
            "crew_memberships",
            "crew_events",
            "route_rehearsals",
        ):
            if name in text:
                return name
        return "athlete_profiles"

    async def _execute(query, *args, **kwargs):  # noqa: ANN001
        result = MagicMock()
        table = _table_for(query)
        row = profile if table == "athlete_profiles" else rows.get(table)
        result.scalar_one_or_none.return_value = row
        result.scalars.return_value.all.return_value = [row] if row else []
        result.scalars.return_value.first.return_value = row
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


def _client_with_sources(profile: MagicMock | None, rows: dict) -> TestClient:
    user = _make_user(1)
    mock_db = _make_source_db(profile, rows)

    async def _override_user():
        return user

    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_current_active_user] = _override_user
    app.dependency_overrides[get_current_user] = _override_user
    app.dependency_overrides[get_db_for_user] = _override_db
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture
def sources():
    """Factory + teardown: `sources(rows, profile=...)` → an authed client."""
    def _make(rows: dict, profile: MagicMock | None = None):
        return _client_with_sources(
            profile if profile is not None else _make_profile(), rows
        )

    with patch(
        "app.api.rehearsals.latest_critical_power", new=AsyncMock(return_value=None)
    ):
        try:
            yield _make
        finally:
            app.dependency_overrides.clear()


def _membership(crew_id: int = 5) -> MagicMock:
    mem = MagicMock()
    mem.crew_id = crew_id
    return mem


def _event(event_id: int = 3, *, tour_filename: str | None = "loop.gpx") -> MagicMock:
    ev = MagicMock()
    ev.id = event_id
    ev.name = "Sunrise loop"
    ev.tour_filename = tour_filename
    ev.starts_at = datetime(2026, 8, 2, 7, 0, tzinfo=timezone.utc)
    return ev


class TestCrewEventSource:
    def test_reads_the_original_tour_not_the_card_profile(
        self, sources, tmp_path, monkeypatch
    ):
        """The 60-point original off disk, not the ≤120-point card profile.

        The mocked event row carries no usable `tour_profile` at all; if the
        router were reading the row rather than the file, there would be
        nothing to simulate.
        """
        from app.config import settings

        monkeypatch.setattr(settings, "CREW_TOURS_ROOT", str(tmp_path))
        (tmp_path / "3.gpx").write_text(_GPX)

        client = sources({"crew_memberships": _membership(), "crew_events": _event()})
        resp = client.post(
            "/rehearsals", json={"source_kind": "crew_event", "source_ref": 3}
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "Sunrise loop"
        assert body["source_kind"] == "crew_event"
        assert body["source_ref"] == 3
        # 60 trackpoints × 8 m of gain — the full file, not a 120-point chart.
        assert body["ascent_m"] == pytest.approx(59 * 8, rel=0.01)

    def test_an_event_with_no_tour_is_404(self, sources):
        client = sources(
            {
                "crew_memberships": _membership(),
                "crew_events": _event(tour_filename=None),
            }
        )
        resp = client.post(
            "/rehearsals", json={"source_kind": "crew_event", "source_ref": 3}
        )
        assert resp.status_code == 404

    def test_an_event_in_another_crew_is_404(self, sources):
        """`_get_crew_event` scopes by crew, so a foreign event simply is not
        there — indistinguishable from one that never existed."""
        client = sources({"crew_memberships": _membership()})
        resp = client.post(
            "/rehearsals", json={"source_kind": "crew_event", "source_ref": 3}
        )
        assert resp.status_code == 404

    def test_a_missing_file_on_disk_is_422_with_a_reason(
        self, sources, tmp_path, monkeypatch
    ):
        from app.config import settings

        monkeypatch.setattr(settings, "CREW_TOURS_ROOT", str(tmp_path))
        client = sources({"crew_memberships": _membership(), "crew_events": _event()})
        resp = client.post(
            "/rehearsals", json={"source_kind": "crew_event", "source_ref": 3}
        )
        assert resp.status_code == 422
        assert "no longer" in resp.json()["detail"]


def _activity(activity_id: int = 11, title: str | None = "Last Sunday") -> MagicMock:
    act = MagicMock()
    act.id = activity_id
    act.title = title
    return act


def _stream(channels: dict) -> MagicMock:
    st = MagicMock()
    st.streams = channels
    return st


_OUTDOOR_STREAM = {
    "latitude": [46.0 + i * 0.0005 for i in range(60)],
    "longitude": [11.0] * 60,
    "altitude": [1000.0 + i * 4 for i in range(60)],
}


class TestActivitySource:
    def test_a_past_ride_becomes_a_rehearsable_route(self, sources):
        """The accuracy check: the same course, predicted, next to what
        actually happened."""
        client = sources(
            {"activities": _activity(), "activity_streams": _stream(_OUTDOOR_STREAM)}
        )
        resp = client.post(
            "/rehearsals", json={"source_kind": "activity", "source_ref": 11}
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "Last Sunday"
        assert body["source_kind"] == "activity"
        assert body["ascent_m"] == pytest.approx(59 * 4, rel=0.01)
        assert body["can_predict"] is True
        # A past ride carries no forecast — there is none left to fetch.
        assert body["weather_used"] is False

    def test_an_indoor_ride_is_refused_with_a_reason(self, sources):
        client = sources(
            {
                "activities": _activity(title="Zwift"),
                "activity_streams": _stream({"power": [200] * 60}),
            }
        )
        resp = client.post(
            "/rehearsals", json={"source_kind": "activity", "source_ref": 11}
        )
        assert resp.status_code == 422
        assert "no GPS" in resp.json()["detail"]

    def test_an_activity_that_is_not_the_callers_is_404(self, sources):
        client = sources({})
        resp = client.post(
            "/rehearsals", json={"source_kind": "activity", "source_ref": 11}
        )
        assert resp.status_code == 404

    def test_an_activity_with_no_stored_stream_is_404(self, sources):
        client = sources({"activities": _activity()})
        resp = client.post(
            "/rehearsals", json={"source_kind": "activity", "source_ref": 11}
        )
        assert resp.status_code == 404


class TestTargetEventSource:
    def _profile(self, gpx: str | None, event_date=None) -> MagicMock:
        profile = _make_profile()
        profile.target_event_gpx = gpx
        profile.target_event_date = event_date
        profile.goals = {"target_event": {"name": "Maratona"}}
        return profile

    def test_the_stored_course_is_simulated_and_dated(self, sources):
        ride_date = date.today() + timedelta(days=FORECAST_HORIZON_DAYS + 30)
        client = sources({}, profile=self._profile(_GPX, ride_date))
        with patch(
            "app.api.rehearsals.fetch_window_forecast",
            new=AsyncMock(return_value=None),
        ):
            resp = client.post("/rehearsals", json={"source_kind": "target_event"})
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "Maratona"
        assert body["source_kind"] == "target_event"
        assert body["can_predict"] is True

    def test_no_stored_course_is_404(self, sources):
        client = sources({}, profile=self._profile(None))
        resp = client.post("/rehearsals", json={"source_kind": "target_event"})
        assert resp.status_code == 404
        assert "target-event" in resp.json()["detail"]


class TestTargetEventCourseWriter:
    """`target_event_gpx` had a reader and no writer, so the source above
    could only ever 404 and the column nothing could populate. The profile
    update is that writer -- these guard its contract."""

    def test_the_profile_update_accepts_a_course(self):
        data = AthleteProfileUpdate(target_event_gpx=_GPX)
        assert data.target_event_gpx == _GPX
        # exclude_unset is what update_profile writes with; the field must
        # actually be in it or the setattr loop never runs.
        assert "target_event_gpx" in data.model_dump(exclude_unset=True)

    def test_null_clears_the_course(self):
        data = AthleteProfileUpdate(target_event_gpx=None)
        assert data.model_dump(exclude_unset=True) == {"target_event_gpx": None}

    def test_a_file_that_is_not_gpx_is_refused(self):
        with pytest.raises(ValidationError, match="GPX"):
            AthleteProfileUpdate(target_event_gpx="just some text")

    def test_an_oversized_course_is_refused(self):
        oversized = "<gpx>" + "x" * MAX_TARGET_EVENT_GPX_BYTES
        with pytest.raises(ValidationError, match="too large"):
            AthleteProfileUpdate(target_event_gpx=oversized)

    def test_the_read_model_reports_the_course_without_shipping_it(self):
        """Megabytes of GPX have no business on every profile fetch; the
        client only needs to know whether the door is open."""
        profile = AthleteProfile(user_id=1, target_event_gpx=_GPX)
        assert profile.has_target_event_route is True
        assert AthleteProfile(user_id=1).has_target_event_route is False
        assert "target_event_gpx" not in AthleteProfileRead.model_fields


class TestRiderOverrides:
    """Weight, bike and surface: cheap knobs, but they must actually reach the
    physics — and a rehearsal that names none of them must be untouched."""

    def _time(self, client, **knobs) -> float:
        resp = client.post(
            "/rehearsals", json={"source_kind": "gpx", "gpx": _GPX, **knobs}
        )
        assert resp.status_code == 201, resp.text
        return resp.json()["total_time_s"]

    def test_a_lighter_rider_climbs_the_same_route_faster(self, client_with_athlete):
        heavy = self._time(client_with_athlete, weight_kg=90)
        light = self._time(client_with_athlete, weight_kg=60)
        assert light < heavy

    def test_a_heavier_bike_is_slower(self, client_with_athlete):
        light = self._time(client_with_athlete, weight_kg=72, bike_mass_kg=6)
        heavy = self._time(client_with_athlete, weight_kg=72, bike_mass_kg=14)
        assert heavy > light

    def test_gravel_is_slower_than_asphalt_at_the_same_watts(self, client_with_athlete):
        road = self._time(client_with_athlete, surface="asphalt")
        gravel = self._time(client_with_athlete, surface="gravel")
        assert gravel > road

    def test_asphalt_is_exactly_the_old_default(self, client_with_athlete):
        """The surface knob must not move an existing rehearsal's numbers."""
        untouched = self._time(client_with_athlete)
        asphalt = self._time(client_with_athlete, surface="asphalt")
        assert asphalt == pytest.approx(untouched, rel=1e-9)

    def test_a_nonsense_weight_is_refused_rather_than_simulated(self, client_with_athlete):
        # Correct physics applied to a 4 kg rider produces confident nonsense.
        resp = client_with_athlete.post(
            "/rehearsals", json={"source_kind": "gpx", "gpx": _GPX, "weight_kg": 4}
        )
        assert resp.status_code == 422

    def test_the_knobs_come_back_so_the_controls_can_render_themselves(
        self, client_with_athlete
    ):
        resp = client_with_athlete.post(
            "/rehearsals",
            json={
                "source_kind": "gpx",
                "gpx": _GPX,
                "weight_kg": 68,
                "bike_mass_kg": 7.4,
                "surface": "gravel",
            },
        )
        a = resp.json()["assumptions"]
        assert a["weight_kg"] == 68
        assert a["bike_mass_kg"] == 7.4
        assert a["surface"] == "gravel"


class TestTargetTimeOverAPI:
    def test_a_reachable_target_comes_back_with_the_intensity_it_demands(
        self, client_with_athlete
    ):
        base = client_with_athlete.post(
            "/rehearsals", json={"source_kind": "gpx", "gpx": _GPX}
        ).json()["total_time_s"]

        resp = client_with_athlete.post(
            "/rehearsals",
            json={"source_kind": "gpx", "gpx": _GPX, "target_time_s": base * 0.97},
        )
        body = resp.json()
        assert body["target_reachable"] is True
        assert body["target_intensity_pct"] > 0
        assert body["fastest_possible_s"] is None
        # The band is drawn around the ride actually being planned.
        assert body["total_time_s"] == pytest.approx(base * 0.97, abs=30)

    def test_an_impossible_target_is_refused_and_says_what_is_possible(
        self, client_with_athlete
    ):
        resp = client_with_athlete.post(
            "/rehearsals",
            json={"source_kind": "gpx", "gpx": _GPX, "target_time_s": 300},
        )
        body = resp.json()
        assert body["target_reachable"] is False
        assert body["fastest_possible_s"] > 300

    def test_no_target_means_no_target_fields(self, client_with_athlete):
        body = client_with_athlete.post(
            "/rehearsals", json={"source_kind": "gpx", "gpx": _GPX}
        ).json()
        assert body["target_time_s"] is None
        assert body["target_reachable"] is None
        assert body["target_intensity_pct"] is None


def _stored_row_with_knobs():
    """A stored rehearsal that already has rider/day knobs set on it."""
    row = _stored_row()
    row.assumptions = {
        "draft": "solo",
        "effort": "fondo",
        "use_weather": True,
        "weight_kg": 65,
        "bike_mass_kg": None,
        "surface": "gravel",
        "start_hour": 7,
        "use_projected_cp": False,
        "target_time_s": None,
    }
    return row


@pytest.fixture
def client_with_knobs_stored():
    _install(_make_profile(), stored=_stored_row_with_knobs())
    try:
        with patch(
            "app.api.rehearsals.latest_critical_power", new=AsyncMock(return_value=None)
        ):
            yield TestClient(app, raise_server_exceptions=True)
    finally:
        app.dependency_overrides.clear()


class TestPatchMergesKnobs:
    def test_patching_one_knob_does_not_clear_the_others(self, client_with_knobs_stored):
        """The failure this guards: tapping the draft tab silently wiping the
        athlete's weight override or start hour, because PATCH rebuilt the
        overrides from a body that only mentioned draft."""
        patched = client_with_knobs_stored.patch(
            "/rehearsals/7", json={"draft": "bunch"}
        ).json()

        assert patched["assumptions"]["draft"] == "bunch"
        assert patched["assumptions"]["weight_kg"] == 65
        assert patched["assumptions"]["surface"] == "gravel"
        assert patched["assumptions"]["start_hour"] == 7


class TestStartHour:
    """A named start hour is a specific morning, not an average one.

    The whole point of the knob is that 6 a.m. is a different ride from 11 —
    so the failure worth guarding is the silent one: a start hour that is
    accepted, stored, echoed back, and then quietly averaged away.
    """

    @staticmethod
    def _route(ride_date):
        return route_from_gpx(_GPX, name="W", ride_date=ride_date)

    @staticmethod
    def _varying_body() -> dict:
        """Cold and still at dawn, hot and windy at midday."""
        return {
            "hourly": {
                "wind_speed_10m": [3.6 if h < 9 else 36.0 for h in range(24)],
                "wind_direction_10m": [90.0] * 24,
                "temperature_2m": [4.0 if h < 9 else 28.0 for h in range(24)],
            }
        }

    async def test_an_early_start_gets_the_early_weather(self):
        route = self._route(date.today() + timedelta(days=1))
        with patch(
            "app.api.rehearsals.fetch_window_forecast",
            new=AsyncMock(return_value=self._varying_body()),
        ):
            dawn = await _forecast_for_route(route, date.today(), 7)
            noon = await _forecast_for_route(route, date.today(), 13)

        assert dawn["temperature_c"] == pytest.approx(4.0)
        assert noon["temperature_c"] == pytest.approx(28.0)
        assert dawn["wind_speed_ms"] < noon["wind_speed_ms"]

    async def test_no_start_hour_still_averages_the_daylight_window(self):
        """The old behaviour, unchanged for anyone who never touches the knob."""
        route = self._route(date.today() + timedelta(days=1))
        with patch(
            "app.api.rehearsals.fetch_window_forecast",
            new=AsyncMock(return_value=self._varying_body()),
        ):
            averaged = await _forecast_for_route(route, date.today())

        # Between the dawn value and the midday one, being a mean of both.
        assert 4.0 < averaged["temperature_c"] < 28.0

    async def test_a_hole_at_that_hour_falls_back_rather_than_returning_nothing(self):
        """A forecast gap at exactly the chosen hour must not delete the
        weather entirely -- the rider asked for wind, not for silence."""
        body = self._varying_body()
        body["hourly"]["temperature_2m"][7] = None
        route = self._route(date.today() + timedelta(days=1))
        with patch(
            "app.api.rehearsals.fetch_window_forecast", new=AsyncMock(return_value=body)
        ):
            forecast = await _forecast_for_route(route, date.today(), 7)

        assert forecast is not None
        assert forecast["temperature_c"] is not None
