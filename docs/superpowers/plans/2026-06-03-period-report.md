# Period Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a periodized "Period Report" surface (7/14/30/custom-day window) that grades the athlete, shows a body-system radar, lists significant improvements and weaknesses vs the previous equal window, surfaces streaks/milestones, and offers a short AI verdict — plain-first, science-on-tap.

**Architecture:** A new backend service `period_report.py` with a **pure, DB-free scoring core** (unit-tested) wrapped by a thin DB layer that fetches the current and previous-equal windows by reusing existing query helpers (`pmc_window_summary`, `compute_activity_metrics`, direct `DailyMetric`/`Activity` queries). One new REST route on the already-registered analytics router returns a single `PeriodReport`. The frontend adds a 5th dashboard tab `report` with a window toggle, grade hero, ECharts radar, delta cards, and a milestone strip.

**Tech Stack:** FastAPI + SQLAlchemy async + Pydantic (backend), pytest (asyncio_mode=auto), React 19 + TanStack Query + ECharts + Tailwind v4 (frontend), Anthropic SDK for the optional AI verdict (graceful rule-based fallback).

---

## File Structure

**Backend (create):**
- `backend/app/schemas/period_report.py` — Pydantic response models.
- `backend/app/services/period_report.py` — pure scoring core + `WindowMetrics` dataclass + DB-backed `build_report`.
- `backend/tests/test_period_report.py` — unit tests for the pure core.

**Backend (modify):**
- `backend/app/api/analytics.py` — add `GET /analytics/period-report`.

**Frontend (create):**
- `frontend/src/api/report.ts` — types + fetch.
- `frontend/src/hooks/usePeriodReport.ts` — react-query hook.
- `frontend/src/components/report/WindowToggle.tsx`
- `frontend/src/components/report/GradeHero.tsx`
- `frontend/src/components/report/BodySystemRadar.tsx`
- `frontend/src/components/report/DeltaCard.tsx`
- `frontend/src/components/report/MilestoneStrip.tsx`
- `frontend/src/components/dashboard/tabs/ReportTab.tsx`

**Frontend (modify):**
- `frontend/src/pages/DashboardPage.tsx` — add `report` tab.
- `frontend/src/components/dashboard/MobileBottomNav.tsx` — add `report` item.
- `frontend/src/i18n/strings.ts` — add `tab_report`.

---

## Conventions (read once before starting)

- The pure core never touches the DB. All scoring functions take primitives or the `WindowMetrics` dataclass and return deterministic values. This is the unit-tested boundary.
- Scoring helpers are documented heuristics; tests assert **banding, monotonicity, renormalization, and insufficient-data handling** — not magic-number exactness — so formulas stay clean.
- An axis with no inputs returns `score=None, insufficient_data=True` and is excluded from the composite (which renormalizes over available axes).
- Run backend tests with `uv run pytest` from `backend/`.

---

### Task 1: Response schema

**Files:**
- Create: `backend/app/schemas/period_report.py`

- [ ] **Step 1: Write the schema module**

```python
"""Period Report schemas — the contract for GET /analytics/period-report.

A periodized verdict over a chosen window (N days) compared against the
previous equal window. Plain-language fields lead; numeric detail rides
alongside so the UI can show "science on tap".
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class RadarAxis(BaseModel):
    """One body-system dimension, scored 0-100 (higher = better)."""
    key: str = Field(description="machine key, e.g. 'aerobic'")
    label: str = Field(description="display label, e.g. 'Aerobic Fitness'")
    score: float | None = Field(description="0-100, or null when insufficient data")
    insufficient_data: bool = False
    detail: str = Field(default="", description="one-line plain explanation of the score")


class DeltaItem(BaseModel):
    """A single significant change vs the previous equal window."""
    key: str
    label: str = Field(description="plain verdict, e.g. 'Fitness climbing'")
    detail: str = Field(description="real numbers, e.g. 'CTL 48 → 52 (+4)'")
    why: str = Field(description="one line on why it matters")
    delta: float
    unit: str = ""
    direction: str = Field(description="'up' or 'down' (raw metric movement)")
    is_improvement: bool


class Milestone(BaseModel):
    """A streak, PR, or badge achieved in the window."""
    icon_key: str = Field(description="UI icon hint, e.g. 'flame', 'trophy', 'zap'")
    label: str
    detail: str = ""


class PeriodReport(BaseModel):
    days: int
    start_date: str
    end_date: str
    prev_start_date: str
    prev_end_date: str
    has_baseline: bool = Field(description="false when the previous window has no data")
    grade_letter: str | None
    grade_score: float | None = Field(description="composite 0-100, or null")
    radar: list[RadarAxis]
    improvements: list[DeltaItem]
    weaknesses: list[DeltaItem]
    milestones: list[Milestone]
    ai_verdict: str
    ai_model: str
```

- [ ] **Step 2: Verify it imports**

Run: `cd backend && uv run python -c "from app.schemas.period_report import PeriodReport; print('ok')"`
Expected: prints `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/period_report.py
git commit -m "feat(period-report): response schemas"
```

---

### Task 2: Pure core — clamp/lerp helpers + letter banding

**Files:**
- Create: `backend/app/services/period_report.py`
- Test: `backend/tests/test_period_report.py`

- [ ] **Step 1: Write failing tests**

```python
"""Unit tests for the period_report pure scoring core."""
from __future__ import annotations

from app.services.period_report import (
    WindowMetrics,
    _clamp,
    _inv_score,
    _lerp_score,
    build_deltas,
    build_milestones,
    build_radar,
    composite_grade,
    letter_for_score,
)


class TestHelpers:
    def test_clamp_bounds(self):
        assert _clamp(-5) == 0.0
        assert _clamp(150) == 100.0
        assert _clamp(42) == 42.0

    def test_lerp_score_maps_range_to_0_100(self):
        assert _lerp_score(0, 0, 10) == 0.0
        assert _lerp_score(10, 0, 10) == 100.0
        assert _lerp_score(5, 0, 10) == 50.0
        assert _lerp_score(-3, 0, 10) == 0.0   # clamped
        assert _lerp_score(99, 0, 10) == 100.0 # clamped

    def test_inv_score_is_higher_when_value_lower(self):
        assert _inv_score(0, 0, 10) == 100.0
        assert _inv_score(10, 0, 10) == 0.0
        assert _inv_score(2.5, 0, 10) == 75.0


class TestLetterBanding:
    def test_bands(self):
        assert letter_for_score(95) == "A+"
        assert letter_for_score(91) == "A"
        assert letter_for_score(88) == "A-"
        assert letter_for_score(84) == "B+"
        assert letter_for_score(81) == "B"
        assert letter_for_score(78) == "B-"
        assert letter_for_score(74) == "C+"
        assert letter_for_score(70) == "C"
        assert letter_for_score(66) == "C-"
        assert letter_for_score(50) == "D"

    def test_monotonic_non_increasing_grade(self):
        # Higher score never yields a "worse" first character ordering.
        prev = "A+"
        for s in range(100, -1, -5):
            letter_for_score(s)  # must not raise
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd backend && uv run pytest tests/test_period_report.py -q`
Expected: FAIL — `ImportError` (module/functions not defined).

- [ ] **Step 3: Create module with helpers + banding**

