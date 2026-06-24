"""Per-user tab card layouts.

  · GET /tab-layouts  — the caller's layout blob ({} when unset)
  · PUT /tab-layouts  — upsert (whole-blob replace)

One row per user. RLS-protected via get_db_for_user.
"""
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.models.user_tab_layout import UserTabLayout
from app.schemas.user_tab_layout import TabLayoutsPayload, TabLayoutsRead

router = APIRouter(prefix="/tab-layouts", tags=["tab-layouts"])


@router.get("", response_model=TabLayoutsRead)
async def get_tab_layouts(
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> TabLayoutsRead:
    result = await db.execute(select(UserTabLayout))
    row = result.scalar_one_or_none()
    return TabLayoutsRead(layouts=row.layouts if row else {})


@router.put("", response_model=TabLayoutsRead)
async def put_tab_layouts(
    payload: TabLayoutsPayload,
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> TabLayoutsRead:
    layouts = {
        tab: [c.model_dump() for c in cards] for tab, cards in payload.layouts.items()
    }
    result = await db.execute(select(UserTabLayout))
    row = result.scalar_one_or_none()
    if row is None:
        db.add(UserTabLayout(user_id=user.id, layouts=layouts))
    else:
        row.layouts = layouts
    await db.commit()
    return TabLayoutsRead(layouts=layouts)
