# Race Debrief — Phase 1a: Route / Climb / Pacing / Effort analyzers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four pure, dependency-free science services that turn a ride's 1 Hz streams into the race-debrief building blocks: ride segmentation (climbs/descents/flats), climb metrics (VAM, W/kg, category), pacing analysis (split, VI, surges, phase intensity, zones), and effort matching (ride peaks vs the athlete's best, with PR flags).

**Architecture:** Each analyzer is a pure function (plain inputs → plain dataclass outputs), no DB/network, unit-tested with TDD, degrading to `[]`/`None` when its inputs are missing. They consume the Phase 0 `ActivityStreams` channels (power, altitude, distance, speed, hr) and the existing `power_curve` / `training_load` / `athlete_power_profile` helpers. This is the first shippable batch of Phase 1; the advanced analyzers (matchbook, efficiency, WKO power-duration model, quadrant, CdA/environment, fueling, key-moments) are Phase 1b and are out of scope here.

**Tech Stack:** Python 3.12, standard-library `math`/`dataclasses` only, pytest.

## Global Constraints

- **Pure services:** no DB, no network, no file IO. Plain inputs → plain outputs. TDD (RED→GREEN).
- **Graceful degradation:** insufficient/missing input → return `[]` (list-returning) or `None` (single-object-returning), never raise. Streams may contain leading `None`s (carry-fill until first reading) and may be short.
- **Never fabricate data:** if altitude or distance is absent, segmentation returns `[]`; downstream climb analysis then also returns `[]`.
- **No new dependencies.** Reuse existing services: `app.services.power_curve.mmp_curve`, `app.services.training_load.calculate_np` and `coggan_power_zones`, `app.services.athlete_power_profile.aggregate_mmp_curves`.
- **Reused signatures (verbatim):** `mmp_curve(power_series, durations_s=DEFAULT_DURATIONS_S) -> dict[int, float]`; `calculate_np(power_series: list[float]) -> float`; `coggan_power_zones(ftp_watts) -> dict`; `aggregate_mmp_curves(curves: list[dict]) -> dict[int, float]`.
- Run tests via the project venv: `cd backend && .venv/bin/python -m pytest ...`. Commit after each task. Test style matches `backend/tests/services/` (plain pytest, class-grouped, synthetic inputs).

---

## File Structure

- `backend/app/services/ride_segmentation.py` — **create**: `Segment` dataclass + `segment_ride(...)`.
- `backend/app/services/climbing_analysis.py` — **create**: `Climb` dataclass + `analyze_climbs(...)` (consumes `Segment`s).
- `backend/app/services/pacing_analysis.py` — **create**: `PacingResult` dataclass + `analyze_pacing(...)`.
- `backend/app/services/effort_matching.py` — **create**: `EffortMatch` dataclass + `match_efforts(...)`.
- Tests: `backend/tests/services/test_ride_segmentation.py`, `test_climbing_analysis.py`, `test_pacing_analysis.py`, `test_effort_matching.py` — **create**.

Each analyzer is one file, one responsibility, independently testable.

---

## Task 1: Ride segmentation

**Files:**
- Create: `backend/app/services/ride_segmentation.py`
- Test: `backend/tests/services/test_ride_segmentation.py`

**Interfaces:**
- Consumes: 1 Hz aligned `altitude: list[float | None]` and `distance: list[float | None]` (cumulative meters), optional `power: list[float] | None`, optional `speed: list[float | None] | None` — the Phase 0 `ActivityStreams` fields.
- Produces:
  - `@dataclass(frozen=True) Segment` with fields: `kind: str` (`"climb"|"descent"|"flat"`), `start_s: int`, `end_s: int` (exclusive), `duration_s: int`, `distance_m: float`, `elev_gain_m: float`, `elev_loss_m: float`, `avg_grade_pct: float`, `avg_power: float | None`, `avg_speed_ms: float | None`.
  - `segment_ride(altitude, distance, power=None, speed=None, *, min_climb_grade=3.0, min_segment_s=30, smooth_window_s=15) -> list[Segment]`. Returns `[]` when altitude or distance is absent/too short.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/services/test_ride_segmentation.py`:

```python
"""Tests for segmenting a ride into climbs/descents/flats."""
from __future__ import annotations

