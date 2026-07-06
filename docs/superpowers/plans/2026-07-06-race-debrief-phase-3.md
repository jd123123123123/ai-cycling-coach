# Race Debrief — Phase 3: The four-act frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full-page Race Debrief UI — a four-act view (Verdict → Story → Breakdown → Plan) rendering the `GET /analytics/activity-debrief/{id}` payload, matching the app's paper-grain design system, bilingual (DE/EN), with every block hiding when its data is absent.

**Architecture:** Mirror the shipped `ReportTab` three-act pattern exactly (it embodies the design system). New `api/debrief.ts` typed client + `useRaceDebrief` react-query hook + a `DebriefView` page at a protected route, composed of `components/debrief/*`. Charts use the installed `uplot` (follow `PMCChart.tsx`/`BiometricsDetail.tsx`); the route map is self-contained SVG (no external tiles). Reuse `Sparkline`, the CSS vars (`--color-good/bad/caution/ink/ink-2/muted/rule`), `card-enter`, and `shimmer-bg`.

**Tech Stack:** React 19 + TypeScript + Vite, react-router-dom v7, @tanstack/react-query, uplot, the existing `apiClient`, `LocaleContext`.

## Global Constraints

- **Match the design system, don't invent it.** Mirror `ReportTab.tsx` + `components/report/*` (GradeHero etc.) for layout, tokens, animations, loading/error states. Use CSS vars, never hard-coded colors.
- **Graceful degradation:** every act/panel renders nothing (returns `null`) when its block is `null`/empty. The page never shows an empty/broken card. No-GPS → no map; no-altitude → hide `elevation_m` when `segments` is empty.
- **Bilingual:** all UI strings ship DE + EN via the existing `locale === 'de' ? … : …` pattern (from `useLocale()`). Backend-authored strings (verdict, prescription text) render as-is.
- **Types mirror the backend schema exactly** (`app/schemas/race_debrief.py`), including `if_` (not `if`).
- **No new dependencies.** Verify each task with `cd frontend && npx tsc --noEmit` (must pass clean).
- Follow existing file conventions (default exports for components, named exports for api/hooks).

---

## File Structure

- `frontend/src/api/debrief.ts` — **create**: `RaceDebrief` TS types + `fetchActivityDebrief(activityId)`.
- `frontend/src/hooks/useRaceDebrief.ts` — **create**: react-query hook.
- `frontend/src/pages/DebriefView.tsx` — **create**: the four-act page + route target.
- `frontend/src/components/debrief/DebriefHero.tsx` — **create**: Act 1 (verdict + stat strip + went-well/watch-out).
- `frontend/src/components/debrief/RideStory.tsx` — **create**: Act 2 (uPlot timeline + moments + `RouteMap`).
- `frontend/src/components/debrief/RouteMap.tsx` — **create**: self-contained SVG route.
- `frontend/src/components/debrief/BreakdownPanels.tsx` — **create**: Act 3 (pacing/climbs/efforts/efficiency/matchbook/quadrant/fueling/wko/cda cards).
- `frontend/src/components/debrief/DebriefPlan.tsx` — **create**: Act 4 (ranked prescriptions).
- `frontend/src/App.tsx` — **modify**: add the protected `/activities/:id/debrief` route.
- `frontend/src/components/dashboard/tabs/WorkoutsTab.tsx` (or the ride list it renders) — **modify**: add a "Debrief" entry button.

---

## Task 1: API types + hook

**Files:**
- Create: `frontend/src/api/debrief.ts`, `frontend/src/hooks/useRaceDebrief.ts`

**Interfaces:**
- Produces: TS interfaces mirroring `RaceDebrief` and `fetchActivityDebrief(activityId: number): Promise<RaceDebrief>`; `useRaceDebrief(activityId)` react-query hook.

- [ ] **Step 1: Create the typed client**

Create `frontend/src/api/debrief.ts` (mirror `api/report.ts`; fields match `app/schemas/race_debrief.py`):

