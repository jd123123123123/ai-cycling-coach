"""The crew feed under the routine-ride switch.

The question this file exists to answer: whose preference decides what a feed
shows? The VIEWER's, and only the viewer's. Thomas commuting twice a day must
not disappear from the feed of a crew-mate who never turned the switch on, and
turning it on must not change what Thomas himself sees.

Same mocked-db harness as tests/api/test_crew_social_api.py — a stateful fake
AsyncSession dispatching on the rendered SQL of each Select.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.dependencies import (
    get_current_active_user,
    get_current_user,
    get_db_for_user,
)
from app.main import app

VIEWER = SimpleNamespace(id=5, email="jannis@evori.ai", display_name="Jannis",
                         is_active=True)
THOMAS = SimpleNamespace(id=6, email="thomas@example.com", display_name="Thomas",
                         is_active=True)
NOW = datetime.now(timezone.utc)


def _weekday_back(n: int, hour: int, minute: int) -> datetime:
    d = NOW.replace(hour=hour, minute=minute, second=0, microsecond=0)
    stepped = 0
    while stepped < n:
        d -= timedelta(days=1)
        if d.weekday() < 5:
            stepped += 1
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def _activity(aid, uid, *, started, distance_m, duration_s=1860, title="Radfahren"):
    return SimpleNamespace(
        id=aid, user_id=uid, sport="cycling", started_at=started, title=title,
        description=None, distance_meters=distance_m, elevation_gain_m=40.0,
        duration_seconds=duration_s, tss=28.0, average_power=148.0,
        average_hr=126, calories=310,
    )


def _thomas_rides() -> list:
    """Five morning legs, five evening legs, one Saturday epic — the shape that
    started this."""
    acts = []
    for i in range(5):
        acts.append(
            _activity(100 + i, 6, started=_weekday_back(i + 1, 4, 55),
                      distance_m=13_100 + 100 * (i % 2),
                      title="Nachtradfahrt MdRzA" if i == 0 else "Steinfeld Radfahren")
        )
        acts.append(
            _activity(200 + i, 6, started=_weekday_back(i + 1, 16, 10),
                      distance_m=17_700, duration_s=2460,
                      title="Diepholz Radfahren")
        )
    acts.append(
        _activity(900, 6, started=_weekday_back(6, 9, 0), distance_m=118_400,
                  duration_s=15_240, title="Samstagsrunde Wiehengebirge")
    )
    return acts


def _int_param(stmt, prefix: str):
    try:
        params = dict(stmt.compile().params)
    except Exception:
        return None
    for k, v in params.items():
        if k.startswith(prefix) and isinstance(v, int):
            return v
    return None


class FakeDB:
    def __init__(self, *, activities, profiles=None, overrides=None):
        self.activities = list(activities)
        #: user_id → profile row
        self.profiles = profiles or {}
        self.overrides = list(overrides or [])
        self.memberships = {5: SimpleNamespace(id=1, crew_id=1, user_id=5),
                            6: SimpleNamespace(id=2, crew_id=1, user_id=6)}
        self.users = {5: VIEWER, 6: THOMAS}
        self.execute = AsyncMock(side_effect=self._execute)
        self.commit = AsyncMock()

    async def _execute(self, stmt, params=None):
        text = str(stmt)
        res = MagicMock()

        if "FROM crew_memberships" in text and "FROM activities" not in text:
            uid = _int_param(stmt, "user_id")
            res.scalar_one_or_none.return_value = self.memberships.get(uid)
            return res

        if "FROM athlete_profiles" in text:
            if "athlete_profiles.id" in text:
                uid = _int_param(stmt, "user_id")
                res.scalar_one_or_none.return_value = self.profiles.get(uid)
            else:
                res.all.return_value = [
                    (p.user_id, p.timezone) for p in self.profiles.values()
                ]
            return res

        if "FROM ride_routine_overrides" in text:
            res.all.return_value = [
                (o.activity_id, o.is_routine) for o in self.overrides
            ]
            return res

        # Two different queries read `activities` here, and they must be told
        # apart by their own column lists — `crew_records` and `ride_context`
        # read the table too, and answering them with the wrong row shape is a
        # ValueError inside the endpoint rather than a useful failure.
        acts = sorted(self.activities, key=lambda a: a.started_at, reverse=True)

        if "activities.raw_data" in text and "crew_memberships" in text:
            # The feed's own query: whole (Activity, User) pairs.
            res.all.return_value = [(a, self.users.get(a.user_id)) for a in acts]
            return res

        if "activities.duration_seconds, activities.title" in text:
            # The detector's window query: six bare columns.
            res.all.return_value = [
                (a.id, a.user_id, a.started_at, a.distance_meters,
                 a.duration_seconds, a.title)
                for a in acts
            ]
            return res

        res.scalar_one_or_none.return_value = None
        return res


def _profile(uid, hide, tz="Europe/Berlin"):
    return SimpleNamespace(id=uid, user_id=uid, timezone=tz,
                           hide_routine_rides=hide)


@pytest.fixture()
def client_for():
    def _make(db, caller=VIEWER):
        app.dependency_overrides[get_current_user] = lambda: caller
        app.dependency_overrides[get_current_active_user] = lambda: caller
        app.dependency_overrides[get_db_for_user] = lambda: db
        return TestClient(app)

    yield _make
    app.dependency_overrides.clear()


# ── default OFF: nothing changes ────────────────────────────────────────


def test_switch_off_shows_every_ride_exactly_as_before(client_for):
    db = FakeDB(activities=_thomas_rides(), profiles={5: _profile(5, False)})
    body = client_for(db).get("/crews/me/rides?limit=50").json()
    assert len(body) == 11
    assert all(r["is_routine"] is False for r in body)
    assert all(r["routine_reason"] is None for r in body)


def test_switch_off_runs_no_detector_query(client_for):
    """The default path must cost nothing: with the switch off the detector is
    never consulted, so no override lookup is issued."""
    db = FakeDB(activities=_thomas_rides(), profiles={5: _profile(5, False)})
    client_for(db).get("/crews/me/rides?limit=50")
    sql = [str(c.args[0]) for c in db.execute.await_args_list]
    assert not any("ride_routine_overrides" in s for s in sql)


def test_an_athlete_without_a_profile_row_sees_everything(client_for):
    db = FakeDB(activities=_thomas_rides(), profiles={})
    body = client_for(db).get("/crews/me/rides?limit=50").json()
    assert len(body) == 11


# ── switch ON: the commute goes quiet, the riding does not ──────────────


def test_switch_on_hides_the_commute_and_keeps_the_rest(client_for):
    db = FakeDB(activities=_thomas_rides(), profiles={5: _profile(5, True)})
    body = client_for(db).get("/crews/me/rides?limit=50").json()
    ids = {r["id"] for r in body}
    assert ids == {900}, "ten commute posts gone, the Saturday epic stays"
    assert body[0]["is_routine"] is False


def test_include_routine_marks_instead_of_dropping(client_for):
    """The "show them anyway" view: same switch, nothing removed, everything
    labelled — so a card can explain the chip instead of asserting it."""
    db = FakeDB(activities=_thomas_rides(), profiles={5: _profile(5, True)})
    body = client_for(db).get("/crews/me/rides?limit=50&include_routine=true").json()
    assert len(body) == 11
    routine = [r for r in body if r["is_routine"]]
    assert len(routine) == 10
    assert all("fast gleiche Fahrten" in r["routine_reason"] for r in routine)
    assert next(r for r in body if r["id"] == 900)["is_routine"] is False


def test_a_page_still_fills_up_when_most_rides_are_commutes(client_for):
    """Filtering after the limit would leave a page of one. The endpoint
    over-fetches when it may drop rides."""
    extra = [
        _activity(1000 + i, 6, started=NOW - timedelta(days=20 + i, hours=i),
                  distance_m=(30 + 7 * i) * 1000, duration_s=5000 + 400 * i,
                  title=f"Ausfahrt {i}")
        for i in range(6)
    ]
    db = FakeDB(activities=_thomas_rides() + extra, profiles={5: _profile(5, True)})
    body = client_for(db).get("/crews/me/rides?limit=5").json()
    assert len(body) == 5, "a full page, not the leftovers of one"
    assert all(not r["is_routine"] for r in body)


# ── whose preference wins ───────────────────────────────────────────────


def test_the_riders_own_setting_does_not_change_the_viewers_feed(client_for):
    """Thomas has the switch ON for his own feed. Jannis has it off. Jannis
    still sees Thomas's commutes — one rider's setting must never reach into
    another rider's feed."""
    db = FakeDB(
        activities=_thomas_rides(),
        profiles={5: _profile(5, False), 6: _profile(6, True)},
    )
    body = client_for(db, caller=VIEWER).get("/crews/me/rides?limit=50").json()
    assert len(body) == 11


