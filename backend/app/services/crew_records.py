"""Which rides in a crew feed set a personal record — batched for a whole page.

── WHY THIS EXISTS RATHER THAN A LOOP ──────────────────────────────────────

`breakthrough_detector.detect_breakthroughs` already answers this, and answers
it well: sanitised baselines, a minimum gain, and a corroboration rule that
kills the corrupt-power-file spike while still celebrating a real jump the
second time it is confirmed. But it answers for ONE user and reads ninety days
of mean-max curves to do it. A crew feed shows nine riders, and calling it per
member would be nine stream-heavy queries to decorate a list.

So this reads the same ninety days for EVERY member in one query, groups by
rider in Python, and applies the detector's own thresholds and helpers. The
rules are imported, not restated — a crew badge and the rider's own
breakthrough card must never disagree about the same ride, and they cannot if
there is only one set of constants.

── AND IT ONLY EVER SAYS YES ABOUT A RIDE ON THE PAGE ──────────────────────

The caller passes the feed's own activity ids. A record set three weeks ago is
true and is not news, and a badge is news.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.services.athlete_power_profile import reject_uncorroborated_peaks
from app.services.breakthrough_detector import (
    KEY_DURATIONS,
    MIN_PRIOR_RIDES,
    PB_MIN_GAIN_PCT,
    SUSPECT_GAIN_PCT,
    WINDOW_DAYS,
    _corroborated,
    _mmp_at,
)


async def records_for_rides(
    db: AsyncSession,
    *,
    user_ids: list[int],
    activity_ids: list[int],
    lang: str = "de",
) -> dict[int, dict[str, Any]]:
    """{activity_id → the best record that ride set}, for rides on the page.

    One row per activity even when a ride sets records at several durations:
    a card carries one chip, so the LONGEST duration wins. A twenty-minute
    best is a harder thing to do than a one-minute best, and if a ride took
    both, the twenty is what the rider will want said out loud.
    """
    if not user_ids or not activity_ids:
        return {}

    de = lang == "de"
    since = datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS + 7)

    rows = (
        await db.execute(
            select(
                Activity.id, Activity.user_id, Activity.started_at, ActivityStream.mmp_curve,
            )
            .join(ActivityStream, ActivityStream.activity_id == Activity.id)
            .where(
                Activity.user_id.in_(user_ids),
                Activity.sport == "cycling",
                Activity.started_at >= since,
                ActivityStream.mmp_curve.isnot(None),
            )
            .order_by(Activity.user_id, Activity.started_at)
        )
    ).all()

    by_rider: dict[int, list[dict[str, Any]]] = {}
    for act_id, uid, started, mmp in rows:
        if started is None:
            continue
        by_rider.setdefault(uid, []).append({"id": act_id, "started_at": started, "mmp": mmp})

    wanted = set(activity_ids)
    out: dict[int, dict[str, Any]] = {}

    for rides in by_rider.values():
        # Chronological, so "prior" really is prior. The query orders by
        # started_at already; this is the guarantee written down.
        rides.sort(key=lambda r: r["started_at"])
        for i, ride in enumerate(rides):
            if ride["id"] not in wanted:
                continue
            prior = rides[:i]
            if len(prior) < MIN_PRIOR_RIDES:
                continue

            for seconds, label_en, label_de in KEY_DURATIONS:
                now_w = _mmp_at(ride["mmp"], seconds)
                if now_w is None or now_w <= 0:
                    continue
                # Kept WITH their rides, so the card can say when the old best
                # was set — "ALT · MÄRZ" is the half of the comparison that
                # makes it a story rather than two numbers.
                prior_pairs = [
                    (v, p["started_at"])
                    for v, p in ((_mmp_at(p["mmp"], seconds), p) for p in prior)
                    if v
                ]
                prior_vals = [v for v, _ in prior_pairs]
                if len(prior_vals) < MIN_PRIOR_RIDES:
                    continue
                # Sanitised baseline: a corrupt prior spike must not set an
                # impossible bar that hides a real breakthrough.
                sanitized = reject_uncorroborated_peaks(prior_vals)
                if not sanitized:
                    continue
                best = max(sanitized)
                # The ride that actually held it. Newest wins a tie: if the
                # rider hit the same number twice, the recent one is the bar
                # they were riding against.
                held_at = max(
                    (d for v, d in prior_pairs if abs(v - best) < 1e-9),
                    default=None,
                )
                gain = (now_w - best) / best * 100 if best > 0 else 0.0
                if gain > SUSPECT_GAIN_PCT and not _corroborated(now_w, prior_vals):
                    continue
                if gain < PB_MIN_GAIN_PCT:
                    continue

                label = label_de if de else label_en
                # Longest duration wins — see the docstring.
                held = out.get(ride["id"])
                if held is None or seconds > held["duration_s"]:
                    out[ride["id"]] = {
                        "duration_s": seconds,
                        "value_w": round(now_w),
                        "prior_best_w": round(best),
                        "gain_pct": round(gain, 1),
                        "label": label,
                        "prior_best_at": held_at.date().isoformat() if held_at else None,
                    }

    return out
