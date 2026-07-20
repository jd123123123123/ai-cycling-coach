"""P1-10 — crew API behavior: opt-in competition, honest payloads.

  * GET  /crews/discover        — test/seed accounts never appear
  * GET  /crews/me              — one unambiguous crew object with member_count
  * POST /crews/invites/{id}/accept-mine — joining is NOT auto-entry into
    pre-existing challenges; `{"join_challenges": true}` is the explicit opt-in
  * POST /crews/challenges      — omitted target defaults to the creator's OWN
    scaled bar (never 800 TSS / 7 days); non-derivable metrics still 422
  * GET  /crews/me/duel         — serves weekly_target_tss / active_days_target
    / last_week_at_now through the response model

Mirrors the mocked-`db.execute`-dependency-override harness used by the other
tests/api modules (no real-Postgres fixture in this repo).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.dependencies import (
    get_current_active_user,
    get_current_user,
    get_db_for_user,
)
from app.main import app
from app.models.crew import CrewMembership
from app.services.crew_score import CHALLENGE_OPT_IN_ROLE
from tests.api.test_crew_targets import _user, make_db

CALLER = SimpleNamespace(id=5, email="jannis@evori.ai", is_active=True)
NOW = datetime.now(timezone.utc)


@pytest.fixture()
def client_for():
    """Yield a factory: pass a fake db, get a TestClient with overrides."""
    made = []

    def _make(db):
        app.dependency_overrides[get_current_user] = lambda: CALLER
        app.dependency_overrides[get_current_active_user] = lambda: CALLER
        app.dependency_overrides[get_db_for_user] = lambda: db
        c = TestClient(app)
        made.append(c)
        return c

    yield _make
    app.dependency_overrides.clear()


# ── discover: no scaffolding accounts ────────────────────────────────────


def test_discover_filters_test_and_seed_accounts(client_for):
    db = make_db(
        users={
            2: _user(2, "alice@gmail.com"),
            3: _user(3, "test@test.com"),        # regex-filtered
            4: _user(4, "test01@example.com"),   # example.com-filtered
            6: _user(6, "userb@example.com"),    # both
            7: _user(7, "user01@fastmail.com"),  # regex-filtered
            8: _user(8, "lena@posteo.de"),
        },
    )
    res = client_for(db).get("/crews/discover")
    assert res.status_code == 200
    ids = {m["user_id"] for m in res.json()}
    assert ids == {2, 8}


# ── /crews/me: one crew object with member_count ─────────────────────────


def test_my_crew_payload_carries_member_count(client_for):
    crew = SimpleNamespace(id=1, name="Maratona Squad", owner_user_id=5)
    m5 = SimpleNamespace(user_id=5, role="owner", joined_at=NOW - timedelta(days=30))
    m6 = SimpleNamespace(user_id=6, role="member", joined_at=NOW - timedelta(days=10))
    db = make_db(
        memberships={5: SimpleNamespace(crew_id=1, user_id=5)},
        crew=crew,
        member_rows=[(m5, _user(5, "jannis@evori.ai")), (m6, _user(6, "luca@gmail.com"))],
    )
    res = client_for(db).get("/crews/me")
    assert res.status_code == 200
    body = res.json()
    assert body["crew"]["member_count"] == 2
    assert len(body["members"]) == 2


def test_my_crew_null_when_none(client_for):
    db = make_db(memberships={})
    body = client_for(db).get("/crews/me").json()
    assert body["crew"] is None
    assert body["members"] == []


# ── accept: challenges are opt-in, never auto-entry ──────────────────────


def _accept_db():
    invite = SimpleNamespace(
        id=9, crew_id=1, inviter_user_id=7, invitee_email="jannis@evori.ai",
        token="tok", status="pending", created_at=NOW,
        expires_at=NOW + timedelta(days=7), accepted_at=None,
    )
    crew = SimpleNamespace(id=1, name="Maratona Squad", owner_user_id=7)
    m7 = SimpleNamespace(user_id=7, role="owner", joined_at=NOW - timedelta(days=30))
    return make_db(
        invite=invite,
        crew=crew,
        member_rows=[(m7, _user(7, "luca@gmail.com"))],
    )


def _added_membership(db) -> CrewMembership:
    ms = [a.args[0] for a in db.add.call_args_list if isinstance(a.args[0], CrewMembership)]
    assert len(ms) == 1
    return ms[0]


def test_accept_defaults_to_plain_member_no_challenge_entry(client_for):
    db = _accept_db()
    res = client_for(db).post("/crews/invites/9/accept-mine")
    assert res.status_code == 200
    assert _added_membership(db).role == "member"


def test_accept_with_explicit_opt_in_joins_challenges(client_for):
    db = _accept_db()
    res = client_for(db).post(
        "/crews/invites/9/accept-mine", json={"join_challenges": True}
    )
    assert res.status_code == 200
    assert _added_membership(db).role == CHALLENGE_OPT_IN_ROLE


# ── challenge creation: defaults scale to the creator ────────────────────


def _challenge_db(activities=None):
    m5 = SimpleNamespace(user_id=5, role="owner", joined_at=NOW - timedelta(days=30))
    db = make_db(
        users={5: _user(5, "jannis@evori.ai")},
        memberships={5: SimpleNamespace(crew_id=1, user_id=5)},
        member_rows=[(m5, _user(5, "jannis@evori.ai"))],
        activities=activities or {5: []},
    )

    async def refresh(obj):  # give the un-flushed row its server defaults
        obj.id = 1
        obj.created_at = NOW
        obj.archived = False

    db.refresh.side_effect = refresh
    return db


def test_challenge_default_tss_target_is_floor_not_800(client_for):
    db = _challenge_db()
    res = client_for(db).post(
        "/crews/challenges", json={"name": "Wochen-Last", "metric": "tss"}
    )
    assert res.status_code == 201
    assert res.json()["target"] == 60.0        # no history → floor, never 800


def test_challenge_default_active_days_never_seven(client_for):
    db = _challenge_db()
    res = client_for(db).post(
        "/crews/challenges", json={"name": "Aktive Tage", "metric": "active_days"}
    )
    assert res.status_code == 201
    assert res.json()["target"] == 3.0         # 3-4 default, never 7


def test_challenge_other_metrics_still_require_target(client_for):
    db = _challenge_db()
    res = client_for(db).post(
        "/crews/challenges", json={"name": "Stundenziel", "metric": "hours"}
    )
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "missing_target"


def test_challenge_explicit_target_kept(client_for):
    db = _challenge_db()
    res = client_for(db).post(
        "/crews/challenges", json={"name": "Wochen-Last", "metric": "tss", "target": 300},
    )
    assert res.status_code == 201
    assert res.json()["target"] == 300.0


# ── duel endpoint: personal bars through the response model ──────────────


def test_duel_response_carries_targets_and_pace(client_for):
    db = make_db(users={5: _user(5, "jannis@evori.ai")}, activities={5: []})
    res = client_for(db).get("/crews/me/duel")
    assert res.status_code == 200
    body = res.json()
    assert body["weekly_target_tss"] == 60
    assert body["active_days_target"] == 3
    assert body["last_week_at_now"] == 0
    assert body["you_this_week"]["weekly_target_tss"] == 60
