"""ONE Daily Decision — the single producer of "what should I do today?".

Usability audit P0-3: four surfaces (Today, Recovery, Load-Form, Coach) issued
conflicting instructions on the same day — 'Ruhetag' next to 'Grünes Licht —
belaste hart'. This module computes the ONE decision object every surface
renders subordinately. Surfaces add their own flavor; they never contradict
`state`.

Precedence (first match wins):
    1. athlete self-report sick / injured / break — no signal argues with it
    2. trained_already — SPORT-AWARE: only when today's completed activity
       (athlete-local window, >= 20 min) matches the planned sport family, or
       there is no planned session and >= 20 min of anything was done. A gym
       session on a bike-plan day does NOT flip the state — the bike plan
       remains the instruction; the strength work is acknowledged in `reason`.
    3. planned_rest — today's PlannedWorkout row says rest, or no row exists
       and the session picker resolves today to a rest day
    4. readiness + adaptive directive → recover / easy / quality / hard with
       tss_target = planned TSS × directive volume_modifier. When the
       directive says deload/rest but a session is planned, the plan wins the
       SHAPE and the directive caps the LOAD (state='recover', reduced
       tss_target) — never a contradiction.

`strain_target` is ALWAYS tss_target / 8 on the 0-21 scale. This is the only
place that derivation exists; null on rest / trained / sick days.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.coach_recommendation import CoachRecommendation
from app.schemas.coach import (
    DailyDecision,
    DailyDecisionCTA,
    DailyDecisionPlanned,
    DailyDecisionReadiness,
)
from app.services.adaptive_readiness import Directive, build_adaptive_directive
from app.services.athlete_time import (
    set_athlete_tz_from_profile,
    today_local,
    today_local_window,
)
from app.services.sport import same_sport_family, sport_family

logger = logging.getLogger(__name__)

# The ONLY tss→strain derivation point in the codebase (0-21 Garmin-style scale).
_STRAIN_PER_TSS = 1.0 / 8.0
_STRAIN_MAX = 21.0


def strain_from_tss(tss_target: float | None) -> float | None:
    """tss_target/8 on the 0-21 scale. Null in → null out."""
    if tss_target is None:
        return None
    return round(min(float(tss_target) * _STRAIN_PER_TSS, _STRAIN_MAX), 1)


# ======================================================================
#  Today context — plan + completed activities in the athlete-local day
# ======================================================================


@dataclass
class TodayContext:
    """What is planned today + what has already happened, sport-aware."""

    planned: dict | None = None       # primary planned session (non-rest) —
                                      # {sport,title,template_id,target_tss,duration_minutes,category}
    planned_is_rest: bool = False     # today is EXPLICITLY a rest day
    activities: list[dict] = field(default_factory=list)  # [{sport,duration_minutes,tss}]

    @property
    def total_minutes(self) -> float:
        return sum(float(a.get("duration_minutes") or 0.0) for a in self.activities)

    @property
    def planned_done(self) -> bool:
        """>= 20 min completed in the planned session's sport family."""
        if not self.planned:
            return False
        planned_sport = self.planned.get("sport")
        return self.matching_minutes(planned_sport) >= 20.0

    def matching_minutes(self, sport: str | None) -> float:
        return sum(
            float(a.get("duration_minutes") or 0.0)
            for a in self.activities
            if same_sport_family(a.get("sport"), sport)
        )

    def other_sport_summary(self, planned_sport: str | None) -> tuple[str | None, float]:
        """(dominant other-sport family, total minutes) for activities NOT in
        the planned family. Used for cross-sport acknowledgment copy."""
        by_family: dict[str, float] = {}
        for a in self.activities:
            fam = sport_family(a.get("sport"))
            if planned_sport is not None and same_sport_family(a.get("sport"), planned_sport):
                continue
            by_family[fam] = by_family.get(fam, 0.0) + float(a.get("duration_minutes") or 0.0)
        if not by_family:
            return None, 0.0
        fam = max(by_family, key=lambda k: by_family[k])
        return fam, sum(by_family.values())


