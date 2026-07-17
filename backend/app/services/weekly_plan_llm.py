"""Weekly-plan LLM personalization — the creative layer over the deterministic
mesocycle skeleton.

The mesocycle generator (`mesocycle_generator.build_week_drafts`) produces a
SAFE 7-day skeleton: real rest days, a weekly-TSS cap, varied templates. This
module lets Claude PERSONALIZE that skeleton — pick the specific template per
non-rest day (from a whitelist), fine-tune duration, and write individual
per-day rationale + a personalized weekly narrative that references the
athlete's real situation.

Design invariants (mirror coach_service):
    - App/endpoint MUST work with no ANTHROPIC_API_KEY. `personalize_week`
      returns None on missing key OR any failure; the caller then keeps the
      deterministic skeleton unchanged.
    - The skeleton is the RAIL. `enforce_week_rails` re-imposes every safety
      invariant on the LLM output SERVER-SIDE — it never trusts the model:
        * rest days stay rest (the LLM cannot add/remove a rest day)
        * every template_id must be in that day's `available_templates`
          (else fall back to the skeleton's pick)
        * per-day duration clamped to ±20% of the skeleton
        * week TSS clamped to ≤110% of the target
        * watts/zones re-derived from FTP — only %FTP template blocks ship,
          the LLM never supplies numbers
    - Respect the existing ED safety blocklist on all generated prose.

`enforce_week_rails` is a pure function (no I/O, no LLM) so it is fully unit
testable without a key.
"""
from __future__ import annotations

import logging
from typing import Any

from app.config import settings
from app.services.coach_prompt import (
    WEEK_TOOL,
    build_week_user_message,
    system_prompt_for_week,
)
from app.services.safety_rails import scan_nutrition_advice
from app.services.workout_templates import (
    TEMPLATES,
    get_template,
    parametrize_template,
    prescribed_workout_to_dict,
)

logger = logging.getLogger(__name__)

# Per-day duration may drift ±20% from the skeleton before we clamp it.
_DURATION_TOLERANCE = 0.20
# The week's total TSS may exceed the target by at most 10%.
_WEEK_TSS_CAP = 1.10


def _template_default_minutes(template_id: str) -> int:
    tpl = get_template(template_id)
    if tpl is None:
        return 60
    return int(round(sum(b.duration_s for b in tpl.blocks) / 60)) or 60


def _intervals_from_prescribed(prescribed: dict) -> list[dict]:
    """Project a prescribed-workout dict onto the /weeks IntervalBlockOut shape
    (duration_seconds / power_target_pct_ftp / zone). Watts are intentionally
    dropped here — the week view is %FTP-relative, so nothing the LLM said
    about wattage survives.
    """
    out: list[dict] = []
    for b in prescribed.get("blocks", []):
        out.append({
            "duration_seconds": int(b.get("duration_s", 0)),
            "power_target_pct_ftp": b.get("target_pct_ftp"),
            "zone": int(b.get("zone", 1)),
        })
    return out


def _materialize_day(
    template_id: str,
    ftp: int,
    duration_minutes: int | None,
) -> dict:
    """Re-derive a day's numbers from the template + FTP, honouring a clamped
    duration nudge. Returns category / target_tss / duration_seconds / intervals
    — all server-authoritative, never from the LLM.
    """
    template = get_template(template_id) or TEMPLATES["z2_endurance_60"]
    default_minutes = _template_default_minutes(template.id)

    duration_scale = 1.0
    if duration_minutes and duration_minutes > 0 and default_minutes > 0:
        raw = duration_minutes / default_minutes
        # ±20% around the skeleton default (parametrize_template re-clamps the
        # upper bound to 1.15 as a second safety net).
        duration_scale = max(1.0 - _DURATION_TOLERANCE, min(1.0 + _DURATION_TOLERANCE, raw))

    if template.category == "rest" or ftp <= 0:
        intervals = [
            {
                "duration_seconds": b.duration_s,
                "power_target_pct_ftp": b.target_pct_ftp,
                "zone": b.zone,
            }
            for b in template.blocks
        ]
        return {
            "template_id": template.id,
            "category": template.category,
            "target_tss": int(round(template.base_tss)),
            "duration_seconds_target": sum(b.duration_s for b in template.blocks) or None,
            "intervals": intervals,
        }

    prescribed = prescribed_workout_to_dict(
        parametrize_template(template, int(ftp), duration_scale=duration_scale)
    )
    return {
        "template_id": template.id,
        "category": template.category,
        "target_tss": int(round(prescribed.get("predicted_tss") or template.base_tss)),
        "duration_seconds_target": int(prescribed.get("total_duration_s") or 0) or None,
        "intervals": _intervals_from_prescribed(prescribed),
    }


def _clean_prose(text: Any, fallback: str) -> str:
    """Trim + run the ED blocklist. If the model slipped restriction-adjacent
    language into a narrative/rationale, drop that field to the safe fallback.
    """
    if not isinstance(text, str) or not text.strip():
        return fallback
    if scan_nutrition_advice(text):
        return fallback
    return text.strip()