```typescript
import { apiClient } from './client'

export interface DebriefHeader {
  title: string; date: string; sport: string
  distance_km: number; elevation_m: number; moving_time_s: number
  np_watts: number; if_: number | null; tss: number; total_kj: number; avg_speed_kmh: number
}
export interface DebriefVerdict {
  grade_letter: string; grade_score: number; ai_verdict: string; ai_model: string
  went_well: string[]; watch_out: string[]
}
export interface KeyMoment { kind: string; at_s: number; label: string; value: number; tone: string }
export interface RoutePoint { lat: number; lng: number; power: number | null; grade: number | null }
export interface DebriefStory {
  t: number[]; power: number[]; hr: (number | null)[]; wbal: number[]
  altitude: (number | null)[]; speed: (number | null)[]
  moments: KeyMoment[]; route: RoutePoint[]
}
export interface Segment {
  kind: string; start_s: number; end_s: number; duration_s: number
  distance_m: number; elev_gain_m: number; elev_loss_m: number
  avg_grade_pct: number; avg_power: number | null; avg_speed_ms: number | null
}
export interface Climb {
  start_s: number; duration_s: number; distance_m: number; elev_gain_m: number
  avg_grade_pct: number; vam_m_per_h: number; w_per_kg: number | null
  avg_power: number | null; category: string
}
export interface Pacing {
  first_half_np: number; second_half_np: number; split_pct: number
  variability_index: number | null; surge_count: number; phase_np: number[]
  final_30min_np: number | null; zone_time_pct: Record<string, number>
}
export interface EffortMatch {
  duration_s: number; ride_watts: number; best_watts: number | null
  pct_of_best: number | null; is_pr: boolean
}
export interface Efficiency {
  efficiency_factor: number | null; avg_hr: number | null
  decoupling_pct: number | null; np_watts: number
}
export interface Match { start_s: number; end_s: number; depth_j: number; min_bal_j: number }
export interface Matchbook {
  matches: Match[]; match_count: number; time_above_cp_s: number
  min_bal_j: number; fully_depleted: boolean
}
export interface Quadrant {
  q1_pct: number; q2_pct: number; q3_pct: number; q4_pct: number
  force_threshold_n: number; cadence_threshold_rpm: number; sample_count: number
}
export interface Fueling {
  total_kj: number; total_kcal: number; cho_g_estimate: number; fat_g_estimate: number
  carb_target_g_per_h: [number, number]; duration_h: number
  likely_underfueled: boolean | null; note: string
}
export interface WkoModel {
  mftp_watts: number; cp_watts: number; w_prime_j: number; frc_j: number
  pmax_watts: number; tte_s: number | null; vo2max_estimate: number | null; r_squared: number
}
export interface Cda { cda_m2: number; sample_count: number; avg_speed_ms: number }
export interface Prescription {
  priority: number; headline: string; race_tactic: string; training_fix: string; tone: string
}
export interface RaceDebrief {
  activity_id: number
  header: DebriefHeader
  verdict: DebriefVerdict
  story: DebriefStory | null
  segments: Segment[]
  climbs: Climb[]
  pacing: Pacing | null
  efforts: EffortMatch[]
  efficiency: Efficiency | null
  matchbook: Matchbook | null
  quadrant: Quadrant | null
  fueling: Fueling | null
  wko: WkoModel | null
  cda: Cda | null
  plan: Prescription[]
  generated_at: string | null
}

export async function fetchActivityDebrief(activityId: number): Promise<RaceDebrief> {
  const res = await apiClient.get<RaceDebrief>(`/analytics/activity-debrief/${activityId}`)
  return res.data
}
```

- [ ] **Step 2: Create the hook**

Create `frontend/src/hooks/useRaceDebrief.ts` (mirror `usePeriodReport.ts`):

```typescript
import { useQuery } from '@tanstack/react-query'
import { fetchActivityDebrief, type RaceDebrief } from '../api/debrief'

export function useRaceDebrief(activityId: number | undefined) {
  return useQuery<RaceDebrief>({
    queryKey: ['activity-debrief', activityId],
    queryFn: () => fetchActivityDebrief(activityId as number),
    enabled: activityId != null,
  })
}
```

- [ ] **Step 3: Verify + commit**

Run: `cd frontend && npx tsc --noEmit` → clean.
```bash
git add frontend/src/api/debrief.ts frontend/src/hooks/useRaceDebrief.ts
git commit -m "feat(debrief-ui): typed api client + useRaceDebrief hook"
```

---

## Task 2: DebriefView shell + Act 1 (DebriefHero) + route