from app.services.ride_segmentation import Segment, segment_ride


def _ramp(start_alt, grade_frac, seconds, start_dist=0.0, speed_ms=10.0):
    """Altitude+distance for a constant-gradient section.

    grade_frac is the slope as a fraction (0.06 = 6%). Vertical gain per second
    is grade_frac * speed_ms, so grade = d_alt/d_dist = grade_frac exactly.
    """
    per_s_gain = grade_frac * speed_ms
    alt = [start_alt + per_s_gain * i for i in range(seconds)]
    dist = [start_dist + speed_ms * i for i in range(seconds)]
    return alt, dist


class TestSegmentRide:
    def test_no_altitude_returns_empty(self):
        assert segment_ride([None, None], [0.0, 10.0]) == []
        assert segment_ride([], []) == []

    def test_detects_a_sustained_climb(self):
        # 300 s climbing at 6% grade (0.6 m/s vertical at 10 m/s → ~179 m gained).
        alt, dist = _ramp(100.0, 0.06, 300)
        segs = segment_ride(alt, dist, min_segment_s=30)
        climbs = [s for s in segs if s.kind == "climb"]
        assert len(climbs) == 1
        c = climbs[0]
        assert c.duration_s == 300
        assert c.elev_gain_m > 100  # ~179 m gained
        assert c.avg_grade_pct > 3.0

    def test_flat_section_is_flat(self):
        alt = [100.0] * 120
        dist = [10.0 * i for i in range(120)]
        segs = segment_ride(alt, dist)
        assert all(s.kind == "flat" for s in segs)

    def test_climb_then_descent(self):
        up_alt, up_dist = _ramp(100.0, 0.08, 120)
        down_alt, down_dist = _ramp(up_alt[-1], -0.08, 120, start_dist=up_dist[-1] + 10)
        segs = segment_ride(up_alt + down_alt, up_dist + down_dist, min_segment_s=30)
        kinds = [s.kind for s in segs]
        assert "climb" in kinds and "descent" in kinds

    def test_short_noise_bump_is_merged_not_its_own_segment(self):
        # Mostly flat with a 5 s tiny bump — below min_segment_s, must not split out.
        alt = [100.0] * 60 + [100.5] * 5 + [100.0] * 60
        dist = [10.0 * i for i in range(125)]
        segs = segment_ride(alt, dist, min_segment_s=30)
        assert len(segs) == 1
        assert segs[0].kind == "flat"

    def test_averages_power_and_speed_over_segment(self):
        alt, dist = _ramp(100.0, 0.08, 60)
        power = [200.0] * 60
        speed = [10.0] * 60
        segs = segment_ride(alt, dist, power=power, speed=speed, min_segment_s=30)
        assert segs[0].avg_power == 200.0
        assert segs[0].avg_speed_ms == 10.0
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_ride_segmentation.py -v`
Expected: FAIL with `ModuleNotFoundError: app.services.ride_segmentation`.

- [ ] **Step 3: Implement the module**

Create `backend/app/services/ride_segmentation.py`:

```python
"""Segment a ride into climbs / descents / flats from altitude + distance.

Pure module (no DB/network). GPS/barometric altitude is noisy, so altitude is
smoothed with a centered moving average before gradients are computed. A second
is classified climb / descent / flat by its smoothed grade against
``min_climb_grade`` (with the negative mirror for descents); contiguous runs of
the same kind become segments, and runs shorter than ``min_segment_s`` are merged
into the neighbour they most resemble so GPS noise and momentary kicks don't
fragment the ride.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Segment:
    kind: str            # "climb" | "descent" | "flat"
    start_s: int
    end_s: int           # exclusive
    duration_s: int
    distance_m: float
    elev_gain_m: float
    elev_loss_m: float
    avg_grade_pct: float
    avg_power: float | None
    avg_speed_ms: float | None


def _clean(series: list[float | None] | None, n: int) -> list[float] | None:
    """Forward/back-fill a carry-filled series to a full float array, or None."""
    if not series:
        return None
    out: list[float | None] = list(series[:n]) + [None] * max(0, n - len(series))
    last: float | None = None
    for i, v in enumerate(out):
        if v is not None:
            last = float(v)
        out[i] = last
    if last is None:
        return None                       # never had a reading
    # back-fill any leading Nones with the first real value
    first = next(v for v in out if v is not None)
    return [first if v is None else float(v) for v in out]


def _smooth(values: list[float], window_s: int) -> list[float]:
    if window_s <= 1:
        return values
    half = window_s // 2
    n = len(values)
    out = []
    for i in range(n):
        lo, hi = max(0, i - half), min(n, i + half + 1)
        out.append(sum(values[lo:hi]) / (hi - lo))
    return out


def _classify(grade: float, min_climb_grade: float) -> str:
    if grade >= min_climb_grade:
        return "climb"
    if grade <= -min_climb_grade:
        return "descent"
    return "flat"


def segment_ride(
    altitude: list[float | None],
    distance: list[float | None],
    power: list[float] | None = None,
    speed: list[float | None] | None = None,
    *,
    min_climb_grade: float = 3.0,
    min_segment_s: int = 30,
    smooth_window_s: int = 15,
) -> list[Segment]:
    """Segment a ride; see module docstring. Returns [] on missing/short input."""
    n = len(altitude)
    if n < min_segment_s + 1:
        return []
    alt = _clean(altitude, n)
    dist = _clean(distance, n)
    if alt is None or dist is None:
        return []

    smooth_alt = _smooth(alt, smooth_window_s)
    # Per-second grade from smoothed altitude over the distance travelled.
    kinds: list[str] = []
    for i in range(n):
        d_alt = smooth_alt[min(i + 1, n - 1)] - smooth_alt[i]
        d_dist = dist[min(i + 1, n - 1)] - dist[i]
        grade = (d_alt / d_dist * 100.0) if d_dist > 0.1 else 0.0
        kinds.append(_classify(grade, min_climb_grade))

    # Contiguous runs of the same kind.
    runs: list[list[int]] = []  # [start, end)
    start = 0
    for i in range(1, n):
        if kinds[i] != kinds[start]:
            runs.append([start, i])
            start = i
    runs.append([start, n])

    # Merge sub-threshold runs into the previous run (or the next if first).
    merged: list[list[int]] = []
    for run in runs:
        s, e = run
        if e - s < min_segment_s and merged:
            merged[-1][1] = e
        elif e - s < min_segment_s and not merged:
            merged.append(run)  # keep; may absorb the next
        else:
            if merged and merged[-1][1] - merged[-1][0] < min_segment_s:
                merged[-1][1] = e  # absorb the tiny leading run
            else:
                merged.append(run)

    segments: list[Segment] = []
    for s, e in merged:
        dur = e - s
        d_m = dist[e - 1] - dist[s]
        gain = sum(max(0.0, alt[j + 1] - alt[j]) for j in range(s, e - 1))
        loss = sum(max(0.0, alt[j] - alt[j + 1]) for j in range(s, e - 1))
        grade_pct = ((alt[e - 1] - alt[s]) / d_m * 100.0) if d_m > 0.1 else 0.0
        kind = _classify(grade_pct, min_climb_grade)
        avg_power = round(sum(power[s:e]) / dur, 1) if power else None
        seg_speed = [v for v in (speed[s:e] if speed else []) if v is not None]
        avg_speed = round(sum(seg_speed) / len(seg_speed), 2) if seg_speed else None
        segments.append(Segment(
            kind=kind, start_s=s, end_s=e, duration_s=dur,
            distance_m=round(d_m, 1), elev_gain_m=round(gain, 1),
            elev_loss_m=round(loss, 1), avg_grade_pct=round(grade_pct, 2),
            avg_power=avg_power, avg_speed_ms=avg_speed,
        ))
    return segments
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_ride_segmentation.py -v`
Expected: PASS (6 tests). If the climb/descent boundary test is flaky on the merge logic, confirm `min_segment_s` merges the tiny bump — do not loosen the assertions.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ride_segmentation.py backend/tests/services/test_ride_segmentation.py
git commit -m "feat(debrief): ride segmentation into climbs/descents/flats"
```

---

## Task 2: Climb analysis (VAM / W·kg / category)

**Files:**
- Create: `backend/app/services/climbing_analysis.py`
- Test: `backend/tests/services/test_climbing_analysis.py`

**Interfaces:**
- Consumes: `list[Segment]` from Task 1 (`app.services.ride_segmentation.Segment`), `mass_kg: float | None`.
- Produces:
  - `@dataclass(frozen=True) Climb`: `start_s: int`, `duration_s: int`, `distance_m: float`, `elev_gain_m: float`, `avg_grade_pct: float`, `vam_m_per_h: float`, `w_per_kg: float | None`, `avg_power: float | None`, `category: str` (`"HC"|"1"|"2"|"3"|"4"|"uncat"`).
  - `analyze_climbs(segments: list[Segment], mass_kg: float | None = None) -> list[Climb]`. Considers only `kind == "climb"` segments; returns `[]` if none.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/services/test_climbing_analysis.py`:

```python
"""Tests for per-climb metrics (VAM, W/kg, category)."""
from __future__ import annotations

from app.services.climbing_analysis import Climb, analyze_climbs
from app.services.ride_segmentation import Segment


def _climb_seg(duration_s, elev_gain_m, distance_m, avg_power=None):
    return Segment(
        kind="climb", start_s=0, end_s=duration_s, duration_s=duration_s,
        distance_m=distance_m, elev_gain_m=elev_gain_m, elev_loss_m=0.0,
        avg_grade_pct=round(elev_gain_m / distance_m * 100, 2),
        avg_power=avg_power, avg_speed_ms=None,
    )


class TestAnalyzeClimbs:
    def test_ignores_non_climb_segments(self):
        flat = Segment("flat", 0, 60, 60, 600.0, 0.0, 0.0, 0.0, None, None)
        assert analyze_climbs([flat]) == []

    def test_vam_computed(self):
        # 600 m gained in 1200 s (20 min) → VAM = 600 / (1200/3600) = 1800 m/h.
        seg = _climb_seg(1200, 600.0, 8000.0)
        climbs = analyze_climbs([seg])
        assert len(climbs) == 1
        assert abs(climbs[0].vam_m_per_h - 1800.0) < 1.0

    def test_w_per_kg_when_mass_and_power_present(self):
        seg = _climb_seg(600, 200.0, 4000.0, avg_power=280.0)
        climbs = analyze_climbs([seg], mass_kg=70.0)
        assert abs(climbs[0].w_per_kg - 4.0) < 0.01

    def test_w_per_kg_none_without_mass(self):
        seg = _climb_seg(600, 200.0, 4000.0, avg_power=280.0)
        assert analyze_climbs([seg], mass_kg=None)[0].w_per_kg is None

    def test_big_climb_categorized_harder_than_small(self):
        big = _climb_seg(2400, 1200.0, 16000.0)     # long, lots of gain
        small = _climb_seg(300, 60.0, 3000.0)       # short, little gain
        cats = {c.duration_s: c.category for c in analyze_climbs([big, small])}
        order = ["uncat", "4", "3", "2", "1", "HC"]
        assert order.index(cats[2400]) > order.index(cats[300])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_climbing_analysis.py -v`
Expected: FAIL with `ModuleNotFoundError: app.services.climbing_analysis`.

- [ ] **Step 3: Implement the module**

Create `backend/app/services/climbing_analysis.py`:

```python
"""Per-climb metrics: VAM, W/kg, and a rough climb category.

