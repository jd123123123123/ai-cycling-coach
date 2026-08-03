"""Give a GPX-uploaded rehearsal its `actual` comparison retroactively.

`verdict_vs_actual.compare_to_actual` only ever ran for `source_kind="activity"`
rehearsals -- ones the athlete explicitly created FROM an already-ridden
activity. That path is real but rare: the primary way into this feature is
uploading a GPX before the event ("rehearse Saturday's ride"), and that
rehearsal was never revisited once the athlete actually rode it. Checked
against this app's own local data: every stored rehearsal so far is
`source_kind="gpx"`, and precisely none carry an `actual` block.

That silently starves `band_calibration.calibrate_spread`, which needs
completed comparisons to correct anything. A GPX-first user could rehearse
routes for a full season and never produce one data point the calibrator can
use -- the reasoned-default sigmas in `uncertainty.py` would never be checked
against this athlete's own outcomes.

This module closes the loop the other direction: when an activity finishes
syncing, look for GPX rehearsals it plausibly completes, and attach the
comparison then. Reuses `route_history.matches_route` -- the same
distance-AND-ascent test already used for the history card -- so a match here
means the same thing it means there.

Deliberately conservative:
  * only rehearsals with no `actual` yet are considered (never overwrites a
    comparison that already exists, whichever source produced it)
  * only rehearsals with a `band` are considered (an unpaced rehearsal has
    nothing numeric to compare against)
  * only activities within RETRO_MATCH_DAYS of the rehearsal's creation are
    considered -- a GPX uploaded in March and an unrelated ride in August
    sharing a distance is a coincidence, not a rehearsal being fulfilled
  * ties (more than one candidate activity) resolve to the CLOSEST start time
    to the rehearsal's creation, not the best time -- the point is "the ride
    this rehearsal was FOR", not the athlete's best effort on that road
"""
from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.route_rehearsal import RouteRehearsal
from app.services.rehearsal.route_history import matches_route
from app.services.rehearsal.verdict_vs_actual import compare_to_actual

logger = logging.getLogger(__name__)

#: A rehearsal created more than this many days before (or after) the
#: candidate activity is not "of" it -- see module docstring.
RETRO_MATCH_DAYS = 45
#: How many of the athlete's still-unmatched rehearsals to scan per activity.
#: Bounded so one sync cannot walk an unbounded rehearsal history.
MAX_CANDIDATES = 50


async def attach_actual_if_matching(db: AsyncSession, user_id: int, activity: Activity) -> int:
    """Try to complete any of this athlete's un-compared rehearsals with `activity`.

    Returns the number of rehearsals updated (0 or 1 in the overwhelming
    majority of cases; kept as a count rather than a bool because a bad GPX
    upload duplicate is possible and the caller may want to log it).

    Never raises: called from the sync path, where a rehearsal-matching bug
    must not fail the activity sync it rides along with.
    """
    if not activity.duration_seconds or activity.duration_seconds <= 0:
        return 0

    try:
        res = await db.execute(
            select(RouteRehearsal)
            .where(
                RouteRehearsal.user_id == user_id,
                RouteRehearsal.source_kind == "gpx",
            )
            .order_by(RouteRehearsal.created_at.desc())
            .limit(MAX_CANDIDATES)
        )
        candidates = [
            r
            for r in res.scalars().all()
            if (r.result or {}).get("band") and not (r.result or {}).get("actual")
        ]
    except Exception:  # pragma: no cover -- must not break activity sync
        logger.exception("retro rehearsal match failed for user_id=%s", user_id)
        return 0

    if not candidates:
        return 0

    started = getattr(activity, "started_at", None)
    matched: RouteRehearsal | None = None
    best_gap: timedelta | None = None
    for r in candidates:
        if not matches_route(
            ride_distance_m=activity.distance_meters,
            ride_ascent_m=getattr(activity, "elevation_gain_m", None),
            route_distance_m=r.distance_m,
            route_ascent_m=r.ascent_m,
        ):
            continue
        if started is not None:
            created = r.created_at
            gap = abs((started.replace(tzinfo=None) - created.replace(tzinfo=None)))
            if gap > timedelta(days=RETRO_MATCH_DAYS):
                continue
            if best_gap is None or gap < best_gap:
                matched, best_gap = r, gap
        elif matched is None:
            matched = r

    if matched is None:
        return 0

    result = dict(matched.result or {})
    band = result.get("band") or {}
    comparison = compare_to_actual(
        predicted_time_s=result.get("total_time_s"),
        actual_time_s=float(activity.duration_seconds),
        rehearsed_distance_m=matched.distance_m,
        actual_distance_m=activity.distance_meters,
        band_p10_s=band.get("p10_s"),
        band_p90_s=band.get("p90_s"),
    )
    if comparison is None:
        return 0

    from dataclasses import asdict

    result["actual"] = asdict(comparison)
    matched.result = result
    db.add(matched)
    return 1
