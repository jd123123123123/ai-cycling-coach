"""Session Report — rate ONE completed activity (ride OR run) against its
prescription and return the `SessionReport` payload the frontend renders.

The cycling core reuses `ride_compliance.score()` (recommendation-aware: it
grades against the `coach_recommendations` row for the activity's date, falling
back to the phase-picked template). Run-specific pace/HR KPIs are layered on
top since the periodization/template library is cycling-only.

All narrative text reuses the coach_service helpers (`_technical_physio_read`,
`_technical_nudge`, `_HEADLINE_BY_GRADE_*`) so the voice matches the daily
brief. Nothing here writes to the DB except the eval write-back that
`ride_compliance.score()` already performs.
"""
from __future__ import annotations

import logging
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.models.athlete_profile import AthleteProfile
from app.models.coach_recommendation import CoachRecommendation
from app.schemas.session_report import (
    DetailMetric,
    NextSession,
    SessionKPI,
    SessionRead,
    SessionReport,
)
from app.services import ride_compliance as _rc
from app.services.coach_service import (
    _HEADLINE_BY_GRADE_TECHNICAL,
    _HEADLINE_BY_GRADE_TECHNICAL_DE,
    _technical_nudge,
    _technical_physio_read,
)
from app.services.goal_trajectory import project as project_trajectory, trajectory_to_dict
from app.services.hr_zones import derive_lthr
from app.services.pmc_service import compute_user_pmc
from app.services.training_periodization import detect_training_phase, pick_template

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
#  Small mappings
# ----------------------------------------------------------------------

_GRADE_SCORE: dict[str, int] = {
    "perfect": 92,
    "strong": 80,
    "okay": 64,
    "overcooked": 54,
    "undercooked": 46,
}

# session_type → easy-pace multiplier off threshold pace (slower = larger).
_PACE_MULTIPLIER: dict[str, float] = {
    "recovery": 1.30,
    "easy": 1.25,
    "endurance": 1.15,
    "long": 1.15,
    "tempo": 1.05,
    "threshold": 1.00,
    "vo2": 0.96,
}

_NEXT_LABEL = {
    "en": "How this shifts your next session",
    "de": "Wie das deine nächste Einheit verändert",
}

_NEXT_HEADLINE_BY_GRADE = {
    "en": {
        "perfect": "Absorb it — rest is earned",
        "strong": "Consolidate the stimulus",
        "okay": "Tighten the next one up",
        "overcooked": "Back off — recover first",
        "undercooked": "Room to push next time",
    },
    "de": {
        "perfect": "Aufnehmen — Ruhe ist verdient",
        "strong": "Reiz konsolidieren",
        "okay": "Nächste Einheit enger treffen",
        "overcooked": "Zurückschalten — erst erholen",
        "undercooked": "Nächstes Mal ist mehr drin",
    },
}


def _fmt_hm(minutes: float) -> str:
    """Format minutes as H:MM (e.g. 330 -> '5:30', 42 -> '0:42')."""
    total = int(round(minutes))
    h, m = divmod(total, 60)
    return f"{h}:{m:02d}"


def _fmt_pace(min_per_km: float) -> str:
    total_s = int(round(min_per_km * 60))
    m, s = divmod(total_s, 60)
    return f"{m}:{s:02d}/km"


def _cyc_delta_display(pair: dict, de: bool) -> str:
    if pair.get("band") == "match":
        return "im Ziel" if de else "on target"
    delta = pair.get("delta_pct") or 0.0
    sign = "+" if delta > 0 else ""
    return f"{sign}{round(delta)}%"


def _sentiment_from_pair(pair: dict) -> str:
    band = pair.get("band")
    delta = abs(pair.get("delta_pct") or 0.0)
    if band == "match":
        return "good"
    if delta > 40.0:
        return "bad"
    return "caution"


# ----------------------------------------------------------------------
#  Public entry point
# ----------------------------------------------------------------------

