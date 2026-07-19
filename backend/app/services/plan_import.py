"""Plan import — extract the athlete's OWN training plan from an uploaded
PDF/image via Claude vision, then adapt it to the athlete deterministically.

Design invariants (mirror weekly_plan_llm / coach_service):
    - The LLM only EXTRACTS, it never prescribes. Its output is untrusted:
      ``sanitize_extracted_plan`` validates every field, clamps durations to
      10–480 min, and caps the plan at 16 weeks.
    - Adaptation is deterministic, rails-style (``adapt_plan``): intensity text
      is mapped onto our zones with regex heuristics, plan-week hours are
      proportionally squeezed into ``weekly_hours_available``, athletes aged
      50+ get at most 2 hard (zone >= 4) days per week, and target watts /
      run paces are derived server-side from FTP / threshold pace — never
      taken from the model.
    - App MUST boot and the pure functions MUST work without an
      ANTHROPIC_API_KEY; only ``extract_plan_from_file`` needs one (the API
      layer 503s when it is absent).
    - HONESTY: when the athlete has no FTP / threshold pace we return None
      targets — nothing is fabricated.
"""
from __future__ import annotations

import base64
import logging
import re
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.planned_workout import PlannedWorkout

logger = logging.getLogger(__name__)

# ── Limits (defensive clamps on untrusted LLM / client payloads) ─────────────
MAX_WEEKS = 16
MIN_DURATION_MIN = 10
MAX_DURATION_MIN = 480
MASTERS_AGE = 50           # age >= 50 → masters hard-day cap
MAX_HARD_DAYS_MASTERS = 2  # max zone>=4 days per week for masters athletes
HARD_ZONE = 4              # zone >= HARD_ZONE counts as a "hard" day

BLOCKS_SOURCE = "user_plan"

# ── Zone table (Coggan power zones; zone 0 = rest) ───────────────────────────
# low/high are fractions of FTP for bike targets.
ZONES: dict[int, dict[str, Any]] = {
    0: {"label": "Rest", "label_de": "Ruhetag", "low_pct": None, "high_pct": None},
    1: {"label": "Recovery", "label_de": "Erholung", "low_pct": 0.45, "high_pct": 0.55},
    2: {"label": "Endurance", "label_de": "Grundlage", "low_pct": 0.56, "high_pct": 0.75},
    3: {"label": "Tempo / Sweet Spot", "label_de": "Tempo / Sweet Spot", "low_pct": 0.76, "high_pct": 0.90},
    4: {"label": "Threshold", "label_de": "Schwelle", "low_pct": 0.91, "high_pct": 1.05},
    5: {"label": "VO2max", "label_de": "VO2max", "low_pct": 1.06, "high_pct": 1.20},
    6: {"label": "Anaerobic", "label_de": "Anaerob", "low_pct": 1.21, "high_pct": 1.50},
}

# Run zones as fractions of threshold SPEED (running_threshold_pace_ms is m/s).
_RUN_SPEED_PCT: dict[int, tuple[float, float]] = {
    1: (0.68, 0.78),
    2: (0.78, 0.88),
    3: (0.88, 0.95),
    4: (0.95, 1.02),
    5: (1.02, 1.10),
    6: (1.10, 1.20),
}

# ── Intensity → zone regex heuristics (ordered, first match wins) ────────────
# Ordered rest-first, then DESCENDING intensity: interval sessions routinely
# mention their recovery portions ("2x20 FTP, 10min recovery"), so the work
# keywords must win over "recovery"/"easy" mentions.
_ZONE_PATTERNS: list[tuple[int, re.Pattern[str]]] = [
    (0, re.compile(r"\b(rest|off day|day off|ruhetag|ruhe|frei|pause)\b", re.I)),
    (6, re.compile(r"(sprint|anaerobic|anaerob|neuromusc|\bz\s?6\b|zone\s?6)", re.I)),
    (5, re.compile(r"(vo2|vo₂|hiit|\bz\s?5\b|zone\s?5)", re.I)),
    (3, re.compile(r"(sweet\s?spot|\bsst\b|süßer punkt)", re.I)),
    (4, re.compile(r"(threshold|\bftp\b|schwelle|over.?under|lactate|\blt2?\b|\bz\s?4\b|zone\s?4)", re.I)),
    (3, re.compile(r"(tempo|\bga\s?2\b|\bz\s?3\b|zone\s?3)", re.I)),
    (1, re.compile(r"(active recovery|recovery|regeneration|rekom|easy spin|ausfahrt locker)", re.I)),
    (2, re.compile(r"(endurance|easy|long|base|grundlage\w*|\bga\s?1\b|\bz\s?2\b|zone\s?2|aerobic|steady|locker)", re.I)),
]