def enforce_week_rails(
    skeleton: list[dict],
    llm_payload: dict,
    *,
    ftp: int,
    weekly_tss_target: int,
    language: str = "simple",
) -> dict:
    """Re-impose every safety rail on the LLM's personalized week, SERVER-SIDE.

    Returns ``{"preface": str, "days": [ ... ]}`` where each day carries
    template_id / title / rationale / category / target_tss /
    duration_seconds_target / intervals / is_rest / dow / date — ready for the
    endpoint to stamp onto its DayPlan objects.

    Pure function: no LLM, no DB, no key required. This is where the RAIL wins
    over anything the model tried to do.
    """
    llm_days = llm_payload.get("days") if isinstance(llm_payload, dict) else None
    llm_by_dow: dict[int, dict] = {}
    if isinstance(llm_days, list):
        for entry in llm_days:
            if isinstance(entry, dict) and isinstance(entry.get("dow"), int):
                llm_by_dow.setdefault(entry["dow"], entry)

    resolved_days: list[dict] = []
    for sk in skeleton:
        dow = sk["dow"]
        llm_day = llm_by_dow.get(dow, {})
        is_rest = bool(sk.get("is_rest"))

        # ── Rail 1: rest days stay rest. A training day can never become rest. ──
        if is_rest:
            chosen_id = "rest_day"
        else:
            candidate = str(llm_day.get("template_id") or "").strip()
            allowed = set(sk.get("available_templates") or [])
            # Rail 2: template_id must be one this day offered; the LLM may not
            # rest a training day (rest_day is never in a training day's list).
            if candidate in allowed and candidate in TEMPLATES:
                chosen_id = candidate
            else:
                chosen_id = sk.get("template_id") or "z2_endurance_60"

        # Rail 3: duration nudge (±20%) — only meaningful for training days.
        duration_hint = llm_day.get("duration_minutes")
        try:
            duration_hint = int(duration_hint) if duration_hint is not None else None
        except (TypeError, ValueError):
            duration_hint = None
        if is_rest:
            duration_hint = None

        # Rail 5: re-derive everything (watts/zones/tss) from FTP + template.
        material = _materialize_day(chosen_id, ftp, duration_hint)

        # Title + rationale are the LLM's to personalize (scrubbed for safety);
        # fall back to the skeleton's deterministic copy when missing/unsafe.
        title = _clean_prose(
            llm_day.get("title"),
            sk.get("title") or get_template(material["template_id"]).name,  # type: ignore[union-attr]
        )
        rationale = _clean_prose(
            llm_day.get("rationale"),
            sk.get("rationale") or "",
        )

        resolved_days.append({
            "dow": dow,
            "date": sk.get("date"),
            "is_today": sk.get("is_today", False),
            "is_rest": is_rest,
            "title": title,
            "rationale": rationale,
            **material,
        })

    # ── Rail 4: clamp the week's total TSS to ≤110% of target. ──────────────
    if weekly_tss_target and weekly_tss_target > 0:
        cap = weekly_tss_target * _WEEK_TSS_CAP
        total = sum(int(d.get("target_tss") or 0) for d in resolved_days)
        if total > cap:
            scale = max(0.5, cap / total) if total > 0 else 1.0
            for d in resolved_days:
                if d.get("is_rest") or not d.get("duration_seconds_target"):
                    continue
                # Re-materialize the day at a shorter duration so the week lands
                # under cap. Watts stay FTP-derived; only minutes shrink.
                cur_min = int(round((d["duration_seconds_target"] or 0) / 60))
                new_min = max(20, int(round(cur_min * scale)))
                material = _materialize_day(d["template_id"], ftp, new_min)
                d.update(material)

    preface = _clean_prose(
        llm_payload.get("weekly_narrative") if isinstance(llm_payload, dict) else None,
        "",
    )
    return {"preface": preface, "days": resolved_days}


def _extract_week_tool_use(message: Any) -> dict | None:
    """Find the `personalize_week` tool_use block in a Claude message."""
    content = getattr(message, "content", None) or []
    for block in content:
        block_type = getattr(block, "type", None) or (isinstance(block, dict) and block.get("type"))
        if block_type == "tool_use":
            name = getattr(block, "name", None) or (isinstance(block, dict) and block.get("name"))
            if name == "personalize_week":
                inp = getattr(block, "input", None) or (isinstance(block, dict) and block.get("input"))
                if isinstance(inp, dict):
                    return inp
    return None


async def personalize_week(
    skeleton: list[dict],
    snapshot: dict,
    *,
    language: str = "simple",
    locale: str = "en",
    weekly_tss_target: int = 0,
) -> dict | None:
    """LLM-personalize the deterministic week skeleton.

    Returns the rail-enforced ``{"preface", "days", "model_used"}`` dict on
    success, or ``None`` on missing key / any failure — in which case the
    caller keeps the deterministic skeleton untouched.

    NEVER raises: every failure path returns None so the /weeks response can
    always fall back safely.
    """
    if not settings.ANTHROPIC_API_KEY:
        logger.info("ANTHROPIC_API_KEY not set — weekly plan stays deterministic")
        return None

    ftp = int((snapshot.get("athlete", {}) or {}).get("ftp") or 0)

    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        snapshot = {**snapshot, "language": language, "weekly_tss_target": weekly_tss_target}

        system_blocks = [
            {
                "type": "text",
                "text": system_prompt_for_week(language, locale=locale),  # type: ignore[arg-type]
                "cache_control": {"type": "ephemeral"},
            }
        ]
        user_message = build_week_user_message(skeleton, snapshot)

        response = await client.messages.create(
            model=settings.COACH_MODEL,
            max_tokens=2048,
            system=system_blocks,
            tools=[WEEK_TOOL],
            tool_choice={"type": "tool", "name": "personalize_week"},
            messages=[{"role": "user", "content": user_message}],
        )

        payload = _extract_week_tool_use(response)
        if payload is None:
            logger.warning("Claude week response had no personalize_week tool_use — falling back")
            return None

        enforced = enforce_week_rails(
            skeleton,
            payload,
            ftp=ftp,
            weekly_tss_target=weekly_tss_target,
            language=language,
        )
        enforced["model_used"] = settings.COACH_MODEL
        return enforced
    except Exception as exc:  # never break the /weeks response
        logger.exception("weekly plan personalization failed, falling back: %s", exc)
        return None


__all__ = [
    "WEEK_TOOL",
    "personalize_week",
    "enforce_week_rails",
]
