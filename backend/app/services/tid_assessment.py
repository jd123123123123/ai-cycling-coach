"""Training-intensity-distribution assessment — wires live zones + phase into
the TID optimizer (polarized↔pyramidal classification + phase-aligned advice).
"""
from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.athlete_profile import AthleteProfile
from app.services.advanced_metrics import ctl_atl_tsb_snapshot, zone_distribution
from app.services.tid_optimizer import assess_tid
from app.services.training_periodization import detect_training_phase


def _goal_date(profile: AthleteProfile | None) -> date | None:
    if profile is None:
        return None
    # Prefer the dedicated column; fall back to the legacy goals JSON.
    if profile.target_event_date:
        return profile.target_event_date
    if isinstance(profile.goals, dict):
        ev = profile.goals.get("target_event")
        if isinstance(ev, dict) and ev.get("date"):
            try:
                return date.fromisoformat(str(ev["date"])[:10])
            except ValueError:
                return None
    return None


async def compute_training_distribution(db: AsyncSession, user_id: int) -> dict | None:
    """Classify the athlete's 14–28 d intensity distribution against the
    phase-appropriate target. None when there's no zone data yet."""
    zones = await zone_distribution(db, user_id, days=28)
    if not zones or zones.get("total_hours", 0) <= 0:
        return None

    pmc = await ctl_atl_tsb_snapshot(db, user_id)
    prof_res = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = prof_res.scalar_one_or_none()
    phase = detect_training_phase(_goal_date(profile), float(pmc.get("ctl", 0.0)))

    a = assess_tid(
        zones.get("z1_pct", 0.0),
        zones.get("z2_pct", 0.0),
        zones.get("z3_pct", 0.0),
        phase=phase,
    )
    return {
        "available": True,
        "model": a.model,
        "target": a.target,
        "aligned": a.aligned,
        "phase": phase,
        "z1_pct": a.z1_pct,
        "z2_pct": a.z2_pct,
        "z3_pct": a.z3_pct,
        "total_hours": zones.get("total_hours", 0.0),
        "recommendation": a.recommendation,
    }
