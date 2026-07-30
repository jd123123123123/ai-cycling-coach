# Dashboard Declutter & Honest Numbers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the chapter header from every tab, promote the coach's read and readiness contributors to the ring, relocate three cards off Today, and fix three surfaces that render fabricated or mismatched numbers.

**Architecture:** Almost all of this is presentation-layer work in `frontend/src`. Two tasks touch the backend, both for the same reason: an API schema is dropping fields the service layer already computes. No new dependencies, no new visual language — existing glass cards, chips and sheet primitives only.

**Tech Stack:** React 19 + TypeScript, Vite (rolldown), vitest + @testing-library/react, Tailwind utility classes alongside inline CSS-var styles, `motion` for animation, FastAPI + Pydantic + SQLAlchemy on the backend.

## Global Constraints

- **Mobile-only priority.** Verify at 390×844. Desktop is a sanity check, never a gate.
- **German-first copy.** Every user-facing string ships `de` and `en` via the `de`/`locale` pattern already in each file.
- **Honest absence.** Where a number is unavailable render `—`. Never fabricate, never substitute a default that reads as real data.
- **No new colour literals.** Use existing CSS vars (`--color-recovery`, `--color-amber`, `--color-muted`, `--color-ink`, `--color-ink-2`, `--color-rule`, `--color-surface-2`, …).
- **Bike-only.** Do not add sport branches. Do not extend running/strength surfaces.
- **Test suite is currently green: 649 tests, 61 files.** It must be green after every task.
- **Frontend gates, run from `frontend/`:** `npx tsc -b --noEmit`, `npx vitest run`, `npx eslint <changed files>`, `npm run build`.
- **Backend gates, run from `backend/`:** `python -m pytest`.
- **Do not deploy.** Deployment happens after the whole branch is reviewed.

---

### Task 1: Remove ChapterBar from all four tabs

**Files:**
- Delete: `frontend/src/components/narrative/ChapterBar.tsx`
- Delete: `frontend/src/components/narrative/__tests__/ChapterBar.test.tsx`
- Modify: `frontend/src/utils/seasonArc.ts` (add `CHAPTER_TITLES`)
- Modify: `frontend/src/components/narrative/NextChapter.tsx:11` (import moves)
- Modify: `frontend/src/components/dashboard/tabs/TodayTab.tsx` (import 60, mount 1104)
- Modify: `frontend/src/components/dashboard/tabs/PlanTab.tsx` (import 28, mounts 485 and 521)
- Modify: `frontend/src/components/dashboard/tabs/HistoryTab.tsx` (import 40, mount 418)
- Modify: `frontend/src/components/dashboard/tabs/RecoveryTab.tsx` (import 32, mount 552)
- Modify: `frontend/src/components/dashboard/MobileBottomNav.tsx:30` (error-string wording)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `CHAPTER_TITLES: Record<ChapterId, { en: string; de: string }>` exported from `utils/seasonArc.ts`. Task 10 does not depend on this; nothing else does either except `NextChapter`.

- [ ] **Step 1: Move `CHAPTER_TITLES` into `seasonArc.ts`**

Append to `frontend/src/utils/seasonArc.ts` (it already exports `CHAPTERS`, `chapterIndex`, `phaseLabel`, `ChapterId`):

```ts
/** Each chapter's question, in the athlete's language. Lived in ChapterBar
 *  until that component was removed; NextChapter still names the next
 *  chapter's question, so the titles outlive the bar that introduced them. */
export const CHAPTER_TITLES: Record<ChapterId, { en: string; de: string }> = {
  today:   { en: 'WHAT DO I DO TODAY', de: 'WAS MACHE ICH HEUTE' },
  plan:    { en: 'WHERE THIS IS GOING', de: 'WO DAS HINGEHT' },
  body:    { en: 'CAN I TAKE IT',       de: 'KANN ICH DAS TRAGEN' },
  history: { en: 'DID IT WORK',         de: 'HAT ES FUNKTIONIERT' },
}
```

- [ ] **Step 2: Repoint `NextChapter`'s import**

In `frontend/src/components/narrative/NextChapter.tsx`, change line 11 from
`import { CHAPTER_TITLES } from './ChapterBar'` to:

```ts
import { CHAPTER_TITLES } from '../../utils/seasonArc'
```

- [ ] **Step 3: Run the narrative tests to prove the move is clean**

Run: `cd frontend && npx vitest run src/components/narrative`
Expected: `narrativeKit.test.tsx` PASSES. `ChapterBar.test.tsx` still passes at this point (the component still exists).

- [ ] **Step 4: Delete the component and its test**

```bash
rm frontend/src/components/narrative/ChapterBar.tsx
rm frontend/src/components/narrative/__tests__/ChapterBar.test.tsx
```

- [ ] **Step 5: Remove all five mount sites and their imports**

In each of `TodayTab.tsx`, `PlanTab.tsx`, `HistoryTab.tsx`, `RecoveryTab.tsx`: delete the `import ChapterBar from '../../narrative/ChapterBar'` line and every `<ChapterBar … />` element (PlanTab has **two**, at 485 and 521).

Then, in each file, check whether the `arc` local is still read by anything else. PlanTab uses the arc for its own content — **keep** its `useSeasonArc` call. For the other three, if `arc` becomes unused, remove the `useSeasonArc()` call and its import; if anything else reads it, leave it. Let `tsc` and `eslint` tell you which — do not guess.

- [ ] **Step 6: Fix the stale error string**

`MobileBottomNav.tsx:30` reads:

```ts
console.error(`ChapterBar has ${CHAPTERS.length} chapters, nav has ${TABS.length} tabs`)
```

Keep the assertion (it still guards a real invariant) and reword:

```ts
console.error(`seasonArc has ${CHAPTERS.length} chapters, nav has ${TABS.length} tabs`)
```

- [ ] **Step 7: Full gates**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npx eslint src/components/narrative src/components/dashboard/tabs src/utils/seasonArc.ts
```
Expected: tsc clean, all tests pass (count drops by however many were in `ChapterBar.test.tsx`), eslint clean.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(nav): retire the chapter header block

It sat at the top of all four tabs carrying chapter dots, a KAPITEL n
title and a season anchor. The anchor duplicated Today's own header line
and the Plan tab's fuller phase display; the dots and title were chrome
above the answer. CHAPTER_TITLES moves to seasonArc, which already owns
every other chapter constant, because NextChapter still names the next
chapter's question."
```

