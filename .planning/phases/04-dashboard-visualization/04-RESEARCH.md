# Phase 4: Dashboard + Visualization - Research

**Researched:** 2026-04-19
**Domain:** React data visualization, calendar UI, responsive dashboard
**Confidence:** HIGH (frontend codebase read directly; library choices verified via WebSearch + official sources)

---

## Summary

Phase 4 builds the athlete-facing dashboard on top of the existing React + TypeScript + Vite + Tailwind v4 scaffold from Phase 1. No re-scaffolding is needed. The critical decisions are which charting library handles the PMC time-series chart and which calendar library handles the training calendar with drag-drop.

**Charting:** Recharts 3.x (currently 3.8.1) is the clear choice — it is the most widely-adopted React SVG charting library (3.6M weekly downloads), supports React 19, has built-in hover/tooltip, is composable, and requires no low-level D3 knowledge. Bundle: ~230 KB minified / ~60 KB gzipped. Victory and visx are heavier or require more hand-wiring for this use-case.

**Calendar:** Use react-big-calendar for week/month view, combined with dnd-kit for drag-drop. FullCalendar's premium drag-drop requires a paid license ($480+/yr). react-big-calendar is MIT-licensed and covers week + month views; dnd-kit provides touch-safe drag-drop. The workout interval preview (DASH-04) is pure SVG — a custom component, not a charting library.

**State/data fetching:** TanStack Query v5 (@tanstack/react-query) must be added. The existing auth flow uses raw axios with a manual 401 interceptor; all new dashboard data fetching should use React Query wrapped around the existing apiClient. This avoids duplicating caching/loading logic.

**Tailwind v4** is already installed as a dev dependency via `@tailwindcss/vite`. Responsive design is already available — no additional CSS library needed.

**Primary recommendation:** Add Recharts + react-big-calendar + dnd-kit + @tanstack/react-query. Keep interval preview as a hand-rolled SVG component. All dashboard views read from existing backend endpoints. Two backend gaps exist: no `/daily-metrics` API endpoint (service layer exists, endpoint not wired), and no PlannedWorkout model (calendar "planned vs completed" needs definition before drag-drop is meaningful).

---

## Standard Stack

### Core Libraries to Add

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | ^3.8.1 | PMC line chart (CTL/ATL/TSB) | React 19 compatible, most-adopted, composable SVG charts, built-in Tooltip/Legend |
| react-big-calendar | ^1.x | Week + month calendar view | MIT, purpose-built for event calendars, supports custom event rendering |
| dnd-kit/core + dnd-kit/sortable | ^6.x | Drag-drop calendar events | Pointer/touch/keyboard sensors, no HTML5 DnD API (which breaks mobile), actively maintained |
| @tanstack/react-query | ^5.x | Server state, caching, loading states | Industry standard, works with existing axios client, deduplication, React 19 support |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | ^3.x | Date formatting for calendar + charts | react-big-calendar has a date-fns localizer built in; avoids moment.js |
| react-big-calendar/localizers/date-fns | bundled | react-big-calendar date-fns localizer | Required to use react-big-calendar without moment.js |

### Not Needed / Already Present

| Concern | Status |
|---------|--------|
| CSS / responsive | Tailwind v4 already installed via `@tailwindcss/vite` in devDeps |
| HTTP client | axios already installed; wrap with React Query |
| Routing | react-router-dom v7 already installed |
| TypeScript | Already installed; use strict mode |
| Interval viz library | No library needed — hand-rolled SVG component is 40-80 lines and matches TrainerRoad style |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts | visx | visx is more powerful but requires D3 knowledge and 3-5x more code for simple line charts |
| Recharts | lightweight-charts (TradingView) | Financial-chart-first, non-composable, harder custom tooltips |
| react-big-calendar + dnd-kit | FullCalendar premium | $480+/yr license; overkill for planned workout drag-drop |
| @tanstack/react-query | SWR | SWR is simpler but React Query v5 has richer devtools, better stale-while-revalidate control |
| date-fns | moment.js | moment is deprecated, large bundle, avoid |

### Installation

```bash
npm install recharts react-big-calendar dnd-kit @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @tanstack/react-query date-fns
```

---

## Architecture Patterns

### Recommended Project Structure

