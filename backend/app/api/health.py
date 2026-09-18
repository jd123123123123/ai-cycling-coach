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
from app.services.morning_health_detector import verdict_for_rows

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

        # Abbildung UND Aktualitaetssperre liegen jetzt in
        # `verdict_for_rows`, weil derselbe Befund seit R7 auch heutige
        # Einheiten umschreibt. Zwei Kopien der Sperre waeren irgendwann
        # auseinandergelaufen -- und die Flaeche ohne Sperre waere die
        # gewesen, die in Trainingsplaene schreibt.
        verdict = verdict_for_rows(rows, today=today)
        if verdict["level"] == "none" and not verdict["signals"]:
            logger.debug(
                "morning-health: kein Befund fuer user_id=%s (heute %s)",
                current_user.id, today.isoformat(),
            )
    except Exception:  # pragma: no cover — never break the Today load
        logger.exception("morning-health check failed for user_id=%s", current_user.id)
        return MorningHealthCheck(level="none", polarity=None, signals=[], headline=None, recommendation=None)

    return MorningHealthCheck(
        level=verdict["level"],
        polarity=verdict.get("polarity"),
        signals=[MorningHealthSignal(**s) for s in verdict["signals"]],
        headline=verdict["headline_de" if de else "headline_en"],
        recommendation=verdict["recommendation_de" if de else "recommendation_en"],
    )
