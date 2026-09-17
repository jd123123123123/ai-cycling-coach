import { describe, expect, it } from 'vitest'
import { backdropArt } from '../w3backdropArt'

/**
 * UNGUELTIGES CSS WIRFT NICHT -- ES VERSCHWINDET. `T.d1/d2/d3` tragen schon
 * eine Alpha-Stufe; der Alpha-Helfer hing eine zweite an und erzeugte
 * `#FFFFFF3399`, zehn Hexstellen. Der Browser verwirft daraufhin die GANZE
 * `background`-Deklaration, und die Kachel stand ohne Hintergrund da --
 * gemessen in der Produktion an Passhoehe und Regenstrasse.
 */
const IDS = ['studio_black', 'starter_road', 'night_road', 'dawn_road', 'mountain_pass',
             'coast_road', 'rain_road', 'gravel_track', 'winter_road', 'velodrome',
             'mond', 'startrampe', 'unbekannte_kulisse']

describe('backdropArt: jede Kulisse hat gueltige Farben', () => {
  it.each(IDS)('%s enthaelt keine Farbe mit mehr als acht Hexstellen', (id) => {
    const treffer = backdropArt(id).css.match(/#[0-9A-Fa-f]{9,}/g)
    expect(treffer, `ungueltige Farbe(n): ${treffer?.join(', ')}`).toBeNull()
  })

  it.each(IDS)('%s liefert ueberhaupt einen Hintergrund', (id) => {
    expect(backdropArt(id).css.trim().length).toBeGreaterThan(0)
  })

  it('kennt auch eine unbekannte Kulisse, statt sie leer zu lassen', () => {
    expect(backdropArt('gibt_es_nicht').css).toBe(backdropArt('auch_nicht').css)
  })
})
