# Same-workout progression ("Workouts") — design

**Date:** 2026-06-25
**Status:** Approved (pending spec review)

## Problem / goal

When an athlete repeats the same workout (e.g. "Zwift Rønnestad" 40 times), they
want to see whether they're improving — is power rising at a given heart rate, is
aerobic efficiency climbing, are the averages trending up? Today there's no way to
line up repeats of one workout and compare them.

## Scope

A new **Workouts** view: a list of the athlete's repeated workouts, each opening a
progression detail that trends key metrics across every repetition.

- **Grouping:** by normalized activity title; a "repeated workout" = ≥ 2 activities
  sharing a normalized key.
- **Metrics (all from existing `Activity` columns — no per-second streams):**
  power-at-HR (efficiency factor), average / normalized power, aerobic-efficiency
  trend, pace/speed, duration, TSS.
- **Surfaces:** a list screen + a per-workout detail screen.

## Non-goals (YAGNI / deferred)

- **True intra-ride decoupling** (first-half vs second-half power:HR within a single
  ride) needs the per-second stream pipeline, which is still WIP/uncommitted. v1
  uses the per-rep **efficiency factor (NP ÷ HR) trend** as the aerobic-efficiency
  signal; real decoupling is a phase-2 add when streams land reliably.
- No manual tagging / merging of workouts (grouping is automatic).
- No interval-by-interval comparison (also stream-dependent) — aggregate per-rep
  only.
- No caching in v1 — the aggregation is lightweight; adopt the `period_reports`
  cache pattern later only if it proves slow.

## Confirmed decisions (brainstorming)

- Metrics wanted: **all four families** — power-at-HR, avg/NP power, aerobic
  efficiency, pace/speed & duration.
- Grouping: **normalized title** (not exact, not +sport — though sport is carried
  for display and sport-appropriate metric selection).
- Placement: **a dedicated "Workouts" view** (not a section inside Analyze).
- Decoupling: **phase-2** (efficiency-factor trend stands in for v1).
- **Open for spec review:** nav entry point — defaulting to a new top-level
  "Workouts" tab; alternative is a `/workouts` route linked from the activity
  list / Today. Reviewer decides.

## Architecture

### Grouping — `normalize_title` (pure)

`normalize_title(title: str | None) -> str | None`:
1. None/blank → None (ungroupable; excluded).
2. Lowercase, trim, collapse internal whitespace.
3. Strip a leading platform prefix: `zwift - `, `rouvy - `, `wahoo - `,
   `trainerroad - `, `mywhoosh - `, `indievelo - `, `peloton - ` (case-insensitive,
   only when followed by ` - `).
4. Strip a trailing counter ` (1)`, ` (2)`, … (a space + parenthesized integer at
   the end).

Conservative on purpose — these four rules fix the noise seen in real data
(`Zwift - Aerobic Foundation Forge`, `Zwift - Breakfast Returns (1)`,
`ROUVY - IRONMAN 70.3 Knokke-Heist`) without aggressive fuzzy matching that could
merge distinct workouts. The normalized key groups; the **display title** is the
most-frequent original title in the group; **sport** is the group's modal sport.

### Per-rep metrics (a "rep" = one `Activity` in the group)

Derived purely from existing columns (`average_power`, `normalized_power`,
`average_hr`, `max_hr`, `tss`, `duration_seconds`, `distance_meters`, `started_at`):

```python
@dataclass
class WorkoutRep:
    activity_id: int
    date: str                  # started_at date (ISO)
    duration_s: int | None
    distance_m: float | None
    tss: float | None
    avg_power: float | None
    normalized_power: float | None
    avg_hr: int | None
    max_hr: int | None
    efficiency_factor: float | None   # (normalized_power or avg_power) / avg_hr, when both present
    pace_s_per_km: float | None       # duration_s / (distance_m/1000), when distance present
```

- `efficiency_factor` is the "power at a given HR" signal — higher over time = fitter.
- Missing power (outdoor/no meter, runs) → power fields + efficiency None; pace still shown.

### Trend summary (per metric, per group)

For each metric series (efficiency, avg_power, np, avg_hr, pace, tss), over the reps
that have that value, oldest→newest:

