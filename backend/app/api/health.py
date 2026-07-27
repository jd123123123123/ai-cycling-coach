"""GET /health/morning-check — morning-health early-warning (illness / downturn).

Reads the athlete's last ~28 days of ``daily_metrics`` (RLS-scoped), collapses
to one reading per calendar day, and runs the pure ``detect_morning_health``
cluster detector. Returns a localized, data-cited verdict the Today surface
renders as a warning card when ``level != 'none'`` (honest empty otherwise).
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.athlete_profile import AthleteProfile
from app.models.daily_metric import DailyMetric
from app.models.user import User
from app.schemas.morning_health import MorningHealthCheck, MorningHealthSignal
from app.services.athlete_time import set_athlete_tz_from_profile, today_local
from app.services.morning_health_detector import detect_morning_health

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/morning-check", response_model=MorningHealthCheck)
async def get_morning_health_check(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    locale: Annotated[
        Literal["en", "de"],
        Query(description="UI locale — 'en' (default) or 'de'."),
    ] = "en",
) -> MorningHealthCheck:
    """Assess today's morning wearable vitals for an illness / downturn cluster.

    Best-effort: any failure returns a clean ``level='none'`` rather than a 500 —
    an early-warning card must never break the Today load.
    """
    de = locale == "de"
    try:
        # Load the profile first — it defines the athlete's timezone, and
        # therefore what "today" even is (app.services.athlete_time contract:
        # endpoints computing dates outside a coach snapshot bind the tz
        # themselves). Previously this endpoint used ``date.today()``, i.e. the
        # SERVER's calendar day, which is a different day from the athlete's
        # for part of every 24h.
        prof_res = await db.execute(
            select(AthleteProfile).where(AthleteProfile.user_id == current_user.id)
        )
        set_athlete_tz_from_profile(prof_res.scalar_one_or_none())

        today = today_local()
        since = today - timedelta(days=30)
        res = await db.execute(
            select(DailyMetric)
            .where(
                DailyMetric.user_id == current_user.id,
                DailyMetric.recorded_at
                >= datetime(since.year, since.month, since.day, tzinfo=timezone.utc),
            )
            .order_by(DailyMetric.recorded_at.asc())
        )
        rows = res.scalars().all()

        # One reading per calendar day (latest row wins), ascending.
        by_day: dict[date, DailyMetric] = {}
        for m in rows:
            d = m.date or (m.recorded_at.date() if m.recorded_at else None)
            if d is not None:
                by_day[d] = m
        daily = [
            {
                "date": d,
                "rhr": by_day[d].resting_hr,
                "hrv": by_day[d].hrv_status,
                "respiration": by_day[d].respiration_avg,
                "spo2": by_day[d].spo2_avg,
                "sleep_score": by_day[d].sleep_score,
            }
            for d in sorted(by_day)
        ]

        # ── Staleness gate ───────────────────────────────────────────────────
        # `detect_morning_health` treats the LAST row it is given as "today"
        # and has no way to know when that row is from. The window above is 30
        # days wide with no recency filter, so a watch that stopped syncing
        # leaves its final row permanently cast as this morning's vitals.
        #
        # The consequence here is worse than a wrong stat: level != 'none'
        # renders a red/amber `role="alert"` early-warning card on the Today
        # tab telling the athlete "Deine Morgenwerte weichen leicht ab" /
        # "Rest today and listen to your body" — a live health warning derived
        # from a vitals cluster that may be a week old and long since resolved.
        # Observed live on 2026-07-27 against a newest row dated 2026-07-20.
        #
        # So: unless the newest reading is dated to the athlete's current local
        # day, we return the honest "no warning" verdict. This does not
        # suppress a genuine warning — a real cluster on a real today still
        # fires; it only refuses to assert a warning about a day we have no
        # data for. (The inverse risk — an athlete who IS ill today but whose
        # watch didn't sync — was never detectable either way: we have no
        # reading for today in that case.)
        if not daily or daily[-1]["date"] != today:
            last = daily[-1]["date"].isoformat() if daily else None
            logger.debug(
                "morning-health: stale vitals for user_id=%s (last reading %s, today %s)",
                current_user.id, last, today.isoformat(),
            )
            return MorningHealthCheck(level="none", signals=[], headline=None, recommendation=None)

        verdict = detect_morning_health(daily)
    except Exception:  # pragma: no cover — never break the Today load
        logger.exception("morning-health check failed for user_id=%s", current_user.id)
        return MorningHealthCheck(level="none", signals=[], headline=None, recommendation=None)

    return MorningHealthCheck(
        level=verdict["level"],
        signals=[MorningHealthSignal(**s) for s in verdict["signals"]],
        headline=verdict["headline_de" if de else "headline_en"],
        recommendation=verdict["recommendation_de" if de else "recommendation_en"],
    )