```python
"""Period Report — pure scoring core + DB-backed orchestration.

The top of this module is intentionally DB-free and deterministic so the
scoring logic is unit-tested in isolation. `build_report` at the bottom is
the only async, DB-touching entry point; it assembles two `WindowMetrics`
(current + previous equal window) and feeds them to the pure core.

Scoring philosophy: every axis is a documented 0-100 heuristic where higher
is better. Axes lacking inputs return score=None + insufficient_data=True and
are dropped from the composite, which renormalizes over what's available.
"""
from __future__ import annotations

from dataclasses import dataclass


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return float(max(lo, min(hi, x)))


def _lerp_score(value: float, low: float, high: float) -> float:
    """Map value in [low, high] to [0, 100], clamped. Higher value = higher score."""
    if high == low:
        return 0.0
    return _clamp((value - low) / (high - low) * 100.0)


def _inv_score(value: float, low: float, high: float) -> float:
    """Like _lerp_score but inverted: higher value = lower score (e.g. RHR, decoupling)."""
    return _clamp(100.0 - _lerp_score(value, low, high))


# (letter, inclusive lower bound on composite score)
_GRADE_BANDS: list[tuple[str, float]] = [
    ("A+", 93), ("A", 90), ("A-", 87),
    ("B+", 83), ("B", 80), ("B-", 77),
    ("C+", 73), ("C", 70), ("C-", 67),
    ("D", 0),
]


def letter_for_score(score: float) -> str:
    for letter, lo in _GRADE_BANDS:
        if score >= lo:
            return letter
    return "D"
```

- [ ] **Step 4: Run helper + banding tests**

