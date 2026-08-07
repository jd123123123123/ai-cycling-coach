// frontend/src/editorial/__tests__/bentoReplacesRecovery.test.tsx
//
// OWNER RULING 2026-08-07 (Change 1) — rendering the finished Today screen
// showed the bento (`BentoGrid`, mounted directly under `CassetteHero`) and
// "01 RECOVERY" (Rest/Training) — or Resting's own "01 RIGHT NOW", the exact
// same three signals as `LiveRing`s instead of `RangeRow`s — printing the
// SAME three metrics (HRV/RESTING HR/SLEEP) twice, ~400px apart, with no new
// information. Both duplicate sections are deleted; their one real,
// non-duplicated content — the per-metric delta and range-position — moves
// onto the bento tiles' own `note`, and the sleep-composition strip (which
// the bento does NOT show) moves to sit directly under the bento instead.
// See TodayView.tsx's own top-of-file doc comment for the full record.
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import TodayView from '../pages/TodayView'
import { makeTodayModel } from './helpers/makeTodayModel'
import { present } from '../data/value'
import type { DayState } from '../state/dayState'
import type { TodayModel } from '../data/useTodayModel'

afterEach(cleanup)

const STATES: DayState[] = ['rest', 'training', 'trained', 'resting', 'evening']

/**
 * Counts how many times `label` (an exact metric name — "HRV"/"RUHEPULS"/
 * "SCHLAF") is printed by one of the THREE widgets that have ever shown a
 * recovery-metric name as its own headline label on this screen: a bento
 * tile, a `RangeRow` (the deleted "01 Recovery"), or a `LiveRing` (the
 * deleted "01 Right Now"). Scoped deliberately to these three — NOT a bare
 * page-wide text count — because two OTHER, unrelated widgets further down
 * the page happen to reuse the bare word "SCHLAF"/"RUHEPULS" for a
 * different concept entirely (Evening's "Tonight" tile is a permanently-
 * missing SLEEP TARGET for tonight, not a repeat of last night's reading;
 * Evening's "Moved Key" trio's own Resting HR row is a distinct always-on
 * 7-day trend feature, not a second "01 Recovery"). Neither is a value
 * duplicate of the bento in the sense Change 1 is about, and fixing them is
 * outside this task's scope — see task-10-report.md.
 */
function metricMentions(container: HTMLElement, label: string): number {
  return within(container).getAllByText(label, { exact: true })
    .filter((el) => el.closest('[data-testid="bento-tile"], [data-range-row], [data-live-ring]') != null)
    .length
}

