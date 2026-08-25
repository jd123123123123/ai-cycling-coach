import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import W3WinsView, { splitMeasure, type W3WinsVm } from '../W3WinsView'

// The three chrome pieces each open their own query (garage, streak) and want a
// router. None of them is what this file is about.
vi.mock('../W3StatusBar', () => ({ default: () => null }))
vi.mock('../W3TopBar', () => ({ default: () => null }))
vi.mock('../W3TabBar', () => ({ default: () => null }))
vi.mock('motion/react', () => ({
  useReducedMotion: () => true,
  motion: new Proxy({}, { get: () => ({ children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => {
    const p: Record<string, unknown> = { ...rest }
    delete p.initial; delete p.animate; delete p.exit; delete p.transition
    return <div {...p}>{children}</div>
  } }),
}))

const VM: W3WinsVm = {
  micro: 'ERFOLGE',
  eyebrow: 'SAISON 2026 · AUGUST',
  headline: 'Nichts hier ist',
  headlineAccent: 'gekauft.',
  deck: 'Jedes Abzeichen wird gefahren.',
  ledger: [{ key: 'badges', value: '12', unit: 'von 34', label: 'ABZEICHEN' }],
  latestChapter: 'ZULETZT VERDIENT',
  latestTitle: 'Dein letztes Abzeichen',
  latest: {
    icon: 'mountain', title: 'Erster Century', value: '133,1 km',
    detail: 'Deine längste Fahrt.', dateLabel: '14. AUGUST', fresh: true,
  },
  latestEmpty: 'Deine erste gewertete Fahrt schaltet das erste Abzeichen frei.',
  cabinetValue: '12 von 34',
  cabinetLit: 12,
  cabinetTotal: 34,
  next: { label: 'Als Nächstes · 300 W FTP', value: 'noch 8 W' },
  badgesChapter: 'DIE VITRINE',
  badgesTitle: 'Abzeichen',
  badgesSub: 'Verdiente zuerst',
  badges: [{ key: 'ftp', icon: 'gauge', name: '300 W FTP', caption: 'NOCH 8 W', earned: false, pct: 0.97 }],
  recordsChapter: 'DEINE REKORDE',
  recordsTitle: 'Persönliche Bestwerte',
  recordsSub: 'Aus deiner eigenen Leistungskurve.',
  recordsEmpty: 'Noch keine Wattdaten.',
  records: [{ key: '5s', label: '5 SEK', value: '1.240 W', wkg: '17,0 W/kg', frac: 1, pr: false }],
  lifeChapter: 'ALLE ZEITEN',
  lifeTitle: 'Was zusammengekommen ist',
  lifeSub: 'Alles, was der Coach je gewertet hat',
  life: [{ key: 'km', value: '14.208', unit: 'km', label: 'GEFAHREN INSGESAMT' }],
  ctaLabel: 'OFFENE CHALLENGES',
  ctaCaption: '4 warten auf dich',
}

afterEach(cleanup)

describe('Erfolge · the chapters are a sequence', () => {
  it('numbers all four when the rider has everything', () => {
    render(<W3WinsView vm={VM} />)
    expect(screen.getByText(/01 — ZULETZT VERDIENT/)).toBeTruthy()
    expect(screen.getByText(/02 — DIE VITRINE/)).toBeTruthy()
    expect(screen.getByText(/03 — DEINE REKORDE/)).toBeTruthy()
    expect(screen.getByText(/04 — ALLE ZEITEN/)).toBeTruthy()
  })

  it('closes the gap a missing chapter leaves — 01 is never followed by 03', () => {
    render(<W3WinsView vm={{ ...VM, badges: [], life: [] }} />)
    expect(screen.queryByText(/DIE VITRINE/)).toBeNull()
    expect(screen.getByText(/02 — DEINE REKORDE/)).toBeTruthy()
  })
})

describe('Erfolge · honesty', () => {
  it('states the empty record card instead of drawing four dashes under a promise', () => {
    render(<W3WinsView vm={{
      ...VM,
      records: VM.records.map((r) => ({ ...r, value: '—', wkg: null, frac: null })),
    }} />)
    expect(screen.getByText('Noch keine Wattdaten.')).toBeTruthy()
    expect(screen.queryByText('1.240 W')).toBeNull()
  })

  it('offers the way in rather than a congratulation when nothing is earned yet', () => {
    render(<W3WinsView vm={{ ...VM, latest: null, next: null }} />)
    expect(screen.getByText(VM.latestEmpty)).toBeTruthy()
    expect(screen.queryByText('NEU')).toBeNull()
    expect(screen.queryByText('14. AUGUST')).toBeNull()
  })
})

describe('splitMeasure', () => {
  it('splits a measurement off its unit', () => {
    expect(splitMeasure('133,1 km')).toEqual({ value: '133,1', unit: 'km' })
    expect(splitMeasure('1.240 W')).toEqual({ value: '1.240', unit: 'W' })
  })

  it('leaves a label that merely ends in a number alone', () => {
    expect(splitMeasure('Cat 4')).toEqual({ value: 'Cat 4', unit: null })
    expect(splitMeasure('486')).toEqual({ value: '486', unit: null })
  })
})
