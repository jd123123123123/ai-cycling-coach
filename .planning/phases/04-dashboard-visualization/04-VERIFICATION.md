---
phase: 04-dashboard-visualization
verified: 2026-04-19T12:39:10Z
status: gaps_found
score: 4/5 must-haves verified
gaps:
  - truth: "WorkoutPreviewModal is wired from DashboardPage via the DashboardShell prop"
    status: partial
    reason: "DashboardPage.tsx passes workoutPreviewModal={null} with a stale comment 'plan 04-04 mounts the modal here'. The modal is actually rendered self-contained inside TrainingCalendar.tsx — so it WORKS — but DashboardShell.tsx renders {workoutPreviewModal} at the bottom of the page DOM (outside <main>), which is now dead since the value is always null. The stale comment is misleading and workoutPreviewModal prop is permanently null/orphaned."
    artifacts:
      - path: "frontend/src/pages/DashboardPage.tsx"
        issue: "workoutPreviewModal={null /* plan 04-04 mounts the modal here */} — comment is stale; null means DashboardShell never renders modal via its prop"
    missing:
      - "Either: remove the workoutPreviewModal prop slot entirely from DashboardShell (modal is already self-contained in TrainingCalendar), or: wire it correctly by lifting selectedPlanned state up to DashboardPage"
      - "Remove the stale comment from DashboardPage.tsx line 12"
human_verification:
  - test: "Apply migration then test end-to-end"
    expected: "Run 'alembic upgrade head' after Docker Desktop is running; verify planned_workouts table exists with RLS policy applied"
    why_human: "Docker Desktop was down during Phase 4; migration d2f9b4c7a1e5 is written but not applied"
  - test: "Drag a planned workout to a new calendar date"
    expected: "Event moves immediately (optimistic update), date PATCH request fires, calendar reflects new date"
    why_human: "Drag-drop gesture and optimistic rollback require runtime verification"
  - test: "Click a planned workout event to open the interval preview modal"
    expected: "Modal appears with SVG interval chart, Escape key closes it, focus returns to previous element"
    why_human: "Modal open/close UX and focus management require visual + keyboard testing"
  - test: "View dashboard on 320px-wide mobile screen"
    expected: "No horizontal scroll; body status tiles wrap to 2 columns; PMC chart fills width; calendar toolbar wraps but all buttons remain tappable"
    why_human: "Responsive layout at 320px requires visual inspection"
---

# Phase 4: Dashboard + Visualization — Verification Report

**Phase Goal:** Users have a beautiful daily touchpoint showing their body status, training load history, calendar, and workout details at a glance.
**Verified:** 2026-04-19T12:39:10Z
**Status:** gaps_found — 4/5 truths verified; 1 partial (wiring ambiguity, functionally OK but structurally stale)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User sees morning dashboard with sleep, HRV, body battery, readiness (DASH-01) | VERIFIED | `BodyStatusCard.tsx` renders all four metrics; readiness formula `0.4*hrv_norm + 0.35*body_battery + 0.25*sleep_score` with null-renormalization at lines 121–144; loading/error/not-connected/all-null/populated states all handled |
| 2 | PMC chart shows CTL/ATL/TSB with interactive hover and sport filter (DASH-02) | VERIFIED | `PMCChart.tsx` has three `<Line>` elements (blue CTL, red ATL, green TSB), `dot={false}`, `interval="preserveStartEnd"`, custom `PmcTooltip` formatting to 1 decimal, sport filter state wired to series selection |
| 3 | Training calendar with week/month views, completed vs planned colors, drag-drop rescheduling (DASH-03) | VERIFIED | `TrainingCalendar.tsx` uses `dateFnsLocalizer`, imports RBC CSS, `PointerSensor` with `activationConstraint:{distance:8}` + `TouchSensor`, merges completed (gray) + planned (blue) events, `handleDragEnd` fires PATCH via `useUpdatePlannedWorkout` |
| 4 | Workout interval preview modal with SVG chart before execution (DASH-04) | PARTIAL | `WorkoutPreview.tsx` renders proportional SVG rects with zone colors; `WorkoutPreviewModal.tsx` uses `createPortal`, `role="dialog"`, `aria-modal="true"`, Escape handler, body scroll lock, focus management — ALL CORRECT. Gap: `DashboardPage.tsx` passes `workoutPreviewModal={null}` (stale prop); modal works because it is self-contained in `TrainingCalendar`, but the DashboardShell prop slot is orphaned with a misleading comment |
| 5 | All views usable on mobile without horizontal scrolling (DASH-05) | VERIFIED | `index.css` has `overflow-x: hidden` on html/body, `.dashboard-break-words` utility, `.rbc-event` overrides; `min-w-0` on every flex child in DashboardShell sections and chart containers; 9 occurrences of `min-h-[44px]` across 5 components |

