import { describe, expect, it } from 'vitest'
import { buildWeeklyBars } from '../w3plan'

/**
 * DIE REGEL, DIE HIER FESTGENAGELT WIRD: eine Woche ohne Fahrt zeichnet
 * NICHTS. Vorher stand `tss = actualByWeek[i] ?? t` -- eine vergangene Woche
 * ohne Messung bekam den Zielwert in voller Hoehe und wurde dem Screenreader
 * als "gefahren" gemeldet. Das ist eine erfundene Zahl im Gewand einer
 * Messung, und genau das darf nicht zurueckkommen.
 */
const T = [158, 162, 162, 98]

describe('buildWeeklyBars: Gefaess und Fuellung', () => {
  it('trennt geplant und gefahren in zwei Felder', () => {
    const [w1] = buildWeeklyBars(T, 1, [172, null, null, null])
    expect(w1.planned).toBe(158)
    expect(w1.actual).toBe(172)
  })

  it('erfindet fuer eine vergangene Woche OHNE Fahrt keinen Wert', () => {
    const bars = buildWeeklyBars(T, 3, [null, null, null, null])
    // Alle drei liegen in der Vergangenheit -- frueher haetten sie den
    // Zielwert getragen.
    for (const b of bars.slice(0, 3)) {
      expect(b.kind).toBe('done')
      expect(b.actual).toBeNull()
      expect(b.fill).toBeNull()
      expect(b.over).toBe(false)
      expect(b.planned).toBeGreaterThan(0)   // die Hoehe bleibt echt
    }
  })

  it('deckelt die Fuellung bei eins und meldet den Ueberlauf getrennt', () => {
    const [w1] = buildWeeklyBars(T, 1, [237, null, null, null]) // 150 %
    expect(w1.fill).toBe(1)
    expect(w1.over).toBe(true)
    expect(w1.actual).toBe(237)      // die Zahl bleibt unverfaelscht
  })

  it('nennt eine genau getroffene Woche nicht uebergelaufen', () => {
    const [w1] = buildWeeklyBars(T, 1, [158, null, null, null])
    expect(w1.fill).toBe(1)
    expect(w1.over).toBe(false)
  })

  it('haelt die Hoehe an der geplanten Last, egal wie gefahren wurde', () => {
    const ruhig = buildWeeklyBars(T, 3, [null, null, null, null])
    const wild  = buildWeeklyBars(T, 3, [900, 900, 900, null])
    expect(wild.map(b => b.planned)).toEqual(ruhig.map(b => b.planned))
  })

  it('nimmt nur echte Zahlen als Messung an', () => {
    const [w1, w2] = buildWeeklyBars(T, 2, [Number.NaN, '162' as unknown as number, null, null])
    expect(w1.actual).toBeNull()
    expect(w2.actual).toBeNull()
  })

  it('gibt fuer einen leeren Plan eine leere Reihe', () => {
    expect(buildWeeklyBars(null, 0, [])).toEqual([])
    expect(buildWeeklyBars([], 0, [])).toEqual([])
  })
})
