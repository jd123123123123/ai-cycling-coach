# Dashboard Cut 1 — Today Rebuild + Visual Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Today tab so the verdict, prescribed workout, and training state (PMC) sit above the fold, move polarized + narrative + workout-export into the Deep-dive accordion, remove the leftover reveal-cascade animation, and tighten the numeric/status visual tokens.

**Architecture:** Pure frontend. The Today tab is `frontend/src/components/dashboard/tabs/TodayTab.tsx`, which composes `ReadinessHero` + `TrajectorySentence` + `CoachBrief` + a `DashboardSection` ("Deep dive"). Cut 1 introduces a new compact PMC variant promoted into the Today flow, trims `CoachBrief` so it stops rendering the workout-export list and framework footer inline, and relocates `PolarizedDistribution` + `WorkoutExportRow` + the long framework/transparency footer into the Deep-dive section. No backend changes.

**Tech Stack:** React 19 + TypeScript, Vite, TailwindCSS, `motion/react` (being removed where decorative), Vitest + React Testing Library for component tests, Playwright (manual UAT) on `localhost:5173`.

**Pre-req:** dev servers running — backend `uvicorn app.main:app --port 8000` from `backend/`, frontend `npm run dev` (port 5173) from `frontend/`. Login: `jannis.deters@icloud.com` / `1234asdf`.

---

### Task 1: Add `PMCCompact` component (promoted training-state tile)

**Files:**
- Create: `frontend/src/components/dashboard/PMCCompact.tsx`
- Read for reference: `frontend/src/components/dashboard/PMCChart.tsx` (data hook + types), `frontend/src/components/dashboard/Sparkline.tsx`
- Test: `frontend/src/components/dashboard/__tests__/PMCCompact.test.tsx`

- [ ] **Step 1: Identify the PMC data hook.** Run: `grep -n "useQuery\|usePMC\|api/pmc\|ctl_atl_tsb\|/pmc" frontend/src/components/dashboard/PMCChart.tsx frontend/src/api/*.ts`. Expected: a hook (e.g. `usePMC()` or `useQuery(['pmc'])`) returning `{ ctl, atl, tsb, series: [{date, ctl, atl, tsb}], ... }`. Note the exact hook name and field names; use them verbatim below (replace `usePMC` / `tsb` / `ctl` / `atl` / `series` in this task if they differ).

- [ ] **Step 2: Write the failing test.**

```tsx
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PMCCompact from '../PMCCompact'

vi.mock('../../../hooks/usePMC', () => ({
  usePMC: () => ({
    data: { ctl: 52.4, atl: 38.1, tsb: 14.0, series: [
      { date: '2026-04-14', ctl: 48, atl: 40, tsb: 8 },
      { date: '2026-05-12', ctl: 52.4, atl: 38.1, tsb: 14.0 },
    ] },
    isLoading: false, isError: false,
  }),
}))

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
}

it('shows fitness, fatigue, form labels and values', () => {
  render(wrap(<PMCCompact />))
  expect(screen.getByText(/FITNESS/i)).toBeInTheDocument()
  expect(screen.getByText(/FATIGUE/i)).toBeInTheDocument()
  expect(screen.getByText(/FORM/i)).toBeInTheDocument()
  expect(screen.getByText('52')).toBeInTheDocument()   // ctl rounded
  expect(screen.getByText('38')).toBeInTheDocument()   // atl rounded
  expect(screen.getByText(/\+14/)).toBeInTheDocument() // tsb signed
})

it('renders a sparkline svg', () => {
  const { container } = render(wrap(<PMCCompact />))
  expect(container.querySelector('svg')).toBeInTheDocument()
})
```

  Adjust the `vi.mock` path to the real hook module path discovered in Step 1.

- [ ] **Step 3: Run the test, expect failure.** Run: `cd frontend && npx vitest run src/components/dashboard/__tests__/PMCCompact.test.tsx`. Expected: FAIL — `Cannot find module '../PMCCompact'`.

- [ ] **Step 4: Implement `PMCCompact.tsx`.** Three stacked metric rows (FITNESS = ctl, FATIGUE = atl, FORM = tsb signed) using existing `eyebrow` + `num-mono` classes and `--color-*` tokens (mirror the `MetricTile` pattern in `PrescribedWorkoutCard.tsx`). Below them a small CTL/ATL line chart over `data.series` — reuse `Sparkline` if it accepts a series, else inline a minimal `<svg>` ~140×40 with two polylines (ctl in `--color-ink`, atl in `--color-muted`). FORM value: green token if `tsb >= -10`, amber if `-20 < tsb < -10`, alert if `tsb <= -20`. Loading → a `h-24 animate-pulse` block with `--color-rule` bg. Error/empty → render nothing (`return null`). Wrap in a hairline-rule container: `style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', borderRadius: 12, padding: 16 }}`. No `motion/react`.