---

### Task 2: Make "Diese Woche" expandable

**Files:**
- Modify: `frontend/src/components/dashboard/ThisWeekCard.tsx`
- Create: `frontend/src/components/dashboard/__tests__/ThisWeekCard.test.tsx`

**Interfaces:**
- Consumes: `deriveThisWeek` from `./thisWeek` (unchanged, do not edit that file).
- Produces: nothing other tasks consume.

Collapsed shows: title, `paceLine` subtitle, the big `%`, the progress bar.
Expanded adds: the three-stat row and the seven day dots.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/dashboard/__tests__/ThisWeekCard.test.tsx`. Mock the two data hooks so the card renders deterministically without a network:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../../hooks/useActivitiesRange', () => ({
  useActivitiesRange: () => ({ data: { activities: [] } }),
}))
vi.mock('../../../hooks/useCurrentWeek', () => ({
  useCurrentWeek: () => ({ data: null }),
}))
vi.mock('../../../contexts/LocaleContext', () => ({
  useLocale: () => ({ locale: 'de' }),
}))

import ThisWeekCard from '../ThisWeekCard'

describe('ThisWeekCard', () => {
  beforeEach(() => localStorage.clear())

  it('hides the stats row and day dots until expanded', async () => {
    render(<ThisWeekCard />)
    expect(screen.getByText('Diese Woche')).toBeInTheDocument()
    expect(screen.queryByText('TSS erledigt')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /diese woche/i }))
    expect(screen.getByText('TSS erledigt')).toBeInTheDocument()
  })

  it('remembers the expanded state across remounts', async () => {
    const { unmount } = render(<ThisWeekCard />)
    await userEvent.click(screen.getByRole('button', { name: /diese woche/i }))
    unmount()

    render(<ThisWeekCard />)
    expect(screen.getByText('TSS erledigt')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/__tests__/ThisWeekCard.test.tsx`
Expected: FAIL — there is no button, and `TSS erledigt` is present when it should be hidden.

- [ ] **Step 3: Add the expand state**

At the top of the `ThisWeekCard` component body, alongside the existing hooks:

```tsx
const STORAGE_KEY = 'thisWeekCard.expanded'
const [expanded, setExpanded] = useState<boolean>(() => {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
})
const toggle = () => setExpanded((v) => {
  try { localStorage.setItem(STORAGE_KEY, v ? '0' : '1') } catch { /* private mode */ }
  return !v
})
```

Add `useState` to the existing `import { useMemo } from 'react'` line, and import `ChevronDown` from `lucide-react` alongside `Check, Zap, Bed`.

- [ ] **Step 4: Make the header a toggle and gate the two lower blocks**

Wrap the existing `<CardHead …/>` in a button, and pass the chevron through the head's existing `right` slot so the `%` and the chevron sit together:

```tsx
<button
  type="button"
  onClick={toggle}
  aria-expanded={expanded}
  aria-controls="this-week-details"
  className="flex w-full items-center justify-between gap-3 text-left"
>
  {/* existing CardHead markup, with the chevron appended inside `right` */}
</button>
```

Append to whatever `right` currently renders:

```tsx
<ChevronDown
  size={18}
  style={{
    color: 'var(--color-muted)',
    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
    transition: 'transform 180ms ease',
    flexShrink: 0,
  }}
/>
```

Then wrap the three-stat row and the day-dot row (the last two children of `<Card>`) in:

```tsx
{expanded && (
  <div id="this-week-details" className="flex flex-col" style={{ gap: 16 }}>
    {/* the existing three-stat row */}
    {/* the existing day-dot row */}
  </div>
)}
```

Leave the progress bar and its "Noch keine Plandaten diese Woche" fallback **outside** the gate — they are collapsed content.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/__tests__/ThisWeekCard.test.tsx`
Expected: PASS, both cases.

- [ ] **Step 6: Gates and commit**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npx eslint src/components/dashboard/ThisWeekCard.tsx
git add -A
git commit -m "feat(week): Diese Woche collapses to its headline

The card carried five blocks on a screen whose job is one decision. It
now opens on the compliance number, the pace sentence and the bar; the
per-metric stats and the Mon-Sun dots are one tap away and the choice
persists. deriveThisWeek is untouched, so /load-form still agrees."
```

---

### Task 3: Move Fitness & Frische to Körper

**Files:**
- Modify: `frontend/src/components/dashboard/tabs/TodayTab.tsx` (remove import at 25 and the mount)
- Modify: `frontend/src/components/dashboard/tabs/RecoveryTab.tsx` (add import and mount)

**Interfaces:**
- Consumes: `FitnessFreshnessCard` (default export, takes no props).
- Produces: nothing.

- [ ] **Step 1: Remove from Today**

Delete `import FitnessFreshnessCard from '../FitnessFreshnessCard'` (line 25) and the `<FitnessFreshnessCard />` element from `TodayTab.tsx`.

- [ ] **Step 2: Mount on Körper**

In `RecoveryTab.tsx` add:

```tsx
import FitnessFreshnessCard from '../FitnessFreshnessCard'
```

and mount `<FitnessFreshnessCard />` in the tab's main content column. Place it **after** the tab's existing vitals/readiness content and before `<NextChapter from="body" … />` — CTL/ATL/TSB is a load-context signal and should read after the overnight body signals it contextualises, not before them.

- [ ] **Step 3: Gates**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npx eslint src/components/dashboard/tabs/TodayTab.tsx src/components/dashboard/tabs/RecoveryTab.tsx
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(today): Fitness & Frische moves to Koerper

