"""Judge the latest ride against the athlete's fitness baseline and surface
progress vs. fatigue/exhaustion signals. Rule-based, no LLM.

Fitness baseline = CTL (chronic load) + its 7-day trend; freshness = TSB.
Ride-vs-baseline = decoupling and eFTP compared to the athlete's recent median,
plus new personal bests. Every input is optional and degrades gracefully.
"""
from __future__ import annotations

from statistics import median

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Activity, ActivityStream
from app.schemas.form_progress import FormProgress, Marker, Signal
from app.schemas.race_debrief import RaceDebrief
from app.services.athlete_power_profile import reject_uncorroborated_peaks
from app.services.goal_trajectory import _ctl_7d_delta
from app.services.pmc_service import compute_user_pmc
from app.services.race_debrief import get_or_build_debrief

# Thresholds (HR-decoupling % and TSB points) from Coggan/Friel conventions.
_DECOUP_GOOD = 5.0
_DECOUP_HIGH = 8.0
_TSB_TIRED = -15.0
_TSB_DEEP = -25.0


def evaluate_form_progress(
    *,
    de: bool,
    long_ride: bool,
    has_pr: bool,
    ctl: float,
    ctl_7d: float,
    tsb: float,
    decoupling: float | None,
    baseline_decoupling: float | None,
    eftp: float | None,
    baseline_eftp: float | None,
) -> tuple[str, str, list[Marker], list[Signal]]:
    """Pure core: weigh progress vs. fatigue signals into a verdict + evidence."""
    signals: list[Signal] = []
    prog = 0.0
    fatigue = 0.0

    if has_pr:
        prog += 2
        signals.append(Signal(text="Neue Bestleistung in dieser Fahrt." if de
                              else "New personal best in this ride.", tone="good"))
    if ctl_7d > 0.3:
        prog += 1
        signals.append(Signal(
            text=(f"Fitness steigt (+{ctl_7d:.1f} CTL/Woche)." if de
                  else f"Fitness is building (+{ctl_7d:.1f} CTL/week)."), tone="good"))
    elif ctl_7d < -0.3:
        fatigue += 1
        signals.append(Signal(
            text=(f"Fitness fällt ({ctl_7d:+.1f} CTL/Woche)." if de
                  else f"Fitness is slipping ({ctl_7d:+.1f} CTL/week)."), tone="warn"))

    if decoupling is not None:
        if decoupling >= _DECOUP_HIGH:
            fatigue += 2
            signals.append(Signal(
                text=(f"Hohe HF-Entkopplung ({decoupling:.1f} %) — ein Ermüdungszeichen." if de
                      else f"High HR decoupling ({decoupling:.1f}%) — a fatigue sign."), tone="bad"))
        elif long_ride and decoupling < _DECOUP_GOOD:
            prog += 1
            signals.append(Signal(
                text=(f"Geringe Entkopplung ({decoupling:.1f} %) über eine lange Fahrt — starke Ermüdungsresistenz." if de
                      else f"Low decoupling ({decoupling:.1f}%) over a long ride — strong durability."), tone="good"))
        if (baseline_decoupling is not None and decoupling > baseline_decoupling + 3
                and decoupling < _DECOUP_HIGH):
            fatigue += 1
            signals.append(Signal(
                text=("Entkopplung über deinem Schnitt." if de
                      else "Decoupling above your usual."), tone="warn"))

    if tsb <= _TSB_DEEP:
        fatigue += 2
        signals.append(Signal(
            text=(f"Sehr negativer TSB ({tsb:.0f}) — tiefe Ermüdungslast." if de
                  else f"Deeply negative TSB ({tsb:.0f}) — heavy fatigue load."), tone="bad"))
    elif tsb <= _TSB_TIRED:
        fatigue += 1
        signals.append(Signal(
            text=(f"Negativer TSB ({tsb:.0f}) — du trägst Ermüdung." if de
                  else f"Negative TSB ({tsb:.0f}) — you're carrying fatigue."), tone="warn"))

    if eftp is not None and baseline_eftp is not None and baseline_eftp > 0:
        if eftp >= baseline_eftp * 1.02:
            prog += 1
            signals.append(Signal(
                text=("Leistung über deiner Basislinie." if de
                      else "Power above your baseline."), tone="good"))
        elif eftp < baseline_eftp * 0.95:
            fatigue += 1
            signals.append(Signal(
                text=("Leistung unter deiner Basislinie." if de
                      else "Power below your baseline."), tone="warn"))

    if fatigue > prog:
        verdict = "fatigue"
        headline = ("Zeichen von Ermüdung — plane Erholung ein." if de
                    else "Signs of fatigue — bank some recovery.")
    elif prog > fatigue:
        verdict = "progress"
        headline = ("Solider Fortschritt — die Form kommt." if de
                    else "Solid progress — fitness is showing.")
    else:
        verdict = "steady"
        headline = ("Stabil — dranbleiben." if de
                    else "Holding steady — keep it consistent.")

    markers: list[Marker] = [
        Marker(label="Fitness (CTL)", value=f"{ctl:.0f}",
               baseline=(f"{ctl_7d:+.1f}/{'Wo' if de else 'wk'}"), tone="neutral"),
        Marker(label="Form (TSB)", value=f"{tsb:+.0f}",
               tone="bad" if tsb <= _TSB_DEEP else "warn" if tsb <= _TSB_TIRED else "good"),
    ]
    if decoupling is not None:
        markers.append(Marker(
            label=("HF-Entkopplung" if de else "HR decoupling"),
            value=f"{decoupling:.1f} %",
            baseline=(f"{'Schnitt' if de else 'avg'} {baseline_decoupling:.1f} %"
                      if baseline_decoupling is not None else None),
            tone="bad" if decoupling >= _DECOUP_HIGH else "good" if decoupling < _DECOUP_GOOD else "neutral"))
    if eftp is not None:
        markers.append(Marker(
            label="eFTP", value=f"{eftp:.0f} W",
            baseline=(f"{'Basis' if de else 'base'} {baseline_eftp:.0f} W"
                      if baseline_eftp else None),
            tone="good" if (baseline_eftp and eftp >= baseline_eftp * 1.02)
                 else "warn" if (baseline_eftp and eftp < baseline_eftp * 0.95) else "neutral"))

    return verdict, headline, markers, signals


