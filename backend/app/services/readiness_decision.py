"""Readiness as a DECISION with a receipt — not a score to interpret.

The competitive point, stated plainly: a wearable can tell an athlete they are
at 43 %. It cannot tell them what to do instead, because it does not know what
they were going to do. This app does — there is a plan, there is a session for
today, and there is an endpoint that modifies it. So this module answers three
questions at once:

    1. What is today's session NOW, after the measurements were applied?
    2. What would it have been WITHOUT them?          ← the whole feature
    3. Which single measurement moved it, with its number?

(2) is the part that cannot be faked. Without it the athlete has no way to
tell whether the measurement changed anything, and a readiness number that
changes nothing is decoration.

NOTHING IS REIMPLEMENTED HERE.
    * The verdict comes from `daily_decision.decide()` — the app's single
      producer of "what should I do today?". It is a pure function taking the
      adaptive directive as an argument, which is exactly what makes the
      counterfactual cheap and honest: run it twice, once with the directive
      and once with it withheld. The second run is not a model of the plan,
      it IS the plan's own decision function with the measurements removed.
    * The HRV band comes from `hrv_state.estimate_hrv_state` — the one
      estimator, one window policy, every consumer. Its non-overlapping
      baseline and 0.5×SD band are used as-is; forking them is the defect
      that module was written to end. It reads `DailyMetric.hrv_status`,
      which the Garmin mapper fills from `hrvSummary.lastNightAvg` — the
      overnight rMSSD average. `hrv_overnight_avg` (from `avgOvernightHrv`
      on the SLEEP payload) is the SAME physiological quantity via a second
      endpoint, and is deliberately not mixed in: one series, one source, so
      this endpoint's band can never disagree with the directive that
      actually moved the plan.
    * The composite score comes from `daily_decision._readiness_summary`,
      the same call `/coach/brief` makes, so this endpoint can never disagree
      with the number the athlete already sees on Today.
    * The eased session is named with `workout_modifier.endurance_for_duration`
      — the same function the hourly plan engine applies in rule R2 — so the
      session we name is the session the engine would actually write.

THE STALENESS RULE.
    `utils/readinessGate.ts` is the app's one gate and it had no backend port;
    every backend consumer had grown its own inline rule instead. This module
    ports the frontend gate verbatim (`STALE_AFTER_DAYS = 2`, a row counts as
    an overnight record iff any of sleep_score / hrv_status / resting_hr is
    present, and the verdict is withheld on 'pending' AND 'stale' unless the
    athlete already trained today or is self-reported sidelined). When it
    withholds, `verdict` is NULL — not a hedged verdict, not a lower-confidence
    verdict. The inputs are still returned, with their ages, so the athlete can
    see WHAT is stale rather than just being told nothing.

THRESHOLDS, AND WHY THEY ARE THESE.
    Every threshold is expressed in the athlete's OWN variability, never in
    absolute units. "HRV 10 ms below baseline" is a crisis for an athlete
    whose SD is 4 ms and a normal Tuesday for one whose SD is 12 ms; a fixed
    millisecond threshold silently means a different thing for every athlete.

    * HRV — `HRV_BAND_SD` (0.5 × the baseline window's daily SD), applied to
      the 7-day mean. This is not our invention: it is the Nuuttila /
      Vesterinen smallest-worthwhile-change convention from the HRV-guided
      training RCTs, and it is already the band this app's directive uses. We
      replicate the trials rather than inventing a number.
    * Every single-night signal (RHR, sleep score, sleep duration, wake body
      battery, wake stress) — `SINGLE_NIGHT_BAND_SD` = 1.0 × that signal's own
      baseline SD. One SD is the smallest deviation that is more plausibly
      signal than an ordinary night: it puts the day outside roughly the middle
      two thirds of that athlete's own distribution, so it fires often enough
      to be a real input to a decision. At 2 SD it would fire a handful of
      times a year and the receipt would be decoration; below 1 SD it would
      fire most days and mean nothing.
    * `MIN_BASELINE_N` = `HRV_MIN_BASELINE_N` (10). Deliberately the same
      constant the HRV estimator already demands, so no signal in this app
      claims a baseline on less evidence than another. Below it the baseline
      is NULL and the payload says how many readings are still missing — a
      comparison against a guess is worse than no comparison.
    * `BASELINE_DAYS` = 28, and the baseline window never contains the day it
      judges. Comparing a value to a set containing it attenuates the
      deviation toward "normal", which is toward permitting load, and through
      a sustained suppression it drags its own reference down until the
      suppression stops being detectable (`hrv_state` §4.1).

This module DOES NOT modify the session. It returns the decision and its
receipt; `POST /workouts/today/modify` already exists and the client calls it.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, replace
from datetime import date, timedelta
from statistics import mean, pstdev

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_metric import DailyMetric
from app.models.plan_adaptation import PlanAdaptation
from app.schemas.coach import DailyDecision, DailyDecisionReadiness
from app.schemas.readiness_decision import (
    InputKey,
    ReadinessDecisionRead,
    ReadinessDriver,
    ReadinessGate,
    ReadinessInput,
    ReadinessSession,
    ReadinessVerdict,
)
from app.services.adaptive_readiness import Directive, build_adaptive_directive
from app.services.athlete_time import set_athlete_tz_from_profile, today_local
from app.services.daily_decision import TodayContext, decide, load_today_context
from app.services.hrv_state import (
    HRV_BAND_SD,
    HRV_MIN_BASELINE_N,
    HrvState,
    estimate_hrv_state,
)

logger = logging.getLogger(__name__)


# ======================================================================
#  Constants — see the module docstring for the reasoning behind each
# ======================================================================

#: Port of `utils/readinessGate.ts`. 1 = yesterday's record still counts as a
#: pending morning; 2+ days is stale.
STALE_AFTER_DAYS = 2
#: Days of reference behind every non-HRV baseline.
BASELINE_DAYS = 28
#: Minimum readings before ANY baseline in this module is real. Same constant
#: the HRV estimator demands, on purpose.
MIN_BASELINE_N = HRV_MIN_BASELINE_N
#: |z| at which a single-night signal counts as meaningfully off.
SINGLE_NIGHT_BAND_SD = 1.0
#: How far back the history pull reaches. One baseline window plus slack for
#: gaps, matching the HRV series pull.
HISTORY_DAYS = 35

#: Daily-decision states, easy→hard, for detecting a downgrade.
_STATE_RANK = {"recover": 0, "easy": 1, "quality": 2, "hard": 3}

#: PlanAdaptation signals that are MEASUREMENTS. `illness` is a self-report,
#: not something a wearable measured, so it never sources this receipt.
#:
#: `readiness_decision` gehoert hierher, seit R6 (`readiness_applied`) die
#: Entscheidung wirklich anwendet. Ohne diesen Eintrag findet die Entscheidung
#: ihr EIGENES Vorher-Bild nicht: sie faellt auf den `recomputed`-Pfad zurueck
#: und rechnet die Gegenrechnung an einer Planzeile nach, die bereits
#: abgestuft ist -- `session_planned` wird dann gleich `session_now`, und der
#: Beleg, WAS ersetzt wurde, geht verloren. In der Produktion beobachtet,
#: unmittelbar nachdem R6 zum ersten Mal gefeuert hatte.
_MEASURED_SIGNALS = ("short_sleep_low_hrv", "readiness_decision")


# ======================================================================
#  Pure data — the core never touches an ORM row
# ======================================================================


@dataclass(frozen=True)
class MetricDay:
    """One athlete-local day of overnight measurements."""

    day: date
    hrv_status: float | None = None
    resting_hr: float | None = None
    sleep_score: float | None = None
    sleep_total_s: int | None = None
    sleep_deep_s: int | None = None
    body_battery_wake: int | None = None
    stress_wake: int | None = None

    @property
    def has_overnight_signal(self) -> bool:
        """The frontend gate's exact predicate: sleep_score OR hrv_status OR
        resting_hr. Body battery and stress deliberately do NOT qualify — a
        watch can report those without having recorded a night."""
        return (
            self.sleep_score is not None
            or self.hrv_status is not None
            or self.resting_hr is not None
        )


@dataclass(frozen=True)
class _SignalSpec:
    key: InputKey
    label_de: str
    unit: str
    higher_is_better: bool
    decimals: int
    attr: str
    #: Convert the stored column to the displayed unit.
    scale: float = 1.0


_SINGLE_NIGHT_SIGNALS: tuple[_SignalSpec, ...] = (
    _SignalSpec("resting_hr", "Ruhepuls", "bpm", False, 0, "resting_hr"),
    _SignalSpec("sleep_score", "Schlaf-Score", "", True, 0, "sleep_score"),
    _SignalSpec(
        "sleep_duration", "Schlaf", "h", True, 1, "sleep_total_s", scale=1.0 / 3600.0
    ),
    # Of the four stage columns, only DEEP is carried as its own input. Light,
    # REM and awake time are near-complements of deep and total on the same
    # night: giving each a slot would count one night's sleep four times and
    # let a single bad night sweep the driver ranking. Deep is the stage with
    # the clearest recovery link, so it is the one that earns a slot.
    _SignalSpec(
        "sleep_deep", "Tiefschlaf", "h", True, 1, "sleep_deep_s", scale=1.0 / 3600.0
    ),
    _SignalSpec(
        "body_battery_wake", "Body Battery beim Aufwachen", "", True, 0,
        "body_battery_wake",
    ),
    _SignalSpec("stress_wake", "Stress beim Aufwachen", "", False, 0, "stress_wake"),
)


# ======================================================================
#  German formatting — plain register: state the number and stop
# ======================================================================


def _num(value: float | None, decimals: int = 0) -> str:
    """German decimal comma. Integers never grow a ',0' tail."""
    if value is None:
        return "—"
    if decimals <= 0:
        return str(int(round(value)))
    return f"{value:.{decimals}f}".replace(".", ",")


def _with_unit(value: float | None, unit: str, decimals: int) -> str:
    n = _num(value, decimals)
    return f"{n} {unit}" if unit else n


def _age_note(age_days: int | None) -> str | None:
    """DATE THE MEASUREMENT.

    The app's stale-wearable rule is "withhold the verdict, date the
    measurement" — withholding alone is only half of it. A line that reads
    "Ruhepuls 48 bpm, dein Schnitt ist 48 bpm" is a present-tense claim, and
    off a watch that last synced on Tuesday it is a false one. Every input
    older than this morning says how old it is, whether or not the verdict
    was withheld.
    """
    if age_days is None or age_days <= 0:
        return None
    if age_days == 1:
        return "Gemessen gestern."
    return f"Gemessen vor {age_days} Tagen."


def _join_notes(*parts: str | None) -> str | None:
    kept = [p for p in parts if p]
    return " ".join(kept) if kept else None


# ======================================================================
#  The staleness gate — the backend port of utils/readinessGate.ts
# ======================================================================


def classify_gate(
    days: list[MetricDay], *, today: date
) -> tuple[ReadinessGate, int | None, date | None]:
    """Return (gate, age_days, last_measured_on).

    Verbatim port of `readinessFreshness` in `utils/readinessGate.ts`: rows
    without an overnight signal are skipped, future-dated rows are skipped
    (clock skew must never mask staleness), and the SMALLEST non-negative age
    wins. 0 → 'fresh', 1 → 'pending', >= STALE_AFTER_DAYS → 'stale', nothing
    at all → 'none'.
    """
    best_age: int | None = None
    best_day: date | None = None
    for d in days:
        if not d.has_overnight_signal:
            continue
        age = (today - d.day).days
        if age < 0:
            continue
        if best_age is None or age < best_age:
            best_age, best_day = age, d.day

    if best_age is None:
        return "none", None, None
    if best_age == 0:
        return "fresh", 0, best_day
    if best_age < STALE_AFTER_DAYS:
        return "pending", best_age, best_day
    return "stale", best_age, best_day


def withhold_verdict(
    gate: ReadinessGate, *, trained_today: bool, sidelined: bool
) -> bool:
    """The frontend's `withholdReadiness`, unchanged.

    Two escapes: a ride already done today is fresher evidence than any
    overnight record, and a self-reported sick/injured/break day carries its
    own explanation. 'none' does NOT withhold — it is the honest empty state
    for an athlete with no wearable, not a broken one.
    """
    if trained_today or sidelined:
        return False
    return gate in ("pending", "stale")


# ======================================================================
#  Measured inputs — each against the athlete's own trailing baseline
# ======================================================================


def _direction(deviation: float | None) -> str:
    if deviation is None:
        return "unknown"
    if deviation > 0:
        return "above"
    if deviation < 0:
        return "below"
    return "at"


def _single_night_input(
    spec: _SignalSpec, days: list[MetricDay], *, today: date
) -> ReadinessInput:
    """One single-night signal: newest reading vs the 28 days PRECEDING it.

    The baseline window ends the day before the reading it judges, so a value
    is never compared against a set containing itself.
    """
    series: list[tuple[date, float]] = []
    for d in days:
        raw = getattr(d, spec.attr, None)
        if raw is None:
            continue
        series.append((d.day, float(raw) * spec.scale))
    series.sort(key=lambda t: t[0])

    if not series:
        return ReadinessInput(
            key=spec.key,
            label_de=spec.label_de,
            value=None,
            unit=spec.unit,
            basis="today",
            baseline=None,
            text_de=f"{spec.label_de}: keine Messung.",
        )

    value_day, value = series[-1]
    age_days = max(0, (today - value_day).days)

    ref = [
        v for d, v in series if 1 <= (value_day - d).days <= BASELINE_DAYS
    ]
    n = len(ref)

    if n < MIN_BASELINE_N:
        return ReadinessInput(
            key=spec.key,
            label_de=spec.label_de,
            value=round(value, spec.decimals) if spec.decimals else round(value),
            unit=spec.unit,
            basis="today",
            baseline=None,
            baseline_n=n,
            age_days=age_days,
            text_de=(
                f"{spec.label_de} {_with_unit(value, spec.unit, spec.decimals)} — "
                "noch keine Basislinie."
            ),
            note_de=_join_notes(
                f"Basislinie ab {MIN_BASELINE_N} Messungen. Bisher: {n}.",
                _age_note(age_days),
            ),
        )

    baseline = mean(ref)
    sd = pstdev(ref)
    if sd <= 0:
        # A perfectly flat reference is a stuck sensor, not a settled athlete.
        # With no dispersion there is no scale to judge a deviation against.
        return ReadinessInput(
            key=spec.key,
            label_de=spec.label_de,
            value=round(value, spec.decimals) if spec.decimals else round(value),
            unit=spec.unit,
            basis="today",
            baseline=round(baseline, spec.decimals) if spec.decimals else round(baseline),
            baseline_n=n,
            age_days=age_days,
            text_de=(
                f"{spec.label_de} {_with_unit(value, spec.unit, spec.decimals)}, "
                f"dein Schnitt ist {_with_unit(baseline, spec.unit, spec.decimals)}."
            ),
            note_de=_join_notes(
                "Keine Streuung in der Basislinie — keine Abweichung berechenbar.",
                _age_note(age_days),
            ),
        )

    deviation = value - baseline
    z = deviation / sd
    off = abs(z) >= SINGLE_NIGHT_BAND_SD
    direction = _direction(deviation)
    unfavourable = off and (
        direction == "below" if spec.higher_is_better else direction == "above"
    )

    # Compare what the athlete SEES. A line reading "22, dein Schnitt ist 22"
    # claims a deviation the numbers on screen do not show.
    shown = _with_unit(value, spec.unit, spec.decimals)
    shown_baseline = _with_unit(baseline, spec.unit, spec.decimals)
    if direction == "at" or shown == shown_baseline:
        text = f"{spec.label_de} {shown} — genau auf deinem Schnitt."
    else:
        text = f"{spec.label_de} {shown}, dein Schnitt ist {shown_baseline}."

    return ReadinessInput(
        key=spec.key,
        label_de=spec.label_de,
        value=round(value, spec.decimals) if spec.decimals else round(value),
        unit=spec.unit,
        basis="today",
        baseline=round(baseline, spec.decimals) if spec.decimals else round(baseline),
        baseline_n=n,
        deviation=round(deviation, max(spec.decimals, 1)),
        deviation_pct=round(deviation / baseline * 100.0, 1) if baseline else None,
        z=round(z, 2),
        band=SINGLE_NIGHT_BAND_SD,
        severity=round(abs(z) / SINGLE_NIGHT_BAND_SD, 2),
        off=off,
        direction=direction,  # type: ignore[arg-type]
        unfavourable=unfavourable,
        age_days=age_days,
        text_de=text,
        note_de=_age_note(age_days),
    )


def _hrv_input(hrv: HrvState) -> ReadinessInput:
    """HRV against the athlete's own variability.

    `off` is the band that actually moved the plan — `state` from the one
    estimator, i.e. the 7-day mean outside baseline ± 0.5 × the baseline's
    daily SD. The deviation is reported back on the RAW millisecond scale
    (exp of the log-scale means) because that is the number an athlete can
    read; the decision itself stays on the log scale where it belongs.
    """
    import math

    has_baseline = (
        hrv.ln_baseline is not None
        and hrv.baseline_sd is not None
        and hrv.baseline_sd > 0
        and hrv.n_baseline >= MIN_BASELINE_N
    )
    value_ms = math.exp(hrv.ln_recent) if hrv.ln_recent is not None else None

    if value_ms is None:
        return ReadinessInput(
            key="hrv",
            label_de="HRV",
            value=None,
            unit="ms",
            basis="recent_7d",
            baseline=None,
            baseline_n=hrv.n_baseline,
            age_days=hrv.age_days,
            text_de="HRV: keine Messung.",
            note_de=_age_note(hrv.age_days),
        )

    if not has_baseline:
        return ReadinessInput(
            key="hrv",
            label_de="HRV",
            value=round(value_ms),
            unit="ms",
            basis="recent_7d",
            baseline=None,
            baseline_n=hrv.n_baseline,
            age_days=hrv.age_days,
            text_de=f"HRV {_num(value_ms)} ms — noch keine Basislinie.",
            note_de=_join_notes(
                f"Basislinie ab {MIN_BASELINE_N} Messungen. Bisher: {hrv.n_baseline}.",
                _age_note(hrv.age_days),
            ),
        )

    baseline_ms = math.exp(hrv.ln_baseline)  # type: ignore[arg-type]
    deviation = value_ms - baseline_ms
    z = (hrv.ln_recent - hrv.ln_baseline) / hrv.baseline_sd  # type: ignore[operator]
    # The verdict is `state` — the literature band — not a re-derived test.
    off = hrv.state in ("below", "above")
    direction = _direction(deviation)
    unfavourable = hrv.state == "below"

    if direction == "at" or round(abs(deviation)) == 0:
        text = f"HRV {_num(value_ms)} ms — auf deinem Schnitt."
    elif direction == "below":
        text = f"HRV {_num(abs(deviation))} ms unter deinem Schnitt."
    else:
        text = f"HRV {_num(abs(deviation))} ms über deinem Schnitt."

    note: str | None = None
    if hrv.state == "unknown":
        note = (
            "Zu alt für heute."
            if hrv.age_days is not None and hrv.age_days > 0
            else "Zu wenige Messungen im 7-Tage-Fenster."
        )
    note = _join_notes(_age_note(hrv.age_days), note)

    return ReadinessInput(
        key="hrv",
        label_de="HRV",
        value=round(value_ms),
        unit="ms",
        basis="recent_7d",
        baseline=round(baseline_ms),
        baseline_n=hrv.n_baseline,
        deviation=round(deviation, 1),
        deviation_pct=hrv.delta_pct,
        z=round(z, 2),
        band=HRV_BAND_SD,
        severity=round(abs(z) / HRV_BAND_SD, 2),
        off=off,
        direction=direction,  # type: ignore[arg-type]
        unfavourable=unfavourable,
        age_days=hrv.age_days,
        text_de=text,
        note_de=note,
    )


def build_inputs(
    days: list[MetricDay], hrv: HrvState, *, today: date
) -> list[ReadinessInput]:
    """Every measured input, HRV first (it is the primary lever)."""
    return [_hrv_input(hrv)] + [
        _single_night_input(spec, days, today=today) for spec in _SINGLE_NIGHT_SIGNALS
    ]


def pick_driver(inputs: list[ReadinessInput]) -> ReadinessDriver | None:
    """The single input that moved the decision most.

    Ranked by `severity` — |z| in units of that signal's OWN band — so signals
    with different bands stay comparable: an HRV at 1.8 band-widths outranks a
    sleep score at 1.1, even though its raw |z| is smaller. Unfavourable
    signals outrank favourable ones, because a downgrade is what needs
    explaining. None when nothing is meaningfully off — we do not promote a
    normal Tuesday to a cause.
    """
    candidates = [i for i in inputs if i.off and i.severity is not None]
    if not candidates:
        return None
    best = max(candidates, key=lambda i: (i.unfavourable, i.severity or 0.0))
    return ReadinessDriver(
        key=best.key, text_de=best.text_de, z=best.z, severity=best.severity
    )


# ======================================================================
#  The counterfactual
# ======================================================================


def _template_title(template_id: str | None, fallback: str | None = None) -> str:
    """German template name, so the receipt never shows a raw English id."""
    try:
        from app.services.workout_templates import get_template

        tpl = get_template(template_id) if template_id else None
        if tpl is not None:
            return tpl.name_de or tpl.name
    except Exception:  # pragma: no cover — naming never breaks the decision
        pass
    return fallback or template_id or "Einheit"


def _session_from_planned(planned: dict | None) -> ReadinessSession | None:
    if not planned:
        return None
    return ReadinessSession(
        title=_template_title(
            planned.get("template_id"),
            planned.get("title_de") or planned.get("title"),
        ),
        template_id=planned.get("template_id"),
        duration_minutes=planned.get("duration_minutes"),
        target_tss=planned.get("target_tss"),
    )


def _session_from_diff(diff: dict | None) -> ReadinessSession | None:
    """A PlanAdaptation before/after image → a session."""
    if not isinstance(diff, dict):
        return None
    tid = diff.get("template_id")
    return ReadinessSession(
        title=_template_title(tid, diff.get("title")),
        template_id=tid,
        target_tss=diff.get("target_tss"),
    )


def _eased_session(planned: dict, tss_target: float | None) -> ReadinessSession:
    """What a downgraded quality day becomes.

    Named with the plan engine's OWN rule (R2 `sleep_hrv_downgrade`): the
    intensity comes out, the time slot stays, so the replacement is the Z2
    endurance template closest to the planned duration. Same function, so the
    session named here is the session the engine would write.
    """
    duration = int(planned.get("duration_minutes") or 60) or 60
    try:
        from app.services.workout_modifier import endurance_for_duration

        tid = endurance_for_duration(duration)
    except Exception:  # pragma: no cover
        tid = None
    return ReadinessSession(
        title=_template_title(tid, "Lockere Grundlage"),
        template_id=tid,
        duration_minutes=duration,
        target_tss=round(tss_target, 1) if tss_target is not None else None,
    )


def _verdict_text(
    now: ReadinessSession | None,
    planned: ReadinessSession | None,
    *,
    changed: bool,
    template_swapped: bool,
) -> tuple[str, str | None]:
    """(verdict, counterfactual) — an ACTION, never an adjective.

    Register: state what happens and stop. No coach voice.
    """
    if now is None:
        return "Kein Plan für heute.", None
    if not changed or planned is None:
        tail = f", ~{_num(now.target_tss)} TSS" if now.target_tss else ""
        return (
            f"{now.title} wie geplant{tail}.",
            "Ohne diese Werte: die gleiche Einheit.",
        )
    if template_swapped:
        return (
            f"{now.title} statt {planned.title}.",
            f"Ohne diese Werte: {planned.title}.",
        )
    return (
        f"{now.title}, ~{_num(now.target_tss)} TSS statt ~{_num(planned.target_tss)} TSS.",
        f"Ohne diese Werte: {planned.title}, ~{_num(planned.target_tss)} TSS.",
    )


#: Plain lines for the states where readiness is not the author of the day.
_NON_TRAINING_VERDICT = {
    "planned_rest": "Ruhetag.",
    "trained_already": "Heute schon gefahren.",
    "sick": "Krank gemeldet. Kein Training.",
    "injured": "Verletzt gemeldet. Kein Training.",
    "break": "Pause. Heute steht nichts an.",
}


# ======================================================================
#  The pure assembler
# ======================================================================


def build_readiness_decision(
    *,
    today: date,
    gate: ReadinessGate,
    data_age_days: int | None,
    last_measured_on: date | None,
    inputs: list[ReadinessInput],
    hrv: HrvState,
    ctx: TodayContext,
    actual: DailyDecision,
    counterfactual: DailyDecision,
    readiness: DailyDecisionReadiness,
    recorded: tuple[ReadinessSession, ReadinessSession] | None = None,
    trained_today: bool = False,
    sidelined: bool = False,
) -> ReadinessDecisionRead:
    """Assemble the payload. Pure — every argument is already resolved."""
    withheld = withhold_verdict(gate, trained_today=trained_today, sidelined=sidelined)

    if gate == "none":
        baseline_state = "none"
    elif any(i.baseline is not None for i in inputs):
        baseline_state = "ready"
    else:
        baseline_state = "building"

    base = ReadinessDecisionRead(
        date=today.isoformat(),
        gate=gate,
        data_age_days=data_age_days,
        last_measured_on=last_measured_on.isoformat() if last_measured_on else None,
        inputs=inputs,
        baseline_state=baseline_state,  # type: ignore[arg-type]
        readiness_score=readiness.score,
        readiness_tier=readiness.tier,
        hrv_state=hrv.state,
        can_modify=ctx.planned is not None,
    )

    # ── Honest absence: no verdict at all ────────────────────────────────
    if withheld:
        if gate == "pending":
            reason = "Letzte Messung: gestern. Für heute liegt noch nichts vor."
        else:
            n = data_age_days
            reason = (
                f"Letzte Messung vor {n} Tagen. Kein Urteil ohne aktuelle Werte."
                if n is not None
                else "Keine aktuellen Messwerte. Kein Urteil."
            )
        return base.model_copy(
            update={
                "withheld": True,
                "withheld_reason_de": reason,
                "verdict": None,
                # The plan is plan data, not readiness data — it still stands.
                "session_now": _session_from_planned(ctx.planned),
                "session_planned": None,
                "changed": False,
                "counterfactual_source": None,
                "driver": None,
                # Nothing was withheld FROM the readiness score either: it must
                # not be shown next to a withheld verdict.
                "readiness_score": None,
                "readiness_tier": None,
            }
        )

    driver = pick_driver(inputs)

    # ── States where readiness did not author the day ────────────────────
    if actual.state in _NON_TRAINING_VERDICT:
        return base.model_copy(
            update={
                "verdict": ReadinessVerdict(
                    text_de=_NON_TRAINING_VERDICT[actual.state],
                    state=actual.state,
                    tss_target=actual.tss_target,
                    counterfactual_text_de=None,
                ),
                "session_now": None,
                "session_planned": None,
                "changed": False,
                "counterfactual_source": None,
                "driver": driver,
            }
        )

    # ── The receipt ──────────────────────────────────────────────────────
    if recorded is not None:
        before, after = recorded
        session_planned, session_now = before, after
        changed = (
            before.template_id != after.template_id
            or before.target_tss != after.target_tss
        )
        source = "recorded"
        applied = True
        template_swapped = before.template_id != after.template_id
    else:
        planned_dict = ctx.planned or {}
        session_planned = _session_from_planned(planned_dict)
        if session_planned is not None:
            session_planned = session_planned.model_copy(
                update={"target_tss": counterfactual.tss_target}
            )
        rank_now = _STATE_RANK.get(actual.state)
        rank_cf = _STATE_RANK.get(counterfactual.state)
        downgraded = (
            rank_now is not None and rank_cf is not None and rank_now < rank_cf
        )
        tss_dropped = (
            actual.tss_target is not None
            and counterfactual.tss_target is not None
            and round(actual.tss_target, 1) < round(counterfactual.tss_target, 1)
        )
        changed = bool(downgraded or tss_dropped)
        template_swapped = bool(downgraded and counterfactual.state in ("quality", "hard"))
        if template_swapped:
            session_now = _eased_session(planned_dict, actual.tss_target)
        else:
            session_now = _session_from_planned(planned_dict)
            if session_now is not None:
                session_now = session_now.model_copy(
                    update={"target_tss": actual.tss_target}
                )
        source = "recomputed"
        applied = False

    text, cf_text = _verdict_text(
        session_now, session_planned, changed=changed, template_swapped=template_swapped
    )

    return base.model_copy(
        update={
            "verdict": ReadinessVerdict(
                text_de=text,
                state=actual.state,
                tss_target=actual.tss_target,
                counterfactual_text_de=cf_text,
            ),
            "session_now": session_now,
            "session_planned": session_planned,
            "changed": changed,
            "counterfactual_source": source,
            "applied": applied,
            "driver": driver,
        }
    )


# ======================================================================
#  I/O — load everything the pure core needs, then call it
# ======================================================================


async def _load_metric_days(
    db: AsyncSession, user_id: int, *, today: date
) -> list[MetricDay]:
    """One athlete-local day per row, newest `recorded_at` wins the day."""
    since = today - timedelta(days=HISTORY_DAYS)
    res = await db.execute(
        select(DailyMetric)
        .where(DailyMetric.user_id == user_id, DailyMetric.recorded_at >= since)
        .order_by(DailyMetric.recorded_at.asc())
    )
    by_day: dict[date, MetricDay] = {}
    rows_by_day: dict[date, DailyMetric] = {}
    for row in res.scalars().all():
        day = row.date or (
            row.recorded_at.date() if row.recorded_at is not None else None
        )
        if day is None:
            continue
        # `getattr` with a default, not attribute access: the sleep-vitals and
        # wake-snapshot columns were added by later migrations and the model's
        # own docstring notes that historic rows predate them. A missing column
        # must read as "not measured", never as an AttributeError that takes
        # the whole decision down.
        def _f(name: str) -> float | None:
            v = getattr(row, name, None)
            return float(v) if v else None

        def _i(name: str) -> int | None:
            v = getattr(row, name, None)
            return int(v) if v is not None else None

        by_day[day] = MetricDay(
            day=day,
            hrv_status=_f("hrv_status"),
            resting_hr=_f("resting_hr"),
            sleep_score=(
                float(row.sleep_score) if getattr(row, "sleep_score", None) is not None
                else None
            ),
            sleep_total_s=_i("sleep_total_s"),
            sleep_deep_s=_i("sleep_deep_s"),
            body_battery_wake=_i("body_battery_wake"),
            stress_wake=_i("stress_wake"),
        )
        rows_by_day[day] = row

    # The two wake columns are never written -- Garmin's daily payload has no
    # honest value for them (see wake_values_for_days). Derive them from the
    # intraday sample stream instead, which does carry levels, so these two
    # drivers can rank alongside the rest rather than silently dropping out.
    # Best-effort: a driver missing its value must read as "not measured",
    # never take the whole decision down.
    try:
        from app.services.biometrics_snapshot import wake_values_for_days

        derived = await wake_values_for_days(
            db, user_id, sorted(by_day), rows_by_day
        )
        for day, vals in derived.items():
            current = by_day.get(day)
            if current is None:
                continue
            patch = {
                k: v for k, v in vals.items()
                if v is not None and getattr(current, k, None) is None
            }
            if patch:
                by_day[day] = replace(current, **patch)
    except Exception:  # pragma: no cover -- derivation is best-effort
        logger.exception("wake-value derivation failed for user_id=%s", user_id)

    return sorted(by_day.values(), key=lambda d: d.day)


async def _load_recorded_counterfactual(
    db: AsyncSession, user_id: int, *, today: date
) -> tuple[ReadinessSession, ReadinessSession] | None:
    """The plan engine's own before/after image for today, when it already
    rewrote the row. This is the literal receipt — not a recomputation."""
    res = await db.execute(
        select(PlanAdaptation)
        .where(
            PlanAdaptation.user_id == user_id,
            PlanAdaptation.target_date == today,
            PlanAdaptation.signal.in_(_MEASURED_SIGNALS),
        )
        .order_by(PlanAdaptation.created_at.desc())
        .limit(1)
    )
    row = res.scalar_one_or_none()
    if row is None:
        return None
    before = _session_from_diff(row.before)
    after = _session_from_diff(row.after)
    if before is None or after is None:
        return None
    return before, after


async def compute_readiness_decision(
    db: AsyncSession,
    user_id: int,
    profile=None,
    *,
    locale: str = "de",
) -> ReadinessDecisionRead:
    """Today's readiness decision plus its receipt, for one athlete."""
    set_athlete_tz_from_profile(profile)
    today = today_local()

    goals = (
        profile.goals
        if profile is not None and isinstance(getattr(profile, "goals", None), dict)
        else {}
    )
    status = goals.get("athlete_status") if isinstance(goals.get("athlete_status"), dict) else {}
    status_state = status.get("state")
    sidelined = status_state in ("sick", "injured", "break")

    days = await _load_metric_days(db, user_id, today=today)
    gate, age_days, last_day = classify_gate(days, today=today)

    hrv = estimate_hrv_state(
        [(d.day, d.hrv_status) for d in days if d.hrv_status], today=today
    )
    inputs = build_inputs(days, hrv, today=today)

    ctx = await load_today_context(db, user_id)
    trained_today = ctx.total_minutes >= 20.0

    directive: Directive | None = None
    if not sidelined:
        try:
            lang = "de" if str(locale).lower().startswith("de") else "en"
            directive = await build_adaptive_directive(db, user_id, lang)
        except Exception:  # pragma: no cover — the decision must always render
            logger.exception("adaptive directive failed (user_id=%s)", user_id)

    # The SAME composite the coach brief serves, so this endpoint can never
    # show the athlete a second, different readiness number. Private by name
    # only — reimplementing it is what would actually be wrong here.
    from app.services.daily_decision import _readiness_summary

    readiness = await _readiness_summary(db, user_id)

    common = dict(
        today=today, status_state=status_state, ctx=ctx, language="simple", locale=locale
    )
    actual = decide(directive=directive, readiness=readiness, **common)
    # The counterfactual: the app's own decision function with every
    # measurement withheld. Not a model of the plan — the plan's decision.
    counterfactual = decide(
        directive=None, readiness=DailyDecisionReadiness(), **common
    )

    recorded = await _load_recorded_counterfactual(db, user_id, today=today)

    return build_readiness_decision(
        today=today,
        gate=gate,
        data_age_days=age_days,
        last_measured_on=last_day,
        inputs=inputs,
        hrv=hrv,
        ctx=ctx,
        actual=actual,
        counterfactual=counterfactual,
        readiness=readiness,
        recorded=recorded,
        trained_today=trained_today,
        sidelined=sidelined,
    )