def _rest_planned_row(template_id: str | None, title: str | None) -> bool:
    if template_id == "rest_day":
        return True
    t = (title or "").lower()
    return "rest" in t or "ruhetag" in t or "ruhe-tag" in t


async def load_today_context(db: AsyncSession, user_id: int) -> TodayContext:
    """Fetch today's PlannedWorkout rows (falling back to the persisted
    CoachRecommendation) and today's completed activities, athlete-local.

    Best-effort: any query failure degrades to an empty context rather than
    blocking the caller (adaptive directive / brief must always render).
    """
    ctx = TodayContext()
    today = today_local()

    # --- Planned rows (dual-sport aware: several rows can share a day) -----
    planned_rows: list = []
    try:
        from app.models.planned_workout import PlannedWorkout

        pw_q = await db.execute(
            select(PlannedWorkout).where(
                PlannedWorkout.user_id == user_id,
                PlannedWorkout.date == today,
            )
        )
        planned_rows = list(pw_q.scalars().all())
    except Exception:  # pragma: no cover — model absent / mocked db
        planned_rows = []

    non_rest = [
        r for r in planned_rows
        if not _rest_planned_row(getattr(r, "template_id", None), getattr(r, "title", None))
    ]
    if planned_rows and not non_rest:
        ctx.planned_is_rest = True
    elif non_rest:
        # Primary planned session: prefer the cycling row (the coached sport).
        primary = next(
            (r for r in non_rest if sport_family(getattr(r, "sport", None)) == "cycling"),
            non_rest[0],
        )
        ctx.planned = _planned_from_row(primary)

    if not planned_rows:
        # --- Fallback: the persisted coach recommendation for today --------
        try:
            rec_q = await db.execute(
                select(CoachRecommendation).where(
                    CoachRecommendation.user_id == user_id,
                    CoachRecommendation.target_date == today,
                )
            )
            rec = rec_q.scalar_one_or_none()
        except Exception:  # pragma: no cover
            rec = None
        if rec is not None and getattr(rec, "template_id", None):
            if rec.template_id == "rest_day":
                ctx.planned_is_rest = True
            else:
                ctx.planned = {
                    "sport": getattr(rec, "sport", None) or "cycling",
                    "title": rec.title,
                    "template_id": rec.template_id,
                    "target_tss": float(rec.predicted_tss or 0) or None,
                    "duration_minutes": int(rec.duration_minutes or 0) or None,
                    "category": _template_category(rec.template_id),
                }

    # --- Today's completed activities (athlete-local window) --------------
    try:
        start_utc, end_utc = today_local_window()
        act_q = await db.execute(
            select(Activity).where(
                Activity.user_id == user_id,
                Activity.started_at >= start_utc,
                Activity.started_at < end_utc,
            )
        )
        for a in act_q.scalars().all():
            ctx.activities.append({
                "sport": getattr(a, "sport", None) or "cycling",
                "duration_minutes": float(getattr(a, "duration_seconds", 0) or 0) / 60.0,
                "tss": float(getattr(a, "tss", 0) or 0.0),
            })
    except Exception:  # pragma: no cover
        pass

    return ctx


def _planned_from_row(row) -> dict:
    template_id = getattr(row, "template_id", None)
    duration_s = getattr(row, "duration_seconds_target", None)
    return {
        "sport": getattr(row, "sport", None) or "cycling",
        "title": getattr(row, "title", None) or (template_id or "Planned session"),
        "template_id": template_id,
        "target_tss": _template_base_tss(template_id),
        "duration_minutes": int(round(duration_s / 60)) if duration_s else None,
        "category": _template_category(template_id),
    }


def _template_base_tss(template_id: str | None) -> float | None:
    try:
        from app.services.workout_templates import get_template

        tpl = get_template(template_id) if template_id else None
        return float(tpl.base_tss) if tpl is not None else None
    except Exception:  # pragma: no cover
        return None


