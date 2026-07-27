"""Adaptive training engine — aggressive autoregulation, grounded in evidence.

Decisions are DETERMINISTIC rules from the deep-research grounding
(docs/superpowers/specs/2026-07-09-adaptive-training-engine.md). The narrative is
written by Opus 4.8 on top; the numbers here are not LLM guesswork.

Primary lever (RCT — Nuuttila 2022, Javaloyes 2019): morning HRV vs a 4-week
rolling lnRMSSD baseline with a ±0.5 SD band. In-band → load; below-band →
back off; in-band while load rose + durability improving → ESCALATE.

Everything not HRV-band is EXPERT-OPINION (TSB, decoupling, ramp) — soft, never a
hard gate. ACWR is used only as a warning, never a causal threshold (discredited).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from statistics import mean, pstdev

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActivityStream, DailyMetric
from app.services.athlete_time import today_local
from app.services.goal_trajectory import _ctl_7d_delta
from app.services.pmc_service import compute_user_pmc

# Nuuttila 2022 validated band.
HRV_BAND_SD = 0.5

# ── Recency gates (stale-wearable fix, Jul 2026) ─────────────────────────────
# A directive is a PRESENT-TENSE claim — "Heute zurückschalten." / "Grünes
# Licht — belaste hart." — and it does not just talk: plan_adaptation_engine
# reads `hrv_state` and rewrites real plan rows off it.
#
# Until this fix the inputs had a LOWER date bound and no upper one:
#   * `_hrv_series` pulled the last 35 days and `hrv_recent = mean(ln[-7:])`
#     took the seven newest READINGS — which, for an athlete whose watch last
#     synced nine days ago, were seven nine-day-old mornings. The engine read
#     that as "HRV im Band — bereit für Qualität" and green-lit today.
#   * `hrv_below_days` counted `ln[-3:]` positionally, so three readings from
#     last month could be reported as "HRV 3 Tage unter deiner Basislinie".
#   * The sleep query had NO date filter at all (ORDER BY recorded_at DESC
#     LIMIT 1), so one bad night latched `poor_sleep` on indefinitely.
#
# When the wearable has gone quiet the honest HRV state is "unknown", which
# routes to the TSB-only fallback. "unknown" is deliberately inert downstream:
# `_rule_sleep_hrv` only fires on "below", and `_rule_green_upgrade` needs
# `_green_streak`, which already requires HRV readings inside the last 3 days.
# So an unknown state can neither downgrade nor upgrade a plan row.
HRV_MAX_AGE_DAYS = 1          # today's or yesterday's morning; 2+ days is stale
HRV_RECENT_WINDOW_DAYS = 7    # the "recent" mean is 7 CALENDAR days, not 7 rows
HRV_BELOW_WINDOW_DAYS = 3     # "below the band N days running" = N calendar days
SLEEP_MAX_AGE_DAYS = 1        # last night, or the night before if today hasn't synced
# Aggressive default: how many clean in-band blocks widen the push.
DEFAULT_AMBITION = 1.0

# Athlete "how hard should I be pushed" preference → ambition multiplier.
# Modulates ONLY the upside (escalate/push volume + escalation eagerness).
# The HRV back-off safety gate (deload/hold) is NEVER relaxed by this.
_AMBITION = {
    "steady": 0.85,      # ease me in — protect recovery, smaller pushes
    "balanced": 1.0,     # the evidence-graded default
    "aggressive": 1.12,  # chase adaptation — bigger pushes, escalate readily
    "all_in": 1.25,      # send it — max overload the safety rails still allow
}
_AMBITION_LABEL = {
    "steady": ("Steady push", "Sanfter Aufbau"),
    "balanced": ("Balanced push", "Ausgewogener Push"),
    "aggressive": ("Aggressive push", "Aggressiver Push"),
    "all_in": ("All-in push", "Volle Attacke"),
}
# Cap so no chained multiplier ever prescribes a reckless jump.
_VOL_CAP = 1.4


def ambition_from_intensity(level: str | None) -> float:
    """Map the athlete's push-intensity preference to an ambition multiplier."""
    return _AMBITION.get((level or "balanced"), 1.0)


@dataclass
class Signal:
    text: str
    tone: str        # "good" | "warn" | "bad" | "neutral"
    evidence: str    # "RCT" | "expert" | "guardrail"


@dataclass
class Directive:
    directive: str            # "escalate" | "push" | "hold" | "deload" | "rest"
    intensity_ceiling: str    # "push" | "hard" | "moderate" | "easy" | "rest"
    volume_modifier: float    # multiply planned volume/TSS
    hrv_state: str            # "below" | "in" | "above" | "unknown"
    headline: str
    signals: list[Signal] = field(default_factory=list)
    confidence: str = "moderate"


