"""Plan-change explainer — detects when the athlete's real training diverged
from the plan (skipped a day, over- or under-trained) and states, clearly and
in the requested locale, what changed and how the week adapts.

Pure + deterministic (no LLM, no DB). The endpoint feeds it planned-vs-actual
load over the recent window plus a couple of PMC signals; it returns a
structured verdict + one human sentence for the frontend.

Detection (recent trailing window, per athlete-local day):
    - SKIPPED       — a planned TRAINING day (planned load > ~20 TSS, not rest)
                      landed at ~0 actual load.
    - UNDERTRAINED  — the week's actual load is well below plan (< ~70%).
    - OVERTRAINED   — the week's actual load is well above plan (> ~130%) OR
                      the acute:chronic ratio (ACWR) spiked ≥ 1.5.

Only the single most important finding drives the top-line `status` + message;
the full list is returned too so a richer UI can show every deviation.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Literal

from app.services import athlete_time

# Thresholds (research-aligned, conservative).
_SKIP_PLANNED_MIN_TSS = 20.0    # a planned day below this is treated as rest/easy
_SKIP_ACTUAL_MAX_FRAC = 0.15    # actual ≤ 15% of planned = effectively skipped
_UNDER_WEEK_FRAC = 0.70         # actual week < 70% of planned = undertrained
_OVER_WEEK_FRAC = 1.30          # actual week > 130% of planned = overtrained
_ACWR_SPIKE = 1.5               # Gabbett/Bourdon danger zone

Status = Literal["on_track", "skipped", "undertrained", "overtrained"]

_DOW_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_DOW_DE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]

# Plain-English category labels for the skipped-session sentence.
_CATEGORY_EN = {
    "rest": "rest day", "recovery": "recovery spin", "endurance": "endurance ride",
    "tempo": "tempo session", "sweet_spot": "sweet-spot session",
    "threshold": "threshold session", "vo2": "VO2 session", "anaerobic": "sprint session",
}
_CATEGORY_DE = {
    "rest": "Ruhetag", "recovery": "Regenerationsfahrt", "endurance": "Grundlagenausfahrt",
    "tempo": "Tempoeinheit", "sweet_spot": "Sweet-Spot-Einheit",
    "threshold": "Schwelleneinheit", "vo2": "VO2-Einheit", "anaerobic": "Sprinteinheit",
}


def detect_plan_changes(
    planned_days: list[dict],
    actual_by_date: dict[str, float],
    *,
    acwr: float | None = None,
    week_start: date | None = None,
) -> dict:
    """Compare planned vs actual over the recent window.

    Args:
        planned_days: list of ``{"date": iso, "dow": int, "category": str,
            "planned_tss": float}`` for the trailing window (past days only).
        actual_by_date: ``{iso_date: actual_tss}`` from real activities.
        acwr: acute:chronic workload ratio, if known.
        week_start: Monday of the current athlete-local week. Days dated
            before it are dropped entirely (defense-in-depth for audit P0-2:
            a week-old "skipped Tuesday" must never render on a fresh
            Monday, regardless of the window the caller passed). Defaults to
            the Monday derived from ``athlete_time.today_local()`` — callers
            must have bound the athlete tz for that default to be exact.

    Returns ``{"changes": [ {type, dow, date, category, severity,
    planned_tss, actual_tss} ... ], "planned_week_tss": float,
    "actual_week_tss": float}``. Pure — no side effects.
    """
    if week_start is None:
        today = athlete_time.today_local()
        week_start = today - timedelta(days=today.weekday())

    changes: list[dict] = []
    planned_week = 0.0
    actual_week = 0.0

    for d in planned_days:
        iso = d.get("date")
        # Stale-week guard: any day from before the current athlete-local
        # week is out of scope — it must neither flag a skip nor count
        # toward this week's planned/actual totals.
        if iso:
            try:
                if date.fromisoformat(str(iso)) < week_start:
                    continue
            except ValueError:
                pass  # unparseable date — keep legacy behavior for that row
        planned_tss = float(d.get("planned_tss") or 0.0)
        actual_tss = float(actual_by_date.get(iso, 0.0) or 0.0)
        category = str(d.get("category") or "endurance")
        planned_week += planned_tss
        actual_week += actual_tss

        is_training_day = category != "rest" and planned_tss >= _SKIP_PLANNED_MIN_TSS
        if is_training_day and actual_tss <= planned_tss * _SKIP_ACTUAL_MAX_FRAC:
            changes.append({
                "type": "skipped",
                "dow": int(d.get("dow", 0)),
                "date": iso,
                "category": category,
                "severity": "ease",
                "planned_tss": round(planned_tss, 1),
                "actual_tss": round(actual_tss, 1),
            })

    # Week-level over/under. Only meaningful when there WAS a plan to compare to.
    if planned_week >= _SKIP_PLANNED_MIN_TSS:
        frac = actual_week / planned_week if planned_week > 0 else 1.0
        if frac > _OVER_WEEK_FRAC or (acwr is not None and acwr >= _ACWR_SPIKE):
            changes.append({
                "type": "overtrained",
                "severity": "ease",
                "planned_tss": round(planned_week, 1),
                "actual_tss": round(actual_week, 1),
                "acwr": round(acwr, 2) if acwr is not None else None,
            })
        elif frac < _UNDER_WEEK_FRAC:
            changes.append({
                "type": "undertrained",
                "severity": "boost",
                "planned_tss": round(planned_week, 1),
                "actual_tss": round(actual_week, 1),
            })

    return {
        "changes": changes,
        "planned_week_tss": round(planned_week, 1),
        "actual_week_tss": round(actual_week, 1),
    }


def _skipped_change(changes: list[dict]) -> dict | None:
    for c in changes:
        if c["type"] == "skipped":
            return c
    return None


def explain_plan_changes(
    detection: dict,
    *,
    current_skeleton: list[dict] | None = None,
    weekly_tss_target: int = 0,
    de: bool = False,
    readiness: dict | None = None,
) -> dict | None:
    """Turn a `detect_plan_changes` result into a clear, localized verdict.

    Returns ``{"status", "message", "changes"}`` — or ``None`` when nothing
    deviated (status would be 'on_track') AND readiness is fine, so the endpoint
    can omit the field.

    `current_skeleton` (the freshly (re)generated week) lets the message name
    the ACTUAL remaining rest/quality days, so what we SAY matches what the
    plan now SHOWS.

    `readiness` is the output of ``readiness_detector.detect_readiness``. When it
    flags ILLNESS or OVERREACHING that takes PRIORITY over load-deviation notes
    (safety first): the readiness reason leads the "what changed / could change"
    message. AMBER is appended as a corroborating nudge.
    """
    changes = detection.get("changes") or []

    # Readiness safety override — illness/overreaching lead the message even
    # when the load looks on-plan, because the body is telling us to back off.
    r_status = (readiness or {}).get("status")
    r_reason = (readiness or {}).get("reason_de" if de else "reason_en") if readiness else None
    if r_status in ("illness", "overreaching") and r_reason:
        return {
            "status": r_status,
            "message": r_reason,
            "changes": changes,
        }

    if not changes:
        # No load deviation — surface an AMBER readiness nudge if present.
        if r_status == "amber" and r_reason:
            return {"status": "amber", "message": r_reason, "changes": []}
        return None

    # Priority: overtrained (safety) > skipped > undertrained.
    over = next((c for c in changes if c["type"] == "overtrained"), None)
    skip = _skipped_change(changes)
    under = next((c for c in changes if c["type"] == "undertrained"), None)

    # Locate the current week's key (quality) day + a rest day so the message
    # can reference what the plan now shows.
    quality_dow: int | None = None
    rest_dow: int | None = None
    _QUALITY = {"vo2", "threshold", "sweet_spot"}
    for d in (current_skeleton or []):
        if d.get("is_rest") and rest_dow is None:
            rest_dow = int(d.get("dow", 0))
        if d.get("category") in _QUALITY and quality_dow is None:
            quality_dow = int(d.get("dow", 0))

    def _dow_name(i: int | None) -> str:
        if i is None:
            return "your next quality day" if not de else "deinem nächsten Qualitätstag"
        return (_DOW_DE if de else _DOW_EN)[i % 7]

    if over is not None:
        status: Status = "overtrained"
        if de:
            message = (
                f"Du hast diese Woche mehr trainiert als geplant "
                f"({over['actual_tss']:.0f} statt {over['planned_tss']:.0f} Belastungspunkte)"
                + (f", und dein Belastungssprung ist erhöht (ACWR {over['acwr']})" if over.get("acwr") else "")
                + f". Ich lege den Fokus jetzt auf Erholung — {_dow_name(rest_dow)} bleibt ein Ruhetag, "
                "damit dein Körper die Extra-Last verarbeitet und du nicht ins Übertraining kippst."
            )
        else:
            message = (
                f"You trained more than planned this week "
                f"({over['actual_tss']:.0f} vs {over['planned_tss']:.0f} load points)"
                + (f", and your load is spiking (ACWR {over['acwr']})" if over.get("acwr") else "")
                + f". I'm biasing this week toward recovery — {_dow_name(rest_dow)} stays a rest day "
                "so your body absorbs the extra work instead of tipping into overtraining."
            )
    elif skip is not None:
        status = "skipped"
        day = _dow_name(int(skip["dow"]))
        cat = (_CATEGORY_DE if de else _CATEGORY_EN).get(skip["category"], skip["category"])
        if de:
            message = (
                f"Du hast {day} die {cat} ausgelassen. Kein Problem — ich habe die Woche neu ausbalanciert: "
                f"die Qualitätseinheit liegt jetzt auf {_dow_name(quality_dow)}, und die lockeren Tage fangen "
                "die fehlende Belastung auf, damit die Woche trotzdem nahe am Ziel landet"
                + (f" (~{weekly_tss_target} Belastungspunkte)." if weekly_tss_target else ".")
            )
        else:
            message = (
                f"You skipped {day}'s {cat}. No problem — I've rebalanced the week: "
                f"the quality session sits on {_dow_name(quality_dow)}, and the easy days absorb the "
                "missed load so the week still lands near target"
                + (f" (~{weekly_tss_target} load points)." if weekly_tss_target else ".")
            )
    else:  # undertrained
        status = "undertrained"
        assert under is not None
        if de:
            message = (
                f"Du hast diese Woche weniger trainiert als geplant "
                f"({under['actual_tss']:.0f} statt {under['planned_tss']:.0f} Belastungspunkte). "
                f"Du bist frisch — {_dow_name(quality_dow)} ist die Qualitätseinheit, um die verpasste "
                "Belastung nachzuholen, ohne dich zu überfordern."
            )
        else:
            message = (
                f"You trained less than planned this week "
                f"({under['actual_tss']:.0f} vs {under['planned_tss']:.0f} load points). "
                f"You're fresh — {_dow_name(quality_dow)} carries the quality work to recoup the missed "
                "load without overreaching."
            )

    # Append an AMBER readiness nudge to the load-deviation message.
    if r_status == "amber" and r_reason:
        message = f"{message} {r_reason}"

    return {"status": status, "message": message, "changes": changes}


__all__ = ["detect_plan_changes", "explain_plan_changes", "Status"]
