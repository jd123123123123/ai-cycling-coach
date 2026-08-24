import W3RiderHighlights from './W3RiderHighlights'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import { T, FONT } from './w3tokens'
import './w3.css'

/** TEMP preview — /e/w3-biker-preview, unguarded and backend-free. Renders the
 *  REAL highlights screen against a fixture, including the state that matters
 *  most: a rider with only two records, so the bento has to close up. */
export default function W3BikerPreview() {
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />
        <W3RiderHighlights
          avatarUrl="/w3/example-rider.webp"
          handle="@jannis"
          role="Funseeker"
          pills={[{ v: '12.480', l: 'KM' }, { v: '284', l: 'FAHRTEN' }]}
          tier={{ label: 'Silber · Stufe 7', pct: 0.73, note: '312 RC bis Stufe 8' }}
          milestone={{ pct: 0.5, label: 'Meilenstein', note: 'Noch 25 Fahrten bis Gold' }}
          records={[
            { key: 'longest_ride_km', value: '212', unit: 'km', label: 'LÄNGSTE FAHRT', ride: 'Harzrunde', when: '4. Mai' },
            { key: 'highest_climb_m', value: '2.140', unit: 'hm', label: 'HÖCHSTER ANSTIEG', ride: 'Brocken', when: '18. Juni' },
            { key: 'longest_time_s', value: '8:12', unit: 'Std.', label: 'LÄNGSTE ZEIT', ride: 'Havel-Schleife', when: '2. Juli' },
            { key: 'hardest_ride_tss', value: '341', unit: 'TSS', label: 'HÄRTESTE FAHRT', ride: 'Intervalle', when: '9. Aug' },
          ]}
          badges={{ unlocked: 14, total: 32, latest: 'Erster Jahrhunderter' }} />
        <W3TabBar />
      </div>
    </div>
  )
}