Pure module. Consumes the climb-kind Segments from ride_segmentation. Category
uses the classic "climb score" = elevation_gain_m × average_grade_fraction ×
100, bucketed to the Tour-style HC/1/2/3/4 bands (approximate — for athlete
context, not race officiating).
"""
from __future__ import annotations

from dataclasses import dataclass

from app.services.ride_segmentation import Segment

# climb-score thresholds (elev_gain_m * grade_fraction * 100), ascending band edges
_CATEGORY_BANDS = [
    (8000.0, "HC"),
    (6400.0, "1"),
    (3200.0, "2"),
    (1600.0, "3"),
    (800.0, "4"),
]


def _category(elev_gain_m: float, avg_grade_pct: float) -> str:
    score = elev_gain_m * (avg_grade_pct / 100.0) * 100.0
    for threshold, label in _CATEGORY_BANDS:
        if score >= threshold:
            return label
    return "uncat"


@dataclass(frozen=True)
class Climb:
    start_s: int
    duration_s: int
    distance_m: float
    elev_gain_m: float
    avg_grade_pct: float
    vam_m_per_h: float
    w_per_kg: float | None
    avg_power: float | None
    category: str


def analyze_climbs(segments: list[Segment], mass_kg: float | None = None) -> list[Climb]:
    """Metrics for each climb-kind segment. Returns [] when there are no climbs."""
    climbs: list[Climb] = []
    for s in segments:
        if s.kind != "climb" or s.duration_s <= 0:
            continue
        vam = s.elev_gain_m / (s.duration_s / 3600.0)
        w_per_kg = (
            round(s.avg_power / mass_kg, 2)
            if s.avg_power is not None and mass_kg and mass_kg > 0
            else None
        )
        climbs.append(Climb(
            start_s=s.start_s, duration_s=s.duration_s, distance_m=s.distance_m,
            elev_gain_m=s.elev_gain_m, avg_grade_pct=s.avg_grade_pct,
            vam_m_per_h=round(vam, 1), w_per_kg=w_per_kg, avg_power=s.avg_power,
            category=_category(s.elev_gain_m, s.avg_grade_pct),
        ))
    return climbs
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_climbing_analysis.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/climbing_analysis.py backend/tests/services/test_climbing_analysis.py
git commit -m "feat(debrief): per-climb VAM / W·kg / category analysis"
```

---

## Task 3: Pacing analysis

**Files:**
- Create: `backend/app/services/pacing_analysis.py`
- Test: `backend/tests/services/test_pacing_analysis.py`

**Interfaces:**
- Consumes: `power_series: list[float]`, `ftp: float | None`, optional `hr_series: list[float] | None`; reuses `calculate_np` and `coggan_power_zones`.
- Produces:
  - `@dataclass(frozen=True) PacingResult`: `first_half_np: float`, `second_half_np: float`, `split_pct: float` (negative = slowed in 2nd half), `variability_index: float | None`, `surge_count: int`, `phase_np: list[float]` (3 thirds), `final_30min_np: float | None`, `zone_time_pct: dict[str, float]` (Coggan zone label → % of ride).
  - `analyze_pacing(power_series, ftp=None, hr_series=None, *, surge_frac=1.1, surge_min_s=10) -> PacingResult | None`. Returns `None` when `len(power_series) < 120`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/services/test_pacing_analysis.py`:

```python
"""Tests for pacing analysis (split, VI, surges, phases, zones)."""
from __future__ import annotations

from app.services.pacing_analysis import PacingResult, analyze_pacing


class TestAnalyzePacing:
    def test_too_short_returns_none(self):
        assert analyze_pacing([200.0] * 60) is None

    def test_positive_split_detected(self):
        # First half strong (250 W), second half faded (200 W) → negative split_pct.
        power = [250.0] * 600 + [200.0] * 600
        res = analyze_pacing(power, ftp=250.0)
        assert res.first_half_np > res.second_half_np
        assert res.split_pct < 0

    def test_even_ride_split_near_zero(self):
        res = analyze_pacing([220.0] * 1200, ftp=250.0)
        assert abs(res.split_pct) < 1.0

    def test_variability_index_flat_is_one(self):
        res = analyze_pacing([220.0] * 1200, ftp=250.0)
        assert res.variability_index is not None
        assert abs(res.variability_index - 1.0) < 0.02

    def test_surges_counted(self):
        # Baseline 150 W with three 15 s spikes to 400 W (>1.1*FTP=275).
        power = []
        for _ in range(3):
            power += [150.0] * 300 + [400.0] * 15
        power += [150.0] * 300
        res = analyze_pacing(power, ftp=250.0, surge_frac=1.1, surge_min_s=10)
        assert res.surge_count == 3

    def test_zone_time_sums_to_100(self):
        res = analyze_pacing([100.0] * 400 + [220.0] * 400 + [300.0] * 400, ftp=250.0)
        assert abs(sum(res.zone_time_pct.values()) - 100.0) < 0.5

    def test_phase_np_has_three_thirds(self):
        res = analyze_pacing([200.0] * 1200, ftp=250.0)
        assert len(res.phase_np) == 3
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_pacing_analysis.py -v`
Expected: FAIL with `ModuleNotFoundError: app.services.pacing_analysis`.

- [ ] **Step 3: Implement the module**

Create `backend/app/services/pacing_analysis.py`:

```python
"""Pacing analysis: split, variability index, surges, phase intensity, zones.

