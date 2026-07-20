"""P1-10 — competition scaled to the athlete (service math).

Covers app/services/crew_score.py:
  * personal_week_targets — own 4-week avg × 1.05 (floor 60), active-days
    target clamped 3..6 (never 7)
  * tss_at_same_point_last_week — honest early-week pace basis
  * member_in_challenge — no auto-entry into pre-existing challenges
  * crew_standings_window — points = share of each rider's OWN weekly target
  * crew_duel — exposes the personal bars + last_week_at_now

Uses the mocked-`db.execute` harness (no real Postgres in this repo's tests):
the dispatcher routes on the rendered SQL text + bound params, and the
service code performs its own local-day filtering, so returning the full
activity list for every activities query is faithful.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.services.crew_score import (
    CHALLENGE_OPT_IN_ROLE,
    crew_duel,
    crew_standings_window,
    member_in_challenge,
    personal_week_targets,
    tss_at_same_point_last_week,
)

WEEK_START = date(2026, 7, 20)  # a Monday


def act(iso: str, tss: float, distance_km: float = 0.0):
    return SimpleNamespace(
        started_at=datetime.fromisoformat(iso).replace(tzinfo=timezone.utc),
        tss=tss,
        distance_meters=distance_km * 1000.0,
        duration_seconds=3600,
        average_power=None,
        normalized_power=None,
        calories=None,
    )


def _params(stmt) -> dict:
    try:
        return dict(stmt.compile().params)
    except Exception:
        return {}


def _first_int_param(stmt, prefix: str):
    for k, v in _params(stmt).items():
        if k.startswith(prefix) and isinstance(v, int):
            return v
    return None


def make_db(
    *,
    users: dict[int, object] | None = None,
    profiles: dict[int, object] | None = None,
    activities: dict[int, list] | None = None,
    memberships: dict[int, object] | None = None,
    member_ids: list[int] | None = None,
    member_rows: list[tuple] | None = None,
    crew: object | None = None,
    invite: object | None = None,
):
    """A db.execute dispatcher keyed on the rendered SQL of each Select."""
    users = users or {}
    profiles = profiles or {}
    activities = activities or {}
    memberships = memberships or {}
    member_ids = member_ids or []
    member_rows = member_rows or []

    db = MagicMock()

    async def execute(stmt):  # noqa: ANN001 — SQLAlchemy Select
        text = str(stmt)
        res = MagicMock()
        if "JOIN users" in text and "crew_memberships" in text:
            res.all.return_value = list(member_rows)
        elif "FROM crew_memberships" in text and "crew_memberships.id" not in text:
            res.all.return_value = [(uid,) for uid in member_ids]
        elif "FROM crew_memberships" in text:
            uid = _first_int_param(stmt, "user_id")
            res.scalar_one_or_none.return_value = memberships.get(uid)
        elif "FROM activities" in text:
            uid = _first_int_param(stmt, "user_id")
            res.scalars.return_value.all.return_value = list(activities.get(uid, []))
        elif "FROM athlete_profiles" in text:
            uid = _first_int_param(stmt, "user_id")
            res.scalar_one_or_none.return_value = profiles.get(uid)
        elif "FROM daily_metrics" in text:
            res.all.return_value = []
        elif "FROM crew_invites" in text:
            res.scalar_one_or_none.return_value = invite
            res.scalars.return_value.all.return_value = []
        elif "FROM crews" in text:
            res.scalar_one_or_none.return_value = crew
        elif "FROM users" in text:
            uid = _first_int_param(stmt, "id")
            res.scalar_one_or_none.return_value = users.get(uid)
            res.scalars.return_value.all.return_value = list(users.values())
        elif "count" in text.lower():
            res.scalar_one.return_value = 0
        else:  # pragma: no cover
            res.scalar_one_or_none.return_value = None
        return res

    db.execute = AsyncMock(side_effect=execute)
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


def _user(uid: int, email: str):
    return SimpleNamespace(id=uid, email=email, display_name=None, is_active=True)


# ── personal_week_targets ────────────────────────────────────────────────


async def test_weekly_target_is_own_history_times_105():
    # 4 weeks before 2026-07-20, two 200-TSS rides per week → avg 400/wk.
    acts = []
    for monday in ("2026-06-22", "2026-06-29", "2026-07-06", "2026-07-13"):
        m = date.fromisoformat(monday)
        acts.append(act(f"{m + timedelta(days=1)}T09:00:00", 200))
        acts.append(act(f"{m + timedelta(days=3)}T09:00:00", 200))
    db = make_db(activities={5: acts})

    t = await personal_week_targets(db, 5, WEEK_START)
    assert t["weekly_target_tss"] == 420          # 400 × 1.05 — never 800
    assert t["daily_target_tss"] == 60            # 420 / 7
    assert t["active_days_target"] == 3           # avg 2 days → floor-clamped to 3
    assert t["has_history"] is True


async def test_weekly_target_floors_at_60_without_history():
    db = make_db(activities={5: []})
    t = await personal_week_targets(db, 5, WEEK_START)
    assert t["weekly_target_tss"] == 60
    assert t["daily_target_tss"] == 9
    assert t["active_days_target"] == 3
    assert t["has_history"] is False


async def test_active_days_target_never_seven():
    # Rode every single day for 4 weeks — the bar still tops out at 6.
    start = WEEK_START - timedelta(days=28)
    acts = [act(f"{start + timedelta(days=i)}T08:00:00", 30) for i in range(28)]
    db = make_db(activities={5: acts})
    t = await personal_week_targets(db, 5, WEEK_START)
    assert t["active_days_target"] == 6           # never 7
    assert t["weekly_target_tss"] == 220          # 210 × 1.05, banker's rounding


async def test_weekly_target_scales_up_for_big_engines():
    acts = [
        act(f"{WEEK_START - timedelta(days=28) + timedelta(days=7 * w)}T09:00:00", 1000)
        for w in range(4)
    ]
    db = make_db(activities={5: acts})
    t = await personal_week_targets(db, 5, WEEK_START)
    assert t["weekly_target_tss"] == 1050         # scaled, not capped at a fixed wall


# ── tss_at_same_point_last_week ──────────────────────────────────────────


async def test_pace_basis_counts_only_up_to_same_weekday_time():
    acts = [
        act("2026-07-13T09:00:00", 60),   # last Mon — before cutoff → counts
        act("2026-07-15T09:00:00", 40),   # last Wed 09:00 ≤ cutoff 10:00 → counts
        act("2026-07-15T18:00:00", 50),   # last Wed evening — after cutoff → not yet
        act("2026-07-18T10:00:00", 80),   # last Sat — not yet
    ]
    db = make_db(activities={5: acts})
    now = datetime(2026, 7, 22, 10, 0, tzinfo=timezone.utc)  # Wed 10:00 this week
    assert await tss_at_same_point_last_week(db, 5, WEEK_START, now) == 100


async def test_pace_basis_zero_when_last_week_empty():
    db = make_db(activities={5: []})
    now = datetime(2026, 7, 20, 8, 0, tzinfo=timezone.utc)  # Monday morning
    assert await tss_at_same_point_last_week(db, 5, WEEK_START, now) == 0


# ── member_in_challenge ──────────────────────────────────────────────────

_T0 = datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc)


def test_creator_always_participates():
    assert member_in_challenge(
        member_user_id=5, role="member", joined_at=_T0 + timedelta(days=9),
        creator_user_id=5, challenge_created_at=_T0,
    )


def test_member_present_at_creation_participates():
    assert member_in_challenge(
        member_user_id=6, role="member", joined_at=_T0 - timedelta(days=1),
        creator_user_id=5, challenge_created_at=_T0,
    )


def test_new_friend_is_not_auto_entered():
    assert not member_in_challenge(
        member_user_id=6, role="member", joined_at=_T0 + timedelta(hours=1),
        creator_user_id=5, challenge_created_at=_T0,
    )


def test_explicit_opt_in_role_participates():
    assert member_in_challenge(
        member_user_id=6, role=CHALLENGE_OPT_IN_ROLE,
        joined_at=_T0 + timedelta(days=3),
        creator_user_id=5, challenge_created_at=_T0,
    )


def test_naive_datetimes_are_treated_as_utc():
    assert member_in_challenge(
        member_user_id=6, role="member",
        joined_at=(_T0 - timedelta(days=1)).replace(tzinfo=None),
        creator_user_id=5, challenge_created_at=_T0,
    )


# ── standings: points = share of OWN weekly target ───────────────────────


def _history_400_per_week(uid_days: str = "T09:00:00") -> list:
    acts = []
    for monday in ("2026-06-22", "2026-06-29", "2026-07-06", "2026-07-13"):
        m = date.fromisoformat(monday)
        acts.append(act(f"{m + timedelta(days=2)}{uid_days}", 400))
    return acts


async def test_standings_score_uses_personal_daily_target():
    # History: 400 TSS/wk → weekly target 420, daily 60.
    acts = _history_400_per_week()
    acts.append(act("2026-07-20T08:00:00", 60))   # Monday: exactly on target → 100
    acts.append(act("2026-07-21T08:00:00", 90))   # Tuesday: 1.5× → capped 150
    db = make_db(
        users={5: _user(5, "jannis@evori.ai")},
        activities={5: acts},
        member_ids=[5],
    )

    out = await crew_standings_window(db, 1, WEEK_START, WEEK_START + timedelta(days=6), 5)
    assert out["points_basis"] == "own_weekly_target"
    assert out["daily_target_tss"] == 60          # the caller's OWN bar
    assert out["weekly_target_tss"] == 420
    row = out["standings"][0]
    assert row["weekly_target_tss"] == 420
    assert row["daily_target_tss"] == 60
    assert row["weekly_tss"] == 150
    assert row["weekly_score"] == 250             # 100 + 150(capped)
    assert row["daily_pct"] == [100, 150, 0, 0, 0, 0, 0]


async def test_standings_targets_differ_per_rider():
    # Rider 5: 400/wk history; rider 6: none → floor 60.
    db = make_db(
        users={5: _user(5, "a@gmail.com"), 6: _user(6, "b@gmail.com")},
        activities={5: _history_400_per_week(), 6: []},
        member_ids=[5, 6],
    )
    out = await crew_standings_window(db, 1, WEEK_START, WEEK_START + timedelta(days=6), 5)
    by_uid = {r["user_id"]: r for r in out["standings"]}
    assert by_uid[5]["weekly_target_tss"] == 420
    assert by_uid[6]["weekly_target_tss"] == 60   # floor, not a shared fixed wall


# ── duel payload ─────────────────────────────────────────────────────────


async def test_duel_exposes_personal_bars_and_pace():
    acts = [
        act("2026-06-24T09:00:00", 400),
        act("2026-07-01T09:00:00", 400),
        act("2026-07-08T09:00:00", 400),
        act("2026-07-13T09:00:00", 60),    # last Mon
        act("2026-07-15T18:00:00", 340),   # last Wed evening
        act("2026-07-20T08:00:00", 60),    # this Mon
    ]
    db = make_db(users={5: _user(5, "jannis@evori.ai")}, activities={5: acts})
    now = datetime(2026, 7, 22, 10, 0, tzinfo=timezone.utc)  # Wed 10:00

    out = await crew_duel(db, 5, None, WEEK_START, now)
    assert out["you_this_week"]["tss"] == 60
    assert out["you_last_week"]["tss"] == 400
    # 4-wk history before 2026-07-20 = 1600 → 400 avg → ×1.05
    assert out["weekly_target_tss"] == 420
    assert out["you_this_week"]["weekly_target_tss"] == 420
    assert out["active_days_target"] == 3
    # Pace: only last-Mon 60 landed before Wed-10:00 last week → 60, not 400.
    assert out["last_week_at_now"] == 60
