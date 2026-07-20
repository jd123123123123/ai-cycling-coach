"""Sports science pure functions for training load calculation.

All functions are pure Python (no DB, no FastAPI).
Numpy is used only for Normalized Power (rolling window operations).

Sources:
- Coggan/TrainingPeaks TSS, NP, zones formulas
- Banister TRIMP for hrTSS
- run.analyticszone.app EWMA CTL/ATL formulas
- EVOQ.bike / Seiler 2009 for polarized 3-zone running boundaries
"""
from __future__ import annotations

import math
from datetime import date, timedelta

# EWMA time constants (Coggan Performance Management Chart)
CTL_TIME_CONSTANT = 42  # days — Chronic Training Load (fitness)
ATL_TIME_CONSTANT = 7   # days — Acute Training Load (fatigue)

# TRIMP k constants (Banister 1991; Busso et al.)
TRIMP_K_MALE = 1.92
TRIMP_K_FEMALE = 1.67

# Coggan zone boundaries as fractions of FTP
_COGGAN_ZONES = [
    ("zone1", "Active Recovery",    0.00, 0.55),
    ("zone2", "Endurance",          0.56, 0.75),
    ("zone3", "Tempo",              0.76, 0.90),
    ("zone4", "Lactate Threshold",  0.91, 1.05),
    ("zone5", "VO2 Max",            1.06, 1.20),
    ("zone6", "Anaerobic Capacity", 1.21, 1.50),
    ("zone7", "Neuromuscular",      1.50, None),
]

# Seiler 3-zone LT1 boundary fraction (below threshold speed)
SEILER_LT1_FRACTION = 0.77


# ---------------------------------------------------------------------------
# Normalized Power
# ---------------------------------------------------------------------------

def calculate_np(power_series: list[float]) -> float:
    """Normalized Power from second-by-second power data (Coggan algorithm).

    Algorithm:
      1. 30-second rolling average (assumes 1 data point per second)
      2. Raise each value to the 4th power
      3. Take the mean of the 4th powers
      4. Take the 4th root of that mean

    Falls back to simple average when fewer than 30 data points are present,
    since the rolling-window algorithm is not meaningful over very short efforts.

    Returns 0.0 for an empty series.
    """
    if not power_series:
        return 0.0

    if len(power_series) < 30:
        return sum(power_series) / len(power_series)

    import numpy as np
    arr = np.array(power_series, dtype=float)
    # 30-second rolling average using convolution (mode='valid' trims edges)
    window = np.ones(30) / 30.0
    rolling = np.convolve(arr, window, mode="valid")
    return float(np.mean(rolling ** 4) ** 0.25)


# ---------------------------------------------------------------------------
# Cycling TSS
# ---------------------------------------------------------------------------

def calculate_cycling_tss(
    duration_seconds: int | float,
    normalized_power: float,
    ftp_watts: int | float,
) -> float:
    """Cycling Training Stress Score.

    Formula: TSS = (duration_s * NP * IF) / (FTP * 3600) * 100
    where IF (Intensity Factor) = NP / FTP

    100 TSS = 1 hour at exactly FTP.

    Raises:
        ValueError: if ftp_watts <= 0.
    """
    if ftp_watts <= 0:
        raise ValueError(f"FTP must be positive, got {ftp_watts}")
    intensity_factor = normalized_power / ftp_watts
    return (duration_seconds * normalized_power * intensity_factor) / (ftp_watts * 3600) * 100


# ---------------------------------------------------------------------------
# Running TSS (rTSS)
# ---------------------------------------------------------------------------

def calculate_running_tss(
    duration_seconds: int | float,
    average_pace_ms: float,
    threshold_pace_ms: float,
) -> float:
    """Running Training Stress Score (rTSS).

    Pace is given in m/s (higher = faster). IF = actual_speed / threshold_speed.
    Formula: rTSS = (duration_s * speed * IF) / (threshold_speed * 3600) * 100

    100 rTSS = 1 hour at exactly threshold pace.

    IMPORTANT: always use speed (m/s), never pace (min/km) — pace direction is
    inverted (lower = faster), which would flip the intensity factor sign.

    Raises:
        ValueError: if threshold_pace_ms <= 0.
    """
    if threshold_pace_ms <= 0:
        raise ValueError(f"Threshold pace must be positive, got {threshold_pace_ms}")
    intensity_factor = average_pace_ms / threshold_pace_ms
    return (duration_seconds * average_pace_ms * intensity_factor) / (threshold_pace_ms * 3600) * 100


