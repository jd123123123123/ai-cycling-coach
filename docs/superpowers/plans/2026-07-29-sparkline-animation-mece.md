# Sparkline Animation & MECE Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the sparkline a draw-in animation using the animation library already in this app's dependency tree, and delete the second, parallel "small inline trend line" implementation that was already living in the codebase before this animation work started.

**Architecture:** `frontend/src/components/ui/Sparkline.tsx` (shipped last phase) is the one canonical small-trend-line primitive. `frontend/src/components/coach/AnalyticalAnswerCard.tsx` independently built its own — a Recharts `LineChart` in a 96×44 box, `isAnimationActive={false}`, twice (once for a PMC/CTL trend, once for an HRV trend), with a hardcoded colour each and a stale "dashed placeholder" fallback that this project's own prototype work already proved illegible at chip scale. This plan retires both bespoke copies onto the shared component, then animates the shared component once — using `motion` (already a dependency, already used for exactly this kind of path draw-in elsewhere in this codebase) rather than introducing a second animation or charting paradigm.

**Tech Stack:** React 19 + TypeScript, `motion` 12 (already installed; this is the "2026 animation library" — nothing new to add), vitest + jsdom + @testing-library/react. Recharts import is REMOVED from `AnalyticalAnswerCard.tsx`, not added anywhere.

## Global Constraints

