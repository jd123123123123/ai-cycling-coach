import { useMemo } from 'react'
import { useLocale } from '../../contexts/LocaleContext'
import type { RehearsalSegment } from '../../api/rehearsal'

/**
 * InclineDistribution — how many kilometres of this route sit at each gradient.
 *
 * The elevation profile above answers "where are the climbs". This answers a
 * different and more actionable question: "how much of the day is actually
 * steep". A route with 1,200 m of climbing spread over 40 km of 3% is a
 * completely different ride from the same 1,200 m packed into 8 km at 9%, and
 * the profile alone does not separate them at phone width — the second looks
 * like a spike and the first like a hill, but neither tells you the kilometres.
 *
 * Buckets are the ones a rider already thinks in: flat, false flat, a real
 * climb, steep, and the wall. They are stated in KM rather than percentages
 * because "4 km at 7-10%" is a plan and "5% of the route" is trivia.
 */

const BUCKETS = [
  { key: '≤1%', max: 1, color: '#39434F' },
  { key: '1–4%', max: 4, color: '#16E08A' },
  { key: '4–7%', max: 7, color: '#FFB020' },
  { key: '7–10%', max: 10, color: '#FF5A3C' },
  { key: '10%+', max: Infinity, color: '#FA1E55' },
] as const

export default function InclineDistribution({
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
    if (segments.length < 2) return null
    const km = BUCKETS.map(() => 0)
    let maxGradient = 0
    for (let i = 0; i < segments.length; i++) {
      const start = segments[i].start_m
      const end = i + 1 < segments.length ? segments[i + 1].start_m : distanceM
      const len = Math.max(0, end - start)
      // Only the UPHILL share is bucketed. Descents are not a gradient the
      // rider works against, and folding them into "≤1%" would quietly claim
      // a route was flatter than it rode.
      const g = segments[i].gradient_pct
      if (g > maxGradient) maxGradient = g
      if (g <= 0) continue
      const idx = BUCKETS.findIndex((b) => g <= b.max)
      km[idx === -1 ? BUCKETS.length - 1 : idx] += len / 1000
    }
    const total = km.reduce((a, b) => a + b, 0)
    if (total <= 0) return null
    return { km, total, maxGradient }
  }, [segments, distanceM])

  // No gradients measured → no distribution. The profile above already says
  // what is known about this road.
  if (!model) return null

  return (
    <section className="flex flex-col" style={{ gap: 10 }}>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="eyebrow"
          style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-ink-2)' }}
        >
          {de ? 'STEIGUNGSPROFIL' : 'GRADIENT PROFILE'}
        </span>
        <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
          {`${Math.round(ascentM).toLocaleString(de ? 'de' : 'en')} ${de ? 'HM' : 'HM'} · MAX ${Math.round(model.maxGradient)}%`}
        </span>
      </div>

      {/* One bar, proportional. Empty buckets contribute nothing rather than a
          sliver, so "no 10%+ at all" reads as absence, not as a thin stripe. */}
      <div className="flex overflow-hidden" style={{ height: 8, borderRadius: 4, gap: 2 }}>
        {BUCKETS.map((b, i) =>
          model.km[i] > 0.05 ? (
            <div
              key={b.key}
              style={{ flexGrow: model.km[i], flexBasis: 0, background: b.color }}
            />
          ) : null,
        )}
      </div>

      <div className="flex flex-wrap" style={{ gap: '8px 14px' }}>
        {BUCKETS.map((b, i) => (
          <div key={b.key} className="flex flex-col" style={{ gap: 2 }}>
            <span className="inline-flex items-center" style={{ gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: b.color }} />
              <span style={{ fontSize: 10, color: '#FFFFFFD9' }}>{b.key}</span>
            </span>
            <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>
              {`${model.km[i] < 0.1 ? 0 : model.km[i].toFixed(model.km[i] < 10 ? 1 : 0)} km`}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
