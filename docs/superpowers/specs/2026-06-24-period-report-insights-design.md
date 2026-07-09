# Period Report — Richer Insights ("more to do, more to change")

**Date:** 2026-06-24
**Branch:** feat/period-report
**Builds on:** `2026-06-08-period-report-redesign-design.md` (the Verdict → Diagnosis → Prescription three-act redesign, now shipped).

## Goal

The redesigned report reads well but is thin on *actionable training insight*. Add four deterministic insight blocks that answer "what's my training doing, am I adapting, and what should I change" — all surfacing analysis the app **already computes** in existing services. The AI verdict, grade, radar, deltas, causes, and milestones are unchanged. Every new block renders nothing when its data is insufficient.

## Non-goals

- No new data pipeline, no schema migration, no scoring-model changes.
- No change to the AI verdict prompt or the grade composite.
- No new external dependencies.

## Backend

### Schema (`app/schemas/period_report.py`)

Four new optional fields on `PeriodReport`:

```python
class Prescription(BaseModel):
    priority: int            # 1 = most important
    headline: str
    detail: str              # what to do
    effect: str              # expected outcome ("locks in the ramp", ...)
    tone: str = "neutral"    # good | caution | bad | neutral
    icon_key: str = "arrow"  # UI hint: arrow | rest | build | balance | sleep

class IntensityMix(BaseModel):
    z1_pct: float            # easy share, 0-100
    z2_pct: float            # moderate / grey
    z3_pct: float            # hard
    model: str               # detected: polarized | pyramidal | threshold | unstructured
    target_model: str        # ideal for the current phase
    verdict: str             # one line, plain
    fix: str | None = None   # one-line change, null when already on-model
    sample_rides: int        # rides classified (for "n rides" footnote / sufficiency)

class LoadDynamics(BaseModel):
    ramp_per_week: float | None   # CTL change per week within window
    monotony: float | None        # Foster: mean(daily TSS) / std(daily TSS)
    strain: float | None          # Foster: weekly load * monotony
    flag: str                     # ok | bouncy | spiky | flat
    note: str                     # plain-language read

class Trajectory(BaseModel):
    days_to_goal: int | None
    ctl_now: float
    ctl_7d_delta: float
    ctl_projected_at_goal: float
    ctl_target: float | None
    tsb_projected_at_goal: float
    taper_window: str             # ideal | too_fresh | overreached | unknown
    on_track: str                 # yes | behind | ahead | no_goal | ...
    weekly_tss_required: float
    weekly_tss_actual: float
    narrative: str                # narrative_hook from goal_trajectory
```

`PeriodReport` adds: `intensity: IntensityMix | None`, `load_dynamics: LoadDynamics | None`, `trajectory: Trajectory | None`, `prescriptions: list[Prescription]`. `next_step` is retained and set to a NextStep mirror of `prescriptions[0]` for back-compat.

### Service (`app/services/period_report.py`)

- **`WindowMetrics`** gains `z1_count`, `z2_count`, `z3_count` (from the existing per-activity `_zone_from_if` loop — z2 already counted as grey) and `daily_tss: list[float]` (from `pmc["days"]`).
- **`build_intensity(cur, phase) -> IntensityMix | None`** — compute zone shares from the z-counts; call `tid_optimizer.assess_tid(z1, z2, z3, phase)` for model/target/verdict; derive `fix`. Returns `None` when `sample_rides == 0`.
- **`build_load_dynamics(cur) -> LoadDynamics | None`** — ramp = `ctl_delta / (days/7)`; Foster monotony = mean/SD of `daily_tss`, strain = weekly load × monotony; classify `flag`. `None` when `< 4` training days.
- **`build_trajectory(db, user_id, phase) -> Trajectory | None`** — fetch the same PMC + athlete goals the coach uses, call `goal_trajectory.project(...)`, map to `Trajectory`. `None` only on hard failure (the service already degrades to `no_goal`).
- **`build_prescriptions(grade_score, cur, causes, intensity, load_dynamics, trajectory) -> list[Prescription]`** — generalizes `build_next_step`. Priority-ordered, safety first: high-severity cause / deep-negative TSB → back off; then trajectory gap (ramp up to `weekly_tss_required`), TID fix, consistency, ramp/recovery-week, sleep debt. Cap at 4. `build_next_step` becomes a thin wrapper returning `prescriptions[0]` as a `NextStep`.
- **`build_report`** wires the new builders after `detect_training_phase(...)`; each in its own try/except so one failing block never sinks the report.

## Frontend

New components under `src/components/report/`, slotted into the existing acts in `ReportTab.tsx`. No change to `GradeHero`/`BodySystems`/`DeltaCard`/`CausesPanel`.

- **Act 2 · Diagnosis** (after BodySystems, before/after the delta grid):
  - `IntensityMix.tsx` — three stacked zone bars (easy/mod/hard) with the detected-model label, the phase target, and the `fix` line. Grey/hard tones use `--color-caution`/`--color-bad`.
  - `LoadDynamics.tsx` — compact chip strip: ramp/week, monotony, strain, each toned by `flag`, plus the `note`.
- **Act 3 · Prescription**:
  - `TrajectoryCard.tsx` — leads the act: CTL now → projected vs target mini-bar, days-to-goal, taper-window pill, on-track verdict, `narrative`. Frames "why these actions."
  - `PrescriptionList.tsx` — replaces the lone `NextStepCard`. `prescriptions[0]` keeps the Fraunces-CTA wash treatment (reuse `NextStepCard` for it); the remaining ranked rows are tighter: icon + headline + `effect` chip, `detail` below.

All new strings ship DE + EN via the existing `locale === 'de'` pattern. Backend-authored strings (verdict, narrative, TID/trajectory copy) stay English as today.

## Data flow

`build_report` → `detect_training_phase` → (`build_intensity`, `build_load_dynamics`, `build_trajectory`) → `build_prescriptions(... those three ...)` → `PeriodReport`. The three diagnostic blocks feed the prescription ranking, so prescriptions reference real, on-screen numbers.

## Testing

- Backend: unit tests per builder in `tests/services/test_period_report*.py` — sufficient + insufficient-data paths, and that `build_prescriptions` honors safety ordering and the 4-cap. Assert `next_step == prescriptions[0]` mirror.
- Frontend: `tsc --noEmit`; Playwright pass on a seeded account — DE + EN, desktop + mobile — confirming each block renders and the no-goal / no-rides states degrade cleanly.

## Verification

Open Analyze → Report on an account with history; confirm the four blocks appear with sane numbers, the prescriptions reference the intensity/trajectory/load figures, and toggling 7/14/30 re-fetches all blocks. Screenshot desktop + mobile, DE + EN.