def test_the_viewers_setting_hides_their_own_commutes_too(client_for):
    """Symmetry, and it is deliberate: the switch says "keep routine rides out
    of MY feed", and a rider's own commute is as unremarkable to them as
    anybody else's."""
    db = FakeDB(activities=_thomas_rides(), profiles={6: _profile(6, True)})
    body = client_for(db, caller=THOMAS).get("/crews/me/rides?limit=50").json()
    assert {r["id"] for r in body} == {900}


# ── the rider's own word survives into the feed ─────────────────────────


def test_an_override_keeps_one_commute_in_a_filtered_feed(client_for):
    db = FakeDB(
        activities=_thomas_rides(),
        profiles={5: _profile(5, True)},
        overrides=[SimpleNamespace(activity_id=100, is_routine=False)],
    )
    body = client_for(db).get("/crews/me/rides?limit=50").json()
    ids = {r["id"] for r in body}
    assert ids == {100, 900}
    kept = next(r for r in body if r["id"] == 100)
    assert kept["is_routine"] is False
    assert kept["routine_reason"] == "Von dir als sehenswert markiert."


def test_an_override_hides_a_ride_the_detector_would_have_kept(client_for):
    db = FakeDB(
        activities=_thomas_rides(),
        profiles={5: _profile(5, True)},
        overrides=[SimpleNamespace(activity_id=900, is_routine=True)],
    )
    body = client_for(db).get("/crews/me/rides?limit=50").json()
    assert body == []


# ── hiding is not deleting ──────────────────────────────────────────────


def test_a_hidden_ride_keeps_its_training_facts(client_for):
    """The proof that "hidden" is a feed word: ask for the same rides with
    include_routine and every number the athlete earned is still on them."""
    db = FakeDB(activities=_thomas_rides(), profiles={5: _profile(5, True)})
    body = client_for(db).get("/crews/me/rides?limit=50&include_routine=true").json()
    commute = next(r for r in body if r["id"] == 100)
    assert commute["is_routine"] is True
    assert commute["tss"] == 28
    assert commute["distance_m"] == 13_100
    assert commute["duration_seconds"] == 1860
    assert commute["avg_power_w"] == 148