describe('Change 1: the bento replaces 01 Recovery / 01 Right Now', () => {
  it.each(STATES)('HRV, RUHEPULS and SCHLAF each print at most once on the %s screen', (state) => {
    const { container } = render(<MemoryRouter><TodayView model={makeTodayModel({ state })} /></MemoryRouter>)
    expect(metricMentions(container, 'HRV')).toBeLessThanOrEqual(1)
    expect(metricMentions(container, 'RUHEPULS')).toBeLessThanOrEqual(1)
    expect(metricMentions(container, 'SCHLAF')).toBeLessThanOrEqual(1)
  })

  it.each(STATES)('every metric tile widget on the %s screen still shows HRV, RUHEPULS and SCHLAF at least once', (state) => {
    // The dedup above must not have deleted the READING itself — the bento
    // tile is always there; this is the "never zero" half of "at most one."
    const { container } = render(<MemoryRouter><TodayView model={makeTodayModel({ state })} /></MemoryRouter>)
    expect(metricMentions(container, 'HRV')).toBe(1)
    expect(metricMentions(container, 'RUHEPULS')).toBe(1)
    expect(metricMentions(container, 'SCHLAF')).toBe(1)
  })

  it.each(STATES)('no RangeRow or LiveRing renders anywhere on the %s screen', (state) => {
    // The two components that used to produce the duplicate are gone from
    // every Today state's own render tree — not merely relabelled.
    const { container } = render(<MemoryRouter><TodayView model={makeTodayModel({ state })} /></MemoryRouter>)
    expect(container.querySelectorAll('[data-range-row]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-live-ring]')).toHaveLength(0)
  })

  it.each(STATES)('sections number contiguously from 01, with no gap and no duplicate, on the %s screen', (state) => {
    const { container } = render(<MemoryRouter><TodayView model={makeTodayModel({ state })} /></MemoryRouter>)
    const sections = Array.from(container.querySelectorAll('[data-section]'))
      .map((el) => el.getAttribute('data-section'))
    // No duplicates.
    expect(new Set(sections).size).toBe(sections.length)
    // Contiguous from "01" — every state has at least one numbered section.
    expect(sections.length).toBeGreaterThan(0)
    const expected = sections.map((_, i) => String(i + 1).padStart(2, '0'))
    expect(sections).toEqual(expected)
  })

  it('Rest and Training end up with exactly two sections (Absorption/The Session, then Trajectory)', () => {
    for (const state of ['rest', 'training'] as const) {
      const { container } = render(<MemoryRouter><TodayView model={makeTodayModel({ state })} /></MemoryRouter>)
      expect(container.querySelectorAll('[data-section]')).toHaveLength(2)
      cleanup()
    }
  })

  it('Resting ends up with exactly one section (Trajectory only)', () => {
    const { container } = render(<MemoryRouter><TodayView model={makeTodayModel({ state: 'resting' })} /></MemoryRouter>)
    expect(container.querySelectorAll('[data-section]')).toHaveLength(1)
    expect(container.querySelector('[data-section="01"]')?.querySelector('h2')?.textContent).toBe('VERLAUF')
  })

  it.each(['rest', 'training'] as const)('the sleep-composition strip still renders on the %s screen', (state) => {
    const { container } = render(<MemoryRouter><TodayView model={makeTodayModel({ state })} /></MemoryRouter>)
    // The heading combines with its own " · H:MM GESAMT" suffix inside one
    // element, so this checks substring containment rather than exact text.
    expect(screen.getByText((text) => text.startsWith('SCHLAFPHASEN'))).toBeTruthy()
    expect(screen.getByText('TIEF')).toBeTruthy()
    expect(screen.getByText('REM')).toBeTruthy()
    expect(screen.getByText('LEICHT')).toBeTruthy()
    expect(screen.getByText('WACH')).toBeTruthy()
    // Still one continuous region, not orphaned inside a deleted section.
    expect(container.querySelector('[data-hero-body]')?.textContent).toContain('SCHLAFPHASEN')
  })

  it.each(['rest', 'training'] as const)('the HRV tile carries the migrated delta and range note on the %s screen', (state) => {
    render(<MemoryRouter><TodayView model={makeTodayModel({ state })} /></MemoryRouter>)
    // makeTodayModel's fixture: hrv delta +4, band position 'above'.
    expect(screen.getByText('+4 · ÜBER BEREICH')).toBeTruthy()
    // restingHr delta -2, band position 'in'.
    expect(screen.getByText('−2 · IM BEREICH')).toBeTruthy()
  })
})

describe('Change 2: the tall tile earns its height', () => {
  it('when the coach reasons about Ruhepuls, the tall tile is Resting HR and draws its real 7-day series', () => {
    const model: TodayModel = {
      ...makeTodayModel({ state: 'rest' }),
      verdict: present({ headline: 'Ruhig.', body: 'Ruhepuls war niedrig heute — gutes Zeichen.' }),
    }
    render(<MemoryRouter><TodayView model={model} /></MemoryRouter>)
    const tiles = screen.getAllByTestId('bento-tile')
    const tall = tiles.find((t) => t.getAttribute('data-accent') === 'true')
    expect(tall).toBeTruthy()
    expect(tall!.textContent).toContain('RUHEPULS')
    const points = tall!.querySelectorAll('[data-testid="bento-chart-point"]')
    expect(points.length).toBeGreaterThan(2)
    // The other band-chart tiles (HRV, SCHLAF) stay single-height and keep
    // their one-point band — Body Battery is excluded here, since it draws
    // a 2-point wake→now spark regardless of tall state (a real, honest
    // reading, unaffected by this change).
    const others = tiles.filter((t) => (
      t.getAttribute('data-accent') !== 'true'
      && (t.textContent?.includes('HRV') || t.textContent?.includes('SCHLAF'))
    ))
    expect(others.length).toBeGreaterThan(0)
    for (const other of others) {
      const otherPoints = other.querySelectorAll('[data-testid="bento-chart-point"]')
      expect(otherPoints.length).toBeLessThanOrEqual(1)
    }
  })

  it('when the tall tile has no real series (HRV, the default lead), it falls back to its band honestly', () => {
    // makeTodayModel's default verdict body names nothing HRV/Sleep/RHR-
    // specific, so BentoGrid's own "names nothing" rule promotes the first
    // entry — HRV, which has no `tallChart` anywhere on TodayModel.
    render(<MemoryRouter><TodayView model={makeTodayModel({ state: 'rest' })} /></MemoryRouter>)
    const tiles = screen.getAllByTestId('bento-tile')
    const tall = tiles.find((t) => t.getAttribute('data-accent') === 'true')
    expect(tall).toBeTruthy()
    expect(tall!.textContent).toContain('HRV')
    const points = tall!.querySelectorAll('[data-testid="bento-chart-point"]')
    // The band's own single dot — never a fabricated multi-point line.
    expect(points).toHaveLength(1)
  })
})
