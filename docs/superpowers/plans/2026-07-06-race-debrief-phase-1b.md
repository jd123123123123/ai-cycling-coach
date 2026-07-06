# Race Debrief — Phase 1b: Matchbook / Efficiency / Quadrant / Fueling / Key-moments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five more pure race-analysis science services — the anaerobic matchbook, cardiac/efficiency metrics, pedaling quadrant analysis, fueling estimates, and narrative key-moment detection — building on Phase 0 streams, Phase 1a analyzers, and the existing W′-balance / decoupling services.

**Architecture:** Each analyzer is a pure function (plain inputs → frozen dataclass), no DB/network/IO, TDD, degrading to `[]`/`None` on missing input. They reuse `w_balance.w_prime_balance`, `durability.aerobic_decoupling`, `training_load.calculate_np`, and Phase 1a's `Segment`. The two modeling-heavy analyzers (`wko_power_model`, `cda_estimate`) are deferred to **Phase 1c** so their models get dedicated scrutiny; they are out of scope here.

**Tech Stack:** Python 3.12, standard-library `math`/`dataclasses` only, pytest.

## Global Constraints

- **Pure services:** no DB/network/IO. Plain inputs → plain outputs. TDD (RED→GREEN).
- **Graceful degradation:** insufficient/missing input → `[]`/`None`, never raise. Power series is assumed clean `list[float]` (no `None`); HR/cadence may be short or absent.
- **No new dependencies.** Reuse verbatim: `w_balance.w_prime_balance(power_series, cp, w_prime) -> list[float]` (per-second W′-balance in joules; starts at `w_prime`, dips toward/below 0 on hard efforts); `durability.aerobic_decoupling(power_series, hr_series) -> float | None`; `training_load.calculate_np(power_series) -> float`.
- **Estimates are labeled estimates.** Fueling substrate/deficit and quadrant force use documented approximations; never present them as measured truth. Keep formulas defensible and cite the assumption in a docstring.
- Run tests via `cd backend && .venv/bin/python -m pytest ...`. Commit after each task. Test style matches `backend/tests/services/`.

---

## File Structure

- `backend/app/services/matchbook.py` — **create**: `Match`/`Matchbook` dataclasses + `analyze_matchbook(...)`.
- `backend/app/services/efficiency_metrics.py` — **create**: `EfficiencyResult` + `analyze_efficiency(...)`.
- `backend/app/services/quadrant_analysis.py` — **create**: `QuadrantResult` + `analyze_quadrants(...)`.
- `backend/app/services/fueling_analysis.py` — **create**: `FuelingResult` + `analyze_fueling(...)`.
- `backend/app/services/key_moments.py` — **create**: `KeyMoment` + `detect_key_moments(...)`.
- Tests: matching `backend/tests/services/test_*.py` for each — **create**.

---

## Task 1: Matchbook (anaerobic matches from W′-balance)

**Files:**
- Create: `backend/app/services/matchbook.py`
- Test: `backend/tests/services/test_matchbook.py`

**Interfaces:**
- Consumes: `power_series: list[float]`, `cp: float`, `w_prime: float`; reuses `w_balance.w_prime_balance`.
- Produces:
  - `@dataclass(frozen=True) Match`: `start_s: int`, `end_s: int`, `depth_j: float` (W′ consumed from the preceding local max to the local min), `min_bal_j: float`.
  - `@dataclass(frozen=True) Matchbook`: `matches: list[Match]`, `match_count: int`, `time_above_cp_s: int`, `min_bal_j: float`, `fully_depleted: bool` (min_bal ≤ 0).
  - `analyze_matchbook(power_series, cp, w_prime, *, match_depth_frac=0.5) -> Matchbook | None`. A "match" is a W′-balance drawdown whose depth ≥ `match_depth_frac * w_prime` before the balance recovers (rises again). Returns `None` when `cp <= 0` or `w_prime <= 0` or the series is empty.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/services/test_matchbook.py`:

```python
"""Tests for anaerobic matchbook detection from W′-balance."""
from __future__ import annotations

from app.services.matchbook import Match, Matchbook, analyze_matchbook


