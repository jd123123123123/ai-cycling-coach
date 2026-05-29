"""User dashboards CRUD — saved bento layouts of ChartSpecs.

  · GET    /dashboards          — list (lightweight)
  · POST   /dashboards          — create (enforces 15-chart-per-user cap)
  · GET    /dashboards/{id}     — read full dashboard
  · PUT    /dashboards/{id}     — replace name/layout/charts
  · DELETE /dashboards/{id}     — delete

RLS-protected via `get_db_for_user`. The 15-chart cap is enforced server-
side on create + update — the client UI also blocks beyond 15, but never
trust the client.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.models.user_dashboard import UserDashboard
from app.schemas.user_dashboard import (
    MAX_CHARTS_PER_USER,
    UserDashboardListItem,
    UserDashboardRead,
    UserDashboardWrite,
)

router = APIRouter(prefix="/dashboards", tags=["dashboards"])


async def _total_chart_count(db: AsyncSession, user_id: int, exclude_id: int | None = None) -> int:
    """Sum chart counts across this user's dashboards (RLS already filters)."""
    stmt = select(UserDashboard).where(UserDashboard.user_id == user_id)
    if exclude_id is not None:
        stmt = stmt.where(UserDashboard.id != exclude_id)
    result = await db.execute(stmt)
    total = 0
    for row in result.scalars():
        charts = row.charts or []
        if isinstance(charts, list):
            total += len(charts)
    return total


@router.get("", response_model=list[UserDashboardListItem])
async def list_dashboards(
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> list[UserDashboardListItem]:
    result = await db.execute(
        select(UserDashboard).order_by(
            func.coalesce(UserDashboard.updated_at, UserDashboard.created_at).desc()
        )
    )
    rows = list(result.scalars())
    return [
        UserDashboardListItem(
            id=r.id,
            name=r.name,
            description=r.description,
            chart_count=len(r.charts or []),
            updated_at=r.updated_at,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("", response_model=UserDashboardRead, status_code=status.HTTP_201_CREATED)
async def create_dashboard(
    payload: UserDashboardWrite,
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> UserDashboardRead:
    existing_total = await _total_chart_count(db, user.id)
    if existing_total + len(payload.charts) > MAX_CHARTS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Chart cap reached ({MAX_CHARTS_PER_USER} max per account). "
                f"You currently have {existing_total}."
            ),
        )

    dash = UserDashboard(
        user_id=user.id,
        name=payload.name,
        description=payload.description,
        layout=[item.model_dump() for item in payload.layout],
        charts=[c.model_dump() for c in payload.charts],
    )
    db.add(dash)
    await db.commit()
    await db.refresh(dash)
    return UserDashboardRead.model_validate(dash)


@router.get("/{dashboard_id}", response_model=UserDashboardRead)
async def get_dashboard(
    dashboard_id: int,
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> UserDashboardRead:
    result = await db.execute(
        select(UserDashboard).where(UserDashboard.id == dashboard_id)
    )
    dash = result.scalar_one_or_none()
    if dash is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")
    return UserDashboardRead.model_validate(dash)


@router.put("/{dashboard_id}", response_model=UserDashboardRead)
async def update_dashboard(
    dashboard_id: int,
    payload: UserDashboardWrite,
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> UserDashboardRead:
    result = await db.execute(
        select(UserDashboard).where(UserDashboard.id == dashboard_id)
    )
    dash = result.scalar_one_or_none()
    if dash is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")

    other_total = await _total_chart_count(db, user.id, exclude_id=dashboard_id)
    if other_total + len(payload.charts) > MAX_CHARTS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Chart cap reached ({MAX_CHARTS_PER_USER} max per account). "
                f"Other dashboards already use {other_total}."
            ),
        )

    dash.name = payload.name
    dash.description = payload.description
    dash.layout = [item.model_dump() for item in payload.layout]
    dash.charts = [c.model_dump() for c in payload.charts]

    await db.commit()
    await db.refresh(dash)
    return UserDashboardRead.model_validate(dash)


@router.delete("/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dashboard(
    dashboard_id: int,
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> None:
    result = await db.execute(
        sa_delete(UserDashboard).where(UserDashboard.id == dashboard_id)
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")
    await db.commit()
