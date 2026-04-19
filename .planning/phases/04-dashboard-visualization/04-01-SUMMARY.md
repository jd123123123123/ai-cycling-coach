---
phase: 04-dashboard-visualization
plan: 01
subsystem: ui
tags: [react, react-query, tanstack-query, date-fns, fastapi, pydantic, typescript, tailwind]

# Dependency graph
requires:
  - phase: 03-garmin-data-integration
    provides: daily_metrics hypertable + garmin sync pipeline + garmin status endpoint
  - phase: 02-training-engine
    provides: PMC endpoint (/training-load/pmc) + activities endpoint
  - phase: 01-foundation-auth
    provides: apiClient with 401 interceptor + auth context + React + Vite + FastAPI skeleton

provides:
  - GET /daily-metrics?start_date&end_date endpoint (RLS via get_db_for_user, 366-day max)
  - DailyMetricRead + DailyMetricListResponse Pydantic schemas
  - React Query v5 QueryClient with 401-safe retry config
  - QueryClientProvider wrapping entire app (single shared instance)
  - Typed fetchers: fetchDailyMetrics, fetchActivitiesRange, fetchPMC, fetchGarminStatus
  - Hooks: useDailyMetrics, useActivitiesRange, usePMC, useGarminStatus
  - DashboardShell with 3 named section slots (body-status-section, pmc-section, calendar-section)
  - BodyStatusCard with composite readiness formula and 5-state handling
  - Rewritten DashboardPage using DashboardShell + BodyStatusCard

affects:
  - 04-02 (PMC chart — mounts into pmc slot via DashboardShell prop)
  - 04-03 (calendar — mounts into calendar slot via DashboardShell prop)
  - 04-04 (workout preview modal — mounts via workoutPreviewModal slot)
  - all future frontend features (must use queryClient from src/lib/queryClient.ts)

# Tech tracking
tech-stack:
  added:
    - "@tanstack/react-query@^5"
    - "date-fns@^3"
  patterns:
    - React Query with single shared queryClient (no per-component instances)
    - 401-safe retry: retry:false on 401/403/404 avoids racing axios interceptor refresh queue
    - Named section slots via ReactNode props (DashboardShell pattern for parallel Wave 2 plans)
    - min-w-0 on all flex/grid children that will contain Recharts ResponsiveContainer
    - Composite readiness: null-weight renormalization (not null→50 fallback)

key-files:
  created:
    - backend/app/schemas/daily_metric.py
    - backend/app/api/daily_metrics.py
    - frontend/src/lib/queryClient.ts
    - frontend/src/api/dashboard.ts
    - frontend/src/hooks/useDailyMetrics.ts
    - frontend/src/hooks/useActivitiesRange.ts
    - frontend/src/hooks/usePMC.ts
    - frontend/src/hooks/useGarminStatus.ts
    - frontend/src/components/dashboard/DashboardShell.tsx
    - frontend/src/components/dashboard/BodyStatusCard.tsx
  modified:
    - backend/app/main.py
    - frontend/src/main.tsx
    - frontend/src/pages/DashboardPage.tsx
    - frontend/package.json

key-decisions:
  - "retry:false on 401/403/404 in QueryClient — avoids racing existing axios 401 interceptor refresh queue"
  - "DashboardShell uses ReactNode props for section slots (not children/slots API) — enables parallel Wave 2 plans to mount without touching shell"
  - "min-w-0 on every flex/grid child that will contain Recharts — research pitfall: ResponsiveContainer renders 0px wide without it"
  - "Null metrics in readiness formula get weight 0 and remaining weights renormalize — avoids null pulling score toward 50"
  - "BodyStatusCard owns its own date range (3 days ago to today) — no props needed, simpler API"
  - "toIsoDate() uses local date (not UTC) for daily-metrics params — matches backend date type"

patterns-established:
  - "All React Query hooks import from src/lib/queryClient.ts — single source of truth"
  - "All fetchers use apiClient from src/api/client.ts — no new axios instances"
  - "DashboardShell slot pattern: Wave 2 plans pass components as props, not by adding top-level sections"
  - "BodyStatusCard state order: loading → error → not-connected → no-data → populated"

# Metrics
duration: 4min
completed: 2026-04-19
---

