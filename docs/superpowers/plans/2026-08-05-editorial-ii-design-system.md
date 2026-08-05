# EDITORIAL II Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete second design system — a 1:1 transcription of the pen's EDITORIAL II flagship screens — mounted alongside the existing app at `/e/*`, switchable at runtime, with no existing page, component, hook, or endpoint deleted or modified.

**Architecture:** Everything new lives under `frontend/src/editorial/`, a one-way-dependent tree: it imports from `api/`, `hooks/`, `utils/`, `contexts/`; nothing outside it imports from it. Tokens are CSS custom properties scoped under `.editorial-root` so they cannot leak. Every displayed value passes through a single `Value<T>` primitive so a missing reading renders `—` in its designed slot instead of a hidden section or an invented number. Screens are transcribed from the pen node tree, not from screenshots.

**Tech Stack:** React 19 + TypeScript, react-router, TanStack Query (all data via existing hooks), plain CSS custom properties + CSS modules-free scoped classnames, vitest + jsdom + @testing-library/react, Pencil MCP (`mcp__pencil__*`) as the design source of truth.

**Source spec:** `docs/superpowers/specs/2026-08-05-editorial-ii-design-system-design.md`. Read it before Task 1. Where this plan and the spec disagree on a data source, this plan wins — it was grounded against the real API types (see Task 6 note).

## Global Constraints

- **Mobile only.** Every screen is designed and verified at **390×844**. Desktop is a sanity check, never a deliverable.
- **Pen file:** `~/Downloads/pencil-new.pen`. Frames prefixed `Flagship · … · EDITORIAL II`. Access **only** via `mcp__pencil__*` tools — never `Read`/`Grep` on `.pen`.
- **Transcription rule:** for every screen, call `mcp__pencil__execute` with `Get(<nodeId>, {depth: 12, resolveInstances: true, resolveVariables: false})` and transcribe padding / gap / fontSize / fontWeight / letterSpacing / fill / cornerRadius / stroke / effect **verbatim**. Never eyeball a spec from a screenshot.
- **No new endpoints, no backend changes, no modifications to existing hooks.** `editorial/` consumes them read-only.
- **Only two files under `frontend/src/` outside `editorial/` may change:** `frontend/src/App.tsx` (route registration + root redirect) and, if and only if `npm run lint:i18n` demands it, `frontend/scripts/i18n-allowlist.json`. If any other file under `frontend/src/` needs to change, stop and ask. (This bounds application code only. The plan and spec documents under `docs/` are living records — the controller amends them when a review or a human ruling changes a requirement, and those commits will appear in review diffs.)
- **Test conventions — this repo has no `@testing-library/jest-dom` and no vitest `globals`.** Do not add either; both would change files outside `editorial/`. That means:
  - jest-dom matchers are unavailable. Use `expect(el.getAttribute('href')).toBe('/e/train')`, not `toHaveAttribute`. Use `expect(el).not.toBeNull()` / `toBeTruthy()`, not `toBeInTheDocument`.
  - There is no auto-cleanup between tests. Every component test file must `import { cleanup } from '@testing-library/react'` and `import { afterEach } from 'vitest'`, then call `afterEach(cleanup)` at the top level — matching `src/hooks/__tests__/useRehearseRoute.test.tsx:11`. Without it, a second `render()` in the same file makes `screen.getByText` throw on duplicate matches.
  - `npm run lint` runs eslint with `@typescript-eslint/no-unused-vars` and **no `argsIgnorePattern`** — a leading underscore does NOT exempt an unused parameter. Do not write `_foo` for signature symmetry; drop the parameter.
  - Import from `vitest` explicitly in every test file — and import only what you use: `frontend/tsconfig.app.json` sets `noUnusedLocals: true`, so an unused import fails `tsc -b` and therefore the build.
- **Tokens are scoped.** All EDITORIAL II custom properties are declared under `.editorial-root`, never `:root`.
- **No Playwright, no browser sessions.** Gates are `npx tsc -b`, `npm run build`, `npm run test`, `npm run lint`, `npm run lint:i18n` — all run from `frontend/`. Visual check is **one** rendered frame per screen (via the existing dev server) compared against `mcp__pencil__get_screenshot` of the same node.
- **`npx tsc --noEmit` at the repo root is a no-op.** Always use `cd frontend && npx tsc -b`.
- **i18n lint:** `npm run lint:i18n` scans `src/**/*.tsx` for hardcoded English words (`Tomorrow`, `Best`, `Add`, `Start`, `Loading`, day/month names). Pen copy is English and uppercase (`TOMORROW`) — uppercase does not trip the case-sensitive matcher, but title-case does. Any legitimate finding goes in `frontend/scripts/i18n-allowlist.json` as `"editorial/pages/TodayPage.tsx::Tomorrow"`. Do not localize EDITORIAL II copy; it is a design transcription.
- **Tests live at** `src/**/__tests__/**/*.test.{ts,tsx}` or vitest will not collect them.
- **Missing-data rule:** a section is never hidden and never filled with a plausible number. `—` in the designed slot plus one quiet line naming the reason, in the calm register (`No wearable reading since Tue.`).
- **`utils/readinessGate.ts` still governs.** A stale wearable reading withholds the verdict and dates the measurement.
- **Commit after every task**, message prefix `feat(editorial):` / `test(editorial):` / `chore(editorial):`. Co-author trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility |
|---|---|
| `editorial/tokens.css` | All EDITORIAL II custom properties, scoped under `.editorial-root`. Nothing else. |
| `editorial/EditorialRoot.tsx` | Shell: applies `.editorial-root`, page ground, scroll container, safe-area insets, sheet portal target. |
| `editorial/data/value.ts` | `Value<T>` primitive + constructors + `isPresent` guard. The one honest-dash contract. |
| `editorial/state/dayState.ts` | `DayState` union, pure `deriveDayState()`, override read/write (per-ISO-date localStorage). No React. |
| `editorial/state/useDayState.ts` | Hook: derived-or-overridden state + override setter + dev picker override. |
| `editorial/state/designSystem.ts` | `localStorage["designSystem"]` read/write + `?ds=` query parsing. No React. |
| `editorial/data/useTodayModel.ts` | One view-model for all five Today states, assembled from existing hooks. Returns `Value<T>` everywhere. |
| `editorial/data/useSessionModel.ts` | Session Detail view-model. |
| `editorial/components/*.tsx` | One transcribed pen component per file. Presentational only — they accept `Value<T>`, never fetch. |
| `editorial/pages/TodayPage.tsx` | Spine + per-state hero and sections. |
| `editorial/pages/SessionDetailPage.tsx` | Session Detail screen. |
| `editorial/pages/NotInThisSystem.tsx` | Honest plate for Train / Recovery / History / Social. |

Components are presentational and data-free by rule. If a component imports from `hooks/`, that is a bug: the view-model layer is the only place data enters.

---

## Task 1: The `Value<T>` primitive

**Files:**
- Create: `frontend/src/editorial/data/value.ts`
- Test: `frontend/src/editorial/__tests__/value.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Value<T> = { value: T } | { missing: string }`; `present<T>(v: T): Value<T>`; `missing<T>(reason: string): Value<T>`; `fromNullable<T>(v: T | null | undefined, reason: string): Value<T>`; `isPresent<T>(v: Value<T>): v is { value: T }`; `mapValue<A, B>(v: Value<A>, f: (a: A) => B): Value<B>`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/editorial/__tests__/value.test.ts
import { describe, expect, it } from 'vitest'
import { fromNullable, isPresent, mapValue, missing, present } from '../data/value'

