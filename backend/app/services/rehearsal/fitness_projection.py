"""Rehearse the route against the fitness you will HAVE, not the one you have.

The question an athlete actually asks before entering an event is not "can I
ride this today" — it is "can I ride this in eight weeks, if I keep training
like this". Everything needed to answer that already exists: the Bayesian
fitness-fatigue projection in `performance_projection` produces a fitness-
equivalent FTP for a future date, with bands, from the athlete's own load
history.

This module is the adapter between that projection and a rehearsal: given a
dated route, it returns the CP to simulate with, or None.

Three deliberate refusals, all of which return None rather than a guess:

  * an undated route has no date to project TO;
  * a date in the past is not a projection, it is history;
  * a projection built on too little history returns no central estimate, and
    a projection with `samples_used` at zero is a prior, not a measurement.

None means the caller keeps today's measured CP and reports
`cp_is_projected=false`, so the surface can never imply it simulated a fitness
the athlete has no evidence for.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.services.performance_projection import (
    eftp_samples_from_activities,
    project_performance,
)

logger = logging.getLogger(__name__)

#: How much load history the projection is fitted on.
_HISTORY_DAYS = 120
#: How far back to look for the sustained efforts that anchor the scale.
_OBSERVATION_DAYS = 120
#: Beyond this the projection is extrapolation dressed as forecasting.
_MAX_HORIZON_DAYS = 365
#: Below this many eFTP samples the projection is essentially the prior.
_MIN_SAMPLES = 2


async def project_cp_for_date(
    db: AsyncSession,
    user_id: int,
    ride_date: date | None,
    current_cp_w: float | None,
    *,
    today: date | None = None,
) -> float | None:
    """Fitness-equivalent CP at `ride_date`, or None when we cannot say.

    Never raises: a projection failure must degrade a rehearsal to today's
    fitness, not fail the whole request.
    """
    today = today or date.today()
    if ride_date is None or current_cp_w is None or current_cp_w <= 0:
        return None
    days_out = (ride_date - today).days
    if days_out <= 0 or days_out > _MAX_HORIZON_DAYS:
        return None

    try:
        from app.services.pmc_service import compute_user_pmc

        pmc = await compute_user_pmc(db, user_id, days=_HISTORY_DAYS)
        past_daily_tss = [
            {"date": r["date"], "tss": float(r.get("tss") or 0.0)}
            for r in (pmc.get("total") or [])
        ]
        if not past_daily_tss:
            return None

        # Forward load: continue the athlete's own recent average rather than
        # inventing a training plan. "If you keep going as you have been" is
        # the honest premise, and it is the one the athlete assumed anyway.
        recent = [r["tss"] for r in past_daily_tss[-28:]]
        daily = (sum(recent) / len(recent)) if recent else 0.0
        future_daily_tss = [
            {"date": today + timedelta(days=i + 1), "tss": daily}
            for i in range(days_out)
        ]

        since = today - timedelta(days=_OBSERVATION_DAYS)
        res = await db.execute(
            select(Activity).where(
                Activity.user_id == user_id,
                Activity.started_at
                >= datetime(since.year, since.month, since.day, tzinfo=timezone.utc),
            )
        )
        observations = eftp_samples_from_activities(
            [
                {
                    "date": a.started_at.date(),
                    "normalized_power": a.normalized_power,
                    "duration_seconds": a.duration_seconds,
                }
                for a in res.scalars().all()
                if a.started_at is not None
            ],
            float(current_cp_w),
        )

        proj = project_performance(
            past_daily_tss,
            future_daily_tss,
            ftp_watts=float(current_cp_w),
            observations=observations,
            today=today,
            goal_date=ride_date,
        )
    except Exception:  # pragma: no cover — a rehearsal must survive this
        logger.exception("fitness projection failed for user_id=%s", user_id)
        return None

    central = proj.get("projected_central")
    if central is None or not isinstance(central, (int, float)) or central <= 0:
        return None
    if int(proj.get("samples_used") or 0) < _MIN_SAMPLES:
        # Not enough demonstrated efforts behind it: this is the model talking
        # to itself, and simulating a whole event off it would be a fiction.
        return None
    return float(central)
