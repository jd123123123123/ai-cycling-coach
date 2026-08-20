import { W3FormCardView } from './W3FormCard'
import { W3RouteCardView } from './W3RouteCard'
import { T, FONT } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import './w3.css'

/** TEMP preview — the two new pen `Vt2TQ` cards on a synthetic block, no
 *  backend. `/e/w3-nitro-preview` is unguarded like every other W3 preview. */

/** Six weeks of a real-shaped build: CTL climbing, ATL spiking on the hard
 *  weeks, TSB dipping negative and recovering into the down week. */
const entries = Array.from({ length: 42 }, (_, i) => {
  const ctl = 52 + i * 0.62
  // Fatigue rides ABOVE fitness on the hard days and drops below it in the
  // down week — the ordinary shape. The first fixture had it pinned near its
  // own six-week peak throughout, which filled the bar completely: correct
  // arithmetic, useless picture, because a row with nothing unlit in it has no
  // scale left to read against.
  const atl = ctl + 14 * Math.sin(i / 5.2) - 6
  return { ctl, atl, tsb: ctl - atl }
})

/** A loop with real proportions — out along a valley, up over a shoulder and
 *  back, so the outline is recognisable rather than a circle. */
const polyline: [number, number][] = Array.from({ length: 160 }, (_, i) => {
  const t = (i / 159) * Math.PI * 2
  return [
    52.42 + 0.055 * Math.sin(t) + 0.012 * Math.sin(t * 3),
    13.28 + 0.085 * Math.cos(t) + 0.02 * Math.cos(t * 2),
  ]
})

const top = {
  route: {
    name: 'Müggelsee · Nord',
    times_ridden: 6,
    distance_km: 48,
    elevation_m: 320,
    best_time_s: 5_412,
    avg_time_s: 5_940,
    avg_tss: 118,
    last_ridden: '2026-08-09',
    start_lat: 52.42,
    start_lng: 13.28,
    polyline,
    longest_climb_m: 640,
    max_gradient_pct: 5.1,
    climb_share_pct: 12.4,
  },
  score: 0.91,
  raw_fit: 0.93,
  duration_fit: 0.94,
  tss_fit: 0.88,
  terrain_fit: 0.72,
  climb_fit: 0.86,
  is_low_confidence: false,
  is_virtual: false,
  is_recently_ridden: false,
}

export default function W3NitroPreview() {
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, minHeight: '100dvh', background: T.bg, paddingBottom: 40 }}>
        <W3StatusBar />
        <div style={{ padding: '8px 20px 4px' }}>
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.8, color: T.ink }}>Nitro</span>
        </div>
        <W3RouteCardView top={top} />
        <W3FormCardView entries={entries} />
      </div>
    </div>
  )
}
