// frontend/src/editorial/__tests__/bentoGrid.test.tsx
import { cleanup, render, screen } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import BentoGrid, { rankTiles, type BentoEntry } from '../components/BentoGrid'
import { present } from '../data/value'

afterEach(cleanup)

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

  // ---- Decisions this task made beyond the brief's own snippet -------------

  it('accents the first entry (and only that one) when entries is empty-safe: a single entry always wins both', () => {
    const one = [entry('hrv', 'HRV')]
    const ranked = rankTiles(one, null)
    expect(ranked).toHaveLength(1)
    expect(ranked[0].accent).toBe(true)
    expect(ranked[0].tall).toBe(true)
  })

  it('returns an empty array for an empty entries list, without accenting anything', () => {
    expect(rankTiles([], 'Schlaf war kurz.')).toEqual([])
  })

  // A reason naming MORE than one metric must resolve deterministically.
  // Rule (see BentoGrid.tsx doc comment): the metric mentioned EARLIEST in
  // the reason string wins — not simply "whichever entry comes first in the
  // `entries` array" — because the coach's own sentence order is the actual
  // signal ("Schlaf war kurz, deshalb HRV im Blick behalten" leads with
  // sleep even though HRV happens to sit first in the entries array).
  it('when the reason names two metrics, the one mentioned EARLIEST in the text wins — not array order', () => {
    // 'HRV' appears before 'Schlaf' in the string -> HRV wins.
    expect(rankTiles(entries, 'HRV oben, Schlaf kurz.')[0].label).toBe('HRV')
    // Same two metrics, reversed order in the string -> Schlaf wins, even
    // though HRV is still entries[0]. Proves this isn't secretly array-order.
    expect(rankTiles(entries, 'Schlaf kurz, HRV oben.')[0].label).toBe('Schlaf')
  })

  it('matching is case-insensitive against both key and label', () => {
    expect(rankTiles(entries, 'ruhepuls war niedrig.')[0].label).toBe('Ruhepuls')
    expect(rankTiles(entries, 'HRV WAR HOCH.')[0].label).toBe('HRV')
  })

  // German compounds a metric name into a longer word constantly
  // ("Schlafqualität", "Schlafmangel") — a strict \b-word-boundary match
  // would silently MISS these real matches, which is worse than the small
  // risk of an unrelated word accidentally containing one of this app's
  // four short metric names (hrv/sleep/rhr/bodyBattery — none of which are
  // common German syllables). Substring matching is therefore the correct
  // choice here, not an oversight; this test locks that choice in.
  it('matches inside a German compound word (substring, not word-boundary)', () => {
    expect(rankTiles(entries, 'Deine Schlafqualität war niedrig.')[0].label).toBe('Schlaf')
  })

  it('does not mutate the caller-supplied entries array', () => {
    const copy = [...entries]
    rankTiles(entries, 'Schlaf war kurz.')
    expect(entries).toEqual(copy)
    expect(entries[0].label).toBe('HRV')
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

  it('renders nothing for an empty entries array', () => {
    const { container } = render(<BentoGrid entries={[]} reason={null} />)
    expect(container.firstChild).toBeNull()
  })
})