def _de(lang: str) -> bool:
    return lang == "de"


def assess_adaptation(
    *,
    hrv_recent: float | None,       # 7-day rolling lnRMSSD (or None)
    hrv_baseline: float | None,     # 28-day rolling lnRMSSD mean
    hrv_sd: float | None,           # 28-day lnRMSSD SD
    hrv_below_days: int,            # # of last 3 days below the band
    tsb: float,
    decoupling_delta: float | None, # recent decoupling minus baseline (neg = improving)
    sleep_score: float | None,
    load_ramp: float | None,        # acute:chronic load ratio (soft guardrail only)
    lang: str = "en",
    ambition: float = 1.0,          # athlete push preference — upside only
    push_level: str = "balanced",
    hrv_age_days: int | None = None,  # age of the newest HRV reading; None = never any
) -> Directive:
    """Pure core. See module docstring for the grounding of each rule.

    `ambition` (from the athlete's push-intensity setting) scales ONLY the upside:
    push/escalate volume and how readily we escalate. The HRV back-off gate
    (deload/hold) is never relaxed — safety is not a preference.
    """
    de = _de(lang)
    sig: list[Signal] = []
    hungry = ambition >= 1.1  # aggressive / all-in athletes escalate on softer evidence

    # ── HRV band (RCT primary gate) ──────────────────────────────────────
    hrv_state = "unknown"
    if hrv_recent is not None and hrv_baseline is not None and hrv_sd:
        low = hrv_baseline - HRV_BAND_SD * hrv_sd
        high = hrv_baseline + HRV_BAND_SD * hrv_sd
        if hrv_recent < low:
            hrv_state = "below"
        elif hrv_recent > high:
            hrv_state = "above"
        else:
            hrv_state = "in"

    # ── Corroborating (expert-opinion) signals ───────────────────────────
    poor_sleep = sleep_score is not None and sleep_score < 55
    deep_neg_tsb = tsb <= -25
    durability_improving = decoupling_delta is not None and decoupling_delta <= -1.0
    durability_worse = decoupling_delta is not None and decoupling_delta >= 3.0
    ramp_hot = load_ramp is not None and load_ramp >= 1.5

    # Multi-signal maladaptation concern (expert, conservative — not a diagnosis).
    concern = sum([hrv_state == "below", poor_sleep, deep_neg_tsb, durability_worse]) >= 2

    # ── Decision (aggressive autoregulation) ─────────────────────────────
    if hrv_state == "below" and hrv_below_days >= 2:
        d = Directive("deload", "easy", 0.55, hrv_state,
                      "Deload — dein Körper braucht Erholung." if de else "Deload — your body needs to recover.",
                      confidence="high")
        sig.append(Signal(
            f"HRV {hrv_below_days} Tage unter deiner Basislinie — klares Ermüdungssignal." if de
            else f"HRV below baseline {hrv_below_days} days running — a clear fatigue signal.",
            "bad", "RCT"))
    elif hrv_state == "below" or concern:
        d = Directive("hold", "easy", 0.8, hrv_state,
                      "Heute zurückschalten." if de else "Ease off today.",
                      confidence="high" if hrv_state == "below" else "moderate")
        sig.append(Signal(
            "HRV unter dem Band — Intensität kappen." if de else "HRV below the band — cap intensity.",
            "warn", "RCT") if hrv_state == "below" else Signal(
            "Mehrere Ermüdungssignale zusammen — vorsichtig." if de else "Several fatigue signals together — play it safe.",
            "warn", "expert"))
    elif hrv_state in ("in", "above") and (durability_improving or (hungry and not durability_worse)) \
            and not poor_sleep and not deep_neg_tsb:
        # Confirmed adaptation → escalate (the "go crazier" loop). Hungry athletes
        # escalate on softer evidence (durability merely not worsening).
        d = Directive("escalate", "push", min(1.12 * ambition, _VOL_CAP), hrv_state,
                      "Voll draufhalten — dein Körper adaptiert." if de else "Push hard — your body is adapting.",
                      confidence="moderate")
        sig.append(Signal(
            "HRV hält im Band, während die Last stieg — grünes Licht zum Eskalieren." if de
            else "HRV holding in-band while load rose — green light to escalate.", "good", "RCT"))
        sig.append(Signal(
            ("Durability verbessert sich (Entkopplung sinkt)." if de
             else "Durability improving (decoupling trending down).") if durability_improving
            else ("Durability stabil — dein Push-Level nutzt den Spielraum." if de
                  else "Durability holding — your push setting takes the room."),
            "good", "expert"))
    elif hrv_state in ("in", "above"):
        d = Directive("push", "hard", min(1.0 * ambition, _VOL_CAP), hrv_state,
                      "Grünes Licht — belaste hart." if de else "Green light — load hard.",
                      confidence="moderate")
        sig.append(Signal(
            "HRV im Band — bereit für Qualität." if de else "HRV in-band — ready for quality.", "good", "RCT"))
    else:
        # No USABLE HRV — fall back to freshness (expert), stay bold but honest.
        # Two different reasons land here and the athlete deserves to know
        # which: no wearable readings at all (nothing to do), versus readings
        # that exist but are too old to describe today (go sync your watch).
        # Before the recency gate the second case never reached this branch —
        # it produced a confident in-band green light off week-old mornings.
        hrv_is_stale = hrv_age_days is not None and hrv_age_days > HRV_MAX_AGE_DAYS
        if hrv_is_stale:
            hrv_note = (
                f"Letzte HRV-Messung vor {hrv_age_days} Tagen — zu alt für heute, wir gehen nach TSB." if de
                else f"Last HRV reading was {hrv_age_days} days ago — too old to speak for today, going by TSB."
            )
        else:
            hrv_note = "Keine HRV-Daten — nutze TSB als Näherung." if de else "No HRV data — using TSB as a proxy."
        if deep_neg_tsb:
            d = Directive("hold", "moderate", 0.85, hrv_state,
                          "Etwas Ermüdung tragen — moderat halten." if de else "Carrying fatigue — keep it moderate.")
            sig.append(Signal(f"TSB {tsb:.0f} — tiefe Ermüdungslast." if de else f"TSB {tsb:.0f} — deep fatigue load.", "warn", "expert"))
            sig.append(Signal(hrv_note, "neutral", "expert"))
        else:
            d = Directive("push", "hard", min(1.0 * ambition, _VOL_CAP), hrv_state,
                          "Belaste hart." if de else "Load hard.")
            sig.append(Signal(hrv_note, "neutral", "expert"))

    # ── Transparency: surface the athlete's chosen push level on upside days ──
    # No "volume ×1.25" here (5-reviewer gate, Jul 2026): nothing downstream
    # scales the served session up, so advertising a multiplier invents a
    # second daily load number that contradicts the plan's TSS. The push level
    # is named; the load number stays the daily decision's.
    if d.directive in ("escalate", "push") and push_level != "balanced":
        en_lbl, de_lbl = _AMBITION_LABEL.get(push_level, ("Balanced push", "Ausgewogener Push"))
        sig.append(Signal(
            f"{de_lbl} aktiv — Eskalation kommt bei dir früher." if de
            else f"{en_lbl} on — escalation comes sooner for you.",
            "neutral", "expert"))

    # ── Ramp guardrail (warning only — ACWR discredited) ─────────────────
    if ramp_hot and d.directive in ("escalate", "push"):
        if d.directive == "escalate":
            d.directive = "push"
            d.volume_modifier = min(d.volume_modifier, 1.0)
        sig.append(Signal(
            "Lastanstieg ist steil — schärfer beobachten (kein hartes Limit)." if de
            else "Load ramp is steep — watch closely (not a hard limit).", "warn", "guardrail"))

    d.signals = sig
    return d