```
frontend/src/
├── api/
│   ├── client.ts          # existing — axios instance + 401 interceptor
│   ├── auth.ts            # existing
│   ├── athletes.ts        # existing
│   ├── dashboard.ts       # NEW — typed fetchers for daily-metrics, PMC, activities
│   └── queryClient.ts     # NEW — QueryClient singleton
├── components/
│   ├── BodyStatusCard.tsx  # DASH-01: sleep/HRV/body battery/readiness tile
│   ├── PMCChart.tsx        # DASH-02: Recharts LineChart CTL/ATL/TSB
│   ├── TrainingCalendar.tsx # DASH-03: react-big-calendar + dnd-kit
│   ├── WorkoutPreview.tsx  # DASH-04: SVG interval block renderer
│   └── ReadinessGauge.tsx  # Sub-component for composite readiness visual
├── hooks/
│   ├── useOnboarding.ts    # existing
│   ├── usePMC.ts           # NEW — useQuery wrapper for /training-load/pmc
│   ├── useDailyMetrics.ts  # NEW — useQuery wrapper for /daily-metrics
│   └── useActivities.ts    # NEW — useQuery wrapper for /activities
└── pages/
    └── DashboardPage.tsx   # existing (stub) — replace with full layout
```

### Pattern 1: React Query Wrapping Existing Auth-Aware axios Client

The existing `apiClient` in `frontend/src/api/client.ts` handles token injection and 401 refresh queuing. React Query calls should use this client, not a separate axios instance.

```typescript
// frontend/src/api/queryClient.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // 5 min — daily metrics don't change often
      gcTime: 10 * 60 * 1000,
      retry: 1,
    },
  },
})

// frontend/src/api/dashboard.ts
import { apiClient } from './client'
import type { PMCResponse } from '../types/training'

export async function fetchPMC(days = 90): Promise<PMCResponse> {
  const { data } = await apiClient.get('/training-load/pmc', { params: { days } })
  return data
}

// frontend/src/hooks/usePMC.ts
import { useQuery } from '@tanstack/react-query'
import { fetchPMC } from '../api/dashboard'

export function usePMC(days = 90) {
  return useQuery({
    queryKey: ['pmc', days],
    queryFn: () => fetchPMC(days),
  })
}
```

### Pattern 2: PMC Chart with Recharts

```typescript
// Source: recharts.org official docs + confirmed via GitHub
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export function PMCChart({ entries }: { entries: PMCEntry[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={entries}>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line dataKey="ctl" stroke="#3b82f6" dot={false} name="CTL (Fitness)" />
        <Line dataKey="atl" stroke="#ef4444" dot={false} name="ATL (Fatigue)" />
        <Line dataKey="tsb" stroke="#22c55e" dot={false} name="TSB (Form)" />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

`ResponsiveContainer` handles mobile width automatically. `dot={false}` is required for performance on 90+ day series.

### Pattern 3: SVG Workout Interval Preview

No library needed. Intervals are a flat array of `{ duration_seconds, power_target, zone }` objects. Render as proportional-width SVG rectangles colored by zone.

```typescript
// Hand-rolled — ~60 lines total
type Interval = { duration_seconds: number; power_target: number; zone: 1 | 2 | 3 | 4 | 5 | 6 | 7 }

const ZONE_COLORS: Record<number, string> = {
  1: '#9ca3af', 2: '#60a5fa', 3: '#34d399', 4: '#fbbf24',
  5: '#f97316', 6: '#ef4444', 7: '#7c3aed'
}