describe('Value<T>', () => {
  it('present carries the value', () => {
    const v = present(42)
    expect(isPresent(v)).toBe(true)
    if (isPresent(v)) expect(v.value).toBe(42)
  })

  it('missing carries the reason and is not present', () => {
    const v = missing<number>('No wearable reading since Tue.')
    expect(isPresent(v)).toBe(false)
    expect(v).toEqual({ missing: 'No wearable reading since Tue.' })
  })

  it('fromNullable turns null and undefined into missing', () => {
    expect(isPresent(fromNullable(null, 'why'))).toBe(false)
    expect(isPresent(fromNullable(undefined, 'why'))).toBe(false)
  })

  it('fromNullable keeps falsy-but-real values', () => {
    const zero = fromNullable(0, 'why')
    expect(isPresent(zero)).toBe(true)
    if (isPresent(zero)) expect(zero.value).toBe(0)
  })

  it('mapValue transforms present and passes missing through untouched', () => {
    expect(mapValue(present(2), (n) => n * 3)).toEqual({ value: 6 })
    expect(mapValue(missing<number>('r'), (n) => n * 3)).toEqual({ missing: 'r' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/value.test.ts`
Expected: FAIL — cannot resolve `../data/value`.

- [ ] **Step 3: Write the implementation**

```ts
// frontend/src/editorial/data/value.ts
/**
 * The honest-dash primitive. Every adapter returns Value<T>; every display
 * component knows how to render both arms. A component that receives a raw
 * number where a Value belongs is a bug, not a shortcut — the frame always
 * stays, and a reading we do not have renders "—" plus a reason.
 */
export type Value<T> = { value: T } | { missing: string }

export function present<T>(value: T): Value<T> {
  return { value }
}

export function missing<T>(reason: string): Value<T> {
  return { missing: reason }
}

export function fromNullable<T>(v: T | null | undefined, reason: string): Value<T> {
  return v === null || v === undefined ? { missing: reason } : { value: v }
}

export function isPresent<T>(v: Value<T>): v is { value: T } {
  return 'value' in v
}

export function mapValue<A, B>(v: Value<A>, f: (a: A) => B): Value<B> {
  return isPresent(v) ? { value: f(v.value) } : v
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/value.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editorial/data/value.ts frontend/src/editorial/__tests__/value.test.ts
git commit -m "feat(editorial): the Value primitive that makes missing data honest"
```

---

## Task 2: Tokens

**Files:**
- Create: `frontend/src/editorial/tokens.css`
- Test: `frontend/src/editorial/__tests__/tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties under `.editorial-root`, listed below. Every later component references them as `var(--e-acid)` etc. and declares no raw hex.

- [ ] **Step 1: Confirm the token values against the pen**

Run `mcp__pencil__get_app_state({ include_schema: true, include_canvas_design: true, include_scripts_and_shaders: false, include_browser: false })` and read the document variables. If any value below disagrees with the pen, **the pen wins** — update the CSS and note the correction in the commit body.

- [ ] **Step 2: Write the failing test**

```ts
// frontend/src/editorial/__tests__/tokens.test.ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(path.join(__dirname, '..', 'tokens.css'), 'utf8')

describe('EDITORIAL II tokens', () => {
  it('declares every token under .editorial-root only', () => {
    expect(css).toContain('.editorial-root')
    expect(css).not.toMatch(/^:root/m)
  })

  it('carries the pen palette verbatim', () => {
    const expected: Record<string, string> = {
      '--e-bg': '#08090C', '--e-ink': '#FFFFFF', '--e-mid': '#8A9099',
      '--e-lo': '#4A5058', '--e-quiet': '#767D87', '--e-acid': '#C8FF00',
      '--e-rule': '#FFFFFF1F', '--e-glass': '#FFFFFF0F', '--e-cool': '#6B8CFF',
      '--e-warn': '#FF9F1C', '--e-bad': '#FF4D4D',
      '--st-rest': '#C8FF00', '--st-training': '#2BE68F', '--st-trained': '#FF5E00',
      '--st-resting': '#00E5FF', '--st-evening': '#7B5CFF',
      '--m-hrv': '#00E5FF', '--m-sleep': '#ED29FF', '--m-cardiac': '#FF47B2',
      '--m-load': '#FF5E00', '--m-form': '#A8D400', '--m-fatigue': '#7099EB',
      '--s-good': '#2BE68F', '--s-mid': '#FFB020', '--s-low': '#FF4356',
    }
    for (const [name, hex] of Object.entries(expected)) {
      expect(css).toMatch(new RegExp(`${name}\\s*:\\s*${hex}\\b`, 'i'))
    }
  })

  it('carries the pen-verified per-state grounds', () => {
    const grounds: Record<string, string> = {
      '--g-rest': '#0A0B05', '--g-training': '#05100A', '--g-trained': '#120B05',
      '--g-resting': '#051012', '--g-evening': '#0A0816', '--g-session': '#05100A',
    }
    for (const [name, hex] of Object.entries(grounds)) {
      expect(css).toMatch(new RegExp(`${name}\\s*:\\s*${hex}\\b`, 'i'))
    }
  })

  it('carries the depth ramp verbatim', () => {
    // Pen-verified (2026-08-05): the pen's ramp is NOT evenly stepped, and
    // d-2..d-4 differ from this plan's first draft. These are the pen's.
    const ramp: Record<string, string> = {
      '--d-1': '#FFFFFF14', '--d-2': '#FFFFFF2B',
      '--d-3': '#FFFFFF4D', '--d-4': '#FFFFFF8C',
    }
    for (const [name, hex] of Object.entries(ramp)) {
      expect(css).toMatch(new RegExp(`${name}\\s*:\\s*${hex}\\b`, 'i'))
    }
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/tokens.test.ts`
Expected: FAIL — `ENOENT` on `tokens.css`.

- [ ] **Step 4: Write the tokens**

```css
/* frontend/src/editorial/tokens.css
 * EDITORIAL II. Scoped under .editorial-root so nothing leaks into the
 * existing app's :root palette. Values transcribed from the pen document's
 * variables — do not "improve" them. */
.editorial-root {
  --e-bg: #08090C;
  --e-ink: #FFFFFF;
  --e-mid: #8A9099;
  --e-lo: #4A5058;
  --e-quiet: #767D87;
  --e-acid: #C8FF00;
  --e-rule: #FFFFFF1F;
  --e-glass: #FFFFFF0F;
  --e-cool: #6B8CFF;
  --e-warn: #FF9F1C;
  --e-bad: #FF4D4D;

  /* Day-state accents — one per Today state, used as the state's single hue. */
  --st-rest: #C8FF00;
  --st-training: #2BE68F;
  --st-trained: #FF5E00;
  --st-resting: #00E5FF;
  --st-evening: #7B5CFF;

  /* Metric hues. Used only on their own metric, never decoratively. */
  --m-hrv: #00E5FF;
  --m-sleep: #ED29FF;
  --m-cardiac: #FF47B2;
  --m-load: #FF5E00;
  --m-form: #A8D400;
  --m-fatigue: #7099EB;

  /* Depth ramp. */
  --d-1: #FFFFFF14;
  --d-2: #FFFFFF2B;
  --d-3: #FFFFFF4D;
  --d-4: #FFFFFF8C;

  /* Status ramp. */
  --s-good: #2BE68F;
  --s-mid: #FFB020;
  --s-low: #FF4356;

  /* Type. Both families are already loaded by index.html. */
  --e-display: "Sora", "Inter", ui-sans-serif, sans-serif;
  --e-body: "Inter", ui-sans-serif, system-ui, sans-serif;

  /* The pen's $radius-pill, verbatim. A literal 9999 is an approximation, and
   * this is a transcription. */
  --radius-pill: 100px;

  /* The pen's "off" foreground for an unreached phase step. Darker than
   * --e-lo; it is a distinct value in the tree, not a near-miss. */
  --e-off: #3E444C;

  /* Accent alphas. The pen writes these as literal #C8FF00xx, but the accent
   * changes per day-state, so they are mixed from --st-active instead — a
   * literal would strand every non-Rest screen on the acid hue.
   *   a07 = 0x12   a12 = 0x1F   a28 = 0x47   a40 = 0x66  */
  --st-a07: color-mix(in srgb, var(--st-active) 7%, transparent);
  --st-a12: color-mix(in srgb, var(--st-active) 12%, transparent);
  --st-a28: color-mix(in srgb, var(--st-active) 28%, transparent);
  --st-a40: color-mix(in srgb, var(--st-active) 40%, transparent);

  /* Per-state grounds. Pen-verified 2026-08-05: every flagship frame paints
   * its OWN background, tinted toward that state's accent — none of them uses
   * the neutral --e-bg. The tint is the mood system, not decoration. */
  --g-rest: #0A0B05;
  --g-training: #05100A;
  --g-trained: #120B05;
  --g-resting: #051012;
  --g-evening: #0A0816;
  /* Session Detail shares the Training ground (pen frame J5FV6). */
  --g-session: #05100A;

  /* The active state accent and ground. EditorialRoot rebinds both per
   * day-state; components reference var(--st-active) / var(--e-ground) so
   * they need no per-state branching. */
  --st-active: var(--st-rest);
  --e-ground: var(--g-rest);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/tokens.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/editorial/tokens.css frontend/src/editorial/__tests__/tokens.test.ts
git commit -m "feat(editorial): the EDITORIAL II token set, scoped so it cannot leak"
```

---

## Task 3: Day-state derivation

**Files:**
- Create: `frontend/src/editorial/state/dayState.ts`
- Test: `frontend/src/editorial/__tests__/dayState.test.ts`

**Interfaces:**
- Consumes: nothing (pure module, no React, no fetching).
- Produces:
  - `type DayState = 'rest' | 'training' | 'trained' | 'resting' | 'evening'`
  - `interface DayFacts { now: Date; hasCyclingActivityToday: boolean; hasPlannedSessionToday: boolean; plannedSessionCompleted: boolean }`
  - `deriveDayState(f: DayFacts): DayState`
  - `isoDateKey(d: Date): string`
  - `readOverride(now: Date): DayState | null`
  - `writeOverride(state: DayState, now: Date): void`
  - `clearOverride(): void` — takes no argument: the key is a single slot, and eslint's `no-unused-vars` has no `argsIgnorePattern` in this repo, so a `_now` written for signature symmetry is a lint error, not an exemption.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/editorial/__tests__/dayState.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearOverride, deriveDayState, isoDateKey, readOverride, writeOverride,
  type DayFacts,
} from '../state/dayState'

const at = (h: number, m = 0) => new Date(2026, 6, 22, h, m) // Wed 22 Jul 2026

const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
  now: at(9),
  hasCyclingActivityToday: false,
  hasPlannedSessionToday: false,
  plannedSessionCompleted: false,
  ...over,
})

describe('deriveDayState', () => {
  it('evening wins over everything from 21:00', () => {
    expect(deriveDayState(facts({ now: at(21), hasCyclingActivityToday: true }))).toBe('evening')
    expect(deriveDayState(facts({ now: at(21, 40) }))).toBe('evening')
  })

  it('a recorded ride reads trained right up to 21:00', () => {
    expect(deriveDayState(facts({ now: at(19, 24), hasCyclingActivityToday: true }))).toBe('trained')
    expect(deriveDayState(facts({ now: at(20, 59), hasCyclingActivityToday: true }))).toBe('trained')
  })

  it('a planned, uncompleted session reads training', () => {
    expect(deriveDayState(facts({ hasPlannedSessionToday: true }))).toBe('training')
  })

  it('a planned session already completed but with no activity is not training', () => {
    expect(deriveDayState(facts({
      now: at(15), hasPlannedSessionToday: true, plannedSessionCompleted: true,
    }))).toBe('resting')
  })

  it('no session and past 11:00 reads resting', () => {
    expect(deriveDayState(facts({ now: at(11) }))).toBe('resting')
    expect(deriveDayState(facts({ now: at(10, 59) }))).toBe('rest')
  })

  it('otherwise reads rest', () => {
    expect(deriveDayState(facts({ now: at(6) }))).toBe('rest')
  })
})

describe('override storage', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips for the same day', () => {
    writeOverride('training', at(9))
    expect(readOverride(at(18))).toBe('training')
  })

  it('expires at midnight — a different ISO date does not see it', () => {
    writeOverride('training', at(9))
    expect(readOverride(new Date(2026, 6, 23, 9))).toBeNull()
  })

  it('clears', () => {
    writeOverride('trained', at(9))
    clearOverride()
    expect(readOverride(at(9))).toBeNull()
  })

  it('rejects a stored value that is not a DayState', () => {
    localStorage.setItem('editorial.dayState', JSON.stringify({ date: isoDateKey(at(9)), state: 'brunch' }))
    expect(readOverride(at(9))).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/dayState.test.ts`
Expected: FAIL — cannot resolve `../state/dayState`.

- [ ] **Step 3: Write the implementation**

```ts
// frontend/src/editorial/state/dayState.ts
/**
 * The five Today states and how the day picks one.
 *
 * The 21:00 evening threshold comes from the pen's own clocks: the Trained
 * frame reads 19:24 and the Evening frame reads 21:40, so a completed ride
 * still shows Trained through the evening and only hands over late. Evening
 * subsumes Trained — its "01 Today" section carries the ride.
 */
export type DayState = 'rest' | 'training' | 'trained' | 'resting' | 'evening'

export const DAY_STATES: readonly DayState[] = ['rest', 'training', 'trained', 'resting', 'evening']

export interface DayFacts {
  now: Date
  hasCyclingActivityToday: boolean
  hasPlannedSessionToday: boolean
  plannedSessionCompleted: boolean
}

export const EVENING_HOUR = 21
export const RESTING_HOUR = 11

export function deriveDayState(f: DayFacts): DayState {
  if (f.now.getHours() >= EVENING_HOUR) return 'evening'
  if (f.hasCyclingActivityToday) return 'trained'
  if (f.hasPlannedSessionToday && !f.plannedSessionCompleted) return 'training'
  // Reaching this line already means nothing is pending: rule 3 returned for a
  // planned-and-unfinished session, rule 2 for a ridden one. So a completed
  // session with no recorded ride lands here too, and reads Resting — ruled
  // 2026-08-05, correcting the spec table's redundant "no session" guard.
  if (f.now.getHours() >= RESTING_HOUR) return 'resting'
  return 'rest'
}

const KEY = 'editorial.dayState'

/** Local ISO date (not UTC) — the override must expire at the athlete's midnight. */
export function isoDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isDayState(v: unknown): v is DayState {
  return typeof v === 'string' && (DAY_STATES as readonly string[]).includes(v)
}

export function readOverride(now: Date): DayState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { date, state } = parsed as { date?: unknown; state?: unknown }
    if (date !== isoDateKey(now)) return null
    return isDayState(state) ? state : null
  } catch {
    return null
  }
}

export function writeOverride(state: DayState, now: Date): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ date: isoDateKey(now), state }))
  } catch {
    /* private mode — the override is a convenience, never a requirement */
  }
}