async def _hrv_rows(
    db: AsyncSession, user_id: int, *, today: date, days: int = 35
) -> list[tuple[date, float]]:
    """(calendar day, lnRMSSD) pairs, oldest first.

    The DAY has to travel with the value. The previous version returned a bare
    list of floats, which is exactly why the callers could only slice it
    positionally ("the last 7 readings", "the last 3 readings") and could not
    tell a reading from this morning apart from one from last month.
    """
    since = today - timedelta(days=days)
    rows = await db.execute(
        select(DailyMetric.recorded_at, DailyMetric.hrv_status, DailyMetric.date)
        .where(DailyMetric.user_id == user_id, DailyMetric.recorded_at >= since)
        .order_by(DailyMetric.recorded_at.asc())
    )
    out: list[tuple[date, float]] = []
    for recorded_at, hrv, day in rows.all():
        if hrv is None or float(hrv) <= 0:
            continue
        # `date` is the athlete-facing calendar day; `recorded_at` is the
        # hypertable partition key. Prefer the former, fall back to the latter
        # for any historic row that predates the column being populated.
        d = day or (recorded_at.date() if recorded_at is not None else None)
        if d is None:
            continue
        out.append((d, math.log(float(hrv))))  # lnRMSSD-style stabilisation
    out.sort(key=lambda t: t[0])
    return out


