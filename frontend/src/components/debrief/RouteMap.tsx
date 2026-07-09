import { useMemo, useState } from 'react'
import type { RoutePoint } from '../../api/debrief'
import { useLocale } from '../../contexts/LocaleContext'

const VIEW_W = 320
const VIEW_H = 320
const PAD = 20

// green → amber → red across the effort range, so the course itself shows where
// the athlete rode easy vs where they buried themselves.
const LOW = [48, 209, 88]    // #30D158
const MID = [255, 159, 10]   // #FF9F0A
const HIGH = [255, 69, 58]   // #FF453A
function effortColor(t: number): string {
  const c = t < 0.5
    ? LOW.map((lo, i) => lo + (MID[i] - lo) * (t / 0.5))
    : MID.map((mid, i) => mid + (HIGH[i] - mid) * ((t - 0.5) / 0.5))
  return `rgb(${c.map((v) => Math.round(v)).join(',')})`
}

/** Self-contained SVG route map, coloured by power. No tiles/network. */
export default function RouteMap({ route }: { route: RoutePoint[] }) {
  const { locale } = useLocale(); const de = locale === 'de'
  const [hover, setHover] = useState<number | null>(null)

  const model = useMemo(() => {
    if (route.length < 2) return null
    const lats = route.map((p) => p.lat), lngs = route.map((p) => p.lng)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const latSpan = maxLat - minLat || 1e-6, lngSpan = maxLng - minLng || 1e-6
    // Keep geographic aspect ratio so the shape isn't stretched.
    const scale = Math.min((VIEW_W - PAD * 2) / lngSpan, (VIEW_H - PAD * 2) / latSpan)
    const offX = (VIEW_W - lngSpan * scale) / 2
    const offY = (VIEW_H - latSpan * scale) / 2
    const pts = route.map((p) => [
      offX + (p.lng - minLng) * scale,
      offY + (maxLat - p.lat) * scale,
    ] as [number, number])

    const powers = route.map((p) => p.power).filter((v): v is number => v != null && isFinite(v))
    const sorted = [...powers].sort((a, b) => a - b)
    const pct = (q: number) => sorted.length ? sorted[Math.floor(q * (sorted.length - 1))] : 0
    const lo = pct(0.1), hi = pct(0.9) || lo + 1
    const colorAt = (i: number) => {
      const p = route[i].power
      if (p == null) return 'rgba(235,235,245,0.35)'
      return effortColor(Math.max(0, Math.min(1, (p - lo) / (hi - lo))))
    }
    return { pts, colorAt }
  }, [route])

  if (!model) return null
  const { pts, colorAt } = model
  const [sx, sy] = pts[0]
  const [ex, ey] = pts[pts.length - 1]

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * VIEW_W
    const y = ((e.clientY - rect.top) / rect.height) * VIEW_H
    let best = 0, bestD = Infinity
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i][0] - x) ** 2 + (pts[i][1] - y) ** 2
      if (d < bestD) { bestD = d; best = i }
    }
    setHover(bestD < 900 ? best : null)
  }

  const hoverPt = hover != null ? pts[hover] : null
  const hoverPow = hover != null ? route[hover].power : null

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-auto"
        style={{ maxHeight: 320, aspectRatio: '1 / 1' }}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={de ? 'Streckenkarte, nach Leistung eingefärbt' : 'Route map, coloured by power'}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* faint base line for continuity under the coloured segments */}
        <polyline
          points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5}
          strokeLinejoin="round" strokeLinecap="round"
        />
        {pts.slice(1).map(([x, y], i) => {
          const [px, py] = pts[i]
          return (
            <line key={i} x1={px} y1={py} x2={x} y2={y}
              stroke={colorAt(i + 1)} strokeWidth={3}
              strokeLinecap="round" opacity={0.95} />
          )
        })}
        {/* start / finish */}
        <circle cx={sx} cy={sy} r={6} fill="var(--color-paper)" stroke="var(--color-good)" strokeWidth={2.5} />
        <circle cx={ex} cy={ey} r={6} fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth={2.5} />
        {hoverPt && (
          <circle cx={hoverPt[0]} cy={hoverPt[1]} r={5.5} fill="var(--color-ink)" stroke="var(--color-paper)" strokeWidth={2} />
        )}
      </svg>

      {/* caption + legend */}
      <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="num-mono" style={{ fontSize: 9, color: 'var(--color-muted)', letterSpacing: '0.08em' }}>{de ? 'LOCKER' : 'EASY'}</span>
          <span style={{ width: 44, height: 4, borderRadius: 2, background: 'linear-gradient(90deg,#30D158,#FF9F0A,#FF453A)' }} />
          <span className="num-mono" style={{ fontSize: 9, color: 'var(--color-muted)', letterSpacing: '0.08em' }}>{de ? 'VOLL' : 'HARD'}</span>
        </div>
        <span className="num-mono" style={{ fontSize: 9.5, color: hoverPow != null ? 'var(--color-ink)' : 'var(--color-muted)' }}>
          {hoverPow != null ? `${Math.round(hoverPow)} W` : (de ? 'Farbe = Leistung' : 'colour = power')}
        </span>
      </div>
    </div>
  )
}