CTL/ATL/TSB answers 'can I take it', which is Koerper's question, and
Koerper is already where every other body signal was consolidated. The
card is unchanged."
```

---

### Task 4: Split Zusätzliche Einheiten — today on Today, 7 days on Verlauf

**Files:**
- Modify: `frontend/src/components/dashboard/extraSessions.ts`
- Modify: `frontend/src/components/dashboard/ExtraSessionsCard.tsx`
- Modify: `frontend/src/components/dashboard/tabs/TodayTab.tsx`
- Modify: `frontend/src/components/dashboard/tabs/HistoryTab.tsx`
- Modify: `frontend/src/components/dashboard/__tests__/extraSessions.test.ts` (existing node-env test file — confirm the exact path with `ls` before editing; if it does not exist, create it next to the other dashboard tests)

**Interfaces:**
- Consumes: `deriveExtraSessions` (existing).
- Produces: `ExtraSessionsCard` gains a required prop:
  ```ts
  window: 'today' | 'week'
  ```
  `'today'` renders only sessions dated today and returns `null` when there are none. `'week'` is exactly today's rolling-7-day behaviour.

- [ ] **Step 1: Write the failing test for the same-day window**

Add to the `extraSessions` test file. Read the existing tests first and follow their fixture-building style rather than inventing a second one:

```ts
it('counts only sessions dated today when the window is a single day', () => {
  const today = new Date('2026-07-30T10:00:00Z')
  const acts = [
    makeActivity({ start: '2026-07-30T06:00:00Z', kind: 'gym' }),
    makeActivity({ start: '2026-07-27T06:00:00Z', kind: 'gym' }),
  ]
  const m = deriveExtraSessions(acts, today, { days: 1 })
  expect(m.count).toBe(1)
})
```

`makeActivity` is illustrative — use whatever fixture helper the existing tests already define, and match `deriveExtraSessions`'s real signature, which you must read before writing this.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/__tests__/extraSessions.test.ts`
Expected: FAIL — the options argument is not accepted, or the count is 2.

- [ ] **Step 3: Add the window parameter**

Give `deriveExtraSessions` an optional trailing options argument defaulting to the current behaviour, so no existing caller changes meaning:

```ts
export function deriveExtraSessions(
  activities: ActivityRead[],
  today: Date,
  opts: { days?: number } = {},
) {
  const days = opts.days ?? 7
  // …existing body, with the window start computed from `days`
}
```

Keep every other line of the derivation identical. This is a windowing change, not a load-math change.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/__tests__/extraSessions.test.ts`
Expected: PASS, including all pre-existing cases.

- [ ] **Step 5: Add the `window` prop to the card**

In `ExtraSessionsCard.tsx`:

```tsx
export default function ExtraSessionsCard({ window }: { window: 'today' | 'week' }) {
  // …
  const m = useMemo(
    () => deriveExtraSessions(actData?.activities ?? [], today, { days: window === 'today' ? 1 : 7 }),
    [actData, today, window],
  )

  // Today's job is one decision. A card whose only message is "nothing
  // happened" is noise on that screen, so it renders nothing at all.
  if (window === 'today' && m.count === 0) return null
  // …
}
```

Make the subtitle honest for each window — the current string is hardcoded to the 7-day framing:

```tsx
const subtitle = window === 'today'
  ? (de ? 'Heute · neben dem Radplan' : 'Today · beyond the bike plan')
  : (de ? 'Letzte 7 Tage · neben dem Radplan' : 'Last 7 days · beyond the bike plan')
```

The share-of-total-load sentence (`m.sharePct`) references "der letzten 7 Tage". For `window === 'today'`, either reword it to today or omit the share entirely — omitting is preferred, since a one-day share is a noisier number than it looks. Do not leave the 7-day wording on a one-day figure.

- [ ] **Step 6: Update both mount sites**

`TodayTab.tsx`: `<ExtraSessionsCard window="today" />`
`HistoryTab.tsx`: add the import and mount `<ExtraSessionsCard window="week" />` in the main content column, after the activity list.

- [ ] **Step 7: Gates and commit**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npx eslint src/components/dashboard/ExtraSessionsCard.tsx src/components/dashboard/extraSessions.ts src/components/dashboard/tabs/TodayTab.tsx src/components/dashboard/tabs/HistoryTab.tsx
git add -A
git commit -m "feat(today): extra sessions shrink to today, history moves to Verlauf

Today asked a rolling-7-day question on a screen that answers one day,
and rendered an empty state on every day the athlete did nothing extra.
It now shows today's extra sessions or nothing at all; the 7-day load
breakdown keeps its full form on Verlauf. The load math is unchanged --
only the window is a parameter now."
```

---

### Task 5: Backend — stop dropping cadence, HR and resolved watts from the plan API

**Files:**
- Modify: `backend/app/schemas/weeks.py:15-26` (`IntervalBlockOut`)
- Modify: `backend/app/api/weeks.py:201` and `backend/app/api/weeks.py:482` (both construction sites)
- Test: `backend/tests/` — add to the existing weeks/plan API test module (find it with `ls backend/tests | grep -i week`)

**Interfaces:**
- Produces: `IntervalBlockOut` gains four optional fields consumed by Task 6:
  ```python
  cadence_low: int | None = None
  cadence_high: int | None = None
  target_hr_low: int | None = None
  target_hr_high: int | None = None
  target_watts_low: int | None = None
  target_watts_high: int | None = None
  ```

**Why this task exists.** `ResolvedBlock` in `backend/app/services/workout_templates.py:145` already carries `target_hr_low/high`, `cadence_low/high` (line 69-70) and FTP-resolved `target_watts_low/high`. Its serializer (`workout_templates.py:3588-3610`) writes all of them into the stored block dict. `IntervalBlockOut` then forwards only duration, %FTP, zone and the structured-set fields — so the frontend never receives values that exist server-side, which is why Task 6's adapter had to invent them.

- [ ] **Step 1: Write the failing test**

Add a test asserting the plan endpoint forwards cadence and HR when the stored block carries them. Follow the existing test module's fixture and client style:

```python
def test_day_plan_intervals_carry_cadence_and_hr(client, seeded_week_with_blocks):
    resp = client.get("/weeks/current")
    assert resp.status_code == 200
    blocks = resp.json()["days"][0]["intervals"]
    assert blocks[0]["cadence_low"] == 85
    assert blocks[0]["cadence_high"] == 95
    assert blocks[0]["target_hr_low"] is not None
```