def _template_category(template_id: str | None) -> str | None:
    try:
        from app.services.workout_templates import get_template

        tpl = get_template(template_id) if template_id else None
        return tpl.category if tpl is not None else None
    except Exception:  # pragma: no cover
        return None


async def _fallback_pick(db: AsyncSession, user_id: int, profile) -> dict | None:
    """No planned row and no recommendation — resolve today via the same
    picker the snapshot uses (light slice of build_snapshot). Returns a
    planned-shaped dict (rest days → template_id 'rest_day')."""
    try:
        from app.services import coach_service
        from app.services.advanced_metrics import ctl_atl_tsb_snapshot, hrv_trend
        from app.services.safety_rails import RailContext, intensity_ceiling
        from app.services.training_periodization import (
            detect_training_phase,
            pick_template,
            session_type_for_today,
        )

        pmc = await ctl_atl_tsb_snapshot(db, user_id)
        weekly_prog = await coach_service._weekly_progress(db, user_id)
        days_since_rest = await coach_service._days_since_rest(db, user_id)
        hrv = await hrv_trend(db, user_id, days=7)

        ctl = float(pmc.get("ctl") or 0.0)
        atl = float(pmc.get("atl") or 0.0)
        tsb = float(pmc.get("tsb") or 0.0)
        ceiling = intensity_ceiling(RailContext(
            ctl=ctl, atl=atl, tsb=tsb,
            hrv_delta_pct=float((hrv or {}).get("delta_pct") or 0.0),
            injury_flag=bool(getattr(profile, "injury_flag", False)) if profile else False,
            days_since_rest=int(days_since_rest),
        ))

        goals = profile.goals if profile is not None and isinstance(profile.goals, dict) else {}
        goal_date = getattr(profile, "target_event_date", None) if profile else None
        phase = detect_training_phase(goal_date, ctl)
        session = session_type_for_today(
            phase=phase,
            weekly_progress=weekly_prog,
            tsb=tsb,
            intensity_ceiling=ceiling,
            day_of_week=today_local().weekday(),
            training_model=goals.get("training_model"),
        )
        weekly_hours = getattr(profile, "weekly_hours_available", None) if profile else None
        if not weekly_hours or weekly_hours <= 0:
            weekly_hours = 8.0
        available_minutes = min(180, max(30, int(round((float(weekly_hours) * 60) / 7))))
        ftp = getattr(profile, "ftp_watts", None) if profile else None
        template = pick_template(
            session_type=session,
            athlete_ftp=ftp,
            available_minutes=available_minutes,
            rotation_key=today_local().toordinal(),
        )
        return {
            "sport": "cycling",
            "title": template.name,
            "template_id": template.id,
            "target_tss": float(template.base_tss),
            "duration_minutes": int(round(sum(b.duration_s for b in template.blocks) / 60)) or None,
            "category": template.category,
        }
    except Exception:  # pragma: no cover — picker must never block the decision
        logger.exception("daily_decision fallback pick failed for user_id=%s", user_id)
        return None


async def _readiness_summary(db: AsyncSession, user_id: int) -> DailyDecisionReadiness:
    """Best-effort multi-factor readiness — {score, tier}; nulls on failure."""
    try:
        from app.services.advanced_metrics import (
            ctl_atl_tsb_snapshot,
            hrv_trend,
            rhr_trend,
            sleep_debt,
        )
        from app.services.readiness_score import ReadinessInputs, compute_readiness

        hrv = await hrv_trend(db, user_id, days=7) or {}
        rhr = await rhr_trend(db, user_id, days=7) or {}
        sleep = await sleep_debt(db, user_id, days=14) or {}
        pmc = await ctl_atl_tsb_snapshot(db, user_id) or {}
        report = compute_readiness(ReadinessInputs(
            hrv_7d_mean=hrv.get("current_mean"),
            hrv_28d_baseline=hrv.get("baseline_28d_mean"),
            hrv_cv_pct=None,
            rhr_7d_mean=rhr.get("current_mean"),
            rhr_28d_baseline=rhr.get("baseline_28d_mean"),
            sleep_score_last_night=None,
            avg_nightly_debt_h=sleep.get("avg_nightly_debt"),
            tsb=pmc.get("tsb"),
            ctl=float(pmc.get("ctl") or 0.0),
            atl=float(pmc.get("atl") or 0.0),
            body_battery_wake=None,
        ))
        score = report.overall
        return DailyDecisionReadiness(
            score=int(round(score)) if score is not None else None,
            tier=report.ceiling,
        )
    except Exception:  # pragma: no cover
        return DailyDecisionReadiness()


