"""Morning-health early-warning detector — illness / significant-downturn cluster.

Pure + deterministic (no LLM, no DB). Takes a short trailing history of the
athlete's MORNING wearable vitals and decides whether today's readings, judged
against the athlete's OWN rolling baseline, cluster together in the classic
acute-illness / overreaching direction. Returns a compact, honest verdict the
Today surface can render as a warning card + recommendation.

Why a separate service from ``readiness_detector`` / ``readiness_score``:
    * ``readiness_detector`` judges HRV(ln-RMSSD) + RHR only and feeds the
      plan-change note / green|amber|illness verdict.
    * ``readiness_score`` produces the 0-100 training-readiness dial.
    Neither consumes the fuller morning vitals set the wearable now stores
    (respiration rate + SpO₂ + sleep). The acute-illness fingerprint in the
    literature is specifically a CLUSTER of these — elevated resting HR,
    suppressed HRV, and elevated respiration rate the morning your body starts
    fighting something — so early-warning needs the whole panel, not two of it.
    This detector reuses the same individual-baseline philosophy (never
    population norms) and complements, not replaces, the other two.

Evidence-ranked signals (all vs the athlete's OWN rolling baseline):
    * resting HR jump           — the single most robust wearable illness/
      overreach marker (Hedelin 2000; Buchheit 2014). ≥ +5 bpm above baseline
      (or > 1 SD) = mild; ≥ +7 bpm (or > 1.5 SD) = strong.
    * suppressed HRV (ln-RMSSD) — parasympathetic withdrawal (Plews 2013). We
      log-transform ``hrv_status`` (RMSSD proxy) so a fixed threshold is
      meaningful. below baseline − 1 SD (or ≤ −10%) = mild; below −2 SD (or
      ≤ −20%) = strong.
    * elevated respiration rate — the third leg of the classic acute-infection
      triad; overnight respiration climbs 1–3 brpm as an infection incubates
      (Natarajan 2020, Nature Med — respiratory rate flagged COVID onset before
      symptoms). ≥ +1 brpm (or > 1 SD) = mild; ≥ +2 brpm (or > 2 SD) = strong.
    * low SpO₂                  — corroborating only; wrist SpO₂ is noisy.
      ≤ baseline − 2% or ≤ 94 = flag; ≤ 92 = strong.
    * poor / short sleep        — context, never a lone trigger: a bad night
      alone is not illness. score < 60 or ≤ baseline − 15.

The verdict is CONSERVATIVE by design — a warning must be earned by a real
cluster (≥ 2 core markers deviating together) or one strong core marker plus a
corroborator. A single mild deviation is NOT a warning (→ ``none``). Missing or
too-thin baseline → ``none`` (we never guess). This is an early-warning nudge,
NOT a diagnosis — wording always frames it as "deine Daten deuten auf …".
"""
from __future__ import annotations

import math
import statistics
from datetime import date
from typing import Literal

Level = Literal["none", "watch", "elevated", "high"]

# ── Baseline window ──────────────────────────────────────────────────────────
_BASELINE_WINDOW = 28   # rolling personal-baseline window (days), before today
_MIN_BASELINE_N = 5     # need ≥ this many prior readings of a metric to judge it

# ── RHR (bpm above baseline) ─────────────────────────────────────────────────
_RHR_MILD_BPM = 5.0
_RHR_STRONG_BPM = 7.0
_RHR_MILD_SD = 1.0
_RHR_STRONG_SD = 1.5

# ── HRV (ln-RMSSD below baseline) ────────────────────────────────────────────
_HRV_MILD_SD = 1.0
_HRV_STRONG_SD = 2.0
_HRV_MILD_PCT = -10.0    # ≤ −10% vs baseline = mild even when SD is tiny
_HRV_STRONG_PCT = -20.0  # ≤ −20% = strong

# ── Respiration (brpm above baseline) ────────────────────────────────────────
_RESP_MILD_BRPM = 1.0
_RESP_STRONG_BRPM = 2.0
_RESP_MILD_SD = 1.0
_RESP_STRONG_SD = 2.0

# ── SpO₂ (corroborating) ─────────────────────────────────────────────────────
_SPO2_LOW_ABS = 94.0
_SPO2_STRONG_ABS = 92.0
_SPO2_LOW_DROP = 2.0     # ≥ 2% below personal baseline

