/**
 * RouteProfile — the elevation chart from V3 · Ride Detail (Sunrise)'s ElevCard.
 *
 * An area profile plus a gradient strip beneath it. The strip is the part that
 * earns its space: the area silhouette tells you WHERE the climbs are, and the
 * strip tells you how steep each one is, on the same x-axis — so a rider can see
 * that the lump at 40 km is the 9% one without reading a number.
 *
 * Colours are the app's effort scale, the same one ClimbList uses for gradient:
 * under 4% a drag, 4-7% a climb, 7-10% hurts, over 10% a wall. Sharing that
 * scale means a gradient reads the same everywhere in the app.
 *
 * The pen also shows a surface breakdown (asphalt/gravel/path) under the strip.
 * GPX carries no surface tags, so there is no honest source for it and it is
 * omitted rather than guessed — see the crew-event page for the same decision
 * about waypoints and amenities.
 */
import { useMemo } from 'react'
import { useLocale } from '../../contexts/LocaleContext'
import { gradeColor } from '../../utils/climbList'
import { GRADE_WINDOW_M, toProfilePoints, rollingGrades } from '../../utils/routeProfile'

const W = 318
const H = 150

export default function RouteProfile({ profile }: { profile: [number, number][] | null | undefined }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const pts = useMemo(() => toProfilePoints(profile), [profile])

  const model = useMemo(() => {
    if (pts.length < 2) return null
    const totalM = pts[pts.length - 1].distM || 1
    const eles = pts.map((p) => p.eleM)
    const minE = Math.min(...eles)
    const maxE = Math.max(...eles)
    const span = maxE - minE || 1
    // Headroom so the peak isn't glued to the top edge.
    const x = (d: number) => (d / totalM) * W
    const y = (e: number) => H - 10 - ((e - minE) / span) * (H - 26)
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.distM).toFixed(1)} ${y(p.eleM).toFixed(1)}`).join(' ')
    const area = `${line} L${W} ${H} L0 ${H} Z`
    const grades = rollingGrades(pts)
    return { totalM, minE, maxE, line, area, grades }
  }, [pts])

  if (!model) {
    return (
      <div className="grid place-items-center rounded-[14px]" style={{ minHeight: 96, background: 'var(--color-surface-2)', border: '1px dashed var(--color-rule)' }}>
        <span style={{ fontSize: 12, color: 'var(--color-muted)', textAlign: 'center', padding: '0 16px', lineHeight: 1.4 }}>
          {de
            ? 'Diese GPX-Datei enthält keine Höhendaten — kein Höhenprofil möglich.'
            : 'This GPX file carries no elevation data — no profile to draw.'}
        </span>
      </div>
    )
  }

  const { totalM, line, area, grades } = model
  const km = totalM / 1000
  // Four evenly spaced ticks plus the total, as the pen's axis does.
  const ticks = [0, 0.25, 0.5, 0.75].map((f) => Math.round(km * f))

  return (
    <div className="flex flex-col gap-2.5">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', height: H }} role="img"
        aria-label={de ? `Höhenprofil über ${Math.round(km)} Kilometer` : `Elevation profile over ${Math.round(km)} kilometres`}>
        <defs>
          <linearGradient id="rpFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF5A3C" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#FF5A3C" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#rpFill)" />
        <path d={line} fill="none" stroke="#FF5A3C" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>

      {/* Gradient strip — one slice per sample, coloured by rolling gradient. */}
      <div className="flex w-full overflow-hidden" style={{ height: 9, borderRadius: 3 }}>
        {pts.slice(1).map((p, i) => {
          const wPct = ((p.distM - pts[i].distM) / totalM) * 100
          return <span key={i} style={{ width: `${wPct}%`, background: gradeColor(Math.abs(grades[i + 1] ?? 0)), minWidth: 0 }} />
        })}
      </div>

      <div className="flex justify-between">
        {[...ticks, Math.round(km)].map((t, i) => (
          <span key={i} className="num-mono" style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-muted)' }}>
            {t}{i === 4 ? ' km' : ''}
          </span>
        ))}
      </div>
      {/* Legend for the strip, so the colours mean something stated rather than
          implied. Mirrors the bands in utils/climbList. */}
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        {[
          { c: gradeColor(2), l: '< 4%' },
          { c: gradeColor(5), l: '4–7%' },
          { c: gradeColor(8), l: '7–10%' },
          { c: gradeColor(12), l: '> 10%' },
        ].map((z) => (
          <span key={z.l} className="inline-flex items-center gap-1.5">
            <span style={{ width: 10, height: 10, borderRadius: 3, background: z.c }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>{z.l}</span>
          </span>
        ))}
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>
          {de ? `· Steigung über ${GRADE_WINDOW_M} m` : `· gradient over ${GRADE_WINDOW_M} m`}
        </span>
      </div>
    </div>
  )
}