class TestAnalyzeMatchbook:
    def test_none_on_bad_capacity(self):
        assert analyze_matchbook([300.0] * 60, cp=0.0, w_prime=20000.0) is None
        assert analyze_matchbook([300.0] * 60, cp=250.0, w_prime=0.0) is None
        assert analyze_matchbook([], cp=250.0, w_prime=20000.0) is None

    def test_easy_ride_burns_no_matches(self):
        # All power below CP → W′ stays topped up → no matches, no time above CP.
        mb = analyze_matchbook([200.0] * 600, cp=250.0, w_prime=20000.0)
        assert mb.match_count == 0
        assert mb.time_above_cp_s == 0
        assert mb.fully_depleted is False

    def test_counts_time_above_cp(self):
        power = [200.0] * 300 + [400.0] * 60 + [200.0] * 300
        mb = analyze_matchbook(power, cp=250.0, w_prime=20000.0)
        assert mb.time_above_cp_s == 60

    def test_detects_a_hard_match(self):
        # A big surge that draws down a large chunk of W′, then easy recovery.
        power = [150.0] * 120 + [500.0] * 40 + [150.0] * 300
        mb = analyze_matchbook(power, cp=250.0, w_prime=20000.0, match_depth_frac=0.3)
        assert mb.match_count >= 1
        assert mb.matches[0].depth_j > 0.3 * 20000.0

    def test_full_depletion_flagged(self):
        # Sustained way over CP with small W′ → balance goes to/below 0.
        power = [600.0] * 120
        mb = analyze_matchbook(power, cp=250.0, w_prime=10000.0)
        assert mb.fully_depleted is True
        assert mb.min_bal_j <= 0
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_matchbook.py -v`
Expected: FAIL with `ModuleNotFoundError: app.services.matchbook`.

- [ ] **Step 3: Implement the module**

Create `backend/app/services/matchbook.py`:

```python
"""Anaerobic "matchbook": discrete W′-balance drawdowns ("matches") over a ride.

Pure module. Reuses w_balance.w_prime_balance to reconstruct the per-second
anaerobic reserve, then walks it to find matches — a match is a drawdown from a
local peak reserve to a local trough of at least ``match_depth_frac`` of W′
before the reserve recovers. Also counts seconds spent above CP.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.services.w_balance import w_prime_balance


@dataclass(frozen=True)
class Match:
    start_s: int
    end_s: int
    depth_j: float
    min_bal_j: float


@dataclass(frozen=True)
class Matchbook:
    matches: list[Match]
    match_count: int
    time_above_cp_s: int
    min_bal_j: float
    fully_depleted: bool


def analyze_matchbook(
    power_series: list[float],
    cp: float,
    w_prime: float,
    *,
    match_depth_frac: float = 0.5,
) -> Matchbook | None:
    """Detect anaerobic matches from the W′-balance trace. See module docstring."""
    if cp <= 0 or w_prime <= 0 or not power_series:
        return None
    bal = w_prime_balance(power_series, cp, w_prime)
    threshold = match_depth_frac * w_prime

    matches: list[Match] = []
    peak_val = bal[0]
    peak_idx = 0
    trough_val = bal[0]
    trough_idx = 0
    descending = False
    for i, v in enumerate(bal):
        if v > peak_val and not descending:
            peak_val, peak_idx = v, i          # still topping up
            trough_val, trough_idx = v, i
        if v < trough_val:                     # drawing down
            trough_val, trough_idx = v, i
            descending = True
        # Recovery after a drawdown closes a potential match.
        if descending and v > trough_val + 1e-9:
            depth = peak_val - trough_val
            if depth >= threshold:
                matches.append(Match(
                    start_s=peak_idx, end_s=trough_idx,
                    depth_j=round(depth, 1), min_bal_j=round(trough_val, 1),
                ))
            # reset the search from the recovery point
            peak_val, peak_idx = v, i
            trough_val, trough_idx = v, i
            descending = False
    # A drawdown still open at ride end also counts.
    if descending:
        depth = peak_val - trough_val
        if depth >= threshold:
            matches.append(Match(
                start_s=peak_idx, end_s=trough_idx,
                depth_j=round(depth, 1), min_bal_j=round(trough_val, 1),
            ))

    time_above_cp = sum(1 for p in power_series if p > cp)
    min_bal = min(bal)
    return Matchbook(
        matches=matches,
        match_count=len(matches),
        time_above_cp_s=time_above_cp,
        min_bal_j=round(min_bal, 1),
        fully_depleted=min_bal <= 0,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_matchbook.py -v`
Expected: PASS (5 tests). If a match-detection test fails, confirm the W′-balance drawdown/recovery logic against `w_prime_balance`'s output shape before touching assertions — report a genuine algorithm mismatch rather than forcing green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/matchbook.py backend/tests/services/test_matchbook.py
git commit -m "feat(debrief): anaerobic matchbook from W′-balance"
```

---

## Task 2: Efficiency metrics (EF, decoupling, cardiac cost)

**Files:**
- Create: `backend/app/services/efficiency_metrics.py`
- Test: `backend/tests/services/test_efficiency_metrics.py`

**Interfaces:**
- Consumes: `power_series: list[float]`, `hr_series: list[float] | None`, optional `ftp: float | None`; reuses `calculate_np` and `aerobic_decoupling`.
- Produces:
  - `@dataclass(frozen=True) EfficiencyResult`: `efficiency_factor: float | None` (NP ÷ avg HR), `avg_hr: float | None`, `decoupling_pct: float | None`, `np_watts: float`.
  - `analyze_efficiency(power_series, hr_series=None, ftp=None) -> EfficiencyResult | None`. Returns `None` on empty power. EF/avg_hr/decoupling are `None` when HR is absent or has any non-positive/None sample.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/services/test_efficiency_metrics.py`:

```python
"""Tests for efficiency metrics (EF, decoupling, cardiac cost)."""
from __future__ import annotations

from app.services.efficiency_metrics import EfficiencyResult, analyze_efficiency


class TestAnalyzeEfficiency:
    def test_none_on_empty_power(self):
        assert analyze_efficiency([], [140.0]) is None

    def test_efficiency_factor_computed(self):
        # NP of a flat 200 W ride is 200; avg HR 140 → EF ≈ 1.43.
        res = analyze_efficiency([200.0] * 600, [140.0] * 600)
        assert res.avg_hr == 140.0
        assert abs(res.efficiency_factor - 200.0 / 140.0) < 0.02

    def test_no_hr_yields_none_ef(self):
        res = analyze_efficiency([200.0] * 600, None)
        assert res.efficiency_factor is None
        assert res.avg_hr is None
        assert res.np_watts > 0

    def test_bad_hr_sample_yields_none_ef(self):
        res = analyze_efficiency([200.0] * 600, [140.0] * 599 + [0.0])
        assert res.efficiency_factor is None

    def test_decoupling_present_with_long_hr_ride(self):
        # Second half at same power but higher HR → positive decoupling.
        power = [200.0] * 1200
        hr = [140.0] * 600 + [150.0] * 600
        res = analyze_efficiency(power, hr)
        assert res.decoupling_pct is not None
        assert res.decoupling_pct > 0
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_efficiency_metrics.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the module**

Create `backend/app/services/efficiency_metrics.py`:

```python
"""Cardiac / efficiency metrics for a ride.

