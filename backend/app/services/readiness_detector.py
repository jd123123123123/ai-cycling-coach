"""Illness / overtraining / readiness detector.

Pure + deterministic (no LLM, no DB). Turns a short trailing history of the
athlete's overnight HRV proxy (Garmin ``hrv_status``) and resting HR into a
single readiness signal + a clear, localized reason string. The endpoint feeds
it the last ~14 days of ``daily_metrics`` and folds the verdict into the
plan-change note and a top-level ``readiness`` field on /weeks/current.

Method — INDIVIDUAL rolling baselines only (never population norms):
    - Work on ln(RMSSD). We use ``hrv_status`` as the RMSSD proxy and take its
      natural log so the day-to-day distribution is roughly symmetric (Plews /
      Altini: the log transform is what makes a fixed SWC meaningful).
    - Rolling 7-day baseline of ln(RMSSD): mean ``mu7``, SD ``sigma7``.
      Smallest Worthwhile Change SWC = 0.5 * sigma7 (Hopkins/Plews).
    - Resting-HR baseline: mean ``rhr_mu`` + SD ``rhr_sd`` over the same window.

Signals (priority: ILLNESS > OVERREACHING > AMBER > GREEN):
    - GREEN        today's ln(RMSSD) >= mu7 - SWC  AND  RHR <= rhr_mu + 1*rhr_sd
    - AMBER        today's ln(RMSSD) <  mu7 - SWC   (parasympathetic dip → go easy)
    - ILLNESS      today's ln(RMSSD) <  mu7 - 1*sigma7  AND  RHR > rhr_mu + ~5 bpm,
                   sustained >= 1 day (today, and corroborated by yesterday when
                   available) — the classic "fighting something" fingerprint.
    - OVERREACHING today's ln(RMSSD) is fine on the day but the parasympathetic
                   system is losing its bounce: HRV variability (CV = sigma7/mu7)
                   has collapsed vs the athlete's own 28-day norm, OR mu7 has
                   trended down across the loading block (mu7 now vs mu7 a week
                   ago). NFOR / functional-overreaching watch.

ACWR is deliberately NOT used here — it's weak/discredited for this purpose; the
plan-change explainer keeps it only as a minor corroborating signal.
"""
from __future__ import annotations

import math
import statistics
from datetime import date
from typing import Literal

Status = Literal["green", "amber", "illness", "overreaching", "unknown"]

# ── Thresholds (all relative to the athlete's OWN rolling baseline) ──────────
_BASELINE_WINDOW = 7          # days in the rolling HRV/RHR baseline
_MIN_BASELINE_N = 4           # need at least this many HRV readings to judge
_SWC_K = 0.5                  # Smallest Worthwhile Change = 0.5 * sigma7
_ILLNESS_HRV_K = 1.0         # today < mu7 - 1*sigma7
_ILLNESS_RHR_BPM = 5.0       # AND resting HR > baseline + 5 bpm
_RHR_GREEN_SD = 1.0          # GREEN requires RHR <= baseline + 1 SD
_LONG_WINDOW = 28            # CV-collapse comparison window
_CV_COLLAPSE_FRAC = 0.5      # recent CV < 50% of long-run CV = collapse
_MU_TREND_DROP = 0.03        # mu7 fell >= this (ln units, ~3%) over a week = trend-down


def _ln(x: float | None) -> float | None:
    if x is None:
        return None
    try:
        xf = float(x)
    except (TypeError, ValueError):
        return None
    if xf <= 0:
        return None
    return math.log(xf)


def _iso(d) -> str:
    if isinstance(d, date):
        return d.isoformat()
    return str(d)


