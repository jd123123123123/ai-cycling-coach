"""Recording what the engine decided, and what it decided from.

See `models/engine_decision.py` for why this exists. In short: the audit's
central finding was that nothing in the adaptation engine has ever been tested
against an outcome, and that study cannot be run on data nobody kept.

Two halves, deliberately separated:

  * `build_record` is PURE. It takes the objects the engine already has and
    returns the row's fields. Everything worth asserting about the instrument
    is asserted against this function, with no database in the way.
  * `log_decision` writes. It is best-effort and swallows its own failures: an
    instrument that can break the thing it measures is worse than no
    instrument. A rider must never see an error because a research table was
    unavailable.
"""
from __future__ import annotations

import logging
from dataclasses import asdict, is_dataclass
from datetime import date
from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.engine_decision import EngineDecision

logger = logging.getLogger(__name__)

#: BUMP THIS WHENEVER THE DECISION RULES CHANGE.
#:
#: A cohort that mixes days produced by different rules is not a cohort, and
#: the mixing is invisible after the fact unless it was stamped at write time.
#:
#: v1 — first logged version. Engine state at 2026-08-25: single `hrv_state`
#:      estimator with a de-nested baseline, ACWR descriptive-only (removed
#:      from the safety rails and from the readiness composite), decoupling
#:      matched on ride work, readiness composite reweighted to
#:      hrv .28 / tsb .28 / sleep .24 / rhr .12 / body_battery .08.
ENGINE_VERSION = "v1"


def _num(value: Any) -> float | None:
    """A float, or None. Never a string, never NaN dressed as a number."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if f == f else None  # NaN != NaN


def build_record(
    *,
    user_id: int,
    day: date,
    directive: Any | None,
    readiness: Any | None,
    hrv: Any | None,
    tsb: float | None = None,
    ctl: float | None = None,
    atl: float | None = None,
    sleep_score: float | None = None,
    decoupling_delta: float | None = None,
    push_intensity: str | None = None,
) -> dict:
    """The row, as a plain dict. Pure — every argument is optional because the
    engine legitimately runs with pieces missing, and a partial record is worth
    far more than no record.

    `hrv` is an `HrvState`; `directive` a `Directive`; `readiness` whatever the
    daily decision carries (it needs only `.score` / `.tier`). They are read
    with `getattr` rather than typed imports so this module never becomes a
    reason those three cannot change shape.
    """
    evidence: dict[str, Any] = {}

    # ── HRV: both verdicts, and how much they rest on ────────────────────
    if hrv is not None:
        evidence["hrv"] = {
            "state": getattr(hrv, "state", None),
            "ln_recent": _num(getattr(hrv, "ln_recent", None)),
            "ln_baseline": _num(getattr(hrv, "ln_baseline", None)),
            "baseline_sd": _num(getattr(hrv, "baseline_sd", None)),
            "se_recent": _num(getattr(hrv, "se_recent", None)),
            # The variance-correct statistic, stored beside the convention
            # verdict so §4.2 becomes a query instead of an argument.
            "z_mean": _num(getattr(hrv, "z_mean", None)),
            "n_recent": getattr(hrv, "n_recent", None),
            "n_baseline": getattr(hrv, "n_baseline", None),
            "below_days": getattr(hrv, "below_days", None),
            "delta_pct": _num(getattr(hrv, "delta_pct", None)),
            "cv_pct": _num(getattr(hrv, "cv_pct", None)),
            "age_days": getattr(hrv, "age_days", None),
        }

    # ── Load ─────────────────────────────────────────────────────────────
    evidence["load"] = {
        "tsb": _num(tsb),
        "ctl": _num(ctl),
        "atl": _num(atl),
        # Stored because it is DESCRIPTIVE now and a study may still want it —
        # not because anything gates on it.
        "acwr": _num(atl / ctl) if _num(ctl) not in (None, 0.0) and _num(atl) is not None else None,
    }

    evidence["other"] = {
        "sleep_score": _num(sleep_score),
        "decoupling_delta": _num(decoupling_delta),
    }

    # ── Readiness, with its own coverage ─────────────────────────────────
    if readiness is not None:
        evidence["readiness"] = {
            "score": getattr(readiness, "score", None) or getattr(readiness, "overall", None),
            "tier": getattr(readiness, "tier", None) or getattr(readiness, "ceiling", None),
            "coverage": _num(getattr(readiness, "coverage", None)),
            "confidence": getattr(readiness, "confidence", None),
        }

    # ── What the engine actually said ────────────────────────────────────
    signals = getattr(directive, "signals", None) or []
    if signals:
        evidence["signals"] = [
            {
                "evidence": getattr(s, "evidence", None),
                "tone": getattr(s, "tone", None),
            }
            for s in signals
        ]

    readiness_score = None
    readiness_tier = None
    if readiness is not None:
        readiness_score = getattr(readiness, "score", None)
        if readiness_score is None:
            readiness_score = getattr(readiness, "overall", None)
        readiness_tier = getattr(readiness, "tier", None) or getattr(readiness, "ceiling", None)

    return {
        "user_id": user_id,
        "date": day,
        "engine_version": ENGINE_VERSION,
        "directive": getattr(directive, "directive", None),
        "intensity_ceiling": getattr(directive, "intensity_ceiling", None),
        "volume_modifier": _num(getattr(directive, "volume_modifier", None)),
        "hrv_state": getattr(directive, "hrv_state", None) or getattr(hrv, "state", None),
        "readiness_score": int(readiness_score) if readiness_score is not None else None,
        "readiness_tier": readiness_tier,
        "push_intensity": push_intensity,
        "evidence": evidence,
    }


async def log_decision(db: AsyncSession, record: dict) -> bool:
    """Upsert one athlete-day. Returns True when the row was written.

    BEST-EFFORT BY DESIGN. Every failure is swallowed and logged: this table
    exists to study the engine, and an instrument that can break the thing it
    measures is worse than no instrument. The caller's decision must render
    whether or not research data was captured.
    """
    try:
        stmt = pg_insert(EngineDecision).values(**record)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_engine_decisions_user_date",
            set_={
                k: stmt.excluded[k]
                for k in record
                if k not in ("user_id", "date")
            },
        )
        await db.execute(stmt)
        await db.commit()
        return True
    except Exception:  # pragma: no cover — instrumentation never raises
        logger.exception(
            "decision_log: could not record engine decision (user_id=%s)",
            record.get("user_id"),
        )
        try:
            await db.rollback()
        except Exception:
            pass
        return False


def _as_dict(obj: Any) -> dict:
    """Small helper for callers holding dataclasses."""
    return asdict(obj) if is_dataclass(obj) else dict(obj or {})
