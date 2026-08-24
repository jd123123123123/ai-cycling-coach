import { useState } from 'react'
import { T, FONT, band, Kicker } from './w3tokens'
import W3MonthStrip from './W3MonthStrip'
import W3ChallengeRow from './W3ChallengeRow'
import './w3.css'

/**
 * TEMP preview — /e/w3-challenges-preview, unguarded and backend-free.
 *
 * The live page is `W3ChallengesPage`, which is entirely real data; this exists
 * so the two pieces that only appear under specific conditions — a month with
 * an interesting shape, and a row that knows how many others are in it — can be
 * looked at without waiting for a month to happen.
 */

// A month with a real shape in it: a quiet start, a big weekend, a steady
// middle, two days off. A flat fixture would have proved nothing.
const AUGUST = [
  0, 42, 0, 0, 88, 130, 0, 55, 61, 0, 0, 74, 0, 96,
  120, 44, 0, 58, 63, 0, 71, 210, 180, 0, 0, 66, 72, 80, 0, 48, 0,
]

export default function W3ChallengesPreview() {
  const [done, setDone] = useState(false)
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, minHeight: '100dvh', background: T.bg }}>
        <div style={{ ...band(24), paddingTop: 24, gap: 6 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.6, color: T.ink, margin: 0 }}>
            Challenges · Bausteine
          </h1>
          <span style={{ fontSize: 12, color: T.mid }}>
            Die echte Seite ist /e/w3-challenges.
          </span>
        </div>

        <div style={{ ...band(26), gap: 12 }}>
          <Kicker>DER MONATSSTREIFEN</Kicker>
          <div style={{ background: T.surface, borderRadius: 24, padding: 20 }}>
            <W3MonthStrip days={AUGUST} todayIndex={24} completed={done} />
          </div>
          <button onClick={() => setDone((d) => !d)} style={{
            height: 34, borderRadius: 100, border: 0, background: T.surface2,
            color: T.mid, fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>
            {done ? 'als laufend zeigen' : 'als geschafft zeigen'}
          </button>
        </div>

        <div style={{ ...band(40), gap: 10 }}>
          <Kicker>EINE ZEILE MIT MITSPIELERN</Kicker>
          <W3ChallengeRow vm={{
            key: 'distance_600', title: '600 km im Monat', kind: 'distance_km',
            value: 412, target: 600, unit: 'km', fill: 0.687,
            reward: '500 RC', completed: false, deadline: 'noch 7 Tage',
            participants: 63, onBoard: () => {},
          }} />
          <W3ChallengeRow vm={{
            key: 'custom:1', title: 'Meine eigene Runde', kind: 'active_days',
            value: 20, target: 20, unit: 'Tage', fill: 1,
            reward: '500 RC', completed: true, deadline: null,
          }} />
        </div>
      </div>
    </div>
  )
}
