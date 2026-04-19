---
phase: "04"
plan: "03"
subsystem: "dashboard-calendar"
tags: ["planned-workouts", "react-big-calendar", "dnd-kit", "rls", "optimistic-ui", "drag-drop"]

dependency-graph:
  requires: ["04-01"]
  provides: ["planned-workouts-api", "training-calendar-ui"]
  affects: ["04-04"]

tech-stack:
  added:
    - "react-big-calendar@^1.19.4"
    - "@dnd-kit/core@^6.3.1"
    - "@dnd-kit/sortable"
    - "@dnd-kit/utilities"
    - "@types/react-big-calendar (dev)"
  patterns:
    - "dateFnsLocalizer (required for react-big-calendar rendering)"
    - "PointerSensor + TouchSensor activationConstraint (drag vs. click disambiguation)"
    - "Optimistic mutation with getQueriesData/setQueryData rollback"
    - "DndContext wrapping react-big-calendar with custom event/dateCellWrapper components"

key-files:
  created:
    - "backend/app/models/planned_workout.py"
    - "backend/app/schemas/planned_workout.py"
    - "backend/app/services/planned_workout_service.py"
    - "backend/app/api/planned_workouts.py"
    - "backend/migrations/versions/d2f9b4c7a1e5_add_planned_workouts.py"
    - "frontend/src/hooks/usePlannedWorkouts.ts"
    - "frontend/src/components/dashboard/TrainingCalendar.tsx"
  modified:
    - "backend/app/models/user.py"
    - "backend/app/models/__init__.py"
    - "backend/app/main.py"
    - "frontend/src/api/dashboard.ts"
    - "frontend/src/pages/DashboardPage.tsx"

decisions:
  - id: "04-03-a"
    decision: "dateFnsLocalizer required for react-big-calendar"
    rationale: "react-big-calendar renders nothing without a localizer — must be wired with date-fns functions and locale"
  - id: "04-03-b"
    decision: "PointerSensor activationConstraint distance:8 + TouchSensor delay+tolerance"
    rationale: "Without activationConstraint, dnd-kit intercepts calendar nav button clicks as drag starts"
  - id: "04-03-c"
    decision: "Optimistic PATCH via getQueriesData / setQueryData across all planned-workouts cache keys"
    rationale: "Calendar renders multiple overlapping query keys (week vs month) — must update all cache entries for instant UI feedback on drag-drop"
  - id: "04-03-d"
    decision: "Migration d2f9b4c7a1e5 written but not applied (Docker down)"
    rationale: "Docker daemon unresponsive (carried Phase-3 blocker) — migration file is correct and will apply on next Docker restart"
  - id: "04-03-e"
    decision: "EventRenderer and DroppableDateCell typed to EventProps<CalEvent> and DateCellWrapperProps from @types/react-big-calendar"
    rationale: "react-big-calendar components prop requires exact types — casting to ComponentType<{event:RbcEvent}> failed TS strict mode"

metrics:
  duration: "~5 min"
  completed: "2026-04-19"
---

# Phase 4 Plan 03: Training Calendar Summary

**One-liner:** PlannedWorkout CRUD backend (4 endpoints, RLS) + react-big-calendar + dnd-kit TrainingCalendar with optimistic drag-drop rescheduling.

## Objective

Ship the PlannedWorkout model and REST API, then build a TrainingCalendar React component that merges completed activities (grey) and planned workouts (blue) in week/month views, with drag-drop rescheduling and optimistic UI.

## What Was Built

### Backend (Task 1)

- `PlannedWorkout` ORM model: id, user_id FK CASCADE, date, sport String(30), title String(200), duration_seconds_target, description, interval_structure JSON, created_at, updated_at
- `User.planned_workouts` relationship with `cascade="all, delete-orphan"` added to user.py and __init__.py
- `PlannedWorkoutCreate/Update/Read/ListResponse` Pydantic schemas with Literal sport validation and Field constraints
- `planned_workout_service`: create (flush+refresh), list_by_range (SA 2.0 select), get (user-scoped), update (setattr non-None fields), delete (flush); all caller-commits
- `/planned-workouts` router: POST 201, GET (both params required, max 366d, 400 on violation), PATCH drag-drop, DELETE 204 — all RLS-protected via `get_db_for_user`
- Alembic migration `d2f9b4c7a1e5` with table + 3 indexes (user_id, date, composite user_id+date) + RLS policy matching `a076ea752213` pattern

