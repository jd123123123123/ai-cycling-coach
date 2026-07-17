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


def explain_adaptations(evidence: dict | None, *, de: bool = False) -> dict:
    """Return {summary, changes:[{signal,direction,detail,action,principle,severity}]}.

    `severity`: 'boost' (green, do more) | 'hold' (neutral) | 'ease' (amber/red,
    back off). Empty changes list → a steady-state summary.
    """
    ev = evidence or {}
    changes: list[dict] = []

    def add(signal_en, signal_de, direction, detail_en, detail_de, action_en, action_de, principle_en, principle_de, severity):
        changes.append({
            "signal": signal_de if de else signal_en,
            "direction": direction,  # 'up' | 'down' | 'flat'
            "detail": detail_de if de else detail_en,
            "action": action_de if de else action_en,
            "principle": principle_de if de else principle_en,
            "severity": severity,
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
                "ease")
        elif hrv_delta >= 7:
            add("HRV", "HRV", "up",
                f"HRV is {hrv_delta:.0f}% above baseline — well recovered",
                f"HRV liegt {hrv_delta:.0f}% über dem Schnitt — gut erholt",
                "green light for a quality/intensity session",
                "grünes Licht für eine Qualitäts-/Intensitätseinheit",
                "An elevated HRV reflects strong autonomic recovery — the window where hard work yields the most adaptation.",
                "Eine erhöhte HRV zeigt starke autonome Erholung — das Fenster, in dem harte Arbeit am meisten bringt.",
                "boost")

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
    ctl_ramp = _num(_g(ev, "pmc", "ctl_ramp_per_week")) or _num(_g(ev, "pmc", "ramp"))
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
    acwr = _num(_g(ev, "load", "acwr")) or _num(_g(ev, "pmc", "acwr"))
    if acwr is not None and acwr >= 1.5:
        add("Load ratio (ACWR)", "Lastverhältnis (ACWR)", "up",
            f"ACWR is {acwr:.2f} — acute load spiking",
            f"ACWR liegt bei {acwr:.2f} — akute Last springt hoch",
            "easing today to pull the ratio back under 1.3",
            "heute zurückfahren, um das Verhältnis unter 1,3 zu bringen",
            "ACWR above ~1.5 is associated with a marked rise in injury risk in prospective load studies.",
            "ACWR über ~1,5 geht in prospektiven Last-Studien mit deutlich erhöhtem Verletzungsrisiko einher.",
            "ease")

    # ── Sleep ──────────────────────────────────────────────────────────────
    sleep = _num(_g(ev, "recovery", "sleep_score")) or _num(_g(ev, "biometrics", "sleep_score"))
    if sleep is not None and sleep < 55:
        add("Sleep", "Schlaf", "down",
            f"Sleep score {sleep:.0f} — under-slept",
            f"Schlaf-Score {sleep:.0f} — zu wenig geschlafen",
            "intensity trimmed; protect tonight's sleep",
            "Intensität reduziert; heute Nacht den Schlaf schützen",
            "One night of short sleep lowers time-to-exhaustion and readiness for high-intensity work.",
            "Eine Nacht kurzer Schlaf senkt die Ausbelastungszeit und die Bereitschaft für harte Einheiten.",
            "ease")

    # ── Yesterday's session (recovery sequencing) ──────────────────────────
    y_intensity = _g(ev, "recent", "yesterday_intensity") or _g(ev, "recent", "last_session_zone")
    if isinstance(y_intensity, str) and y_intensity.lower() in ("z4", "z5", "threshold", "vo2", "hard"):
        add("Yesterday", "Gestern", "flat",
            "yesterday was a hard quality session",
            "gestern war eine harte Qualitätseinheit",
            "today stays easy to bank the adaptation",
            "heute bleibt es locker, um die Anpassung zu sichern",
            "Adaptation happens during recovery; back-to-back hard days compromise the stimulus from both.",
            "Anpassung passiert in der Erholung; zwei harte Tage hintereinander schwächen den Reiz beider.",
            "ease")

    # ── Summary ────────────────────────────────────────────────────────────
    eases = [c for c in changes if c["severity"] == "ease"]
    boosts = [c for c in changes if c["severity"] == "boost"]
    if not changes:
        summary = ("Signale stabil seit gestern — der Plan folgt dem periodisierten Aufbau."
                   if de else
                   "Signals steady since yesterday — the plan follows the periodized build.")
    elif eases and not boosts:
        summary = (f"{len(eases)} Signal(e) sprechen für Zurückhaltung — heute bewusst leichter."
                   if de else
                   f"{len(eases)} signal(s) point to holding back — today is deliberately easier.")
    elif boosts and not eases:
        summary = ("Deine Erholungssignale sind grün — heute darfst du drücken."
                   if de else
                   "Your recovery signals are green — today you can push.")
    else:
        summary = ("Gemischte Signale — der Plan balanciert Reiz und Erholung."
                   if de else
                   "Mixed signals — the plan balances stimulus and recovery.")

    return {"summary": summary, "changes": changes}