Pure module. Reuses calculate_np (Normalized Power) and coggan_power_zones.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.services.training_load import calculate_np, coggan_power_zones


@dataclass(frozen=True)
class PacingResult:
    first_half_np: float
    second_half_np: float
    split_pct: float
    variability_index: float | None
    surge_count: int
    phase_np: list[float]
    final_30min_np: float | None
    zone_time_pct: dict[str, float]


def _count_surges(power: list[float], threshold: float, min_s: int) -> int:
    surges, run = 0, 0
    for p in power:
        if p >= threshold:
            run += 1
        else:
            if run >= min_s:
                surges += 1
            run = 0
    if run >= min_s:
        surges += 1
    return surges


def _zone_time_pct(power: list[float], ftp: float) -> dict[str, float]:
    # coggan_power_zones(ftp) -> {zone_key: {"name":.., "min": int, "max": int|None}}.
    # Coggan's integer-truncated boundaries leave a 1 W gap between each zone's
    # `max` and the next zone's `min` (e.g. zone5 max 300, zone6 min 302), so an
    # upper-bound test would drop samples in the gap. Assign each sample to the
    # HIGHEST zone whose `min` it meets — gap-free, always sums to 100%.
    zones = coggan_power_zones(ftp)
    bands = sorted(
        ((int(z["min"]), label) for label, z in zones.items()), key=lambda b: b[0]
    )
    counts = {label: 0 for _, label in bands}
    for p in power:
        chosen = bands[0][1]
        for lo, label in bands:
            if p >= lo:
                chosen = label
            else:
                break
        counts[chosen] += 1
    n = len(power)
    return {label: round(counts[label] / n * 100.0, 1) for _, label in bands}


