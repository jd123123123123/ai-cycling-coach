"""A rider who sat in a group is not a rider who blew up.

Written after the app told a real person he had "eingebrochen" — broken —
because he spent the second half of a long ride in a group. His power dropped
the way everybody's power drops behind four other wheels. The debrief read that
drop, found no other explanation in its inputs, and diagnosed a collapse.

A fade and a tow are the SAME LINE on a power graph. The heart rate is what
separates them, and the debrief already had it.
"""
from app.services import race_debrief as rd


class _Pacing:
    def __init__(self, split_pct):
        self.split_pct = split_pct
        self.variability_index = None


class _Eff:
    def __init__(self, decoupling_pct):
        self.decoupling_pct = decoupling_pct


def test_power_down_with_the_heart_down_is_easing_not_cracking():
    # The group-ride shape: a big second-half power drop, and the heart came
    # down with it. Nothing was wrong; less was being asked.
    assert rd._split_story(_Pacing(-14), _Eff(1.2)) == "eased"


def test_power_down_with_the_heart_up_is_a_crack():
    # Paying the same or more for less. That is what falling apart costs.
    assert rd._split_story(_Pacing(-14), _Eff(11.0)) == "cracked"


def test_no_heart_rate_means_we_do_not_guess():
    """An accusation is a bad default.

    Being wrongly told you blew up costs far more than being told nothing, so a
    ride with no HR to read gets described rather than diagnosed."""
    assert rd._split_story(_Pacing(-14), _Eff(None)) == "unknown"
    assert rd._split_story(_Pacing(-14), None) == "unknown"


def test_the_group_ride_is_not_penalised_and_is_not_called_a_fade():
    score, good, bad = rd._rule_based_grade(
        _Pacing(-14), _Eff(1.2), None, [], None, de=True,
    )
    joined = " ".join(good + bad)
    assert "eingebrochen" not in joined
    assert any("lockerer" in g for g in good)
    # And it costs him nothing: easing is a decision, not a failure.
    assert score >= 80.0


def test_a_real_crack_still_says_so():
    """The fix must not make the app useless — a genuine collapse is still
    reported, and still costs score. Softening the verdict for everybody would
    be the same failure in the other direction."""
    score, good, bad = rd._rule_based_grade(
        _Pacing(-14), _Eff(11.0), None, [], None, de=True,
    )
    assert any("Tank leer" in b for b in bad)
    assert score < 80.0


def test_the_pacing_plan_stays_quiet_for_a_group_ride():
    """Handing someone a 'pace yourself better' plan for a ride they finished in
    a group corrects a mistake they did not make, and teaches them to distrust
    the whole screen."""
    plan = rd._build_plan(_Pacing(-14), None, _Eff(1.2), None, None, de=True)
    heads = " ".join((p.get("headline") or "") for p in plan)
    assert "ruhiger" not in heads and "gleichmäßiger" not in heads.lower()


def test_the_pacing_plan_still_fires_on_a_real_crack():
    plan = rd._build_plan(_Pacing(-14), None, _Eff(11.0), None, None, de=True)
    heads = " ".join((p.get("headline") or "") for p in plan)
    assert "ruhiger" in heads


def test_a_known_companion_settles_it_without_guessing():
    """The heart-rate rule exists because a power drop is AMBIGUOUS. When
    `ride_together` has matched somebody on the same road at the same second,
    the ambiguity is gone and the app should stop deducing a fact it has been
    told — including when the drift number would have said otherwise."""
    # Decoupling that would read as a crack on its own.
    assert rd._split_story(_Pacing(-14), _Eff(11.0)) == "cracked"
    assert rd._split_story(_Pacing(-14), _Eff(11.0), rode_with=1) == "eased"


def test_the_group_ride_says_it_was_a_group():
    score, good, bad = rd._rule_based_grade(
        _Pacing(-14), _Eff(1.2), None, [], None, de=True, rode_with=1,
    )
    joined = " ".join(good + bad)
    assert "Gruppe" in joined
    assert "eingebrochen" not in joined
    assert score >= 80.0


def test_alone_still_reads_as_alone():
    """The companion path must not swallow the solo wording — a rider who was
    genuinely on their own gets the sentence about their own pacing."""
    _, good, _ = rd._rule_based_grade(_Pacing(-14), _Eff(1.2), None, [], None, de=True)
    assert any("lockerer" in g for g in good)
    assert not any("Gruppe" in g for g in good)
