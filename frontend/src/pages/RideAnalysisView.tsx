/**
 * RideAnalysisView — per-ride analysis screen, rebuilt 1:1 from the WHOOP-style
 * "Screen · Ride Analysis" pen. A scannable vertical stack of cards driven
 * entirely by real backend data (useRaceDebrief + usePowerProfile), in the
 * pen's exact top-to-bottom order:
 *   1 Ride header · 2 Summary strip · 3 Route & elevation · 4 Power hero (coral)
 *   5 Power zones · 6 Power curve · 7 Heart rate · 8 Climbing & speed
 *   9 Fuel · 10 Segments & peak efforts · 11 Coach insights (coral)
 * The pen's "Cadence & Pedaling" card is omitted — the debrief API exposes no
 * cadence / pedal-balance / torque stream, and the rules forbid faked numbers.
 * Cards whose data is entirely null are likewise omitted.
 */
import { useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { parseISO, format } from 'date-fns'
import { de as deLocale } from 'date-fns/locale'
import {
  Bike, Map as MapIcon, Mountain, TrendingUp, Zap, BarChart3, LineChart, Star,
  HeartPulse, Utensils, Flag, Award, Lightbulb, Heart, Clock, Gauge, Activity,
  CheckCircle2, Scale, BatteryMedium, Route as RouteIcon,
} from 'lucide-react'
import { useRaceDebrief } from '../hooks/useRaceDebrief'
import { usePowerProfile } from '../hooks/usePowerProfile'
import { useAthleteProfile } from '../hooks/useAthleteProfile'
import { useStreamAnalysis } from '../hooks/useStreamAnalysis'
import { useLocale } from '../contexts/LocaleContext'
import HoverBars from '../components/ui/HoverBars'

/** Project a lat/lng polyline into an SVG path fitted to a WxH box (north up,
 *  aspect-preserved, padded). Returns the `d` string + fitted point list. */
function routePath(poly: [number, number][], w: number, h: number, pad = 10): { d: string; pts: [number, number][] } | null {
  if (!poly || poly.length < 2) return null
  const lats = poly.map((p) => p[0]), lngs = poly.map((p) => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  // Mercator-ish: scale lng by cos(lat) so shapes aren't stretched.
  const midLat = (minLat + maxLat) / 2
  const kx = Math.cos((midLat * Math.PI) / 180)
  const gw = (maxLng - minLng) * kx || 1e-6
  const gh = (maxLat - minLat) || 1e-6
  const scale = Math.min((w - 2 * pad) / gw, (h - 2 * pad) / gh)
  const offX = pad + ((w - 2 * pad) - gw * scale) / 2
  const offY = pad + ((h - 2 * pad) - gh * scale) / 2
  const pts = poly.map(([lat, lng]): [number, number] => [
    offX + (lng - minLng) * kx * scale,
    offY + (maxLat - lat) * scale, // flip y → north up
  ])
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  return { d, pts }
}

const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const
const cardCls = 'rounded-[24px] p-5 flex flex-col gap-[14px]'

function fmtHM(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`
}

function fmtMin(s: number): string {
  const m = Math.round(s / 60)
  if (m >= 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
  return `${m}m`
}

/** mm:ss (or h:mm:ss past an hour) — used by the HR time-in-zone breakdown. */
function fmtClock(s: number): string {
  const t = Math.round(s)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = t % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

/** Duration set for the ride mean-maximal power curve (seconds → short label). */
const MMP_DURATIONS: { s: number; label: string }[] = [
  { s: 1, label: '1s' }, { s: 5, label: '5s' }, { s: 15, label: '15s' }, { s: 30, label: '30s' },
  { s: 60, label: '1m' }, { s: 120, label: '2m' }, { s: 300, label: '5m' }, { s: 480, label: '8m' },
  { s: 600, label: '10m' }, { s: 1200, label: '20m' }, { s: 1800, label: '30m' }, { s: 3600, label: '60m' },
]

interface MmpPoint { s: number; label: string; w: number; pr: boolean }

/** Ride mean-maximal power curve: SVG area+line chart with an optional FTP
 *  reference line. Hover (or drag) picks the nearest duration → tooltip. */
function PowerCurveChart({ rows, ftp, de }: { rows: MmpPoint[]; ftp: number | null; de: boolean }) {
  const [active, setActive] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const W = 320, H = 160, padT = 16, padR = 12, padB = 26, padL = 38
  const innerW = W - padL - padR, innerH = H - padT - padB
  const yMax = Math.max(...rows.map((r) => r.w), ftp ?? 0) * 1.1 || 1
  const x = (i: number) => (rows.length === 1 ? padL + innerW / 2 : padL + (i * innerW) / (rows.length - 1))
  const y = (w: number) => padT + innerH * (1 - Math.min(1, Math.max(0, w) / yMax))
  const baseline = padT + innerH
  const linePts = rows.map((r, i) => `${x(i).toFixed(1)},${y(r.w).toFixed(1)}`)
  const areaD = `M${x(0).toFixed(1)},${baseline} L${linePts.join(' L')} L${x(rows.length - 1).toFixed(1)},${baseline} Z`
  const lineD = `M${linePts.join(' L')}`
  const ftpY = ftp != null && ftp > 0 ? y(ftp) : null

  function pick(clientX: number) {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const fx = ((clientX - rect.left) / rect.width) * W
    let best = 0, bd = Infinity
    rows.forEach((_, i) => { const d = Math.abs(x(i) - fx); if (d < bd) { bd = d; best = i } })
    setActive(best)
  }

  const act = active != null ? rows[active] : null

  return (
    <div
      ref={wrapRef}
      className="relative select-none"
      style={{ width: '100%', cursor: 'crosshair' }}
      onPointerMove={(e) => pick(e.clientX)}
      onPointerDown={(e) => pick(e.clientX)}
      onPointerLeave={() => setActive(null)}
    >
      {act && (
        <div
          className="absolute z-20 pointer-events-none flex flex-col items-center"
          style={{ left: `${(x(active!) / W) * 100}%`, top: `${(y(act.w) / H) * 100}%`, transform: 'translate(-50%, -100%)', marginTop: -8 }}
        >
          <div className="rounded-[10px] px-2.5 py-1.5 flex flex-col items-center gap-0.5 whitespace-nowrap"
            style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-rule)', boxShadow: '0 6px 18px rgba(0,0,0,0.45)' }}>
            <span className="num-display" style={{ fontSize: 14, lineHeight: 1, color: act.pr ? 'var(--color-accent)' : 'var(--color-ink)' }}>{Math.round(act.w)} W</span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-muted)' }}>{act.label}{act.pr ? (de ? ' · Bestzeit' : ' · best') : ''}</span>
          </div>
          <span style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid var(--color-surface-3)' }} />
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', height: 'auto' }}>
        <defs>
          <linearGradient id="mmpFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* y grid: max + midpoint */}
        {[yMax, yMax / 2].map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="var(--color-rule)" strokeWidth={1} opacity={0.5} />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" style={{ fontSize: 9, fill: 'var(--color-muted)' }}>{Math.round(v)}</text>
          </g>
        ))}
        <path d={areaD} fill="url(#mmpFill)" />
        <path d={lineD} fill="none" stroke="var(--color-accent)" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        {ftpY != null && (
          <>
            <line x1={padL} y1={ftpY} x2={W - padR} y2={ftpY} stroke="var(--color-ink-2)" strokeWidth={1.4} strokeDasharray="5 4" opacity={0.8} />
            <text x={W - padR} y={ftpY - 4} textAnchor="end" style={{ fontSize: 9.5, fontWeight: 700, fill: 'var(--color-ink-2)' }}>FTP {Math.round(ftp!)}W</text>
          </>
        )}
        {rows.map((r, i) => (
          <circle key={r.s} cx={x(i)} cy={y(r.w)} r={r.pr ? 3.6 : 2.4}
            fill={r.pr ? 'var(--color-accent)' : 'var(--color-paper)'} stroke="var(--color-accent)" strokeWidth={1.6} />
        ))}
        {active != null && (
          <circle cx={x(active)} cy={y(rows[active].w)} r={5} fill="none" stroke="var(--color-accent)" strokeWidth={2} />
        )}
        {rows.map((r, i) => (
          <text key={r.s} x={x(i)} y={H - 8} textAnchor="middle" style={{ fontSize: 8.5, fontWeight: 600, fill: 'var(--color-muted)' }}>{r.label}</text>
        ))}
      </svg>
    </div>
  )
}

function downsample<T>(arr: T[], target: number): T[] {
  if (arr.length <= target) return arr
  const step = arr.length / target
  const out: T[] = []
  for (let i = 0; i < target; i++) out.push(arr[Math.floor(i * step)])
  return out
}

function SectionHead({ icon, label, color = 'var(--color-ink-2)', right }: {
  icon: React.ReactNode; label: string; color?: string; right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-[7px]">
        <span style={{ color, display: 'inline-flex' }}>{icon}</span>
        <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color }}>{label}</span>
      </span>
      {right}
    </div>
  )
}

/** Metric cell used by the Climbing & Speed grid (pen ref component p73BZ). */
function MetricCell({ icon, iconColor, value, unit, label }: {
  icon: React.ReactNode; iconColor: string; value: string; unit: string; label: string
}) {
  return (
    <div className="flex-1 flex flex-col gap-1 rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: '12px 11px' }}>
      <span style={{ color: iconColor, display: 'inline-flex' }}>{icon}</span>
      <span className="flex items-baseline gap-0.5">
        <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)', lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{unit}</span>}
      </span>
      <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.06em', color: 'var(--color-muted)' }}>{label}</span>
    </div>
  )
}

export default function RideAnalysisView() {
  const { id } = useParams()
  const activityId = Number(id)
  const { locale } = useLocale()
  const de = locale === 'de'
  const dfLocale = de ? { locale: deLocale } : undefined
  const nf = (n: number) => n.toLocaleString(de ? 'de' : 'en')

  const { data, isLoading, isError } = useRaceDebrief(Number.isFinite(activityId) ? activityId : undefined)
  const { data: power } = usePowerProfile()
  const { data: athlete } = useAthleteProfile()
  // Real per-second stream analysis: GPS route, elevation, HR zones, cycling dynamics.
  const { data: sa } = useStreamAnalysis(Number.isFinite(activityId) ? activityId : undefined)
  const bd = sa?.bike_dynamics
  const route = useMemo(() => (sa?.gps?.polyline ? routePath(sa.gps.polyline, 320, 150) : null), [sa])
  const routeKind = sa?.route_kind

  const header = data?.header
  // Route line tinted by ride intensity (IF).
  const routeColor = (() => {
    const iff = header?.if_ ?? null
    if (iff == null) return 'var(--color-strain)'
    if (iff < 0.75) return 'var(--color-recovery)'
    if (iff < 0.85) return 'var(--color-stand)'
    if (iff < 0.95) return 'var(--color-amber)'
    return 'var(--color-accent)'
  })()
  const story = data?.story ?? null
  const efficiency = data?.efficiency ?? null
  const pacing = data?.pacing ?? null
  // Cap to the biggest climbs — the debrief can return many micro-climbs.
  const climbs = useMemo(
    () => [...(data?.climbs ?? [])].sort((a, b) => (b.elev_gain_m ?? 0) - (a.elev_gain_m ?? 0)).slice(0, 8),
    [data],
  )
  const fueling = data?.fueling ?? null
  const verdict = data?.verdict ?? null
  const wko = data?.wko ?? null

  // Derived power figures
  const powerStats = useMemo(() => {
    const p = (story?.power ?? []).filter((x): x is number => typeof x === 'number' && x > 0)
    const avg = p.length ? Math.round(p.reduce((a, b) => a + b, 0) / p.length) : null
    const max = p.length ? Math.round(Math.max(...p)) : null
    const np = header?.np_watts ?? null
    const vi = pacing?.variability_index ?? (np && avg ? np / avg : null)
    const kj = header?.total_kj ?? null
    const eftp = wko?.mftp_watts ?? power?.eftp_watts ?? power?.cp_watts ?? null
    return { avg, max, np, vi, kj, eftp }
  }, [story, header, pacing, wko, power])

  // Elevation profile bars from the altitude stream. `frac` drives bar height
  // (normalized min→max to show the profile shape); `m` is the real altitude.
  const elevBars = useMemo(() => {
    const alt = (story?.altitude ?? []).filter((x): x is number => typeof x === 'number')
    if (alt.length < 4) return null
    const ds = downsample(alt, 42)
    const min = Math.min(...ds)
    const max = Math.max(...ds)
    const span = max - min || 1
    return ds.map((a, i) => ({ m: a, frac: (a - min) / span, pct: Math.round((i / (ds.length - 1)) * 100) }))
  }, [story])

  // Max grade across climbs + route points
  const maxGrade = useMemo(() => {
    const g: number[] = []
    for (const c of data?.climbs ?? []) if (typeof c.avg_grade_pct === 'number') g.push(c.avg_grade_pct)
    for (const r of story?.route ?? []) if (typeof r.grade === 'number') g.push(r.grade)
    return g.length ? Math.max(...g) : null
  }, [data, story])

  // Power zones from pacing.zone_time_pct
  const powerZones = useMemo(() => {
    const zt = pacing?.zone_time_pct
    if (!zt) return null
    const colors = ['var(--color-strain)', 'var(--color-recovery)', 'var(--color-exercise)', 'var(--color-amber)', '#FF7A3C', 'var(--color-accent)', 'var(--color-move)']
    const namesEn = ['Active Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO₂ Max', 'Anaerobic', 'Neuromuscular']
    const namesDe = ['Aktive Erholung', 'Grundlage', 'Tempo', 'Schwelle', 'VO₂max', 'Anaerob', 'Neuromuskulär']
    const move = header?.moving_time_s ?? 0
    const rows: { key: string; label: string; name: string; pct: number; color: string; time: string }[] = []
    for (let z = 1; z <= 7; z++) {
      const pct = zt[`z${z}`] ?? zt[`Z${z}`] ?? zt[String(z)]
      if (typeof pct === 'number') rows.push({
        key: `z${z}`, label: `Z${z}`, name: (de ? namesDe : namesEn)[z - 1], pct,
        color: colors[z - 1], time: move ? fmtMin((pct / 100) * move) : '—',
      })
    }
    return rows.length ? rows : null
  }, [pacing, header, de])

  const zoneHardPct = useMemo(() => {
    if (!powerZones) return null
    return Math.round(powerZones.filter((z) => Number(z.label.slice(1)) >= 4).reduce((a, z) => a + z.pct, 0))
  }, [powerZones])

  // PR durations (for the "new best" star on the power curve)
  const prDurations = useMemo(
    () => new Set((data?.efforts ?? []).filter((e) => e.is_pr).map((e) => e.duration_s)),
    [data],
  )

  // Ride mean-maximal power curve — the best rolling-average watts this ride held
  // for each target duration, computed from this ride's own power stream
  // (story.power, timestamped by story.t). O(n) via a prefix-sum sliding window.
  const rideMMP = useMemo(() => {
    const p = story?.power
    if (!p || p.length < 2) return null
    // Need real power (a stream of all-zeros = no power meter) → honest empty state.
    if (!p.some((v) => typeof v === 'number' && v > 0)) return null
    const n = p.length
    const t = story?.t
    const span = t && t.length === n && t[n - 1] > t[0] ? t[n - 1] - t[0] : n - 1
    const dt = span > 0 ? span / (n - 1) : 1 // sampling interval (s), usually ~1
    const rideLen = span > 0 ? span : n // ride length in seconds
    const prefix = new Float64Array(n + 1)
    for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + (typeof p[i] === 'number' ? (p[i] as number) : 0)
    const rows: MmpPoint[] = []
    for (const d of MMP_DURATIONS) {
      if (d.s > rideLen + 0.5) break // clamp durations to ride length
      const win = Math.max(1, Math.round(d.s / dt))
      if (win > n) continue
      let best = -Infinity
      for (let i = win; i <= n; i++) {
        const avg = (prefix[i] - prefix[i - win]) / win
        if (avg > best) best = avg
      }
      if (best > 0) rows.push({ s: d.s, label: d.label, w: best, pr: prDurations.has(d.s) })
    }
    return rows.length ? rows : null
  }, [story, prDurations])

  // Heart rate
  const hrStats = useMemo(() => {
    const hr = (story?.hr ?? []).filter((x): x is number => typeof x === 'number' && x > 0)
    const avg = efficiency?.avg_hr ?? (hr.length ? Math.round(hr.reduce((a, b) => a + b, 0) / hr.length) : null)
    const max = hr.length ? Math.round(Math.max(...hr)) : null
    let zones: { label: string; pct: number; color: string }[] | null = null
    if (hr.length && max) {
      const bounds = [0.68, 0.83, 0.88, 0.95]
      const buckets = [0, 0, 0, 0, 0]
      for (const v of hr) {
        const f = v / max
        if (f < bounds[0]) buckets[0]++
        else if (f < bounds[1]) buckets[1]++
        else if (f < bounds[2]) buckets[2]++
        else if (f < bounds[3]) buckets[3]++
        else buckets[4]++
      }
      const total = hr.length
      const colors = ['var(--color-recovery)', 'var(--color-strain)', 'var(--color-exercise)', 'var(--color-amber)', 'var(--color-move)']
      zones = buckets.map((b, i) => ({ label: `Z${i + 1}`, pct: (b / total) * 100, color: colors[i] }))
    }
    return { avg, max, zones, decoupling: efficiency?.decoupling_pct ?? null }
  }, [story, efficiency])

  // Heart-rate time-in-zone from this ride's HR stream (story.hr), split into 5
  // zones from the athlete's threshold. Preference:
  //   1) lthr_cycling → Coggan LTHR-based bands (fractions of LTHR):
  //        Z1 <81%  Z2 81–89%  Z3 90–94%  Z4 95–105%  Z5 >105%
  //   2) else max_heart_rate → standard %HRmax bands:
  //        Z1 <68%  Z2 68–83%  Z3 83–88%  Z4 88–95%  Z5 >95%
  //   3) else fall back to this ride's observed max HR (same %HRmax bands) so we
  //      still show the split — but omit the "% of threshold" reference caption.
  const hrZoneBreakdown = useMemo(() => {
    const hr = story?.hr
    if (!hr || !hr.length || !hr.some((v) => typeof v === 'number' && v > 0)) return null
    const n = hr.length
    const t = story?.t
    const span = t && t.length === n && t[n - 1] > t[0] ? t[n - 1] - t[0] : n - 1
    const dt = span > 0 ? span / (n - 1) : 1
    const lthr = athlete?.lthr_cycling ?? null
    const hrmax = athlete?.max_heart_rate ?? null
    let bounds: number[]
    let basis: 'lthr' | 'hrmax' | 'observed'
    let ref: number
    if (lthr && lthr > 0) {
      bounds = [0.81, 0.89, 0.94, 1.05].map((f) => f * lthr); basis = 'lthr'; ref = lthr
    } else if (hrmax && hrmax > 0) {
      bounds = [0.68, 0.83, 0.88, 0.95].map((f) => f * hrmax); basis = 'hrmax'; ref = hrmax
    } else {
      const obs = Math.max(...hr.filter((v): v is number => typeof v === 'number' && v > 0))
      if (!Number.isFinite(obs) || obs <= 0) return null
      bounds = [0.68, 0.83, 0.88, 0.95].map((f) => f * obs); basis = 'observed'; ref = obs
    }
    const secs = [0, 0, 0, 0, 0]
    for (const v of hr) {
      if (typeof v !== 'number' || v <= 0) continue
      const z = v < bounds[0] ? 0 : v < bounds[1] ? 1 : v < bounds[2] ? 2 : v < bounds[3] ? 3 : 4
      secs[z] += dt
    }
    const total = secs.reduce((a, b) => a + b, 0)
    if (total <= 0) return null
    return { secs, total, basis, ref }
  }, [story, athlete])

  const decoupleRating = useMemo(() => {
    const d = hrStats.decoupling
    if (d == null) return null
    if (d < 5) return { label: de ? 'Stark' : 'Strong', color: 'var(--color-recovery)', good: true }
    if (d < 8) return { label: de ? 'Moderat' : 'Moderate', color: 'var(--color-amber)', good: false }
    return { label: de ? 'Hoher Drift' : 'High drift', color: 'var(--color-move)', good: false }
  }, [hrStats, de])

  // Climbing & speed aggregates
  const climbSpeed = useMemo(() => {
    const speeds = (story?.speed ?? []).filter((x): x is number => typeof x === 'number' && x > 0)
    const avgSpeed = header?.avg_speed_kmh ?? (speeds.length ? (speeds.reduce((a, b) => a + b, 0) / speeds.length) * 3.6 : null)
    const maxSpeed = speeds.length ? Math.max(...speeds) * 3.6 : null
    const vam = climbs.length ? Math.max(...climbs.map((c) => c.vam_m_per_h ?? 0)) : null
    return { avgSpeed, maxSpeed, vam: vam || null, maxGrade }
  }, [story, header, climbs, maxGrade])

  // Segments & peak efforts — real power-duration peaks with PR flags.
  const efforts = useMemo(() => {
    const durLabel = (s: number) =>
      s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}min` : `${Math.round(s / 3600)}h`
    return [...(data?.efforts ?? [])]
      .filter((e) => typeof e.ride_watts === 'number' && e.ride_watts > 0)
      .sort((a, b) => a.duration_s - b.duration_s)
      .slice(0, 8)
      .map((e) => ({
        name: de ? `Bestleistung ${durLabel(e.duration_s)}` : `${durLabel(e.duration_s)} peak effort`,
        sub: e.pct_of_best != null ? `${Math.round(e.pct_of_best)}% ${de ? 'der Saisonbestleistung' : 'of season best'}` : durLabel(e.duration_s),
        watts: Math.round(e.ride_watts),
        pr: e.is_pr,
      }))
  }, [data, de])

  // Coach insight takes from the AI verdict.
  const insightTakes = useMemo(() => {
    if (!verdict) return []
    const takes: { icon: React.ReactNode; color: string; head: string; body: string }[] = []
    if (verdict.ai_verdict) takes.push({ icon: <TrendingUp size={18} strokeWidth={2.2} />, color: 'var(--color-accent)', head: de ? 'Coach-Fazit' : 'Coach take', body: verdict.ai_verdict })
    for (const t of verdict.went_well ?? []) takes.push({ icon: <Heart size={18} strokeWidth={2.2} />, color: 'var(--color-recovery)', head: de ? 'Lief gut' : 'Went well', body: t })
    for (const t of verdict.watch_out ?? []) takes.push({ icon: <Clock size={18} strokeWidth={2.2} />, color: 'var(--color-strain)', head: de ? 'Achte darauf' : 'Watch out', body: t })
    return takes.slice(0, 4)
  }, [verdict, de])

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <div className="max-w-md mx-auto px-4 pt-6 pb-28 flex flex-col gap-6">
        <Link
          to="/dashboard?tab=history"
          className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5"
          style={{ fontSize: 12.5, color: 'var(--color-ink-2)', border: '1px solid var(--color-rule)' }}
        >
          {de ? '← Zurück' : '← Back'}
        </Link>

        {isLoading && (
          <div className="flex flex-col gap-6">
            <div className="rounded-[24px] h-24 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
            <div className="rounded-[24px] h-28 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
            <div className="rounded-[24px] h-64 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
          </div>
        )}

        {isError && (
          <p style={{ color: 'var(--color-bad)', fontSize: 14 }}>
            {de ? 'Fahrtanalyse konnte nicht geladen werden.' : "Couldn't load this ride analysis."}
          </p>
        )}

        {data && header && (
          <>
            {/* 1 · Ride header */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full" style={{ padding: '5px 10px', background: 'var(--color-accent-soft)' }}>
                  <Bike size={15} strokeWidth={2.2} style={{ color: 'var(--color-accent)' }} />
                  <span className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-accent)' }}>
                    {(header.sport || (de ? 'Radfahren' : 'Road Ride')).toUpperCase()}
                  </span>
                </span>
                {header.date && (
                  <span className="num-mono" style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                    {format(parseISO(header.date), de ? 'EEE · d. MMM · HH:mm' : 'EEE · MMM d · HH:mm', dfLocale)}
                  </span>
                )}
              </div>
              <h1 className="num-display" style={{ fontSize: 28, color: 'var(--color-ink)', lineHeight: 1.1 }}>{header.title}</h1>
            </div>

            {/* 2 · Summary strip */}
            <div className="rounded-[24px] flex" style={{ ...cardStyle, padding: '16px 14px' }}>
              {([
                { v: header.distance_km != null ? header.distance_km.toFixed(1) : '—', u: 'km', l: de ? 'Distanz' : 'Distance', c: 'var(--color-strain)' },
                { v: header.moving_time_s != null ? fmtHM(header.moving_time_s) : '—', u: 'h:m', l: de ? 'Zeit' : 'Moving', c: 'var(--color-exercise)' },
                { v: header.elevation_m != null ? nf(Math.round(header.elevation_m)) : '—', u: 'm', l: de ? 'Höhe' : 'Elevation', c: 'var(--color-amber)' },
                { v: header.tss != null ? Math.round(header.tss).toString() : '—', u: 'load', l: 'TSS', c: 'var(--color-accent)' },
              ]).map((x, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-[3px]" style={i > 0 ? { borderLeft: '1px solid var(--color-rule)' } : undefined}>
                  <span className="flex items-end gap-[3px]">
                    <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)', lineHeight: 1 }}>{x.v}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: x.c, paddingBottom: 3 }}>{x.u}</span>
                  </span>
                  <span className="eyebrow" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{x.l}</span>
                </div>
              ))}
            </div>

            {/* 3 · Route & elevation */}
            {((story?.route && story.route.length > 0) || elevBars || route || routeKind === 'zwift' || routeKind === 'rouvy') && (
              <div className={cardCls} style={cardStyle}>
                <SectionHead icon={<MapIcon size={16} strokeWidth={2} />} label={de ? 'STRECKE & HÖHE' : 'ROUTE & ELEVATION'} />
                {/* Route card: real GPS route (outdoor) · virtual-world art (Zwift/ROUVY) · fallback */}
                {route && (routeKind === 'outdoor' || routeKind == null) ? (
                  <div className="relative rounded-[16px] overflow-hidden" style={{ height: 150, background: 'radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--color-recovery) 10%, var(--color-paper)) 0%, var(--color-paper) 70%)', border: '1px solid var(--color-rule)' }}>
                    <svg viewBox="0 0 320 150" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
                      <path d={route.d} fill="none" stroke={routeColor} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.28} style={{ filter: 'blur(3px)' }} />
                      <path d={route.d} fill="none" stroke={routeColor} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
                      <circle cx={route.pts[0][0]} cy={route.pts[0][1]} r={4} fill="var(--color-recovery)" stroke="var(--color-paper)" strokeWidth={1.5} />
                      <circle cx={route.pts[route.pts.length - 1][0]} cy={route.pts[route.pts.length - 1][1]} r={4} fill="var(--color-move)" stroke="var(--color-paper)" strokeWidth={1.5} />
                    </svg>
                    <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full" style={{ padding: '4px 9px', background: 'color-mix(in srgb, var(--color-paper) 78%, transparent)' }}>
                      <RouteIcon size={13} strokeWidth={2} style={{ color: routeColor }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'GPS-Route' : 'GPS route'}</span>
                    </span>
                    {climbs.length > 0 && (
                      <span className="absolute left-2.5 bottom-2.5 inline-flex items-center gap-1.5 rounded-full" style={{ padding: '5px 10px', background: 'color-mix(in srgb, var(--color-paper) 80%, transparent)' }}>
                        <Mountain size={14} strokeWidth={2} style={{ color: 'var(--color-amber)' }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink)' }}>{climbs.length} {de ? 'Anstiege' : climbs.length === 1 ? 'climb' : 'climbs'}</span>
                      </span>
                    )}
                  </div>
                ) : (routeKind === 'zwift' || routeKind === 'rouvy') ? (
                  <div className="relative rounded-[16px] overflow-hidden" style={{ height: 150, border: '1px solid var(--color-rule)', background: routeKind === 'zwift' ? 'linear-gradient(160deg, #1B2A4A 0%, #2A1B4A 55%, #0A0C0F 100%)' : 'linear-gradient(160deg, #12324A 0%, #1B3A2A 55%, #0A0C0F 100%)' }}>
                    {/* stylized virtual-world horizon + road, in the pen's flat-graphic style */}
                    <svg viewBox="0 0 320 150" width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block', position: 'absolute', inset: 0 }}>
                      <path d="M0 96 L120 70 L180 84 L240 60 L320 78 L320 150 L0 150 Z" fill={routeKind === 'zwift' ? '#F26C2A22' : '#16E08A22'} />
                      <path d="M0 110 L90 96 L160 104 L230 90 L320 100" fill="none" stroke={routeKind === 'zwift' ? '#F26C2A' : '#16E08A'} strokeWidth={2} opacity={0.5} />
                      <path d="M150 150 L172 110 L188 110 L210 150 Z" fill="color-mix(in srgb, var(--color-ink) 12%, transparent)" />
                      <line x1="180" y1="150" x2="180" y2="112" stroke="color-mix(in srgb, var(--color-ink) 30%, transparent)" strokeDasharray="4 5" strokeWidth={2} />
                    </svg>
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full" style={{ padding: '5px 11px', background: 'rgba(0,0,0,0.35)' }}>
                      <Bike size={14} strokeWidth={2.2} style={{ color: routeKind === 'zwift' ? '#F26C2A' : '#16E08A' }} />
                      <span className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#FFFFFF' }}>{routeKind === 'zwift' ? 'ZWIFT' : 'ROUVY'}</span>
                    </span>
                    <span className="absolute left-3 bottom-3" style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{de ? 'Virtuelle Fahrt' : 'Virtual ride'}{header?.title ? ` · ${header.title.replace(/^(Zwift|ROUVY)\s*[-–]\s*/i, '')}` : ''}</span>
                  </div>
                ) : (
                  <div className="relative grid place-items-center rounded-[16px] overflow-hidden" style={{ height: 150, background: 'var(--color-surface-2)', border: '1px dashed var(--color-rule)' }}>
                    <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      <MapIcon size={14} strokeWidth={2} /> {de ? 'Keine GPS-Strecke' : 'No GPS route'}
                    </span>
                  </div>
                )}
                {elevBars && (
                  <>
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'Höhenprofil' : 'Elevation profile'}</span>
                      {maxGrade != null && (
                        <span className="inline-flex items-center gap-1 rounded-full" style={{ padding: '4px 9px', background: 'var(--color-accent-soft)' }}>
                          <TrendingUp size={13} strokeWidth={2.2} style={{ color: 'var(--color-accent)' }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)' }}>{de ? 'Max. Steigung' : 'Max grade'} {Math.round(maxGrade)}%</span>
                        </span>
                      )}
                    </div>
                    <HoverBars
                      height={58}
                      gap={2}
                      radius={1}
                      defaultColor="var(--color-amber)"
                      bars={elevBars.map((b) => ({
                        value: Math.max(0.06, b.frac),
                        valueLabel: `${Math.round(b.m)} m`,
                        label: `${b.pct}% ${de ? 'der Strecke' : 'through'}`,
                      }))}
                    />
                  </>
                )}
              </div>
            )}

            {/* 4 · Power hero (coral) */}
            {powerStats.np != null && (
              <div className="rounded-[24px] p-5 flex flex-col gap-4" style={{ background: 'var(--color-paper-2)', border: '1.5px solid var(--color-accent)' }}>
                <SectionHead icon={<Zap size={17} strokeWidth={2.2} />} label="POWER" color="var(--color-accent)" />
                <div className="flex items-end justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Normalisierte Leistung' : 'Normalized Power'}</span>
                    <span className="flex items-end gap-1.5">
                      <span className="num-display" style={{ fontSize: 54, color: 'var(--color-ink)', lineHeight: 1 }}>{Math.round(powerStats.np)}</span>
                      <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-ink-2)', paddingBottom: 9 }}>W</span>
                    </span>
                  </div>
                  {header.if_ != null && (
                    <div className="flex flex-col items-end gap-0.5 rounded-[16px]" style={{ background: 'var(--color-accent-soft)', padding: '10px 14px' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-accent)' }}>{de ? 'Intensität (IF)' : 'Intensity (IF)'}</span>
                      <span className="num-display" style={{ fontSize: 34, color: 'var(--color-accent)', lineHeight: 1 }}>{header.if_.toFixed(2)}</span>
                    </div>
                  )}
                </div>
                <div style={{ height: 1, background: 'var(--color-rule)' }} />
                <div className="grid grid-cols-3 gap-2.5">
                  {([
                    { v: powerStats.avg != null ? `${powerStats.avg}` : '—', c: 'var(--color-ink)', l: de ? 'Ø Leistung' : 'Avg Power' },
                    { v: powerStats.max != null ? `${powerStats.max}` : '—', c: 'var(--color-move)', l: de ? 'Max Leistung' : 'Max Power' },
                    { v: powerStats.kj != null ? nf(Math.round(powerStats.kj)) : '—', c: 'var(--color-amber)', l: de ? 'Arbeit' : 'Work' },
                    { v: header.if_ != null ? header.if_.toFixed(2) : '—', c: 'var(--color-exercise)', l: 'IF' },
                    { v: powerStats.vi != null ? powerStats.vi.toFixed(2) : '—', c: 'var(--color-strain)', l: de ? 'Variabilität' : 'Variability' },
                    { v: powerStats.eftp != null ? `${Math.round(powerStats.eftp)}` : '—', c: 'var(--color-accent)', l: de ? 'Gesch. FTP' : 'Est. FTP' },
                  ]).map((x, i) => (
                    <div key={i} className="flex flex-col gap-1 rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: '12px 11px' }}>
                      <span className="num-display" style={{ fontSize: 23, color: x.c, lineHeight: 1 }}>{x.v}</span>
                      <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.04em', color: 'var(--color-muted)' }}>{x.l}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5 · Power zones */}
            {powerZones && (
              <div className={cardCls} style={cardStyle}>
                <SectionHead icon={<BarChart3 size={16} strokeWidth={2} />} label={de ? 'LEISTUNGSZONEN' : 'POWER ZONES'} />
                <div className="flex flex-col gap-[11px]">
                  {powerZones.map((z) => (
                    <div key={z.key} className="flex flex-col gap-[5px]">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-[7px]">
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: z.color }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: z.color }}>{z.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>{z.name}</span>
                        </span>
                        <span className="flex items-end gap-1.5">
                          <span className="num-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink)' }}>{z.time}</span>
                          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{Math.round(z.pct)}%</span>
                        </span>
                      </div>
                      <div className="rounded-full overflow-hidden" style={{ height: 8, background: 'var(--color-surface-3)' }}>
                        <div style={{ width: `${Math.min(100, z.pct)}%`, height: '100%', borderRadius: 999, background: z.color }} />
                      </div>
                    </div>
                  ))}
                </div>
                {zoneHardPct != null && (
                  <div className="flex items-start gap-2 rounded-[12px]" style={{ background: 'var(--color-surface-2)', padding: '10px 12px' }}>
                    <LineChart size={16} strokeWidth={2} style={{ color: 'var(--color-amber)', flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>
                      {de
                        ? `${zoneHardPct}% der Zeit an der Schwelle oder darüber (Z4–Z7).`
                        : `${zoneHardPct}% of time spent at threshold or above (Z4–Z7).`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* 6 · Power curve — ride mean-maximal (best rolling avg per duration) */}
            <div className={cardCls} style={cardStyle}>
              <SectionHead
                icon={<Activity size={16} strokeWidth={2} />}
                label={de ? 'LEISTUNGSKURVE' : 'POWER CURVE'}
                right={rideMMP && prDurations.size > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Star size={13} strokeWidth={2.2} style={{ color: 'var(--color-accent)' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-accent)' }}>{de ? 'Neue Bestzeit' : 'New best'}</span>
                  </span>
                ) : undefined}
              />
              {rideMMP ? (
                <>
                  <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    {de ? 'Beste Durchschnittsleistung nach Dauer' : 'Best average power by duration'}
                    {athlete?.ftp_watts ? ` · FTP ${Math.round(athlete.ftp_watts)} W` : ''}
                  </span>
                  <PowerCurveChart rows={rideMMP} ftp={athlete?.ftp_watts ?? null} de={de} />
                </>
              ) : (
                <div className="grid place-items-center rounded-[16px]" style={{ height: 120, background: 'var(--color-surface-2)', border: '1px dashed var(--color-rule)' }}>
                  <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    <Zap size={14} strokeWidth={2} /> {de ? 'Keine Leistungsdaten für diese Fahrt' : 'No power data for this ride'}
                  </span>
                </div>
              )}
            </div>

            {/* 7 · Heart rate */}
            {(hrStats.avg != null || hrStats.max != null || hrStats.decoupling != null || hrZoneBreakdown) && (
              <div className={cardCls} style={cardStyle}>
                <SectionHead icon={<HeartPulse size={16} strokeWidth={2} />} label={de ? 'HERZFREQUENZ' : 'HEART RATE'} color="var(--color-ink-2)" />
                <div className="flex gap-2.5">
                  {([
                    { v: hrStats.avg != null ? `${Math.round(hrStats.avg)}` : '—', l: de ? 'Ø HF' : 'Avg HR' },
                    { v: hrStats.max != null ? `${hrStats.max}` : '—', l: de ? 'Max HF' : 'Max HR' },
                  ]).map((x, i) => (
                    <div key={i} className="flex-1 flex flex-col gap-1 rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: '12px 13px' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{x.l}</span>
                      <span className="flex items-end gap-1">
                        <span className="num-display" style={{ fontSize: 30, color: 'var(--color-ink)', lineHeight: 1 }}>{x.v}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-move)', paddingBottom: 3 }}>bpm</span>
                      </span>
                    </div>
                  ))}
                </div>
                {hrZoneBreakdown ? (() => {
                  const zColors = ['var(--color-strain)', 'var(--color-recovery)', 'var(--color-exercise)', 'var(--color-amber)', 'var(--color-move)']
                  const zNames = de
                    ? ['Erholung', 'Grundlage', 'Tempo', 'Schwelle', 'VO₂max']
                    : ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO₂ Max']
                  const { secs, total, basis, ref } = hrZoneBreakdown
                  const caption = basis === 'lthr'
                    ? (de ? `Zonen aus LTHR ${Math.round(ref)} bpm` : `Zones from LTHR ${Math.round(ref)} bpm`)
                    : basis === 'hrmax'
                      ? (de ? `Zonen aus % max. HF ${Math.round(ref)} bpm` : `Zones from % HRmax ${Math.round(ref)} bpm`)
                      : (de ? `Zonen aus beob. max. HF ${Math.round(ref)} bpm` : `Zones from observed max HR ${Math.round(ref)} bpm`)
                  return (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'Zeit in HF-Zonen' : 'Time in HR zones'}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-muted)' }}>{caption}</span>
                      </div>
                      <div className="flex flex-col gap-[9px]">
                        {secs.map((sec, i) => {
                          const pct = (sec / total) * 100
                          return (
                            <div key={i} className="flex items-center gap-2.5" title={`Z${i + 1} ${zNames[i]} · ${fmtClock(sec)} · ${Math.round(pct)}%`}>
                              <span className="flex items-center gap-1.5" style={{ width: 96, flexShrink: 0 }}>
                                <span style={{ width: 8, height: 8, borderRadius: 999, background: zColors[i] }} />
                                <span style={{ fontSize: 11, fontWeight: 700, color: zColors[i] }}>Z{i + 1}</span>
                                <span className="truncate" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>{zNames[i]}</span>
                              </span>
                              <div className="flex-1 rounded-full overflow-hidden" style={{ height: 8, background: 'var(--color-surface-3)', cursor: 'default' }}>
                                <div style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%`, height: '100%', borderRadius: 999, background: zColors[i] }} />
                              </div>
                              <span className="num-mono text-right" style={{ width: 46, fontSize: 11, fontWeight: 600, color: 'var(--color-ink)' }}>{fmtClock(sec)}</span>
                              <span className="num-mono text-right" style={{ width: 30, fontSize: 11, color: 'var(--color-muted)' }}>{Math.round(pct)}%</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })() : (
                  <div className="grid place-items-center rounded-[14px]" style={{ minHeight: 56, background: 'var(--color-surface-2)', border: '1px dashed var(--color-rule)', padding: '12px' }}>
                    <span className="inline-flex items-center gap-1.5 text-center" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      <HeartPulse size={14} strokeWidth={2} /> {de ? 'Keine Herzfrequenzdaten für diese Fahrt' : 'No heart-rate data for this ride'}
                    </span>
                  </div>
                )}
                {hrStats.decoupling != null && decoupleRating && (
                  <div className="flex items-center justify-between rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: '12px 13px' }}>
                    <div className="flex flex-col gap-0.5">
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Aerobe Entkopplung' : 'Aerobic decoupling'}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{de ? 'Pw:HF kardialer Drift' : 'Pw:HR cardiac drift'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="num-display" style={{ fontSize: 24, color: 'var(--color-ink)' }}>{hrStats.decoupling.toFixed(1)}%</span>
                      <span className="inline-flex items-center gap-1 rounded-full" style={{ padding: '4px 10px', background: `color-mix(in srgb, ${decoupleRating.color} 15%, transparent)` }}>
                        {decoupleRating.good && <CheckCircle2 size={13} strokeWidth={2.2} style={{ color: decoupleRating.color }} />}
                        <span style={{ fontSize: 11, fontWeight: 700, color: decoupleRating.color }}>{decoupleRating.label}</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 7b · Cycling dynamics (real L/R balance, PCO, power phase, stamina) */}
            {bd && (bd.balance_right_pct != null || bd.pco_right_mm != null || bd.stamina_start_pct != null) && (
              <div className={cardCls} style={cardStyle}>
                <SectionHead icon={<Activity size={16} strokeWidth={2} />} label={de ? 'RAD-DYNAMIK' : 'CYCLING DYNAMICS'} />

                {bd.balance_left_pct != null && bd.balance_right_pct != null && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}><Scale size={14} strokeWidth={2} style={{ color: 'var(--color-strain)' }} /> {de ? 'Verhältnis L/R' : 'L/R balance'}</span>
                      <span className="num-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>{Math.round(bd.balance_left_pct)}% · {Math.round(bd.balance_right_pct)}%</span>
                    </div>
                    <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-2)' }}>
                      <div style={{ width: `${bd.balance_left_pct}%`, background: 'var(--color-strain)' }} />
                      <div style={{ width: `${bd.balance_right_pct}%`, background: 'var(--color-accent)' }} />
                    </div>
                    <div className="flex justify-between" style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}><span>{de ? 'Links' : 'Left'}</span><span>{de ? 'Rechts' : 'Right'}</span></div>
                  </div>
                )}

                <div className="flex">
                  {([
                    bd.pco_left_mm != null || bd.pco_right_mm != null
                      ? { l: de ? 'PCO L/R' : 'PCO L/R', v: `${bd.pco_left_mm != null ? Math.round(bd.pco_left_mm) : '—'} / ${bd.pco_right_mm != null ? Math.round(bd.pco_right_mm) : '—'}`, u: 'mm', c: 'var(--color-stand)' }
                      : null,
                    bd.power_phase_right
                      ? { l: de ? 'Power-Phase R' : 'Power phase R', v: `${Math.round(bd.power_phase_right[0] ?? 0)}–${Math.round(bd.power_phase_right[1] ?? 0)}`, u: '°', c: 'var(--color-amber)' }
                      : null,
                    bd.performance_condition != null
                      ? { l: de ? 'Leistungszustand' : 'Perf. condition', v: `${bd.performance_condition > 0 ? '+' : ''}${bd.performance_condition}`, u: '', c: bd.performance_condition >= 0 ? 'var(--color-recovery)' : 'var(--color-move)' }
                      : null,
                  ].filter(Boolean) as Array<{ l: string; v: string; u: string; c: string }>).map((x, i) => (
                    <div key={i} className="flex-1 flex flex-col gap-0.5" style={i > 0 ? { borderLeft: '1px solid var(--color-rule)', paddingLeft: 12 } : undefined}>
                      <span className="flex items-end gap-0.5"><span className="num-display" style={{ fontSize: 20, color: x.c }}>{x.v}</span>{x.u && <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)', paddingBottom: 3 }}>{x.u}</span>}</span>
                      <span className="eyebrow" style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>{x.l}</span>
                    </div>
                  ))}
                </div>

                {bd.stamina_start_pct != null && bd.stamina_end_pct != null && (
                  <div className="flex flex-col gap-2 rounded-[14px] p-3" style={{ background: 'var(--color-paper)' }}>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}><BatteryMedium size={14} strokeWidth={2} style={{ color: 'var(--color-recovery)' }} /> {de ? 'Stamina' : 'Stamina'}</span>
                      <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-ink)' }}>{Math.round(bd.stamina_start_pct)}% → {Math.round(bd.stamina_end_pct)}%{bd.stamina_min_pct != null ? ` · ${de ? 'min' : 'low'} ${bd.stamina_min_pct}%` : ''}</span>
                    </div>
                    {bd.stamina_curve && bd.stamina_curve.length > 1 && (
                      <HoverBars
                        height={34}
                        gap={2}
                        radius={1}
                        bars={bd.stamina_curve.map((v, i) => ({
                          value: v,
                          valueLabel: `${Math.round(v)}%`,
                          label: `${de ? 'Punkt' : 'Point'} ${i + 1}`,
                          color: v > 60 ? 'var(--color-recovery)' : v > 30 ? 'var(--color-amber)' : 'var(--color-move)',
                        }))}
                      />
                    )}
                  </div>
                )}
                <p style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.4 }}>
                  {de ? 'Aus Cycling-Dynamics-Pedalen (Rennrad). Zwift/Indoor liefert keine Pedal-Dynamik.' : 'From Cycling Dynamics pedals (outdoor). Zwift/indoor provides no pedal dynamics.'}
                </p>
              </div>
            )}

            {/* 8 · Climbing & speed */}
            {(climbSpeed.avgSpeed != null || climbSpeed.maxSpeed != null || climbSpeed.vam != null || climbSpeed.maxGrade != null) && (
              <div className={cardCls} style={cardStyle}>
                <SectionHead icon={<Mountain size={16} strokeWidth={2} />} label={de ? 'ANSTIEG & TEMPO' : 'CLIMBING & SPEED'} />
                <div className="flex flex-col gap-2.5">
                  <div className="flex gap-2.5">
                    <MetricCell icon={<Gauge size={17} strokeWidth={2} />} iconColor="var(--color-strain)" value={climbSpeed.avgSpeed != null ? climbSpeed.avgSpeed.toFixed(1) : '—'} unit="km/h" label={de ? 'Ø Tempo' : 'Avg Speed'} />
                    <MetricCell icon={<Gauge size={17} strokeWidth={2} />} iconColor="var(--color-amber)" value={climbSpeed.maxSpeed != null ? climbSpeed.maxSpeed.toFixed(1) : '—'} unit="km/h" label={de ? 'Max Tempo' : 'Max Speed'} />
                  </div>
                  <div className="flex gap-2.5">
                    <MetricCell icon={<TrendingUp size={17} strokeWidth={2} />} iconColor="var(--color-exercise)" value={climbSpeed.vam != null ? nf(Math.round(climbSpeed.vam)) : '—'} unit="m/h" label="VAM" />
                    <MetricCell icon={<Mountain size={17} strokeWidth={2} />} iconColor="var(--color-accent)" value={climbSpeed.maxGrade != null ? `${Math.round(climbSpeed.maxGrade)}` : '—'} unit="%" label={de ? 'Max Steigung' : 'Max Gradient'} />
                  </div>
                </div>
              </div>
            )}

            {/* 9 · Fuel */}
            {fueling && (fueling.total_kcal != null || fueling.total_kj != null || fueling.cho_g_estimate != null) && (() => {
              const dur = fueling.duration_h || (header.moving_time_s ? header.moving_time_s / 3600 : null)
              const kcalPerH = fueling.total_kcal != null && dur ? Math.round(fueling.total_kcal / dur) : null
              const gPerH = fueling.cho_g_estimate != null && dur ? Math.round(fueling.cho_g_estimate / dur) : null
              const targetMid = fueling.carb_target_g_per_h ? (fueling.carb_target_g_per_h[0] + fueling.carb_target_g_per_h[1]) / 2 : null
              const targetTotal = targetMid != null && dur ? Math.round(targetMid * dur) : null
              const fuelPct = targetTotal && fueling.cho_g_estimate != null ? Math.round((fueling.cho_g_estimate / targetTotal) * 100) : null
              return (
                <div className={cardCls} style={cardStyle}>
                  <SectionHead icon={<Utensils size={16} strokeWidth={2} />} label={de ? 'ENERGIE & KOHLENHYDRATE' : 'FUEL & CARBS'} />
                  <div className="flex gap-2.5">
                    <div className="flex-1 flex flex-col gap-[3px] rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: '12px 13px' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'Energie' : 'Energy'}</span>
                      <span className="flex items-end gap-1">
                        <span className="num-display" style={{ fontSize: 28, color: 'var(--color-ink)', lineHeight: 1 }}>{fueling.total_kcal != null ? nf(Math.round(fueling.total_kcal)) : '—'}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-amber)', paddingBottom: 3 }}>kcal</span>
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                        {fueling.total_kj != null ? `${nf(Math.round(fueling.total_kj))} kJ` : '—'}{kcalPerH != null ? ` · ${kcalPerH}/h` : ''}
                      </span>
                    </div>
                    <div className="flex-1 flex flex-col gap-[3px] rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: '12px 13px' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'Kohlenhydrate' : 'Carbs'}</span>
                      <span className="flex items-end gap-1">
                        <span className="num-display" style={{ fontSize: 28, color: 'var(--color-ink)', lineHeight: 1 }}>{fueling.cho_g_estimate != null ? Math.round(fueling.cho_g_estimate) : '—'}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-exercise)', paddingBottom: 3 }}>g</span>
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{gPerH != null ? `${gPerH} g/h ${de ? 'aufgenommen' : 'intake'}` : '—'}</span>
                    </div>
                  </div>
                  {fuelPct != null && targetTotal != null && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Verpflegung vs. Ziel' : 'Fueling vs target'}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-exercise)' }}>{Math.round(fueling.cho_g_estimate!)} / {targetTotal} g · {fuelPct}%</span>
                      </div>
                      <div className="rounded-full overflow-hidden" style={{ height: 8, background: 'var(--color-surface-3)' }}>
                        <div style={{ width: `${Math.min(100, fuelPct)}%`, height: '100%', borderRadius: 999, background: 'var(--color-exercise)' }} />
                      </div>
                    </div>
                  )}
                  {fueling.note && <p style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{fueling.note}</p>}
                </div>
              )
            })()}

            {/* 10 · Segments & peak efforts */}
            {efforts.length > 0 && (
              <div className={cardCls} style={cardStyle}>
                <SectionHead icon={<Flag size={16} strokeWidth={2} />} label={de ? 'SEGMENTE & SPITZENLEISTUNGEN' : 'SEGMENTS & PEAK EFFORTS'} />
                <div className="flex flex-col gap-2">
                  {efforts.map((e, i) => (
                    <div key={i} className="flex items-center justify-between rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: '11px 12px' }}>
                      <div className="flex items-center gap-[11px] min-w-0">
                        <span className="shrink-0 grid place-items-center rounded-full" style={{ width: 34, height: 34, background: e.pr ? 'var(--color-accent-soft)' : 'var(--color-surface-3)' }}>
                          {e.pr ? <Award size={17} strokeWidth={2} style={{ color: 'var(--color-accent)' }} /> : <Zap size={17} strokeWidth={2} style={{ color: 'var(--color-ink-2)' }} />}
                        </span>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="truncate" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>{e.name}</span>
                          <span className="truncate" style={{ fontSize: 11, color: 'var(--color-muted)' }}>{e.sub}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="flex items-end gap-0.5">
                          <span className="num-display" style={{ fontSize: 19, color: 'var(--color-ink)', lineHeight: 1 }}>{e.watts}</span>
                          <span style={{ fontSize: 11, color: 'var(--color-muted)', paddingBottom: 1 }}>W</span>
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: e.pr ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                          {e.pr ? (de ? 'Persönlicher Rekord' : 'Personal record') : (de ? 'Spitze' : 'Peak')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 11 · Coach insights (coral) */}
            {insightTakes.length > 0 && (
              <div className="rounded-[24px] p-5 flex flex-col gap-[14px]" style={{ background: 'var(--color-accent-soft)', border: '1px solid var(--color-accent)' }}>
                <SectionHead icon={<Lightbulb size={17} strokeWidth={2.2} />} label={de ? 'COACH-EINSICHTEN' : 'COACH INSIGHTS'} color="var(--color-accent)" />
                {insightTakes.map((t, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="shrink-0 grid place-items-center rounded-full" style={{ width: 34, height: 34, background: 'var(--color-paper)' }}>
                      <span style={{ color: t.color, display: 'inline-flex' }}>{t.icon}</span>
                    </span>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{t.head}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{t.body}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
