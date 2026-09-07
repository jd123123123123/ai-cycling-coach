"""Form API — fitness / fatigue / form on the athlete's OWN time constants.

  · GET /analytics/form-projection

One endpoint. RLS-protected via ``get_db_for_user``, house style copied from
``app/api/analytics.py``.

What makes this different from every other PMC: the two time constants are
FITTED to this athlete (see ``app/services/form_projection.py``), and when they
cannot be fitted — or when the fit does not beat the population defaults once
its extra parameters are paid for — the payload says so in ``model`` and
``fallback_reason`` rather than dressing 42/7 up as a personal measurement.
"""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.schemas.form_projection import FormProjection
from app.services.form_projection import (
    DEFAULT_HORIZON_DAYS,
    MAX_HORIZON_DAYS,
    build_form_projection,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get(
    "/form-projection",
    response_model=FormProjection,
    summary="Fitness/fatigue/form with the athlete's own fitted time constants, projected forward",
)
async def get_form_projection(
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    horizon_days: int = Query(
        DEFAULT_HORIZON_DAYS,
        ge=1,
        le=MAX_HORIZON_DAYS,
        description="How many days forward to project (default 42 = six weeks).",
    ),
) -> FormProjection:
    """Today's fitness/fatigue/form plus a day-by-day forward projection, built
    on time constants fitted to THIS athlete's own load-versus-performance
    history rather than Coggan's population defaults (CTL 42 d / ATL 7 d).

    `model` is `"individual"` only when a Banister fit on the athlete's
    near-maximal 20-min power series beat 42/7 on AICc; otherwise `"standard"`
    and `fallback_reason` explains which honesty gate stopped it. `constants`
    carries both models' scores so the claim is checkable, and
    `standard_today` always ships the fixed-42/7 numbers for the same day.

    `confidence_pct` follows the app convention (`weeks.Projection`): below
    `confidence_threshold_pct` (30) a client must render a range, never a
    point — pre-resolved as `range_required`. Every projected day carries an
    80% band; `today` deliberately does not, because it is measured.

    Days the plan actually covers are `load_source: "plan"`; days it does not
    are `"recent-average"` and `load.assumption` states in words that nobody
    planned them. `{available: false}` with a `reason` when there is not enough
    history to answer at all — nothing is fabricated.
    """
    try:
        data = await build_form_projection(db, _user.id, horizon_days=horizon_days)
    except Exception:  # noqa: BLE001
        logger.exception("form projection failed for user_id=%s", _user.id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Form projection is temporarily unavailable",
        ) from None
    return FormProjection(**data)
