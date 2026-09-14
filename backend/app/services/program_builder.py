"""Named builder programs — FTP Builder / VO₂max Builder / 200k Builder.

User ask (July 2026): "help the user create a plan like FTP builder, VO2max
builder, or 200k builder — specific, science-based, with the most fun variety."

Each program is a deterministic 8-week shape (two 4-week mesos, 3:1 per
Issurin — the existing recovery-week machinery applies) expressed as a weekly
skeleton per day-of-week. Every session id references the REAL template
library, and each quality slot ROTATES through distinct variants week over
week, so no two weeks look the same.

Science anchors (mirrors coach_knowledge.py):
- FTP Builder: 2 threshold/sweet-spot sessions + 1 short MAP touch per week —
  the classic dose that moves FTP (Coggan sweet-spot density + Seiler 4x8);
  ends with a 20-min FTP test to bank the result.
- VO₂max Builder: 2 VO₂ sessions/week (Rønnestad 30/15s, 5x4, descending),
  hard-day-easy-day discipline, one SS to hold the floor. 8 weeks is the
  evidenced adaptation window; recovery weeks are non-negotiable.
- 200k Builder: progressive long-ride ladder (2h → 4h+), tempo durability
  work, back-to-back weekend endurance — the specific demands of a 200 km
  day (fatigue-resistance per the durability literature).

Storage (July 2026, per-sport): athlete_profile.goals["program"] =
{"bike": {"id": ..., "started": "YYYY-MM-DD"} | None,
 "run":  {"id": ..., "started": "YYYY-MM-DD"} | None}.
Backward compat: the legacy flat shape {"id": ..., "started": ...} is read as
the BIKE program. Bike programs are consumed by build_week_drafts (mesocycle
generator hook); run programs are scheduled directly as PlannedWorkout rows
(Tue/Thu/Sat) by the weeks API — full run-meso integration is a follow-up.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

ProgramId = str  # 'ftp_builder' | 'vo2_builder' | 'endurance_200k' | run ids

PROGRAM_IDS: tuple[ProgramId, ...] = ("ftp_builder", "vo2_builder", "endurance_200k")

# Run builder programs — pace-zone based (Friel run zones), no power templates.
RUN_PROGRAM_IDS: tuple[ProgramId, ...] = (
    "run_5k_speed", "run_10k_builder", "run_endurance_hm",
)

PROGRAM_META: dict[ProgramId, dict] = {
    "ftp_builder": {
        "name_en": "FTP Builder", "name_de": "FTP-Builder",
        "tagline_en": "8 weeks · 2 threshold days + 1 VO₂ touch · ends with a test you'll beat",
        "tagline_de": "8 Wochen · 2 Schwellen-Einheiten + 1 VO₂-Reiz · endet mit einem Test, den du schlägst",
        "weeks": 8,
    },
    "vo2_builder": {
        "name_en": "VO₂max Builder", "name_de": "VO₂max-Builder",
        "tagline_en": "8 weeks · 2 VO₂ sessions in rotating flavors · raise the ceiling",
        "tagline_de": "8 Wochen · 2 VO₂-Einheiten in wechselnden Varianten · hebe deine Decke",
        "weeks": 8,
    },
    "endurance_200k": {
        "name_en": "200k Builder", "name_de": "200k-Builder",
        "tagline_en": "8 weeks · long-ride ladder to 4h+ · durability and fueling for the big day",
        "tagline_de": "8 Wochen · Longride-Leiter bis 4h+ · Haltbarkeit und Fueling für den großen Tag",
        "weeks": 8,
    },
}

RUN_PROGRAM_META: dict[ProgramId, dict] = {
    "run_5k_speed": {
        "name_en": "5k Speed", "name_de": "5k-Speed",
        "tagline_en": "8 weeks · VO₂ 400s/800s + strides · sharpen your fastest 5k",
        "tagline_de": "8 Wochen · VO₂ 400er/800er + Steigerungen · dein schnellster 5k",
        "weeks": 8,
    },
    "run_10k_builder": {
        "name_en": "10k Builder", "name_de": "10k-Builder",
        "tagline_en": "8 weeks · tempo + VO₂ repeats · hold a harder pace for longer",
        "tagline_de": "8 Wochen · Tempo + VO₂-Wiederholungen · härteres Tempo länger halten",
        "weeks": 8,
    },
    "run_endurance_hm": {
        "name_en": "Half-Marathon Endurance", "name_de": "Halbmarathon-Ausdauer",
        "tagline_en": "8 weeks · long-run ladder + tempo · the engine for 21.1 km",
        "tagline_de": "8 Wochen · Longrun-Leiter + Tempo · der Motor für 21,1 km",
        "weeks": 8,
    },
}


@dataclass(frozen=True)
class ProgramDay:
    session_type: str          # feeds the existing kind/trim machinery
    template_id: str | None    # pinned template (None → picker decides)
    fixed: bool = True         # False = trimmable filler endurance


# Weekly skeletons: dow (0=Mon) → list indexed by week-in-program (rotates).
# 'REST' → rest day. Recovery weeks (Issurin week 3 of each meso) are handled
# by the caller: quality slots downgrade to recovery spins automatically.
_SKELETONS: dict[ProgramId, dict[int, list[ProgramDay] | str]] = {
    "ftp_builder": {
        0: "REST",
        1: [  # Tuesday — threshold, rotating flavor; week 8 = the test
            ProgramDay("threshold", "threshold_2x15"),
            ProgramDay("threshold", "threshold_seiler_4x8"),
            ProgramDay("threshold", "over_under_3x5"),
            ProgramDay("threshold", "threshold_pyramid"),
            ProgramDay("threshold", "threshold_hill_4x10"),
            ProgramDay("threshold", "over_under_4x12"),
            ProgramDay("threshold", "threshold_descending"),
            ProgramDay("threshold", "ftp_test_20min"),
        ],
        2: [ProgramDay("endurance", None, fixed=False)],
        3: [  # Thursday — sweet-spot density, rotating
            ProgramDay("sweet_spot", "sweet_spot_2x20"),
            ProgramDay("sweet_spot", "sweet_spot_3x20"),
            ProgramDay("sweet_spot", "sub_threshold_2x40"),
            ProgramDay("sweet_spot", "sweet_spot_4x15"),
        ],
        4: "REST",
        5: [  # Saturday — short MAP touch keeps the ceiling
            ProgramDay("vo2", "vo2_map_5x3"),
            ProgramDay("vo2", "vo2_3x6"),
        ],
        6: [ProgramDay("endurance", None)],  # Sunday long — picker takes longest fit
    },
    "vo2_builder": {
        0: "REST",
        1: [  # Tuesday — VO₂ keystone, rotating flavors
            ProgramDay("vo2", "vo2_5x4"),
            ProgramDay("vo2", "vo2_ronnestad_3x13"),
            ProgramDay("vo2", "vo2_descending_5_4_3_2_1"),
            ProgramDay("vo2", "vo2_micro_30x30"),
        ],
        2: [ProgramDay("recovery", "recovery_60")],
        3: [  # Thursday — second VO₂, different flavor family
            ProgramDay("vo2", "vo2_microbursts_30x15_45"),
            ProgramDay("vo2", "vo2_hill_6x3"),
            ProgramDay("vo2", "vo2_map_5x3"),
        ],
        4: "REST",
        5: [ProgramDay("sweet_spot", "sweet_spot_2x20"), ProgramDay("sweet_spot", "sweet_spot_4x15")],
        6: [ProgramDay("endurance", None)],
    },
    "endurance_200k": {
        0: "REST",
        1: [  # Tuesday — tempo durability, rotating
            ProgramDay("tempo", "tempo_2x30"),
            ProgramDay("tempo", "tempo_progression_60"),
            ProgramDay("tempo", "cadence_low_lcf_4x6"),
            ProgramDay("tempo", "tempo_4x15"),
        ],
        2: [ProgramDay("endurance", None, fixed=False)],
        3: [
            ProgramDay("endurance", "z2_endurance_tempo_touch_75"),
            ProgramDay("endurance", "z2_endurance_upper_75"),
        ],
        4: "REST",
        5: [  # Saturday — THE long-ride ladder (the point of the program)
            ProgramDay("endurance", "z2_long_120"),
            ProgramDay("endurance", "z2_long_180"),
            ProgramDay("endurance", "z2_long_180"),
            ProgramDay("endurance", "z2_long_120"),   # deload week lands here
            ProgramDay("endurance", "z2_long_240"),
            ProgramDay("endurance", "z2_long_240"),
            ProgramDay("endurance", "z2_climbing_long"),
            ProgramDay("endurance", "z2_long_180"),
        ],
        6: [ProgramDay("endurance", "z2_endurance_90"), ProgramDay("endurance", "z2_long_120")],
    },
}


def _parse_entry(p: object, valid_ids: tuple[ProgramId, ...]) -> tuple[ProgramId, date] | None:
    """Parse one {"id", "started"} entry → (program_id, started) or None."""
    if not isinstance(p, dict):
        return None
    pid = p.get("id")
    if pid not in valid_ids:
        return None
    try:
        started = date.fromisoformat(str(p.get("started")))
    except (ValueError, TypeError):
        return None
    return pid, started


def active_program(goals: dict | None, sport: str = "bike") -> tuple[ProgramId, date] | None:
    """Parse goals JSONB → (program_id, started) for the given sport, or None.

    Storage shapes accepted:
    - Per-sport (current): {"program": {"bike": {...}|None, "run": {...}|None}}
    - Legacy flat (pre-per-sport): {"program": {"id": ..., "started": ...}} —
      read as the BIKE program; run reads None.
    """
    if not isinstance(goals, dict):
        return None
    p = goals.get("program")
    if not isinstance(p, dict):
        return None
    valid = RUN_PROGRAM_IDS if sport == "run" else PROGRAM_IDS
    if "bike" in p or "run" in p:  # per-sport shape
        return _parse_entry(p.get(sport), valid)
    # Legacy flat shape == bike
    return _parse_entry(p, valid) if sport == "bike" else None


def set_program(goals: dict | None, sport: str, program_id: ProgramId | None) -> dict:
    """Return a NEW goals dict with the sport's program set (or cleared with None).

    Migrates the legacy flat shape to the per-sport shape while preserving the
    other sport's selection. When both sports end up cleared the "program" key
    is removed entirely (absence == race plan, matching the legacy semantics).
    """
    out = dict(goals or {})
    if sport == "bike" and program_id is not None:
        for key in ("custom_goal", "custom_goal_recommendation", "custom_goal_started"):
            out.pop(key, None)
    p = out.get("program")
    nested: dict[str, dict | None] = {"bike": None, "run": None}
    if isinstance(p, dict):
        if "bike" in p or "run" in p:
            for s in ("bike", "run"):
                entry = p.get(s)
                nested[s] = dict(entry) if isinstance(entry, dict) else None
        elif p.get("id") in PROGRAM_IDS:  # legacy flat == bike
            nested["bike"] = {"id": p["id"], "started": p.get("started")}
    if program_id is None:
        nested[sport] = None
    else:
        nested[sport] = {"id": program_id, "started": date.today().isoformat()}
    if nested["bike"] is None and nested["run"] is None:
        out.pop("program", None)
    else:
        out["program"] = nested
    return out


def program_week_index(started: date, week_start: date) -> int:
    """0-based week index inside the program (clamped to its length)."""
    monday = started - timedelta(days=started.weekday())
    idx = max(0, (week_start - monday).days // 7)
    return idx


def program_day(
    program_id: ProgramId, week_index: int, dow: int, is_recovery_week: bool
) -> ProgramDay | str:
    """Resolve the program's prescription for (week, dow).

    Returns 'REST' or a ProgramDay. On recovery weeks quality downgrades to a
    recovery spin (the deload is sacred), while the 200k ladder simply steps
    down (already encoded in its week list).
    """
    skeleton = _SKELETONS[program_id]
    slot = skeleton.get(dow, [ProgramDay("endurance", None, fixed=False)])
    if slot == "REST":
        return "REST"
    assert isinstance(slot, list)
    day = slot[week_index % len(slot)]
    if is_recovery_week and day.session_type in ("vo2", "threshold", "sweet_spot", "tempo"):
        return ProgramDay("recovery", "recovery_60")
    return day


# ─── RUN program skeletons ───────────────────────────────────────────────────
# Pace-zone based (Friel run zones) — template ids reference
# app.services.run_workout_templates.RUN_TEMPLATES. Deterministic Tue/Thu/Sat
# run days; every slot rotates week over week so no two weeks look the same.
# Consumed by the weeks API's direct 14-day run scheduler (NOT the mesocycle
# generator — full run-meso integration is the dual-sport follow-up).
_RUN_SKELETONS: dict[ProgramId, dict[int, list[str]]] = {
    "run_5k_speed": {
        1: [  # Tuesday — the VO₂ keystone, rotating 400s/800s flavors
            "run_vo2_400s",
            "run_vo2_800s",
            "run_vo2_400s",
            "run_strides_8x20",  # week 4 of each meso lands easier
        ],
        3: [  # Thursday — leg speed / controlled tempo
            "run_strides_8x20",
            "run_tempo_20",
            "run_strides_8x20",
            "run_recovery_25",
        ],
        5: [  # Saturday — aerobic support so the speed sticks
            "run_long_60",
            "run_progression_45",
            "run_long_60",
            "run_easy_45",
        ],
    },
    "run_10k_builder": {
        1: [  # Tuesday — threshold density, rotating
            "run_tempo_2x15",
            "run_tempo_20",
            "run_tempo_2x15",
            "run_strides_8x20",
        ],
        3: [  # Thursday — VO₂ touch keeps the ceiling
            "run_vo2_800s",
            "run_vo2_400s",
            "run_vo2_800s",
            "run_recovery_25",
        ],
        5: [  # Saturday — long-ish aerobic base
            "run_long_75",
            "run_progression_45",
            "run_long_75",
            "run_easy_45",
        ],
    },
    "run_endurance_hm": {
        1: [  # Tuesday — tempo durability, rotating
            "run_tempo_20",
            "run_tempo_2x15",
            "run_progression_45",
            "run_strides_8x20",
        ],
        3: [  # Thursday — easy volume + leg speed
            "run_easy_45",
            "run_strides_8x20",
            "run_easy_45",
            "run_recovery_25",
        ],
        5: [  # Saturday — THE long-run ladder (the point of the program)
            "run_long_60",
            "run_long_75",
            "run_long_ladder_100",
            "run_long_60",   # deload lands here
            "run_long_75",
            "run_long_ladder_100",
            "run_long_ladder_100",
            "run_long_75",
        ],
    },
}


def run_program_day(program_id: ProgramId, week_index: int, dow: int) -> str | None:
    """Run-template id for (week, dow) of a RUN program — Tue/Thu/Sat, else None."""
    slots = _RUN_SKELETONS.get(program_id)
    if not slots:
        return None
    lst = slots.get(dow)
    if not lst:
        return None
    return lst[week_index % len(lst)]
