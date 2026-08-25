""""Your threshold moved" — proposed to the athlete, never applied behind them.

WHY THIS IS A PROPOSAL AND NOT AN UPDATE. FTP is the unit every other number in
this app is measured in: zones, TSS, CTL, every prescribed interval. Changing it
silently would rewrite what the athlete's training means without telling them,
and the number is theirs — they typed it. So the system's job is to notice, to
show its working, and to ask.

WHY IT MUST NOTICE AT ALL (audit §7.1). Nothing wrote `ftp_watts` from the
model, so the threshold only ever changed when somebody remembered to type it.
Meanwhile the app was fitting a power-duration model to that athlete's own
maximal efforts and — when the two disagreed by more than 10% — HIDING the
model rather than mentioning it. The system detected the error in its own most
load-bearing input and suppressed the evidence.

TWO INDEPENDENT ESTIMATORS, and their agreement is the confidence:

  * **The test effort.** A hard 20-minute maximal effort is the classic field
    test; threshold ≈ 0.95 × that power. This is what an athlete has done when
    they "did an FTP test" — on Strava, on a trainer, up a climb.
  * **The model.** eFTP from the critical-power fit over the whole
    power-duration curve, which needs no dedicated test but does need the fit
    to be identifiable (see `critical_power.identifiable` — a two-point fit is
    exact by construction and proves nothing).

When both point the same way, the proposal is confident. When only one speaks,
it is offered as the weaker claim it is. When they disagree materially, nothing
is proposed at all — two estimators that contradict each other are not evidence,
they are a reason to wait for another ride.

TONE. An increase is a genuine achievement and the copy says so. A decrease is
NOT a failure and must never read as one: thresholds fall after illness, after a
break, after a hard block, and a rider whose zones are set too high is training
wrong every day until it is fixed. Both directions are worth surfacing; only one
is a celebration.

Pure module: no DB. `api/athletes` supplies the evidence and stores the answer.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

#: Threshold ≈ 95% of a maximal 20-minute effort — the standard field-test
#: coefficient.
TWENTY_MIN_COEFFICIENT = 0.95

#: Below these, a change is not worth interrupting anybody for: inside the
#: day-to-day noise of any power meter, and inside the error of both estimators.
MIN_CHANGE_PCT = 3.0
MIN_CHANGE_W = 5.0

#: Two estimators further apart than this are not corroborating each other.
ESTIMATOR_AGREEMENT_PCT = 6.0

#: A model fit whose CP standard error is wider than this is too loose to move
#: somebody's training on. Watts.
MAX_CP_SE_W = 12.0

#: Rides behind the model before it may speak at all.
MIN_MODEL_RIDES = 8


@dataclass(frozen=True)
class Evidence:
    """One reason to believe the new number, in the athlete's language."""

    kind: str                 # "test_effort" | "model"
    watts: float              # what THIS estimator says the threshold is
    de: str
    en: str


@dataclass(frozen=True)
class ThresholdProposal:
    current_watts: int
    proposed_watts: int
    delta_watts: int
    delta_pct: float
    direction: str            # "up" | "down"
    confidence: str           # "high" | "moderate"
    evidence: list[Evidence] = field(default_factory=list)
    headline_de: str = ""
    headline_en: str = ""
    body_de: str = ""
    body_en: str = ""


def _pct_gap(a: float, b: float) -> float:
    """Absolute difference between two estimates, as a % of the smaller."""
    lo = min(a, b)
    return abs(a - b) / lo * 100.0 if lo > 0 else float("inf")


