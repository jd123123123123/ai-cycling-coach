"""V3 · Power Profile view-model — the data behind the /power-profile screen.

Composes the *fast* athlete power model (built from the stored per-ride
``mmp_curve`` JSON, never a re-sweep of raw 1 Hz streams — that reload is what
makes the dense ``compute_detailed_power_profile`` too slow to serve on request)
with the extra derivations the V3 surface needs card-for-card against the pencil
frame ``QLszB``:

    Power curve (hero mean-max bars + recent-PR flags) → FTP · threshold (+ W/kg
    + monthly progression) → power zones (Coggan, from FTP) → rider-type
    phenotype (+ training-consequence line) → cohort benchmark bands → sprint &
    pedaling (fatigue resistance + left/right balance).

Honesty rules (audit): every number is derived from user's OWN rides. Where a
figure can't be derived (no weight → no W/kg, no balance channel, too few rides
→ no phenotype) the field is ``None`` so the UI renders an honest "—" rather
than a fabricated value. Cohort bands are published Coggan FTP-W/kg reference
categories, labelled as such — not a live percentile of other app users.

Pure helpers (``power_zones``, ``benchmark_bands``, ``ftp_progression``,
``recent_pr_durations``, ``hero_curve``, ``phenotype_traits``) are unit-tested
without a DB; ``compute_power_profile_view`` is the async composer.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.models.athlete_profile import AthleteProfile
from app.services.athlete_power_profile import (
    build_sanitized_envelope,
    model_confidence,
    reconcile_threshold,
)
from app.services.critical_power import fit_critical_power
from app.services.durability import durability_drop
from app.services.power_phenotype import power_phenotype

# Hero mean-max bars, sprint → steady climb (matches the pen BarRow columns).
HERO_DURATIONS: tuple[tuple[int, str, str], ...] = (
    (5, "5 s", "5 s"),
    (15, "15 s", "15 s"),
    (60, "1 min", "1 Min"),
    (300, "5 min", "5 Min"),
    (1200, "20 min", "20 Min"),
    (3600, "60 min", "60 Min"),
)

# Coggan classic zones as a 6-band scale (Z6 folds anaerobic + neuromuscular),
# upper bound as a fraction of FTP. Z1 is open below, Z6 open above.
_ZONE_UPPER: tuple[float | None, ...] = (0.55, 0.75, 0.90, 1.05, 1.20, None)
_ZONE_NAMES: tuple[tuple[str, str], ...] = (
    ("Active Recovery", "Aktive Erholung"),
    ("Endurance", "Grundlage"),
    ("Tempo", "Tempo"),
    ("Threshold", "Schwelle"),
    ("VO₂ Max", "VO₂max"),
    ("Anaerobic", "Anaerob"),
)

# Reference FTP-W/kg categories (amateur → racer → pro), used to place the
# athlete on the benchmark band. Reference values, not a live cohort.
_BAND_MIN, _BAND_MAX = 2.0, 6.0
_BANDS: tuple[tuple[str, str, str, float, float], ...] = (
    ("everyday", "Everyday rider", "Alltagsfahrer", 2.0, 3.0),
    ("racer", "Racer", "Racer", 3.0, 4.5),
    ("pro", "Pro", "Profi", 4.5, 6.0),
)

_TRAIT_META: tuple[tuple[str, str, str, str], ...] = (
    ("sprint", "Sprint", "Sprint", "neuromuscular_x"),
    ("short_climbs", "Short climbs", "Kurze Anstiege", "anaerobic_x"),
    ("threshold", "Threshold", "Schwelle", "vo2_x"),
    ("endurance", "Long endurance", "Lange Ausdauer", "_durability"),
)
# Reserve ranges (peak ÷ CP) → 40–100% bar fill, per system.
_TRAIT_RANGE = {
    "neuromuscular_x": (1.8, 3.0),
    "anaerobic_x": (1.3, 2.1),
    "vo2_x": (1.05, 1.35),
}

# Phenotype → training-consequence prose (athlete-facing, localized).
_CONSEQUENCE: dict[str, tuple[str, str]] = {
    "sprinter": (
        "Your short, explosive power is the weapon — this block sharpens it with "
        "neuromuscular and anaerobic work.",
        "Deine kurze, explosive Power ist die Waffe — dieser Block schärft sie mit "
        "neuromuskulärer und anaerober Arbeit.",
    ),
    "pursuiter": (
        "Your 3–5 min power is the weapon — this block biases VO₂ work to sharpen it.",
        "Deine 3–5-Min-Power ist die Waffe — dieser Block betont VO₂-Arbeit, um sie zu schärfen.",
    ),
    "time_trialist": (
        "Your engine holds power for hours — this block builds threshold and "
        "durability so it holds even deeper.",
        "Dein Motor hält Druck über Stunden — dieser Block baut Schwelle und "
        "Ermüdungswiderstand, damit er noch länger hält.",
    ),
    "all_rounder": (
        "No glaring weakness — this block keeps every system balanced while "
        "nudging your threshold up.",
        "Keine klare Schwäche — dieser Block hält alle Systeme im Gleichgewicht "
        "und hebt gleichzeitig deine Schwelle an.",
    ),
}

_MONTHS = (
    ("Jan", "Jan"), ("Feb", "Feb"), ("Mar", "Mär"), ("Apr", "Apr"),
    ("May", "Mai"), ("Jun", "Jun"), ("Jul", "Jul"), ("Aug", "Aug"),
    ("Sep", "Sep"), ("Oct", "Okt"), ("Nov", "Nov"), ("Dec", "Dez"),
)


def _round(v: float | None) -> int | None:
    return None if v is None else round(v)


# ── Pure helpers ────────────────────────────────────────────────────────────

def power_zones(ftp_watts: float | int | None) -> list[dict]:
    """Six Coggan power zones (watt ranges) from FTP. Empty without an FTP."""
    if not ftp_watts or ftp_watts <= 0:
        return []
    ftp = float(ftp_watts)
    zones: list[dict] = []
    prev_high: int | None = None
    for i, upper in enumerate(_ZONE_UPPER):
        high = None if upper is None else round(upper * ftp)
        low = None if i == 0 else (prev_high + 1 if prev_high is not None else None)
        name_en, name_de = _ZONE_NAMES[i]
        zones.append({
            "code": f"Z{i + 1}",
            "color_idx": i + 1,
            "name_en": name_en,
            "name_de": name_de,
            "low": low,
            "high": high,
        })
        prev_high = high
    return zones


def benchmark_bands(wkg: float | None) -> dict | None:
    """Place the athlete's FTP W/kg on the reference amateur→pro bands."""
    if wkg is None or wkg <= 0:
        return None
    bands = [
        {"key": k, "label_en": en, "label_de": de, "low_wkg": lo, "high_wkg": hi}
        for (k, en, de, lo, hi) in _BANDS
    ]
    category = "everyday"
    for (k, _en, _de, lo, hi) in _BANDS:
        if wkg >= lo:
            category = k
    span = _BAND_MAX - _BAND_MIN
    position_pct = max(0.0, min(100.0, (wkg - _BAND_MIN) / span * 100.0))
    # Distance to the pro doorstep (informational, W/kg).
    pro_low = _BANDS[2][3]
    to_pro = round(pro_low - wkg, 1)
    return {
        "you_wkg": round(wkg, 1),
        "category_key": category,
        "position_pct": round(position_pct, 1),
        "to_pro_wkg": to_pro if to_pro > 0 else None,
        "bands": bands,
    }


