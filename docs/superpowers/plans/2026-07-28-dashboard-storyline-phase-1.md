# Dashboard Storyline — Phase 1 (Spine & Nav) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn six unrelated dashboard tabs into four named chapters of one season arc, by extracting the existing arc math into a shared tested module and mounting one persistent chapter bar on every chapter page.

**Architecture:** The season-arc numbers (phase, week-in-block, countdown) already exist but live privately inside `PlanTab.tsx:320–400`. Phase 1 extracts them verbatim into a pure `utils/seasonArc.ts`, builds five presentational components in `components/narrative/`, cuts the nav from six tabs to four, and mounts the chapter bar. Chapter interiors are NOT rebuilt here — that is phases 2 and 3. This phase ships a visible, coherent spine with no card moved.

**Tech Stack:** React 19 + TypeScript, Vite, vitest + jsdom + @testing-library/react, react-router-dom, lucide-react icons, CSS custom properties for tokens.

## Global Constraints

- **Mobile-only.** Target viewport 390×844. Desktop is a sanity check, never a design target.
- **Bike-only.** No sport branches. Do not extend running or lift code paths.
- **German + English.** Every user-visible string is `de ? '…' : '…'` via `useLocale()`. No untranslated copy.
- **Honest empties.** A missing figure renders `—`, never a zero, a guess, or a hidden element. A derived-not-measured figure must announce itself (precedent: `extrapolated` in `utils/fatiguedPacing.ts`).
- **One producer per number.** `daysToEvent()` in `utils/loadMetrics.ts` is the ONLY producer of the event countdown. Never recompute it — audit P0-5 fixed a 138↔139 flip caused by a parallel implementation.
- **Existing tokens only.** `--color-accent` `#FF5A3C`, amber `#FFD166`, purple `#8B5CF6`, `--color-recovery` `#16E08A`, `--color-ink`, `--color-muted`, `--color-rule`, `--color-surface-2`. Introduce no new colours.
- **Pre-existing lint findings are not yours.** `npx eslint` reports 11 errors + 2 warnings on `TodayTab.tsx` and an unused-const error in `src/auraprobe.tsx` on `main`. Compare against the pre-change output; do not "fix" them.
- **Verification is a rendered frame, not a JSX read.** The Jul 2026 Today's Road regression passed every static gate and still shipped wrong.

---

## File Structure

**Create:**
- `frontend/src/utils/seasonArc.ts` — pure arc math + chapter ordering. No React.
- `frontend/src/utils/__tests__/seasonArc.test.ts`
- `frontend/src/components/narrative/ChapterBar.tsx` — the persistent spine strip.
- `frontend/src/components/narrative/__tests__/ChapterBar.test.tsx`
- `frontend/src/components/narrative/ChapterHero.tsx`
- `frontend/src/components/narrative/MomentCard.tsx`
- `frontend/src/components/narrative/CoachRead.tsx`
- `frontend/src/components/narrative/NextChapter.tsx`
- `frontend/src/components/narrative/__tests__/narrativeKit.test.tsx`

**Modify:**
- `frontend/src/components/dashboard/MobileBottomNav.tsx` — 6 tabs → 4.
- `frontend/src/pages/DashboardPage.tsx:29–80` — keep `social` reachable by URL after its button is gone.
- `frontend/src/components/dashboard/DashboardHeaderBar.tsx` — crew entry point.
- `frontend/src/components/dashboard/tabs/TodayTab.tsx`, `PlanTab.tsx`, `RecoveryTab.tsx`, `HistoryTab.tsx` — mount `<ChapterBar>` only.
- `frontend/src/components/dashboard/tabs/PlanTab.tsx:320–400` — replace private arc math with `seasonArc()`.

---

### Task 1: `utils/seasonArc.ts` — extract the arc math

The numbers already exist in `PlanTab.tsx`. This task moves them, unchanged in behaviour, into a tested pure module so four chapters can share one source.

**It is a move, not a copy.** `PlanTab`'s private `PHASE_WORDS` and its
`phaseLabel` memo are deleted in this same task and commit, so the duplicate
never exists in the tree. Leaving a duplication window for a later task to
close would be a real defect that happened to be scheduled.

**Files:**
- Create: `frontend/src/utils/seasonArc.ts`
- Test: `frontend/src/utils/__tests__/seasonArc.test.ts`
- Modify: `frontend/src/components/dashboard/tabs/PlanTab.tsx` — delete `PHASE_WORDS` (lines ~59–65) and the `phaseLabel` memo (~lines 341–353); import and call `phaseLabel(meso?.phase ?? null, de)` from `../../../utils/seasonArc` instead. Leave every other PlanTab figure alone — the rest of the arc wiring is Task 5.

**Interfaces:**
- Consumes: `daysToEvent(eventDate, now?)` from `frontend/src/utils/loadMetrics.ts` (returns `number | null`, uses `differenceInCalendarDays`).
- Consumes: `MesoBlockContext` from `frontend/src/api/weeks.ts` — fields used here are `phase: string`, `block_index_in_meso: number` (**0-based**), `days_to_event: number | null`, `progression: { horizon_weeks: number } | null`.
- Produces: `seasonArc()`, `phaseLabel()`, `CHAPTERS`, `chapterIndex()`, `nextChapter()`, types `ChapterId`, `SeasonArc`, `SeasonArcInput`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/utils/__tests__/seasonArc.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  seasonArc, phaseLabel, CHAPTERS, chapterIndex, nextChapter,
  type SeasonArcInput,
} from '../seasonArc'

const NOW = new Date('2026-07-28T09:00:00')

function input(over: Partial<SeasonArcInput> = {}): SeasonArcInput {
  return { now: NOW, ...over }
}

describe('seasonArc — countdown precedence', () => {
  it('prefers the profile target date over brief evidence and over the server', () => {
    const a = seasonArc(input({
      targetEventDate: '2026-12-05',
      goalEventDate: '2026-09-01',
      meso: { days_to_event: 3 },
    }))
    expect(a.daysToEvent).toBe(130)
  })

  it('falls back to brief evidence when the profile has no date', () => {
    const a = seasonArc(input({ goalEventDate: '2026-12-05', meso: { days_to_event: 3 } }))
    expect(a.daysToEvent).toBe(130)
  })

  it('uses the server figure only when no client date exists at all', () => {
    expect(seasonArc(input({ meso: { days_to_event: 42 } })).daysToEvent).toBe(42)
  })

  it('never reports a negative countdown for an event already past', () => {
    expect(seasonArc(input({ targetEventDate: '2026-07-01' })).daysToEvent).toBe(0)
  })

  it('is null with no event anywhere', () => {
    expect(seasonArc(input()).daysToEvent).toBeNull()
    expect(seasonArc(input()).weeksToEvent).toBeNull()
  })

  it('reports whole weeks, rounded up — 130 days is 19 weeks to go', () => {
    expect(seasonArc(input({ targetEventDate: '2026-12-05' })).weeksToEvent).toBe(19)
  })
})

