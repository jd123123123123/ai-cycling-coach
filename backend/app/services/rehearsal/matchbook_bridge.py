"""The matchbook, applied to a ride that has not happened yet.

`services/matchbook.py` finds anaerobic "matches" — discrete drawdowns of the W′
reserve — in a recorded power stream. Because the forecast is expanded to the
same 1 Hz shape, that analysis runs unchanged on a predicted ride, and the
rider gets the one piece of pacing advice that is genuinely actionable before
an event: how many hard efforts this route has room for, and where.

This module is a thin adapter rather than a reimplementation, deliberately. If
the matchbook definition ever changes, the forecast and the post-ride debrief
must change together — otherwise the app would promise two matches and then
report three for the same ride, which is exactly the kind of self-inconsistency
that destroys trust in an estimate.
"""
from __future__ import annotations

from app.services.matchbook import analyze_matchbook

#: Cap on matches shown. The surface draws five flame icons; beyond that the
#: count stops being a plan and starts being a warning, which the blow-up
#: reporting already covers.
MAX_SHOWN = 5


def forecast_matchbook(
    power_series: list[float], cp: float | None, w_prime: float | None
) -> dict | None:
    """Matches this route will cost, or None when there is no W′ to spend.

    Returns None rather than zero without a fitted W′: a rider with no measured
    anaerobic capacity has no matchbook to burn, and reporting "0 matches" would
    read as "this route is easy" when the truth is "we cannot say".
    """
    if not power_series or not cp or cp <= 0 or not w_prime or w_prime <= 0:
        return None
    mb = analyze_matchbook(power_series, float(cp), float(w_prime))
    if mb is None:
        return None
    return {
        "count": min(mb.match_count, MAX_SHOWN),
        "count_uncapped": mb.match_count,
        "time_above_cp_s": mb.time_above_cp_s,
        "min_balance_j": round(mb.min_bal_j, 1),
        "fully_depleted": mb.fully_depleted,
        #: Where each match starts, so the surface can say WHICH climb to
        #: spend it on rather than only how many are available.
        "starts_s": [m.start_s for m in mb.matches[:MAX_SHOWN]],
    }
