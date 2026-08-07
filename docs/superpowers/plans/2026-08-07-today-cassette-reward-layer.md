# Today · Cassette Reward Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Today's inert hero numeral with a cassette whose chain shows the gear your body can push today, and hang the reward layer — bento tiles, the one-highlighted-point chart rule, the streak-as-chain and XP strip — off it, across all five day states.

**Architecture:** Pure geometry/mapping module first, then a dumb SVG component, then the motion hooks, then the composed hero, then the model field it needs, then integration into `TodayView`, then the bento and the Kette strip. Every display component consumes `Value<T>` and renders both arms; nothing new reaches for an API client.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + @testing-library/react, inline SVG (no chart library), CSS custom properties scoped under `.editorial-root`.

## Global Constraints

- **Design system:** EDITORIAL II, evolved. Keep the day-state hue, section rhythm and honest-missing rule. Tokens live in `frontend/src/editorial/tokens.css` and must stay scoped under `.editorial-root` — `src/editorial/__tests__/isolation.test.ts` proves this and must stay green.
- **Language:** German ships. Every literal routes through `src/editorial/i18n/copy.ts` via `useCopy()`. `COPY` is `Record<CopyKey, { de: string; en: string }>` — both languages are required or it will not compile. Register: terse, calm, second person `du`, never `Sie`, never chirpy. Athlete units (W, TSS, KM, BPM, H, IF, NP) are never germanised.
- **No new keys in `src/i18n/strings.ts`.** The one-way dependency (`editorial/` may read `api/`, `hooks/`, `utils/`, `contexts/`; nothing outside imports from `editorial/`) is what keeps this tree deletable.
- **Honest data:** display components take `Value<T>` from `src/editorial/data/value.ts` (`present`, `missing`, `isPresent`, `fromNullable`, `mapValue`). A raw number where a `Value` belongs is a bug.
- **Motion:** reuse `MOTION_DURATION_MS` (550), `MOTION_EASE` (`cubic-bezier(0.22, 1, 0.36, 1)`), `MOTION_STAGGER_MS` (35) and `prefersReducedMotion()` from `src/editorial/motion/useReveal.ts`. Reduced motion resolves instantly — no fade substitutes.
- **Viewport:** verify at 390×844. Desktop is a sanity check only.
- **Files:** changes stay under `frontend/src/`.
- **Test command:** from `frontend/`, `npx vitest run <path>`. Type-check: from `frontend/`, `npx tsc -b` (a bare `npx tsc --noEmit` at the repo root checks nothing).
- **Cog table, fixed everywhere:** `[11, 13, 15, 17, 19, 21, 24, 28, 32, 34]`, index 0 = the 11t.

---

### Task 1: Cassette scale — cogs and the readiness→gear mapping

**Files:**
- Create: `frontend/src/editorial/components/cassetteScale.ts`
- Test: `frontend/src/editorial/__tests__/cassetteScale.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `COG_TEETH: readonly number[]` (length 10)
  - `MIN_SERIES_FOR_PERCENTILE: 14`
  - `percentileRank(value: number, series: number[]): number` → 0..1
  - `cogIndexFromReadiness(readiness: number, series: number[]): { index: number; basis: 'percentile' | 'decile' }`
  - `cogHalfWidth(index: number): number`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/editorial/__tests__/cassetteScale.test.ts
import { describe, it, expect } from 'vitest'
import {
  COG_TEETH,
  MIN_SERIES_FOR_PERCENTILE,
  percentileRank,
  cogIndexFromReadiness,
  cogHalfWidth,
} from '../components/cassetteScale'

const series = (n: number, from = 40) =>
  Array.from({ length: n }, (_, i) => from + i)

describe('cassetteScale', () => {
  it('has ten cogs, smallest first', () => {
    expect(COG_TEETH).toEqual([11, 13, 15, 17, 19, 21, 24, 28, 32, 34])
  })

  it('ranks a value against its own series', () => {
    expect(percentileRank(50, [10, 20, 30, 40, 50])).toBe(1)
    expect(percentileRank(10, [10, 20, 30, 40, 50])).toBeCloseTo(0.2, 5)
    expect(percentileRank(35, [10, 20, 30, 40, 50])).toBeCloseTo(0.6, 5)
  })

  it('returns 0 for an empty series rather than dividing by zero', () => {
    expect(percentileRank(50, [])).toBe(0)
  })

  it('maps the top of your own range to the 11t', () => {
    const { index, basis } = cogIndexFromReadiness(99, series(30))
    expect(index).toBe(0)
    expect(basis).toBe('percentile')
  })

  it('maps the bottom of your own range to the 34t', () => {
    const { index } = cogIndexFromReadiness(1, series(30))
    expect(index).toBe(9)
  })

  it('falls back to absolute deciles below the history floor', () => {
    const { index, basis } = cogIndexFromReadiness(74, series(MIN_SERIES_FOR_PERCENTILE - 1))
    expect(basis).toBe('decile')
    expect(index).toBe(2)
  })

  it('clamps a readiness outside 0..100 in decile mode', () => {
    expect(cogIndexFromReadiness(140, []).index).toBe(0)
    expect(cogIndexFromReadiness(-5, []).index).toBe(9)
  })

  it('widens monotonically from the 11t to the 34t', () => {
    expect(cogHalfWidth(0)).toBe(34)
    expect(cogHalfWidth(9)).toBe(118)
    for (let i = 1; i < COG_TEETH.length; i++) {
      expect(cogHalfWidth(i)).toBeGreaterThan(cogHalfWidth(i - 1))
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/cassetteScale.test.ts`
Expected: FAIL — `Failed to resolve import "../components/cassetteScale"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/editorial/components/cassetteScale.ts
/**
 * The cassette's scale. The cog the chain sits on is the gear your body can
 * push today, and it is ranked against YOUR OWN 90 days — not an absolute
 * score. "You can push the 11" has to mean "the top of your range"; a fixed
 * threshold would borrow someone else's physiology.
 */
export const COG_TEETH = [11, 13, 15, 17, 19, 21, 24, 28, 32, 34] as const

/** Below this many usable readings, a percentile is noise. */
export const MIN_SERIES_FOR_PERCENTILE = 14

const LAST = COG_TEETH.length - 1

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** Share of the series at or below `value`. Empty series → 0. */
export function percentileRank(value: number, series: number[]): number {
  if (series.length === 0) return 0
  const atOrBelow = series.filter((v) => v <= value).length
  return atOrBelow / series.length
}

export function cogIndexFromReadiness(
  readiness: number,
  series: number[],
): { index: number; basis: 'percentile' | 'decile' } {
  if (series.length >= MIN_SERIES_FOR_PERCENTILE) {
    const p = percentileRank(readiness, series)
    return { index: clamp(Math.round((1 - p) * LAST), 0, LAST), basis: 'percentile' }
  }
  const decile = LAST - Math.floor(clamp(readiness, 0, 100) / 10)
  return { index: clamp(decile, 0, LAST), basis: 'decile' }
}

/** Half-width in px, linear in tooth count: 11t → 34, 34t → 118. */
export function cogHalfWidth(index: number): number {
  const teeth = COG_TEETH[clamp(index, 0, LAST)]
  const t = (teeth - COG_TEETH[0]) / (COG_TEETH[LAST] - COG_TEETH[0])
  return Math.round(34 + t * 84)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/cassetteScale.test.ts`
Expected: PASS, 8 tests.

