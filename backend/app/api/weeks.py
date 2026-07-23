"""Weeks API endpoint — GET /weeks/current.

Returns the current 7-day plan with a language-aware preface paragraph.

All routes are RLS-protected via get_db_for_user which sets the PostgreSQL
session variable app.current_user_id, enabling RLS policies on
planned_workouts and mesocycle_plans to filter rows by the authenticated user.

The endpoint is idempotent: calling it multiple times in the same week
does NOT create duplicate PlannedWorkout rows — the mesocycle generator
has a UniqueConstraint on (user_id, plan_start_date) and skips existing dates.
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.planned_workout import PlannedWorkout
from app.models.user import User
from app.models.daily_metric import DailyMetric
from app.schemas.weeks import (
    DayPlan,
    IntervalBlockOut,
    Language,
    MesoBlockContext,
    MissedRide,
    PlanChanges,
    Projection,
    Readiness,
    WeekResponse,
)
from app.services.advanced_metrics import ctl_atl_tsb_snapshot
from app.services.athlete_time import (
    day_local_window,
    local_date_of,
    set_athlete_tz_from_profile,
    today_local,
)
from app.services.mesocycle_generator import (
    MESO_LENGTH_WEEKS,
    generate_mesocycle,
    issurin_block_for_week,
    template_tss_estimate,
)
from app.services.weekly_recap import planned_week_total
from app.services.performance_projection import (
    eftp_samples_from_activities,
    project_performance,
)
from app.services.plan_change_explainer import detect_plan_changes, explain_plan_changes
from app.services.readiness_detector import detect_readiness
from app.services.training_periodization import _CATEGORY_CANDIDATES
from app.services.run_workout_templates import RUN_TEMPLATES
from app.services.weekly_plan_llm import personalize_week
from app.services.weekly_rationale import build_weekly_rationale
from app.services.workout_templates import TEMPLATES, get_template

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/weeks", tags=["weeks"])


# ──────────────────────────────────────────────────────────────────────────────
#  LLM-personalized-week cache (in-process TTL)
# ──────────────────────────────────────────────────────────────────────────────
#
# `personalize_week` is an Anthropic call (5–15s). Without a cache we paid it on
# EVERY GET /weeks/current, so opening the Train tab hung each time. This mirrors
# the CoachBrief 6h cache intent (get_or_generate_brief), but as a lightweight
# in-process dict keyed by (user_id, week_start_iso, language, locale):
#
#   • HIT  → skip the LLM entirely and overlay the cached titles/rationale/preface
#            onto the freshly rebuilt deterministic skeleton (cheap + deterministic).
#   • MISS → serve the deterministic skeleton immediately (never block the response
#            on the slow LLM) and refresh the cache in the BACKGROUND so the next
#            open is personalized. A slow/unavailable LLM therefore never delays a
#            response — the athlete just sees the deterministic week until the
#            personalization lands.
#
# week_offset > 0 is deterministic-only and never touches this cache.

_PERSONALIZED_WEEK_TTL_SECONDS = 6 * 3600  # ~6h, matching the coach-brief TTL intent
_PersonalizedKey = tuple[int, str, str, str]  # (user_id, week_start_iso, language, locale)
_personalized_week_cache: dict[_PersonalizedKey, tuple[float, dict]] = {}
_personalized_week_inflight: set[_PersonalizedKey] = set()
_personalized_week_bg_tasks: set[asyncio.Task] = set()
# Per-user cache generation — bumped by invalidate_personalized_week_cache so
# an in-flight background personalization of the OLD plan can never land its
# stale overlay after a rebuild.
_personalized_week_generation: dict[int, int] = {}


def _meso_evidence_dict(meso, key: str) -> dict | None:
    """Pull a dict payload (hours_note / progression) from meso evidence,
    tolerating None, non-dict evidence, and mocked meso objects."""
    evidence = getattr(meso, "evidence", None)
    if not isinstance(evidence, dict):
        return None
    value = evidence.get(key)
    return value if isinstance(value, dict) else None


def invalidate_personalized_week_cache(user_id: int) -> None:
    """Drop every cached/in-flight personalized week for this user.

    MUST be called by every server-side plan mutation (POST /plan/build,
    POST /plan/change/apply, POST /weeks/program, plan-adaptation engine
    writes): the cached overlay carries the OLD week's titles/templates/
    intervals keyed by date, so without this the UI keeps serving the old
    plan for up to 6h after the DB changed (review BLOCKER).
    """
    _personalized_week_generation[user_id] = (
        _personalized_week_generation.get(user_id, 0) + 1
    )
    for key in [k for k in _personalized_week_cache if k[0] == user_id]:
        _personalized_week_cache.pop(key, None)
    for key in [k for k in _personalized_week_inflight if k[0] == user_id]:
        _personalized_week_inflight.discard(key)


def _personalized_cache_get(key: _PersonalizedKey) -> dict | None:
    """Return the cached personalization if present and unexpired, else None."""
    entry = _personalized_week_cache.get(key)
    if entry is None:
        return None
    expires_at, payload = entry
    if expires_at < time.time():
        _personalized_week_cache.pop(key, None)
        return None
    return payload


def _personalized_cache_put(key: _PersonalizedKey, payload: dict) -> None:
    _personalized_week_cache[key] = (time.time() + _PERSONALIZED_WEEK_TTL_SECONDS, payload)


async def _refresh_personalized_week(
    key: _PersonalizedKey,
    skeleton: list[dict],
    llm_snapshot: dict,
    language: Language,
    locale: str,
    weekly_tss_target: int,
    generation: int | None = None,
) -> None:
    """Background task: run the LLM personalization and cache it for the next open.

    Never awaited by the request — a failure or slow LLM only means the next open
    stays deterministic. `personalize_week` takes plain data (no DB), so this is
    safe to run detached from the request's DB session. If the user's plan was
    invalidated while we ran (generation bumped), the stale result is dropped.
    """
    try:
        result = await personalize_week(
            skeleton,
            llm_snapshot,
            language=language,
            locale=locale,
            weekly_tss_target=weekly_tss_target,
        )
        current_gen = _personalized_week_generation.get(key[0], 0)
        if result is not None and (generation is None or generation == current_gen):
            _personalized_cache_put(key, result)
    except Exception:  # pragma: no cover — background best-effort
        logger.exception("background week personalization failed for key=%s", key)
    finally:
        _personalized_week_inflight.discard(key)


def _apply_personalization(days: list[DayPlan], preface: str, personalized: dict) -> str:
    """Overlay cached/LLM personalization onto the deterministic days by date.

    Returns the (possibly personalized) preface. Days are mutated in place; dates
    that have no personalized entry keep their deterministic copy.
    """
    by_date = {d.get("date"): d for d in personalized.get("days", [])}
    for dp in days:
        pd = by_date.get(dp.date.isoformat())
        if pd is None:
            continue
        dp.title = pd.get("title") or dp.title
        if pd.get("rationale"):
            dp.rationale = pd["rationale"]
        dp.template_id = pd.get("template_id") or dp.template_id
        dp.category = pd.get("category") or dp.category
        dp.target_tss = pd.get("target_tss", dp.target_tss)
        dp.duration_seconds_target = pd.get("duration_seconds_target", dp.duration_seconds_target)
        intervals = pd.get("intervals")
        if isinstance(intervals, list):
            dp.intervals = [
                IntervalBlockOut(
                    duration_seconds=blk.get("duration_seconds", 0),
                    power_target_pct_ftp=blk.get("power_target_pct_ftp"),
                    zone=blk.get("zone", 1),
                    reps=blk.get("reps"),
                    on_s=blk.get("on_s"),
                    off_s=blk.get("off_s"),
                    off_pct_ftp=blk.get("off_pct_ftp"),
                )
                for blk in intervals
            ]
    if personalized.get("preface"):
        preface = personalized["preface"]
    return preface


# ──────────────────────────────────────────────────────────────────────────────
#  Per-day deterministic rationale helper
# ──────────────────────────────────────────────────────────────────────────────

_DAY_RATIONALE_SIMPLE: dict[str, list[str]] = {
    "rest": [
        "Rest day — let the body absorb the recent work.",
        "Easy day — you've earned a break.",
        "Rest day — recovery is part of the training.",
        "Off day — staying fresh for the week ahead.",
        "Rest — muscles repair and grow stronger today.",
        "Recovery day — today the body does the real work.",
        "Light day — protect your energy for the week ahead.",
    ],
    "recovery": [
        "Easy spin to flush the legs and keep the body moving.",
        "Gentle ride — keep the heart rate low and enjoy it.",
        "Recovery ride — easy enough to chat the whole way.",
        "Light session — active recovery to stay loose.",
        "Easy spin — not every day needs to be hard.",
        "Short, easy ride to promote blood flow and recovery.",
        "Recovery day — easy legs, fresh mind.",
    ],
    "endurance": [
        "Long steady ride — the foundation of all endurance fitness.",
        "Aerobic base building — consistent effort, no burning.",
        "Steady endurance session — the engine room of your fitness.",
        "Base miles — the work that pays off in months, not days.",
        "Long and easy — the best fitness builder per hour of training.",
        "Aerobic ride — keep it conversational and cover the distance.",
        "Endurance session — steady effort and let the mileage do the talking.",
    ],
    "tempo": [
        "Comfortably hard — just below where it starts to hurt.",
        "Tempo effort — steady pressure that builds race fitness.",
        "Threshold-adjacent — a sustained push to lift your ceiling.",
        "Solid tempo work — challenging but completely doable.",
        "Sustained effort — the kind that makes you stronger in a few weeks.",
        "Tempo ride — focused, controlled, and effective.",
        "A quality session — hard enough to adapt, easy enough to recover fast.",
    ],
    "sweet_spot": [
        "Sweet spot — hard enough to build fitness, easy enough to do often.",
        "High-quality work in the productive middle ground.",
        "Sweet spot session — the most effective zone for time-crunched athletes.",
        "Sustained intervals — the bread and butter of structured training.",
        "Quality session — targeted effort that delivers fast fitness gains.",
        "Productive hard work — balanced effort for maximum adaptation.",
        "Sweet spot intervals — your main fitness builder for the week.",
    ],
    "threshold": [
        "Threshold session — holding the line between hard and very hard.",
        "Tough but targeted — exactly the stimulus needed right now.",
        "Hard intervals at your limit — this is where the fitness jumps come from.",
        "Threshold work — you'll feel it, but you'll recover quickly.",
        "Tough session — stay focused and hit the targets.",
        "Key quality session — the hardest effort of the week.",
        "Threshold intervals — controlled discomfort with big returns.",
    ],
    "vo2": [
        "Short hard efforts to lift your aerobic ceiling.",
        "VO2 work — brief, intense, and highly effective.",
        "Hard but short — your body adapts fast to these efforts.",
        "High-intensity intervals — the fastest route to a higher ceiling.",
        "Tough short work — you'll be glad you did it in a few weeks.",
        "Quality intervals — brief windows of real effort.",
        "Intense but short session — hard efforts to push your limits.",
    ],
}

_DAY_RATIONALE_TECHNICAL: dict[str, list[str]] = {
    "rest": [
        "Rest day — structural remodelling and glycogen supercompensation.",
        "Off day — parasympathetic recovery; CTL consolidates.",
        "Rest — ATL flush underway; HRV typically rebounds within 36h.",
        "Rest day — Friel recovery prescription.",
        "Full recovery — mitochondrial biogenesis peaks at rest.",
        "Rest — Banister model: fatigue decays, fitness holds.",
        "Off — maintain TSB target above -10 today.",
    ],
    "recovery": [
        "Recovery Z1 — flush the legs after high-load days; lactate clearance.",
        "Active recovery at ≤55% FTP — parasympathetic dominance maintained.",
        "Recovery ride — sub-threshold, RPE 2-3, no neuromuscular stress.",
        "Easy Z1-Z2 spin — keep EPOC minimal, protect ATL.",
        "Recovery session — sub-LT1 to support Issurin block transition.",
        "Low-stress ride — restore glycogen, flush metabolites.",
        "Recovery Z1 — short aerobic flush before the next hard block.",
    ],
    "endurance": [
        "Z2 aerobic base — Maffetone / San Millán: mitochondrial density stimulus.",
        "Long Z2 session — fat oxidation pathway; Seiler polarized cornerstone.",
        "Aerobic endurance — sub-LT1 for maximal aerobic enzyme adaptation.",
        "Z2 base miles — central cardiac stroke-volume adaptation.",
        "Friel base-phase cornerstone: sub-threshold aerobic accumulation.",
        "Endurance block — high volume sub-LT1 per Seiler polarized model.",
        "Z2 long ride — aerobic base; highest stimulus per training stress unit.",
    ],
    "tempo": [
        "Tempo Z3 — Friel tempo: between LT1 and LT2, high lactate steady-state.",
        "Sustained Z3 effort — sweet-spot adjacent, aerobic threshold stress.",
        "Tempo session — 76-90% FTP sustained; crosses LT1, spares LT2.",
        "Z3 tempo intervals — aerobic power ceiling lift.",
        "Friel build-phase tempo: raises LT1 without accumulating deep Z4-5 fatigue.",
        "Sustained tempo Z3 — prolonged lactate clearance adaptation.",
        "Tempo block — productive LT1-LT2 zone for fitness building.",
    ],
    "sweet_spot": [
        "Sweet spot 88-93% FTP — Coggan Z4 lower; highest TSS per hour with manageable ATL.",
        "Sweet-spot block — straddles LT2; deep aerobic and threshold adaptation.",
        "SS intervals — 88-93% FTP sustained; Friel build-phase key stimulus.",
        "Sweet spot Z3-Z4 — maximises training density; 2-3×/week recoverable.",
        "Classic sweet-spot session — 10-20% FTP below LT2 for maximum adaptation index.",
        "SS quality session — Coggan zone boundary work; high-yield density.",
        "Sweet-spot intervals — the most efficient adaptation stimulus in Friel build phases.",
    ],
    "threshold": [
        "Threshold Z4 — ~100% FTP sustained; LT2 stimulus, maximal aerobic power.",
        "LT2 intervals — Friel build stimulus: 95-105% FTP with full recovery between.",
        "Threshold session — 5-20min at FTP; neuromuscular and metabolic adaptation.",
        "Z4 threshold block — near-maximal lactate steady-state training.",
        "Classic threshold work — Coggan Z4 ceiling; builds FTP directly.",
        "Key Z4 session — highest single-session adaptation per Friel build protocol.",
        "Threshold intervals — LT2 stress with structured recovery.",
    ],
    "vo2": [
        "VO2max intervals Z5 — Coggan Z5 (106-120% FTP); raises aerobic ceiling.",
        "High-intensity Z5 block — Seiler 'hard day'; oxygen uptake ceiling stimulus.",
        "VO2 intervals — Billat / Seiler: 3-5min at Z5 accumulates VO2time.",
        "Z5 VO2max session — 110-120% FTP short intervals; aerobic ceiling lift.",
        "Classic VO2 work — 4-6x4min at 115% FTP per Friel build 2 protocol.",
        "VO2max stimulus — Coggan Z5; highest aerobic adaptation per session.",
        "Intense VO2 block — Z5 intervals for aerobic ceiling development.",
    ],
}


def _safe_float(value, default: float) -> float:
    """Coerce to float, falling back to default on None / non-numeric (guards
    against MagicMock profile attrs in tests and NULL columns in prod)."""
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _event_terrain(athlete) -> str | None:
    """Best-effort target-event terrain from the profile's goals JSON."""
    goals = getattr(athlete, "goals", None)
    if isinstance(goals, dict):
        te = goals.get("target_event")
        if isinstance(te, dict):
            terrain = te.get("terrain") or te.get("profile")
            if isinstance(terrain, str):
                return terrain
    return None


