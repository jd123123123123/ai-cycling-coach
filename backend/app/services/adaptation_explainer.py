"""Adaptation explainer — turns the day's data into a transparent "what changed
and why" list for the training recommendation.

The recommendation engine already grounds the brief in the coaching knowledge
base (COACH_KNOWLEDGE_BASE) via the LLM. This layer makes the *adaptation*
legible: it reads the real signals in the brief evidence (readiness, HRV drift,
TSB / CTL ramp, ACWR, sleep, yesterday's session) and, using research-backed
thresholds, states which signal moved, in which direction, and how that reshaped
today's plan — so the athlete sees exactly why the plan changed.

Pure + deterministic (no LLM, no DB). Each rule cites the principle it applies.
"""
from __future__ import annotations

from typing import Any


def _g(d: Any, *path, default=None):
    """Safe nested get over dict-ish evidence."""
    cur = d
    for k in path:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k)
    return cur if cur is not None else default


def _num(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _first_num(*vals) -> float | None:
    """First value that parses as a number.

    NOT `a or b` — a real 0.0 (a flat CTL ramp, an ACWR of 0 in a rest week) is
    a reading, not an absence, and `or` would silently fall through to the next
    key and mis-attribute the signal.
    """
    for v in vals:
        n = _num(v)
        if n is not None:
            return n
    return None


def _readiness_component(ev: Any, name: str) -> float | None:
    """Score (0-100) of one named readiness component.

    `evidence['readiness']['components']` is the real shape written by
    build_snapshot (readiness_score.ComponentScore → {name, score, weight,
    note}); it is where the sleep signal actually lives — there is no
    `recovery.sleep_score` key anywhere in the evidence dict.
    """
    comps = _g(ev, "readiness", "components")
    if not isinstance(comps, list):
        return None
    for c in comps:
        if isinstance(c, dict) and c.get("name") == name:
            return _num(c.get("score"))
    return None


def _yesterday_tss(ev: Any) -> float | None:
    """Yesterday's total TSS from `evidence['recent_trend']`.

    Real shape (coach_service._recent_daily_tss): [{"date": "YYYY-MM-DD",
    "tss": float}, …] for the last 7 days, days with no activity simply
    absent. "Yesterday" is measured off the snapshot's own `generated_at`, so
    a cached brief can never drift onto the wrong day. Returns None when the
    series is missing or yesterday has no entry — absence is NOT a zero, since
    a day can also be missing because nothing has synced.
    """
    trend = _g(ev, "recent_trend")
    if not isinstance(trend, list) or not trend:
        return None
    gen = _g(ev, "generated_at")
    if not isinstance(gen, str) or len(gen) < 10:
        return None
    try:
        from datetime import date as _date, timedelta as _td

        y = (_date.fromisoformat(gen[:10]) - _td(days=1)).isoformat()
    except ValueError:
        return None
    for row in trend:
        if isinstance(row, dict) and str(row.get("date"))[:10] == y:
            return _num(row.get("tss"))
    return None


def explain_adaptations(evidence: dict | None, *, de: bool = False) -> dict:
    """Return {summary, changes:[{signal,direction,detail,action,principle,severity}]}.

    `severity`: 'boost' (green, do more) | 'hold' (neutral) | 'ease' (amber/red,
    back off). Empty changes list → a steady-state summary.
    """
    ev = evidence or {}
    changes: list[dict] = []

    def add(signal_en, signal_de, direction, detail_en, detail_de, action_en, action_de, principle_en, principle_de, severity, kind="load"):
        changes.append({
            "signal": signal_de if de else signal_en,
            "direction": direction,  # 'up' | 'down' | 'flat'
            "detail": detail_de if de else detail_en,
            "action": action_de if de else action_en,
            "principle": principle_de if de else principle_en,
            "severity": severity,
            # 'recovery' = measured off the body overnight (HRV, sleep).
            # 'load'     = derived from training history (TSB, CTL ramp, ACWR).
            # The summary below may only call signals "recovery signals" when a
            # recovery one is actually among them — see the note there.
            "kind": kind,
        })

    # ── HRV drift (autonomic readiness) ────────────────────────────────────
    hrv_delta = _num(_g(ev, "biometrics", "hrv", "delta_pct"))
    if hrv_delta is not None:
        if hrv_delta <= -7:
            add("HRV", "HRV", "down",
                f"HRV is {hrv_delta:.0f}% below your 7-day baseline",
                f"HRV liegt {hrv_delta:.0f}% unter deinem 7-Tage-Schnitt",
                "intensity capped — today skews aerobic (Z2)",
                "Intensität gedeckelt — heute eher aerob (Z2)",
                "A suppressed overnight HRV signals incomplete parasympathetic recovery; training hard through it blunts adaptation.",
                "Eine gedämpfte HRV zeigt unvollständige parasympathische Erholung; hartes Training bremst dann die Anpassung.",
                "ease", kind="recovery")
        elif hrv_delta >= 7:
            add("HRV", "HRV", "up",
                f"HRV is {hrv_delta:.0f}% above baseline — well recovered",
                f"HRV liegt {hrv_delta:.0f}% über dem Schnitt — gut erholt",
                "green light for a quality/intensity session",
                "grünes Licht für eine Qualitäts-/Intensitätseinheit",
                "An elevated HRV reflects strong autonomic recovery — the window where hard work yields the most adaptation.",
                "Eine erhöhte HRV zeigt starke autonome Erholung — das Fenster, in dem harte Arbeit am meisten bringt.",
                "boost", kind="recovery")

    # ── Form / TSB ─────────────────────────────────────────────────────────
    tsb = _num(_g(ev, "pmc", "tsb"))
    if tsb is not None:
        if tsb <= -20:
            add("Form (TSB)", "Form (TSB)", "down",
                f"TSB is {tsb:.0f} — deep fatigue",
                f"TSB liegt bei {tsb:.0f} — tiefe Ermüdung",
                "recovery prioritized to avoid non-functional overreaching",
                "Erholung priorisiert, um nicht-funktionales Overreaching zu vermeiden",
                "TSB below −20 to −25 marks accumulated fatigue where injury/illness risk rises without recovery.",
                "TSB unter −20 bis −25 markiert angesammelte Ermüdung, wo ohne Erholung Verletzungs-/Krankheitsrisiko steigt.",
                "ease")
        elif tsb >= 15:
            add("Form (TSB)", "Form (TSB)", "up",
                f"TSB is +{tsb:.0f} — fresh",
                f"TSB liegt bei +{tsb:.0f} — frisch",
                "a good day to race or hit a hard target",
                "ein guter Tag für Wettkampf oder hartes Ziel",
                "Positive TSB (+5 to +20) is the freshness band where peak performances happen.",
                "Positive TSB (+5 bis +20) ist das Frische-Band, in dem Spitzenleistungen entstehen.",
                "boost")

    # ── CTL ramp (fitness trajectory) ──────────────────────────────────────
    # `ctl_7d_delta` is what ctl_atl_tsb_snapshot actually writes — CTL now minus
    # CTL seven days ago, i.e. the ramp per week. The two aliases above never
    # existed in the evidence dict, so this rule was dead until it was added.
    ctl_ramp = _first_num(
        _g(ev, "pmc", "ctl_ramp_per_week"),
        _g(ev, "pmc", "ramp"),
        _g(ev, "pmc", "ctl_7d_delta"),
    )
    if ctl_ramp is not None:
        if ctl_ramp > 7:
            add("Fitness ramp", "Fitness-Aufbau", "up",
                f"CTL climbing +{ctl_ramp:.0f}/week — steep",
                f"CTL steigt +{ctl_ramp:.0f}/Woche — steil",
                "holding volume steady this week to let it consolidate",
                "Volumen diese Woche stabil, damit es sich festigt",
                "Sustained CTL ramps above ~5–8/week outpace recovery capacity; consolidation converts load into fitness.",
                "Anhaltende CTL-Anstiege über ~5–8/Woche überholen die Erholung; Konsolidierung wandelt Last in Fitness.",
                "hold")
        elif 0 < ctl_ramp <= 5:
            add("Fitness ramp", "Fitness-Aufbau", "up",
                f"CTL rising +{ctl_ramp:.0f}/week — sustainable",
                f"CTL steigt +{ctl_ramp:.0f}/Woche — nachhaltig",
                "room to add a little load",
                "Spielraum, etwas Last hinzuzufügen",
                "A 3–5/week CTL ramp is the sustainable progressive-overload sweet spot.",
                "Ein CTL-Aufbau von 3–5/Woche ist der nachhaltige Sweet-Spot der progressiven Überlastung.",
                "boost")

    # ── ACWR (acute:chronic — injury guard) ────────────────────────────────
    # ACWR lives at the TOP level of the snapshot (coach_service: "acwr"), not
    # under load/ or pmc/ — both of those paths were always None.
    acwr = _first_num(_g(ev, "load", "acwr"), _g(ev, "pmc", "acwr"), _g(ev, "acwr"))
    if acwr is not None and acwr >= 1.5:
        add("Load ratio (ACWR)", "Lastverhältnis (ACWR)", "up",
            f"ACWR is {acwr:.2f} — acute load spiking",
            f"ACWR liegt bei {acwr:.2f}".replace(".", ",") + " — akute Last springt hoch",
            "easing today to pull the ratio back under 1.3",
            "heute zurückfahren, um das Verhältnis unter 1,3 zu bringen",
            "ACWR above ~1.5 is associated with a marked rise in injury risk in prospective load studies.",
            "ACWR über ~1,5 geht in prospektiven Last-Studien mit deutlich erhöhtem Verletzungsrisiko einher.",
            "ease")

    # ── Sleep ──────────────────────────────────────────────────────────────
    # The 0-100 sleep signal is the readiness component (last night's Garmin
    # sleep score blended with chronic debt). `biometrics.sleep` is the
    # sleep_debt payload — hours, not a score — so it can't stand in here.
    sleep = _first_num(
        _g(ev, "recovery", "sleep_score"),
        _g(ev, "biometrics", "sleep_score"),
        _readiness_component(ev, "sleep"),
    )
    if sleep is not None and sleep < 55:
        add("Sleep", "Schlaf", "down",
            f"Sleep score {sleep:.0f} — under-slept",
            f"Schlaf-Score {sleep:.0f} — zu wenig geschlafen",
            "intensity trimmed; protect tonight's sleep",
            "Intensität reduziert; heute Nacht den Schlaf schützen",
            "One night of short sleep lowers time-to-exhaustion and readiness for high-intensity work.",
            "Eine Nacht kurzer Schlaf senkt die Ausbelastungszeit und die Bereitschaft für harte Einheiten.",
            "ease", kind="recovery")

    # ── Yesterday's session (recovery sequencing) ──────────────────────────
    y_intensity = _g(ev, "recent", "yesterday_intensity") or _g(ev, "recent", "last_session_zone")
    y_is_hard = isinstance(y_intensity, str) and y_intensity.lower() in (
        "z4", "z5", "threshold", "vo2", "hard"
    )
    # There is no `recent` object in the real evidence dict, so the zone-string
    # branch above never fires in production. The measurable version: yesterday's
    # own TSS against CTL — which IS the athlete's average daily load, so the
    # ratio is a like-for-like read of how far above routine yesterday sat.
    y_tss = _yesterday_tss(ev)
    ctl = _num(_g(ev, "pmc", "ctl"))
    y_hard_by_tss = (
        y_tss is not None and ctl is not None and ctl > 0 and y_tss >= 1.5 * ctl
    )
    if y_is_hard or y_hard_by_tss:
        if y_hard_by_tss:
            detail_en = (
                f"yesterday was {y_tss:.0f} TSS — {y_tss / ctl:.1f}× your daily "
                f"average load (CTL {ctl:.0f})"
            )
            detail_de = (
                f"gestern waren es {y_tss:.0f} TSS — das "
                + f"{y_tss / ctl:.1f}".replace(".", ",")
                + f"-Fache deiner täglichen Dauerlast (CTL {ctl:.0f})"
            )
        else:
            detail_en = "yesterday was a hard quality session"
            detail_de = "gestern war eine harte Qualitätseinheit"
        add("Yesterday", "Gestern", "flat",
            detail_en, detail_de,
            "today stays easy to bank the adaptation",
            "heute bleibt es locker, um die Anpassung zu sichern",
            "Adaptation happens during recovery; back-to-back hard days compromise the stimulus from both.",
            "Anpassung passiert in der Erholung; zwei harte Tage hintereinander schwächen den Reiz beider.",
            "ease")

    # ── Summary ────────────────────────────────────────────────────────────
    # Day-1 honesty (reviewer Jonas S-2): "Signale stabil seit gestern" may
    # only render when at least one real signal was actually read. A brand-new
    # athlete with zero history has nothing to be "stable since yesterday".
    signals_seen = any(
        v is not None
        for v in (hrv_delta, tsb, ctl_ramp, acwr, sleep, y_tss)
    ) or isinstance(y_intensity, str)
    eases = [c for c in changes if c["severity"] == "ease"]
    boosts = [c for c in changes if c["severity"] == "boost"]
    if not changes and not signals_seen:
        summary = ("Noch keine Vergleichsdaten — der Plan folgt dem periodisierten Aufbau."
                   if de else
                   "No history to compare yet — the plan follows the periodized build.")
    elif not changes:
        summary = ("Signale stabil seit gestern — der Plan folgt dem periodisierten Aufbau."
                   if de else
                   "Signals steady since yesterday — the plan follows the periodized build.")
    elif eases and not boosts:
        summary = (f"{len(eases)} Signal(e) sprechen für Zurückhaltung — heute bewusst leichter."
                   if de else
                   f"{len(eases)} signal(s) point to holding back — today is deliberately easier.")
    elif boosts and not eases:
        # Name the signals that are ACTUALLY green. Of the three boost sources
        # only HRV is measured off the body; TSB and the CTL ramp are computed
        # from training history. The old copy called all of them "recovery
        # signals", so an athlete whose watch had not reported an overnight
        # reading in eight days was told their recovery signals were green —
        # off a +19 TSB and nothing else. Form is a real, useful green light;
        # it is just not a recovery measurement, and saying so keeps this card
        # consistent with the readiness gate on every other surface.
        if any(c.get("kind") == "recovery" for c in boosts):
            summary = ("Deine Erholungssignale sind grün — heute darfst du drücken."
                       if de else
                       "Your recovery signals are green — today you can push.")
        else:
            summary = ("Deine Form spricht für Qualität — heute darfst du drücken."
                       if de else
                       "Your form says go — today you can push.")
    else:
        summary = ("Gemischte Signale — der Plan balanciert Reiz und Erholung."
                   if de else
                   "Mixed signals — the plan balances stimulus and recovery.")

    return {"summary": summary, "changes": changes}