_SPORT_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("running", re.compile(r"(run|jog|lauf|treadmill)", re.I)),
    ("gym", re.compile(r"(gym|strength|weights|kraft|core|lift)", re.I)),
    ("swimming", re.compile(r"(swim|schwimm)", re.I)),
    ("cycling", re.compile(r"(bike|ride|cycl|rad|spin|trainer|zwift|velo)", re.I)),
]


def _match_zone(text: str) -> int | None:
    for zone, pattern in _ZONE_PATTERNS:
        if pattern.search(text):
            return zone
    return None


def map_intensity_to_zone(intensity: str, title: str = "", structure: str = "") -> int:
    """Map free intensity text (plus title/structure context) onto our zones.

    intensity + title are authoritative; the interval structure is only a
    FALLBACK (it describes recovery portions too and would misclassify).
    Returns 0 for rest, 1–6 for training zones. Unknown text defaults to
    zone 2 (endurance) — the safest assumption for an unrecognized session.
    """
    primary = " ".join(t for t in (intensity, title) if t)
    zone = _match_zone(primary) if primary else None
    if zone is None and structure:
        zone = _match_zone(structure)
    return zone if zone is not None else 2


def _normalize_sport(sport: Any, title: str = "", intensity: str = "") -> str:
    """Normalize the extracted sport onto our sport strings (default cycling)."""
    text = " ".join(t for t in ((sport if isinstance(sport, str) else ""), title, intensity) if t)
    for name, pattern in _SPORT_PATTERNS:
        if pattern.search(text):
            return name
    return "cycling"


def _age_years(dob: str | None, today: date | None = None) -> int | None:
    if not dob or not isinstance(dob, str):
        return None
    try:
        parsed = date.fromisoformat(dob[:10])
    except Exception:
        return None
    ref = today or date.today()
    years = ref.year - parsed.year
    if (ref.month, ref.day) < (parsed.month, parsed.day):
        years -= 1
    return max(10, years)


def _clamp_duration(value: Any) -> int | None:
    try:
        minutes = int(round(float(value)))
    except (TypeError, ValueError):
        return None
    return max(MIN_DURATION_MIN, min(MAX_DURATION_MIN, minutes))


# ── 1. Sanitize the raw (untrusted) extraction ───────────────────────────────

