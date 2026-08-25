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

from app.models import Activity, ActivityStream, DailyMetric
from app.services.athlete_time import today_local
from app.services.hrv_state import HRV_BAND_SD, HRV_MAX_AGE_DAYS, estimate_hrv_state
from app.services.goal_trajectory import _ctl_7d_delta
from app.services.pmc_service import compute_user_pmc

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
# The HRV windows moved to `hrv_state` (one estimator, every consumer);
# `HRV_MAX_AGE_DAYS` is re-exported there and imported below for the copy that
# still explains staleness to the athlete.
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
    #: WHAT THIS VERDICT WAS MADE FROM. Populated by `build_adaptive_directive`
    #: (the pure `assess_adaptation` leaves it empty, as it should).
    #:
    #: It exists so the decision can be RECORDED without a second round of
    #: queries — see `decision_log`. The engine's inputs used to be computed,
    #: rendered and thrown away, which is why no study of its accuracy could
    #: ever be run retrospectively. Anything read here is evidence, never a
    #: decision: nothing downstream may branch on it.
    evidence: dict = field(default_factory=dict)


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



#: How close two rides' work totals must be before their decoupling figures are
#: comparable. ±35% is wide enough to find neighbours in a normal training week
#: and tight enough that a 5-hour ride is never judged against a coffee lap.
DECOUPLING_KJ_TOLERANCE = 0.35
#: Comparable rides required before a delta means anything.
DECOUPLING_MIN_MATCHES = 3


def decoupling_delta_matched(
    rows: list[tuple[float, float | None]],
) -> float | None:
    """Latest ride's decoupling minus the median of COMPARABLE prior rides.

    `rows` is (decoupling_pct, total_kj), newest first.

    Aerobic decoupling scales with how long and how hard the ride was, and with
    heat and fuelling. The previous version compared the latest ride against the
    median of every other ride regardless of length, so a five-hour endurance
    ride measured against a month of one-hour sessions reported a large positive
    "durability worsening" that was really just duration. That figure gates
    escalation, so the engine was reading ride length as fatigue.

    The right metric is the post-kJ power drop in `durability.py` — a
    matched-work comparison by construction — but it is not persisted per
    activity yet, so it cannot be read cheaply here. Until it is, the confound
    is CONTROLLED rather than ignored: only rides whose total work is within
    `DECOUPLING_KJ_TOLERANCE` of the latest one are eligible, and when fewer
    than `DECOUPLING_MIN_MATCHES` of those exist the honest answer is None —
    no reading, rather than a reading about the weather.

    None is inert downstream: it makes `durability_improving` and
    `durability_worse` both false, so the engine neither escalates on it nor
    counts it toward `concern`.
    """
    if len(rows) < 2:
        return None
    latest_pct, latest_kj = rows[0]
    if latest_kj is None or latest_kj <= 0:
        return None
    lo = latest_kj * (1.0 - DECOUPLING_KJ_TOLERANCE)
    hi = latest_kj * (1.0 + DECOUPLING_KJ_TOLERANCE)
    comparable = sorted(
        pct for pct, kj in rows[1:]
        if kj is not None and lo <= kj <= hi
    )
    if len(comparable) < DECOUPLING_MIN_MATCHES:
        return None
    median = comparable[len(comparable) // 2]
    return latest_pct - median


async def _hrv_rows(
    db: AsyncSession, user_id: int, *, today: date, days: int = 35
) -> list[tuple[date, float]]:
    """(calendar day, raw RMSSD) pairs, oldest first.

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
        # RAW RMSSD. The log transform, the windows and the band all belong to
        # `hrv_state.estimate_hrv_state` now — this function's only job is to
        # get (calendar day, value) pairs out of the database.
        out.append((d, float(hrv)))
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

    # The baseline is a 4-week rolling mean — a slow-moving reference, still
    # meaningful when the last few days are missing — so it keeps using every
    # reading in the window. `hrv_recent` is the opposite: it is the value the
    # band comparison turns into TODAY's verdict, so it is built from readings
    # inside the last HRV_RECENT_WINDOW_DAYS calendar days AND only when the
    # newest of them is at most HRV_MAX_AGE_DAYS old. Fail either test and it
    # stays None → hrv_state "unknown" → TSB fallback, never a green light.
    # ONE ESTIMATOR. The windows, the log transform, the band and the
    # calendar-day streak count all live in `hrv_state` now, so this module,
    # `plan_adaptation_engine`, the readiness composite and the safety rails
    # describe the same athlete from the same readings. It also de-nests the
    # baseline: the reference window is the one PRECEDING the recent window
    # rather than a 28-day slice containing it, which used to attenuate every
    # deviation toward "in band" — toward permitting load — and let a sustained
    # suppression quietly drag its own reference down until it vanished.
    hrv = estimate_hrv_state(rows, today=today)
    hrv_recent = hrv.ln_recent if hrv.usable else None
    hrv_baseline = hrv.ln_baseline
    hrv_sd = hrv.baseline_sd
    below_days = hrv.below_days

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
    #
    # ORDERED BY RIDE TIME, and that is not a tidiness point. This query used to
    # have no ORDER BY at all, and an unordered SELECT in PostgreSQL returns
    # rows in unspecified order — so `decs[0]`, read below as "the latest ride",
    # was an arbitrary row and `.limit(30)` an arbitrary sample of the athlete's
    # history. `decoupling_delta` is the ONLY input to `durability_improving` /
    # `durability_worse`, which decide whether an in-band athlete escalates
    # (volume x1.12+) or merely pushes. A real prescription was being decided by
    # row order. Ordering is on the ACTIVITY's start time rather than the
    # stream's `created_at`, because a back-filled sync writes old rides late
    # and ingestion order is not ride order.
    drows = await db.execute(
        select(ActivityStream.decoupling_pct, ActivityStream.total_kj)
        .join(Activity, Activity.id == ActivityStream.activity_id)
        .where(
            ActivityStream.user_id == user_id,
            ActivityStream.decoupling_pct.isnot(None),
        )
        .order_by(Activity.started_at.desc())
        .limit(30)
    )
    decoupling_delta = decoupling_delta_matched(
        [(float(pct), float(kj) if kj is not None else None) for pct, kj in drows.all()]
    )

    directive = assess_adaptation(
        hrv_recent=hrv_recent, hrv_baseline=hrv_baseline, hrv_sd=hrv_sd, hrv_below_days=below_days,
        tsb=tsb, decoupling_delta=decoupling_delta, sleep_score=(float(sleep_score) if sleep_score is not None else None),
        load_ramp=load_ramp, lang=lang, ambition=ambition, push_level=push_level,
        hrv_age_days=hrv.age_days,
    )
    # Carry the inputs out with the verdict, so recording the decision costs no
    # extra queries. `hrv` is the whole estimate — including `z_mean`, the
    # variance-correct statistic the band verdict does NOT use — because the
    # open question is whether the two agree on real athletes.
    ctl = float(pmc[-1].get("ctl", 0.0)) if pmc else None
    atl = float(pmc[-1].get("atl", 0.0)) if pmc else None
    directive.evidence = {
        "hrv": hrv,
        "tsb": tsb,
        "ctl": ctl,
        "atl": atl,
        "sleep_score": float(sleep_score) if sleep_score is not None else None,
        "decoupling_delta": decoupling_delta,
        "load_ramp": load_ramp,
        "push_intensity": push_level,
    }
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