async def build_session_report(
    db: AsyncSession,
    user_id: int,
    activity_id: int,
    language: str = "en",
) -> SessionReport | None:
    """Build the SessionReport for one activity. Returns None when the activity
    does not exist or is not owned by `user_id` (caller maps that to 404)."""
    lang = "de" if str(language).lower().startswith("de") else "en"
    de = lang == "de"

    act = (
        await db.execute(
            select(Activity).where(
                Activity.id == activity_id,
                Activity.user_id == user_id,
            )
        )
    ).scalars().first()
    if act is None:
        return None

    profile = (
        await db.execute(
            select(AthleteProfile).where(AthleteProfile.user_id == user_id)
        )
    ).scalar_one_or_none()

    ftp = (
        int(profile.ftp_watts)
        if profile is not None and profile.ftp_watts and profile.ftp_watts > 0
        else None
    )

    sport = (act.sport or "cycling").lower()
    act_date: date | None = act.started_at.date() if act.started_at else None

    # ---- Prescription lookup (drives phase selection + prescribed_title) ----
    rec: CoachRecommendation | None = None
    if act_date is not None:
        rec = (
            await db.execute(
                select(CoachRecommendation).where(
                    CoachRecommendation.user_id == user_id,
                    CoachRecommendation.target_date == act_date,
                )
            )
        ).scalar_one_or_none()
    has_prescription = rec is not None

    session_type = _session_type_from_rec(rec)

    # When a real prescription exists we grade against it (non-absolute phase
    # so score() compares to the prescribed template, not a TSS band). Only when
    # nothing was prescribed do we fall back to the athlete's true phase.
    if has_prescription:
        phase = "build"
    else:
        phase = _real_phase(profile, act)

    # Fallback template for score() when no recommendation row exists.
    dur_min = (act.duration_seconds or 0) / 60.0
    available_minutes = max(30, int(round(dur_min))) if dur_min else 90
    fallback_template = pick_template(
        session_type=session_type,
        athlete_ftp=ftp,
        available_minutes=available_minutes,
    )

    # ---- Compliance core (recommendation-aware) ----
    compliance_obj = await _rc.score(
        db=db,
        user_id=user_id,
        actual_activity=act,
        target_template=fallback_template,
        ftp=ftp,
        phase=phase,
        session_type=session_type,
    )
    compliance = _rc.ride_compliance_to_dict(compliance_obj)

    # Trajectory (for the narrative helpers). Best-effort — empty dict is fine.
    trajectory: dict = {}
    try:
        pmc_full = await compute_user_pmc(db, user_id, days=90)
        traj = project_trajectory(
            user_pmc=pmc_full.get("total") or [],
            athlete_goals=(
                profile.goals if profile and isinstance(profile.goals, dict) else None
            ),
            phase=phase if phase != "build" else _real_phase(profile, act),
            lang=lang,
        )
        trajectory = trajectory_to_dict(traj)
    except Exception:  # pragma: no cover — narrative degrades gracefully
        logger.exception("trajectory projection failed for activity %s", activity_id)

    # ---- Grade ----
    # Cycling always grades (absolute band fallback guarantees a grade). Running
    # only carries a grade when it was actually prescribed — the cycling-centric
    # template library makes an unprescribed run grade meaningless.
    grade: str | None = compliance.get("grade")
    if sport == "running" and not has_prescription:
        grade = None
    grade_score = _GRADE_SCORE.get(grade or "", 60)

    if de:
        headline = _HEADLINE_BY_GRADE_TECHNICAL_DE.get(grade or "", "Einheit erfasst")
    else:
        headline = _HEADLINE_BY_GRADE_TECHNICAL.get(grade or "", "Session logged")

    # ---- Stream availability (for debrief link + kJ / cadence) ----
    stream = await db.get(ActivityStream, activity_id)
    debrief_available = _has_streams(act, stream)

    # ---- Prescribed title ----
    prescribed_title = _prescribed_title(rec)

    # ---- Sport-specific KPIs / reads / detail metrics ----
    distance_km = (
        round(float(act.distance_meters) / 1000.0, 2)
        if act.distance_meters
        else None
    )

    if sport == "running":
        kpis = _run_kpis(act, rec, profile, session_type, compliance, distance_km, de)
        reads = _run_reads(kpis, grade, de)
        detail_metrics = _run_detail_metrics(act, stream, distance_km, de)
    else:
        kpis = _cyc_kpis(compliance, de)
        reads = _cyc_reads(compliance, grade, trajectory, de)
        detail_metrics = _cyc_detail_metrics(act, stream, compliance, de)

    # ---- Next session nudge ----
    next_session = NextSession(
        label=_NEXT_LABEL[lang],
        headline=_NEXT_HEADLINE_BY_GRADE[lang].get(grade or "strong", _NEXT_HEADLINE_BY_GRADE[lang]["strong"]),
        detail=_technical_nudge(grade or "strong", session_type, phase, de=de),
    )

    return SessionReport(
        activity_id=activity_id,
        title=act.title or sport.title(),
        sport=sport,
        date=act_date.isoformat() if act_date else "",
        distance_km=distance_km,
        duration_minutes=round(dur_min, 1),
        grade=grade,
        grade_score=grade_score,
        headline=headline,
        prescribed_title=prescribed_title,
        kpis=kpis,
        reads=reads,
        next_session=next_session,
        detail_metrics=detail_metrics,
        debrief_available=debrief_available,
        lang=lang,
    )