Note on the decile expectation: `74 → 9 - floor(7.4) = 2`, the 15t. The percentile path is the shipping path; the decile path only runs for a rider with under 14 readings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editorial/components/cassetteScale.ts frontend/src/editorial/__tests__/cassetteScale.test.ts
git commit -m "feat(cassette): the gear you can push, ranked against your own 90 days"
```

---

### Task 2: The Cassette SVG

**Files:**
- Create: `frontend/src/editorial/components/Cassette.tsx`
- Test: `frontend/src/editorial/__tests__/cassette.test.tsx`

**Interfaces:**
- Consumes: `COG_TEETH`, `cogHalfWidth` from Task 1.
- Produces: default export `Cassette`, plus
  ```ts
  export interface CassetteProps {
    /** Cog the chain sits on. `null` = no verdict (stale/absent reading). */
    activeIndex: number | null
    /** 90-day best cog, marked but never lit. `null` = no history. */
    bestIndex?: number | null
    /** Unique id suffix so two mounted cassettes never share a filter id. */
    idSuffix?: string
  }
  export const CASSETTE_HEIGHT = 268
  export const CASSETTE_WIDTH = 390
  ```
  Test ids: `cassette`, `cassette-cog` (×10), `cassette-chain`, `cassette-best`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/cassette.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Cassette from '../components/Cassette'

describe('Cassette', () => {
  it('draws ten cogs', () => {
    render(<Cassette activeIndex={3} />)
    expect(screen.getAllByTestId('cassette-cog')).toHaveLength(10)
  })

  it('lights the active cog as a rect, so the glow filter has a bounding box', () => {
    render(<Cassette activeIndex={3} />)
    const chain = screen.getByTestId('cassette-chain')
    // A <line> has a zero-height bbox, which collapses an objectBoundingBox
    // filter region and silently erases the element. This is not cosmetic.
    expect(chain.tagName.toLowerCase()).toBe('rect')
    expect(Number(chain.getAttribute('height'))).toBeGreaterThan(0)
  })

  it('scopes the glow filter to user space with an explicit region', () => {
    const { container } = render(<Cassette activeIndex={3} />)
    const filter = container.querySelector('filter')
    expect(filter?.getAttribute('filterUnits')).toBe('userSpaceOnUse')
    expect(Number(filter?.getAttribute('width'))).toBeGreaterThan(0)
  })

  it('gives two cassettes different filter ids', () => {
    const { container } = render(
      <>
        <Cassette activeIndex={2} idSuffix="a" />
        <Cassette activeIndex={5} idSuffix="b" />
      </>,
    )
    const ids = Array.from(container.querySelectorAll('filter')).map((f) => f.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('draws no chain at all when there is no verdict', () => {
    render(<Cassette activeIndex={null} />)
    expect(screen.queryByTestId('cassette-chain')).toBeNull()
    expect(screen.getAllByTestId('cassette-cog')).toHaveLength(10)
  })

  it('marks the 90-day best without lighting it', () => {
    render(<Cassette activeIndex={5} bestIndex={1} />)
    const best = screen.getByTestId('cassette-best')
    expect(best).toBeTruthy()
    expect(screen.getByTestId('cassette-chain')).not.toBe(best)
  })

  it('omits the best marker when there is no history', () => {
    render(<Cassette activeIndex={5} bestIndex={null} />)
    expect(screen.queryByTestId('cassette-best')).toBeNull()
  })

  it('widens each cog as the teeth grow', () => {
    render(<Cassette activeIndex={0} />)
    const widths = screen.getAllByTestId('cassette-cog').map((c) => {
      const x1 = Number(c.getAttribute('x1'))
      const x2 = Number(c.getAttribute('x2'))
      return x2 - x1
    })
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeGreaterThan(widths[i - 1])
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/cassette.test.tsx`
Expected: FAIL — cannot resolve `../components/Cassette`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/src/editorial/components/Cassette.tsx
import { COG_TEETH, cogHalfWidth } from './cassetteScale'

export const CASSETTE_WIDTH = 390
export const CASSETTE_HEIGHT = 268

const CX = 195
const TOP = 22
const PITCH = 26

/** Cogs below the chain are available; the ramp makes them read as a ladder. */
const AVAILABLE_RAMP = ['#FFFFFF7A', '#FFFFFF6B', '#FFFFFF5C', '#FFFFFF4D', '#FFFFFF3D', '#FFFFFF2E']
const OUT_OF_REACH = '#FFFFFF1F'

export interface CassetteProps {
  activeIndex: number | null
  bestIndex?: number | null
  idSuffix?: string
}

function cogY(index: number): number {
  return TOP + index * PITCH
}

/**
 * The cassette in side profile. Dumb by design: it is handed a cog index and
 * draws it. All mapping lives in `cassetteScale.ts`, all timing in
 * `motion/useChainShift.ts` — so this file can be read in one screen.
 */
export default function Cassette({ activeIndex, bestIndex = null, idSuffix = 'x' }: CassetteProps) {
  const glowId = `cassette-glow-${idSuffix}`
  const activeY = activeIndex == null ? 0 : cogY(activeIndex)
  const activeHalf = activeIndex == null ? 0 : cogHalfWidth(activeIndex)

  return (
    <svg
      data-testid="cassette"
      width={CASSETTE_WIDTH}
      height={CASSETTE_HEIGHT}
      viewBox={`0 0 ${CASSETTE_WIDTH} ${CASSETTE_HEIGHT}`}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <filter
          id={glowId}
          filterUnits="userSpaceOnUse"
          x={CX - 160}
          y={activeY - 26}
          width={320}
          height={52}
        >
          <feGaussianBlur stdDeviation="7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x={CX - 9} y={TOP - 8} width={18} height={PITCH * 9 + 16} rx={4} fill="#FFFFFF0A" />

      {COG_TEETH.map((teeth, i) => {
        const half = cogHalfWidth(i)
        const y = cogY(i)
        const belowChain = activeIndex != null && i > activeIndex
        const stroke = belowChain
          ? AVAILABLE_RAMP[Math.min(i - (activeIndex ?? 0) - 1, AVAILABLE_RAMP.length - 1)]
          : OUT_OF_REACH
        return (
          <line
            key={teeth}
            data-testid="cassette-cog"
            x1={CX - half}
            y1={y}
            x2={CX + half}
            y2={y}
            stroke={stroke}
            strokeWidth={5}
            strokeLinecap="round"
          />
        )
      })}

      {bestIndex != null && (
        <line
          data-testid="cassette-best"
          x1={CX - cogHalfWidth(bestIndex)}
          y1={cogY(bestIndex)}
          x2={CX + cogHalfWidth(bestIndex)}
          y2={cogY(bestIndex)}
          stroke="var(--st-active)"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.5}
        />
      )}

      {activeIndex != null && (
        <>
          <path
            d={`M312 4 L312 ${activeY - 26} Q312 ${activeY} ${CX + activeHalf + 30} ${activeY} L${CX - activeHalf} ${activeY}`}
            stroke="var(--st-active)"
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.3}
            fill="none"
          />
          <g filter={`url(#${glowId})`}>
            <rect
              data-testid="cassette-chain"
              x={CX - activeHalf}
              y={activeY - 5.5}
              width={activeHalf * 2}
              height={11}
              rx={5.5}
              fill="var(--st-active)"
            />
          </g>
        </>
      )}
    </svg>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/cassette.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editorial/components/Cassette.tsx frontend/src/editorial/__tests__/cassette.test.tsx
