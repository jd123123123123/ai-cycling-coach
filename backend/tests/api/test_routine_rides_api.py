"""The routine-ride endpoints: the switch, the preview that justifies it, and
the rider's per-ride override.

Mirrors the mocked-db dependency-override harness used in
tests/api/test_crew_social_api.py — there is no real-Postgres fixture in this
repo, so a small stateful fake AsyncSession dispatches on the rendered SQL.

The router is mounted on a local FastAPI app rather than `app.main.app`:
registering routers is the orchestrator's file, and a test that depended on
that registration would fail for a reason that has nothing to do with this
code.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routine_rides import router as routine_router
from app.dependencies import (
    get_current_active_user,
    get_current_user,
    get_db_for_user,
)
from app.models.routine_override import RideRoutineOverride

CALLER = SimpleNamespace(id=5, email="thomas@example.com", display_name="Thomas",
                         is_active=True)
NOW = datetime.now(timezone.utc)


def _utc_days_ago(days: float, hour: int, minute: int) -> datetime:
    d = (NOW - timedelta(days=days)).replace(
        hour=hour, minute=minute, second=0, microsecond=0
    )
    return d


def _weekday_days_ago(n: int, hour: int, minute: int) -> datetime:
    """A start time n*7/5-ish days back that lands on a weekday, so the fixture
    does not silently become a weekend cluster on some future run date."""
    d = NOW.replace(hour=hour, minute=minute, second=0, microsecond=0)
    stepped = 0
    while stepped < n:
        d -= timedelta(days=1)
        if d.weekday() < 5:
            stepped += 1
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def _activity(aid, *, uid=5, started, distance_m, duration_s=1860, title="Radfahren",
              sport="cycling"):
    return SimpleNamespace(
        id=aid, user_id=uid, started_at=started, distance_meters=distance_m,
        duration_seconds=duration_s, title=title, sport=sport,
    )


#: Five morning legs and five evening legs on weekdays — the production shape.
def _commuter_activities() -> list:
    acts = []
    for i in range(5):
        acts.append(
            _activity(
                100 + i,
                started=_weekday_days_ago(i + 1, 4, 55),
                distance_m=13_100 + 100 * (i % 2),
                title="Nachtradfahrt MdRzA" if i == 0 else "Steinfeld Radfahren",
            )
        )
        acts.append(
            _activity(
                200 + i,
                started=_weekday_days_ago(i + 1, 16, 10),
                distance_m=17_700,
                duration_s=2460,
                title="Diepholz Radfahren",
            )
        )
    # One ride that must survive.
    acts.append(
        _activity(
            900,
            started=_weekday_days_ago(6, 9, 0),
            distance_m=118_400,
            duration_s=15_240,
            title="Samstagsrunde Wiehengebirge",
        )
    )
    return acts


class FakeDB:
    """A minimal stateful async session for the routine endpoints."""

    def __init__(self, *, activities=None, profile=None, overrides=None):
        self.activities = list(activities or [])
        self.profile = profile
        self.overrides = list(overrides or [])
        self.committed = 0
        self.execute = AsyncMock(side_effect=self._execute)
        self.commit = AsyncMock(side_effect=self._commit)
        self.delete = AsyncMock(side_effect=self._delete)

    async def _commit(self):
        self.committed += 1

    def add(self, obj):
        if isinstance(obj, RideRoutineOverride):
            obj.id = len(self.overrides) + 1
            self.overrides.append(obj)

    async def _delete(self, obj):
        if obj in self.overrides:
            self.overrides.remove(obj)

    async def _execute(self, stmt, params=None):
        text = str(stmt)
        res = MagicMock()

        if "FROM athlete_profiles" in text:
            if "athlete_profiles.id" in text:      # entity select
                res.scalar_one_or_none.return_value = self.profile
            else:                                   # (user_id, timezone) select
                res.all.return_value = (
                    [(self.profile.user_id, self.profile.timezone)]
                    if self.profile is not None
                    else []
                )
            return res

        if "FROM ride_routine_overrides" in text:
            if "ride_routine_overrides.id" in text:  # entity select
                aid = _int_param(stmt, "activity_id")
                res.scalar_one_or_none.return_value = next(
                    (o for o in self.overrides if o.activity_id == aid), None
                )
            else:
                res.all.return_value = [
                    (o.activity_id, o.is_routine) for o in self.overrides
                ]
            return res

        if "FROM activities" in text:
            if "activities.id = " in text:
                aid = _int_param(stmt, "id_1") or _int_param(stmt, "id")
                uid = _int_param(stmt, "user_id")
                match = next(
                    (
                        a for a in self.activities
                        if a.id == aid and (uid is None or a.user_id == uid)
                    ),
                    None,
                )
                res.scalars.return_value.first.return_value = match
                return res
            res.all.return_value = [
                (a.id, a.user_id, a.started_at, a.distance_meters,
                 a.duration_seconds, a.title)
                for a in sorted(self.activities, key=lambda a: a.started_at,
                                reverse=True)
            ]
            return res

        res.scalar_one_or_none.return_value = None
        return res


def _int_param(stmt, prefix: str):
    try:
        params = dict(stmt.compile().params)
    except Exception:
        return None
    for k, v in params.items():
        if k.startswith(prefix) and isinstance(v, int):
            return v
    return None


def _profile(hide=False, tz="Europe/Berlin"):
    return SimpleNamespace(id=1, user_id=5, timezone=tz, hide_routine_rides=hide)


@pytest.fixture()
def client_for():
    made = []

    def _make(db, caller=CALLER):
        api = FastAPI()
        api.include_router(routine_router)
        api.dependency_overrides[get_current_user] = lambda: caller
        api.dependency_overrides[get_current_active_user] = lambda: caller
        api.dependency_overrides[get_db_for_user] = lambda: db
        made.append(api)
        return TestClient(api)

    yield _make
    for api in made:
        api.dependency_overrides.clear()


# ── the switch ──────────────────────────────────────────────────────────


def test_preference_defaults_to_off(client_for):
    db = FakeDB(profile=_profile(hide=False))
    res = client_for(db).get("/rides/routine/preference")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["hide_routine_rides"] is False
    assert body["window_days"] == 60
    assert body["min_occurrences"] == 3


def test_preference_is_off_for_an_athlete_without_a_profile(client_for):
    """A new feature must not silently change what somebody already sees, and a
    missing profile row is not a licence to guess ON."""
    db = FakeDB(profile=None)
    res = client_for(db).get("/rides/routine/preference")
    assert res.json()["hide_routine_rides"] is False


def test_preference_can_be_switched_on_and_off(client_for):
    prof = _profile(hide=False)
    db = FakeDB(profile=prof)
    client = client_for(db)

    res = client.put("/rides/routine/preference", json={"hide_routine_rides": True})
    assert res.status_code == 200
    assert res.json()["hide_routine_rides"] is True
    assert prof.hide_routine_rides is True
    assert db.committed == 1

    client.put("/rides/routine/preference", json={"hide_routine_rides": False})
    assert prof.hide_routine_rides is False


def test_setting_the_preference_without_a_profile_is_404_not_a_silent_noop(client_for):
    db = FakeDB(profile=None)
    res = client_for(db).put(
        "/rides/routine/preference", json={"hide_routine_rides": True}
    )
    assert res.status_code == 404


# ── the preview ─────────────────────────────────────────────────────────


def test_preview_shows_what_would_be_hidden(client_for):
    db = FakeDB(activities=_commuter_activities(), profile=_profile(hide=False))
    res = client_for(db).get("/rides/routine/preview")
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["enabled"] is False, "the preview works before the switch is on"
    assert body["hidden_count"] == 10
    assert body["considered"] == 11
    assert body["window_days"] == 60
    assert body["median_distance_km"] is not None

    hidden_ids = {s["activity_id"] for s in body["sample"]}
    assert 900 not in hidden_ids, "the 118 km Saturday is not routine"
    assert len(hidden_ids) == 10

    routine_clusters = [c for c in body["clusters"] if c["is_routine"]]
    assert len(routine_clusters) == 2
    assert sorted(c["occurrences"] for c in routine_clusters) == [5, 5]
    assert all(":" in c["start_local"] for c in routine_clusters)
    assert all(c["reason"] for c in routine_clusters)


def test_preview_is_empty_for_a_rider_with_no_pattern(client_for):
    acts = [
        _activity(300 + i, started=_utc_days_ago(3 * i + 1, 9 + i, 0),
                  distance_m=(25 + 13 * i) * 1000, duration_s=4000 + 900 * i)
        for i in range(6)
    ]
    db = FakeDB(activities=acts, profile=_profile())
    body = client_for(db).get("/rides/routine/preview").json()
    assert body["hidden_count"] == 0
    assert body["sample"] == []


def test_preview_sample_is_capped(client_for):
    db = FakeDB(activities=_commuter_activities(), profile=_profile())
    body = client_for(db).get("/rides/routine/preview?sample_limit=3").json()
    assert body["hidden_count"] == 10
    assert len(body["sample"]) == 3


# ── one ride, and the rider's own word ──────────────────────────────────


def test_ride_verdict_explains_itself_in_german(client_for):
    db = FakeDB(activities=_commuter_activities(), profile=_profile())
    body = client_for(db).get("/rides/routine/100").json()
    assert body["is_routine"] is True
    assert body["occurrences"] == 5
    assert body["decided_by"] == "detector"
    assert "fast gleiche Fahrten" in body["reason"]


def test_override_keeps_a_ride_the_detector_would_hide(client_for):
    db = FakeDB(activities=_commuter_activities(), profile=_profile())
    client = client_for(db)

    assert client.get("/rides/routine/100").json()["is_routine"] is True

    res = client.put("/rides/routine/100/override", json={"is_routine": False})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["is_routine"] is False
    assert body["decided_by"] == "rider"
    assert body["reason"] == "Von dir als sehenswert markiert."
    # …and it stays that way on the next read.
    assert client.get("/rides/routine/100").json()["is_routine"] is False


def test_override_hides_a_ride_the_detector_would_keep(client_for):
    db = FakeDB(activities=_commuter_activities(), profile=_profile())
    client = client_for(db)

    assert client.get("/rides/routine/900").json()["is_routine"] is False

    body = client.put("/rides/routine/900/override", json={"is_routine": True}).json()
    assert body["is_routine"] is True
    assert body["decided_by"] == "rider"
    assert client.get("/rides/routine/900").json()["is_routine"] is True


def test_override_can_be_cleared(client_for):
    db = FakeDB(activities=_commuter_activities(), profile=_profile())
    client = client_for(db)
    client.put("/rides/routine/100/override", json={"is_routine": False})
    assert len(db.overrides) == 1

    body = client.put("/rides/routine/100/override", json={"is_routine": None}).json()
    assert db.overrides == []
    assert body["is_routine"] is True, "the detector has the ride back"
    assert body["decided_by"] == "detector"


def test_only_the_rider_who_did_it_may_rule_on_it(client_for):
    """Someone else's ride is a 404, not a 403 — the caller has no business
    knowing it exists."""
    acts = _commuter_activities()
    acts.append(_activity(777, uid=6, started=NOW - timedelta(days=1),
                          distance_m=40_000))
    db = FakeDB(activities=acts, profile=_profile())
    client = client_for(db)
    assert client.get("/rides/routine/777").status_code == 404
    assert client.put(
        "/rides/routine/777/override", json={"is_routine": True}
    ).status_code == 404
    assert db.overrides == []


def test_override_on_an_unknown_ride_is_404(client_for):
    db = FakeDB(activities=_commuter_activities(), profile=_profile())
    assert client_for(db).put(
        "/rides/routine/4242/override", json={"is_routine": True}
    ).status_code == 404
