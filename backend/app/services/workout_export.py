"""Workout export — convert a prescribed workout's resolved blocks into
file formats every major indoor-trainer / training-app ecosystem can ingest.

Supported formats:
    - .zwo  — Zwift XML. Imports natively to Zwift; many third-party apps
              (MyWhoosh, BKool, indieVelo) accept it too.
    - .erg  — CompuTrainer-era plain-text. Watts-by-time. Imported by
              TrainerRoad, GoldenCheetah, Wahoo SYSTM, BKool.
    - .mrc  — same shape as .erg but %FTP-by-time (ergometer-mode independent).
              Best for athletes whose FTP shifts week to week.

All three are text formats — no binary encoding, no SDK dependency. The
serializers are pure functions taking a `ResolvedBlock` list so they're
trivial to test.

Power discipline:
    .zwo expresses power as a fraction of FTP (0.85 = 85%). Values above
    1.0 are valid for VO2 efforts. We use Warmup / Cooldown blocks when
    the block ramps (low ≠ high) so Zwift renders them as ramps rather
    than as flat steps.

References:
    .zwo schema:  https://github.com/h4l/zwift-workout-file-reference
    .erg / .mrc:  https://www.computrainer.com/multirider/courses.html
"""
from __future__ import annotations

from dataclasses import dataclass
from html import escape
from typing import Iterable, Literal, Sequence


@dataclass(frozen=True)
class Block:
    """Format-agnostic shape — pulled from PrescribedWorkout.blocks before
    serialization. Decoupled from the Pydantic model so the serializers can
    be tested without spinning up the FastAPI app."""

    name: str
    duration_s: int
    watts_low: int
    watts_high: int
    pct_ftp: float  # midpoint % FTP for the block, 0-1.5+
    cadence_low: int | None = None
    cadence_high: int | None = None


def _block_kind(block: Block) -> Literal["warmup", "cooldown", "steady"]:
    """Classify a block for .zwo XML emission. Names take precedence — a
    ramp block named "Warm-up" is always a Warmup even if low==high
    accidentally — falling through to direction-based detection only when
    the name is uninformative."""
    n = block.name.lower()
    if "warm" in n:
        return "warmup"
    if "cool" in n or "ramp down" in n:
        return "cooldown"
    if n.startswith(("belastung", "intervall", "recovery")):
        return "steady"
    if block.watts_low < block.watts_high:
        return "warmup"
    if block.watts_low > block.watts_high:
        return "cooldown"
    return "steady"



def _fit_intensity(block: Block):
    """Die Schritt-Intensitaet fuer FIT — mit EIGENER Einstufung.

    WARUM NICHT `_block_kind`. Das ist der Zwift-Klassifikator, und sein
    Docstring sagt das auch ("Classify a block for .zwo XML emission"). Seine
    letzte Regel lautet `watts_low < watts_high -> warmup`: fuer Zwift sinnvoll,
    weil dort ein steigender Bereich eine Rampe ist. Fuer FIT ist es falsch --
    JEDER Block mit einem Wattbereich wurde damit zum Aufwaermen. In einer
    typischen Einheit (Warmup 130-145, Schwelle 240-250, Recovery 110-125,
    Cooldown 110-125) trugen drei von vier Schritten `Intensity.WARMUP`; nur
    der Cooldown kam ueber seinen Namen richtig durch.

    Auf dem Geraet heisst das: die Uhr fuehrt eine Schwellenwiederholung als
    Aufwaermen, und die Schrittfarben und Rundenlogik stimmen nicht mehr.

    Hier entscheidet der Name, dann die Intensitaet -- nie die Richtung des
    Wattbereichs. Ein Bereich ist bei strukturierten Einheiten die Regel, keine
    Rampe.
    """
    from fit_tool.profile.profile_type import Intensity

    n = block.name.lower()
    if "warm" in n:
        return Intensity.WARMUP
    if "cool" in n or "ramp down" in n:
        return Intensity.COOLDOWN
    if ("recovery" in n or "rest" in n or "pause" in n) and block.pct_ftp < 0.75:
        return Intensity.REST
    return Intensity.ACTIVE


def _pct(watts: int, ftp: int) -> float:
    """Fraction-of-FTP, 4-decimal precision so int round-tripping is exact
    enough for downstream apps. Guards FTP=0 with a sane default."""
    if ftp <= 0:
        return 0.0
    return round(watts / ftp, 4)


