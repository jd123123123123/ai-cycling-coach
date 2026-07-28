/**
 * ClimbList — the climbs of a ride, each as a row you can read at a glance.
 *
 * Why it exists. "Anstieg & Tempo" used to be four equal-weight tiles, of which
 * VAM and max-gradient were a single number each — so a Dolomites day with four
 * passes and a flat Oldenburg loop with one 13-metre bump produced the same
 * shaped card, and the ride's actual climbing story was nowhere. For an athlete
 * whose goal event is a mountain gran fondo, that is the most important part of
 * a ride to be able to review.
 *
 * Each row carries the four things that describe a climb: how long it took, how
 * much it gained, how steep it averaged, and how fast the athlete went UP —
 * VAM, which is the number climbers actually compare. A gradient bar gives the
 * list a silhouette so the hard ones stand out without reading digits.
 *
 * Only real climbs are passed in (the caller filters on duration/gain); this
 * component renders whatever it is given.
 */
import { Mountain, Zap } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import { gradeColor, gradeBarFrac, categoryLabel } from '../../utils/climbList'

export interface ClimbRow {
  duration_s: number
  distance_m: number
  elev_gain_m: number
  avg_grade_pct: number
  vam_m_per_h: number | null
  avg_power: number | null
  /** Backend climb category: 'hc' | '1' … '4' | 'uncat'. */
  category: string
}

function fmtDur(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`
}

export default function ClimbList({ climbs }: { climbs: ClimbRow[] }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  if (climbs.length === 0) return null

  const totalGain = climbs.reduce((a, c) => a + (c.elev_gain_m ?? 0), 0)
  const bestVam = climbs.reduce<number | null>(
    (a, c) => (c.vam_m_per_h != null && (a == null || c.vam_m_per_h > a) ? c.vam_m_per_h : a), null)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>
          {climbs.length} {de ? (climbs.length === 1 ? 'Anstieg' : 'Anstiege') : (climbs.length === 1 ? 'climb' : 'climbs')}
          {' · '}{Math.round(totalGain)} {de ? 'Hm' : 'm'}
        </span>
        {bestVam != null && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>
            {de ? 'beste VAM' : 'best VAM'} <span className="num-mono" style={{ color: 'var(--color-ink)', fontWeight: 700 }}>{Math.round(bestVam)}</span> m/h
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {climbs.map((c, i) => {
          const color = gradeColor(c.avg_grade_pct)
          const cat = categoryLabel(c.category)
          return (
            <div key={i} className="flex flex-col gap-2 rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: '12px 13px' }}>
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 grid place-items-center rounded-[9px]" style={{ width: 30, height: 30, background: `color-mix(in srgb, ${color} 18%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 36%, transparent)` }}>
                  <Mountain size={15} strokeWidth={2.1} style={{ color }} />
                </span>
                <div className="flex flex-col gap-0 min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="num-display" style={{ fontSize: 17, color: 'var(--color-ink)', lineHeight: 1.1 }}>
                      {Math.round(c.elev_gain_m)} {de ? 'Hm' : 'm'}
                    </span>
                    <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color }}>{c.avg_grade_pct.toFixed(1)}%</span>
                    {cat && (
                      <span className="rounded-full" style={{ padding: '1px 6px', background: `color-mix(in srgb, ${color} 20%, transparent)`, fontSize: 9.5, fontWeight: 800, color }}>{cat}</span>
                    )}
                  </span>
                  <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                    {(c.distance_m / 1000).toFixed(1)} km · {fmtDur(c.duration_s)}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-0 shrink-0">
                  {c.vam_m_per_h != null && (
                    <span className="flex items-baseline gap-1">
                      <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)', lineHeight: 1.1 }}>{Math.round(c.vam_m_per_h)}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-exercise)' }}>m/h</span>
                    </span>
                  )}
                  {c.avg_power != null && (
                    <span className="inline-flex items-center gap-1" style={{ fontSize: 10.5, color: 'var(--color-muted)' }}>
                      <Zap size={10} strokeWidth={2.4} />
                      <span className="num-mono" style={{ fontWeight: 700 }}>{Math.round(c.avg_power)}</span> W
                    </span>
                  )}
                </div>
              </div>
              {/* Gradient silhouette — the list's shape, so the wall stands out
                  from the drag without reading a single digit. */}
              <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: 'var(--color-surface-3)' }}>
                <div style={{ width: `${gradeBarFrac(c.avg_grade_pct) * 100}%`, height: '100%', borderRadius: 999, background: color }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