### Frontend (Task 2 + 3)

- Installed react-big-calendar@^1 and @dnd-kit/core@^6 + sortable/utilities
- Appended PlannedWorkout types + 4 fetchers to `api/dashboard.ts` (reused existing `toIsoDate` helper, did not rewrite file)
- `usePlannedWorkouts.ts`: query, create, optimistic PATCH (cancels inflight, updates all matching cache keys, rolls back on error, refetches on settled), delete
- `TrainingCalendar.tsx`:
  - dateFnsLocalizer with date-fns locale enUS (pitfall guard #1)
  - CSS import `react-big-calendar/lib/css/react-big-calendar.css` (pitfall guard #2)
  - PointerSensor `activationConstraint:{distance:8}` + TouchSensor `{delay:150, tolerance:8}` (pitfall guard #3)
  - Week/month view toggle, prev/today/next navigation, custom toolbar above calendar
  - Merged event stream: completed activities (grey `#9ca3af`) + planned workouts (blue `#2563eb`)
  - `EventRenderer`: planned events wrapped in `useDraggable`, completed events static
  - `DroppableDateCell`: day cells highlighted on drag-over via `useDroppable`
  - `onDragEnd`: extracts pw-id, calls optimistic PATCH if date changed
  - `onSelectEvent`: console.log + `// TODO(04-04): open workout preview modal here`
  - Loading skeleton (animate-pulse) + error state with retry
- `DashboardPage.tsx`: import + mount `<TrainingCalendar />` in calendar slot; pmc={<PMCChart />} left intact (04-02 had already run)

## Verification Results

- `python3 -c "from app.models.planned_workout import PlannedWorkout; print(PlannedWorkout.__tablename__)"` → `planned_workouts`
- `python3 -c "from app.api.planned_workouts import router; print(len(router.routes))"` → `4`
- `python3 -c "from app.main import app; paths = [r.path for r in app.routes]; assert '/planned-workouts' in paths; assert any('/planned-workouts/' in p for p in paths); print('registered')"` → `registered`
- `grep "CREATE POLICY user_isolation ON planned_workouts" migration` → matches
- `grep dateFnsLocalizer TrainingCalendar.tsx` → line 1 (import) + line 23 (usage)
- `grep activationConstraint TrainingCalendar.tsx` → lines 111-112 (PointerSensor + TouchSensor)
- `grep react-big-calendar/lib/css/react-big-calendar.css TrainingCalendar.tsx` → line 2
- `npx tsc --noEmit` → passes (0 errors)
- `npm run build` → passes (✓ built in 380ms, warning only for chunk size)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type mismatch in react-big-calendar component props**

- **Found during:** Task 2 `npm run build`
- **Issue:** Casting `EventRenderer` to `ComponentType<{event:RbcEvent}>` and `DroppableDateCell` to `ComponentType<{value:Date;children:ReactNode}>` failed strict TS because the library's `EventProps<T>` has additional required fields (title, continuesPrior, continuesAfter, localizer, slotStart, slotEnd) and `DateCellWrapperProps.children` is `JSX.Element` not `ReactNode`
- **Fix:** Import `EventProps` and `DateCellWrapperProps` from `react-big-calendar`, type the sub-components directly against these interfaces; cast `EventRenderer` to `React.ComponentType<EventProps<RbcEvent>>` in the components prop
- **Files modified:** `frontend/src/components/dashboard/TrainingCalendar.tsx`
- **Commit:** included in `2b761a9`

## Authentication Gates

None.

## Migration Status

Migration `d2f9b4c7a1e5_add_planned_workouts.py` is written and chained correctly from `c1f8a3d9e2b7`. **Not applied** — Docker daemon is unresponsive (carried Phase-3 blocker). Will apply automatically on next `docker compose up -d db && alembic upgrade head`.

## Next Phase Readiness

- **04-04 (workout modal):** Unblocked. `interval_structure` JSONB is on `PlannedWorkout`, `onSelectEvent` has the TODO comment, and `useCreatePlannedWorkout` / `useUpdatePlannedWorkout` hooks are ready.
- **Phase 7 (AI coaching):** `PlannedWorkout` schema is stable stub — Phase 7 adds interval periodization metadata additively.
- **Pending:** Docker restart + `alembic upgrade head` to apply migration before running app end-to-end.
