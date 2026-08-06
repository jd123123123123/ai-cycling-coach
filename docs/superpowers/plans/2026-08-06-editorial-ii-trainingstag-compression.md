# EDITORIAL II — Trainingstag Compression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Trainingstag screen from the mechanics roadbook so one training day fits in roughly 1.7 phone-heights instead of 3.7, without deleting a single affordance and without inventing a single number.

**Architecture:** The Training state moves out of `TodayView.tsx`'s five-way branch into its own page, `pages/TrainingDay.tsx`, built from eight small mechanic components. The header spine (Cover plate · date/streak/avatar · Day Rail) is extracted once and shared, so "one header spine" stays literally true rather than duplicated. Every other day-state keeps its current composition untouched — this plan changes the Training screen and the spine's *location*, nothing else.

**Tech Stack:** React 18 + TypeScript, Vite, vitest + @testing-library/react, inline styles against `editorial/tokens.css`, German copy via `editorial/i18n/copy.ts`.

## Provenance

The design decisions here are not new. They come from the mechanics roadbook rendered on 2026-08-06 against this branch's own `tokens.css`, which measured the shipped Trainingstag at **3,154px (3.7 screens)** and rebuilt it at **1,459px (1.7 screens, −54%)**. Fourteen mechanics were rendered and given verdicts:

| | Mechanic | Verdict | Used here |
|---|---|---|---|
| A | Headline as divider | Adopt | `RuleHead` |
| B | Two-weight headline | Adopt | `TwoWeightHead` |
| C | Label-over-value triplet | Adopt | `Triplet` |
| D | Verdict row | Adopt | `VerdictRow` |
| E | Band-split trace | Adopt | — (a ride file; Trained/Session Detail, not this screen) |
| F | Dot-matrix signature | **Reject on dark** | — |
| G | Pattern, not palette | Adopt | `BlockStrip` |
| H | Data-carrying rail | Adopt | existing `WeekRail` |
| I | Proportional mosaic | Adopt | — (not on this screen) |
| J | Segmented meter | Adopt | `SegmentedMeter` |
| K | Accent inside the sentence | Adopt | `TwoWeightHead`'s emphasis |
| L | Metric-native micro-viz | Adapt | — (not on this screen) |
| M | Edge-bleed ground | Adapt | `EdgeBleed` |
| N | Inverted measurement card | Adapt | — (the salvage for F; not on this screen) |

**The accent budget is the roadbook's own hardest finding.** Every mechanic's accent use is defensible alone; composed, they put seven green things on one screen and none of them reads. This screen's body spends the accent exactly **twice**: the headline's emphasis word, and the one number the screen is about. Task 11 enforces that as a test, not a note.

## Global Constraints

Everything in the parent plan (`2026-08-05-editorial-ii-design-system.md`, "Global Constraints") still applies in full. The ones this plan will trip over if forgotten:

- **Mobile only.** Designed and verified at **390×844**. Desktop is a sanity check, never a deliverable.
- **German is the language.** Every literal routes through `editorial/i18n/copy.ts` as a `{ de, en }` pair. No literal strings in components. Numbers format via `toLocaleString('de-DE')` at the call site (decimal comma), never a hand-rolled replace.
- **Missing-data rule.** A section is never hidden and never filled with a plausible number. `—` in the designed slot plus one quiet line naming the reason, once per screen at its first occurrence — not once per component.
- **The roadbook is a mock. Real data outranks it.** The roadbook's rebuilt frame shows `Start 17:30`, `Heute · 17:30`, `68% verbraucht` and `noch 121 Tage bis zum Marathon`. Three of those have real sources (Task 2). **`17:30` does not** — `PrescribedWorkout` carries no scheduled time-of-day anywhere, a gap `noStartTimeToday` already names in `TodayView.tsx`. It renders no time, not an invented one.
- **Only two files under `frontend/src/` outside `editorial/` may change:** `App.tsx` and, if `npm run lint:i18n` demands it, `frontend/scripts/i18n-allowlist.json`. This plan expects to change **neither**. If any other file outside `editorial/` needs to change, stop and ask.
- **No modifications to existing frontend hooks.** `editorial/` consumes them read-only. `useCurrentWeek` is called, never edited.
- **No backend changes at all in this plan.** The additive-exposure ruling is not needed here — every field this plan reads is already on an existing response.
- **Tokens are scoped.** New custom properties are declared under `.editorial-root`, never `:root`. No raw hex anywhere outside `tokens.css` — `isolation.test.ts` fails the build on one.
- **Test conventions.** No `@testing-library/jest-dom`, no vitest `globals`. Every component test file does `import { cleanup } from '@testing-library/react'`, `import { afterEach } from 'vitest'`, then `afterEach(cleanup)` at top level. Use `expect(el).not.toBeNull()`, never `toBeInTheDocument`. Import only what you use — `noUnusedLocals: true` makes an unused import fail the build. `@typescript-eslint/no-unused-vars` has **no** `argsIgnorePattern`: a leading underscore does not exempt an unused parameter; drop it.
- **Components never import hooks.** `isolation.test.ts` enforces that for `editorial/components/**`. Data enters via the view-model. `pages/` may call hooks.
- **Gates, all five, from `frontend/`:** `npx tsc -b && npm run test && npm run build && npm run lint && npm run lint:i18n`. `npx tsc --noEmit` at the repo root is a no-op — never use it.
- **No Playwright, no browser sessions.** Visual check is **one** rendered frame at 390×844 via the existing dev server, at the end (Task 13).
- **Commit after every task.** Prefix `feat(editorial):` / `test(editorial):` / `refactor(editorial):`. Trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Deliberate departures from the shipped screen

Recorded here because a reviewer will otherwise read them as scope creep. Each is a roadbook verdict, not a new opinion:

1. **The numbered section heads (`01`/`02`/`03`) become rules.** `SecHead` charges ~56px of chrome per section for an index nobody navigates by. Mechanic A. `SecHead` itself is untouched and still used by every other state.
2. **The Route Plate is cut from this screen.** A full-bleed photographic plate costs ~430px and carries a route the sticky CTA already leads to. The Cover plate stays — the screen keeps its photography where it does the most work.
3. **The Quote Plate becomes a text pull-quote on this screen.** Same editorial device, none of the plate height. `QuotePlate` is untouched for every other state.
4. **`InsightStrip`, the four `StatTile`s and the `PMCChart` come off this screen.** The triplet says Fitness/Form/Belastung once, in 62px; the strip and the tiles restated two of those three, and the PMC chart was measured too small to read at 390px. Mechanic C + J.
5. **The hero leads with the verdict, not the session name.** The session name lives exactly once, in the verdict row (mechanic D), where the sticky CTA no longer repeats it verbatim.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `editorial/components/HeaderSpine.tsx` | The one header spine: Cover plate, date · streak · avatar, Day Rail. Extracted from `TodayView`, shared by it and `TrainingDay`. |
| `editorial/components/RuleHead.tsx` | Mechanic A — a section name over a hairline. |
| `editorial/components/TwoWeightHead.tsx` | Mechanics B + K — one size, two weights, the emphasis word in accent. |
| `editorial/components/Triplet.tsx` | Mechanic C — three facts in one band between hairlines. |
| `editorial/components/VerdictRow.tsx` | Mechanic D — title, qualifier, the one accent number. |
| `editorial/components/BlockStrip.tsx` | Mechanic G — planned hatched, done solid, one hue two materials. |
| `editorial/components/SegmentedMeter.tsx` | Mechanic J — a budget spent in discrete ticks. |
| `editorial/components/EdgeBleed.tsx` | Mechanic M — the state accent bleeding in from top and bottom. |
| `editorial/data/verdictSplit.ts` | Splits a coach verdict into lead + emphasis, or returns no emphasis. |
| `editorial/pages/TrainingDay.tsx` | The composed Trainingstag screen. |
| `editorial/__tests__/trainingCompression.test.tsx` | The compression contract: what is on this screen, what is off it, and the accent budget. |
| `editorial/__tests__/mechanics.test.tsx` | Unit tests for the eight mechanic components. |

**Modified**

| File | Change |
|---|---|
| `editorial/pages/TodayView.tsx` | Spine markup replaced by `<HeaderSpine>`; `state === 'training'` delegates to `TrainingDay`; the now-dead Training-only branches removed. |
| `editorial/data/useTodayModel.ts` | Two additive fields (`weekLoad`, `phaseContext`) + one optional input (`weekPlan`). |
| `editorial/i18n/copy.ts` | New keys, `{ de, en }` pairs. |
| `editorial/tokens.css` | Two new tokens for the hatch and the edge bleed. |
| `editorial/__tests__/restTraining.test.tsx` | Training-composition assertions updated to the new screen. |

---

## Task 1: Extract the header spine

The spine is currently inline in `TodayView.tsx` (the `<Cover>` block: meta row, `ProfileAvatar`, `DayRail`). `TrainingDay` needs the identical spine, and "one header spine" must be one implementation, not two that drift.

**Files:**
- Create: `frontend/src/editorial/components/HeaderSpine.tsx`
- Modify: `frontend/src/editorial/pages/TodayView.tsx`

**Interfaces:**
- Produces: `HeaderSpine`, a component taking exactly the props the current inline markup reads.

```ts
export interface HeaderSpineProps {
  state: DayState
  dateLabel: Value<string>
  streakDays: Value<number>
  profile?: ProfileHeaderData
  control?: DayStateControl
  switchable: boolean
}
```

- Consumes: `Cover`, `DayRail`, `ProfileAvatar`, `DayMark` — all unchanged.

- [ ] **Step 1: Read the current spine markup**

Open `frontend/src/editorial/pages/TodayView.tsx` and read from the opening `<Cover` tag through the closing `</Cover>` (currently around lines 900–1104). Transcribe it **verbatim** — every padding, gap, absolute offset and `DAY_MARK_TOP` lookup. This task is a pure move: if a single number changes, the visual-parity check in Step 4 will catch it, and the correct response is to restore the original number, not to keep the "improvement".