Pure module. Efficiency Factor = Normalized Power ÷ average heart rate (a
cardiac-cost trend marker); decoupling reuses durability.aerobic_decoupling
(first-half vs second-half Pw:HR drift).
"""
from __future__ import annotations

from dataclasses import dataclass

from app.services.durability import aerobic_decoupling
from app.services.training_load import calculate_np


@dataclass(frozen=True)
class EfficiencyResult:
    efficiency_factor: float | None
    avg_hr: float | None
    decoupling_pct: float | None
    np_watts: float


def _clean_hr(hr_series: list[float] | None) -> list[float] | None:
    if not hr_series:
        return None
    if any(h is None or h <= 0 for h in hr_series):
        return None
    return [float(h) for h in hr_series]


def analyze_efficiency(
    power_series: list[float],
    hr_series: list[float] | None = None,
    ftp: float | None = None,
) -> EfficiencyResult | None:
    """EF, avg HR, and aerobic decoupling. None on empty power. See docstring."""
    if not power_series:
        return None
    np_watts = calculate_np(power_series)
    hr = _clean_hr(hr_series)
    if hr is None or len(hr) != len(power_series):
        return EfficiencyResult(
            efficiency_factor=None, avg_hr=None, decoupling_pct=None,
            np_watts=round(np_watts, 1),
        )
    avg_hr = sum(hr) / len(hr)
    ef = round(np_watts / avg_hr, 3) if avg_hr > 0 else None
    decoupling = aerobic_decoupling(power_series, hr)
    return EfficiencyResult(
        efficiency_factor=ef,
        avg_hr=round(avg_hr, 1),
        decoupling_pct=decoupling,
        np_watts=round(np_watts, 1),
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_efficiency_metrics.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/efficiency_metrics.py backend/tests/services/test_efficiency_metrics.py
git commit -m "feat(debrief): efficiency metrics (EF, decoupling, cardiac cost)"
```

---

## Task 3: Quadrant analysis (force × velocity)

**Files:**
- Create: `backend/app/services/quadrant_analysis.py`
- Test: `backend/tests/services/test_quadrant_analysis.py`

**Interfaces:**
- Consumes: `power_series: list[float]`, `cadence_series: list[float | None]`, optional `ftp: float | None`, `crank_length_m: float = 0.1725`.
- Produces:
  - `@dataclass(frozen=True) QuadrantResult`: `q1_pct: float` (high force / high velocity), `q2_pct: float` (high force / low velocity), `q3_pct: float` (low force / low velocity), `q4_pct: float` (low force / high velocity), `force_threshold_n: float`, `cadence_threshold_rpm: float`, `sample_count: int`.
  - `analyze_quadrants(power_series, cadence_series, *, ftp=None, cadence_threshold_rpm=85.0, crank_length_m=0.1725) -> QuadrantResult | None`. Pedal force ≈ `power / (cadence_rpm/60 * 2π * crank_length_m)`. The force threshold is the pedal force at `ftp` and the mean ride cadence (or the median force when `ftp` is None). Only samples with cadence > 0 count; returns `None` if fewer than 1 valid sample.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/services/test_quadrant_analysis.py`:

```python
"""Tests for pedaling quadrant analysis (force × velocity)."""
from __future__ import annotations

from app.services.quadrant_analysis import QuadrantResult, analyze_quadrants


class TestAnalyzeQuadrants:
    def test_none_without_valid_cadence(self):
        assert analyze_quadrants([200.0] * 60, [0.0] * 60) is None
        assert analyze_quadrants([200.0] * 60, [None] * 60) is None

    def test_quadrant_percentages_sum_to_100(self):
        power = [150.0, 350.0, 150.0, 350.0] * 60
        cad = [95.0, 95.0, 70.0, 70.0] * 60
        res = analyze_quadrants(power, cad, ftp=250.0)
        total = res.q1_pct + res.q2_pct + res.q3_pct + res.q4_pct
        assert abs(total - 100.0) < 0.5

    def test_high_force_low_cadence_lands_in_q2(self):
        # High power at low cadence = high force, low velocity → Q2 dominant.
        power = [400.0] * 200
        cad = [60.0] * 200
        res = analyze_quadrants(power, cad, ftp=200.0, cadence_threshold_rpm=85.0)
        assert res.q2_pct > res.q1_pct
        assert res.q2_pct > res.q4_pct

    def test_high_cadence_low_force_lands_in_q4(self):
        power = [120.0] * 200
        cad = [100.0] * 200
        res = analyze_quadrants(power, cad, ftp=300.0, cadence_threshold_rpm=85.0)
        assert res.q4_pct > res.q2_pct

    def test_ignores_none_and_zero_cadence_samples(self):
        power = [200.0] * 6
        cad = [90.0, None, 0.0, 90.0, 90.0, None]
        res = analyze_quadrants(power, cad, ftp=250.0)
        assert res.sample_count == 3
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_quadrant_analysis.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the module**

Create `backend/app/services/quadrant_analysis.py`:

```python
"""Pedaling quadrant analysis: pedal force vs circumferential pedal velocity.