**Files:**
- Create: `frontend/src/pages/DebriefView.tsx`, `frontend/src/components/debrief/DebriefHero.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useRaceDebrief`, `RaceDebrief` types, `useParams`, `useLocale`.
- Produces: a full-page `DebriefView` (loading shimmer / error / four-act layout, Act 1 wired; Acts 2–4 slotted with placeholders the later tasks replace) mounted at `/activities/:id/debrief`; `DebriefHero` renders grade + verdict + stat strip + went-well/watch-out.

- [ ] **Step 1: Build DebriefHero (Act 1)**

Create `frontend/src/components/debrief/DebriefHero.tsx`. Mirror `components/report/GradeHero.tsx` idiom: a `gradeColor(letter)` helper (A→good, B→ink, C→caution, else bad), the `renderVerdict` markdown helper, a count-up score, a back link. Render: title + formatted date; a grade badge; the AI verdict; a stat strip (Distance km, Elev m — hide when `header.elevation_m === 0 && segments.length === 0`, Time from `moving_time_s`, NP, IF, TSS, kJ, avg speed); a two-column `went_well` (good tone) / `watch_out` (bad tone) list. Props: `{ report: RaceDebrief }`. All labels DE/EN via `useLocale()`. Use CSS vars and the `.card`/paper styling used across `components/report/*` (inspect `GradeHero.tsx` for the exact class/style conventions and reuse them — do not hard-code hex colors).

- [ ] **Step 2: Build the DebriefView shell**

Create `frontend/src/pages/DebriefView.tsx`, mirroring `ReportTab.tsx`'s act structure and loading/error handling:

```tsx
import { useParams, Link } from 'react-router-dom'
import { useLocale } from '../contexts/LocaleContext'
import { useRaceDebrief } from '../hooks/useRaceDebrief'
import DebriefHero from '../components/debrief/DebriefHero'
// Acts 2–4 imported in later tasks:
// import RideStory from '../components/debrief/RideStory'
// import BreakdownPanels from '../components/debrief/BreakdownPanels'
// import DebriefPlan from '../components/debrief/DebriefPlan'

export default function DebriefView() {
  const { id } = useParams()
  const activityId = id ? Number(id) : undefined
  const { locale } = useLocale()
  const { data, isLoading, isError } = useRaceDebrief(activityId)

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-paper, #f6f1e7)' }}>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 flex flex-col gap-8">
        <Link to="/dashboard?tab=analyze" style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>
          {locale === 'de' ? '← Zurück' : '← Back'}
        </Link>
        {isLoading && (
          <div className="flex flex-col gap-4">
            <div className="rounded-[20px] h-56 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
            <div className="rounded-[18px] h-72 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
          </div>
        )}
        {isError && (
          <p style={{ color: 'var(--color-bad)', fontSize: 14 }}>
            {locale === 'de'
              ? 'Analyse konnte nicht geladen werden. Braucht diese Fahrt Leistungsdaten?'
              : "Couldn't load this debrief. Does the ride have power data?"}
          </p>
        )}
        {data && (
          <>
            <section style={{ animation: 'card-enter 480ms var(--ease-apple-default, ease) both' }}>
              <DebriefHero report={data} />
            </section>
            {/* Act 2 (RideStory), Act 3 (BreakdownPanels), Act 4 (DebriefPlan)
                are added in Tasks 3–5, each in its own <section> with a staggered
                card-enter animationDelay, mirroring ReportTab. */}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire the route**

In `frontend/src/App.tsx`, add inside `<Routes>` (mirror the existing `ProtectedRoute checkOnboarding` routes; import `DebriefView`):

```tsx
          <Route
            path="/activities/:id/debrief"
            element={
              <ProtectedRoute checkOnboarding>
                <DebriefView />
              </ProtectedRoute>
            }
          />