def sanitize_extracted_plan(raw: Any) -> dict:
    """Validate + clamp the LLM extraction. Never trusts a single field.

    Returns ``{"plan_name": str | None, "weeks": [{"week_number", "days"}]}``
    where each day carries dow / sport / title / duration_min / intensity /
    structure. Invalid weeks/days are dropped, durations clamped to
    10–480 min, at most 16 weeks and one entry per weekday.
    """
    plan_name: str | None = None
    if isinstance(raw, dict) and isinstance(raw.get("plan_name"), str):
        plan_name = raw["plan_name"].strip()[:120] or None

    weeks_in = raw.get("weeks") if isinstance(raw, dict) else None
    weeks_out: list[dict] = []
    if not isinstance(weeks_in, list):
        return {"plan_name": plan_name, "weeks": []}

    for week in weeks_in:
        if len(weeks_out) >= MAX_WEEKS:
            break
        if not isinstance(week, dict) or not isinstance(week.get("days"), list):
            continue
        seen_dows: set[int] = set()
        days_out: list[dict] = []
        for day in week["days"][:14]:  # tolerate junk but never loop unbounded
            if not isinstance(day, dict):
                continue
            try:
                dow = int(day.get("dow"))
            except (TypeError, ValueError):
                continue
            if dow < 0 or dow > 6 or dow in seen_dows:
                continue
            title = day.get("title")
            title = title.strip()[:200] if isinstance(title, str) else ""
            intensity = day.get("intensity")
            intensity = intensity.strip()[:300] if isinstance(intensity, str) else ""
            structure = day.get("structure")
            structure = structure.strip()[:500] if isinstance(structure, str) and structure.strip() else None
            if not title and not intensity:
                continue
            seen_dows.add(dow)
            days_out.append({
                "dow": dow,
                "sport": _normalize_sport(day.get("sport"), title, intensity),
                "title": title or intensity[:80],
                "duration_min": _clamp_duration(day.get("duration_min")),
                "intensity": intensity,
                "structure": structure,
            })
        if days_out:
            days_out.sort(key=lambda d: d["dow"])
            weeks_out.append({"week_number": len(weeks_out) + 1, "days": days_out})

    return {"plan_name": plan_name, "weeks": weeks_out}


# ── 2. Deterministic adaptation (the rails — no LLM involved) ────────────────

def _format_pace(sec_per_km: float) -> str:
    total = int(round(sec_per_km))
    return f"{total // 60}:{total % 60:02d}"


def _run_pace_target(zone: int, threshold_pace_ms: float | None) -> str | None:
    """min/km pace band for a run zone, from threshold speed (m/s). None-honest."""
    if not threshold_pace_ms or threshold_pace_ms <= 0:
        return None
    band = _RUN_SPEED_PCT.get(zone)
    if band is None:
        return None
    low_speed, high_speed = threshold_pace_ms * band[0], threshold_pace_ms * band[1]
    # lower speed → slower pace (bigger sec/km); show slow–fast
    return f"{_format_pace(1000 / high_speed)}–{_format_pace(1000 / low_speed)} /km"


def _bike_watts(zone: int, ftp_watts: int | None) -> tuple[int | None, int | None]:
    if not ftp_watts or ftp_watts <= 0:
        return (None, None)
    info = ZONES.get(zone) or {}
    low, high = info.get("low_pct"), info.get("high_pct")
    if low is None or high is None:
        return (None, None)
    return (int(round(ftp_watts * low)), int(round(ftp_watts * high)))