# ----------------------------------------------------------------------
# .zwo (Zwift XML)
# ----------------------------------------------------------------------


def to_zwo(
    *,
    title: str,
    description: str,
    blocks: Sequence[Block],
    ftp: int,
    author: str = "Frontier Coach",
    category: str | None = None,
) -> str:
    """Emit a Zwift workout XML string.

    The structure is intentionally minimal — `<author>`, `<name>`,
    `<description>`, `<sportType>`, and a `<workout>` body of
    Warmup/SteadyState/Cooldown elements. No segments, no text events:
    apps that want richer metadata can layer it on top.
    """
    lines: list[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<workout_file>",
        f"  <author>{escape(author)}</author>",
        f"  <name>{escape(title)}</name>",
        f"  <description>{escape(description)}</description>",
        "  <sportType>bike</sportType>",
        "  <tags>",
    ]
    if category:
        lines.append(f'    <tag name="{escape(category)}"/>')
    lines.append("  </tags>")
    lines.append("  <workout>")

    for block in blocks:
        kind = _block_kind(block)
        low = _pct(block.watts_low, ftp)
        high = _pct(block.watts_high, ftp)
        # Cadence — Zwift expects a single Cadence value per block; we emit
        # the midpoint when a range is set. CadenceResting is for the rest
        # interval of an intervals-block, not used here. Skip the attribute
        # entirely when no cadence is prescribed so Zwift leaves it open.
        cadence_attr = ""
        if block.cadence_low is not None and block.cadence_high is not None:
            mid_cad = int(round((block.cadence_low + block.cadence_high) / 2))
            cadence_attr = f' Cadence="{mid_cad}"'

        if kind == "warmup":
            lines.append(
                f'    <Warmup Duration="{block.duration_s}" '
                f'PowerLow="{low}" PowerHigh="{high}"{cadence_attr}/>'
            )
        elif kind == "cooldown":
            # Zwift expects PowerLow > PowerHigh for cooldowns (ramps down).
            lines.append(
                f'    <Cooldown Duration="{block.duration_s}" '
                f'PowerLow="{low}" PowerHigh="{high}"{cadence_attr}/>'
            )
        else:
            # SteadyState uses a single Power value — use the midpoint when
            # the watts band is non-zero (typically equal in practice).
            mid = round((low + high) / 2.0, 4)
            lines.append(
                f'    <SteadyState Duration="{block.duration_s}" Power="{mid}"{cadence_attr}/>'
            )

    lines.append("  </workout>")
    lines.append("</workout_file>")
    return "\n".join(lines) + "\n"


# ----------------------------------------------------------------------
# .erg / .mrc — shared structure, different units.
# ----------------------------------------------------------------------


def _erg_mrc_body(
    *,
    title: str,
    description: str,
    blocks: Sequence[Block],
    units: Literal["watts", "percent"],
    ftp: int,
) -> str:
    unit_header = "MINUTES WATTS" if units == "watts" else "MINUTES PERCENT"
    file_units = "ENGLISH" if units == "watts" else "ENGLISH"

    header = [
        "[COURSE HEADER]",
        "VERSION = 2",
        f"UNITS = {file_units}",
        f"DESCRIPTION = {description}",
        f"FILE NAME = {title}",
        f"FTP = {ftp}",
        unit_header,
        "[END COURSE HEADER]",
        "[COURSE DATA]",
    ]
    body: list[str] = []

    # The .erg/.mrc format is a piecewise-linear power curve — emit a point
    # at the start AND end of each block so the trainer interpolates linearly
    # within. SteadyState blocks repeat the same value, ramps slope.
    cursor_min = 0.0
    for block in blocks:
        end_min = cursor_min + block.duration_s / 60.0
        if units == "watts":
            v_low = block.watts_low
            v_high = block.watts_high
        else:
            v_low = round(_pct(block.watts_low, ftp) * 100, 1)
            v_high = round(_pct(block.watts_high, ftp) * 100, 1)
        body.append(f"{cursor_min:.2f}\t{v_low}")
        body.append(f"{end_min:.2f}\t{v_high}")
        cursor_min = end_min

    footer = ["[END COURSE DATA]"]
    return "\n".join(header + body + footer) + "\n"