describe('seasonArc — block position', () => {
  it('converts the server 0-based block index to a 1-based week', () => {
    expect(seasonArc(input({ meso: { block_index_in_meso: 2 } })).weekInBlock).toBe(3)
  })

  it('keeps weekInBlock null when the server did not say, rather than guessing 1', () => {
    expect(seasonArc(input({ meso: { phase: 'build' } })).weekInBlock).toBeNull()
  })

  it('takes the block length from the server progression horizon', () => {
    expect(seasonArc(input({ meso: { progression: { horizon_weeks: 6 } } })).blockWeeks).toBe(6)
  })

  it('leaves blockWeeks null when no horizon is published — the bar then shows the phase alone', () => {
    expect(seasonArc(input({ meso: { phase: 'build', block_index_in_meso: 2 } })).blockWeeks).toBeNull()
  })

  it('rejects a nonsense horizon instead of dividing by it', () => {
    expect(seasonArc(input({ meso: { progression: { horizon_weeks: 0 } } })).blockWeeks).toBeNull()
  })
})

describe('seasonArc — synthesized flag', () => {
  it('is false when a real event is booked', () => {
    expect(seasonArc(input({ targetEventDate: '2026-12-05' })).synthesized).toBe(false)
  })

  it('is true when the horizon is the fitness-builder progression, not a race', () => {
    const a = seasonArc(input({ meso: { progression: { horizon_weeks: 6 } } }))
    expect(a.synthesized).toBe(true)
    expect(a.daysToEvent).toBeNull()
  })

  it('is true when there is no event and no horizon either', () => {
    expect(seasonArc(input()).synthesized).toBe(true)
  })
})

describe('phaseLabel', () => {
  it('localizes the stem and keeps the block number', () => {
    expect(phaseLabel('base1', true)).toBe('Grundlage 1')
    expect(phaseLabel('base1', false)).toBe('Base 1')
    expect(phaseLabel('build', true)).toBe('Aufbau')
  })

  it('falls back to a readable form for an unknown key rather than showing a raw slug', () => {
    expect(phaseLabel('polarized2', false)).toBe('Polarized 2')
  })

  it('has a stated default when the server sends no phase', () => {
    expect(phaseLabel(null, true)).toBe('Grundlage')
    expect(phaseLabel(null, false)).toBe('Base')
  })
})

