"""Crew-events API — create / list / RSVP / GPX tour upload+download, plus
auth + crew-scoping guards.

Mirrors the mocked-db dependency-override harness used across tests/api: there
is no real-Postgres fixture in this repo, so a small stateful fake AsyncSession
dispatches on the rendered SQL of each Select and tracks added rows in Python
dicts (enough to exercise the endpoint logic end-to-end).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api import crew_events as ce
from app.config import settings
from app.dependencies import (
    get_current_active_user,
    get_current_user,
    get_db_for_user,
)
from app.main import app
from app.models.crew_event import CrewEvent, CrewEventAttendee

CALLER = SimpleNamespace(id=5, email="jannis@evori.ai", is_active=True)
NOW = datetime.now(timezone.utc)

# A tiny valid GPX track: 4 points climbing ~46.0/7.0 → distance + gain > 0.
SAMPLE_GPX = b"""<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Test Climb</name><trkseg>
    <trkpt lat="46.0000" lon="7.0000"><ele>1000</ele></trkpt>
    <trkpt lat="46.0010" lon="7.0010"><ele>1030</ele></trkpt>
    <trkpt lat="46.0020" lon="7.0020"><ele>1015</ele></trkpt>
    <trkpt lat="46.0030" lon="7.0030"><ele>1080</ele></trkpt>
  </trkseg></trk>