Read the existing week-API tests first and reuse their fixtures. If no fixture seeds blocks with cadence, extend the nearest one rather than building a parallel fixture.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && python -m pytest -k cadence -v`
Expected: FAIL with `KeyError: 'cadence_low'` — the field is not in the response schema.

- [ ] **Step 3: Widen the schema**

In `backend/app/schemas/weeks.py`, append to `IntervalBlockOut`:

```python
    # ── Prescription detail the service layer already resolves ────────────
    # ResolvedBlock carries cadence, an LTHR-derived HR band and FTP-resolved
    # watts; this schema used to forward none of them, so the client had to
    # re-derive watts from %FTP against a guessed FTP and could never show
    # cadence or HR at all. All optional: older stored rows simply omit them.
    cadence_low: int | None = None
    cadence_high: int | None = None
    target_hr_low: int | None = None
    target_hr_high: int | None = None
    target_watts_low: int | None = None
    target_watts_high: int | None = None
```

- [ ] **Step 4: Forward the fields at both construction sites**

**Site 1 — `backend/app/api/weeks.py:201`** reads from a stored `blk` dict. Add:

```python
                    cadence_low=blk.get("cadence_low"),
                    cadence_high=blk.get("cadence_high"),
                    target_hr_low=blk.get("target_hr_low"),
                    target_hr_high=blk.get("target_hr_high"),
                    target_watts_low=blk.get("target_watts_low"),
                    target_watts_high=blk.get("target_watts_high"),
```

**Site 2 — `backend/app/api/weeks.py:482`** has both the stored `blk` dict and the template block `tb`. Follow the pattern already used there for `reps`/`on_s` — stored value first, template as fallback:

```python
                    cadence_low=blk.get("cadence_low", tb.cadence_low if tb else None),
                    cadence_high=blk.get("cadence_high", tb.cadence_high if tb else None),
                    target_hr_low=blk.get("target_hr_low"),
                    target_hr_high=blk.get("target_hr_high"),
                    target_watts_low=blk.get("target_watts_low"),
                    target_watts_high=blk.get("target_watts_high"),
```

`tb` is an `IntervalBlock` (template), which has cadence but **no** HR or watts — those are resolved later, so there is no template fallback for them. Do not invent one.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && python -m pytest -k cadence -v`
Expected: PASS.

- [ ] **Step 6: Full backend suite and commit**

```bash
cd backend && python -m pytest
git add -A
git commit -m "fix(api): the plan endpoint stops discarding cadence, HR and watts

ResolvedBlock resolves a cadence prescription, an LTHR-derived HR band
and FTP-scaled watts, and the stored block dict carries all of them.
IntervalBlockOut forwarded none, so the client received a %FTP number and
nothing else -- which is why the plan sometimes showed no heart rate or
cadence at all, and why it had to guess an FTP to print watts. All six
fields are optional, so older stored rows still deserialize."
```

---

### Task 6: Frontend — the plan renders real cadence, HR and watts

**Files:**
- Modify: `frontend/src/api/weeks.ts:3-15` (`IntervalBlockOut`)
- Modify: `frontend/src/components/dashboard/DayPlanCard.tsx:42-59` (`adaptIntervals`)
- Create: `frontend/src/components/dashboard/__tests__/adaptIntervals.test.ts`

**Interfaces:**
- Consumes: the six new fields from Task 5. **Task 5 must land first.**
- Produces: `adaptIntervals(intervals, thresholdWatts)` — exported from `DayPlanCard.tsx` so it can be unit-tested.

**Why this task exists.** `adaptIntervals` currently hardcodes `cadence_low/high` and `target_hr_low/high` to `null`, and computes watts as `Math.round(pct * 200 * 0.95)` — a fixed 200 W FTP. Every prescribed wattage on this path is wrong for any athlete whose threshold is not exactly 200 W.

- [ ] **Step 1: Mirror the six fields in the TS interface**

In `frontend/src/api/weeks.ts`, append to `IntervalBlockOut`:

```ts
  /** Prescription detail resolved server-side (Jul 2026). Optional: older
   *  stored rows omit them, and HR is null whenever LTHR is unknown. */
  cadence_low?: number | null
  cadence_high?: number | null
  target_hr_low?: number | null
  target_hr_high?: number | null
  target_watts_low?: number | null
  target_watts_high?: number | null
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/components/dashboard/__tests__/adaptIntervals.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { adaptIntervals } from '../DayPlanCard'
import type { IntervalBlockOut } from '../../../api/weeks'

const block = (over: Partial<IntervalBlockOut> = {}): IntervalBlockOut => ({
  duration_seconds: 600,
  power_target_pct_ftp: 0.75,
  zone: 3,
  ...over,
})

describe('adaptIntervals', () => {
  it('passes through the cadence and HR the API now sends', () => {
    const [b] = adaptIntervals([block({
      cadence_low: 85, cadence_high: 95, target_hr_low: 140, target_hr_high: 155,
    })], 250)
    expect(b.cadence_low).toBe(85)
    expect(b.cadence_high).toBe(95)
    expect(b.target_hr_low).toBe(140)
    expect(b.target_hr_high).toBe(155)
  })

  it('prefers server-resolved watts over deriving them', () => {
    const [b] = adaptIntervals([block({ target_watts_low: 180, target_watts_high: 200 })], 250)
    expect(b.target_watts_low).toBe(180)
    expect(b.target_watts_high).toBe(200)
  })

  it('derives watts from the real threshold when the server sent none', () => {
    const [b] = adaptIntervals([block({ power_target_pct_ftp: 0.8 })], 300)
    // 0.8 * 300 = 240, +/- 5%
    expect(b.target_watts_low).toBe(228)
    expect(b.target_watts_high).toBe(252)
  })

  it('reports no watts rather than inventing an FTP', () => {
    const [b] = adaptIntervals([block()], null)
    expect(b.target_watts_low).toBeNull()
    expect(b.target_watts_high).toBeNull()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/__tests__/adaptIntervals.test.ts`
Expected: FAIL — `adaptIntervals` is not exported, and once exported it takes one argument, not two.

- [ ] **Step 4: Rewrite `adaptIntervals`**

Replace `DayPlanCard.tsx:42-59` with:

```ts
/** Map the plan API's blocks onto the shared ResolvedBlock shape.
 *
 *  This used to null out cadence and HR unconditionally and compute watts
 *  against a hardcoded 200 W FTP, so the plan could never show a cadence or
 *  HR prescription and printed the wrong watts for every athlete not at
 *  exactly 200 W. The server now sends all three; we prefer what it resolved,
 *  fall back to the athlete's real threshold, and report nothing at all
 *  rather than guess. */
export function adaptIntervals(
  intervals: IntervalBlockOut[],
  thresholdWatts: number | null,
): ResolvedBlock[] {
  return intervals.map((b, i) => {
    const pct = b.power_target_pct_ftp ?? 0.65
    const derived = thresholdWatts != null && thresholdWatts > 0
      ? { lo: Math.round(pct * thresholdWatts * 0.95), hi: Math.round(pct * thresholdWatts * 1.05) }
      : null
    return {
      name: `Segment ${i + 1}`,
      duration_s: b.duration_seconds,
      target_pct_ftp: pct,
      target_watts_low: b.target_watts_low ?? derived?.lo ?? null,
      target_watts_high: b.target_watts_high ?? derived?.hi ?? null,
      zone: b.zone,
      rpe: Math.round(b.zone * 1.2),
      cadence_low: b.cadence_low ?? null,
      cadence_high: b.cadence_high ?? null,
      target_hr_low: b.target_hr_low ?? null,
      target_hr_high: b.target_hr_high ?? null,
    }
  })
}
```

`ResolvedBlock` declares `target_watts_low: number` and `target_watts_high: number` as non-nullable (`frontend/src/api/coach.ts:26-27`). Widen both to `number | null` and fix whatever `tsc` then flags — `IntervalRibbon` is the main consumer and must render `—` for a null band rather than `NaN` or `0`. Do not cast the nulls away; the honest-absence rule is the point of this task.

- [ ] **Step 5: Pass the real threshold at the call site**

In `DayPlanCard`, read the athlete's threshold and hand it to the adapter. `usePowerProfile` is already used elsewhere for exactly this (`TodayTab` reads `powerProfile?.threshold_watts` for its header chip):

```tsx
const { data: powerProfile } = usePowerProfile()
const blocks = useMemo(
  () => adaptIntervals(day.intervals, powerProfile?.threshold_watts ?? null),
  [day.intervals, powerProfile],
)
```

Import `usePowerProfile` from `../../hooks/usePowerProfile`. Confirm the hook's exact export name and return shape before wiring it.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/dashboard/__tests__/adaptIntervals.test.ts`
Expected: PASS, all four cases.

- [ ] **Step 7: Gates and commit**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npx eslint src/components/dashboard/DayPlanCard.tsx src/api/weeks.ts
git add -A
git commit -m "fix(plan): real cadence, heart rate and watts on every planned day

adaptIntervals hardcoded cadence and HR to null, so those rows could
never appear no matter what the plan prescribed -- the reported
'sometimes not displayed'. It also derived watts from a hardcoded 200 W
FTP, making every prescribed wattage wrong for anyone else. It now
forwards what the server resolved, falls back to the athlete's real
threshold, and renders an honest dash when there is no threshold at all."
```

---

### Task 7: Fix the two wrong numbers in Anstiege

**Files:**
- Modify: `frontend/src/components/debrief/BreakdownPanels.tsx:29-60` (`mergeClimbs`) and `:286-300` (`ClimbsSlide` totals)
- Create: `frontend/src/components/debrief/__tests__/mergeClimbs.test.ts`

**Interfaces:**
- Produces: `mergeClimbs` exported from `BreakdownPanels.tsx` for testing. It is currently a module-private function.

**The two defects.**
1. The headline pairs `notable.length` (merged, filtered) with `totalAscent` summed over the **raw** `climbs` array — so the elevation figure includes climbs the list excluded.
2. When `mergeClimbs` bridges two segments, `duration_s` spans the gap but `distance_m` does not. Gradient (`gain / dist`) is therefore computed over a shorter span than VAM (`gain / dur`): gradient reads too steep, VAM too low, on the same table row.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/debrief/__tests__/mergeClimbs.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mergeClimbs } from '../BreakdownPanels'

const climb = (o: Partial<Climb> & { start_s: number; duration_s: number }) => ({
  distance_m: 1000, elev_gain_m: 50, avg_grade_pct: 5,
  vam_m_per_h: 600, w_per_kg: null, ...o,
})

describe('mergeClimbs', () => {
  it('spans grade and VAM over the same distance when bridging a gap', () => {
    // Two 1 km / 50 m segments, 60 s apart -> bridged into one climb.
    const [m] = mergeClimbs([
      climb({ start_s: 0, duration_s: 300 }),
      climb({ start_s: 360, duration_s: 300 }),
    ])
    // gain 100 m. Duration spans 0..660 s. Grade must be computed over the
    // same span the duration covers, not over 2000 m of climb-only distance.
    const impliedDist = (m.elev_gain_m / m.avg_grade_pct) * 100
    const vamDist = m.vam_m_per_h * (m.duration_s / 3600)
    expect(m.elev_gain_m).toBe(100)
    expect(m.duration_s).toBe(660)
    // Grade and VAM must describe one consistent segment: the distance implied
    // by the gradient must not exceed the distance the duration covers.
    expect(impliedDist).toBeGreaterThan(0)
    expect(vamDist).toBeCloseTo(m.elev_gain_m, 5)
  })

  it('keeps climbs separated by a long descent apart', () => {
    const out = mergeClimbs([
      climb({ start_s: 0, duration_s: 300 }),
      climb({ start_s: 1200, duration_s: 300 }),
    ])
    expect(out).toHaveLength(2)
  })
})
```