# ---------------------------------------------------------------------------
# HR TSS (hrTSS) via TRIMP
# ---------------------------------------------------------------------------

def calculate_hr_tss(
    duration_seconds: int | float,
    average_hr: float,
    lthr: float,
    hr_rest: float,
    hr_max: float,
    sex: str = "male",
) -> float:
    """HR-based TSS using the Banister TRIMP formula normalised to 100=1hr@LTHR.

    Formula:
        HRR = (HR - HR_rest) / (HR_max - HR_rest)   [clamped to 0-1]
        TRIMP = duration * HRR * 0.64 * exp(k * HRR)
        k = 1.92 (male) or 1.67 (female)
        hrTSS = (TRIMP_activity / TRIMP_reference) * 100
        where TRIMP_reference = 3600 * LTHR_HRR * 0.64 * exp(k * LTHR_HRR)

    Returns 0.0 if TRIMP reference is zero (e.g. LTHR == HR_rest).
    """
    k = TRIMP_K_MALE if sex.lower() == "male" else TRIMP_K_FEMALE
    hrr_range = hr_max - hr_rest

    hrr_activity = (average_hr - hr_rest) / hrr_range
    hrr_activity = max(0.0, min(1.0, hrr_activity))

    hrr_lthr = (lthr - hr_rest) / hrr_range
    hrr_lthr = max(0.0, min(1.0, hrr_lthr))

    trimp_activity = duration_seconds * hrr_activity * 0.64 * math.exp(k * hrr_activity)
    trimp_reference = 3600.0 * hrr_lthr * 0.64 * math.exp(k * hrr_lthr)

    if trimp_reference <= 0:
        return 0.0
    return (trimp_activity / trimp_reference) * 100


# ---------------------------------------------------------------------------
# CTL / ATL EWMA update
# ---------------------------------------------------------------------------

def update_ctl_atl(
    ctl_yesterday: float,
    atl_yesterday: float,
    tss_today: float,
) -> tuple[float, float]:
    """Update CTL (Chronic Training Load) and ATL (Acute Training Load) with today's TSS.

    Uses the Coggan EWMA formula — NOT a simple rolling mean:
        CTL_today = CTL_yesterday + (TSS_today - CTL_yesterday) * (1/42)
        ATL_today = ATL_yesterday + (TSS_today - ATL_yesterday) * (1/7)

    Time constants:
        CTL: 42-day decay (long-term fitness)
        ATL: 7-day decay (short-term fatigue)

    Returns:
        (new_ctl, new_atl) at FULL precision. Rounding happens exactly once at
        the presentation boundary (series emission / API response), never
        inside the EWMA recursion — per-step rounding compounds over long
        histories and made the same day's numbers depend on where the series
        started (usability audit P0-5, July 2026).
    """
    new_ctl = ctl_yesterday + (tss_today - ctl_yesterday) * (1 / CTL_TIME_CONSTANT)
    new_atl = atl_yesterday + (tss_today - atl_yesterday) * (1 / ATL_TIME_CONSTANT)
    return new_ctl, new_atl


# ---------------------------------------------------------------------------
# TSB (Training Stress Balance / Form)
# ---------------------------------------------------------------------------

def calculate_tsb(ctl: float, atl: float) -> float:
    """Training Stress Balance = CTL - ATL.

    Positive TSB = fresh/recovered (fitness > fatigue).
    Negative TSB = fatigued (acute load exceeds chronic load).

    CONVENTION (app-wide, do not change): TSB for a given day uses the SAME
    day's CTL and ATL — TSB_today = CTL_today − ATL_today, exactly as
    compute_pmc_series emits it. (TrainingPeaks charts the yesterday-based
    variant; we deliberately use same-day everywhere so every surface agrees.
    Changing the convention would shift every number in the app by one day.)

    Returns:
        TSB rounded to 1 decimal place.
    """
    return round(ctl - atl, 1)


# ---------------------------------------------------------------------------
# Coggan 7-Zone Power Zones
# ---------------------------------------------------------------------------