def _eftp_from_curves(curves: list[dict]) -> float | None:
    envelope = build_sanitized_envelope(curves)
    if not envelope:
        return None
    fit = fit_critical_power(envelope)
    return fit.eftp_watts if fit else None


def ftp_progression(
    rides: list[tuple[date, dict]], ftp_watts: float | int | None, months_back: int = 5
) -> list[dict]:
    """Monthly threshold history: as-of-each-month eFTP from the cumulative
    sanitized envelope of every ride up to that month's end. Same model the
    headline uses, evaluated at each month — an honest trend, not a fabricated
    line. Only months that contain rides are emitted; the last is flagged
    ``is_current``."""
    if not rides:
        return []
    rides = sorted(rides, key=lambda r: r[0])
    # Distinct (year, month) buckets that actually contain rides.
    months: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()
    for d, _ in rides:
        ym = (d.year, d.month)
        if ym not in seen:
            seen.add(ym)
            months.append(ym)
    months = months[-months_back:]
    out: list[dict] = []
    for idx, (yr, mo) in enumerate(months):
        # Cumulative: every ride on or before the end of this month.
        curves = [c for (d, c) in rides if (d.year, d.month) <= (yr, mo)]
        eftp = _eftp_from_curves(curves)
        watts = _round(eftp)
        if watts is None:
            continue
        en, de = _MONTHS[mo - 1]
        out.append({
            "month_en": en,
            "month_de": de,
            "watts": watts,
            "is_current": idx == len(months) - 1,
        })
    # Enforce non-decreasing display (the cumulative envelope can only grow).
    prev = None
    for p in out:
        if prev is not None and p["watts"] < prev:
            p["watts"] = prev
        prev = p["watts"]
    return out