def _candidate_template_ids(
    category: str,
    ftp_w: int,
    skeleton_template_id: str | None,
) -> list[str]:
    """Template ids the LLM may choose for a day of the given session type.

    Sourced from the deterministic picker's `_CATEGORY_CANDIDATES`, FTP-gated
    the same way `pick_template` gates, and always including the skeleton's own
    pick so "keep it" validates. This whitelist is what `enforce_week_rails`
    validates the LLM's choice against — an invented id falls back to the
    skeleton pick.
    """
    ids: list[str] = []
    for tid in _CATEGORY_CANDIDATES.get(category, []):  # type: ignore[arg-type]
        tpl = TEMPLATES.get(tid)
        if tpl is None:
            continue
        if tpl.min_ftp_required is not None and (not ftp_w or ftp_w < tpl.min_ftp_required):
            continue
        ids.append(tid)
    if skeleton_template_id and skeleton_template_id in TEMPLATES and skeleton_template_id not in ids:
        ids.append(skeleton_template_id)
    return ids


def _per_day_rationale(
    category: str,
    day_index: int,
    language: Language,
) -> str:
    """Return a one-sentence per-day rationale for a workout category.

    Deterministic in Phase 7.0 — day_index selects from the 7-sentence bank
    so each day of the week gets distinct copy. No LLM; Phase 7.2 polishes.
    """
    bank = (
        _DAY_RATIONALE_TECHNICAL
        if language == "technical"
        else _DAY_RATIONALE_SIMPLE
    )
    sentences = bank.get(category, bank["endurance"])
    return sentences[day_index % len(sentences)]