def analyze_pacing(
    power_series: list[float],
    ftp: float | None = None,
    hr_series: list[float] | None = None,
    *,
    surge_frac: float = 1.1,
    surge_min_s: int = 10,
) -> PacingResult | None:
    """Pacing metrics for a ride, or None when shorter than 120 s."""
    n = len(power_series)
    if n < 120:
        return None
    half = n // 2
    first_np = calculate_np(power_series[:half])
    second_np = calculate_np(power_series[half:])
    split = ((second_np - first_np) / first_np * 100.0) if first_np > 0 else 0.0

    avg = sum(power_series) / n
    full_np = calculate_np(power_series)
    vi = round(full_np / avg, 3) if avg > 0 else None

    third = n // 3
    phase_np = [
        round(calculate_np(power_series[0:third]), 1),
        round(calculate_np(power_series[third:2 * third]), 1),
        round(calculate_np(power_series[2 * third:]), 1),
    ]
    final_30 = round(calculate_np(power_series[-1800:]), 1) if n >= 1800 else None

    surge_count = (
        _count_surges(power_series, ftp * surge_frac, surge_min_s) if ftp and ftp > 0 else 0
    )
    zone_pct = _zone_time_pct(power_series, ftp) if ftp and ftp > 0 else {}

    return PacingResult(
        first_half_np=round(first_np, 1),
        second_half_np=round(second_np, 1),
        split_pct=round(split, 1),
        variability_index=vi,
        surge_count=surge_count,
        phase_np=phase_np,
        final_30min_np=final_30,
        zone_time_pct=zone_pct,
    )
