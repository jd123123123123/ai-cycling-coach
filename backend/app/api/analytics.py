"""Analytics API — the data layer for the customizable chart builder.

Two endpoints:

  · GET  /analytics/datasets       — schema introspection for the builder UI
  · POST /analytics/query          — execute a QuerySpec, return rows + cols

RLS-protected via `get_db_for_user`, so even malformed specs can only see
the current user's data.
"""
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_active_user, get_db_for_user
from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.models.user import User
from app.schemas.analytics import QueryResult, QuerySpec
from app.schemas.period_report import PeriodReport
from app.schemas.race_debrief import RaceDebrief
from app.schemas.ride_compare import RideComparison
from app.schemas.session_report import SessionReport
from app.services.session_report import build_session_report
from app.schemas.form_progress import FormProgress
from app.services.form_progress import build_form_progress
from app.schemas.user_dashboard import ChartSpec
from app.services.chart_interpreter import ChartInterpretError, interpret_chart
from app.services.analytics_query import (
    QuerySpecError,
    execute_query,
    list_datasets,
)
from app.services.period_report import get_or_build_report
from app.services.race_debrief import get_or_build_debrief
from app.services.ride_compare import build_comparison
from app.services.detailed_power_profile import compute_detailed_power_profile
from app.services.power_profile_view import compute_power_profile_view
from app.services.tid_assessment import compute_training_distribution
from app.services.wbal_trace import compute_wbal_trace

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get(
    "/power-profile",
    summary="Athlete power profile — dense power-duration curve, CP/W′/eFTP, W/kg, durability",
)
async def get_power_profile(
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    lang: str = "en",
) -> dict:
    """Rich stream-derived power profile (dense MMP curve, peak powers, W/kg,
    durability, decoupling). Cycling-only and outlier-sanitized (audit P0-1).
    Includes the canonical threshold: `threshold_watts` (THE display number:
    manual FTP when set, else the sanitized model eFTP), `threshold_source`
    ('manual'|'model'), `model_valid` (CP/W′ display allowed) and `confidence`
    (0-1). `{available: false}` when no power streams exist yet so the UI can
    render an empty state. `?lang=de` localizes the athlete-facing phenotype
    prose (P1-6); `phenotype.key` stays locale-stable."""
    lang = "de" if lang.lower().startswith("de") else "en"
    profile = await compute_detailed_power_profile(db, _user.id, lang=lang)
    if profile is None:
        return {"available": False}
    return profile


@router.get(
    "/power-profile-view",
    summary="V3 Power Profile screen model — hero curve, zones, phenotype, cohort benchmark",
)
async def get_power_profile_view(
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    lang: str = "en",
) -> dict:
    """The V3 · Power Profile surface, card-for-card: hero mean-max curve with
    recent-PR flags, canonical FTP + W/kg + monthly progression, Coggan power
    zones, rider-type phenotype (+ training-consequence line), cohort benchmark
    bands and sprint/pedaling (durability + left/right balance). Built from the
    stored per-ride MMP curves (fast) with bounded raw-stream loads for
    durability/balance only. `{available: false}` when no power rides exist.
    `?lang=de` localizes athlete-facing prose (`phenotype.key` stays stable)."""
    return await compute_power_profile_view(db, _user.id, lang=lang)


