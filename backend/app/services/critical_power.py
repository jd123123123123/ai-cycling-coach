"""Critical Power (CP) and W′ — the power-duration model.

The 2-parameter linear CP model (Monod & Scherrer 1965; Hill 1993) states that
the best power sustainable for a duration `t` is:

    P(t) = CP + W' / t

where CP (watts) is the asymptotic, theoretically-sustainable aerobic power and
W' (joules) is the finite anaerobic work capacity available above CP. Plotting
P against 1/t gives a straight line: intercept = CP, slope = W'. We fit that
line by least squares over the MMP curve.

Why CP over FTP: FTP is a single 20-min-test heuristic; CP is fit from the whole
power-duration relationship and additionally yields W', which powers the
W′-balance model (intra-workout fatigue) in `w_balance.py`.

Fit band: only durations in [120 s, 1200 s] (2–20 min) are used — the classic
CP-valid range. Below ~2 min the relationship is dominated by neuromuscular
power (overestimates W'); above ~20–30 min aerobic decoupling pulls points
below the line (underestimates CP). Reference: Jones et al. 2010 (Med Sci
Sports Exerc), Vanhatalo et al. 2011.

Pure module: no DB, no Garmin.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

CP_MIN_DURATION_S = 120
CP_MAX_DURATION_S = 1200
CP_MIN_POINTS = 2


@dataclass(frozen=True)
class CriticalPowerFit:
    cp_watts: float
    w_prime_j: float
    eftp_watts: float   # modeled 60-min power = CP + W'/3600
    n_points: int       # number of MMP points used in the fit
    r_squared: float    # goodness of fit (1.0 = perfect line)


def fit_critical_power(
    mmp: dict[int, float],
    min_duration_s: int = CP_MIN_DURATION_S,
    max_duration_s: int = CP_MAX_DURATION_S,
    min_points: int = CP_MIN_POINTS,
) -> CriticalPowerFit | None:
    """Fit CP and W′ from a mean-maximal-power curve.

    Returns None when fewer than `min_points` MMP points fall inside the valid
    CP duration band — the fit is under-determined and the caller should fall
    back to the stored FTP.
    """
    points = [
        (t, p) for t, p in mmp.items()
        if min_duration_s <= t <= max_duration_s and p is not None
    ]
    if len(points) < min_points:
        return None

    durations = np.array([t for t, _ in points], dtype=float)
    powers = np.array([p for _, p in points], dtype=float)
    inv_t = 1.0 / durations

    # Linear least squares: P = W'·(1/t) + CP  →  slope=W', intercept=CP.
    slope, intercept = np.polyfit(inv_t, powers, 1)
    cp = float(intercept)
    w_prime = float(slope)

    # Coefficient of determination (R²) for fit quality.
    predicted = slope * inv_t + intercept
    ss_res = float(np.sum((powers - predicted) ** 2))
    ss_tot = float(np.sum((powers - powers.mean()) ** 2))
    r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else 1.0

    eftp = cp + w_prime / 3600.0
    return CriticalPowerFit(
        cp_watts=round(cp, 1),
        w_prime_j=round(w_prime, 0),
        eftp_watts=round(eftp, 1),
        n_points=len(points),
        r_squared=round(r_squared, 4),
    )