# ----------------------------------------------------------------------
#  Helpers — context
# ----------------------------------------------------------------------

def _session_type_from_rec(rec: CoachRecommendation | None) -> str:
    """Best-effort session_type from the recommendation's template id."""
    if rec is None:
        return "endurance"
    tid = (rec.template_id or "").lower()
    for key in ("recovery", "rest", "endurance", "z2", "tempo", "sweet", "threshold", "vo2", "long"):
        if key in tid:
            if key == "z2":
                return "endurance"
            if key == "sweet":
                return "sweet_spot"
            if key == "rest":
                return "recovery"
            return key
    return "endurance"


def _real_phase(profile: AthleteProfile | None, act: Activity) -> str:
    """Athlete's true training phase — used to grade unprescribed rides against
    an absolute TSS band and to seed the trajectory projection."""
    goal_date: date | None = None
    ctl = 40.0
    if profile is not None:
        goal_date = profile.target_event_date
    try:
        return detect_training_phase(goal_date, ctl)
    except Exception:  # pragma: no cover
        return "maintenance"


def _prescribed_title(rec: CoachRecommendation | None) -> str | None:
    if rec is None:
        return None
    title = (rec.title or "").strip()
    # Some rec titles are full paragraphs (LLM overflow) — keep them tidy.
    if len(title) > 60:
        title = title[:57].rstrip() + "…"
    if rec.duration_minutes and rec.duration_minutes > 0:
        return f"{title} · {_fmt_hm(rec.duration_minutes)} h"
    return title or None


def _has_streams(act: Activity, stream: ActivityStream | None) -> bool:
    if stream is not None and isinstance(stream.streams, dict):
        if stream.streams.get("power") or stream.streams.get("heart_rate"):
            return True
    raw = act.raw_data
    if isinstance(raw, dict):
        streams = raw.get("streams")
        if isinstance(streams, dict) and (streams.get("power") or streams.get("heart_rate")):
            return True
    return False


# ----------------------------------------------------------------------
#  Cycling KPIs / reads / detail metrics
# ----------------------------------------------------------------------

def _cyc_kpis(compliance: dict, de: bool) -> list[SessionKPI]:
    kpis: list[SessionKPI] = []

    dur = compliance.get("duration") or {}
    kpis.append(SessionKPI(
        key="duration",
        label="Dauer" if de else "Duration",
        target_display=_fmt_hm(dur.get("target", 0)),
        actual_display=_fmt_hm(dur.get("actual", 0)),
        delta_display=_cyc_delta_display(dur, de),
        delta_pct=float(dur.get("delta_pct") or 0.0),
        band=dur.get("band", "match"),
        sentiment=_sentiment_from_pair(dur),
    ))

    tss = compliance.get("tss") or {}
    kpis.append(SessionKPI(
        key="load",
        label="Trainingslast" if de else "Training load",
        target_display=str(int(round(tss.get("target", 0)))),
        actual_display=str(int(round(tss.get("actual", 0)))),
        delta_display=_cyc_delta_display(tss, de),
        delta_pct=float(tss.get("delta_pct") or 0.0),
        band=tss.get("band", "match"),
        sentiment=_sentiment_from_pair(tss),
    ))

    if_pair = compliance.get("intensity_factor")
    if if_pair:
        kpis.append(SessionKPI(
            key="intensity",
            label="Intensität" if de else "Intensity",
            target_display=f"{if_pair.get('target', 0):.2f}",
            actual_display=f"{if_pair.get('actual', 0):.2f}",
            delta_display=_cyc_delta_display(if_pair, de),
            delta_pct=float(if_pair.get("delta_pct") or 0.0),
            band=if_pair.get("band", "match"),
            sentiment=_sentiment_from_pair(if_pair),
        ))
    else:
        kpis.append(SessionKPI(
            key="intensity",
            label="Intensität" if de else "Intensity",
            target_display="—",
            actual_display="—",
            delta_display="—" if de else "no power",
            delta_pct=0.0,
            band="match",
            sentiment="neutral",
        ))

    return kpis


