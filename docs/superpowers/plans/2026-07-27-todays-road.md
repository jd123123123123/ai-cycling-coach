# Today's Road Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Today tab's backdrop into a WebGL landscape whose terrain is the day's prescribed session, whose ground level is the athlete's Critical Power, and whose light is the projected W′-balance.

**Architecture:** All physiology lives in one pure, unit-tested TS module (`roadProfile.ts`) that converts `ResolvedBlock[]` into a sampled terrain + W′bal trace. That profile is uploaded to the GPU as a 1D RGBA data texture and drawn by a new `road` variant of the existing `ShaderCanvas`. Transport reuses the existing `AuraContext` → `DashboardShell` path, which already renders exactly one fullscreen shader canvas behind all of `<main>` — so the whole-page treatment costs one GL context and one RAF loop.

**Tech Stack:** React 18 + TypeScript, raw WebGL 1 (no three.js / OGL / WebGPU), Vitest, Vite.

## Global Constraints

- **Frontend-only.** No backend file may be modified. No new endpoint, model, or migration.
- **No new runtime dependencies.** Raw WebGL 1 on the existing `ShaderCanvas` infrastructure.
- **Honest data only.** Never substitute a default CP, FTP, or W′. Where a value is unknown, render `—` and omit the dependent visual (waterline, matches readout).
- **CP/W′ display gate:** CP and W′ may only be used when `PowerProfile.model_valid === true`. When it is false or absent, treat CP and W′ as `null`.
- **Target viewport 390×844.** Desktop is a sanity check only.
- **Verification is `npx tsc -b`, `npx vitest run`, `npx eslint .` — never a browser.** Do not use Playwright or any browser automation.
- **`prefers-reduced-motion` must freeze ambient motion** but must not disable scrubbing.
- **The canvas stays `aria-hidden="true"`.** All information must also exist in DOM text.
- Commit after every task. Run all commands from `frontend/`.

---

### Task 1: Block expansion — `ResolvedBlock[]` → 1 Hz power steps

The first half of the pure module. A structured set (`30×15/45s`) is ONE `ResolvedBlock` but physically 30 reps of on/off. Expanding it into real terrain spikes is the case where the road most obviously beats a block list.

**Files:**
- Create: `frontend/src/utils/roadProfile.ts`
- Test: `frontend/src/utils/__tests__/roadProfile.test.ts`

**Interfaces:**
- Consumes: `ResolvedBlock` from `frontend/src/api/coach.ts` (already exists; do not modify it).
- Produces:
  ```ts
  export interface PowerStep { watts: number; zone: number; durationS: number; blockIndex: number }
  export function zoneForPctFtp(pct: number): number
  export function expandBlocks(blocks: ResolvedBlock[]): PowerStep[]
  ```

- [ ] **Step 1: Write the failing test**

Create `frontend/src/utils/__tests__/roadProfile.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { expandBlocks, zoneForPctFtp, type PowerStep } from '../roadProfile'
import type { ResolvedBlock } from '../../api/coach'

/** Minimal steady block; override what a test cares about. */
function block(over: Partial<ResolvedBlock> = {}): ResolvedBlock {
  return {
    name: 'Block', duration_s: 600,
    target_watts_low: 200, target_watts_high: 220, target_pct_ftp: 70,
    zone: 2, rpe: 4, cadence_low: null, cadence_high: null,
    target_hr_low: null, target_hr_high: null,
    ...over,
  }
}

describe('zoneForPctFtp', () => {
  it('maps Coggan boundaries', () => {
    expect(zoneForPctFtp(50)).toBe(1)
    expect(zoneForPctFtp(70)).toBe(2)
    expect(zoneForPctFtp(85)).toBe(3)
    expect(zoneForPctFtp(100)).toBe(4)
    expect(zoneForPctFtp(115)).toBe(5)
    expect(zoneForPctFtp(140)).toBe(6)
    expect(zoneForPctFtp(200)).toBe(7)
  })
})

describe('expandBlocks', () => {
  it('emits one step per steady block, watts averaged from the target range', () => {
    const steps = expandBlocks([block(), block({ target_watts_low: 300, target_watts_high: 320, zone: 4 })])
    expect(steps).toEqual<PowerStep[]>([
      { watts: 210, zone: 2, durationS: 600, blockIndex: 0 },
      { watts: 310, zone: 4, durationS: 600, blockIndex: 1 },
    ])
  })

  it('expands a structured set into reps × (on, off) steps', () => {
    const steps = expandBlocks([block({
      duration_s: 600, target_watts_low: 400, target_watts_high: 420, zone: 6,
      reps: 10, on_s: 15, off_s: 45,
      off_watts_low: 100, off_watts_high: 120, off_pct_ftp: 40,
    })])
    expect(steps).toHaveLength(20)
    expect(steps[0]).toEqual({ watts: 410, zone: 6, durationS: 15, blockIndex: 0 })
    expect(steps[1]).toEqual({ watts: 110, zone: 1, durationS: 45, blockIndex: 0 })
    // Invariant from the ResolvedBlock docs: reps × (on_s + off_s) === duration_s
    expect(steps.reduce((s, x) => s + x.durationS, 0)).toBe(600)
  })

  it('falls back to a steady step when a set lacks off watts', () => {
    const steps = expandBlocks([block({ reps: 10, on_s: 15, off_s: 45, off_watts_low: null, off_watts_high: null })])
    expect(steps).toEqual([{ watts: 210, zone: 2, durationS: 600, blockIndex: 0 }])
  })

  it('drops non-positive durations and returns [] for no blocks', () => {
    expect(expandBlocks([])).toEqual([])
    expect(expandBlocks([block({ duration_s: 0 })])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/utils/__tests__/roadProfile.test.ts`
Expected: FAIL — cannot resolve `../roadProfile`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/utils/roadProfile.ts`:

```ts
/**
 * roadProfile — the physiology behind "Today's Road".
 *
 * Converts the day's prescribed blocks into a terrain profile plus a forward
 * W′-balance projection. Pure: no React, no network, no GL. The shader draws
 * only what this module produces, so every physiological decision is testable
 * here.
 *
 * Ground level is Critical Power: above CP the athlete spends W′ (a climb),
 * below CP it reconstitutes (a descent). See
 * docs/superpowers/specs/2026-07-27-todays-road-design.md.
 */
import type { ResolvedBlock } from '../api/coach'

/** One constant-power segment of the session, already set-expanded. */
export interface PowerStep {
  watts: number
  zone: number
  durationS: number
  blockIndex: number
}

/** Coggan zone boundaries by % of FTP. Display-only (terrain tint). */
export function zoneForPctFtp(pct: number): number {
  if (pct <= 55) return 1
  if (pct <= 75) return 2
  if (pct <= 90) return 3
  if (pct <= 105) return 4
  if (pct <= 120) return 5
  if (pct <= 150) return 6
  return 7
}

const mid = (lo: number, hi: number) => (lo + hi) / 2

/**
 * Expand blocks into constant-power steps, turning structured sets into their
 * real reps. A set whose off-watts are unknown stays one steady step rather
 * than inventing a recovery power.
 */