def detect_readiness(daily: list[dict]) -> dict:
    """Assess today's readiness from a trailing HRV/RHR history.

    Args:
        daily: chronologically-ascending list of
            ``{"date": date|iso, "hrv": float|None, "rhr": float|None}``.
            The LAST entry is "today". ``hrv`` is Garmin ``hrv_status`` (RMSSD
            proxy); ``rhr`` is ``resting_hr``.

    Returns:
        ``{"status", "reason_en", "reason_de", "suggest_easy": bool,
           "signals": {...}}`` — a dict so the endpoint can localize and expose
        it. ``status`` is one of green/amber/illness/overreaching/unknown.
        Pure — no side effects.
    """
    if not daily:
        return _unknown("no biometric history")

    today = daily[-1]
    ln_today = _ln(today.get("hrv"))
    rhr_today = _num(today.get("rhr"))

    # Baseline = the readings BEFORE today (up to _BASELINE_WINDOW days back).
    prior = daily[:-1]
    ln_hist = [v for d in prior[-_BASELINE_WINDOW:] if (v := _ln(d.get("hrv"))) is not None]
    rhr_hist = [v for d in prior[-_BASELINE_WINDOW:] if (v := _num(d.get("rhr"))) is not None]

    if ln_today is None or len(ln_hist) < _MIN_BASELINE_N:
        return _unknown("not enough HRV readings for a personal baseline")

    mu7 = statistics.mean(ln_hist)
    sigma7 = statistics.stdev(ln_hist) if len(ln_hist) >= 2 else 0.0
    swc = _SWC_K * sigma7

    rhr_mu = statistics.mean(rhr_hist) if rhr_hist else None
    rhr_sd = statistics.stdev(rhr_hist) if len(rhr_hist) >= 2 else 0.0

    hrv_below_swc = ln_today < (mu7 - swc)
    hrv_below_1sd = ln_today < (mu7 - _ILLNESS_HRV_K * sigma7)
    rhr_elevated_illness = (
        rhr_today is not None and rhr_mu is not None and rhr_today > rhr_mu + _ILLNESS_RHR_BPM
    )
    rhr_ok_green = (
        rhr_today is None
        or rhr_mu is None
        or rhr_today <= rhr_mu + _RHR_GREEN_SD * rhr_sd
    )

    # Sustained: was RHR elevated yesterday too? (corroborates illness).
    rhr_elevated_yesterday = False
    if len(prior) >= 1 and rhr_mu is not None:
        y_rhr = _num(prior[-1].get("rhr"))
        rhr_elevated_yesterday = y_rhr is not None and y_rhr > rhr_mu + _ILLNESS_RHR_BPM

    # CV collapse: recent variability vs the athlete's own long-run norm.
    cv_recent = (sigma7 / mu7) if mu7 not in (0.0, None) else None
    ln_long = [v for d in prior[-_LONG_WINDOW:] if (v := _ln(d.get("hrv"))) is not None]
    cv_long = None
    if len(ln_long) >= 8:
        m_long = statistics.mean(ln_long)
        s_long = statistics.stdev(ln_long)
        cv_long = (s_long / m_long) if m_long else None
    cv_collapsed = (
        cv_recent is not None
        and cv_long is not None
        and cv_long > 0
        and cv_recent < _CV_COLLAPSE_FRAC * cv_long
    )

    # mu7 trending down across the loading block: mu7 now vs mu7 a week earlier.
    mu_trend_down = False
    if len(ln_hist) >= _MIN_BASELINE_N and len(prior) >= _BASELINE_WINDOW + _MIN_BASELINE_N:
        older = [
            v for d in prior[-(2 * _BASELINE_WINDOW):-_BASELINE_WINDOW]
            if (v := _ln(d.get("hrv"))) is not None
        ]
        if len(older) >= _MIN_BASELINE_N:
            mu_trend_down = (statistics.mean(older) - mu7) >= _MU_TREND_DROP

    signals = {
        "ln_rmssd_today": round(ln_today, 4),
        "mu7": round(mu7, 4),
        "sigma7": round(sigma7, 4),
        "swc": round(swc, 4),
        "rhr_today": rhr_today,
        "rhr_baseline": round(rhr_mu, 1) if rhr_mu is not None else None,
        "rhr_sd": round(rhr_sd, 2),
        "cv_recent": round(cv_recent, 4) if cv_recent is not None else None,
        "cv_long": round(cv_long, 4) if cv_long is not None else None,
        "baseline_n": len(ln_hist),
    }

    # ── Verdict (priority order) ─────────────────────────────────────────────
    illness = hrv_below_1sd and rhr_elevated_illness
    if illness:
        return _verdict(
            "illness",
            signals,
            suggest_easy=True,
            en=(
                "Your overnight HRV has dropped below your normal range with an "
                "elevated resting heart rate"
                + (" for a second day" if rhr_elevated_yesterday else "")
                + " — this looks like your body fighting something. Easier days are "
                "pencilled in until it recovers."
            ),
            de=(
                "Deine nächtliche HRV ist unter deinen Normalbereich gefallen, "
                "bei erhöhtem Ruhepuls"
                + (" den zweiten Tag in Folge" if rhr_elevated_yesterday else "")
                + " — das sieht danach aus, als kämpfe dein Körper gegen etwas. "
                "Ich habe bis zur Erholung leichtere Tage eingeplant."
            ),
        )

    if cv_collapsed or mu_trend_down:
        return _verdict(
            "overreaching",
            signals,
            suggest_easy=True,
            en=(
                "Your HRV is losing its normal day-to-day bounce"
                + (" and has trended down through this block" if mu_trend_down else "")
                + " — a sign of accumulating fatigue. I'm easing the load so this "
                "stays productive overreaching rather than tipping over."
            ),
            de=(
                "Deine HRV verliert ihre normale Schwankungsbreite"
                + (" und ist über diesen Block gesunken" if mu_trend_down else "")
                + " — ein Zeichen für sich anstauende Ermüdung. Ich nehme etwas "
                "Last raus, damit es produktive Überlastung bleibt und nicht kippt."
            ),
        )

    if hrv_below_swc:
        return _verdict(
            "amber",
            signals,
            suggest_easy=True,
            en=(
                "Your HRV is a touch below your personal baseline this morning — "
                "not alarming, but a good day to keep it easy and let recovery win."
            ),
            de=(
                "Deine HRV liegt heute Morgen etwas unter deinem persönlichen "
                "Ausgangswert — kein Grund zur Sorge, aber ein guter Tag, es locker "
                "zu nehmen und der Erholung Vorrang zu geben."
            ),
        )

    return _verdict(
        "green",
        signals,
        suggest_easy=False,
        en=(
            "Your HRV and resting heart rate are within your normal range — "
            "you're recovered and ready to train as planned."
        ),
        de=(
            "Deine HRV und dein Ruhepuls liegen in deinem Normalbereich — "
            "du bist erholt und bereit, wie geplant zu trainieren."
        ),
    )


def _num(x) -> float | None:
    if x is None:
        return None
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _unknown(why: str) -> dict:
    return {
        "status": "unknown",
        "reason_en": f"Not enough data to judge readiness ({why}).",
        "reason_de": f"Nicht genug Daten, um die Bereitschaft zu beurteilen ({why}).",
        "suggest_easy": False,
        "signals": {},
    }


def _verdict(status: Status, signals: dict, *, suggest_easy: bool, en: str, de: str) -> dict:
    return {
        "status": status,
        "reason_en": en,
        "reason_de": de,
        "suggest_easy": suggest_easy,
        "signals": signals,
    }


__all__ = ["detect_readiness", "Status"]