export function WorkoutPreview({ intervals }: { intervals: Interval[] }) {
  const total = intervals.reduce((s, i) => s + i.duration_seconds, 0)
  return (
    <svg viewBox={`0 0 ${total} 100`} preserveAspectRatio="none" style={{ width: '100%', height: 80 }}>
      {intervals.reduce((acc, interval, i) => {
        const x = acc.offset
        acc.rects.push(
          <rect key={i} x={x} y={0} width={interval.duration_seconds} height={100}
            fill={ZONE_COLORS[interval.zone] ?? '#9ca3af'} />
        )
        acc.offset += interval.duration_seconds
        return acc
      }, { offset: 0, rects: [] as JSX.Element[] }).rects}
    </svg>
  )
}
```

### Anti-Patterns to Avoid

- **Fetching in useEffect with local useState:** Use React Query instead — it handles caching, deduplication, and loading/error states that hand-rolled useEffect cannot.
- **Separate axios instance for dashboard:** All calls must go through `apiClient` to benefit from the 401 refresh interceptor.
- **moment.js for react-big-calendar:** Use the date-fns localizer instead; moment is deprecated.
- **dot={true} in Recharts on large datasets:** Extremely slow for 90-365 day PMC series; always `dot={false}`.
- **HTML5 drag-drop API for calendar:** Breaks on mobile touch screens; dnd-kit's Pointer sensor covers both mouse and touch.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Server data caching + stale detection | Custom cache in React context | @tanstack/react-query | Race conditions, deduplication, background refresh are 10+ edge cases |
| Calendar week/month grid | CSS Grid custom calendar | react-big-calendar | Date arithmetic, DST, locale, keyboard nav are all handled |
| Mobile-safe drag-drop | HTML5 DnD API | dnd-kit | HTML5 DnD has no touch support on mobile |
| SVG chart with hover | Raw D3 | Recharts | D3 in React requires careful ref management; Recharts wraps this correctly |

**Key insight:** The workout interval preview is the one place hand-rolling IS right — no library produces the exact block visualization style needed, and it's <100 lines of SVG.

---

## Backend API Verification

### Confirmed Endpoints (exist and ready)

| Endpoint | Method | Response Shape | Notes |
|----------|--------|---------------|-------|
| `GET /training-load/pmc?days=90` | GET | `{ entries: PMCEntry[], per_sport: { cycling, running, gym: PMCEntry[] } }` where PMCEntry = `{ date, ctl, atl, tsb, tss }` | Confirmed in `training_load.py` + `schemas/training_load.py` |
| `GET /athletes/me` | GET | `AthleteProfileRead` with ftp_watts, zones fields | Confirmed in `athletes.py` |
| `GET /activities?start_date=&end_date=&limit=` | GET | `{ activities: ActivityRead[], count: int }` | Confirmed; `ActivityRead` has `sport, started_at, duration_seconds, tss, title` |
| `GET /garmin/status` | GET | `{ connected, sync_enabled, last_sync_at, sync_status }` | Confirmed |

### GAPS — Endpoints That Do NOT Exist Yet

**GAP 1: No `/daily-metrics` API endpoint.**
- `daily_metric_service.py` exists with `get_daily_metrics(db, user_id, start_date, end_date)`.
- There is NO router in `backend/app/api/` that exposes it, and the router is NOT registered in `main.py`.
- DASH-01 (body status with sleep/HRV/body battery) requires this endpoint.
- Plan must include: create `backend/app/api/daily_metrics.py` and a Pydantic response schema, register router in `main.py`.
- Suggested path: `GET /daily-metrics?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
- Response shape needed: `{ metrics: [{ date, sleep_score, hrv_status, body_battery, resting_hr, stress_level, steps }] }`

**GAP 2: No PlannedWorkout model.**
- No `planned_workout` table, model, schema, or service exists anywhere in the backend.
- DASH-03 requires "planned vs completed" calendar display and drag-drop rearrangement.
- Phase 7 (Periodization) is where the full workout planning system lives, but a minimal PlannedWorkout model (date, sport, title, duration_target, power_target, interval_structure JSON) is needed to populate the calendar in Phase 4.
- Decision required (see Open Questions): create a minimal PlannedWorkout stub in Phase 4, or show only completed activities and defer "planned" column to Phase 7.

**GAP 3: No composite readiness score endpoint.**
- DASH-01 mentions "readiness at a glance."
- There is no `/readiness` endpoint and no readiness computation in any service.
- Recommendation: compute readiness client-side in Phase 4 using a simple rule from daily_metrics fields (see Composite Readiness section below).

---

## Composite Readiness Score

Research finding: Garmin's own readiness formula weights HRV status 40%, body battery 25%, sleep score 20%, training load ratio 15%. For Phase 4, a simplified client-side formula is appropriate:

```typescript
// Client-side readiness, 0-100
function computeReadiness(metric: DailyMetric): number {
  const hrvScore = metric.hrv_status !== null ? Math.min(metric.hrv_status, 100) : 50
  const bbScore = metric.body_battery ?? 50
  const sleepScore = metric.sleep_score ?? 50
  return Math.round(0.4 * hrvScore + 0.35 * bbScore + 0.25 * sleepScore)
}
```

This avoids a new backend endpoint and is consistent with how Garmin weights the inputs. If any metric is null (Garmin not connected or metric not recorded), default to 50 (neutral). Display a "data unavailable" state if all three are null.

**Confidence:** MEDIUM — Formula is based on documented Garmin weights from a 2025 research paper; the exact weights are a UX choice, not a hard requirement.

---

## Common Pitfalls

### Pitfall 1: Recharts ResponsiveContainer in flex/grid layouts

**What goes wrong:** `ResponsiveContainer width="100%"` reports 0 width when its parent has no intrinsic width (e.g., inside a flex item without `min-w-0`).
**Why it happens:** SVG 100% width is relative to parent; flex containers shrink to content.
**How to avoid:** Always add `min-w-0` to the flex/grid parent of any `ResponsiveContainer`.
**Warning signs:** Chart renders with 0px width or is invisible.