def adapt_plan(
    sanitized: dict,
    *,
    ftp_watts: int | None = None,
    weekly_hours_available: float | None = None,
    date_of_birth: str | None = None,
    running_threshold_pace_ms: float | None = None,
    today: date | None = None,
) -> dict:
    """Adapt a sanitized extraction to the athlete — pure and deterministic.

    Per week:
      1. Map each day's intensity text onto our zones.
      2. Masters rule: age >= 50 → at most 2 hard (zone >= 4) days; extra hard
         days are demoted to zone 2 endurance (duration kept).
      3. Proportional squeeze: if the plan-week's timed volume exceeds
         ``weekly_hours_available``, every timed day is scaled down
         proportionally (still clamped to 10–480 min).
      4. Attach target watts (bike, from FTP) / pace bands (run, from
         threshold pace). No FTP / pace → honest None.
    """
    age = _age_years(date_of_birth, today)
    masters = age is not None and age >= MASTERS_AGE

    weeks_out: list[dict] = []
    for week in sanitized.get("weeks", []):
        days: list[dict] = []
        for day in week.get("days", []):
            zone = map_intensity_to_zone(day.get("intensity", ""), day.get("title", ""), day.get("structure") or "")
            days.append({
                "dow": day["dow"],
                "sport": day.get("sport", "cycling"),
                "title": day.get("title", ""),
                "duration_min": day.get("duration_min"),
                "intensity_raw": day.get("intensity", ""),
                "structure": day.get("structure"),
                "zone": zone,
                "is_rest": zone == 0,
                "adjustments": [],
            })

        # Masters rule — cap hard days at 2 (keep the first two by weekday).
        if masters:
            hard_seen = 0
            for d in days:
                if d["zone"] >= HARD_ZONE:
                    hard_seen += 1
                    if hard_seen > MAX_HARD_DAYS_MASTERS:
                        d["zone"] = 2
                        # structured so the client can localize the copy
                        d["adjustments"].append({
                            "type": "masters_hard_day_eased",
                            "age": age,
                            "max_hard_days": MAX_HARD_DAYS_MASTERS,
                        })

        # Proportional squeeze into weekly availability.
        timed_min = sum(d["duration_min"] for d in days if not d["is_rest"] and d["duration_min"])
        scale = 1.0
        if weekly_hours_available and weekly_hours_available > 0 and timed_min > 0:
            available_min = weekly_hours_available * 60.0
            if timed_min > available_min:
                scale = available_min / timed_min
                for d in days:
                    if d["is_rest"] or not d["duration_min"]:
                        continue
                    new_min = max(MIN_DURATION_MIN, min(MAX_DURATION_MIN, int(round(d["duration_min"] * scale))))
                    if new_min != d["duration_min"]:
                        d["adjustments"].append({
                            "type": "squeezed_to_availability",
                            "from_min": d["duration_min"],
                            "weekly_hours_available": weekly_hours_available,
                        })
                        d["duration_min"] = new_min

        # Attach zone labels + server-derived targets.
        for d in days:
            info = ZONES.get(d["zone"], ZONES[2])
            d["zone_label"] = info["label"]
            d["zone_label_de"] = info["label_de"]
            low_w, high_w = (None, None)
            pace = None
            if not d["is_rest"]:
                if d["sport"] == "cycling":
                    low_w, high_w = _bike_watts(d["zone"], ftp_watts)
                elif d["sport"] == "running":
                    pace = _run_pace_target(d["zone"], running_threshold_pace_ms)
            d["target_watts_low"] = low_w
            d["target_watts_high"] = high_w
            d["target_pace"] = pace

        weeks_out.append({
            "week_number": week.get("week_number", len(weeks_out) + 1),
            "days": days,
            "planned_minutes": sum(d["duration_min"] for d in days if not d["is_rest"] and d["duration_min"]),
            "scale_pct": int(round(scale * 100)),
        })

    return {
        "plan_name": sanitized.get("plan_name"),
        "weeks": weeks_out,
        "athlete": {
            "ftp_watts": ftp_watts if ftp_watts and ftp_watts > 0 else None,
            "weekly_hours_available": weekly_hours_available,
            "age": age,
            "masters_rule_applied": masters,
        },
    }


# ── 3. Sanitize an adapted plan echoed back by the client (for /apply) ───────

def sanitize_adapted_plan(raw: Any) -> dict:
    """Re-validate the adapted plan the client sends to /apply.

    The client payload is untrusted — only structural fields survive (dow,
    sport, title, duration, zone, intensity/structure text). Watts are NEVER
    read from the client; apply re-derives targets from the profile.
    """
    weeks_in = raw.get("weeks") if isinstance(raw, dict) else None
    weeks_out: list[dict] = []
    if not isinstance(weeks_in, list):
        return {"weeks": []}
    for week in weeks_in:
        if len(weeks_out) >= MAX_WEEKS:
            break
        if not isinstance(week, dict) or not isinstance(week.get("days"), list):
            continue
        seen_dows: set[int] = set()
        days_out: list[dict] = []
        for day in week["days"][:14]:
            if not isinstance(day, dict):
                continue
            try:
                dow = int(day.get("dow"))
            except (TypeError, ValueError):
                continue
            if dow < 0 or dow > 6 or dow in seen_dows:
                continue
            try:
                zone = int(day.get("zone"))
            except (TypeError, ValueError):
                zone = 2
            zone = max(0, min(6, zone))
            title = day.get("title")
            title = title.strip()[:200] if isinstance(title, str) else ""
            intensity = day.get("intensity_raw")
            intensity = intensity.strip()[:300] if isinstance(intensity, str) else ""
            structure = day.get("structure")
            structure = structure.strip()[:500] if isinstance(structure, str) and structure.strip() else None
            if zone != 0 and not title and not intensity:
                continue
            seen_dows.add(dow)
            days_out.append({
                "dow": dow,
                "sport": _normalize_sport(day.get("sport"), title, intensity),
                "title": title or (ZONES[zone]["label"] if zone else "Rest"),
                "duration_min": _clamp_duration(day.get("duration_min")),
                "intensity": intensity,
                "structure": structure,
                "zone": zone,
            })
        if days_out:
            days_out.sort(key=lambda d: d["dow"])
            weeks_out.append({"week_number": len(weeks_out) + 1, "days": days_out})
    return {"weeks": weeks_out}