```

> **Confirmed `coggan_power_zones` shape** (`backend/app/services/training_load.py:216`): returns `{zone_key: {"name": str, "min": int, "max": int|None}}` with zone_key `"zone1".."zone7"`. `_zone_time_pct` above uses `z["min"]` and the highest-min-met assignment so it is gap-proof (Coggan's truncated boundaries are non-contiguous). Output contract: `{zone_key: percent}` summing to ~100. If you read the function and the shape differs from the above, adapt `_zone_time_pct` and report it — but it has been verified to match.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_pacing_analysis.py -v`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/pacing_analysis.py backend/tests/services/test_pacing_analysis.py
git commit -m "feat(debrief): pacing analysis (split, VI, surges, phases, zones)"
```

---

## Task 4: Effort matching (peaks vs your best + PR flags)

**Files:**
- Create: `backend/app/services/effort_matching.py`
- Test: `backend/tests/services/test_effort_matching.py`

**Interfaces:**
- Consumes: `ride_mmp: dict[int, float]` (this ride's mean-maximal power by duration, from `power_curve.mmp_curve`) and `athlete_best: dict[int, float]` (the athlete's rolling-window envelope, from `athlete_power_profile.aggregate_mmp_curves`). Both keyed by duration-in-seconds. Keys may be `int` or `str`.
- Produces:
  - `@dataclass(frozen=True) EffortMatch`: `duration_s: int`, `ride_watts: float`, `best_watts: float | None`, `pct_of_best: float | None`, `is_pr: bool`.
  - `match_efforts(ride_mmp, athlete_best, *, pr_tolerance=1.0) -> list[EffortMatch]` sorted ascending by `duration_s`. A duration is a PR when `ride_watts >= best_watts * pr_tolerance` (`pr_tolerance` slightly ≥1 avoids flagging ties as PRs; default 1.0 flags equal-or-better). Durations present in `ride_mmp` only.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/services/test_effort_matching.py`:

