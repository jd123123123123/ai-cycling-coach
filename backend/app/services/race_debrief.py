"""Race Debrief orchestrator — compose the Phase-1 analyzers into one report.

`assemble_debrief` is pure (plain activity/stream/profile inputs → RaceDebrief):
it runs every analyzer in its own try/except so one failure never sinks the
report, builds the header/story/blocks, and derives a rule-based grade, verdict,
and plan. `build_debrief`/`get_or_build_debrief` add the DB load + read-through
cache, mirroring period_report.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.models.athlete_profile import AthleteProfile
from app.models.race_debrief_cache import RaceDebriefCache
from app.schemas.race_debrief import RaceDebrief
from app.services import (
    cda_estimate, climbing_analysis, effort_matching, efficiency_metrics,
    fueling_analysis, key_moments, matchbook, pacing_analysis, quadrant_analysis,
    ride_segmentation, wko_power_model,
)
from app.services.athlete_power_profile import build_sanitized_envelope
from app.services.environment import air_density
from app.services.training_load import calculate_np
from app.services.w_balance import w_prime_balance

logger = logging.getLogger(__name__)

DEBRIEF_TTL_HOURS = 24 * 30  # a ride's analysis is stable; long TTL
# Note: efforts[].is_pr is computed at build time against the athlete's whole-history
# MMP envelope, but with a 30-day TTL a later ride could silently supersede a PR and
# we'd keep celebrating it. So `get_or_build_debrief` re-evaluates each effort's is_pr
# on READ against the CURRENT envelope (a cheap single-column scan + dict aggregation)
# before returning a cached report — see _refresh_pr_flags.
_STORY_MAX_POINTS = 600

_VERDICT_SYSTEM = (
    "You are a pro cycling coach writing a race debrief. In 2–3 sentences, give a "
    "candid verdict on how the ride was executed, referencing the athlete's real "
    "numbers. Be specific and encouraging but honest. Do not invent numbers."
)
_VERDICT_SYSTEM_DE = (
    "Du bist ein Profi-Radsport-Coach und schreibst ein Renn-Debrief. Gib in 2–3 "
    "Sätzen ein ehrliches Urteil dazu ab, wie die Fahrt umgesetzt wurde, und beziehe "
    "dich auf die echten Zahlen des Athleten. Sei konkret, ermutigend, aber ehrlich. "
    "Erfinde keine Zahlen. Antworte auf Deutsch, in der Du-Form."
)


async def _ai_verdict(report: RaceDebrief, lang: str = "en") -> tuple[str, str]:
    de = lang == "de"
    fallback = report.verdict.ai_verdict
    if not settings.ANTHROPIC_API_KEY:
        return fallback, "rule-based-fallback"
    p = report.pacing
    msg = (
        f"Grade: {report.verdict.grade_letter} ({report.verdict.grade_score}/100)\n"
        f"Distance {report.header.distance_km} km, {report.header.elevation_m} m climbing, "
        f"NP {report.header.np_watts} W, IF {report.header.if_}, {report.header.total_kj} kJ\n"
        f"Went well: {report.verdict.went_well}\n"
        f"Watch out: {report.verdict.watch_out}\n"
        f"Split {p.split_pct if p else 'n/a'}%, surges {p.surge_count if p else 'n/a'}\n"
    )
    try:
        # Claude (primary) → OpenAI (fallback) → the rule-based return below.
        # `thinking` is Anthropic-only (Opus adaptive); OpenAI ignores it.
        from app.services.llm_client import complete_text

        result = await complete_text(
            system=_VERDICT_SYSTEM_DE if de else _VERDICT_SYSTEM,
            user=msg,
            max_tokens=1200,
            model=settings.RACE_DEBRIEF_MODEL,
            thinking={"type": "adaptive"},
        )
        return result.text[:600], result.model
    except Exception as exc:  # noqa: BLE001
        logger.exception("Race-debrief verdict failed: %s", exc)
        return fallback, "rule-based-fallback"


def _try(label: str, fn, default=None):
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001 — one analyzer never sinks the report
        logger.warning("debrief analyzer %s failed (non-fatal): %s", label, exc)
        return default


def _downsample(series: list, max_points: int) -> list:
    n = len(series)
    if n <= max_points:
        return list(series)
    step = n / max_points
    return [series[int(i * step)] for i in range(max_points)]


def _grade_from_score(score: float) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"


def _split_story(pacing, efficiency, rode_with: int = 0) -> str:
    """Did the second half get slower because he CRACKED, or because he EASED?

    THIS EXISTS BECAUSE THE APP CALLED A REAL RIDER A QUITTER. He rode the
    second half of a long day in a group, his power dropped the way everybody's
    power drops behind four other wheels, and the debrief told him he had
    "eingebrochen" — broken. He had done nothing of the sort. He had found a
    group, which is the single most sensible thing you can do on the way home.

    POWER ALONE CANNOT TELL THE TWO APART, and that was the whole bug: a fade
    and a tow are the same line on a power graph. What separates them is the
    HEART RATE.

      · A CRACK is power down while the heart stays up. The rider is paying the
        same or more for less — that is what falling apart costs, and it shows
        as elevated aerobic decoupling.
      · EASING is power down AND heart down. Sitting in, a tailwind, a long
        descent, riding home. Nothing is wrong; less was being asked.

    So a positive split is only reported as a fade when the decoupling
    corroborates it. When the heart came down with the power, the ride is
    described and not diagnosed. And when there is no heart-rate data at all we
    say we cannot tell, because an accusation is a bad default: being wrongly
    told you blew up is far more expensive than being told nothing.

    Returns 'cracked' | 'eased' | 'unknown'.
    """
    if pacing is None:
        return "unknown"
    # WHEN WE KNOW THERE WAS SOMEBODY ELSE THERE, we do not have to infer any of
    # this. The heart-rate rule below exists because a power drop is ambiguous;
    # a companion detected on the same road at the same second removes the
    # ambiguity, and the app should not go on deducing a fact it has been told.
    # See `ride_together` — it matches on time AND space precisely so that this
    # can be trusted.
    if rode_with > 0:
        return "eased"
    drift = getattr(efficiency, "decoupling_pct", None) if efficiency is not None else None
    if drift is None:
        return "unknown"
    return "cracked" if drift > 5 else "eased"


def _rule_based_grade(pacing, efficiency, matchbook_, efforts, durability_drop, de: bool = False, rode_with: int = 0):
    """Deterministic 0–100 ride-execution score from the analyzer blocks."""
    score = 80.0
    good: list[str] = []
    bad: list[str] = []
    if pacing is not None:
        story = _split_story(pacing, efficiency, rode_with)
        if pacing.split_pct < -8 and story == "cracked":
            # Only now is it a fade: the power fell and the heart did not.
            score -= 10
            bad.append(
                "Zweite Hälfte kostete mehr und gab weniger — da war der Tank leer"
                if de else "Second half cost more and gave less — that is an empty tank"
            )
        elif pacing.split_pct < -8 and story == "eased":
            # NOT a penalty. He eased, and easing is a decision, not a failure.
            good.append(
                ("Zweite Hälfte in der Gruppe — weniger Watt für dasselbe Tempo. Genau so geht das."
                 if rode_with else
                 "Zweite Hälfte lockerer gefahren — Puls runter, Beine gespart. Clever.")
                if de else
                ("Second half in a group — fewer watts for the same speed. That is the point of it."
                 if rode_with else
                 "Took the second half easier — pulse down, legs saved. Smart.")
            )
        elif pacing.split_pct > -3:
            score += 4; good.append("Gleichmäßig eingeteilt — sauber" if de else "Evenly paced — clean")
        if pacing.variability_index and pacing.variability_index > 1.25:
            score -= 4; bad.append("Sehr antrittslastig (hohe Variabilität)" if de else "Very surgy (high variability)")
    if efficiency is not None and efficiency.decoupling_pct is not None:
        if efficiency.decoupling_pct < 5:
            score += 5; good.append("Geringe aerobe Entkopplung — gut verpflegt/eingeteilt" if de else "Low aerobic decoupling — well fuelled/paced")
        elif efficiency.decoupling_pct > 10:
            score -= 8; bad.append("Deutlicher HF-Drift spät in der Fahrt" if de else "High cardiac drift late in the ride")
    if matchbook_ is not None and matchbook_.fully_depleted:
        score -= 6; bad.append("Anaerobe Reserve komplett geleert" if de else "Emptied the anaerobic tank")
    prs = [e for e in (efforts or []) if e.is_pr]
    if prs:
        score += 6; good.append((f"{len(prs)} neue Leistungs-Rekorde" if de else f"Set {len(prs)} power PR(s)"))
    if durability_drop is not None and durability_drop > 15:
        score -= 6; bad.append("Leistung unter Ermüdung stark abgefallen" if de else "Power faded badly under fatigue")
    score = max(0.0, min(100.0, score))
    return score, good[:3], bad[:3]


def _merge_climb_gain(climbs):
    """Bridge climb fragments split by short false-flats into whole climbs, so the
    'hardest climb' the plan cites is the real pass, not a sub-segment. Returns a
    list of (elev_gain_m, avg_grade_pct); short non-climb gaps (≤90 s) are merged."""
    if not climbs:
        return []
    ordered = sorted(climbs, key=lambda c: c.start_s)
    merged = []  # each: [start_s, end_s, gain, dist]
    for c in ordered:
        end = c.start_s + c.duration_s
        if merged and c.start_s - merged[-1][1] <= 90:
            merged[-1][1] = end
            merged[-1][2] += c.elev_gain_m
            merged[-1][3] += c.distance_m
        else:
            merged.append([c.start_s, end, c.elev_gain_m, c.distance_m])
    return [(g, (g / d * 100.0) if d > 0 else 0.0) for _, _, g, d in merged]


def _build_plan(pacing, matchbook_, efficiency, fueling, durability_drop, climbs=None,
                tss: float = 0.0, total_kj: float = 0.0, de: bool = False):
    """Deterministic ranked prescriptions — one per detected problem, each with a
    concrete race tactic + training fix. Tactics reference THIS ride's own hardest
    climb so the advice is course-specific, not generic."""
    plan = []
    # Hardest climb of the day (after merging fragments) → point tactics at a real
    # place on the course.
    merged = _merge_climb_gain(climbs)
    hardest = max(merged, key=lambda m: m[0]) if merged else None
    if hardest is not None:
        h_gain, h_grade = hardest
        climb_ref = (f"am härtesten Anstieg ({round(h_grade)} %, {round(h_gain)} Hm)"
                     if de else f"on the day's hardest climb ({round(h_grade)}%, {round(h_gain)} m)")
    else:
        climb_ref = "am ersten großen Anstieg" if de else "on the first major climb"

    if matchbook_ is not None and matchbook_.fully_depleted:
        plan.append(dict(priority=len(plan) + 1,
            headline="Teile deine Körner früher ein" if de else "Ration your matches early",
            race_tactic=(f"{climb_ref[0].upper()}{climb_ref[1:]} im Windschatten bleiben; 20–25 W unter Schwelle halten statt anzutreten." if de else f"Sit in {climb_ref}; hold 20–25 W under threshold rather than attacking."),
            training_fix="VO2 40/20er ×2/Woche, um W′ (anaerobe Kapazität) zu heben." if de else "VO2 40/20s ×2/wk to raise W′ (anaerobic capacity).",
            tone="caution"))
    if fueling is not None and fueling.likely_underfueled:
        lo, hi = fueling.carb_target_g_per_h
        plan.append(dict(priority=len(plan) + 1,
            headline="Früher und mehr verpflegen" if de else "Fuel earlier and more",
            race_tactic=(f"Ab km 0 {int(lo)}–{int(hi)} g KH/h — ein Gel alle 25–30 min, nicht erst wenn der Hunger kommt." if de else f"From km 0, take {int(lo)}–{int(hi)} g carbs/h — a gel every 25–30 min, not once you feel empty."),
            training_fix="Magen-Training auf langen Fahrten mit Renn-KH-Zufuhr." if de else "Gut-training long rides at race carb intake.",
            tone="bad"))
    # HR drift late in the ride — separate, actionable item (was previously silent).
    if efficiency is not None and efficiency.decoupling_pct is not None and efficiency.decoupling_pct > 8:
        plan.append(dict(priority=len(plan) + 1,
            headline="Späten HF-Drift eindämmen" if de else "Rein in the late HR drift",
            race_tactic=(f"Erste 2 h bewusst 5–8 W unter Wohlfühl-Pace; trinken + kühlen ab der ersten Verpflegung." if de else "Ride the first 2 h a deliberate 5–8 W under comfortable pace; drink + cool from the first feed."),
            training_fix="Lange Zone-2-Fahrten (3–4 h) für aerobe Ausdauer und Fettstoffwechsel." if de else "Long Zone-2 rides (3–4 h) to build aerobic durability and fat metabolism.",
            tone="caution"))
    # THE COACHING ONLY FIRES IF HE ACTUALLY CRACKED. Handing someone a
    # "pace yourself better" plan for a ride they finished in a group is
    # correcting a mistake they did not make, and it teaches them to distrust
    # the whole screen.
    if pacing is not None and pacing.split_pct < -3 and _split_story(pacing, efficiency) != "eased":
        hard = pacing.split_pct < -8
        plan.append(dict(priority=len(plan) + 1,
            headline=("Erste Hälfte etwas ruhiger angehen" if hard else "Etwas gleichmäßiger einteilen") if de else ("Start the first half a touch calmer" if hard else "Even it out a little"),
            race_tactic=("Negativ splitten: rund 5 % leichter losfahren, als sich richtig anfühlt — die Beine danken es dir hinten raus." if de else "Negative-split it: go about 5% easier than feels right — your legs collect the interest later."),
            training_fix="Schwellenarbeit ans Ende langer Fahrten — genau da, wo es zählt." if de else "Threshold work at the end of long rides — exactly where it counts.",
            tone="caution" if hard else "neutral"))
    if durability_drop is not None and durability_drop > 15:
        plan.append(dict(priority=len(plan) + 1,
            headline="Ermüdungsresistenz aufbauen" if de else "Build fatigue resistance",
            race_tactic="Schlüssel-Efforts spät üben, auf müden Beinen." if de else "Practice key efforts late, on tired legs.",
            training_fix="Tempo-/Schwellenblöcke nach 2+ h Grundlage einbauen." if de else "Add tempo/threshold blocks after 2+ h of endurance.",
            tone="neutral"))
    if not plan:
        plan.append(dict(priority=len(plan) + 1,
            headline="Weiter so" if de else "Keep doing what works",
            race_tactic="Diese Einteilung und Verpflegung wiederholen." if de else "Repeat this pacing and fuelling.",
            training_fix="Belastung schrittweise steigern; Erholung schützen." if de else "Progress load gradually; protect recovery.",
            tone="good"))

    # Recovery / next-48h beat — always present, keyed off today's load. The schema
    # has no category field, so we prefix the headline with "Recovery/Erholung".
    # Refuel: rough glycogen replacement ≈ 25% of work as carbs (kJ→g at 4 kcal/g).
    carbs_g = round(total_kj * 0.25 / 4.0) if total_kj else 0
    if tss >= 250:
        rest = ("Morgen komplett ruhen und zusätzlichen Schlaf einplanen." if de
                else "Take a full rest day tomorrow and bank extra sleep.")
        rtone = "caution"
    elif tss >= 150:
        rest = ("Morgen locker rollen oder ruhen." if de
                else "Keep tomorrow easy or take a rest day.")
        rtone = "neutral"
    else:
        rest = ("Normale Trainingswoche — kein besonderer Erholungsbedarf." if de
                else "Carry on with your normal week — no special recovery needed.")
        rtone = "good"
    plan.append(dict(priority=len(plan) + 1,
        headline="Erholung — Auffüllen & Ruhe" if de else "Recovery — refuel & rest",
        race_tactic=(f"In den nächsten 2 h ~{carbs_g} g Kohlenhydrate auffüllen, um die Glykogenspeicher zu füllen (Reis-/Nudelmahlzeit plus Regenerationsgetränk)."
                     if de else f"Replace ~{carbs_g} g of carbs in the next 2 h to refill glycogen (a rice/pasta meal plus a recovery drink)."),
        training_fix=rest,
        tone=rtone))
    return plan


def assemble_debrief(activity, stream, profile, athlete_envelope: dict, lang: str = "en") -> RaceDebrief:
    """Pure assembler: analyzers → RaceDebrief with a rule-based verdict. See docstring."""
    de = lang == "de"
    s = stream.streams or {}
    power = [float(p) for p in (s.get("power") or []) if p is not None]
    hr = s.get("heart_rate") or []
    cadence = s.get("cadence") or []
    altitude = s.get("altitude") or []
    distance = s.get("distance") or []
    speed = s.get("speed") or []
    latitude = s.get("latitude") or []
    longitude = s.get("longitude") or []
    n = len(power)

    ftp = float(profile.ftp_watts) if profile and profile.ftp_watts else None
    mass = float(profile.weight_kg) if profile and getattr(profile, "weight_kg", None) else None
    cp = float(getattr(stream, "cp_watts", None) or 0.0)
    w_prime = float(getattr(stream, "w_prime_j", None) or 0.0)
    mmp = _try("mmp_curve", lambda: {int(k): float(v) for k, v in (stream.mmp_curve or {}).items()}, {}) or {}

    # --- analyzer blocks (each defensive) ---
    hr_clean = [float(h) for h in hr] if hr and all(h is not None for h in hr) else None
    np_watts = _try("np", lambda: calculate_np(power), 0.0) if power else 0.0

    segments = _try("segmentation", lambda: ride_segmentation.segment_ride(
        altitude, distance, power=power, speed=speed), []) or []
    climbs = _try("climbing", lambda: climbing_analysis.analyze_climbs(segments, mass), []) or []
    pacing = _try("pacing", lambda: pacing_analysis.analyze_pacing(power, ftp, hr_clean))
    efficiency = _try("efficiency", lambda: efficiency_metrics.analyze_efficiency(power, hr_clean, ftp))
    mb = _try("matchbook", lambda: matchbook.analyze_matchbook(power, cp, w_prime)) if cp > 0 and w_prime > 0 else None
    quadrant = _try("quadrant", lambda: quadrant_analysis.analyze_quadrants(power, cadence, ftp=ftp))
    fueling = _try("fueling", lambda: fueling_analysis.analyze_fueling(
        power, if_=(round(np_watts / ftp, 3) if ftp else None),
        durability_drop_pct=getattr(stream, "durability_drop_pct", None),
        decoupling_pct=(efficiency.decoupling_pct if efficiency else None), de=de))
    efforts = _try("efforts", lambda: effort_matching.match_efforts(mmp, athlete_envelope), []) or []
    wko = _try("wko", lambda: wko_power_model.fit_wko_model(mmp, mass))
    rho = _try("air_density", lambda: air_density(
        altitude[0] if altitude and altitude[0] is not None else 0.0), 1.225) or 1.225
    cda = _try("cda", lambda: cda_estimate.estimate_cda(
        power, speed, altitude, mass, air_density=rho)) if mass else None
    wbal = _try("wbal", lambda: w_prime_balance(power, cp, w_prime)) if cp > 0 and w_prime > 0 else None
    moments = _try("moments", lambda: key_moments.detect_key_moments(power, wbal, hr_clean, de=de), []) or []

    # --- header ---
    total_kj = round(sum(power) / 1000.0, 1) if power else 0.0
    if_val = round(np_watts / ftp, 3) if ftp else None
    dist_km = round((activity.distance_meters or 0.0) / 1000.0, 1)
    # Moving time & average speed. Streams are 1 Hz (one sample = one second), so a
    # sample count is a second count. When a speed stream exists, count only moving
    # samples (speed > 0.5 m/s ≈ 1.8 km/h — filters coasting/stops) as moving time
    # and average speed off those samples. With no speed stream we fall back to the
    # sample count, which is ELAPSED time (not moving), and derive avg speed from
    # the same elapsed base so the header stays internally consistent.
    speed_clean = [float(v) for v in speed if v is not None] if speed else []
    moving_speeds = [v for v in speed_clean if v > 0.5]
    if speed_clean:
        moving_time_s = len(moving_speeds)
        avg_speed_kmh = round(sum(moving_speeds) / len(moving_speeds) * 3.6, 1) if moving_speeds else 0.0
    else:
        moving_time_s = n  # no speed stream: elapsed time, not true moving time
        avg_speed_kmh = round(dist_km / (moving_time_s / 3600.0), 1) if moving_time_s > 0 and dist_km else 0.0
    header = dict(
        title=activity.title or "Race", date=activity.started_at.isoformat(),
        sport=activity.sport, distance_km=dist_km,
        # THE RIDE'S OWN RECORDED ASCENT, not a sum of derived segments.
        #
        # This was `sum(seg.elev_gain_m for seg in segments)`, and segments come
        # out of the altitude stream: a ride whose stream is missing, flat-lined
        # or too short to segment produced ZERO metres of climbing for a ride
        # that plainly climbed, and one whose segmentation split differently
        # produced a number that disagreed with every other screen in the app.
        # `activity.elevation_gain_m` is what the head unit's barometer recorded
        # and what History, the crew board and the lifetime totals all count.
        #
        # The segment sum stays as the fallback for a row that never got one —
        # better a derived figure than none — and `None` when there is neither,
        # so the frontend can print an honest dash instead of a confident 0.
        elevation_m=(
            round(float(activity.elevation_gain_m), 0)
            if activity.elevation_gain_m is not None
            else (round(sum(seg.elev_gain_m for seg in segments), 0) if segments else None)
        ),
        moving_time_s=moving_time_s, np_watts=round(np_watts, 1), if_=if_val,
        tss=float(activity.tss or 0.0), total_kj=total_kj, avg_speed_kmh=avg_speed_kmh,
    )

    # --- story (downsampled) ---
    step_idx = list(range(n))
    story = dict(
        t=_downsample(step_idx, _STORY_MAX_POINTS),
        power=_downsample(power, _STORY_MAX_POINTS),
        hr=_downsample(hr, _STORY_MAX_POINTS) if hr else [],
        wbal=_downsample(wbal, _STORY_MAX_POINTS) if wbal else [],
        altitude=_downsample(altitude, _STORY_MAX_POINTS) if altitude else [],
        speed=_downsample(speed, _STORY_MAX_POINTS) if speed else [],
        moments=[m.__dict__ for m in moments],
        # Downsample across the WHOLE course, not the first 600 fixes (which for
        # a long ride drew only the opening minutes). Keep power per point so the
        # map can be coloured by effort.
        route=_downsample(
            [{"lat": la, "lng": lo, "power": power[i] if i < n else None, "grade": None}
             for i, (la, lo) in enumerate(zip(latitude, longitude))
             if la is not None and lo is not None],
            _STORY_MAX_POINTS,
        ),
    )

    # --- verdict + plan ---
    durability_drop = getattr(stream, "durability_drop_pct", None)
    score, good, bad = _rule_based_grade(pacing, efficiency, mb, efforts, durability_drop, de)
    verdict = dict(
        grade_letter=_grade_from_score(score), grade_score=round(score, 0),
        ai_verdict=_rule_based_verdict(activity, score, good, bad, de),
        ai_model="rule-based-fallback", went_well=good, watch_out=bad,
    )
    plan = _build_plan(pacing, mb, efficiency, fueling, durability_drop, climbs,
                       tss=float(activity.tss or 0.0), total_kj=total_kj, de=de)

    return RaceDebrief(
        activity_id=activity.id, header=header, verdict=verdict, story=story, lang=lang,
        segments=[seg.__dict__ for seg in segments],
        climbs=[c.__dict__ for c in climbs],
        pacing=pacing.__dict__ if pacing else None,
        efforts=[e.__dict__ for e in efforts],
        efficiency=efficiency.__dict__ if efficiency else None,
        matchbook={**mb.__dict__, "matches": [m.__dict__ for m in mb.matches]} if mb else None,
        quadrant=quadrant.__dict__ if quadrant else None,
        fueling=fueling.__dict__ if fueling else None,
        wko=wko.__dict__ if wko else None,
        cda=cda.__dict__ if cda else None,
        plan=plan,
    )


def _rule_based_verdict(activity, score: float, good: list[str], bad: list[str], de: bool = False) -> str:
    grade = _grade_from_score(score)
    if de:
        lead = {"A": "Eine herausragende Fahrt.", "B": "Eine starke Fahrt.", "C": "Eine solide Fahrt.",
                "D": "Ein harter Tag.", "F": "Ein Tag zum Lernen."}[grade]
        win = f" Das lief gut: {good[0].lower()}." if good else ""
        fix = f" Verbesserungspotenzial: {bad[0].lower()}." if bad else ""
        return (lead + win + fix)[:600]
    lead = {"A": "A standout ride.", "B": "A strong ride.", "C": "A solid ride.",
            "D": "A tough day.", "F": "A day to learn from."}[grade]
    win = f" What worked: {good[0].lower()}." if good else ""
    fix = f" To improve: {bad[0].lower()}." if bad else ""
    return (lead + win + fix)[:600]


async def _upsert_debrief(db: AsyncSession, user_id: int, activity_id: int, report: RaceDebrief) -> None:
    now = datetime.now(timezone.utc)
    payload = report.model_dump(mode="json")
    stmt = pg_insert(RaceDebriefCache).values(
        user_id=user_id, activity_id=activity_id, report=payload, generated_at=now,
    ).on_conflict_do_update(
        index_elements=["user_id", "activity_id"],
        set_={"report": payload, "generated_at": now},
    )
    await db.execute(stmt)
    await db.commit()
    report.generated_at = now


async def build_debrief(db: AsyncSession, user_id: int, activity_id: int, lang: str = "en") -> RaceDebrief | None:
    activity = (await db.execute(
        select(Activity).where(Activity.id == activity_id))).scalars().first()
    if activity is None:
        return None
    stream = await db.get(ActivityStream, activity_id)
    if stream is None or not (stream.streams or {}).get("power"):
        return None
    profile = (await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id))).scalar_one_or_none()
    env_res = await db.execute(
        select(ActivityStream.mmp_curve).where(
            ActivityStream.user_id == user_id, ActivityStream.mmp_curve.isnot(None)))
    envelope = build_sanitized_envelope([row[0] for row in env_res.all() if row[0]])
    report = assemble_debrief(activity, stream, profile, envelope, lang)
    text, model = await _ai_verdict(report, lang)
    report.verdict.ai_verdict = text
    report.verdict.ai_model = model
    return report


async def _refresh_pr_flags(db: AsyncSession, user_id: int, report: RaceDebrief) -> None:
    """Recompute efforts[].is_pr (and best/pct) against the CURRENT MMP envelope.

    A cached PR flag reflects the athlete's best at build time; a later ride can
    supersede it. We rebuild the envelope from all stored per-ride MMP curves and
    re-run the same effort-matching used at build time, so a stale PR is demoted on
    read rather than celebrated for up to the (long) cache TTL.
    """
    if not report.efforts:
        return
    env_res = await db.execute(
        select(ActivityStream.mmp_curve).where(
            ActivityStream.user_id == user_id, ActivityStream.mmp_curve.isnot(None)))
    envelope = build_sanitized_envelope([row[0] for row in env_res.all() if row[0]])
    if not envelope:
        return
    ride_mmp = {e.duration_s: e.ride_watts for e in report.efforts}
    fresh = {m.duration_s: m for m in effort_matching.match_efforts(ride_mmp, envelope)}
    for e in report.efforts:
        m = fresh.get(e.duration_s)
        if m is not None:
            e.is_pr = m.is_pr
            e.best_watts = m.best_watts
            e.pct_of_best = m.pct_of_best


async def get_or_build_debrief(db: AsyncSession, user_id: int, activity_id: int, lang: str = "en") -> RaceDebrief | None:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=DEBRIEF_TTL_HOURS)
    row = (await db.execute(
        select(RaceDebriefCache).where(
            RaceDebriefCache.user_id == user_id,
            RaceDebriefCache.activity_id == activity_id,
            RaceDebriefCache.generated_at >= cutoff))).scalar_one_or_none()
    # Cache is keyed per (user, activity); the report carries its language so a
    # locale switch rebuilds instead of serving stale English (or vice-versa).
    if row is not None and (row.report or {}).get("lang", "en") == lang:
        try:
            report = RaceDebrief.model_validate({**row.report, "generated_at": row.generated_at})
        except ValidationError:
            logger.warning("Discarding malformed cached debrief user=%s act=%s", user_id, activity_id)
        else:
            # Re-evaluate PR flags against the current envelope before serving cache.
            await _refresh_pr_flags(db, user_id, report)
            return report
    report = await build_debrief(db, user_id, activity_id, lang)
    if report is None:
        return None
    await _upsert_debrief(db, user_id, activity_id, report)
    return report
