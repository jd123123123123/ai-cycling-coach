"""Readiness API — the decision, not the score.

  · GET /readiness/decision — today's session, what it WOULD have been without
    the measurements, and the one measured input that moved it.

RLS-protected via `get_db_for_user`. Read-only: this endpoint never modifies
the plan. The client applies the decision through the existing
``POST /workouts/today/modify``.
"""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.athlete_profile import AthleteProfile
from app.models.user import User
from app.schemas.readiness_decision import ReadinessDecisionRead
from app.services.readiness_decision import compute_readiness_decision

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/readiness", tags=["readiness"])


@router.get(
    "/decision",
    response_model=ReadinessDecisionRead,
    summary="Today's readiness decision, its counterfactual and its driver",
)
async def get_readiness_decision(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    lang: str = "de",
) -> ReadinessDecisionRead:
    """Readiness expressed as a decision that already happened, with its receipt.

    `session_now` is today's session after the measurements were applied;
    `session_planned` is what the plan said before them; `changed` says whether
    the measurement moved anything, and `driver` names the single input that
    moved it most, with its number in plain German.

    Honest absence is a real state: when the wearable is stale or has not
    synced this morning, `withheld` is true and `verdict` is NULL — the app's
    one readiness gate (`utils/readinessGate.ts`), ported in
    `services.readiness_decision`. `inputs` is still populated, with per-signal
    ages, so the client can show WHAT is stale. Signals with too little history
    carry `baseline: null` rather than a fabricated reference.
    """
    profile_res = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == current_user.id)
    )
    profile = profile_res.scalar_one_or_none()

    locale = "de" if str(lang).lower().startswith("de") else "en"
    return await compute_readiness_decision(
        db, current_user.id, profile, locale=locale
    )
