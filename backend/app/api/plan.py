"""Plan API — plan-engine v2 surfaces.

GET /plan/adaptations — the athlete-visible adaptation feed (Today slim card
+ Plan timeline). Returns newest-first rows with bilingual messages; the
client picks message_de/message_en by locale. RLS-protected via
``get_db_for_user``.

The interview + profile endpoints land with the build wave.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.services.plan_adaptation_log import recent_adaptations

router = APIRouter(prefix="/plan", tags=["plan"])


class PlanAdaptationRead(BaseModel):
    id: int
    created_at: str
    target_date: str
    source: str
    signal: str
    rule: str
    before: dict | None = None
    after: dict | None = None
    evidence: dict | None = None
    message_de: str
    message_en: str


class AdaptationFeed(BaseModel):
    adaptations: list[PlanAdaptationRead]


@router.get("/adaptations", response_model=AdaptationFeed, summary="Athlete-visible plan-adaptation feed")
async def get_adaptations(
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    days: Annotated[int, Query(ge=1, le=60)] = 14,
    limit: Annotated[int, Query(ge=1, le=100)] = 40,
) -> AdaptationFeed:
    rows = await recent_adaptations(db, user.id, days=days, limit=limit)
    return AdaptationFeed(
        adaptations=[
            PlanAdaptationRead(
                id=r.id,
                created_at=r.created_at.isoformat(),
                target_date=r.target_date.isoformat(),
                source=r.source,
                signal=r.signal,
                rule=r.rule,
                before=r.before,
                after=r.after,
                evidence=r.evidence,
                message_de=r.message_de,
                message_en=r.message_en,
            )
            for r in rows
        ]
    )
