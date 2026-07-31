"""What the model said, next to what actually happened.

Rehearsing a route the athlete has already ridden is the one case where this
page can be checked rather than believed. The design doc put it plainly: it
earns trust when the prediction lands close, and it surfaces model error in
front of the athlete when it does not — which is the honest trade, and the
reason this is shown at all rather than quietly logged.

The comparison is deliberately narrow. Only the finish time is compared,
because it is the only quantity where the recorded ride and the simulation
mean the same thing. Average power does not survive the comparison: a
recorded average includes coasting and stops, the simulation's does not, and
putting the two side by side would manufacture a discrepancy out of a
definitional difference rather than a model error.

Two refusals:

  * no recorded duration -> no comparison, not a comparison against zero;
  * a recorded ride whose distance is far from the rehearsed route -> no
    comparison. The athlete's GPS track IS the route here, so a large gap
    means the stream was truncated or the ride was cut short, and comparing a
    full simulation against a partial ride would read as a huge model error
    when the model was never wrong.
"""
from __future__ import annotations

from dataclasses import dataclass

#: How far the recorded distance may sit from the rehearsed route before the
#: comparison is refused. 5% covers GPS drift and a resampled stream; beyond
#: that the two are not describing the same ride.
DISTANCE_TOLERANCE_PCT = 5.0

#: Inside this, the prediction is "on the money" rather than fast or slow.
#: Chosen to match the band's own resolution: claiming a 40-second edge over
#: a five-hour ride is precision the model does not have.
CLOSE_ENOUGH_PCT = 2.0


@dataclass(frozen=True)
class ActualComparison:
    actual_time_s: float
    predicted_time_s: float
    #: Signed: positive when the model predicted SLOWER than the rider rode.
    error_s: float
    error_pct: float
    #: True when the recorded time falls inside the p10-p90 band. This is the
    #: real test of the band, not of the central estimate: a band that never
    #: contains the outcome is too narrow no matter how good the median is.
    inside_band: bool | None


def compare_to_actual(
    *,
    predicted_time_s: float | None,
    actual_time_s: float | None,
    rehearsed_distance_m: float,
    actual_distance_m: float | None,
    band_p10_s: float | None = None,
    band_p90_s: float | None = None,
) -> ActualComparison | None:
    """The comparison, or None when the two rides are not comparable."""
    if not predicted_time_s or not actual_time_s or actual_time_s <= 0:
        return None
    if actual_distance_m and rehearsed_distance_m > 0:
        gap_pct = abs(actual_distance_m - rehearsed_distance_m) / rehearsed_distance_m * 100.0
        if gap_pct > DISTANCE_TOLERANCE_PCT:
            return None

    error_s = predicted_time_s - actual_time_s
    inside: bool | None = None
    if band_p10_s is not None and band_p90_s is not None:
        inside = band_p10_s <= actual_time_s <= band_p90_s

    return ActualComparison(
        actual_time_s=float(actual_time_s),
        predicted_time_s=float(predicted_time_s),
        error_s=error_s,
        error_pct=(error_s / actual_time_s) * 100.0,
        inside_band=inside,
    )
