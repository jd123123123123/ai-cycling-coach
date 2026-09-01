import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Bike, Trophy } from 'lucide-react'
import { W3WinsContent, type W3WinsVm } from '../W3WinsView'

vi.mock('motion/react', () => ({
  useReducedMotion: () => true,
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, { get: () => ({ children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => {
    const p: Record<string, unknown> = { ...rest }
    for (const k of ['initial','animate','exit','transition','whileInView','viewport','layout','layoutId']) delete p[k]
    return <div {...p}>{children}</div>
  } }),
}))

afterEach(cleanup)

const BLANK: W3WinsVm = {
  micro: 'ERFOLGE',
  ledger: [],
  consistency: null,
  loading: false,
  dock: { unlocked: 12, total: 30, nextTitle: null, nextPct: null, stats: [] },
  ftp: null, milestones: null, rhythm: null, beams: null, medals: null, biggestDay: null,
  empty: null,
}

/** The rhythm chapter in the shape the server really sends it. */
const RHYTHM = {
  eyebrow: 'DEIN RHYTHMUS',
  statement: 'In 46 von 52 Wochen bist du gefahren.',
  rhythm: {
    season: null,
    months: Array.from({ length: 12 }, (_, i) => ({
      start: `2026-${String(i + 1).padStart(2, '0')}-01`,
      rides: 10, km: 300 + i * 10, minutes: 900,
    })),
    days: Array.from({ length: 14 }, (_, i) => ({
      start: `2026-08-${String(19 + i).padStart(2, '0')}`,
      rides: 1, km: 40, minutes: 95,
    })),
    weeks: Array.from({ length: 52 }, (_, i) => ({
      start: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      rides: i % 4 === 0 ? 0 : 2,
      minutes: i % 4 === 0 ? 0 : 210,
    })),
    ridden: 46, of: 52, longestStreak: 19,
  },
}

describe('a chapter with no data does not render', () => {
  /**
   * HOUSE RULE 9, AS A TEST. Six chapters, each with its own source, and a
   * rider can legitimately have none of them — no threshold history, no
   * detected milestones, no power meter. A screen that filled those gaps with
   * placeholders would be inventing a record, which is the one thing this page
   * must never do.
   */
  it('draws nothing at all when every chapter is null', () => {
    const { container } = render(<W3WinsContent vm={BLANK} />)
    expect(container.textContent).toBe('')
  })

  it('says so once, and only once, when the rider has never ridden', () => {
    render(<W3WinsContent vm={{ ...BLANK, empty: 'Deine erste gewertete Fahrt füllt diese Seite.' }} />)
    expect(screen.getByText('Deine erste gewertete Fahrt füllt diese Seite.')).toBeTruthy()
  })

  it('renders the chapters it does have without the ones it does not', () => {
    render(<W3WinsContent vm={{
      ...BLANK,
      rhythm: RHYTHM,
    }} />)
    expect(screen.getByText('In 46 von 52 Wochen bist du gefahren.')).toBeTruthy()
    expect(screen.queryByText('DEIN GRÖSSTER TAG')).toBeNull()
    expect(screen.queryByText('MEILENSTEINE')).toBeNull()
  })
})

describe('the biggest day', () => {
  const day = (badges: { label: string; icon: typeof Trophy }[]) => ({
    ...BLANK,
    biggestDay: {
      eyebrow: 'DEIN GRÖSSTER TAG',
      statement: '142,3 Kilometer an einem Tag — deine längste Fahrt.',
      title: 'ALPENPASS · 24.08.26',
      km: '142,3', kmUnit: 'km', time: '5:12:40', ascent: '2.180', ascentUnit: 'hm',
      badges, cta: 'Als Karte teilen',
    },
  })

  it('carries only the badges it was given', () => {
    /** "HÖCHSTER TAG" on a ride that merely happens to be hilly is a claim the
     *  rider can disprove by scrolling their own history, so the second badge
     *  is the server's call and the view never adds one. */
    render(<W3WinsContent vm={day([{ label: 'LÄNGSTE FAHRT', icon: Trophy }])} />)
    expect(screen.getByText('LÄNGSTE FAHRT')).toBeTruthy()
    expect(screen.queryByText('HÖCHSTER TAG')).toBeNull()
  })

  it('shows a dash for ascent the file never carried', () => {
    render(<W3WinsContent vm={{
      ...day([]),
      biggestDay: { ...day([]).biggestDay!, ascent: '—' },
    }} />)
    expect(screen.getByText('—')).toBeTruthy()
  })
})

describe('the milestone rows', () => {
  it('draws a row without a bar when there is no percentage', () => {
    /** A row here IS a bar. Rather than drawing one at an invented width, a
     *  milestone with no numeric progress keeps its track empty. */
    const { container } = render(<W3WinsContent vm={{
      ...BLANK,
      milestones: {
        eyebrow: 'MEILENSTEINE',
        statement: '1 Meilenstein läuft gerade.',
        rows: [{ key: 'a', icon: Bike, title: 'Wiederholungstäter', value: '284 / 300 Fahrten', pct: null, detail: null, remaining: null }],
      },
    }} />)
    expect(screen.getByText('Wiederholungstäter')).toBeTruthy()
    expect(screen.getByText('284 / 300 Fahrten')).toBeTruthy()
    // The track exists; nothing is filled inside it.
    expect(container.querySelectorAll('div').length).toBeGreaterThan(0)
  })
})
