---
phase: 04-dashboard-visualization
plan: 02
subsystem: ui
tags: [recharts, react, typescript, pmc, dashboard, line-chart, date-fns]

# Dependency graph
requires:
  - phase: 04-01
    provides: usePMC(days) hook, PMCResponse/PMCEntry types, DashboardShell pmc slot, QueryClientProvider, Tailwind v4

provides:
  - Recharts v3 installed as frontend dependency
  - PMCChart.tsx: CTL/ATL/TSB line chart with sport filter and custom tooltip
  - DashboardPage.tsx pmc slot mounted with <PMCChart />

affects:
  - 04-03 (parallel plan editing DashboardPage calendar slot — pmc slot now set)
  - 04-04 (workoutPreviewModal slot still null, unaffected)
  - Future: any phase adding chart primitives (recharts already available)

# Tech tracking
tech-stack:
  added:
    - recharts@^3.8.1
  patterns:
    - TooltipContentProps<any, any> for recharts v3 custom tooltip (strict generic contravariance workaround)
    - min-w-0 on all flex/grid children containing ResponsiveContainer
    - isAnimationActive={false} on all Line elements for instant sport switching
    - interval="preserveStartEnd" + minTickGap for mobile-safe XAxis ticks

key-files:
  created:
    - frontend/src/components/dashboard/PMCChart.tsx
  modified:
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/src/pages/DashboardPage.tsx

key-decisions:
  - "TooltipContentProps<any, any> used to satisfy recharts v3 strict ContentType generic — avoids complex NameType contravariance error"
  - "PmcTooltip passed as function reference (not JSX element) to Tooltip content prop — recharts v3 requires function for full type compatibility"
  - "dot={false} on all three Line elements — 90-point series with dots causes mobile rendering slowdown"
  - "isAnimationActive={false} — sport filter switches series instantly without re-tweening 90 points"

patterns-established:
  - "PMC chart: sport state local to component, reads usePMC(90) and selects entries vs per_sport[sport]"
  - "Chart states: loading (skeleton), error (message + refetch button), empty (prompt to log activities), data (Recharts)"
  - "min-w-0 guard on every div wrapping ResponsiveContainer — prevents 0-width render"

# Metrics
duration: ~15min
completed: 2026-04-19
---

# Phase 4 Plan 02: PMC Chart Summary

**Recharts v3 PMC chart (CTL/ATL/TSB lines) with per-sport filter, custom 1-decimal tooltip, and all 04-RESEARCH mobile pitfall guards applied**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-19
- **Completed:** 2026-04-19
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Installed recharts@^3.8.1 and built PMCChart.tsx with full CTL/ATL/TSB line chart
- Sport filter (Total / Cycling / Running / Gym) toggles between `entries` and `per_sport[sport]`
- Custom PmcTooltip shows day label + three values rounded to 1 decimal
- All three research pitfalls guarded: `dot={false}` (perf), `interval="preserveStartEnd"` (mobile ticks), `min-w-0` (ResponsiveContainer 0-width)
- Loading skeleton, error+retry, and empty state implemented
- PMCChart mounted into DashboardPage pmc slot without touching shell, calendar, or modal slots

## Task Commits

Each task was committed atomically:

1. **Task 1: Install recharts + build PMCChart.tsx** - `6d19bfd` (feat)
2. **Task 2: Mount PMCChart in DashboardPage pmc slot** - `5f026b5` (feat)

## Files Created/Modified
- `frontend/src/components/dashboard/PMCChart.tsx` - New PMC chart component with sport filter, tooltip, and all state variants
- `frontend/src/pages/DashboardPage.tsx` - Added PMCChart import and replaced null pmc prop
- `frontend/package.json` - recharts@^3.8.1 added to dependencies
- `frontend/package-lock.json` - Lock file updated for recharts and transitive deps

## Decisions Made

- **TooltipContentProps<any, any>:** recharts v3 has strict generic contravariance on `ContentType<TValue, TName>` — using narrow types like `<number, string>` creates an incompatible function signature. `any` is the pragmatic workaround; the runtime behavior is fully type-safe since payload values are always numbers from our PMC data.
- **Function reference vs JSX element for Tooltip content:** recharts v3 requires `content={PmcTooltip}` (function ref), not `content={<PmcTooltip />}` (JSX element). Using the element causes a TS2739 error because recharts tries to spread props onto the element but the element type is already instantiated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] recharts v3 Tooltip type incompatibility with TooltipProps**
- **Found during:** Task 1 (build verification)
- **Issue:** Plan used `TooltipProps<number, string>` for PmcTooltip; recharts v3 renamed the content-props interface to `TooltipContentProps` and `payload`/`active`/`label` are no longer on `TooltipProps` — they moved to `TooltipContentProps`. Using the old interface caused TS2339 errors.
- **Fix:** Imported `TooltipContentProps` instead of `TooltipProps`; changed generic to `<any, any>` to avoid contravariance error from recharts v3's `ContentType` definition; changed `content={<PmcTooltip />}` to `content={PmcTooltip}` (function ref).
- **Files modified:** `frontend/src/components/dashboard/PMCChart.tsx`
- **Verification:** `npx tsc --noEmit` exits 0, `npm run build` exits 0
- **Committed in:** `6d19bfd` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - recharts v3 type API change)
**Impact on plan:** Required adaptation to recharts v3 type changes; no behavioral impact. All pitfall guards preserved.

## Issues Encountered
- recharts v3 breaking type changes: `TooltipProps` no longer contains `payload`/`active`/`label`; `ContentType` generic has strict contravariance; `content` prop must be function reference, not JSX element. All resolved inline.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PMC chart is live at /dashboard, mounted in the pmc-section slot
- calendar slot in DashboardPage still `null` — 04-03 can safely edit it
- recharts is now available for any future chart work in Wave 2+
- TypeScript and production build passing

---
*Phase: 04-dashboard-visualization*
*Completed: 2026-04-19*