export function expandBlocks(blocks: ResolvedBlock[]): PowerStep[] {
  const steps: PowerStep[] = []
  blocks.forEach((b, blockIndex) => {
    if (!(b.duration_s > 0)) return
    const onWatts = mid(b.target_watts_low, b.target_watts_high)
    const reps = b.reps ?? 0
    const onS = b.on_s ?? 0
    const offS = b.off_s ?? 0
    const offLo = b.off_watts_low
    const offHi = b.off_watts_high
    const isSet = reps > 0 && onS > 0 && offS > 0 && offLo != null && offHi != null

    if (!isSet) {
      steps.push({ watts: onWatts, zone: b.zone, durationS: b.duration_s, blockIndex })
      return
    }
    const offWatts = mid(offLo, offHi)
    const offZone = b.off_pct_ftp != null ? zoneForPctFtp(b.off_pct_ftp) : b.zone
    for (let i = 0; i < reps; i++) {
      steps.push({ watts: onWatts, zone: b.zone, durationS: onS, blockIndex })
      steps.push({ watts: offWatts, zone: offZone, durationS: offS, blockIndex })
    }
  })
  return steps
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/utils/__tests__/roadProfile.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/utils/roadProfile.ts src/utils/__tests__/roadProfile.test.ts
git commit -m "feat(today): expand prescribed blocks into road power steps"
```

---

### Task 2: Forward W′-balance projection and resampling

The second half of the pure module: integrate W′bal at 1 Hz using the same Skiba differential model as `backend/app/services/w_balance.py`, then resample to ≤512 points while always preserving the global minimum (the same rule `wbal_trace.downsample` applies — the deepest point is the headline and must never be smoothed away).

**Files:**
- Modify: `frontend/src/utils/roadProfile.ts`
- Test: `frontend/src/utils/__tests__/roadProfile.test.ts`

**Interfaces:**
- Consumes: `PowerStep`, `expandBlocks` from Task 1.
- Produces:
  ```ts
  export interface RoadSample { t: number; watts: number; zone: number; wbal: number | null; blockIndex: number }
  export interface RoadProfile {
    samples: RoadSample[]
    cp: number | null
    wPrime: number | null
    minWbal: number | null
    totalDurationS: number
  }
  export const MAX_SAMPLES = 512
  export function wPrimeBalance(power: number[], cp: number, wPrime: number): number[]
  export function buildRoadProfile(
    blocks: ResolvedBlock[],
    power: { cp: number | null; wPrime: number | null },
  ): RoadProfile
  export function steadyBlock(durationMin: number | null | undefined, targetWatts: number | null | undefined): ResolvedBlock | null
  ```

`steadyBlock` covers spec §6 row 3: a day with a planned duration and target but no `interval_structure` still gets a road (a gentle rolling one), while a day missing either value gets none.

- [ ] **Step 1: Write the failing test**

In `frontend/src/utils/__tests__/roadProfile.test.ts`, **extend the existing `../roadProfile` import** to also pull in `buildRoadProfile`, `wPrimeBalance`, `MAX_SAMPLES` and `steadyBlock` (do not add a second import statement from the same module — `no-duplicate-imports` will reject it), then append:

```ts
describe('wPrimeBalance', () => {
  it('spends W above CP, joule for joule', () => {
    // 10 s at 350 W with CP 250 spends 10 × 100 J = 1000 J.
    const out = wPrimeBalance(Array(10).fill(350), 250, 20000)
    expect(out).toHaveLength(10)
    expect(out[9]).toBeCloseTo(19000, 6)
  })

  it('reconstitutes below CP without ever exceeding W prime', () => {
    const spent = wPrimeBalance(Array(60).fill(400), 250, 20000)
    const recovered = wPrimeBalance(Array(600).fill(100), 250, 20000)
    expect(spent[59]).toBeLessThan(20000)
    // Starting full and soft-pedalling can never overfill the tank.
    expect(Math.max(...recovered)).toBeLessThanOrEqual(20000)
  })

  it('goes negative on exhaustion (models task failure)', () => {
    const out = wPrimeBalance(Array(400).fill(400), 250, 20000)
    expect(out[399]).toBeLessThan(0)
  })
})

describe('buildRoadProfile', () => {
  const hard = [block({ duration_s: 300, target_watts_low: 200, target_watts_high: 200, zone: 2 }),
                block({ duration_s: 240, target_watts_low: 330, target_watts_high: 330, zone: 4 }),
                block({ duration_s: 300, target_watts_low: 150, target_watts_high: 150, zone: 1 })]

  it('reports total duration and caps sample count', () => {
    const p = buildRoadProfile(hard, { cp: 250, wPrime: 20000 })
    expect(p.totalDurationS).toBe(840)
    expect(p.samples.length).toBeGreaterThan(1)
    expect(p.samples.length).toBeLessThanOrEqual(MAX_SAMPLES)
    expect(p.samples[0].t).toBe(0)
    expect(p.samples[p.samples.length - 1].t).toBeCloseTo(1, 6)
  })

  it('drains W prime on the threshold block and refills it after', () => {
    const p = buildRoadProfile(hard, { cp: 250, wPrime: 20000 })
    expect(p.minWbal).not.toBeNull()
    expect(p.minWbal!).toBeLessThan(20000)
    const last = p.samples[p.samples.length - 1].wbal!
    expect(last).toBeGreaterThan(p.minWbal!)
  })

  it('preserves the deepest W prime point through resampling', () => {
    const p = buildRoadProfile(hard, { cp: 250, wPrime: 20000 })
    const lowest = Math.min(...p.samples.map((s) => s.wbal!))
    expect(lowest).toBeCloseTo(p.minWbal!, 6)
  })

  it('still renders terrain but no W prime when CP is unknown', () => {
    const p = buildRoadProfile(hard, { cp: null, wPrime: null })
    expect(p.samples.length).toBeGreaterThan(1)
    expect(p.samples.every((s) => s.wbal === null)).toBe(true)
    expect(p.minWbal).toBeNull()
    expect(p.cp).toBeNull()
    expect(p.samples.some((s) => s.watts === 330)).toBe(true)
  })

  it('returns an empty profile for no blocks', () => {
    const p = buildRoadProfile([], { cp: 250, wPrime: 20000 })
    expect(p.samples).toEqual([])
    expect(p.totalDurationS).toBe(0)
    expect(p.minWbal).toBeNull()
  })
})

describe('steadyBlock', () => {
  it('builds one honest steady block from a duration and a target', () => {
    const b = steadyBlock(90, 200)!
    expect(b.duration_s).toBe(5400)
    expect(b.target_watts_low).toBe(200)
    expect(b.target_watts_high).toBe(200)
    expect(b.reps ?? null).toBeNull()
  })

  it('refuses to invent a road without both a duration and a target', () => {
    expect(steadyBlock(90, null)).toBeNull()
    expect(steadyBlock(null, 200)).toBeNull()
    expect(steadyBlock(0, 200)).toBeNull()
  })

  it('feeds a profile that still drains nothing below CP', () => {
    const p = buildRoadProfile([steadyBlock(60, 200)!], { cp: 250, wPrime: 20000 })
    expect(p.samples.length).toBeGreaterThan(1)
    expect(p.minWbal).toBeCloseTo(20000, 0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/utils/__tests__/roadProfile.test.ts`
Expected: FAIL — `buildRoadProfile is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `frontend/src/utils/roadProfile.ts`:

```ts
/** One terrain sample. `wbal` is null whenever CP/W′ are unknown. */
export interface RoadSample {
  /** Normalized session time, 0..1. */
  t: number
  watts: number
  zone: number
  /** Joules of W′ remaining at this point; null when CP/W′ unknown. */
  wbal: number | null
  blockIndex: number
}

export interface RoadProfile {
  samples: RoadSample[]
  cp: number | null
  wPrime: number | null
  /** Deepest W′ reached; null when CP/W′ unknown. */
  minWbal: number | null
  totalDurationS: number
}

export const MAX_SAMPLES = 512
/** Pathological-input guard: never integrate more than 6 h of 1 Hz samples. */
const MAX_SECONDS = 21600

/**
 * Per-second W′-balance (joules remaining), starting full at W′.
 * Skiba, Clarke, Vanhatalo & Jones (2015) differential model — a direct port of
 * `backend/app/services/w_balance.py::w_prime_balance` so the forward
 * projection and the post-ride trace never disagree.
 */
export function wPrimeBalance(power: number[], cp: number, wPrime: number): number[] {
  let bal = wPrime
  const out: number[] = []
  for (const p of power) {
    if (p > cp) {
      bal -= p - cp
    } else {
      bal += ((wPrime - bal) * (cp - p)) / wPrime
      if (bal > wPrime) bal = wPrime
    }
    out.push(bal)
  }
  return out
}

/** Evenly-spaced indices over [0, n-1], always including both ends. */
function evenIndices(n: number, count: number): number[] {
  if (n <= count) return Array.from({ length: n }, (_, i) => i)
  const out: number[] = []
  for (let k = 0; k < count; k++) out.push(Math.round((k * (n - 1)) / (count - 1)))
  return out
}

/**
 * Build the day's road: set-expanded terrain plus the forward W′ projection.
 * Passing `cp: null` (which the caller must do whenever `model_valid` is false)
 * yields terrain with no W′ — never a substituted default.
 */
export function buildRoadProfile(
  blocks: ResolvedBlock[],
  power: { cp: number | null; wPrime: number | null },
): RoadProfile {
  const steps = expandBlocks(blocks)
  const cp = power.cp != null && power.cp > 0 ? power.cp : null
  const wPrime = power.wPrime != null && power.wPrime > 0 ? power.wPrime : null
  const totalDurationS = steps.reduce((s, x) => s + x.durationS, 0)

  if (steps.length === 0 || totalDurationS <= 0) {
    return { samples: [], cp, wPrime, minWbal: null, totalDurationS: 0 }
  }

  // Flatten to 1 Hz so the W′ integration matches the backend's assumptions.
  const watts: number[] = []
  const zones: number[] = []
  const owners: number[] = []
  for (const s of steps) {
    const secs = Math.max(1, Math.round(s.durationS))
    for (let i = 0; i < secs && watts.length < MAX_SECONDS; i++) {
      watts.push(s.watts)
      zones.push(s.zone)
      owners.push(s.blockIndex)
    }
  }

  const wbal = cp != null && wPrime != null ? wPrimeBalance(watts, cp, wPrime) : null
  const minWbal = wbal != null && wbal.length > 0 ? Math.min(...wbal) : null

  // Resample, always keeping the deepest W′ point — it is the headline.
  const keep = new Set(evenIndices(watts.length, MAX_SAMPLES))
  if (wbal != null && minWbal != null) keep.add(wbal.indexOf(minWbal))
  const idx = [...keep].sort((a, b) => a - b)

  const span = Math.max(1, watts.length - 1)
  const samples: RoadSample[] = idx.map((i) => ({
    t: i / span,
    watts: watts[i],
    zone: zones[i],
    wbal: wbal != null ? wbal[i] : null,
    blockIndex: owners[i],
  }))

  return { samples, cp, wPrime, minWbal, totalDurationS }
}

/**
 * A single steady block synthesized from a planned duration + target watts, for
 * days that have a session but no `interval_structure`. Returns null unless
 * BOTH values are real — a road is never invented from a guess.
 * The terrain reads as a gentle rolling road because the shader's fbm grain is
 * the only relief on a constant-power profile.
 */
export function steadyBlock(
  durationMin: number | null | undefined,
  targetWatts: number | null | undefined,
): ResolvedBlock | null {
  if (durationMin == null || targetWatts == null) return null
  if (!(durationMin > 0) || !(targetWatts > 0)) return null
  return {
    name: '', duration_s: Math.round(durationMin * 60),
    target_watts_low: targetWatts, target_watts_high: targetWatts,
    target_pct_ftp: 0, zone: 2, rpe: 4,
    cadence_low: null, cadence_high: null,
    target_hr_low: null, target_hr_high: null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/utils/__tests__/roadProfile.test.ts`
Expected: PASS — 14 tests.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/utils/roadProfile.ts src/utils/__tests__/roadProfile.test.ts
git commit -m "feat(today): forward W-prime projection for the day's road"
```

---

### Task 3: Terrain-mode mapping per flagship state

A pure mapping from the six existing flagship states to the six landscapes. No new state machine — this consumes `flagshipState()` output.

**Files:**
- Create: `frontend/src/utils/roadMode.ts`
- Test: `frontend/src/utils/__tests__/roadMode.test.ts`

**Interfaces:**
- Consumes: `FlagshipState` from `frontend/src/components/dashboard/tabs/TodayTab.tsx` (already exported at line 62).
- Produces:
  ```ts
  export type RoadMode = 'prescribed' | 'ridden' | 'flat-calm' | 'flat-done' | 'flat-unlit' | 'bare'
  export function roadMode(state: FlagshipState, opts: { hasProfile: boolean; hasRidden: boolean }): RoadMode
  export function roadModeIndex(mode: RoadMode): number
  ```

- [ ] **Step 1: Write the failing test**

Create `frontend/src/utils/__tests__/roadMode.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { roadMode, roadModeIndex, type RoadMode } from '../roadMode'

const opts = (hasProfile: boolean, hasRidden = false) => ({ hasProfile, hasRidden })

describe('roadMode', () => {
  it('draws the prescribed terrain when work is planned and a profile exists', () => {
    expect(roadMode('ready', opts(true))).toBe('prescribed')
    expect(roadMode('controlled', opts(true))).toBe('prescribed')
  })

  it('falls back to a bare horizon rather than inventing a workout', () => {
    expect(roadMode('ready', opts(false))).toBe('bare')
    expect(roadMode('controlled', opts(false))).toBe('bare')
    expect(roadMode('pending', opts(true))).toBe('bare')
  })

  it('shows the road NOT being ridden on a recommended rest day', () => {
    expect(roadMode('rest', opts(true))).toBe('flat-unlit')
    expect(roadMode('rest', opts(false))).toBe('flat-unlit')
  })

  it('shows a calm valley on planned rest', () => {
    expect(roadMode('planned-rest', opts(true))).toBe('flat-calm')
  })

  it('shows the road actually ridden after a session, else a done landscape', () => {
    expect(roadMode('post', opts(true, true))).toBe('ridden')
    expect(roadMode('post', opts(true, false))).toBe('flat-done')
  })
})

describe('roadModeIndex', () => {
  it('gives every mode a distinct, stable shader index', () => {
    const modes: RoadMode[] = ['prescribed', 'ridden', 'flat-calm', 'flat-done', 'flat-unlit', 'bare']
    expect(modes.map(roadModeIndex)).toEqual([0, 1, 2, 3, 4, 5])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/utils/__tests__/roadMode.test.ts`
Expected: FAIL — cannot resolve `../roadMode`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/utils/roadMode.ts`:

```ts
/**
 * roadMode — which landscape Today's Road draws, derived from the SAME
 * flagship state the rest of the Today tab already uses. Never invents a
 * workout: without a real profile the road degrades to a bare horizon.
 */
import type { FlagshipState } from '../components/dashboard/tabs/TodayTab'

export type RoadMode =
  | 'prescribed'   // the terrain of today's planned session
  | 'ridden'       // the road actually ridden (real power stream)
  | 'flat-calm'    // planned rest — a calm valley, no waterline
  | 'flat-done'    // trained today, but no stream to draw
  | 'flat-unlit'   // rest recommended — the road ahead deliberately unlit
  | 'bare'         // nothing honest to draw

export function roadMode(
  state: FlagshipState,
  opts: { hasProfile: boolean; hasRidden: boolean },
): RoadMode {
  switch (state) {
    case 'pending': return 'bare'
    case 'rest': return 'flat-unlit'
    case 'planned-rest': return 'flat-calm'
    case 'post': return opts.hasRidden ? 'ridden' : 'flat-done'
    case 'ready':
    case 'controlled': return opts.hasProfile ? 'prescribed' : 'bare'
  }
}

const ORDER: RoadMode[] = ['prescribed', 'ridden', 'flat-calm', 'flat-done', 'flat-unlit', 'bare']

/** Stable float index handed to the shader as u_mode. */
export function roadModeIndex(mode: RoadMode): number {
  return ORDER.indexOf(mode)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/utils/__tests__/roadMode.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/utils/roadMode.ts src/utils/__tests__/roadMode.test.ts
git commit -m "feat(today): map flagship states to road landscapes"
```

---

### Task 4: Extend ShaderCanvas with float uniforms and a data texture

`ShaderCanvas` currently uploads colour uniforms only. The road needs scalar uniforms (`u_travel`, `u_mode`, `u_hasRoad`, `u_waterline`) and a 1D RGBA data texture. Extend it without breaking the three existing variants.

**Files:**
- Modify: `frontend/src/components/wrapped/ShaderCanvas.tsx`
- Test: `frontend/src/components/wrapped/__tests__/shaderCanvasUniforms.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ShaderVariant = 'iri' | 'topo' | 'burst' | 'aura' | 'road'
  export interface ShaderUniforms { [name: string]: string | number }
  /** Packed RGBA bytes + width, uploaded as a width×1 texture on unit 0. */
  export interface ShaderTexture { data: Uint8Array; width: number }
  export function packRoadTexture(profile: RoadProfile): ShaderTexture
  // ShaderCanvas props gain: texture?: ShaderTexture | null
  ```

The existing `COLOR_UNIFORMS` map keeps naming colour uniforms; every OTHER key in `uniforms` whose value is a `number` is uploaded via `uniform1f`.

- [ ] **Step 1: Write the failing test**

`packRoadTexture` is the only part with real logic worth testing directly; GL upload is covered by the fallback test in Task 6.

Create `frontend/src/components/wrapped/__tests__/shaderCanvasUniforms.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { packRoadTexture } from '../ShaderCanvas'
import { buildRoadProfile } from '../../../utils/roadProfile'
import type { ResolvedBlock } from '../../../api/coach'

function block(over: Partial<ResolvedBlock> = {}): ResolvedBlock {
  return {
    name: 'B', duration_s: 300,
    target_watts_low: 250, target_watts_high: 250, target_pct_ftp: 100,
    zone: 4, rpe: 6, cadence_low: null, cadence_high: null,
    target_hr_low: null, target_hr_high: null, ...over,
  }
}

describe('packRoadTexture', () => {
  it('packs one RGBA texel per sample', () => {
    const p = buildRoadProfile([block()], { cp: 250, wPrime: 20000 })
    const tex = packRoadTexture(p)
    expect(tex.width).toBe(p.samples.length)
    expect(tex.data).toHaveLength(p.samples.length * 4)
  })

  it('puts watts/CP in R at the waterline for a block ridden exactly at CP', () => {
    const p = buildRoadProfile([block()], { cp: 250, wPrime: 20000 })
    const tex = packRoadTexture(p)
    // R encodes watts/cp over the range 0..2 → CP itself lands mid-scale.
    expect(tex.data[0]).toBeGreaterThanOrEqual(126)
    expect(tex.data[0]).toBeLessThanOrEqual(129)
  })

  it('reports a full tank in B when CP is unknown rather than a fake drain', () => {
    const p = buildRoadProfile([block()], { cp: null, wPrime: null })
    const tex = packRoadTexture(p)
    expect(tex.data[2]).toBe(255)
  })

  it('returns a 1-texel neutral texture for an empty profile', () => {
    const p = buildRoadProfile([], { cp: 250, wPrime: 20000 })
    const tex = packRoadTexture(p)
    expect(tex.width).toBe(1)
    expect(tex.data).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/wrapped/__tests__/shaderCanvasUniforms.test.ts`
Expected: FAIL — `packRoadTexture` is not exported from `../ShaderCanvas`.

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/components/wrapped/ShaderCanvas.tsx`:

Add the import at the top, next to the existing imports:

```ts
import type { RoadProfile } from '../../utils/roadProfile'
```

Change the variant union (line 21) to include `road`:

```ts
export type ShaderVariant = 'iri' | 'topo' | 'burst' | 'aura' | 'road'
```

Add after the `ShaderUniforms` interface:

```ts
/** Packed RGBA bytes for a width×1 data texture (GL texture unit 0). */
export interface ShaderTexture { data: Uint8Array; width: number }

/** Height scale: R encodes watts/CP across 0..2, so CP lands mid-scale. */
const HEIGHT_RANGE = 2

/**
 * Pack a road profile into a width×1 RGBA texture:
 *   R = watts / CP over 0..2   (1.0 → 128 = the CP waterline)
 *   G = zone / 7               (terrain tint)
 *   B = W′bal / W′             (255 when CP/W′ unknown — a full tank is the
 *                               honest neutral; the shader hides the battery
 *                               entirely in that case via u_waterline = 0)
 *   A = blockIndex / 255       (scrub → block mapping)
 * With no CP, height falls back to watts against the session's own peak so the
 * terrain still shows relative effort — but never against an invented CP.
 */
export function packRoadTexture(profile: RoadProfile): ShaderTexture {
  const n = profile.samples.length
  if (n === 0) return { data: new Uint8Array([128, 0, 255, 0]), width: 1 }

  const peak = Math.max(...profile.samples.map((s) => s.watts), 1)
  const ref = profile.cp ?? peak
  const wPrime = profile.wPrime
  const data = new Uint8Array(n * 4)

  profile.samples.forEach((s, i) => {
    const h = Math.min(s.watts / ref, HEIGHT_RANGE) / HEIGHT_RANGE
    const bal = s.wbal != null && wPrime != null ? Math.max(0, Math.min(1, s.wbal / wPrime)) : 1
    data[i * 4 + 0] = Math.round(h * 255)
    data[i * 4 + 1] = Math.round((Math.min(s.zone, 7) / 7) * 255)
    data[i * 4 + 2] = Math.round(bal * 255)
    data[i * 4 + 3] = Math.min(255, s.blockIndex)
  })
  return { data, width: n }
}
```

Add `road` to `COLOR_UNIFORMS` (its colour uniforms; the fragment source arrives in Task 5):

```ts
  road: ['u_aura', 'u_bg'],
```

Add a placeholder `road` entry to `FRAG` so the file type-checks until Task 5 replaces it:

```ts
  road: FRAG_ROAD,
```

and immediately above the `FRAG` object add:

```ts
// Replaced with the real terrain shader in the next task.
const FRAG_ROAD = FRAG_AURA_PLACEHOLDER
```

where `FRAG_AURA_PLACEHOLDER` is simply the existing `aura` source string extracted to a `const` above `FRAG` so both can reference it. (Extract the current `aura: \`...\`` body into `const FRAG_AURA = \`...\`` and use `aura: FRAG_AURA`.)

Extend `Props`:

```ts
interface Props {
  variant: ShaderVariant
  uniforms: ShaderUniforms
  /** Optional width×1 RGBA data texture, bound to unit 0 as `u_data`. */
  texture?: ShaderTexture | null
  className?: string
  style?: React.CSSProperties
}
```

In the component signature take `texture`, and add a ref that tracks it alongside `uniformsRef`:

```ts
export default function ShaderCanvas({ variant, uniforms, texture, className, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const uniformsRef = useRef(uniforms)
  uniformsRef.current = uniforms
  const textureRef = useRef(texture)
  textureRef.current = texture
```

Inside the `useEffect`, after `const colorLocs = ...`, add scalar-uniform and texture setup:

```ts
    // Every non-colour numeric uniform is uploaded as a float by name.
    const scalarLocs = new Map<string, WebGLUniformLocation | null>()
    const scalarNames = Object.keys(uniforms).filter(
      (n) => !COLOR_UNIFORMS[variant].includes(n) && typeof uniforms[n] === 'number',
    )
    scalarNames.forEach((n) => scalarLocs.set(n, gl.getUniformLocation(prog, n)))

    const uData = gl.getUniformLocation(prog, 'u_data')
    const uDataW = gl.getUniformLocation(prog, 'u_dataW')
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    let uploadedWidth = -1
```

In `render`, after the colour-uniform loop, add:

```ts
      scalarNames.forEach((n) => {
        const v = uniformsRef.current[n]
        const loc = scalarLocs.get(n)
        if (typeof v === 'number' && loc) gl.uniform1f(loc, v)
      })
      const t = textureRef.current
      if (t && uData) {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, tex)
        // Re-upload only when the profile itself changed, not every frame.
        if (uploadedWidth !== t.width) {
          gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t.width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, t.data)
          uploadedWidth = t.width
        }
        gl.uniform1i(uData, 0)
        if (uDataW) gl.uniform1f(uDataW, t.width)
      }
```

Note the re-upload guard keys on width only; Task 6 forces a fresh upload on profile change by remounting via a `key`. In the cleanup function add `gl.deleteTexture(tex)`.

Finally, cap the device-pixel ratio lower for the terrain pass (spec §8) — replace the existing `const dpr = Math.min(window.devicePixelRatio || 1, 2)` line with:

```ts
    // The terrain pass is heavier per-fragment than the gradient variants, so
    // it renders at a lower DPR cap to hold 60 fps on a phone.
    const dpr = Math.min(window.devicePixelRatio || 1, variant === 'road' ? 1.5 : 2)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/wrapped/__tests__/shaderCanvasUniforms.test.ts && npx tsc -b`
Expected: PASS — 4 tests, and a clean type-check.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/wrapped/ShaderCanvas.tsx src/components/wrapped/__tests__/shaderCanvasUniforms.test.ts
git commit -m "feat(shader): float uniforms + 1D data texture support"
```

---

### Task 5: The road shader

The terrain pass. Ground level is the CP waterline; above it is a climb, below it a descent. The sky reuses the existing aura treatment so the state colour still tints the whole screen.

**Files:**
- Create: `frontend/src/shaders/todays-road.glsl` (design-provenance source)
- Modify: `frontend/src/components/wrapped/ShaderCanvas.tsx` (replace the `FRAG_ROAD` placeholder)

**Interfaces:**
- Consumes: the texture layout and uniform names from Task 4 (`u_data`, `u_dataW`, `u_travel`, `u_mode`, `u_hasRoad`, `u_waterline`, `u_aura`, `u_bg`).
- Produces: no TS surface — this task is shader source only.

- [ ] **Step 1: Write the shader provenance source**

Create `frontend/src/shaders/todays-road.glsl`:

```glsl
// todays-road.glsl — the Today tab's landscape.
//
// The terrain IS the day's prescribed session and ground level IS Critical
// Power: above the waterline the athlete spends W′ (a climb), below it the
// reserve reconstitutes (a descent). That is the Skiba differential model
// rendered as gravity — see
// docs/superpowers/specs/2026-07-27-todays-road-design.md.
//
// The shader performs NO physiology. It draws what the data texture says;
// roadProfile.ts owns every physiological decision.
//
// Data texture (width×1, RGBA), packed by packRoadTexture():
//   R = watts / CP over 0..2  (0.5 = the CP waterline)
//   G = zone / 7
//   B = W′bal / W′
//   A = blockIndex / 255
//
// u_mode: 0 prescribed · 1 ridden · 2 flat-calm · 3 flat-done · 4 flat-unlit
//         · 5 bare  (see roadMode.ts — the indices must stay in sync)
//
// NOTE: the app compiles shaders from inline strings, so the runtime copy
// lives in ShaderCanvas.tsx as the `road` variant. That port is IDENTICAL
// except it uses the shared u_res / hash / fbm helpers from COMMON.

/** @resolution */
uniform vec2 u_resolution;
/** @time */
uniform float u_time;
/** @label Base @color @default #0A0C0F */
uniform vec3 u_bg;
/** @label Aura @color @default #16E08A */
uniform vec3 u_aura;

uniform sampler2D u_data;
uniform float u_dataW;
uniform float u_travel;     // scrub position, 0..1
uniform float u_mode;       // roadModeIndex()
uniform float u_hasRoad;    // 0 = draw no terrain at all
uniform float u_waterline;  // 0 = CP unknown → never draw the waterline

const float HORIZON = 0.42;  // screen y of the CP waterline
const float RELIEF  = 0.30;  // vertical scale of one full CP of relief

float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}

/** Terrain surface height (screen y) at horizontal position x. */
float surfaceAt(float x, out float zone, out float bal){
  vec4 s = texture2D(u_data, vec2(clamp(x, 0.0, 1.0), 0.5));
  zone = s.g;
  bal  = s.b;
  // Flat modes ignore the profile entirely — a calm valley at the waterline.
  float flat = step(1.5, u_mode);
  float h = mix(s.r, 0.5, flat);
  return HORIZON + (h - 0.5) * RELIEF * 2.0;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;

  float zone = 0.0, bal = 1.0;
  float surf = surfaceAt(uv.x, zone, bal);

  // ── Sky: the existing readiness aura, blooming from behind the ring ──────
  vec3 light = mix(u_aura, vec3(1.0, 0.98, 0.94), 0.60);
  vec3 deep  = mix(u_aura, u_bg, 0.30);
  vec2 c = vec2(0.5, 0.72);
  vec2 p = (uv - c) * vec2(u_resolution.x / u_resolution.y, 1.0);
  float r = length(p);
  float t = u_time * 0.05;
  vec2 q = vec2(fbm(p * 1.7 + t), fbm(p * 1.7 + vec2(2.7, 1.9) - t));
  float flow = fbm(p * 1.7 + 1.3 * q);
  float breath = 0.5 + 0.5 * sin(u_time * 0.6);
  float field = pow(smoothstep(1.02, 0.0, r), 1.3);
  float crown = smoothstep(0.60, 0.0, r);

  vec3 sky = u_bg;
  vec3 aura = mix(deep, u_aura, clamp(flow * 1.2 + 0.18, 0.0, 1.0));
  aura = mix(aura, light, clamp(crown * 0.9 + flow * 0.22, 0.0, 1.0));
  sky = mix(sky, aura, (0.60 + 0.20 * breath) * field);
  sky += light * crown * (0.16 + 0.10 * breath);

  vec3 col = sky;

  if (u_hasRoad > 0.5) {
    // ── Ground ────────────────────────────────────────────────────────────
    float ground = smoothstep(surf + 0.004, surf - 0.004, uv.y);
    float depth = clamp((surf - uv.y) * 3.0, 0.0, 1.0);

    // Zone tint: cool at endurance, hot at threshold and above.
    vec3 cool = mix(u_bg, u_aura, 0.35);
    vec3 hot  = mix(u_aura, vec3(1.0, 0.42, 0.24), 0.55);
    vec3 land = mix(cool, hot, smoothstep(0.35, 0.75, zone));
    // W′ remaining dims the road: an emptying tank literally darkens the way.
    land *= mix(0.42, 1.0, bal);
    land *= mix(1.0, 0.55, depth);            // falls into shadow with depth
    land += 0.05 * fbm(vec2(uv.x * 34.0, uv.y * 12.0)); // road grain

    // Unlit rest day: the road is there, you are just not riding it.
    land = mix(land, mix(u_bg, land, 0.30), step(3.5, u_mode) * step(u_mode, 4.5));

    // Ridge highlight where the surface meets the sky.
    float ridge = smoothstep(0.010, 0.0, abs(uv.y - surf));
    land += light * ridge * 0.55;

    col = mix(col, land, ground);

    // ── The CP waterline ──────────────────────────────────────────────────
    // Only ever drawn when CP is actually known.
    float wl = smoothstep(0.0018, 0.0, abs(uv.y - HORIZON));
    col += vec3(1.0) * wl * 0.30 * u_waterline;

    // ── The rider ─────────────────────────────────────────────────────────
    float sTravel;
    float zTravel, bTravel;
    sTravel = surfaceAt(u_travel, zTravel, bTravel);
    vec2 rider = vec2(u_travel, sTravel + 0.012);
    float dr = length((uv - rider) * vec2(u_resolution.x / u_resolution.y, 1.0));
    col += light * pow(smoothstep(0.10, 0.0, dr), 2.0) * (0.55 + 0.25 * breath);
    col += vec3(1.0) * smoothstep(0.011, 0.0, dr);
  }

  // Settle toward the app chrome at the very bottom so cards keep contrast.
  col *= smoothstep(-0.15, 0.30, uv.y) * 0.34 + 0.66;
  col += (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.016;
  gl_FragColor = vec4(col, 1.0);
}
```

- [ ] **Step 2: Port it into ShaderCanvas**

In `frontend/src/components/wrapped/ShaderCanvas.tsx`, replace the Task-4 placeholder line

```ts
const FRAG_ROAD = FRAG_AURA_PLACEHOLDER
```

with the real source. It is the GLSL above with these mechanical changes: drop the `/** @… */` annotation comments and the `uniform vec2 u_resolution;` / `uniform float u_time;` declarations and the local `hash`/`noise`/`fbm` definitions (all supplied by `COMMON`), and rename `u_resolution` → `u_res` throughout:

```ts
const FRAG_ROAD = `${COMMON}
uniform vec3 u_aura; uniform vec3 u_bg;
uniform sampler2D u_data;
uniform float u_dataW;
uniform float u_travel;
uniform float u_mode;
uniform float u_hasRoad;
uniform float u_waterline;
const float HORIZON = 0.42;
const float RELIEF  = 0.30;
float surfaceAt(float x, out float zone, out float bal){
  vec4 s = texture2D(u_data, vec2(clamp(x, 0.0, 1.0), 0.5));
  zone = s.g; bal = s.b;
  float flat = step(1.5, u_mode);
  float h = mix(s.r, 0.5, flat);
  return HORIZON + (h - 0.5) * RELIEF * 2.0;
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  float zone = 0.0, bal = 1.0;
  float surf = surfaceAt(uv.x, zone, bal);
  vec3 light = mix(u_aura, vec3(1.0, 0.98, 0.94), 0.60);
  vec3 deep  = mix(u_aura, u_bg, 0.30);
  vec2 c = vec2(0.5, 0.72);
  vec2 p = (uv - c) * vec2(u_res.x / u_res.y, 1.0);
  float r = length(p);
  float t = u_time * 0.05;
  vec2 q = vec2(fbm(p * 1.7 + t), fbm(p * 1.7 + vec2(2.7, 1.9) - t));
  float flow = fbm(p * 1.7 + 1.3 * q);
  float breath = 0.5 + 0.5 * sin(u_time * 0.6);
  float field = pow(smoothstep(1.02, 0.0, r), 1.3);
  float crown = smoothstep(0.60, 0.0, r);
  vec3 sky = u_bg;
  vec3 aura = mix(deep, u_aura, clamp(flow * 1.2 + 0.18, 0.0, 1.0));
  aura = mix(aura, light, clamp(crown * 0.9 + flow * 0.22, 0.0, 1.0));
  sky = mix(sky, aura, (0.60 + 0.20 * breath) * field);
  sky += light * crown * (0.16 + 0.10 * breath);
  vec3 col = sky;
  if (u_hasRoad > 0.5) {
    float ground = smoothstep(surf + 0.004, surf - 0.004, uv.y);
    float depth = clamp((surf - uv.y) * 3.0, 0.0, 1.0);
    vec3 cool = mix(u_bg, u_aura, 0.35);
    vec3 hot  = mix(u_aura, vec3(1.0, 0.42, 0.24), 0.55);
    vec3 land = mix(cool, hot, smoothstep(0.35, 0.75, zone));
    land *= mix(0.42, 1.0, bal);
    land *= mix(1.0, 0.55, depth);
    land += 0.05 * fbm(vec2(uv.x * 34.0, uv.y * 12.0));
    land = mix(land, mix(u_bg, land, 0.30), step(3.5, u_mode) * step(u_mode, 4.5));
    float ridge = smoothstep(0.010, 0.0, abs(uv.y - surf));
    land += light * ridge * 0.55;
    col = mix(col, land, ground);
    float wl = smoothstep(0.0018, 0.0, abs(uv.y - HORIZON));
    col += vec3(1.0) * wl * 0.30 * u_waterline;
    float zTravel, bTravel;
    float sTravel = surfaceAt(u_travel, zTravel, bTravel);
    vec2 rider = vec2(u_travel, sTravel + 0.012);
    float dr = length((uv - rider) * vec2(u_res.x / u_res.y, 1.0));
    col += light * pow(smoothstep(0.10, 0.0, dr), 2.0) * (0.55 + 0.25 * breath);
    col += vec3(1.0) * smoothstep(0.011, 0.0, dr);
  }
  col *= smoothstep(-0.15, 0.30, uv.y) * 0.34 + 0.66;
  col += (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.016;
  gl_FragColor = vec4(col, 1.0);
}
`
```

- [ ] **Step 3: Verify it compiles and nothing regressed**

Run: `cd frontend && npx tsc -b && npx vitest run && npx eslint .`
Expected: type-check clean, all existing tests PASS, no lint errors.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/shaders/todays-road.glsl src/components/wrapped/ShaderCanvas.tsx
git commit -m "feat(shader): the road — terrain keyed to the CP waterline"
```

---

### Task 6: TodayRoad — GL layer, scrub gestures, SVG fallback

The component that owns the canvas, the pointer handling, and the no-WebGL degradation. Scrub position lives in a ref and is coalesced through rAF so pointer moves never trigger a React render per event.

**Files:**
- Create: `frontend/src/components/dashboard/today/TodayRoad.tsx`
- Test: `frontend/src/components/dashboard/today/__tests__/TodayRoad.test.tsx`

**Interfaces:**
- Consumes: `RoadProfile`, `MAX_SAMPLES` (Task 2); `RoadMode`, `roadModeIndex` (Task 3); `ShaderCanvas`, `packRoadTexture` (Task 4).
- Produces:
  ```ts
  export interface TodayRoadProps {
    profile: RoadProfile
    mode: RoadMode
    auraColor: string
    /** Called with the scrub position, 0..1, coalesced to one call per frame. */
    onTravel?: (t: number) => void
  }
  export default function TodayRoad(props: TodayRoadProps): JSX.Element
  export function supportsWebGL(): boolean
  export function roadSvgPath(profile: RoadProfile, w: number, h: number): string
  ```

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/dashboard/today/__tests__/TodayRoad.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import TodayRoad, { roadSvgPath } from '../TodayRoad'
import { buildRoadProfile } from '../../../../utils/roadProfile'
import type { ResolvedBlock } from '../../../../api/coach'

function block(over: Partial<ResolvedBlock> = {}): ResolvedBlock {
  return {
    name: 'B', duration_s: 300,
    target_watts_low: 300, target_watts_high: 300, target_pct_ftp: 120,
    zone: 5, rpe: 8, cadence_low: null, cadence_high: null,
    target_hr_low: null, target_hr_high: null, ...over,
  }
}
const profile = buildRoadProfile([block()], { cp: 250, wPrime: 20000 })

afterEach(cleanup)

describe('roadSvgPath', () => {
  it('spans the full width and stays inside the box', () => {
    const d = roadSvgPath(profile, 390, 200)
    expect(d.startsWith('M0,')).toBe(true)
    const xs = [...d.matchAll(/[ML](\d+(?:\.\d+)?),/g)].map((m) => Number(m[1]))
    expect(Math.max(...xs)).toBeCloseTo(390, 0)
  })

  it('returns an empty path for an empty profile', () => {
    expect(roadSvgPath(buildRoadProfile([], { cp: 250, wPrime: 20000 }), 390, 200)).toBe('')
  })
})

describe('TodayRoad', () => {
  it('falls back to an SVG profile when WebGL is unavailable', () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<TodayRoad profile={profile} mode="prescribed" auraColor="#16E08A" />)
    expect(screen.getByTestId('road-svg-fallback')).toBeTruthy()
    spy.mockRestore()
  })

  it('keeps the visual layer out of the accessibility tree', () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<TodayRoad profile={profile} mode="prescribed" auraColor="#16E08A" />)
    expect(screen.getByTestId('road-svg-fallback').getAttribute('aria-hidden')).toBe('true')
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/today/__tests__/TodayRoad.test.tsx`
Expected: FAIL — cannot resolve `../TodayRoad`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/components/dashboard/today/TodayRoad.tsx`:

```tsx
/**
 * TodayRoad — the Today tab's landscape layer.
 *
 * One fullscreen WebGL canvas (the shader draws sky + terrain in a single
 * pass) plus pointer scrubbing. Physiology lives in utils/roadProfile.ts; the
 * landscape choice lives in utils/roadMode.ts. This component owns pixels and
 * gestures only.
 *
 * Degradation: no WebGL → a static SVG elevation profile that still shows the
 * terrain and the CP waterline, and is still scrubbable. The information
 * survives; only the atmosphere is lost.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import ShaderCanvas, { packRoadTexture } from '../../wrapped/ShaderCanvas'
import type { RoadProfile } from '../../../utils/roadProfile'
import { roadModeIndex, type RoadMode } from '../../../utils/roadMode'

export interface TodayRoadProps {
  profile: RoadProfile
  mode: RoadMode
  auraColor: string
  onTravel?: (t: number) => void
}

/** Whether a WebGL context can be created at all. */
export function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!c.getContext('webgl')
  } catch {
    return false
  }
}

/** Terrain outline as an SVG path, CP at mid-height (the fallback renderer). */
export function roadSvgPath(profile: RoadProfile, w: number, h: number): string {
  const n = profile.samples.length
  if (n === 0) return ''
  const peak = Math.max(...profile.samples.map((s) => s.watts), 1)
  const ref = profile.cp ?? peak
  const span = Math.max(1, n - 1)
  return profile.samples
    .map((s, i) => {
      const x = (i / span) * w
      const rel = Math.min(s.watts / ref, 2) / 2 // 0.5 == the waterline
      const y = h - rel * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

const BOX = { width: '100%', height: '100%' } as const

export default function TodayRoad({ profile, mode, auraColor, onTravel }: TodayRoadProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const travelRef = useRef(0)
  const rafRef = useRef(0)
  const gl = useMemo(() => supportsWebGL(), [])
  const texture = useMemo(() => packRoadTexture(profile), [profile])

  const hasRoad = mode !== 'bare' && profile.samples.length > 0
  // The waterline is meaningful only when CP is genuinely known.
  const waterline = profile.cp != null && (mode === 'prescribed' || mode === 'ridden')

  // Scrub position is a ref + one rAF-coalesced callback per frame, so a
  // pointer drag never causes a React render per pointermove event.
  const publish = useCallback(() => {
    rafRef.current = 0
    onTravel?.(travelRef.current)
  }, [onTravel])

  const onPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const host = hostRef.current
    if (!host || !hasRoad) return
    const rect = host.getBoundingClientRect()
    if (rect.width <= 0) return
    travelRef.current = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    host.style.setProperty('--road-travel', String(travelRef.current))
    if (!rafRef.current) rafRef.current = requestAnimationFrame(publish)
  }, [hasRoad, publish])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  const uniforms = useMemo(() => ({
    u_aura: auraColor,
    u_bg: '#0A0C0F',
    u_travel: travelRef.current,
    u_mode: roadModeIndex(mode),
    u_hasRoad: hasRoad ? 1 : 0,
    u_waterline: waterline ? 1 : 0,
  }), [auraColor, mode, hasRoad, waterline])

  return (
    <div
      ref={hostRef}
      onPointerDown={onPointer}
      onPointerMove={(e) => { if (e.buttons > 0) onPointer(e) }}
      style={{ position: 'absolute', inset: 0, touchAction: 'pan-y' }}
    >
      {gl ? (
        // Remount on a profile change so the data texture is re-uploaded.
        <ShaderCanvas
          key={`road-${texture.width}`}
          variant="road"
          uniforms={uniforms}
          texture={texture}
          style={BOX}
        />
      ) : (
        <svg
          data-testid="road-svg-fallback"
          aria-hidden="true"
          viewBox="0 0 390 200"
          preserveAspectRatio="none"
          style={{ ...BOX, display: 'block', background: '#0A0C0F' }}
        >
          {waterline && (
            <line x1="0" y1="100" x2="390" y2="100" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1" />
          )}
          {hasRoad && (
            <path d={`${roadSvgPath(profile, 390, 200)} L390,200 L0,200 Z`} fill={auraColor} fillOpacity="0.30" />
          )}
          {hasRoad && (
            <path d={roadSvgPath(profile, 390, 200)} fill="none" stroke={auraColor} strokeWidth="1.5" />
          )}
        </svg>
      )}
    </div>
  )
}
```

Note: `u_travel` intentionally reads `travelRef.current` at memo time. The shader's rider marker follows the scrub on the next uniform refresh; the authoritative, immediate feedback is the DOM readout in Task 7, which is what an athlete actually reads.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/today/__tests__/TodayRoad.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/dashboard/today/TodayRoad.tsx src/components/dashboard/today/__tests__/TodayRoad.test.tsx
git commit -m "feat(today): road GL layer with scrubbing and SVG fallback"
```

---

### Task 7: RoadReadout — the scrub readout in DOM

What the athlete actually reads, and what a screen reader gets (the canvas is `aria-hidden`). Renders the interval at the scrub position: duration, watt range, zone, RPE, and remaining matches.

**Files:**
- Create: `frontend/src/components/dashboard/today/RoadReadout.tsx`
- Test: `frontend/src/components/dashboard/today/__tests__/RoadReadout.test.tsx`

**Interfaces:**
- Consumes: `RoadProfile`, `RoadSample` (Task 2); `ResolvedBlock` (existing).
- Produces:
  ```ts
  export interface ReadoutData {
    blockName: string
    elapsedS: number
    watts: number
    zone: number
    rpe: number | null
    /** 0..1 of W′ remaining; null when CP/W′ unknown → render an em dash. */
    matches: number | null
  }
  export function readoutAt(profile: RoadProfile, blocks: ResolvedBlock[], travel: number): ReadoutData | null
  export default function RoadReadout(props: { profile: RoadProfile; blocks: ResolvedBlock[]; travel: number; de: boolean }): JSX.Element | null
  ```

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/dashboard/today/__tests__/RoadReadout.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import RoadReadout, { readoutAt } from '../RoadReadout'
import { buildRoadProfile } from '../../../../utils/roadProfile'
import type { ResolvedBlock } from '../../../../api/coach'

function block(over: Partial<ResolvedBlock> = {}): ResolvedBlock {
  return {
    name: 'B', duration_s: 300,
    target_watts_low: 300, target_watts_high: 320, target_pct_ftp: 120,
    zone: 5, rpe: 8, cadence_low: null, cadence_high: null,
    target_hr_low: null, target_hr_high: null, ...over,
  }
}
const blocks = [block({ name: 'Warm-up', target_watts_low: 150, target_watts_high: 170, zone: 1, rpe: 2 }), block({ name: 'VO2' })]

afterEach(cleanup)

describe('readoutAt', () => {
  it('resolves the block under the scrub position', () => {
    const p = buildRoadProfile(blocks, { cp: 250, wPrime: 20000 })
    expect(readoutAt(p, blocks, 0)!.blockName).toBe('Warm-up')
    expect(readoutAt(p, blocks, 1)!.blockName).toBe('VO2')
  })

  it('reports matches as a fraction of W prime', () => {
    const p = buildRoadProfile(blocks, { cp: 250, wPrime: 20000 })
    const start = readoutAt(p, blocks, 0)!
    const end = readoutAt(p, blocks, 1)!
    expect(start.matches).toBeCloseTo(1, 2)
    expect(end.matches!).toBeLessThan(start.matches!)
  })

  it('reports null matches when CP is unknown', () => {
    const p = buildRoadProfile(blocks, { cp: null, wPrime: null })
    expect(readoutAt(p, blocks, 0.5)!.matches).toBeNull()
  })

  it('returns null for an empty profile', () => {
    expect(readoutAt(buildRoadProfile([], { cp: 250, wPrime: 20000 }), [], 0.5)).toBeNull()
  })
})

describe('RoadReadout', () => {
  it('renders watts, zone and matches as real text', () => {
    const p = buildRoadProfile(blocks, { cp: 250, wPrime: 20000 })
    render(<RoadReadout profile={p} blocks={blocks} travel={1} de={false} />)
    expect(screen.getByText(/310\s*W/)).toBeTruthy()
    expect(screen.getByText('Z5')).toBeTruthy()
    expect(screen.getByTestId('road-matches').textContent).not.toBe('—')
  })

  it('renders an em dash for matches when CP is unknown, never a fake battery', () => {
    const p = buildRoadProfile(blocks, { cp: null, wPrime: null })
    render(<RoadReadout profile={p} blocks={blocks} travel={0.5} de={false} />)
    expect(screen.getByTestId('road-matches').textContent).toBe('—')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/today/__tests__/RoadReadout.test.tsx`
Expected: FAIL — cannot resolve `../RoadReadout`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/components/dashboard/today/RoadReadout.tsx`:

```tsx
/**
 * RoadReadout — the DOM half of Today's Road.
 *
 * The canvas is aria-hidden, so this is the accessible surface: it is what a
 * screen reader gets and what an athlete actually reads while scrubbing. It
 * shows the interval under the scrub position and how many matches are left.
 * When CP/W′ are unknown the matches slot renders "—" — never a fake battery.
 */
import { useMemo } from 'react'
import type { RoadProfile } from '../../../utils/roadProfile'
import type { ResolvedBlock } from '../../../api/coach'

export interface ReadoutData {
  blockName: string
  elapsedS: number
  watts: number
  zone: number
  rpe: number | null
  matches: number | null
}

/** The sample nearest `travel` (0..1), resolved back to its source block. */
export function readoutAt(
  profile: RoadProfile,
  blocks: ResolvedBlock[],
  travel: number,
): ReadoutData | null {
  const n = profile.samples.length
  if (n === 0) return null
  const t = Math.min(1, Math.max(0, travel))
  let best = profile.samples[0]
  let bestD = Infinity
  for (const s of profile.samples) {
    const d = Math.abs(s.t - t)
    if (d < bestD) { bestD = d; best = s }
  }
  const src = blocks[best.blockIndex]
  return {
    blockName: src?.name ?? '',
    elapsedS: Math.round(best.t * profile.totalDurationS),
    watts: Math.round(best.watts),
    zone: best.zone,
    rpe: src?.rpe ?? null,
    matches: best.wbal != null && profile.wPrime ? Math.max(0, best.wbal / profile.wPrime) : null,
  }
}

const MATCH_PIPS = 7

function mmss(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function RoadReadout({ profile, blocks, travel, de }: {
  profile: RoadProfile
  blocks: ResolvedBlock[]
  travel: number
  de: boolean
}) {
  const d = useMemo(() => readoutAt(profile, blocks, travel), [profile, blocks, travel])
  if (!d) return null

  const filled = d.matches != null ? Math.round(d.matches * MATCH_PIPS) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.7 }}>{mmss(d.elapsedS)}</span>
      <strong>{d.watts} W</strong>
      <span>{`Z${Math.min(d.zone, 7)}`}</span>
      {d.rpe != null && <span style={{ opacity: 0.7 }}>{`RPE ${d.rpe}`}</span>}
      {d.blockName && <span style={{ opacity: 0.7 }}>{d.blockName}</span>}
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ opacity: 0.7 }}>{de ? 'Streichhölzer' : 'Matches'}</span>
        <span data-testid="road-matches" style={{ letterSpacing: 1 }}>
          {d.matches == null ? '—' : '▮'.repeat(filled) + '▯'.repeat(MATCH_PIPS - filled)}
        </span>
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/today/__tests__/RoadReadout.test.tsx`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/dashboard/today/RoadReadout.tsx src/components/dashboard/today/__tests__/RoadReadout.test.tsx
git commit -m "feat(today): accessible scrub readout for the road"
```

---

### Task 8: Wire the road into the Today tab

Extend `AuraContext` to carry a road payload, have `DashboardShell` render the road variant when one is published, and have `TodayTab` publish it. This is where the `model_valid` gate is applied.

**Files:**
- Modify: `frontend/src/components/dashboard/AuraContext.tsx`
- Modify: `frontend/src/components/dashboard/DashboardShell.tsx:41-75`
- Modify: `frontend/src/components/dashboard/tabs/TodayTab.tsx` (near the existing `useAura` call at line 906)
- Test: `frontend/src/components/dashboard/tabs/__tests__/roadPayload.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces:
  ```ts
  // AuraContext.tsx
  export interface RoadPayload { profile: RoadProfile; mode: RoadMode; color: string }
  export interface AuraContextValue {
    setAura: (color: string | null) => void
    setRoad: (road: RoadPayload | null) => void
  }
  // TodayTab.tsx
  export function roadPowerInputs(p: { model_valid?: boolean; cp_watts?: number; w_prime_j?: number } | null | undefined): { cp: number | null; wPrime: number | null }
  ```

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/dashboard/tabs/__tests__/roadPayload.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { roadPowerInputs } from '../TodayTab'

describe('roadPowerInputs', () => {
  it('passes CP and W prime through when the model is valid', () => {
    expect(roadPowerInputs({ model_valid: true, cp_watts: 250, w_prime_j: 20000 }))
      .toEqual({ cp: 250, wPrime: 20000 })
  })

  it('withholds CP when the model is not valid — no waterline off a bad model', () => {
    expect(roadPowerInputs({ model_valid: false, cp_watts: 250, w_prime_j: 20000 }))
      .toEqual({ cp: null, wPrime: null })
  })

  it('withholds CP when model_valid is absent or the profile is missing', () => {
    expect(roadPowerInputs({ cp_watts: 250, w_prime_j: 20000 })).toEqual({ cp: null, wPrime: null })
    expect(roadPowerInputs(null)).toEqual({ cp: null, wPrime: null })
    expect(roadPowerInputs(undefined)).toEqual({ cp: null, wPrime: null })
  })

  it('withholds both when either value is missing', () => {
    expect(roadPowerInputs({ model_valid: true, cp_watts: 250 })).toEqual({ cp: null, wPrime: null })
    expect(roadPowerInputs({ model_valid: true, w_prime_j: 20000 })).toEqual({ cp: null, wPrime: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/tabs/__tests__/roadPayload.test.ts`
Expected: FAIL — `roadPowerInputs` is not exported from `../TodayTab`.

- [ ] **Step 3: Write minimal implementation**

**3a.** In `frontend/src/components/dashboard/AuraContext.tsx`, add the road channel alongside the existing colour channel:

```tsx
import type { RoadProfile } from '../../utils/roadProfile'
import type { RoadMode } from '../../utils/roadMode'

/** What the Today tab publishes so the shell can draw the landscape. */
export interface RoadPayload { profile: RoadProfile; mode: RoadMode; color: string }

export interface AuraContextValue {
  /** Set the current aura colour (hex), or null to clear it. */
  setAura: (color: string | null) => void
  /** Publish the day's road, or null to fall back to the plain aura. */
  setRoad: (road: RoadPayload | null) => void
}

export const AuraContext = createContext<AuraContextValue>({ setAura: () => {}, setRoad: () => {} })
```

**3b.** In `frontend/src/components/dashboard/DashboardShell.tsx`, add road state next to the existing `aura` state (around line 44):

```tsx
  const [road, setRoadState] = useState<RoadPayload | null>(null)
```

Include `setRoad: setRoadState` in the context value passed to `AuraContext.Provider` (alongside the existing stable `setAura`), memoized the same way the existing value is.

Replace the aura render block (around lines 69-74) so the road wins when published:

```tsx
        {road ? (
          <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'auto' }}>
            <TodayRoad profile={road.profile} mode={road.mode} auraColor={road.color} />
          </div>
        ) : aura && (
          <ShaderCanvas
            variant="aura"
            uniforms={{ u_aura: aura, u_bg: '#0A0C0F' }}
            /* keep the existing className/style props exactly as they are */
          />
        )}
```

Add the imports:

```tsx
import TodayRoad from './today/TodayRoad'
import type { RoadPayload } from './AuraContext'
```

**3c.** In `frontend/src/components/dashboard/tabs/TodayTab.tsx`, add the exported gate near the other pure helpers (below `flagshipColors`):

```ts
/** CP/W′ may only be used when the power model is valid (audit rule: a manual
 *  FTP that disagrees with the model by >10% invalidates the model). Without a
 *  valid model the road draws terrain but no waterline and no matches. */
export function roadPowerInputs(
  p: { model_valid?: boolean; cp_watts?: number; w_prime_j?: number } | null | undefined,
): { cp: number | null; wPrime: number | null } {
  if (!p || p.model_valid !== true) return { cp: null, wPrime: null }
  if (p.cp_watts == null || p.w_prime_j == null) return { cp: null, wPrime: null }
  return { cp: p.cp_watts, wPrime: p.w_prime_j }
}
```

Then, next to the existing `const { setAura } = useAura()` (line 906), publish the road. `session` is the existing `useTodaySession()` result and `fState` / `fColors` already exist at lines 897-901; `powerProfile` comes from the existing `usePowerProfile()` hook — add that import and call if the tab does not already have one.

```tsx
  const { setAura, setRoad } = useAura()

  // Real blocks when the plan has them; otherwise a single honest steady block
  // synthesized from the planned duration and an average target derived the
  // same way sessionIntensity() already derives IF (IF = √(TSS / (hours×100)),
  // watts = IF × threshold). Needs duration, TSS and a threshold — missing any
  // of them yields no road at all rather than a guessed one (spec §6).
  const roadBlocks = useMemo(() => {
    const w = session.workout
    const blocks = w?.blocks ?? []
    if (blocks.length > 0) return blocks
    const hours = (w?.duration_minutes ?? 0) / 60
    const threshold = powerProfile?.threshold_watts
    if (!w || hours <= 0 || w.predicted_tss == null || threshold == null) return []
    const iff = Math.sqrt(w.predicted_tss / (hours * 100))
    const synth = steadyBlock(w.duration_minutes, Math.round(iff * threshold))
    return synth ? [synth] : []
  }, [session.workout, powerProfile])

  const roadProfile = useMemo(
    () => buildRoadProfile(roadBlocks, roadPowerInputs(powerProfile)),
    [roadBlocks, powerProfile],
  )
  const mode = useMemo(
    () => roadMode(fState, { hasProfile: roadProfile.samples.length > 0, hasRidden: false }),
    [fState, roadProfile],
  )

  useEffect(() => {
    setRoad({ profile: roadProfile, mode, color: fColors.aura })
    return () => setRoad(null)
  }, [setRoad, roadProfile, mode, fColors.aura])
```

Add the imports:

```ts
import { buildRoadProfile, steadyBlock } from '../../../utils/roadProfile'
import { roadMode } from '../../../utils/roadMode'
import { usePowerProfile } from '../../../hooks/usePowerProfile'
```

`hasRidden: false` is deliberate: the `ridden` mode needs a real power stream and is out of scope for this plan (spec §10 keeps stream-backed post-ride terrain for a follow-up). `flat-done` is the honest post-ride landscape until then.

**3d.** Give the Today cards glass so the road reads through the page. In `TodayTab.tsx`, change the shared `cardStyle` (line 55):

```ts
const cardStyle = {
  background: 'color-mix(in srgb, var(--color-paper-2) 72%, transparent)',
  backdropFilter: 'blur(14px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(14px) saturate(1.2)',
  border: '1px solid var(--color-rule)',
} as const
```

- [ ] **Step 4: Run the full verification**

Run: `cd frontend && npx vitest run && npx tsc -b && npx eslint . && npm run build`
Expected: all tests PASS, type-check clean, no lint errors, build succeeds.

If `AuraContext` consumers elsewhere break on the new required `setRoad` field, fix them by supplying `setRoad: () => {}` — do not make the field optional.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/dashboard/AuraContext.tsx src/components/dashboard/DashboardShell.tsx src/components/dashboard/tabs/TodayTab.tsx src/components/dashboard/tabs/__tests__/roadPayload.test.ts
git commit -m "feat(today): mount the road behind the Today tab"
```

---

## Notes for the implementer

- **The one idea to protect:** ground level is Critical Power. If a change would make the waterline appear when CP is unknown, or make terrain height mean anything other than watts relative to CP, it breaks the feature's entire claim. Reject it.
- **Never substitute a default CP, FTP, or W′.** Four separate tests assert this; they are the point, not overhead.
- **Do not add three.js, OGL, or a WebGPU path.** The effect is one fullscreen fragment shader; a scene graph would add ~150 KB gzipped that nothing uses.
- The road is the *workout*, not a map. GPS/route terrain is explicitly out of scope (spec §10).