```python
@dataclass
class WorkoutTrend:
    metric: str
    series: list[float]        # values oldest→newest (only reps that have it)
    first: float | None
    last: float | None
    delta: float | None        # last - first
    pct: float | None          # delta / first * 100
    improving: bool | None     # direction-aware: up-good for power/efficiency; down-good for pace/avg_hr-at-effort
```

`improving` direction: power, NP, efficiency, TSS → up is better; pace (s/km) and
avg_hr → down is better. A `None` when fewer than 2 points.

### Headline (per group, for the list)

Pick the most informative available signal, in priority order, formatted as a short
string + tone:
1. efficiency (if ≥ 2 reps have NP+HR) → e.g. "Efficiency +6%"
2. else avg/NP power → "Avg power 210→225 W"
3. else pace → "Pace 4:45→4:30 /km"
4. else "{count}× logged" (no comparable metric)

## Backend

New router `app/api/workouts.py` + service `app/services/workout_comparison.py`.

- `GET /workouts` → `list[WorkoutGroupSummary]`
  `{ key, title, sport, count, first_date, last_date, headline: {text, tone} }`,
  only groups with `count ≥ 2`, sorted by `count` desc then `last_date` desc.
- `GET /workouts/{key}` → `WorkoutGroupDetail`
  `{ key, title, sport, reps: [WorkoutRep…oldest→newest], trends: [WorkoutTrend…] }`.
  404 when the key has < 2 reps for this user.

Both depend on `get_current_active_user` + `get_db_for_user` (RLS). The service
loads the user's activities (one query, ordered by `started_at`), groups in Python
by `normalize_title`, and computes reps/trends. `{key}` is URL-encoded (it can
contain spaces); the service re-derives keys and matches.

Schemas in `app/schemas/workout_progression.py` (Pydantic: `WorkoutRep`,
`WorkoutTrend`, `Headline`, `WorkoutGroupSummary`, `WorkoutGroupDetail`).

## Frontend — Workouts view

- `api/workouts.ts` (`listWorkouts()`, `getWorkout(key)`), `hooks/useWorkouts.ts`
  (React Query).
- `components/workouts/WorkoutsList.tsx` — cards: title · "done N×" · date range ·
  a sparkline of the headline metric · the headline delta with tone color.
- `components/workouts/WorkoutDetail.tsx` — the four metric families as trend charts
  across reps (efficiency/power@HR, avg & NP power, efficiency trend, pace/duration)
  + a per-rep table (date, power, HR, EF, pace, TSS). Reuses existing chart
  components (the project already uses recharts / echarts / uplot) and the dashboard
  card styling.
- **Entry point (default, reviewer may change):** a new top-level **Workouts** tab
  in `DashboardPage` (`SegmentedTabs` + `MobileBottomNav`), rendering `WorkoutsList`;
  selecting a card routes to the detail. Localized (en + de) via the existing
  `useT()` system.

## Error handling

- Activities with no title → excluded from grouping (can't identify).
- A group where no rep has a comparable metric → still listed with a
  "{count}× logged" headline; detail shows what data exists.
- `getWorkout` on an unknown/elapsed key → 404 → the UI shows a "workout not found"
  state and a link back to the list.
- Division guards: efficiency/pace only when denominators are present and > 0.

## Testing

- **Pure (`normalize_title`, grouping, metrics, trends):** prefix stripping,
  trailing-counter stripping, case/whitespace, None title; grouping counts; EF and
  pace math with missing inputs; trend delta/pct + direction-aware `improving`;
  headline priority selection. (Backend pytest.)
- **API (mocked-db, `TestClient` + `dependency_overrides`):** list returns only
  groups ≥ 2 sorted by count; detail returns ordered reps + trends; unknown key →
  404; RLS scoping.
- **Frontend:** verified live against the running app (list renders repeated
  workouts; opening one shows the trends; a single-rep workout never appears).

## Files

**Backend (new):** `app/schemas/workout_progression.py`,
`app/services/workout_comparison.py`, `app/api/workouts.py`,
`tests/test_workout_comparison.py`, `tests/api/test_workouts.py`;
**edit:** `app/main.py` (register router).

**Frontend (new):** `api/workouts.ts`, `hooks/useWorkouts.ts`,
`components/workouts/WorkoutsList.tsx`, `components/workouts/WorkoutDetail.tsx`;
**edit:** `pages/DashboardPage.tsx` + tab/nav wiring, `i18n/strings.ts` (labels).