def recent_pr_durations(
    rides: list[tuple[date, dict]], today: date, window_days: int = 14
) -> set[int]:
    """Durations whose all-time best power came from a ride within the trailing
    ``window_days`` — i.e. a genuine recent personal record. Honest: keyed off
    which ride actually holds each duration's max, not a guess."""
    if not rides:
        return set()
    cutoff = today - timedelta(days=window_days)
    best: dict[int, tuple[float, date]] = {}
    for d, curve in rides:
        if not curve:
            continue
        for dur, watts in curve.items():
            if watts is None:
                continue
            dur_i = int(dur)
            w = float(watts)
            cur = best.get(dur_i)
            if cur is None or w > cur[0]:
                best[dur_i] = (w, d)
    return {dur for dur, (_w, d) in best.items() if d >= cutoff}


def recent_envelope(
    rides: list[tuple[date, dict]], today: date, window_days: int = 90
) -> dict[int, float]:
    """The rider's best at each duration WITHIN the trailing window.

    The main envelope is all-time and has no date filter, which makes it the
    rider's record book — and a record book on its own cannot answer "how
    close am I right now". This is the same computation over recent rides
    only, so each duration can be drawn as current-against-record.

    Ninety days, not fourteen: `recent_pr_durations` uses a fortnight because
    it is answering "did you just set this", a question about an event. This
    one answers "what shape are you in", which a fortnight cannot see through
    a taper, an illness or a fortnight of bad weather.
    """
    cutoff = today - timedelta(days=window_days)
    best: dict[int, float] = {}
    for d, curve in rides:
        if not curve or d < cutoff:
            continue
        for dur, watts in curve.items():
            if watts is None:
                continue
            dur_i, w = int(dur), float(watts)
            if dur_i not in best or w > best[dur_i]:
                best[dur_i] = w
    return best


def hero_curve(
    envelope: dict[int, float],
    weight_kg: float | None,
    pr_durations: set[int],
    recent: dict[int, float] | None = None,
) -> list[dict]:
    """The hero mean-max bars. Every HERO_DURATION is emitted; watts/wkg are
    None when the envelope has no point that long (honest dash).

    `recent_watts` is the rider's best at that duration in the trailing 90
    days, or None where they have not ridden that hard that recently. It is
    always <= `watts` by construction — the all-time envelope contains the
    recent one — which is what lets a screen draw the pair as a fill inside a
    track without ever overflowing it.
    """
    out: list[dict] = []
    for seconds, label_en, label_de in HERO_DURATIONS:
        watts = envelope.get(seconds)
        wkg = round(watts / weight_kg, 2) if (watts and weight_kg and weight_kg > 0) else None
        rec = (recent or {}).get(seconds)
        out.append({
            "seconds": seconds,
            "label_en": label_en,
            "label_de": label_de,
            "watts": round(watts, 0) if watts is not None else None,
            "wkg": wkg,
            "is_pr": seconds in pr_durations,
            "recent_watts": round(rec, 0) if rec is not None else None,
        })
    return out


def _scale(value: float | None, lo: float, hi: float) -> int:
    if value is None:
        return 50
    return round(max(40.0, min(100.0, 40.0 + (value - lo) / (hi - lo) * 60.0)))


def _trait_word(pct: int) -> tuple[str, str]:
    if pct >= 85:
        return "Elite", "Elite"
    if pct >= 70:
        return "Strong", "Stark"
    if pct >= 55:
        return "Solid", "Solide"
    return "Growing", "Wächst"


