from app.services.form_progress import evaluate_form_progress


def _eval(**kw):
    base = dict(de=False, long_ride=True, has_pr=False, ctl=40.0, ctl_7d=0.0, tsb=0.0,
                decoupling=None, baseline_decoupling=None, eftp=None, baseline_eftp=None)
    base.update(kw)
    return evaluate_form_progress(**base)


def test_progress_when_pr_and_rising_ctl_and_low_decoupling():
    verdict, headline, markers, signals = _eval(
        has_pr=True, ctl_7d=1.5, decoupling=3.0, eftp=300, baseline_eftp=280)
    assert verdict == "progress"
    assert any(s.tone == "good" for s in signals)


def test_fatigue_when_high_decoupling_and_deep_tsb():
    verdict, _, _, signals = _eval(decoupling=11.0, tsb=-28.0, ctl_7d=-0.5)
    assert verdict == "fatigue"
    assert any(s.tone == "bad" for s in signals)


def test_steady_when_signals_balance():
    verdict, _, _, _ = _eval(decoupling=6.0, tsb=-2.0, ctl_7d=0.0)
    assert verdict == "steady"


def test_markers_always_include_fitness_and_form():
    _, _, markers, _ = _eval()
    labels = [m.label for m in markers]
    assert "Fitness (CTL)" in labels and "Form (TSB)" in labels