async def build_adaptive_directive(db: AsyncSession, user_id: int, lang: str = "en") -> Directive:
    # Athlete push-intensity preference → ambition (upside only).
    from app.models.athlete_profile import AthleteProfile
    prow = await db.execute(select(AthleteProfile.goals).where(AthleteProfile.user_id == user_id))
    goals = prow.scalar_one_or_none() or {}
    push_level = (goals.get("push_intensity") if isinstance(goals, dict) else None) or "balanced"
    ambition = ambition_from_intensity(push_level)

    # Athlete status outranks every physiological signal: a self-declared
    # sick/injured day is a rest day, "taking a break" is a deload — no HRV
    # reading argues with the athlete's own report. This also cascades into
    # the coach-safety interlock (rest/deload mutes competitive surfaces).
    status = goals.get("athlete_status") if isinstance(goals, dict) else None
    status_state = (status or {}).get("state")
    if status_state in ("sick", "injured"):
        de = _de(lang)
        return Directive(
            directive="rest",
            intensity_ceiling="rest",
            volume_modifier=0.0,
            hrv_state="unknown",
            headline=(
                ("Du bist krank gemeldet — heute zählt nur Erholung." if status_state == "sick"
                 else "Verletzt gemeldet — Heilung ist das Training.")
                if de else
                ("You're marked sick — recovery is the only session today." if status_state == "sick"
                 else "Marked injured — healing is the training.")
            ),
            signals=[Signal(
                text=("Selbst gemeldeter Status schlägt jedes Signal." if de
                      else "Self-reported status outranks every signal."),
                tone="neutral", evidence="expert",
            )],
            confidence="high",
        )
    if status_state == "break":
        de = _de(lang)
        return Directive(
            directive="deload",
            intensity_ceiling="easy",
            volume_modifier=0.5,
            hrv_state="unknown",
            headline=("Pause eingelegt — locker bleiben, sanft zurückkommen." if de
                      else "On a break — keep it light, ease back in."),
            signals=[Signal(
                text=("Selbst gemeldeter Status: Pause." if de else "Self-reported status: break."),
                tone="neutral", evidence="expert",
            )],
            confidence="high",
        )

    today = today_local()
    rows = await _hrv_rows(db, user_id, today=today)
    ln = [v for _, v in rows]
    hrv_age_days = (today - rows[-1][0]).days if rows else None

    # The baseline is a 4-week rolling mean — a slow-moving reference, still
    # meaningful when the last few days are missing — so it keeps using every
    # reading in the window. `hrv_recent` is the opposite: it is the value the
    # band comparison turns into TODAY's verdict, so it is built from readings
    # inside the last HRV_RECENT_WINDOW_DAYS calendar days AND only when the
    # newest of them is at most HRV_MAX_AGE_DAYS old. Fail either test and it
    # stays None → hrv_state "unknown" → TSB fallback, never a green light.
    baseline_window = ln[-28:] if len(ln) >= 10 else ln
    hrv_baseline = mean(baseline_window) if len(baseline_window) >= 10 else None
    hrv_sd = pstdev(baseline_window) if len(baseline_window) >= 10 else None

    hrv_recent = None
    if hrv_age_days is not None and hrv_age_days <= HRV_MAX_AGE_DAYS:
        recent_window = [v for d, v in rows if (today - d).days < HRV_RECENT_WINDOW_DAYS]
        if len(recent_window) >= 3:
            hrv_recent = mean(recent_window[-7:])

    # "HRV N Tage unter deiner Basislinie" must count CALENDAR days, not rows:
    # `ln[-3:]` on a sparse series happily reported three readings spread over
    # three weeks as a three-day fatigue streak, which deloads the athlete.
    below_days = 0
    if hrv_recent is not None and hrv_baseline is not None and hrv_sd:
        low = hrv_baseline - HRV_BAND_SD * hrv_sd
        below_days = sum(
            1 for d, v in rows
            if (today - d).days < HRV_BELOW_WINDOW_DAYS and v < low
        )

    pmc = (await compute_user_pmc(db, user_id, days=90)).get("total") or []
    tsb = float(pmc[-1].get("tsb", 0.0)) if pmc else 0.0
    # Soft acute:chronic ramp (7d vs 28d mean daily TSS) — warning only.
    load_ramp = None
    if len(pmc) >= 28:
        acute = mean([float(p.get("tss", 0.0)) for p in pmc[-7:]])
        chronic = mean([float(p.get("tss", 0.0)) for p in pmc[-28:]])
        load_ramp = acute / chronic if chronic > 0 else None
    _ = _ctl_7d_delta([{**p} for p in pmc]) if pmc else 0.0  # available if needed

    # Sleep — most recent, but only if it is actually a RECENT night. This
    # query used to have no date filter whatsoever: the athlete's worst night
    # of the month stayed the engine's `poor_sleep` input until a newer row
    # landed, so a watch that stopped syncing froze "schlecht geschlafen" in
    # place and kept capping intensity for days on a night long since slept off.
    sleep_cutoff = today - timedelta(days=SLEEP_MAX_AGE_DAYS)
    srow = await db.execute(
        select(DailyMetric.sleep_score).where(
            DailyMetric.user_id == user_id,
            DailyMetric.sleep_score.isnot(None),
            DailyMetric.recorded_at >= sleep_cutoff,
        )
        .order_by(DailyMetric.recorded_at.desc()).limit(1)
    )
    sleep_score = srow.scalar_one_or_none()

    # Decoupling trend: latest ride vs median of prior rides.
    drows = await db.execute(
        select(ActivityStream.decoupling_pct).where(
            ActivityStream.user_id == user_id, ActivityStream.decoupling_pct.isnot(None)
        ).limit(30)
    )
    decs = [float(r[0]) for r in drows.all()]
    decoupling_delta = None
    if len(decs) >= 4:
        latest = decs[0]
        prior = sorted(decs[1:])
        base = prior[len(prior) // 2]
        decoupling_delta = latest - base

    directive = assess_adaptation(
        hrv_recent=hrv_recent, hrv_baseline=hrv_baseline, hrv_sd=hrv_sd, hrv_below_days=below_days,
        tsb=tsb, decoupling_delta=decoupling_delta, sleep_score=(float(sleep_score) if sleep_score is not None else None),
        load_ramp=load_ramp, lang=lang, ambition=ambition, push_level=push_level,
        hrv_age_days=hrv_age_days,
    )
    return await _apply_day_gates(db, user_id, directive, lang)


async def _apply_day_gates(
    db: AsyncSession, user_id: int, d: Directive, lang: str,
) -> Directive:
    """Planned-rest + already-trained gates (usability audit P0-3).

    Physiology may say 'Grünes Licht — belaste hart', but on a planned rest
    day — or once today's session is already done — that headline directly
    contradicts the Today surface. Green light means green light FOR TOMORROW;
    a finished session means the win is now recovery. Only the pushy
    directives (push / escalate) are rewritten; deload/hold/rest already agree
    with a quiet day.
    """
    if d.directive not in ("push", "escalate"):
        return d

    try:
        from app.models.athlete_profile import AthleteProfile
        from app.services.athlete_time import set_athlete_tz_from_profile
        from app.services.daily_decision import load_today_context

        # Bind the athlete tz before any "today" window is computed — callers
        # outside a request context (scheduler) otherwise inherit a stale one.
        try:
            prow = await db.execute(
                select(AthleteProfile).where(AthleteProfile.user_id == user_id)
            )
            set_athlete_tz_from_profile(prow.scalar_one_or_none())
        except Exception:  # pragma: no cover — tolerant of mocked sessions
            pass

        ctx = await load_today_context(db, user_id)
    except Exception:  # pragma: no cover — the gate must never break the directive
        return d

    de = _de(lang)

    already_done = ctx.planned_done or (ctx.planned is None and ctx.total_minutes >= 20.0)
    if already_done:
        d.directive = "hold"
        d.intensity_ceiling = "easy"
        d.volume_modifier = min(d.volume_modifier, 1.0)
        d.headline = (
            "Training erledigt — jetzt zählt Erholung." if de
            else "Session done — recovery is the win now."
        )
        d.signals.append(Signal(
            text=("Heutige Einheit ist absolviert — Signale sprechen für gute Erholung morgen." if de
                  else "Today's session is complete — the signals point to strong recovery for tomorrow."),
            tone="good", evidence="expert",
        ))
        return d

    if ctx.planned_is_rest:
        d.directive = "hold"
        d.volume_modifier = min(d.volume_modifier, 1.0)
        d.headline = (
            "Grünes Licht für morgen" if de else "Green light for tomorrow"
        )
        d.signals.append(Signal(
            text=("Heute ist Ruhetag geplant — nimm die Frische mit in die morgige Einheit." if de
                  else "Today is a planned rest day — bank the freshness for tomorrow's session."),
            tone="good", evidence="expert",
        ))
        return d

    return d