def phenotype_traits(
    reserves: dict[str, float] | None, durability_best_pct: float | None
) -> list[dict]:
    """Four trait bars (sprint / short climbs / threshold / long endurance) from
    the phenotype reserves + durability, each 0–100 with a word label."""
    reserves = reserves or {}
    traits: list[dict] = []
    for key, en, de, src in _TRAIT_META:
        if src == "_durability":
            # Lower late-ride drop = stronger endurance. Map drop 12%→0% to 40→100.
            if durability_best_pct is None:
                pct = 50
            else:
                pct = round(max(40.0, min(100.0, 100.0 - durability_best_pct * 5.0)))
        else:
            lo, hi = _TRAIT_RANGE[src]
            pct = _scale(reserves.get(src), lo, hi)
        word_en, word_de = _trait_word(pct)
        traits.append({
            "key": key,
            "label_en": en,
            "label_de": de,
            "word_en": word_en,
            "word_de": word_de,
            "pct": pct,
        })
    return traits


# ── Async composer ──────────────────────────────────────────────────────────

async def compute_power_profile_view(
    db: AsyncSession, user_id: int, lang: str = "en"
) -> dict:
    """Full V3 Power Profile view-model. ``{available: False}`` when the athlete
    has no cycling power rides yet."""
    lang = "de" if str(lang).lower().startswith("de") else "en"

    res = await db.execute(
        select(
            ActivityStream.activity_id,
            ActivityStream.mmp_curve,
            ActivityStream.decoupling_pct,
            ActivityStream.total_kj,
        ).where(
            ActivityStream.user_id == user_id,
            ActivityStream.mmp_curve.isnot(None),
        )
    )
    rows = res.all()
    if not rows:
        return {"available": False}

    act_ids = [r.activity_id for r in rows]
    act_res = await db.execute(
        select(Activity.id, Activity.started_at).where(Activity.id.in_(act_ids))
    )
    started_by_id = {a.id: a.started_at for a in act_res.all()}

    # Per-ride (date, curve) with int-keyed curves.
    rides_dated: list[tuple[date, dict]] = []
    curves: list[dict] = []
    for r in rows:
        curve = {int(k): float(v) for k, v in (r.mmp_curve or {}).items() if v is not None}
        curves.append(curve)
        started = started_by_id.get(r.activity_id)
        if started is not None:
            rides_dated.append((started.date(), curve))

    envelope = build_sanitized_envelope(curves)
    if not envelope:
        return {"available": False}
    fit = fit_critical_power(envelope)

    prof_res = await db.execute(
        select(AthleteProfile.weight_kg, AthleteProfile.ftp_watts).where(
            AthleteProfile.user_id == user_id
        )
    )
    prof_row = prof_res.first()
    weight = float(prof_row.weight_kg) if (prof_row and prof_row.weight_kg) else None
    ftp = float(prof_row.ftp_watts) if (prof_row and prof_row.ftp_watts) else None

    reconciled = reconcile_threshold(ftp, fit.eftp_watts if fit else None)
    threshold = reconciled["threshold_watts"]
    threshold_wkg = round(threshold / weight, 1) if (threshold and weight) else None
    cp_wkg = round(fit.cp_watts / weight, 2) if (fit and weight) else None

    today = date.today()
    pr_durations = recent_pr_durations(rides_dated, today=today)
    curve = hero_curve(envelope, weight, pr_durations, recent_envelope(rides_dated, today))

    # PR callout: hero durations that are recent records.
    pr_hero = [c for c in curve if c["is_pr"] and c["watts"] is not None]
    pr_note = None
    if pr_hero:
        labels_en = [c["label_en"] for c in pr_hero]
        labels_de = [c["label_de"] for c in pr_hero]
        pr_note = {"count": len(pr_hero), "labels_en": labels_en, "labels_de": labels_de}

    # Phenotype (only when the CP fit exists and the manual FTP doesn't
    # contradict it — mirrors the honesty gate on the other power surfaces).
    phen = None
    traits: list[dict] = []
    consequence_en = consequence_de = None
    if fit and reconciled["model_valid"]:
        peaks = {str(d): envelope[d] for d in (5, 60, 300) if d in envelope}
        ph = power_phenotype(fit.cp_watts, peaks, lang=lang)
        if ph:
            phen = ph

    # Fatigue resistance (durability) — computed on the few longest rides only,
    # so we load a bounded number of raw streams (never the whole history).
    durability_best = await _bounded_durability(db, user_id, rows)
    if phen:
        traits = phenotype_traits(phen.get("reserves"), durability_best)
        consequence_en, consequence_de = _CONSEQUENCE.get(phen["key"], (None, None))

    decouples = [r.decoupling_pct for r in rows if r.decoupling_pct is not None]
    avg_decoupling = round(sum(decouples) / len(decouples), 1) if decouples else None

    balance = await _recent_balance(db, user_id, rows, started_by_id)

    zones = power_zones(threshold)

    benchmark = benchmark_bands(threshold_wkg)

    sprint_5s = next((c["wkg"] for c in curve if c["seconds"] == 5), None)
    # "Power retained late in long rides": 100% when power holds (or rises) after
    # 1500 kJ; drops below as the late-ride fade grows. Honest retention, used
    # for both the headline number and the bar width.
    stamina_pct = (
        round(max(0.0, min(100.0, 100.0 - max(0.0, durability_best))))
        if durability_best is not None else None
    )

    return {
        "available": True,
        "lang": lang,
        "rides_with_power": len(curves),
        "weight_kg": round(weight, 1) if weight else None,
        # Power curve
        "curve": curve,
        "pr_note": pr_note,
        # FTP / threshold
        "threshold_watts": threshold,
        "threshold_source": reconciled["threshold_source"],
        "threshold_wkg": threshold_wkg,
        "model_valid": reconciled["model_valid"],
        "cp_watts": fit.cp_watts if fit else None,
        "w_prime_j": fit.w_prime_j if fit else None,
        "eftp_watts": fit.eftp_watts if fit else None,
        "r_squared": fit.r_squared if fit else None,
        "cp_wkg": cp_wkg,
        "confidence": model_confidence(
            len(curves),
            fit.r_squared if fit else None,
            identifiable=fit.identifiable if fit else True,
        ),
        "ftp_progression": ftp_progression(rides_dated, ftp),
        # Zones
        "zones": zones,
        # Phenotype
        "phenotype": (
            {
                "key": phen["key"],
                "type": phen["type"],
                "note": phen["note"],
                "traits": traits,
                "consequence_en": consequence_en,
                "consequence_de": consequence_de,
            }
            if phen else None
        ),
        # Benchmark
        "benchmark": benchmark,
        # Sprint & pedaling
        "sprint_pedal": {
            "stamina_pct": stamina_pct,
            "durability_best_pct": durability_best,
            "avg_decoupling_pct": avg_decoupling,
            "sprint_wkg": sprint_5s,
            "balance_left_pct": balance,
            "balance_right_pct": round(100.0 - balance, 1) if balance is not None else None,
        },
    }