- [ ] **Step 2: Run the existing tests to record the green baseline**

Run: `cd frontend && npx vitest run src/editorial`
Expected: PASS. Record the test count — Step 4 must match it exactly.

- [ ] **Step 3: Create `HeaderSpine.tsx` and call it from `TodayView`**

Move the markup verbatim into the new component; replace it in `TodayView` with:

```tsx
<HeaderSpine
  state={state}
  dateLabel={model.dateLabel}
  streakDays={model.streakDays}
  profile={profile}
  control={control}
  switchable={SWITCHABLE.has(state)}
/>
```

The component's doc comment must say what it is and why it exists:

```tsx
/**
 * The one header spine. Every Today screen opens identically — Cover plate,
 * date · streak · avatar, Day Rail — at the same heights, insets and type,
 * with no per-screen variants (design pass, 2026-08-06, rule 6).
 *
 * Extracted from TodayView verbatim when the Trainingstag rebuild gave the
 * spine a second caller. Nothing here is new: every value is the one that
 * was inline, and the parity of the move is what Task 1's own step 4 checks.
 */
```

- [ ] **Step 4: Run the tests again and diff the render**

Run: `cd frontend && npx vitest run src/editorial`
Expected: PASS, with the **same test count as Step 2** and no test edited. A pure move that needs a test changed is not a pure move — revert and find what moved.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editorial/components/HeaderSpine.tsx frontend/src/editorial/pages/TodayView.tsx
git commit -m "refactor(editorial): one header spine, one implementation"
```

---

## Task 2: The two real numbers the rebuild needs

The rebuilt screen shows a week meter (`68% verbraucht`) and a phase context line (`Phase Grundlage 1 — noch 121 Tage bis zum Marathon`). Both have real sources on an endpoint the app already calls; neither is currently on `TodayModel`.

- **Denominator:** `WeekResponse.planned_tss_total` (`api/weeks.ts:134`) — documented in that file as *"THE weekly planned-TSS number to render as the week's target"*. Explicitly **not** `meso_block.weekly_tss_target`, which the same comment marks advisory-only.
- **Numerator:** the sum of the present values in `TodayModel.week` — real per-day `PMCEntry.tss`, already on the model.
- **Phase line:** `WeekResponse.meso_block.phase`, `.days_to_event`, `.target_event_type` (`api/weeks.ts:46-52`).

**Files:**
- Modify: `frontend/src/editorial/data/useTodayModel.ts`
- Test: `frontend/src/editorial/__tests__/useTodayModel.test.ts`

**Interfaces:**
- Produces, on `TodayModel`:

```ts
/** The week's load budget: TSS actually logged Mon–Sun so far over the
 *  week plan's own planned total. `spent` sums the present days of `week`
 *  above (real PMCEntry.tss); `planned` is WeekResponse.planned_tss_total —
 *  the field api/weeks.ts marks as THE display target, never
 *  meso_block.weekly_tss_target (advisory-only, the generator's budget).
 *  Missing whenever there is no week plan or it carries no planned total —
 *  a meter with an invented denominator is exactly the fabricated number
 *  the missing-data rule exists to prevent. */
weekLoad: Value<{ spent: number; planned: number }>
/** The block context under the coach's paragraph — phase name, and the
 *  countdown to the target event when there is one. Sourced from
 *  WeekResponse.meso_block. `daysToEvent`/`eventType` are independently
 *  null (a fitness-builder athlete has a phase but no event), so the copy
 *  key that renders this has two arms. */
phaseContext: Value<{ phase: string; daysToEvent: number | null; eventType: string | null }>
```

- Produces, on `TodayModelInputs`:

```ts
/** The current week plan, for `weekLoad`/`phaseContext`. Optional: omitted
 *  callers (every existing unit test) get both fields missing, same as an
 *  athlete with no plan. Read-only — `useCurrentWeek` is consumed, never
 *  edited (the tree's one-way dependency rule). */
weekPlan?: WeekResponse | null
```

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/editorial/__tests__/useTodayModel.test.ts`:

```ts
describe('weekLoad and phaseContext', () => {
  const weekPlan = {
    planned_tss_total: 420,
    meso_block: { phase: 'Grundlage 1', days_to_event: 121, target_event_type: 'Marathon' },
  } as unknown as WeekResponse

  it('sums the present days against the plan total', () => {
    const model = buildTodayModel({ ...baseInputs, weekPlan })
    expect(isPresent(model.weekLoad)).toBe(true)
    if (!isPresent(model.weekLoad)) return
    // baseInputs' PMC entries carry the only real per-day loads; a day with
    // no entry contributes nothing rather than a zero that flatters the week.
    expect(model.weekLoad.value.planned).toBe(420)
    expect(model.weekLoad.value.spent).toBe(
      model.week.reduce((sum, d) => sum + (isPresent(d.tss) ? d.tss.value : 0), 0),
    )
  })

  it('withholds the meter rather than inventing a denominator', () => {
    const model = buildTodayModel({
      ...baseInputs,
      weekPlan: { ...weekPlan, planned_tss_total: null } as unknown as WeekResponse,
    })
    expect(isPresent(model.weekLoad)).toBe(false)
  })

  it('is missing entirely when there is no week plan', () => {
    const model = buildTodayModel({ ...baseInputs, weekPlan: null })
    expect(isPresent(model.weekLoad)).toBe(false)
    expect(isPresent(model.phaseContext)).toBe(false)
  })

  it('carries the phase even when the athlete has no target event', () => {
    const model = buildTodayModel({
      ...baseInputs,
      weekPlan: {
        ...weekPlan,
        meso_block: { phase: 'Grundlage 1', days_to_event: null, target_event_type: null },
      } as unknown as WeekResponse,
    })
    expect(isPresent(model.phaseContext)).toBe(true)
    if (!isPresent(model.phaseContext)) return
    expect(model.phaseContext.value.phase).toBe('Grundlage 1')
    expect(model.phaseContext.value.daysToEvent).toBeNull()
  })
})
```

Add `import type { WeekResponse } from '../../api/weeks'` to the file's imports if it is not already there.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/useTodayModel.test.ts`
Expected: FAIL — `weekLoad` / `phaseContext` do not exist on `TodayModel`.

- [ ] **Step 3: Implement the two fields**

In `buildTodayModel`, after `week` is built:

```ts
const spentThisWeek = week.reduce((sum, d) => sum + (isPresent(d.tss) ? d.tss.value : 0), 0)
const plannedThisWeek = weekPlan?.planned_tss_total ?? null
const weekLoad: Value<{ spent: number; planned: number }> = plannedThisWeek == null
  ? missing(t('weekLoadMissing'))
  : present({ spent: spentThisWeek, planned: plannedThisWeek })

const phaseContext: Value<{ phase: string; daysToEvent: number | null; eventType: string | null }> =
  weekPlan?.meso_block == null
    ? missing(t('phaseContextMissing'))
    : present({
      phase: weekPlan.meso_block.phase,
      daysToEvent: weekPlan.meso_block.days_to_event,
      eventType: weekPlan.meso_block.target_event_type,
    })
```

Add both to the returned object, and add `weekPlan` to `TodayModelInputs` with the doc comment from the Interfaces block above.

In the `useTodayModel` wrapper hook, alongside the other queries:

```ts
const weekPlanQuery = useCurrentWeek()
```

and in `inputs`: `weekPlan: weekPlanQuery.data ?? null,`. Import `useCurrentWeek` from `'../../hooks/useCurrentWeek'`.

- [ ] **Step 4: Add the copy**

In `frontend/src/editorial/i18n/copy.ts`:

```ts
  weekLoadMissing: { de: 'Für diese Woche ist noch keine Belastung geplant.', en: 'No planned load for this week yet.' },
  phaseContextMissing: { de: 'Kein Wochenplan hinterlegt.', en: 'No week plan on file.' },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/useTodayModel.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/editorial/data/useTodayModel.ts frontend/src/editorial/i18n/copy.ts frontend/src/editorial/__tests__/useTodayModel.test.ts
git commit -m "feat(editorial): the week's real budget and the block it sits in"
```

---

## Task 3: Mechanics A, C and D — the three that carry text

Three small presentational components. They are grouped into one task because they share a test file, a hairline vocabulary and a single review question ("does this read at 390px?") — a reviewer would accept or reject them together.

**Files:**
- Create: `frontend/src/editorial/components/RuleHead.tsx`
- Create: `frontend/src/editorial/components/Triplet.tsx`
- Create: `frontend/src/editorial/components/VerdictRow.tsx`
- Test: `frontend/src/editorial/__tests__/mechanics.test.tsx`

**Interfaces:**
- Produces:

```ts
function RuleHead(props: { title: string }): JSX.Element
function Triplet(props: { cells: { label: string; value: Value<string>; unit?: string }[] }): JSX.Element
function VerdictRow(props: {
  title: Value<string>
  qualifier: Value<string>
  value: Value<number | string>
  unit: string
  accent?: boolean
}): JSX.Element
```

- `accent` defaults to `false`. `TrainingDay` passes `accent` on exactly one `VerdictRow` — the screen's one number. This is how the accent budget is spent deliberately rather than by a component deciding for itself.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/mechanics.test.tsx
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import RuleHead from '../components/RuleHead'
import Triplet from '../components/Triplet'
import VerdictRow from '../components/VerdictRow'
import { missing, present } from '../data/value'

afterEach(cleanup)

describe('RuleHead (mechanic A)', () => {
  it('renders the name over a rule, with no chrome around it', () => {
    const { container } = render(<RuleHead title="DIE EINHEIT" />)
    expect(screen.getByText('DIE EINHEIT')).toBeTruthy()
    expect(container.querySelector('[data-rule-head-line]')).not.toBeNull()
    expect(container.querySelector('button')).toBeNull()
  })
})