**Score:** 4/5 truths verified (DASH-04 is partial — functional but wiring comment is stale)

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `backend/app/api/daily_metrics.py` | VERIFIED | Exports `router`, prefix `/daily-metrics`, `GET ""` with `start_date`+`end_date` Query params, `get_db_for_user` RLS, registered in main.py line 66 |
| `backend/app/api/planned_workouts.py` | VERIFIED | 4 endpoints (POST, GET range, PATCH /{id}, DELETE /{id}), all use `get_db_for_user`, registered in main.py line 67 |
| `backend/app/models/planned_workout.py` | VERIFIED | All required fields present: id, user_id FK CASCADE, date, sport, title, duration_seconds_target nullable, description nullable, interval_structure JSON nullable, created_at, updated_at; `User.planned_workouts` relationship wired (user.py line 64) |
| `backend/migrations/versions/d2f9b4c7a1e5_add_planned_workouts.py` | VERIFIED | `down_revision='c1f8a3d9e2b7'`, creates table, 3 indexes, `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY user_isolation` — NOT YET APPLIED (Docker down; expected) |
| `frontend/src/components/dashboard/BodyStatusCard.tsx` | VERIFIED | 302 lines; uses `useDailyMetrics` + `useGarminStatus`; renders sleep_score, hrv_status, body_battery, readiness ring; correct formula with null renormalization |
| `frontend/src/components/dashboard/PMCChart.tsx` | VERIFIED | 145 lines; imports LineChart/Line/ResponsiveContainer/Tooltip from recharts; 3 Lines for CTL/ATL/TSB; custom tooltip; sport filter state |
| `frontend/src/components/dashboard/DashboardShell.tsx` | VERIFIED | Accepts bodyStatus/pmc/calendar/workoutPreviewModal props; min-w-0 on all sections |
| `frontend/src/components/dashboard/TrainingCalendar.tsx` | VERIFIED | 284 lines; dateFnsLocalizer; RBC CSS import; DndContext with PointerSensor+TouchSensor; merges completed+planned events; PATCH on drag-drop; onSelectEvent opens WorkoutPreviewModal; WorkoutPreviewModal self-contained at bottom of component |
| `frontend/src/components/dashboard/WorkoutPreview.tsx` | VERIFIED | SVG with proportional widths, zone-colored rects, empty-intervals state, legend |
| `frontend/src/components/dashboard/WorkoutPreviewModal.tsx` | VERIFIED | createPortal, role="dialog", aria-modal="true", aria-labelledby, Escape key handler, backdrop click closes, body scroll lock, focus management |
| `frontend/src/types/workoutInterval.ts` | VERIFIED | Exports Interval, IntervalStructure, POWER_ZONE_COLORS (7-zone), POWER_ZONE_LABELS, zoneFromPctFtp |
| `frontend/src/hooks/useDailyMetrics.ts` | VERIFIED | useQuery wrapping fetchDailyMetrics |
| `frontend/src/hooks/usePlannedWorkouts.ts` | VERIFIED | All 4 exports: usePlannedWorkouts, useCreatePlannedWorkout, useUpdatePlannedWorkout (optimistic via getQueriesData/setQueryData/onError rollback), useDeletePlannedWorkout |
| `frontend/src/hooks/usePMC.ts` | VERIFIED | useQuery wrapping fetchPMC |
| `frontend/package.json` dependencies | VERIFIED | recharts@^3.8.1, react-big-calendar@^1.19.4, @dnd-kit/core@^6.3.1, date-fns@^3.6.0 all present |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| BodyStatusCard | /api/daily-metrics | useDailyMetrics → fetchDailyMetrics | WIRED | Hook called at line 168, response rendered as metrics tiles |
| PMCChart | /api/pmc | usePMC → fetchPMC | WIRED | Hook called at line 47, series rendered in LineChart |
| TrainingCalendar | /api/planned-workouts | usePlannedWorkouts + useUpdatePlannedWorkout | WIRED | Queries at line 108–109; PATCH triggered in handleDragEnd line 152 |
| TrainingCalendar | WorkoutPreviewModal | selectedPlanned state + onSelectEvent | WIRED | State at line 94; onSelectEvent at line 266–269; modal rendered at line 277 |
| DashboardPage | DashboardShell | prop injection | WIRED | bodyStatus, pmc, calendar props populated with real components |
| DashboardPage | workoutPreviewModal prop | null literal | ORPHANED | Prop always null; stale comment says "plan 04-04 mounts the modal here" — modal actually lives in TrainingCalendar. Functionally not broken but structurally confusing. |
| daily_metrics router | main.py | include_router | WIRED | Line 54+66 confirmed |
| planned_workouts router | main.py | include_router | WIRED | Line 55+67 confirmed |