# ── Sleep (context) ──────────────────────────────────────────────────────────
_SLEEP_POOR_ABS = 60
_SLEEP_POOR_DROP = 15

# ── Opportunity (good-news) side ─────────────────────────────────────────────
# Same evidence base as the illness thresholds above (Hedelin 2000; Buchheit
# 2014 for RHR; Plews 2013 for HRV) — a meaningful RHR drop or HRV rise below/
# above the athlete's own baseline is understood as the same underlying
# parasympathetic-recovery signal in reverse, so the magnitudes are mirrored
# rather than invented fresh. What differs from the illness side is TIMING:
# a single good night proves nothing (same reason a single bad night isn't
# illness), so this requires the improvement to hold for `_SUSTAIN_DAYS`
# consecutive mornings, not just today.
_SUSTAIN_DAYS = 2
_SLEEP_GOOD_RISE = 15.0  # mirrors _SLEEP_POOR_DROP


def detect_morning_health(daily: list[dict]) -> dict:
    """Assess today's morning vitals for an illness / significant-downturn cluster.

    Args:
        daily: chronologically-ASCENDING list of daily readings, each
            ``{"date": date|iso, "rhr": float|None, "hrv": float|None,
               "respiration": float|None, "spo2": float|None,
               "sleep_score": float|None}``. The LAST entry is "today".
            ``hrv`` is Garmin ``hrv_status`` (RMSSD proxy); ``respiration`` is
            the overnight average respiration rate; ``spo2`` the overnight
            average SpO₂; ``sleep_score`` the 0-100 Garmin sleep score.

    Returns:
        ``{"level": none|watch|elevated|high,
           "signals": [{"metric","value","baseline","direction","delta","severity"}],
           "recommendation_de": str, "recommendation_en": str,
           "headline_de": str, "headline_en": str}``.
        ``none`` with empty ``signals`` when vitals are normal, absent, or the
        baseline is too thin to judge. Pure — no side effects, no fabrication.
    """
    if not daily:
        return _none("keine Morgendaten", "no morning data")

    today = daily[-1]
    prior = daily[:-1][-_BASELINE_WINDOW:]

    signals: list[dict] = []

    # Each helper appends its signal (if triggered) and reports (triggered, severity).
    rhr = _rhr_signal(today, prior)
    hrv = _hrv_signal(today, prior)
    resp = _resp_signal(today, prior)
    spo2 = _spo2_signal(today, prior)
    sleep = _sleep_signal(today, prior)

    # Did we even have enough baseline on the CORE markers to judge anything?
    # RHR + HRV are the two we always need at least one of; if neither had a
    # personal baseline, we honestly return `none` rather than guess.
    if rhr is None and hrv is None:
        return _none(
            "noch keine persönliche Baseline (zu wenige Morgenmessungen)",
            "no personal baseline yet (too few morning readings)",
        )

    for s in (rhr, hrv, resp, spo2, sleep):
        if s and s.get("triggered"):
            signals.append(_public(s))

    core = [s for s in (rhr, hrv, resp) if s and s.get("triggered")]
    n_core = len(core)
    strong_core = sum(1 for s in core if s["severity"] == "strong")
    spo2_flag = bool(spo2 and spo2.get("triggered"))
    spo2_strong = bool(spo2 and spo2.get("severity") == "strong")
    sleep_flag = bool(sleep and sleep.get("triggered"))
    corroborated = spo2_flag or sleep_flag

    # ── Verdict (conservative; a warning must be EARNED) ─────────────────────
    if n_core >= 3 or (n_core >= 2 and (strong_core >= 2 or spo2_strong)):
        level: Level = "high"
    elif n_core >= 2:
        level = "elevated"
    elif n_core >= 1 and strong_core >= 1 and corroborated:
        level = "elevated"
    elif (n_core >= 1 and strong_core >= 1) or (n_core >= 1 and corroborated) or spo2_strong:
        level = "watch"
    else:
        # ≤ 1 mild core signal on its own, or only a lone poor night → not a warning.
        level = "none"

    if level == "none":
        return _opportunity_verdict(daily, today, prior)

    reco_de, reco_en, head_de, head_en = _copy(level, signals)
    return {
        "level": level,
        "polarity": "warning",
        "signals": signals,
        "headline_de": head_de,
        "headline_en": head_en,
        "recommendation_de": reco_de,
        "recommendation_en": reco_en,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Signal computations — each returns a dict with baseline + severity or None
# (None = no personal baseline for this metric; not the same as "not triggered").
# ─────────────────────────────────────────────────────────────────────────────

def _rhr_signal(today: dict, prior: list[dict]) -> dict | None:
    v = _num(today.get("rhr"))
    hist = [x for d in prior if (x := _num(d.get("rhr"))) is not None]
    if v is None or len(hist) < _MIN_BASELINE_N:
        return None
    base = statistics.median(hist)
    sd = statistics.stdev(hist) if len(hist) >= 2 else 0.0
    delta = v - base
    triggered = delta >= _RHR_MILD_BPM or (sd > 0 and delta >= _RHR_MILD_SD * sd)
    strong = delta >= _RHR_STRONG_BPM or (sd > 0 and delta >= _RHR_STRONG_SD * sd)
    return {
        "metric": "resting_hr", "value": round(v, 1), "baseline": round(base, 1),
        "direction": "up", "delta": round(delta, 1), "unit": "bpm",
        "triggered": bool(triggered), "severity": "strong" if strong else "mild",
    }


def _hrv_signal(today: dict, prior: list[dict]) -> dict | None:
    v = _num(today.get("hrv"))
    ln_v = _ln(v)
    hist_ln = [x for d in prior if (x := _ln(d.get("hrv"))) is not None]
    hist_raw = [x for d in prior if (x := _num(d.get("hrv"))) is not None]
    if ln_v is None or len(hist_ln) < _MIN_BASELINE_N:
        return None
    mu = statistics.mean(hist_ln)
    sd = statistics.stdev(hist_ln) if len(hist_ln) >= 2 else 0.0
    base_raw = statistics.median(hist_raw)
    delta_pct = (v - base_raw) / base_raw * 100.0 if base_raw else 0.0
    mild = (sd > 0 and ln_v < mu - _HRV_MILD_SD * sd) or delta_pct <= _HRV_MILD_PCT
    strong = (sd > 0 and ln_v < mu - _HRV_STRONG_SD * sd) or delta_pct <= _HRV_STRONG_PCT
    return {
        "metric": "hrv", "value": round(v, 1), "baseline": round(base_raw, 1),
        "direction": "down", "delta": round(delta_pct, 1), "unit": "%",
        "triggered": bool(mild), "severity": "strong" if strong else "mild",
    }


def _resp_signal(today: dict, prior: list[dict]) -> dict | None:
    v = _num(today.get("respiration"))
    hist = [x for d in prior if (x := _num(d.get("respiration"))) is not None]
    if v is None or len(hist) < _MIN_BASELINE_N:
        return None
    base = statistics.median(hist)
    sd = statistics.stdev(hist) if len(hist) >= 2 else 0.0
    delta = v - base
    triggered = delta >= _RESP_MILD_BRPM or (sd > 0 and delta >= _RESP_MILD_SD * sd)
    strong = delta >= _RESP_STRONG_BRPM or (sd > 0 and delta >= _RESP_STRONG_SD * sd)
    return {
        "metric": "respiration", "value": round(v, 1), "baseline": round(base, 1),
        "direction": "up", "delta": round(delta, 1), "unit": "brpm",
        "triggered": bool(triggered), "severity": "strong" if strong else "mild",
    }


def _spo2_signal(today: dict, prior: list[dict]) -> dict | None:
    v = _num(today.get("spo2"))
    hist = [x for d in prior if (x := _num(d.get("spo2"))) is not None]
    if v is None:
        return None
    base = statistics.median(hist) if len(hist) >= _MIN_BASELINE_N else None
    drop = (base - v) if base is not None else 0.0
    triggered = v <= _SPO2_LOW_ABS or (base is not None and drop >= _SPO2_LOW_DROP)
    strong = v <= _SPO2_STRONG_ABS
    return {
        "metric": "spo2", "value": round(v, 1),
        "baseline": round(base, 1) if base is not None else None,
        "direction": "down", "delta": round(-drop, 1) if base is not None else None,
        "unit": "%", "triggered": bool(triggered), "severity": "strong" if strong else "mild",
    }


def _sleep_signal(today: dict, prior: list[dict]) -> dict | None:
    v = _num(today.get("sleep_score"))
    hist = [x for d in prior if (x := _num(d.get("sleep_score"))) is not None]
    if v is None:
        return None
    base = statistics.median(hist) if len(hist) >= _MIN_BASELINE_N else None
    triggered = v < _SLEEP_POOR_ABS or (base is not None and (base - v) >= _SLEEP_POOR_DROP)
    return {
        "metric": "sleep_score", "value": round(v),
        "baseline": round(base) if base is not None else None,
        "direction": "down", "delta": round(v - base) if base is not None else None,
        "unit": "", "triggered": bool(triggered), "severity": "mild",
    }


def _opportunity_rhr(daily: list[dict]) -> dict | None:
    """RHR held meaningfully BELOW baseline for the last `_SUSTAIN_DAYS` days."""
    if len(daily) < _SUSTAIN_DAYS:
        return None
    recent = daily[-_SUSTAIN_DAYS:]
    prior = daily[:-_SUSTAIN_DAYS][-_BASELINE_WINDOW:]
    hist = [x for d in prior if (x := _num(d.get("rhr"))) is not None]
    vals = [x for d in recent if (x := _num(d.get("rhr"))) is not None]
    if len(vals) < _SUSTAIN_DAYS or len(hist) < _MIN_BASELINE_N:
        return None
    base = statistics.median(hist)
    sd = statistics.stdev(hist) if len(hist) >= 2 else 0.0
    deltas = [v - base for v in vals]  # negative = improved (lower RHR)
    least_good = max(deltas)  # the least-impressive day in the window decides
    mild_ok = least_good <= -_RHR_MILD_BPM or (sd > 0 and least_good <= -_RHR_MILD_SD * sd)
    if not mild_ok:
        return None
    strong = least_good <= -_RHR_STRONG_BPM or (sd > 0 and least_good <= -_RHR_STRONG_SD * sd)
    today_delta = vals[-1] - base
    return {
        "metric": "resting_hr", "value": round(vals[-1], 1), "baseline": round(base, 1),
        "direction": "down", "delta": round(today_delta, 1), "unit": "bpm",
        "triggered": True, "severity": "strong" if strong else "mild",
    }


def _opportunity_hrv(daily: list[dict]) -> dict | None:
    """HRV held meaningfully ABOVE baseline for the last `_SUSTAIN_DAYS` days."""
    if len(daily) < _SUSTAIN_DAYS:
        return None
    recent = daily[-_SUSTAIN_DAYS:]
    prior = daily[:-_SUSTAIN_DAYS][-_BASELINE_WINDOW:]
    hist_ln = [x for d in prior if (x := _ln(d.get("hrv"))) is not None]
    hist_raw = [x for d in prior if (x := _num(d.get("hrv"))) is not None]
    recent_ln = [x for d in recent if (x := _ln(d.get("hrv"))) is not None]
    recent_raw = [x for d in recent if (x := _num(d.get("hrv"))) is not None]
    if len(recent_ln) < _SUSTAIN_DAYS or len(hist_ln) < _MIN_BASELINE_N or not hist_raw:
        return None
    mu = statistics.mean(hist_ln)
    sd = statistics.stdev(hist_ln) if len(hist_ln) >= 2 else 0.0
    base_raw = statistics.median(hist_raw)
    least_good_ln = min(recent_ln)
    least_good_pct = min(((v - base_raw) / base_raw * 100.0) for v in recent_raw) if base_raw else 0.0
    mild_ok = (sd > 0 and least_good_ln > mu + _HRV_MILD_SD * sd) or least_good_pct >= -_HRV_MILD_PCT
    if not mild_ok:
        return None
    strong = (sd > 0 and least_good_ln > mu + _HRV_STRONG_SD * sd) or least_good_pct >= -_HRV_STRONG_PCT
    today_v = recent_raw[-1]
    today_pct = (today_v - base_raw) / base_raw * 100.0 if base_raw else 0.0
    return {
        "metric": "hrv", "value": round(today_v, 1), "baseline": round(base_raw, 1),
        "direction": "up", "delta": round(today_pct, 1), "unit": "%",
        "triggered": True, "severity": "strong" if strong else "mild",
    }


def _sleep_opportunity_signal(today: dict, prior: list[dict]) -> dict | None:
    """Well-rested corroborator — single-day, same role sleep plays as a
    corroborator (never a lone trigger) on the illness side."""
    v = _num(today.get("sleep_score"))
    hist = [x for d in prior if (x := _num(d.get("sleep_score"))) is not None]
    if v is None:
        return None
    base = statistics.median(hist) if len(hist) >= _MIN_BASELINE_N else None
    triggered = base is not None and (v - base) >= _SLEEP_GOOD_RISE
    return {
        "metric": "sleep_score", "value": round(v),
        "baseline": round(base) if base is not None else None,
        "direction": "up", "delta": round(v - base) if base is not None else None,
        "unit": "", "triggered": bool(triggered), "severity": "mild",
    }


def _opportunity_verdict(daily: list[dict], today: dict, prior: list[dict]) -> dict:
    rhr_opp = _opportunity_rhr(daily)
    hrv_opp = _opportunity_hrv(daily)
    sleep_opp = _sleep_opportunity_signal(today, prior)

    core = [s for s in (rhr_opp, hrv_opp) if s and s["triggered"]]
    n_core = len(core)
    strong_core = sum(1 for s in core if s["severity"] == "strong")
    corroborated = bool(sleep_opp and sleep_opp["triggered"])

    if n_core >= 2 and strong_core >= 1:
        level: Level = "high"
    elif n_core >= 2:
        level = "elevated"
    elif n_core >= 1 and strong_core >= 1 and corroborated:
        level = "elevated"
    elif n_core >= 1 and (strong_core >= 1 or corroborated):
        level = "watch"
    else:
        level = "none"

    if level == "none":
        return _none(None, None, signals=[])

    signals = [_public(s) for s in (rhr_opp, hrv_opp, sleep_opp) if s and s["triggered"]]
    reco_de, reco_en, head_de, head_en = _opportunity_copy(level, signals)
    return {
        "level": level,
        "polarity": "opportunity",
        "signals": signals,
        "headline_de": head_de,
        "headline_en": head_en,
        "recommendation_de": reco_de,
        "recommendation_en": reco_en,
    }


def _opportunity_copy(level: Level, signals: list[dict]) -> tuple[str, str, str, str]:
    order = {"resting_hr": 0, "hrv": 1, "sleep_score": 2}
    cited = sorted(signals, key=lambda s: order.get(s["metric"], 9))[:3]
    de_markers = ", ".join(_fmt(s, True) for s in cited)
    en_markers = ", ".join(_fmt(s, False) for s in cited)

    if level == "watch":
        head_de, head_en = "Gute Erholung", "Solid recovery"
        reco_de = (
            f"Deine Morgenwerte sehen gut aus ({de_markers}). Ein guter Tag, "
            "um Qualität abzurufen, wenn dein Plan es hergibt."
        )
        reco_en = (
            f"Your morning vitals look good ({en_markers}). A solid day to "
            "bring quality, if your plan calls for it."
        )
    elif level == "elevated":
        head_de, head_en = "Starke Erholung", "Strong recovery"
        reco_de = (
            f"Mehrere Tage in Folge deutlich über deiner Baseline ({de_markers}) "
            "— dein Körper erholt sich gut von der letzten Belastung."
        )
        reco_en = (
            f"Several days running clearly above your baseline ({en_markers}) "
            "— your body is recovering well from recent load."
        )
    else:  # high
        head_de, head_en = "Ausgezeichnete Form", "Excellent form"
        reco_de = (
            f"Deine Werte zeigen anhaltend starke Erholung ({de_markers}). "
            "Wenn dein Plan es zulässt, ist das ein guter Moment für eine "
            "harte Einheit."
        )
        reco_en = (
            f"Your data shows sustained, strong recovery ({en_markers}). "
            "If your plan allows it, this is a good moment for a hard session."
        )
    return reco_de, reco_en, head_de, head_en


# ─────────────────────────────────────────────────────────────────────────────
# Recommendation copy — keyed to the level AND the actual deviating markers.
# ─────────────────────────────────────────────────────────────────────────────

_METRIC_DE = {
    "resting_hr": "Ruhepuls", "hrv": "HRV", "respiration": "Atemfrequenz",
    "spo2": "SpO₂", "sleep_score": "Schlaf",
}
_METRIC_EN = {
    "resting_hr": "resting HR", "hrv": "HRV", "respiration": "respiration",
    "spo2": "SpO₂", "sleep_score": "sleep",
}


def _fmt(sig: dict, de: bool) -> str:
    """A single marker clause, e.g. 'Ruhepuls +7 bpm' or 'HRV −24%'."""
    name = (_METRIC_DE if de else _METRIC_EN)[sig["metric"]]
    d = sig.get("delta")
    unit = sig.get("unit") or ""
    if d is None:
        # SpO₂ / sleep with no baseline: cite the absolute value.
        return f"{name} {sig['value']}{unit}"
    sign = "+" if d > 0 else "−" if d < 0 else ""
    mag = abs(d)
    mag_str = f"{mag:g}"
    sep = " " if unit not in ("%", "") else ""
    return f"{name} {sign}{mag_str}{sep}{unit}".rstrip()


def _copy(level: Level, signals: list[dict]) -> tuple[str, str, str, str]:
    # Cite the core deviating markers (RHR / HRV / respiration first), then the
    # corroborators — most-informative first, capped at three so the line stays
    # readable on a 390px card.
    order = {"resting_hr": 0, "hrv": 1, "respiration": 2, "spo2": 3, "sleep_score": 4}
    cited = sorted(signals, key=lambda s: order.get(s["metric"], 9))[:3]
    de_markers = ", ".join(_fmt(s, True) for s in cited)
    en_markers = ", ".join(_fmt(s, False) for s in cited)

    if level == "watch":
        head_de, head_en = "Beobachte dich", "Keep an eye on it"
        reco_de = (
            f"Deine Morgenwerte weichen leicht ab ({de_markers}). Kein Alarm — "
            "mach heute einen leichten Tag und beobachte dich."
        )
        reco_en = (
            f"Your morning vitals are a touch off ({en_markers}). No alarm — "
            "keep today easy and keep an eye on how you feel."
        )
    elif level == "elevated":
        head_de, head_en = "Belastungszeichen", "Signs of strain"
        reco_de = (
            f"Deine Daten deuten auf erhöhte Belastung hin ({de_markers}). "
            "Heute Ruhe oder nur locker rollen — dein Körper zeigt Zeichen, "
            "dass er mehr Erholung braucht."
        )
        reco_en = (
            f"Your data points to elevated strain ({en_markers}). Rest today or "
            "only spin easy — your body is signalling it needs more recovery."
        )
    else:  # high
        head_de, head_en = "Deutliches Warnsignal", "Clear warning signal"
        reco_de = (
            f"Mehrere Morgenwerte deuten gemeinsam auf eine beginnende Infektion "
            f"oder deutliche Überlastung hin ({de_markers}). Heute pausieren und "
            "auf deinen Körper hören. Halten die Zeichen an oder kommen Symptome "
            "dazu, sprich mit einer Ärztin oder einem Arzt."
        )
        reco_en = (
            f"Several morning vitals cluster together toward an oncoming infection "
            f"or clear overload ({en_markers}). Rest today and listen to your "
            "body. If the signals persist or symptoms appear, check in with a doctor."
        )
    return reco_de, reco_en, head_de, head_en


# ─────────────────────────────────────────────────────────────────────────────
# Small helpers
# ─────────────────────────────────────────────────────────────────────────────

def _num(x) -> float | None:
    if x is None:
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    return f


def _ln(x) -> float | None:
    f = _num(x)
    if f is None or f <= 0:
        return None
    return math.log(f)


def _public(sig: dict) -> dict:
    """Strip internal keys before the signal leaves the service."""
    return {
        "metric": sig["metric"],
        "value": sig["value"],
        "baseline": sig["baseline"],
        "direction": sig["direction"],
        "delta": sig.get("delta"),
        "unit": sig.get("unit") or "",
        "severity": sig["severity"],
    }


def _none(reason_de: str | None, reason_en: str | None, *, signals: list | None = None) -> dict:
    return {
        "level": "none",
        "polarity": None,
        "signals": signals if signals is not None else [],
        "headline_de": None,
        "headline_en": None,
        "recommendation_de": reason_de,
        "recommendation_en": reason_en,
    }


def _iso(d) -> str:
    return d.isoformat() if isinstance(d, date) else str(d)


__all__ = ["detect_morning_health", "Level"]