# ======================================================================
#  Copy bank — short, locale-aware; surfaces add their own flavor
# ======================================================================

_SPORT_LABEL_DE = {"cycling": "Ausfahrt", "running": "Lauf", "strength": "Krafttraining", "other": "Einheit"}
_SPORT_LABEL_EN = {"cycling": "ride", "running": "run", "strength": "strength session", "other": "session"}


def _sport_label(family: str | None, de: bool) -> str:
    fam = family or "other"
    return (_SPORT_LABEL_DE if de else _SPORT_LABEL_EN).get(fam, _SPORT_LABEL_DE["other"] if de else _SPORT_LABEL_EN["other"])


def _load_target_line(tss_target: float, state: str, de: bool) -> str:
    n = int(round(tss_target))
    if de:
        suffix = {"easy": "lockerer Tag", "recover": "lockerer Tag", "quality": "Qualitätstag", "hard": "harter Tag"}.get(state, "lockerer Tag")
        return f"Belastungsziel heute: ~{n} TSS ({suffix})"
    suffix = {"easy": "easy day", "recover": "easy day", "quality": "quality day", "hard": "hard day"}.get(state, "easy day")
    return f"Load target today: ~{n} TSS ({suffix})"


# ======================================================================
#  The decision core (pure — unit-testable without a DB)
# ======================================================================


