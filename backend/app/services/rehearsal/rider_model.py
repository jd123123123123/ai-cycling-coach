"""The athlete's physical inputs to a rehearsal.

Every field is nullable, and nullability DRIVES the refusals (spec §6) rather
than being silently defaulted: without CP or body weight there is no honest
prediction to make, and the surface says so instead of guessing.

The one exception is CdA, which falls back to a stated default and flags
itself, because a plausible aero number with a widened band is more useful
than refusing an otherwise-complete rehearsal.
"""
from __future__ import annotations

from dataclasses import dataclass

#: Road bike with pedals and bottles. A profile field can supersede this later.
BIKE_MASS_KG = 8.5
#: Hoods position, average rider. Only used when estimate_cda() returns None.
CDA_FALLBACK_M2 = 0.32
#: Matches cda_estimate.py's own default, so forward and inverse solves agree.
DEFAULT_CRR = 0.005

#: durability_drop measures the fall in best power AFTER this much work.
DURABILITY_REFERENCE_KJ = 2000.0
#: Never fade further than this, however bad the measured drop was — beyond the
#: measured range we are extrapolating, and extrapolation should be timid.
MAX_FADE_FRACTION = 0.12


@dataclass(frozen=True)
class RiderModel:
    cp_watts: float | None
    w_prime_j: float | None
    mass_kg: float | None
    cda_m2: float | None
    cda_is_default: bool
    crr: float
    #: From services/durability.durability_drop; 0.0 when never measured.
    durability_drop_pct: float

    @property
    def can_predict_time(self) -> bool:
        """A time needs CP and mass. Everything else has an honest fallback."""
        return (
            self.cp_watts is not None
            and self.cp_watts > 0
            and self.mass_kg is not None
            and self.mass_kg > 0
        )


def build_rider_model(
    *,
    cp_watts: float | None,
    w_prime_j: float | None,
    weight_kg: float | None,
    cda_m2: float | None,
    durability_drop_pct: float,
) -> RiderModel:
    return RiderModel(
        cp_watts=cp_watts,
        w_prime_j=w_prime_j,
        mass_kg=(weight_kg + BIKE_MASS_KG) if weight_kg else None,
        cda_m2=cda_m2 if cda_m2 else CDA_FALLBACK_M2,
        cda_is_default=not cda_m2,
        crr=DEFAULT_CRR,
        durability_drop_pct=max(0.0, durability_drop_pct),
    )


def available_cp(model: RiderModel, kj_done: float) -> float:
    """CP still available after `kj_done` of work.

    This is the effect no HR-based app can model: the same climb ridden at km
    120 is slower than at km 20. The fade is anchored on the athlete's OWN
    measured durability drop, scaled linearly to the work done and capped —
    past the measured range we are extrapolating and should be timid about it.
    """
    if model.cp_watts is None:
        return 0.0
    if model.durability_drop_pct <= 0 or kj_done <= 0:
        return model.cp_watts
    fade = (model.durability_drop_pct / 100.0) * (kj_done / DURABILITY_REFERENCE_KJ)
    return model.cp_watts * (1.0 - min(MAX_FADE_FRACTION, fade))
