"""Crew-social API — chat send/list, reaction toggle on/off + counts, crew-week
cheer, and the all-crew rides feed, plus auth + crew-scoping guards.

Mirrors the mocked-db dependency-override harness used in
tests/api/test_crew_events_api.py: there is no real-Postgres fixture in this
repo, so a small stateful fake AsyncSession dispatches on the rendered SQL of
each Select and tracks added rows in Python lists.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.crew_chat import CYCLING_SPORTS
from app.dependencies import (
    get_current_active_user,
    get_current_user,
    get_db_for_user,
)
from app.main import app
from app.models.crew_social import CrewMessage, CrewReaction

CALLER = SimpleNamespace(id=5, email="jannis@evori.ai", display_name=None, is_active=True)
NOW = datetime.now(timezone.utc)


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


def _str_param(stmt, prefix: str):
    for k, v in _params(stmt).items():
        if k.startswith(prefix) and isinstance(v, str):
            return v
    return None


def _user(uid: int, email: str, display_name: str | None = None):
    return SimpleNamespace(id=uid, email=email, display_name=display_name, is_active=True)


def _membership(user_id=5, crew_id=1):
    return SimpleNamespace(id=1, crew_id=crew_id, user_id=user_id, role="member")


def _activity(aid, uid, *, sport="cycling", started=None, title="Ride",
              distance=30000.0, elev=400.0, dur=3600):
    return SimpleNamespace(
        id=aid, user_id=uid, sport=sport,
        started_at=started or NOW, title=title,
        distance_meters=distance, elevation_gain_m=elev, duration_seconds=dur,
    )


class FakeDB:
    """A minimal stateful async session for the crew-social endpoints."""

    def __init__(
        self,
        *,
        memberships=None,
        users=None,
        messages=None,
        reactions=None,
        activities=None,
    ):
        self.memberships = memberships or {}
        self.users = users or {}
        self.messages = list(messages or [])
        self.reactions = list(reactions or [])
        self.activities = list(activities or [])
        self._next_msg_id = max((m.id for m in self.messages), default=0) + 1
        self._next_reaction_id = max((r.id for r in self.reactions), default=0) + 1

        self.execute = AsyncMock(side_effect=self._execute)
        self.commit = AsyncMock()
        self.delete = AsyncMock(side_effect=self._delete)

    # ---- session surface -------------------------------------------------
    def add(self, obj):
        if isinstance(obj, CrewMessage):
            if obj.id is None:
                obj.id = self._next_msg_id
                self._next_msg_id += 1
            if obj.created_at is None:
                obj.created_at = NOW
            self.messages.append(obj)
        elif isinstance(obj, CrewReaction):
            if obj.id is None:
                obj.id = self._next_reaction_id
                self._next_reaction_id += 1
            if obj.created_at is None:
                obj.created_at = NOW
            self.reactions.append(obj)

    async def flush(self):
        return None

    async def refresh(self, obj):
        return None

    async def _delete(self, obj):
        if isinstance(obj, CrewReaction) and obj in self.reactions:
            self.reactions.remove(obj)

    def _crew_member_ids(self, crew_id):
        return [m.user_id for m in self.memberships.values() if m.crew_id == crew_id]

    # ---- query dispatcher ------------------------------------------------
    async def _execute(self, stmt):
        text = str(stmt)
        res = MagicMock()

        if "FROM crew_memberships" in text:
            uid = _int_param(stmt, "user_id")
            res.scalar_one_or_none.return_value = self.memberships.get(uid)
            return res

        if "FROM crew_messages" in text:
            crew_id = _int_param(stmt, "crew_id")
            before_id = _int_param(stmt, "id")
            msgs = [m for m in self.messages if m.crew_id == crew_id]
            if before_id is not None:
                msgs = [m for m in msgs if m.id < before_id]
            msgs.sort(key=lambda m: m.id, reverse=True)
            rows = [(m, self.users.get(m.user_id)) for m in msgs]
            res.all.return_value = rows
            return res

        if "FROM crew_reactions" in text:
            crew_id = _int_param(stmt, "crew_id")
            target_type = _str_param(stmt, "target_type")
            rows = [
                r for r in self.reactions
                if r.crew_id == crew_id and r.target_type == target_type
            ]
            # Toggle lookup: constrained by user_id + emoji → single match.
            emoji = _str_param(stmt, "emoji")
            if emoji is not None:
                uid = _int_param(stmt, "user_id")
                # target_id may be int or NULL; match on both interpretations.
                tid = _int_param(stmt, "target_id")
                match = next(
                    (
                        r for r in rows
                        if r.user_id == uid and r.emoji == emoji
                        and r.target_id == tid
                    ),
                    None,
                )
                res.scalar_one_or_none.return_value = match
                return res
            res.scalars.return_value.all.return_value = rows
            return res

        if "FROM activities" in text:
            crew_id = _int_param(stmt, "crew_id")
            member_ids = set(self._crew_member_ids(crew_id))
            acts = [
                a for a in self.activities
                if a.user_id in member_ids and a.sport.lower() in CYCLING_SPORTS
            ]
            acts.sort(key=lambda a: a.started_at, reverse=True)
            rows = [(a, self.users.get(a.user_id)) for a in acts]
            res.all.return_value = rows
            return res

        res.scalar_one_or_none.return_value = None  # pragma: no cover
        return res


@pytest.fixture()
def client_for():
    def _make(db, caller=CALLER):
        app.dependency_overrides[get_current_user] = lambda: caller
        app.dependency_overrides[get_current_active_user] = lambda: caller
        app.dependency_overrides[get_db_for_user] = lambda: db
        return TestClient(app)

    yield _make
    app.dependency_overrides.clear()


def _base_db(**kw) -> FakeDB:
    return FakeDB(
        memberships={5: _membership(5, 1), 6: _membership(6, 1)},
        users={
            5: _user(5, "jannis@evori.ai", "Jannis"),
            6: _user(6, "luca@gmail.com"),
        },
        **kw,
    )


# ── chat ────────────────────────────────────────────────────────────────


def test_send_chat_returns_201_with_handle(client_for):
    db = _base_db()
    res = client_for(db).post("/crews/me/chat", json={"text": "  Ready for the col?  "})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["text"] == "Ready for the col?"  # trimmed
    assert body["user_id"] == 5
    assert body["crew_id"] == 1
    assert body["handle"] == "Jannis"
    assert body["reactions"] == {"counts": {}, "mine": []}
    assert len(db.messages) == 1


def test_send_chat_requires_crew(client_for):
    db = FakeDB(memberships={})
    res = client_for(db).post("/crews/me/chat", json={"text": "hi"})
    assert res.status_code == 403


def test_send_chat_rejects_empty_and_too_long(client_for):
    db = _base_db()
    assert client_for(db).post("/crews/me/chat", json={"text": ""}).status_code == 422
    assert client_for(db).post(
        "/crews/me/chat", json={"text": "x" * 2001}
    ).status_code == 422


def test_list_chat_newest_last_with_reactions(client_for):
    m1 = CrewMessage(crew_id=1, user_id=5, text="first"); m1.id = 1; m1.created_at = NOW
    m2 = CrewMessage(crew_id=1, user_id=6, text="second"); m2.id = 2; m2.created_at = NOW
    react = CrewReaction(
        crew_id=1, user_id=5, target_type="message", target_id=2, emoji="🔥"
    ); react.id = 1; react.created_at = NOW
    db = _base_db(messages=[m2, m1], reactions=[react])
    res = client_for(db).get("/crews/me/chat")
    assert res.status_code == 200
    body = res.json()
    assert [m["id"] for m in body] == [1, 2]  # ascending → newest last
    assert body[0]["reactions"] == {"counts": {}, "mine": []}
    assert body[1]["reactions"] == {"counts": {"🔥": 1}, "mine": ["🔥"]}
    assert body[1]["handle"] == "Luca"  # email-derived (title-cased) when no display_name


def test_list_chat_empty_when_no_crew(client_for):
    db = FakeDB(memberships={})
    res = client_for(db).get("/crews/me/chat")
    assert res.status_code == 200
    assert res.json() == []


# ── reactions ─────────────────────────────────────────────────────────────


def test_reaction_toggle_on_then_off(client_for):
    db = _base_db()
    on = client_for(db).post(
        "/crews/me/reactions/toggle",
        json={"target_type": "message", "target_id": 7, "emoji": "💪"},
    )
    assert on.status_code == 200, on.text
    b = on.json()
    assert b["toggled_on"] is True
    assert b["counts"] == {"💪": 1}
    assert b["mine"] == ["💪"]
    assert len(db.reactions) == 1

    off = client_for(db).post(
        "/crews/me/reactions/toggle",
        json={"target_type": "message", "target_id": 7, "emoji": "💪"},
    )
    assert off.status_code == 200
    b2 = off.json()
    assert b2["toggled_on"] is False
    assert b2["counts"] == {}
    assert b2["mine"] == []
    assert len(db.reactions) == 0


def test_reaction_counts_sum_across_members(client_for):
    other = CrewReaction(
        crew_id=1, user_id=6, target_type="ride", target_id=99, emoji="🚀"
    ); other.id = 1; other.created_at = NOW
    db = _base_db(reactions=[other])
    res = client_for(db).post(
        "/crews/me/reactions/toggle",
        json={"target_type": "ride", "target_id": 99, "emoji": "🚀"},
    )
    b = res.json()
    assert b["counts"] == {"🚀": 2}   # caller + crew-mate
    assert b["mine"] == ["🚀"]        # only the caller's own


def test_reaction_rejects_bad_emoji_and_target(client_for):
    db = _base_db()
    bad_emoji = client_for(db).post(
        "/crews/me/reactions/toggle",
        json={"target_type": "message", "target_id": 1, "emoji": "😈"},
    )
    assert bad_emoji.status_code == 422
    bad_target = client_for(db).post(
        "/crews/me/reactions/toggle",
        json={"target_type": "banana", "target_id": 1, "emoji": "🔥"},
    )
    assert bad_target.status_code == 422


def test_reaction_toggle_requires_crew(client_for):
    db = FakeDB(memberships={})
    res = client_for(db).post(
        "/crews/me/reactions/toggle",
        json={"target_type": "crew_week", "emoji": "🙌"},
    )
    assert res.status_code == 403


def test_crew_week_cheer_toggle_and_get(client_for):
    db = _base_db()
    # crew_week ignores any target_id and stores NULL.
    toggled = client_for(db).post(
        "/crews/me/reactions/toggle",
        json={"target_type": "crew_week", "target_id": 12345, "emoji": "🙌"},
    )
    assert toggled.status_code == 200
    tb = toggled.json()
    assert tb["target_id"] is None
    assert tb["counts"] == {"🙌": 1}
    assert db.reactions[0].target_id is None

    got = client_for(db).get("/crews/me/reactions", params={"target_type": "crew_week"})
    assert got.status_code == 200
    gb = got.json()
    assert gb["target_type"] == "crew_week"
    assert gb["target_id"] is None
    assert gb["counts"] == {"🙌": 1}
    assert gb["mine"] == ["🙌"]


def test_get_reactions_for_event(client_for):
    r = CrewReaction(
        crew_id=1, user_id=6, target_type="event", target_id=3, emoji="👏"
    ); r.id = 1; r.created_at = NOW
    db = _base_db(reactions=[r])
    res = client_for(db).get(
        "/crews/me/reactions", params={"target_type": "event", "target_id": 3}
    )
    assert res.status_code == 200
    b = res.json()
    assert b["counts"] == {"👏": 1}
    assert b["mine"] == []  # the reaction belongs to member 6, not the caller


# ── rides feed ─────────────────────────────────────────────────────────────


def test_rides_feed_all_members_newest_first_with_reactions(client_for):
    acts = [
        _activity(100, 5, started=NOW - timedelta(hours=2), title="Morning spin"),
        _activity(101, 6, started=NOW - timedelta(hours=1), title="Luca's climb"),
        _activity(102, 5, sport="running", started=NOW, title="Run (excluded)"),
    ]
    react = CrewReaction(
        crew_id=1, user_id=5, target_type="ride", target_id=101, emoji="⚡"
    ); react.id = 1; react.created_at = NOW
    db = _base_db(activities=acts, reactions=[react])
    res = client_for(db).get("/crews/me/rides")
    assert res.status_code == 200, res.text
    body = res.json()
    # Running activity excluded; newest cycling first.
    assert [r["id"] for r in body] == [101, 100]
    luca_ride = body[0]
    assert luca_ride["user_id"] == 6
    assert luca_ride["handle"] == "Luca"
    assert luca_ride["distance_m"] == 30000.0
    assert luca_ride["elevation_gain_m"] == 400.0
    assert luca_ride["duration_seconds"] == 3600
    assert luca_ride["reactions"] == {"counts": {"⚡": 1}, "mine": ["⚡"]}
    assert body[1]["reactions"] == {"counts": {}, "mine": []}


def test_rides_feed_excludes_non_members(client_for):
    # user 7 is NOT in the crew → their ride must not appear.
    acts = [
        _activity(200, 5, title="Mine"),
        _activity(201, 7, title="Stranger's ride"),
    ]
    db = _base_db(activities=acts)
    res = client_for(db).get("/crews/me/rides")
    assert res.status_code == 200
    assert [r["id"] for r in res.json()] == [200]


def test_rides_feed_empty_when_no_crew(client_for):
    db = FakeDB(memberships={})
    res = client_for(db).get("/crews/me/rides")
    assert res.status_code == 200
    assert res.json() == []