describe('Triplet (mechanic C)', () => {
  const cells = [
    { label: 'FITNESS', value: present('30'), unit: '−2' },
    { label: 'FORM', value: present('+13'), unit: 'TSB' },
    { label: 'BELASTUNG', value: missing('Nichts geplant.'), unit: 'TSS' },
  ]

  it('renders exactly three cells between two rules', () => {
    const { container } = render(<Triplet cells={cells} />)
    expect(container.querySelectorAll('[data-triplet-cell]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-triplet-rule]')).toHaveLength(2)
  })

  it('dashes a missing cell in place and never prints its reason', () => {
    render(<Triplet cells={cells} />)
    expect(screen.getByText('—')).toBeTruthy()
    // The screen owns reason dedupe, not the band — a reason printed here
    // would be the third copy of a sentence the hero already carries.
    expect(screen.queryByText('Nichts geplant.')).toBeNull()
  })
})

describe('VerdictRow (mechanic D)', () => {
  it('carries title, qualifier and number in one row', () => {
    render(<VerdictRow title={present('5 × 3 an der Schwelle')} qualifier={present('0:52 · IF 0,74 · 11 Teile')}
      value={present(277)} unit="WATT" />)
    expect(screen.getByText('5 × 3 an der Schwelle')).toBeTruthy()
    expect(screen.getByText('0:52 · IF 0,74 · 11 Teile')).toBeTruthy()
    expect(screen.getByText('277')).toBeTruthy()
  })

  it('spends the accent only when asked to', () => {
    const plain = render(<VerdictRow title={present('T')} qualifier={present('Q')} value={present(1)} unit="W" />)
    expect(plain.container.querySelectorAll('[data-accent]')).toHaveLength(0)
    cleanup()
    const accented = render(<VerdictRow title={present('T')} qualifier={present('Q')} value={present(1)} unit="W" accent />)
    expect(accented.container.querySelectorAll('[data-accent]')).toHaveLength(1)
  })

  it('keeps the row when the number is missing rather than collapsing it', () => {
    const { container } = render(<VerdictRow title={present('T')} qualifier={missing('Kein Ziel.')}
      value={missing('Nichts geplant.')} unit="WATT" />)
    expect(container.querySelector('[data-verdict-row]')).not.toBeNull()
    expect(screen.getByText('—')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/mechanics.test.tsx`
Expected: FAIL — the three modules do not exist.

- [ ] **Step 3: Write the three components**

```tsx
// frontend/src/editorial/components/RuleHead.tsx
/**
 * Mechanic A — headline as divider (roadbook, 2026-08-06).
 *
 * The section name in uppercase 800 over a hairline, doing the structural
 * job SecHead's numbered header bar was charging ~56px for. No index, no
 * chip, no "see all". SecHead itself is untouched and still heads every
 * numbered section on every other Today state; this is the Trainingstag
 * screen's own lighter head.
 */
export default function RuleHead({ title }: { title: string }) {
  return (
    <div data-rule-head="" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      <span
        style={{
          fontFamily: 'var(--e-body)',
          fontSize: 'var(--t-label)',
          fontWeight: 800,
          letterSpacing: 1.6,
          lineHeight: 1.2,
          color: 'var(--e-mid)',
        }}
      >
        {title}
      </span>
      <div data-rule-head-line="" style={{ width: '100%', height: 1, background: 'var(--e-hairline)' }} />
    </div>
  )
}
```

```tsx
// frontend/src/editorial/components/Triplet.tsx
import { isPresent, type Value } from '../data/value'

/**
 * Mechanic C — label-over-value triplet (roadbook, 2026-08-06).
 *
 * Three facts in one 62px band between hairlines, aligned left / centre /
 * right. Replaces three stacked StatTiles and the scroll they cost, and is
 * what lets the Trainingstag screen state Fitness, Form and Belastung once
 * instead of spreading them across an Insight Strip, a tile row and a
 * coach paragraph.
 *
 * A missing cell renders its dash in place and stays silent about why —
 * reason dedupe is a screen-wide job (the design pass measured the same
 * sentence printed three times on one screen), so the caller prints it once
 * at its first occurrence.
 */
export default function Triplet({ cells }: { cells: { label: string; value: Value<string>; unit?: string }[] }) {
  return (
    <div data-triplet="" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <div data-triplet-rule="" style={{ width: '100%', height: 1, background: 'var(--e-hairline)' }} />
      <div style={{ display: 'flex', width: '100%', padding: '14px 0' }}>
        {cells.map((cell, i) => (
          <div
            key={cell.label}
            data-triplet-cell=""
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              alignItems: i === 0 ? 'flex-start' : i === cells.length - 1 ? 'flex-end' : 'center',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800,
                letterSpacing: 1.4, color: 'var(--e-lo)',
              }}
            >
              {cell.label}
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span
                style={{
                  fontFamily: 'var(--e-display)', fontSize: 'var(--t-lead)', fontWeight: 800,
                  letterSpacing: -0.5, lineHeight: 1,
                  color: isPresent(cell.value) ? 'var(--e-ink)' : 'var(--e-quiet)',
                }}
              >
                {isPresent(cell.value) ? cell.value.value : '—'}
              </span>
              {cell.unit && (
                <span
                  style={{
                    fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 700,
                    letterSpacing: 0.8, color: 'var(--e-mid)',
                  }}
                >
                  {cell.unit}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div data-triplet-rule="" style={{ width: '100%', height: 1, background: 'var(--e-hairline)' }} />
    </div>
  )
}
```

```tsx
// frontend/src/editorial/components/VerdictRow.tsx
import { isPresent, type Value } from '../data/value'

/**
 * Mechanic D — verdict row (roadbook, 2026-08-06).
 *
 * Title, then qualifier, then the number: three levels of hierarchy in one
 * row. On the Trainingstag screen this is where the session's name lives —
 * once, instead of in the hero, the section head and the sticky CTA.
 *
 * `accent` is the caller's decision, never the component's. The composed
 * screen has an accent budget of two (roadbook's own finding: seven
 * defensible accents on one screen means none of them reads), and a
 * component that tints itself would spend that budget behind the screen's
 * back. Exactly one VerdictRow on this screen passes it.
 */
export default function VerdictRow({ title, qualifier, value, unit, accent = false }: {
  title: Value<string>
  qualifier: Value<string>
  value: Value<number | string>
  unit: string
  accent?: boolean
}) {
  return (
    <div
      data-verdict-row=""
      style={{ display: 'flex', width: '100%', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span
          style={{
            fontFamily: 'var(--e-display)', fontSize: 'var(--t-lead)', fontWeight: 800,
            letterSpacing: -0.5, lineHeight: 1.1,
            color: isPresent(title) ? 'var(--e-ink)' : 'var(--e-quiet)',
          }}
        >
          {isPresent(title) ? title.value : '—'}
        </span>
        <span
          style={{
            fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 500, color: 'var(--e-mid)',
          }}
        >
          {isPresent(qualifier) ? qualifier.value : '—'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
        <span
          {...(accent && isPresent(value) ? { 'data-accent': '' } : {})}
          style={{
            fontFamily: 'var(--e-display)', fontSize: 'var(--t-title)', fontWeight: 800,
            letterSpacing: -1, lineHeight: 1,
            color: !isPresent(value) ? 'var(--e-quiet)' : accent ? 'var(--st-active)' : 'var(--e-ink)',
          }}
        >
          {isPresent(value) ? value.value : '—'}
        </span>
        <span
          style={{
            fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 700,
            letterSpacing: 0.8, color: 'var(--e-mid)',
          }}
        >
          {unit}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/mechanics.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editorial/components/RuleHead.tsx frontend/src/editorial/components/Triplet.tsx frontend/src/editorial/components/VerdictRow.tsx frontend/src/editorial/__tests__/mechanics.test.tsx
git commit -m "feat(editorial): mechanics A, C and D -- the rule, the band, the row"
```

---

## Task 4: Mechanics B and K — the two-weight headline and its one accent word

**Files:**
- Create: `frontend/src/editorial/components/TwoWeightHead.tsx`
- Create: `frontend/src/editorial/data/verdictSplit.ts`
- Modify: `frontend/src/editorial/__tests__/mechanics.test.tsx`

**Interfaces:**
- Produces:

```ts
/** Splits a coach verdict into a quiet lead and an emphasised tail. Returns
 *  `emphasis: null` when the sentence carries no separator — the whole
 *  verdict then reads as the lead, at one weight. Never invents a break:
 *  splitting mid-clause on a word count would put the accent on an
 *  arbitrary word, which is worse than no accent at all. */
function splitVerdict(headline: string): { lead: string; emphasis: string | null }

function TwoWeightHead(props: { lead: string; emphasis: string | null }): JSX.Element
```

The separator set is `' — '`, `' – '`, `': '` — em dash, en dash, colon. All three appear in real `brief.verdict` output; a bare hyphen is excluded because it shows up inside compound German words.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/editorial/__tests__/mechanics.test.tsx` (and add the two imports at the top of the file):

```tsx
describe('splitVerdict', () => {
  it('splits on an em dash', () => {
    expect(splitVerdict('VO2 heute — du bist frisch')).toEqual({ lead: 'VO2 heute', emphasis: 'du bist frisch' })
  })

  it('splits on a colon', () => {
    expect(splitVerdict('Heute zählt: die letzten drei Minuten'))
      .toEqual({ lead: 'Heute zählt', emphasis: 'die letzten drei Minuten' })
  })

  it('leaves a sentence with no separator whole rather than guessing a break', () => {
    expect(splitVerdict('Ein ruhiger Tag im Grundlagenbereich'))
      .toEqual({ lead: 'Ein ruhiger Tag im Grundlagenbereich', emphasis: null })
  })

  it('splits only once, so a second dash stays inside the emphasis', () => {
    expect(splitVerdict('A — B — C')).toEqual({ lead: 'A', emphasis: 'B — C' })
  })
})

describe('TwoWeightHead (mechanics B + K)', () => {
  it('renders both weights and accents only the emphasis', () => {
    const { container } = render(<TwoWeightHead lead="VO2 heute" emphasis="du bist frisch" />)
    expect(screen.getByText('VO2 heute')).toBeTruthy()
    expect(screen.getByText('du bist frisch')).toBeTruthy()
    expect(container.querySelectorAll('[data-accent]')).toHaveLength(1)
  })

  it('spends no accent at all when there is no emphasis', () => {
    const { container } = render(<TwoWeightHead lead="Ein ruhiger Tag" emphasis={null} />)
    expect(container.querySelectorAll('[data-accent]')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/mechanics.test.tsx`
Expected: FAIL — `splitVerdict` and `TwoWeightHead` do not exist.

- [ ] **Step 3: Write both modules**

```ts
// frontend/src/editorial/data/verdictSplit.ts
/**
 * Mechanic K needs one word of the headline in the accent, mid-sentence.
 * The honest place to break a coach verdict is where the coach already
 * broke it — this splits on the separators `brief.verdict` really uses and
 * refuses to invent one anywhere else. A verdict with no separator renders
 * whole, at one weight, with no accent spent: the roadbook's accent budget
 * is two, and an accent landing on an arbitrary word is worth less than the
 * budget it costs.
 */
const SEPARATORS = [' — ', ' – ', ': ']

export function splitVerdict(headline: string): { lead: string; emphasis: string | null } {
  for (const sep of SEPARATORS) {
    const at = headline.indexOf(sep)
    if (at > 0) {
      return { lead: headline.slice(0, at), emphasis: headline.slice(at + sep.length) }
    }
  }
  return { lead: headline, emphasis: null }
}
```

```tsx
// frontend/src/editorial/components/TwoWeightHead.tsx
/**
 * Mechanics B + K — two-weight headline with one accent word (roadbook,
 * 2026-08-06).
 *
 * One size, two weights, two values: hierarchy without spending a type
 * step, which matters on a branch that just fought its way down to seven.
 * The emphasis carries the screen's first of two accents; the second is
 * the one number, on VerdictRow.
 */
export default function TwoWeightHead({ lead, emphasis }: { lead: string; emphasis: string | null }) {
  return (
    <p
      data-two-weight-head=""
      style={{
        fontFamily: 'var(--e-display)',
        fontSize: 'var(--t-hero)',
        lineHeight: 1.05,
        letterSpacing: -2,
        margin: 0,
        width: '100%',
        // The Day Mark is absolutely positioned at the Cover's top right;
        // a headline running the full column slides straight under it.
        paddingRight: 46,
      }}
    >
      <span style={{ fontWeight: 500, color: 'var(--e-mid)' }}>{lead}</span>
      {emphasis && (
        <>
          {' '}
          <span data-accent="" style={{ fontWeight: 800, color: 'var(--st-active)' }}>{emphasis}</span>
        </>
      )}
    </p>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/mechanics.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editorial/components/TwoWeightHead.tsx frontend/src/editorial/data/verdictSplit.ts frontend/src/editorial/__tests__/mechanics.test.tsx
git commit -m "feat(editorial): the two-weight headline, and the one word it accents"
```

---

## Task 5: Mechanics G, J and M — the three that draw

**Files:**
- Create: `frontend/src/editorial/components/BlockStrip.tsx`
- Create: `frontend/src/editorial/components/SegmentedMeter.tsx`
- Create: `frontend/src/editorial/components/EdgeBleed.tsx`
- Modify: `frontend/src/editorial/tokens.css`
- Modify: `frontend/src/editorial/__tests__/mechanics.test.tsx`

**Interfaces:**
- Consumes: `BlockLike` — the block shape `TodayView.sessionBlocksOf` already produces (`{ label: string; minutes: number; watts: number | null }`). Import the type from where it is currently declared rather than redeclaring it.
- Produces:

```ts
function BlockStrip(props: { blocks: BlockLike[]; doneCount?: number }): JSX.Element
function SegmentedMeter(props: { label: string; spent: number; planned: number; segments?: number }): JSX.Element
function EdgeBleed(props: { children: ReactNode }): JSX.Element
```

`doneCount` defaults to `0`: on a Trainingstag the session has not happened yet, so every block is planned and every block is hatched. The prop exists because the same strip is the natural home for a mid-session or Trained rendering later; it is not exercised by this screen.

**`BlockLike` moves to `editorial/data/blocks.ts`** (controller ruling, pre-flight scan). Importing it from `pages/TodayView` would point a component at a page — backwards, and the kind of dependency that survives until something needs untangling. Move the existing interface there, re-export or re-point `TodayView`'s own use of it, and have `BlockStrip` import from `data/`.

**Motion binds both new charts** (owner's ruling, 2026-08-06, resolving the pre-flight conflict with the parent plan's motion contract). `BlockStrip` and `SegmentedMeter` sit on the same screen as `WeekRail`, which animates; flat neighbours would read as broken. Both follow the contract already established in `motion/useReveal.ts`:

- **On mount into the viewport** (`IntersectionObserver`, first entry only — not at mount, or a chart far down the page animates invisibly): `BlockStrip`'s blocks grow from their baseline, siblings staggered by `staggerDelay` (~30–40ms) so the row resolves as a wave; `SegmentedMeter`'s ticks fill left to right on the same stagger.
- **Duration** 400–700ms, `MOTION_EASE` / `MOTION_DURATION_MS` from `useReveal` — never a hand-rolled cubic-bezier.
- **`prefers-reduced-motion: reduce` disables all of it**, final state rendered immediately. Not optional.
- **Never animate a missing state.** An empty `BlockStrip` renders nothing (it already returns `null`); a withheld `SegmentedMeter` is not rendered by the caller at all. No ghost tick ever grows.

Read `WeekRail.tsx`'s existing `useReveal` usage and follow it rather than inventing a second motion idiom — it is the closest neighbour in both role and placement.

- [ ] **Step 1: Add the two tokens**

In `frontend/src/editorial/tokens.css`, inside `.editorial-root`:

```css
  /* Mechanic G — "pattern, not palette" (roadbook, 2026-08-06). Planned work
   * is hatched, ridden work is solid: one hue, two materials. The hatch is
   * built from --e-bar-ghost so a planned block never claims the accent (and
   * therefore never claims an achieved result), matching the rule Bars.tsx
   * already follows for its own ghost row. */
  --e-hatch: repeating-linear-gradient(
    45deg,
    var(--e-bar-ghost) 0px,
    var(--e-bar-ghost) 2px,
    transparent 2px,
    transparent 5px
  );
  /* Mechanic M — edge-bleed ground (roadbook, 2026-08-06). The state accent
   * bleeds in from the top and bottom edges instead of tinting the ground
   * flat. The --g-* grounds are already this idea at roughly 3%; this is the
   * same dial at 26%, so it is a value this system owns, not a new concept. */
  --st-a26: color-mix(in srgb, var(--st-active) 26%, transparent);
```

- [ ] **Step 2: Write the failing test**

Append to `frontend/src/editorial/__tests__/mechanics.test.tsx`:

```tsx
describe('BlockStrip (mechanic G)', () => {
  const blocks = [
    { label: 'Einfahren', minutes: 20, watts: 180 },
    { label: '5 × 3 min @ 110%', minutes: 27, watts: 305 },
    { label: 'Aus', minutes: 10, watts: 120 },
  ]

  it('gives each block width in proportion to its minutes', () => {
    const { container } = render(<BlockStrip blocks={blocks} />)
    const cells = Array.from(container.querySelectorAll('[data-block]')) as HTMLElement[]
    expect(cells).toHaveLength(3)
    expect(cells.map((c) => c.style.flexGrow)).toEqual(['20', '27', '10'])
  })

  it('hatches planned work and fills done work solid', () => {
    const { container } = render(<BlockStrip blocks={blocks} doneCount={1} />)
    const cells = Array.from(container.querySelectorAll('[data-block]')) as HTMLElement[]
    expect(cells[0].getAttribute('data-done')).toBe('')
    expect(cells[1].getAttribute('data-done')).toBeNull()
  })

  it('renders nothing at all rather than an empty rail when there are no blocks', () => {
    const { container } = render(<BlockStrip blocks={[]} />)
    expect(container.querySelector('[data-block-strip]')).toBeNull()
  })
})

describe('motion on the two new charts', () => {
  // The contract WeekRail already follows (motion/useReveal.ts). These
  // assertions mirror the existing chartMotion.test.tsx ones — read that
  // file and match its technique rather than inventing a second one.
  it('BlockStrip grows its blocks on first viewport entry, staggered', () => {
    const { container } = render(<BlockStrip blocks={blocks} />)
    const cells = Array.from(container.querySelectorAll('[data-block]')) as HTMLElement[]
    expect(cells.every((c) => c.style.transition.length > 0)).toBe(true)
    const delays = cells.map((c) => c.style.transitionDelay)
    expect(new Set(delays).size).toBeGreaterThan(1)
  })

  it('SegmentedMeter fills its ticks with a transition', () => {
    const { container } = render(<SegmentedMeter label="WOCHE" spent={210} planned={420} />)
    const ticks = Array.from(container.querySelectorAll('[data-tick]')) as HTMLElement[]
    expect(ticks.every((tick) => tick.style.transition.length > 0)).toBe(true)
  })
})

describe('SegmentedMeter (mechanic J)', () => {
  it('fills ticks in proportion to the budget spent', () => {
    const { container } = render(<SegmentedMeter label="WOCHE" spent={210} planned={420} segments={20} />)
    expect(container.querySelectorAll('[data-tick]')).toHaveLength(20)
    expect(container.querySelectorAll('[data-tick][data-spent]')).toHaveLength(10)
  })

  it('clamps an over-spent week to a full meter instead of overflowing it', () => {
    const { container } = render(<SegmentedMeter label="WOCHE" spent={900} planned={420} segments={20} />)
    expect(container.querySelectorAll('[data-tick][data-spent]')).toHaveLength(20)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/mechanics.test.tsx`
Expected: FAIL — the three modules do not exist.

- [ ] **Step 4: Write the three components**

```tsx
// frontend/src/editorial/components/BlockStrip.tsx
import type { BlockLike } from '../pages/TodayView'

/**
 * Mechanic G — pattern, not palette (roadbook, 2026-08-06).
 *
 * The session's shape as one proportional strip: planned work hatched with
 * a dashed cap, ridden work solid. One hue, two materials. It replaces the
 * two separate Bars rows the shipped screen drew — one in the hero body and
 * one in section 02, the same structure twice, 900px apart.
 *
 * On a Trainingstag nothing is ridden yet, so `doneCount` is 0 and the whole
 * strip is hatched. That is the honest reading of a session that has not
 * happened: no bar on this screen has ever claimed an achieved result.
 */
export default function BlockStrip({ blocks, doneCount = 0 }: { blocks: BlockLike[]; doneCount?: number }) {
  if (blocks.length === 0) return null
  return (
    <div data-block-strip="" style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', width: '100%', gap: 3, height: 26 }}>
        {blocks.map((block, i) => {
          const done = i < doneCount
          return (
            <div
              key={`${block.label}-${i}`}
              data-block=""
              {...(done ? { 'data-done': '' } : {})}
              style={{
                flexGrow: block.minutes || 1,
                flexBasis: 0,
                height: '100%',
                borderRadius: 3,
                background: done ? 'var(--e-bar-dim)' : 'var(--e-hatch)',
                borderRight: done ? 'none' : '1px dashed var(--d-2)',
              }}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', width: '100%', gap: 3 }}>
        {blocks.map((block, i) => (
          <span
            key={`${block.label}-label-${i}`}
            style={{
              flexGrow: block.minutes || 1,
              flexBasis: 0,
              minWidth: 0,
              fontFamily: 'var(--e-body)',
              fontSize: 'var(--t-micro)',
              fontWeight: 700,
              letterSpacing: 0.8,
              color: 'var(--e-lo)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {block.label}
          </span>
        ))}
      </div>
    </div>
  )
}
```

```tsx
// frontend/src/editorial/components/SegmentedMeter.tsx
/**
 * Mechanic J — segmented meter (roadbook, 2026-08-06).
 *
 * Discrete ticks rather than a continuous fill: it reads as a budget being
 * spent, which is the right grammar for a week's planned load. It replaces
 * the PMC chart the shipped screen drew at a size the design pass measured
 * as unreadable at 390px.
 *
 * The last two ticks carry the warning hue, so a week already at its budget
 * says so before a number does. An over-spent week clamps to full rather
 * than overflowing — the meter's job is "how much of the plan is gone", and
 * past 100% the answer is "all of it".
 *
 * This component never decides whether it should render: it takes two real
 * numbers. The caller withholds it entirely when the plan carries no total,
 * because a meter with an invented denominator is exactly the fabricated
 * number the missing-data rule exists to prevent.
 */
export default function SegmentedMeter({ label, spent, planned, segments = 20 }: {
  label: string
  spent: number
  planned: number
  segments?: number
}) {
  const ratio = planned > 0 ? Math.min(spent / planned, 1) : 0
  const filled = Math.round(ratio * segments)
  return (
    <div data-segmented-meter="" style={{ display: 'flex', flexDirection: 'column', gap: 9, width: '100%' }}>
      <span
        style={{
          fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800,
          letterSpacing: 1.4, color: 'var(--e-mid)',
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', width: '100%', gap: 3, height: 14 }}>
        {Array.from({ length: segments }, (_, i) => {
          const isSpent = i < filled
          const isLastTwo = i >= segments - 2
          return (
            <div
              key={i}
              data-tick=""
              {...(isSpent ? { 'data-spent': '' } : {})}
              style={{
                flex: 1,
                height: '100%',
                borderRadius: 1,
                background: isSpent ? (isLastTwo ? 'var(--s-mid)' : 'var(--d-3)') : 'var(--d-1)',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
```

```tsx
// frontend/src/editorial/components/EdgeBleed.tsx
import type { ReactNode } from 'react'

/**
 * Mechanic M — edge-bleed ground (roadbook, 2026-08-06, adapted).
 *
 * The state accent bleeds in from the top and bottom edges rather than
 * tinting the ground flat. The --g-* grounds are already this idea at
 * roughly 3%; --st-a26 is the same dial at 26%, so this is a value the
 * system owns rather than a new concept borrowed whole.
 *
 * Both washes are pointer-transparent and sit behind the content, so no
 * tap target anywhere on the screen changes because of them.
 */
export default function EdgeBleed({ children }: { children: ReactNode }) {
  return (
    <div data-edge-bleed="" style={{ position: 'relative', width: '100%' }}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: '0 0 auto 0', height: 180, pointerEvents: 'none', zIndex: 0,
          background: 'linear-gradient(to bottom, var(--st-a26), transparent)',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 'auto 0 0 0', height: 180, pointerEvents: 'none', zIndex: 0,
          background: 'linear-gradient(to top, var(--st-a26), transparent)',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>{children}</div>
    </div>
  )
}
```

If `BlockLike` is not currently exported from `TodayView.tsx`, export the existing interface rather than duplicating it — a second declaration of the same shape is how the two drift.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/editorial/__tests__/mechanics.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/editorial/components/BlockStrip.tsx frontend/src/editorial/components/SegmentedMeter.tsx frontend/src/editorial/components/EdgeBleed.tsx frontend/src/editorial/tokens.css frontend/src/editorial/__tests__/mechanics.test.tsx
git commit -m "feat(editorial): mechanics G, J and M -- hatch, budget, bleed"
```

---

## Task 6: The copy

Every string the rebuilt screen needs, in one place, before the screen is written — so Task 7 composes rather than invents.

**Files:**
- Modify: `frontend/src/editorial/i18n/copy.ts`

**Interfaces:**
- Produces the copy keys `TrainingDay` consumes. Existing keys are reused wherever one exists: `sectionTheSession` (`DIE EINHEIT`), `sectionRecovery` (`ERHOLUNG`), `sectionTrajectory` (`VERLAUF`), `unitTss`, `unitWatts`, `labelHrv`, `labelRestingHr`, `labelSleep`, `insightFitness`, `insightForm`, `tomorrowBandToday`.

- [ ] **Step 1: Add the keys**

```ts
  // ---- Trainingstag compression (roadbook rebuild, 2026-08-06) -------------
  tripletLoad: { de: 'BELASTUNG', en: 'LOAD' },
  /** VerdictRow's qualifier counts the session's blocks — "0:52 · IF 0,74 ·
   *  11 Teile". Every block, not just the work intervals: this is the
   *  session's length, not its shape (`chipWorkShape` is the shape, and the
   *  two disagreeing under one word is a defect this build already fixed). */
  blocksWord: { de: 'Teile', en: 'parts' },
  weekMeterLabel: { de: 'WOCHE · {pct} % VERBRAUCHT', en: 'WEEK · {pct}% SPENT' },
  /** The four wearable metrics named inline, so the Erholung section can say
   *  "no reading since Monday" once instead of dashing four rows that each
   *  repeat it. Not a chart caption: it is the list of what is missing. */
  recoveryMetricsInline: { de: 'HRV · Ruhepuls · Schlaf · Schlafphasen', en: 'HRV · Resting HR · Sleep · Sleep stages' },
  /** Phase + countdown. Two arms: an athlete on a fitness-builder plan has a
   *  phase but no event, and "noch — Tage" is not a sentence. */
  phaseWithEvent: { de: 'Phase {phase} — noch {days} Tage bis {event}.', en: 'Phase {phase} — {days} days to {event}.' },
  phaseNoEvent: { de: 'Phase {phase}.', en: 'Phase {phase}.' },
  /** The sync action beside the dated stale-wearable line. The design pass
   *  cut a ~120px orange card down to this one line; the action survives
   *  because withholding a verdict without offering the fix is a dead end. */
  syncAction: { de: 'Synchronisieren', en: 'Sync' },
  /** Tomorrow, as one line at the foot of the screen. `unlockLabel` has no
   *  source on PlannedWorkout (no time-of-day field exists anywhere), so the
   *  time arm only renders when a real one arrives. */
  tomorrowLine: { de: 'Morgen {title}', en: 'Tomorrow {title}' },
  tomorrowLineWithTime: { de: 'Morgen {title} · {time}', en: 'Tomorrow {title} · {time}' },
```

`{pct}` is filled by the call site with `Math.round((spent / planned) * 100)`.

- [ ] **Step 2: Run the type check**

Run: `cd frontend && npx tsc -b`
Expected: PASS. `Record<CopyKey, { de: string; en: string }>` makes a key with one language a compile error, so this step is the test for this task.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/editorial/i18n/copy.ts
git commit -m "chore(editorial): the Trainingstag rebuild's copy, German first"
```

---

## Task 7: `TrainingDay` — the composed screen

The whole point. Ten blocks, in order, each one already built.

**Files:**
- Create: `frontend/src/editorial/pages/TrainingDay.tsx`
- Modify: `frontend/src/editorial/pages/TodayView.tsx`

**Interfaces:**
- Consumes: `HeaderSpine` (Task 1), `weekLoad`/`phaseContext` (Task 2), `RuleHead`/`Triplet`/`VerdictRow` (Task 3), `TwoWeightHead`/`splitVerdict` (Task 4), `BlockStrip`/`SegmentedMeter`/`EdgeBleed` (Task 5), the copy (Task 6), and the existing `WeekRail`, `TomorrowBand`, `TabBar`, and `quoteTraining`/`quoteTrainingAttribution`.
- Produces:

```ts
export default function TrainingDay(props: {
  model: TodayModel
  control?: DayStateControl
  profile?: ProfileHeaderData
}): JSX.Element
```

**Composition, in order.** Every slot names its source; anything with no source renders its dash or nothing at all, per the missing-data rule.

| # | Block | Source | When missing |
|---|---|---|---|
| 1 | `HeaderSpine` | `dateLabel`, `streakDays`, `profile` | unchanged from today |
| 2 | `TwoWeightHead` | `splitVerdict(model.verdict.value.headline)` | the whole headline reads at one weight; no accent spent |
| 3 | The dated line | `readinessGateHeadline` + `syncAction` when the gate is `'stale'` | nothing — a fresh reading has nothing to date |
| 4 | Conditions row | `model.conditions` | `—` per value, one reason line |
| 5 | `Triplet` | `pmc.fitness`, `pmc.form`, `session.tss` | `—` in the cell; the reason prints once, below |
| 6 | Coach paragraph + phase line | `verdict.body`, `phaseContext` | the paragraph's own reason; phase line omitted |
| 7 | `RuleHead(DIE EINHEIT)` + `VerdictRow` + `BlockStrip` | `session.title`, the qualifier, `session.targetWatts`, `session.blocks` | row stays, dashes in place, strip renders nothing |
| 8 | `RuleHead(ERHOLUNG)` + one dated reason + `recoveryMetricsInline` | `hrv`/`restingHr`/`sleep` | one reason, once, with the four metrics named |
| 9 | `RuleHead(VERLAUF)` + `SegmentedMeter` + `WeekRail` | `weekLoad`, `model.week` | meter withheld with its reason; rail keeps its dashes |
| 10 | Pull quote | the existing quote copy for `training` | omitted (it is editorial copy, never missing) |
| 11 | Tomorrow line | `model.tomorrow` | its own reason, one line |
| 12 | `TomorrowBand` (to `/e/session`) + `TabBar` | `session` | band states nothing is planned; no time — `17:30` has no source |

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/editorial/__tests__/trainingCompression.test.tsx
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { missing, present } from '../data/value'
import type { TodayModel } from '../data/useTodayModel'
import TodayView from '../pages/TodayView'

afterEach(cleanup)

const trainingModel: TodayModel = {
  state: 'training',
  dateLabel: present('DO 06 AUG'),
  streakDays: present(0),
  readiness: missing('Keine Nacht-Werte.'),
  readinessGate: 'stale',
  readinessGateHeadline: 'Keine Nacht-Werte seit 3. Aug',
  readiness90DayBest: missing('Keine 90-Tage-Historie.'),
  bodyBattery90DayHigh: missing('Keine 90-Tage-Historie.'),
  hrv: missing('Keine Messung seit Montag.'),
  restingHr: missing('Keine Messung seit Montag.'),
  recentRestingHr: missing('Keine Messung seit Montag.'),
  sleep: missing('Keine Messung seit Montag.'),
  pmc: present({ fitness: 30, fatigue: 44, form: 13, series: [] }),
  recovery: missing('Keine Erholungsschätzung.'),
  bodyBattery: missing('Keine Messung seit Montag.'),
  session: present({
    title: '5 × 3 an der Schwelle', targetWatts: 277, workKj: null, intensityFactor: 0.74, tss: 47,
    blocks: [
      { label: 'Einfahren', minutes: 20, watts: 180 },
      { label: '5 × 3 min @ 110%', minutes: 27, watts: 305 },
      { label: 'Aus', minutes: 10, watts: 120 },
    ],
  }),
  ride: missing('Heute noch keine Fahrt erfasst.'),
  zones: missing('Heute noch keine Fahrt erfasst.'),
  peaks: missing('Heute noch keine Fahrt erfasst.'),
  planVsRidden: missing('Nicht dem Plan zugeordnet.'),
  verdict: present({
    headline: 'VO2 heute — du bist frisch',
    body: 'Genau der Tag, an dem eine fordernde Einheit ihre volle Wirkung entfaltet.',
  }),
  whatThisChanges: missing('Der Coach hat sich noch nicht geäußert.'),
  conditions: present({ tempC: 28, windKmh: 14, windFrom: null }),
  tomorrow: present({ title: 'Ruhetag', detail: '', unlockLabel: missing('Keine Startzeit.') }),
  week: [
    { letter: 'M', tss: present(52) }, { letter: 'D', tss: present(88) }, { letter: 'M', tss: missing('Kein Ride.') },
    { letter: 'D', tss: present(168) }, { letter: 'F', tss: present(96) }, { letter: 'S', tss: present(210) },
    { letter: 'S', tss: missing('Kein Ride.') },
  ],
  weekLoad: present({ spent: 614, planned: 900 }),
  phaseContext: present({ phase: 'Grundlage 1', daysToEvent: 121, eventType: 'Marathon' }),
  isLoading: false,
} as unknown as TodayModel

function renderTraining() {
  return render(<MemoryRouter><TodayView model={trainingModel} /></MemoryRouter>)
}

describe('Trainingstag composition', () => {
  it('leads with the verdict, and names the session exactly once', () => {
    const { container } = renderTraining()
    expect(container.querySelector('[data-two-weight-head]')).not.toBeNull()
    expect(screen.getAllByText('5 × 3 an der Schwelle')).toHaveLength(1)
  })

  it('runs three ruled sections in order, with no numbered section heads', () => {
    const { container } = renderTraining()
    const heads = Array.from(container.querySelectorAll('[data-rule-head]'))
      .map((h) => h.textContent)
    expect(heads).toEqual(['DIE EINHEIT', 'ERHOLUNG', 'VERLAUF'])
    expect(container.querySelector('[data-section]')).toBeNull()
  })

  it('carries the band, the strip, the meter and the rail', () => {
    const { container } = renderTraining()
    expect(container.querySelectorAll('[data-triplet]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-block-strip]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-segmented-meter]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-week-rail]')).toHaveLength(1)
  })

  it('drops what the roadbook cut: tiles, insight strip, PMC chart, plates', () => {
    const { container } = renderTraining()
    expect(container.querySelector('[data-stat-tile]')).toBeNull()
    expect(container.querySelector('[data-insight-strip]')).toBeNull()
    expect(container.querySelector('[data-pmc-chart]')).toBeNull()
    expect(container.querySelector('[data-tomorrow-plate]')).toBeNull()
  })

  it('states the session shape once — one strip, not a hero copy and a section copy', () => {
    const { container } = renderTraining()
    const strips = container.querySelectorAll('[data-block-strip], [data-bars]')
    expect(strips).toHaveLength(1)
  })

  it('says the stale-wearable reason once, dated, with the metrics named', () => {
    const { container } = renderTraining()
    expect(screen.getAllByText(/Keine Messung seit Montag\./)).toHaveLength(1)
    expect(screen.getByText('Keine Nacht-Werte seit 3. Aug')).toBeTruthy()
    expect(screen.getByText('HRV · Ruhepuls · Schlaf · Schlafphasen')).toBeTruthy()
    expect(container.querySelector('[data-range-row]')).toBeNull()
  })

  it('prints the TSS number exactly once on the whole screen', () => {
    renderTraining()
    expect(screen.getAllByText('47')).toHaveLength(1)
  })

  it('spends the accent exactly twice in the body', () => {
    const { container } = renderTraining()
    const body = container.querySelector('[data-training-body]') as HTMLElement
    expect(body).not.toBeNull()
    // Two, by the roadbook's own finding: the headline's emphasis word and
    // the one number the screen is about. The spine and TabBar sit outside
    // this wrapper — their accent is chrome, not the screen's argument.
    expect(body.querySelectorAll('[data-accent]')).toHaveLength(2)
  })

  it('offers no start time, because no field carries one', () => {
    renderTraining()
    expect(screen.queryByText(/17:30/)).toBeNull()
  })
})

describe('Trainingstag under a thin day', () => {
  const thin = { ...trainingModel, session: missing('Für heute ist nichts geplant.'),
    weekLoad: missing('Für diese Woche ist noch keine Belastung geplant.') } as unknown as TodayModel

  it('keeps every frame and dashes inside it, withholding the meter entirely', () => {
    const { container } = render(<MemoryRouter><TodayView model={thin} /></MemoryRouter>)
    expect(container.querySelectorAll('[data-rule-head]')).toHaveLength(3)
    expect(container.querySelector('[data-verdict-row]')).not.toBeNull()
    expect(container.querySelector('[data-segmented-meter]')).toBeNull()
    expect(screen.getAllByText('Für diese Woche ist noch keine Belastung geplant.')).toHaveLength(1)
  })

  it('never prints the same reason twice', () => {
    render(<MemoryRouter><TodayView model={thin} /></MemoryRouter>)
    expect(screen.getAllByText('Für heute ist nichts geplant.')).toHaveLength(1)
  })
})
```

If `StatTile`, `InsightStrip`, `PMCChart`, `TomorrowPlate` or `Bars` lack the `data-*` hooks these assertions query, add the attribute to the component in this task — a one-attribute addition, no behaviour change, and every one of those components is inside `editorial/`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/editorial/__tests__/trainingCompression.test.tsx`
Expected: FAIL — the shipped Training screen still renders numbered sections and tiles.

- [ ] **Step 3: Write `TrainingDay.tsx`**

```tsx
// frontend/src/editorial/pages/TrainingDay.tsx
import { Thermometer, Wind } from 'lucide-react'
import BlockStrip from '../components/BlockStrip'
import EdgeBleed from '../components/EdgeBleed'
import HeaderSpine from '../components/HeaderSpine'
import RuleHead from '../components/RuleHead'
import SegmentedMeter from '../components/SegmentedMeter'
import TabBar from '../components/TabBar'
import TomorrowBand from '../components/TomorrowBand'
import Triplet from '../components/Triplet'
import TwoWeightHead from '../components/TwoWeightHead'
import VerdictRow from '../components/VerdictRow'
import WeekRail from '../components/WeekRail'
import { isPresent, missing, present, type Value } from '../data/value'
import type { TodayModel } from '../data/useTodayModel'
import { splitVerdict } from '../data/verdictSplit'
import { useCopy } from '../i18n/useCopy'
import type { DayStateControl, ProfileHeaderData } from './TodayView'

/**
 * The Trainingstag, rebuilt from the mechanics roadbook (2026-08-06).
 *
 * The shipped screen measured 3,154px — 3.7 phone-heights for one day —
 * because it was transcribed from a mock and then had a reason line added
 * under every empty slot. Nothing here is deleted except repetition: the
 * day-type pill, the weather row, the coach's paragraph, the pull quote and
 * the Tomorrow band all survive. What goes is the second copy of the
 * session's shape, the third copy of the stale-wearable apology, the tile
 * row restating two of the triplet's three numbers, and a PMC chart the
 * design pass measured as unreadable at 390px.
 *
 * Accent budget: TWO. The headline's emphasis word, and the one number the
 * screen is about. Every mechanic's accent use is defensible alone; the
 * roadbook's finding was that composing them put seven green things on one
 * screen so that none of them read.
 */
export default function TrainingDay({ model, control, profile }: {
  model: TodayModel
  control?: DayStateControl
  profile?: ProfileHeaderData
}) {
  const { t, locale } = useCopy()

  // One reason, once, at its first occurrence — screen-wide, not per
  // section. Three identical apologies is the screen apologising for itself
  // (design pass, measured live at 390×844).
  const seenReasons = new Set<string>()
  const reasonOnce = (value: Value<unknown>): string | null => {
    if (isPresent(value)) return null
    if (seenReasons.has(value.missing)) return null
    seenReasons.add(value.missing)
    return value.missing
  }

  const verdictParts = isPresent(model.verdict)
    ? splitVerdict(model.verdict.value.headline)
    : { lead: '—', emphasis: null }

  const num = (n: number) => n.toLocaleString(intlLocale(locale))

  const tripletCells = [
    {
      label: t('insightFitness'),
      value: mapToText(model.pmc, (p) => num(Math.round(p.fitness))),
      unit: '',
    },
    {
      label: t('insightForm'),
      value: mapToText(model.pmc, (p) => `${p.form > 0 ? '+' : ''}${num(Math.round(p.form))}`),
      unit: 'TSB',
    },
    {
      label: t('tripletLoad'),
      value: mapToText(model.session, (s) => (s.tss == null ? null : num(s.tss))),
      unit: t('unitTss'),
    },
  ]

  const sessionQualifier: Value<string> = isPresent(model.session)
    ? present([
      formatHoursMinutes(model.session.value.blocks.reduce((sum, b) => sum + b.minutes, 0)),
      model.session.value.intensityFactor == null
        ? null
        : `IF ${model.session.value.intensityFactor.toLocaleString(intlLocale(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `${model.session.value.blocks.length} ${t('blocksWord')}`,
    ].filter((part): part is string => part != null).join(' · '))
    : missing(model.session.missing)

  const phaseLine: string | null = !isPresent(model.phaseContext)
    ? null
    : model.phaseContext.value.daysToEvent != null && model.phaseContext.value.eventType != null
      ? t('phaseWithEvent', {
        phase: model.phaseContext.value.phase,
        days: model.phaseContext.value.daysToEvent,
        event: model.phaseContext.value.eventType,
      })
      : t('phaseNoEvent', { phase: model.phaseContext.value.phase })

  // The four wearable readings share one root cause, so the section states
  // it once and names what is missing rather than dashing four rows that
  // each repeat the same sentence.
  const recoveryReason = reasonOnce(model.hrv) ?? reasonOnce(model.restingHr) ?? reasonOnce(model.sleep)

  const tomorrowLine: string = !isPresent(model.tomorrow)
    ? model.tomorrow.missing
    : isPresent(model.tomorrow.value.unlockLabel)
      ? t('tomorrowLineWithTime', {
        title: model.tomorrow.value.title,
        time: model.tomorrow.value.unlockLabel.value,
      })
      : t('tomorrowLine', { title: model.tomorrow.value.title })

  return (
    <main style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <HeaderSpine
        state="training"
        dateLabel={model.dateLabel}
        streakDays={model.streakDays}
        profile={profile}
        control={control}
        switchable
      />

      <EdgeBleed>
        <div
          data-training-body=""
          style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 26, padding: '34px 24px 0 24px' }}
        >
          {/* 2 · the verdict, at two weights */}
          <TwoWeightHead lead={verdictParts.lead} emphasis={verdictParts.emphasis} />

          {/* 3 · the dated line — what used to be a ~120px orange card */}
          {model.readinessGate === 'stale' && model.readinessGateHeadline && (
            <p style={{ ...reasonStyle, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span>{model.readinessGateHeadline}</span>
              {control?.readinessSync && (
                <button type="button" onClick={control.readinessSync.onSync} style={syncActionStyle}>
                  {t('syncAction')}
                </button>
              )}
            </p>
          )}

          {/* 4 · conditions */}
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={condStyle}>
              <Thermometer size={14} color="var(--e-mid)" aria-hidden="true" />
              {isPresent(model.conditions) ? `${Math.round(model.conditions.value.tempC)}°` : '—'}
            </span>
            <span style={condStyle}>
              <Wind size={14} color="var(--e-mid)" aria-hidden="true" />
              {isPresent(model.conditions) ? `${Math.round(model.conditions.value.windKmh)} km/h` : '—'}
            </span>
          </div>

          {/* 5 · the triplet — three facts, one band, 62px */}
          <Triplet cells={tripletCells} />

          {/* 6 · the coach, trimmed to what the triplet does not say */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={proseStyle}>
              {isPresent(model.verdict) ? model.verdict.value.body : model.verdict.missing}
            </p>
            {phaseLine && <p style={reasonStyle}>{phaseLine}</p>}
          </div>

          {/* 7 · the session: named once, shaped once */}
          <section style={sectionStyle}>
            <RuleHead title={t('sectionTheSession')} />
            <VerdictRow
              title={mapToText(model.session, (s) => s.title)}
              qualifier={sessionQualifier}
              value={mapToText(model.session, (s) => (s.targetWatts == null ? null : num(s.targetWatts)))}
              unit={t('unitWatts')}
              accent
            />
            <BlockStrip blocks={isPresent(model.session) ? model.session.value.blocks : []} />
            {reasonOnce(model.session) && <p style={reasonStyle}>{seenReasonText(model.session)}</p>}
          </section>

          {/* 8 · recovery: one dated reason, the four metrics named inline */}
          <section style={sectionStyle}>
            <RuleHead title={t('sectionRecovery')} />
            {recoveryReason && <p style={reasonStyle}>{recoveryReason}</p>}
            <p style={{ ...reasonStyle, color: 'var(--e-lo)' }}>{t('recoveryMetricsInline')}</p>
          </section>

          {/* 9 · trajectory: the budget, then the week that spent it */}
          <section style={sectionStyle}>
            <RuleHead title={t('sectionTrajectory')} />
            {isPresent(model.weekLoad) ? (
              <SegmentedMeter
                label={t('weekMeterLabel', {
                  pct: Math.round((model.weekLoad.value.spent / model.weekLoad.value.planned) * 100),
                })}
                spent={model.weekLoad.value.spent}
                planned={model.weekLoad.value.planned}
              />
            ) : (
              <p style={reasonStyle}>{model.weekLoad.missing}</p>
            )}
            <WeekRail days={model.week} todayIndex={todayIndexOf(new Date())} />
          </section>

          {/* 10 · the pull quote, as text — same device, none of the plate's height */}
          <blockquote style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={quoteStyle}>{t('quoteTraining')}</p>
            <span style={{ ...reasonStyle, color: 'var(--e-lo)' }}>{t('quoteTrainingAttribution')}</span>
          </blockquote>

          {/* 11 · tomorrow, as one line */}
          <p style={reasonStyle}>{tomorrowLine}</p>
        </div>
      </EdgeBleed>

      {/* 12 · the CTA. `TomorrowBand` — NOT `SessionCta`, whose whole
          signature is `{ onExport }` and which belongs to Session Detail.
          The band already carries today's session and already links to
          /e/session (commit 4413e1e), so this screen reuses the one
          affordance that exists rather than minting a second. It carries no
          clock time: PrescribedWorkout has no time-of-day field anywhere,
          and the roadbook's "17:30" is mock. */}
      <div style={{ width: '100%', padding: '46px 16px 0 16px' }}>
        <TomorrowBand
          session={mapToBandSession(model.session)}
          kicker={t('tomorrowBandToday')}
          to="/e/session"
        />
      </div>
      <TabBar active="today" />
    </main>
  )
}
```

Five helpers this file needs, all of which already exist in `TodayView.tsx` — **export them from there rather than re-declaring them**, so the two screens cannot drift on the same formatting rule: `formatHoursMinutes`, `intlLocale` (currently imported from the copy module), `todayIndexOf` (or the existing `todayIndex` derivation), a `mapToText` equivalent of the existing `mapValue` that maps to `Value<string>` and turns a `null` result into the same missing reason, and `mapToBandSession` — the `mapValue(model.session, …)` that produces `TomorrowBand`'s `{ title, unlockLabel }` shape, which `TodayView` already builds as `todaySession`. `seenReasonText` is a two-line local: return the reason `reasonOnce` just claimed, or nothing.

One new copy key this composition needs beyond Task 6's list: `blocksWord` (`{ de: 'Teile', en: 'parts' }`), for the verdict row's qualifier. Add it in Task 6 rather than inline here.

The style constants (`sectionStyle`, `reasonStyle`, `proseStyle`, `condStyle`, `quoteStyle`, `syncActionStyle`) go at the foot of the file and reference only tokens — `--t-body`/`--t-label`/`--t-micro`, `--e-mid`/`--e-lo`/`--e-quiet`. `isolation.test.ts` fails the build on a raw hex, so there is no way to get this wrong quietly.

The rules that are easy to get wrong, restated because they are the review criteria:

- **One `data-training-body` wrapper** around blocks 2–11, so the accent-budget test can scope itself. The spine and TabBar sit outside it.
- **`EdgeBleed` wraps the body**, not the whole page: the Cover plate carries its own scrim and a second wash over it muddies the photo.
- **Reason dedupe is this file's job** — `reasonOnce` above, one `Set` for the whole screen.
- **The accent budget is two.** Nothing in the body may pass an accent prop or set `var(--st-active)` directly beyond `TwoWeightHead`'s emphasis and the one `VerdictRow accent`.
- **The foot CTA is `TomorrowBand`, not `SessionCta`.** `SessionCta`'s entire signature is `{ onExport }` — it is Session Detail's export button. Reusing it here would mean inventing an export action on a screen that has nothing to export yet.
- **`control?.readinessSync`** is optional by design (a fixture render has no `control`). When it is absent, render the dated line alone — never invent the action.

- [ ] **Step 4: Delegate from `TodayView`**

In `TodayViewBody`, immediately after `state` is resolved:

```tsx
if (state === 'training') {
  return <TrainingDay model={model} control={control} profile={profile} />
}
```

Then delete the Training arms that are now unreachable: the hero-body `Bars` preview, Training's `Verdict` body arm, Training's conditions row, the `isRestOrTraining` union's Training half (leaving Rest's own), the `state === 'training'` "02 The Session" section, and Training's Route Plate. Leave every Rest/Trained/Resting/Evening path exactly as it is. `tsc -b`'s `noUnusedLocals` will name any helper that fell out of use with them; delete those too.

- [ ] **Step 5: Update the existing Training assertions**

`frontend/src/editorial/__tests__/restTraining.test.tsx`'s `describe('Training screen composition')` asserts the old numbered-section order. Replace that block's two tests with one that asserts delegation, and leave every Rest test untouched:

```tsx
describe('Training screen composition', () => {
  it('renders the compressed Trainingstag, not the numbered-section screen', () => {
    const { container } = render(<MemoryRouter><TodayView model={trainingModel} /></MemoryRouter>)
    expect(container.querySelector('[data-section]')).toBeNull()
    expect(container.querySelectorAll('[data-rule-head]')).toHaveLength(3)
  })
})
```

- [ ] **Step 6: Run the whole editorial suite**

Run: `cd frontend && npx vitest run src/editorial`
Expected: PASS. Other suites (`visualHarness`, `realDataAudit`, `motion`, `chartInteraction`) may reference the Training screen's old structure — each failure is either a real regression (fix the screen) or an assertion about a deleted element (update the assertion to the new structure). Do not delete a test to make it pass; if a test's subject no longer exists on this screen, re-point it at the component that replaced it.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/editorial/pages/TrainingDay.tsx frontend/src/editorial/pages/TodayView.tsx frontend/src/editorial/__tests__/trainingCompression.test.tsx frontend/src/editorial/__tests__/restTraining.test.tsx
git commit -m "feat(editorial): one training day, 1.7 screens"
```

---

## Task 8: The 42-vs-47 TSS contradiction

The roadbook's change table lists this as the one entry that is a data bug rather than a design one: *"Belastung read 42 TSS in the prose and 47 TSS in the tiles."* Tracing the two numbers to their sources is the deliverable here — the fix may not be in this repo's frontend at all.

**Files:**
- Modify: `frontend/src/editorial/pages/TrainingDay.tsx` (only if the finding is frontend-side)
- Modify: `docs/superpowers/specs/2026-08-05-editorial-ii-design-system-design.md` (the finding, either way)

**Interfaces:**
- Consumes: `model.session.tss` (the tile's 47) and `model.verdict.body` (the prose's 42, via `brief.rationale`).

- [ ] **Step 1: Trace both numbers**

Established already, and not to be re-derived: the tile reads `TodayModel.session.tss` — `useTodaySession`'s planned workout. The prose is `CoachBrief.rationale`, an LLM-generated, stored, 6-hour-cached string (`backend/app/models/coach_brief.py:41`, served via `backend/app/api/coach.py:170`).

Confirm which of these two is true, in the running app with real data:

```bash
# the brief's own cached text and when it was generated
psql "$DATABASE_URL" -c "select generated_at, left(rationale, 400) from coach_briefs order by generated_at desc limit 1;"
```

- **(a) The brief is stale relative to the plan** — the plan's TSS changed after the brief was generated and cached. Then the number in the prose was true when written and the screen is showing two ages of the same fact.
- **(b) The brief reads a different field** — the generator quotes a target the plan no longer uses. Then it is an upstream bug in brief generation.

- [ ] **Step 2: Apply the outcome**

- **If (a):** no code fix is available from `editorial/`, and rewriting an LLM's prose in the client is not one. The compressed screen already reduces the exposure — `Triplet` is the screen's single Belastung number and the coach paragraph sits beneath it as prose. Record the finding in the spec's "Open questions" section, naming the cache TTL and the two sources, and stop. Do not add a client-side scrubber that strips numbers out of coach prose: a paragraph with a hole in it is worse than a paragraph that is six hours old.
- **If (b):** it is a backend brief-generation bug. It is **out of this plan's scope** (no backend changes, and this is not additive exposure). Record it in the spec with the exact field names, and raise it as the next piece of work rather than fixing it here.

- [ ] **Step 3: Add the guard that is in scope either way**

The screen must never print two different TSS numbers as facts. `trainingCompression.test.tsx` already asserts `'47'` appears exactly once — extend it so the assertion is about the unit, not one literal:

```tsx
it('shows the TSS unit exactly once, so two sources can never disagree in view', () => {
  const { container } = renderTraining()
  const body = container.querySelector('[data-training-body]') as HTMLElement
  expect(body.textContent?.match(/TSS/g) ?? []).toHaveLength(1)
})
```

- [ ] **Step 4: Run the test**

Run: `cd frontend && npx vitest run src/editorial/__tests__/trainingCompression.test.tsx`
Expected: PASS. If it fails because `WeekRail` labels its bars in TSS, that is the honest second use — scope the assertion to the triplet's own band and record why in the test's comment.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editorial/__tests__/trainingCompression.test.tsx docs/superpowers/specs/2026-08-05-editorial-ii-design-system-design.md
git commit -m "test(editorial): one load number on one screen, and the record of why there were two"
```

---

## Task 9: The full gate, the isolation proof, and one rendered frame

**Files:**
- None created. This task either passes or sends you back into an earlier one.

- [ ] **Step 1: Run the complete gate**

```bash
cd frontend && npx tsc -b && npm run test && npm run build && npm run lint && npm run lint:i18n
```

Expected: all five PASS. Every failure is fixed before this task is done — none are waived. `lint:i18n` findings on new German copy are legitimate only if the string is English; German copy tripping the matcher means the string is in the wrong file, not that it needs an allowlist entry.

- [ ] **Step 2: Prove the isolation surface did not move**

```bash
git diff --stat main -- frontend/src backend | grep -v 'frontend/src/editorial'
```

Expected: exactly the lines the branch already had before this plan (`frontend/src/App.tsx`, `frontend/src/api/streamAnalysis.ts`, `backend/app/api/activities.py`). **Anything new is a scope violation — stop and report it.**

- [ ] **Step 3: Render one frame at 390×844**

Start the dev server the project already uses, open `/e/today` on a training day at 390×844, and capture one frame. Check, in order:

1. **Height.** Scroll height of the screen. The roadbook's rebuild measured 1,459px against a shipped 3,154px. Anything under ~1,800px has delivered the compression; anything over 2,400px means a block did not compress and the frame will show which.
2. **The accent budget.** Count the accent-coloured things in the body. There must be two. If there are more, the test scoped itself too narrowly — find the third and fix the screen, not the test.
3. **The type floor.** Nothing under 11px. Nothing at 9px anywhere.
4. **The hatch.** The block strip must read as planned-not-yet-ridden at arm's length, not as a rendering artefact.
5. **The edge bleed.** The accent should be felt at the top and bottom edges without the middle of the screen looking tinted.

- [ ] **Step 4: Fix what the frame shows, then re-render**

The design pass's own lesson, recorded in memory: a surface can pass every static gate and still ship wrong. The frame is the gate that catches that. Iterate here rather than declaring done.

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "chore(editorial): the Trainingstag rebuild passes the full gate"
```

---

## Open questions

Flagged rather than guessed. Each has a defined fallback, so no task blocks.

1. **Does `brief.verdict` actually carry a separator?** (Task 4) If real verdicts never split, the hero renders at one weight and the screen spends one accent instead of two. Fallback: acceptable as-is — the budget is a ceiling, not a quota. If it turns out *no* verdict ever splits, mechanic K is dead on this screen and should be recorded as such rather than forced.
2. **Does `useCurrentWeek` fire on the Today screen today?** (Task 2) If it is not already in the query cache, this adds one request to the Today screen's load. Fallback: acceptable — it is an existing 30-minute-stale query the app already makes elsewhere in the same session. If it measurably delays first paint, `weekLoad` degrades to missing and the meter withholds, which the screen already handles.
3. **Resolved during planning, recorded so it is not re-litigated:** `SessionCta` is Session Detail's export button (`{ onExport }`), not a Today CTA, and `DayStateControl.readinessSync` — not a bare `onSync` — is the sync affordance. Both are already reflected in Task 7's code.
4. **Do `motion`/`chartInteraction` tests assert on Training's old `Bars`?** (Task 7, Step 6) Fallback: re-point them at `BlockStrip`, which is the component that replaced it — and give `BlockStrip` the same reveal-on-first-viewport treatment the motion contract requires of every chart, including "never animate a missing state".
