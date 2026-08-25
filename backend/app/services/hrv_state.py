"""THE HRV state — one estimator, one window policy, every consumer.

Before this module there were three HRV constructs in the codebase and they
could disagree about the same athlete on the same morning:

  * `adaptive_readiness` — ln-transformed, 7-day mean vs a 28-day mean ± 0.5 SD
  * `readiness_score`    — RAW percent change vs a 28-day baseline, scored on a
                           piecewise curve anchored at 70
  * `safety_rails`       — RAW `hrv_delta_pct < -10` as a hard rail

Three transformations, three reference constructions, three decision rules. An
athlete at −8% was "in band, push hard" to the first, ~14/100 to the second and
invisible to the third; which one they saw depended on the surface they opened.

This module computes the STATE once. The three decision rules remain different
functions — that is legitimate, they answer different questions — but they are
now different functions *of one estimate*, so a disagreement is a design choice
somebody can defend rather than an accident of three window policies.

Three statistical corrections come with the consolidation, each from the audit
(`docs/training-engine-scientific-audit-2026-08.md`):

**The baseline no longer contains the window it judges (§4.1).** The old
baseline was `ln[-28:]` while the recent mean was drawn from the last 7 days —
a subset of it. Comparing a quantity to a set containing it attenuates the
deviation and biases the verdict toward "in band", which is toward PERMITTING
load. Worse, it is self-cancelling exactly when it matters: through a sustained
suppression the baseline is dragged down day by day, so chronic overreaching
progressively normalises itself out of detection. The baseline here is the
PRECEDING window and never overlaps the recent one.

**Both tests are computed and named (§4.2).** The literature convention
compares a rolling MEAN against `baseline ± 0.5 × the DAILY SD`. The standard
error of a 7-day mean is roughly SD/√7, so that band is materially wider in
standard-error terms than it looks, and its effective strictness drifts with
how many readings the week happened to contain. We keep the convention as the
verdict — replicating the trials rather than inventing a threshold — and report
`z_mean`, the variance-correct statistic, next to it. When the two disagree on
real athletes, that is a measurement, and it is the study to run.

**The daily-scale test is labelled as one (§4.3).** `below_days` compares
INDIVIDUAL daily readings against the daily-scale band; `state` compares a MEAN
against the same numbers. Both are defensible on their own; applying one
threshold to two statistics without saying so was not. They are separate fields
with separate docstrings now.

Pure module: no DB. `hrv_state_for_user` in `adaptive_readiness` does the I/O.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date
from statistics import mean, pstdev, stdev
from typing import Literal

#: The window whose mean becomes today's verdict.
HRV_RECENT_DAYS = 7
#: The reference period, ending where the recent window begins. 28 days of
#: reference, offset by the recent window, so the two never overlap.
HRV_BASELINE_DAYS = HRV_RECENT_DAYS + 28
#: The literature's smallest-worthwhile-change multiplier (Nuuttila/Vesterinen
#: convention). Applied to the DAILY SD — see the module docstring.
HRV_BAND_SD = 0.5
#: Newest reading older than this and the state is "unknown". A directive is a
#: present-tense claim; a week-old morning cannot make it.
HRV_MAX_AGE_DAYS = 1
#: "Below the band N days running" counts calendar days, never rows.
HRV_BELOW_WINDOW_DAYS = 3
#: Minimum readings before a baseline means anything.
HRV_MIN_BASELINE_N = 10
#: Minimum readings in the recent window before its mean is a verdict.
HRV_MIN_RECENT_N = 3

State = Literal["below", "in", "above", "unknown"]


@dataclass(frozen=True)
class HrvState:
    """One estimate, with its own uncertainty attached."""

    state: State
    #: Mean lnRMSSD over the recent window.
    ln_recent: float | None
    #: Mean lnRMSSD over the PRECEDING (non-overlapping) reference window.
    ln_baseline: float | None
    #: SD of the daily lnRMSSD values in the reference window.
    baseline_sd: float | None
    #: Standard error of `ln_recent` — the spread of the statistic actually
    #: being tested, as opposed to the spread of single days.
    se_recent: float | None
    #: (ln_recent − ln_baseline) / se_recent. The variance-correct test,
    #: reported for comparison; it does NOT drive `state`.
    z_mean: float | None
    n_recent: int
    n_baseline: int
    #: Whole days since the newest reading. None when there has never been one.
    age_days: int | None
    #: Calendar days inside the last `HRV_BELOW_WINDOW_DAYS` whose INDIVIDUAL
    #: reading sits below the daily-scale band. A daily-scale test, distinct
    #: from `state`, which is a test on the mean.
    below_days: int
    #: Raw-scale percent change of the recent mean vs baseline — the construct
    #: the composite and the rails were already written against, now computed
    #: from this module's window policy instead of each caller's own.
    delta_pct: float | None
    #: Coefficient of variation (%) of the recent window — the Plews signal.
    cv_pct: float | None

    @property
    def usable(self) -> bool:
        return self.state != "unknown"


def _cv_pct(values: list[float]) -> float | None:
    """CV of raw values. None — never 0.0 — when there is nothing to disperse:
    zero reads downstream as 'rock steady' on no evidence."""
    if len(values) < 2:
        return None
    m = mean(values)
    if m <= 0:
        return None
    return round(stdev(values) / m * 100.0, 2)


def estimate_hrv_state(
    rows: list[tuple[date, float]],
    *,
    today: date,
) -> HrvState:
    """Estimate today's HRV state from `(calendar day, raw RMSSD)` pairs.

    The day travels with the value throughout: every window here is a CALENDAR
    window. Slicing positionally ("the last 7 readings") is what previously let
    seven readings spread over a month be described as this week.
    """
    clean = sorted(
        ((d, float(v)) for d, v in rows if v is not None and float(v) > 0),
        key=lambda t: t[0],
    )
    if not clean:
        return HrvState("unknown", None, None, None, None, None, 0, 0, None, 0, None, None)

    age_days = (today - clean[-1][0]).days

    recent_raw = [v for d, v in clean if 0 <= (today - d).days < HRV_RECENT_DAYS]
    baseline_raw = [
        v for d, v in clean
        if HRV_RECENT_DAYS <= (today - d).days < HRV_BASELINE_DAYS
    ]

    recent_ln = [math.log(v) for v in recent_raw]
    baseline_ln = [math.log(v) for v in baseline_raw]

    n_recent, n_baseline = len(recent_ln), len(baseline_ln)
    cv_pct = _cv_pct(recent_raw)

    # Every road to "unknown" is a road to the TSB fallback, never to a green
    # light: too few readings either side, or a newest reading too old to
    # describe today.
    if (
        age_days > HRV_MAX_AGE_DAYS
        or n_recent < HRV_MIN_RECENT_N
        or n_baseline < HRV_MIN_BASELINE_N
    ):
        return HrvState(
            "unknown",
            mean(recent_ln) if recent_ln else None,
            mean(baseline_ln) if baseline_ln else None,
            pstdev(baseline_ln) if n_baseline >= 2 else None,
            None, None, n_recent, n_baseline, age_days, 0, None, cv_pct,
        )

    ln_recent = mean(recent_ln)
    ln_baseline = mean(baseline_ln)
    baseline_sd = pstdev(baseline_ln)

    # ── The verdict: the literature convention, deliberately ──────────────
    low = ln_baseline - HRV_BAND_SD * baseline_sd
    high = ln_baseline + HRV_BAND_SD * baseline_sd
    if baseline_sd <= 0:
        # A perfectly flat reference is a stuck sensor, not a settled athlete:
        # real day-to-day HRV always varies. With no dispersion there is no
        # scale to judge a deviation against — every departure is infinitely
        # many SDs and every non-departure is a false calm — so the honest
        # answer is that we cannot form a band. "unknown" routes to the TSB
        # fallback, which is the one branch that can never green-light.
        return HrvState(
            "unknown", ln_recent, ln_baseline, baseline_sd,
            None, None, n_recent, n_baseline, age_days, 0, None, cv_pct,
        )
    if ln_recent < low:
        state: State = "below"
    elif ln_recent > high:
        state = "above"
    else:
        state = "in"

    # ── The variance-correct statistic, reported alongside ────────────────
    se_recent = baseline_sd / math.sqrt(n_recent) if baseline_sd > 0 else None
    z_mean = (ln_recent - ln_baseline) / se_recent if se_recent else None

    # ── The daily-scale test, named as such ───────────────────────────────
    below_days = sum(
        1 for d, v in clean
        if (today - d).days < HRV_BELOW_WINDOW_DAYS and math.log(v) < low
    )

    delta_pct = None
    if baseline_raw:
        base_raw_mean = mean(baseline_raw)
        if base_raw_mean > 0:
            delta_pct = round((mean(recent_raw) - base_raw_mean) / base_raw_mean * 100.0, 2)

    return HrvState(
        state=state,
        ln_recent=ln_recent,
        ln_baseline=ln_baseline,
        baseline_sd=baseline_sd,
        se_recent=se_recent,
        z_mean=z_mean,
        n_recent=n_recent,
        n_baseline=n_baseline,
        age_days=age_days,
        below_days=below_days,
        delta_pct=delta_pct,
        cv_pct=cv_pct,
    )
