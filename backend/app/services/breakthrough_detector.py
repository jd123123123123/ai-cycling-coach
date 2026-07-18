"""Breakthrough detection (roadmap P1.2).

Xert proved that celebration tied to real physiology is the only fun that
lands in serious training software — and that missed/false detections kill
the magic. So this detector is deliberately conservative:

- Durations ≥ 60 s only. Garmin details are downsampled beyond ~2h45m
  (maxChartSize), so sprint-range MMP values mix 1 s and >1 s sampling and
  would misfire in both directions. The short end is out of scope for v1.
- A PB must clear the prior 90-day best by ≥ 2 % (float jitter + smoothing
  guard), and the prior window must contain ≥ 5 powered rides — beating a
  near-empty history is progress, not a breakthrough.
- eFTP model shifts need ≥ 5 W upward movement vs the prior window's best.

Pure read-side service: no rows are written; the frontend decides how to
celebrate (and celebrates each breakthrough exactly once, client-side).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.activity_stream import ActivityStream

# Human-meaningful durations, all downsampling-safe (≥ 60 s).
KEY_DURATIONS: list[tuple[int, str, str]] = [
    (60, "1-min", "1-Minuten"),
    (300, "5-min", "5-Minuten"),
    (1200, "20-min", "20-Minuten"),
    (3600, "60-min", "60-Minuten"),
]
PB_MIN_GAIN_PCT = 2.0
EFTP_MIN_GAIN_W = 5.0
MIN_PRIOR_RIDES = 5
WINDOW_DAYS = 90


def _mmp_at(curve: dict | None, seconds: int) -> float | None:
    if not curve:
        return None
    v = curve.get(str(seconds), curve.get(seconds))
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


async def detect_breakthroughs(
    db: AsyncSession,
    user_id: int,
    recent_days: int = 2,
    lang: str = "en",
) -> list[dict[str, Any]]:
    """Compare each ride of the last `recent_days` against the athlete's prior
    90-day bests. Returns breakthroughs, newest first."""
    de = lang == "de"
    since = datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS + recent_days)

    rows = await db.execute(
        select(
            Activity.id, Activity.started_at, Activity.title,
            ActivityStream.mmp_curve, ActivityStream.eftp_watts,
        )
        .join(ActivityStream, ActivityStream.activity_id == Activity.id)
        .where(
            Activity.user_id == user_id,
            Activity.sport == "cycling",
            Activity.started_at >= since,
            ActivityStream.mmp_curve.isnot(None),
        )
        .order_by(Activity.started_at.asc())
    )
    rides = [
        {"id": r[0], "started_at": r[1], "title": r[2], "mmp": r[3], "eftp": r[4]}
        for r in rows.all()
    ]
    if not rides:
        return []

    recent_cutoff = datetime.now(timezone.utc) - timedelta(days=recent_days)
    out: list[dict[str, Any]] = []

    for i, ride in enumerate(rides):
        started = ride["started_at"]
        if started is None or started < recent_cutoff:
            continue
        prior = rides[:i]
        if len(prior) < MIN_PRIOR_RIDES:
            continue

        # Power-curve PBs at safe durations
        for seconds, label_en, label_de in KEY_DURATIONS:
            now_w = _mmp_at(ride["mmp"], seconds)
            if now_w is None or now_w <= 0:
                continue
            prior_vals = [v for v in (_mmp_at(p["mmp"], seconds) for p in prior) if v]
            if len(prior_vals) < MIN_PRIOR_RIDES:
                continue
            best = max(prior_vals)
            gain_pct = (now_w - best) / best * 100 if best > 0 else 0.0
            if gain_pct >= PB_MIN_GAIN_PCT:
                label = label_de if de else label_en
                out.append({
                    "kind": "power_pb",
                    "activity_id": ride["id"],
                    "date": started.date().isoformat(),
                    "duration_s": seconds,
                    "value_w": round(now_w),
                    "prior_best_w": round(best),
                    "gain_pct": round(gain_pct, 1),
                    "headline": (
                        f"{label}-Bestwert: {round(now_w)} W" if de
                        else f"{label} power PB: {round(now_w)} W"
                    ),
                    "detail": (
                        f"Alles aus den letzten 90 Tagen geschlagen ({round(best)} W) — deine Decke ist gerade gestiegen."
                        if de else
                        f"Beat everything from the last 90 days ({round(best)} W) — your ceiling just moved."
                    ),
                })

        # eFTP model shift
        eftp_now = ride["eftp"]
        prior_eftps = [p["eftp"] for p in prior if p["eftp"]]
        if eftp_now and len(prior_eftps) >= MIN_PRIOR_RIDES:
            best_eftp = max(prior_eftps)
            if eftp_now - best_eftp >= EFTP_MIN_GAIN_W:
                out.append({
                    "kind": "eftp_shift",
                    "activity_id": ride["id"],
                    "date": started.date().isoformat(),
                    "value_w": round(eftp_now),
                    "prior_best_w": round(best_eftp),
                    "gain_pct": round((eftp_now - best_eftp) / best_eftp * 100, 1),
                    "headline": (
                        f"Dein Motor ist gewachsen: eFTP {round(eftp_now)} W" if de
                        else f"Your engine grew: eFTP {round(eftp_now)} W"
                    ),
                    "detail": (
                        f"+{round(eftp_now - best_eftp)} W über deinem 90-Tage-Modell — kein Test, echte Fahrten."
                        if de else
                        f"+{round(eftp_now - best_eftp)} W over your 90-day model — no test, just real rides."
                    ),
                })

    out.sort(key=lambda b: b["date"], reverse=True)
    return out