Pure module. Average effective pedal force ≈ power / pedal speed, where pedal
speed = (cadence_rpm/60) · 2π · crank_length. Samples split into four quadrants
about a force threshold (pedal force at FTP & mean cadence) and a cadence
threshold: Q1 hi-force/hi-cadence (attacks), Q2 hi-force/lo-cadence (grinding),
Q3 lo/lo (easy), Q4 lo-force/hi-cadence (spinning). Approximate — treats total
power as pedal force; for rider-context, not lab biomechanics.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

_TWO_PI = 2.0 * math.pi


@dataclass(frozen=True)
class QuadrantResult:
    q1_pct: float
    q2_pct: float
    q3_pct: float
    q4_pct: float
    force_threshold_n: float
    cadence_threshold_rpm: float
    sample_count: int


def _pedal_force(power: float, cadence_rpm: float, crank_length_m: float) -> float:
    pedal_speed = (cadence_rpm / 60.0) * _TWO_PI * crank_length_m
    return power / pedal_speed if pedal_speed > 0 else 0.0


def analyze_quadrants(
    power_series: list[float],
    cadence_series: list[float | None],
    *,
    ftp: float | None = None,
    cadence_threshold_rpm: float = 85.0,
    crank_length_m: float = 0.1725,
) -> QuadrantResult | None:
    """Force×velocity quadrant shares. See module docstring. None if no cadence."""
    pairs = [
        (p, float(c))
        for p, c in zip(power_series, cadence_series)
        if c is not None and c > 0
    ]
    if not pairs:
        return None
    forces = [_pedal_force(p, c, crank_length_m) for p, c in pairs]
    mean_cad = sum(c for _, c in pairs) / len(pairs)
    if ftp and ftp > 0:
        force_threshold = _pedal_force(ftp, mean_cad, crank_length_m)
    else:
        force_threshold = sorted(forces)[len(forces) // 2]  # median

    q = [0, 0, 0, 0]
    for (p, c), f in zip(pairs, forces):
        hi_force = f >= force_threshold
        hi_cad = c >= cadence_threshold_rpm
        if hi_force and hi_cad:
            q[0] += 1
        elif hi_force and not hi_cad:
            q[1] += 1
        elif not hi_force and not hi_cad:
            q[2] += 1
        else:
            q[3] += 1
    n = len(pairs)
    return QuadrantResult(
        q1_pct=round(q[0] / n * 100.0, 1),
        q2_pct=round(q[1] / n * 100.0, 1),
        q3_pct=round(q[2] / n * 100.0, 1),
        q4_pct=round(q[3] / n * 100.0, 1),
        force_threshold_n=round(force_threshold, 1),
        cadence_threshold_rpm=cadence_threshold_rpm,
        sample_count=n,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_quadrant_analysis.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/quadrant_analysis.py backend/tests/services/test_quadrant_analysis.py
git commit -m "feat(debrief): pedaling quadrant analysis (force × velocity)"
```

---

## Task 4: Fueling analysis (kJ, carb target, substrate, deficit)

**Files:**
- Create: `backend/app/services/fueling_analysis.py`
- Test: `backend/tests/services/test_fueling_analysis.py`

**Interfaces:**
- Consumes: `power_series: list[float]`, optional `if_: float | None` (intensity factor), `durability_drop_pct: float | None`, `decoupling_pct: float | None`.
- Produces:
  - `@dataclass(frozen=True) FuelingResult`: `total_kj: float`, `total_kcal: float`, `cho_g_estimate: float`, `fat_g_estimate: float`, `carb_target_g_per_h: tuple[float, float]` (recommended intake band, e.g. (90, 120) for hard/long), `duration_h: float`, `likely_underfueled: bool | None`, `note: str`.
  - `analyze_fueling(power_series, if_=None, durability_drop_pct=None, decoupling_pct=None) -> FuelingResult | None`. Returns `None` on empty power. **Documented approximations:** mechanical kJ ≈ dietary kcal (cycling gross efficiency ≈ 24% makes 1 kJ work ≈ 1 kcal expended); CHO fraction of energy rises with intensity (piecewise on `if_`); `likely_underfueled` is True when a long ride shows high durability drop AND elevated decoupling (the classic bonk signature), None when those inputs are absent.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/services/test_fueling_analysis.py`:

```python
"""Tests for fueling analysis (kJ, carbs, substrate, deficit)."""
from __future__ import annotations

from app.services.fueling_analysis import FuelingResult, analyze_fueling


class TestAnalyzeFueling:
    def test_none_on_empty(self):
        assert analyze_fueling([]) is None

    def test_kj_and_kcal_from_power(self):
        # 200 W for 3600 s = 720000 J = 720 kJ ≈ 720 kcal.
        res = analyze_fueling([200.0] * 3600)
        assert abs(res.total_kj - 720.0) < 1.0
        assert abs(res.total_kcal - 720.0) < 5.0
        assert abs(res.duration_h - 1.0) < 0.01

    def test_higher_intensity_shifts_to_more_carbs(self):
        low = analyze_fueling([200.0] * 3600, if_=0.5)
        high = analyze_fueling([200.0] * 3600, if_=0.95)
        assert high.cho_g_estimate > low.cho_g_estimate
        assert high.fat_g_estimate < low.fat_g_estimate

    def test_carb_target_band_is_high_for_hard_ride(self):
        res = analyze_fueling([250.0] * 3600, if_=0.9)
        lo, hi = res.carb_target_g_per_h
        assert lo >= 60.0 and hi <= 120.0 and hi > lo

    def test_underfuel_flag_on_bonk_signature(self):
        res = analyze_fueling(
            [220.0] * 7200, if_=0.8, durability_drop_pct=18.0, decoupling_pct=9.0
        )
        assert res.likely_underfueled is True

    def test_underfuel_none_without_signals(self):
        res = analyze_fueling([220.0] * 3600, if_=0.8)
        assert res.likely_underfueled is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_fueling_analysis.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the module**

Create `backend/app/services/fueling_analysis.py`:

```python
"""Fueling analysis: energy expenditure, carb target, substrate split, deficit.

Pure module. DOCUMENTED APPROXIMATIONS (labeled estimates, not measurements):
- Energy: mechanical kJ ≈ dietary kcal (cycling gross efficiency ≈ 24% means
  ~1 kcal metabolic per 1 kJ of work — the standard field shortcut).
- Substrate: the carbohydrate fraction of energy rises with intensity; modeled
  piecewise on IF (fat-dominant easy → carb-dominant near/above threshold).
- Underfueling: a long ride with both high durability drop and elevated
  decoupling is the classic glycogen-depletion ("bonk") signature.
"""
from __future__ import annotations

from dataclasses import dataclass

_KCAL_PER_G_CHO = 4.0
_KCAL_PER_G_FAT = 9.0


def _cho_fraction(if_: float | None) -> float:
    """Fraction of energy from carbohydrate, rising with intensity."""
    if if_ is None:
        return 0.6                       # unknown → moderate default
    if if_ <= 0.55:
        return 0.35
    if if_ >= 0.95:
        return 0.95
    # linear ramp between the anchors
    return 0.35 + (if_ - 0.55) * (0.95 - 0.35) / (0.95 - 0.55)


def _carb_target_band(if_: float | None, duration_h: float) -> tuple[float, float]:
    """Recommended carb intake band (g/h). Hard/long → 90–120; easy/short → lower."""
    if (if_ is not None and if_ >= 0.85) or duration_h >= 3.0:
        return (90.0, 120.0)
    if if_ is not None and if_ >= 0.7:
        return (60.0, 90.0)
    return (30.0, 60.0)


@dataclass(frozen=True)
class FuelingResult:
    total_kj: float
    total_kcal: float
    cho_g_estimate: float
    fat_g_estimate: float
    carb_target_g_per_h: tuple[float, float]
    duration_h: float
    likely_underfueled: bool | None
    note: str


def analyze_fueling(
    power_series: list[float],
    if_: float | None = None,
    durability_drop_pct: float | None = None,
    decoupling_pct: float | None = None,
) -> FuelingResult | None:
    """Energy + fueling estimates for a ride. None on empty power. See docstring."""
    if not power_series:
        return None
    total_kj = sum(power_series) / 1000.0
    total_kcal = total_kj                       # ≈ 1:1 (see docstring)
    duration_h = len(power_series) / 3600.0

    cho_frac = _cho_fraction(if_)
    cho_g = total_kcal * cho_frac / _KCAL_PER_G_CHO
    fat_g = total_kcal * (1.0 - cho_frac) / _KCAL_PER_G_FAT
    band = _carb_target_band(if_, duration_h)

    if durability_drop_pct is not None and decoupling_pct is not None:
        underfueled = (
            duration_h >= 1.5 and durability_drop_pct >= 12.0 and decoupling_pct >= 6.0
        )
    else:
        underfueled = None

    if underfueled:
        note = "High late-ride fade with cardiac drift — likely ran low on carbs."
    elif underfueled is False:
        note = "No strong under-fueling signature."
    else:
        note = "Fueling estimate only; connect fatigue signals for a deficit read."

    return FuelingResult(
        total_kj=round(total_kj, 1),
        total_kcal=round(total_kcal, 0),
        cho_g_estimate=round(cho_g, 0),
        fat_g_estimate=round(fat_g, 0),
        carb_target_g_per_h=band,
        duration_h=round(duration_h, 2),
        likely_underfueled=underfueled,
        note=note,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_fueling_analysis.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/fueling_analysis.py backend/tests/services/test_fueling_analysis.py
git commit -m "feat(debrief): fueling analysis (kJ, carb target, substrate, deficit)"
```

---

## Task 5: Key-moment detection (the narrative beats)

**Files:**
- Create: `backend/app/services/key_moments.py`
- Test: `backend/tests/services/test_key_moments.py`

**Interfaces:**
- Consumes: `power_series: list[float]`, optional `wbal_series: list[float] | None` (per-second W′-balance from `w_balance.w_prime_balance`), optional `hr_series: list[float] | None`.
- Produces:
  - `@dataclass(frozen=True) KeyMoment`: `kind: str` (`"biggest_match"|"best_effort"|"crack_point"|"strongest_finish"`), `at_s: int`, `label: str`, `value: float`, `tone: str` (`"good"|"bad"|"neutral"`).
  - `detect_key_moments(power_series, wbal_series=None, hr_series=None) -> list[KeyMoment]`. Emits at most one of each kind, only when detectable; returns `[]` on empty power. `best_effort` = timestamp of the highest 60 s rolling average (or whole ride if shorter); `biggest_match` = index of the global W′-balance minimum (when `wbal_series` given); `strongest_finish` = final-5-min avg power when it exceeds the ride average (tone good); `crack_point` = start of the largest sustained second-half power drop (tone bad) when present.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/services/test_key_moments.py`:

```python
"""Tests for narrative key-moment detection."""
from __future__ import annotations

from app.services.key_moments import KeyMoment, detect_key_moments


class TestDetectKeyMoments:
    def test_empty_returns_empty(self):
        assert detect_key_moments([]) == []

    def test_best_effort_located(self):
        # A clear 60 s spike in the middle should be the best effort.
        power = [150.0] * 300 + [450.0] * 60 + [150.0] * 300
        moments = {m.kind: m for m in detect_key_moments(power)}
        assert "best_effort" in moments
        assert 300 <= moments["best_effort"].at_s <= 360

    def test_biggest_match_from_wbal(self):
        power = [200.0] * 600
        wbal = [20000.0] * 200 + [500.0] + [20000.0] * 399  # global min at idx 200
        moments = {m.kind: m for m in detect_key_moments(power, wbal_series=wbal)}
        assert moments["biggest_match"].at_s == 200
        assert moments["biggest_match"].tone == "bad"

    def test_strongest_finish_when_ending_hard(self):
        power = [150.0] * 600 + [300.0] * 300  # last 5 min well above ride avg
        moments = {m.kind: m for m in detect_key_moments(power)}
        assert "strongest_finish" in moments
        assert moments["strongest_finish"].tone == "good"

    def test_no_strongest_finish_when_fading(self):
        power = [300.0] * 600 + [150.0] * 300  # finishes below average
        moments = {m.kind: m for m in detect_key_moments(power)}
        assert "strongest_finish" not in moments
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_key_moments.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the module**

Create `backend/app/services/key_moments.py`:

```python
"""Detect the narrative beats of a ride for the debrief timeline & AI verdict.

Pure module. Each beat is emitted at most once and only when detectable:
best effort (peak 60 s power), biggest match (global W′-balance trough),
strongest finish (final 5 min above ride average), crack point (largest
sustained second-half power drop).
"""
from __future__ import annotations

from dataclasses import dataclass

_EFFORT_WINDOW_S = 60
_FINISH_WINDOW_S = 300


@dataclass(frozen=True)
class KeyMoment:
    kind: str
    at_s: int
    label: str
    value: float
    tone: str


def _rolling_max_window(power: list[float], window: int) -> tuple[int, float]:
    """(start index, average) of the highest `window`-second rolling average."""
    n = len(power)
    w = min(window, n)
    running = sum(power[:w])
    best_sum, best_i = running, 0
    for i in range(1, n - w + 1):
        running += power[i + w - 1] - power[i - 1]
        if running > best_sum:
            best_sum, best_i = running, i
    return best_i, best_sum / w


def detect_key_moments(
    power_series: list[float],
    wbal_series: list[float] | None = None,
    hr_series: list[float] | None = None,
) -> list[KeyMoment]:
    """Narrative beats for the debrief. See module docstring. [] on empty power."""
    n = len(power_series)
    if n == 0:
        return []
    moments: list[KeyMoment] = []

    # Best effort — peak 60 s (or whole ride if shorter).
    eff_i, eff_avg = _rolling_max_window(power_series, _EFFORT_WINDOW_S)
    moments.append(KeyMoment(
        kind="best_effort", at_s=eff_i,
        label="Best 60-second effort", value=round(eff_avg, 1), tone="good",
    ))

    # Biggest match — global W′-balance trough.
    if wbal_series:
        min_idx = min(range(len(wbal_series)), key=lambda i: wbal_series[i])
        moments.append(KeyMoment(
            kind="biggest_match", at_s=min_idx,
            label="Deepest anaerobic drawdown",
            value=round(wbal_series[min_idx], 1), tone="bad",
        ))

    # Strongest finish — final 5 min above the ride average.
    ride_avg = sum(power_series) / n
    if n >= _FINISH_WINDOW_S:
        finish_avg = sum(power_series[-_FINISH_WINDOW_S:]) / _FINISH_WINDOW_S
        if finish_avg > ride_avg:
            moments.append(KeyMoment(
                kind="strongest_finish", at_s=n - _FINISH_WINDOW_S,
                label="Strong finish", value=round(finish_avg, 1), tone="good",
            ))

    # Crack point — biggest drop between the strongest and a later weaker 5-min block.
    if n >= 2 * _FINISH_WINDOW_S:
        blocks = [
            (i, sum(power_series[i:i + _FINISH_WINDOW_S]) / _FINISH_WINDOW_S)
            for i in range(0, n - _FINISH_WINDOW_S + 1, _FINISH_WINDOW_S)
        ]
        peak_i, peak_v = max(enumerate(blocks), key=lambda t: t[1][1])[1]
        after = [b for b in blocks if b[0] > peak_i]
        if after:
            trough_i, trough_v = min(after, key=lambda b: b[1])
            if peak_v > 0 and (peak_v - trough_v) / peak_v >= 0.15:
                moments.append(KeyMoment(
                    kind="crack_point", at_s=trough_i,
                    label="Power dropped off here",
                    value=round((peak_v - trough_v) / peak_v * 100.0, 1), tone="bad",
                ))
    return moments
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_key_moments.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full service suite + commit**

Run: `cd backend && .venv/bin/python -m pytest tests/services/ -q` (expect all green, no regressions).

```bash
git add backend/app/services/key_moments.py backend/tests/services/test_key_moments.py
git commit -m "feat(debrief): narrative key-moment detection"
```

---

## Self-Review

**Spec coverage (Phase 1b items):** `matchbook` → Task 1; `efficiency_metrics` → Task 2; `quadrant_analysis` → Task 3; `fueling_analysis` → Task 4; `key_moments` → Task 5. Explicitly deferred to **Phase 1c** (documented, not dropped): `wko_power_model` (mFTP/TTE/Pmax/FRC/VO₂max/Stamina fit) and `cda_estimate` + the `environment` GAP/wind analyzer — both need dedicated modeling review.

**Placeholder scan:** none — every code step has full code. The "confirm the W′-balance drawdown logic" note (Task 1) is a verification instruction, not deferred work.

**Type consistency:** `w_prime_balance(power, cp, w_prime) -> list[float]` (Task 1, Task 5's `wbal_series`), `aerobic_decoupling(power, hr) -> float | None` (Task 2), and `calculate_np` (Tasks 2) match their real signatures verified in `w_balance.py` / `durability.py` / `training_load.py`. All five analyzers return frozen dataclasses or `None`/`[]` per the graceful-degradation constraint. Power-channel `None`-tolerance remains the integration-seam responsibility flagged by Phase 1a's review (Phase 2 wiring cleans power before these run).
