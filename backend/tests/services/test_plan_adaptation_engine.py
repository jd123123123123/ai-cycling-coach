"""Hourly plan-adaptation engine — frozen-scenario tests per rule.

Conventions mirror test_plan_absorption.py: SimpleNamespace rows + a MagicMock
db whose execute() routes on the compiled statement text. The adaptive
directive is patched (its own logic is covered by test_adaptive_readiness.py);
these tests freeze the calendar via ``now_utc`` so weekday-dependent rules
(reflow targets, Sunday exemption) are deterministic.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

import app.services.plan_adaptation_engine as engine
from app.services.adaptive_readiness import Directive
from app.services.workout_templates import TEMPLATES

# Frozen calendar: Wednesday 2026-07-22, 08:00 UTC (10:00 Berlin).
NOW = datetime(2026, 7, 22, 8, 0, tzinfo=timezone.utc)
TODAY = date(2026, 7, 22)          # Wednesday
MONDAY = date(2026, 7, 20)
USER_ID = 1


# ─── Row factories ───────────────────────────────────────────────────────────

def _profile(**over):
    base = dict(
        user_id=USER_ID, ftp_watts=240, goals={}, injury_flag=False,
        timezone="Europe/Berlin", weekly_hours_available=12.0,
    )
    base.update(over)
    return SimpleNamespace(**base)


_PW_ID = iter(range(1000, 9999))


def _pw(d: date, template_id: str, sport: str = "cycling", source: str = "ai_prescribed"):
    t = TEMPLATES.get(template_id)
    dur = int(sum(b.duration_s for b in t.blocks)) if t else 3600
    return SimpleNamespace(
        id=next(_PW_ID), user_id=USER_ID, date=d, sport=sport,
        title=(t.name if t else template_id), duration_seconds_target=dur,
        description=None, interval_structure={}, indoor=False,
        blocks_source=source, template_id=template_id,
    )


def _metric(d: date, sleep_score=80, sleep_total_s=8 * 3600, hrv=60.0, rhr=48):
    return SimpleNamespace(
        date=d, sleep_score=sleep_score, sleep_total_s=sleep_total_s,
        hrv_status=hrv, resting_hr=rhr,
    )


def _baseline_metrics(days: int = 14, hrv: float = 60.0):
    """Enough history for the HRV band (≥10 points), ending yesterday."""
    return [
        _metric(TODAY - timedelta(days=days - i), hrv=hrv + (i % 3))
        for i in range(days)
    ]


def _act(d: date, tss: float):
    started = datetime(d.year, d.month, d.day, 9, 0, tzinfo=timezone.utc)
    return SimpleNamespace(id=next(_PW_ID), sport="cycling", tss=tss, started_at=started)


def _meso(targets=(250, 250, 250, 150)):
    return SimpleNamespace(
        plan_start_date=MONDAY, plan_end_date=MONDAY + timedelta(days=27),
        weekly_tss_targets=list(targets),
    )


def _directive(directive="push", ceiling="hard", hrv_state="in"):
    return Directive(
        directive=directive, intensity_ceiling=ceiling, volume_modifier=1.0,
        hrv_state=hrv_state, headline="test",
    )


# ─── Mock DB ─────────────────────────────────────────────────────────────────

def _db(*, profile=None, plans=(), metrics=(), acts=(), meso=None, guard_hit=False):
    """execute() routed on statement text; guard_hit=True makes every
    plan_adaptations stability-guard lookup report an existing row."""
    db = MagicMock()

    async def execute(stmt):  # noqa: ANN001
        text = str(stmt).lower()
        result = MagicMock()
        if "athlete_profiles" in text:
            result.scalars.return_value.first.return_value = profile
        elif "planned_workouts" in text:
            result.scalars.return_value.all.return_value = list(plans)
        elif "daily_metrics" in text:
            result.scalars.return_value.all.return_value = list(metrics)
        elif "activities" in text:
            result.scalars.return_value.all.return_value = list(acts)
        elif "mesocycle_plans" in text:
            result.scalars.return_value.first.return_value = meso
        elif "plan_adaptations" in text:
            result.scalar_one_or_none.return_value = (
                SimpleNamespace(id=99) if guard_hit else None
            )
        else:  # pragma: no cover — unexpected query
            raise AssertionError(f"unrouted statement: {text[:120]}")
        return result

    db.execute = AsyncMock(side_effect=execute)
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    return db


def _logged_rows(db):
    """PlanAdaptation rows handed to db.add by log_adaptation."""
    return [c.args[0] for c in db.add.call_args_list]


@pytest.fixture(autouse=True)
def _fresh(monkeypatch):
    engine.reset_snapshot_cache()
    # Push is off by default in tests; individual tests patch it on.
    monkeypatch.setattr("app.services.push_service.push_configured", lambda: False)
    yield
    engine.reset_snapshot_cache()


def _patch_directive(monkeypatch, directive):
    mock = AsyncMock(return_value=directive)
    monkeypatch.setattr(engine, "build_adaptive_directive", mock)
    return mock


# ─── R2: short sleep + low HRV → downgrade today's hard session ─────────────

@pytest.mark.asyncio
async def test_short_sleep_low_hrv_downgrades_today(monkeypatch):
    _patch_directive(monkeypatch, _directive(directive="hold", ceiling="easy", hrv_state="below"))
    today_vo2 = _pw(TODAY, "vo2_5x4")
    plans = [_pw(MONDAY, "rest_day"), today_vo2, _pw(TODAY + timedelta(days=2), "z2_endurance_90")]
    metrics = _baseline_metrics() + [_metric(TODAY, sleep_score=70, sleep_total_s=int(5.2 * 3600), hrv=40.0)]
    db = _db(profile=_profile(), plans=plans, metrics=metrics, meso=_meso())

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    assert out["status"] == "adapted"
    assert [c["rule"] for c in out["changes"]] == ["sleep_hrv_downgrade"]
    # Quality eased to Z2, slot kept, provenance marked.
    assert TEMPLATES[today_vo2.template_id].category == "endurance"
    assert today_vo2.blocks_source == "coach_adapted"
    assert today_vo2.interval_structure["source"] == "coach_adapted"
    # Exactly one feed row; message names BOTH signals; diff complete.
    rows = _logged_rows(db)
    assert len(rows) == 1
    row = rows[0]
    assert row.signal == "short_sleep_low_hrv"
    assert row.source == "hourly"
    assert row.target_date == TODAY
    assert "Schlaf" in row.message_de and "HRV" in row.message_de
    assert "Sleep" in row.message_en and "HRV" in row.message_en
    assert row.before["template_id"] == "vo2_5x4"
    assert row.after["template_id"] == today_vo2.template_id
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_one_signal_alone_never_downgrades(monkeypatch):
    # Short sleep but HRV in-band → 2-signal agreement fails → no change.
    _patch_directive(monkeypatch, _directive(hrv_state="in"))
    today_vo2 = _pw(TODAY, "vo2_5x4")
    metrics = _baseline_metrics() + [_metric(TODAY, sleep_total_s=int(5.0 * 3600))]
    db = _db(profile=_profile(), plans=[today_vo2], metrics=metrics, meso=_meso())

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    assert out["changes"] == []
    assert today_vo2.template_id == "vo2_5x4"
    assert _logged_rows(db) == []


# ─── R4/R5: sick interlock ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sick_interlock_rests_today_and_tomorrow(monkeypatch):
    _patch_directive(monkeypatch, _directive(directive="rest", ceiling="rest", hrv_state="unknown"))
    today_row = _pw(TODAY, "vo2_5x4")
    tomorrow_row = _pw(TODAY + timedelta(days=1), "z2_endurance_90")
    later_row = _pw(TODAY + timedelta(days=3), "sweet_spot_2x20")
    profile = _profile(goals={"athlete_status": {"state": "sick"}})
    db = _db(profile=profile, plans=[today_row, tomorrow_row, later_row],
             metrics=_baseline_metrics(), meso=_meso())

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    assert [c["rule"] for c in out["changes"]] == ["illness_interlock"]
    assert today_row.template_id == "rest_day"
    assert tomorrow_row.template_id == "rest_day"
    assert later_row.template_id == "sweet_spot_2x20"  # only today+tomorrow
    rows = _logged_rows(db)
    assert len(rows) == 1
    assert rows[0].signal == "illness"
    assert len(rows[0].before["days"]) == 2
    assert all(d["template_id"] == "rest_day" for d in rows[0].after["days"])


# ─── R3: missed key session reflow ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_missed_key_session_reflows_to_free_filler_day(monkeypatch):
    _patch_directive(monkeypatch, _directive())
    # Tuesday VO2 was planned; no ride happened Tuesday. Thursday is a free
    # filler (neighbours Wed=recovery, Fri=rest → no hard-day stacking).
    tue = _pw(MONDAY + timedelta(days=1), "vo2_5x4")
    wed = _pw(TODAY, "recovery_60")
    thu = _pw(TODAY + timedelta(days=1), "z2_endurance_90")
    fri = _pw(TODAY + timedelta(days=2), "rest_day")
    db = _db(profile=_profile(), plans=[tue, wed, thu, fri],
             metrics=_baseline_metrics(), meso=_meso())

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    assert [c["rule"] for c in out["changes"]] == ["missed_key_reflow"]
    # Today (Wed) is adjacent-free too, but recovery_60 (28) < z2_endurance_90
    # (68)? — no: earliest free day wins, and Wed itself qualifies.
    moved = wed if wed.template_id == "vo2_5x4" else thu
    assert moved.template_id == "vo2_5x4"
    assert moved.blocks_source == "coach_adapted"
    rows = _logged_rows(db)
    assert rows[0].signal == "missed_key_session"
    assert rows[0].evidence["missed_date"] == tue.date.isoformat()
    # The missed (past) day itself is never rewritten — history is history.
    assert tue.template_id == "vo2_5x4"
    assert tue.blocks_source == "ai_prescribed"


@pytest.mark.asyncio
async def test_reflow_never_stacks_two_hard_days(monkeypatch):
    _patch_directive(monkeypatch, _directive())
    # Only free-ish filler (Thu) sits right next to Friday's sweet spot →
    # no valid slot → no reflow.
    tue = _pw(MONDAY + timedelta(days=1), "vo2_5x4")
    thu = _pw(TODAY + timedelta(days=1), "z2_endurance_90")
    fri = _pw(TODAY + timedelta(days=2), "sweet_spot_2x20")
    db = _db(profile=_profile(), plans=[tue, thu, fri],
             metrics=_baseline_metrics(), meso=_meso())

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    assert out["changes"] == []
    assert thu.template_id == "z2_endurance_90"


# ─── Missed non-quality ride → informational "absorbed" log entry ───────────

@pytest.mark.asyncio
async def test_missed_easy_ride_logs_absorbed_without_mutation(monkeypatch):
    _patch_directive(monkeypatch, _directive())
    # Tuesday endurance was planned; no ride landed Tuesday. Not a quality day,
    # so R3 stays silent — the absorbed rule must still surface the no-show.
    tue = _pw(MONDAY + timedelta(days=1), "z2_endurance_90")
    wed = _pw(TODAY, "recovery_60")
    db = _db(profile=_profile(), plans=[tue, wed],
             metrics=_baseline_metrics(), meso=_meso())

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    assert [c["rule"] for c in out["changes"]] == ["missed_ride_absorbed"]
    rows = _logged_rows(db)
    assert rows[0].signal == "missed_ride_absorbed"
    assert rows[0].evidence["absorbed"] is True
    assert rows[0].evidence["missed_date"] == tue.date.isoformat()
    assert "ausgefallen" in rows[0].message_de
    # Informational only — neither the missed row nor today's plan is rewritten.
    assert tue.template_id == "z2_endurance_90"
    assert tue.blocks_source == "ai_prescribed"
    assert wed.template_id == "recovery_60"


@pytest.mark.asyncio
async def test_ridden_easy_day_logs_no_absorbed(monkeypatch):
    _patch_directive(monkeypatch, _directive())
    # Same planned Tuesday endurance, but it WAS ridden (≥ MISSED_DONE_TSS) —
    # nothing to absorb, no feed entry.
    tue = _pw(MONDAY + timedelta(days=1), "z2_endurance_90")
    wed = _pw(TODAY, "recovery_60")
    db = _db(profile=_profile(), plans=[tue, wed],
             metrics=_baseline_metrics(),
             acts=[_act(MONDAY + timedelta(days=1), 70.0)], meso=_meso())

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    assert out["changes"] == []


# ─── R8: extra load trims filler ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_extra_load_trims_biggest_remaining_filler(monkeypatch):
    _patch_directive(monkeypatch, _directive())
    # Tuesday: planned z2_endurance_60 (45 TSS) but rode 200 TSS. Week budget
    # 250; banked 200 + remaining (90 + 68) = 358 ≫ 262.5 → trim z2_long_120.
    tue = _pw(MONDAY + timedelta(days=1), "z2_endurance_60")
    thu = _pw(TODAY + timedelta(days=1), "z2_long_120")
    sat = _pw(TODAY + timedelta(days=3), "z2_endurance_90")
    db = _db(profile=_profile(), plans=[tue, thu, sat],
             metrics=_baseline_metrics(),
             acts=[_act(MONDAY + timedelta(days=1), 200.0)], meso=_meso())

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    assert [c["rule"] for c in out["changes"]] == ["extra_load_trim"]
    assert thu.template_id == "z2_endurance_90"  # one notch easier
    assert thu.blocks_source == "coach_adapted"
    assert sat.template_id == "z2_endurance_90"  # untouched (≤1 change)
    rows = _logged_rows(db)
    assert rows[0].signal == "extra_load"
    assert rows[0].evidence["weekly_budget"] == 250


@pytest.mark.asyncio
async def test_extra_load_within_budget_changes_nothing(monkeypatch):
    _patch_directive(monkeypatch, _directive())
    tue = _pw(MONDAY + timedelta(days=1), "z2_endurance_60")
    thu = _pw(TODAY + timedelta(days=1), "z2_endurance_60")
    db = _db(profile=_profile(), plans=[tue, thu], metrics=_baseline_metrics(),
             acts=[_act(MONDAY + timedelta(days=1), 80.0)], meso=_meso())

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    assert out["changes"] == []  # 80 banked + 45 remaining ≪ 250 budget


# ─── R6: green streak gives back ─────────────────────────────────────────────

def _green_metrics():
    """Stable baseline (ending 3 days ago) + 3 clearly-green recent days
    (high HRV, good sleep) — the multi-day trend R6 requires."""
    hist = [
        _metric(TODAY - timedelta(days=14 - i), hrv=60.0 + (i % 3))
        for i in range(12)  # TODAY-14 .. TODAY-3
    ]
    recent = [
        _metric(TODAY - timedelta(days=2), sleep_score=85, hrv=72.0),
        _metric(TODAY - timedelta(days=1), sleep_score=82, hrv=71.0),
        _metric(TODAY, sleep_score=88, hrv=73.0),
    ]
    return hist + recent


@pytest.mark.asyncio
async def test_green_streak_upgrades_one_filler(monkeypatch):
    _patch_directive(monkeypatch, _directive(directive="push", ceiling="hard", hrv_state="above"))
    thu = _pw(TODAY + timedelta(days=1), "z2_endurance_60")   # 45 TSS filler
    sat = _pw(TODAY + timedelta(days=3), "z2_endurance_60")
    db = _db(profile=_profile(), plans=[thu, sat], metrics=_green_metrics(),
             meso=_meso(targets=(400, 400, 400, 200)))

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    assert [c["rule"] for c in out["changes"]] == ["green_streak_upgrade"]
    assert thu.template_id == "z2_endurance_90"  # earliest filler, one notch up
    assert sat.template_id == "z2_endurance_60"  # only ONE day upgraded
    rows = _logged_rows(db)
    assert rows[0].signal == "green_streak"
    assert rows[0].rule == "green_streak_upgrade"


@pytest.mark.asyncio
async def test_green_streak_respects_easy_ceiling(monkeypatch):
    # Same green body, but the directive caps intensity at 'easy' → no gift.
    _patch_directive(monkeypatch, _directive(directive="hold", ceiling="easy", hrv_state="in"))
    thu = _pw(TODAY + timedelta(days=1), "z2_endurance_60")
    db = _db(profile=_profile(), plans=[thu], metrics=_green_metrics(),
             meso=_meso(targets=(400, 400, 400, 200)))

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    assert out["changes"] == []
    assert thu.template_id == "z2_endurance_60"


# ─── Stability guard + quiet-run cache ───────────────────────────────────────

@pytest.mark.asyncio
async def test_stability_guard_blocks_second_change_same_day(monkeypatch):
    # Same scenario as the short-sleep test, but the guard reports an
    # adaptation already landed today → nothing moves twice.
    _patch_directive(monkeypatch, _directive(directive="hold", ceiling="easy", hrv_state="below"))
    today_vo2 = _pw(TODAY, "vo2_5x4")
    metrics = _baseline_metrics() + [_metric(TODAY, sleep_total_s=int(5.0 * 3600), hrv=40.0)]
    db = _db(profile=_profile(), plans=[today_vo2], metrics=metrics,
             meso=_meso(), guard_hit=True)

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    assert out["changes"] == []
    assert today_vo2.template_id == "vo2_5x4"
    assert _logged_rows(db) == []
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_quiet_run_is_fingerprint_cached(monkeypatch):
    directive_mock = _patch_directive(monkeypatch, _directive())
    thu = _pw(TODAY + timedelta(days=1), "z2_endurance_60")
    db = _db(profile=_profile(), plans=[thu], metrics=_baseline_metrics(), meso=_meso())

    first = await engine.run_for_user(db, USER_ID, now_utc=NOW)
    assert first["status"] == "no-change"
    assert directive_mock.await_count == 1

    second = await engine.run_for_user(db, USER_ID, now_utc=NOW)
    assert second["status"] == "quiet"
    # No re-evaluation: the directive (and the guards) were not touched again.
    assert directive_mock.await_count == 1


# ─── Push on today-affecting change ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_today_change_sends_one_push(monkeypatch):
    _patch_directive(monkeypatch, _directive(directive="hold", ceiling="easy", hrv_state="below"))
    monkeypatch.setattr("app.services.push_service.push_configured", lambda: True)
    send = AsyncMock(return_value=1)
    monkeypatch.setattr("app.services.push_service.send_user_push", send)

    today_vo2 = _pw(TODAY, "vo2_5x4")
    metrics = _baseline_metrics() + [_metric(TODAY, sleep_total_s=int(5.2 * 3600), hrv=40.0)]
    db = _db(profile=_profile(), plans=[today_vo2], metrics=metrics, meso=_meso())

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    assert out["status"] == "adapted"
    send.assert_awaited_once()
    args = send.await_args.args
    assert args[2] == "Plan angepasst"          # title
    assert "Schlaf" in args[3]                   # body = German no-guilt line
    assert args[4] == "/dashboard?tab=today"     # deep link


@pytest.mark.asyncio
async def test_future_only_change_sends_no_push(monkeypatch):
    _patch_directive(monkeypatch, _directive())
    monkeypatch.setattr("app.services.push_service.push_configured", lambda: True)
    send = AsyncMock(return_value=1)
    monkeypatch.setattr("app.services.push_service.send_user_push", send)

    # Extra-load trim hits Thursday (future) — today is untouched → no push.
    tue = _pw(MONDAY + timedelta(days=1), "z2_endurance_60")
    thu = _pw(TODAY + timedelta(days=1), "z2_long_120")
    sat = _pw(TODAY + timedelta(days=3), "z2_endurance_90")
    db = _db(profile=_profile(), plans=[tue, thu, sat], metrics=_baseline_metrics(),
             acts=[_act(MONDAY + timedelta(days=1), 200.0)], meso=_meso())

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    assert [c["rule"] for c in out["changes"]] == ["extra_load_trim"]
    send.assert_not_awaited()


@pytest.mark.asyncio
async def test_quiet_on_rest_days_suppresses_push_when_today_becomes_rest(monkeypatch):
    """V3 Settings toggle ON: illness turns today into rest — the feed row
    still lands, but no push goes out on a (now) rest day."""
    _patch_directive(monkeypatch, _directive(directive="rest", ceiling="rest", hrv_state="unknown"))
    monkeypatch.setattr("app.services.push_service.push_configured", lambda: True)
    send = AsyncMock(return_value=1)
    monkeypatch.setattr("app.services.push_service.send_user_push", send)

    today_row = _pw(TODAY, "vo2_5x4")
    profile = _profile(
        goals={"athlete_status": {"state": "sick"}}, quiet_on_rest_days=True
    )
    db = _db(profile=profile, plans=[today_row], metrics=_baseline_metrics(), meso=_meso())

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    assert [c["rule"] for c in out["changes"]] == ["illness_interlock"]
    assert today_row.template_id == "rest_day"
    assert len(_logged_rows(db)) == 1  # adaptation is logged regardless
    send.assert_not_awaited()  # …but the rest day stays quiet


@pytest.mark.asyncio
async def test_quiet_toggle_off_keeps_rest_day_push(monkeypatch):
    """Toggle OFF: the same today-becomes-rest change still pushes."""
    _patch_directive(monkeypatch, _directive(directive="rest", ceiling="rest", hrv_state="unknown"))
    monkeypatch.setattr("app.services.push_service.push_configured", lambda: True)
    send = AsyncMock(return_value=1)
    monkeypatch.setattr("app.services.push_service.send_user_push", send)

    today_row = _pw(TODAY, "vo2_5x4")
    profile = _profile(
        goals={"athlete_status": {"state": "sick"}}, quiet_on_rest_days=False
    )
    db = _db(profile=profile, plans=[today_row], metrics=_baseline_metrics(), meso=_meso())

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    assert [c["rule"] for c in out["changes"]] == ["illness_interlock"]
    send.assert_awaited_once()


# ─── Ordering / precedence ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sick_wins_over_all_other_ease_rules(monkeypatch):
    _patch_directive(monkeypatch, _directive(directive="rest", ceiling="rest", hrv_state="below"))
    # Sick AND short sleep AND missed key AND extra load — only the interlock fires.
    tue = _pw(MONDAY + timedelta(days=1), "vo2_5x4")
    today_row = _pw(TODAY, "sweet_spot_2x20")
    thu = _pw(TODAY + timedelta(days=1), "z2_long_120")
    profile = _profile(goals={"athlete_status": {"state": "sick"}})
    metrics = _baseline_metrics() + [_metric(TODAY, sleep_total_s=int(4.5 * 3600), hrv=40.0)]
    db = _db(profile=profile, plans=[tue, today_row, thu], metrics=metrics,
             acts=[_act(MONDAY + timedelta(days=1), 220.0)], meso=_meso())

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    rules = [c["rule"] for c in out["changes"]]
    assert rules == ["illness_interlock"]
    assert today_row.template_id == "rest_day"
    assert thu.template_id == "rest_day"  # tomorrow rests too


@pytest.mark.asyncio
async def test_user_authored_rows_are_never_auto_downgraded(monkeypatch):
    _patch_directive(monkeypatch, _directive(directive="hold", ceiling="easy", hrv_state="below"))
    today_user = _pw(TODAY, "vo2_5x4", source="user_modified")
    metrics = _baseline_metrics() + [_metric(TODAY, sleep_total_s=int(5.0 * 3600), hrv=40.0)]
    db = _db(profile=_profile(), plans=[today_user], metrics=metrics, meso=_meso())

    out = await engine.run_for_user(db, USER_ID, now_utc=NOW)

    assert out["changes"] == []
    assert today_user.template_id == "vo2_5x4"
    assert today_user.blocks_source == "user_modified"