```

- [ ] **Step 4: Verify + commit**

Run: `cd frontend && npx tsc --noEmit` → clean.
```bash
git add frontend/src/pages/DebriefView.tsx frontend/src/components/debrief/DebriefHero.tsx frontend/src/App.tsx
git commit -m "feat(debrief-ui): DebriefView shell + Act 1 hero + route"
```

---

## Task 3: Act 2 — RideStory (uPlot timeline + moments) + RouteMap

**Files:**
- Create: `frontend/src/components/debrief/RideStory.tsx`, `frontend/src/components/debrief/RouteMap.tsx`
- Modify: `frontend/src/pages/DebriefView.tsx` (slot Act 2)

**Interfaces:**
- Consumes: `RaceDebrief.story`. Produces `RideStory` (returns `null` when `story` is null/empty): a synchronized uPlot chart of power (+ HR, altitude as extra series/axes) over `story.t`, with the `moments` annotated (vertical markers + labels toned by `tone`), beside `RouteMap` (renders only when `story.route` non-empty).

- [ ] **Step 1: Build RouteMap (self-contained SVG)**

Create `frontend/src/components/debrief/RouteMap.tsx`. Props `{ route: RoutePoint[] }`. Project lat/lng to an SVG viewBox (normalize min/max lat/lng to a padded box, invert y), draw the path as a `<polyline>` colored by `--color-ink`, mark start (good) and end; color segments by power/grade if desired (optional). Return `null` when `route.length < 2`. No external tiles/images.

- [ ] **Step 2: Build RideStory (uPlot)**

Create `frontend/src/components/debrief/RideStory.tsx`. Follow the uPlot setup in `frontend/src/components/dashboard/PMCChart.tsx` (chart creation in a `useEffect`, `new uPlot(opts, data, el)`, cleanup on unmount, responsive width via a ResizeObserver as that file does). Series: power (primary, `--color-ink`), HR (`--color-bad`, secondary axis) when present, altitude (filled area, `--color-muted`) when present. X axis = seconds (`story.t`), format as `mm:ss`. Overlay `story.moments` as vertical rule markers with a small label above (tone → color); a uPlot `hooks.draw` plugin or absolutely-positioned overlay divs keyed off the x-scale both work — prefer the overlay-div approach if simpler. Header: "The story" / "Die Geschichte" (DE/EN). Lay `RideStory` chart and `RouteMap` side by side on desktop (`grid md:grid-cols-2`), stacked on mobile. Return `null` when `!story || story.power.length === 0`.

- [ ] **Step 3: Slot Act 2 into DebriefView**

Import `RideStory` and render it after the hero section in its own `<section>` with `animationDelay: '80ms'`, passing `story={data.story}`.

- [ ] **Step 4: Verify + commit**

Run: `cd frontend && npx tsc --noEmit` → clean.
```bash
git add frontend/src/components/debrief/RideStory.tsx frontend/src/components/debrief/RouteMap.tsx frontend/src/pages/DebriefView.tsx
git commit -m "feat(debrief-ui): Act 2 ride story timeline + route map"
```

---

## Task 4: Act 3 — BreakdownPanels

**Files:**
- Create: `frontend/src/components/debrief/BreakdownPanels.tsx`
- Modify: `frontend/src/pages/DebriefView.tsx` (slot Act 3)

**Interfaces:**
- Consumes: `RaceDebrief` (pacing, climbs, efforts, efficiency, matchbook, quadrant, fueling, wko, cda). Produces `BreakdownPanels`: a responsive grid of cards, each a small self-contained sub-component that returns `null` when its block is absent.

- [ ] **Step 1: Build the panels**

Create `frontend/src/components/debrief/BreakdownPanels.tsx` with one small card sub-component per block (all DE/EN, CSS vars, mirror the card styling of `components/report/*` — a paper card with a small-caps label + big number idiom, like the mockup):
  - **PacingCard** (`pacing`): split % (toned: negative = caution/bad), VI, surge count, a small first-vs-second-half bar, zone-time mini-bars.
  - **ClimbsCard** (`climbs`): a row per climb — name/index, VAM, W/kg, category chip, grade, duration.
  - **EffortsCard** (`efforts`): peak-power bars with `pct_of_best`, PR flags (`is_pr` → a "PR" badge, good tone).
  - **EfficiencyCard** (`efficiency`): EF, decoupling % (toned), avg HR.
  - **MatchbookCard** (`matchbook`): match_count, time above CP, `fully_depleted` flag, W′ min.
  - **QuadrantCard** (`quadrant`): a 2×2 force×cadence grid with the four percentages.
  - **FuelingCard** (`fueling`): kJ/kcal, carb target band, CHO/fat split, `likely_underfueled` flag + note.
  - **WkoCard** (`wko`): mFTP, CP, W′/FRC, Pmax, TTE, VO₂max estimate (label "est."), r².
  - **CdaCard** (`cda`): CdA m², sample count, avg speed — with an "estimate" caption.
Each returns `null` when its prop is null/empty. `BreakdownPanels` renders a section header ("The breakdown" / "Die Details") and a `grid` of whichever cards have data.

- [ ] **Step 2: Slot Act 3 into DebriefView**

Import and render `BreakdownPanels` after Act 2 in its own `<section>` (`animationDelay: '160ms'`), passing `report={data}`.

- [ ] **Step 3: Verify + commit**

Run: `cd frontend && npx tsc --noEmit` → clean.
```bash
git add frontend/src/components/debrief/BreakdownPanels.tsx frontend/src/pages/DebriefView.tsx
git commit -m "feat(debrief-ui): Act 3 breakdown panels"
```

---

## Task 5: Act 4 — DebriefPlan + entry point

**Files:**
- Create: `frontend/src/components/debrief/DebriefPlan.tsx`
- Modify: `frontend/src/pages/DebriefView.tsx` (slot Act 4), and the ride list (`WorkoutsTab.tsx` or the component it renders rows with) for the entry button.

**Interfaces:**
- Consumes: `RaceDebrief.plan`. Produces `DebriefPlan`: ranked prescription rows, each with a headline, a **race-day tactic** chip (good/green tone) and a **training** chip (a distinct tone), toned by `tone`. Plus a "Debrief" button in the ride list that links to `/activities/${id}/debrief`.

- [ ] **Step 1: Build DebriefPlan**

Create `frontend/src/components/debrief/DebriefPlan.tsx`. Props `{ plan: Prescription[] }`. Return `null` when empty. Render a section header ("The plan" / "Der Plan") and a numbered list; each row: `headline` (bold), then two chips — `race_tactic` labeled "Next race"/"Nächstes Rennen" and `training_fix` labeled "Training", styled like the mockup's tac/trn chips using CSS vars. Row tone accents by `tone`.

- [ ] **Step 2: Slot Act 4 into DebriefView**

Import and render `DebriefPlan` last in its own `<section>` (`animationDelay: '240ms'`), passing `plan={data.plan}`.

- [ ] **Step 3: Add the entry-point button**

In `frontend/src/components/dashboard/tabs/WorkoutsTab.tsx` (or the ride-row component it renders — inspect it first), add a small "Debrief" / "Analyse" link/button on each completed cycling ride row that navigates to `/activities/${activityId}/debrief` (use `Link` or `useNavigate`). Keep it visually minor (a text link in the existing row style). If the ride's activity id isn't already in that component's data, wire the minimal prop through; if that's non-trivial, add the entry to whichever existing ride/activity list most cleanly exposes an activity id, and note the choice.

- [ ] **Step 4: Verify + commit**

Run: `cd frontend && npx tsc --noEmit` → clean.
```bash
git add frontend/src/components/debrief/DebriefPlan.tsx frontend/src/pages/DebriefView.tsx frontend/src/components/dashboard/tabs/WorkoutsTab.tsx
git commit -m "feat(debrief-ui): Act 4 plan + debrief entry point"
```

---

## Self-Review

**Spec coverage:** api types+hook → Task 1; route + shell + Act 1 hero → Task 2; Act 2 story timeline + route map → Task 3; Act 3 breakdown panels (all 9 blocks) → Task 4; Act 4 plan + entry point → Task 5. Every block hides when null (graceful degradation); DE/EN throughout; design-system tokens reused.

**Placeholder scan:** the component bodies for the hero (Task 2 Step 1), panels (Task 4), plan (Task 5), and RouteMap/RideStory (Task 3) are specified as concrete requirements with an explicit "mirror file X" reference for the visual idiom and the uPlot setup, rather than pasting 800 lines of pixel markup — this is deliberate: the design system lives in the referenced components and must be matched, not reinvented. Each task ends with a `tsc --noEmit` gate.

**Type consistency:** the TS `RaceDebrief` interface (Task 1) mirrors `app/schemas/race_debrief.py` field-for-field (including `if_`, the `carb_target_g_per_h` tuple, nested `Match[]`), so every component consumes real fields. `useRaceDebrief` mirrors `usePeriodReport`. The route path `/activities/:id/debrief` matches the entry-point link in Task 5.

**Verification note:** `tsc --noEmit` gates each task, but full visual/interaction verification (uPlot rendering, map projection, mobile layout, DE/EN, empty-block hiding) is best done live against a seeded account with the running app + API — call this out at hand-off so a human can screenshot desktop+mobile in both locales, mirroring the period-report verification.
