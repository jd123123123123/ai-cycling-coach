"""Custom-workout block computation — TSS/duration, resolve, .zwo shape.

Pure functions, no DB. These pin the invariant that the athlete-facing TSS
survives recomputation from the block structure, and that composite intervals /
ramps carry an honest duration-weighted IF (not the peak).
"""
from __future__ import annotations

import math

import pytest
from pydantic import ValidationError

from app.services.custom_workout_blocks import (
    CustomBlock,
    block_to_zwo,
    compute_tss_and_duration,
    resolve_block,
    workout_to_zwo,
    zone_for_pct,
)
from app.services.workout_templates import compute_template_tss, IntervalBlock


def test_steady_block_tss_matches_formula():
    # 60 min @ 85% FTP → Σ (1.0h) × 0.85² × 100 = 72.25
    blocks = [CustomBlock(type="steady", duration_s=3600, power_pct=0.85)]
    tss, duration = compute_tss_and_duration(blocks)
    assert duration == 3600
    assert tss == pytest.approx(72.25, abs=0.1)


def test_interval_block_duration_is_reps_times_on_off():
    # 4 × (3min on / 3min off) = 4 × 360 = 1440s
    blocks = [
        CustomBlock(type="interval", reps=4, on_s=180, off_s=180, on_pct=1.10, off_pct=0.50)
    ]
    _, duration = compute_tss_and_duration(blocks)
    assert duration == 1440


def test_interval_tss_uses_duration_weighted_if_not_peak():
    # 4×(3min@110% / 3min@50%). Duration-weighted IF over one rep:
    # sqrt((180*1.1² + 180*0.5²)/360) = sqrt((1.21+0.25)/2) = sqrt(0.73)
    reps, on_s, off_s, on, off = 4, 180, 180, 1.10, 0.50
    blocks = [CustomBlock(type="interval", reps=reps, on_s=on_s, off_s=off_s, on_pct=on, off_pct=off)]
    tss, _ = compute_tss_and_duration(blocks)
    expected_if = math.sqrt((on_s * on**2 + off_s * off**2) / (on_s + off_s))
    hours = reps * (on_s + off_s) / 3600.0
    expected_tss = round(hours * expected_if**2 * 100.0, 1)
    assert tss == pytest.approx(expected_tss, abs=0.2)
    # Peak-IF would massively overstate: guard it really is lower than peak.
    peak_tss = hours * on**2 * 100.0
    assert tss < peak_tss


def test_ramp_if_is_rms_of_endpoints():
    # Warm-up ramp 50%→90% over 600s. RMS IF = sqrt((.25+.45+.81)/3)=sqrt(.5033)
    blocks = [CustomBlock(type="warmup", duration_s=600, from_pct=0.50, to_pct=0.90)]
    tss, duration = compute_tss_and_duration(blocks)
    assert duration == 600
    expected_if = math.sqrt((0.5**2 + 0.5 * 0.9 + 0.9**2) / 3)
    expected = round((600 / 3600) * expected_if**2 * 100, 1)
    assert tss == pytest.approx(expected, abs=0.2)


def test_full_workout_tss_and_duration():
    # warmup + 4×(3/3 @110/50) + cooldown
    blocks = [
        CustomBlock(type="warmup", duration_s=600, from_pct=0.50, to_pct=0.75),
        CustomBlock(type="interval", reps=4, on_s=180, off_s=180, on_pct=1.10, off_pct=0.50),
        CustomBlock(type="cooldown", duration_s=300, from_pct=0.60, to_pct=0.40),
    ]
    tss, duration = compute_tss_and_duration(blocks)
    assert duration == 600 + 1440 + 300
    assert tss > 0


def test_zone_for_pct_boundaries():
    assert zone_for_pct(0.50) == 1
    assert zone_for_pct(0.65) == 2
    assert zone_for_pct(0.85) == 3
    assert zone_for_pct(1.00) == 4
    assert zone_for_pct(1.15) == 5
    assert zone_for_pct(1.40) == 6
    assert zone_for_pct(1.80) == 7


def test_resolve_block_materialises_watts_from_ftp():
    block = CustomBlock(type="steady", duration_s=600, power_pct=1.00)
    rb = resolve_block(block, ftp=240)
    # 100% of 240W, ±zone tolerance — band brackets 240.
    assert rb.target_watts_low <= 240 <= rb.target_watts_high
    assert rb.zone == 4


def test_resolve_interval_has_on_and_off_watts():
    block = CustomBlock(type="interval", reps=4, on_s=180, off_s=180, on_pct=1.10, off_pct=0.50)
    rb = resolve_block(block, ftp=240)
    assert rb.reps == 4 and rb.on_s == 180 and rb.off_s == 180
    assert rb.off_watts_low is not None and rb.off_watts_high is not None
    assert rb.target_watts_low > rb.off_watts_high  # on harder than off


def test_zwo_element_shapes():
    assert '<SteadyState Duration="600" Power="0.85"' in block_to_zwo(
        CustomBlock(type="steady", duration_s=600, power_pct=0.85)
    )
    assert '<Warmup Duration="600" PowerLow="0.5" PowerHigh="0.75"' in block_to_zwo(
        CustomBlock(type="warmup", duration_s=600, from_pct=0.50, to_pct=0.75)
    )
    iv = block_to_zwo(
        CustomBlock(type="interval", reps=4, on_s=180, off_s=180, on_pct=1.1, off_pct=0.5)
    )
    assert '<IntervalsT Repeat="4" OnDuration="180" OffDuration="180" OnPower="1.1" OffPower="0.5"' in iv
    assert '<FreeRide Duration="600"' in block_to_zwo(
        CustomBlock(type="freeride", duration_s=600)
    )


def test_zwo_document_is_wellformed():
    import xml.etree.ElementTree as ET

    blocks = [
        CustomBlock(type="warmup", duration_s=600, from_pct=0.50, to_pct=0.75),
        CustomBlock(type="interval", reps=4, on_s=180, off_s=180, on_pct=1.10, off_pct=0.50),
        CustomBlock(type="cooldown", duration_s=300, from_pct=0.60, to_pct=0.40),
    ]
    xml = workout_to_zwo("Mein Workout & Test", "Beschreibung", blocks)
    root = ET.fromstring(xml)
    assert root.tag == "workout_file"
    assert root.find("sportType").text == "bike"
    assert len(root.find("workout")) == 3


def test_validation_rejects_bad_pct_and_missing_fields():
    with pytest.raises(ValidationError):
        CustomBlock(type="steady", duration_s=600, power_pct=5.0)  # 500% FTP
    with pytest.raises(ValidationError):
        CustomBlock(type="steady", duration_s=600)  # missing power_pct
    with pytest.raises(ValidationError):
        CustomBlock(type="interval", reps=4, on_s=180, on_pct=1.1, off_pct=0.5)  # no off_s