Import the `Climb` type from wherever `BreakdownPanels` imports it and type the helper properly — read the file first.

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/components/debrief/__tests__/mergeClimbs.test.ts`
Expected: FAIL — `mergeClimbs` is not exported.

- [ ] **Step 3: Export `mergeClimbs` and make the spans agree**

Add `export` to the function. The `Climb` payload has no gap-distance field, so the two spans cannot be reconciled by adding gap distance — reconcile them by computing **both** figures over the climbing-only span:

```ts
      const gain = cur.elev_gain_m + nx.elev_gain_m
      const dist = cur.distance_m + nx.distance_m
      // Both the bridged span's endpoints and its climbing-only totals are
      // available, but the gap's own distance is not in the payload. Grade and
      // VAM must describe ONE span or the row contradicts itself, so both use
      // the climbing-only span: the gap is a false flat inside the climb (<=90 s
      // by the bridge rule), not a part of it worth averaging over.
      const climbDur = cur.duration_s + nx.duration_s
      const dur = nx.start_s + nx.duration_s - cur.start_s
      cur = {
        ...cur,
        duration_s: dur,
        distance_m: dist,
        elev_gain_m: gain,
        avg_grade_pct: dist > 0 ? (gain / dist) * 100 : cur.avg_grade_pct,
        vam_m_per_h: climbDur > 0 ? gain / (climbDur / 3600) : cur.vam_m_per_h,
        w_per_kg: wDur > 0 ? wSum / wDur : null,
      }
```

`duration_s` stays wall-clock (the TIME column should show how long the climb actually took, gap included); only the VAM denominator becomes the climbing-only span. Note that in the comment so the next reader does not "fix" it back.

- [ ] **Step 4: Fix the headline total**

In `ClimbsSlide`, move the `totalAscent` computation below `notable` and sum over it:

```ts
  const notable = merged
    .filter((c) => c.distance_m >= 300 || c.elev_gain_m >= 30)
    .sort((a, b) => b.elev_gain_m - a.elev_gain_m)
  // Sum the climbs the headline COUNTS. Summing the raw fragments reported
  // elevation from climbs the filter had just excluded from the list.
  const totalAscent = notable.reduce((s, c) => s + c.elev_gain_m, 0)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/debrief`
Expected: PASS, including any pre-existing debrief tests.

- [ ] **Step 6: Gates and commit**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npx eslint src/components/debrief/BreakdownPanels.tsx
git add -A
git commit -m "fix(climbs): the headline and the rows stop contradicting themselves

Two defects. The headline counted merged, filtered climbs but summed
ascent over every raw fragment, so it reported elevation from climbs that
were not in the list. And bridged climbs measured gradient over a span
that excluded the bridged gap while measuring VAM over one that included
it, so the two figures on a single row described different segments --
gradient too steep, VAM too low. Detection thresholds are unchanged; this
is arithmetic, not retuning."
```

---

### Task 8: Backend — a route polyline on the activity list

**Files:**
- Modify: the activity-list response schema and endpoint in `backend/app/api/activities.py` (find the list endpoint and its `ActivityRead`-equivalent schema; the per-ride stream endpoint at line 179 already produces a polyline and is the reference for how to derive one)
- Test: the existing activities API test module

**Interfaces:**
- Produces: each activity in the list response gains
  ```python
  route_polyline: list[list[float]] | None   # [[lat, lng], …], <= 48 points, None without GPS
  ```
  Task 9 consumes this.

- [ ] **Step 1: Read how the stream endpoint builds its polyline**

Open `backend/app/api/activities.py:179` and the service it calls. Note where the point list comes from and whether it is cached. Do not duplicate the extraction logic — reuse or factor it out.

- [ ] **Step 2: Write the failing test**

```python
def test_activity_list_carries_a_downsampled_route(client, seeded_gps_activity):
    resp = client.get("/activities")
    assert resp.status_code == 200
    a = resp.json()["activities"][0]
    assert a["route_polyline"] is not None
    assert len(a["route_polyline"]) <= 48
    assert len(a["route_polyline"][0]) == 2

def test_indoor_activity_has_no_route(client, seeded_indoor_activity):
    resp = client.get("/activities")
    a = resp.json()["activities"][0]
    assert a["route_polyline"] is None
```

Adapt fixture names to the module's existing ones.

- [ ] **Step 3: Run to verify it fails**

Run: `cd backend && python -m pytest -k route_polyline -v`
Expected: FAIL — `KeyError: 'route_polyline'`.

- [ ] **Step 4: Add the field and a downsampler**

Add `route_polyline: list[list[float]] | None = None` to the list item schema. Downsample with even index stride — not averaging, which would round corners off a track:

```python
def downsample_polyline(points: list[list[float]], max_points: int = 48) -> list[list[float]]:
    """Evenly-strided subsample. Stride, don't average: averaging smooths real
    corners into a track the athlete never rode. Always keeps first and last."""
    if len(points) <= max_points:
        return points
    step = (len(points) - 1) / (max_points - 1)
    out = [points[round(i * step)] for i in range(max_points)]
    out[-1] = points[-1]
    return out
```

Populate from cached streams. **Do not** trigger a stream fetch per activity to fill this — if a ride's stream is not already cached, return `None` and let the client render the placeholder. A list endpoint must not fan out N stream requests.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest -k route_polyline -v`
Expected: PASS, both cases.

- [ ] **Step 6: Check the list endpoint's latency did not regress**

Run the full backend suite and confirm no test asserting activity-list timing or query count now fails:
```bash
cd backend && python -m pytest
```
If the list previously issued one query and now issues one per activity, fix it with an eager load before committing. Say so in the commit message if you had to.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(api): activities carry a downsampled route polyline