describe('chapter ordering', () => {
  it('is exactly four chapters in story order', () => {
    expect(CHAPTERS).toEqual(['today', 'plan', 'body', 'history'])
  })

  it('indexes them from zero for the progress dots', () => {
    expect(chapterIndex('today')).toBe(0)
    expect(chapterIndex('history')).toBe(3)
  })

  it('loops the last chapter back to the first — the arc closes', () => {
    expect(nextChapter('today')).toBe('plan')
    expect(nextChapter('history')).toBe('today')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/utils/__tests__/seasonArc.test.ts`
Expected: FAIL — `Failed to resolve import "../seasonArc"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/utils/seasonArc.ts`:

```ts
/**
 * seasonArc — the one description of where the athlete is in their season.
 *
 * Every one of these numbers already existed, computed privately inside
 * PlanTab (lines ~320-400). Four chapters now need the same figures in a
 * persistent bar, and a second implementation would drift: audit P0-5 was
 * exactly that bug, a parallel countdown that flipped 138 ↔ 139 depending on
 * the hour of day. So this module is an EXTRACTION, not new maths, and it
 * delegates the countdown itself to the single sanctioned producer.
 *
 * Honesty rules:
 *  • No event booked → `daysToEvent: null` and `synthesized: true`. The bar
 *    then shows the training block, never an invented race date.
 *  • The server publishes a block length only as the no-event fitness-builder
 *    `progression.horizon_weeks`. When it is absent, `blockWeeks` is null and
 *    the bar shows the phase word alone rather than a fabricated "W3/6".
 */
import { daysToEvent } from './loadMetrics'

/** The four chapters, in story order. */
export type ChapterId = 'today' | 'plan' | 'body' | 'history'

export const CHAPTERS: readonly ChapterId[] = ['today', 'plan', 'body', 'history']

export function chapterIndex(id: ChapterId): number {
  return CHAPTERS.indexOf(id)
}

/** The next chapter, wrapping the last back to the first so the arc closes. */
export function nextChapter(id: ChapterId): ChapterId {
  return CHAPTERS[(chapterIndex(id) + 1) % CHAPTERS.length]
}

/** The subset of the server's MesoBlockContext this module reads. */
export interface SeasonArcMeso {
  phase?: string | null
  /** 0-BASED week index inside the block, as the server sends it. */
  block_index_in_meso?: number | null
  days_to_event?: number | null
  progression?: { horizon_weeks?: number | null } | null
}

export interface SeasonArcInput {
  /** Athlete profile target event date — highest precedence. */
  targetEventDate?: string | null
  /** Goal date off the brief evidence — backup when the profile has none. */
  goalEventDate?: string | null
  meso?: SeasonArcMeso | null
  now?: Date
}

export interface SeasonArc {
  phaseKey: string | null
  /** 1-based week within the block; null when the server did not say. */
  weekInBlock: number | null
  /** Block length in weeks; null when unpublished. */
  blockWeeks: number | null
  /** Days until the event; null when none is booked. */
  daysToEvent: number | null
  /** Whole weeks until the event, rounded up; null when no event. */
  weeksToEvent: number | null
  /** True when no real event anchors the arc. */
  synthesized: boolean
}

const PHASE_WORDS: Record<string, { en: string; de: string }> = {
  base: { en: 'Base', de: 'Grundlage' },
  build: { en: 'Build', de: 'Aufbau' },
  peak: { en: 'Peak', de: 'Peak' },
  taper: { en: 'Taper', de: 'Taper' },
  race: { en: 'Race', de: 'Rennen' },
}

/** "base1" → "Grundlage 1". Lifted verbatim from PlanTab's phaseLabel memo. */
export function phaseLabel(phaseKey: string | null | undefined, de: boolean): string {
  if (!phaseKey) return de ? 'Grundlage' : 'Base'
  const m = phaseKey.match(/^([a-z]+)\s*(\d+)?$/i)
  const stem = (m?.[1] ?? phaseKey).toLowerCase()
  const word = Object.entries(PHASE_WORDS).find(([k]) => stem.startsWith(k))?.[1]
  const label = word
    ? (de ? word.de : word.en)
    : phaseKey.replace(/([a-z])(\d)/i, '$1 $2').replace(/^\w/, (c) => c.toUpperCase())
  return m?.[2] ? `${label} ${m[2]}` : label
}

export function seasonArc(input: SeasonArcInput): SeasonArc {
  const meso = input.meso ?? null
  const now = input.now ?? new Date()

  // Precedence, unchanged from PlanTab: profile date, then brief evidence,
  // then the server's own figure. `daysToEvent` is the only producer.
  const clientDays = daysToEvent(input.targetEventDate ?? input.goalEventDate ?? null, now)
  const resolved = clientDays != null
    ? Math.max(0, clientDays)
    : meso?.days_to_event != null
      ? Math.max(0, meso.days_to_event)
      : null

  const idx = meso?.block_index_in_meso
  const weekInBlock = typeof idx === 'number' && Number.isFinite(idx) ? idx + 1 : null

  const horizon = meso?.progression?.horizon_weeks
  const blockWeeks = typeof horizon === 'number' && Number.isFinite(horizon) && horizon > 0
    ? horizon
    : null

  return {
    phaseKey: meso?.phase ?? null,
    weekInBlock,
    blockWeeks,
    daysToEvent: resolved,
    weeksToEvent: resolved != null ? Math.max(0, Math.ceil(resolved / 7)) : null,
    synthesized: resolved == null,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/utils/__tests__/seasonArc.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Delete PlanTab's now-duplicate copy**

In `PlanTab.tsx`: delete the `PHASE_WORDS` constant and the `phaseLabel`
`useMemo`. Add `import { phaseLabel } from '../../../utils/seasonArc'` and
replace the memo's single consumer with `phaseLabel(meso?.phase ?? null, de)`.
`useMemo` may become an unused import — check before removing it, it is used
elsewhere in the file.

Touch nothing else in PlanTab. `daysToEventResolved`, `weeksLeft`,
`weekOfMeso` and `blockHorizon` stay as they are; Task 5 rewires them.

- [ ] **Step 6: Typecheck, run the full suite, and commit**

Run: `cd frontend && npx tsc -b --noEmit && npx vitest run`
Expected: `tsc` reports only the pre-existing `src/auraprobe.tsx` finding, if it
has not yet been resolved on your branch. The full suite passes — baseline is
573 tests, so expect 573 + 18 new. A PlanTab test that asserts a phase string
must still pass; `phaseLabel` was moved verbatim, so a failure means the move
changed behaviour and the CODE is wrong, not the test.

```bash
git add frontend/src/utils/seasonArc.ts frontend/src/utils/__tests__/seasonArc.test.ts frontend/src/components/dashboard/tabs/PlanTab.tsx
git commit -m "feat(narrative): extract the season arc into one tested module

The phase, week-in-block and countdown figures lived privately inside
PlanTab. Four chapters now need them in a persistent bar, and a second
implementation would drift — audit P0-5 was exactly that bug. Extracted
verbatim, delegating the countdown to the single sanctioned producer."
```

---

### Task 2: `ChapterBar` — the persistent spine

**Files:**
- Create: `frontend/src/components/narrative/ChapterBar.tsx`
- Test: `frontend/src/components/narrative/__tests__/ChapterBar.test.tsx`

**Interfaces:**
- Consumes: `seasonArc`, `phaseLabel`, `CHAPTERS`, `chapterIndex`, type `ChapterId`, type `SeasonArc` from `../../utils/seasonArc`.
- Produces: `default function ChapterBar(props: ChapterBarProps)` and `export const CHAPTER_TITLES: Record<ChapterId, { en: string; de: string }>`.

```ts
export interface ChapterBarProps {
  chapter: ChapterId
  arc: SeasonArc
  de: boolean
}
```

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/narrative/__tests__/ChapterBar.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ChapterBar from '../ChapterBar'
import { seasonArc } from '../../../utils/seasonArc'

afterEach(cleanup)

const NOW = new Date('2026-07-28T09:00:00')
const booked = seasonArc({ targetEventDate: '2026-12-05', now: NOW, meso: { phase: 'build', block_index_in_meso: 2, progression: { horizon_weeks: 6 } } })
const noEvent = seasonArc({ now: NOW, meso: { phase: 'base1', block_index_in_meso: 0 } })

describe('ChapterBar', () => {
  it('names the chapter you are in', () => {
    render(<ChapterBar chapter="plan" arc={booked} de />)
    expect(screen.getByText(/WO DAS HINGEHT/i)).toBeTruthy()
  })

  it('shows the phase, the week in block and the countdown together', () => {
    render(<ChapterBar chapter="today" arc={booked} de />)
    expect(screen.getByText(/Aufbau/)).toBeTruthy()
    expect(screen.getByText(/W3\/6/)).toBeTruthy()
    expect(screen.getByText(/130/)).toBeTruthy()
  })

  it('renders one dot per chapter and marks only the current one', () => {
    const { container } = render(<ChapterBar chapter="body" arc={booked} de />)
    const dots = container.querySelectorAll('[data-chapter-dot]')
    expect(dots).toHaveLength(4)
    expect(container.querySelectorAll('[data-chapter-dot="current"]')).toHaveLength(1)
    expect(dots[2].getAttribute('data-chapter-dot')).toBe('current')
  })

  it('omits the week fraction rather than inventing one when no horizon is published', () => {
    render(<ChapterBar chapter="today" arc={noEvent} de />)
    expect(screen.getByText(/Grundlage 1/)).toBeTruthy()
    expect(screen.queryByText(/W1\//)).toBeNull()
  })

  it('shows no countdown at all when no event is booked', () => {
    render(<ChapterBar chapter="today" arc={noEvent} de />)
    expect(screen.queryByText(/\bT\b/)).toBeNull()
  })

  it('announces itself as a training block, not a race, when synthesized', () => {
    render(<ChapterBar chapter="today" arc={noEvent} de />)
    expect(screen.getByText(/Trainingsblock/i)).toBeTruthy()
  })

  it('translates', () => {
    render(<ChapterBar chapter="history" arc={booked} de={false} />)
    expect(screen.getByText(/DID IT WORK/i)).toBeTruthy()
  })

  it('exposes the arc to assistive tech as one sentence, not loose fragments', () => {
    render(<ChapterBar chapter="today" arc={booked} de />)
    expect(screen.getByRole('group').getAttribute('aria-label')).toMatch(/Kapitel 1 von 4/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/narrative/__tests__/ChapterBar.test.tsx`
Expected: FAIL — cannot resolve `../ChapterBar`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/narrative/ChapterBar.tsx`:

```tsx
/**
 * ChapterBar — the one element that makes four pages read as one document.
 *
 * Identical component, identical position, on all four chapters. It carries
 * where you are in the story (four dots + the chapter's own question) and where
 * the season is (phase, week in block, countdown). Without it the chapters are
 * four apps that happen to share a nav bar.
 *
 * It states a countdown only when a real event is booked. With none, it says
 * "Trainingsblock" and shows the phase — never a fabricated race date.
 */
import { CHAPTERS, chapterIndex, phaseLabel, type ChapterId, type SeasonArc } from '../../utils/seasonArc'

export const CHAPTER_TITLES: Record<ChapterId, { en: string; de: string }> = {
  today:   { en: 'WHAT DO I DO TODAY', de: 'WAS MACHE ICH HEUTE' },
  plan:    { en: 'WHERE THIS IS GOING', de: 'WO DAS HINGEHT' },
  body:    { en: 'CAN I TAKE IT',       de: 'KANN ICH DAS TRAGEN' },
  history: { en: 'DID IT WORK',         de: 'HAT ES FUNKTIONIERT' },
}

export interface ChapterBarProps {
  chapter: ChapterId
  arc: SeasonArc
  de: boolean
}

export default function ChapterBar({ chapter, arc, de }: ChapterBarProps) {
  const idx = chapterIndex(chapter)
  const title = de ? CHAPTER_TITLES[chapter].de : CHAPTER_TITLES[chapter].en
  const phase = phaseLabel(arc.phaseKey, de)
  // The week fraction needs BOTH halves to be true. One half is a fabrication.
  const weekFrac = arc.weekInBlock != null && arc.blockWeeks != null
    ? `W${arc.weekInBlock}/${arc.blockWeeks}`
    : null
  const countdown = arc.daysToEvent != null ? `${arc.daysToEvent} ${de ? 'T' : 'D'}` : null
  const anchor = countdown ?? (de ? 'Trainingsblock' : 'Training block')

  const ariaLabel = [
    de ? `Kapitel ${idx + 1} von ${CHAPTERS.length}` : `Chapter ${idx + 1} of ${CHAPTERS.length}`,
    title.toLowerCase(),
    phase,
    weekFrac,
    countdown ? (de ? `${arc.daysToEvent} Tage bis zum Event` : `${arc.daysToEvent} days to the event`) : anchor,
  ].filter(Boolean).join(' · ')

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-col gap-1.5 rounded-2xl px-3.5 py-2.5"
      style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {CHAPTERS.map((c, i) => (
            <span
              key={c}
              data-chapter-dot={i === idx ? 'current' : 'other'}
              style={{
                width: i === idx ? 16 : 5,
                height: 5,
                borderRadius: 999,
                background: i === idx ? 'var(--color-accent)' : 'var(--color-rule)',
                transition: 'width 180ms ease',
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-muted)' }}>
            {phase}{weekFrac ? ` · ${weekFrac}` : ''}
          </span>
          <span
            className="num-mono"
            style={{ fontSize: 11, fontWeight: 800, color: countdown ? 'var(--color-accent)' : 'var(--color-muted)' }}
          >
            {anchor}
          </span>
        </div>
      </div>
      <span className="eyebrow" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: '#FFFFFF80' }}>
        {de ? `KAPITEL ${idx + 1}` : `CHAPTER ${idx + 1}`} — {title}
      </span>
    </div>
  )
}
```

Note on the last line: write a literal em-dash character `—` in the JSX, not the escape shown here.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/narrative/__tests__/ChapterBar.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/narrative/ChapterBar.tsx frontend/src/components/narrative/__tests__/ChapterBar.test.tsx
git commit -m "feat(narrative): ChapterBar, the spine tying four pages into one story

Four dots for position, phase plus week-in-block, and a countdown only
when a real event is booked — with no event it says Trainingsblock rather
than inventing a race date."
```

---

### Task 3: The rest of the narrative kit

Four presentational components with one job each. They are built together because none is useful alone and they share the tinted-role vocabulary lifted from `V4 · Ride Recap` (node `fSuFJ`).

**Files:**
- Create: `frontend/src/components/narrative/ChapterHero.tsx`
- Create: `frontend/src/components/narrative/MomentCard.tsx`
- Create: `frontend/src/components/narrative/CoachRead.tsx`
- Create: `frontend/src/components/narrative/NextChapter.tsx`
- Test: `frontend/src/components/narrative/__tests__/narrativeKit.test.tsx`

**Interfaces:**
- Consumes: `nextChapter`, type `ChapterId` from `../../utils/seasonArc`; `CHAPTER_TITLES` from `./ChapterBar`; `Link` from `react-router-dom`; `ChevronRight` from `lucide-react`.
- Produces:

```ts
// ChapterHero.tsx
export interface ChapterHeroProps {
  headline: string
  support?: string | null
  /** Ring, sparkline or other graphic; rendered above the headline. */
  figure?: React.ReactNode
  children?: React.ReactNode
}
export default function ChapterHero(props: ChapterHeroProps): JSX.Element

// MomentCard.tsx
export interface MomentCardProps {
  eyebrow: string
  headline: string
  support?: string | null
  to?: string
  children?: React.ReactNode
}
export default function MomentCard(props: MomentCardProps): JSX.Element

// CoachRead.tsx
export interface CoachReadProps {
  /** Localized "DEIN COACH" / "YOUR COACH" eyebrow. */
  eyebrow: string
  body: string
  to?: string
  children?: React.ReactNode
}
export default function CoachRead(props: CoachReadProps): JSX.Element

// NextChapter.tsx
export interface NextChapterProps {
  from: ChapterId
  de: boolean
}
export default function NextChapter(props: NextChapterProps): JSX.Element
```

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/narrative/__tests__/narrativeKit.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ChapterHero from '../ChapterHero'
import MomentCard from '../MomentCard'
import CoachRead from '../CoachRead'
import NextChapter from '../NextChapter'

afterEach(cleanup)

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('ChapterHero', () => {
  it('leads with the headline and keeps the support line secondary', () => {
    wrap(<ChapterHero headline="VO₂ steht an" support="Harte Intervalle — du bist frisch" />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('VO₂ steht an')
    expect(screen.getByText(/Harte Intervalle/)).toBeTruthy()
  })

  it('omits the support line entirely rather than leaving an empty slot', () => {
    const { container } = wrap(<ChapterHero headline="Ruhetag" support={null} />)
    expect(container.querySelectorAll('p')).toHaveLength(0)
  })

  it('renders a figure above the headline when given one', () => {
    wrap(<ChapterHero headline="72%" figure={<svg data-testid="ring" />} />)
    expect(screen.getByTestId('ring')).toBeTruthy()
  })
})

describe('MomentCard', () => {
  it('marks itself as the page moment so a second one is detectable', () => {
    const { container } = wrap(<MomentCard eyebrow="EINHEIT DES TAGES" headline="VO₂max kurz" />)
    expect(container.querySelectorAll('[data-moment]')).toHaveLength(1)
  })

  it('becomes a link when given a destination, and stays inert without one', () => {
    const { container: withTo } = wrap(<MomentCard eyebrow="E" headline="H" to="/workout/today" />)
    expect(withTo.querySelector('a')?.getAttribute('href')).toBe('/workout/today')
    const { container: without } = wrap(<MomentCard eyebrow="E" headline="H" />)
    expect(without.querySelector('a')).toBeNull()
  })
})

describe('CoachRead', () => {
  it('renders the coach prose under its eyebrow', () => {
    wrap(<CoachRead eyebrow="DEIN COACH" body="Du bist frisch — nutze es." />)
    expect(screen.getByText('DEIN COACH')).toBeTruthy()
    expect(screen.getByText('Du bist frisch — nutze es.')).toBeTruthy()
  })
})

describe('NextChapter', () => {
  it('points at the following chapter by name', () => {
    wrap(<NextChapter from="today" de />)
    const a = screen.getByRole('link')
    expect(a.getAttribute('href')).toBe('/dashboard?tab=plan')
    expect(a.textContent).toMatch(/WO DAS HINGEHT/i)
  })

  it('loops the last chapter back to the first', () => {
    wrap(<NextChapter from="history" de />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/dashboard?tab=today')
  })

  it('translates', () => {
    wrap(<NextChapter from="today" de={false} />)
    expect(screen.getByRole('link').textContent).toMatch(/WHERE THIS IS GOING/i)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/narrative/__tests__/narrativeKit.test.tsx`
Expected: FAIL — cannot resolve `../ChapterHero`.

- [ ] **Step 3: Write the four components**

`frontend/src/components/narrative/ChapterHero.tsx`:

```tsx
/**
 * ChapterHero — the one number or verdict a chapter is about, given room.
 *
 * Deliberately the only element above the fold that carries a headline, so
 * every chapter answers its own question before anything else competes.
 */
export interface ChapterHeroProps {
  headline: string
  support?: string | null
  figure?: React.ReactNode
  children?: React.ReactNode
}

export default function ChapterHero({ headline, support, figure, children }: ChapterHeroProps) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {figure}
      <h2 className="num-display" style={{ fontSize: 30, lineHeight: 1.1, color: 'var(--color-ink)' }}>{headline}</h2>
      {support ? <p style={{ fontSize: 14, color: 'var(--color-muted)' }}>{support}</p> : null}
      {children}
    </div>
  )
}
```

`frontend/src/components/narrative/MomentCard.tsx`:

```tsx
/**
 * MomentCard — the single most notable thing on this chapter right now.
 *
 * The amber ground and outer glow are lifted from Ride Recap's "Effort Moment"
 * (pen node Q4pCdz), whose whole job is to be the one block your eye lands on.
 * That only works if there is exactly ONE per page — `data-moment` makes a
 * second one detectable in tests rather than a thing reviewers must notice.
 */
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

export interface MomentCardProps {
  eyebrow: string
  headline: string
  support?: string | null
  to?: string
  children?: React.ReactNode
}

export default function MomentCard({ eyebrow, headline, support, to, children }: MomentCardProps) {
  const body = (
    <div
      data-moment
      className="flex flex-col gap-3 rounded-[24px] p-[18px]"
      style={{
        background: 'linear-gradient(315deg, #2A1F0E 0%, #1A1410 50%, #241019 100%)',
        border: '1px solid #FFD1664D',
        boxShadow: '0 12px 32px #00000073, 0 0 60px 2px #FFD16633',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: '#FFD166' }}>{eyebrow}</span>
        {to ? <ChevronRight size={16} style={{ color: '#FFD166' }} /> : null}
      </div>
      <div className="flex flex-col gap-1">
        <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>{headline}</span>
        {support ? <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>{support}</span> : null}
      </div>
      {children}
    </div>
  )
  return to ? <Link to={to} className="block">{body}</Link> : body
}
```

`frontend/src/components/narrative/CoachRead.tsx`:

```tsx
/**
 * CoachRead — what the chapter's numbers mean, in sentences.
 *
 * Purple is the app's established "this is the coach talking, not a
 * measurement" signal (pen Coach's Read, node qyeQT). Keeping it visually
 * distinct from evidence cards is what lets a reader skip interpretation and
 * go straight to data, or the reverse.
 */
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

export interface CoachReadProps {
  eyebrow: string
  body: string
  to?: string
  children?: React.ReactNode
}

export default function CoachRead({ eyebrow, body, to, children }: CoachReadProps) {
  const inner = (
    <div
      className="flex flex-col gap-2 rounded-[24px] p-4"
      style={{ background: '#8B5CF612', border: '1px solid #8B5CF63D' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: '#B79DFF' }}>{eyebrow}</span>
        {to ? <ChevronRight size={16} style={{ color: '#B79DFF' }} /> : null}
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--color-ink)' }}>{body}</p>
      {children}
    </div>
  )
  return to ? <Link to={to} className="block">{inner}</Link> : inner
}
```

`frontend/src/components/narrative/NextChapter.tsx`:

```tsx
/**
 * NextChapter — the handoff that closes the loop.
 *
 * Every chapter ends by naming the next one, and the last one points back at
 * the first. Four pages with a stated order and an explicit exit read as a
 * document; four pages that just stop read as a menu.
 */
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { nextChapter, type ChapterId } from '../../utils/seasonArc'
import { CHAPTER_TITLES } from './ChapterBar'

export interface NextChapterProps {
  from: ChapterId
  de: boolean
}

export default function NextChapter({ from, de }: NextChapterProps) {
  const to = nextChapter(from)
  const title = de ? CHAPTER_TITLES[to].de : CHAPTER_TITLES[to].en
  return (
    <Link
      to={`/dashboard?tab=${to}`}
      className="flex items-center justify-between gap-2 rounded-full px-4 py-3"
      style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-accent) 35%, transparent)' }}
    >
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--color-accent)' }}>
        {de ? 'WEITER' : 'NEXT'} — {title}
      </span>
      <ChevronRight size={16} style={{ color: 'var(--color-accent)' }} />
    </Link>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/narrative/`
Expected: PASS — 8 ChapterBar tests + 9 kit tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/narrative
git commit -m "feat(narrative): hero, moment, coach read and chapter handoff

The tinted-role vocabulary from V4 Ride Recap: amber for the one moment
that matters, purple for the coach's interpretation, coral for the exit.
MomentCard carries data-moment so a second one on a page is a test
failure rather than something a reviewer has to spot."
```

---

### Task 4: Nav — six tabs to four

**Files:**
- Modify: `frontend/src/components/dashboard/MobileBottomNav.tsx` (whole `TABS`/`TabId`/`resolveActive` block, lines 10–28, and the active-state derivation at 40–44)
- Modify: `frontend/src/pages/DashboardPage.tsx:29–80`
- Test: `frontend/src/components/dashboard/__tests__/MobileBottomNav.test.tsx` (create)

**Interfaces:**
- Consumes: `CHAPTERS`, type `ChapterId` from `../../utils/seasonArc`.
- Produces: nothing new for later tasks. `?tab=` values become exactly `today | plan | body | history`, with `recovery`, `analyze`, `progress`, `social`, `crew` still *accepted* as aliases so no existing link breaks.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/dashboard/__tests__/MobileBottomNav.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MobileBottomNav, { resolveActive } from '../MobileBottomNav'
import { LocaleProvider } from '../../../contexts/LocaleContext'

afterEach(cleanup)

const at = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <LocaleProvider><MobileBottomNav /></LocaleProvider>
  </MemoryRouter>,
)

describe('MobileBottomNav', () => {
  it('offers exactly the four chapters', () => {
    at('/dashboard?tab=today')
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })

  it('no longer offers a Social tab', () => {
    at('/dashboard?tab=today')
    expect(screen.queryByLabelText('Social')).toBeNull()
  })

  it('marks the current chapter and only that one', () => {
    at('/dashboard?tab=body')
    const current = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0].getAttribute('aria-label')).toMatch(/K.rper|Body/)
  })

  it('lights nothing on a route that is not a chapter', () => {
    at('/coach')
    expect(screen.getAllByRole('button').every((b) => !b.getAttribute('aria-current'))).toBe(true)
  })
})

describe('resolveActive — old links must not break', () => {
  it('maps the retired tab ids onto their new chapter', () => {
    expect(resolveActive('recovery')).toBe('body')
    expect(resolveActive('analyze')).toBe('history')
    expect(resolveActive('trends')).toBe('history')
    expect(resolveActive('progress')).toBe('history')
    expect(resolveActive('train')).toBe('plan')
    expect(resolveActive('workouts')).toBe('plan')
  })

  it('keeps crew links resolving to a real chapter instead of dropping them', () => {
    expect(resolveActive('social')).toBe('history')
    expect(resolveActive('crew')).toBe('history')
  })

  it('defaults to today for anything unknown', () => {
    expect(resolveActive(null)).toBe('today')
    expect(resolveActive('nonsense')).toBe('today')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/__tests__/MobileBottomNav.test.tsx`
Expected: FAIL — `resolveActive` is not exported, and six buttons render.

- [ ] **Step 3: Rewrite the tab table**

In `MobileBottomNav.tsx`, replace lines 10–28 with:

```tsx
// Four chapters of one season arc, not six topic buckets. Progress folded into
// History (both answer "did it work?"), and Social left the bar entirely —
// crew rides belong on the Plan calendar and kudos belong in History's
// evidence, so a peer tab was making the crew compete with the storyline for a
// nav slot. `?tab=social` still RESOLVES (see resolveActive) so no existing
// link 404s; it simply has no button of its own.
import { CHAPTERS, type ChapterId } from '../../utils/seasonArc'

const TABS: Array<{ id: ChapterId; en: string; de: string; icon: React.ReactNode }> = [
  { id: 'today',   en: 'Today',   de: 'Heute',   icon: <Zap size={20} strokeWidth={2} /> },
  { id: 'plan',    en: 'Plan',    de: 'Plan',    icon: <CalendarDays size={20} strokeWidth={2} /> },
  { id: 'body',    en: 'Body',    de: 'Körper',  icon: <Heart size={20} strokeWidth={2} /> },
  { id: 'history', en: 'History', de: 'Verlauf', icon: <TrendingUp size={20} strokeWidth={2} /> },
]

/** Old ?tab= values keep working. Retired ids map onto their new chapter
 *  rather than silently falling through to 'today', which would have sent
 *  every bookmarked /dashboard?tab=recovery link to the wrong page. */
export function resolveActive(raw: string | null): ChapterId {
  if (raw === 'plan' || raw === 'train' || raw === 'week' || raw === 'workouts') return 'plan'
  if (raw === 'body' || raw === 'recovery') return 'body'
  if (raw === 'history' || raw === 'analyze' || raw === 'trends' || raw === 'report' || raw === 'progress') return 'history'
  // Crew content now lives inside Plan and History; History is where kudos and
  // crew standing land, so that is the honest destination for a crew link.
  if (raw === 'social' || raw === 'crew') return 'history'
  return 'today'
}
```

Update the import on line 2 to `import { Zap, CalendarDays, Heart, TrendingUp } from 'lucide-react'` — `Footprints`, `BarChart3` and `Users` are now unused and must go or `tsc` will fail.

Replace the active-state derivation (lines 40–44) with:

```tsx
  // A tab lights up only on its own surface. /progress is no longer a tab of
  // its own — it is a detail page inside the History chapter, so it lights
  // History rather than a fifth slot.
  const active: ChapterId | null = location.pathname.startsWith('/progress')
    ? 'history'
    : location.pathname.startsWith('/dashboard')
      ? resolveActive(searchParams.get('tab'))
      : null
```

Delete the `route` handling in `handleTab` — no chapter navigates to a standalone page any more:

```tsx
  function handleTab(tab: { id: ChapterId }) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/dashboard')) {
      navigate(`/dashboard?tab=${tab.id}`)
    } else {
      setSearchParams({ tab: tab.id }, { replace: true })
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
```

Add an assertion so the bar can never drift from the arc — put it directly under `TABS`:

```tsx
// The bar and the chapter dots must agree, or the dots count one story and the
// buttons offer another.
if (TABS.length !== CHAPTERS.length) {
  throw new Error(`ChapterBar has ${CHAPTERS.length} chapters, nav has ${TABS.length} tabs`)
}
```

- [ ] **Step 4: Align `DashboardPage`'s own resolver**

`DashboardPage.tsx` has a second, independent `resolveTab` (lines 29–53). Two resolvers is exactly the drift the arc extraction is meant to end. Replace its `TabId` type and `resolveTab` function with the shared one:

```tsx
import { resolveActive } from '../components/dashboard/MobileBottomNav'
import type { ChapterId } from '../utils/seasonArc'
```

and change the render switch (lines 75–80) to:

```tsx
    switch (activeTab) {
      case 'today':   return <TodayTab />
      case 'plan':    return <PlanTab />
      case 'body':    return <RecoveryTab />
      case 'history': return <HistoryTab />
    }
```

with `const activeTab: ChapterId = resolveActive(searchParams.get('tab'))`.

**`SocialTab` now has no mount.** Keep the crew surface reachable: leave the `SocialTab` import in place and render it when the raw param is literally `social` or `crew`, before the chapter switch:

```tsx
  // Crew keeps a deep-linkable home until its content is woven into Plan and
  // History (phases 2 and 3). Until then a bookmarked /dashboard?tab=social
  // must still show the crew, not silently redirect to History.
  const rawTab = searchParams.get('tab')
  if (rawTab === 'social' || rawTab === 'crew') return <SocialTab />
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run`
Expected: PASS, full suite. Baseline before this plan was 573 passing; expect 573 + the new tests.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
cd frontend && npx tsc -b --noEmit && npx eslint src/components/dashboard/MobileBottomNav.tsx src/pages/DashboardPage.tsx src/components/narrative src/utils/seasonArc.ts
```

```bash
git add frontend/src/components/dashboard/MobileBottomNav.tsx frontend/src/pages/DashboardPage.tsx frontend/src/components/dashboard/__tests__/MobileBottomNav.test.tsx
git commit -m "refactor(nav): six tabs become four chapters

Progress folds into History (both answer 'did it work?'). Social leaves
the bar — crew rides belong on Plan's calendar and kudos in History's
evidence, so a peer tab had the crew competing with the storyline for a
nav slot. Every retired ?tab= value still resolves to a real chapter, and
?tab=social still renders the crew surface, so no bookmark breaks.

DashboardPage's private second resolver is gone; both now share one."
```

---

### Task 5: Mount the bar on all four chapters

No card moves in this task. The bar goes in, identically positioned, and the four pages become visibly one document.

**Files:**
- Modify: `frontend/src/components/dashboard/tabs/TodayTab.tsx`
- Modify: `frontend/src/components/dashboard/tabs/PlanTab.tsx` (and delete its private arc math at 320–400)
- Modify: `frontend/src/components/dashboard/tabs/RecoveryTab.tsx`
- Modify: `frontend/src/components/dashboard/tabs/HistoryTab.tsx`

**Interfaces:**
- Consumes: `ChapterBar` from `../../narrative/ChapterBar`; `seasonArc` from `../../../utils/seasonArc`; the week payload's `meso_block` (`week?.meso_block`, type `MesoBlockContext`) and the athlete profile's `target_event_date`.

- [ ] **Step 1: Mount it on `TodayTab`**

None of TodayTab, RecoveryTab or HistoryTab currently holds the week payload.
Add the same hook `PlanTab` and `SeasonView` already use:

```tsx
import { useCurrentWeek } from '../../../hooks/useCurrentWeek'
// …
const { data: week } = useCurrentWeek()
```

This is **not** a second network fetch — `useCurrentWeek` is a React Query hook
and the four chapters share one cached result. Call it with no arguments, as
`SeasonView.tsx:105` does. (`PlanTab` passes a `weekOffset` because it has a
week pager; the chapter bar always describes the current week.)

`ChapterBar` is the first child of the tab's root fragment, above the greeting.
Build the arc from data the tab now has:

```tsx
const arc = useMemo(() => seasonArc({
  targetEventDate: profile?.target_event_date ?? null,
  goalEventDate: typeof athlete?.goal_event_date === 'string' ? athlete.goal_event_date : null,
  meso: week?.meso_block ?? null,
}), [profile?.target_event_date, athlete?.goal_event_date, week?.meso_block])
```

then, as the first rendered element:

```tsx
<ChapterBar chapter="today" arc={arc} de={de} />
```

`athlete` is TodayTab's existing `evidence.athlete` record (declared around line
281) — **not** `athleteEv`, which is PlanTab's name for the same thing. In
PlanTab use `athleteEv.goal_event_date`; in the other three tabs derive the
record the way that file already does, and pass `goalEventDate: null` if the
file has no evidence record at all. Never invent a new fetch for it.

- [ ] **Step 2: Verify it renders before touching the other three**

Dev servers: backend on `:8042`, frontend on `:5180` (the backend's `CORS_ORIGINS` allowlists only 5173 and 5180 — any other port fails CORS). DB on `:5433`, `alembic upgrade head` applied.

Render `/dashboard?tab=today` at 390×844 and confirm the bar shows phase, week fraction and countdown with real values. Screenshot it.

- [ ] **Step 3: Mount it on the other three**

Same position — first child, above each page's existing header:

```tsx
<ChapterBar chapter="plan" arc={arc} de={de} />     // PlanTab
<ChapterBar chapter="body" arc={arc} de={de} />     // RecoveryTab
<ChapterBar chapter="history" arc={arc} de={de} />  // HistoryTab
```

- [ ] **Step 4: Rewire PlanTab's remaining arc math onto the shared module**

Task 1 already moved `PHASE_WORDS` and `phaseLabel`. What is left in
`PlanTab.tsx` (lines ~326–395) is the rest of the private arc, now duplicated by
`seasonArc()`. Replace each use with the `arc` fields and delete the local
computations:

| old | new |
|---|---|
| `daysToEventResolved` | `arc.daysToEvent` |
| `weeksLeft` | `arc.weeksToEvent` |
| `weekOfMeso` | `arc.weekInBlock` |
| `blockHorizon` | `arc.blockWeeks` |

`goalDaysOut` and the local `daysToEvent(...)` call go with them — `seasonArc`
makes that call internally, with the same precedence.

Keep `blockBadge` and `blockPct`. They are presentation, not arc math, but they
must now read the `arc` fields. Note that `blockPct` falls back to `planPct`
when the block figures are absent; preserve that fallback exactly.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd frontend && npx tsc -b --noEmit && npx vitest run`
Expected: PASS. If a PlanTab test asserts a phase string, it should still pass — `phaseLabel` was moved verbatim. A failure here means the extraction changed behaviour and must be fixed, not the test.

- [ ] **Step 6: Render all four chapters and measure**

At 390×844, for each of `?tab=today`, `?tab=plan`, `?tab=body`, `?tab=history`:
1. Screenshot.
2. Assert the bar's `getBoundingClientRect().top` is **the same value on all four** — the spine only works if it does not move between chapters.
3. Confirm the dot marked `current` advances 1 → 2 → 3 → 4.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/dashboard/tabs
git commit -m "feat(narrative): the chapter bar on all four chapters

Same component, same offset, every page — the four dots advance and the
phase/week/countdown line is identical, which is what makes four pages
read as one document. PlanTab's private copy of the arc maths is deleted
in favour of the shared module, so the bar and the plan card can no
longer disagree about what week it is."
```

---

### Task 6: Crew entry point in the header

Social lost its tab in Task 4. This restores one-tap reach without a nav slot, and is the mitigation named in the spec's risk section.

**Files:**
- Modify: `frontend/src/components/dashboard/DashboardHeaderBar.tsx`
- Test: `frontend/src/components/dashboard/__tests__/DashboardHeaderBar.test.tsx` (create, or extend if present)

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashboardHeaderBar from '../DashboardHeaderBar'
import { LocaleProvider } from '../../../contexts/LocaleContext'

afterEach(cleanup)

describe('DashboardHeaderBar crew entry', () => {
  it('offers a labelled crew entry now that Social has no tab', () => {
    render(
      <MemoryRouter><LocaleProvider><DashboardHeaderBar /></LocaleProvider></MemoryRouter>,
    )
    const crew = screen.getByLabelText(/Crew/i)
    expect(crew.getAttribute('href')).toBe('/dashboard?tab=social')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run src/components/dashboard/__tests__/DashboardHeaderBar.test.tsx`
Expected: FAIL — no element labelled Crew.

- [ ] **Step 3: Add the entry**

Next to the existing profile chip in `DashboardHeaderBar.tsx`:

```tsx
{/* Crew entry — Social left the bottom bar when the nav became four
    chapters. The crew stack is not going anywhere, so it keeps a
    one-tap home here until its content is woven into Plan's calendar
    and History's evidence (phases 2 and 3). */}
<Link
  to="/dashboard?tab=social"
  aria-label={de ? 'Crew' : 'Crew'}
  className="grid place-items-center rounded-full"
  style={{ width: 36, height: 36, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}
>
  <Users size={17} strokeWidth={2} style={{ color: 'var(--color-muted)' }} />
</Link>
```

Import `Users` from `lucide-react` and `Link` from `react-router-dom` if not already imported.

- [ ] **Step 4: Run the test**

Run: `cd frontend && npx vitest run src/components/dashboard/__tests__/DashboardHeaderBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/DashboardHeaderBar.tsx frontend/src/components/dashboard/__tests__/DashboardHeaderBar.test.tsx
git commit -m "feat(nav): crew keeps a one-tap home in the header

Mitigation for the discoverability cost of taking Social out of the
bottom bar."
```

---

### Task 7: Ship it

- [ ] **Step 1: Full gates**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npx eslint src/components/narrative src/utils/seasonArc.ts src/components/dashboard/MobileBottomNav.tsx src/pages/DashboardPage.tsx
```

Compare the eslint output against `git stash && npx eslint <same paths> && git stash pop` so pre-existing findings are not attributed to this work.

- [ ] **Step 2: Render every chapter one final time**

390×844, all four chapters, screenshot each. Check specifically:
- The bar sits at an identical offset on all four.
- No chapter shows a week fraction with only one half of it known.
- With no event booked (test by clearing the profile target date locally), the bar reads `Trainingsblock` and shows no countdown.

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Deploy and verify by bytes, not by status**

```bash
cd /Users/jannisdeters/Downloads/ai-cycling-coach && railway up --detach
```

Poll `railway deployment list --json` until `SUCCESS`. Then byte-compare every built asset against what production actually serves — a green deploy status is not evidence the new bundle is live. Railway is CLI-only for this project; `git push` deploys nothing.

```bash
URL="https://ai-cycling-coach-api-production.up.railway.app"
for f in frontend/dist/assets/*.js frontend/dist/assets/*.css; do
  n=$(basename "$f")
  curl -s "$URL/assets/$n" -o /tmp/s.bin
  cmp -s /tmp/s.bin "$f" || echo "MISMATCH: $n"
done
curl -s -D - -o /dev/null "$URL/" | grep -i cache-control   # must be no-cache
```

- [ ] **Step 5: Push**

```bash
git push origin main
```

---

## Self-Review

**Spec coverage.** Decision 1 (six tabs → four) — Task 4. Decision 2 (season-arc storyline) — Task 1. Decision 3 (persistent bar on all four) — Tasks 2 and 5. Decision 4 (Social woven in, not a tab) — Task 4 removes the tab, Task 6 keeps the crew reachable; the *inline weaving* into Plan's calendar and History's evidence is explicitly phase 2/3, stated in Task 6's comment. The narrative kit — Tasks 2 and 3. The no-event fallback — Task 1, tested. Phase 1's scope in the spec named "redirects from retired tab ids"; delivered as alias resolution in `resolveActive` rather than HTTP redirects, since tabs are a query param and not routes.

**Not covered by this plan, by design:** the de-duplication table, chapter interiors, and folding `/progress/bike` into History's tail are all phases 2 and 3. Task 5 mounts the bar without moving a single card, so this phase is shippable on its own.

**One spec correction made while planning.** The spec said the no-event fallback should be "a rolling six-week block derived from training history." That would have been new client-side invention. The backend already publishes `progression.horizon_weeks` for exactly this case (`api/weeks.ts`: "No-event fitness-builder horizon — replaces the '— weeks left' dash"), so Task 1 uses it and `blockWeeks` is nullable when it is absent. This is strictly more honest and less code.

**Type consistency.** `ChapterId` is defined once in `seasonArc.ts` and imported everywhere; `MobileBottomNav` and `DashboardPage` no longer define private tab unions. `CHAPTER_TITLES` is exported from `ChapterBar.tsx` and consumed by `NextChapter.tsx`. `resolveActive` is exported from `MobileBottomNav.tsx` and consumed by both its test and `DashboardPage`. The four chapter ids `today | plan | body | history` are used identically in `CHAPTERS`, `TABS`, the `DashboardPage` switch, and every `?tab=` string.
