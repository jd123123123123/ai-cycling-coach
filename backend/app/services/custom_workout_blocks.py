"""Custom-workout block model + computation.

The in-app builder emits a list of *typed* blocks. This module is the single
source of truth for:

  · the block schema (`CustomBlock` pydantic model) and its validation
    (durations > 0, %FTP in sane bounds),
  · converting a block into the app's parametric `IntervalBlock` so that TSS
    reuses `compute_template_tss` verbatim (Σ duration_h × IF² × 100, honouring
    on/off structure), and
  · materialising a block into an absolute-watts `ResolvedBlock` at schedule /
    export time from the athlete's FTP.

Block types (Zwift-style editor):
  · warmup   — ramp UP from `from_pct` → `to_pct` over `duration_s`
  · steady   — constant `power_pct` for `duration_s`
  · interval — `reps` × (`on_s` @ `on_pct` / `off_s` @ `off_pct`)
  · ramp     — free ramp `from_pct` → `to_pct` over `duration_s`
  · freeride — no power target; `duration_s` of open riding (nominal IF for TSS)
  · cooldown — ramp DOWN from `from_pct` → `to_pct` over `duration_s`

Every block is %FTP; watts are never authored, only materialised.
"""
from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.services.workout_templates import (
    IntervalBlock,
    ResolvedBlock,
    _default_cadence_for_zone,
    _tolerance_for_zone,
    _watts_band,
    compute_template_tss,
)

BlockType = Literal["warmup", "steady", "interval", "ramp", "freeride", "cooldown"]

# %FTP guard rails. A block target below 20% or above 250% FTP is almost
# certainly a client bug (or an attempt to fabricate an impossible session);
# the builder never produces values outside this band.
MIN_PCT = 0.2
MAX_PCT = 2.5
# Free-ride blocks have no power target; we account their load at a nominal
# endurance IF so the estimate is honest-ish rather than zero.
FREERIDE_IF = 0.65
RAMP_TYPES = {"warmup", "ramp", "cooldown"}


def zone_for_pct(pct: float) -> int:
    """Coggan zone from a %FTP fraction — mirrors the frontend `zoneForPct`."""
    if pct <= 0.55:
        return 1
    if pct <= 0.75:
        return 2
    if pct <= 0.90:
        return 3
    if pct <= 1.05:
        return 4
    if pct <= 1.20:
        return 5
    if pct <= 1.50:
        return 6
    return 7


def _rpe_for_pct(pct: float) -> int:
    """Rough RPE (1-10) from %FTP for display only."""
    return max(1, min(10, int(round(pct * 8.5))))


class CustomBlock(BaseModel):
    """One authored block. Fields used depend on `type` (validated below)."""

    type: BlockType
    duration_s: int | None = Field(default=None, ge=1, le=6 * 3600)
    # steady / freeride
    power_pct: float | None = Field(default=None)
    # ramp / warmup / cooldown
    from_pct: float | None = Field(default=None)
    to_pct: float | None = Field(default=None)
    # interval
    reps: int | None = Field(default=None, ge=1, le=60)
    on_s: int | None = Field(default=None, ge=1, le=3600)
    off_s: int | None = Field(default=None, ge=1, le=3600)
    on_pct: float | None = Field(default=None)
    off_pct: float | None = Field(default=None)
    # optional cadence prescription
    cadence_low: int | None = Field(default=None, ge=30, le=140)
    cadence_high: int | None = Field(default=None, ge=30, le=140)
    name: str | None = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def _validate_shape(self) -> "CustomBlock":
        def chk_pct(v: float | None, label: str) -> None:
            if v is None:
                raise ValueError(f"{self.type} block requires {label}")
            if not (MIN_PCT <= v <= MAX_PCT):
                raise ValueError(
                    f"{label}={v} out of bounds [{MIN_PCT}, {MAX_PCT}] %FTP"
                )

        if self.type == "interval":
            if not self.reps or not self.on_s or not self.off_s:
                raise ValueError("interval block requires reps, on_s, off_s")
            chk_pct(self.on_pct, "on_pct")
            chk_pct(self.off_pct, "off_pct")
        elif self.type in RAMP_TYPES:
            chk_pct(self.from_pct, "from_pct")
            chk_pct(self.to_pct, "to_pct")
            if not self.duration_s or self.duration_s <= 0:
                raise ValueError(f"{self.type} block requires duration_s > 0")
        elif self.type == "steady":
            chk_pct(self.power_pct, "power_pct")
            if not self.duration_s or self.duration_s <= 0:
                raise ValueError("steady block requires duration_s > 0")
        elif self.type == "freeride":
            if not self.duration_s or self.duration_s <= 0:
                raise ValueError("freeride block requires duration_s > 0")
        return self

    # ── Derived helpers ───────────────────────────────────────────────────
    def total_duration_s(self) -> int:
        if self.type == "interval":
            return int(self.reps) * (int(self.on_s) + int(self.off_s))
        return int(self.duration_s or 0)

    def display_name(self) -> str:
        if self.name:
            return self.name
        return {
            "warmup": "Aufwärmen",
            "steady": "Steady",
            "interval": "Intervalle",
            "ramp": "Rampe",
            "freeride": "Freie Fahrt",
            "cooldown": "Ausfahren",
        }[self.type]