def to_erg(
    *,
    title: str,
    description: str,
    blocks: Sequence[Block],
    ftp: int,
) -> str:
    """Watts-absolute power profile. Best for athletes with a fixed FTP."""
    return _erg_mrc_body(
        title=title, description=description, blocks=blocks, units="watts", ftp=ftp
    )


def to_mrc(
    *,
    title: str,
    description: str,
    blocks: Sequence[Block],
    ftp: int,
) -> str:
    """%FTP power profile. Travels well across athletes / FTP changes."""
    return _erg_mrc_body(
        title=title, description=description, blocks=blocks, units="percent", ftp=ftp
    )


# ----------------------------------------------------------------------
# Helpers consumed by the API layer
# ----------------------------------------------------------------------


# ----------------------------------------------------------------------
# .fit (Garmin FIT — binary)
# ----------------------------------------------------------------------
#
# FIT uses uint32 milliseconds for `duration_time` and a uint16 power
# encoding where:
#   * value < 1000  → %FTP (e.g. 850 = 85%)
#   * value >= 1000 → watts (value - 1000), so 1216 = 216 W
# Garmin head units accept structured workouts via FIT and only via FIT;
# Garmin Connect ingests them too via the "Import Workout" flow.

_FIT_POWER_OFFSET = 1000


def _watts_to_fit_power(watts: int) -> int:
    """Encode absolute watts in FIT's offset-by-1000 scheme."""
    return max(0, int(round(watts))) + _FIT_POWER_OFFSET


def to_fit(
    *,
    title: str,
    description: str,
    blocks: Sequence[Block],
    ftp: int,
    lap_start: bool = False,
) -> bytes:
    """Emit a binary FIT WORKOUT file for Garmin head units / Connect.

    Each block becomes one WorkoutStep with:
        intensity   = warmup / active / cooldown / rest (heuristic: name-based)
        duration    = TIME, in milliseconds
        target      = POWER (absolute watts, 1000-offset encoding)
                      OR OPEN when low==high==0 (free-ride)

    The `description` is dropped on the floor — FIT workouts have no
    long-description field; the step names carry the structure.
    """
    # Lazy import — heavy module, only loaded when someone exports FIT.
    import time

    from fit_tool.fit_file_builder import FitFileBuilder
    from fit_tool.profile.messages.file_id_message import FileIdMessage
    from fit_tool.profile.messages.workout_message import WorkoutMessage
    from fit_tool.profile.messages.workout_step_message import WorkoutStepMessage
    from fit_tool.profile.profile_type import (
        FileType,
        Intensity,
        Sport,
        WorkoutStepDuration,
        WorkoutStepTarget,
    )

    # Description is unused in FIT but still passed in the function signature
    # to match to_zwo / to_erg / to_mrc — keeps the endpoint switch dead-simple.
    _ = description  # noqa: F841

    builder = FitFileBuilder()

    file_id = FileIdMessage()
    file_id.type = FileType.WORKOUT
    file_id.manufacturer = 255  # 'development' — generic / non-Garmin source
    file_id.product = 0
    file_id.time_created = round(time.time() * 1000)
    builder.add(file_id)

    workout = WorkoutMessage()
    workout.workout_name = title[:15]  # FIT cap
    workout.sport = Sport.CYCLING
    first_work = next((i for i, b in enumerate(blocks) if b.pct_ftp >= .75),
                      1 if len(blocks)>1 and blocks[0].name == "Warmup" else 0)
    workout.num_valid_steps = len(blocks) + (1 if lap_start else 0)
    builder.add(workout)

    for idx, block in enumerate(blocks):
        if lap_start and idx == first_work:
            transfer = WorkoutStepMessage()
            transfer.message_index = idx
            transfer.workout_step_name = "Start: LAP"
            transfer.intensity = Intensity.WARMUP
            transfer.duration_type = WorkoutStepDuration.OPEN
            transfer.target_type = WorkoutStepTarget.OPEN
            builder.add(transfer)
        intensity = _fit_intensity(block)

        step = WorkoutStepMessage()
        step.message_index = idx + (1 if lap_start and idx >= first_work else 0)
        step.workout_step_name = block.name[:15]
        step.intensity = intensity
        step.duration_type = WorkoutStepDuration.TIME
        # FIT field 2 is uint32 milliseconds. Write encoded units explicitly:
        # fit-tool 0.9.15/0.9.16 differ in subfield scaling, so round-tripping
        # through the same library can hide a 1000x duration error.
        step.get_field(2).set_encoded_value(0, int(block.duration_s) * 1000)

        if block.watts_low <= 0 and block.watts_high <= 0:
            step.target_type = WorkoutStepTarget.OPEN
        else:
            step.target_type = WorkoutStepTarget.POWER
            step.custom_target_power_low = _watts_to_fit_power(block.watts_low)
            step.custom_target_power_high = _watts_to_fit_power(block.watts_high)

        # Cadence aliases share FIT fields 6/7 with power; assigning them here
        # overwrites the watt targets. Use the actual secondary target fields
        # when supported, otherwise preserve cadence as a step note.
        if block.cadence_low is not None and block.cadence_high is not None:
            if hasattr(step, "secondary_target_type"):
                step.secondary_target_type = WorkoutStepTarget.CADENCE
                step.secondary_custom_target_cadence_low = int(block.cadence_low)
                step.secondary_custom_target_cadence_high = int(block.cadence_high)
            else:
                step.notes = f"Cadence {block.cadence_low}-{block.cadence_high} rpm"

        builder.add(step)

    fit = builder.build()
    return bytes(fit.to_bytes())