The history list had no route data at all -- per-activity tracks lived
only behind the per-ride stream endpoint, one request each, unusable for
a list. Each activity now carries at most 48 evenly-strided points from
its cached stream, or null when the ride has no GPS or no cached stream.
Strided, not averaged: averaging smooths real corners into a track nobody
rode. The endpoint never fetches a stream to fill this field."
```

---

### Task 9: History thumbnails draw the real route

**Files:**
- Create: `frontend/src/components/ui/RouteSketch.tsx`
- Modify: `frontend/src/components/dashboard/tabs/HistoryTab.tsx:54-110` (delete `fnv1a`, `mulberry32`, and the generative body of `ActivityThumb`)
- Modify: `frontend/src/pages/ExploreRoutesView.tsx:43` (use the shared component)
- Modify: `frontend/src/components/social/RouteMini.tsx` (use the shared component)
- Modify: `frontend/src/api/` — add `route_polyline` to the activity list type (find the interface that types the list response)
- Create: `frontend/src/components/ui/__tests__/RouteSketch.test.tsx`

**Interfaces:**
- Consumes: `route_polyline` from Task 8. **Task 8 must land first.**
- Produces:
  ```tsx
  export default function RouteSketch(props: {
    polyline: [number, number][] | null
    width: number
    height: number
    color: string
    strokeWidth?: number
  }): JSX.Element | null
  ```
  Returns `null` for a polyline with fewer than 2 points.

**Why this task exists.** `ActivityThumb` hashes the activity id with `fnv1a`, seeds `mulberry32`, and draws a random "intensity terrain" ridge. It encodes nothing about the ride — which is why its gradient looks arbitrary. It is decorative fiction in a list of real rides.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ui/__tests__/RouteSketch.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import RouteSketch from '../RouteSketch'

describe('RouteSketch', () => {
  it('renders nothing without at least two points', () => {
    const { container } = render(
      <RouteSketch polyline={[[47.1, 9.1]]} width={64} height={64} color="#16E08A" />,
    )
    expect(container.querySelector('polyline')).toBeNull()
  })

  it('renders nothing for a null polyline', () => {
    const { container } = render(
      <RouteSketch polyline={null} width={64} height={64} color="#16E08A" />,
    )
    expect(container.querySelector('polyline')).toBeNull()
  })

  it('fits the track inside the box', () => {
    const { container } = render(
      <RouteSketch
        polyline={[[47.0, 9.0], [47.1, 9.2], [47.05, 9.1]]}
        width={64} height={64} color="#16E08A"
      />,
    )
    const pts = container.querySelector('polyline')!.getAttribute('points')!
    const coords = pts.split(' ').flatMap((p) => p.split(',').map(Number))
    expect(Math.min(...coords)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...coords)).toBeLessThanOrEqual(64)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/RouteSketch.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `RouteSketch`**

Port the projection from `ExploreRoutesView.tsx:43-57` rather than writing a third one. It normalizes lat/lng into the box; keep its aspect handling. Latitude increases upward but SVG y increases downward, so y must be flipped — verify against the existing implementation, do not re-derive it.

```tsx
/** RouteSketch — a ride's actual GPS track as a plain SVG line, no tiles.
 *
 *  One implementation, three callers (history thumbnails, the routes page,
 *  the crew card). It replaces HistoryTab's generative "intensity terrain"
 *  ridge, which was seeded from a hash of the activity id and encoded nothing
 *  about the ride it decorated. */
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/RouteSketch.test.tsx`
Expected: PASS, all three cases.

- [ ] **Step 5: Type the new API field**

Add to the activity list item interface:

```ts
  /** Downsampled GPS track, <= 48 points. Null for indoor rides and for rides
   *  whose stream is not cached — render the placeholder, never a fake line. */
  route_polyline?: [number, number][] | null