- [ ] **Step 5: Run the test, expect pass.** Run: `cd frontend && npx vitest run src/components/dashboard/__tests__/PMCCompact.test.tsx`. Expected: PASS (both tests).

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/components/dashboard/PMCCompact.tsx frontend/src/components/dashboard/__tests__/PMCCompact.test.tsx
git commit -m "feat(dashboard): add PMCCompact training-state tile"
```

---

### Task 2: Slim CoachBrief — extract the framework/transparency footer and stop rendering WorkoutExportRow inline

**Files:**
- Modify: `frontend/src/components/dashboard/CoachBrief.tsx` (remove `<WorkoutExportRow />` from `BriefBody` ~line 322; remove the `frameworks_cited` + Why/AI-saw/Refresh footer block ~lines 350–400 and re-export the Why/Transparency openers via a small `BriefFooter` component so TodayTab can place it).
- Create: `frontend/src/components/dashboard/BriefFooter.tsx` (the extracted footer: frameworks line + "Why this?" + "What did the AI see?" + "Refresh"; takes props `{ frameworks: string[]; simpleMode: boolean; isRefreshing: boolean; onRefresh; onOpenWhy; onOpenTransparency }`).
- Test: `frontend/src/components/dashboard/__tests__/CoachBrief.test.tsx` (extend if exists, else create)

- [ ] **Step 1: Write the failing test** — assert `CoachBrief` no longer renders the export-row heading and no longer renders the "What did the AI see?" link inline.

```tsx
// in CoachBrief.test.tsx, with the existing brief mock
it('does not render the workout export row inside the brief', () => {
  renderCoachBrief() // existing helper
  expect(screen.queryByText(/export workout/i)).not.toBeInTheDocument()
})
it('does not render the AI-transparency footer link inside the brief', () => {
  renderCoachBrief()
  expect(screen.queryByText(/what did the ai see/i)).not.toBeInTheDocument()
})
```

  If no test file/helper exists yet, create one that mocks `useCoachBrief`/`useRefreshBrief` (see hook module under `frontend/src/hooks/useCoachBrief.ts`) returning a minimal `CoachBriefResponse` with `prescribed_workout` set.

- [ ] **Step 2: Run, expect failure.** Run: `cd frontend && npx vitest run src/components/dashboard/__tests__/CoachBrief.test.tsx`. Expected: FAIL (those strings still present).

- [ ] **Step 3: Create `BriefFooter.tsx`** — move the JSX currently at `CoachBrief.tsx:351-400` (the `<div>` with `borderTop`, frameworks span, and the three buttons) verbatim into a function component with the prop shape above. Keep `lucide-react` icons and `translateCoach` import there.

- [ ] **Step 4: Edit `CoachBrief.tsx`** — delete `<WorkoutExportRow />` (line ~322) and its import; delete the footer `<div>` (lines ~350-400); have `BriefBody` accept and pass through nothing new — instead `CoachBrief` (the outer component) still owns `whyOpen`/`transparencyOpen` state and now also renders `<BriefFooter ... />` *after* `<BriefBody />`, plus it needs `frameworks`/`simpleMode`/refresh from the brief data — lift `const { language } = useLanguage()` and `refresh` to the outer component, pass `brief.frameworks_cited` and `language === 'simple'` to `BriefFooter`. Remove now-unused imports (`WorkoutExportRow`, and `translateCoach`/`ChevronRight`/`RefreshCw` if no longer referenced in this file).

- [ ] **Step 5: Run, expect pass.** Run: `cd frontend && npx vitest run src/components/dashboard/__tests__/CoachBrief.test.tsx`. Expected: PASS.

- [ ] **Step 6: Typecheck.** Run: `cd frontend && npx tsc -b --noEmit`. Expected: no errors. Fix any unused-import / missing-prop errors before continuing.

- [ ] **Step 7: Commit.**

```bash
git add frontend/src/components/dashboard/CoachBrief.tsx frontend/src/components/dashboard/BriefFooter.tsx frontend/src/components/dashboard/__tests__/CoachBrief.test.tsx
git commit -m "refactor(dashboard): extract BriefFooter, drop inline export-row from CoachBrief"
```

---

### Task 3: Recompose TodayTab — promote PMC, relocate polarized + export-row + footer into Deep dive

**Files:**
- Modify: `frontend/src/components/dashboard/tabs/TodayTab.tsx`
- Read for reference: `frontend/src/components/dashboard/DashboardSection.tsx`, `frontend/src/components/dashboard/WorkoutExportRow.tsx`
- Test: `frontend/src/components/dashboard/tabs/__tests__/TodayTab.test.tsx`

- [ ] **Step 1: Write the failing test** — TodayTab renders `ReadinessHero`, `TrajectorySentence`, `CoachBrief`, `PMCCompact`, a Deep-dive section, and inside it `PolarizedDistribution` + `WorkoutExportRow` + `RecentActivities`. Mock the heavy children to render identifiable stubs:

```tsx
vi.mock('../../ReadinessHero', () => ({ default: () => <div>readiness-hero</div> }))
vi.mock('../../TrajectorySentence', () => ({ default: () => <div>trajectory</div> }))
vi.mock('../../CoachBrief', () => ({ default: () => <div>coach-brief</div> }))
vi.mock('../../PMCCompact', () => ({ default: () => <div>pmc-compact</div> }))
vi.mock('../../PolarizedDistribution', () => ({ default: () => <div>polarized</div> }))
vi.mock('../../RecentActivities', () => ({ default: () => <div>recent</div> }))
vi.mock('../../WorkoutExportRow', () => ({ default: () => <div>export-row</div> }))
vi.mock('../../PMCChart', () => ({ default: () => <div>pmc-chart</div> }))