```python
"""Tests for matching a ride's peak efforts against the athlete's best."""
from __future__ import annotations

from app.services.effort_matching import EffortMatch, match_efforts


class TestMatchEfforts:
    def test_pct_of_best_computed(self):
        ride = {60: 400.0, 300: 320.0}
        best = {60: 500.0, 300: 320.0}
        out = {m.duration_s: m for m in match_efforts(ride, best)}
        assert out[60].pct_of_best == 80.0
        assert out[300].pct_of_best == 100.0

    def test_new_pr_flagged(self):
        ride = {300: 340.0}
        best = {300: 320.0}
        assert match_efforts(ride, best)[0].is_pr is True

    def test_not_a_pr_when_below_best(self):
        ride = {300: 300.0}
        best = {300: 320.0}
        assert match_efforts(ride, best)[0].is_pr is False

    def test_missing_best_yields_none_pct_and_pr_true(self):
        # No prior best at this duration → it's a PR by definition, pct None.
        ride = {1200: 290.0}
        out = match_efforts(ride, {})
        assert out[0].best_watts is None
        assert out[0].pct_of_best is None
        assert out[0].is_pr is True

    def test_sorted_by_duration_and_handles_str_keys(self):
        ride = {"300": 320.0, "5": 900.0, "60": 400.0}
        best = {"300": 340.0, "5": 950.0, "60": 380.0}
        durations = [m.duration_s for m in match_efforts(ride, best)]
        assert durations == [5, 60, 300]

    def test_empty_ride_returns_empty(self):
        assert match_efforts({}, {60: 500.0}) == []
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_effort_matching.py -v`
Expected: FAIL with `ModuleNotFoundError: app.services.effort_matching`.

