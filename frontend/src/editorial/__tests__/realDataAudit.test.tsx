import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { headlineFit } from '../components/numeralFit'
import { missing, present } from '../data/value'
import type { TodayModel } from '../data/useTodayModel'
import TodayView, { type DayStateControl } from '../pages/TodayView'

afterEach(cleanup)

// Real-data audit (2026-08-06): every fixture below reproduces a defect
// that only showed up running the real app against the real database — the
// account's own wearable hadn't synced since Monday, and today's real
// prescribed session is "MAP — 5×3min @ 110% FTP" with 11 total blocks (a
// warm-up, five 3-minute MAP intervals, four recoveries between them, and a
// cool-down), of which only the five MAP blocks are real WORK intervals.
// See `.superpowers/sdd/2026-08-05-editorial-ii-design-system/
// task-realdata-report.md` for the full record.

const REAL_SESSION_BLOCKS = [
  { label: 'Warm-up', minutes: 15, watts: 145 },
  { label: 'MAP 1', minutes: 3, watts: 277 },
  { label: 'Recovery', minutes: 3, watts: 132 },
  { label: 'MAP 2', minutes: 3, watts: 277 },
  { label: 'Recovery', minutes: 3, watts: 132 },
  { label: 'MAP 3', minutes: 3, watts: 277 },
  { label: 'Recovery', minutes: 3, watts: 132 },
  { label: 'MAP 4', minutes: 3, watts: 277 },
  { label: 'Recovery', minutes: 3, watts: 132 },
  { label: 'MAP 5', minutes: 3, watts: 277 },
  { label: 'Cool-down', minutes: 10, watts: 132 },
]

const baseModel: TodayModel = {
  state: 'training',
  dateLabel: present('DO 06 AUG'),
  streakDays: present(0),
  readiness: missing('Letzte Messung 3. August. Der Trainingsplan gilt trotzdem.'),
  readinessGate: 'stale',
  readinessGateHeadline: 'Seit 3 Tagen keine Nacht-Werte',
  readiness90DayBest: missing('Noch keine 90-Tage-Historie erfasst.'),
  bodyBattery90DayHigh: missing('Noch keine 90-Tage-Historie erfasst.'),
  hrv: missing('Keine Messung seit Montag.'),
  restingHr: missing('Keine Messung seit Montag.'),
  recentRestingHr: missing('Keine Messung seit Montag.'),
  sleep: missing('Keine Messung seit Montag.'),
  pmc: present({ fitness: 30, fatigue: 17, form: 13, series: [] }),
  recovery: present({ hoursRemaining: 0, clearAtLabel: 'Do 09:00' }),
  bodyBattery: missing('Keine Messung seit Montag.'),
  session: present({
    title: 'MAP — 5×3min @ 110% FTP',
    targetWatts: null,
    workKj: null,
    intensityFactor: 0.74,
    tss: 47,
    blocks: REAL_SESSION_BLOCKS,
  }),
  ride: missing('Heute noch keine Fahrt erfasst.'),
  zones: missing('Heute noch keine Fahrt erfasst.'),
  peaks: missing('Heute noch keine Fahrt erfasst.'),
  planVsRidden: missing('Diese Fahrt konnte nicht mit dem Plan abgeglichen werden.'),
  verdict: present({ headline: 'VO2 heute — du bist frisch', body: 'Dein HRV liegt -1 % …' }),
  whatThisChanges: missing('Der Coach hat sich zu dieser Fahrt noch nicht geäußert.'),
  conditions: present({ tempC: 25, windKmh: 11, windFrom: null }),
  tomorrow: missing('Für morgen ist noch nichts geplant.'),
  week: [
    { letter: 'MO', tss: present(64) }, { letter: 'DI', tss: present(48) }, { letter: 'MI', tss: present(12) },
    { letter: 'DO', tss: missing('Keine Fahrt erfasst.') }, { letter: 'FR', tss: present(24) },
    { letter: 'SA', tss: present(68) }, { letter: 'SO', tss: present(44) },
  ],
  energyOut: missing('Kein stündlicher Energieverbrauch für heute verfügbar.'),
  missedYesterday: missing('Keine ausgelassene Einheit.'),
  weekLoad: present({ spent: 256, planned: 340 }),
  isLoading: false,
} as TodayModel