# ----------------------------------------------------------------------
# Helpers consumed by the API layer
# ----------------------------------------------------------------------


def _erste(row: dict, *namen: str):
    """Der erste Schluessel, der wirklich einen Wert traegt."""
    for n in namen:
        v = row.get(n)
        if v is not None:
            return v
    return None


def blocks_from_dicts(rows: Iterable[dict], ftp: int | None = None) -> list[Block]:
    """Die gespeicherten JSON-Bloecke in die Dataclass heben, die die
    Serialisierer lesen.

    ZWEI FORMEN, UND NUR EINE WURDE GELESEN. In der Produktion stehen zwei
    Blockformen nebeneinander:

        652x  {"name", "duration_seconds", "power_target_pct_ftp", "zone", "rpe"}
         56x  {"name", "duration_s", "on_s", "off_s", "reps",
               "target_watts_low", "target_watts_high", "target_pct_ftp", ...}

    Diese Funktion las ausschliesslich die zweite Schreibweise:
    `duration_s`, `target_watts_low/high`, `target_pct_ftp`. Fuer die haeufigere
    erste Form lieferte jedes `row.get(...)` None, und `or 0` machte daraus
    stillschweigend eine NULL. Ergebnis: ein Block mit Dauer 0, Watt 0 und
    0 % FTP -- nur der Name ueberlebte.

    Was der Fahrer davon sah: Garmin lehnte die exportierte .fit-Datei ab mit
    "Einheit enthaelt einen ungueltigen Zeitblock". Das stimmte woertlich --
    jeder Schritt war null Sekunden lang. Betroffen waren 92 % aller
    gespeicherten Einheiten; funktioniert hat der Export nur fuer die
    Intervallform.

    `ftp` ist optional und nur fuer die erste Form noetig: sie traegt keine
    Wattwerte, sondern einen FTP-Anteil. Ohne FTP bleiben die Wattziele 0 --
    dann wird der Schritt als offener Block (freie Fahrt) exportiert, was
    ehrlich ist: eine erfundene Wattzahl waere schlimmer als keine.
    """
    out: list[Block] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        watts_low = _erste(row, "target_watts_low", "watts_low")
        watts_high = _erste(row, "target_watts_high", "watts_high")
        pct = float(_erste(row, "target_pct_ftp", "power_target_pct_ftp", "pct_ftp") or 0.0)

        # Die haeufige Form nennt nur den FTP-Anteil. Mit FTP laesst er sich in
        # Watt aufloesen; ohne bleibt es ein offener Schritt.
        if watts_low is None and watts_high is None and pct > 0 and ftp and ftp > 0:
            watts_low = watts_high = round(pct * ftp)

        c_low = row.get("cadence_low")
        c_high = row.get("cadence_high")
        out.append(
            Block(
                name=str(row.get("name") or "Block"),
                duration_s=int(_erste(row, "duration_s", "duration_seconds") or 0),
                watts_low=int(watts_low or 0),
                watts_high=int(watts_high or 0),
                pct_ftp=pct,
                cadence_low=int(c_low) if isinstance(c_low, (int, float)) else None,
                cadence_high=int(c_high) if isinstance(c_high, (int, float)) else None,
            )
        )
    return out