def coggan_power_zones(ftp_watts: int | float) -> dict:
    """Coggan Classic 7-zone power model.

    Zone boundaries as integer watts, computed as percentages of FTP.
    Zone 7 has no upper bound (neuromuscular / sprint power).

    Zone definitions (TrainingPeaks Power Training Levels):
        Zone 1 Active Recovery:    0  –  55% FTP
        Zone 2 Endurance:         56% – 75% FTP
        Zone 3 Tempo:             76% – 90% FTP
        Zone 4 Lactate Threshold: 91% – 105% FTP
        Zone 5 VO2 Max:          106% – 120% FTP
        Zone 6 Anaerobic:        121% – 150% FTP
        Zone 7 Neuromuscular:    >150% FTP (open-ended)
    """
    w = int(ftp_watts)
    result = {}
    for zone_key, name, lower_frac, upper_frac in _COGGAN_ZONES:
        result[zone_key] = {
            "name": name,
            "min": int(w * lower_frac),
            "max": int(w * upper_frac) if upper_frac is not None else None,
        }
    return result


# ---------------------------------------------------------------------------
# Seiler 3-Zone Running Zones
# ---------------------------------------------------------------------------

def seiler_3_zones_running(threshold_pace_ms: float) -> dict:
    """Seiler polarized 3-zone model for running, defined in speed (m/s).

    Zone boundaries approximate LT1 and LT2 thresholds:
        Zone 1 Easy     — below 77% of threshold speed  (LT1 proxy)
        Zone 2 Moderate — 77% to 100% of threshold speed (LT1–LT2)
        Zone 3 Hard     — above threshold speed          (above LT2)

    NOTE: threshold_pace_ms is LT2 speed (one-hour race pace equivalent).
    Zones use speed (m/s), NOT pace (min/km) — higher value = faster.

    The 77% boundary is derived from Seiler 2009 research and EVOQ polarized
    training guide; individual LT1 varies (60–85%) — treat as an estimate.
    """
    lt1_speed = threshold_pace_ms * SEILER_LT1_FRACTION
    return {
        "zone1": {
            "name": "Easy (below LT1)",
            "max_speed_ms": lt1_speed,
        },
        "zone2": {
            "name": "Moderate (LT1 to LT2)",
            "min_speed_ms": lt1_speed,
            "max_speed_ms": threshold_pace_ms,
        },
        "zone3": {
            "name": "Hard (above LT2)",
            "min_speed_ms": threshold_pace_ms,
        },
    }


# ---------------------------------------------------------------------------
# Performance Management Chart (PMC) Series
# ---------------------------------------------------------------------------

def compute_pmc_series(daily_tss_entries: list[dict]) -> list[dict]:
    """Compute CTL, ATL, TSB for a complete date range from daily TSS entries.

    Args:
        daily_tss_entries: List of {"date": datetime.date, "tss": float},
            sorted by date ascending. Gaps (rest days) are allowed — they
            will be filled with TSS=0 and CTL/ATL will decay accordingly.

    Returns:
        List of {"date": datetime.date, "ctl": float, "atl": float, "tsb": float}
        covering every calendar day from the first to the last entry date,
        with rest days correctly causing exponential CTL/ATL decay.

    Note:
        New athlete initialisation: CTL = ATL = 0.0 before first entry.
        The EWMA ensures CTL/ATL decay on rest days — they do NOT stay flat.
        The running EWMA state is kept at FULL precision; emitted values are
        rounded to 1 decimal exactly once (per-step rounding would make the
        series depend on its start date).
    """
    if not daily_tss_entries:
        return []

    # Build a fast lookup: date -> tss
    tss_by_date: dict[date, float] = {
        entry["date"]: float(entry["tss"]) for entry in daily_tss_entries
    }

    # Generate every calendar day from first to last entry
    start_date = min(tss_by_date)
    end_date = max(tss_by_date)

    result: list[dict] = []
    ctl = 0.0
    atl = 0.0
    current = start_date

    while current <= end_date:
        tss = tss_by_date.get(current, 0.0)  # rest days get 0 TSS
        ctl, atl = update_ctl_atl(ctl, atl, tss)
        # Round ONCE at emission; TSB from the emitted (displayed) values so
        # displayed ctl - atl == displayed tsb always holds.
        e_ctl = round(ctl, 1)
        e_atl = round(atl, 1)
        result.append({
            "date": current,
            "ctl": e_ctl,
            "atl": e_atl,
            "tsb": round(e_ctl - e_atl, 1),
        })
        current += timedelta(days=1)

    return result
