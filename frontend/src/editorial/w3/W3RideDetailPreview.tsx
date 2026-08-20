import { useState } from 'react'
import W3RideDetailView, { type W3RideVm, type W3RideSceneState } from './W3RideDetailView'
import type { W3RideHeroVm } from './W3RideMapHero'

/** TEMP preview — pen-exact fixture, no backend. /e/w3-ride-preview is
 *  unguarded; remove before merge. */

const power = Array.from({ length: 40 }, (_, i) => {
  const inRep = [3, 4, 9, 10, 15, 16, 21, 22, 27, 28, 33, 34].includes(i)
  return inRep ? 0.85 + Math.random() * 0.12 : 0.28 + Math.random() * 0.12
})

// A synthetic winding GPX track (lat/lng) for the generated hero.
const polyline: [number, number][] = Array.from({ length: 44 }, (_, i) => {
  const t = i / 43
  return [51.74 + 0.05 * Math.sin(t * 6.5) + t * 0.015, 10.6 + t * 0.11 + 0.03 * Math.cos(t * 5)]
})

/** The hero, with the numbers the pen frame `XqpcX` shows.
 *
 *  `sceneImage` points at a real render rather than being null, because the
 *  COMPOSED state is both the common one and the hard one: it is the only way
 *  to check that the dissolve finishes before the text begins and that the
 *  crop keeps the bike clear of both. The empty state is a shorter card with an
 *  accent wash and is easy to reason about without a route to look at. */
const HERO: W3RideHeroVm = {
  polyline,
  sceneImage: '/w3/bike-build-example.webp',
  dateLine: '06.08.2026 · 09:12',
  duration: '01:47:32',
  stats: [
    { label: 'DISTANZ', value: '52,4', unit: 'km' },
    { label: 'Ø TEMPO', value: '29,2', unit: 'km/h' },
    { label: 'HÖHE', value: '1.240', unit: 'hm' },
  ],
  watts: '241',
  bpm: '148',
  ifValue: '0,86',
  ifFill: 0.86,
  effortLabel: '86 % VON FTP · TEMPO',
  energyLabel: '1.184 kcal',
}