---

## Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| DASH-01: Morning dashboard with body metrics | SATISFIED | All 4 metrics rendered; 5 UI states handled |
| DASH-02: PMC chart with CTL/ATL/TSB | SATISFIED | Three lines, custom tooltip, sport filter |
| DASH-03: Calendar with week/month, planned vs completed, drag-drop | SATISFIED | Full implementation verified |
| DASH-04: Workout interval preview before execution | SATISFIED (partial wiring note) | Modal works self-contained in TrainingCalendar; DashboardShell prop slot is dead/stale |
| DASH-05: Mobile responsive, no horizontal scroll | SATISFIED | CSS guards, min-w-0 guards, 44px touch targets throughout |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `frontend/src/pages/DashboardPage.tsx` | 12 | `workoutPreviewModal={null /* plan 04-04 mounts the modal here */}` | Warning | Stale comment; prop permanently null; DashboardShell renders `{workoutPreviewModal}` at line 47 which is dead. Modal works anyway via TrainingCalendar self-containment. |

---

## Non-Regression Checks

| Check | Status | Evidence |
|-------|--------|---------|
| TypeScript `tsc --noEmit` | PASSED | Exit 0, no output |
| All Phase 3 routers still in main.py | PASSED | /garmin, /training-load, /activities, /athletes, /users, /auth, /consent all confirmed via static parse |
| /daily-metrics and /planned-workouts registered | PASSED | Lines 54–55 import, lines 66–67 include_router |

---

## Known Migration Blocker (Not a Phase 4 Gap)

Migration `d2f9b4c7a1e5_add_planned_workouts.py` is written and correct but NOT applied — Docker Desktop was down during Phase 4 development. This is documented and expected. To enable runtime testing, the user must:

1. Start Docker Desktop
2. `cd backend && alembic upgrade head`

This creates the `planned_workouts` table with RLS policy `user_isolation`.

---

## Human Verification Required

### 1. Apply pending migration

**Test:** Start Docker Desktop, run `cd backend && alembic upgrade head`
**Expected:** Migration `d2f9b4c7a1e5` applies cleanly; `planned_workouts` table exists; `\d planned_workouts` in psql shows all 9 columns + RLS enabled
**Why human:** Docker Desktop was down; cannot verify DB runtime state from code inspection

### 2. Drag-drop calendar rescheduling

**Test:** Create a planned workout, then drag it to a different calendar date
**Expected:** Event moves immediately (optimistic update visible); network PATCH request fires to `/planned-workouts/{id}`; on page reload, new date persists
**Why human:** Drag gesture and optimistic rollback require runtime interaction

### 3. Workout interval preview modal UX

**Test:** Click a planned workout event in the calendar
**Expected:** Modal appears with SVG interval visualization (zone-colored bars); pressing Escape closes it and returns focus to the event; clicking backdrop also closes
**Why human:** Modal open/close, focus trap, and keyboard handling require live browser testing

### 4. Mobile responsiveness at 320px

**Test:** Open DevTools, set viewport to 320×568px, navigate to dashboard
**Expected:** No horizontal scroll bar; BodyStatusCard shows 2-column tile grid; PMC chart fills width without overflow; calendar toolbar wraps neatly; all buttons at least 44px tall
**Why human:** Visual layout at extreme narrow viewport needs human eyes

---

## Gaps Summary

One structural gap found: `DashboardPage.tsx` passes `workoutPreviewModal={null}` with a stale comment indicating plan 04-04 was supposed to mount the modal there. The modal was instead implemented as self-contained within `TrainingCalendar.tsx` (which is architecturally cleaner), but the dead `workoutPreviewModal` prop slot in `DashboardShell` now renders nothing and the comment misleads future readers. The functional outcome (modal opens on event click, closes on Escape/backdrop) is correct. The cleanup needed is: remove the stale comment from `DashboardPage.tsx` and either remove the `workoutPreviewModal` prop from `DashboardShell` or document why it exists for future extensibility.

---

_Verified: 2026-04-19T12:39:10Z_
_Verifier: Claude (gsd-verifier)_