git commit -m "feat(cassette): the cassette in side profile, with a glow that survives its filter box"
```

---

### Task 3: The motion hooks — count-up and the once-a-day chain shift

**Files:**
- Create: `frontend/src/editorial/motion/useCountUp.ts`
- Create: `frontend/src/editorial/motion/useChainShift.ts`
- Test: `frontend/src/editorial/__tests__/cassetteMotion.test.tsx`

**Interfaces:**
- Consumes: `prefersReducedMotion` from `../motion/useReveal`.
- Produces:
  - `useCountUp(target: number | null, durationMs: number): number | null`
  - `useChainShift(targetIndex: number | null, todayIso: string): { index: number | null; isShifting: boolean }`
  - `CHAIN_SHIFT_STORAGE_KEY = 'editorial.chainShift'`
  - `CHAIN_SHIFT_MS_PER_COG = 90`, `CHAIN_SHIFT_MAX_MS = 900`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/cassetteMotion.test.tsx
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useCountUp } from '../motion/useCountUp'
import { useChainShift, CHAIN_SHIFT_STORAGE_KEY } from '../motion/useChainShift'

describe('useCountUp', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('passes a missing target straight through', () => {
    const { result } = renderHook(() => useCountUp(null, 600))
    expect(result.current).toBeNull()
  })

  it('lands exactly on the target', () => {
    const { result } = renderHook(() => useCountUp(74, 600))
    act(() => { vi.advanceTimersByTime(1200) })
    expect(result.current).toBe(74)
  })
})

describe('useChainShift', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('does not animate the first time it ever runs', () => {
    const { result } = renderHook(() => useChainShift(3, '2026-08-07'))
    expect(result.current.index).toBe(3)
    expect(result.current.isShifting).toBe(false)
  })

  it('remembers today, so a second mount on the same day is still', () => {
    renderHook(() => useChainShift(3, '2026-08-07'))
    act(() => { vi.advanceTimersByTime(2000) })
    const { result } = renderHook(() => useChainShift(3, '2026-08-07'))
    expect(result.current.isShifting).toBe(false)
    expect(result.current.index).toBe(3)
  })

  it('shifts from yesterday cog to today cog on a new day', () => {
    window.localStorage.setItem(
      CHAIN_SHIFT_STORAGE_KEY,
      JSON.stringify({ date: '2026-08-06', index: 6 }),
    )
    const { result } = renderHook(() => useChainShift(3, '2026-08-07'))
    expect(result.current.index).toBe(6)
    expect(result.current.isShifting).toBe(true)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.index).toBe(3)
    expect(result.current.isShifting).toBe(false)
  })

  it('persists today so the shift cannot replay', () => {
    window.localStorage.setItem(
      CHAIN_SHIFT_STORAGE_KEY,
      JSON.stringify({ date: '2026-08-06', index: 6 }),
    )
    renderHook(() => useChainShift(3, '2026-08-07'))
    act(() => { vi.advanceTimersByTime(1000) })
    const stored = JSON.parse(window.localStorage.getItem(CHAIN_SHIFT_STORAGE_KEY) ?? '{}')
    expect(stored).toEqual({ date: '2026-08-07', index: 3 })
  })

  it('stays still when there is no verdict to shift to', () => {
    const { result } = renderHook(() => useChainShift(null, '2026-08-07'))
    expect(result.current.index).toBeNull()
    expect(result.current.isShifting).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/cassetteMotion.test.tsx`
Expected: FAIL — cannot resolve `../motion/useCountUp`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/editorial/motion/useCountUp.ts
import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './useReveal'

/**
 * Counts 0 → target so the numeral arrives WITH the chain. Returns the target
 * unchanged under reduced motion, and passes a missing target straight through
 * so a withheld reading never animates from a number we do not have.
 */