def _localized_title(template_id: str | None, fallback: str, locale: str) -> str:
    """German template title for de-locale responses (read-time, additive).

    PlannedWorkout rows store the English template name (no locale exists at
    write time); the templates library carries ``name_de``, so de responses
    localize at serialization. Unknown ids / empty name_de keep the stored
    title unchanged.
    """
    if locale != "de" or not template_id:
        return fallback
    t = TEMPLATES.get(template_id)
    if t is not None and getattr(t, "name_de", ""):
        return t.name_de
    rt = RUN_TEMPLATES.get(template_id)
    if rt is not None and getattr(rt, "name_de", ""):
        return rt.name_de
    return fallback


def _build_day_plan(
    day_date: date,
    pw: PlannedWorkout | None,
    today: date,
    primary_sport: str,
    language: Language,
    locale: str = "en",
) -> DayPlan:
    """Build one DayPlan from a PlannedWorkout row (or a rest/gap day when None).

    Shared by the today-anchored current-week loop and the future-week preview
    so both surfaces derive category / TSS / intervals / rationale identically.
    """
    dow = day_date.weekday()
    if pw is not None:
        template_id = pw.template_id
        tmpl = get_template(template_id) if template_id else None
        category: str = tmpl.category if tmpl else "endurance"
        target_tss_val: int | None = int(round(tmpl.base_tss)) if tmpl else None

        interval_structure = pw.interval_structure or {}
        raw_intervals = interval_structure.get("intervals", [])
        # Structured-set backfill: persisted rows written before the composite
        # blocks carried reps/on_s/off_s (or by writers that project only
        # duration/pct/zone) still map 1:1 onto the template's block list, so
        # the real on/off structure can be re-attached from the library.
        tmpl_blocks = (
            tmpl.blocks if tmpl and len(tmpl.blocks) == len(raw_intervals) else None
        )
        intervals_out = []
        for i, blk in enumerate(raw_intervals):
            tb = tmpl_blocks[i] if tmpl_blocks else None
            pct = blk.get("power_target_pct_ftp")
            zone = blk.get("zone", 1)
            if tb is not None and tb.reps is not None:
                # %FTP is template-authoritative (never LLM/user data) — a
                # stored composite row may carry the old merged "average
                # watts" pct/zone; the library's ON-intensity is the truth.
                pct = tb.target_pct_ftp
                zone = tb.zone
            intervals_out.append(
                IntervalBlockOut(
                    duration_seconds=blk.get("duration_seconds", 0),
                    power_target_pct_ftp=pct,
                    zone=zone,
                    reps=blk.get("reps", tb.reps if tb else None),
                    on_s=blk.get("on_s", tb.on_s if tb else None),
                    off_s=blk.get("off_s", tb.off_s if tb else None),
                    off_pct_ftp=blk.get("off_pct_ftp", tb.off_pct_ftp if tb else None),
                )
            )
        return DayPlan(
            date=day_date,
            sport=pw.sport,
            title=_localized_title(template_id, pw.title, locale),
            template_id=template_id,
            duration_seconds_target=pw.duration_seconds_target,
            target_tss=target_tss_val,
            category=category,
            intervals=intervals_out,
            rationale=_per_day_rationale(category, dow, language),
            is_today=(day_date == today),
        )

    # Gap day — no PlannedWorkout exists for this date.
    return DayPlan(
        date=day_date,
        sport=primary_sport,
        title="Ruhetag" if locale == "de" else "Rest",
        template_id=None,
        duration_seconds_target=None,
        target_tss=None,
        category="rest",
        intervals=[],
        rationale=_per_day_rationale("rest", dow, language),
        is_today=(day_date == today),
    )