async def _latest_ride(db: AsyncSession, user_id: int) -> Activity | None:
    stmt = (
        select(Activity)
        .join(ActivityStream, ActivityStream.activity_id == Activity.id)
        .where(Activity.user_id == user_id)
        .order_by(Activity.started_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalars().first()


async def _baselines(db: AsyncSession, user_id: int, exclude_activity_id: int) -> tuple[float | None, float | None]:
    """Median decoupling and eFTP over the athlete's recent rides (excl. the latest).

    The eFTP list is sanitized first (audit P0-1): an inflated per-ride eFTP
    from a corrupt power file must not raise the athlete's baseline.
    """
    stmt = (
        select(ActivityStream.decoupling_pct, ActivityStream.eftp_watts)
        .where(ActivityStream.user_id == user_id, ActivityStream.activity_id != exclude_activity_id)
        .limit(30)
    )
    rows = (await db.execute(stmt)).all()
    decs = [float(r[0]) for r in rows if r[0] is not None]
    eftps = reject_uncorroborated_peaks(
        [float(r[1]) for r in rows if r[1] is not None]
    )
    return (median(decs) if decs else None, median(eftps) if eftps else None)


async def build_form_progress(db: AsyncSession, user_id: int, lang: str = "en") -> FormProgress | None:
    de = lang == "de"
    activity = await _latest_ride(db, user_id)
    if activity is None:
        return None
    debrief: RaceDebrief | None = await get_or_build_debrief(db, user_id, activity.id, lang)
    if debrief is None:
        return None

    pmc = (await compute_user_pmc(db, user_id, days=90)).get("total") or []
    ctl = float(pmc[-1].get("ctl", 0.0)) if pmc else 0.0
    tsb = float(pmc[-1].get("tsb", 0.0)) if pmc else 0.0
    ctl_7d = _ctl_7d_delta([{**p} for p in pmc]) if pmc else 0.0

    decoupling = debrief.efficiency.decoupling_pct if debrief.efficiency else None
    eftp = debrief.wko.mftp_watts if debrief.wko else None
    has_pr = any(e.is_pr for e in debrief.efforts)
    long_ride = debrief.header.moving_time_s >= 3600
    base_dec, base_eftp = await _baselines(db, user_id, activity.id)

    verdict, headline, markers, signals = evaluate_form_progress(
        de=de, long_ride=long_ride, has_pr=has_pr, ctl=ctl, ctl_7d=ctl_7d, tsb=tsb,
        decoupling=decoupling, baseline_decoupling=base_dec,
        eftp=eftp, baseline_eftp=base_eftp,
    )
    return FormProgress(
        activity_id=activity.id,
        activity_title=activity.title or ("Fahrt" if de else "Ride"),
        activity_date=activity.started_at.date().isoformat(),
        verdict=verdict, headline=headline, ctl=round(ctl, 1),
        ctl_7d_delta=round(ctl_7d, 1), tsb=round(tsb, 1),
        markers=markers, signals=signals, lang=lang,
    )