def _cyc_reads(compliance: dict, grade: str | None, trajectory: dict, de: bool) -> list[SessionRead]:
    reads: list[SessionRead] = []

    # Primary read — the physiological "what your body did" line.
    tone = "up" if grade == "overcooked" else "down" if grade == "undercooked" else "ok"
    physio = _technical_physio_read(compliance, trajectory, de=de)
    reads.append(SessionRead(
        tone=tone,
        title=("Was der Körper gemacht hat" if de else "What your body did"),
        detail=physio,
    ))

    # Secondary read — call out the most-off metric, or affirm a match.
    dur = compliance.get("duration") or {}
    tss = compliance.get("tss") or {}
    over = [p for p in (dur, tss) if p.get("band") == "over"]
    under = [p for p in (dur, tss) if p.get("band") == "under"]
    if over:
        reads.append(SessionRead(
            tone="up",
            title=("Über der Vorgabe" if de else "Above prescription"),
            detail=(
                "Zeit oder Last lagen über dem Ziel — plane heute Abend echte Erholung ein."
                if de else
                "Time or load ran above target — bank real recovery tonight."
            ),
        ))
    elif under:
        reads.append(SessionRead(
            tone="down",
            title=("Unter der Vorgabe" if de else "Below prescription"),
            detail=(
                "Leichter als vorgegeben — der nächste Block der gleichen Kategorie darf voller ausfallen."
                if de else
                "Lighter than prescribed — the next same-category block can run fuller."
            ),
        ))
    else:
        reads.append(SessionRead(
            tone="ok",
            title=("Auf Kurs" if de else "On plan"),
            detail=(
                "Dauer und Last lagen im vorgegebenen Band — genau so soll es aussehen."
                if de else
                "Duration and load sat inside the prescribed band — exactly the intent."
            ),
        ))

    return reads[:3]


def _cyc_detail_metrics(act: Activity, stream: ActivityStream | None, compliance: dict, de: bool) -> list[DetailMetric]:
    out: list[DetailMetric] = []

    np = act.normalized_power
    if np is not None:
        out.append(DetailMetric(label="NP", value=str(int(round(float(np)))), unit="W"))

    ef = compliance.get("ef")
    if ef is not None:
        out.append(DetailMetric(label="EF", value=f"{ef:.2f}"))

    dec = compliance.get("decoupling_pct")
    if dec is not None:
        out.append(DetailMetric(label="Decoupling", value=f"{dec:.1f}", unit="%"))

    kj = _work_kj(act, stream)
    if kj is not None:
        out.append(DetailMetric(label=("Arbeit" if de else "Work"), value=str(int(round(kj))), unit="kJ"))

    return out


def _work_kj(act: Activity, stream: ActivityStream | None) -> float | None:
    if stream is not None and stream.total_kj:
        return float(stream.total_kj)
    raw = act.raw_data
    if isinstance(raw, dict):
        for key in ("total_kj", "work_kj", "kilojoules"):
            v = raw.get(key)
            if isinstance(v, (int, float)):
                return float(v)
    return None


# ----------------------------------------------------------------------
#  Running KPIs / reads / detail metrics
# ----------------------------------------------------------------------

def _run_pace_min_per_km(act: Activity) -> float | None:
    if not act.duration_seconds or not act.distance_meters or act.distance_meters <= 0:
        return None
    minutes = act.duration_seconds / 60.0
    km = act.distance_meters / 1000.0
    return minutes / km if km > 0 else None


def _target_pace_min_per_km(profile: AthleteProfile | None, session_type: str) -> float | None:
    if profile is None or not profile.running_threshold_pace_ms:
        return None
    thr_ms = float(profile.running_threshold_pace_ms)
    if thr_ms <= 0:
        return None
    thr_min_per_km = (1000.0 / thr_ms) / 60.0
    mult = _PACE_MULTIPLIER.get(session_type, 1.15)
    return thr_min_per_km * mult


