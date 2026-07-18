"""Training load API endpoints.

Exposes Performance Management Chart (PMC) data and training zones.
All endpoints are RLS-protected via get_db_for_user.
"""
from datetime import date as _date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.schemas.training_load import PMCEntry, PMCResponse
from app.services import pmc_service
from app.services.athlete_service import get_or_create_profile
from app.services.pmc_narratives import (
    build_pmc_narrative,
    fetch_daily_activity_summaries,
)

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
    language: Annotated[
        Literal["simple", "technical"],
        Query(description="Narrative tone: 'simple' (jargon-free) or 'technical'"),
    ] = "simple",
) -> PMCResponse:
    """Return CTL, ATL, and TSB time series for the authenticated athlete.

    Results include:
    - **total**: combined PMC across all sports (summed daily TSS → single EWMA)
    - **cycling / running / gym**: per-sport PMC series (independent EWMA per sport)

    Each entry in the **total** series is enriched with a `narrative` string — a
    plain-English 1-2 sentence summary of that day, generated rule-based from
    the activity data and PMC deltas. `language` controls the tone:
    `simple` (default) never mentions FTP/TSS/CTL/ATL/TSB jargon; `technical`
    cites them directly.

    Rest days cause CTL/ATL to decay correctly — no gaps in the series.
    Combined total CTL is derived from summed daily TSS, not the sum of per-sport CTLs.

    Per-sport sub-series have `narrative=None` (not in v1 — total is enough).
    """
    pmc_data = await pmc_service.compute_user_pmc(db, current_user.id, days)

    # Attach narratives to the total series.
    total_entries: list[PMCEntry] = _build_total_entries_with_narratives(
        raw_total=pmc_data["total"],
        activity_summaries=await _fetch_activity_window(db, current_user.id, pmc_data["total"]),
        language=language,
    )

    # Per-sport entries keep narrative=None in v1.
    def to_entries(series: list[dict]) -> list[PMCEntry]:
        return [PMCEntry(**row) for row in series]

    return PMCResponse(
        entries=total_entries,
        per_sport={
            sport: to_entries(pmc_data.get(sport, []))
            for sport in ("cycling", "running", "gym")
        },
    )


async def _fetch_activity_window(
    db: AsyncSession,
    user_id: int,
    raw_total: list[dict],
):
    """Fetch activity summaries for the date range covered by the total PMC series."""
    if not raw_total:
        return {}
    first_date: _date = raw_total[0]["date"]
    last_date: _date = raw_total[-1]["date"]
    return await fetch_daily_activity_summaries(db, user_id, first_date, last_date)


def _build_total_entries_with_narratives(
    *,
    raw_total: list[dict],
    activity_summaries: dict,
    language: Literal["simple", "technical"],
) -> list[PMCEntry]:
    """Build PMCEntry list with per-day narratives for the total series."""
    entries: list[PMCEntry] = []
    prev: dict | None = None
    for row in raw_total:
        activity = activity_summaries.get(row["date"])
        narrative = build_pmc_narrative(
            entry=row,
            prev_entry=prev,
            activity=activity,
            language=language,
        )
        entries.append(PMCEntry(**row, narrative=narrative))
        prev = row
    return entries


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


@router.get(
    "/recovery-eta",
    summary="Forward TSB projection — when the athlete is fresh / race-sharp again",
)
async def get_recovery_eta(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    days: Annotated[
        int,
        Query(ge=3, le=21, description="Projection horizon in days (default 10)"),
    ] = 10,
) -> dict:
    """Roll the CTL/ATL EWMA forward under the athlete's planned load (recent-
    average fallback for unplanned days) and report the first projected day of
    freshness (TSB ≥ −5) and race-sharpness (TSB ≥ +5), with a transparent
    execution-variability band per day (roadmap P0.3)."""
    return await pmc_service.project_pmc_forward(db, current_user.id, days_ahead=days)
