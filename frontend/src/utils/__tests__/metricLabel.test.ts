/**
 * metricLabel.test.ts — pins the audit's simple-mode label map (P1-7).
 *
 * These strings are load-bearing UX: 'Einfach' mode promises TSS→Belastung,
 * CTL→Fitness etc. Drifting one silently would re-erect the jargon wall the
 * audit tore down, so the whole map is pinned verbatim.
 */
import { describe, it, expect } from 'vitest'
import {
  metricLabel,
  metricChipText,
  buildGlossaryContent,
  type MetricKey,
} from '../metricLabel'

describe('metricLabel — simple mode (audit-pinned map)', () => {
  const CASES: Array<[MetricKey, string, string]> = [
    // [key, EN simple, DE simple]
    ['tss', 'Load', 'Belastung'],
    ['ctl', 'Fitness', 'Fitness'],
    ['atl', 'Fatigue', 'Ermüdung'],
    ['tsb', 'Freshness', 'Frische'],
    ['cp', 'Threshold', 'Schwelle'],
    ['eftp', 'Threshold', 'Schwelle'],
    ['ftp', 'Threshold', 'Schwelle'],
    ['kj', 'Work', 'Arbeit'],
    ['if', 'Intensity', 'Intensität'],
    ['np', 'Power', 'Druck'],
    ['hrv', 'Recovery signal', 'Erholungssignal'],
    ['vo2max', 'VO2max', 'VO2max'],
    ['w_prime', 'Reserve', 'Reserve'],
    ['ef', 'Efficiency', 'Effizienz'],
    ['decoupling', 'HR drift', 'Puls-Drift'],
    ['durability', 'Durability', 'Haltbarkeit'],
  ]

  it.each(CASES)('%s → %s (en) / %s (de)', (key, en, de) => {
    expect(metricLabel(key, 'simple', 'en')).toBe(en)
    expect(metricLabel(key, 'simple', 'de')).toBe(de)
  })
})

describe('metricLabel — technical mode returns the abbreviation', () => {
  const ABBREV: Array<[MetricKey, string]> = [
    ['tss', 'TSS'],
    ['ctl', 'CTL'],
    ['atl', 'ATL'],
    ['tsb', 'TSB'],
    ['cp', 'CP'],
    ['eftp', 'eFTP'],
    ['ftp', 'FTP'],
    ['kj', 'kJ'],
    ['if', 'IF'],
    ['np', 'NP'],
    ['hrv', 'HRV'],
    ['vo2max', 'VO2max'],
    ['w_prime', 'W′'],
    ['ef', 'EF'],
  ]

  it.each(ABBREV)('%s → %s in both locales', (key, abbrev) => {
    expect(metricLabel(key, 'technical', 'en')).toBe(abbrev)
    expect(metricLabel(key, 'technical', 'de')).toBe(abbrev)
  })

  it('decoupling/durability translate but stay technical words', () => {
    expect(metricLabel('decoupling', 'technical', 'en')).toBe('Decoupling')
    expect(metricLabel('decoupling', 'technical', 'de')).toBe('Entkopplung')
    expect(metricLabel('durability', 'technical', 'en')).toBe('Durability')
    expect(metricLabel('durability', 'technical', 'de')).toBe('Haltbarkeit')
  })

  it('defaults to en when locale omitted', () => {
    expect(metricLabel('tss', 'simple')).toBe('Load')
    expect(metricLabel('tss', 'technical')).toBe('TSS')
  })
})

describe('metricChipText', () => {
  it('joins label and value with a middot', () => {
    expect(metricChipText('tss', '62', 'simple', 'de')).toBe('Belastung · 62')
    expect(metricChipText('tss', '62', 'technical', 'en')).toBe('TSS · 62')
  })
})

describe('buildGlossaryContent', () => {
  it('renders the audit-pinned Entkopplung copy with the reading (DE)', () => {
    const c = buildGlossaryContent('decoupling', 'simple', 'de', '5,8 %')
    expect(c.explanation).toBe(
      'Puls-Drift 5,8 % — dein Puls stieg leicht bei gleicher Leistung. Unter 5 % gilt als sehr ausdauernd; mehr lockere Grundlage senkt den Wert.',
    )
    expect(c.title).toBe('Puls-Drift')
    expect(c.eyebrow).toBe('Entkopplung')
    expect(c.reading).toBe('5,8 %')
    expect(c.action.length).toBeGreaterThan(0)
  })

  it('renders the audit-pinned decoupling copy with the reading (EN)', () => {
    const c = buildGlossaryContent('decoupling', 'simple', 'en', '5.8%')
    expect(c.explanation).toBe(
      'HR drift 5.8% — your heart rate crept up at the same power. Under 5% is very aerobic; more easy base riding brings it down.',
    )
  })

  it('collapses the {n} placeholder cleanly when no reading exists', () => {
    const c = buildGlossaryContent('decoupling', 'simple', 'de', null)
    expect(c.explanation.startsWith('Puls-Drift — dein Puls')).toBe(true)
    expect(c.explanation).not.toContain('{n}')
    expect(c.reading).toBeNull()
  })

  it('bridges the two voices: technical mode shows the simple word as eyebrow', () => {
    const c = buildGlossaryContent('tsb', 'technical', 'de', '+4')
    expect(c.title).toBe('TSB')
    expect(c.eyebrow).toBe('Frische')
  })

  it('eftp and ftp alias to the cp explanation', () => {
    const cp = buildGlossaryContent('cp', 'simple', 'en', '250 W')
    const eftp = buildGlossaryContent('eftp', 'simple', 'en', '250 W')
    const ftp = buildGlossaryContent('ftp', 'simple', 'en', '250 W')
    expect(eftp.explanation).toBe(cp.explanation)
    expect(ftp.explanation).toBe(cp.explanation)
  })

  it('has an entry (explanation + action) for every core metric', () => {
    for (const key of ['tss', 'ctl', 'atl', 'tsb', 'cp', 'w_prime', 'ef', 'decoupling', 'durability', 'hrv'] as const) {
      for (const locale of ['en', 'de'] as const) {
        const c = buildGlossaryContent(key, 'simple', locale, '1')
        expect(c.explanation.length, `${key}/${locale} explanation`).toBeGreaterThan(20)
        expect(c.action.length, `${key}/${locale} action`).toBeGreaterThan(10)
        expect(c.explanation).not.toContain('{n}')
      }
    }
  })
})