# Phase 4 Plan 01: Dashboard Foundation Summary

**GET /daily-metrics endpoint + React Query v5 + DashboardShell with named section slots + BodyStatusCard with composite readiness (hrv/battery/sleep null-renormalization)**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-19T12:16:46Z
- **Completed:** 2026-04-19T12:20:02Z
- **Tasks:** 3
- **Files modified:** 14 (3 modified, 10 created, 1 package.json)

## Accomplishments

- Backend: `GET /daily-metrics?start_date&end_date` registered, RLS-protected via `get_db_for_user`, validates range (<= 366 days), returns `DailyMetricListResponse`
- Frontend: React Query v5 + date-fns installed; single `QueryClient` with 401-safe retry (no retry on 401/403/404) wraps entire app; four typed hooks ready for Wave 2 plans
- Dashboard: `DashboardShell` exposes three `data-testid`-named section slots enabling parallel Wave 2 plan execution; `BodyStatusCard` is the first live card handling 5 distinct states

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend daily-metrics endpoint + schemas + router** - `f0e2491` (feat)
2. **Task 2: React Query + QueryClientProvider + typed fetchers and hooks** - `d29b350` (feat)
3. **Task 3: DashboardShell + BodyStatusCard + rewritten DashboardPage** - `f8f7ec8` (feat)

## Files Created/Modified

- `backend/app/schemas/daily_metric.py` - DailyMetricRead + DailyMetricListResponse Pydantic schemas
- `backend/app/api/daily_metrics.py` - GET /daily-metrics endpoint with range validation
- `backend/app/main.py` - daily_metrics_router registered after garmin_router
- `frontend/src/lib/queryClient.ts` - Shared QueryClient with 401-safe retry config
- `frontend/src/main.tsx` - QueryClientProvider wraps App
- `frontend/src/api/dashboard.ts` - Typed fetchers for all 4 data sources (uses existing apiClient)
- `frontend/src/hooks/useDailyMetrics.ts` - React Query hook for daily metrics
- `frontend/src/hooks/useActivitiesRange.ts` - React Query hook for activities range
- `frontend/src/hooks/usePMC.ts` - React Query hook for PMC data
- `frontend/src/hooks/useGarminStatus.ts` - React Query hook for Garmin connection status
- `frontend/src/components/dashboard/DashboardShell.tsx` - Responsive shell with 3 named section slots
- `frontend/src/components/dashboard/BodyStatusCard.tsx` - Body status card with 5-state handling
- `frontend/src/pages/DashboardPage.tsx` - Rewritten to use DashboardShell + BodyStatusCard
- `frontend/package.json` - Added @tanstack/react-query@^5 + date-fns@^3

## Decisions Made

- `retry:false` on 401/403/404 in QueryClient — avoids racing the existing axios 401 interceptor's refresh queue (queues concurrent requests while refreshing; React Query must not re-trigger that flow)
- `DashboardShell` uses ReactNode props for section slots rather than children/slots API — explicit named props let Wave 2 plans (04-02, 04-03, 04-04) mount components without touching the shell or colliding
- `min-w-0` on every flex/grid child — documented research pitfall: Recharts `ResponsiveContainer` renders 0px wide when parent flex item has no minimum width constraint
- Null metrics in readiness formula get weight 0 and remaining weights renormalize to 1.0 — null→50 fallback would artificially depress/elevate scores when only one or two metrics are available
- `toIsoDate()` uses local date (not UTC `toISOString()`) — backend `date` type represents a calendar day in the user's timezone

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- `python` command not found (macOS default is `python3` with no `python` alias); used venv activation path to verify backend. Not a code issue — verify steps succeeded after adjusting command.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Wave 2 (04-02 PMC chart, 04-03 calendar, 04-04 workout modal) can now proceed in parallel — DashboardShell section slots are ready
- `usePMC` and `useActivitiesRange` hooks exist and typecheck; Wave 2 plans import them without additional setup
- Garmin not-connected state in BodyStatusCard links to `/garmin/connect` — that route is deferred to a future plan (currently 404s, acceptable per plan notes)
- Docker Desktop + `alembic upgrade head` still required from Phase 3 before runtime testing (carried blocker — code complete)

---
*Phase: 04-dashboard-visualization*
*Completed: 2026-04-19*