def build_proposal(
    *,
    current_ftp: float | None,
    best_20min_w: float | None = None,
    best_20min_on: date | None = None,
    eftp_w: float | None = None,
    cp_se_w: float | None = None,
    cp_identifiable: bool = False,
    model_rides: int = 0,
    dismissed_watts: float | None = None,
) -> ThresholdProposal | None:
    """The proposal, or None when the evidence does not justify interrupting.

    `dismissed_watts` is the value the athlete has already said no to; a
    proposal within the noise band of it is not raised again. Saying "not now"
    once should not mean being asked again tomorrow about the same number.
    """
    if not current_ftp or current_ftp <= 0:
        return None

    estimates: list[Evidence] = []

    # ── The test effort ──────────────────────────────────────────────────
    test_w: float | None = None
    if best_20min_w and best_20min_w > 0:
        test_w = best_20min_w * TWENTY_MIN_COEFFICIENT
        when_de = f" am {best_20min_on.strftime('%d.%m.')}" if best_20min_on else ""
        when_en = f" on {best_20min_on.strftime('%-d %b')}" if best_20min_on else ""
        estimates.append(Evidence(
            kind="test_effort",
            watts=test_w,
            de=f"Deine beste 20-Minuten-Leistung{when_de}: {round(best_20min_w)} W. "
               f"Mal 0,95 ergibt {round(test_w)} W.",
            en=f"Your best 20-minute effort{when_en}: {round(best_20min_w)} W. "
               f"Times 0.95 gives {round(test_w)} W.",
        ))

    # ── The model ────────────────────────────────────────────────────────
    model_w: float | None = None
    if (
        eftp_w and eftp_w > 0
        and cp_identifiable
        and model_rides >= MIN_MODEL_RIDES
        and (cp_se_w is None or cp_se_w <= MAX_CP_SE_W)
    ):
        model_w = eftp_w
        estimates.append(Evidence(
            kind="model",
            watts=model_w,
            de=f"Dein Leistungs-Dauer-Modell aus {model_rides} Fahrten kommt auf "
               f"{round(model_w)} W.",
            en=f"Your power-duration model, fitted across {model_rides} rides, "
               f"lands on {round(model_w)} W.",
        ))

    if not estimates:
        return None

    # Two estimators that contradict each other are not evidence.
    if test_w and model_w and _pct_gap(test_w, model_w) > ESTIMATOR_AGREEMENT_PCT:
        return None

    # Prefer the test effort when present — it is a measurement of the thing
    # itself rather than an inference from the curve.
    proposed = test_w if test_w else model_w
    assert proposed is not None

    delta = proposed - current_ftp
    if abs(delta) < MIN_CHANGE_W or abs(delta) / current_ftp * 100.0 < MIN_CHANGE_PCT:
        return None

    # Already said no to this number.
    if dismissed_watts and _pct_gap(proposed, dismissed_watts) <= MIN_CHANGE_PCT:
        return None

    up = delta > 0
    confident = bool(test_w and model_w)  # both estimators, and they agree
    proposed_i = int(round(proposed))
    current_i = int(round(current_ftp))
    delta_i = proposed_i - current_i

    if up:
        headline_de = "Du bist stärker geworden."
        headline_en = "You got stronger."
        body_de = (
            f"Deine Schwelle sieht nach {proposed_i} W aus — {abs(delta_i)} W mehr als die "
            f"{current_i} W, mit denen wir bisher rechnen. Übernehmen wir das, "
            "verschieben sich deine Zonen und jede kommende Einheit rechnet mit "
            "der neuen Zahl."
        )
        body_en = (
            f"Your threshold looks like {proposed_i} W — {abs(delta_i)} W above the "
            f"{current_i} W we have been using. Take it, and your zones move with it: "
            "every session from here is prescribed off the new number."
        )
    else:
        # Never framed as a failure. A rider whose zones are set too high is
        # training wrong every day until this is fixed.
        headline_de = "Deine Zonen passen nicht mehr."
        headline_en = "Your zones have drifted."
        body_de = (
            f"Deine Schwelle sieht aktuell nach {proposed_i} W aus, wir rechnen aber mit "
            f"{current_i} W. Das passiert nach Krankheit, einer Pause oder einem harten "
            "Block — und solange die Zahl zu hoch steht, sind alle Einheiten zu hart "
            "angesetzt."
        )
        body_en = (
            f"Your threshold currently looks like {proposed_i} W, but we have been "
            f"prescribing off {current_i} W. That happens after illness, a break or a hard "
            "block — and while the number sits too high, every session is set too hard."
        )

    return ThresholdProposal(
        current_watts=current_i,
        proposed_watts=proposed_i,
        delta_watts=delta_i,
        delta_pct=round(delta / current_ftp * 100.0, 1),
        direction="up" if up else "down",
        confidence="high" if confident else "moderate",
        evidence=estimates,
        headline_de=headline_de,
        headline_en=headline_en,
        body_de=body_de,
        body_en=body_en,
    )