- [ ] **Step 3: Implement the module**

Create `backend/app/services/effort_matching.py`:

```python
"""Match a ride's peak efforts against the athlete's rolling-window best.

Pure module. For each duration the ride produced a mean-maximal power for,
report how it compares to the athlete's best at that duration and whether it is
a new personal best (PR). Missing prior best → PR by definition, pct None.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EffortMatch:
    duration_s: int
    ride_watts: float
    best_watts: float | None
    pct_of_best: float | None
    is_pr: bool


def _norm(curve: dict) -> dict[int, float]:
    return {int(k): float(v) for k, v in curve.items()}


def match_efforts(
    ride_mmp: dict,
    athlete_best: dict,
    *,
    pr_tolerance: float = 1.0,
) -> list[EffortMatch]:
    """Compare ride peaks to the athlete best; PR-flag durations. See docstring."""
    ride = _norm(ride_mmp)
    best = _norm(athlete_best)
    out: list[EffortMatch] = []
    for dur in sorted(ride):
        rw = ride[dur]
        bw = best.get(dur)
        if bw is None or bw <= 0:
            out.append(EffortMatch(dur, round(rw, 1), None, None, True))
        else:
            pct = round(rw / bw * 100.0, 1)
            out.append(EffortMatch(
                dur, round(rw, 1), round(bw, 1), pct, rw >= bw * pr_tolerance,
            ))
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_effort_matching.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/effort_matching.py backend/tests/services/test_effort_matching.py
git commit -m "feat(debrief): effort matching vs athlete best with PR flags"
```

---

## Self-Review

**Spec coverage (Phase 1 items delivered in this 1a batch):** `ride_segmentation` (climbs/efforts) → Task 1; `climbing_analysis` (VAM/W·kg/leaderboard inputs) → Task 2; `pacing_analysis` (splits/VI/surges/phase/zones) → Task 3; `effort_matching` (MMP-vs-best + PR flags) → Task 4. Explicitly deferred to **Phase 1b** (documented, not silently dropped): `matchbook`, `efficiency_metrics`, `durability_analysis`, `wko_power_model`, `quadrant_analysis`, `cda_estimate`, `environment` analyzer, `fueling_analysis`, `key_moments`. These consume the same streams and slot in identically.

**Placeholder scan:** none — every code step has full code. The one "confirm the real shape" note (Task 3, `coggan_power_zones`) is an explicit verification step with a tolerant default, not deferred implementation.

**Type consistency:** `Segment` fields defined in Task 1 are consumed unchanged in Task 2 (`analyze_climbs` reads `s.kind`, `s.elev_gain_m`, `s.avg_grade_pct`, `s.avg_power`, `s.duration_s`, `s.distance_m`, `s.start_s`). `mmp_curve`/`aggregate_mmp_curves` dict shapes (duration→watts) match Task 4's `_norm`. All four analyzers return frozen dataclasses / `None` / `[]` consistent with the graceful-degradation constraint.