def _ramp_if(a: float, b: float) -> float:
    """Duration-weighted RMS %FTP of a linear ramp a→b (for honest TSS)."""
    return math.sqrt((a * a + a * b + b * b) / 3.0)


def block_to_interval(block: CustomBlock) -> IntervalBlock:
    """Convert an authored block into the parametric IntervalBlock used by
    `compute_template_tss`. Composite intervals carry a duration-weighted
    `tss_pct_ftp`; ramps carry the ramp RMS; steady/freeride are flat."""
    name = block.display_name()
    if block.type == "interval":
        on = float(block.on_pct)
        off = float(block.off_pct)
        on_s = int(block.on_s)
        off_s = int(block.off_s)
        # Duration-weighted sqrt-mean IF across the on/off structure.
        tss_pct = math.sqrt(
            (on_s * on * on + off_s * off * off) / (on_s + off_s)
        )
        zone = zone_for_pct(on)
        return IntervalBlock(
            name=name,
            duration_s=block.total_duration_s(),
            target_pct_ftp=on,
            target_rpe=_rpe_for_pct(on),
            zone=zone,
            tss_pct_ftp=tss_pct,
            reps=int(block.reps),
            on_s=on_s,
            off_s=off_s,
            off_pct_ftp=off,
            cadence_low=block.cadence_low,
            cadence_high=block.cadence_high,
        )
    if block.type in RAMP_TYPES:
        a = float(block.from_pct)
        b = float(block.to_pct)
        peak = max(a, b)
        return IntervalBlock(
            name=name,
            duration_s=int(block.duration_s),
            target_pct_ftp=peak,          # peak drives bar height / display
            target_rpe=_rpe_for_pct((a + b) / 2),
            zone=zone_for_pct((a + b) / 2),
            tss_pct_ftp=_ramp_if(a, b),   # honest ramp load
            cadence_low=block.cadence_low,
            cadence_high=block.cadence_high,
        )
    # steady / freeride
    pct = float(block.power_pct) if block.type == "steady" else FREERIDE_IF
    return IntervalBlock(
        name=name,
        duration_s=int(block.duration_s),
        target_pct_ftp=pct,
        target_rpe=_rpe_for_pct(pct),
        zone=zone_for_pct(pct),
        tss_pct_ftp=None if block.type == "steady" else FREERIDE_IF,
        cadence_low=block.cadence_low,
        cadence_high=block.cadence_high,
    )


def compute_tss_and_duration(blocks: list[CustomBlock]) -> tuple[float, int]:
    """(estimated_tss, estimated_duration_s) for a validated block list."""
    intervals = [block_to_interval(b) for b in blocks]
    tss = compute_template_tss(intervals)
    duration = sum(b.total_duration_s() for b in blocks)
    return tss, duration