def build_interval_structure(zone: int, duration_min: int | None, sport: str) -> dict | None:
    """Single-block interval structure with a server-derived %FTP target.

    Only cycling sessions get a power target; the pct is the zone mid-band —
    never a client- or LLM-supplied number.
    """
    if zone < 1 or zone > 6 or not duration_min:
        return None
    block: dict[str, Any] = {"duration_seconds": int(duration_min) * 60, "zone": zone}
    info = ZONES[zone]
    if sport == "cycling" and info["low_pct"] is not None:
        block["power_target_pct_ftp"] = round((info["low_pct"] + info["high_pct"]) / 2, 3)
    else:
        block["power_target_pct_ftp"] = None
    return {"intervals": [block]}


async def apply_plan(
    db: AsyncSession,
    user_id: int,
    plan: Any,
    start_monday: date,
    *,
    today: date | None = None,
) -> dict:
    """Write the adapted plan as PlannedWorkout rows (blocks_source='user_plan').

    Replaces only FUTURE rows (>= today) on the dates the plan covers; past
    dates are never touched. Rest days clear the date without inserting a row.
    Caller commits (service flushes, matching planned_workout_service).
    """
    today = today or date.today()
    sanitized = sanitize_adapted_plan(plan)
    created = 0
    replaced = 0
    for week_index, week in enumerate(sanitized["weeks"]):
        for day in week["days"]:
            target = start_monday + timedelta(days=7 * week_index + day["dow"])
            if target < today:
                continue
            existing = await db.execute(
                select(PlannedWorkout).where(
                    PlannedWorkout.user_id == user_id,
                    PlannedWorkout.date == target,
                )
            )
            for pw in existing.scalars().all():
                await db.delete(pw)
                replaced += 1
            if day["zone"] == 0:
                continue  # imported rest day — leave the date empty
            description_parts = [p for p in (day["intensity"], day["structure"]) if p]
            description_parts.append("Imported from your uploaded plan.")
            db.add(PlannedWorkout(
                user_id=user_id,
                date=target,
                sport=day["sport"],
                title=day["title"][:200],
                duration_seconds_target=day["duration_min"] * 60 if day["duration_min"] else None,
                description=" · ".join(description_parts)[:2000],
                interval_structure=build_interval_structure(day["zone"], day["duration_min"], day["sport"]),
                blocks_source=BLOCKS_SOURCE,
            ))
            created += 1
    await db.flush()
    return {"created": created, "replaced": replaced}


# ── 4. LLM extraction (Claude vision — the ONLY non-deterministic step) ──────

_EXTRACTION_SYSTEM = """You are a document extraction engine for a training app.
Extract the training plan from the provided file EXACTLY as written.

Hard rules:
- Report ONLY what the document actually contains. Never invent, infer,
  complete, improve, or prescribe anything.
- Do not adjust durations, add sessions, or fill gaps. A day that is not in
  the document is simply omitted.
- dow: 0=Monday … 6=Sunday. If the document names weekdays, map them. If a
  week lists sessions without weekdays, assign them in order starting Monday.
- duration_min: only when the document states a duration (convert hours to
  minutes). Omit when no duration is given.
- intensity: copy the document's own wording for how hard the session is
  (e.g. "2x20min @ FTP", "easy endurance", "sweet spot", "Ruhetag").
- structure: the interval structure verbatim, only if the document shows one.
- If the file does not contain a training plan, return an empty weeks array."""

