import { T } from './w3tokens'

const seconds = (v: number | null | undefined) => v != null && Number.isFinite(v) && v >= 0 ? v : null

/** Each zone has one angular slot. Both tracks share its start and one seconds scale.
 * The unfilled remainder is intentional: neither track is independently stretched. */
export function zoneTrackGeometry(actual: (number | null)[], planned?: (number | null)[]) {
  const slots = actual.map((v, i) => ({ actual: seconds(v), planned: seconds(planned?.[i]) }))
  const scale = slots.reduce((sum, z) => sum + Math.max(z.actual ?? 0, z.planned ?? 0), 0)
  let elapsed = 0
  return slots.map(z => {
    const start = scale ? elapsed / scale * 100 : 0
    elapsed += Math.max(z.actual ?? 0, z.planned ?? 0)
    return { start, actual: z.actual == null ? null : scale ? z.actual / scale * 100 : 0, planned: z.planned == null ? null : scale ? z.planned / scale * 100 : 0 }
  })
}

export function AtelierZoneTracks({ actual, planned, selected, color = T.acid }: {
  actual: (number | null)[]; planned?: (number | null)[]; selected: number; color?: string
}) {
  const parts = zoneTrackGeometry(actual, planned)
  return <g transform="rotate(-90 180 172)">
    {parts.flatMap((p, i) => (['actual', 'planned'] as const).map(kind => {
      const length = p[kind]
      if (length == null || length <= 0) return null
      return <circle key={`${kind}-${i}`} data-zone={i} data-track={kind} cx="180" cy="172"
        r={kind === 'actual' ? 122 : 100} pathLength="100" fill="none"
        stroke={kind === 'actual' ? i === selected ? color : T.heroOff : T.ink}
        strokeWidth={kind === 'actual' ? i === selected ? 20 : 11 : i === selected ? 7 : 3}
        strokeOpacity={i === selected ? 1 : kind === 'actual' ? .65 : .2}
        strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-p.start}
        className="atelier-zone-track"/>
    }))}
  </g>
}