### Pitfall 2: react-big-calendar requires a localizer

**What goes wrong:** `react-big-calendar` renders nothing and throws if you don't configure a localizer.
**How to avoid:** Import and configure the date-fns localizer before rendering the Calendar component:

```typescript
import { dateFnsLocalizer } from 'react-big-calendar'
import format from 'date-fns/format'
import parse from 'date-fns/parse'
import startOfWeek from 'date-fns/startOfWeek'
import getDay from 'date-fns/getDay'
import enUS from 'date-fns/locale/en-US'

const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales: { 'en-US': enUS } })
```

### Pitfall 3: dnd-kit and calendar interaction zone conflicts

**What goes wrong:** Dragging a calendar event and navigating between weeks both use pointer events; dnd-kit can intercept navigation clicks.
**How to avoid:** Use `activationConstraint: { distance: 8 }` on the PointerSensor so small taps (navigation clicks) don't trigger drag mode.

### Pitfall 4: PMC date axis X-label crowding on mobile

**What goes wrong:** Recharts renders all date labels on a 90-day XAxis, producing unreadable overlap on 320-375px screens.
**How to avoid:** Use `interval="preserveStartEnd"` on XAxis and set `tick={{ fontSize: 11 }}`. For narrow screens consider showing only 30 days.

### Pitfall 5: React Query + 401 interceptor double-refresh

**What goes wrong:** If React Query retries a failed request and the axios interceptor also retries after token refresh, you may get duplicate refresh calls.
**How to avoid:** Set `retry: 0` on React Query queries for 401 errors (the axios interceptor handles the retry), or set `retry: 1` globally and let the interceptor's refresh queue prevent race conditions. The existing interceptor already handles queueing correctly.

### Pitfall 6: Missing daily-metrics endpoint crashes DASH-01

**What goes wrong:** DASH-01 fetch returns 404 since the endpoint doesn't exist yet. If the dashboard renders before the endpoint exists, the whole page errors.
**How to avoid:** Build the backend endpoint in the first plan (04-01) before building the frontend body status card. Use React Query error boundaries so one failed query doesn't crash the whole dashboard.

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| react-beautiful-dnd | dnd-kit | react-beautiful-dnd is officially deprecated; dnd-kit is the successor |
| moment.js localizer in react-big-calendar | date-fns localizer | moment deprecated; react-big-calendar docs recommend date-fns |
| Class components + Redux for server state | React Query hooks | Server state belongs in React Query, not Redux |
| Recharts 2.x | Recharts 3.x | v3 rewrote state management; fixes long-standing tooltip/animation bugs; React 19 compatible |
| Tailwind config-driven (v3) | Tailwind v4 CSS-first | No tailwind.config.js needed; just `@import "tailwindcss"` in CSS |

---

## Recommended Plan Breakdown

### 04-01: Backend Daily-Metrics Endpoint + Body Status Dashboard (DASH-01)
**Dependency:** Phase 3 complete (Garmin sync populates daily_metrics table)
**Backend work:**
1. Create `backend/app/schemas/daily_metric.py` — DailyMetricRead + DailyMetricsResponse Pydantic models
2. Create `backend/app/api/daily_metrics.py` — `GET /daily-metrics?start_date&end_date` router using existing `daily_metric_service.get_daily_metrics()`
3. Register the router in `main.py`
**Frontend work:**
4. Add QueryClient + QueryClientProvider to `main.tsx`
5. Create `api/dashboard.ts` typed fetchers
6. Build `BodyStatusCard.tsx` — sleep score, HRV, body battery, readiness (client-computed)
7. Replace DashboardPage stub with responsive layout shell + BodyStatusCard
**Verifies:** DASH-01, DASH-05 (mobile layout)

### 04-02: PMC Chart (DASH-02)
**Dependency:** 04-01 complete (QueryClient present)
**Work:**
1. Install recharts
2. Create TypeScript types matching `PMCResponse` schema
3. Build `PMCChart.tsx` — Recharts LineChart with CTL/ATL/TSB lines, custom Tooltip showing date + values
4. Wire into DashboardPage below BodyStatusCard
5. Add sport filter toggle (total / cycling / running)
**Verifies:** DASH-02, DASH-05

