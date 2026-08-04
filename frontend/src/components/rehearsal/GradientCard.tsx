import { useMemo } from 'react'
import { useLocale } from '../../contexts/LocaleContext'
import type { RehearsalSegment } from '../../api/rehearsal'
import { penCard, penEyebrow } from './penCard'

/**
 * GradientCard — the road's profile, painted by how steep each stretch is.
 *
 * A single-colour elevation chart says where the hills are and nothing about
 * what they will cost. Painting each column by its own gradient bucket puts
 * both facts in one picture: the same 1,200 m looks green and rolling on one
 * route and carries an amber wall on another, and that difference is the whole
 * decision an athlete makes when they pick a road for a given session.
 *
 * The summit marker names the high point rather than leaving it as an unlabelled
 * peak — "KESSELBERG · 858 M" is a landmark a rider can plan around, "the tall
 * bit at 38 km" is not.
 *
 * The distribution bar and legend underneath answer the question the profile
 * still cannot at phone width: how many KILOMETRES sit at each gradient. A
 * spike and a long drag can occupy the same pixels.
 */

const COLS = 34

const BUCKETS = [
  { key: '≤1%', max: 1, color: '#39434F' },
  { key: '1–4%', max: 4, color: '#16E08A' },
  { key: '4–7%', max: 7, color: '#FFB020' },
  { key: '7–10%', max: 10, color: '#FF5A3C' },
  { key: '10%+', max: Infinity, color: '#FA1E55' },
] as const

function bucketOf(gradientPct: number): number {
  if (gradientPct <= 0) return 0
  const i = BUCKETS.findIndex((b) => gradientPct <= b.max)
  return i === -1 ? BUCKETS.length - 1 : i
}

export default function GradientCard({
  segments,
  distanceM,
  ascentM,
}: {
  segments: RehearsalSegment[]
  distanceM: number
  ascentM: number
}) {
  const { locale } = useLocale()
  const de = locale === 'de'

  const model = useMemo(() => {
    if (segments.length < 4 || distanceM <= 0) return null

    // Kilometres per bucket, from the segments' own lengths.
    const km = BUCKETS.map(() => 0)
    let maxGradient = 0
    for (let i = 0; i < segments.length; i++) {
      const end = i + 1 < segments.length ? segments[i + 1].start_m : distanceM
      const len = Math.max(0, end - segments[i].start_m)
      const g = segments[i].gradient_pct
      if (g > maxGradient) maxGradient = g
      // Descents are not a gradient the rider works against; bucketing them
      // into "≤1%" would claim a route was flatter than it rode.
      if (g > 0) km[bucketOf(g)] += len / 1000
    }

    // One column per slice of the route: height from elevation, colour from
    // the steepest gradient inside it (a 200 m wall does not disappear into
    // the average of the kilometre around it).
    const cols: { frac: number; bucket: number }[] = []
    for (let i = 0; i < COLS; i++) {
      const from = (i / COLS) * distanceM
      const to = ((i + 1) / COLS) * distanceM
      const inCol = segments.filter((s) => s.start_m >= from && s.start_m < to)
      const src = inCol.length > 0 ? inCol : [segments[Math.min(segments.length - 1, Math.floor((i / COLS) * segments.length))]]
      const elev = src.reduce((a, s) => a + (s.elevation_m ?? 0), 0) / src.length
      const steepest = Math.max(...src.map((s) => s.gradient_pct))
      cols.push({ frac: elev, bucket: bucketOf(steepest) })
    }
    const lo = Math.min(...cols.map((c) => c.frac))
    const hi = Math.max(...cols.map((c) => c.frac))
    const span = hi - lo

    // The high point. The design labels it with a climb NAME ("KESSELBERG ·
    // 858 M"); the rehearsal data carries no climb names — only ids, lengths
    // and gradients — so this states the altitude alone rather than inventing
    // a landmark. A made-up name on a real map is worse than no name.
    const peakIdx = cols.reduce((best, c, i) => (c.frac > cols[best].frac ? i : best), 0)

    return {
      cols: cols.map((c) => ({
        h: span < 1 ? 0.45 : 0.12 + ((c.frac - lo) / span) * 0.88,
        color: BUCKETS[c.bucket].color,
      })),
      km,
      maxGradient,
      peakIdx,
      peakElev: hi,
    }
  }, [segments, distanceM])

  // No profile to paint. The map above already shows the road.
  if (!model) return null

  return (
    <section
      className="rounded-[20px] flex flex-col"
      style={{ ...penCard, padding: 16, gap: 12 }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          style={penEyebrow('#FFFFFFB3')}
        >
          {de ? 'STEIGUNGSPROFIL' : 'GRADIENT PROFILE'}
        </span>
        <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
          {`${Math.round(ascentM).toLocaleString(de ? 'de' : 'en')} HM · MAX ${Math.round(model.maxGradient)}%`}
        </span>
      </div>

      <div style={{ position: 'relative' }}>
        {/* Summit label, pinned over its own column. */}
        <div
          style={{
            position: 'absolute',
            left: `${((model.peakIdx + 0.5) / COLS) * 100}%`,
            transform: 'translateX(-50%)',
            top: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            pointerEvents: 'none',
          }}
        >
          <span
            className="num-mono whitespace-nowrap"
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#FFFFFFB3' }}
          >
            {`${Math.round(model.peakElev)} M`}
          </span>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: '#FFFFFF' }} />
        </div>

        <div className="flex items-end" style={{ height: 104, gap: 2, paddingTop: 22 }}>
          {model.cols.map((c, i) => (
            <div
              key={i}
              style={{ flex: 1, height: `${Math.round(c.h * 100)}%`, background: c.color, borderRadius: 2 }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
          <span key={i} className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>
            {i === 4 ? `${Math.round(distanceM / 1000)} KM` : Math.round((distanceM / 1000) * f)}
          </span>
        ))}
      </div>

      {/* Kilometres per bucket — the fact the profile cannot show. */}
      <div className="flex overflow-hidden" style={{ height: 8, borderRadius: 4, gap: 2 }}>
        {BUCKETS.map((b, i) =>
          model.km[i] > 0.05 ? (
            <div key={b.key} style={{ flexGrow: model.km[i], flexBasis: 0, background: b.color }} />
          ) : null,
        )}
      </div>

      <div className="flex" style={{ gap: 10 }}>
        {BUCKETS.map((b, i) => (
          <div key={b.key} className="flex flex-col" style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <span className="inline-flex items-center" style={{ gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: b.color, flexShrink: 0 }} />
              <span style={{ fontSize: 9.5, color: '#FFFFFFD9', whiteSpace: 'nowrap' }}>{b.key}</span>
            </span>
            <span className="num-mono" style={{ fontSize: 9.5, color: 'var(--color-muted)' }}>
              {`${model.km[i] < 0.1 ? 0 : model.km[i].toFixed(model.km[i] < 10 ? 1 : 0)} km`}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