export function useCountUp(target: number | null, durationMs: number): number | null {
  const [shown, setShown] = useState<number | null>(target)
  const frame = useRef<number | null>(null)

  useEffect(() => {
    if (target == null) { setShown(null); return }
    if (prefersReducedMotion() || durationMs <= 0) { setShown(target); return }

    const started = Date.now()
    setShown(0)
    const tick = () => {
      const t = Math.min(1, (Date.now() - started) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(Math.round(target * eased))
      if (t < 1) frame.current = window.setTimeout(tick, 16)
      else setShown(target)
    }
    frame.current = window.setTimeout(tick, 16)
    return () => { if (frame.current != null) window.clearTimeout(frame.current) }
  }, [target, durationMs])

  return shown
}
```

```ts
// frontend/src/editorial/motion/useChainShift.ts
import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './useReveal'

export const CHAIN_SHIFT_STORAGE_KEY = 'editorial.chainShift'
export const CHAIN_SHIFT_MS_PER_COG = 90
export const CHAIN_SHIFT_MAX_MS = 900

interface Stored { date: string; index: number }

function read(): Stored | null {
  try {
    const raw = window.localStorage.getItem(CHAIN_SHIFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Stored
    return typeof parsed?.date === 'string' && typeof parsed?.index === 'number' ? parsed : null
  } catch { return null }
}

function write(value: Stored): void {
  try { window.localStorage.setItem(CHAIN_SHIFT_STORAGE_KEY, JSON.stringify(value)) } catch { /* private mode */ }
}

/**
 * The morning shift: the chain travels from yesterday's cog to today's, one
 * sprocket at a time. It fires ONCE PER DAY — the stored date is what keeps it
 * an event instead of wallpaper, and what stops it replaying on every
 * navigation back to Today.
 */
export function useChainShift(
  targetIndex: number | null,
  todayIso: string,
): { index: number | null; isShifting: boolean } {
  const stored = useRef<Stored | null>(read())
  const from = stored.current != null && stored.current.date !== todayIso ? stored.current.index : null
  const shouldShift =
    targetIndex != null && from != null && from !== targetIndex && !prefersReducedMotion()

  const [index, setIndex] = useState<number | null>(shouldShift ? from : targetIndex)
  const [isShifting, setIsShifting] = useState(shouldShift)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (targetIndex == null) { setIndex(null); setIsShifting(false); return }
    if (!shouldShift) {
      setIndex(targetIndex)
      setIsShifting(false)
      write({ date: todayIso, index: targetIndex })
      return
    }

    const step = from! < targetIndex ? 1 : -1
    const cogs = Math.abs(targetIndex - from!)
    const per = Math.min(CHAIN_SHIFT_MS_PER_COG, CHAIN_SHIFT_MAX_MS / Math.max(cogs, 1))
    let current = from!

    const advance = () => {
      current += step
      setIndex(current)
      if (current === targetIndex) {
        setIsShifting(false)
        write({ date: todayIso, index: targetIndex })
      } else {
        timer.current = window.setTimeout(advance, per)
      }
    }
    timer.current = window.setTimeout(advance, per)
    return () => { if (timer.current != null) window.clearTimeout(timer.current) }
    // `from`/`shouldShift` derive from a ref read once on mount, by design:
    // the shift is a mount-time event, not a reactive binding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIndex, todayIso])

  return { index, isShifting }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/cassetteMotion.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editorial/motion/useCountUp.ts frontend/src/editorial/motion/useChainShift.ts frontend/src/editorial/__tests__/cassetteMotion.test.tsx
git commit -m "feat(cassette): the morning shift fires once a day, and never under reduced motion"
```

---

### Task 4: CassetteHero — the composed hero and its honest cases

**Files:**
- Create: `frontend/src/editorial/components/CassetteHero.tsx`
- Modify: `frontend/src/editorial/i18n/copy.ts` (add the keys below to the `COPY` object)
- Test: `frontend/src/editorial/__tests__/cassetteHero.test.tsx`

**Interfaces:**
- Consumes: `Cassette` (Task 2), `cogIndexFromReadiness` (Task 1), `useChainShift`/`useCountUp` (Task 3), `Value`/`isPresent` from `../data/value`, `useCopy` from `../i18n/useCopy`.
- Produces: default export `CassetteHero`, props
  ```ts
  export interface CassetteHeroProps {
    readiness: Value<{ score: number; deltaVsYesterday: number | null }>
    series: Value<number[]>
    best: Value<number>
    todayIso: string
    /** Rendered under the numeral, e.g. "Heute geht das 17er." */
    caption: Value<string>
  }
  ```

Copy keys to add (German first; English is the pen's register):

```ts
  cassetteVerdictReady:   { de: 'Bereit',    en: 'Ready' },
  cassetteVerdictLoaded:  { de: 'Geladen',   en: 'Loaded' },
  cassetteVerdictTired:   { de: 'Ermüdet',   en: 'Tired' },
  cassetteVerdictEmpty:   { de: 'Leer',      en: 'Empty' },
  cassetteSinceYesterday: { de: 'seit gestern', en: 'since yesterday' },
  cassetteBest:           { de: 'BEST {teeth}', en: 'BEST {teeth}' },
  cassetteCeiling:        { de: 'Deine Decke', en: 'Your ceiling' },
  cassetteCoarse:         { de: 'Noch zu wenig Historie für deinen eigenen Bereich — grobe Einordnung.', en: 'Not enough history for your own range yet — coarse placement.' },
```

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/cassetteHero.test.tsx
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import CassetteHero from '../components/CassetteHero'
import { present, missing } from '../data/value'

const series = Array.from({ length: 30 }, (_, i) => 40 + i)

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('CassetteHero', () => {
  it('shows the score, a verdict word and the chain', () => {
    render(
      <CassetteHero
        readiness={present({ score: 74, deltaVsYesterday: 8 })}
        series={present(series)}
        best={present(69)}
        todayIso="2026-08-07"
        caption={present('Heute geht das 17er.')}
      />,
    )
    // jsdom has no matchMedia, and `prefersReducedMotion()` treats "can't ask"
    // as "no preference" — so the count-up really runs here and starts at 0.
    // Let it land before asserting the number.
    act(() => { vi.advanceTimersByTime(1200) })
    expect(screen.getByTestId('cassette-hero-numeral').textContent).toContain('74')
    expect(screen.getByTestId('cassette-hero-verdict').textContent).toBeTruthy()
    expect(screen.getByTestId('cassette-chain')).toBeTruthy()
    expect(screen.getByText('Heute geht das 17er.')).toBeTruthy()
  })

  it('withholds the verdict entirely when readiness is missing', () => {
    render(
      <CassetteHero
        readiness={missing('Keine Messung seit Dienstag.')}
        series={present(series)}
        best={present(69)}
        todayIso="2026-08-07"
        caption={missing('Noch keine Einordnung.')}
      />,
    )
    expect(screen.queryByTestId('cassette-chain')).toBeNull()
    expect(screen.queryByTestId('cassette-hero-verdict')).toBeNull()
    expect(screen.getByText('Keine Messung seit Dienstag.')).toBeTruthy()
  })

  it('still draws the cassette when the reading is missing, so the frame stays', () => {
    render(
      <CassetteHero
        readiness={missing('Keine Messung seit Dienstag.')}
        series={present(series)}
        best={present(69)}
        todayIso="2026-08-07"
        caption={missing('Noch keine Einordnung.')}
      />,
    )
    expect(screen.getAllByTestId('cassette-cog')).toHaveLength(10)
  })

  it('omits the delta rather than inventing a zero', () => {
    render(
      <CassetteHero
        readiness={present({ score: 74, deltaVsYesterday: null })}
        series={present(series)}
        best={present(69)}
        todayIso="2026-08-07"
        caption={present('Heute geht das 17er.')}
      />,
    )
    expect(screen.queryByTestId('cassette-hero-delta')).toBeNull()
  })

  it('says so when the placement is coarse for lack of history', () => {
    render(
      <CassetteHero
        readiness={present({ score: 74, deltaVsYesterday: 3 })}
        series={present([50, 60, 70])}
        best={missing('Noch keine 90-Tage-Historie erfasst.')}
        todayIso="2026-08-07"
        caption={present('Heute geht das 15er.')}
      />,
    )
    expect(screen.getByTestId('cassette-hero-basis')).toBeTruthy()
    expect(screen.queryByTestId('cassette-best')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/cassetteHero.test.tsx`
Expected: FAIL — cannot resolve `../components/CassetteHero`.

- [ ] **Step 3: Write minimal implementation**

Add the eight copy keys above into the `COPY` object in `frontend/src/editorial/i18n/copy.ts`, keeping the file's existing alphabetical-ish grouping, then:

```tsx
// frontend/src/editorial/components/CassetteHero.tsx
import Cassette from './Cassette'
import { COG_TEETH, cogIndexFromReadiness, MIN_SERIES_FOR_PERCENTILE } from './cassetteScale'
import { useChainShift } from '../motion/useChainShift'
import { useCountUp } from '../motion/useCountUp'
import { useCopy } from '../i18n/useCopy'
import { isPresent, type Value } from '../data/value'

export interface CassetteHeroProps {
  readiness: Value<{ score: number; deltaVsYesterday: number | null }>
  series: Value<number[]>
  best: Value<number>
  todayIso: string
  caption: Value<string>
}

const VERDICT_KEYS = [
  'cassetteVerdictReady',
  'cassetteVerdictLoaded',
  'cassetteVerdictTired',
  'cassetteVerdictEmpty',
] as const

/** Four bands across ten cogs: 0-1 ready, 2-4 loaded, 5-7 tired, 8-9 empty. */
function verdictKey(index: number) {
  if (index <= 1) return VERDICT_KEYS[0]
  if (index <= 4) return VERDICT_KEYS[1]
  if (index <= 7) return VERDICT_KEYS[2]
  return VERDICT_KEYS[3]
}

export default function CassetteHero({ readiness, series, best, todayIso, caption }: CassetteHeroProps) {
  const { t } = useCopy()
  const values = isPresent(series) ? series.value : []

  const placement = isPresent(readiness)
    ? cogIndexFromReadiness(readiness.value.score, values)
    : null
  const bestPlacement = isPresent(best) ? cogIndexFromReadiness(best.value, values) : null

  const { index } = useChainShift(placement?.index ?? null, todayIso)
  const score = useCountUp(isPresent(readiness) ? readiness.value.score : null, 600)
  const delta = isPresent(readiness) ? readiness.value.deltaVsYesterday : null

  return (
    <div>
      <Cassette activeIndex={index} bestIndex={bestPlacement?.index ?? null} idSuffix="today" />

      {isPresent(readiness) ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 14 }}>
          <div
            data-testid="cassette-hero-numeral"
            style={{
              fontFamily: 'var(--e-display)', fontSize: 88, fontWeight: 800,
              lineHeight: 0.78, letterSpacing: '-0.05em', color: 'var(--st-active)',
            }}
          >
            {score ?? readiness.value.score}
          </div>
          <div style={{ paddingBottom: 8 }}>
            <div
              data-testid="cassette-hero-verdict"
              style={{
                fontFamily: 'var(--e-display)', fontSize: 14, fontWeight: 700,
                letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--e-ink)',
              }}
            >
              {t(verdictKey(placement!.index))}
            </div>
            {delta != null && (
              <div data-testid="cassette-hero-delta" style={{ fontSize: 11, color: 'var(--e-mid)', marginTop: 5 }}>
                <b style={{ color: 'var(--st-active)' }}>{delta > 0 ? `+${delta}` : delta}</b>{' '}
                {t('cassetteSinceYesterday')}
              </div>
            )}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--e-mid)', textAlign: 'center', padding: '0 24px' }}>
          {readiness.missing}
        </p>
      )}

      <p style={{ fontSize: 13, color: 'var(--e-mid)', padding: '12px 24px 0' }}>
        {isPresent(caption) ? caption.value : caption.missing}
      </p>

      {placement?.basis === 'decile' && (
        <p
          data-testid="cassette-hero-basis"
          style={{ fontSize: 11, color: 'var(--e-quiet)', padding: '6px 24px 0' }}
        >
          {t('cassetteCoarse')}
        </p>
      )}

      <span hidden>{COG_TEETH.length}{MIN_SERIES_FOR_PERCENTILE}</span>
    </div>
  )
}
```

Then delete the trailing `<span hidden>` line and the now-unused `COG_TEETH`/`MIN_SERIES_FOR_PERCENTILE` imports — it exists only to show that both are available; `noUnusedLocals` will reject them otherwise.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/cassetteHero.test.tsx`
Expected: PASS, 5 tests.
Then run: `cd frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editorial/components/CassetteHero.tsx frontend/src/editorial/i18n/copy.ts frontend/src/editorial/__tests__/cassetteHero.test.tsx
git commit -m "feat(cassette): the hero, and the reading it refuses to guess"
```

---

### Task 5: Expose the 90-day readiness series and yesterday's missed ride on the model

**Files:**
- Modify: `frontend/src/editorial/data/useTodayModel.ts`
- Test: `frontend/src/editorial/__tests__/useTodayModel.test.ts`

**Interfaces:**
- Consumes: existing `ninetyDayMetrics` input and `weekPlan?: WeekResponse | null`.
- Produces, on `TodayModel`:
  ```ts
  readiness90DaySeries: Value<number[]>
  missedYesterday: Value<{ title: string; dateIso: string }>
  ```

Both are additive reads of data the hook already receives — no new query, no backend change. `WeekResponse.missed_yesterday` (`frontend/src/api/weeks.ts`) is already `null` when yesterday was a planned rest day, was ridden, or had no plan, which is exactly the chain-break rule.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/editorial/__tests__/useTodayModel.test.ts`, following the file's existing harness for building inputs:

```ts
describe('reward-layer fields', () => {
  it('exposes the 90-day readiness series, not just its max', () => {
    const model = buildModel({
      ninetyDayMetrics: [
        { ...emptyMetric, training_readiness: 61 },
        { ...emptyMetric, training_readiness: null },
        { ...emptyMetric, training_readiness: 78 },
      ],
    })
    expect(isPresent(model.readiness90DaySeries)).toBe(true)
    expect(isPresent(model.readiness90DaySeries) && model.readiness90DaySeries.value).toEqual([61, 78])
  })

  it('withholds the series rather than returning an empty array', () => {
    const model = buildModel({ ninetyDayMetrics: [] })
    expect(isPresent(model.readiness90DaySeries)).toBe(false)
  })

  it('reports yesterday's skipped session when the plan says one was missed', () => {
    const model = buildModel({
      weekPlan: {
        ...emptyWeekPlan,
        missed_yesterday: {
          date: '2026-08-06', title: 'Threshold 4x8', title_de: 'Schwelle 4×8',
          target_tss: 98, template_id: null, category: 'bike', is_quality: true,
        },
      },
    })
    expect(isPresent(model.missedYesterday)).toBe(true)
    expect(isPresent(model.missedYesterday) && model.missedYesterday.value.title).toBe('Schwelle 4×8')
  })

  it('has no missed session when the plan carries none', () => {
    const model = buildModel({ weekPlan: { ...emptyWeekPlan, missed_yesterday: null } })
    expect(isPresent(model.missedYesterday)).toBe(false)
  })
})
```

If `buildModel`, `emptyMetric` or `emptyWeekPlan` do not already exist in that file, add them as thin local helpers next to the existing setup — do not restructure the file's existing tests.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/useTodayModel.test.ts`
Expected: FAIL — `readiness90DaySeries` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/editorial/data/useTodayModel.ts`, add both fields to the `TodayModel` interface with doc comments, then near the existing `readiness90DayBest` computation:

```ts
  // The percentile mapping behind the cassette needs the SERIES, not the max
  // the hero used to show. Same input array, one fewer reduction — additive,
  // no new query. Withheld (not `[]`) when there is nothing to rank against,
  // so the hero can say "coarse placement" instead of silently ranking
  // against nothing.
  const readiness90DaySeries: Value<number[]> =
    ninetyDayReadinessValues.length > 0
      ? present(ninetyDayReadinessValues)
      : missing(t('ninetyDayHistoryMissing'))

  // Yesterday's planned-but-unridden bike ride. `weeks.ts` already returns null
  // when yesterday was a planned rest day, was ridden, or had no plan — so a
  // present value here IS a broken chain, with no second rule to keep in sync.
  const missed = weekPlan?.missed_yesterday ?? null
  const missedYesterday: Value<{ title: string; dateIso: string }> = fromNullable(
    missed ? { title: missed.title_de ?? missed.title, dateIso: missed.date } : null,
    t('missedYesterdayNone'),
  )
```

and return both from the hook. Add one copy key:

```ts
  missedYesterdayNone: { de: 'Keine ausgelassene Einheit.', en: 'No skipped session.' },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/useTodayModel.test.ts`
Expected: PASS, including the four new tests.
Then: `cd frontend && npx tsc -b` → no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editorial/data/useTodayModel.ts frontend/src/editorial/i18n/copy.ts frontend/src/editorial/__tests__/useTodayModel.test.ts
git commit -m "feat(cassette): expose the readiness series and yesterday's skipped session"
```

---

### Task 6: Mount the hero in Today, all five states

**Files:**
- Modify: `frontend/src/editorial/pages/TodayView.tsx` (insert directly **after** the `<Cover …>` block that closes around line ~988)
- Modify: `frontend/src/editorial/__tests__/visualHarness.test.tsx` (fixtures gain `readiness90DaySeries` and `missedYesterday`)
- Test: `frontend/src/editorial/__tests__/cassetteToday.test.tsx`

**Interfaces:**
- Consumes: `CassetteHero` (Task 4), `readiness90DaySeries`/`missedYesterday` (Task 5).
- Produces: no new exports. `TodayView` renders `CassetteHero` as the first block of the Hero Body, for every state.

**The Cover is not touched.** Owner ruling, 2026-08-07: the editorial header keeps
the pen's treatment — background photograph, scrim, Day Rail, Meta row, headline
and the big display `MetricTrack` numeral all stay exactly as they are. The
cassette is *added below* it. Because that puts two numerals on one screen,
`CassetteHero`'s numeral drops from 88px to **56px**: the Cover owns display
scale, the cassette is an instrument reading. They never show the same quantity.

Per-state captions (add to `copy.ts`, `{teeth}` interpolated):

```ts
  cassetteCaptionAhead:  { de: 'Heute geht das {teeth}er.', en: 'The {teeth} is in you today.' },
  cassetteCaptionSpent:  { de: 'Nach der Einheit bleibt das {teeth}er.', en: 'After the session, the {teeth} is what is left.' },
  cassetteCaptionEvening:{ de: 'Morgen wieder das {teeth}er, wenn du schläfst.', en: 'The {teeth} again tomorrow, if you sleep.' },
```

`rest`, `training`, `resting` → `cassetteCaptionAhead`. `trained` → `cassetteCaptionSpent`. `evening` → `cassetteCaptionEvening`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/cassetteToday.test.tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach } from 'vitest'
import TodayView from '../pages/TodayView'
import type { DayState } from '../state/dayState'
import { makeTodayModel } from './helpers/makeTodayModel'

const STATES: DayState[] = ['rest', 'training', 'trained', 'resting', 'evening']

beforeEach(() => window.localStorage.clear())

describe('Today mounts the cassette', () => {
  it.each(STATES)('renders the cassette in %s', (state) => {
    render(
      <MemoryRouter>
        <TodayView model={makeTodayModel({ state })} />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('cassette')).toBeTruthy()
    expect(screen.getByTestId('cassette-chain')).toBeTruthy()
  })

  it.each(STATES)('keeps the pen Cover — photo and display numeral — in %s', (state) => {
    const { container } = render(
      <MemoryRouter>
        <TodayView model={makeTodayModel({ state })} />
      </MemoryRouter>,
    )
    // The Cover's background photograph and its own big numeral are the pen's
    // header treatment and survive this task untouched. `[data-photo]` is the
    // attribute Cover.tsx already puts on its photo layer (Cover.tsx:134).
    expect(container.querySelector('[data-photo]')).toBeTruthy()
    expect(container.querySelector('[data-testid="hero-numeral"]')).toBeTruthy()
  })

  it('keeps the cassette numeral below the Cover numeral in scale', () => {
    const { container } = render(
      <MemoryRouter>
        <TodayView model={makeTodayModel({ state: 'training' })} />
      </MemoryRouter>,
    )
    const px = (el: Element | null) => Number((el as HTMLElement)?.style.fontSize.replace('px', '') || 0)
    expect(px(container.querySelector('[data-testid="cassette-hero-numeral"]')))
      .toBeLessThan(px(container.querySelector('[data-testid="hero-numeral"]')))
  })

  it('drops the chain to a bigger cog once the day is ridden', () => {
    const cogOf = (state: DayState) => {
      const { unmount } = render(
        <MemoryRouter>
          <TodayView model={makeTodayModel({ state, readinessScore: state === 'trained' ? 41 : 74 })} />
        </MemoryRouter>,
      )
      const width = Number(screen.getByTestId('cassette-chain').getAttribute('width'))
      unmount()
      window.localStorage.clear()
      return width
    }
    // A bigger cog is a wider rect: what is left after the session.
    expect(cogOf('trained')).toBeGreaterThan(cogOf('training'))
  })
})
```

Create `frontend/src/editorial/__tests__/helpers/makeTodayModel.ts` exporting `makeTodayModel(overrides: { state: DayState; readinessScore?: number }): TodayModel`, built by copying the `model` fixture that already exists in `visualHarness.test.tsx` and parameterising `state` and `readiness`. Include the two new fields from Task 5.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/cassetteToday.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="cassette"]`.

- [ ] **Step 3: Write minimal implementation**

Three edits, all additive:

1. In `frontend/src/editorial/components/MetricTrack.tsx`, add `data-testid="hero-numeral"` to the element that renders the numeral. Nothing else in that file changes — this is the handle the scale test needs, and it is the only reason to touch the file.

2. In `TodayView.tsx`, immediately **after** the closing `</Cover>` (~line 988) and before the Hero Body's existing first child, insert:

```tsx
<CassetteHero
  readiness={model.readiness}
  series={model.readiness90DaySeries}
  best={model.readiness90DayBest}
  todayIso={new Date().toISOString().slice(0, 10)}
  caption={cassetteCaption}
/>
```

3. Compute `cassetteCaption` next to the existing per-state hero derivations (~line 197), using `mapValue` over `model.readiness` and the state's caption key, interpolating `{teeth}` from `COG_TEETH[cogIndexFromReadiness(score, series).index]`.

Everything inside `<Cover>` — the photograph, the scrim, the Day Rail, the Meta row, the headline and the `MetricTrack` display numeral — stays exactly as it is. In `CassetteHero.tsx`, change the numeral's `fontSize` from `88` to `56` so the Cover keeps display scale.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/cassetteToday.test.tsx`
Expected: PASS.
Then the full editorial suite: `cd frontend && npx vitest run src/editorial` → all green, including `isolation.test.ts`.

- [ ] **Step 5: Look at all five states**

```bash
cd frontend
HARNESS_OUT=/tmp/cass.html npx vitest run src/editorial/__tests__/visualHarness.test.tsx
python3 -m http.server 8971 --directory /tmp &
```
Open each of `/tmp/cass.html`, `cass.rest.html`, `cass.training.html`, `cass.resting.html`, `cass.evening.html` at 390×844 and screenshot. A state is not done until its frame has been looked at. Compare against `docs/superpowers/specs/2026-08-07-today-cassette-reward-layer-design.md` §1.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/editorial/pages/TodayView.tsx frontend/src/editorial/components frontend/src/editorial/i18n/copy.ts frontend/src/editorial/__tests__
git commit -m "feat(cassette): Today leads with the gear you can push, in all five states"
```

---

### Task 7: BentoTile and the one-highlighted-point rule

**Files:**
- Create: `frontend/src/editorial/components/BentoTile.tsx`
- Test: `frontend/src/editorial/__tests__/bentoTile.test.tsx`

**Interfaces:**
- Consumes: `Value`/`isPresent`.
- Produces:
  ```ts
  export type TileChart =
    | { kind: 'spark'; points: number[]; highlightIndex: number; star?: boolean }
    | { kind: 'bars'; points: number[]; highlightIndex: number; star?: boolean }
    | { kind: 'band'; low: number; high: number; today: number }
  export interface BentoTileProps {
    label: string
    value: Value<{ text: string; unit?: string }>
    chart: Value<TileChart>
    note?: string
    accent?: boolean
    tall?: boolean
    onExpand?: () => void
  }
  ```
  Test ids: `bento-tile`, `bento-tile-value`, `bento-tile-missing`, `bento-chart-point` (one per point), `bento-chart-highlight`, `bento-chart-star`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/bentoTile.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import BentoTile from '../components/BentoTile'
import { present, missing } from '../data/value'

describe('BentoTile', () => {
  it('highlights exactly one point and leaves the rest neutral', () => {
    render(
      <BentoTile
        label="HRV"
        value={present({ text: '68', unit: 'ms' })}
        chart={present({ kind: 'spark', points: [60, 62, 59, 65, 68], highlightIndex: 4 })}
      />,
    )
    expect(screen.getAllByTestId('bento-chart-point')).toHaveLength(5)
    expect(screen.getAllByTestId('bento-chart-highlight')).toHaveLength(1)
  })

  it('stars a record on the highlighted point only', () => {
    render(
      <BentoTile
        label="HRV"
        value={present({ text: '68', unit: 'ms' })}
        chart={present({ kind: 'bars', points: [1, 2, 3], highlightIndex: 2, star: true })}
      />,
    )
    expect(screen.getAllByTestId('bento-chart-star')).toHaveLength(1)
  })

  it('renders an em-dash and the reason when the value is missing', () => {
    render(
      <BentoTile
        label="Body Battery"
        value={missing('Keine Messung seit Dienstag.')}
        chart={missing('Keine Messung seit Dienstag.')}
      />,
    )
    expect(screen.getByTestId('bento-tile-value').textContent).toBe('—')
    expect(screen.getByText('Keine Messung seit Dienstag.')).toBeTruthy()
  })

  it('never draws a zeroed chart in place of missing data', () => {
    render(
      <BentoTile
        label="Body Battery"
        value={missing('Keine Messung seit Dienstag.')}
        chart={missing('Keine Messung seit Dienstag.')}
      />,
    )
    expect(screen.queryAllByTestId('bento-chart-point')).toHaveLength(0)
  })

  it('marks itself as the accented tile when asked', () => {
    render(
      <BentoTile
        label="HRV" accent
        value={present({ text: '68', unit: 'ms' })}
        chart={present({ kind: 'spark', points: [1, 2], highlightIndex: 1 })}
      />,
    )
    expect(screen.getByTestId('bento-tile').getAttribute('data-accent')).toBe('true')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/bentoTile.test.tsx`
Expected: FAIL — cannot resolve `../components/BentoTile`.

- [ ] **Step 3: Write minimal implementation**

Implement `BentoTile.tsx` rendering:
- a container `<div data-testid="bento-tile" data-accent={String(!!accent)}>` with `background: accent ? 'var(--st-active)' : 'var(--e-glass)'`, `border: 1px solid var(--e-rule)` (none when accented), `borderRadius: 18`, `gridRow: tall ? 'span 2' : undefined`;
- the label in the 9.5px/0.16em uppercase caps style;
- the value at `var(--e-display)` 34px (44px when `tall`), or `—` plus the reason in a `<p>` when missing;
- the chart, only when present — the highlight rule is the whole point of the component, so it is written out here rather than described:

```tsx
function TileChartView({ chart, accent }: { chart: TileChart; accent?: boolean }) {
  const neutral = accent ? '#04120B59' : 'var(--d-2)'
  const hot = accent ? '#04120B' : 'var(--st-active)'
  const W = 130, H = 30

  if (chart.kind === 'band') {
    const span = Math.max(chart.high - chart.low, 1)
    const x = ((chart.today - chart.low) / span) * W
    return (
      <svg width={W} height={H} aria-hidden="true">
        <rect x={0} y={H / 2 - 1} width={W} height={2} rx={1} fill={neutral} />
        <circle data-testid="bento-chart-point" data-highlight cx={Math.max(3, Math.min(W - 3, x))} cy={H / 2} r={4} fill={hot} />
        <circle data-testid="bento-chart-highlight" cx={Math.max(3, Math.min(W - 3, x))} cy={H / 2} r={4} fill={hot} />
      </svg>
    )
  }

  const max = Math.max(...chart.points, 1)
  const step = W / Math.max(chart.points.length - 1, 1)
  const y = (v: number) => H - (v / max) * (H - 6) - 3

  return (
    <svg width={W} height={H} aria-hidden="true">
      {chart.kind === 'spark' && (
        <polyline
          points={chart.points.map((v, i) => `${i * step},${y(v)}`).join(' ')}
          fill="none" stroke={neutral} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        />
      )}
      {chart.points.map((v, i) => {
        const isHot = i === chart.highlightIndex
        const common = { fill: isHot ? hot : neutral }
        return (
          <g key={i}>
            {chart.kind === 'bars' ? (
              <rect
                data-testid="bento-chart-point" x={i * (W / chart.points.length)} y={y(v)}
                width={Math.max(W / chart.points.length - 4, 2)} height={H - y(v) - 2} rx={2} {...common}
              />
            ) : (
              <circle data-testid="bento-chart-point" cx={i * step} cy={y(v)} r={isHot ? 4 : 0} {...common} />
            )}
            {isHot && <circle data-testid="bento-chart-highlight" cx={i * step} cy={y(v)} r={4} {...common} />}
            {isHot && chart.star && (
              <text data-testid="bento-chart-star" x={i * step} y={y(v) - 7} fontSize={9} textAnchor="middle" fill={hot}>★</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
```

- an `onClick={onExpand}` on the container when `onExpand` is given, with `touchTarget` from `../motion/touchTarget` applied so the hit area clears the minimum;
- the sparkline draws in **after** its tile lands: apply `staggerDelay(index)` and `MOTION_EASE` from `../motion/useReveal` at the grid level (Task 8) rather than inside the tile, so one wave owns the timing.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/bentoTile.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editorial/components/BentoTile.tsx frontend/src/editorial/__tests__/bentoTile.test.tsx
git commit -m "feat(bento): a tile whose chart argues one point instead of drawing seven"
```

---

### Task 8: BentoGrid — size and colour earned by the reasoning

**Files:**
- Create: `frontend/src/editorial/components/BentoGrid.tsx`
- Modify: `frontend/src/editorial/pages/TodayView.tsx` (mount under `CassetteHero`)
- Test: `frontend/src/editorial/__tests__/bentoGrid.test.tsx`

**Interfaces:**
- Consumes: `BentoTile`, `BentoTileProps` (Task 7).
- Produces:
  ```ts
  export interface BentoEntry extends Omit<BentoTileProps, 'accent' | 'tall'> {
    /** Stable id, matched case-insensitively against the coach's reason text. */
    key: string
  }
  export function rankTiles(entries: BentoEntry[], reason: string | null): BentoTileProps[]
  export default function BentoGrid(props: { entries: BentoEntry[]; reason: string | null }): JSX.Element
  ```
  `rankTiles` returns the entries reordered so the reason's metric is first, with `tall: true` and `accent: true` on exactly that one and on no other. With no reason, or a reason naming nothing, the first entry gets both — never zero, never two.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/bentoGrid.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import BentoGrid, { rankTiles, type BentoEntry } from '../components/BentoGrid'
import { present } from '../data/value'

const entry = (key: string, label: string): BentoEntry => ({
  key, label,
  value: present({ text: '1' }),
  chart: present({ kind: 'spark', points: [1, 2], highlightIndex: 1 }),
})

const entries = [entry('hrv', 'HRV'), entry('sleep', 'Schlaf'), entry('rhr', 'Ruhepuls')]

describe('rankTiles', () => {
  it('promotes the metric the reasoning keys off', () => {
    const ranked = rankTiles(entries, 'Schlaf war kurz — deshalb heute locker.')
    expect(ranked[0].label).toBe('Schlaf')
    expect(ranked[0].tall).toBe(true)
    expect(ranked[0].accent).toBe(true)
  })

  it('accents exactly one tile, always', () => {
    for (const reason of ['Schlaf war kurz.', 'HRV oben.', 'kein Treffer', null]) {
      const ranked = rankTiles(entries, reason)
      expect(ranked.filter((t) => t.accent)).toHaveLength(1)
      expect(ranked.filter((t) => t.tall)).toHaveLength(1)
    }
  })

  it('falls back to the first entry when the reason names nothing', () => {
    expect(rankTiles(entries, 'nichts Passendes').at(0)?.label).toBe('HRV')
  })

  it('keeps every tile — ranking reorders, it never drops', () => {
    expect(rankTiles(entries, 'Ruhepuls unten.')).toHaveLength(3)
  })
})

describe('BentoGrid', () => {
  it('renders every tile', () => {
    render(<BentoGrid entries={entries} reason="HRV oben." />)
    expect(screen.getAllByTestId('bento-tile')).toHaveLength(3)
  })

  it('renders exactly one accented tile', () => {
    render(<BentoGrid entries={entries} reason="HRV oben." />)
    const accented = screen.getAllByTestId('bento-tile').filter((t) => t.getAttribute('data-accent') === 'true')
    expect(accented).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/bentoGrid.test.tsx`
Expected: FAIL — cannot resolve `../components/BentoGrid`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// frontend/src/editorial/components/BentoGrid.tsx
import BentoTile, { type BentoTileProps } from './BentoTile'

export interface BentoEntry extends Omit<BentoTileProps, 'accent' | 'tall'> {
  key: string
}

/**
 * Size and colour are EARNED: the metric the coach's own reason keys off gets
 * the double-height, accented tile, so the grid changes shape day to day. The
 * "exactly one accent" invariant is the whole point — two accents and the eye
 * has nowhere to land first.
 */
export function rankTiles(entries: BentoEntry[], reason: string | null): BentoTileProps[] {
  const haystack = (reason ?? '').toLowerCase()
  const leadIndex = entries.findIndex(
    (e) => haystack.includes(e.key.toLowerCase()) || haystack.includes(e.label.toLowerCase()),
  )
  const lead = leadIndex >= 0 ? leadIndex : 0
  const ordered = [entries[lead], ...entries.filter((_, i) => i !== lead)]
  return ordered.map(({ key: _key, ...tile }, i) => ({ ...tile, accent: i === 0, tall: i === 0 }))
}

export default function BentoGrid({ entries, reason }: { entries: BentoEntry[]; reason: string | null }) {
  if (entries.length === 0) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '26px 24px 0' }}>
      {rankTiles(entries, reason).map((tile, i) => (
        <BentoTile key={`${tile.label}-${i}`} {...tile} />
      ))}
    </div>
  )
}
```

Then mount it in `TodayView.tsx` directly under `CassetteHero`, building entries from `model.hrv`, `model.sleep`, `model.restingHr` (and `model.bodyBattery` when present), passing the coach's reason string the view already has.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/bentoGrid.test.tsx`
Expected: PASS, 6 tests.
Then: `cd frontend && npx vitest run src/editorial && npx tsc -b`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editorial/components/BentoGrid.tsx frontend/src/editorial/pages/TodayView.tsx frontend/src/editorial/__tests__/bentoGrid.test.tsx
git commit -m "feat(bento): the grid reshapes around whatever the coach actually reasoned from"
```

---

### Task 9: Die Kette — the streak, the break and XP

**Files:**
- Create: `frontend/src/editorial/components/KetteStrip.tsx`
- Modify: `frontend/src/editorial/pages/TodayView.tsx` (mount above the TabBar)
- Modify: `frontend/src/editorial/i18n/copy.ts`
- Test: `frontend/src/editorial/__tests__/kette.test.tsx`

**Interfaces:**
- Consumes: `model.streakDays`, `model.weekLoad`, `model.missedYesterday` (Task 5).
- Produces:
  ```ts
  export interface KetteStripProps {
    streakDays: Value<number>
    weekLoad: Value<{ spent: number; planned: number }>
    missedYesterday: Value<{ title: string; dateIso: string }>
  }
  ```
  Test ids: `kette`, `kette-count`, `kette-broken`, `kette-xp`, `kette-segment` (10).

Copy keys:

```ts
  ketteHolds:  { de: 'Heute fahren hält die Kette bei {days} Tagen.', en: 'Riding today holds the chain at {days} days.' },
  ketteBroken: { de: 'Die Kette ist gerissen — {title} ausgelassen.', en: 'The chain broke — {title} skipped.' },
  ketteXp:     { de: '{spent} / {planned} XP', en: '{spent} / {planned} XP' },