def _run_kpis(
    act: Activity,
    rec: CoachRecommendation | None,
    profile: AthleteProfile | None,
    session_type: str,
    compliance: dict,
    distance_km: float | None,
    de: bool,
) -> list[SessionKPI]:
    kpis: list[SessionKPI] = []

    # ---- Distance ----
    target_km: float | None = None
    if rec is not None and isinstance(rec.blocks, list):
        # A run recommendation may stash a distance target on the row's blocks.
        for b in rec.blocks:
            if isinstance(b, dict) and isinstance(b.get("distance_km"), (int, float)):
                target_km = (target_km or 0.0) + float(b["distance_km"])
    if distance_km is not None:
        if target_km and target_km > 0:
            delta = (distance_km - target_km) / target_km * 100.0
            band = "over" if delta > 10 else "under" if delta < -10 else "match"
            kpis.append(SessionKPI(
                key="distance",
                label="Distanz" if de else "Distance",
                target_display=f"{target_km:.1f} km",
                actual_display=f"{distance_km:.1f} km",
                delta_display=("im Ziel" if de else "on target") if band == "match" else f"{'+' if delta > 0 else ''}{round(delta)}%",
                delta_pct=round(delta, 1),
                band=band,
                sentiment="good" if band != "under" else "caution",
            ))
        else:
            kpis.append(SessionKPI(
                key="distance",
                label="Distanz" if de else "Distance",
                target_display="—",
                actual_display=f"{distance_km:.1f} km",
                delta_display="—",
                delta_pct=0.0,
                band="match",
                sentiment="neutral",
            ))

    # ---- Duration ----
    dur = compliance.get("duration") or {}
    actual_min = float(dur.get("actual") or 0.0)
    if rec is not None and rec.duration_minutes and rec.duration_minutes > 0:
        target_min = float(rec.duration_minutes)
        delta = (actual_min - target_min) / target_min * 100.0
        band = "over" if delta > 10 else "under" if delta < -10 else "match"
        kpis.append(SessionKPI(
            key="duration",
            label="Dauer" if de else "Duration",
            target_display=_fmt_hm(target_min),
            actual_display=_fmt_hm(actual_min),
            delta_display=("im Ziel" if de else "on target") if band == "match" else f"{'+' if delta > 0 else ''}{round(delta)}%",
            delta_pct=round(delta, 1),
            band=band,
            sentiment="good" if band == "match" else "caution",
        ))
    else:
        kpis.append(SessionKPI(
            key="duration",
            label="Dauer" if de else "Duration",
            target_display="—",
            actual_display=_fmt_hm(actual_min),
            delta_display="—",
            delta_pct=0.0,
            band="match",
            sentiment="neutral",
        ))

    # ---- Avg pace ----
    actual_pace = _run_pace_min_per_km(act)
    target_pace = _target_pace_min_per_km(profile, session_type)
    if actual_pace is not None:
        if target_pace is not None:
            diff_s = (actual_pace - target_pace) * 60.0  # + = slower than target
            # Easy runs that come in FASTER than target are the risk case.
            if diff_s < -15:
                faster = abs(round(diff_s))
                sentiment = "bad" if diff_s < -45 else "caution"
                delta_display = f"{faster}s " + ("schneller" if de else "faster")
            elif diff_s > 15:
                sentiment = "caution"
                delta_display = f"{round(diff_s)}s " + ("langsamer" if de else "slower")
            else:
                sentiment = "good"
                delta_display = "im Ziel" if de else "on target"
            delta_pct = round((actual_pace - target_pace) / target_pace * 100.0, 1)
            kpis.append(SessionKPI(
                key="pace",
                label="Ø Pace" if de else "Avg pace",
                target_display=_fmt_pace(target_pace),
                actual_display=_fmt_pace(actual_pace),
                delta_display=delta_display,
                delta_pct=delta_pct,
                band="over" if diff_s > 10 else "under" if diff_s < -10 else "match",
                sentiment=sentiment,
            ))
        else:
            kpis.append(SessionKPI(
                key="pace",
                label="Ø Pace" if de else "Avg pace",
                target_display="—",
                actual_display=_fmt_pace(actual_pace),
                delta_display="—",
                delta_pct=0.0,
                band="match",
                sentiment="neutral",
            ))

    # ---- Avg HR ----
    lthr = derive_lthr(
        lthr=getattr(profile, "lthr_running", None) if profile else None,
        max_heart_rate=getattr(profile, "max_heart_rate", None) if profile else None,
        date_of_birth=getattr(profile, "date_of_birth", None) if profile else None,
    )
    avg_hr = act.average_hr
    if avg_hr is not None:
        if lthr:
            cap = int(round(0.85 * lthr))
            if avg_hr > cap:
                sentiment = "bad"
                delta_display = "über Limit" if de else "above cap"
                band = "over"
            else:
                sentiment = "good"
                delta_display = "im Ziel" if de else "in zone"
                band = "match"
            kpis.append(SessionKPI(
                key="hr",
                label="Ø HF" if de else "Avg HR",
                target_display=f"<{cap}",
                actual_display=f"{avg_hr} bpm",
                delta_display=delta_display,
                delta_pct=round((avg_hr - cap) / cap * 100.0, 1),
                band=band,
                sentiment=sentiment,
            ))
        else:
            kpis.append(SessionKPI(
                key="hr",
                label="Ø HF" if de else "Avg HR",
                target_display="—",
                actual_display=f"{avg_hr} bpm",
                delta_display="—",
                delta_pct=0.0,
                band="match",
                sentiment="neutral",
            ))

    return kpis