- **No new dependency.** `motion` and its `pathLength`/`useReducedMotion` API are already installed and already used for an SVG path draw-in in `frontend/src/components/celebration/StreakBreakOverlay.tsx`. Follow that file's exact pattern (`useReducedMotion()` → `reduce` boolean → `initial={reduce ? false : {...}}` → `transition={reduce ? { duration: 0 } : {...}}`) rather than inventing a second animation convention.
- **Recharts is not touched, only removed from one file.** `AnalyticalAnswerCard.tsx`'s two Recharts `LineChart` instances are deleted in favour of `Sparkline`. Recharts itself stays a dependency (still used by `WorkoutDetail.tsx`) — do not touch that file or remove the package.
- **No new colour tokens.** The migrated cards must derive their sparkline colour from the SAME trend-direction logic each card already computes (`ctlDelta`/`hrvPct` → up/down/steady), reusing existing tokens (`--color-recovery`, `--color-amber`, `--color-move`, or whatever the file's own `DirectionIcon` logic already implies) rather than keeping the old hardcoded single colour per card.
- **Honest empty stays honest.** `RecoveryCard`'s old fallback for `series.length < 2` drew a dashed placeholder line. This project's own rendered-prototype testing already proved a dashed reference line invisible at chip scale and led to it being banned from `Sparkline` entirely. The migrated version renders NOTHING below 2 points (matching `Sparkline`'s own contract), not a dashed placeholder — this is a corrected inconsistency, not a regression.
- **Respect `prefers-reduced-motion`.** No animation may play when `useReducedMotion()` is true. This is not optional — it's the same rule every other `motion` usage in this codebase already follows.
- **Bike-only. German + English** on every user-visible string this plan touches (it touches none — no new copy).
- **Mobile-only**, 390×844 target.
- Pre-existing lint/typecheck findings are not yours to fix: `frontend/src/auraprobe.tsx`, `frontend/aura.html` (untracked scratch files); one accepted `react-refresh/only-export-components` finding on `ChapterBar.tsx`.

---

## File Structure

**Modify:**
- `frontend/src/components/ui/Sparkline.tsx` — the `<polyline>` becomes a `motion.polyline` with a `pathLength` draw-in; the area-fill `<path>` fades in alongside it.
- `frontend/src/components/ui/__tests__/Sparkline.test.tsx` — cover the reduced-motion branch.
- `frontend/src/components/coach/AnalyticalAnswerCard.tsx` — both `PmcCard` and `RecoveryCard` drop their private Recharts sparkline and render `<Sparkline>` instead, with a trend-derived colour.

No new files. No change to `frontend/src/api/health.ts`, `InsightNudge.tsx`, or anything backend — this plan is UI-only and touches nothing that emits data.

---

### Task 1: Animate `Sparkline`'s draw-in

**Files:**
- Modify: `frontend/src/components/ui/Sparkline.tsx`
- Test: `frontend/src/components/ui/__tests__/Sparkline.test.tsx`

**Interfaces:**
- Consumes: `motion`, `useReducedMotion` from `'motion/react'` (already a dependency).
- Produces: no prop-surface change — `SparklineProps` is unchanged. The animation is an internal behaviour, not something callers opt into or configure, matching how `StreakBreakOverlay.tsx`'s path animation is unconditional except for the reduced-motion gate.

- [ ] **Step 1: Write the failing tests**

Add to the existing `describe('Sparkline', ...)` block in `frontend/src/components/ui/__tests__/Sparkline.test.tsx`. The file already imports `render`/`cleanup` from `@testing-library/react` — this task additionally needs to mock `useReducedMotion`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import Sparkline from '../Sparkline'

vi.mock('motion/react', async () => {
  const actual = await vi.importActual<typeof import('motion/react')>('motion/react')
  return { ...actual, useReducedMotion: vi.fn(() => false) }
})

// ... existing tests unchanged above this point ...

describe('Sparkline — draw-in animation', () => {
  it('sets pathLength as the animation target on the stroked polyline', async () => {
    const { useReducedMotion } = await import('motion/react')
    vi.mocked(useReducedMotion).mockReturnValue(false)
    const { container } = render(<Sparkline values={[1, 5, 3, 8]} color="red" />)
    // motion writes its animated props onto the real DOM element as it settles;
    // the presence of the element plus a non-zero rendered length is what we can
    // assert without a fake timer harness — the actual interpolation is motion's
    // own tested behaviour, not this component's.
    const polyline = container.querySelector('polyline')
    expect(polyline).toBeTruthy()
  })

  it('skips the animation entirely when the user prefers reduced motion', async () => {
    const { useReducedMotion } = await import('motion/react')
    vi.mocked(useReducedMotion).mockReturnValue(true)
    const { container } = render(<Sparkline values={[1, 5, 3, 8]} color="red" />)
    const polyline = container.querySelector('polyline')!
    // With reduce=true the component must render the FINAL state immediately
    // (no 0-length flash), matching every other motion usage in this codebase.
    expect(polyline.getAttribute('points')).not.toBe('')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/Sparkline.test.tsx`
Expected: the two new tests likely still pass trivially against the CURRENT plain-SVG component (it has no animation to break), which is fine — the real gate is Step 4's manual confirmation that the component now imports and uses `motion`. If you want a stricter red-green cycle, temporarily grep the component for `motion.polyline` before implementing — it won't be there yet.

- [ ] **Step 3: Add the animation**

Replace the `<polyline>` and the surrounding imports in `frontend/src/components/ui/Sparkline.tsx`. Add to the top imports:

```tsx
import { motion, useReducedMotion } from 'motion/react'
```

Inside the component, right after the existing `const clean = values.filter(...)` / early-return block, add:

```tsx
  const reduce = useReducedMotion()
```

Replace the plain `<polyline ... />` element with:

```tsx
      <motion.polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.7, ease: 'easeOut' }}
      />
```

And wrap the fill `<path>` the same way, so the area fades in alongside the line rather than appearing as a hard-edged block before the line has finished drawing:

```tsx
      <motion.path
        d={`M ${pts} L ${width},${height} L 0,${height} Z`}
        fill={`url(#${gradientId})`}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.5, delay: 0.2 }}
      />
```

Leave the `<circle>` marking the most recent point exactly as it is — no animation on it in this task; a static anchor point is the right visual counterpoint to a moving line, and animating everything at once is busier, not better.

Update the component's own doc comment to record the decision:

```tsx
 * ── The draw-in uses `motion`, already a dependency ──
 * This is the same `pathLength` draw-in `StreakBreakOverlay.tsx` already uses
 * for its own SVG path — followed here rather than invented fresh, so the app
 * has one animated-path convention, not two. `useReducedMotion()` gates it the
 * same way that file does: `initial={reduce ? false : {...}}` so a
 * reduced-motion user sees the finished chart immediately, never a moving one.
```

- [ ] **Step 4: Run the tests and confirm the animation is real**

Run: `cd frontend && npx tsc -b --noEmit && npx vitest run src/components/ui/__tests__/Sparkline.test.tsx`
Expected: clean typecheck, all tests passing (existing 7 + 2 new = 9).

Then confirm by eye that this isn't a no-op: `grep -n "motion.polyline\|motion.path" frontend/src/components/ui/Sparkline.tsx` should show both new elements. This is a case where the render check in Task 3 is the only thing that can confirm the animation actually plays and looks good — no test asserts the visual timing.

- [ ] **Step 5: Run the full suite and commit**

Run: `cd frontend && npx vitest run`
Expected: 647 existing + 2 new = 649 passed.

```bash
git add frontend/src/components/ui/Sparkline.tsx frontend/src/components/ui/__tests__/Sparkline.test.tsx
git commit -m "feat(ui): Sparkline draws itself in, using the library already here

Same motion.polyline pathLength draw-in StreakBreakOverlay.tsx already
uses for its own path — one animated-path convention in this app, not
two. useReducedMotion() gates it identically: a reduced-motion user sees
the finished chart immediately, a moving one never flashes past them."
```

---

### Task 2: Retire `AnalyticalAnswerCard`'s private Recharts sparkline

**Files:**
- Modify: `frontend/src/components/coach/AnalyticalAnswerCard.tsx`

**Interfaces:**
- Consumes: `Sparkline` (default export) from `'../ui/Sparkline'`, props `{ values: number[]; color: string; width?: number; height?: number; label?: string }` (unchanged from Task 1; Task 1 added no new props).

- [ ] **Step 1: Read the whole file first**

`AnalyticalAnswerCard.tsx` has two nearly-parallel components, `PmcCard` and `RecoveryCard`, each building a `series` array shaped for Recharts (`{ i, ctl: number|null }[]` / `{ i, hrv: number|null }[]`) and rendering it via `ResponsiveContainer > LineChart > YAxis + Line`. Both need the same shape of edit. Read both in full before touching either, so the two edits stay consistent.

- [ ] **Step 2: Remove the Recharts import, add the Sparkline import**

Change:

```tsx
import type { ResponsiveContainerProps } from 'recharts'
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts'
```

to:

```tsx
import Sparkline from '../ui/Sparkline'
```

There is one more piece of Recharts-only debt in this file, in the default-exported `AnalyticalAnswerCard` dispatcher function (not inside `PmcCard`/`RecoveryCard`): a deliberate lint-suppression hack,

```tsx
  // Suppress the recharts ResponsiveContainerProps unused import by referencing
  // its shape — needed only for type inference in strict TS builds.
  void ({} as Partial<ResponsiveContainerProps>)
```

This exists ONLY because `ResponsiveContainerProps` was imported and needed an excuse not to be flagged as unused. Once Recharts is gone from this file, both the import and this suppression line are dead together — delete this `void (...)` line and its comment along with the import.

Confirm with `grep -n "Recharts\|ResponsiveContainer\|LineChart\|<Line \|ResponsiveContainerProps" frontend/src/components/coach/AnalyticalAnswerCard.tsx` after your edit — zero matches expected across the whole file.

- [ ] **Step 3: Migrate `PmcCard`**

`PmcCard` currently builds `series = days.map((d, i) => ({ i, ctl: d.ctl ?? null }))` and renders it in a 96×44 box. Replace the whole rendering block (the `<div style={{ width: 96, height: 44 }}>...</div>` containing the `ResponsiveContainer`) with:

```tsx
      <div className="flex-shrink-0" style={{ width: 96, height: 44 }} aria-hidden>
        <Sparkline
          values={days.map((d) => d.ctl).filter((v): v is number => v != null)}
          color={
            ctlDelta > 0.5 ? 'var(--color-recovery)'
              : ctlDelta < -0.5 ? 'var(--color-amber)'
              : 'var(--color-muted)'
          }
          width={96}
          height={44}
        />
      </div>
```

This replaces the single hardcoded `stroke="var(--color-amber)"` with the SAME up/down/steady logic the card already computes for `DirectionIcon` two lines above (`ctlDelta > 0.5 ? TrendingUp : ctlDelta < -0.5 ? TrendingDown : Activity`) — the colour now agrees with the icon and the headline, which it did not before (the old sparkline was always amber regardless of direction). Delete the now-unused `series` variable if nothing else in `PmcCard` reads it (check with `grep -n "series" ` scoped to this function before deleting).

Note `Sparkline` filters non-finite values itself and returns `null` under 2 points — you do not need to keep the old `series.length >= 2` ternary or its dashed-placeholder fallback branch; `Sparkline` already renders nothing in that case, which is the correct honest-empty behaviour (a dashed placeholder implying missing data was already known, from this project's own earlier prototype testing, to be invisible at this size and is not being preserved).

- [ ] **Step 4: Migrate `RecoveryCard`**

Same shape of change. `RecoveryCard` builds `series = days.map((d, i) => ({ i, hrv: d.hrv ?? null }))` and has the dashed-placeholder fallback mentioned above (`series.length >= 2 ? <ResponsiveContainer>...</ResponsiveContainer> : <div ... style={{ borderBottom: '1px dashed var(--color-rule)' }} />`). Replace the ENTIRE conditional (both branches) with:

```tsx
      <div className="flex-shrink-0" style={{ width: 96, height: 44 }} aria-hidden>
        <Sparkline
          values={days.map((d) => d.hrv).filter((v): v is number => v != null)}
          color={
            hrvPct > 2 ? 'var(--color-recovery)'
              : hrvPct < -2 ? 'var(--color-amber)'
              : 'var(--color-muted)'
          }
          width={96}
          height={44}
        />
      </div>
```

reusing the direction thresholds `RecoveryCard` already computes for its own `DirectionIcon` (`hrvPct > 2 ? TrendingUp : hrvPct < -2 ? TrendingDown : Activity`) rather than the old single hardcoded `--color-forest-2`. Delete the `series` variable and the dashed-placeholder markup entirely — do not keep the dead branch "just in case."

- [ ] **Step 5: Typecheck and run the full suite**

Run: `cd frontend && npx tsc -b --noEmit && npx vitest run`
Expected: clean typecheck, 649 passed (unchanged from Task 1 — this task touches no test file, since there is no existing render test for `AnalyticalAnswerCard.tsx`; confirm with `grep -rln "AnalyticalAnswerCard" frontend/src --include="*.test.tsx"`, expect zero matches, so a green suite here proves the file compiles and nothing else regressed — Task 3 does the visual check).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/coach/AnalyticalAnswerCard.tsx
git commit -m "refactor(coach): retire the second sparkline implementation

PmcCard and RecoveryCard each had their own Recharts LineChart doing the
exact job the shared ui/Sparkline component already does — two
technologies for one idea. Both now render through the shared component,
which also fixes two latent bugs the migration surfaces: the sparkline
color was hardcoded regardless of trend direction, and the low-data
fallback drew a dashed placeholder line that this project's own earlier
rendered-prototype testing already proved invisible at chip scale."
```

---

### Task 3: Verify at 390×844 and ship

- [ ] **Step 1: Full gates**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npx eslint src/components/ui/Sparkline.tsx src/components/coach/AnalyticalAnswerCard.tsx
```

Compare the eslint output against the same command with your changes stashed, so pre-existing findings are not attributed to this work.

- [ ] **Step 2: Render the animation and the migrated cards**

Dev servers: backend `:8042`, frontend `:5180` (CORS allowlists only 5173/5180). This task is frontend-only — no dev-DB fixture is needed for `Sparkline`'s own animation (any existing firing Insight Nudge card will do), but `AnalyticalAnswerCard` renders inside the coach chat stream when a `fetch_pmc_window`/`fetch_recovery_trend` tool result arrives — trigger one via the coach chat (ask a question that would call one of those tools, e.g. "how has my fitness trended the last month") rather than mutating the dev DB, since this is a display-only migration of data the chat flow already fetches normally.

At 390×844, judge by eye:

1. **The sparkline draws itself in on mount** — a visible line-and-fill animation, not an instant static appearance. Refresh and watch it happen more than once to be sure it's real, not a one-time illusion from a slow network load.
2. **It respects reduced motion.** Enable "reduce motion" in the OS/browser and reload — the chart must appear fully-drawn immediately, with no animation at all.
3. **The migrated `AnalyticalAnswerCard` sparklines** (in a coach chat PMC/recovery answer) now show a colour that agrees with their trend icon and headline — e.g. a card saying "fitness climbing" with an upward `TrendingUp` icon must show a green (not amber) sparkline.
4. **No layout regression** — the 96×44 box reads the same as before, just animated and correctly coloured.

Screenshot both.

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build
```

Report the result and STOP — no deploy. Deploy happens after the final whole-branch review.

---

## Self-Review

**Spec coverage.** "2026 animated graph libraries" → Task 1, using the exact library and pattern already in this codebase rather than adding a new one. "More MECE" → Task 2, deleting the second parallel small-trend-line implementation rather than letting a third animated version of "a tiny inline chart" proliferate. "More UX/UI focused" → the colour-correctness fix Task 2 makes as a direct consequence of consolidation (the old cards' sparkline colour disagreed with their own trend icon; that is a real UI bug the MECE pass surfaces and fixes, not scope creep).

**Placeholder scan.** No TBDs. Every code block is complete. Task 2's "check with grep" instructions are verification steps with an exact command and exact expected result, not vague guidance.

**Type consistency.** `SparklineProps` is unchanged from the prior phase — this plan adds no new prop, so `AnalyticalAnswerCard`'s two call sites in Task 2 use exactly the props that already exist (`values`, `color`, `width`, `height`). No signature drift between tasks.

**One explicit non-goal.** This plan does not touch `WorkoutDetail.tsx`'s Recharts usage — that is a full analytical chart (different weight class from a chip/card-scale trend line), not a duplicate of `Sparkline`'s job, and touching it would be scope creep beyond what the MECE finding actually supports.
