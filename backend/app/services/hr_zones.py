"""Heart-rate zone derivation + workout HR target computation.

The Coggan/Friel convention expresses HR zones as percentages of LTHR
(lactate threshold HR). When the athlete's LTHR is unknown we derive it
from MHR (max HR) using LTHR ≈ 0.85 × MHR — a defensible Friel-table
constant. When MHR itself is unknown we fall back to Tanaka's age formula
(207 − 0.7 × age), which has the lowest standard error among published
age-based predictors. When even age is unknown we return None — never
fabricate an HR target without at least one anchor.

Zone → %LTHR bands follow the Coggan table:
    Zone 1 — < 81% LTHR  (active recovery)
    Zone 2 — 81–89%       (endurance)
    Zone 3 — 90–93%       (tempo / lower sweet-spot)
    Zone 4 — 94–99%       (threshold / upper sweet-spot)
    Zone 5 — 100–105%     (VO2max)
    Zone 6 — 106–120%     (anaerobic capacity — short, HR may lag)
    Zone 7 — N/A          (neuromuscular sprints — no meaningful target)

For zones 6 and 7 we still emit values where it makes sense (Z6 caps at
estimated MHR; Z7 returns None).
"""

from __future__ import annotations

from datetime import date


def _parse_dob(dob: str | None) -> date | None:
    if not dob:
        return None
    try:
        return date.fromisoformat(dob[:10])
    except Exception:
        return None


def _age_years(dob: str | None, today: date | None = None) -> int | None:
    parsed = _parse_dob(dob)
    if parsed is None:
        return None
    ref = today or date.today()
    years = ref.year - parsed.year
    if (ref.month, ref.day) < (parsed.month, parsed.day):
        years -= 1
    return max(10, years)  # nonsensical floor below 10y


def tanaka_max_hr(age: int | None) -> int | None:
    """Tanaka 2001 — better fit than 220-age across adult ages."""
    if age is None:
        return None
    return int(round(207 - 0.7 * age))


def derive_max_hr(
    *, max_heart_rate: int | None, date_of_birth: str | None
) -> int | None:
    """Return the best estimate of MHR available."""
    if max_heart_rate and max_heart_rate > 0:
        return int(max_heart_rate)
    return tanaka_max_hr(_age_years(date_of_birth))


def derive_lthr(
    *,
    lthr: int | None,
    max_heart_rate: int | None = None,
    date_of_birth: str | None = None,
) -> int | None:
    """Best LTHR estimate. Priority: stored LTHR → 0.85 × derived MHR → None."""
    if lthr and lthr > 0:
        return int(lthr)
    mhr = derive_max_hr(max_heart_rate=max_heart_rate, date_of_birth=date_of_birth)
    if mhr is None:
        return None
    return int(round(0.85 * mhr))


# Zone → (low_pct, high_pct) of LTHR.
_ZONE_HR_PCT_BANDS: dict[int, tuple[float, float] | None] = {
    1: (0.60, 0.81),
    2: (0.81, 0.89),
    3: (0.90, 0.93),
    4: (0.94, 0.99),
    5: (1.00, 1.05),
    # Z6 caps at 1.10×LTHR; in practice HR plateaus near MHR for short
    # max-effort intervals — the workout target is conservative.
    6: (1.05, 1.10),
    # Z7 (neuromuscular sprints) — no meaningful HR target; the rep is too
    # short for HR to catch up.
    7: None,
}


def hr_band_for_zone(
    zone: int, lthr: int | None
) -> tuple[int, int] | None:
    """Return (low_bpm, high_bpm) for the zone, given LTHR. None if unknown."""
    if lthr is None or lthr <= 0:
        return None
    band = _ZONE_HR_PCT_BANDS.get(int(zone))
    if band is None:
        return None
    low_pct, high_pct = band
    return (int(round(lthr * low_pct)), int(round(lthr * high_pct)))
