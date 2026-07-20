"""PMC (Performance Management Chart) service.

Bridges the database (activities table) with the pure sports science functions
in training_load.py. Responsibilities:
  - Aggregate daily TSS from the activities table (grouped by sport),
    bucketed by ATHLETE-LOCAL calendar day (usability audit P0-2)
  - Gap-fill rest days in Python (not time_bucket_gapfill — unreliable with multi-sport GROUP BY)
  - Fan out per-sport and total PMC series via compute_pmc_series()
  - Compute training zones from athlete profile thresholds

WINDOW INVARIANCE (usability audit P0-4/P0-5): the CTL/ATL EWMA is ALWAYS run
from the athlete's first activity (capped at HISTORY_CAP_DAYS) and the
requested window is sliced from the tail. `days` only controls how much of the
series is returned — never where the EWMA starts — so /pmc?days=60 and
/pmc?days=90 report the identical TSB for the same calendar day.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.athlete_profile import AthleteProfile
from app.services.athlete_time import (
    athlete_tz,
    set_athlete_tz_from_profile,
    today_local,
)
from app.services.training_load import (
    coggan_power_zones,
    compute_pmc_series,
    seiler_3_zones_running,
)

# Sports tracked independently in the PMC
TRACKED_SPORTS = ("cycling", "running", "gym")

# EWMA seed history cap — the CTL/ATL series always starts at the athlete's
# first activity, but never further back than this (cost bound; 2 years is far
# beyond the 42-day EWMA memory anyway).
HISTORY_CAP_DAYS = 730


async def get_daily_tss_by_sport(
    db: AsyncSession,
    user_id: int,
    days: int = HISTORY_CAP_DAYS,
) -> list[dict]:
    """Query daily TSS aggregated by sport from the activities hypertable.

    Buckets by ATHLETE-LOCAL calendar day (`started_at AT TIME ZONE tz`) so a
    22:30 local ride never lands on the next UTC day. The athlete tz must be
    bound via `athlete_time.set_athlete_tz_from_profile` before calling
    (compute_user_pmc does this).

    Rest days are gap-filled in Python after this query so multi-sport
    GROUP BY works correctly.

    Args:
        db: Async SQLAlchemy session (already RLS-scoped to user_id).
        user_id: The authenticated user's ID.
        days: Number of days to look back from now (server-side constant).

    Returns:
        List of {"day": date, "sport": str, "daily_tss": float} for days
        where at least one activity with a non-null TSS was logged.
    """
    # f-string safe: `days` is a server-side integer constant, not user input
    # that could contain SQL.  user_id / tz are bound parameters.
    sql = text(f"""
        SELECT
            (started_at AT TIME ZONE :tz)::date AS day,
            sport,
            SUM(tss)                            AS daily_tss
        FROM activities
        WHERE user_id = :user_id
          AND tss IS NOT NULL
          AND started_at >= NOW() - INTERVAL '{days} days'
        GROUP BY 1, 2
        ORDER BY 1, 2
    """)
    result = await db.execute(sql, {"user_id": user_id, "tz": athlete_tz().key})
    rows = result.fetchall()
    return [
        {"day": row.day, "sport": row.sport, "daily_tss": float(row.daily_tss)}
        for row in rows
    ]


def _gap_fill_series(
    tss_by_date: dict[date, float],
    start_date: date,
    end_date: date,
) -> list[dict]:
    """Return a list of {"date": date, "tss": float} for every day in [start, end].

    Days absent from tss_by_date are gap-filled with TSS=0 (rest days) so that
    compute_pmc_series() can apply correct EWMA decay even on rest days.
    """
    out: list[dict] = []
    current = start_date
    while current <= end_date:
        out.append({"date": current, "tss": tss_by_date.get(current, 0.0)})
        current += timedelta(days=1)
    return out


def _series_for(
    tss_by_date: dict[date, float],
    window_start: date,
    today: date,
) -> list[dict]:
    """Full-history EWMA, then slice the requested window from the tail.

    The EWMA always starts at min(first activity day, window_start) so the
    same calendar day carries the same CTL/ATL/TSB no matter which window the
    caller asked for (window invariance). Zero-padding before the first
    activity is harmless — the EWMA state is 0 there anyway.
    """
    if not tss_by_date:
        return []
    series_start = min(min(tss_by_date), window_start)
    series_end = max(max(tss_by_date), today)
    filled = _gap_fill_series(tss_by_date, series_start, series_end)
    pmc_entries = compute_pmc_series(filled)
    return [
        {**e, "tss": tss_by_date.get(e["date"], 0.0)}
        for e in pmc_entries
        if e["date"] >= window_start
    ]


async def compute_user_pmc(
    db: AsyncSession,
    user_id: int,
    days: int = 90,
    profile: AthleteProfile | None = None,
) -> dict:
    """Compute per-sport and combined-total PMC series for the authenticated user.

    Per-sport: each sport is computed independently from its own daily TSS.
    Total: summed daily TSS across ALL sports is fed through a single EWMA
           (NOT the sum of per-sport CTLs — that would be wrong).

    Rest days cause CTL/ATL to decay — gaps are filled with TSS=0 before
    calling compute_pmc_series().

    WINDOW-INVARIANT: the EWMA always runs from the athlete's first activity
    (capped at HISTORY_CAP_DAYS); `days` only slices the returned window.
    Days are bucketed in the ATHLETE-LOCAL timezone (the profile is loaded —
    or passed via `profile` — and bound via set_athlete_tz_from_profile).

    Returns:
        {
            "total":   [{"date", "ctl", "atl", "tsb", "tss"}, ...],
            "cycling": [...],
            "running": [...],
            "gym":     [...],
        }
        Any sport with no activities returns an empty list.
    """
    if profile is None:
        prof_res = await db.execute(
            select(AthleteProfile).where(AthleteProfile.user_id == user_id)
        )
        profile = prof_res.scalar_one_or_none()
    set_athlete_tz_from_profile(profile)

    raw = await get_daily_tss_by_sport(db, user_id, days=HISTORY_CAP_DAYS)

    # Separate TSS by sport and build total (sum across all sports per day)
    sport_tss: dict[str, dict[date, float]] = {s: {} for s in TRACKED_SPORTS}
    total_tss: dict[date, float] = defaultdict(float)

    for row in raw:
        sport = row["sport"]
        day = row["day"]
        tss = row["daily_tss"]

        if sport in sport_tss:
            # Accumulate in case multiple activities on same day (same sport)
            sport_tss[sport][day] = sport_tss[sport].get(day, 0.0) + tss

        # Always add to total regardless of sport
        total_tss[day] += tss

    # The returned window (athlete-local today, back `days` days)
    today = today_local()
    window_start = today - timedelta(days=days - 1)

    result: dict[str, list[dict]] = {
        "total": _series_for(dict(total_tss), window_start, today)
    }
    for sport in TRACKED_SPORTS:
        result[sport] = _series_for(sport_tss[sport], window_start, today)

    return result


def get_zones(profile: AthleteProfile) -> dict:
    """Compute available training zones from the athlete's current thresholds.

    Returns a dict with one or both of:
        - "power_zones": Coggan 7-zone dict (only if ftp_watts is set)
        - "pace_zones":  Seiler 3-zone dict (only if running_threshold_pace_ms is set)

    An empty dict is returned when no thresholds are configured.
    """
    result: dict = {}

    if profile.ftp_watts:
        result["power_zones"] = coggan_power_zones(profile.ftp_watts)

    if profile.running_threshold_pace_ms:
        result["pace_zones"] = seiler_3_zones_running(profile.running_threshold_pace_ms)

    return result


# ─── Forward projection — Recovery ETA (roadmap P0.3) ────────────────────────
# Rolls the same CTL/ATL EWMA forward under the athlete's PLANNED load
# (planned_workouts template base TSS; recent-average fallback for unplanned
# days) and reports when form (TSB) crosses back into "fresh" and "race-sharp".
# Uncertainty is expressed by running low/high input scenarios (±0.5 σ of the
# athlete's recent daily TSS around the planned input) — a transparent
# execution-variability band, not a confidence interval.

FRESH_TSB = -5.0       # "fully fresh" — form back near neutral
RACE_SHARP_TSB = 5.0   # "race-sharp" — form clearly positive


async def project_pmc_forward(
    db: AsyncSession,
    user_id: int,
    days_ahead: int = 10,
) -> dict:
    """Project CTL/ATL/TSB forward under planned load.

    Returns {
      "days": [{date, ctl, atl, tsb, tsb_low, tsb_high, planned_tss, source}],
      "fresh_on": iso date | None,        # first day TSB ≥ FRESH_TSB
      "race_sharp_on": iso date | None,   # first day TSB ≥ RACE_SHARP_TSB
      "already_fresh": bool,
      "basis": "plan" | "recent-average" | "mixed",
    } — or {"days": []} when there is no training history to seed from.
    """
    from statistics import mean, pstdev

    from sqlalchemy import select as _select

    from app.models.planned_workout import PlannedWorkout
    from app.services.mesocycle_generator import template_tss_estimate
    from app.services.training_load import calculate_tsb, update_ctl_atl

    history = await compute_user_pmc(db, user_id, days=90)
    rows = history.get("total") or []
    if not rows:
        return {"days": [], "fresh_on": None, "race_sharp_on": None,
                "already_fresh": False, "basis": "plan"}

    ctl = float(rows[-1]["ctl"])
    atl = float(rows[-1]["atl"])
    today_tsb = calculate_tsb(ctl, atl)

    recent_tss = [float(r.get("tss") or 0.0) for r in rows[-28:]]
    avg_daily = mean(recent_tss) if recent_tss else 0.0
    sd_daily = pstdev(recent_tss) if len(recent_tss) >= 7 else avg_daily * 0.5

    today = today_local()
    horizon = today + timedelta(days=days_ahead)
    plan_rows = await db.execute(
        _select(PlannedWorkout.date, PlannedWorkout.template_id)
        .where(
            PlannedWorkout.user_id == user_id,
            PlannedWorkout.date > today,
            PlannedWorkout.date <= horizon,
        )
    )
    planned_by_date: dict[date, float] = {}
    for d, template_id in plan_rows.all():
        # Bike, run AND strength template ids all resolve — non-bike ids used
        # to be silently dropped here (usability audit P0-5).
        est = template_tss_estimate(template_id)
        if est is not None:
            # A date may hold several planned sessions (e.g. ride + strength).
            planned_by_date[d] = planned_by_date.get(d, 0.0) + float(est)

    sources: set[str] = set()
    days: list[dict] = []
    # Three parallel scenarios: mid (planned), low input (fresher), high input.
    mid = (ctl, atl)
    lo = (ctl, atl)   # lower future TSS  → HIGHER tsb  (tsb_high)
    hi = (ctl, atl)   # higher future TSS → LOWER tsb   (tsb_low)
    fresh_on: str | None = None
    race_sharp_on: str | None = None

    for i in range(1, days_ahead + 1):
        d = today + timedelta(days=i)
        if d in planned_by_date:
            tss_mid = planned_by_date[d]
            sources.add("plan")
        else:
            tss_mid = avg_daily
            sources.add("recent-average")
        spread = min(0.5 * sd_daily, tss_mid) if tss_mid > 0 else 0.5 * sd_daily
        mid = update_ctl_atl(*mid, tss_mid)
        lo = update_ctl_atl(*lo, max(0.0, tss_mid - spread))
        hi = update_ctl_atl(*hi, tss_mid + spread)
        tsb_mid = calculate_tsb(*mid)
        days.append({
            "date": d.isoformat(),
            "ctl": round(mid[0], 1),
            "atl": round(mid[1], 1),
            "tsb": round(tsb_mid, 1),
            "tsb_high": round(calculate_tsb(*lo), 1),
            "tsb_low": round(calculate_tsb(*hi), 1),
            "planned_tss": round(tss_mid, 0),
            "source": "plan" if d in planned_by_date else "recent-average",
        })
        if fresh_on is None and tsb_mid >= FRESH_TSB:
            fresh_on = d.isoformat()
        if race_sharp_on is None and tsb_mid >= RACE_SHARP_TSB:
            race_sharp_on = d.isoformat()

    basis = "mixed" if len(sources) > 1 else (sources.pop() if sources else "plan")
    return {
        "days": days,
        "fresh_on": fresh_on,
        "race_sharp_on": race_sharp_on,
        "already_fresh": today_tsb >= FRESH_TSB,
        "basis": basis,
    }