@router.get(
    "/ride-counts",
    summary="Cycling ride counts: total, with power streams, with GPS",
)
async def get_ride_counts(
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """One honest denominator for every analytics surface (audit P0-5):
    `{total_rides, rides_with_power, rides_with_gps}` — cycling only, one SQL
    with FILTER clauses."""
    power_len = func.json_array_length(ActivityStream.streams.op("->")("power"))
    lat_len = func.json_array_length(ActivityStream.streams.op("->")("latitude"))
    stmt = (
        select(
            func.count(Activity.id).label("total_rides"),
            func.count(Activity.id).filter(power_len > 0).label("rides_with_power"),
            func.count(Activity.id)
            .filter(or_(ActivityStream.has_gps.is_(True), lat_len > 0))
            .label("rides_with_gps"),
        )
        .select_from(Activity)
        .outerjoin(ActivityStream, ActivityStream.activity_id == Activity.id)
        .where(Activity.user_id == _user.id, Activity.sport == "cycling")
    )
    row = (await db.execute(stmt)).one()
    return {
        "total_rides": int(row.total_rides or 0),
        "rides_with_power": int(row.rides_with_power or 0),
        "rides_with_gps": int(row.rides_with_gps or 0),
    }


@router.get(
    "/training-distribution",
    summary="Polarized↔pyramidal TID classification vs the phase-appropriate target",
)
async def get_training_distribution(
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    tid = await compute_training_distribution(db, _user.id)
    if tid is None:
        return {"available": False}
    return tid


@router.get(
    "/wbal-trace",
    summary="W′-balance trajectory of the most-depleting recent ride (anaerobic battery)",
)
async def get_wbal_trace(
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    trace = await compute_wbal_trace(db, _user.id)
    if trace is None:
        return {"available": False}
    return trace


@router.get("/datasets", summary="List available datasets and their columns")
async def get_datasets(
    _user: Annotated[User, Depends(get_current_active_user)],
) -> dict:
    return {"datasets": list_datasets()}


@router.post(
    "/query",
    response_model=QueryResult,
    summary="Execute an analytics QuerySpec",
)
async def post_query(
    spec: QuerySpec,
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> QueryResult:
    try:
        return await execute_query(db, spec)
    except QuerySpecError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


# ──────────────────────────────── AI summary ───────────────────────────────


class SummarizeRequest(BaseModel):
    """The frontend ships the chart spec + the rows it just rendered, so the
    LLM doesn't need to re-run the query and we don't pay roundtrip latency
    twice."""
    chart_title: str | None = Field(default=None, max_length=200)
    chart_mark: str = Field(max_length=20)
    rows: list[dict[str, Any]] = Field(default_factory=list, max_length=400)
    x_field: str
    y_field: str
    series_field: str | None = None


class SummarizeResponse(BaseModel):
    narrative: str
    model_used: str


_SUMMARY_SYSTEM = (
    "You are an endurance coach reviewing a chart the athlete just looked at. "
    "Write a concise 2-sentence narrative — what stands out, and a single "
    "actionable observation. Use plain, direct language. Mention the metric "
    "and time frame. Cite at most one number. No platitudes, no hedging, no "
    "emoji. Do not exceed 280 characters."
)


@router.post(
    "/summarize",
    response_model=SummarizeResponse,
    summary="Claude writes a 2-sentence narrative for a chart's data",
)
async def post_summarize(
    payload: SummarizeRequest,
    _user: Annotated[User, Depends(get_current_active_user)],
) -> SummarizeResponse:
    if not payload.rows:
        return SummarizeResponse(
            narrative="Not enough data yet to summarise this chart.",
            model_used="empty-input",
        )

    if not settings.ANTHROPIC_API_KEY:
        # Graceful: most-recent / extreme value, no Claude required.
        last = payload.rows[-1]
        first = payload.rows[0]
        y = payload.y_field
        delta = ""
        try:
            a = float(first.get(y) or 0)
            b = float(last.get(y) or 0)
            if a:
                delta = f" — change vs first point: {b - a:+.1f} ({(b - a) / a * 100:+.0f}%)"
        except Exception:  # noqa: BLE001
            pass
        return SummarizeResponse(
            narrative=(
                f"Latest {y} ≈ {last.get(y)} on {last.get(payload.x_field)}{delta}. "
                f"Connect Claude in backend/.env to enable richer summaries."
            ),
            model_used="rule-based-fallback",
        )

    # Trim rows to keep token budget tight; sample every-Nth so head and tail
    # both make it into the prompt.
    rows = payload.rows
    if len(rows) > 60:
        step = max(1, len(rows) // 60)
        rows = rows[::step] + [rows[-1]]

    user_msg = (
        f"Chart title: {payload.chart_title or 'Untitled'}\n"
        f"Mark type: {payload.chart_mark}\n"
        f"X axis: {payload.x_field}\n"
        f"Y axis: {payload.y_field}\n"
        + (f"Series: {payload.series_field}\n" if payload.series_field else "")
        + f"Sampled rows ({len(rows)} of {len(payload.rows)}):\n"
        + "\n".join(str(r) for r in rows)
    )

    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = await client.messages.create(
            model=settings.COACH_LIGHT_MODEL,
            max_tokens=200,
            system=[
                {
                    "type": "text",
                    "text": _SUMMARY_SYSTEM,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_msg}],
        )
        text = ""
        for block in getattr(response, "content", None) or []:
            block_text = getattr(block, "text", None)
            if block_text:
                text += block_text
        text = text.strip()
        if not text:
            raise RuntimeError("empty Claude response")
        return SummarizeResponse(narrative=text, model_used=settings.COACH_LIGHT_MODEL)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Chart summarise failed: %s", exc)
        # Same graceful fallback as the no-key path
        last = payload.rows[-1]
        return SummarizeResponse(
            narrative=(
                f"Latest {payload.y_field} ≈ {last.get(payload.y_field)} on "
                f"{last.get(payload.x_field)}. (AI summary failed; rule-based fallback shown.)"
            ),
            model_used="rule-based-fallback",
        )

@router.get(
    "/period-report",
    response_model=PeriodReport,
    summary="Periodized report card for the last N days vs the previous N days",
)
async def get_period_report(
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    days: int = 7,
    lang: str = "en",
) -> PeriodReport:
    if days < 3 or days > 365:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="days must be between 3 and 365",
        )
    lang = "de" if lang.lower().startswith("de") else "en"
    return await get_or_build_report(db, _user.id, days, lang)


@router.get(
    "/activity-debrief/{activity_id}",
    response_model=RaceDebrief,
    summary="Pro-grade deep analysis of a single ride",
)
async def get_activity_debrief(
    activity_id: int,
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    lang: str = "en",
) -> RaceDebrief:
    lang = "de" if lang.lower().startswith("de") else "en"
    report = await get_or_build_debrief(db, _user.id, activity_id, lang)
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No analyzable ride (with power streams) found for this activity.",
        )
    return report


@router.get(
    "/activity-debrief/{activity_id}/compare",
    response_model=RideComparison,
    summary="Head-to-head comparison against a crew-mate who rode the same ride",
)
async def get_activity_compare(
    activity_id: int,
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    lang: str = "en",
):
    lang = "de" if lang.lower().startswith("de") else "en"
    comparison = await build_comparison(db, _user.id, activity_id, lang)
    if comparison is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return comparison


@router.get(
    "/form-progress",
    response_model=FormProgress,
    summary="Latest ride judged against the athlete's fitness baseline (progress vs fatigue)",
)
async def get_form_progress(
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    lang: str = "en",
):
    lang = "de" if lang.lower().startswith("de") else "en"
    fp = await build_form_progress(db, _user.id, lang)
    if fp is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return fp


@router.get(
    "/activities/{activity_id}/session-report",
    response_model=SessionReport,
    summary="Rate one completed ride or run against its prescription",
)
async def get_session_report(
    activity_id: int,
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    lang: str = "en",
) -> SessionReport:
    lang = "de" if lang.lower().startswith("de") else "en"
    report = await build_session_report(db, _user.id, activity_id, lang)
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found.",
        )
    return report


class InterpretRequest(BaseModel):
    """A plain-English phrase describing the chart the user wants."""
    text: str = Field(min_length=1, max_length=400)


@router.post(
    "/interpret",
    response_model=ChartSpec,
    summary="Interpret a phrase into a ChartSpec (for the dashboard text-to-card flow)",
)
async def post_interpret(
    payload: InterpretRequest,
    _user: Annotated[User, Depends(get_current_active_user)],
) -> ChartSpec:
    # Stateless interpretation — no DB access here. The compiler enforces the
    # column allowlist + RLS when the resulting chart is actually rendered.
    try:
        return await interpret_chart(payload.text)
    except ChartInterpretError as exc:
        code = (
            status.HTTP_503_SERVICE_UNAVAILABLE
            if exc.code == "no_key"
            else status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        raise HTTPException(status_code=code, detail=str(exc)) from exc


@router.get("/breakthroughs")
async def get_breakthroughs(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    days: Annotated[int, Query(ge=1, le=14, description="Look-back window for recent rides")] = 2,
    locale: Annotated[str, Query(pattern="^(en|de)$")] = "en",
) -> list[dict]:
    """Physiology-grounded breakthroughs from recent rides (roadmap P1.2):
    power-curve PBs at downsampling-safe durations (>=60s, >=2% over the prior
    90-day best, >=5 prior powered rides) and eFTP model shifts (>=5 W)."""
    from app.services.breakthrough_detector import detect_breakthroughs

    return await detect_breakthroughs(db, current_user.id, recent_days=days, lang=locale)


@router.get("/weekly-wrapped")
async def get_weekly_wrapped(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    locale: Annotated[str, Query(pattern="^(en|de)$")] = "en",
) -> dict:
    """Weekly Wrapped payload — the seven WebGL story cards for last completed
    week: distance, elevation, effort-by-day, ride of the week (self-referential
    score), peak power (+ playful comparison), and a recap. Every number is real;
    metrics the data can't back are null so the client skips that card."""
    from app.services.weekly_wrapped import build_weekly_wrapped

    return await build_weekly_wrapped(db, current_user.id, lang=locale)


@router.get("/weekly-recap")
async def get_weekly_recap(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    locale: Annotated[str, Query(pattern="^(en|de)$")] = "en",
) -> dict:
    """The Monday-morning story payload (roadmap P1.3): last completed week's
    totals vs the week before, plan-vs-actual, fitness movement, breakthroughs
    inside the week, best ride, streak state. Self-referential only."""
    from app.services.weekly_recap import build_weekly_recap

    return await build_weekly_recap(db, current_user.id, lang=locale)