export function clearOverride(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* see writeOverride */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/dayState.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editorial/state/dayState.ts frontend/src/editorial/__tests__/dayState.test.ts
git commit -m "feat(editorial): the day-state machine and its per-date override"
```

---

## Task 4: The design-system switch

**Files:**
- Create: `frontend/src/editorial/state/designSystem.ts`
- Test: `frontend/src/editorial/__tests__/designSystem.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type DesignSystem = 'v4' | 'editorial2'`
  - `readDesignSystem(): DesignSystem` — defaults `'v4'`
  - `writeDesignSystem(ds: DesignSystem): void`
  - `designSystemFromSearch(search: string): DesignSystem | null` — parses `?ds=editorial2`
  - `resolveLandingPath(search: string): string` — the root redirect target; **has the side effect of persisting a `?ds=` value**

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/editorial/__tests__/designSystem.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  designSystemFromSearch, readDesignSystem, resolveLandingPath, writeDesignSystem,
} from '../state/designSystem'

describe('design system switch', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to v4 when nothing is stored', () => {
    expect(readDesignSystem()).toBe('v4')
  })

  it('round-trips the stored preference', () => {
    writeDesignSystem('editorial2')
    expect(readDesignSystem()).toBe('editorial2')
  })

  it('ignores a stored value that is not a design system', () => {
    localStorage.setItem('designSystem', 'neon')
    expect(readDesignSystem()).toBe('v4')
  })

  it('parses ?ds= and ignores anything else', () => {
    expect(designSystemFromSearch('?ds=editorial2')).toBe('editorial2')
    expect(designSystemFromSearch('?ds=v4')).toBe('v4')
    expect(designSystemFromSearch('?ds=neon')).toBeNull()
    expect(designSystemFromSearch('')).toBeNull()
  })

  it('lands on /dashboard by default and /e/today when editorial2 is stored', () => {
    expect(resolveLandingPath('')).toBe('/dashboard')
    writeDesignSystem('editorial2')
    expect(resolveLandingPath('')).toBe('/e/today')
  })

  it('?ds= overrides the stored preference and persists it', () => {
    writeDesignSystem('v4')
    expect(resolveLandingPath('?ds=editorial2')).toBe('/e/today')
    expect(readDesignSystem()).toBe('editorial2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/designSystem.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// frontend/src/editorial/state/designSystem.ts
/**
 * Which design system the athlete lands in. A persisted preference so the
 * choice survives reloads, plus ?ds= so either system is one URL away without
 * digging through settings.
 */
export type DesignSystem = 'v4' | 'editorial2'

const KEY = 'designSystem'

function isDesignSystem(v: unknown): v is DesignSystem {
  return v === 'v4' || v === 'editorial2'
}

export function readDesignSystem(): DesignSystem {
  try {
    const raw = localStorage.getItem(KEY)
    return isDesignSystem(raw) ? raw : 'v4'
  } catch {
    return 'v4'
  }
}

export function writeDesignSystem(ds: DesignSystem): void {
  try {
    localStorage.setItem(KEY, ds)
  } catch {
    /* private mode — fall back to the default on the next read */
  }
}

export function designSystemFromSearch(search: string): DesignSystem | null {
  const raw = new URLSearchParams(search).get('ds')
  return isDesignSystem(raw) ? raw : null
}

export const LANDING: Record<DesignSystem, string> = {
  v4: '/dashboard',
  editorial2: '/e/today',
}

/** Root-redirect target. A ?ds= in the URL both wins and sticks. */
export function resolveLandingPath(search: string): string {
  const fromUrl = designSystemFromSearch(search)
  if (fromUrl) writeDesignSystem(fromUrl)
  return LANDING[fromUrl ?? readDesignSystem()]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/designSystem.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editorial/state/designSystem.ts frontend/src/editorial/__tests__/designSystem.test.ts
git commit -m "feat(editorial): a persisted design-system switch reachable by ?ds="
```

---

## Task 5: `EditorialRoot`, routes, and the honest plate

**Files:**
- Create: `frontend/src/editorial/EditorialRoot.tsx`
- Create: `frontend/src/editorial/pages/NotInThisSystem.tsx`
- Create: `frontend/src/editorial/pages/TodayPage.tsx` (spine only — sections land in Tasks 8–14)
- Create: `frontend/src/editorial/state/useDayState.ts` (placeholder body; Task 7 replaces it)
- Create: `frontend/src/editorial/pages/SessionDetailPage.tsx` (stub; Task 12 rewrites it)
- Modify: `frontend/src/App.tsx` (lazy imports, five routes, root redirect)
- Test: `frontend/src/editorial/__tests__/EditorialRoot.test.tsx`

**Interfaces:**
- Consumes: `resolveLandingPath` (Task 4), `tokens.css` (Task 2).
- Produces: `<EditorialRoot state?: DayState>{children}</EditorialRoot>`, which applies `.editorial-root`, binds `--st-active` to the state accent, and renders a `<div id="editorial-sheet-root" />` portal target as its last child. `NotInThisSystem({ tab }: { tab: string })`.

- [ ] **Step 1: Read the shell geometry from the pen**

Run `mcp__pencil__execute` with `Get('RYP0r', { depth: 3, resolveInstances: true, resolveVariables: false })` and record the frame's background fill, horizontal padding, and top/bottom safe-area treatment. Those numbers go into `EditorialRoot`, not guessed ones.

- [ ] **Step 2: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/EditorialRoot.test.tsx
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import EditorialRoot from '../EditorialRoot'
import NotInThisSystem from '../pages/NotInThisSystem'

afterEach(cleanup)

describe('EditorialRoot', () => {
  it('scopes the token class and exposes the sheet portal target', () => {
    const { container } = render(<EditorialRoot state="rest"><p>hello</p></EditorialRoot>)
    const root = container.querySelector('.editorial-root')
    expect(root).not.toBeNull()
    expect(root!.querySelector('#editorial-sheet-root')).not.toBeNull()
    expect(screen.getByText('hello')).toBeTruthy()
  })

  it('binds the active accent and the ground to the day state', () => {
    const { container } = render(<EditorialRoot state="trained"><span /></EditorialRoot>)
    const root = container.querySelector('.editorial-root') as HTMLElement
    expect(root.style.getPropertyValue('--st-active')).toBe('var(--st-trained)')
    expect(root.style.getPropertyValue('--e-ground')).toBe('var(--g-trained)')
  })

  it('gives each state its own ground — the tint is the mood system', () => {
    const grounds = (['rest', 'training', 'trained', 'resting', 'evening'] as const).map((s) => {
      const { container } = render(<EditorialRoot state={s}><span /></EditorialRoot>)
      const el = container.querySelector('.editorial-root') as HTMLElement
      return el.style.getPropertyValue('--e-ground')
    })
    expect(new Set(grounds).size).toBe(5)
  })
})

describe('NotInThisSystem', () => {
  it('says plainly that the tab is not designed here', () => {
    render(<NotInThisSystem tab="RECOVERY" />)
    expect(screen.getByText(/RECOVERY/)).toBeTruthy()
    expect(screen.getByText(/not in this design system yet/i)).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/EditorialRoot.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write `EditorialRoot`**

```tsx
// frontend/src/editorial/EditorialRoot.tsx
import type { ReactNode } from 'react'
import type { DayState } from './state/dayState'
import './tokens.css'

/**
 * The EDITORIAL II shell. Owns the page ground, the 390-wide column, the safe
 * areas, and the portal target every bottom sheet mounts into. It also binds
 * --st-active so components reference one accent variable instead of branching
 * on the day state themselves.
 */
export default function EditorialRoot({
  state = 'rest',
  children,
}: {
  state?: DayState
  children: ReactNode
}) {
  return (
    <div
      className="editorial-root"
      style={{
        // @ts-expect-error — custom property on an inline style is valid CSS
        '--st-active': `var(--st-${state})`,
        '--e-ground': `var(--g-${state})`,
        background: 'var(--e-ground)',
        color: 'var(--e-ink)',
        fontFamily: 'var(--e-body)',
        minHeight: '100dvh',
        width: '100%',
        maxWidth: 390,
        margin: '0 auto',
        position: 'relative',
        overflowX: 'hidden',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {children}
      <div id="editorial-sheet-root" />
    </div>
  )
}
```

- [ ] **Step 5: Write the honest plate**

```tsx
// frontend/src/editorial/pages/NotInThisSystem.tsx
/**
 * Train / Recovery / History / Social are not designed in the pen. The TabBar
 * is built 1:1 and complete, but these destinations say so rather than
 * inventing screens the design never specified.
 */
export default function NotInThisSystem({ tab }: { tab: string }) {
  return (
    <div style={{ padding: '120px 24px', textAlign: 'center' }}>
      <div style={{
        fontFamily: 'var(--e-body)', fontSize: 11, letterSpacing: '0.18em',
        color: 'var(--e-lo)', marginBottom: 16,
      }}>
        {tab}
      </div>
      <div style={{
        fontFamily: 'var(--e-display)', fontSize: 20, lineHeight: 1.35,
        color: 'var(--e-mid)',
      }}>
        This tab is not in this design system yet.
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Write the TodayPage spine (sections arrive later)**

```tsx
// frontend/src/editorial/pages/TodayPage.tsx
import EditorialRoot from '../EditorialRoot'
import { useDayState } from '../state/useDayState'

/**
 * The spine every Today state shares:
 *   StatusBar → Hero → Insight Strip → numbered sections
 *   → Tomorrow Band Wrap → TabWrap
 * The Day Rail is nested inside the Hero, not a sibling of it, and Resting
 * carries no Insight Strip. Sections are filled in per state by Tasks 8–14.
 */
export default function TodayPage() {
  const { state } = useDayState()
  return (
    <EditorialRoot state={state}>
      <main data-day-state={state} />
    </EditorialRoot>
  )
}
```

`useDayState` does not exist yet — write the thinnest version that compiles now and gets its real body in Task 7:

```tsx
// frontend/src/editorial/state/useDayState.ts
import { useMemo } from 'react'
import { readOverride, type DayState } from './dayState'

/** Placeholder body — Task 7 wires the real derivation from live facts. */
export function useDayState(): { state: DayState } {
  const state = useMemo<DayState>(() => readOverride(new Date()) ?? 'rest', [])
  return { state }
}
```

- [ ] **Step 7: Register the routes in `App.tsx`**

Add next to the other `lazyWithRetry` imports (around line 33):

```tsx
const EditorialTodayPage = lazyWithRetry(() => import('./editorial/pages/TodayPage'))
const EditorialSessionDetailPage = lazyWithRetry(() => import('./editorial/pages/SessionDetailPage'))
```

`SessionDetailPage` does not exist until Task 14. Create a one-line stub now so the build passes:

```tsx
// frontend/src/editorial/pages/SessionDetailPage.tsx
import EditorialRoot from '../EditorialRoot'
export default function SessionDetailPage() {
  return <EditorialRoot state="trained"><main /></EditorialRoot>
}
```

Add the routes immediately above the `{/* Default redirect */}` comment:

```tsx
{/* EDITORIAL II — a second design system, mounted alongside the first. */}
<Route path="/e/today" element={<ProtectedRoute checkOnboarding><EditorialTodayPage /></ProtectedRoute>} />
<Route path="/e/session/:id" element={<ProtectedRoute checkOnboarding><EditorialSessionDetailPage /></ProtectedRoute>} />
```

Replace the root redirect (`<Route path="/" element={<Navigate to="/dashboard" replace />} />`) with:

```tsx
<Route path="/" element={<RootRedirect />} />
```

and add, next to the existing `RideRideRedirect` helper at the bottom of the file:

```tsx
/** Lands the athlete in whichever design system they last chose. */
function RootRedirect() {
  const location = useLocation()
  return <Navigate to={resolveLandingPath(location.search)} replace />
}
```

`useLocation` is already imported in `App.tsx`; add `import { resolveLandingPath } from './editorial/state/designSystem'`.

Leave the `*` catch-all pointing at `/dashboard` — an unknown `/e/…` path is a bug, and bouncing it to the old app makes that visible.

- [ ] **Step 8: Run the tests and the full gate**

Run: `cd frontend && npx vitest run src/editorial && npx tsc -b && npm run build && npm run lint`
Expected: all PASS. Confirm `npm run build` output includes a new lazy chunk for `TodayPage`.

- [ ] **Step 9: Verify the old app is untouched**

Run: `git diff --stat main -- frontend/src | grep -v '^ frontend/src/editorial'`
Expected: exactly one file, `frontend/src/App.tsx`.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/editorial frontend/src/App.tsx
git commit -m "feat(editorial): the shell, the /e routes, and the landing switch"
```

---

## Task 6: Shared chrome — StatusBar, TabBar, DayRail, SecHead

**Files:**
- Create: `frontend/src/editorial/components/StatusBar.tsx`
- Create: `frontend/src/editorial/components/TabBar.tsx`
- Create: `frontend/src/editorial/components/DayRail.tsx`
- Create: `frontend/src/editorial/components/SecHead.tsx`
- Test: `frontend/src/editorial/__tests__/chrome.test.tsx`

**Interfaces:**
- Consumes: tokens (Task 2), `DayState` (Task 3), `Value<T>` (Task 1).
- Produces:
  - `StatusBar({ time }: { time: string })`
  - `TabBar({ active }: { active: 'today' | 'train' | 'recovery' | 'history' | 'social' })` — `today` links to `/e/today`; the other four link to `/e/:tab`, which renders `NotInThisSystem`.
  - `DayRail({ state, showSwitchAction, onSwapDayType }: { state: DayState; showSwitchAction?: boolean; onSwapDayType?: () => void })`
  - `SecHead({ index, title, chip, sub }: { index: string; title: string; chip?: string; sub?: string })` — the numbered section header.

**Two pen corrections, verified 2026-08-05. Both contradict this plan's first draft; the pen wins.**

**DayRail is not a weekly load strip.** Pen `uKzuZ` is a same-day *phase* rail:
a `DAY STATE` key, an optional accent pill action, a hairline rule, then four
steps — `REST DAY`/`TRAINING DAY` -> `SESSION` -> `RECOVERY` -> `LIGHTS OUT`. The
active step's tick is 6px tall in `var(--st-active)` with an outer glow
(`blur 16`, accent at 40%); every inactive tick is 2px `var(--d-1)` and its
label is `var(--e-off)`. Labels are Inter 9/800, letterSpacing 1. Rail gap 8,
step gap 9. The pill carries a `swap_horiz` icon and reads
`MAKE IT A TRAINING DAY` — **this pill is the entry point to Task 13's Switch
Day Type sheet**, so `onSwapDayType` is the wiring, not decoration.

**SecHead comes from `N42va`, not `rYYq3`.** `rYYq3` (`component/SecHead V5`)
is a different design system's component — its fills reference `$accent`
(#FF5A3C), `$text-primary`, `$text-tertiary`, none of which are EDITORIAL II
variables. The flagship frames' sections reference `N42va`
(`component/SectionHead`), confirmed on both `QvlIq` "01 Why" and `JzYYR`
"02 Absorbing". Transcribe `N42va`:

- Root: vertical, gap 9, width fill.
- Row: gap 12, alignItems center.
  - `Index` — Sora 22/800, letterSpacing -0.5, lineHeight 1, `var(--st-active)` (`$e-acid` in the component; per-state in the instances).
  - `Title` — Sora 19/800, letterSpacing -0.5, lineHeight 1, `var(--e-ink)`, fills the row.
  - `Chip` (optional) — fill `var(--st-a12)`, cornerRadius 999, padding 4/10; label Inter 10/800, letterSpacing 1.4, `var(--st-active)`.
- `Sub` (optional) — Inter 12/600, lineHeight 1.35, `var(--e-lo)`.

- [ ] **Step 1: Read the four pen components**

Run, one call each:
```
Get('vrvl9', { depth: 8, resolveInstances: true, resolveVariables: false })   // StatusBar
Get('G6TmH', { depth: 8, resolveInstances: true, resolveVariables: false })   // TabBar
Get('uKzuZ', { depth: 8, resolveInstances: true, resolveVariables: false })   // DayRail
Get('rYYq3', { depth: 8, resolveInstances: true, resolveVariables: false })   // SecHead V5
```
Write down, per component: height, padding, gap, every text node's fontSize / fontWeight / letterSpacing / fill, every rule's stroke colour and width, corner radii. These are the spec. Transcribe them into the components below — the skeletons here fix the API and the structure, not the numbers.

- [ ] **Step 2: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/chrome.test.tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DayRail from '../components/DayRail'
import SecHead from '../components/SecHead'
import StatusBar from '../components/StatusBar'
import TabBar from '../components/TabBar'

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

afterEach(cleanup)

describe('chrome', () => {
  it('StatusBar shows the given time verbatim', () => {
    render(<StatusBar time="19:24" />)
    expect(screen.getByText('19:24')).toBeTruthy()
  })

  it('TabBar renders all five destinations and marks the active one', () => {
    wrap(<TabBar active="today" />)
    for (const label of ['TODAY', 'TRAIN', 'RECOVERY', 'HISTORY', 'SOCIAL']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    expect(screen.getByText('TODAY').closest('a')?.getAttribute('aria-current')).toBe('page')
  })

  it('TabBar points the four undesigned tabs inside the editorial tree', () => {
    wrap(<TabBar active="today" />)
    expect(screen.getByText('TRAIN').closest('a')?.getAttribute('href')).toBe('/e/train')
  })

  it('DayRail renders the four phases and lights exactly one', () => {
    const { container } = wrap(<DayRail state="rest" />)
    expect(container.querySelectorAll('[data-step]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-active="true"]')).toHaveLength(1)
    expect(screen.getByText('REST DAY')).toBeTruthy()
    expect(screen.getByText('LIGHTS OUT')).toBeTruthy()
  })

  it('DayRail names the first phase for the day state', () => {
    wrap(<DayRail state="training" />)
    expect(screen.getByText('TRAINING DAY')).toBeTruthy()
  })

  it('DayRail hides the action pill unless asked, and reports the tap', () => {
    const onSwap = vi.fn()
    const { container } = wrap(<DayRail state="rest" />)
    expect(container.querySelector('[data-day-action]')).toBeNull()
    cleanup()
    wrap(<DayRail state="rest" showSwitchAction onSwapDayType={onSwap} />)
    fireEvent.click(screen.getByText('MAKE IT A TRAINING DAY'))
    expect(onSwap).toHaveBeenCalled()
  })

  it('SecHead renders the number, the title, and the optional chip and sub', () => {
    render(<SecHead index="01" title="YOUR BODY" chip="AHEAD" sub="What this section covers." />)
    expect(screen.getByText('01')).toBeTruthy()
    expect(screen.getByText('YOUR BODY')).toBeTruthy()
    expect(screen.getByText('AHEAD')).toBeTruthy()
    expect(screen.getByText('What this section covers.')).toBeTruthy()
  })

  it('SecHead without a chip or sub renders neither', () => {
    const { container } = render(<SecHead index="02" title="THE COST" />)
    expect(container.querySelector('[data-sechead-chip]')).toBeNull()
    expect(container.querySelector('[data-sechead-sub]')).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/chrome.test.tsx`
Expected: FAIL — components not found.

- [ ] **Step 4: Write the four components**

Transcribe each from its Step 1 node tree. The required shape:

```tsx
// frontend/src/editorial/components/SecHead.tsx
/** The numbered section header, transcribed from pen component rYYq3 (SecHead V5). */
export default function SecHead({ index, title, aside }: {
  index: string
  title: string
  aside?: string
}) {
  return (
    <header style={{ /* padding + gap from rYYq3 */ display: 'flex', alignItems: 'baseline' }}>
      <span style={{ fontFamily: 'var(--e-display)', color: 'var(--st-active)' /* + size/weight/tracking from the tree */ }}>
        {index}
      </span>
      <h2 style={{ fontFamily: 'var(--e-body)', color: 'var(--e-ink)' /* + size/weight/tracking */ }}>
        {title}
      </h2>
      {aside && (
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--e-body)', color: 'var(--e-quiet)' }}>
          {aside}
        </span>
      )}
    </header>
  )
}
```

`TabBar` uses `react-router`'s `Link`, `href` values `/e/today`, `/e/train`, `/e/recovery`, `/e/history`, `/e/social`, and sets `aria-current="page"` on the active one. `DayRail` renders one element per day carrying `data-day={iso}` and `data-today={String(isToday)}`; the load bar height maps `load` through the pen's own scale — read it from `uKzuZ`, do not invent a max. `StatusBar` takes the clock as a prop so the frame is deterministic in tests and matches the pen's 19:24 / 21:40 when screenshotting.

- [ ] **Step 5: Register the four undesigned tab routes in `App.tsx`**

```tsx
<Route path="/e/:tab" element={<ProtectedRoute checkOnboarding><EditorialTabPlate /></ProtectedRoute>} />
```

placed **after** `/e/today` and `/e/session/:id` so those win, with:

```tsx
// frontend/src/editorial/pages/TabPlate.tsx
import { useParams } from 'react-router-dom'
import EditorialRoot from '../EditorialRoot'
import NotInThisSystem from './NotInThisSystem'

export default function TabPlate() {
  const { tab } = useParams()
  return (
    <EditorialRoot>
      <NotInThisSystem tab={(tab ?? '').toUpperCase()} />
    </EditorialRoot>
  )
}
```

- [ ] **Step 6: Run tests and the gate**

Run: `cd frontend && npx vitest run src/editorial && npx tsc -b && npm run lint`
Expected: PASS.

- [ ] **Step 7: Visual check — one frame**

Start the dev server (`cd frontend && npm run dev`), open `/e/today?ds=editorial2` at 390×844, screenshot once. Compare against `mcp__pencil__get_screenshot` of `RYP0r` cropped to the status bar / day rail / tab bar. Fix discrepancies by re-reading the node tree, not by nudging numbers.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/editorial frontend/src/App.tsx
git commit -m "feat(editorial): StatusBar, TabBar, DayRail and SecHead, transcribed"
```

---

## Task 7: The Today view-model

**Files:**
- Create: `frontend/src/editorial/data/useTodayModel.ts`
- Modify: `frontend/src/editorial/state/useDayState.ts` (replace the Task 5 placeholder)
- Test: `frontend/src/editorial/__tests__/useTodayModel.test.ts`

**Interfaces:**
- Consumes: `useTodaySnapshot`, `useDailyMetrics`, `useStreak`, `usePMC`, `useRecoveryEta`, `useTodaySession`, `usePlannedWorkouts`, `useCoachBrief`, `useTodayWeather`, `useActivitiesRange`, `useMorningHealthCheck`, `useAdaptive` — all read-only.
- Produces:

```ts
export interface TodayModel {
  state: DayState
  dateLabel: Value<string>          // "WED 22 JUL"
  streakDays: Value<number>
  readiness: Value<{ score: number; deltaVsYesterday: number | null }>
  hrv: Value<{ value: number; unit: 'ms'; delta: number | null; band: RangeBand | null }>
  restingHr: Value<{ value: number; unit: 'bpm'; delta: number | null; band: RangeBand | null }>
  sleep: Value<{ totalS: number; deepS: number | null; remS: number | null; lightS: number | null; awakeS: number | null }>
  pmc: Value<{ fitness: number; fatigue: number; form: number; series: PmcPoint[] }>
  recovery: Value<{ hoursRemaining: number; clearAtLabel: string }>
  session: Value<SessionSummary>
  ride: Value<RideSummary>
  verdict: Value<{ headline: string; body: string; whatThisChanges: string | null }>
  conditions: Value<{ tempC: number; windKmh: number }>
  tomorrow: Value<{ title: string; unlockLabel: string }>
  isLoading: boolean
}

export interface RangeBand { low: number; high: number; position: 'below' | 'in' | 'above' }
export interface PmcPoint { date: string; ctl: number; atl: number; tsb: number }
export interface SessionSummary { title: string; targetWatts: number | null; workKj: number | null; intensityFactor: number | null; tss: number | null; blocks: { label: string; minutes: number; watts: number | null }[] }
export interface RideSummary { activityId: number; distanceM: number | null; kj: number | null; avgHr: number | null; np: number | null; durationS: number | null }
```

**Grounding correction to the spec's data map.** The spec lists `daily_metrics.hrv_overnight_avg` and `daily_metrics.sleep_total_s`. Neither is on `DailyMetric` (`frontend/src/api/dashboard.ts:20`). The real sources are:

| Value | Real source |
|---|---|
| Today's HRV | `useTodaySnapshot().data.hrv_overnight_avg` |
| HRV / resting-HR range band | `useMorningHealthCheck()` → the signal whose `metric` is `'hrv'` / `'resting_hr'` carries `baseline`, `delta`, `unit`, `series` |
| HRV `above / in / below` label | `useAdaptive().hrv_state` |
| Sleep total and stages | `DailyMetric.sleep_detail` → `total_s`, `deep_s`, `rem_s`, `light_s`, `awake_s` |
| Readiness | `useTodaySnapshot().data.training_readiness`; yesterday's from `useDailyMetrics(yesterday, yesterday)[0].training_readiness` |
| Recovery hours | `useTodaySnapshot().data.recovery_time_hours` + `useRecoveryEta()` for the clear-at label |

Use those. If a source is absent, return `missing(reason)` — never a substitute metric.

- [ ] **Step 1: Write the failing test**

The view-model's assembly logic is pure. Extract it as `buildTodayModel(inputs)` so it is testable without React Query.

```ts
// frontend/src/editorial/__tests__/useTodayModel.test.ts
import { describe, expect, it } from 'vitest'
import { buildTodayModel, type TodayModelInputs } from '../data/useTodayModel'
import { isPresent } from '../data/value'

const base = (over: Partial<TodayModelInputs> = {}): TodayModelInputs => ({
  now: new Date(2026, 6, 22, 9, 0),
  state: 'rest',
  snapshot: { body_battery: { wake: null, now: null, now_at: null }, stress: { wake: null, now: null, now_at: null },
    hrv_overnight_avg: 68, training_readiness: 74, recovery_time_hours: 11,
    generated_at: '2026-07-22T06:00:00', cached: false },
  yesterdayMetric: null, todayMetric: null, streak: null, pmc: null, recoveryEta: null,
  session: null, brief: undefined, weather: null, activitiesToday: [], health: null,
  tomorrowWorkout: null, isLoading: false,
  ...over,
})

describe('buildTodayModel', () => {
  it('formats the date meta the way the pen does', () => {
    const m = buildTodayModel(base())
    expect(m.dateLabel).toEqual({ value: 'WED 22 JUL' })
  })

  it('carries readiness and its delta against yesterday', () => {
    const m = buildTodayModel(base({
      yesterdayMetric: { training_readiness: 66 } as never,
    }))
    expect(m.readiness).toEqual({ value: { score: 74, deltaVsYesterday: 8 } })
  })

  it('reports a null delta when yesterday has no reading — not zero', () => {
    const m = buildTodayModel(base())
    expect(isPresent(m.readiness) && m.readiness.value.deltaVsYesterday).toBeNull()
  })

  it('marks HRV missing with a dated reason when the snapshot has none', () => {
    const m = buildTodayModel(base({
      snapshot: { ...base().snapshot!, hrv_overnight_avg: null },
    }))
    expect(isPresent(m.hrv)).toBe(false)
    expect(m.hrv).toHaveProperty('missing')
  })

  it('reads sleep stages from sleep_detail, not from flat columns', () => {
    const m = buildTodayModel(base({
      todayMetric: { sleep_detail: { total_s: 27000, deep_s: 4800, rem_s: 5400, light_s: 15600, awake_s: 1200 } } as never,
    }))
    expect(isPresent(m.sleep) && m.sleep.value.deepS).toBe(4800)
  })

  it('never invents a session when none is planned', () => {
    expect(isPresent(buildTodayModel(base()).session)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/useTodayModel.test.ts`
Expected: FAIL — `buildTodayModel` not exported.

- [ ] **Step 3: Implement `buildTodayModel` and `useTodayModel`**

`buildTodayModel(inputs: TodayModelInputs): TodayModel` is a pure function; `useTodayModel(): TodayModel` calls the hooks listed above, assembles `TodayModelInputs`, and returns `buildTodayModel(inputs)`. Every field is built with `fromNullable(raw, reason)` where `reason` is the calm-register line the section will print. Reasons to use verbatim:

- HRV / resting HR / sleep absent → `` `No wearable reading since ${lastReadingLabel}.` `` where `lastReadingLabel` is the weekday of the most recent `DailyMetric.date` in the last 7 days, or `'your last sync'` if there is none.
- PMC absent → `Not enough training history yet.`
- Session absent → `Nothing planned for today.`
- Weather absent (`available === false`) → `No location from a recent ride.`
- Brief absent → `The coach has not weighed in yet today.`

Date label: `now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase().replace(/,/g, '')` → `WED 22 JUL`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/useTodayModel.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Wire the real `useDayState`**

Replace the Task 5 placeholder body:

```ts
// frontend/src/editorial/state/useDayState.ts
import { useCallback, useMemo, useState } from 'react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useTodaySession } from '../../hooks/useTodaySession'
import { clearOverride, deriveDayState, readOverride, writeOverride, type DayState } from './dayState'

/**
 * The state the day is actually in: an override if the athlete set one today,
 * otherwise the derivation. A dev override (the picker) previews a state
 * without touching stored state, so it is React state, not localStorage.
 */
export function useDayState(): {
  state: DayState
  derived: DayState
  setOverride: (s: DayState) => void
  clear: () => void
  preview: (s: DayState | null) => void
} {
  const now = useMemo(() => new Date(), [])
  const { isActiveTrainingDay } = useTodaySession()
  const { data: activities } = useActivitiesRange(now, now)
  const [previewState, setPreviewState] = useState<DayState | null>(null)
  const [tick, setTick] = useState(0)

  const derived = useMemo(() => deriveDayState({
    now,
    hasCyclingActivityToday: (activities ?? []).some((a) => a.sport === 'cycling'),
    hasPlannedSessionToday: isActiveTrainingDay,
    plannedSessionCompleted: false,
  }), [now, activities, isActiveTrainingDay])

  const stored = useMemo(() => { void tick; return readOverride(now) }, [now, tick])

  const setOverride = useCallback((s: DayState) => {
    writeOverride(s, new Date()); setTick((t) => t + 1)
  }, [])
  const clear = useCallback(() => { clearOverride(); setTick((t) => t + 1) }, [])

  return { state: previewState ?? stored ?? derived, derived, setOverride, clear, preview: setPreviewState }
}
```

Check `useActivitiesRange`'s real signature before writing this — if it takes different arguments, adapt the call, not the contract.

- [ ] **Step 6: Run the gate**

Run: `cd frontend && npx vitest run src/editorial && npx tsc -b && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/editorial
git commit -m "feat(editorial): the Today view-model, every value a Value"
```

---

## Task 8: Trained — hero and the shared metric components

**Files:**
- Create: `frontend/src/editorial/components/MetricTrack.tsx`
- Create: `frontend/src/editorial/components/StatTile.tsx`
- Create: `frontend/src/editorial/components/Verdict.tsx`
- Create: `frontend/src/editorial/components/DayMark.tsx`
- Create: `frontend/src/editorial/components/InsightStrip.tsx`
- Modify: `frontend/src/editorial/pages/TodayPage.tsx`
- Test: `frontend/src/editorial/__tests__/metrics.test.tsx`

**Interfaces:**
- Consumes: `Value<T>` (Task 1), `RangeBand`/`TodayModel` (Task 7), `SecHead` (Task 6).
- Produces:
  - `MetricTrack({ label, state, value, unit, delta, band, hue })` where `value: Value<number>`, `band: RangeBand | null`, `hue: string` (a `var(--m-…)` reference)
  - `StatTile({ label, value, unit, hue })` with `value: Value<number | string>`
  - `Verdict({ headline, body })` with `Value<string>` on both
  - `DayMark({ state })`
  - `InsightStrip({ items }: { items: { label: string; value: Value<string> }[] })`

Trained is built first on purpose: it is the widest component test (2977px, Big Four tiles, plan-vs-ridden, peak power, HR zones, the Cost band, the Trajectory chart). Everything it proves, the other four screens reuse.

- [ ] **Step 1: Read the Trained frame**

```
Get('LdBJ4', { depth: 14, resolveInstances: true, resolveVariables: false })
```
Record the hero block: meta row, session name, big numeral (size / weight / tracking / fill), metric track geometry (label size, value size, delta chevron, the band rail's width, height, fill, and the marker), verdict type ramp, Day Mark shape.

Also read the component library frame for the canonical versions:
```
Get('DbOfI', { depth: 10, resolveInstances: true, resolveVariables: false })
```

- [ ] **Step 2: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/metrics.test.tsx
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import MetricTrack from '../components/MetricTrack'
import StatTile from '../components/StatTile'
import Verdict from '../components/Verdict'
import { missing, present } from '../data/value'

afterEach(cleanup)

describe('MetricTrack', () => {
  it('renders the value, unit and delta when present', () => {
    render(<MetricTrack label="HRV" state="ABOVE RANGE" value={present(68)} unit="ms"
      delta={4} band={{ low: 52, high: 66, position: 'above' }} hue="var(--m-hrv)" />)
    expect(screen.getByText('68')).toBeTruthy()
    expect(screen.getByText('ms')).toBeTruthy()
    expect(screen.getByText('ABOVE RANGE')).toBeTruthy()
  })

  it('renders an em dash and the reason when the reading is missing — and keeps the frame', () => {
    const { container } = render(<MetricTrack label="HRV" state="ABOVE RANGE"
      value={missing('No wearable reading since Tue.')} unit="ms" delta={null} band={null} hue="var(--m-hrv)" />)
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText('No wearable reading since Tue.')).toBeTruthy()
    expect(screen.getByText('HRV')).toBeTruthy()
    expect(container.querySelector('[data-metric-track]')).not.toBeNull()
  })

  it('never prints a delta when the value is missing', () => {
    render(<MetricTrack label="HRV" state="" value={missing('r')} unit="ms" delta={4} band={null} hue="var(--m-hrv)" />)
    expect(screen.queryByText(/▲|▼/)).toBeNull()
  })
})

describe('StatTile', () => {
  it('dashes a missing stat', () => {
    render(<StatTile label="TSS" value={missing('No ride recorded.')} unit="" hue="var(--m-load)" />)
    expect(screen.getByText('—')).toBeTruthy()
  })
})

describe('Verdict', () => {
  it('withholds the body but keeps the block when the coach has not spoken', () => {
    render(<Verdict headline={missing('The coach has not weighed in yet today.')} body={missing('The coach has not weighed in yet today.')} />)
    expect(screen.getByText('The coach has not weighed in yet today.')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/metrics.test.tsx`
Expected: FAIL — components not found.

- [ ] **Step 4: Write the components**

Every one follows the same shape: transcribe geometry from Step 1, and branch on `isPresent(value)` for the numeral only — labels, rails, and section frames render identically in both arms. The missing arm prints `—` in the numeral slot and the reason as one quiet line at `var(--e-quiet)`. Mark the root element `data-metric-track` / `data-stat-tile` so tests can assert the frame survives.

- [ ] **Step 5: Build the Trained hero into `TodayPage`**

Hero order, fixed for every state: Meta row (date · streak) → statement or session name → big numeral → `MetricTrack` with delta → context → `Verdict` → `DayMark`. For Trained the context is the ride's Big Four tiles.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial && npx tsc -b`
Expected: PASS.

- [ ] **Step 7: Visual check**

Render `/e/today?ds=editorial2` at 390×844 with the day-state picker set to `trained`; screenshot once; compare against `get_screenshot('LdBJ4')` cropped to the hero. Iterate against the node tree until it matches.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/editorial
git commit -m "feat(editorial): the Trained hero and the shared metric components"
```

---

## Task 9: Trained — 01 The Session, 02 The Cost, 03 Trajectory

**Files:**
- Create: `frontend/src/editorial/components/Bars.tsx`
- Create: `frontend/src/editorial/components/ZoneRows.tsx`
- Create: `frontend/src/editorial/components/PeakRows.tsx`
- Create: `frontend/src/editorial/components/PMCChart.tsx`
- Modify: `frontend/src/editorial/pages/TodayPage.tsx`
- Modify: `frontend/src/editorial/data/useTodayModel.ts` (add `zones`, `peaks`, `planVsRidden`)
- Test: `frontend/src/editorial/__tests__/trained.test.tsx`

**Interfaces:**
- Consumes: `useStreamAnalysis(activityId)`, `useTrainingZones()`, `usePowerProfile()`, `usePMC()`.
- Produces:
  - `Bars({ blocks }: { blocks: { label: string; minutes: number; watts: Value<number>; delta: number | null }[] })`
  - `ZoneRows({ zones }: { zones: Value<{ name: string; lowBpm: number; highBpm: number; seconds: number }[]> })`
  - `PeakRows({ peaks }: { peaks: Value<{ duration: string; watts: number; percentOfSeasonBest: number | null }[]> })`
  - `PMCChart({ series, days }: { series: Value<PmcPoint[]>; days: 42 })`

**Verify-during-build items.** Three of these have a plausible source that must be confirmed against real data before the section is written. Confirm each by calling the endpoint against the local backend and inspecting the payload:

1. Per-block plan-vs-ridden deltas — does `useStreamAnalysis` return splits aligned to planned blocks? If not, `planVsRidden` is `missing('This ride was not matched to its plan.')` and `Bars` renders no delta column.
2. Time-in-HR-zone with bpm bounds — `useStreamAnalysis` + `useTrainingZones`. If zone bounds are absent, `ZoneRows` is `missing('No HR zones set.')`.
3. `usePowerProfile().peaks` and `mmp_curve` — confirm the shape carries a season best to compute `% of season best`; if not, that column is omitted, not faked.

Record the outcome of each check in the commit body.

- [ ] **Step 1: Read the three sections from the pen**

```
Get('LdBJ4', { depth: 16, resolveInstances: true, resolveVariables: false })
```
and locate the `01 THE SESSION`, `02 THE COST`, `03 TRAJECTORY` subtrees. Record row heights, column x-offsets, bar geometry, and the chart's axis treatment.

- [ ] **Step 2: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/trained.test.tsx
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Bars from '../components/Bars'
import PeakRows from '../components/PeakRows'
import PMCChart from '../components/PMCChart'
import ZoneRows from '../components/ZoneRows'
import { missing, present } from '../data/value'

afterEach(cleanup)

describe('Trained sections', () => {
  it('Bars renders one bar per block and signs the delta', () => {
    const { container } = render(<Bars blocks={[
      { label: '1', minutes: 4, watts: present(305), delta: 1 },
      { label: '2', minutes: 4, watts: present(298), delta: -2 },
    ]} />)
    expect(container.querySelectorAll('[data-block]')).toHaveLength(2)
    expect(screen.getByText('+1')).toBeTruthy()
    expect(screen.getByText('−2')).toBeTruthy()
  })

  it('ZoneRows keeps the section and explains itself when zones are unset', () => {
    render(<ZoneRows zones={missing('No HR zones set.')} />)
    expect(screen.getByText('No HR zones set.')).toBeTruthy()
  })

  it('PeakRows omits the season-best column rather than inventing it', () => {
    render(<PeakRows peaks={present([{ duration: '5:00', watts: 342, percentOfSeasonBest: null }])} />)
    expect(screen.getByText('342')).toBeTruthy()
    expect(screen.queryByText(/% of season best/i)).toBeNull()
  })

  it('PMCChart renders nothing but its frame and reason without history', () => {
    const { container } = render(<PMCChart series={missing('Not enough training history yet.')} days={42} />)
    expect(screen.getByText('Not enough training history yet.')).toBeTruthy()
    expect(container.querySelector('svg')).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/trained.test.tsx`
Expected: FAIL — components not found.

- [ ] **Step 4: Write the components and the three sections**

`PMCChart` is a hand-rolled inline SVG (no chart library) at the pen's exact dimensions, plotting CTL / ATL / TSB over 42 days with `--m-form`, `--m-fatigue`, `--m-load`. Deltas render with a true minus sign `−` (U+2212), matching the pen.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial && npx tsc -b && npm run lint`
Expected: PASS.

- [ ] **Step 6: Visual check**

One render of `/e/today` in the `trained` state at 390×844, full-page screenshot, compared against `get_screenshot('LdBJ4')`. Total height should land near 2977px.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/editorial
git commit -m "feat(editorial): Trained's session, cost and trajectory sections"
```

---

## Task 10: Rest and Training

**Files:**
- Create: `frontend/src/editorial/components/RangeRow.tsx`
- Create: `frontend/src/editorial/components/WeekRail.tsx`
- Create: `frontend/src/editorial/components/TomorrowBand.tsx`
- Modify: `frontend/src/editorial/pages/TodayPage.tsx`
- Test: `frontend/src/editorial/__tests__/restTraining.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 6–9.
- Produces:
  - `RangeRow({ label, value, unit, band }: { label: string; value: Value<number>; unit: string; band: RangeBand | null })` — the sleep-composition and range-band row
  - `WeekRail({ days }: { days: { letter: string; tss: Value<number> }[] })`
  - `TomorrowBand({ session }: { session: Value<{ title: string; unlockLabel: string }> })`

Sections, pen-verified 2026-08-05 from the frames' own child names: **Rest** = `01 Why` / `02 Absorbing` / `03 Trajectory` — NOT "Recovery / Absorption", which is what the spec's first draft said. **Training** = `01 Recovery` / `02 The Session` / `03 Trajectory`. Most of both is reuse; the new material is sleep composition (deep / REM / light / awake), the absorption band with `clear Thu 17:30`, the session-preview bars, and conditions.

- [ ] **Step 1: Read both frames**

```
Get('RYP0r', { depth: 16, resolveInstances: true, resolveVariables: false })   // Rest
Get('x4AxA5', { depth: 16, resolveInstances: true, resolveVariables: false })  // Training
```

- [ ] **Step 2: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/restTraining.test.tsx
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import RangeRow from '../components/RangeRow'
import TomorrowBand from '../components/TomorrowBand'
import WeekRail from '../components/WeekRail'
import { missing, present } from '../data/value'

afterEach(cleanup)

describe('Rest and Training pieces', () => {
  it('RangeRow places the marker inside its band', () => {
    const { container } = render(<RangeRow label="DEEP" value={present(4800)} unit="s"
      band={{ low: 3600, high: 6000, position: 'in' }} />)
    const marker = container.querySelector('[data-range-marker]') as HTMLElement
    expect(marker).not.toBeNull()
    expect(parseFloat(marker.style.left)).toBeCloseTo(50, 0)
  })

  it('RangeRow with no band still renders the row', () => {
    const { container } = render(<RangeRow label="DEEP" value={present(4800)} unit="s" band={null} />)
    expect(container.querySelector('[data-range-row]')).not.toBeNull()
    expect(container.querySelector('[data-range-marker]')).toBeNull()
  })

  it('WeekRail dashes a day with no load rather than drawing a zero bar', () => {
    const { container } = render(<WeekRail days={[
      { letter: 'M', tss: present(64) }, { letter: 'T', tss: missing('No ride.') },
    ]} />)
    expect(container.querySelectorAll('[data-week-day]')).toHaveLength(2)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('TomorrowBand says nothing is planned rather than disappearing', () => {
    render(<TomorrowBand session={missing('Nothing planned for tomorrow yet.')} />)
    expect(screen.getByText('Nothing planned for tomorrow yet.')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/restTraining.test.tsx`
Expected: FAIL — components not found.

- [ ] **Step 4: Write the components and both screens**

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial && npx tsc -b && npm run lint`
Expected: PASS.

- [ ] **Step 6: Visual check**

Two renders at 390×844 — `rest` and `training` — against `get_screenshot('RYP0r')` and `get_screenshot('x4AxA5')`. Expected heights 2142 and 2581.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/editorial
git commit -m "feat(editorial): the Rest and Training day states"
```

---

## Task 11: Resting

**Files:**
- Modify: `frontend/src/editorial/pages/TodayPage.tsx`
- Modify: `frontend/src/editorial/data/useTodayModel.ts` (add the wake→now pair)
- Create: `frontend/src/editorial/components/LiveRing.tsx`
- Test: `frontend/src/editorial/__tests__/resting.test.tsx`

**Interfaces:**
- Consumes: `useTodaySnapshot()` → `body_battery: { wake, now, now_at }`, `stress: { wake, now, now_at }`.
- Produces: `LiveRing({ label, wake, now, hue }: { label: string; wake: Value<number>; now: Value<number>; hue: string })`.

Sections: `01 Right Now` / `02 Trajectory`. Smallest screen (1604px). New material: the live rings and the wake-to-now track.

**Resting breaks the shared spine:** its frame `h54Rs` has no Insight Strip — children are StatusBar | Hero | 01 Right Now | 02 Trajectory | Tomorrow Band Wrap | TabWrap. Do not add one.

- [ ] **Step 1: Read the frame**

```
Get('h54Rs', { depth: 16, resolveInstances: true, resolveVariables: false })
```

- [ ] **Step 2: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/resting.test.tsx
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import LiveRing from '../components/LiveRing'
import { missing, present } from '../data/value'

afterEach(cleanup)

describe('LiveRing', () => {
  it('draws the arc to the now value', () => {
    const { container } = render(<LiveRing label="BODY BATTERY" wake={present(88)} now={present(61)} hue="var(--st-resting)" />)
    expect(screen.getByText('61')).toBeTruthy()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('keeps the ring frame and dashes the numeral when there is no reading', () => {
    const { container } = render(<LiveRing label="BODY BATTERY" wake={missing('r')} now={missing('No wearable reading since Tue.')} hue="var(--st-resting)" />)
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText('No wearable reading since Tue.')).toBeTruthy()
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/resting.test.tsx`
Expected: FAIL — `LiveRing` not found.

- [ ] **Step 4: Write `LiveRing` and the Resting screen**

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial && npx tsc -b`
Expected: PASS.

- [ ] **Step 6: Visual check against `get_screenshot('h54Rs')`, expected height 1604.**

- [ ] **Step 7: Commit**

```bash
git add frontend/src/editorial
git commit -m "feat(editorial): the Resting day state and its live rings"
```

---

## Task 12: Session Detail

**Files:**
- Create: `frontend/src/editorial/data/useSessionModel.ts`
- Create: `frontend/src/editorial/components/NavHeader.tsx`
- Create: `frontend/src/editorial/components/SessionCta.tsx`
- Rewrite: `frontend/src/editorial/pages/SessionDetailPage.tsx` (replacing the Task 5 stub)
- Test: `frontend/src/editorial/__tests__/sessionDetail.test.tsx`

**Interfaces:**
- Consumes: `usePlannedWorkouts`, `useCoachBrief`, `usePowerProfile`, `useTodayWeather`, `/routes` + `rehearsal/route_history`.
- Produces: `useSessionModel(id: string): SessionModel` with `{ title: Value<string>; targetWatts: Value<number>; claim: Value<string>; stats: Value<SessionSummary>; blocks: Value<Block[]>; howToRideIt: Value<string[]>; payoff: Value<PmcPoint[]>; route: Value<RouteSummary>; }`. `NavHeader({ title, onBack }: { title: string; onBack: () => void })` transcribed from pen component `kdOT0`.

Screen order, pen-verified 2026-08-05 from frame `J5FV6`'s children: StatusBar → Nav → Hero (numeral, claim, stats, profile) → `01 The Blocks` → `02 HOW TO RIDE IT` → **Quote Plate** → `03 THE PAYOFF` → `04 WHERE TO RIDE IT` → CTA. The Quote Plate sits between 02 and 03 and was missing from the spec's first draft — transcribe it.

**The one deliberate departure from the pen.** The primary CTA keeps the pen's exact geometry, type, and rule structure, but its label reads `EXPORT WORKOUT` with the sub-line `Structured intervals and route, as a file for your Edge` — there is no Garmin push path in this backend, the app exports. This matches the resolution already reached for the V4 route rehearsal page. Everything else is transcribed as designed. Pin this in a test so nobody "fixes" it back.

- [ ] **Step 1: Read the frame and the nav component**

```
Get('J5FV6', { depth: 16, resolveInstances: true, resolveVariables: false })
Get('kdOT0', { depth: 8, resolveInstances: true, resolveVariables: false })
```

- [ ] **Step 2: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/sessionDetail.test.tsx
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import SessionCta from '../components/SessionCta'

afterEach(cleanup)

describe('Session Detail CTA', () => {
  it('states what the app actually does, not what the pen drew', () => {
    render(<SessionCta onExport={() => {}} />)
    expect(screen.getByRole('button', { name: /export workout/i })).toBeTruthy()
    expect(screen.queryByText(/send workout to garmin/i)).toBeNull()
  })

  it('keeps the pen sub-line structure', () => {
    render(<SessionCta onExport={() => {}} />)
    expect(screen.getByText(/structured intervals and route/i)).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/sessionDetail.test.tsx`
Expected: FAIL — `SessionCta` not found.

- [ ] **Step 4: Write `SessionCta`, `NavHeader`, `useSessionModel`, and the page**

Wire the export to whatever the existing app already uses for workout export — find it with `grep -rn "export" frontend/src/pages/WorkoutBuilderView.tsx` and reuse that path. Do not write a second exporter.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial && npx tsc -b && npm run lint`
Expected: PASS.

- [ ] **Step 6: Visual check against `get_screenshot('J5FV6')`, expected height 2670.**

- [ ] **Step 7: Commit**

```bash
git add frontend/src/editorial
git commit -m "feat(editorial): Session Detail, with an honest export CTA"
```

---

## Task 13: The two bottom sheets

**Files:**
- Create: `frontend/src/editorial/components/Sheet.tsx`
- Create: `frontend/src/editorial/components/SwitchDayTypeSheet.tsx`
- Create: `frontend/src/editorial/components/BackToSessionDoneSheet.tsx`
- Modify: `frontend/src/editorial/pages/TodayPage.tsx`
- Test: `frontend/src/editorial/__tests__/sheets.test.tsx`

**Interfaces:**
- Consumes: `useDayState().setOverride` (Task 7), `#editorial-sheet-root` (Task 5).
- Produces: `Sheet({ open, onClose, children })` portalling into `#editorial-sheet-root`; `SwitchDayTypeSheet({ open, current, onPick, onClose })` swapping `rest ⇄ training`; `BackToSessionDoneSheet({ open, onConfirm, onClose })` returning `resting → trained`.

**The DayRail's action pill is how the sheet opens.** `DayRail` already accepts
`showSwitchAction` and `onSwapDayType` (Task 6); wire that callback here rather
than inventing a second trigger.

The sheets are the real override mechanism, exactly as designed. The dev picker (behind the same conditions as `/design-lab` — an unauthenticated route, no flag) previews all five states without writing storage.

- [ ] **Step 1: Read both sheet frames**

```
Get('mBvke', { depth: 12, resolveInstances: true, resolveVariables: false })  // Switch Day Type
Get('tEnIQ', { depth: 12, resolveInstances: true, resolveVariables: false })  // Back To Session Done
```
Both are 844 tall — the sheet is the bottom portion over a scrim. Record the scrim opacity, sheet corner radius, handle, padding, and button geometry.

- [ ] **Step 2: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/sheets.test.tsx
import { fireEvent, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BackToSessionDoneSheet from '../components/BackToSessionDoneSheet'
import SwitchDayTypeSheet from '../components/SwitchDayTypeSheet'

function mountPortalTarget() {
  const el = document.createElement('div')
  el.id = 'editorial-sheet-root'
  document.body.appendChild(el)
  return el
}

afterEach(cleanup)

describe('bottom sheets', () => {
  it('SwitchDayTypeSheet offers rest and training and reports the pick', () => {
    mountPortalTarget()
    const onPick = vi.fn()
    render(<SwitchDayTypeSheet open current="rest" onPick={onPick} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /training/i }))
    expect(onPick).toHaveBeenCalledWith('training')
  })

  it('a closed sheet renders nothing', () => {
    mountPortalTarget()
    const { baseElement } = render(<SwitchDayTypeSheet open={false} current="rest" onPick={() => {}} onClose={() => {}} />)
    expect(baseElement.querySelector('[data-sheet]')).toBeNull()
  })

  it('BackToSessionDoneSheet confirms the return to trained', () => {
    mountPortalTarget()
    const onConfirm = vi.fn()
    render(<BackToSessionDoneSheet open onConfirm={onConfirm} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /session done/i }))
    expect(onConfirm).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/sheets.test.tsx`
Expected: FAIL — components not found.

- [ ] **Step 4: Write `Sheet` and both sheets, wire them into `TodayPage`**

The sheet closes on scrim click and on Escape. `onPick` calls `setOverride`, which persists per ISO date and therefore expires at midnight.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial && npx tsc -b`
Expected: PASS.

- [ ] **Step 6: Visual check against `get_screenshot('mBvke')` and `get_screenshot('tEnIQ')`.**

- [ ] **Step 7: Commit**

```bash
git add frontend/src/editorial
git commit -m "feat(editorial): the two bottom sheets that own the day-state override"
```

---

## Task 14: Evening

**Files:**
- Create: `frontend/src/editorial/components/Ledger.tsx`
- Modify: `frontend/src/editorial/pages/TodayPage.tsx`
- Modify: `frontend/src/editorial/data/useTodayModel.ts` (add the energy curve)
- Test: `frontend/src/editorial/__tests__/evening.test.tsx`

**Interfaces:**
- Consumes: `useIntradayDay(iso)` for the hourly energy-out curve, `useTodayModel` for the ride and the sleep target.
- Produces: `Ledger({ rows }: { rows: { label: string; value: Value<string> }[] })`.

Sections: 01 Today / 02 Tonight / 03 Tomorrow. Evening subsumes Trained — its `01 Today` section carries the ride. Built last because it is the most likely to render dashes, and that should be a known outcome rather than a surprise.

**Verify during build:** does `useIntradayDay(todayIso)` return an hourly series that can be read as energy out? Call the endpoint against the local backend first. If it does not, the curve is `missing('No intraday data for today.')` and the section renders the ledger alone. Record the finding in the commit body.

- [ ] **Step 1: Read the frame**

```
Get('KYS6e', { depth: 16, resolveInstances: true, resolveVariables: false })
```

- [ ] **Step 2: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/evening.test.tsx
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Ledger from '../components/Ledger'
import { missing, present } from '../data/value'

afterEach(cleanup)

describe('Ledger', () => {
  it('renders every row, dashing the ones with no reading', () => {
    const { container } = render(<Ledger rows={[
      { label: 'RIDDEN', value: present('72 km') },
      { label: 'SLEEP TARGET', value: missing('No wearable reading since Tue.') },
    ]} />)
    expect(container.querySelectorAll('[data-ledger-row]')).toHaveLength(2)
    expect(screen.getByText('72 km')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('prints each distinct reason once, not per row', () => {
    render(<Ledger rows={[
      { label: 'A', value: missing('No wearable reading since Tue.') },
      { label: 'B', value: missing('No wearable reading since Tue.') },
    ]} />)
    expect(screen.getAllByText('No wearable reading since Tue.')).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/evening.test.tsx`
Expected: FAIL — `Ledger` not found.

- [ ] **Step 4: Write `Ledger` and the Evening screen**

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial && npx tsc -b && npm run lint`
Expected: PASS.

- [ ] **Step 6: Visual check against `get_screenshot('KYS6e')`, expected height 2564.**

- [ ] **Step 7: Commit**

```bash
git add frontend/src/editorial
git commit -m "feat(editorial): the Evening day state, dashes and all"
```

---

## Task 15: Isolation proof and the full gate

**Files:**
- Create: `frontend/src/editorial/__tests__/isolation.test.ts`

**Interfaces:**
- Consumes: the finished tree.
- Produces: an automated proof that the old app cannot be affected by `editorial/`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/editorial/__tests__/isolation.test.ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(__dirname, '..', '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

describe('editorial isolation', () => {
  const all = walk(SRC)
  const outside = all.filter((f) => !f.includes(`${path.sep}editorial${path.sep}`))

  it('nothing outside editorial/ imports from editorial/, except App.tsx', () => {
    const offenders = outside.filter((f) => {
      if (path.basename(f) === 'App.tsx') return false
      return /from\s+['"][^'"]*\/editorial\//.test(readFileSync(f, 'utf8'))
    })
    expect(offenders).toEqual([])
  })

  it('editorial components never import hooks directly — data enters via the view-models', () => {
    const components = all.filter((f) => f.includes(`${path.sep}editorial${path.sep}components${path.sep}`))
    const offenders = components.filter((f) => /from\s+['"].*\/hooks\//.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('editorial declares no raw hex colours — every colour is a token', () => {
    const files = all.filter((f) => f.includes(`${path.sep}editorial${path.sep}`) && !f.endsWith('tokens.css'))
    const offenders = files.filter((f) => /#[0-9a-fA-F]{6}\b/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run test**

Run: `cd frontend && npx vitest run src/editorial/__tests__/isolation.test.ts`
Expected: it may FAIL on the third assertion if any screen inlined a hex. Fix by moving the colour into `tokens.css` — not by loosening the test.

- [ ] **Step 3: Run the complete gate**

Run:
```bash
cd frontend && npx tsc -b && npm run test && npm run build && npm run lint && npm run lint:i18n
```
Expected: all five PASS. Every failure is fixed before this task is done — none are waived.

- [ ] **Step 4: Prove the old app is byte-identical**

Run:
```bash
git diff --stat main -- frontend/src backend | grep -v 'frontend/src/editorial'
```
Expected: exactly one line, `frontend/src/App.tsx`. Anything else is a scope violation — stop and report it.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editorial/__tests__/isolation.test.ts
git commit -m "test(editorial): prove the second design system cannot touch the first"
```

---

## Open questions to resolve during the build

These are flagged rather than guessed. Each has a defined fallback so no task blocks on them.

1. **Plan-vs-ridden block deltas** (Task 9) — fallback: no delta column, `missing('This ride was not matched to its plan.')`.
2. **HR-zone bounds** (Task 9) — fallback: `missing('No HR zones set.')`.
3. **Evening's hourly energy curve** (Task 14) — fallback: `missing('No intraday data for today.')`, ledger renders alone.
4. **Sunset time for Session Detail conditions** (Task 12) — the weather service may not expose it; fallback: omit the sunset chip, keep temperature and wind.
5. **`useActivitiesRange` signature** (Task 7) — confirm before writing `useDayState`; adapt the call, never the contract.