def decide(
    *,
    today: date,
    status_state: str | None,
    ctx: TodayContext,
    directive: Directive | None,
    readiness: DailyDecisionReadiness,
    language: str = "simple",
    locale: str = "de",
) -> DailyDecision:
    de = str(locale).lower().startswith("de")

    planned_model: DailyDecisionPlanned | None = None
    if ctx.planned:
        planned_model = DailyDecisionPlanned(
            title=str(ctx.planned.get("title") or "Session"),
            template_id=ctx.planned.get("template_id"),
            target_tss=ctx.planned.get("target_tss"),
            duration_minutes=ctx.planned.get("duration_minutes"),
        )

    def _decision(state, verdict, reason, cta=None, tss_target=None, keep_planned=True):
        return DailyDecision(
            date=today.isoformat(),
            state=state,
            verdict=verdict,
            reason=reason,
            cta=cta,
            planned=planned_model if keep_planned else None,
            readiness=readiness,
            tss_target=round(tss_target, 1) if tss_target is not None else None,
            strain_target=strain_from_tss(tss_target),
        )

    # ── 1. Athlete self-report outranks every signal ─────────────────────
    if status_state == "sick":
        return _decision(
            "sick",
            "Krank gemeldet — heute zählt nur Erholung." if de
            else "Marked sick — recovery is today's only session.",
            "Dein eigener Status schlägt jedes Trainingssignal. Kein Training, bis du dich besser fühlst." if de
            else "Your self-report outranks every training signal. No training until you feel better.",
            keep_planned=False,
        )
    if status_state == "injured":
        return _decision(
            "injured",
            "Verletzt gemeldet — Heilung ist das Training." if de
            else "Marked injured — healing is the training.",
            "Erst heilen, dann trainieren. Der Plan wartet auf dich." if de
            else "Heal first, train later. The plan will wait for you.",
            keep_planned=False,
        )
    if status_state == "break":
        return _decision(
            "break",
            "Pause eingelegt — locker bleiben." if de else "On a break — keep it light.",
            "Selbst gemeldete Pause. Sanft zurückkommen, wenn du bereit bist." if de
            else "Self-reported break. Ease back in when you're ready.",
            keep_planned=False,
        )

    # ── 2. Already trained — SPORT-AWARE ─────────────────────────────────
    planned_sport = ctx.planned.get("sport") if ctx.planned else None
    matching_minutes = ctx.matching_minutes(planned_sport) if ctx.planned else 0.0
    trained = (
        (ctx.planned is not None and matching_minutes >= 20.0)
        or (ctx.planned is None and ctx.total_minutes >= 20.0)
    )
    if trained:
        if ctx.planned is not None:
            fam = sport_family(planned_sport)
            mins = int(round(matching_minutes))
        else:
            # No plan — label by the dominant sport of what was done.
            by_fam: dict[str, float] = {}
            for a in ctx.activities:
                f = sport_family(a.get("sport"))
                by_fam[f] = by_fam.get(f, 0.0) + float(a.get("duration_minutes") or 0.0)
            fam = max(by_fam, key=lambda k: by_fam[k]) if by_fam else "other"
            mins = int(round(ctx.total_minutes))
        label = _sport_label(fam, de)
        cta = DailyDecisionCTA(
            label="Auswertung ansehen" if de else "View your review",
            target="today#review",
        )
        return _decision(
            "trained_already",
            f"Training erledigt — {mins} min {label}." if de
            else f"Done — {mins} min {label} logged.",
            "Das war die Arbeit für heute. Jetzt zählt Erholung: tanken, trinken, schlafen." if de
            else "That's today's work. Recovery is the win now: fuel, hydrate, sleep.",
            cta=cta,
        )

    # Cross-sport credit — other-sport work done, planned session still open.
    other_fam, other_minutes = ctx.other_sport_summary(planned_sport)
    cross_prefix = ""
    if ctx.planned is not None and other_fam is not None and other_minutes >= 20.0:
        o_mins = int(round(other_minutes))
        o_label = _sport_label(other_fam, de)
        cross_prefix = (
            f"Heute schon {o_mins} min {o_label} — zählt. " if de
            else f"{o_mins} min of {o_label} already banked — it counts. "
        )

    # ── 3. Planned rest day ──────────────────────────────────────────────
    if ctx.planned_is_rest or ctx.planned is None:
        # No planned session resolved by the caller either → rest by plan.
        well_recovered = readiness.score is not None and readiness.score >= 60 or (
            readiness.tier in ("moderate", "push")
        )
        reason = (
            ("Gut erholt — und heute ist Ruhetag geplant. Nimm die Frische mit in die morgige Einheit." if de
             else "Well recovered — and today is a planned rest day. Bank it for tomorrow's quality session.")
            if well_recovered else
            ("Ruhetag wie geplant — genau das, was dein Körper gerade braucht." if de
             else "Rest day as planned — exactly what your body needs right now.")
        )
        return _decision(
            "planned_rest",
            "Ruhetag — so geplant." if de else "Rest day — as planned.",
            cross_prefix + reason,
            keep_planned=False,
        )

    # ── 4. Readiness + adaptive directive → recover/easy/quality/hard ────
    category = ctx.planned.get("category")
    base_state = {
        "recovery": "easy",
        "endurance": "easy",
        "tempo": "quality",
        "sweet_spot": "quality",
        "threshold": "quality",
        "vo2": "hard",
        "anaerobic": "hard",
    }.get(category or "", "easy")

    d_directive = directive.directive if directive is not None else "push"
    d_ceiling = directive.intensity_ceiling if directive is not None else "hard"
    vol = float(directive.volume_modifier) if directive is not None else 1.0

    if d_directive in ("deload", "rest"):
        state = "recover"
    elif d_ceiling == "easy" or d_directive == "hold" and d_ceiling not in ("moderate", "hard", "push"):
        state = "easy"
    elif d_ceiling == "moderate" and base_state == "hard":
        state = "quality"  # capped one notch
    else:
        state = base_state

    planned_tss = ctx.planned.get("target_tss")
    tss_target = (float(planned_tss) * vol) if planned_tss else None

    title = str(ctx.planned.get("title") or ("Einheit" if de else "Session"))
    if state == "recover":
        verdict = "Locker erholen — Plan bleibt, Umfang runter." if de \
            else "Recover easy — the plan stays, the load comes down."
        reason = (
            "Deine Erholungssignale wollen Entlastung. Die geplante Einheit bleibt, aber kürzer und leichter." if de
            else "Your recovery signals ask for less. Today's session stays, just shorter and lighter."
        )
    elif state == "easy":
        verdict = f"Lockerer Tag — {title}." if de else f"Easy day — {title}."
        reason = (
            "Ruhig fahren, Grundlage sammeln — die Woche fängt den Rest auf." if de
            else "Keep it easy, bank the base — the week absorbs the rest."
        )
    elif state == "quality":
        verdict = f"Qualitätstag — {title}." if de else f"Quality day — {title}."
        reason = (
            "Signale sind gut — die geplante Einheit zählt heute." if de
            else "Signals look good — today's planned session is the one that counts."
        )
    else:  # hard
        verdict = f"Harter Tag — {title}." if de else f"Hard day — {title}."
        reason = (
            "Du bist bereit für die volle Einheit — genau nach Plan." if de
            else "You're ready for the full session — exactly as planned."
        )

    if tss_target is not None:
        reason = f"{reason} {_load_target_line(tss_target, state, de)}."

    cta = DailyDecisionCTA(
        label="Zur Einheit" if de else "Open today's workout",
        target="today#workout",
    )
    return _decision(state, verdict, cross_prefix + reason, cta=cta, tss_target=tss_target)