const FIXTURE: W3RideVm = {
  hero: HERO,
  dateChip: 'Mi 06. Aug · 09:12', sportChip: 'Outdoor', recordChip: 'Neuer Rekord',
  title: 'Berg-Wiederholungen',
  bigStat: '62', bigStatUnit: 'Kilometer', climb: '1240 m hoch', avgSpeed: '30 km/h',
  power, powerNote: 'Sechs Wdh. · keine abgebaut',
  polyline, intensity: 0.94,
  movedSub: '62 km und 1 240 Höhenmeter, auf dein Jahr gerechnet.',
  moved: [
    { label: 'Saison-Distanz', delta: '+62 km', value: '4 812', goal: '12 000 km', beforePct: 0.396, pct: 0.401 },
    { label: 'Höhenmeter', delta: '+1 240 m', value: '41 260', goal: '100 000 m', beforePct: 0.4, pct: 0.413 },
    { label: 'Fahrten erfasst', delta: '+1', value: '142', goal: '200', beforePct: 0.705, pct: 0.71 },
  ],
  movedFoot: 'Noch etwa 116 Fahrten wie diese, dann stehen die 12 000 km — du liegst auf Kurs für Oktober, nicht Dezember.',
  stats: [
    { v: '198 W', l: 'Ø LEISTUNG', s: '244 W normalisiert' },
    { v: '2:04', l: 'FAHRZEIT', s: '62 km bei 30 km/h' },
    { v: '124', l: 'BELASTUNG · TSS', s: 'höchste seit Juni' },
    { v: '148', l: 'Ø HF · BPM', s: 'Spitze 176 in Wdh. 6' },
  ],
  execScore: '94', execTotal: '100',
  verdictHeadline: 'Du hast jede einzelne gehalten.',
  verdictBody: 'Sechs Wiederholungen bei 285 W, alle sechs auf oder über Ziel. Die letzte war mit 294 W die stärkste des Tages — du hast noch nie eine Schwelleneinheit steigend beendet. Übertrieben hast du es nur in der ersten, und das hat dich in Minute vierzig eingeholt.',
  aiModel: 'claude-sonnet-4-6',
  repeatsScore: '5 von 6', repeatsSub: 'Nur Wiederholung 4 fiel ab, um 3 W',
  repeats: [
    { label: 'WDH. 1', watts: '292 W', delta: 7, verdict: 'GEHALTEN' },
    { label: 'WDH. 2', watts: '289 W', delta: 4, verdict: 'GEHALTEN' },
    { label: 'WDH. 3', watts: '287 W', delta: 2, verdict: 'GEHALTEN' },
    { label: 'WDH. 4', watts: '282 W', delta: -3, verdict: 'ABGEBAUT' },
    { label: 'WDH. 5', watts: '290 W', delta: 5, verdict: 'GEHALTEN' },
    { label: 'WDH. 6', watts: '294 W', delta: 9, verdict: 'STÄRKSTE' },
  ],
  zonesSub: 'Zwei Stunden, davon 124 Minuten aufgezeichnet. Zone 4 nahm ein Drittel der Fahrt.',
  zones: [
    { z: 'ZONE 1', name: 'Erholung', min: '22 Min', pct: 18, peak: false },
    { z: 'ZONE 2', name: 'Ausdauer', min: '38 Min', pct: 31, peak: false },
    { z: 'ZONE 3', name: 'Tempo', min: '18 Min', pct: 15, peak: false },
    { z: 'ZONE 4', name: 'Schwelle', min: '42 Min', pct: 34, peak: true },
    { z: 'ZONE 5', name: 'VO2max', min: '4 Min', pct: 3, peak: false },
  ],
  ranksSub: 'Jede Dauer gegen deinen Bestwert. Zwanzig Sekunden bis zum Rekord.',
  ranks: [
    { dur: '5 SEK', watts: '1.180 W', note: 'BESTWERT 1.240 IM MAI', pr: false, fill: 0.8 },
    { dur: '1 MIN', watts: '598 W', note: 'BESTWERT 620 IM JUNI', pr: false, fill: 0.72 },
    { dur: '5 MIN', watts: '342 W', note: 'NEUER BESTWERT · +7 W', pr: true, fill: 1 },
    { dur: '12 MIN', watts: '279 W', note: 'BESTWERT 288 W · 12. MAI', pr: false, fill: 0.66 },
    { dur: '20 MIN', watts: '268 W', note: 'BESTWERT 276 IM JULI', pr: false, fill: 0.58 },
  ],
  onYouDelta: '+14', ceilingLabel: 'CP', ceilingBefore: '328', ceilingAfter: '342',
  fitness: '78', fitnessD: '+2', fatigue: '68', fatigueD: '+14', form: '+10', formD: '-12',
  changesBody: 'Die Form fällt für drei Tage. Das ist der Preis für den Bestwert — zahl ihn, und sie kommt höher zurück.',
}

export default function W3RideDetailPreview() {
  // The cover demos the offer state: the rider has both a figure and a bike, so
  // composing is one tap away. Tapping it plays the real waiting choreography —
  // and, since a preview has no backend behind it, lands honestly on the failed
  // state rather than pretending an image arrived.
  // 'ok' with the fixture's own render, so the scene state and the hero agree.
  // They disagreed before: the hero showed a composed picture while the scene
  // said "not generated", so the compose pill floated over the very thing it
  // offers to make.
  const [scene, setScene] = useState<W3RideSceneState>({ status: 'ok', image: HERO.sceneImage, pending: false, failed: false })
  const compose = () => {
    setScene({ status: 'not_generated', image: null, pending: true, failed: false })
    setTimeout(() => setScene({ status: 'not_generated', image: null, pending: false, failed: true }), 2600)
  }
  return (
    <W3RideDetailView
      vm={FIXTURE}
      scene={scene}
      onCompose={compose}
      onOpenStudio={(kind) => console.log('studio', kind)}
      onBack={() => history.back()}
    />
  )
}