```

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/kette.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import KetteStrip from '../components/KetteStrip'
import { present, missing } from '../data/value'

const intact = {
  streakDays: present(13),
  weekLoad: present({ spent: 640, planned: 800 }),
  missedYesterday: missing('Keine ausgelassene Einheit.'),
}

describe('KetteStrip', () => {
  it('shows the streak when the chain is intact', () => {
    render(<KetteStrip {...intact} />)
    expect(screen.getByTestId('kette-count').textContent).toContain('13')
    expect(screen.queryByTestId('kette-broken')).toBeNull()
  })

  it('shows the break, naming what was skipped', () => {
    render(
      <KetteStrip
        {...intact}
        missedYesterday={present({ title: 'Schwelle 4×8', dateIso: '2026-08-06' })}
      />,
    )
    expect(screen.getByTestId('kette-broken').textContent).toContain('Schwelle 4×8')
  })

  it('fills XP segments in proportion to planned load completed', () => {
    render(<KetteStrip {...intact} />)
    const filled = screen.getAllByTestId('kette-segment').filter((s) => s.getAttribute('data-filled') === 'true')
    expect(filled).toHaveLength(8) // 640/800 = 80% of ten segments
  })

  it('withholds the XP bar rather than dividing by a missing target', () => {
    render(<KetteStrip {...intact} weekLoad={missing('Kein Wochenplan.')} />)
    expect(screen.queryByTestId('kette-xp')).toBeNull()
    expect(screen.getByText('Kein Wochenplan.')).toBeTruthy()
  })

  it('does not divide by zero when the plan has no target', () => {
    render(<KetteStrip {...intact} weekLoad={present({ spent: 100, planned: 0 })} />)
    const filled = screen.getAllByTestId('kette-segment').filter((s) => s.getAttribute('data-filled') === 'true')
    expect(filled).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/kette.test.tsx`