EXTRACTION_TOOL = {
    "name": "record_extracted_plan",
    "description": "Record the training plan exactly as it appears in the document.",
    "input_schema": {
        "type": "object",
        "properties": {
            "plan_name": {"type": "string", "description": "The plan's title, if the document shows one."},
            "weeks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "week_number": {"type": "integer"},
                        "days": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "dow": {"type": "integer", "description": "0=Monday … 6=Sunday"},
                                    "sport": {"type": "string"},
                                    "title": {"type": "string"},
                                    "duration_min": {"type": "integer"},
                                    "intensity": {"type": "string", "description": "The document's own intensity wording."},
                                    "structure": {"type": "string", "description": "Interval structure verbatim, if shown."},
                                },
                                "required": ["dow", "title", "intensity"],
                            },
                        },
                    },
                    "required": ["days"],
                },
            },
        },
        "required": ["weeks"],
    },
}

PDF_MEDIA_TYPE = "application/pdf"
IMAGE_MEDIA_TYPES = {"image/png", "image/jpeg"}


def _get_anthropic_client():
    """Lazy client factory — patchable in tests, lazy so import needs no key."""
    import anthropic

    return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


def _extract_tool_use(message: Any, tool_name: str) -> dict | None:
    """Find the named tool_use block in a Claude message (SDK obj or dict)."""
    content = getattr(message, "content", None) or []
    for block in content:
        block_type = getattr(block, "type", None) or (isinstance(block, dict) and block.get("type"))
        if block_type != "tool_use":
            continue
        name = getattr(block, "name", None) or (isinstance(block, dict) and block.get("name"))
        if name != tool_name:
            continue
        inp = getattr(block, "input", None) or (isinstance(block, dict) and block.get("input"))
        if isinstance(inp, dict):
            return inp
    return None


async def extract_plan_from_file(data: bytes, media_type: str) -> dict | None:
    """Extract the raw plan JSON from a PDF or image via Claude vision.

    Returns the (still-untrusted) tool payload, or None on missing key / any
    failure — the caller decides how to surface that. NEVER raises.
    """
    if not settings.ANTHROPIC_API_KEY:
        logger.info("ANTHROPIC_API_KEY not set — plan import extraction unavailable")
        return None
    try:
        b64 = base64.standard_b64encode(data).decode("utf-8")
        if media_type == PDF_MEDIA_TYPE:
            file_block: dict[str, Any] = {
                "type": "document",
                "source": {"type": "base64", "media_type": PDF_MEDIA_TYPE, "data": b64},
            }
        else:
            file_block = {
                "type": "image",
                "source": {"type": "base64", "media_type": media_type, "data": b64},
            }
        client = _get_anthropic_client()
        response = await client.messages.create(
            model=settings.COACH_MODEL,
            max_tokens=8192,
            system=_EXTRACTION_SYSTEM,
            tools=[EXTRACTION_TOOL],
            tool_choice={"type": "tool", "name": "record_extracted_plan"},
            messages=[{
                "role": "user",
                "content": [
                    file_block,
                    {"type": "text", "text": "Extract the training plan from this file, exactly as written."},
                ],
            }],
        )
        payload = _extract_tool_use(response, "record_extracted_plan")
        if payload is None:
            logger.warning("plan import: Claude response had no record_extracted_plan tool_use")
        return payload
    except Exception as exc:  # extraction must never take the endpoint down
        logger.exception("plan import extraction failed: %s", exc)
        return None


__all__ = [
    "ZONES",
    "MAX_WEEKS",
    "MIN_DURATION_MIN",
    "MAX_DURATION_MIN",
    "map_intensity_to_zone",
    "sanitize_extracted_plan",
    "adapt_plan",
    "sanitize_adapted_plan",
    "build_interval_structure",
    "apply_plan",
    "extract_plan_from_file",
]
