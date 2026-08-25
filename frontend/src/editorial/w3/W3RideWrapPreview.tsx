import W3RideWrap, { type W3RideWrapVm } from './W3RideWrap'
import { T } from './w3tokens'

/** Backend-free preview of the ride wrap — /e/w3-ride-wrap-preview, unguarded.
 *  Feeds the REAL component the view model the live page will build, so the
 *  design can be judged without a session. Values mirror pen frame `tN23S`. */

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
  ctaLabel: 'FAHRT TEILEN',
}

/** Stands in for the hero room's bike-on-a-scene until it is portalled in. */
function HeroStandIn() {
  return (
    <div style={{
      height: 260, width: '100%',
      // Tokens only — `isolation.test` rejects a raw hex here, and it is right
      // to: a stand-in is exactly where a seventh violet gets invented.
      background: `radial-gradient(circle at 50% 62%, ${T.acid}26, ${T.acid}0d 42%, transparent 68%), linear-gradient(180deg, ${T.nightMid}, ${T.bg})`,
    }} />
  )
}

export default function W3RideWrapPreview() {
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ minHeight: '100dvh', background: T.bg }}>
        <W3RideWrap vm={VM} hero={<HeroStandIn />} />
      </div>
    </div>
  )
}
