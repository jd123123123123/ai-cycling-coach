"""Absorb-and-replan (roadmap P1.4).

Unplanned rides ≥40 TSS and rides ≥140% of plan get absorbed exactly once;
the week rebalances by downgrading the biggest remaining session only when
running >110% of the planned total; absorption never raises.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.plan_absorption import absorb_new_activities

NOW = datetime.now(timezone.utc)
TODAY = NOW.date()


def _act(aid: int, tss: float, hours_ago: float = 5.0):
    return SimpleNamespace(id=aid, sport="cycling", tss=tss, started_at=NOW - timedelta(hours=hours_ago))


def _plan(d: date, template_id: str, title: str = ""):
    return SimpleNamespace(
        date=d, template_id=template_id, title=title or template_id,
        duration_seconds_target=3600, blocks_source="ai_prescribed", interval_structure={},
    )


def _db(acts, audits, day_plans, week_plans, week_tss_rows, adaptation_audits=None):
    db = MagicMock()

    async def execute(stmt):  # noqa: ANN001
        text = str(stmt)
        low = text.lower()
        result = MagicMock()
        if "coach_briefs" in low:
            result.scalars.return_value.all.return_value = audits
        elif "plan_adaptations" in low:
            result.scalars.return_value.all.return_value = adaptation_audits or []
        elif "planned_workouts" in low and "planned_workouts.date = " in low:
            result.scalars.return_value.all.return_value = day_plans
        elif "planned_workouts" in low:
            result.scalars.return_value.all.return_value = week_plans
        elif "activities.tss" in low and "activities.id" not in low:
            result.all.return_value = week_tss_rows
        else:  # full Activity select
            result.scalars.return_value.all.return_value = acts
        return result

    db.execute = AsyncMock(side_effect=execute)
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_unplanned_ride_absorbed_without_rebalance():
    # 82-TSS unplanned ride; week has no plan rows → absorb, no rebalance.
    db = _db([_act(1, 82.0)], [], [], [], [])
    out = await absorb_new_activities(db, 1)
    assert len(out) == 1
    assert out[0]["kind"] == "unplanned"
    assert out[0]["rebalance"] is None
    # Two rows per absorption: the CoachBrief audit + the plan_adaptations
    # feed row (plan-engine v2 — adaptation without a feed entry is a bug).
    added = [c.args[0] for c in db.add.call_args_list]
    assert len(added) == 2
    kinds = {type(o).__name__ for o in added}
    assert kinds == {"CoachBrief", "PlanAdaptation"}
    feed = next(o for o in added if type(o).__name__ == "PlanAdaptation")
    assert feed.source == "post_workout"
    assert feed.signal == "session_done"
    assert feed.evidence["absorption"]["activity_id"] == 1
    assert feed.message_en and feed.message_de


@pytest.mark.asyncio
async def test_small_unplanned_ride_ignored():
    db = _db([_act(1, 25.0)], [], [], [], [])
    out = await absorb_new_activities(db, 1)
    assert out == []


@pytest.mark.asyncio
async def test_planned_ride_within_tolerance_ignored():
    plans = [_plan(TODAY, "z2_progressive_90")]  # ~68 TSS
    db = _db([_act(1, 80.0)], [], plans, plans, [])
    out = await absorb_new_activities(db, 1)
    assert out == []  # 80 < 68*1.4


@pytest.mark.asyncio
async def test_big_week_downgrades_biggest_remaining_session():
    # Unplanned 200-TSS ride; week planned 5×z2_progressive_90 (~340 TSS);
    # banked 400 already → projected way over → biggest remaining downgraded.
    future1 = _plan(TODAY + timedelta(days=1), "z2_long_120", "Long Z2 — 2h")
    future2 = _plan(TODAY + timedelta(days=2), "z2_progressive_90", "Progressive Z2")
    week = [_plan(TODAY - timedelta(days=1), "z2_progressive_90"), future1, future2]
    db = _db([_act(1, 200.0)], [], [], week, [(200.0,), (200.0,)])
    out = await absorb_new_activities(db, 1)
    assert len(out) == 1
    rb = out[0]["rebalance"]
    assert rb is not None
    assert rb["from"] == "z2_long_120"  # biggest remaining
    assert rb["to"] in ("rest_day", "recovery_60")
    assert future1.blocks_source == "coach_absorbed"


@pytest.mark.asyncio
async def test_already_absorbed_not_repeated():
    audits = [{"absorption": {"activity_id": 1}}]
    db = _db([_act(1, 82.0)], audits, [], [], [])
    out = await absorb_new_activities(db, 1)
    assert out == []


@pytest.mark.asyncio
async def test_absorption_never_raises():
    db = MagicMock()
    db.execute = AsyncMock(side_effect=RuntimeError("db down"))
    out = await absorb_new_activities(db, 1)
    assert out == []


# ──────────────────────────────────────────────────────────────────────────
#  Plan-engine v2 regressions — the recon-verified death-spiral shape:
#  user 5's Sat sweet_spot_2x20 (the week's KEY session) was serially
#  downgraded to rest_day because (a) the dedup audit was wiped on every
#  sync and (b) the victim pick was "biggest remaining" with no category
#  preference. These tests encode that exact failure.
# ──────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_rebalance_trims_endurance_filler_not_the_key_session():
    # Recon shape: remaining week = Sat sweet_spot_2x20 (85, KEY) + a filler
    # z2_long_120 (90). Old code downgraded the biggest remaining — the long
    # ride here, but with SS as the biggest it ate the quality day. New rule:
    # the endurance filler is the victim; the SS session survives untouched.
    ss = _plan(TODAY + timedelta(days=2), "sweet_spot_2x20", "Sweet spot — 2×20min")
    filler = _plan(TODAY + timedelta(days=1), "z2_endurance_90", "Z2 endurance — 90min")
    week = [_plan(TODAY - timedelta(days=1), "z2_progressive_90"), ss, filler]
    db = _db([_act(1, 200.0)], [], [], week, [(200.0,), (150.0,)])
    out = await absorb_new_activities(db, 1)
    assert len(out) == 1
    rb = out[0]["rebalance"]
    assert rb is not None
    assert rb["from"] == "z2_endurance_90", "victim must be the endurance filler"
    assert ss.template_id == "sweet_spot_2x20", "key session must survive"
    assert ss.blocks_source == "ai_prescribed"
    assert filler.blocks_source == "coach_absorbed"


@pytest.mark.asyncio
async def test_ohne_fueller_bleibt_die_qualitaetseinheit_stehen():
    """UMGEKEHRTE ENTSCHEIDUNG (19.09.2026). Dieser Test hiess
    `test_rebalance_quality_only_touched_when_no_filler_remains` und sicherte
    ab, dass die Qualitaetseinheit das Opfer wird, sobald kein Fuellertag mehr
    da ist. Genau daraus entstand der Pendlerfehler.

    Wer taeglich zur Arbeit radelt, verbraucht die Grundlagentage zuerst.
    Danach war die Qualitaetseinheit nicht mehr die Ausnahme, sondern der
    Regelfall -- der Schutz versagte strukturell bei der Gruppe, fuer die er
    gedacht war. Der Athlet sammelte Umfang und verlor genau den Reiz, den
    Umfang nicht erzeugen kann.

    Neue Invariante: Grundlagenlast darf niemals Qualitaetslast kuerzen. Ist
    kein Fuellertag da, ist NICHTS TUN die richtige Antwort.

    `docs/2026-09-19-pendlerfehler-reizkonten.md`, Abschnitt 5.2.
    """
    ss = _plan(TODAY + timedelta(days=2), "sweet_spot_2x20", "Sweet spot — 2×20min")
    week = [_plan(TODAY - timedelta(days=1), "z2_progressive_90"), ss]
    db = _db([_act(1, 250.0)], [], [], week, [(250.0,)])
    out = await absorb_new_activities(db, 1)
    rb = out[0]["rebalance"] if out else None
    assert rb is None, "die Qualitaetseinheit darf fuer Umfang nicht weichen"
    assert ss.template_id == "sweet_spot_2x20"
    assert ss.blocks_source == "ai_prescribed"


@pytest.mark.asyncio
async def test_moderate_overage_trims_duration_not_the_whole_day():
    # Overage smaller than the victim → swap to a SHORTER Z2 variant, not a
    # recovery spin / rest day (trim duration first — plan-engine v2).
    long_ride = _plan(TODAY + timedelta(days=1), "z2_long_120", "Long Z2 — 2h")
    week = [
        _plan(TODAY - timedelta(days=2), "z2_endurance_90"),
        _plan(TODAY - timedelta(days=1), "z2_endurance_90"),
        long_ride,
    ]
    # target = 68+68+90 = 226; banked = 190; remaining = 90 → projected 280;
    # overage = 54 → trim target 90-54 = 36 TSS → no Z2 variant fits (min 45)
    # ... use a gentler overage: banked 160 → projected 250, overage 24 →
    # trim target 66 → z2_endurance_upper_75 (63) or z2_endurance_low_100.
    db = _db([_act(1, 90.0)], [], [], week, [(90.0,), (70.0,)])
    out = await absorb_new_activities(db, 1)
    rb = out[0]["rebalance"]
    assert rb is not None
    assert rb["from"] == "z2_long_120"
    assert rb["to"] not in ("rest_day", "recovery_60"), (
        f"moderate overage must trim duration, got {rb['to']}"
    )
    from app.services.workout_templates import TEMPLATES
    assert TEMPLATES[rb["to"]].category == "endurance"
    assert long_ride.duration_seconds_target > 0
    assert long_ride.interval_structure["intervals"], "trimmed day keeps real blocks"


@pytest.mark.asyncio
async def test_dedup_survives_brief_cache_wipe_via_plan_adaptations():
    # The death-spiral: coach_briefs wiped by sync (audits=[]) — but the
    # plan_adaptations feed row survives and blocks re-absorption.
    adaptation_audits = [{"absorption": {"activity_id": 1}}]
    db = _db([_act(1, 82.0)], [], [], [], [], adaptation_audits=adaptation_audits)
    out = await absorb_new_activities(db, 1)
    assert out == [], "activity must be absorbed at most once per actual ride"
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_absorbed_day_never_eased_twice():
    # A day already eased by absorption (blocks_source='coach_absorbed') is
    # never picked again — a PROGRAM day can only be absorbed into rest once
    # per actual ride, and a second ride can't keep eating the same week.
    already_eaten = _plan(TODAY + timedelta(days=1), "recovery_60", "Recovery spin — 60min")
    already_eaten.blocks_source = "coach_absorbed"
    week = [_plan(TODAY - timedelta(days=1), "z2_progressive_90"), already_eaten]
    db = _db([_act(2, 300.0)], [], [], week, [(300.0,)])
    out = await absorb_new_activities(db, 1)
    assert len(out) == 1
    assert out[0]["rebalance"] is None, "no fresh victim → no rebalance"
    assert already_eaten.template_id == "recovery_60"


@pytest.mark.asyncio
async def test_rebalance_absorption_writes_extra_load_feed_row():
    filler = _plan(TODAY + timedelta(days=1), "z2_endurance_90", "Z2 endurance — 90min")
    week = [_plan(TODAY - timedelta(days=1), "z2_progressive_90"), filler]
    db = _db([_act(1, 250.0)], [], [], week, [(250.0,)])
    out = await absorb_new_activities(db, 1)
    assert out[0]["rebalance"] is not None
    added = [c.args[0] for c in db.add.call_args_list]
    feed = next(o for o in added if type(o).__name__ == "PlanAdaptation")
    assert feed.signal == "extra_load"
    assert feed.rule == "absorb_and_replan"
    assert feed.before is not None and feed.after is not None
    # No-guilt register: the message must not shame ("missed", "verpasst"
    # in the guilt sense) — it states the signal and the change.
    assert "counted" in feed.message_en or "banked" in feed.message_en
