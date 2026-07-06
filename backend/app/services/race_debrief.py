"""Race Debrief orchestrator — compose the Phase-1 analyzers into one report.

`assemble_debrief` is pure (plain activity/stream/profile inputs → RaceDebrief):
it runs every analyzer in its own try/except so one failure never sinks the
report, builds the header/story/blocks, and derives a rule-based grade, verdict,
and plan. `build_debrief`/`get_or_build_debrief` add the DB load + read-through
cache, mirroring period_report.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.models.athlete_profile import AthleteProfile
from app.models.race_debrief_cache import RaceDebriefCache
from app.schemas.race_debrief import RaceDebrief
from app.services import (
    cda_estimate, climbing_analysis, effort_matching, efficiency_metrics,
    fueling_analysis, key_moments, matchbook, pacing_analysis, quadrant_analysis,
    ride_segmentation, wko_power_model,
)
from app.services.athlete_power_profile import aggregate_mmp_curves
from app.services.environment import air_density
from app.services.training_load import calculate_np
from app.services.w_balance import w_prime_balance

logger = logging.getLogger(__name__)

DEBRIEF_TTL_HOURS = 24 * 30  # a ride's analysis is stable; long TTL
_STORY_MAX_POINTS = 600


def _try(label: str, fn, default=None):
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001 — one analyzer never sinks the report
        logger.warning("debrief analyzer %s failed (non-fatal): %s", label, exc)
        return default


def _downsample(series: list, max_points: int) -> list:
    n = len(series)
    if n <= max_points:
        return list(series)
    step = n / max_points
    return [series[int(i * step)] for i in range(max_points)]


def _grade_from_score(score: float) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"


def _rule_based_grade(pacing, efficiency, matchbook_, efforts, durability_drop):
    """Deterministic 0–100 ride-execution score from the analyzer blocks."""
    score = 80.0
    good: list[str] = []
    bad: list[str] = []
    if pacing is not None:
        if pacing.split_pct < -8:
            score -= 10; bad.append("Positive split — faded in the second half")
        elif pacing.split_pct > -3:
            score += 4; good.append("Evenly paced")
        if pacing.variability_index and pacing.variability_index > 1.25:
            score -= 4; bad.append("Very surgy (high variability)")
    if efficiency is not None and efficiency.decoupling_pct is not None:
        if efficiency.decoupling_pct < 5:
            score += 5; good.append("Low aerobic decoupling — well fuelled/paced")
        elif efficiency.decoupling_pct > 10:
            score -= 8; bad.append("High cardiac drift late in the ride")
    if matchbook_ is not None and matchbook_.fully_depleted:
        score -= 6; bad.append("Emptied the anaerobic tank")
    prs = [e for e in (efforts or []) if e.is_pr]
    if prs:
        score += 6; good.append(f"Set {len(prs)} power PR(s)")
    if durability_drop is not None and durability_drop > 15:
        score -= 6; bad.append("Power faded badly under fatigue")
    score = max(0.0, min(100.0, score))
    return score, good[:3], bad[:3]


def _build_plan(pacing, matchbook_, efficiency, fueling, durability_drop):
    """Deterministic ranked prescriptions with a race tactic + training fix each."""
    plan = []
    if matchbook_ is not None and matchbook_.fully_depleted:
        plan.append(dict(priority=len(plan) + 1,
            headline="Ration your matches early",
            race_tactic="Sit in on the first climb; hold 20–25 W under threshold.",
            training_fix="VO2 40/20s ×2/wk to raise W′ (anaerobic capacity).",
            tone="caution"))
    if fueling is not None and fueling.likely_underfueled:
        lo, hi = fueling.carb_target_g_per_h
        plan.append(dict(priority=len(plan) + 1,
            headline="Fuel earlier and more",
            race_tactic=f"Target {int(lo)}–{int(hi)} g carbs/h from the gun.",
            training_fix="Gut-training long rides at race carb intake.",
            tone="bad"))
    if pacing is not None and pacing.split_pct < -8:
        plan.append(dict(priority=len(plan) + 1,
            headline="Pace the first half more conservatively",
            race_tactic="Negative-split it: start ~5% easier than felt right.",
            training_fix="Threshold work at the end of long rides for durability.",
            tone="caution"))
    if durability_drop is not None and durability_drop > 15:
        plan.append(dict(priority=len(plan) + 1,
            headline="Build fatigue resistance",
            race_tactic="Practice key efforts late, on tired legs.",
            training_fix="Add tempo/threshold blocks after 2+ h of endurance.",
            tone="neutral"))
    if not plan:
        plan.append(dict(priority=1, headline="Keep doing what works",
            race_tactic="Repeat this pacing and fuelling.",
            training_fix="Progress load gradually; protect recovery.",
            tone="good"))
    return plan


def assemble_debrief(activity, stream, profile, athlete_envelope: dict) -> RaceDebrief:
    """Pure assembler: analyzers → RaceDebrief with a rule-based verdict. See docstring."""
    s = stream.streams or {}
    power = [float(p) for p in (s.get("power") or [])]
    hr = s.get("heart_rate") or []
    cadence = s.get("cadence") or []
    altitude = s.get("altitude") or []
    distance = s.get("distance") or []
    speed = s.get("speed") or []
    latitude = s.get("latitude") or []
    longitude = s.get("longitude") or []
    n = len(power)

    ftp = float(profile.ftp_watts) if profile and profile.ftp_watts else None
    mass = float(profile.weight_kg) if profile and getattr(profile, "weight_kg", None) else None
    cp = float(getattr(stream, "cp_watts", None) or 0.0)
    w_prime = float(getattr(stream, "w_prime_j", None) or 0.0)
    mmp = _try("mmp_curve", lambda: {int(k): float(v) for k, v in (stream.mmp_curve or {}).items()}, {}) or {}

    # --- analyzer blocks (each defensive) ---
    hr_clean = [float(h) for h in hr] if hr and all(h is not None for h in hr) else None
    np_watts = _try("np", lambda: calculate_np(power), 0.0) if power else 0.0

    segments = _try("segmentation", lambda: ride_segmentation.segment_ride(
        altitude, distance, power=power, speed=speed), []) or []
    climbs = _try("climbing", lambda: climbing_analysis.analyze_climbs(segments, mass), []) or []
    pacing = _try("pacing", lambda: pacing_analysis.analyze_pacing(power, ftp, hr_clean))
    efficiency = _try("efficiency", lambda: efficiency_metrics.analyze_efficiency(power, hr_clean, ftp))
    mb = _try("matchbook", lambda: matchbook.analyze_matchbook(power, cp, w_prime)) if cp > 0 and w_prime > 0 else None
    quadrant = _try("quadrant", lambda: quadrant_analysis.analyze_quadrants(power, cadence, ftp=ftp))
    fueling = _try("fueling", lambda: fueling_analysis.analyze_fueling(
        power, if_=(round(np_watts / ftp, 3) if ftp else None),
        durability_drop_pct=getattr(stream, "durability_drop_pct", None),
        decoupling_pct=(efficiency.decoupling_pct if efficiency else None)))
    efforts = _try("efforts", lambda: effort_matching.match_efforts(mmp, athlete_envelope), []) or []
    wko = _try("wko", lambda: wko_power_model.fit_wko_model(mmp, mass))
    rho = _try("air_density", lambda: air_density(
        altitude[0] if altitude and altitude[0] is not None else 0.0), 1.225) or 1.225
    cda = _try("cda", lambda: cda_estimate.estimate_cda(
        power, speed, altitude, mass, air_density=rho)) if mass else None
    wbal = _try("wbal", lambda: w_prime_balance(power, cp, w_prime)) if cp > 0 and w_prime > 0 else None
    moments = _try("moments", lambda: key_moments.detect_key_moments(power, wbal, hr_clean), []) or []

    # --- header ---
    total_kj = round(sum(power) / 1000.0, 1) if power else 0.0
    if_val = round(np_watts / ftp, 3) if ftp else None
    dist_km = round((activity.distance_meters or 0.0) / 1000.0, 1)
    avg_speed_kmh = round(dist_km / (n / 3600.0), 1) if n > 0 and dist_km else 0.0
    header = dict(
        title=activity.title or "Race", date=activity.started_at.isoformat(),
        sport=activity.sport, distance_km=dist_km,
        elevation_m=round(sum(seg.elev_gain_m for seg in segments), 0),
        moving_time_s=n, np_watts=round(np_watts, 1), if_=if_val,
        tss=float(activity.tss or 0.0), total_kj=total_kj, avg_speed_kmh=avg_speed_kmh,
    )

    # --- story (downsampled) ---
    step_idx = list(range(n))
    story = dict(
        t=_downsample(step_idx, _STORY_MAX_POINTS),
        power=_downsample(power, _STORY_MAX_POINTS),
        hr=_downsample(hr, _STORY_MAX_POINTS) if hr else [],
        wbal=_downsample(wbal, _STORY_MAX_POINTS) if wbal else [],
        altitude=_downsample(altitude, _STORY_MAX_POINTS) if altitude else [],
        speed=_downsample(speed, _STORY_MAX_POINTS) if speed else [],
        moments=[m.__dict__ for m in moments],
        route=[{"lat": la, "lng": lo, "power": power[i] if i < n else None,
                "grade": None}
               for i, (la, lo) in enumerate(zip(latitude, longitude))
               if la is not None and lo is not None][:_STORY_MAX_POINTS],
    )

    # --- verdict + plan ---
    durability_drop = getattr(stream, "durability_drop_pct", None)
    score, good, bad = _rule_based_grade(pacing, efficiency, mb, efforts, durability_drop)
    verdict = dict(
        grade_letter=_grade_from_score(score), grade_score=round(score, 0),
        ai_verdict=_rule_based_verdict(activity, score, good, bad),
        ai_model="rule-based-fallback", went_well=good, watch_out=bad,
    )
    plan = _build_plan(pacing, mb, efficiency, fueling, durability_drop)

    return RaceDebrief(
        activity_id=activity.id, header=header, verdict=verdict, story=story,
        segments=[seg.__dict__ for seg in segments],
        climbs=[c.__dict__ for c in climbs],
        pacing=pacing.__dict__ if pacing else None,
        efforts=[e.__dict__ for e in efforts],
        efficiency=efficiency.__dict__ if efficiency else None,
        matchbook={**mb.__dict__, "matches": [m.__dict__ for m in mb.matches]} if mb else None,
        quadrant=quadrant.__dict__ if quadrant else None,
        fueling=fueling.__dict__ if fueling else None,
        wko=wko.__dict__ if wko else None,
        cda=cda.__dict__ if cda else None,
        plan=plan,
    )


def _rule_based_verdict(activity, score: float, good: list[str], bad: list[str]) -> str:
    grade = _grade_from_score(score)
    lead = {"A": "A standout ride.", "B": "A strong ride.", "C": "A solid ride.",
            "D": "A tough day.", "F": "A day to learn from."}[grade]
    win = f" What worked: {good[0].lower()}." if good else ""
    fix = f" To improve: {bad[0].lower()}." if bad else ""
    return (lead + win + fix)[:600]


async def _upsert_debrief(db: AsyncSession, user_id: int, activity_id: int, report: RaceDebrief) -> None:
    now = datetime.now(timezone.utc)
    payload = report.model_dump(mode="json")
    stmt = pg_insert(RaceDebriefCache).values(
        user_id=user_id, activity_id=activity_id, report=payload, generated_at=now,
    ).on_conflict_do_update(
        index_elements=["user_id", "activity_id"],
        set_={"report": payload, "generated_at": now},
    )
    await db.execute(stmt)
    await db.commit()
    report.generated_at = now


async def build_debrief(db: AsyncSession, user_id: int, activity_id: int) -> RaceDebrief | None:
    activity = (await db.execute(
        select(Activity).where(Activity.id == activity_id))).scalars().first()
    if activity is None:
        return None
    stream = await db.get(ActivityStream, activity_id)
    if stream is None or not (stream.streams or {}).get("power"):
        return None
    profile = (await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id))).scalar_one_or_none()
    env_res = await db.execute(
        select(ActivityStream.mmp_curve).where(
            ActivityStream.user_id == user_id, ActivityStream.mmp_curve.isnot(None)))
    envelope = aggregate_mmp_curves([row[0] for row in env_res.all() if row[0]])
    report = assemble_debrief(activity, stream, profile, envelope)
    # Task 4 overlays the AI verdict here.
    return report


async def get_or_build_debrief(db: AsyncSession, user_id: int, activity_id: int) -> RaceDebrief | None:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=DEBRIEF_TTL_HOURS)
    row = (await db.execute(
        select(RaceDebriefCache).where(
            RaceDebriefCache.user_id == user_id,
            RaceDebriefCache.activity_id == activity_id,
            RaceDebriefCache.generated_at >= cutoff))).scalar_one_or_none()
    if row is not None:
        try:
            return RaceDebrief.model_validate({**row.report, "generated_at": row.generated_at})
        except ValidationError:
            logger.warning("Discarding malformed cached debrief user=%s act=%s", user_id, activity_id)
    report = await build_debrief(db, user_id, activity_id)
    if report is None:
        return None
    await _upsert_debrief(db, user_id, activity_id, report)
    return report
