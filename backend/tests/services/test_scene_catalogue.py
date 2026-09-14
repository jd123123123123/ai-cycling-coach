from dataclasses import replace
from pathlib import Path
import pytest
from app.services import backdrops, scene_catalogue as sc
from app.services.earn_modifiers import RideFacts

BASE = RideFacts(distance_m=50000, duration_s=8000, elevation_gain_m=20)

def match(sid, **values):
    return sc.matches(sc.CATALOGUE[sid], replace(BASE, **values))

def test_catalogue_release_is_separate_from_prose():
    assert len(sc.SCENES) == len(sc.CATALOGUE) == 50
    assert set(backdrops.CATALOGUE) & set(sc.CATALOGUE) == sc.RELEASED
    assets = Path(__file__).resolve().parents[3] / 'frontend/public/w3/scenes'
    for sid in sc.RELEASED:
        assert (assets / f'{sid}.webp').is_file()
    assert 'finsternis' not in backdrops.CATALOGUE

@pytest.mark.parametrize('facts', [RideFacts(), RideFacts(distance_m=0,duration_s=0), RideFacts(distance_m=float('nan')), RideFacts(distance_m=float('inf'))])
def test_missing_or_invalid_facts_never_unlock(facts):
    assert not any(sc.matches(s, facts) for s in sc.SCENES)

@pytest.mark.parametrize('distance,unlocks', [(199999,False),(200000,True),(200001,True)])
def test_200km_is_one_ride(distance,unlocks):
    assert match('startrampe', distance_m=distance) is unlocks
    assert not any(sc.matches(sc.CATALOGUE['startrampe'], replace(BASE,distance_m=100000)) for _ in range(2))

def test_rain_conditions_require_both_measurements():
    assert not match('waschanlage')
    assert not match('waschanlage',was_wet=True,duration_s=7200)
    assert match('waschanlage',was_wet=True,duration_s=7201)
    assert not match('salzspiegel',was_wet=None)
    assert not match('salzspiegel',was_wet=True,elevation_gain_m=None)
    assert not match('salzspiegel',was_wet=True,elevation_gain_m=50)
    assert match('salzspiegel',was_wet=True,elevation_gain_m=49)

def test_peak_and_distance_boundaries():
    assert not match('mond',elevation_gain_m=4999)
    assert match('mond',elevation_gain_m=5000)
    assert not match('rand_welt',distance_m=299999)
    assert match('rand_welt',distance_m=300000)

def test_single_axis_must_not_drop_extra_conditions():
    for sid in ['trockenraum','faehre','autoscooter','moorbad','bambusdom','hoelle','duene','gewitter','nordlicht','meeresleuchten','gletschertunnel']:
        assert not match(sid,distance_m=300000,elevation_gain_m=3000,duration_s=10000)
    assert not match('kegelbahn',distance_m=59999,elevation_gain_m=0)
    assert match('kegelbahn',distance_m=60000,elevation_gain_m=0)

def test_unsupported_evidence_is_not_inferred():
    for sid in ['finsternis','rolltreppe','hau_den_lukas','liegestuhl','massageliege']:
        assert not match(sid, max_gradient_pct=30,intensity_factor=1.1,honoured_easy_day=True,has_power=False)

def test_progress_uses_best_single_ride_not_sum_and_no_weather_percentages():
    p=sc.progress(sc.CATALOGUE['startrampe'],[replace(BASE,distance_m=100000)]*3)
    assert p['pct']==.5 and p['current']==100000
    assert sc.progress(sc.CATALOGUE['waschanlage'],[BASE])['pct'] is None
    assert sc.progress(sc.CATALOGUE['mond'],[])['current'] is None
