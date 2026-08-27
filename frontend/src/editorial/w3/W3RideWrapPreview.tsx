import W3RideWrap, { type W3RideWrapVm } from './W3RideWrap'
import { T } from './w3tokens'

/** Backend-free preview of the ride wrap — /e/w3-ride-wrap-preview, unguarded.
 *  Feeds the REAL component the view model the live page will build, so the
 *  design can be judged without a session. Values mirror pen frame `tN23S`. */

/** A short demo track, so the route-as-ground can be looked at without a ride. */
const DEMO_ROUTE: [number, number][] = Array.from({ length: 60 }, (_, i) => {
  const t = i / 59
  return [38.70 + Math.sin(t * 5) * 0.006 + t * 0.012, -9.19 + t * 0.055] as [number, number]
})

const VM: W3RideWrapVm = {
  chip: 'SONNENAUFGANG · SOLO',
  chapter: '01',
  route: 'RHEINSCHLEIFE',
  when: 'SA 23. AUG · 06:41',
  lead: 'Deine schnellste Runde',
  emphasis: 'seit Mai.',
  heroValue: '52,4',
  heroUnit: 'km',
  stats: [
    { key: 'speed', label: 'Ø TEMPO', value: '29,2', unit: 'km/h', note: '+1,4 zum Ø', fill: 0.72 },
    { key: 'climb', label: 'HÖHENMETER', value: '612', unit: 'm', note: 'BESTWERT', fill: 1, best: true },
    { key: 'power', label: 'Ø LEISTUNG', value: '234', unit: 'W', note: '+12 zur Basis', fill: 0.64 },
  ],
  rewardRc: 128,
  polyline: DEMO_ROUTE,
}

/** Stands in for the hero room's bike-on-a-scene until it is portalled in. */

export default function W3RideWrapPreview() {
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ height: '100dvh', overflow: 'hidden', background: T.bg }}>
        {/* ONE PAGE. The ride detail used to run underneath this — the screen a
            rider most wants to screenshot ended in a scroll into analysis. It
            is reached by name now, from the link under the button. */}
        <W3RideWrap vm={VM} onClose={() => {}} onUnlock={() => {}} onShare={() => {}} onDetails={() => {}} />
      </div>
    </div>
  )
}
