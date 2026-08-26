import { describe, it, expect } from 'vitest'
import { laufbandStrings, type StoryData } from '../w3share'

/**
 * THE BELT IS BUILT ONCE AND RENDERED TWICE — canvas for the export, DOM for
 * the preview that scrolls. That is the whole reason `laufbandStrings` exists
 * as a function instead of as eight lines inside the painter, so these pin the
 * things that would let the two drift apart without anyone noticing.
 */

const BASE: StoryData = {
  handle: '@jannis_d',
  badge: 'W3 ANALYSE',
  lead: 'Schnellste Rheinschleife',
  emphasis: 'seit Mai — bei 4 °C weniger.',
  bigValue: '52,4',
  bigUnit: 'km',
  stats: [{ v: '1:47:32', l: 'BEWEGTE ZEIT' }, { v: '612', l: 'HM' }],
  series: [0.3, 0.9, 0.5],
  footer: '24. AUG 2026',
  photo: null,
  routeName: 'Rheinschleife',
  ticker: '— SCHNELLSTE SEIT MAI — NEUE BESTZEIT',
  readings: [{ v: '29,2 km/h', l: 'Ø Tempo' }],
}

describe('the Laufband, as text', () => {
  it('ends both belts with the separator so a repeat is seamless', () => {
    // Without this the second copy butts straight onto the first and the band
    // reads "…NEUE BESTZEITNEUE BESTZEIT" once a second.
    const { figures, verdicts } = laufbandStrings(BASE)
    expect(figures.endsWith(' — ')).toBe(true)
    expect(verdicts.endsWith(' — ')).toBe(true)
  })

  it('leads with the ride’s big number and its unit', () => {
    expect(laufbandStrings(BASE).figures.startsWith('52,4 KM — ')).toBe(true)
  })

  it('prints a stat’s label only when the label is a unit', () => {
    // "612 HM" is a reading. "1:47:32 BEWEGTE ZEIT" is the band explaining
    // itself, which is the one register a ticker has to stay out of.
    const { figures } = laufbandStrings(BASE)
    expect(figures).toContain('612 HM')
    expect(figures).not.toContain('BEWEGTE')
    expect(figures).toContain('1:47:32')
  })

  it('strips the dash the coach’s sentence arrives with', () => {
    // `ticker` is fed from the poster sentence, which is written to be appended
    // to something else — so it starts with a separator that would double up.
    expect(laufbandStrings(BASE).verdicts.startsWith('SCHNELLSTE SEIT MAI')).toBe(true)
  })

  it('falls back to the route name rather than running an empty belt', () => {
    const { verdicts } = laufbandStrings({ ...BASE, ticker: '' })
    expect(verdicts.startsWith('RHEINSCHLEIFE')).toBe(true)
  })

  it('uppercases the verdicts, because the band is set in caps', () => {
    const { verdicts } = laufbandStrings({ ...BASE, ticker: 'neue bestzeit' })
    expect(verdicts).toBe('NEUE BESTZEIT — ')
  })
})