def _run_reads(kpis: list[SessionKPI], grade: str | None, de: bool) -> list[SessionRead]:
    reads: list[SessionRead] = []
    by_key = {k.key: k for k in kpis}

    pace = by_key.get("pace")
    hr = by_key.get("hr")

    if hr is not None and hr.sentiment == "bad":
        reads.append(SessionRead(
            tone="up",
            title=("Herzfrequenz über dem Limit" if de else "Heart rate above the cap"),
            detail=(
                "Die Durchschnitts-HF lag über der aeroben Obergrenze — dieser Lauf war eher moderat als locker. "
                "Für echte Grundlage die HF unter dem Deckel halten."
                if de else
                "Average HR sat above the aerobic cap — this ran moderate, not easy. "
                "Keep HR under the cap to bank true aerobic base."
            ),
        ))
    if pace is not None and pace.sentiment in ("caution", "bad") and "faster" in pace.delta_display.lower() + ("schneller" if de else ""):
        reads.append(SessionRead(
            tone="up",
            title=("Schneller als vorgegeben" if de else "Faster than prescribed"),
            detail=(
                "Das Tempo lag über der Zielvorgabe für diese Einheit — locker heißt wirklich locker."
                if de else
                "Pace ran hotter than the target for this session — easy means easy."
            ),
        ))

    if not reads:
        # Affirming default.
        reads.append(SessionRead(
            tone="ok",
            title=("Solider Lauf" if de else "Solid run"),
            detail=(
                "Dauer und Pace lagen im erwarteten Bereich — konsequente aerobe Zeit auf den Beinen."
                if de else
                "Duration and pace landed where expected — consistent aerobic time on feet."
            ),
        ))

    return reads[:3]


def _run_detail_metrics(act: Activity, stream: ActivityStream | None, distance_km: float | None, de: bool) -> list[DetailMetric]:
    out: list[DetailMetric] = []

    pace = _run_pace_min_per_km(act)
    if pace is not None:
        out.append(DetailMetric(label=("Ø Pace" if de else "Avg pace"), value=_fmt_pace(pace)))

    if act.average_hr is not None:
        out.append(DetailMetric(label=("Ø HF" if de else "Avg HR"), value=str(act.average_hr), unit="bpm"))

    cadence = _run_cadence(act, stream)
    if cadence is not None:
        out.append(DetailMetric(label=("Trittfrequenz" if de else "Cadence"), value=str(int(round(cadence))), unit="spm"))

    if act.tss is not None and act.tss > 0:
        out.append(DetailMetric(label="rTSS", value=str(int(round(float(act.tss))))))

    return out


def _run_cadence(act: Activity, stream: ActivityStream | None) -> float | None:
    if stream is not None and isinstance(stream.streams, dict):
        cad = stream.streams.get("cadence")
        if isinstance(cad, list) and cad:
            vals = [c for c in cad if isinstance(c, (int, float)) and c > 0]
            if vals:
                return sum(vals) / len(vals)
    raw = act.raw_data
    if isinstance(raw, dict):
        for key in ("average_cadence", "avg_cadence", "average_running_cadence"):
            v = raw.get(key)
            if isinstance(v, (int, float)) and v > 0:
                return float(v)
    return None
