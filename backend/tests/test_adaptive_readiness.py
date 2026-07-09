from app.services.adaptive_readiness import assess_adaptation


def _base(**kw):
    d = dict(hrv_recent=4.0, hrv_baseline=4.0, hrv_sd=0.2, hrv_below_days=0,
             tsb=-5.0, decoupling_delta=0.0, sleep_score=80.0, load_ramp=1.0)
    d.update(kw)
    return assess_adaptation(**d)


def test_escalates_when_in_band_and_durability_improving():
    d = _base(hrv_recent=4.05, decoupling_delta=-2.0)  # in band, decoupling down
    assert d.directive == "escalate"
    assert d.intensity_ceiling == "push"
    assert d.volume_modifier > 1.0
    assert any(s.evidence == "RCT" for s in d.signals)


def test_deloads_when_hrv_below_band_multiple_days():
    d = _base(hrv_recent=3.5, hrv_below_days=2)  # well below band, 2 days
    assert d.directive == "deload"
    assert d.intensity_ceiling == "easy"
    assert d.volume_modifier < 0.7


def test_holds_when_hrv_below_band_single_day():
    d = _base(hrv_recent=3.5, hrv_below_days=1)
    assert d.directive == "hold"
    assert d.intensity_ceiling == "easy"


def test_ramp_guardrail_downgrades_escalate_to_push():
    d = _base(hrv_recent=4.05, decoupling_delta=-2.0, load_ramp=1.7)
    assert d.directive == "push"  # escalate downgraded, not blocked
    assert any(s.evidence == "guardrail" for s in d.signals)


def test_no_hrv_falls_back_to_tsb():
    d = _base(hrv_recent=None, hrv_baseline=None, hrv_sd=None, tsb=-30.0)
    assert d.hrv_state == "unknown"
    assert d.directive == "hold"
