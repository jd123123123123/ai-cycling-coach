"""Age rails for the training plan.

WHAT THE EVIDENCE ACTUALLY SAYS, because the popular version of it is wrong in
a way that costs older riders their best sessions.

VO₂max declines with age — roughly 10% per decade after 30, and faster past 70.
It is tempting to read that as "an 85-year-old cannot raise their VO₂max, so
leave the VO₂ work out of their plan". That conclusion does not follow and the
intervention literature contradicts it: older adults respond to high-intensity
interval training with RELATIVE gains comparable to younger adults — commonly
in the 10–15% range — even into the eighth and ninth decades. What shrinks with
age is the absolute ceiling and the size of the gain in ml/kg/min, not the
capacity to adapt.

So the rails here never remove intensity. An 85-year-old keeps their VO₂
sessions, because that is the training that defends the thing that is declining
and it still works. What changes is what the plan may ASK of them between those
sessions:

  · RECOVERY. The best-established age effect is that recovery from
    high-intensity work takes longer. The same three-hard-days week that suits
    a 25-year-old is chronic overreaching at 70. Fewer hard days, spaced wider.

  · RAMP. Friel's 8%-per-week cap is a general rule written for a general
    athlete. Older riders tolerate less week-over-week growth before the
    adaptation turns into accumulated fatigue.

  · WHAT THE PLAN PROMISES. A projection that offers a 20-year-old's
    improvement curve to an 80-year-old is not motivating, it is wrong — and
    this app's honesty rule applies to forecasts as much as to measurements.

Nothing here is a medical screen and none of it is a reason to refuse training.
These are ceilings on what the generator may prescribe, not judgements about
what a rider can do.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class AgeRails:
    """The ceilings a plan must respect for a rider of this age."""

    #: Most hard (VO₂/threshold/sweet-spot) sessions allowed in one week.
    max_hard_per_week: int
    #: Minimum whole days between two hard sessions.
    min_recovery_days: int
    #: Week-over-week TSS growth cap, as a fraction (0.08 = Friel's 8%).
    ramp_cap_pct: float
    #: Plain-language reason, shown to the rider rather than hidden in a config.
    note: str | None


#: Under this age nothing is restricted — these are the general-athlete rules
#: the generator already used, expressed here so there is one source for them.
#: `min_recovery_days=0` is deliberate and load-bearing: the spacing check is
#: `gap <= min_recovery_days`, and two distinct days are always at least one
#: apart, so zero means the rule never fires. The general athlete must come out
#: of this module with EXACTLY the week they had before it existed. Setting it
#: to 1 here — as the first draft did — quietly banned back-to-back hard days
#: for every rider in the app and broke four dual-sport tests that depend on the
#: bike week's hard-day pattern. Restrictions start at 50, not at birth.
_DEFAULT = AgeRails(max_hard_per_week=3, min_recovery_days=0, ramp_cap_pct=0.08, note=None)


def age_years(date_of_birth: str | None, today: date | None = None) -> int | None:
    """Whole years, or None when the rider never told us.

    An unknown age gets the DEFAULT rails, never the cautious ones: guessing a
    rider is old because a field is blank would quietly shrink the training of
    every athlete who declined to share a birthday.
    """
    if not date_of_birth:
        return None
    try:
        dob = date.fromisoformat(str(date_of_birth)[:10])
    except ValueError:
        return None
    ref = today or date.today()
    years = ref.year - dob.year - ((ref.month, ref.day) < (dob.month, dob.day))
    return years if 0 < years < 120 else None


def rails_for_age(age: int | None) -> AgeRails:
    """The plan's ceilings for a rider of `age`.

    The bands are deliberately coarse. The underlying change is continuous and
    highly individual, and a plan that shifted its prescription on a birthday
    would be claiming a precision the evidence does not support. Coarse bands
    with an honest note beat a smooth curve made up to look rigorous.
    """
    if age is None or age < 50:
        return _DEFAULT

    if age < 60:
        return AgeRails(
            max_hard_per_week=3, min_recovery_days=1, ramp_cap_pct=0.07,
            note="Etwas flacherer Aufbau — die Woche wächst langsamer als bei einem 30-Jährigen.",
        )
    if age < 70:
        return AgeRails(
            max_hard_per_week=2, min_recovery_days=2, ramp_cap_pct=0.06,
            note="Zwei harte Einheiten pro Woche mit zwei Tagen dazwischen. "
                 "Die Intensität bleibt — die Erholung dazwischen wird länger.",
        )
    if age < 80:
        return AgeRails(
            max_hard_per_week=2, min_recovery_days=2, ramp_cap_pct=0.05,
            note="Zwei harte Einheiten, mindestens zwei Tage Abstand. "
                 "VO₂-Arbeit bleibt im Plan: sie wirkt in jedem Alter.",
        )
    return AgeRails(
        max_hard_per_week=1, min_recovery_days=3, ramp_cap_pct=0.04,
        note="Eine harte Einheit pro Woche, drei Tage Erholung darum herum. "
             "Auch mit 85 trainierst du VO₂max — nur seltener, nicht schwächer.",
    )


def rails_for_profile(date_of_birth: str | None, today: date | None = None) -> AgeRails:
    """Convenience: rails straight from the profile's stored birth date."""
    return rails_for_age(age_years(date_of_birth, today))