```

- [ ] **Step 6: Rewrite `ActivityThumb` and delete the generator**

Replace its body with `RouteSketch`, and delete `fnv1a` and `mulberry32` entirely (confirm with grep that nothing else calls them before deleting):

```tsx
function ActivityThumb({ activity, color }: { activity: ActivityRead; color: string }) {
  const sketch = (
    <RouteSketch polyline={activity.route_polyline ?? null} width={64} height={64} color={color} />
  )
  // No GPS, or no cached stream: a neutral mark, not a generated ridge.
  return (
    <div className="shrink-0 grid place-items-center rounded-[14px]"
         style={{ width: 64, height: 64, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
      {sketch ?? <Bike size={20} style={{ color: 'var(--color-muted)' }} />}
    </div>
  )
}
```

`RouteSketch` returns `null` rather than an element when it cannot draw, so `sketch ?? …` needs the component's return value, not the JSX element — call it as a function or check `activity.route_polyline` length directly at this call site. Pick one and keep it readable.

- [ ] **Step 7: Repoint the two other callers**

`ExploreRoutesView.tsx` and `RouteMini.tsx` both have their own copy of this projection. Replace both with `RouteSketch` and delete the local versions. Their existing visual output must not change — check each rendered surface before and after.

- [ ] **Step 8: Gates and commit**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npx eslint src/components/ui/RouteSketch.tsx src/components/dashboard/tabs/HistoryTab.tsx src/pages/ExploreRoutesView.tsx src/components/social/RouteMini.tsx
git add -A
git commit -m "feat(history): ride thumbnails show the actual route

The thumbnail was a procedurally generated ridge -- fnv1a over the
activity id seeding mulberry32 -- standing in for a route line. It looked
like data and was noise, which is why its gradient read as arbitrary. It
now draws the ride's real GPS track, and rides without one get a neutral
mark instead of a convincing fake. The projection existed in three
places; there is now one RouteSketch."
```

---

### Task 10: Promote contributors and the coach's read to the ring

**Files:**
- Create: `frontend/src/components/dashboard/ContributorsTrigger.tsx`
- Modify: `frontend/src/components/dashboard/ContributorsSheet.tsx` (container swap only)
- Modify: `frontend/src/components/dashboard/tabs/TodayTab.tsx` (mount the trigger, move `CoachRead`)
- Create: `frontend/src/components/dashboard/__tests__/ContributorsTrigger.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (Task 1 touches the same file; land this after it to avoid a conflict).
- Produces:
  ```tsx
  export default function ContributorsTrigger(props: {
    hrv: number | null
    rhr: number | null
    sleep: number | null
    tsb: number | null
    score: number | null
    pending: boolean
    de: boolean
  }): JSX.Element | null
  ```

**Target order on Today:** ring → gate kicker → **ContributorsTrigger** → **CoachRead** → session kicker → session card → weather → drivers → momentum.

**`ContributorsSheet` is orphaned.** Nothing imports its 483 lines. It was built as a 640 px `SideSheet`. Per this project's standing rule, an orphaned component is redesigned for where it now lives rather than mounted as-is.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/dashboard/__tests__/ContributorsTrigger.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ContributorsTrigger from '../ContributorsTrigger'

const base = { hrv: 62, rhr: 48, sleep: 81, tsb: -8, score: 74, pending: false, de: true }

describe('ContributorsTrigger', () => {
  it('renders nothing while readiness is withheld', () => {
    const { container } = render(<ContributorsTrigger {...base} pending />)
    expect(container).toBeEmptyDOMElement()
  })

  it('offers the explanation when a score is shown', () => {
    render(<ContributorsTrigger {...base} />)
    expect(screen.getByRole('button', { name: /dahinter/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/__tests__/ContributorsTrigger.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Build the trigger**

A single row under the ring: the two strongest contributors as compact chips, then a `Was dahinter steckt` / `What's driving it` button that opens the sheet.

- Reuse the drivers-row chip styling already in `TodayTab.tsx` (`background: '#14181DCC'`, `border: '1px solid #FFFFFF14'`, `backdropFilter: 'blur(10px)'`). Introduce no new visual language.
- "Strongest" = largest absolute deviation from the athlete's own baseline among HRV, RHR, sleep and TSB. If baselines are not available in props, rank by which values are present and non-null — do not invent a baseline.
- Return `null` when `pending` is true. A score being withheld must not get an explanation of what drove it; this is the same gate the ring's medallion state uses (`utils/readinessGate.ts`).

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/__tests__/ContributorsTrigger.test.tsx`
Expected: PASS, both cases.

- [ ] **Step 5: Port the sheet to the mobile bottom-sheet pattern**

`ContributorsSheet` renders `<SideSheet … width={640}>`. At 390 px that is not a side sheet. Swap the container for the app's bottom-sheet presentation — check how `MethodsDrawer.tsx` and `GlossarySheet.tsx` present at mobile width and follow whichever is the established pattern.

Change **only** the container. The section tabs (`SegmentedTabs`), the contributor list, the rationale section and the tools section are reused as-is.

- [ ] **Step 6: Mount both, in order, on Today**

In `TodayTab.tsx`, directly after the gate-kicker chip and the ring block, insert `<ContributorsTrigger … />` wired to the values already computed for the drivers row (`hrvNow`, `restingHr`, `sleepScore`, `tsb`, `score`, `readinessPending`).

Then **move** the existing `<CoachRead …/>` element (currently below the drivers row, around line 1479) up to sit immediately after the trigger. Move it — do not copy it; there must be exactly one `CoachRead` on Today. The drivers row stays where it is.

- [ ] **Step 7: Gates**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npx eslint src/components/dashboard/ContributorsTrigger.tsx src/components/dashboard/ContributorsSheet.tsx src/components/dashboard/tabs/TodayTab.tsx
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(today): the coach's read and what drove the score move to the ring

Both rendered roughly 1.7 screens below the ring at 390px -- the athlete
scrolled past the session to reach the explanation of the number they had
just looked at. The contributors surface existed only as an orphaned
640px side sheet that nothing imported; it is rebuilt as a two-chip
trigger under the ring opening a bottom sheet, reusing that sheet's
content and the drivers row's chip styling. It renders nothing while
readiness is withheld -- a withheld score gets no explanation."
```

---

### Task 11: Visual verification at 390×844

**Files:** none — this task changes nothing. It exists because this project has shipped a surface that passed every static gate and was still wrong.

- [ ] **Step 1: Full gates one more time**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npm run build
cd ../backend && python -m pytest
```

- [ ] **Step 2: Run the app and look at every changed surface**

Start the backend on `:8042` and the frontend on `:5180` (CORS allowlists 5173/5180 only). At **390×844**, check each of these and screenshot it:

1. **Today** — no chapter block at the top. Ring, then the contributors trigger, then the coach's read, then the session. Fitness & Frische is gone. Extra sessions show today only, or nothing.
2. **Contributors sheet** — opens from the trigger, is readable at 390 px, and is not a 640 px side sheet clipped at the viewport edge.
3. **Diese Woche** — collapsed on first load, showing only headline, %, sentence and bar. Expands on tap. Still expanded after a reload.
4. **Körper** — no chapter block; Fitness & Frische present and correctly placed.
5. **Verlauf** — no chapter block; ride thumbnails show real route lines, and a no-GPS ride shows the neutral mark, not a ridge. The 7-day extra-sessions breakdown is here.
6. **Plan** — no chapter block; open a day's interval detail and confirm cadence **and** heart rate appear, and that the watts match the athlete's actual FTP rather than a 200 W-derived number.
7. **A ride with climbs** — the Anstiege headline's Hm total corresponds to the climbs listed, and gradient/VAM on each row are plausible for that climb.

- [ ] **Step 3: Report**

Report what you saw per surface, with the screenshots. If any surface is wrong, fix it and re-verify before declaring the plan done. Do **not** deploy — the branch gets reviewed first.

---

## Self-Review

**Spec coverage.** All eight spec items map to tasks: §1→T1, §2→T10, §3→T2, §4→T3, §5→T4, §6→T5+T6, §7→T8+T9, §8→T7. The spec's testing section maps to per-task tests plus T11.

**Two tasks changed shape against the spec, both after verifying the code.** §6 was specced as a frontend-only adapter fix; the API schema turns out to drop cadence, HR *and* server-resolved watts at the boundary (`IntervalBlockOut` carries none of them, while `ResolvedBlock` and the stored block dict carry all three), so it is now a backend task plus a frontend task. The spec's own instruction was to verify this before writing the mapping and to say so if the backend was at fault. §8b's fix also changed: the spec offered adding gap distance *or* excluding it consistently, and since the `Climb` payload has no gap-distance field, the plan takes the second branch explicitly.

**Placeholder scan.** No TBDs. Four steps deliberately instruct the implementer to read existing code before writing (the `extraSessions` fixture style, `usePowerProfile`'s shape, the stream endpoint's polyline source, the established bottom-sheet pattern) rather than guessing a signature this plan cannot verify — each names exactly what to look for and what to do with it.

**Type consistency.** `IntervalBlockOut` gains the same six fields in Python (T5) and TypeScript (T6). `ResolvedBlock.target_watts_low/high` widen to `number | null` in T6, and T6 step 4 flags `IntervalRibbon` as the consumer that must then render `—`. `route_polyline` is `list[list[float]] | None` in T8 and `[number, number][] | null` in T9. `RouteSketch`'s signature is declared once in T9 and used by three callers.

**Ordering constraints.** T6 requires T5. T9 requires T8. T10 should follow T1 (same region of `TodayTab.tsx`). T1, T2, T3, T4, T7 are otherwise independent.
