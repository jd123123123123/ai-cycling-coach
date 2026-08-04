import { useMemo } from 'react'
import { useLocale } from '../../contexts/LocaleContext'
import type { RehearsalSegment } from '../../api/rehearsal'

/**
 * EffortProfile — the road's shape, coloured by what it will cost.
 *
 * The elevation profile shows WHERE the hills are. Time-in-zones shows HOW
 * MUCH of each intensity the day holds. Neither answers the question a rider
 * actually asks before a hard route: *where* does the hard part fall. A bar
 * per stretch, height from elevation and colour from the zone that stretch
 * demands, puts those two facts in the same picture — so a Z5 block at km 60
 * is visibly a late one, which is the whole difference between a plan and a
 * surprise.
 *
 * Colour comes from the SIMULATED power for that stretch against the FTP the
 * forecast used, not from gradient: a shallow drag into a headwind can cost
 * threshold watts, and colouring by slope would call it easy.
 */

const BARS = 24

/** Coggan zone index (1-7) for a power as a fraction of FTP. */
function zoneOf(watts: number, ftp: number): number {
  const f = watts / ftp
  if (f < 0.55) return 1
  if (f < 0.75) return 2
  if (f < 0.9) return 3
  if (f < 1.05) return 4
  if (f < 1.2) return 5
  if (f < 1.5) return 6
  return 7
}

export default function EffortProfile({
  segments,
  distanceM,
  ascentM,
  ftpW,
}: {
  segments: RehearsalSegment[]
  distanceM: number
  ascentM: number
  ftpW: number | null
}) {
  const { locale } = useLocale()
  const de = locale === 'de'

  const model = useMemo(() => {
    if (segments.length < 4 || !ftpW || ftpW <= 0 || distanceM <= 0) return null
    const bars: { elev: number; zone: number }[] = []
    for (let i = 0; i < BARS; i++) {
      const from = (i / BARS) * distanceM
      const to = ((i + 1) / BARS) * distanceM
      const inBar = segments.filter((s) => s.start_m >= from && s.start_m < to)
      const src = inBar.length > 0 ? inBar : [segments[Math.min(segments.length - 1, Math.floor((i / BARS) * segments.length))]]
      const elev = src.reduce((a, s) => a + (s.elevation_m ?? 0), 0) / src.length
      const watts = src.reduce((a, s) => a + (s.power_w ?? 0), 0) / src.length
      bars.push({ elev, zone: zoneOf(watts, ftpW) })
    }
    const lo = Math.min(...bars.map((b) => b.elev))
    const hi = Math.max(...bars.map((b) => b.elev))
    const span = hi - lo
    return {
      bars: bars.map((b) => ({
        // A flat route maps to a uniform mid-height rather than to zero: bars
        // of no height would read as "no data" when the truth is "no hills".
        frac: span < 1 ? 0.5 : 0.18 + ((b.elev - lo) / span) * 0.82,
        zone: b.zone,
      })),
      zones: [...new Set(bars.map((b) => b.zone))].sort((a, b) => a - b),
    }
  }, [segments, distanceM, ftpW])

  // No power model, no colours — and a grey elevation chart already exists
  // above. Better to render nothing than the same shape twice.
  if (!model) return null

  const ZONE_LABEL: Record<number, string> = {
    1: de ? 'Z1 Erholung' : 'Z1 Recovery',
    2: de ? 'Z2 Grundlage' : 'Z2 Endurance',
    3: de ? 'Z3 Tempo' : 'Z3 Tempo',
    4: de ? 'Z4 Schwelle' : 'Z4 Threshold',
    5: 'Z5 VO₂',
    6: de ? 'Z6 Anaerob' : 'Z6 Anaerobic',
    7: de ? 'Z7 Sprint' : 'Z7 Sprint',
  }

  return (
    <section
      className="rounded-[20px] flex flex-col"
      style={{ background: '#14181DE6', border: '1px solid var(--color-rule)', padding: 16, gap: 12 }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="eyebrow"
          style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-amber)' }}
        >
          {de ? 'DER BERG VOR DIR' : 'THE MOUNTAIN AHEAD'}
        </span>
        <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
          {`${Math.round(ascentM).toLocaleString(de ? 'de' : 'en')} hm`}
        </span>
      </div>

      <div className="flex items-end" style={{ height: 92, gap: 3 }}>
        {model.bars.map((b, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${Math.round(b.frac * 100)}%`,
              borderRadius: 2,
              background: `var(--color-zone-${b.zone})`,
            }}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        {[0, distanceM / 2000, distanceM / 1000].map((km, i) => (
          <span key={i} className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>
            {`${Math.round(km)} km`}
          </span>
        ))}
      </div>

      {/* Only the zones this route actually contains. A legend listing Z5 on a
          route with no Z5 in it is a promise the road does not keep. */}
      <div className="flex flex-wrap" style={{ gap: '6px 14px' }}>
        {model.zones.map((z) => (
          <span key={z} className="inline-flex items-center" style={{ gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: `var(--color-zone-${z})` }} />
            <span style={{ fontSize: 10, color: 'var(--color-ink-2)' }}>{ZONE_LABEL[z]}</span>
          </span>
        ))}
      </div>
    </section>
  )
}