Expected: FAIL — cannot resolve `../components/KetteStrip`.

- [ ] **Step 3: Write minimal implementation**

Implement `KetteStrip.tsx`. The container is `<div data-testid="kette">` styled `border: 1px solid var(--e-rule)`, `borderRadius: 18`, `padding: '14px 16px'`, `margin: '26px 24px 34px'`. The body:

```tsx
const SEGMENTS = 10

export default function KetteStrip({ streakDays, weekLoad, missedYesterday }: KetteStripProps) {
  const { t } = useCopy()
  const broken = isPresent(missedYesterday)

  // A missing target cannot be divided into; a zero target is not an error
  // either — a plan can exist with nothing prescribed yet. Both mean no fill,
  // never a NaN and never a full bar.
  const filled = isPresent(weekLoad) && weekLoad.value.planned > 0
    ? Math.max(0, Math.min(SEGMENTS, Math.round((weekLoad.value.spent / weekLoad.value.planned) * SEGMENTS)))
    : 0

  return (
    <div data-testid="kette" style={{ /* container styles above */ }}>
      {broken ? (
        <p data-testid="kette-broken" style={{ fontSize: 12, color: 'var(--s-low)' }}>
          {t('ketteBroken', { title: missedYesterday.value.title })}
        </p>
      ) : (
        <p data-testid="kette-count" style={{ fontSize: 12, color: 'var(--e-mid)' }}>
          {t('ketteHolds', { days: String(isPresent(streakDays) ? streakDays.value : 0) })}
        </p>
      )}

      {isPresent(weekLoad) ? (
        <>
          <div data-testid="kette-xp" style={{ fontSize: 10.5, color: 'var(--e-quiet)', marginTop: 8 }}>
            {t('ketteXp', {
              spent: weekLoad.value.spent.toLocaleString('de-DE'),
              planned: weekLoad.value.planned.toLocaleString('de-DE'),
            })}
          </div>
          <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <i
                key={i}
                data-testid="kette-segment"
                data-filled={String(i < filled)}
                style={{
                  height: 8, flex: 1, borderRadius: 2,
                  background: i < filled ? 'var(--st-active)' : 'var(--d-1)',
                }}
              />
            ))}
          </div>
        </>
      ) : (
        <p style={{ fontSize: 10.5, color: 'var(--e-quiet)', marginTop: 8 }}>{weekLoad.missing}</p>
      )}
    </div>
  )
}
```