async def _bounded_durability(db: AsyncSession, user_id: int, rows) -> float | None:
    """Best (smallest) late-ride power drop after 1500 kJ, computed on at most
    the 5 longest rides (by total kJ) — bounds the raw-stream load."""
    longest = sorted(
        [r for r in rows if r.total_kj is not None],
        key=lambda r: r.total_kj,
        reverse=True,
    )[:5]
    if not longest:
        return None
    ids = [r.activity_id for r in longest]
    res = await db.execute(
        select(ActivityStream.activity_id, ActivityStream.streams).where(
            ActivityStream.user_id == user_id,
            ActivityStream.activity_id.in_(ids),
        )
    )
    drops: list[float] = []
    for _aid, streams in res.all():
        power = (streams or {}).get("power") or []
        d = durability_drop(power, window_s=300, threshold_kj=1500)
        if d is not None:
            drops.append(d.drop_pct)
    return round(min(drops), 1) if drops else None


async def _recent_balance(db: AsyncSession, user_id: int, rows, started_by_id) -> float | None:
    """Average left-leg pedal balance (%) from the 3 most recent rides that
    carry a right_balance channel. None when no ride recorded pedal balance."""
    dated = sorted(
        [r for r in rows if r.activity_id in started_by_id],
        key=lambda r: started_by_id[r.activity_id],
        reverse=True,
    )
    ids = [r.activity_id for r in dated[:12]]  # look at recent rides only
    if not ids:
        return None
    res = await db.execute(
        select(ActivityStream.streams).where(
            ActivityStream.user_id == user_id,
            ActivityStream.activity_id.in_(ids),
        )
    )
    lefts: list[float] = []
    for (streams,) in res.all():
        rb = (streams or {}).get("right_balance") or []
        vals = [float(x) for x in rb if x is not None and 0 < float(x) < 100]
        if vals:
            avg_right = sum(vals) / len(vals)
            lefts.append(100.0 - avg_right)
        if len(lefts) >= 3:
            break
    return round(sum(lefts) / len(lefts), 1) if lefts else None
