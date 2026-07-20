"""Rider-type phenotype from the shape of the power-duration curve.

Coggan & Allen's power profiling reads a rider's *type* from how their short,
medium and threshold power compare. Rather than population tables (which need
exact test efforts and body mass norms), we phenotype from the athlete's own
curve shape: how far each peak sits above Critical Power versus the typical
reserve an all-rounder carries.

Typical reserves (peak ÷ CP) for a balanced rider:
    5 s ≈ 2.4× CP (neuromuscular), 1 min ≈ 1.7× (anaerobic), 5 min ≈ 1.18× (VO2).

- A large neuromuscular/anaerobic reserve → Sprinter.
- A large 5-min (VO2) reserve → Pursuiter.
- Reserves well below typical (a "diesel" with little top-end) → Time Trialist.
- Everything near typical → All-Rounder.

Locale: `type` and `note` are athlete-facing prose and localize via `lang`
('de' → German, everything else → English). `key` is the stable machine
identifier — key logic off it, never off the display strings (P1-6: no
English sentence may reach a German UI).

Pure module: no DB, no Garmin.
"""
from __future__ import annotations

_TYPICAL = {"5": 2.4, "60": 1.7, "300": 1.18}
_DEV = 0.10  # ±10% deviation from typical reserve = a meaningful lean

# key → (type_en, type_de, note_en, note_de)
_PHENOTYPES: dict[str, tuple[str, str, str, str]] = {
    "sprinter": (
        "Sprinter",
        "Sprinter",
        "Big neuromuscular & anaerobic reserve — your edge is short, explosive efforts.",
        "Große neuromuskuläre & anaerobe Reserve — deine Stärke sind kurze, explosive Antritte.",
    ),
    "pursuiter": (
        "Pursuiter",
        "Verfolger",
        "Strong 3–5 min VO2 power — built for hard, sustained surges and breakaways.",
        "Starke 3–5-min-VO2-Leistung — gebaut für harte, lange Antritte und Ausreißversuche.",
    ),
    "time_trialist": (
        "Time Trialist",
        "Zeitfahrer",
        "Aerobically dominant with a modest top-end — a diesel who holds power for hours.",
        "Aerob dominant mit moderater Spitze — ein Diesel, der stundenlang Druck hält.",
    ),
    "all_rounder": (
        "All-Rounder",
        "Allrounder",
        "Balanced across sprint, VO2 and threshold — no glaring weakness to exploit.",
        "Ausgewogen über Sprint, VO2 und Schwelle — keine klare Schwäche, die sich ausnutzen ließe.",
    ),
}


def power_phenotype(
    cp_watts: float | None, peaks: dict[str, float], lang: str = "en"
) -> dict | None:
    """Classify rider type from CP + peak powers (W) at 5/60/300 s.

    `lang` localizes the athlete-facing `type` and `note`; the machine `key`
    ('sprinter'|'pursuiter'|'time_trialist'|'all_rounder') is locale-stable.
    """
    if not cp_watts or cp_watts <= 0:
        return None
    try:
        m5 = peaks["5"] / cp_watts
        m60 = peaks["60"] / cp_watts
        m300 = peaks["300"] / cp_watts
    except (KeyError, TypeError):
        return None

    dev5 = m5 / _TYPICAL["5"] - 1.0
    dev60 = m60 / _TYPICAL["60"] - 1.0
    dev300 = m300 / _TYPICAL["300"] - 1.0
    sprint_dev = max(dev5, dev60)

    if sprint_dev >= _DEV and sprint_dev >= dev300:
        key = "sprinter"
    elif dev300 >= _DEV:
        key = "pursuiter"
    elif sprint_dev <= -_DEV:
        key = "time_trialist"
    else:
        key = "all_rounder"

    de = str(lang).lower().startswith("de")
    type_en, type_de, note_en, note_de = _PHENOTYPES[key]
    return {
        "key": key,
        "type": type_de if de else type_en,
        "note": note_de if de else note_en,
        "reserves": {
            "neuromuscular_x": round(m5, 2),
            "anaerobic_x": round(m60, 2),
            "vo2_x": round(m300, 2),
        },
    }
