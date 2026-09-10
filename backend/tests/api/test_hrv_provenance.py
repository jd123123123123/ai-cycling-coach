"""Only comparable original nightly means are exposed to the history chart."""
from datetime import date, datetime, timezone
import json
from types import SimpleNamespace
import pytest
from app.api.daily_metrics import _enrich


def metric(raw, source='garmin', hrv_status=88):
    return SimpleNamespace(id=1,user_id=7,date=date(2026,9,10),recorded_at=datetime(2026,9,10,tzinfo=timezone.utc),sleep_score=None,hrv_status=hrv_status,body_battery=None,resting_hr=None,stress_level=None,steps=None,weight_kg=None,source=source,raw_data=raw)


@pytest.mark.parametrize('serialized',[False,True])
def test_original_nightly_mean_keeps_precision_and_leaves_legacy_scoring_value(serialized):
    raw={'hrv':{'hrvSummary':{'lastNightAvg':67.4,'lastNight5MinHigh':110,'weeklyAvg':72,'calendarDate':'2026-09-10'}}}
    result=_enrich(metric(json.dumps(raw) if serialized else raw))
    assert result.hrv_nightly_mean == 67.4
    assert result.hrv_status == 88


@pytest.mark.parametrize('summary',[{'lastNight5MinHigh':110},{'weeklyAvg':72},{'lastNight':65},{},None,[]])
def test_peak_weekly_or_unknown_statistic_never_becomes_a_nightly_mean(summary):
    result=_enrich(metric({'hrv':{'hrvSummary':summary}}))
    assert result.hrv_nightly_mean is None
    assert result.hrv_status==88


@pytest.mark.parametrize('value',[None,True,False,0,-4,float('nan'),float('inf'),'67',{},[]])
def test_invalid_or_ambiguous_measurements_remain_missing(value):
    assert _enrich(metric({'hrv':{'hrvSummary':{'lastNightAvg':value}}})).hrv_nightly_mean is None


@pytest.mark.parametrize('source',[None,'manual','apple_health','coros'])
def test_unproven_provider_source_is_excluded(source):
    assert _enrich(metric({'hrv':{'hrvSummary':{'lastNightAvg':67}}},source=source)).hrv_nightly_mean is None


def test_mismatched_explicit_measurement_date_is_not_relabelled():
    raw={'hrv':{'hrvSummary':{'lastNightAvg':67,'calendarDate':'2026-09-09'}}}
    assert _enrich(metric(raw)).hrv_nightly_mean is None


@pytest.mark.parametrize('raw',[None,[], 'broken JSON','[]',{'apple_health':{'hrv':67}}])
def test_absent_or_malformed_original_payload_does_not_fabricate_provenance(raw):
    assert _enrich(metric(raw)).hrv_nightly_mean is None