Run: `cd backend && uv run pytest tests/test_period_report.py::TestHelpers tests/test_period_report.py::TestLetterBanding -q`
Expected: PASS (the `TestRadar`/`TestDeltas`/`TestMilestones` classes don't exist yet — only run the two named classes here).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/period_report.py backend/tests/test_period_report.py
git commit -m "feat(period-report): pure scoring helpers + letter banding"
```

---

### Task 3: Pure core — WindowMetrics + radar axes + composite grade

**Files:**
- Modify: `backend/app/services/period_report.py`
- Test: `backend/tests/test_period_report.py`

- [ ] **Step 1: Add failing radar/composite tests**

Append to `tests/test_period_report.py`:

```python
def _full_window(**over) -> WindowMetrics:
    """A WindowMetrics with healthy defaults; override per test."""
    base = dict(
        days=7, pmc_days=7,
        avg_ctl=50.0, ctl_delta=4.0, avg_tsb=-5.0,
        total_tss=500.0, activity_count=5, training_days=5, longest_streak=3,
        avg_if=0.72, avg_ef=1.5, avg_decoupling=4.0, grey_pct=10.0,
        avg_hrv=60.0, avg_rhr=50.0, avg_sleep_hours=7.5,
        sleep_debt_hours=1.0, biometric_days=7,
    )
    base.update(over)
    return WindowMetrics(**base)


class TestRadar:
    def test_full_data_all_axes_scored(self):
        axes = build_radar(_full_window(), _full_window())
        keys = {a.key for a in axes}
        assert keys == {"aerobic", "recovery", "consistency", "intensity", "durability"}
        assert all(a.score is not None and not a.insufficient_data for a in axes)

    def test_no_pmc_marks_aerobic_insufficient(self):
        cur = _full_window(pmc_days=0, avg_ctl=None, ctl_delta=None)
        axis = next(a for a in build_radar(cur, _full_window()) if a.key == "aerobic")
        assert axis.insufficient_data is True
        assert axis.score is None

    def test_no_activities_marks_intensity_and_durability_insufficient(self):
        cur = _full_window(activity_count=0, avg_if=None, avg_decoupling=None, grey_pct=None)
        axes = {a.key: a for a in build_radar(cur, _full_window())}
        assert axes["intensity"].insufficient_data is True
        assert axes["durability"].insufficient_data is True

    def test_climbing_fitness_scores_higher_than_detraining(self):
        up = next(a for a in build_radar(_full_window(ctl_delta=6.0), None) if a.key == "aerobic")
        down = next(a for a in build_radar(_full_window(ctl_delta=-6.0), None) if a.key == "aerobic")
        assert up.score > down.score

    def test_more_grey_zone_lowers_intensity(self):
        clean = next(a for a in build_radar(_full_window(grey_pct=5.0), None) if a.key == "intensity")
        junk = next(a for a in build_radar(_full_window(grey_pct=35.0), None) if a.key == "intensity")
        assert clean.score > junk.score


class TestComposite:
    def test_grade_from_axes(self):
        score, letter = composite_grade(build_radar(_full_window(), _full_window()))
        assert 0 <= score <= 100
        assert letter == letter_for_score(score)

    def test_renormalizes_over_available_axes(self):
        cur = _full_window(pmc_days=0, avg_ctl=None, ctl_delta=None)  # aerobic drops out
        score, letter = composite_grade(build_radar(cur, _full_window()))
        assert score is not None  # still graded on the remaining four

    def test_all_insufficient_returns_none(self):
        empty = WindowMetrics(
            days=7, pmc_days=0, avg_ctl=None, ctl_delta=None, avg_tsb=None,
            total_tss=0.0, activity_count=0, training_days=0, longest_streak=0,
            avg_if=None, avg_ef=None, avg_decoupling=None, grey_pct=None,
            avg_hrv=None, avg_rhr=None, avg_sleep_hours=None,
            sleep_debt_hours=None, biometric_days=0,
        )
        # Consistency is always computable (0 training days -> low score), so
        # the composite is NOT none here; assert it grades the consistency axis.
        score, letter = composite_grade(build_radar(empty, None))
        assert score is not None
        assert score < 40  # zero-training window should grade poorly
```

- [ ] **Step 2: Run, verify failure**

Run: `cd backend && uv run pytest tests/test_period_report.py::TestRadar tests/test_period_report.py::TestComposite -q`
Expected: FAIL — `WindowMetrics` / `build_radar` / `composite_grade` not defined.

- [ ] **Step 3: Add WindowMetrics + radar + composite to the module**

Append to `app/services/period_report.py`:

```python
@dataclass
class WindowMetrics:
    """Aggregated, DB-free numbers for one time window. None = no data."""
    days: int
    pmc_days: int
    avg_ctl: float | None
    ctl_delta: float | None      # within-window: last day CTL - first day CTL
    avg_tsb: float | None
    total_tss: float
    activity_count: int
    training_days: int           # distinct calendar days with >=1 activity
    longest_streak: int          # longest run of consecutive training days
    avg_if: float | None
    avg_ef: float | None
    avg_decoupling: float | None
    grey_pct: float | None       # % of activities classified in the z3 grey zone
    avg_hrv: float | None
    avg_rhr: float | None
    avg_sleep_hours: float | None
    sleep_debt_hours: float | None
    biometric_days: int


# Axis composite weights (re-normalized over available axes).
_AXIS_WEIGHTS = {
    "aerobic": 0.30,
    "recovery": 0.25,
    "consistency": 0.20,
    "intensity": 0.15,
    "durability": 0.10,
}


def _axis(key: str, label: str, score: float | None, detail: str):
    from app.schemas.period_report import RadarAxis
    return RadarAxis(
        key=key, label=label,
        score=None if score is None else round(score, 1),
        insufficient_data=score is None,
        detail=detail,
    )


def _pct_change(cur: float | None, prev: float | None) -> float | None:
    if cur is None or prev is None or prev == 0:
        return None
    return (cur - prev) / abs(prev) * 100.0


def build_radar(cur: WindowMetrics, prev: WindowMetrics | None) -> list:
    """Five 0-100 body-system axes for the current window. `prev` (the previous
    equal window) feeds the recovery trend; absent -> recovery uses sleep only."""
    axes = []

    # --- Aerobic Fitness: CTL level (65%) + within-window ramp (35%) ---
    if cur.pmc_days == 0 or cur.avg_ctl is None:
        axes.append(_axis("aerobic", "Aerobic Fitness", None, "No fitness data in this window."))
    else:
        level = _lerp_score(cur.avg_ctl, 0, 90)            # CTL 90 -> elite -> 100
        ramp_delta = cur.ctl_delta if cur.ctl_delta is not None else 0.0
        ramp = _clamp(50 + ramp_delta * 8)                 # +6 CTL -> ~98, flat -> 50
        score = 0.65 * level + 0.35 * ramp
        trend = "climbing" if ramp_delta >= 0.4 else "holding" if ramp_delta > -0.4 else "detraining"
        axes.append(_axis("aerobic", "Aerobic Fitness", score,
                          f"CTL {round(cur.avg_ctl)}, fitness {trend}."))

    # --- Recovery: sleep debt + HRV trend + RHR trend (mean of available) ---
    parts: list[float] = []
    if cur.sleep_debt_hours is not None:
        parts.append(_inv_score(cur.sleep_debt_hours, 0, 14))
    hrv_pct = _pct_change(cur.avg_hrv, prev.avg_hrv) if prev else None
    if hrv_pct is not None:
        parts.append(_clamp(50 + hrv_pct * 2.5))           # +20% HRV -> 100
    rhr_pct = _pct_change(cur.avg_rhr, prev.avg_rhr) if prev else None
    if rhr_pct is not None:
        parts.append(_clamp(50 - rhr_pct * 5))             # RHR up = worse
    if not parts:
        axes.append(_axis("recovery", "Recovery", None, "No recovery data in this window."))
    else:
        score = sum(parts) / len(parts)
        axes.append(_axis("recovery", "Recovery", score,
                          f"Sleep debt {round(cur.sleep_debt_hours or 0, 1)}h"
                          + (f", HRV {hrv_pct:+.0f}%" if hrv_pct is not None else "") + "."))

    # --- Consistency: training-day ratio (target 0.6) + small streak bonus ---
    ratio = cur.training_days / cur.days if cur.days else 0.0
    base = _lerp_score(ratio, 0, 0.6)
    streak_bonus = _clamp((cur.longest_streak - 1) * 4, 0, 20)
    cons = _clamp(0.85 * base + streak_bonus)
    axes.append(_axis("consistency", "Consistency", cons,
                      f"{cur.training_days}/{cur.days} days trained, "
                      f"best streak {cur.longest_streak}."))

    # --- Intensity Balance: penalize grey-zone (Seiler) ---
    if cur.activity_count == 0 or cur.grey_pct is None:
        axes.append(_axis("intensity", "Intensity Balance", None, "No rides to assess intensity."))
    else:
        score = _clamp(100 - cur.grey_pct * 2.5)           # 20% grey -> 50, 40% -> 0
        axes.append(_axis("intensity", "Intensity Balance", score,
                          f"{round(cur.grey_pct)}% of rides in the grey zone."))

    # --- Durability: aerobic decoupling (lower better) ---
    if cur.avg_decoupling is None:
        axes.append(_axis("durability", "Durability", None,
                          "Not enough sample-stream rides to assess drift."))
    else:
        score = _inv_score(cur.avg_decoupling, 0, 10)      # 0% -> 100, 10%+ -> 0
        axes.append(_axis("durability", "Durability", score,
                          f"Avg Pw:HR drift {cur.avg_decoupling:.1f}%."))

    return axes


def composite_grade(axes: list) -> tuple[float | None, str | None]:
    """Weighted mean over available (scored) axes, renormalized. Returns
    (score, letter) or (None, None) when every axis is insufficient."""
    num = 0.0
    denom = 0.0
    for a in axes:
        if a.score is None:
            continue
        w = _AXIS_WEIGHTS.get(a.key, 0.0)
        num += a.score * w
        denom += w
    if denom == 0:
        return None, None
    score = round(num / denom, 1)
    return score, letter_for_score(score)
```

- [ ] **Step 4: Run radar/composite tests**

Run: `cd backend && uv run pytest tests/test_period_report.py::TestRadar tests/test_period_report.py::TestComposite -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/period_report.py backend/tests/test_period_report.py
git commit -m "feat(period-report): WindowMetrics, radar axes, composite grade"
```

---

### Task 4: Pure core — significance-gated improvements/weaknesses

**Files:**
- Modify: `backend/app/services/period_report.py`
- Test: `backend/tests/test_period_report.py`

- [ ] **Step 1: Add failing delta tests**

Append to `tests/test_period_report.py`:

```python
class TestDeltas:
    def test_significant_ctl_gain_is_improvement(self):
        cur = _full_window(avg_ctl=54.0)
        prev = _full_window(avg_ctl=50.0)   # +4 CTL > threshold (2)
        imp, weak = build_deltas(cur, prev)
        assert any(i.key == "ctl" and i.is_improvement for i in imp)

    def test_tiny_ctl_change_is_filtered(self):
        cur = _full_window(avg_ctl=50.5)
        prev = _full_window(avg_ctl=50.0)   # +0.5 < threshold (2)
        imp, weak = build_deltas(cur, prev)
        assert not any(i.key == "ctl" for i in imp + weak)

    def test_rising_rhr_is_weakness(self):
        cur = _full_window(avg_rhr=55.0)
        prev = _full_window(avg_rhr=50.0)   # +5 bpm, higher RHR is bad
        imp, weak = build_deltas(cur, prev)
        assert any(w.key == "rhr" and not w.is_improvement for w in weak)

    def test_falling_decoupling_is_improvement(self):
        cur = _full_window(avg_decoupling=2.0)
        prev = _full_window(avg_decoupling=6.0)  # drift down by 4 > threshold (1.5)
        imp, weak = build_deltas(cur, prev)
        assert any(i.key == "decoupling" and i.is_improvement for i in imp)

    def test_no_previous_window_returns_empty(self):
        imp, weak = build_deltas(_full_window(), None)
        assert imp == [] and weak == []
```

- [ ] **Step 2: Run, verify failure**

Run: `cd backend && uv run pytest tests/test_period_report.py::TestDeltas -q`
Expected: FAIL — `build_deltas` not defined.

- [ ] **Step 3: Implement build_deltas**

Append to `app/services/period_report.py`:

```python
# Per-metric significance config. Each entry:
#   attr           -> WindowMetrics field
#   label          -> plain verdict noun
#   why            -> one line on why it matters
#   unit           -> display unit
#   threshold      -> minimum |delta| to surface
#   relative       -> threshold is a percent of the previous value
#   higher_is_good -> True if a rise is an improvement
_DELTA_METRICS: list[dict] = [
    {"key": "ctl", "attr": "avg_ctl", "label": "Fitness", "unit": "CTL",
     "threshold": 2.0, "relative": False, "higher_is_good": True,
     "why": "Chronic load is your fitness ceiling — up is fitter."},
    {"key": "tsb", "attr": "avg_tsb", "label": "Form", "unit": "TSB",
     "threshold": 5.0, "relative": False, "higher_is_good": True,
     "why": "Positive form means you're fresher and race-ready."},
    {"key": "tss", "attr": "total_tss", "label": "Training load", "unit": "TSS",
     "threshold": 10.0, "relative": True, "higher_is_good": True,
     "why": "More quality load drives adaptation — if recovery keeps up."},
    {"key": "training_days", "attr": "training_days", "label": "Consistency", "unit": "days",
     "threshold": 1.0, "relative": False, "higher_is_good": True,
     "why": "Frequency beats heroics — more days trained compounds."},
    {"key": "hrv", "attr": "avg_hrv", "label": "HRV", "unit": "ms",
     "threshold": 5.0, "relative": True, "higher_is_good": True,
     "why": "Rising HRV signals your nervous system is adapting well."},
    {"key": "rhr", "attr": "avg_rhr", "label": "Resting HR", "unit": "bpm",
     "threshold": 2.0, "relative": False, "higher_is_good": False,
     "why": "A lower resting heart rate tracks improving aerobic health."},
    {"key": "sleep", "attr": "avg_sleep_hours", "label": "Sleep", "unit": "h",
     "threshold": 0.5, "relative": False, "higher_is_good": True,
     "why": "Sleep is the biggest lever on recovery and adaptation."},
    {"key": "ef", "attr": "avg_ef", "label": "Efficiency", "unit": "W/bpm",
     "threshold": 0.05, "relative": False, "higher_is_good": True,
     "why": "More watts per heartbeat means a stronger aerobic engine."},
    {"key": "decoupling", "attr": "avg_decoupling", "label": "Durability", "unit": "%",
     "threshold": 1.5, "relative": False, "higher_is_good": False,
     "why": "Less Pw:HR drift means you hold power deeper into rides."},
]


def build_deltas(cur: WindowMetrics, prev: WindowMetrics | None):
    """Return (improvements, weaknesses). Only metrics whose change crosses
    their significance threshold surface; everything else is noise."""
    from app.schemas.period_report import DeltaItem
    improvements: list[DeltaItem] = []
    weaknesses: list[DeltaItem] = []
    if prev is None:
        return improvements, weaknesses

    for m in _DELTA_METRICS:
        a = getattr(cur, m["attr"])
        b = getattr(prev, m["attr"])
        if a is None or b is None:
            continue
        delta = a - b
        if m["relative"]:
            if b == 0:
                continue
            significant = abs(delta) / abs(b) * 100.0 >= m["threshold"]
        else:
            significant = abs(delta) >= m["threshold"]
        if not significant or delta == 0:
            continue

        rose = delta > 0
        is_improvement = rose == m["higher_is_good"]
        direction = "up" if rose else "down"
        verb = "improving" if is_improvement else "slipping"
        detail = f"{m['label']}: {b:g} → {a:g} {m['unit']} ({delta:+g})"
        item = DeltaItem(
            key=m["key"],
            label=f"{m['label']} {verb}",
            detail=detail,
            why=m["why"],
            delta=round(delta, 2),
            unit=m["unit"],
            direction=direction,
            is_improvement=is_improvement,
        )
        (improvements if is_improvement else weaknesses).append(item)

    improvements.sort(key=lambda d: abs(d.delta), reverse=True)
    weaknesses.sort(key=lambda d: abs(d.delta), reverse=True)
    return improvements, weaknesses
```

- [ ] **Step 4: Run delta tests**

Run: `cd backend && uv run pytest tests/test_period_report.py::TestDeltas -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/period_report.py backend/tests/test_period_report.py
git commit -m "feat(period-report): significance-gated improvements/weaknesses"
```

---

### Task 5: Pure core — milestones

**Files:**
- Modify: `backend/app/services/period_report.py`
- Test: `backend/tests/test_period_report.py`

- [ ] **Step 1: Add failing milestone tests**

Append to `tests/test_period_report.py`:

```python
class TestMilestones:
    def test_streak_milestone_when_streak_long(self):
        ms = build_milestones(_full_window(longest_streak=5))
        assert any(m.icon_key == "flame" for m in ms)

    def test_no_streak_milestone_for_short_streak(self):
        ms = build_milestones(_full_window(longest_streak=1))
        assert not any(m.icon_key == "flame" for m in ms)

    def test_big_load_milestone(self):
        ms = build_milestones(_full_window(total_tss=900.0))
        assert any(m.icon_key == "zap" for m in ms)

    def test_empty_window_no_milestones(self):
        ms = build_milestones(_full_window(
            longest_streak=0, total_tss=0.0, training_days=0, activity_count=0))
        assert ms == []
```

- [ ] **Step 2: Run, verify failure**

Run: `cd backend && uv run pytest tests/test_period_report.py::TestMilestones -q`
Expected: FAIL — `build_milestones` not defined.

- [ ] **Step 3: Implement build_milestones**

Append to `app/services/period_report.py`:

```python
def build_milestones(cur: WindowMetrics) -> list:
    """Game-y achievement chips for the window. Conservative thresholds so a
    milestone always means something."""
    from app.schemas.period_report import Milestone
    out: list[Milestone] = []

    if cur.longest_streak >= 3:
        out.append(Milestone(
            icon_key="flame",
            label=f"{cur.longest_streak}-day streak",
            detail="Consecutive days trained in this window.",
        ))
    if cur.total_tss >= 700:
        out.append(Milestone(
            icon_key="zap",
            label=f"{round(cur.total_tss)} TSS",
            detail="High training load banked this window.",
        ))
    if cur.training_days >= max(1, int(round(cur.days * 0.7))):
        out.append(Milestone(
            icon_key="trophy",
            label="Iron consistency",
            detail=f"Trained {cur.training_days} of {cur.days} days.",
        ))
    return out
```

- [ ] **Step 4: Run milestone tests, then the full pure suite**

Run: `cd backend && uv run pytest tests/test_period_report.py -q`
Expected: PASS (all classes).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/period_report.py backend/tests/test_period_report.py
git commit -m "feat(period-report): milestone chips"
```

---

### Task 6: DB layer — fetch one window's metrics

**Files:**
- Modify: `backend/app/services/period_report.py`
- Test: `backend/tests/test_period_report.py`

- [ ] **Step 1: Add a focused test for the streak helper (pure) used by the fetcher**

Append to `tests/test_period_report.py`:

```python
from datetime import date

from app.services.period_report import _longest_streak


class TestStreak:
    def test_consecutive_days(self):
        days = {date(2026, 6, 1), date(2026, 6, 2), date(2026, 6, 3)}
        assert _longest_streak(days) == 3

    def test_gap_breaks_streak(self):
        days = {date(2026, 6, 1), date(2026, 6, 2), date(2026, 6, 5)}
        assert _longest_streak(days) == 2

    def test_empty(self):
        assert _longest_streak(set()) == 0
```

- [ ] **Step 2: Run, verify failure**

Run: `cd backend && uv run pytest tests/test_period_report.py::TestStreak -q`
Expected: FAIL — `_longest_streak` not defined.

- [ ] **Step 3: Add imports, `_longest_streak`, and `_fetch_window_metrics`**

At the **top** of `app/services/period_report.py`, extend the imports block (after `from dataclasses import dataclass`):

```python
import statistics
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.daily_metric import DailyMetric
from app.services.advanced_metrics import compute_activity_metrics
from app.services.analytical_aggregates import (
    _activity_if,
    _extract_sleep_hours,
    _fetch_athlete_ftp,
    _zone_from_if,
    pmc_window_summary,
)
```

Then append to the module:

```python
def _longest_streak(training_dates: set[date]) -> int:
    """Longest run of consecutive calendar days in the set."""
    if not training_dates:
        return 0
    ordered = sorted(training_dates)
    best = run = 1
    for prev, cur in zip(ordered, ordered[1:]):
        if (cur - prev).days == 1:
            run += 1
            best = max(best, run)
        else:
            run = 1
    return best


async def _fetch_window_metrics(
    db: AsyncSession, user_id: int, start: date, end: date, ftp: int | None
) -> WindowMetrics:
    """Aggregate one [start, end] window into a WindowMetrics. DB-touching but
    delegates all numeric judgement to the pure core."""
    days = (end - start).days + 1
    start_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)
    end_dt = datetime.combine(end, time.max, tzinfo=timezone.utc)

    # --- PMC (CTL/ATL/TSB) via the existing windowed summary ---
    pmc = await pmc_window_summary(user_id=user_id, start_date=start, end_date=end, db=db)
    pmc_days = len(pmc["days"])
    agg = pmc["aggregate"]
    avg_ctl = agg["avg_ctl"] if pmc_days else None
    avg_tsb = agg["avg_tsb"] if pmc_days else None
    ctl_delta = pmc["trend"]["ctl_delta"] if pmc_days >= 2 else (0.0 if pmc_days else None)

    # --- Activities in the window ---
    a_stmt = (
        select(Activity)
        .where(Activity.user_id == user_id,
               Activity.started_at >= start_dt,
               Activity.started_at <= end_dt)
        .order_by(Activity.started_at.asc())
    )
    activities = list((await db.execute(a_stmt)).scalars().all())

    total_tss = sum(float(a.tss or 0) for a in activities)
    training_dates = {a.started_at.date() for a in activities}
    if_values: list[float] = []
    ef_values: list[float] = []
    dec_values: list[float] = []
    grey = 0
    classified = 0
    for a in activities:
        if_val = _activity_if(a, ftp)
        if if_val is not None:
            if_values.append(if_val)
            classified += 1
            if _zone_from_if(if_val) == "z3":
                grey += 1
        m = compute_activity_metrics(a)
        if m["ef"] is not None:
            ef_values.append(m["ef"])
        if m["decoupling"] is not None:
            dec_values.append(m["decoupling"])

    # --- Biometrics in the window ---
    m_stmt = (
        select(DailyMetric)
        .where(DailyMetric.user_id == user_id,
               DailyMetric.recorded_at >= start_dt,
               DailyMetric.recorded_at <= end_dt)
    )
    metrics = list((await db.execute(m_stmt)).scalars().all())
    hrv_vals = [m.hrv_status for m in metrics if m.hrv_status is not None]
    rhr_vals = [m.resting_hr for m in metrics if m.resting_hr is not None]
    sleep_vals: list[float] = []
    for m in metrics:
        hrs = _extract_sleep_hours(m)  # tolerates Garmin's nested raw_data shapes
        if hrs is not None:
            sleep_vals.append(hrs)
    avg_sleep = statistics.mean(sleep_vals) if sleep_vals else None
    # Sleep debt vs 7.5h target, summed over nights with data.
    sleep_debt = (
        sum(max(0.0, 7.5 - h) for h in sleep_vals) if sleep_vals else None
    )

    return WindowMetrics(
        days=days,
        pmc_days=pmc_days,
        avg_ctl=avg_ctl,
        ctl_delta=ctl_delta,
        avg_tsb=avg_tsb,
        total_tss=round(total_tss, 1),
        activity_count=len(activities),
        training_days=len(training_dates),
        longest_streak=_longest_streak(training_dates),
        avg_if=round(statistics.mean(if_values), 3) if if_values else None,
        avg_ef=round(statistics.mean(ef_values), 3) if ef_values else None,
        avg_decoupling=round(statistics.mean(dec_values), 2) if dec_values else None,
        grey_pct=round(grey / classified * 100.0, 1) if classified else None,
        avg_hrv=round(statistics.mean(hrv_vals), 1) if hrv_vals else None,
        avg_rhr=round(statistics.mean(rhr_vals), 1) if rhr_vals else None,
        avg_sleep_hours=round(avg_sleep, 2) if avg_sleep is not None else None,
        sleep_debt_hours=round(sleep_debt, 1) if sleep_debt is not None else None,
        biometric_days=len(metrics),
    )
```

- [ ] **Step 4: Run the streak tests + full pure suite (the fetcher has no new unit test; it's exercised in Task 8 via the API smoke + manual drive)**

Run: `cd backend && uv run pytest tests/test_period_report.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/period_report.py backend/tests/test_period_report.py
git commit -m "feat(period-report): per-window metric fetcher + streak helper"
```

---

### Task 7: build_report assembly + AI verdict (graceful fallback)

**Files:**
- Modify: `backend/app/services/period_report.py`
- Test: `backend/tests/test_period_report.py`

- [ ] **Step 1: Add a test for the rule-based verdict fallback (pure, no network)**

Append to `tests/test_period_report.py`:

```python
class TestVerdictFallback:
    def test_rule_based_verdict_mentions_grade_and_window(self):
        from app.services.period_report import _rule_based_verdict
        text = _rule_based_verdict(
            days=7, grade_letter="B+", grade_score=84.0,
            top_improvement="Fitness improving", top_weakness="Sleep slipping",
        )
        assert "7" in text
        assert "B+" in text
        assert len(text) <= 280

    def test_rule_based_verdict_handles_no_grade(self):
        from app.services.period_report import _rule_based_verdict
        text = _rule_based_verdict(
            days=14, grade_letter=None, grade_score=None,
            top_improvement=None, top_weakness=None,
        )
        assert "14" in text
        assert len(text) <= 280
```

- [ ] **Step 2: Run, verify failure**

Run: `cd backend && uv run pytest tests/test_period_report.py::TestVerdictFallback -q`
Expected: FAIL — `_rule_based_verdict` not defined.

- [ ] **Step 3: Implement verdict + build_report**

Add to the imports block at the top of `app/services/period_report.py`:

```python
import logging

from app.config import settings

logger = logging.getLogger(__name__)
```

Append to the module:

```python
def _rule_based_verdict(
    days: int,
    grade_letter: str | None,
    grade_score: float | None,
    top_improvement: str | None,
    top_weakness: str | None,
) -> str:
    """Deterministic 1-2 sentence summary used when Claude is unavailable."""
    if grade_letter is None:
        return (f"Your last {days} days don't have enough data to grade yet — "
                "connect a device or log a few rides to unlock your report.")
    bits = [f"Your last {days} days grade {grade_letter} ({round(grade_score or 0)}/100)."]
    if top_improvement:
        bits.append(f"Biggest win: {top_improvement.lower()}.")
    if top_weakness:
        bits.append(f"Watch: {top_weakness.lower()}.")
    text = " ".join(bits)
    return text[:280]


_VERDICT_SYSTEM = (
    "You are an endurance coach giving an athlete a punchy verdict on their "
    "training window. One or two sentences, plain and direct. Name the grade "
    "and the single most important thing to celebrate or fix. No platitudes, "
    "no emoji, no hedging. Do not exceed 280 characters."
)


async def _ai_verdict(
    days: int,
    grade_letter: str | None,
    grade_score: float | None,
    improvements: list,
    weaknesses: list,
) -> tuple[str, str]:
    """Return (verdict_text, model_used). Falls back to a rule-based string when
    no API key is set or the call fails — mirrors /analytics/summarize."""
    top_imp = improvements[0].label if improvements else None
    top_weak = weaknesses[0].label if weaknesses else None
    fallback = _rule_based_verdict(days, grade_letter, grade_score, top_imp, top_weak)

    if not settings.ANTHROPIC_API_KEY:
        return fallback, "rule-based-fallback"

    user_msg = (
        f"Window: last {days} days\n"
        f"Grade: {grade_letter} ({grade_score}/100)\n"
        f"Improvements: {[i.detail for i in improvements[:4]]}\n"
        f"Weaknesses: {[w.detail for w in weaknesses[:4]]}\n"
    )
    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = await client.messages.create(
            model=settings.COACH_MODEL,
            max_tokens=160,
            system=[{"type": "text", "text": _VERDICT_SYSTEM,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user_msg}],
        )
        text = ""
        for block in getattr(response, "content", None) or []:
            block_text = getattr(block, "text", None)
            if block_text:
                text += block_text
        text = text.strip()
        if not text:
            raise RuntimeError("empty Claude response")
        return text[:280], settings.COACH_MODEL
    except Exception as exc:  # noqa: BLE001
        logger.exception("Period-report verdict failed: %s", exc)
        return fallback, "rule-based-fallback"


async def build_report(db: AsyncSession, user_id: int, days: int):
    """Assemble the full PeriodReport for the last `days` days vs the previous
    equal window."""
    from app.schemas.period_report import PeriodReport

    days = max(3, min(int(days), 365))
    today = date.today()
    end = today
    start = today - timedelta(days=days - 1)
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)

    ftp = await _fetch_athlete_ftp(db, user_id)
    cur = await _fetch_window_metrics(db, user_id, start, end, ftp)
    prev = await _fetch_window_metrics(db, user_id, prev_start, prev_end, ftp)
    has_baseline = (prev.activity_count > 0 or prev.pmc_days > 0
                    or prev.biometric_days > 0)
    prev_for_calc = prev if has_baseline else None

    radar = build_radar(cur, prev_for_calc)
    grade_score, grade_letter = composite_grade(radar)
    improvements, weaknesses = build_deltas(cur, prev_for_calc)
    milestones = build_milestones(cur)
    verdict, model = await _ai_verdict(
        days, grade_letter, grade_score, improvements, weaknesses
    )

    return PeriodReport(
        days=days,
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        prev_start_date=prev_start.isoformat(),
        prev_end_date=prev_end.isoformat(),
        has_baseline=has_baseline,
        grade_letter=grade_letter,
        grade_score=grade_score,
        radar=radar,
        improvements=improvements,
        weaknesses=weaknesses,
        milestones=milestones,
        ai_verdict=verdict,
        ai_model=model,
    )
```

- [ ] **Step 4: Run verdict tests + full suite**

Run: `cd backend && uv run pytest tests/test_period_report.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/period_report.py backend/tests/test_period_report.py
git commit -m "feat(period-report): build_report assembly + AI verdict with fallback"
```

---

### Task 8: REST route

**Files:**
- Modify: `backend/app/api/analytics.py`

- [ ] **Step 1: Add the route**

In `backend/app/api/analytics.py`, add to the imports near the top:

```python
from app.schemas.period_report import PeriodReport
from app.services.period_report import build_report
```

Then append this route to the file (after the existing `post_summarize`):

```python
@router.get(
    "/period-report",
    response_model=PeriodReport,
    summary="Periodized report card for the last N days vs the previous N days",
)
async def get_period_report(
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    days: int = 7,
) -> PeriodReport:
    if days < 3 or days > 365:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="days must be between 3 and 365",
        )
    return await build_report(db, _user.id, days)
```

- [ ] **Step 2: Restart backend and smoke the endpoint**

The backend runs from `backend/` via `uv run uvicorn app.main:app --host 127.0.0.1 --port 8000`. If running with `--reload` it picks up changes; otherwise restart it.

Run (after authenticating — reuse an existing session token if available, else this just verifies the route is wired and auth-guarded):
```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8000/analytics/period-report?days=7"
```
Expected: `401` (auth required) — proves the route exists and is protected. A `404` means it isn't wired; a `500` means an unhandled error to debug.

- [ ] **Step 3: Confirm the route is in the OpenAPI schema**

Run: `curl -s http://127.0.0.1:8000/openapi.json | grep -c "/analytics/period-report"`
Expected: `1`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/analytics.py
git commit -m "feat(period-report): GET /analytics/period-report route"
```

---

### Task 9: Frontend API client + types

**Files:**
- Create: `frontend/src/api/report.ts`

- [ ] **Step 1: Write the client**

```typescript
import { apiClient } from './client'

export interface RadarAxis {
  key: string
  label: string
  score: number | null
  insufficient_data: boolean
  detail: string
}

export interface DeltaItem {
  key: string
  label: string
  detail: string
  why: string
  delta: number
  unit: string
  direction: 'up' | 'down'
  is_improvement: boolean
}

export interface Milestone {
  icon_key: string
  label: string
  detail: string
}

export interface PeriodReport {
  days: number
  start_date: string
  end_date: string
  prev_start_date: string
  prev_end_date: string
  has_baseline: boolean
  grade_letter: string | null
  grade_score: number | null
  radar: RadarAxis[]
  improvements: DeltaItem[]
  weaknesses: DeltaItem[]
  milestones: Milestone[]
  ai_verdict: string
  ai_model: string
}

export async function fetchPeriodReport(days: number): Promise<PeriodReport> {
  const res = await apiClient.get<PeriodReport>('/analytics/period-report', {
    params: { days },
  })
  return res.data
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors from `report.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/report.ts
git commit -m "feat(period-report): frontend api client + types"
```

---

### Task 10: usePeriodReport hook

**Files:**
- Create: `frontend/src/hooks/usePeriodReport.ts`

- [ ] **Step 1: Write the hook (mirrors usePMC)**

```typescript
import { useQuery } from '@tanstack/react-query'
import { fetchPeriodReport, type PeriodReport } from '../api/report'

export function usePeriodReport(days: number) {
  return useQuery<PeriodReport>({
    queryKey: ['period-report', days],
    queryFn: () => fetchPeriodReport(days),
  })
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/usePeriodReport.ts
git commit -m "feat(period-report): usePeriodReport query hook"
```

---

### Task 11: WindowToggle component

**Files:**
- Create: `frontend/src/components/report/WindowToggle.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react'

const PRESETS = [7, 14, 30] as const

/** 7 / 14 / 30 / custom day-window selector. Custom reveals a number input. */
export default function WindowToggle({
  value,
  onChange,
}: {
  value: number
  onChange: (days: number) => void
}) {
  const isPreset = (PRESETS as readonly number[]).includes(value)
  const [customOpen, setCustomOpen] = useState(!isPreset)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PRESETS.map((d) => {
        const active = value === d && !customOpen
        return (
          <button
            key={d}
            type="button"
            onClick={() => { setCustomOpen(false); onChange(d) }}
            className="px-3 py-1.5 rounded-full num-mono transition-colors"
            style={{
              fontSize: 12,
              letterSpacing: '0.08em',
              backgroundColor: active ? 'var(--color-ink)' : 'var(--color-paper-2)',
              color: active ? 'var(--color-paper)' : 'var(--color-ink-2)',
              border: '1px solid var(--color-rule)',
            }}
            aria-pressed={active}
          >
            {d}D
          </button>
        )
      })}
      <button
        type="button"
        onClick={() => setCustomOpen(true)}
        className="px-3 py-1.5 rounded-full num-mono transition-colors"
        style={{
          fontSize: 12,
          letterSpacing: '0.08em',
          backgroundColor: customOpen ? 'var(--color-ink)' : 'var(--color-paper-2)',
          color: customOpen ? 'var(--color-paper)' : 'var(--color-ink-2)',
          border: '1px solid var(--color-rule)',
        }}
        aria-pressed={customOpen}
      >
        Custom
      </button>
      {customOpen && (
        <input
          type="number"
          min={3}
          max={365}
          value={value}
          onChange={(e) => {
            const n = Math.max(3, Math.min(365, Number(e.target.value) || 3))
            onChange(n)
          }}
          className="w-20 px-2 py-1.5 rounded-md num-mono"
          style={{
            fontSize: 12,
            backgroundColor: 'var(--color-paper-2)',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-rule)',
          }}
          aria-label="Custom day count"
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/report/WindowToggle.tsx
git commit -m "feat(period-report): window toggle component"
```

---

### Task 12: GradeHero component

**Files:**
- Create: `frontend/src/components/report/GradeHero.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { PeriodReport } from '../../api/report'

function gradeColor(letter: string | null): string {
  if (!letter) return 'var(--color-muted)'
  const c = letter[0]
  if (c === 'A') return 'var(--color-good)'
  if (c === 'B') return 'var(--color-ink)'
  if (c === 'C') return 'var(--color-caution)'
  return 'var(--color-bad)'
}

/** Big letter grade + composite score + AI verdict, framed "vs previous N days". */
export default function GradeHero({ report }: { report: PeriodReport }) {
  const color = gradeColor(report.grade_letter)
  return (
    <div
      className="rounded-[18px] p-5 sm:p-6"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
          PERIOD REPORT · {report.days} DAYS
        </span>
        {report.has_baseline ? (
          <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 10 }}>
            vs previous {report.days} days
          </span>
        ) : (
          <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 10 }}>
            no baseline yet
          </span>
        )}
      </div>

      <div className="flex items-end gap-5">
        <div className="flex flex-col items-center">
          <span className="leading-none" style={{ color, fontSize: 64, fontWeight: 600 }}>
            {report.grade_letter ?? '—'}
          </span>
          {report.grade_score != null && (
            <span className="num-mono mt-1" style={{ color: 'var(--color-muted)', fontSize: 12 }}>
              {Math.round(report.grade_score)}/100
            </span>
          )}
        </div>
        <p
          className="text-[14px] sm:text-[15px] leading-relaxed pb-1"
          style={{ color: 'var(--color-ink)', maxWidth: '52ch' }}
        >
          {report.ai_verdict}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/report/GradeHero.tsx
git commit -m "feat(period-report): grade hero component"
```

---

### Task 13: BodySystemRadar component (ECharts)

**Files:**
- Create: `frontend/src/components/report/BodySystemRadar.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useMemo } from 'react'
import * as echarts from 'echarts/core'
import { RadarChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'
import type { RadarAxis } from '../../api/report'

echarts.use([RadarChart, TooltipComponent, CanvasRenderer])

/** Five-axis body-system radar. Insufficient axes render at 0 with a muted note
 * below the chart so a hollow spoke never reads as "you scored zero". */
export default function BodySystemRadar({ axes }: { axes: RadarAxis[] }) {
  const ref = useRef<HTMLDivElement>(null)

  const { indicators, values } = useMemo(() => ({
    indicators: axes.map((a) => ({ name: a.label, max: 100 })),
    values: axes.map((a) => (a.score == null ? 0 : a.score)),
  }), [axes])

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    chart.setOption({
      tooltip: {},
      radar: {
        indicator: indicators,
        radius: '68%',
        splitNumber: 4,
        axisName: { color: 'var(--color-ink-2)', fontSize: 11 },
        splitLine: { lineStyle: { color: 'var(--color-rule)' } },
        splitArea: { areaStyle: { color: ['transparent', 'transparent'] } },
        axisLine: { lineStyle: { color: 'var(--color-rule)' } },
      },
      series: [{
        type: 'radar',
        data: [{
          value: values,
          areaStyle: { color: 'color-mix(in srgb, var(--color-good) 22%, transparent)' },
          lineStyle: { color: 'var(--color-good)' },
          itemStyle: { color: 'var(--color-good)' },
        }],
      }],
    })
    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); chart.dispose() }
  }, [indicators, values])

  const missing = axes.filter((a) => a.insufficient_data).map((a) => a.label)

  return (
    <div
      className="rounded-[18px] p-5 sm:p-6"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
        BODY SYSTEMS
      </span>
      <div ref={ref} style={{ width: '100%', height: 300 }} />
      {missing.length > 0 && (
        <p className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 11 }}>
          Not enough data: {missing.join(', ')}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors. If `echarts/core` submodule types complain, confirm `echarts` is installed (it is, per package.json) and that the import path matches the installed major (v6 supports `echarts/core`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/report/BodySystemRadar.tsx
git commit -m "feat(period-report): body-system radar chart"
```

---

### Task 14: DeltaCard component

**Files:**
- Create: `frontend/src/components/report/DeltaCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react'
import { ChevronDown, ArrowUp, ArrowDown } from 'lucide-react'
import type { DeltaItem } from '../../api/report'

/** A single improvement/weakness. Plain verdict collapsed; tap expands to the
 * real numbers + why-it-matters. */
export default function DeltaCard({ item }: { item: DeltaItem }) {
  const [open, setOpen] = useState(false)
  const accent = item.is_improvement ? 'var(--color-good)' : 'var(--color-caution)'
  const Arrow = item.direction === 'up' ? ArrowUp : ArrowDown

  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="w-full text-left rounded-[14px] p-3.5 transition-colors"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex items-center justify-center rounded-full shrink-0"
          style={{ width: 26, height: 26, backgroundColor: `color-mix(in srgb, ${accent} 18%, transparent)`, color: accent }}
        >
          <Arrow size={15} strokeWidth={2.2} />
        </span>
        <span className="flex-1" style={{ color: 'var(--color-ink)', fontSize: 14 }}>
          {item.label}
        </span>
        <ChevronDown
          size={16}
          style={{ color: 'var(--color-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}
        />
      </div>
      {open && (
        <div className="mt-2.5 pl-9 flex flex-col gap-1">
          <span className="num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 12 }}>{item.detail}</span>
          <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>{item.why}</span>
        </div>
      )}
    </button>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors. (`lucide-react` exports `ArrowUp`, `ArrowDown`, `ChevronDown` — confirm by import resolving.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/report/DeltaCard.tsx
git commit -m "feat(period-report): expandable delta card"
```

---

### Task 15: MilestoneStrip component

**Files:**
- Create: `frontend/src/components/report/MilestoneStrip.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Flame, Zap, Trophy, Award } from 'lucide-react'
import type { Milestone } from '../../api/report'

const ICONS: Record<string, React.ReactNode> = {
  flame: <Flame size={16} strokeWidth={2} />,
  zap: <Zap size={16} strokeWidth={2} />,
  trophy: <Trophy size={16} strokeWidth={2} />,
}

/** Badge chips for streaks / PRs / load milestones. Renders nothing when empty. */
export default function MilestoneStrip({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) return null
  return (
    <div
      className="rounded-[18px] p-5 sm:p-6"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
        MILESTONES
      </span>
      <div className="flex flex-wrap gap-2 mt-3">
        {milestones.map((m, i) => (
          <div
            key={i}
            title={m.detail}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-good) 12%, transparent)', color: 'var(--color-good)' }}
          >
            {ICONS[m.icon_key] ?? <Award size={16} strokeWidth={2} />}
            <span className="num-mono" style={{ fontSize: 12, color: 'var(--color-ink)' }}>{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/report/MilestoneStrip.tsx
git commit -m "feat(period-report): milestone strip"
```

---

### Task 16: ReportTab assembly

**Files:**
- Create: `frontend/src/components/dashboard/tabs/ReportTab.tsx`

- [ ] **Step 1: Write the tab**

```tsx
import { useState } from 'react'
import { usePeriodReport } from '../../../hooks/usePeriodReport'
import WindowToggle from '../../report/WindowToggle'
import GradeHero from '../../report/GradeHero'
import BodySystemRadar from '../../report/BodySystemRadar'
import DeltaCard from '../../report/DeltaCard'
import MilestoneStrip from '../../report/MilestoneStrip'

/** Report tab — periodized verdict: pick a window, see grade + radar +
 * improvements/weaknesses + milestones. */
export default function ReportTab() {
  const [days, setDays] = useState(7)
  const { data: report, isLoading, isError } = usePeriodReport(days)

  return (
    <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
      <WindowToggle value={days} onChange={setDays} />

      {isLoading && (
        <div className="rounded-[18px] h-40 animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
      )}
      {isError && (
        <p style={{ color: 'var(--color-bad)', fontSize: 14 }}>
          Couldn't load your report. Try again in a moment.
        </p>
      )}

      {report && (
        <>
          <GradeHero report={report} />
          <BodySystemRadar axes={report.radar} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <span className="eyebrow num-mono" style={{ color: 'var(--color-good)', fontSize: 10, letterSpacing: '0.22em' }}>
                IMPROVEMENTS
              </span>
              {report.improvements.length === 0 ? (
                <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                  {report.has_baseline ? 'Nothing moved enough to call a win this window.' : 'No previous window to compare against yet.'}
                </p>
              ) : (
                report.improvements.map((d) => <DeltaCard key={d.key} item={d} />)
              )}
            </div>
            <div className="flex flex-col gap-3">
              <span className="eyebrow num-mono" style={{ color: 'var(--color-caution)', fontSize: 10, letterSpacing: '0.22em' }}>
                WATCH-OUTS
              </span>
              {report.weaknesses.length === 0 ? (
                <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                  {report.has_baseline ? 'No significant regressions — clean window.' : 'No previous window to compare against yet.'}
                </p>
              ) : (
                report.weaknesses.map((d) => <DeltaCard key={d.key} item={d} />)
              )}
            </div>
          </div>

          <MilestoneStrip milestones={report.milestones} />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/tabs/ReportTab.tsx
git commit -m "feat(period-report): ReportTab assembly"
```

---

### Task 17: Navigation wiring (tab + mobile nav + i18n)

**Files:**
- Modify: `frontend/src/i18n/strings.ts`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/components/dashboard/MobileBottomNav.tsx`

- [ ] **Step 1: Add the i18n string**

In `frontend/src/i18n/strings.ts`, find the line:
```typescript
  tab_crew: { en: 'Crew', de: 'Crew' },
```
Add immediately after it:
```typescript
  tab_report: { en: 'Report', de: 'Report' },
```

- [ ] **Step 2: Wire the tab into DashboardPage**

In `frontend/src/pages/DashboardPage.tsx`:

Add the import after the `CrewTab` import (line ~23):
```tsx
import ReportTab from '../components/dashboard/tabs/ReportTab'
```

Change the `TabId` type to include `report`:
```tsx
type TabId = 'today' | 'train' | 'trends' | 'crew' | 'report'
```

In `resolveTab`, add a case before the `crew` case:
```tsx
    case 'report': return 'report'
```

In the `tabs` array, add after the `crew` entry:
```tsx
    { id: 'report', label: t('tab_report') },
```

In the `tabContent` switch, add before the closing of the switch:
```tsx
      case 'report': return <ReportTab />
```

- [ ] **Step 3: Wire the mobile bottom nav**

In `frontend/src/components/dashboard/MobileBottomNav.tsx`:

Change the icon import line to add `Award`:
```tsx
import { Sun, CalendarDays, LineChart, Users, Award } from 'lucide-react'
```

Change the `TabId` type:
```tsx
type TabId = 'today' | 'train' | 'trends' | 'crew' | 'report'
```

Add to the `TABS` array after the `crew` entry:
```tsx
  { id: 'report', label: 'Report', icon: <Award size={20} strokeWidth={1.8} /> },
```

In `resolveActive`, add before the final `return 'today'`:
```tsx
  if (raw === 'report') return 'report'
```

- [ ] **Step 4: Type-check + lint**

Run: `cd frontend && npx tsc -b --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/i18n/strings.ts frontend/src/pages/DashboardPage.tsx frontend/src/components/dashboard/MobileBottomNav.tsx
git commit -m "feat(period-report): wire Report tab into nav (desktop + mobile + i18n)"
```

---

### Task 18: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Ensure both servers run**

Backend: `cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000` (DB up via `docker compose up -d`).
Frontend: `cd frontend && npm run dev` (serves on :5173).

- [ ] **Step 2: Drive the app**

Open `http://localhost:5173`, log in, and click the new **Report** tab (desktop strip + mobile bottom nav). Verify:
- Window toggle switches 7 / 14 / 30 and a custom value re-fetches.
- Grade hero shows a letter + score + verdict (or a graceful "not enough data" verdict on a sparse account).
- Radar renders five axes; insufficient axes are noted below.
- Improvements / Watch-outs populate (or show the correct empty/no-baseline copy).
- Milestones strip appears only when milestones exist.

Take a screenshot and **look at it** — a blank panel is a failure to render.

- [ ] **Step 3: Run the full backend test suite once more**

Run: `cd backend && uv run pytest tests/test_period_report.py -q`
Expected: PASS.

- [ ] **Step 4: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "fix(period-report): verification adjustments"
```

---

## Self-Review

**Spec coverage:**
- Placement as 5th tab → Task 17. ✓
- Grade + delta cards → Tasks 2-4, 12, 14, 16. ✓
- Streaks & milestones → Tasks 5, 15. ✓
- Body-system radar (5 axes) → Tasks 3, 13. ✓
- AI coach verdict w/ graceful fallback → Task 7. ✓
- Plain-first / science-on-tap (expandable cards, axis detail) → Tasks 13, 14. ✓
- Previous-equal-window baseline → Task 7 (`build_report` window math). ✓
- Backend endpoint + orchestrating service (Approach A) → Tasks 1-8. ✓
- Insufficient-data degradation → Tasks 3 (axis None), 7 (`has_baseline`), 13/16 (UI copy). ✓
- Custom bounds 3-365 → Tasks 7 (clamp) + 8 (400) + 11 (input clamp). ✓
- Unit tests for grade + significance → Tasks 2-7. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code. ✓

**Type consistency:** `WindowMetrics` fields, `RadarAxis`/`DeltaItem`/`Milestone`/`PeriodReport` field names, and the TS interfaces in `report.ts` all match the Pydantic schema in Task 1. Function names (`build_radar`, `composite_grade`, `build_deltas`, `build_milestones`, `_fetch_window_metrics`, `build_report`) are used consistently across tasks and tests. ✓

**Note for executor:** Task 6 imports `_activity_if`, `_extract_sleep_hours`, `_fetch_athlete_ftp`, `_zone_from_if`, and `pmc_window_summary` from `analytical_aggregates`, and `compute_activity_metrics` from `advanced_metrics` — all existing module-level functions (confirmed during planning, signatures verified). If any has been renamed, grep the source module and adjust the import; the composing logic is unchanged. These are underscore-prefixed "private" helpers but are already reused across services (e.g. coach tools), so importing them is consistent with the codebase.