### 04-03: Training Calendar + Minimal PlannedWorkout (DASH-03, partial DASH-04)
**Dependency:** 04-01 complete (activities endpoint already works)
**Backend work:**
1. Create minimal `PlannedWorkout` model: id, user_id, date, sport, title, duration_seconds_target, description, interval_structure (JSON)
2. Alembic migration for planned_workouts table
3. CRUD endpoints: `GET /planned-workouts?start_date&end_date`, `POST`, `PATCH /{id}` (for drag-drop date change)
**Frontend work:**
4. Install react-big-calendar + date-fns + dnd-kit
5. Build `TrainingCalendar.tsx` — week/month views, completed activities from `/activities` (grey), planned from `/planned-workouts` (blue)
6. Implement drag-drop date rearrangement (PATCH planned workout date on drop)
**Verifies:** DASH-03

### 04-04: Workout Interval Preview + Mobile Polish (DASH-04, DASH-05)
**Dependency:** 04-03 complete (PlannedWorkout model exists with interval_structure JSON)
**Work:**
1. Define interval_structure JSON schema: `{ intervals: [{ duration_seconds, power_target_pct_ftp, zone }] }`
2. Build `WorkoutPreview.tsx` — hand-rolled SVG interval blocks
3. Wire into calendar: clicking a planned workout opens a modal/drawer with WorkoutPreview
4. Mobile audit pass: test all views at 375px, 390px, 414px breakpoints
5. Fix any overflow, font-size, touch-target issues
**Verifies:** DASH-04, DASH-05

---

## Open Questions

1. **PlannedWorkout scope for Phase 4**
   - What we know: No PlannedWorkout model exists. DASH-03 requires "planned vs completed" calendar. Phase 7 is the full periodization phase.
   - What's unclear: Should Phase 4 create a minimal PlannedWorkout stub, or should the calendar only show completed activities (and "planned" column deferred to Phase 7)?
   - Recommendation: Create a minimal stub in 04-03 — it's a small model and without it drag-drop has no semantic meaning. Phase 7 enriches the model rather than rebuilding it.
   - **Decision needed from user:** Confirm stub approach, or defer planned workouts entirely to Phase 7.

2. **Readiness score display when Garmin not connected**
   - When Garmin is disconnected, all daily_metrics fields will be null.
   - Recommendation: Show a "Connect Garmin to see readiness data" CTA in BodyStatusCard.
   - No user decision needed — this is a UX default, but planner should include a connected/disconnected state in the component spec.

---

## Sources

### Primary (HIGH confidence)
- Codebase read directly: `frontend/package.json`, `frontend/src/App.tsx`, `frontend/src/api/client.ts`, `frontend/src/contexts/AuthContext.tsx`, `frontend/src/pages/DashboardPage.tsx`
- Backend code: `backend/app/api/training_load.py`, `backend/app/api/activities.py`, `backend/app/api/athletes.py`, `backend/app/api/garmin.py`, `backend/app/schemas/training_load.py`, `backend/app/schemas/activity.py`, `backend/app/schemas/athlete.py`, `backend/app/models/daily_metric.py`, `backend/app/services/daily_metric_service.py`, `backend/app/main.py`
- TanStack Query v5 official docs: https://tanstack.com/query/v5/docs/framework/react/overview

### Secondary (MEDIUM confidence)
- Recharts React 19 compatibility: GitHub issue #4558 + npm confirms v3.8.1 current
- FullCalendar license: https://fullcalendar.io/license (MIT for standard, $480+/yr for premium)
- dnd-kit touch support: https://dndkit.com/overview (Pointer/touch/keyboard sensor documented)
- Tailwind v4 Vite integration: https://tailwindcss.com/blog/tailwindcss-v4 (first-party Vite plugin, confirmed matches devDeps in package.json)
- Composite readiness formula: De Gruyter 2025 research paper on consumer wearable readiness scores

### Tertiary (LOW confidence)
- Recharts bundle size ~60KB gzipped: Bundlephobia page returned homepage instead of data; size estimate from multiple community sources
- react-big-calendar touch drag-drop limitations: Bryntum comparison blog + npm-compare; confirmed by trialspark/react-big-calendar-touch-dnd existence on GitHub

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — libraries verified against npm + official docs; version numbers confirmed
- Architecture: HIGH — based on reading actual codebase, not assumptions
- Backend gaps: HIGH — confirmed by searching all API files and main.py router registrations
- Pitfalls: MEDIUM — Recharts/dnd-kit pitfalls from community sources, not tested directly
- Readiness formula: MEDIUM — derived from published research, weights are a UX choice

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (libraries stable; re-check if Recharts v4 or react-big-calendar v2 releases)
