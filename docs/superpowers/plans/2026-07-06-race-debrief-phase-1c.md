# Race Debrief — Phase 1c: WKO power-duration model + CdA estimate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the two modeling-heavy pure analyzers deferred from Phase 1b — a WKO-style power-duration model (mFTP, Pmax, FRC, TTE, VO₂max estimate on top of the existing CP fit) and a steady-state aerodynamic drag-area (CdA) estimate — both conservative, honestly labeled as estimates, and degrading to `None` on insufficient/noisy data.

**Architecture:** Two pure functions. `wko_power_model` builds on the existing `critical_power.fit_critical_power` (2-parameter CP model) plus the raw MMP curve; `cda_estimate` solves the cycling power balance per 1 Hz sample over clean steady-state sections. Both return frozen dataclasses or `None`. No new dependencies (numpy already used by `critical_power`).

**Tech Stack:** Python 3.12, `numpy` (already a dependency, used by `critical_power`), `math`/`dataclasses`, pytest.

## Global Constraints

- **Pure services:** no DB/network/IO. TDD (RED→GREEN).
- **Graceful degradation:** insufficient/under-determined/too-noisy input → `None`, never raise.
- **Honesty:** every derived quantity that is an approximation is labeled as an estimate in the docstring and (where user-facing) in the field name. No number is presented as measured when it is modeled.
- **1 Hz assumption:** all series are 1 sample/second (the app's stored streams). Power is a clean `list[float]` (no `None`); speed/altitude may contain `None`.
- **No new dependencies.** Reuse `critical_power.fit_critical_power(mmp) -> CriticalPowerFit|None` (fields `cp_watts`, `w_prime_j`, `eftp_watts`, `n_points`, `r_squared`).
- Run tests via `cd backend && .venv/bin/python -m pytest ...`. Commit after each task. Test style matches `backend/tests/services/`.

---

## File Structure

- `backend/app/services/wko_power_model.py` — **create**: `WkoPowerModel` dataclass + `fit_wko_model(...)`.
- `backend/app/services/cda_estimate.py` — **create**: `CdaResult` dataclass + `estimate_cda(...)`.
- Tests: `backend/tests/services/test_wko_power_model.py`, `test_cda_estimate.py` — **create**.

---

## Task 1: WKO power-duration model

**Files:**
- Create: `backend/app/services/wko_power_model.py`
- Test: `backend/tests/services/test_wko_power_model.py`

**Interfaces:**
- Consumes: `mmp: dict[int, float]` (mean-maximal power by duration-seconds), optional `mass_kg: float | None`; reuses `critical_power.fit_critical_power`.
- Produces:
  - `@dataclass(frozen=True) WkoPowerModel`: `mftp_watts: float` (modeled FTP = CP-model eFTP), `cp_watts: float`, `w_prime_j: float`, `frc_j: float` (functional reserve capacity ≡ W′), `pmax_watts: float` (best power at ≤5 s), `tte_s: int | None` (longest MMP duration held at or above mFTP — the empirical time-to-exhaustion near FTP), `vo2max_estimate: float | None` (ml·kg⁻¹·min⁻¹ from 5-min power + mass; ACSM-style approximation), `r_squared: float`.
  - `fit_wko_model(mmp, mass_kg=None) -> WkoPowerModel | None`. Returns `None` when `fit_critical_power` returns `None` (under-determined CP).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/services/test_wko_power_model.py`:

```python
"""Tests for the WKO-style power-duration model."""
from __future__ import annotations

from app.services.wko_power_model import WkoPowerModel, fit_wko_model


def _synthetic_mmp(cp: float, w_prime: float) -> dict[int, float]:
    """MMP curve from a known CP/W′: P(t) = cp + w_prime/t, plus a sprint point."""
    mmp = {t: cp + w_prime / t for t in (120, 180, 300, 480, 600, 720, 1200)}
    mmp[5] = 1000.0   # neuromuscular sprint, above the CP band
    mmp[1] = 1200.0
    return mmp


class TestFitWkoModel:
    def test_none_when_cp_underdetermined(self):
        # Only one point in the CP band → fit_critical_power returns None.
        assert fit_wko_model({300: 320.0}) is None

    def test_recovers_cp_and_wprime(self):
        model = fit_wko_model(_synthetic_mmp(250.0, 20000.0))
        assert abs(model.cp_watts - 250.0) < 2.0
        assert abs(model.w_prime_j - 20000.0) < 500.0
        assert model.frc_j == model.w_prime_j

    def test_pmax_from_shortest_efforts(self):
        model = fit_wko_model(_synthetic_mmp(250.0, 20000.0))
        assert model.pmax_watts == 1200.0   # best power at <=5 s

    def test_mftp_equals_eftp(self):
        model = fit_wko_model(_synthetic_mmp(250.0, 20000.0))
        # eFTP = CP + W'/3600 ≈ 250 + 5.6
        assert abs(model.mftp_watts - (250.0 + 20000.0 / 3600.0)) < 1.0

    def test_tte_is_longest_duration_at_or_above_mftp(self):
        model = fit_wko_model(_synthetic_mmp(250.0, 20000.0))
        # On this curve every band point > mFTP up to 1200 s → tte at least 1200.
        assert model.tte_s is not None
        assert model.tte_s >= 1200

    def test_vo2max_none_without_mass(self):
        assert fit_wko_model(_synthetic_mmp(250.0, 20000.0)).vo2max_estimate is None

    def test_vo2max_estimated_with_mass(self):
        model = fit_wko_model(_synthetic_mmp(250.0, 20000.0), mass_kg=70.0)
        assert model.vo2max_estimate is not None
        assert 30.0 < model.vo2max_estimate < 90.0  # physiological range
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_wko_power_model.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the module**

Create `backend/app/services/wko_power_model.py`:

```python
"""WKO-style power-duration model: the hero-bar quantities on top of the CP fit.

Builds on critical_power.fit_critical_power (2-parameter CP/W′ model) and the
raw MMP curve. Reports:
  - mFTP  — modeled FTP (the CP model's eFTP = CP + W′/3600).
  - CP / W′ / FRC — asymptotic power, anaerobic work capacity (FRC ≡ W′).
  - Pmax  — best power at ≤5 s (neuromuscular ceiling).
  - TTE   — empirical time-to-exhaustion near FTP: the longest MMP duration the
            athlete actually held at or above mFTP.
  - VO₂max estimate — from 5-min power and body mass, an ACSM-style
            approximation (labeled estimate, NOT a lab measurement).

Pure module. All quantities beyond CP/W′ are modeled estimates.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.services.critical_power import fit_critical_power

_PMAX_MAX_DURATION_S = 5
_VO2_5MIN_DURATION_S = 300


@dataclass(frozen=True)
class WkoPowerModel:
    mftp_watts: float
    cp_watts: float
    w_prime_j: float
    frc_j: float
    pmax_watts: float
    tte_s: int | None
    vo2max_estimate: float | None
    r_squared: float


def _pmax(mmp: dict[int, float]) -> float:
    short = [p for t, p in mmp.items() if t <= _PMAX_MAX_DURATION_S and p is not None]
    if short:
        return round(max(short), 1)
    # No sub-5s point → fall back to the highest power at the shortest duration.
    shortest_t = min(mmp)
    return round(mmp[shortest_t], 1)


def _tte(mmp: dict[int, float], mftp: float) -> int | None:
    at_or_above = [t for t, p in mmp.items() if p is not None and p >= mftp]
    return max(at_or_above) if at_or_above else None


def _vo2max(mmp: dict[int, float], mass_kg: float | None) -> float | None:
    # ACSM-style: VO2 (ml/kg/min) ≈ 10.8 · W / kg + 7, applied to 5-min max power
    # as a VO2max proxy. Requires a ~5-min effort and body mass.
    if not mass_kg or mass_kg <= 0:
        return None
    p5 = mmp.get(_VO2_5MIN_DURATION_S)
    if p5 is None:
        # nearest duration within 60 s of 5 min, if present
        near = [(abs(t - _VO2_5MIN_DURATION_S), p) for t, p in mmp.items()
                if p is not None and abs(t - _VO2_5MIN_DURATION_S) <= 60]
        if not near:
            return None
        p5 = min(near, key=lambda x: x[0])[1]
    return round(10.8 * p5 / mass_kg + 7.0, 1)


def fit_wko_model(mmp: dict[int, float], mass_kg: float | None = None) -> WkoPowerModel | None:
    """Fit the WKO-style hero-bar quantities. None when CP is under-determined."""
    cp_fit = fit_critical_power(mmp)
    if cp_fit is None:
        return None
    mftp = cp_fit.eftp_watts
    return WkoPowerModel(
        mftp_watts=mftp,
        cp_watts=cp_fit.cp_watts,
        w_prime_j=cp_fit.w_prime_j,
        frc_j=cp_fit.w_prime_j,
        pmax_watts=_pmax(mmp),
        tte_s=_tte(mmp, mftp),
        vo2max_estimate=_vo2max(mmp, mass_kg),
        r_squared=cp_fit.r_squared,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_wko_power_model.py -v`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/wko_power_model.py backend/tests/services/test_wko_power_model.py
git commit -m "feat(debrief): WKO-style power-duration model (mFTP/Pmax/FRC/TTE/VO2max)"
```

---

## Task 2: CdA estimate (steady-state aerodynamics)

**Files:**
- Create: `backend/app/services/cda_estimate.py`
- Test: `backend/tests/services/test_cda_estimate.py`

**Interfaces:**
- Consumes: `power_series: list[float]`, `speed_series: list[float | None]` (m/s), `altitude_series: list[float | None]` (m), `mass_kg: float`, optional `air_density: float = 1.225`, `crr: float = 0.005`, `headwind_ms: float = 0.0`, `drivetrain_eff: float = 0.97`.
- Produces:
  - `@dataclass(frozen=True) CdaResult`: `cda_m2: float`, `sample_count: int`, `avg_speed_ms: float`.
  - `estimate_cda(power_series, speed_series, altitude_series, mass_kg, *, air_density=1.225, crr=0.005, headwind_ms=0.0, drivetrain_eff=0.97, min_speed_ms=5.0, max_accel_ms2=0.1, min_samples=30) -> CdaResult | None`. Solves the cycling power balance per 1 Hz sample over clean steady-state samples (fast enough, near-zero acceleration, positive aero power) and returns the **median** CdA. Returns `None` when `mass_kg <= 0` or fewer than `min_samples` clean samples.

The per-sample power balance (power measured at the pedals):

```
P_wheel = P_pedal · drivetrain_eff
P_roll  = Crr · m · g · v
P_grav  = m · g · (Δaltitude per second)        # = m·g·sin(θ)·v since Δalt/s = v·sinθ
P_kin   = m · a · v                             # a = Δspeed per second
P_aero  = P_wheel − P_roll − P_grav − P_kin
CdA     = P_aero / (0.5 · ρ · (v + headwind)² · v)
```

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/services/test_cda_estimate.py`:

```python
"""Tests for steady-state CdA estimation."""
from __future__ import annotations

from app.services.cda_estimate import CdaResult, estimate_cda

_G = 9.80665


def _flat_steady_power(cda, v, mass, rho=1.225, crr=0.005, eff=0.97):
    """Pedal power that a rider with `cda` holds at steady `v` on the flat."""
    p_aero = 0.5 * rho * cda * v ** 3
    p_roll = crr * mass * _G * v
    return (p_aero + p_roll) / eff


class TestEstimateCda:
    def test_none_on_bad_mass(self):
        assert estimate_cda([200.0] * 60, [10.0] * 60, [100.0] * 60, mass_kg=0.0) is None

    def test_none_when_too_few_clean_samples(self):
        # All below min_speed → no clean samples.
        assert estimate_cda([200.0] * 60, [2.0] * 60, [100.0] * 60, mass_kg=75.0) is None

    def test_recovers_known_cda_on_flat_steady(self):
        cda, v, mass = 0.30, 10.0, 75.0
        p = _flat_steady_power(cda, v, mass)
        n = 120
        res = estimate_cda([p] * n, [v] * n, [100.0] * n, mass_kg=mass)
        assert res is not None
        assert abs(res.cda_m2 - cda) < 0.01
        assert res.sample_count > 30

    def test_ignores_accelerating_samples(self):
        cda, mass = 0.30, 75.0
        # ramping speed → non-zero acceleration → excluded; only steady tail counts.
        speeds = [5.0 + 0.5 * i for i in range(20)] + [12.0] * 100  # accel then steady
        alt = [100.0] * len(speeds)
        power = [_flat_steady_power(cda, s, mass) for s in speeds]
        res = estimate_cda(power, speeds, alt, mass_kg=mass, max_accel_ms2=0.1)
        assert res is not None
        assert abs(res.cda_m2 - cda) < 0.02

    def test_gravity_term_on_a_climb_is_handled(self):
        # Riding uphill (altitude rising) at steady speed: gravity dominates,
        # small residual aero. Estimator must not blow up or go negative wildly.
        cda, v, mass = 0.32, 8.0, 75.0
        rho, crr, eff = 1.225, 0.005, 0.97
        vert = 0.4  # m/s vertical (climbing)
        p_aero = 0.5 * rho * cda * v ** 3
        p_roll = crr * mass * _G * v
        p_grav = mass * _G * vert
        p = (p_aero + p_roll + p_grav) / eff
        n = 120
        alt = [100.0 + vert * i for i in range(n)]
        res = estimate_cda([p] * n, [v] * n, alt, mass_kg=mass)
        assert res is not None
        assert abs(res.cda_m2 - cda) < 0.03
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_cda_estimate.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement the module**

Create `backend/app/services/cda_estimate.py`:

```python
"""Steady-state aerodynamic drag-area (CdA) estimate from the power balance.

Pure module. Over clean 1 Hz samples (fast enough, near-zero acceleration,
positive residual aero power) it inverts the cycling power equation per second
and returns the MEDIAN CdA — robust to the noisy tails. This is an ESTIMATE:
without a wind sensor and precise rolling resistance it carries real
uncertainty; treat it as directional, not a wind-tunnel figure. Returns None
when the data can't support a fit.
"""
from __future__ import annotations

from dataclasses import dataclass

_G = 9.80665


@dataclass(frozen=True)
class CdaResult:
    cda_m2: float
    sample_count: int
    avg_speed_ms: float


def _median(xs: list[float]) -> float:
    s = sorted(xs)
    n = len(s)
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2.0


def estimate_cda(
    power_series: list[float],
    speed_series: list[float | None],
    altitude_series: list[float | None],
    mass_kg: float,
    *,
    air_density: float = 1.225,
    crr: float = 0.005,
    headwind_ms: float = 0.0,
    drivetrain_eff: float = 0.97,
    min_speed_ms: float = 5.0,
    max_accel_ms2: float = 0.1,
    min_samples: int = 30,
) -> CdaResult | None:
    """Median CdA over clean steady-state samples. None if unsupported. See docstring."""
    if mass_kg <= 0:
        return None
    n = min(len(power_series), len(speed_series), len(altitude_series))
    cdas: list[float] = []
    speeds_used: list[float] = []
    for i in range(1, n):
        v = speed_series[i]
        v_prev = speed_series[i - 1]
        alt = altitude_series[i]
        alt_prev = altitude_series[i - 1]
        if v is None or v_prev is None or alt is None or alt_prev is None:
            continue
        if v < min_speed_ms:
            continue
        accel = v - v_prev                     # m/s per 1 s
        if abs(accel) > max_accel_ms2:
            continue
        vert_rate = alt - alt_prev             # m/s vertical
        p_wheel = power_series[i] * drivetrain_eff
        p_roll = crr * mass_kg * _G * v
        p_grav = mass_kg * _G * vert_rate
        p_kin = mass_kg * accel * v
        p_aero = p_wheel - p_roll - p_grav - p_kin
        if p_aero <= 0:
            continue
        air_speed = v + headwind_ms
        denom = 0.5 * air_density * air_speed * air_speed * v
        if denom <= 0:
            continue
        cdas.append(p_aero / denom)
        speeds_used.append(v)
    if len(cdas) < min_samples:
        return None
    return CdaResult(
        cda_m2=round(_median(cdas), 4),
        sample_count=len(cdas),
        avg_speed_ms=round(sum(speeds_used) / len(speeds_used), 2),
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_cda_estimate.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full service suite + commit**

Run: `cd backend && .venv/bin/python -m pytest tests/services/ -q` (expect all green).

```bash
git add backend/app/services/cda_estimate.py backend/tests/services/test_cda_estimate.py
git commit -m "feat(debrief): steady-state CdA estimate from the power balance"
```

---

## Self-Review

**Spec coverage:** `wko_power_model` (mFTP/TTE/Pmax/FRC/VO₂max) → Task 1; `cda_estimate` (aero) → Task 2. These complete the Phase 1 analyzer set from the design spec; the `environment` GAP/wind analyzer's primitives already shipped in Phase 0 (`environment.air_density`/`relative_wind`) and are wired in Phase 2.

**Placeholder scan:** none — full code in every step.

**Type consistency:** `fit_critical_power` fields (`cp_watts`, `w_prime_j`, `eftp_watts`, `r_squared`) consumed correctly in Task 1 (verified against `critical_power.py`). Both analyzers return frozen dataclasses or `None`. All estimates labeled in docstrings; VO₂max/CdA carry explicit estimate framing.
