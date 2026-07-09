"""Find a crew-mate's ride that overlaps a reference ride ("rode it with me").

Authorization is by shared crew membership; cross-user Activity reads rely on
the app's owner-role RLS bypass (same mechanism as crew_score).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Activity, CrewMembership
from app.services.crew_score import _crew_member_user_ids


@dataclass(frozen=True)
class RivalMatch:
    rival_user_id: int
    rival_activity_id: int


def _delta_score(reference: Activity, cand: Activity, start_tol_s: int, dist_tol_pct: float) -> float | None:
    start_delta = abs((cand.started_at - reference.started_at).total_seconds())
    if start_delta > start_tol_s:
        return None
    ref_dist = float(reference.distance_meters or 0.0)
    cand_dist = float(cand.distance_meters or 0.0)
    if ref_dist <= 0 or cand_dist <= 0:
        return None
    dist_delta_pct = abs(cand_dist - ref_dist) / ref_dist
    if dist_delta_pct > dist_tol_pct:
        return None
    # Normalise both deltas to [0,1] and sum; lower is better.
    return start_delta / start_tol_s + dist_delta_pct / dist_tol_pct


def select_rival_activity(
    reference: Activity,
    candidates: list[Activity],
    *,
    start_tol_s: int = 5400,
    dist_tol_pct: float = 0.15,
) -> Activity | None:
    best: Activity | None = None
    best_score: float | None = None
    for cand in candidates:
        score = _delta_score(reference, cand, start_tol_s, dist_tol_pct)
        if score is None:
            continue
        if best_score is None or score < best_score:
            best, best_score = cand, score
    return best


async def find_rival_ride(db: AsyncSession, user_id: int, activity: Activity) -> RivalMatch | None:
    membership = (
        await db.execute(select(CrewMembership).where(CrewMembership.user_id == user_id))
    ).scalar_one_or_none()
    if membership is None:
        return None
    member_ids = [uid for uid in await _crew_member_user_ids(db, membership.crew_id) if uid != user_id]
    if not member_ids:
        return None
    window = timedelta(seconds=5400)
    rows = await db.execute(
        select(Activity).where(
            Activity.user_id.in_(member_ids),
            Activity.started_at >= activity.started_at - window,
            Activity.started_at <= activity.started_at + window,
        )
    )
    rival = select_rival_activity(activity, list(rows.scalars().all()))
    if rival is None:
        return None
    return RivalMatch(rival_user_id=rival.user_id, rival_activity_id=rival.id)
