"""PMC (Performance Management Chart) service.

Bridges the database (activities table) with the pure sports science functions
in training_load.py. Responsibilities:
  - Aggregate daily TSS from the activities table (grouped by sport)
  - Gap-fill rest days in Python (not time_bucket_gapfill — unreliable with multi-sport GROUP BY)
  - Fan out per-sport and total PMC series via compute_pmc_series()
  - Compute training zones from athlete profile thresholds
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.athlete_profile import AthleteProfile
from app.services.training_load import (
    coggan_power_zones,
    compute_pmc_series,
    seiler_3_zones_running,
)

# Sports tracked independently in the PMC
TRACKED_SPORTS = ("cycling", "running", "gym")


async def get_daily_tss_by_sport(
    db: AsyncSession,
    user_id: int,
    days: int = 90,
) -> list[dict]:
    """Query daily TSS aggregated by sport from the activities hypertable.

    Uses date_trunc (not time_bucket_gapfill) — rest days are gap-filled
    in Python after this query so multi-sport GROUP BY works correctly.

    Args:
        db: Async SQLAlchemy session (already RLS-scoped to user_id).
        user_id: The authenticated user's ID.
        days: Number of days to look back from today (server-side constant).

    Returns:
        List of {"day": date, "sport": str, "daily_tss": float} for days
        where at least one activity with a non-null TSS was logged.
    """
    # f-string safe: `days` is a server-side integer constant, not user input
    # that could contain SQL.  user_id is bound via :user_id parameter.
    sql = text(f"""
        SELECT
            date_trunc('day', started_at)::date AS day,
            sport,
            SUM(tss)                             AS daily_tss
        FROM activities
        WHERE user_id = :user_id
          AND tss IS NOT NULL
          AND started_at >= NOW() - INTERVAL '{days} days'
        GROUP BY 1, 2
        ORDER BY 1, 2
    """)
    result = await db.execute(sql, {"user_id": user_id})
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


async def compute_user_pmc(
    db: AsyncSession,
    user_id: int,
    days: int = 90,
) -> dict:
    """Compute per-sport and combined-total PMC series for the authenticated user.

    Per-sport: each sport is computed independently from its own daily TSS.
    Total: summed daily TSS across ALL sports is fed through a single EWMA
           (NOT the sum of per-sport CTLs — that would be wrong).

    Rest days cause CTL/ATL to decay — gaps are filled with TSS=0 before
    calling compute_pmc_series().

    Returns:
        {
            "total":   [{"date", "ctl", "atl", "tsb", "tss"}, ...],
            "cycling": [...],
            "running": [...],
            "gym":     [...],
        }
        Any sport with no activities returns an empty list.
    """
    raw = await get_daily_tss_by_sport(db, user_id, days)

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

    # Determine the date range to cover (the full window requested)
    today = date.today()
    window_start = today - timedelta(days=days - 1)

    result: dict[str, list[dict]] = {}

    # --- Total PMC (summed daily TSS → single EWMA) ---
    if total_tss:
        all_dates = list(total_tss.keys())
        series_start = min(min(all_dates), window_start)
        series_end = max(max(all_dates), today)
        filled = _gap_fill_series(dict(total_tss), series_start, series_end)
        pmc_entries = compute_pmc_series(filled)
        # Attach daily TSS to each entry for charting
        tss_lookup = dict(total_tss)
        result["total"] = [
            {**e, "tss": tss_lookup.get(e["date"], 0.0)}
            for e in pmc_entries
        ]
    else:
        result["total"] = []

    # --- Per-sport PMC ---
    for sport in TRACKED_SPORTS:
        sport_dates = sport_tss[sport]
        if sport_dates:
            all_dates = list(sport_dates.keys())
            series_start = min(min(all_dates), window_start)
            series_end = max(max(all_dates), today)
            filled = _gap_fill_series(sport_dates, series_start, series_end)
            pmc_entries = compute_pmc_series(filled)
            result[sport] = [
                {**e, "tss": sport_dates.get(e["date"], 0.0)}
                for e in pmc_entries
            ]
        else:
            result[sport] = []

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
