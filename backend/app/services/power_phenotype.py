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

Pure module: no DB, no Garmin.
"""
from __future__ import annotations

_TYPICAL = {"5": 2.4, "60": 1.7, "300": 1.18}
_DEV = 0.10  # ±10% deviation from typical reserve = a meaningful lean


def power_phenotype(cp_watts: float | None, peaks: dict[str, float]) -> dict | None:
    """Classify rider type from CP + peak powers (W) at 5/60/300 s."""
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
        rider = "Sprinter"
        note = "Big neuromuscular & anaerobic reserve — your edge is short, explosive efforts."
    elif dev300 >= _DEV:
        rider = "Pursuiter"
        note = "Strong 3–5 min VO2 power — built for hard, sustained surges and breakaways."
    elif sprint_dev <= -_DEV:
        rider = "Time Trialist"
        note = "Aerobically dominant with a modest top-end — a diesel who holds power for hours."
    else:
        rider = "All-Rounder"
        note = "Balanced across sprint, VO2 and threshold — no glaring weakness to exploit."

    return {
        "type": rider,
        "note": note,
        "reserves": {
            "neuromuscular_x": round(m5, 2),
            "anaerobic_x": round(m60, 2),
            "vo2_x": round(m300, 2),
        },
    }
