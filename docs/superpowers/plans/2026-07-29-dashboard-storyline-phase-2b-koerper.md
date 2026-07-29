# Dashboard Storyline — Phase 2b (Körper) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Körper chapter a narrative arc — one featured "limiting driver" as its Moment, the coach's recommendation moved up to interpret it, `MorningHealthCard` received from Heute, and a closing handoff — without cutting a single existing card.

**Architecture:** `RecoveryTab.tsx` has no Moment today: its "Recovery Drivers" section is a flat list of seven `<Driver>` tiles, each already carrying a `dev` (deviation-from-baseline, negative = worse). Task 1 extracts a pure function that picks the most-limiting one; Task 2 turns the hardcoded tile list into a data array feeding both the tiles and that function. Tasks 3–4 move the Recommendation card up and add the two missing elements. No card is cut, no styling is redesigned.

**Tech Stack:** React 19 + TypeScript, Vite, vitest + jsdom + @testing-library/react, react-router-dom, lucide-react.

## Global Constraints

- **Mobile-only.** Target viewport 390×844. Desktop is a sanity check, never a design target.
- **Bike-only.** No sport branches.
- **German + English.** Every user-visible string is `de ? '…' : '…'`. No untranslated copy.
- **Honest empties.** A missing figure renders `—` (the file's `DASH` constant), never a zero or a guess.
- **The stale-wearable rule.** `utils/readinessGate.ts` is the one gate, surfaced in this file as `scoreWithheld` (`freshness.gate === 'pending' || 'stale'`). When it is true the app must not assert a readiness verdict. The Moment this plan adds is a verdict ("this is what's limiting you today"), so it is **suppressed entirely** when `scoreWithheld` is true — see Task 2.
- **Existing tokens only.** `--color-recovery`, `--color-amber`, `--color-move`, `--color-muted`, `--color-ink`, `--color-ink-2`, `--color-paper-2`, `--color-rule`, `--color-accent`. Introduce no new colours.
- **No card is cut.** Körper keeps every one of its existing sections. This phase adds and reorders; it does not thin.
- **Pre-existing findings are not yours.** `npx eslint` reports pre-existing findings on `TodayTab.tsx` and one accepted `react-refresh/only-export-components` finding on `ChapterBar.tsx`. `src/auraprobe.tsx` and `frontend/aura.html` are untracked scratch files. Compare against the pre-change output; do not "fix" any of these.
- **Verification is a rendered frame.** A screenshot at 390×844 is required, not just green gates.

## Decisions already taken — do not re-litigate

1. **The Recommendation card keeps its own styling.** It fills the Read role by position, not by adopting `CoachRead`'s purple shell. Purple stays the kit's "coach's prose voice" signal; green stays recovery's. This is the same call made for `SessionOfTheDay` in 2a, and it means **`CoachRead` needs no widening** — a concern raised by 2a's final review is resolved by this decision, not by code.
2. **The Moment is suppressed, not dated, when readiness is withheld.** Naming a limiting driver off a stale wearable is exactly the verdict the gate exists to withhold. The hero's existing amber note and Sync action already own that story.
3. **Körper's existing section order is already roughly descending-depth** (drivers → metrics → sleep detail → load → stress → outlook → calendar → journal). The spec's "reordered by descending depth" is therefore satisfied by the two moves this plan actually makes (Recommendation up, `MorningHealthCard` in at the right depth). Reshuffling the other nine sections would be churn with real visual risk and no complaint driving it — explicitly out of scope.

---

## File Structure

**Create:**
- `frontend/src/utils/limitingDriver.ts` — pure: given the driver data, which one is holding readiness back. No React.
- `frontend/src/utils/__tests__/limitingDriver.test.ts`

**Modify:**
- `frontend/src/components/dashboard/tabs/RecoveryTab.tsx` — driver array, Moment mount, Recommendation moved, `MorningHealthCard` mounted, `NextChapter` added.

`MomentCard` and `NextChapter` already exist from Phase 1. Körper renders **no** readiness aura (`DashboardShell` gates the aura on `TodayTab` publishing a colour), so the aura-contrast trap that bit 2a does not apply on this page.

---

### Task 1: `utils/limitingDriver.ts` — which signal is holding you back

Each `<Driver>` tile in `RecoveryTab.tsx` already receives a `dev`: the athlete's deviation from their own 7-day baseline, clamped to `[-1, 1]`, where **negative means worse than baseline**. That convention is consistent across the tiles — HRV uses `(hrvNow - hrv7) / 20`, resting HR uses `(rhr7 - rhrNow) / 8` (inverted, so a raised RHR is negative), sleep uses `(sleepNow - sleepAvg) / 20`. Three tiles (respiration, SpO₂, skin temp) pass `dev={null}` because no baseline comparison exists for them.

**Files:**
- Create: `frontend/src/utils/limitingDriver.ts`
- Test: `frontend/src/utils/__tests__/limitingDriver.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export interface DriverDatum {
  /** Stable identity for React keys and tests. */
  key: string
  label: string
  /** Already-formatted display value, e.g. "48 ms" or the DASH em-dash. */
  value: string
  /** Already-formatted signed delta vs baseline, e.g. "−15". Null when absent. */
  delta: string | null
  /** Deviation from the athlete's own baseline, clamped [-1, 1].
   *  NEGATIVE = worse than baseline. Null when no baseline exists. */
  dev: number | null
}
export function limitingDriver(drivers: DriverDatum[]): DriverDatum | null
```

- [ ] **Step 1: Write the failing test**

Create `frontend/src/utils/__tests__/limitingDriver.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { limitingDriver, type DriverDatum } from '../limitingDriver'

function d(key: string, dev: number | null): DriverDatum {
  return { key, label: key.toUpperCase(), value: '42', delta: null, dev }
}

describe('limitingDriver', () => {
  it('picks the signal furthest below baseline', () => {
    const worst = limitingDriver([d('hrv', -0.2), d('rhr', -0.75), d('sleep', -0.4)])
    expect(worst?.key).toBe('rhr')
  })

  it('ignores signals with no baseline to compare against', () => {
    // Respiration, SpO2 and skin temp pass dev: null — they have no 7-day
    // baseline in the feed, so they can never be named as the limiter.
    const worst = limitingDriver([d('spo2', null), d('hrv', -0.1)])
    expect(worst?.key).toBe('hrv')
  })

  it('returns null when nothing is below baseline — an athlete can be limited by nothing', () => {
    expect(limitingDriver([d('hrv', 0.3), d('sleep', 0.1), d('rhr', 0)])).toBeNull()
  })

  it('treats exactly-at-baseline as not limiting', () => {
    expect(limitingDriver([d('hrv', 0)])).toBeNull()
  })

  it('is null for an empty list rather than throwing', () => {
    expect(limitingDriver([])).toBeNull()
  })

  it('ignores non-finite deviations instead of ranking them', () => {
    const worst = limitingDriver([d('bad', NaN), d('hrv', -0.2)])
    expect(worst?.key).toBe('hrv')
  })

  it('breaks ties in input order, so the display order decides', () => {
    const worst = limitingDriver([d('hrv', -0.5), d('sleep', -0.5)])
    expect(worst?.key).toBe('hrv')
  })

  it('carries the driver through untouched, so the caller can render its real value', () => {
    const rich: DriverDatum = { key: 'hrv', label: 'HRV', value: '48 ms', delta: '−15', dev: -0.7 }
    expect(limitingDriver([rich, d('sleep', -0.1)])).toEqual(rich)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/utils/__tests__/limitingDriver.test.ts`
Expected: FAIL — `Failed to resolve import "../limitingDriver"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/utils/limitingDriver.ts`:

```ts
/**
 * limitingDriver — of the athlete's overnight signals, which one is actually
 * holding readiness back today.
 *
 * The Körper chapter's "Moment" slot needs one thing to feature, and a flat
 * list of seven tiles does not tell the reader which of them to care about.
 * Every tile already carries the answer: `dev`, the deviation from that
 * athlete's OWN 7-day baseline, negative when worse. This picks the most
 * negative one.
 *
 * Honesty rules:
 *  • A signal with no baseline (`dev: null` — respiration, SpO₂, skin temp,
 *    none of which the feed provides a 7-day average for) can never be named
 *    as the limiter. Absence of a comparison is not evidence of a problem.
 *  • Nothing below baseline returns null, not "the least good one". An athlete
 *    whose every signal is at or above baseline is limited by nothing, and the
 *    UI must be able to say so by rendering no Moment at all.
 *  • Exactly at baseline is NOT limiting. Only strictly below counts.
 *
 * The caller is responsible for the stale-wearable gate: on a day where
 * readiness is withheld, these deviations are computed against days-old
 * values and must not be presented as today's verdict at all.
 */

export interface DriverDatum {
  /** Stable identity for React keys and tests. */
  key: string
  label: string
  /** Already-formatted display value, e.g. "48 ms" or an em-dash. */
  value: string
  /** Already-formatted signed delta vs baseline, e.g. "−15". Null when absent. */
  delta: string | null
  /** Deviation from the athlete's own baseline, clamped [-1, 1].
   *  NEGATIVE = worse than baseline. Null when no baseline exists. */
  dev: number | null
}

export function limitingDriver(drivers: DriverDatum[]): DriverDatum | null {
  let worst: DriverDatum | null = null
  for (const dr of drivers ?? []) {
    if (dr.dev == null || !Number.isFinite(dr.dev) || dr.dev >= 0) continue
    // Strictly less-than keeps ties on the first seen, so the on-screen order
    // decides rather than an arbitrary sort.
    if (worst == null || dr.dev < worst.dev!) worst = dr
  }
  return worst
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/utils/__tests__/limitingDriver.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck and commit**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no new findings.

```bash
git add frontend/src/utils/limitingDriver.ts frontend/src/utils/__tests__/limitingDriver.test.ts
git commit -m "feat(recovery): name the signal that is actually holding you back

Körper shows seven overnight signals as equals and leaves the reader to
work out which one matters. Every tile already carries the answer — its
deviation from that athlete's own 7-day baseline — so this picks the most
negative one. Signals with no baseline can never be named, and nothing
below baseline returns null rather than the least-good of a good set."
```

---

### Task 2: Körper's Moment — the limiting driver, featured

The seven `<Driver …/>` tiles are currently written out longhand in JSX with their values computed inline. To feed both the tiles and Task 1's function from one source, they become an array.

**Files:**
- Modify: `frontend/src/components/dashboard/tabs/RecoveryTab.tsx` — the Recovery Drivers section (locate with `grep -n "Recovery Drivers" src/components/dashboard/tabs/RecoveryTab.tsx`, currently ~line 523–570)

**Interfaces:**
- Consumes: `limitingDriver`, `type DriverDatum` from `../../../utils/limitingDriver`; `MomentCard` (default export) from `../../narrative/MomentCard`, whose props are:

```ts
export interface MomentCardProps {
  eyebrow: string
  headline: string
  support?: string | null
  to?: string
  children?: React.ReactNode
}
```

- [ ] **Step 1: Build the driver array**

Immediately above the `return (` of the component (find it with `grep -n "^  return (" src/components/dashboard/tabs/RecoveryTab.tsx` — use the SECOND match, ~line 483, which is the component's own return; the first is inside a helper), add a `useMemo` that holds exactly the data the seven existing tiles already pass. Copy each `value`, `delta`, `deltaColor`, `dev` and `segColor` expression **verbatim** from the current JSX — do not re-derive or "improve" any of them:

```tsx
  // ── Driver data, one source ────────────────────────────────────────────
  // These seven were written out longhand in the JSX below. They are an array
  // now because two things need them: the tile list (unchanged) and
  // limitingDriver(), which picks the one to feature as this chapter's Moment.
  // Every value/delta/dev expression here is copied verbatim from the tiles it
  // replaces — this step must not change a single rendered number.
  const driverRows = useMemo(() => ([
    {
      key: 'hrv', icon: Activity, label: 'HRV',
      value: hrvNow != null ? `${Math.round(hrvNow)} ms` : DASH,
      delta: hrvNow != null && hrv7 != null ? `${hrvNow - hrv7 >= 0 ? '+' : '−'}${Math.abs(Math.round(hrvNow - hrv7))}` : null,
      deltaColor: hrvNow != null && hrv7 != null && hrvNow >= hrv7 ? 'var(--color-recovery)' : 'var(--color-amber)',
      dev: hrvNow != null && hrv7 != null ? clamp((hrvNow - hrv7) / 20, -1, 1) : null,
      segColor: hrvNow != null && hrv7 != null && hrvNow < hrv7 ? 'var(--color-amber)' : 'var(--color-recovery)',
    },
    {
      key: 'rhr', icon: Heart, label: de ? 'Ruhepuls' : 'Resting HR',
      value: rhrNow != null ? `${Math.round(rhrNow)} bpm` : DASH,
      delta: rhrNow != null && rhr7 != null ? `${rhrNow <= rhr7 ? '−' : '+'}${Math.abs(Math.round(rhrNow - rhr7))}` : null,
      deltaColor: rhrNow != null && rhr7 != null && rhrNow <= rhr7 ? 'var(--color-recovery)' : 'var(--color-amber)',
      dev: rhrNow != null && rhr7 != null ? clamp((rhr7 - rhrNow) / 8, -1, 1) : null,
      segColor: rhrNow != null && rhr7 != null && rhrNow > rhr7 ? 'var(--color-amber)' : 'var(--color-recovery)',
    },
    {
      key: 'resp', icon: Wind, label: de ? 'Atmung' : 'Respiratory',
      value: sd?.respiration_avg != null ? `${sd.respiration_avg.toFixed(0)} br/min` : DASH,
      delta: null, deltaColor: 'var(--color-muted)', dev: null,
      segColor: sd?.respiration_avg != null ? 'var(--color-recovery)' : 'var(--color-muted)',
    },
    {
      key: 'spo2', icon: Droplet, label: de ? 'Ruhe-SpO₂' : 'Resting SpO₂',
      value: sd?.spo2_avg != null ? `${Math.round(sd.spo2_avg)}%` : DASH,
      delta: null, deltaColor: 'var(--color-muted)', dev: null,
      segColor: sd?.spo2_avg != null ? 'var(--color-recovery)' : 'var(--color-muted)',
    },
    {
      // Skin temp is not in Garmin's daily feed (skinTempDataExists:false) —
      // honest "Not tracked", never a fabricated °.
      key: 'skin', icon: Thermometer, label: de ? 'Hauttemp.' : 'Skin temp',
      value: de ? 'Nicht erfasst' : 'Not tracked',
      delta: null, deltaColor: 'var(--color-muted)', dev: null, segColor: 'var(--color-muted)',
    },
    {
      key: 'sleep', icon: Moon, label: de ? 'Schlaf' : 'Sleep perf.',
      value: sleepNow != null ? `${Math.round(sleepNow)}%` : DASH,
      delta: sleepNow != null && sleepAvg != null ? `${sleepNow - sleepAvg >= 0 ? '+' : '−'}${Math.abs(Math.round(sleepNow - sleepAvg))}` : null,
      deltaColor: sleepNow != null && sleepAvg != null && sleepNow >= sleepAvg ? 'var(--color-recovery)' : 'var(--color-amber)',
      dev: sleepNow != null && sleepAvg != null ? clamp((sleepNow - sleepAvg) / 20, -1, 1) : null,
      segColor: sleepNow != null && sleepAvg != null && sleepNow < sleepAvg ? 'var(--color-amber)' : 'var(--color-recovery)',
    },
  ]), [hrvNow, hrv7, rhrNow, rhr7, sd?.respiration_avg, sd?.spo2_avg, sleepNow, sleepAvg, de])
```

**Count check:** the current JSX has SIX `<Driver` tiles (HRV, Resting HR, Respiratory, Resting SpO₂, Skin temp, Sleep perf.). Verify with `grep -c "<Driver" src/components/dashboard/tabs/RecoveryTab.tsx` before you start and make your array match it exactly — if that count is not 6, stop and report NEEDS_CONTEXT rather than guessing which tile to drop or invent.

- [ ] **Step 2: Render the tiles from the array**

Replace the six longhand `<Driver … />` elements with a map. The `<Driver>` helper's props are unchanged:

```tsx
        {driverRows.map((r) => (
          <Driver key={r.key} icon={r.icon} label={r.label} value={r.value}
            delta={r.delta} deltaColor={r.deltaColor} dev={r.dev} segColor={r.segColor} />
        ))}
```

- [ ] **Step 3: Derive and mount the Moment**

Add, next to the `driverRows` memo:

```tsx
  // The chapter's Moment: the one signal actually below this athlete's own
  // baseline. Suppressed entirely when readiness is withheld — on a stale
  // wearable these deviations are computed against days-old values, and
  // naming a "limiter" from them is precisely the verdict readinessGate
  // exists to withhold. The hero's amber note and its Sync action already
  // own that story, so the slot stays empty rather than hedged.
  const limiter = useMemo(
    () => (scoreWithheld ? null : limitingDriver(driverRows)),
    [scoreWithheld, driverRows],
  )
```

Mount it directly **after** the Recovery hero card and **before** the Recovery Drivers section:

```tsx
      {/* Moment — the one signal holding readiness back, lifted out of the
          driver list below so the reader has something to act on instead of
          seven equal tiles. */}
      {limiter && (
        <MomentCard
          eyebrow={de ? 'WAS DICH HEUTE BREMST' : 'WHAT IS HOLDING YOU BACK'}
          headline={`${limiter.label} ${limiter.value}`}
          support={limiter.delta != null
            ? (de ? `${limiter.delta} gegenüber deinem 7-Tage-Schnitt` : `${limiter.delta} vs your 7-day average`)
            : (de ? 'Unter deinem 7-Tage-Schnitt' : 'Below your 7-day average')}
        />
      )}
```

Add the imports: `import MomentCard from '../../narrative/MomentCard'` and `import { limitingDriver } from '../../../utils/limitingDriver'`.

- [ ] **Step 4: Typecheck and run the suite**

Run: `cd frontend && npx tsc -b --noEmit && npx vitest run`
Expected: clean typecheck, full suite green.

`DriverDatum` from Task 1 is structurally satisfied by `driverRows`' elements (they carry the four fields it needs plus `icon`/`deltaColor`/`segColor`, which TypeScript accepts as a superset when passed to `limitingDriver`). If `tsc` disagrees, add `satisfies DriverDatum[]` reasoning rather than changing `limitingDriver`'s signature.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/tabs/RecoveryTab.tsx
git commit -m "feat(recovery): feature the signal that is limiting you

The seven overnight tiles become one array, which the tile list and the
new Moment card both read — so the chapter now leads with the one signal
below baseline instead of asking the reader to rank seven equals. No
rendered number changes; every value expression is the tile's own.

The Moment is suppressed outright when readiness is withheld: on a stale
wearable those deviations are days old, and naming a limiter from them is
the exact verdict readinessGate exists to withhold."
```

---

### Task 3: The Recommendation card becomes the chapter's Read

It currently sits near the bottom (~line 757), after the load target and daytime stress, and links to Heute. As the Read slot it belongs directly after the Moment, where it interprets what the Moment just showed.

**Its styling does not change.** It keeps its `--color-recovery` green ground, its 18px `recTitle` headline, its state-coloured subtitle and its `zoneColor` orb. It fills the Read role by position, not by adopting `CoachRead`'s purple shell — purple stays the kit's "coach's prose voice" signal.

**Files:**
- Modify: `frontend/src/components/dashboard/tabs/RecoveryTab.tsx`

- [ ] **Step 1: Move the block**

Find it with `grep -n "12 · Recommendation" src/components/dashboard/tabs/RecoveryTab.tsx`. Cut the whole section — its `{/* 12 · Recommendation → act on it in today's plan */}` comment and the entire `<Link to="/dashboard?tab=today" …> … </Link>` element that follows it — and paste it immediately after the Moment block added in Task 2 (i.e. between the Moment and the Recovery Drivers section).

Update its comment to record the move and the reasoning:

```tsx
      {/* Read — the coach's interpretation, directly under the Moment it
          explains (moved up from the bottom of the chapter, Jul 2026: it used
          to sit after the load target and daytime stress, six cards below the
          signals it interprets). Keeps its own recovery-green identity rather
          than the kit's purple CoachRead shell: purple is the coach's prose
          voice, green is recovery, and collapsing the two would cost both
          signals. Still links to today's plan — acting on it happens there. */}
```

Nothing inside the element changes — same `recTitle`, `recBody`, `zoneColor`, `zoneLabel`, `scoreTxt`, wind-down/lights-out tiles and footer link.

- [ ] **Step 2: Confirm the numbering comments still read sensibly**

The section comments are numbered (`1 ·`, `2 ·`, `3 ·` …) and the moved card was `12 ·`. Do NOT renumber the others — that would be a large cosmetic diff over the whole file. The moved block's comment (above) drops its number entirely, which is why it no longer collides.

- [ ] **Step 3: Typecheck and run the suite**

Run: `cd frontend && npx tsc -b --noEmit && npx vitest run`
Expected: clean, full suite green. This is a pure JSX move — if a test breaks, something other than position changed and must be reverted.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/tabs/RecoveryTab.tsx
git commit -m "refactor(recovery): the recommendation reads the moment it follows

It sat six cards below the signals it interprets, after the load target
and daytime stress. Now it is directly under the Moment, which is the
whole point of a Read slot. Styling untouched — it keeps its recovery
green rather than taking the kit's purple coach shell, because purple is
the coach's prose voice and green is recovery."
```

---

### Task 4: Receive `MorningHealthCard`, close the chapter

**Files:**
- Modify: `frontend/src/components/dashboard/tabs/RecoveryTab.tsx`

**Interfaces:**
- Consumes: `MorningHealthCard` (default export) from `../MorningHealthCard` — self-contained, owns its own fetch and null-renders when the detector flags nothing. `NextChapter` (default export) from `../../narrative/NextChapter`, props `{ from: ChapterId; de: boolean }`; `from="body"` makes it link to `/dashboard?tab=history` and read "WEITER — HAT ES FUNKTIONIERT" / "NEXT — DID IT WORK". No strings are passed.

- [ ] **Step 1: Mount `MorningHealthCard`**

It was removed from Heute in phase 2a and is currently mounted nowhere in the app. It surfaces an illness / significant-downturn cluster from morning wearable vitals and self-hides when there is no cluster.

Mount it immediately **after** the Recovery hero card and **before** the Moment from Task 2:

```tsx
      {/* Morning-health early-warning — illness / significant-downturn cluster
          from the morning wearable vitals (GET /health/morning-check). Renders
          ONLY when the detector flags a real cluster vs the athlete's baseline;
          a normal morning shows nothing. Received from Heute (phase 2b): an
          overnight-vitals warning is a body signal, and this is where body
          signals live. Placed above the Moment deliberately — when the
          detector fires, a possible illness outranks whichever driver is
          furthest below baseline. Self-contained: owns its data + null-render. */}
      <MorningHealthCard />
```

Add `import MorningHealthCard from '../MorningHealthCard'`.

- [ ] **Step 2: Add the chapter handoff**

Find the end of the component's return. Insert as the last content element, before any closing overlay/sheet element (this file renders a `BottomSheet` — check with `grep -n "BottomSheet\|calSheet" src/components/dashboard/tabs/RecoveryTab.tsx`; the handoff goes before it, since a sheet is an overlay, not page content):

```tsx
      {/* Chapter handoff — every chapter names the next one, which is what
          makes four pages read as one document rather than four menus. */}
      <NextChapter from="body" de={de} />
```

Add `import NextChapter from '../../narrative/NextChapter'`.

- [ ] **Step 3: Typecheck and run the suite**

Run: `cd frontend && npx tsc -b --noEmit && npx vitest run`
Expected: clean, full suite green.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/tabs/RecoveryTab.tsx
git commit -m "feat(recovery): take the health card, close the chapter

MorningHealthCard arrives from Heute — an overnight-vitals warning is a
body signal, and this is where body signals live now. It sits above the
Moment on purpose: when the illness detector fires, that outranks
whichever driver happens to be furthest below baseline. Körper also ends
by naming the next chapter instead of just stopping."
```

---

### Task 5: Verify at 390×844

Deploying is **not** part of this task. This work happens on a feature branch, and the deploy happens after a final whole-branch review that the controller runs once all tasks are done. Do not run `railway up`, do not push, do not touch `main`.

- [ ] **Step 1: Full gates**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npx eslint src/utils/limitingDriver.ts src/components/dashboard/tabs/RecoveryTab.tsx src/components/narrative
```

Compare the eslint output against the same command with your changes stashed, so pre-existing findings are not attributed to this work.

- [ ] **Step 2: Render Körper and read it**

Dev servers: backend on `:8042`, frontend on `:5180` (the backend's `CORS_ORIGINS` allowlists only 5173 and 5180). DB on `:5433`.

At 390×844, load `/dashboard?tab=body` and check by eye:

1. **The order reads as an arc:** ChapterBar → hero ring → (health card, only if the detector fires) → Moment → Recommendation → drivers → the rest of the evidence → handoff.
2. **The Moment says something true.** Whatever driver it names must match that driver's own tile in the list below — same label, same value. A mismatch means the array refactor changed a number.
3. **If readiness is withheld on your test account** (a stale wearable — the hero shows an amber "no current overnight data" note and a Sync button), the Moment must be **absent entirely**. Confirm this; it is the honesty rule this plan turns on. If your account happens to be fresh instead, say so in your report and note which case you actually observed rather than implying both.
4. `NextChapter` sits at the very bottom, reads "WEITER — HAT ES FUNKTIONIERT", and taps through to `/dashboard?tab=history`.
5. **No card is missing.** Count the sections against this list: hero, drivers, metric row, sleep stages, sleep need, sleep quality, load target, daytime stress, recommendation, recovery outlook, recovery calendar, behaviors & journal. All twelve must still be present — this phase cut nothing.

Screenshot the page top and bottom.

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build
```

Report the result and STOP. Do not deploy.

---

## Self-Review

**Spec coverage.** Körper's Moment → Tasks 1–2. Its Read → Task 3. `MorningHealthCard` received → Task 4. Its Next → Task 4. Hero unchanged (spec says so). Evidence kept in full with no cuts → enforced as a Global Constraint and verified in Task 5 Step 2.5. The spec's "reordered by descending depth" → addressed by Decision 3 above: the two moves this plan makes satisfy it, and reshuffling the other nine sections is explicitly out of scope as churn.

**One spec assumption corrected.** The Phase 2 spec anticipated that `CoachRead` would need widening for Körper's Read slot (a concern 2a's final review also raised). Decision 1 removes that need entirely: the Recommendation card keeps its own styling and fills the Read role by position. No kit component changes in this plan.

**Placeholder scan.** No TBDs. Line numbers are given as "currently ~N" with a grep anchor for each, because `RecoveryTab.tsx` is edited by three of these tasks and numbers drift. Task 2 Step 1 includes an explicit count check (6 tiles) with an instruction to stop rather than guess if it disagrees.

**Type consistency.** `DriverDatum` is defined once in Task 1 (`key`, `label`, `value`, `delta`, `dev`) and its four required fields are all present on every element of Task 2's `driverRows`. `limitingDriver(drivers: DriverDatum[]): DriverDatum | null` is the signature in both the Task 1 test and the Task 2 call site. `MomentCard`'s props (`eyebrow`, `headline`, `support`, `to`, `children`) and `NextChapter`'s (`from`, `de`) match the Phase 1 components already on `main`.