async def _detect_missed_yesterday(
    db: AsyncSession, user_id: int, today: date, locale: str
) -> MissedRide | None:
    """Yesterday's planned bike ride that went unridden.

    A ride is "missed" when yesterday held a real (non-rest) cycling
    PlannedWorkout AND yesterday's actual cycling TSS stayed below the same
    "attempted" floor the adaptation engine uses (``MISSED_DONE_TSS``). Planned
    rest days and ridden days both return None — only a genuine no-show
    surfaces, so the Today/Plan acknowledgment is honest, never punitive.
    """
    from app.services.plan_adaptation_engine import (
        MISSED_DONE_TSS,
        QUALITY_CATEGORIES,
    )

    yesterday = today - timedelta(days=1)
    rows = (
        await db.execute(
            select(PlannedWorkout).where(
                PlannedWorkout.user_id == user_id,
                PlannedWorkout.date == yesterday,
            )
        )
    ).scalars().all()
    bike_rows = [
        r for r in rows
        if (r.sport or "cycling") == "cycling"
        and (r.template_id or "") != "rest_day"
    ]
    # A planned real ride must carry a known template with non-trivial load.
    planned = None
    best_tss = -1.0
    for r in bike_rows:
        tmpl = get_template(r.template_id) if r.template_id else None
        if tmpl is None or tmpl.category == "rest":
            continue
        tss = float(tmpl.base_tss or 0.0)
        if tss > best_tss:
            best_tss, planned = tss, r
    if planned is None:
        return None

    # Yesterday's actual cycling load (athlete-local day window).
    start_utc, end_utc = day_local_window(yesterday)
    acts = (
        await db.execute(
            select(Activity).where(
                Activity.user_id == user_id,
                Activity.sport == "cycling",
                Activity.started_at >= start_utc,
                Activity.started_at < end_utc,
                Activity.tss.isnot(None),
            )
        )
    ).scalars().all()
    actual_tss = sum(float(a.tss or 0.0) for a in acts)
    if actual_tss >= MISSED_DONE_TSS:
        return None  # ridden (or close enough) — not a miss

    tmpl = get_template(planned.template_id)
    category = tmpl.category if tmpl else "endurance"
    target_tss = int(round(tmpl.base_tss)) if tmpl else None
    return MissedRide(
        date=yesterday.isoformat(),
        title=planned.title,
        title_de=(
            _localized_title(planned.template_id, planned.title, "de")
            if locale == "de" else None
        ),
        target_tss=target_tss,
        template_id=planned.template_id,
        category=category,
        is_quality=category in QUALITY_CATEGORIES,
    )


def deviation_window_start(today: date) -> date:
    """Start of the plan-deviation lookback window.

    Trailing 7 days, CLAMPED to the Monday of the current (athlete-local)
    week — "You skipped Tuesday" must never reference last week (usability
    audit P0-5). On a Monday the window is empty by design: everything the
    detector could cite would belong to last week.
    """
    return max(today - timedelta(days=7), today - timedelta(days=today.weekday()))


def _apply_secondary(
    dp: DayPlan, secondary: PlannedWorkout | None, locale: str = "en"
) -> None:
    """Attach the day's dual-sport secondary session (title + planned TSS)."""
    if secondary is None:
        return
    dp.secondary_title = _localized_title(
        secondary.template_id, secondary.title, locale
    )
    est = template_tss_estimate(
        secondary.template_id, secondary.duration_seconds_target
    )
    dp.secondary_target_tss = int(round(est)) if est is not None else None


async def _future_week_preview(
    *,
    db: AsyncSession,
    current_user: User,
    athlete: AthleteProfile,
    primary_sport: str,
    week_offset: int,
    current_monday: date,
    today: date,
    live_ctl: float | None,
    language: Language,
    locale: Literal["en", "de"],
) -> WeekResponse:
    """Build a FUTURE-week plan preview (week_offset > 0).

    The full Mon–Sun ``days`` list is materialized from the mesocycle covering
    the target week, with the correct phase / block position / weekly TSS target
    for THAT week. The now-only fields (projection, readiness, plan_changes) are
    null and no LLM personalization runs — a future week is a deterministic plan
    preview, not a live "today" surface. ``is_today`` is False on every day.
    """
    # Which meso covers the target week, and its position within that meso.
    meso_index = week_offset // MESO_LENGTH_WEEKS
    block_index_in_meso = week_offset % MESO_LENGTH_WEEKS
    target_week_start = current_monday + timedelta(days=week_offset * 7)
    target_week_end = target_week_start + timedelta(days=6)
    meso_anchor = current_monday + timedelta(days=meso_index * MESO_LENGTH_WEEKS * 7)

    # Generate (or return existing) the meso covering the target week. This also
    # materializes the 28 PlannedWorkout drafts, so the target week's rows exist.
    meso = await generate_mesocycle(
        db, current_user.id, plan_start_date=meso_anchor, current_ctl=live_ctl
    )

    meso_phase = meso.phase
    block_position = issurin_block_for_week(block_index_in_meso)
    tss_targets: list[int] = meso.weekly_tss_targets or []
    week_tss_target = (
        tss_targets[block_index_in_meso]
        if block_index_in_meso < len(tss_targets)
        else 0
    )
    seiler_dist = meso.seiler_distribution or {}
    seiler_z3_pct = float(seiler_dist.get("z3_pct", 0.15))

    # Fitness context for the preface is "now" — the athlete's current CTL frames
    # where the future week sits relative to today's fitness.
    pmc_snap = await ctl_atl_tsb_snapshot(db, current_user.id)
    ctl_now = float(pmc_snap.get("ctl") or 0.0)
    ctl_delta_7d = float(pmc_snap.get("ctl_7d_delta") or 0.0)

    target_event_date = athlete.target_event_date
    target_event_type = athlete.target_event_type
    days_to_event = (
        (target_event_date - today).days if target_event_date is not None else None
    )

    # Load the 7 PlannedWorkout rows for the target week (Mon..Sun).
    pw_result = await db.execute(
        select(PlannedWorkout)
        .where(
            PlannedWorkout.user_id == current_user.id,
            PlannedWorkout.date >= target_week_start,
            PlannedWorkout.date <= target_week_end,
        )
        .order_by(PlannedWorkout.date)
    )
    _all_pws = pw_result.scalars().all()
    # Dual-sport: multiple rows can share a date (bike + run). The PRIMARY
    # sport's row drives the day card; the other sport's session rides along
    # as secondary_title / secondary_target_tss instead of silently shadowing
    # (July 2026 fix + usability audit P0-5).
    pw_by_date: dict[date, PlannedWorkout] = {}
    secondary_by_date: dict[date, PlannedWorkout] = {}
    for pw in _all_pws:
        cur = pw_by_date.get(pw.date)
        if cur is None:
            pw_by_date[pw.date] = pw
        elif (pw.sport or "cycling") == primary_sport and (cur.sport or "cycling") != primary_sport:
            secondary_by_date[pw.date] = cur
            pw_by_date[pw.date] = pw
        else:
            secondary_by_date[pw.date] = pw

    days: list[DayPlan] = []
    for i in range(7):
        day_date = target_week_start + timedelta(days=i)
        pw = pw_by_date.get(day_date)
        # today never falls inside a future week, so is_today is uniformly False.
        dp = _build_day_plan(day_date, pw, today, primary_sport, language, locale)
        _apply_secondary(dp, secondary_by_date.get(day_date), locale)
        days.append(dp)

    # Mon–Sun planned total across ALL rows (incl. secondary) — the number the
    # frontend renders as the week's target.
    planned_tss_total = planned_week_total(_all_pws)

    preface = build_weekly_rationale(
        phase=meso_phase,
        block_position=block_position,
        block_index_in_meso=block_index_in_meso,
        weekly_tss_target=week_tss_target,
        ctl_now=ctl_now,
        ctl_delta_7d=ctl_delta_7d,
        days_to_event=days_to_event,
        target_event_type=target_event_type,
        seiler_z3_pct=seiler_z3_pct,
        language=language,
        locale=locale,
    )

    meso_block_ctx = MesoBlockContext(
        phase=meso_phase,
        block_position=block_position,
        block_index_in_meso=block_index_in_meso,
        weekly_tss_target=week_tss_target,
        days_to_event=days_to_event,
        target_event_type=target_event_type,
        hours_note=_meso_evidence_dict(meso, "hours_note"),
        progression=_meso_evidence_dict(meso, "progression"),
    )

    return WeekResponse(
        week_start=target_week_start,
        week_end=target_week_end,
        language=language,
        preface=preface,
        meso_block=meso_block_ctx,
        days=days,
        plan_changes=None,
        projection=None,
        readiness=None,
        planned_tss_total=planned_tss_total,
    )