it('promotes PMCCompact above the fold and keeps deep dive contents', () => {
  render(<TodayTab />)
  expect(screen.getByText('pmc-compact')).toBeInTheDocument()
  expect(screen.getByText('polarized')).toBeInTheDocument()
  expect(screen.getByText('export-row')).toBeInTheDocument()
  expect(screen.getByText('recent')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run, expect failure.** Run: `cd frontend && npx vitest run src/components/dashboard/tabs/__tests__/TodayTab.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Rewrite `TodayTab.tsx`.** Order, top to bottom: `<ReadinessHero />`, `<TrajectorySentence />`, `<CoachBrief />`, `<PMCCompact />`, then `<DashboardSection id="today-deep-dive" title="Deep dive" defaultExpanded={false}>` containing in order `<WorkoutExportRow />`, `<PMCChart />`, `<PolarizedDistribution />`, `<RecentActivities />`. Update the header doc comment: the above-the-fold primitive count is now 4 (state, trajectory, prescription, training-state), and list the relocated items. Remove the stale "above-the-fold == 3" hard-rule comment.

- [ ] **Step 4: Run, expect pass.** Run: `cd frontend && npx vitest run src/components/dashboard/tabs/__tests__/TodayTab.test.tsx`. Expected: PASS.

- [ ] **Step 5: Typecheck.** Run: `cd frontend && npx tsc -b --noEmit`. Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/components/dashboard/tabs/TodayTab.tsx frontend/src/components/dashboard/tabs/__tests__/TodayTab.test.tsx
git commit -m "feat(dashboard): promote PMC to Today, relocate polarized/export/footer to deep dive"
```

---

### Task 4: Remove the leftover reveal-cascade animation

**Files:**
- Inspect: `frontend/src/components/dashboard/RevealCascade.tsx`
- Modify: every file importing `RevealCascade` (find in Step 1) — replace the wrapper with a plain `<>...</>` / `<div className="...">`
- Modify: `frontend/src/components/dashboard/CoachBrief.tsx` — change the `motion.div` in `BriefBody` (line ~233) to a plain `div` (drop `initial`/`animate`/`transition` props and the `motion/react` import if now unused in that file).
- Delete: `frontend/src/components/dashboard/RevealCascade.tsx` (only if no remaining imports)
- Test: existing component tests must still pass; no new test needed (removing animation).

- [ ] **Step 1: Find usages.** Run: `grep -rn "RevealCascade\|motion/react\|from 'motion'" frontend/src --include="*.tsx" --include="*.ts"`. List every file. (Keep `motion/react` only where it drives a *functional* state transition, e.g. SideSheet open/close — do not touch those; remove only decorative entrance animations.)

- [ ] **Step 2: Replace each `RevealCascade` usage** with its children unwrapped (preserve any layout `className`/`style` that was on the wrapper by moving it to a plain `div`).

- [ ] **Step 3: De-animate `BriefBody`** — `motion.div` → `div`, drop the three motion props, remove the now-unused `import { motion } from 'motion/react'` from `CoachBrief.tsx`.

- [ ] **Step 4: Delete `RevealCascade.tsx`** if `grep -rn "RevealCascade" frontend/src` now returns nothing.

- [ ] **Step 5: Typecheck + full unit run.** Run: `cd frontend && npx tsc -b --noEmit && npx vitest run`. Expected: no type errors; all tests pass.

- [ ] **Step 6: Commit.**

```bash
git add -A frontend/src
git commit -m "refactor(dashboard): remove decorative reveal-cascade animations"
```

---

### Task 5: Visual token tightening — tri-color status + ensure numerics use num-mono

**Files:**
- Modify: `frontend/src/index.css` — add semantic aliases `--color-good: var(--color-zone-2)` (or a brighter green of choice), `--color-caution: var(--color-amber)`, `--color-bad: var(--color-alert)` in `:root`, with a one-line comment "tri-color status — use these, not zone tokens, for good/caution/bad".
- Modify: `frontend/src/components/dashboard/PMCCompact.tsx` — use `--color-good/--color-caution/--color-bad` for the FORM threshold colors instead of zone tokens.
- Modify: `frontend/src/components/dashboard/CoachBrief.tsx` `EvidenceChip` — `tone="alert"` already uses `--color-alert`; leave as is. (No-op check.)
- Test: `frontend/src/components/dashboard/__tests__/PMCCompact.test.tsx` — add a case asserting the FORM element's inline `color` style is `var(--color-bad)` when tsb = -25.

- [ ] **Step 1: Add the test case** for `tsb: -25` → FORM value has `style.color` containing `--color-bad`. (Re-mock `usePMC` per-test with `tsb: -25`.)

- [ ] **Step 2: Run, expect failure.** Run: `cd frontend && npx vitest run src/components/dashboard/__tests__/PMCCompact.test.tsx`. Expected: FAIL (currently uses zone token).

- [ ] **Step 3: Add the CSS aliases** to `index.css` `:root`.

- [ ] **Step 4: Update `PMCCompact.tsx`** FORM color logic to the new tokens.

- [ ] **Step 5: Run, expect pass.** Run: `cd frontend && npx vitest run src/components/dashboard/__tests__/PMCCompact.test.tsx`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/index.css frontend/src/components/dashboard/PMCCompact.tsx frontend/src/components/dashboard/__tests__/PMCCompact.test.tsx
git commit -m "feat(dashboard): add tri-color status tokens, apply to PMC form readout"
```

---

### Task 6: Manual UAT via Playwright

- [ ] **Step 1: Ensure servers up** — backend on 8000, frontend on 5173.
- [ ] **Step 2: Log in** at `http://localhost:5173/login` with `jannis.deters@icloud.com` / `1234asdf`.
- [ ] **Step 3: Screenshot Today** (full page) — confirm above the fold (1440×900, no scroll) shows: readiness hero, trajectory sentence, coach verdict + workout card, and the new PMC tile. Confirm polarized distribution is **not** visible above the fold.
- [ ] **Step 4: Expand Deep dive** — confirm it now contains the export-row, PMC chart, polarized distribution, recent activities, in that order.
- [ ] **Step 5: Check console** — `browser_console_messages` level error: only the pre-existing `/auth/refresh` noise allowed; no new React errors.
- [ ] **Step 6: Compare** against the baseline screenshots `dashboard-full.png` / `dashboard-today-deepdive.png` at repo root — note the structural diff in the PR description.

---

## Self-review notes

- **Spec coverage (Cut 1 scope only):** Today single-viewport (Tasks 1–3) ✓; PMC promotion (Task 1, 3) ✓; polarized de-duplicated from Today (Task 3 — moved to deep dive; full removal from Today/keep-on-Week happens in Cut 2 when WeekTab is rebuilt) ✓; remove reveal-cascade (Task 4) ✓; tri-color tokens + mono numerics (Task 5 — numerics already use `num-mono`; this task adds the status aliases) ✓. Interval-ribbon-renders: already true in `PrescribedWorkoutCard`/`DayPlanCard` — no task needed. Mono-font *choice* (IBM Plex Mono vs current) deferred — `num-mono` class already exists; swapping the font family is a one-line `index.css` change deferred to a later polish pass to avoid scope creep here.
- **Hook-name caveat:** Task 1 Step 1 verifies the real PMC data hook name/fields before writing code — the `usePMC` / `series` names in the test are placeholders to be reconciled there.
- **No backend changes in Cut 1** — confirmed.
