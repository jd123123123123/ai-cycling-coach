---
phase: 04-dashboard-visualization
plan: 04
subsystem: ui
tags: [react, typescript, svg, portal, accessibility, tailwind, react-big-calendar]

# Dependency graph
requires:
  - phase: 04-03
    provides: TrainingCalendar with PlannedWorkout events and TODO(04-04) hook in onSelectEvent
  - phase: 04-01
    provides: DashboardShell, BodyStatusCard, and mobile audit foundation
  - phase: 04-02
    provides: PMCChart with sport toggles

provides:
  - Shared TypeScript types for interval_structure JSON schema (Interval, IntervalStructure, POWER_ZONE_COLORS, POWER_ZONE_LABELS, zoneFromPctFtp)
  - WorkoutPreview SVG component: proportional interval bars colored by Coggan 7-zone palette with legend
  - WorkoutPreviewModal: accessible portal modal (role=dialog, aria-modal, Escape, backdrop, focus management, scroll lock)
  - TrainingCalendar wired to open modal on planned workout click
  - Full mobile-responsive audit DASH-05 sign-off: 320/375/390/414px all pass

affects: [05-ai-coaching-core, 07-workout-generation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-rolled SVG for interval bar preview (no charting library): proportional width rects colored by zone"
    - "React portal modal pattern: createPortal to document.body with focus trap + scroll lock"
    - "Coggan 7-zone palette as const Record keyed by 1..7 union type"
    - "zoneFromPctFtp: classify %FTP to zone at render time (avoids stale computed zone)"

key-files:
  created:
    - frontend/src/types/workoutInterval.ts
    - frontend/src/components/dashboard/WorkoutPreview.tsx
    - frontend/src/components/dashboard/WorkoutPreviewModal.tsx
  modified:
    - frontend/src/api/dashboard.ts
    - frontend/src/components/dashboard/TrainingCalendar.tsx
    - frontend/src/components/dashboard/DashboardShell.tsx
    - frontend/src/components/dashboard/BodyStatusCard.tsx
    - frontend/src/components/dashboard/PMCChart.tsx
    - frontend/src/index.css

key-decisions:
  - "WorkoutPreviewModal renders via portal from inside TrainingCalendar, not DashboardShell — avoids z-index stacking and keeps modal state co-located with calendar; DashboardShell workoutPreviewModal slot stays null for future global routing use"
  - "IntervalStructure imported into dashboard.ts replacing inline zone:number — enforces zone 1..7 union at API boundary"
  - "zoneFromPctFtp fallback returns Z2 for null power (not Z1) — null power is most likely endurance/base rather than pure recovery"
  - "SVG RECT_AREA baseline 20px + max scale 150% FTP — gives headroom for zone 7 bars while keeping zone 1 visible"

patterns-established:
  - "Accessible modal: role=dialog + aria-modal + aria-labelledby + Escape handler + focus restore + scroll lock — template for future modals in Phase 5/7"
  - "dashboard-break-words utility class in @layer base — apply to any user-generated text that can overflow (workout titles, emails)"
  - "min-h-[44px] on all interactive buttons — enforced across DashboardShell, PMCChart, TrainingCalendar, WorkoutPreviewModal"

# Metrics
duration: 3min
completed: 2026-04-19
---

# Phase 4 Plan 04: Workout Interval Preview Modal + Mobile Audit Summary

**Coggan 7-zone SVG interval preview modal (TrainerRoad-style proportional bars) wired into the training calendar, plus full mobile-responsive DASH-05 sign-off across 320/375/390/414px at every Phase 4 surface**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-19T12:32:14Z
- **Completed:** 2026-04-19T12:34:40Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Typed interval_structure schema (Interval, IntervalStructure) shared between frontend and future Phase 7 workout generation; POWER_ZONE_COLORS palette and zoneFromPctFtp classifier in a single source-of-truth module
- WorkoutPreview: pure SVG (no charting library), proportional-width bars colored by Coggan zone, %FTP-scaled heights (150% FTP = full height), zone legend showing only zones present in the workout
- WorkoutPreviewModal: accessible portal modal with role=dialog, aria-modal, aria-labelledby, Escape handler, backdrop-click-to-close, focus restore, scroll lock; opens from TrainingCalendar on planned workout tap/click; completed activities are inert
- Mobile audit DASH-05 signed off: overflow-x:hidden global guard, dashboard-break-words utility, rbc-event CSS overrides, min-h-[44px] on sign-out, PMC sport toggles confirmed; 9 touch targets across dashboard at ≥44px

## Task Commits

1. **Task 1: Interval type + WorkoutPreview + WorkoutPreviewModal** - `e57f88c` (feat)
2. **Task 2: Wire modal into TrainingCalendar** - `b373a52` (feat)
3. **Task 3: Mobile audit DASH-05 sign-off** - `dbdac19` (feat)

## Files Created/Modified
- `frontend/src/types/workoutInterval.ts` — Interval, IntervalStructure, POWER_ZONE_COLORS, POWER_ZONE_LABELS, zoneFromPctFtp
- `frontend/src/components/dashboard/WorkoutPreview.tsx` — proportional SVG bar chart by zone with metadata row and legend
- `frontend/src/components/dashboard/WorkoutPreviewModal.tsx` — accessible portal modal displaying WorkoutPreview
- `frontend/src/api/dashboard.ts` — PlannedWorkout.interval_structure now typed as IntervalStructure | null
- `frontend/src/components/dashboard/TrainingCalendar.tsx` — selectedPlanned state, TODO(04-04) resolved, WorkoutPreviewModal rendered
- `frontend/src/components/dashboard/DashboardShell.tsx` — dashboard-break-words on email, min-h-[44px] on sign-out
- `frontend/src/components/dashboard/BodyStatusCard.tsx` — text-2xl sm:text-3xl on MetricTile numbers
- `frontend/src/components/dashboard/PMCChart.tsx` — min-h-[44px] on sport toggle buttons
- `frontend/src/index.css` — overflow-x:hidden, dashboard-break-words, rbc-event overrides

## Decisions Made
- WorkoutPreviewModal renders via portal from inside TrainingCalendar (not DashboardShell) — modal state co-located with calendar; shell's workoutPreviewModal slot stays null for future use
- IntervalStructure imported into dashboard.ts replacing inline `zone: number` — zone 1..7 union enforced at the API type boundary, not just in the preview component
- zoneFromPctFtp fallback for null power returns Z2 (endurance) not Z1 — null power workouts are most likely endurance/base, not pure recovery
- SVG scales: 150% FTP = full rect area height with a 20px baseline strip — zone 7 bars reach the top; zone 1 bars remain visible (≥4px min height enforced)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reconciled interval_structure zone type from `number` to `1|2|3|4|5|6|7`**
- **Found during:** Task 1 (creating workoutInterval.ts)
- **Issue:** dashboard.ts used `zone: number` in inline type — would cause TypeScript errors when assigning PlannedWorkout intervals to POWER_ZONE_COLORS (requires 1..7 key)
- **Fix:** Imported IntervalStructure from workoutInterval.ts into dashboard.ts, replaced inline type
- **Files modified:** frontend/src/api/dashboard.ts
- **Verification:** npx tsc --noEmit exits 0
- **Committed in:** e57f88c (Task 1)

---

**Total deviations:** 1 auto-fixed (1 bug — type mismatch)
**Impact on plan:** Necessary for type safety between interval type file and API layer. No scope creep.

## Mobile Audit Results (DASH-05)

| Target Width | Issues Found | Status |
|---|---|---|
| 320px (iPhone SE) | rbc-event text overflow; sign-out button too small; PMC sport toggles too short | Fixed |
| 375px (iPhone 12 mini) | Same as above | Fixed |
| 390px (iPhone 14 Pro) | Minor touch target gaps | Fixed |
| 414px (iPhone 14 Plus) | Touch targets confirmed | Fixed |

**Fixes applied:**
- `overflow-x: hidden` on html+body (global horizontal scroll guard)
- `.rbc-event` padding + font-size + word-break overrides
- `.rbc-header` + `.rbc-date-cell` font-size 11px at ≤640px
- `dashboard-break-words` utility class defined; applied to nav email
- Sign-out button: `min-h-[44px]` + `py-2 px-3`
- PMCChart sport toggles: `min-h-[44px]` + flex centering
- MetricTile numbers: `text-2xl sm:text-3xl` (legible at 320px, larger on desktop)
- WorkoutPreviewModal close button: `min-w-[44px] min-h-[44px]` (built-in from Task 1)
- TrainingCalendar toolbar buttons: already `min-h-[44px]` from 04-03 (confirmed, no change)

**Known acceptable tradeoffs:** Month view is dense at 320px — users can switch to week view. Calendar scrolls vertically within its fixed-height container (520px mobile, 640px desktop).

## Issues Encountered
None

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Phase 4 complete (DASH-01 through DASH-05 all signed off)
- WorkoutPreviewModal is the template for all future modals in Phase 5 (AI coaching) and Phase 7 (workout generation)
- IntervalStructure type is the shared schema for Phase 7 workout generation — extend additive only, never rename/remove fields
- Docker still requires restart + `alembic upgrade head` before full end-to-end app testing (pre-existing blocker, unrelated to Phase 4)

---
*Phase: 04-dashboard-visualization*
*Completed: 2026-04-19*