Note the streak fallback: when `streakDays` is missing, render the strip's own missing reason instead of `0` — replace the `: 0` above with a branch that renders `streakDays.missing` in the quiet style, matching every other honest-dash site in this tree.

Mount it in `TodayView.tsx` above the TabBar wrap, passing the three model fields.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/kette.test.tsx`
Expected: PASS, 5 tests.
Then the whole suite plus types: `cd frontend && npx vitest run src/editorial && npx tsc -b && npm run build`.

- [ ] **Step 5: Look at it, then commit**

Re-run the harness from Task 6 Step 5 and screenshot all five states at 390×844 one final time. Then:

```bash
git add frontend/src/editorial/components/KetteStrip.tsx frontend/src/editorial/pages/TodayView.tsx frontend/src/editorial/i18n/copy.ts frontend/src/editorial/__tests__/kette.test.tsx
git commit -m "feat(kette): the chain is the streak, and a skipped session snaps it"
```

---

## Deferred, deliberately

- **Session Detail and Recap** inherit these primitives in a later pass (spec §Non-goals).
- **The record bloom** (`BEST` marker animating up a cog) needs a stored previous best to detect the change; it lands with the Recap pass, where the record is actually discovered. The marker itself ships in Task 2.
- **Tap-to-expand on a tile** ships as the `onExpand` seam in Task 7; wiring it to the full scrubbable chart reuses `useScrub` and belongs with the chart surface, not this pass.
- **An estimated post-ride drop** (`geschätzt`) was cut from the spec during planning: the cassette renders only measured readiness, so nothing here invents a number. See spec §1, "Post-ride before the next sync".