describe('Withheld readiness hero (utils/readinessGate.ts)', () => {
  it('stale: renders a dated headline and the fuller reason, never a numeral-sized dash', () => {
    const { container } = render(<MemoryRouter><TodayView model={baseModel} /></MemoryRouter>)
    expect(screen.getByText('Seit 3 Tagen keine Nacht-Werte')).toBeTruthy()
    expect(screen.getByText('Letzte Messung 3. August. Der Trainingsplan gilt trotzdem.')).toBeTruthy()
    const track = container.querySelector('[data-metric-track]')
    expect(track).not.toBeNull()
    const dash = Array.from(track!.querySelectorAll('span')).find((el) => el.textContent === '—')
    expect(dash).toBeUndefined()
  })

  it('stale: offers a sync action when the page control supplies one', () => {
    const control: DayStateControl = {
      onSwapDayType: () => {}, openSheet: null, onPickDayType: () => {}, onConfirmSessionDone: () => {},
      onCloseSheet: () => {}, derived: 'training', isPreviewing: false, onPreview: () => {},
      readinessSync: { onSync: () => {}, pending: false, done: false },
    }
    render(<MemoryRouter><TodayView model={baseModel} control={control} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Jetzt synchronisieren' })).toBeTruthy()
  })

  it('pending: renders the calm headline and offers NO action, even with a sync control available', () => {
    const pendingModel: TodayModel = {
      ...baseModel,
      readiness: missing('Deine Bereitschaft erscheint, sobald die Uhr die Nacht hochgeladen hat. Der Plan unten steht schon.'),
      readinessGate: 'pending',
      readinessGateHeadline: 'Nacht-Werte stehen noch aus',
    }
    const control: DayStateControl = {
      onSwapDayType: () => {}, openSheet: null, onPickDayType: () => {}, onConfirmSessionDone: () => {},
      onCloseSheet: () => {}, derived: 'training', isPreviewing: false, onPreview: () => {},
      readinessSync: { onSync: () => {}, pending: false, done: false },
    }
    render(<MemoryRouter><TodayView model={pendingModel} control={control} /></MemoryRouter>)
    expect(screen.getByText('Nacht-Werte stehen noch aus')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Jetzt synchronisieren' })).toBeNull()
  })

  it('Evening: the bedtime numeral (always missing — no source exists) gets the same composed treatment, no oversized dash', () => {
    const eveningModel: TodayModel = { ...baseModel, state: 'evening' }
    const { container } = render(<MemoryRouter><TodayView model={eveningModel} /></MemoryRouter>)
    expect(screen.getByText('Kein Zubettgeh-Ziel')).toBeTruthy()
    // scoped to the Cover/hero — small dashes elsewhere on the page (e.g. a
    // StatTile for an unrelated missing value) are fine and expected; only
    // the HERO numeral slot is this defect
    const cover = container.querySelector('[data-cover]')
    const dashes = Array.from(cover!.querySelectorAll('span')).filter((el) => el.textContent === '—')
    expect(dashes).toHaveLength(0)
  })
})

describe('Session title resilience (pages/TodayView.tsx headlineFit)', () => {
  it('shrinks a long real session title enough to fit the 342px content column on one line', () => {
    const long = headlineFit('MAP — 5×3min @ 110% FTP')
    expect(long.fontSize).toBeLessThan(42)
    expect(long.fontSize).toBeGreaterThanOrEqual(26)
  })

  it('keeps the full 42px size for a short title that already fits', () => {
    expect(headlineFit('Threshold')).toEqual({ fontSize: 42, letterSpacing: -2 })
  })

  it('never shrinks below the legibility floor', () => {
    const veryLong = headlineFit('A Genuinely Enormous Session Title That Would Never Actually Fit On One Line No Matter The Size')
    expect(veryLong.fontSize).toBeGreaterThanOrEqual(26)
  })

  it('the rendered hero headline uses a smaller font for the real long title than the short pen example', () => {
    // Trained is the state whose headline IS the session name — Training's
    // hero now carries the coach's statement instead (owner ruling: repeating
    // the session there duplicated section 02 and the Day Rail).
    const trainedModel: TodayModel = { ...baseModel, state: 'trained' }
    const { container } = render(<MemoryRouter><TodayView model={trainedModel} /></MemoryRouter>)
    const cover = container.querySelector('[data-cover]')
    const headline = Array.from(cover!.querySelectorAll('span')).find((el) => el.textContent === 'MAP — 5×3min @ 110% FTP')
    expect(headline).toBeTruthy()
    expect(parseFloat(headline!.style.fontSize)).toBeLessThan(42)
  })

  it('Training\'s hero carries the coach statement, not a second copy of the session name', () => {
    const { container } = render(<MemoryRouter><TodayView model={baseModel} /></MemoryRouter>)
    const cover = container.querySelector('[data-cover]')!
    const spans = Array.from(cover.querySelectorAll('span')).map((el) => el.textContent)
    expect(spans).toContain('VO2 heute — du bist frisch')
    expect(spans).not.toContain('MAP — 5×3min @ 110% FTP')
  })
})

describe('Block-count agreement (Insight Strip vs the numbered section chip)', () => {
  it('Training: the Insight Strip reports the real 5 work intervals, and the section chip no longer contradicts it with a raw block count', () => {
    render(<MemoryRouter><TodayView model={baseModel} /></MemoryRouter>)
    // real, work-interval count (5 MAP blocks) — reused from the same
    // workIntervalsOf() the section's own Statement already computes
    expect(screen.getByText('5 BLÖCKE')).toBeTruthy()
    // the old chip invented "11 BLÖCKE" (every block, including warm-up/
    // recovery/cool-down) for a pen slot that is actually a start-time chip
    // with no data source — must never render again
    expect(screen.queryByText('11 BLÖCKE')).toBeNull()
    expect(screen.queryAllByText(/^\d+ BLÖCKE$/).length).toBe(1)
  })

  it('Trained: the section chip is a work-shape summary (interval count × duration), matching what "5" means elsewhere on this build', () => {
    const trainedModel: TodayModel = { ...baseModel, state: 'trained' }
    render(<MemoryRouter><TodayView model={trainedModel} /></MemoryRouter>)
    expect(screen.getByText('5 × 3 MIN')).toBeTruthy()
    expect(screen.queryByText('11 BLÖCKE')).toBeNull()
  })
})

describe('Session Detail is reachable (dead-affordance audit 2026-08-06)', () => {
  it('Training: the band that shows TODAY\'s session is a real link to Session Detail', () => {
    const { container } = render(<MemoryRouter><TodayView model={baseModel} /></MemoryRouter>)
    const band = container.querySelector('[data-tomorrow-band]')!
    expect(band.tagName).toBe('A')
    expect(band.getAttribute('href')).toBe('/e/session')
  })

  it('Rest: the band shows TOMORROW\'s session, so it neither links nor shows an arrow', () => {
    const restModel: TodayModel = {
      ...baseModel,
      state: 'rest',
      tomorrow: present({ title: 'VO2 max · 5 × 4 @ 330 W', detail: '', unlockLabel: present('05:00') }),
    } as TodayModel
    const { container } = render(<MemoryRouter><TodayView model={restModel} /></MemoryRouter>)
    const band = container.querySelector('[data-tomorrow-band]')!
    // Session Detail renders TODAY's workout and takes no id — pointing a
    // "MORGEN" band at it would open the wrong day.
    expect(band.tagName).not.toBe('A')
    expect(band.querySelector('svg')).toBeNull()
  })
})