# ──────────────────────────────────────────────────────────────────────────────
#  Endpoint
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/current", response_model=WeekResponse)
async def get_current_week(
    language: Annotated[
        Language,
        Query(description="Language mode: 'simple' (default) or 'technical'."),
    ] = "simple",
    locale: Annotated[
        Literal["en", "de"],
        Query(description="UI locale — 'en' (default) or 'de'."),
    ] = "en",
    week_offset: Annotated[
        int,
        Query(
            ge=0,
            le=12,
            description=(
                "Weeks ahead of the current week to preview. 0 (default) = the "
                "today-anchored current week with all live extras (projection, "
                "readiness, plan changes). >0 = a future Mon–Sun plan preview "
                "with those now-only fields nulled."
            ),
        ),
    ] = 0,
    db: AsyncSession = Depends(get_db_for_user),
    current_user: User = Depends(get_current_active_user),
) -> WeekResponse:
    """Return a planned week with rationale.

    ``week_offset=0`` (default) returns today + next 6 days with the full set of
    live extras. ``week_offset>0`` returns a future Mon–Sun plan preview built
    from the mesocycle covering that week, with the now-only fields
    (projection / readiness / plan_changes) set to null.

    Generates a mesocycle if the athlete does not have one for the target week.
    Idempotent: repeat calls within the same week return the same plan.
    RLS-scoped: each user sees only their own workouts.
    """
    # ── 1. Load athlete profile FIRST (it defines the athlete's timezone,
    #      and therefore what "today" even is) ────────────────────────────
    profile_result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == current_user.id)
    )
    athlete: AthleteProfile | None = profile_result.scalar_one_or_none()

    if athlete is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Complete your profile setup first",
            headers={"X-Error-Code": "profile_required"},
        )

    # ── 2. Compute today + week_start (Monday anchor) in ATHLETE-LOCAL time
    set_athlete_tz_from_profile(athlete)
    today = today_local()
    # current_monday = most recent Monday (Monday=0 in weekday())
    current_monday = today - timedelta(days=today.weekday())
    # For offset 0 the window anchors on today; the current-week code below
    # keeps using `week_start` as that Monday anchor.
    week_start = current_monday
    week_end = week_start + timedelta(days=6)

    # FTP guard — cycling primary only
    primary_sport = athlete.primary_sport or "cycling"
    ftp_w = athlete.ftp_watts or 0
    if primary_sport == "cycling" and ftp_w < 100:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Set your FTP before generating a plan",
            headers={"X-Error-Code": "ftp_required"},
        )

    # ── 3. Generate mesocycle (idempotent) ────────────────────────────────
    # Live CTL so the planner can tell a built athlete (→ taper near the event)
    # from an under-built one (→ keep peaking through the would-be taper).
    live_ctl: float | None = None
    try:
        from app.services.pmc_service import compute_user_pmc
        _pmc = await compute_user_pmc(db, current_user.id, days=90)
        _rows = _pmc.get("total") or []
        if _rows:
            live_ctl = float(_rows[-1].get("ctl") or 0.0)
    except Exception:  # pragma: no cover — degrade to proximity-only phase
        logger.exception("failed to load live CTL for mesocycle (user_id=%s)", current_user.id)

    # ── 3b. Future-week preview branch (offset > 0) ───────────────────────
    # A light-weight plan preview: the deterministic mesocycle skeleton for the
    # selected future week, with the now-only fields (projection / readiness /
    # plan_changes) nulled and no LLM personalization. offset=0 falls through to
    # the full today-anchored path below, UNCHANGED.
    if week_offset > 0:
        return await _future_week_preview(
            db=db,
            current_user=current_user,
            athlete=athlete,
            primary_sport=primary_sport,
            week_offset=week_offset,
            current_monday=current_monday,
            today=today,
            live_ctl=live_ctl,
            language=language,
            locale=locale,
        )

    try:
        meso = await generate_mesocycle(
            db, current_user.id, plan_start_date=week_start, current_ctl=live_ctl
        )
    except ValueError as exc:
        err = str(exc)
        if "ftp_watts" in err.lower() or "ftp" in err.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Set your FTP before generating a plan",
                headers={"X-Error-Code": "ftp_required"},
            ) from exc
        if "no athleteprofile" in err.lower() or "athlete" in err.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Complete your profile setup first",
                headers={"X-Error-Code": "profile_required"},
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Mesocycle generation failed: {err}",
        ) from exc

    # ── 4. PMC snapshot — CTL + 7d delta ─────────────────────────────────
    pmc_snap = await ctl_atl_tsb_snapshot(db, current_user.id)
    ctl_now = float(pmc_snap.get("ctl") or 0.0)
    ctl_delta_7d = float(pmc_snap.get("ctl_7d_delta") or 0.0)

    # ── 5. Event context ─────────────────────────────────────────────────
    target_event_date = athlete.target_event_date
    target_event_type = athlete.target_event_type
    days_to_event = (
        (target_event_date - today).days
        if target_event_date is not None
        else None
    )

    # ── 6. Meso block context ─────────────────────────────────────────────
    meso_phase = meso.phase
    # Current week's position within the meso (0..3 clamped)
    days_into_meso = (today.toordinal() - meso.plan_start_date.toordinal())
    block_index_in_meso = min(max(days_into_meso // 7, 0), 3)
    block_position = issurin_block_for_week(block_index_in_meso)

    tss_targets: list[int] = meso.weekly_tss_targets or []
    week_tss_target = (
        tss_targets[block_index_in_meso]
        if block_index_in_meso < len(tss_targets)
        else 0
    )

    seiler_dist = meso.seiler_distribution or {}
    seiler_z3_pct = float(seiler_dist.get("z3_pct", 0.15))

    # ── 7. Load the 7 PlannedWorkout rows (today..today+6) ───────────────
    pw_result = await db.execute(
        select(PlannedWorkout)
        .where(
            PlannedWorkout.user_id == current_user.id,
            PlannedWorkout.date >= today,
            PlannedWorkout.date <= today + timedelta(days=6),
        )
        .order_by(PlannedWorkout.date)
    )
    pws = pw_result.scalars().all()

    # Build a lookup: date → PlannedWorkout (for gap-filling). Dual-sport:
    # primary sport wins the day card; the other sport's session rides along
    # as secondary_title / secondary_target_tss.
    pw_by_date: dict[date, PlannedWorkout] = {}
    secondary_by_date: dict[date, PlannedWorkout] = {}
    for pw in pws:
        cur = pw_by_date.get(pw.date)
        if cur is None:
            pw_by_date[pw.date] = pw
        elif (pw.sport or "cycling") == primary_sport and (cur.sport or "cycling") != primary_sport:
            secondary_by_date[pw.date] = cur
            pw_by_date[pw.date] = pw
        else:
            secondary_by_date[pw.date] = pw

    # ── 8. Build DayPlan list — exactly 7, one per day ──────────────────
    days: list[DayPlan] = []
    for i in range(7):
        day_date = today + timedelta(days=i)
        pw = pw_by_date.get(day_date)
        dp = _build_day_plan(day_date, pw, today, primary_sport, language, locale)
        _apply_secondary(dp, secondary_by_date.get(day_date), locale)
        days.append(dp)

    # ── 8b. Weekly planned TSS — ONE producer (usability audit P0-5) ─────
    # Sum of ALL PlannedWorkout rows Mon–Sun of the DISPLAYED week (not the
    # today-anchored 7-day span), including dual-sport secondary rows, via
    # the same template estimator the weekly recap uses.
    week_rows_res = await db.execute(
        select(PlannedWorkout).where(
            PlannedWorkout.user_id == current_user.id,
            PlannedWorkout.date >= week_start,
            PlannedWorkout.date <= week_end,
        )
    )
    planned_tss_total = planned_week_total(week_rows_res.scalars().all())

    # ── 8c. Yesterday's planned-but-missed bike ride (honest, non-guilt) ──
    try:
        missed_yesterday = await _detect_missed_yesterday(
            db, current_user.id, today, locale
        )
    except Exception:  # pragma: no cover — a miss check must never break the week
        logger.exception("missed-yesterday detection failed for user_id=%s", current_user.id)
        missed_yesterday = None

    # ── 9. Weekly preface from rationale service (deterministic default) ──
    preface = build_weekly_rationale(
        phase=meso_phase,
        block_position=block_position,
        block_index_in_meso=block_index_in_meso,
        weekly_tss_target=week_tss_target,
        ctl_now=ctl_now,
        ctl_delta_7d=ctl_delta_7d,
        days_to_event=days_to_event,
        target_event_type=target_event_type,
        seiler_z3_pct=seiler_z3_pct,
        language=language,
        locale=locale,
    )

    # ── 9-readiness. Illness / overtraining / readiness signal ────────────
    # Rolling ln(RMSSD) + resting-HR baselines from the athlete's OWN history.
    # Best-effort: any failure leaves readiness_dict=None (never breaks response).
    readiness_dict: dict | None = None
    readiness_out: Readiness | None = None
    try:
        dm_res = await db.execute(
            select(DailyMetric)
            .where(
                DailyMetric.user_id == current_user.id,
                DailyMetric.recorded_at
                >= datetime(
                    (today - timedelta(days=30)).year,
                    (today - timedelta(days=30)).month,
                    (today - timedelta(days=30)).day,
                    tzinfo=timezone.utc,
                ),
            )
            .order_by(DailyMetric.recorded_at.asc())
        )
        dm_rows = dm_res.scalars().all()
        # Collapse to one reading per calendar day (latest wins), ascending.
        by_day: dict[date, DailyMetric] = {}
        for m in dm_rows:
            d = m.date or (m.recorded_at.date() if m.recorded_at else None)
            if d is not None:
                by_day[d] = m
        daily_readiness = [
            {"date": d, "hrv": by_day[d].hrv_status, "rhr": by_day[d].resting_hr}
            for d in sorted(by_day)
        ]
        if daily_readiness:
            readiness_dict = detect_readiness(daily_readiness)
            if readiness_dict.get("status") != "unknown":
                readiness_out = Readiness(
                    status=readiness_dict["status"],
                    reason=readiness_dict["reason_de" if locale == "de" else "reason_en"],
                    suggest_easy=bool(readiness_dict.get("suggest_easy")),
                )
    except Exception:  # pragma: no cover — never break the week response
        logger.exception("readiness detection failed for user_id=%s", current_user.id)

    # ── 9a. Change detection — planned vs actual over the trailing 7 days ──
    # SKIPPED / UNDERTRAINED / OVERTRAINED, so the plan-change message reflects
    # what actually happened. Best-effort: any failure leaves plan_changes=None.
    plan_changes: PlanChanges | None = None
    atl_now = float(pmc_snap.get("atl") or 0.0)
    acwr = (atl_now / ctl_now) if ctl_now > 0 else None
    actual_week_tss = 0.0
    planned_week_tss = 0.0
    activity_count_7d = 0
    try:
        # Deviation window: trailing 7 days, CLAMPED to the Monday of the
        # current athlete-local week — "You skipped Tuesday" must never
        # reference last week (usability audit P0-5).
        win_start = deviation_window_start(today)
        past_pw_res = await db.execute(
            select(PlannedWorkout).where(
                PlannedWorkout.user_id == current_user.id,
                PlannedWorkout.date >= win_start,
                PlannedWorkout.date < today,
            )
        )
        past_pws = past_pw_res.scalars().all()
        planned_days: list[dict] = []
        for pw in past_pws:
            tmpl = get_template(pw.template_id) if pw.template_id else None
            planned_days.append({
                "date": pw.date.isoformat(),
                "dow": pw.date.weekday(),
                "category": tmpl.category if tmpl else "endurance",
                "planned_tss": float(tmpl.base_tss) if tmpl else 0.0,
            })

        # Athlete-local day window: [win_start 00:00 local, today 00:00 local)
        # as UTC bounds, and bucket each activity by its athlete-local day.
        act_res = await db.execute(
            select(Activity).where(
                Activity.user_id == current_user.id,
                Activity.started_at >= day_local_window(win_start)[0],
                Activity.started_at < day_local_window(today)[0],
            )
        )
        actual_by_date: dict[str, float] = {}
        for a in act_res.scalars().all():
            if a.started_at is None:
                continue
            key = local_date_of(a.started_at).isoformat()
            actual_by_date[key] = actual_by_date.get(key, 0.0) + float(a.tss or 0.0)
            activity_count_7d += 1

        detection = detect_plan_changes(planned_days, actual_by_date, acwr=acwr)
        planned_week_tss = detection["planned_week_tss"]
        actual_week_tss = detection["actual_week_tss"]

        # Skeleton dicts (parallel to `days`) drive both the plan-change message
        # (which references the CURRENT week's rest/quality days) and the LLM
        # personalization below.
        skeleton = [
            {
                "dow": dp.date.weekday(),
                "date": dp.date.isoformat(),
                "is_today": dp.is_today,
                "session_type": dp.category,
                "category": dp.category,
                "is_rest": dp.category == "rest",
                "template_id": dp.template_id,
                "title": dp.title,
                "rationale": dp.rationale,
                "target_tss": dp.target_tss,
                "duration_minutes": (
                    int(round(dp.duration_seconds_target / 60))
                    if dp.duration_seconds_target else None
                ),
                "available_templates": _candidate_template_ids(
                    dp.category, ftp_w, dp.template_id
                ),
            }
            for dp in days
        ]

        explained = explain_plan_changes(
            detection,
            current_skeleton=skeleton,
            weekly_tss_target=week_tss_target,
            de=(locale == "de"),
            readiness=readiness_dict,
        )
        if explained is not None:
            plan_changes = PlanChanges(**explained)
    except Exception:  # pragma: no cover — never break the week response
        logger.exception("plan-change detection failed for user_id=%s", current_user.id)
        skeleton = [
            {
                "dow": dp.date.weekday(),
                "date": dp.date.isoformat(),
                "is_today": dp.is_today,
                "session_type": dp.category,
                "category": dp.category,
                "is_rest": dp.category == "rest",
                "template_id": dp.template_id,
                "title": dp.title,
                "rationale": dp.rationale,
                "target_tss": dp.target_tss,
                "duration_minutes": (
                    int(round(dp.duration_seconds_target / 60))
                    if dp.duration_seconds_target else None
                ),
                "available_templates": _candidate_template_ids(
                    dp.category, ftp_w, dp.template_id
                ),
            }
            for dp in days
        ]

    # ── 9b. LLM personalization (creative, individual — WITHIN the rails) ──
    # On success we adopt the personalized titles/rationale/preface and the
    # rail-enforced template/duration/TSS. On ANY failure or missing API key,
    # `personalize_week` returns None and we keep the deterministic skeleton.
    llm_snapshot = {
        "athlete": {
            "goal_target": target_event_type or "your goal",
            "goal_event_type": target_event_type,
            "event_terrain": _event_terrain(athlete),
            "days_to_goal": days_to_event,
            "goal_phase": meso_phase,
            "hours_per_day": round(
                _safe_float(getattr(athlete, "weekly_hours_available", None), 8.0) / 7.0, 1
            ),
            "primary_sport": primary_sport,
            "secondary_sport": (
                sec if isinstance(sec := getattr(athlete, "secondary_sport", None), str) else None
            ),
            "ftp": ftp_w,
        },
        "pmc": {
            "ctl": ctl_now,
            "atl": atl_now,
            "tsb": float(pmc_snap.get("tsb") or 0.0),
            "ctl_7d_delta": ctl_delta_7d,
        },
        "recent_load": {
            "activity_count": activity_count_7d,
            "actual_tss": actual_week_tss,
            "planned_tss": planned_week_tss,
        },
        "plan_deviation": (
            {"status": plan_changes.status, "detail": plan_changes.message}
            if plan_changes is not None else None
        ),
    }

    # Cache-first: a hit overlays cached personalization and skips the LLM; a miss
    # serves deterministic now and refreshes the cache in the background (deduped),
    # so we never block this response on the 5–15s Anthropic call.
    personalized_key: _PersonalizedKey = (
        current_user.id, week_start.isoformat(), language, locale
    )
    personalized = _personalized_cache_get(personalized_key)
    if personalized is not None:
        preface = _apply_personalization(days, preface, personalized)
    elif personalized_key not in _personalized_week_inflight:
        _personalized_week_inflight.add(personalized_key)
        _bg_task = asyncio.create_task(
            _refresh_personalized_week(
                personalized_key,
                skeleton,
                llm_snapshot,
                language,
                locale,
                week_tss_target,
                generation=_personalized_week_generation.get(current_user.id, 0),
            )
        )
        _personalized_week_bg_tasks.add(_bg_task)
        _bg_task.add_done_callback(_personalized_week_bg_tasks.discard)

    # ── 9c. Performance projection with confidence bands ──────────────────
    # Bayesian Fitness-Fatigue projection to the goal (or ~12 wks). Past daily
    # TSS drives the fitness/fatigue convolutions; the plan's forward weekly TSS
    # target extends them; eFTP samples from sustained efforts fit the scale.
    # Best-effort — any failure leaves projection=None.
    projection_out: Projection | None = None
    try:
        from app.services.pmc_service import compute_user_pmc

        _pmc_full = await compute_user_pmc(db, current_user.id, days=120)
        past_daily_tss = [
            {"date": r["date"], "tss": float(r.get("tss") or 0.0)}
            for r in (_pmc_full.get("total") or [])
        ]

        # Forward plan: spread the week's TSS target evenly. When a goal event
        # exists the horizon runs TO THE EVENT DATE — the "N Tage" chip and the
        # projection end must never contradict (review finding: event 137 days
        # out, projection stopping at a fixed 12 weeks). No event → 12-week
        # default. Safety cap: one year.
        horizon_days = 84
        if days_to_event is not None and days_to_event > 0:
            horizon_days = min(days_to_event, 365)
        daily_target = (week_tss_target / 7.0) if week_tss_target else 0.0
        future_daily_tss = [
            {"date": today + timedelta(days=i + 1), "tss": daily_target}
            for i in range(horizon_days)
        ]

        # eFTP observation series from sustained hard efforts (last 120 days).
        obs_win_start = today - timedelta(days=120)
        obs_res = await db.execute(
            select(Activity).where(
                Activity.user_id == current_user.id,
                Activity.started_at
                >= datetime(obs_win_start.year, obs_win_start.month, obs_win_start.day, tzinfo=timezone.utc),
            )
        )
        obs_activities = [
            {
                "date": a.started_at.date() if a.started_at else None,
                "normalized_power": a.normalized_power,
                "duration_seconds": a.duration_seconds,
            }
            for a in obs_res.scalars().all()
            if a.started_at is not None
        ]
        observations = eftp_samples_from_activities(obs_activities, ftp_w)

        if past_daily_tss:
            proj = project_performance(
                past_daily_tss,
                future_daily_tss,
                ftp_watts=float(ftp_w),
                observations=observations,
                today=today,
                goal_date=target_event_date,
                de=(locale == "de"),
            )
            projection_out = Projection(**proj)
    except Exception:  # pragma: no cover — never break the week response
        logger.exception("performance projection failed for user_id=%s", current_user.id)

    # ── 10. Assemble response ─────────────────────────────────────────────
    meso_block_ctx = MesoBlockContext(
        phase=meso_phase,
        block_position=block_position,
        block_index_in_meso=block_index_in_meso,
        weekly_tss_target=week_tss_target,
        days_to_event=days_to_event,
        target_event_type=target_event_type,
        hours_note=_meso_evidence_dict(meso, "hours_note"),
        progression=_meso_evidence_dict(meso, "progression"),
    )

    return WeekResponse(
        week_start=week_start,
        week_end=week_end,
        language=language,
        preface=preface,
        meso_block=meso_block_ctx,
        days=days,
        plan_changes=plan_changes,
        projection=projection_out,
        readiness=readiness_out,
        planned_tss_total=planned_tss_total,
        missed_yesterday=missed_yesterday,
    )


# ─── Builder programs (July 2026): per-sport Bike + Run focus ────────────────
# Pick a named focus program PER SPORT. Bike → the plan regenerates from this
# week with the program's weekly skeleton (mesocycle hook). Run → the next 14
# days of run PlannedWorkout rows are written directly (deterministic
# Tue/Thu/Sat scheduler); full run-meso integration is the dual-sport
# follow-up.


from pydantic import BaseModel as _PBaseModel

_BIKE_PROGRAM_CHOICES = ("ftp_builder", "vo2_builder", "endurance_200k")
_RUN_PROGRAM_CHOICES = ("run_5k_speed", "run_10k_builder", "run_endurance_hm")


class ProgramSelect(_PBaseModel):
    # 'race' / 'none' both clear the sport's program (back to the race plan).
    program: Literal[
        "race", "none",
        "ftp_builder", "vo2_builder", "endurance_200k",
        "run_5k_speed", "run_10k_builder", "run_endurance_hm",
    ]
    sport: Literal["bike", "run"] = "bike"


def _program_state(goals: dict | None) -> dict:
    """Both sports' selection state + program metas — the shared response body."""
    from app.services.program_builder import (
        PROGRAM_META,
        RUN_PROGRAM_META,
        active_program,
    )

    bike = active_program(goals, "bike")
    run = active_program(goals, "run")
    return {
        "bike": {
            "current": bike[0] if bike else "race",
            "started": bike[1].isoformat() if bike else None,
        },
        "run": {
            "current": run[0] if run else "race",
            "started": run[1].isoformat() if run else None,
        },
        "programs": {"bike": PROGRAM_META, "run": RUN_PROGRAM_META},
        # Legacy flat keys — pre-per-sport clients read the bike program here.
        "current": bike[0] if bike else "race",
        "started": bike[1].isoformat() if bike else None,
    }


@router.get("/programs")
async def list_programs(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Available builder programs (bike + run) + the athlete's per-sport selection."""
    prof = (
        await db.execute(
            select(AthleteProfile).where(AthleteProfile.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    return _program_state(getattr(prof, "goals", None) if prof else None)


async def _schedule_run_program(
    db: AsyncSession, user_id: int, program_id: str, today: date
) -> int:
    """Write the next 14 days of run PlannedWorkout rows for a run program.

    Deterministic Tue/Thu/Sat scheduler straight from the program skeleton —
    does NOT touch the bike generator. Returns the number of rows written.
    """
    from datetime import timedelta as _td

    from app.models.planned_workout import PlannedWorkout
    from app.services.program_builder import program_week_index, run_program_day
    from app.services.run_workout_templates import (
        get_run_template,
        run_interval_structure,
    )

    written = 0
    for offset in range(1, 15):  # tomorrow .. +14 days
        d = today + _td(days=offset)
        monday = d - _td(days=d.weekday())
        week_idx = program_week_index(today, monday)
        template_id = run_program_day(program_id, week_idx, d.weekday())
        if template_id is None:
            continue
        t = get_run_template(template_id)
        if t is None:  # skeleton references only known templates; stay honest
            continue
        db.add(
            PlannedWorkout(
                user_id=user_id,
                date=d,
                sport="running",
                title=t.name,
                duration_seconds_target=t.duration_s,
                description=t.purpose,
                interval_structure=run_interval_structure(t),
                template_id=t.id,
                blocks_source="ai_prescribed",
            )
        )
        written += 1
    return written


@router.post("/program")
async def select_program(
    payload: ProgramSelect,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    """Set (or clear, with 'race'/'none') the sport's builder program.

    Bike: future planned cycling days are replaced and the plan regenerates
    from this week (existing mesocycle path). Run: future run rows are replaced
    with the next 14 days from the run skeleton. Ridden days and the past are
    never touched, and one sport's selection never wipes the other's rows.
    """
    from datetime import timedelta as _td

    from sqlalchemy import delete as _delete

    from app.models.mesocycle_plan import MesocyclePlan
    from app.models.planned_workout import PlannedWorkout
    from app.services.mesocycle_generator import generate_mesocycle
    from app.services.pmc_service import compute_user_pmc
    from app.services.program_builder import set_program
    from sqlalchemy.orm.attributes import flag_modified

    clearing = payload.program in ("race", "none")
    if not clearing:
        valid = _BIKE_PROGRAM_CHOICES if payload.sport == "bike" else _RUN_PROGRAM_CHOICES
        if payload.program not in valid:
            raise HTTPException(
                status_code=422,
                detail=f"Program '{payload.program}' is not a {payload.sport} program",
            )

    prof = (
        await db.execute(
            select(AthleteProfile).where(AthleteProfile.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    if prof is None:
        raise HTTPException(status_code=409, detail="Complete your profile setup first")

    prof.goals = set_program(
        prof.goals, payload.sport, None if clearing else payload.program
    )
    flag_modified(prof, "goals")

    # "Today" in the athlete's timezone — a 23:30 Berlin program switch must
    # not plan tomorrow as if it were still today (UTC).
    set_athlete_tz_from_profile(prof)
    today = today_local()

    if payload.sport == "run":
        # Replace FUTURE run rows only — bike plan and history stay untouched.
        await db.execute(
            _delete(PlannedWorkout).where(
                PlannedWorkout.user_id == current_user.id,
                PlannedWorkout.sport == "running",
                PlannedWorkout.date > today,
            )
        )
        if not clearing:
            await _schedule_run_program(db, current_user.id, payload.program, today)
        await db.commit()
        invalidate_personalized_week_cache(current_user.id)
        return {"ok": True, "program": payload.program, "sport": "run",
                **_program_state(prof.goals)}

    # ── Bike: wipe FUTURE non-run planned days + meso anchors from this week
    # forward, then regenerate. Today and the past stay untouched (history is
    # sacred); run rows (sport='running') are preserved.
    monday = today - _td(days=today.weekday())
    await db.execute(
        _delete(PlannedWorkout).where(
            PlannedWorkout.user_id == current_user.id,
            PlannedWorkout.sport != "running",
            PlannedWorkout.date > today,
        )
    )
    await db.execute(
        _delete(MesocyclePlan).where(
            MesocyclePlan.user_id == current_user.id,
            MesocyclePlan.plan_start_date >= monday - _td(days=28),
        )
    )
    await db.commit()

    live_ctl: float | None = None
    try:
        rows = (await compute_user_pmc(db, current_user.id, days=90)).get("total") or []
        if rows:
            live_ctl = float(rows[-1].get("ctl") or 0.0)
    except Exception:  # noqa: BLE001 — degrade to proximity-only phase
        live_ctl = None

    await generate_mesocycle(db, current_user.id, plan_start_date=monday, current_ctl=live_ctl)
    # generate_mesocycle leaves the commit to its caller (get_current_week does
    # the same) — without this the fresh plan silently rolls back.
    await db.commit()
    invalidate_personalized_week_cache(current_user.id)
    return {"ok": True, "program": payload.program, "sport": "bike",
            **_program_state(prof.goals)}