</gpx>"""


def _params(stmt) -> dict:
    try:
        return dict(stmt.compile().params)
    except Exception:
        return {}


def _int_param(stmt, prefix: str):
    for k, v in _params(stmt).items():
        if k.startswith(prefix) and isinstance(v, int):
            return v
    return None


def _user(uid: int, email: str):
    return SimpleNamespace(id=uid, email=email, display_name=None, is_active=True)


class FakeDB:
    """A minimal stateful async session for the crew-events endpoints."""

    def __init__(
        self,
        *,
        memberships: dict[int, object] | None = None,
        users: dict[int, object] | None = None,
        crews: dict[int, object] | None = None,
        events: dict[int, CrewEvent] | None = None,
        attendees: list[CrewEventAttendee] | None = None,
    ):
        self.memberships = memberships or {}
        self.users = users or {}
        self.crews = crews or {}
        self.events = events or {}
        self.attendees = attendees or []
        self._next_event_id = max(self.events, default=0) + 1
        self._next_att_id = 1

        self.execute = AsyncMock(side_effect=self._execute)
        self.commit = AsyncMock()

    # ---- session surface -------------------------------------------------
    def add(self, obj):
        if isinstance(obj, CrewEvent):
            if obj.id is None:
                obj.id = self._next_event_id
                self._next_event_id += 1
            if obj.created_at is None:
                obj.created_at = NOW
            self.events[obj.id] = obj
        elif isinstance(obj, CrewEventAttendee):
            obj.id = self._next_att_id
            self._next_att_id += 1
            if obj.created_at is None:
                obj.created_at = NOW
            self.attendees.append(obj)

    async def flush(self):
        # ids already assigned in add(); nothing else to do.
        return None

    async def refresh(self, obj):
        return None

    # ---- query dispatcher ------------------------------------------------
    async def _execute(self, stmt):
        text = str(stmt)
        res = MagicMock()

        if "FROM crew_memberships" in text:
            uid = _int_param(stmt, "user_id")
            res.scalar_one_or_none.return_value = self.memberships.get(uid)
            return res

        if "crew_event_attendees" in text and "JOIN users" in text:
            eid = _int_param(stmt, "event_id")
            rows = [
                (a, self.users.get(a.user_id))
                for a in self.attendees
                if a.event_id == eid
            ]
            res.all.return_value = rows
            return res

        if "FROM crew_event_attendees" in text:
            eid = _int_param(stmt, "event_id")
            uid = _int_param(stmt, "user_id")
            match = next(
                (a for a in self.attendees if a.event_id == eid and a.user_id == uid),
                None,
            )
            res.scalar_one_or_none.return_value = match
            return res

        if "FROM crew_events" in text:
            if "crew_events.id =" in text:  # single fetch (WHERE id + crew_id)
                eid = _int_param(stmt, "id")
                ev = self.events.get(eid)
                crew_id = _int_param(stmt, "crew_id")
                if ev is not None and crew_id is not None and ev.crew_id != crew_id:
                    ev = None
                res.scalar_one_or_none.return_value = ev
            else:  # list for a crew
                crew_id = _int_param(stmt, "crew_id")
                evs = [e for e in self.events.values() if e.crew_id == crew_id]
                evs.sort(key=lambda e: e.starts_at)
                res.scalars.return_value.all.return_value = evs
            return res

        if "FROM crews" in text:
            cid = _int_param(stmt, "id")
            res.scalar_one_or_none.return_value = self.crews.get(cid)
            return res

        if "FROM users" in text:
            uid = _int_param(stmt, "id")
            res.scalar_one_or_none.return_value = self.users.get(uid)
            return res

        res.scalar_one_or_none.return_value = None  # pragma: no cover
        return res


@pytest.fixture()
def client_for():
    made = []

    def _make(db, caller=CALLER):
        app.dependency_overrides[get_current_user] = lambda: caller
        app.dependency_overrides[get_current_active_user] = lambda: caller
        app.dependency_overrides[get_db_for_user] = lambda: db
        c = TestClient(app)
        made.append(c)
        return c

    yield _make
    app.dependency_overrides.clear()


def _crew(crew_id=1, owner=5):
    return SimpleNamespace(id=crew_id, name="Maratona Squad", owner_user_id=owner)


def _membership(user_id=5, crew_id=1):
    return SimpleNamespace(id=1, crew_id=crew_id, user_id=user_id, role="member")


def _base_db(**kw) -> FakeDB:
    return FakeDB(
        memberships={5: _membership(5, 1)},
        users={5: _user(5, "jannis@evori.ai"), 6: _user(6, "luca@gmail.com")},
        crews={1: _crew(1, owner=5)},
        **kw,
    )


# ── create ────────────────────────────────────────────────────────────────


def test_create_event_creator_auto_going(client_for):
    db = _base_db()
    starts = (NOW + timedelta(days=2)).isoformat()
    res = client_for(db).post(
        "/crews/me/events",
        json={"name": "Sunrise Chaingang", "kind": "chaingang", "starts_at": starts,
              "meeting_point": "Café am See"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["name"] == "Sunrise Chaingang"
    assert body["kind"] == "chaingang"
    assert body["meeting_point"] == "Café am See"
    assert body["creator_user_id"] == 5
    assert body["my_status"] == "going"
    assert body["going_count"] == 1
    assert body["counts"] == {"going": 1, "maybe": 0, "out": 0}
    assert body["has_tour"] is False
    assert body["tour_polyline"] is None


def test_create_event_requires_crew(client_for):
    db = FakeDB(memberships={})  # caller in no crew
    res = client_for(db).post(
        "/crews/me/events",
        json={"name": "x", "starts_at": (NOW + timedelta(days=1)).isoformat()},
    )
    assert res.status_code == 403


# ── list ────────────────────────────────────────────────────────────────


def test_list_events_returns_counts_and_my_status(client_for):
    ev = CrewEvent(
        crew_id=1, creator_user_id=5, name="Group Ride", kind="group_ride",
        starts_at=NOW + timedelta(days=3),
    )
    ev.id = 10
    ev.created_at = NOW
    att = [
        CrewEventAttendee(event_id=10, user_id=5, status="going"),
        CrewEventAttendee(event_id=10, user_id=6, status="maybe"),
    ]
    for a in att:
        a.created_at = NOW
    db = _base_db(events={10: ev}, attendees=att)
    res = client_for(db).get("/crews/me/events")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    e = body[0]
    assert e["counts"] == {"going": 1, "maybe": 1, "out": 0}
    assert e["my_status"] == "going"
    assert {a["user_id"] for a in e["attendees"]} == {5, 6}


def test_list_events_empty_when_no_crew(client_for):
    db = FakeDB(memberships={})
    res = client_for(db).get("/crews/me/events")
    assert res.status_code == 200
    assert res.json() == []


# ── rsvp ────────────────────────────────────────────────────────────────


def test_rsvp_sets_and_updates_status(client_for):
    ev = CrewEvent(crew_id=1, creator_user_id=5, name="R", kind="race",
                   starts_at=NOW + timedelta(days=4))
    ev.id = 20
    ev.created_at = NOW
    a = CrewEventAttendee(event_id=20, user_id=5, status="going")
    a.created_at = NOW
    db = _base_db(events={20: ev}, attendees=[a])

    res = client_for(db).post("/crews/me/events/20/rsvp", json={"status": "maybe"})
    assert res.status_code == 200
    assert res.json()["my_status"] == "maybe"
    assert res.json()["counts"]["maybe"] == 1


def test_rsvp_event_from_other_crew_404(client_for):
    ev = CrewEvent(crew_id=99, creator_user_id=6, name="Other", kind="race",
                   starts_at=NOW + timedelta(days=1))
    ev.id = 30
    ev.created_at = NOW
    db = _base_db(events={30: ev})
    res = client_for(db).post("/crews/me/events/30/rsvp", json={"status": "going"})
    assert res.status_code == 404


# ── single GET + edit (PATCH) ─────────────────────────────────────────────


def test_get_single_event_returns_event(client_for):
    ev = CrewEvent(crew_id=1, creator_user_id=5, name="Group Ride", kind="group_ride",
                   starts_at=NOW + timedelta(days=3))
    ev.id = 80
    ev.created_at = NOW
    a = CrewEventAttendee(event_id=80, user_id=5, status="going")
    a.created_at = NOW
    db = _base_db(events={80: ev}, attendees=[a])
    res = client_for(db).get("/crews/me/events/80")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["id"] == 80
    assert body["name"] == "Group Ride"
    assert body["my_status"] == "going"


def test_get_single_event_other_crew_404(client_for):
    ev = CrewEvent(crew_id=99, creator_user_id=6, name="Other", kind="race",
                   starts_at=NOW + timedelta(days=1))
    ev.id = 81
    ev.created_at = NOW
    db = _base_db(events={81: ev})
    res = client_for(db).get("/crews/me/events/81")
    assert res.status_code == 404


def test_patch_event_persists_edits(client_for):
    ev = CrewEvent(crew_id=1, creator_user_id=5, name="Old Name", kind="group_ride",
                   starts_at=NOW + timedelta(days=3), meeting_point="Old spot")
    ev.id = 82
    ev.created_at = NOW
    db = _base_db(events={82: ev})
    new_start = (NOW + timedelta(days=6)).isoformat()
    res = client_for(db).patch(
        "/crews/me/events/82",
        json={"name": "New Name", "kind": "chaingang", "starts_at": new_start,
              "meeting_point": "New spot", "description": "Bring lights"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["name"] == "New Name"
    assert body["kind"] == "chaingang"
    assert body["meeting_point"] == "New spot"
    assert body["description"] == "Bring lights"
    # Persisted on the row
    assert db.events[82].name == "New Name"
    assert db.events[82].kind == "chaingang"


def test_patch_event_partial_leaves_others(client_for):
    ev = CrewEvent(crew_id=1, creator_user_id=5, name="Keep Kind", kind="race",
                   starts_at=NOW + timedelta(days=3), meeting_point="Café")
    ev.id = 83
    ev.created_at = NOW
    db = _base_db(events={83: ev})
    res = client_for(db).patch("/crews/me/events/83", json={"name": "Renamed"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["name"] == "Renamed"
    assert body["kind"] == "race"  # untouched
    assert body["meeting_point"] == "Café"  # untouched


def test_patch_event_forbidden_for_non_creator_non_owner(client_for):
    # Event by user 6, crew owned by user 6; caller (5) is a plain member.
    ev = CrewEvent(crew_id=1, creator_user_id=6, name="Not Mine", kind="group_ride",
                   starts_at=NOW + timedelta(days=2))
    ev.id = 84
    ev.created_at = NOW
    db = FakeDB(
        memberships={5: _membership(5, 1)},
        users={5: _user(5, "jannis@evori.ai"), 6: _user(6, "luca@gmail.com")},
        crews={1: _crew(1, owner=6)},
        events={84: ev},
    )
    res = client_for(db).patch("/crews/me/events/84", json={"name": "Hijack"})
    assert res.status_code == 403
    assert db.events[84].name == "Not Mine"  # unchanged


def test_patch_event_owner_can_edit_others_event(client_for):
    # Event by user 6, but crew owned by caller (5) → owner may edit.
    ev = CrewEvent(crew_id=1, creator_user_id=6, name="Members Event", kind="group_ride",
                   starts_at=NOW + timedelta(days=2))
    ev.id = 85
    ev.created_at = NOW
    db = _base_db(events={85: ev})  # crew owner is 5 (the caller)
    res = client_for(db).patch("/crews/me/events/85", json={"name": "Owner Edited"})
    assert res.status_code == 200, res.text
    assert res.json()["name"] == "Owner Edited"


# ── tour upload + download ────────────────────────────────────────────────


def test_tour_upload_parses_and_download_returns_file(client_for, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "CREW_TOURS_ROOT", str(tmp_path))
    ev = CrewEvent(crew_id=1, creator_user_id=5, name="Climb", kind="group_ride",
                   starts_at=NOW + timedelta(days=5))
    ev.id = 40
    ev.created_at = NOW
    db = _base_db(events={40: ev})
    client = client_for(db)

    res = client.post(
        "/crews/me/events/40/tour",
        files={"file": ("climb.gpx", SAMPLE_GPX, "application/gpx+xml")},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["has_tour"] is True
    assert body["tour_filename"] == "climb.gpx"
    assert body["tour_distance_m"] > 0
    assert body["tour_elevation_m"] > 0
    assert len(body["tour_polyline"]) == 4
    assert body["tour_polyline"][0] == [46.0, 7.0]
    assert (tmp_path / "40.gpx").exists()
    # Elevation-profile fields for the detail page's chart.
    assert len(body["tour_profile"]) == 4
    assert body["tour_profile"][0][0] == 0.0  # cumulative distance starts at 0
    assert body["tour_profile"][0][1] == 1000.0
    xs = [p[0] for p in body["tour_profile"]]
    assert xs == sorted(xs)
    assert body["tour_descent_m"] >= 0
    assert body["tour_max_grade_pct"] is not None

    # download the raw file back
    dl = client.get("/crews/me/events/40/tour")
    assert dl.status_code == 200
    assert dl.headers["content-type"] == "application/gpx+xml"
    assert b"<trkpt" in dl.content


def test_tour_download_404_without_tour(client_for, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "CREW_TOURS_ROOT", str(tmp_path))
    ev = CrewEvent(crew_id=1, creator_user_id=5, name="NoTour", kind="race",
                   starts_at=NOW + timedelta(days=1))
    ev.id = 50
    ev.created_at = NOW
    db = _base_db(events={50: ev})
    res = client_for(db).get("/crews/me/events/50/tour")
    assert res.status_code == 404


def test_tour_upload_forbidden_for_non_creator_non_owner(client_for, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "CREW_TOURS_ROOT", str(tmp_path))
    # Event created by user 6; crew owned by user 6; caller (5) is a plain member.
    ev = CrewEvent(crew_id=1, creator_user_id=6, name="Not Mine", kind="group_ride",
                   starts_at=NOW + timedelta(days=2))
    ev.id = 60
    ev.created_at = NOW
    db = FakeDB(
        memberships={5: _membership(5, 1)},
        users={5: _user(5, "jannis@evori.ai"), 6: _user(6, "luca@gmail.com")},
        crews={1: _crew(1, owner=6)},
        events={60: ev},
    )
    res = client_for(db).post(
        "/crews/me/events/60/tour",
        files={"file": ("x.gpx", SAMPLE_GPX, "application/gpx+xml")},
    )
    assert res.status_code == 403
    assert not (tmp_path / "60.gpx").exists()


def test_tour_upload_rejects_garbage_gpx(client_for, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "CREW_TOURS_ROOT", str(tmp_path))
    ev = CrewEvent(crew_id=1, creator_user_id=5, name="Climb", kind="group_ride",
                   starts_at=NOW + timedelta(days=5))
    ev.id = 70
    ev.created_at = NOW
    db = _base_db(events={70: ev})
    res = client_for(db).post(
        "/crews/me/events/70/tour",
        files={"file": ("junk.gpx", b"not a gpx at all", "application/gpx+xml")},
    )
    assert res.status_code == 422


# ── ride weather ──────────────────────────────────────────────────────────


def _event_with_tour(event_id: int, *, crew_id: int = 1, starts_at=None) -> CrewEvent:
    ev = CrewEvent(
        crew_id=crew_id,
        creator_user_id=5,
        name="Dolomites Recon",
        kind="group_ride",
        starts_at=starts_at or (NOW + timedelta(days=2)),
    )
    ev.id = event_id
    ev.created_at = NOW
    ev.tour_filename = "recon.gpx"
    ev.tour_polyline = [[46.5, 11.9], [46.51, 11.91]]
    return ev


def _om_body(window_start):
    """An Open-Meteo-shaped body covering 8 hours from the ride's start hour."""
    times = [
        (window_start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(8)
    ]
    return {
        "hourly": {
            "time": times,
            "temperature_2m": [12.0 + i for i in range(8)],
            "precipitation_probability": [10 * i for i in range(8)],
            "wind_speed_10m": [8.0 + i for i in range(8)],
            "wind_direction_10m": [200 + i for i in range(8)],
            "weather_code": [3] * 8,
        },
        "daily": {
            "time": [window_start.date().isoformat()],
            "sunrise": [f"{window_start.date().isoformat()}T05:12"],
        },
    }


def test_event_weather_returns_five_hour_strip(client_for, monkeypatch):
    starts = (NOW + timedelta(days=2)).replace(minute=37, second=0, microsecond=0)
    window_start = starts.replace(minute=0)
    ev = _event_with_tour(80, starts_at=starts)
    db = _base_db(events={80: ev})

    async def fake_fetch(lat, lng, start, end, **kw):
        # Coordinates must come from the route's first point, not a guess.
        assert (round(lat, 2), round(lng, 2)) == (46.5, 11.9)
        return _om_body(window_start)

    monkeypatch.setattr(ce, "fetch_window_forecast", fake_fetch)

    res = client_for(db).get("/crews/me/events/80/weather")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["available"] is True
    assert len(body["hourly"]) == 5  # the design's five-cell strip
    first = body["hourly"][0]
    assert first["temp_c"] == 12.0
    assert first["wind_kmh"] == 8.0
    assert first["wind_dir_deg"] == 200
    assert first["precip_prob_pct"] == 0
    assert first["weather_code"] == 3
    assert body["sunrise"] is not None
    assert body["window_start"].startswith(window_start.strftime("%Y-%m-%dT%H:00"))


def test_event_weather_unavailable_without_tour(client_for, monkeypatch):
    ev = CrewEvent(crew_id=1, creator_user_id=5, name="No Route", kind="race",
                   starts_at=NOW + timedelta(days=1))
    ev.id = 81
    ev.created_at = NOW
    db = _base_db(events={81: ev})

    called = []

    async def fake_fetch(*a, **kw):  # must never run: we have no location
        called.append(a)
        return {}

    monkeypatch.setattr(ce, "fetch_window_forecast", fake_fetch)

    res = client_for(db).get("/crews/me/events/81/weather")
    assert res.status_code == 200, res.text
    assert res.json() == {
        "available": False,
        "window_start": None,
        "window_end": None,
        "hourly": [],
        "sunrise": None,
    }
    assert called == []


def test_event_weather_requires_crew_membership(client_for, monkeypatch):
    db = FakeDB(users={5: _user(5, "jannis@evori.ai")})  # caller in no crew
    res = client_for(db).get("/crews/me/events/80/weather")
    assert res.status_code == 403


def test_event_weather_other_crew_event_404(client_for, monkeypatch):
    ev = _event_with_tour(82, crew_id=2)  # caller is in crew 1
    db = _base_db(events={82: ev})
    res = client_for(db).get("/crews/me/events/82/weather")
    assert res.status_code == 404


def test_event_weather_degrades_when_client_returns_none(client_for, monkeypatch):
    db = _base_db(events={83: _event_with_tour(83)})

    async def fake_fetch(*a, **kw):
        return None  # the client's own defensive contract on any failure

    monkeypatch.setattr(ce, "fetch_window_forecast", fake_fetch)

    res = client_for(db).get("/crews/me/events/83/weather")
    assert res.status_code == 200
    assert res.json()["available"] is False


def test_event_weather_never_500s_when_client_raises(client_for, monkeypatch):
    db = _base_db(events={84: _event_with_tour(84)})

    async def boom(*a, **kw):
        raise RuntimeError("upstream exploded")

    monkeypatch.setattr(ce, "fetch_window_forecast", boom)

    res = client_for(db).get("/crews/me/events/84/weather")
    assert res.status_code == 200
    assert res.json()["available"] is False
    assert res.json()["hourly"] == []


def test_event_weather_unavailable_beyond_forecast_horizon(client_for, monkeypatch):
    # A club ride next season: no forecast exists, so don't fabricate one.
    db = _base_db(events={85: _event_with_tour(85, starts_at=NOW + timedelta(days=200))})

    called = []

    async def fake_fetch(*a, **kw):
        called.append(a)
        return {}

    monkeypatch.setattr(ce, "fetch_window_forecast", fake_fetch)

    res = client_for(db).get("/crews/me/events/85/weather")
    assert res.status_code == 200
    assert res.json()["available"] is False
    assert called == []  # gated locally, no wasted upstream call


def test_event_weather_unavailable_for_long_past_event(client_for, monkeypatch):
    db = _base_db(events={86: _event_with_tour(86, starts_at=NOW - timedelta(days=90))})

    async def fake_fetch(*a, **kw):  # pragma: no cover — must not be reached
        raise AssertionError("should not fetch for a long-past event")

    monkeypatch.setattr(ce, "fetch_window_forecast", fake_fetch)

    res = client_for(db).get("/crews/me/events/86/weather")
    assert res.status_code == 200
    assert res.json()["available"] is False