def resolve_block(block: CustomBlock, ftp: int) -> ResolvedBlock:
    """Materialise a block into absolute watts from the athlete's FTP — used at
    schedule time (interval_structure) and for .zwo export power bounds."""
    iv = block_to_interval(block)
    tol = _tolerance_for_zone(iv.zone)
    low, high = _watts_band(ftp, iv.target_pct_ftp, tolerance_pct=tol)
    c_low, c_high = iv.cadence_low, iv.cadence_high
    if c_low is None or c_high is None:
        c_low, c_high = _default_cadence_for_zone(iv.zone)
    off_low = off_high = None
    if iv.off_pct_ftp is not None:
        off_low, off_high = _watts_band(ftp, iv.off_pct_ftp, tolerance_pct=tol)
    return ResolvedBlock(
        name=iv.name,
        duration_s=iv.duration_s,
        target_watts_low=low,
        target_watts_high=high,
        target_pct_ftp=iv.target_pct_ftp,
        zone=iv.zone,
        rpe=iv.target_rpe,
        cadence_low=c_low,
        cadence_high=c_high,
        reps=iv.reps,
        on_s=iv.on_s,
        off_s=iv.off_s,
        off_pct_ftp=iv.off_pct_ftp,
        off_watts_low=off_low,
        off_watts_high=off_high,
    )


def _xml_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def block_to_zwo(block: CustomBlock) -> str:
    """One authored block → one ZWO <workout> element. Power is a fraction of
    FTP (the real Zwift Workout XML convention), so no FTP is needed."""
    cad = ""
    if block.cadence_low and block.cadence_high:
        cad = f' Cadence="{(block.cadence_low + block.cadence_high) // 2}"'
    if block.type == "warmup":
        return f'<Warmup Duration="{int(block.duration_s)}" PowerLow="{block.from_pct:g}" PowerHigh="{block.to_pct:g}"{cad}/>'
    if block.type == "cooldown":
        return f'<Cooldown Duration="{int(block.duration_s)}" PowerLow="{block.from_pct:g}" PowerHigh="{block.to_pct:g}"{cad}/>'
    if block.type == "ramp":
        return f'<Ramp Duration="{int(block.duration_s)}" PowerLow="{block.from_pct:g}" PowerHigh="{block.to_pct:g}"{cad}/>'
    if block.type == "steady":
        return f'<SteadyState Duration="{int(block.duration_s)}" Power="{block.power_pct:g}"{cad}/>'
    if block.type == "freeride":
        return f'<FreeRide Duration="{int(block.duration_s)}"{cad}/>'
    # interval
    return (
        f'<IntervalsT Repeat="{int(block.reps)}" OnDuration="{int(block.on_s)}" '
        f'OffDuration="{int(block.off_s)}" OnPower="{block.on_pct:g}" '
        f'OffPower="{block.off_pct:g}"{cad}/>'
    )


def workout_to_zwo(name: str, description: str | None, blocks: list[CustomBlock]) -> str:
    """Full .zwo document string (real Zwift Workout XML)."""
    body = "\n".join(f"        {block_to_zwo(b)}" for b in blocks)
    desc = _xml_escape(description or "")
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<workout_file>\n"
        "    <author>AI Cycling Coach</author>\n"
        f"    <name>{_xml_escape(name)}</name>\n"
        f"    <description>{desc}</description>\n"
        "    <sportType>bike</sportType>\n"
        "    <tags/>\n"
        "    <workout>\n"
        f"{body}\n"
        "    </workout>\n"
        "</workout_file>\n"
    )


def resolved_block_to_dict(rb: ResolvedBlock) -> dict:
    """ResolvedBlock → interval_structure JSON (what the app renderer reads)."""
    return {
        "name": rb.name,
        "duration_s": rb.duration_s,
        "target_watts_low": rb.target_watts_low,
        "target_watts_high": rb.target_watts_high,
        "target_pct_ftp": rb.target_pct_ftp,
        "zone": rb.zone,
        "rpe": rb.rpe,
        "cadence_low": rb.cadence_low,
        "cadence_high": rb.cadence_high,
        "reps": rb.reps,
        "on_s": rb.on_s,
        "off_s": rb.off_s,
        "off_pct_ftp": rb.off_pct_ftp,
        "off_watts_low": rb.off_watts_low,
        "off_watts_high": rb.off_watts_high,
    }