# ======================================================================
#  Entry point
# ======================================================================


async def compute_daily_decision(
    db: AsyncSession,
    user_id: int,
    profile,
    *,
    language: str = "simple",
    locale: str = "de",
    directive: Directive | None = None,
    ctx: TodayContext | None = None,
) -> DailyDecision:
    """Compute today's single decision, FRESH — never from a cached row.

    `directive` / `ctx` are injectable so callers that already computed them
    (e.g. /coach/adaptive) don't pay twice, and tests can stub them.
    """
    set_athlete_tz_from_profile(profile)
    today = today_local()

    goals = profile.goals if profile is not None and isinstance(profile.goals, dict) else {}
    status = goals.get("athlete_status") if isinstance(goals.get("athlete_status"), dict) else {}
    status_state = status.get("state")

    if ctx is None:
        ctx = await load_today_context(db, user_id)

    # No explicit plan anywhere → resolve today via the picker so planned_rest
    # vs a training day is decided the same way the brief decides it.
    if ctx.planned is None and not ctx.planned_is_rest and status_state not in ("sick", "injured"):
        picked = await _fallback_pick(db, user_id, profile)
        if picked is not None:
            if picked.get("template_id") == "rest_day" or picked.get("category") == "rest":
                ctx.planned_is_rest = True
            else:
                ctx.planned = picked

    readiness = await _readiness_summary(db, user_id)

    if directive is None and status_state not in ("sick", "injured", "break"):
        try:
            lang = "de" if str(locale).lower().startswith("de") else "en"
            directive = await build_adaptive_directive(db, user_id, lang)
        except Exception:  # pragma: no cover — decision must always render
            logger.exception("adaptive directive failed inside daily_decision (user_id=%s)", user_id)
            directive = None

    return decide(
        today=today,
        status_state=status_state,
        ctx=ctx,
        directive=directive,
        readiness=readiness,
        language=language,
        locale=locale,
    )
