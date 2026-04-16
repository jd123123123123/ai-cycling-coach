"""Training load API endpoints.

Exposes Performance Management Chart (PMC) data and training zones.
All endpoints are RLS-protected via get_db_for_user.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.schemas.training_load import PMCEntry, PMCResponse
from app.services import pmc_service
from app.services.athlete_service import get_or_create_profile

router = APIRouter(prefix="/training-load", tags=["training-load"])


@router.get(
    "/pmc",
    response_model=PMCResponse,
    summary="Performance Management Chart — CTL/ATL/TSB per sport and combined total",
)
async def get_pmc(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    days: Annotated[
        int,
        Query(ge=7, le=365, description="Number of days to include in PMC (default 90, max 365)"),
    ] = 90,
) -> PMCResponse:
    """Return CTL, ATL, and TSB time series for the authenticated athlete.

    Results include:
    - **total**: combined PMC across all sports (summed daily TSS → single EWMA)
    - **cycling / running / gym**: per-sport PMC series (independent EWMA per sport)

    Rest days cause CTL/ATL to decay correctly — no gaps in the series.
    Combined total CTL is derived from summed daily TSS, not the sum of per-sport CTLs.
    """
    pmc_data = await pmc_service.compute_user_pmc(db, current_user.id, days)

    def to_entries(series: list[dict]) -> list[PMCEntry]:
        return [PMCEntry(**row) for row in series]

    return PMCResponse(
        entries=to_entries(pmc_data["total"]),
        per_sport={
            sport: to_entries(pmc_data.get(sport, []))
            for sport in ("cycling", "running", "gym")
        },
    )


@router.get(
    "/zones",
    summary="Current training zones derived from athlete profile thresholds",
)
async def get_zones(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Return power zones and/or pace zones for the authenticated athlete.

    - **power_zones**: Coggan 7-zone model from current FTP (cycling)
    - **pace_zones**: Seiler 3-zone polarized model from threshold pace (running)

    Only returns zones where the required threshold is configured on the
    athlete profile. An empty object {} is returned when no thresholds are set.
    """
    profile = await get_or_create_profile(db, current_user.id)
    zones = pmc_service.get_zones(profile)
    return zones
