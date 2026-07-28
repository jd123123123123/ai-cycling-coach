/**
 * RideAnalysisView — per-ride analysis screen, rebuilt 1:1 from the WHOOP-style
 * "Screen · Ride Analysis" pen. A scannable vertical stack of cards driven
 * entirely by real backend data (useRaceDebrief + usePowerProfile), in the
 * pen's exact top-to-bottom order:
 *   1 Ride header · 2 Summary strip · 3 Route & elevation · 4 Power hero (coral)
 *   5 Power zones · 6 Power curve · 7 Heart rate · 8 Climbing & speed
 *   9 Fuel · 10 Segments & peak efforts · 11 Coach insights (coral)
 * plus Cycling Dynamics (real pedal L/R, PCO, stamina — the pen's "Cadence &
 * Pedaling" slot) and Environment (temp/wind from the stored Open-Meteo blob —
 * the pen's last content card). Cards whose data is entirely null hide.
 *
 * Two pen cards have no honest backend source and are therefore not rendered:
 *   • "Cadence & Pedaling" cadence viz — no cadence/torque stream is exposed
 *     (the richer, real Cycling Dynamics card stands in its place).
 *   • "vs last ride on this route" compare row — there is no per-activity
 *     same-route delta endpoint (route_library only aggregates route summaries),
 *     and the honest-data rule forbids fabricating +W / faster / same-HR deltas.
 */
import { useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { parseISO, format } from 'date-fns'
import { de as deLocale } from 'date-fns/locale'
import {
  Bike, Mountain, TrendingUp, Zap, BarChart3, Star, HeartPulse, Lightbulb, Heart, Clock, Activity, CheckCircle2, Scale, BatteryMedium, Thermometer, Wind,
} from 'lucide-react'
import { useRaceDebrief } from '../hooks/useRaceDebrief'
import { usePowerProfile } from '../hooks/usePowerProfile'
import { useAthleteProfile } from '../hooks/useAthleteProfile'
import { useStreamAnalysis } from '../hooks/useStreamAnalysis'
import { useLocale } from '../contexts/LocaleContext'
import HoverBars from '../components/ui/HoverBars'
import ZoneStack from '../components/debrief/ZoneStack'
import { zoneNumber } from '../utils/rideEffect'

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

/** 8-point compass abbreviation for a bearing in degrees (localized). */
function compass(deg: number, de: boolean): string {
  const en = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const dede = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW']
  const i = Math.round(((deg % 360) + 360) % 360 / 45) % 8
  return (de ? dede : en)[i]
}

/** Raw Open-Meteo hourly blob stored per ride (UTC times, °C, m/s, degrees). */
interface RideWeather {
  hourly?: {
    time?: string[]
    temperature_2m?: (number | null)[]
    wind_speed_10m?: (number | null)[]
    wind_direction_10m?: (number | null)[]
  }
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

/**
 * `embedded` folds this page into RideRecapView as its deep-dive tail (see the
 * merge note in that file). It drops the page chrome (own scroll container,
 * back link, loading/error states) and every block the recap already renders
 * above it — the ride header, the summary strip, the coach insights, the power
 * hero and the power curve were all duplicated verbatim across the two
 * screens. What survives is what only this page ever had: elevation, power
 * zones, heart rate, pedal dynamics, climbing/speed, fuel and the full segment
 * table.
 */
export default function RideAnalysisView({ embedded = false }: { embedded?: boolean }) {
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

  const header = data?.header
  const story = data?.story ?? null
  const efficiency = data?.efficiency ?? null
  const pacing = data?.pacing ?? null
  // Cap to the biggest climbs — the debrief can return many micro-climbs.
  const climbs = useMemo(
    () => [...(data?.climbs ?? [])].sort((a, b) => (b.elev_gain_m ?? 0) - (a.elev_gain_m ?? 0)).slice(0, 8),
    [data],
  )
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
    const eftp = wko?.mftp_watts ?? power?.threshold_watts ?? null
    return { avg, max, np, vi, kj, eftp }
  }, [story, header, pacing, wko, power])

  // Max grade across climbs + route points
  const maxGrade = useMemo(() => {
    const g: number[] = []
    for (const c of data?.climbs ?? []) if (typeof c.avg_grade_pct === 'number') g.push(c.avg_grade_pct)
    for (const r of story?.route ?? []) if (typeof r.grade === 'number') g.push(r.grade)
    return g.length ? Math.max(...g) : null
  }, [data, story])

  // Power zones from pacing.zone_time_pct
  // Power zones. The key reader goes through the shared tolerant `zoneNumber`
  // (utils/rideEffect) rather than probing `z1` / `Z1` / `1` by hand.
  //
  // That hand-rolled probe is why this card had been INVISIBLE: the wire sends
  // `{"zone1": 12.9, "zone2": 31.0, ...}` and none of the three spellings it
  // tried matched, so `rows` came back empty, the memo returned null and the
  // whole LEISTUNGSZONEN card silently self-hid on every ride. It never threw
  // and never logged, so nothing pointed at it.
  const powerZones = useMemo(() => {
    const zt = pacing?.zone_time_pct
    if (!zt) return null
    const colors = ['var(--color-strain)', 'var(--color-recovery)', 'var(--color-exercise)', 'var(--color-amber)', '#FF7A3C', 'var(--color-accent)', 'var(--color-move)']
    const namesEn = ['Active Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO₂ Max', 'Anaerobic', 'Neuromuscular']
    const namesDe = ['Aktive Erholung', 'Grundlage', 'Tempo', 'Schwelle', 'VO₂max', 'Anaerob', 'Neuromuskulär']
    const move = header?.moving_time_s ?? 0
    const byZone = new Map<number, number>()
    for (const [key, pct] of Object.entries(zt)) {
      const z = zoneNumber(key)
      if (z == null || typeof pct !== 'number' || pct <= 0) continue
      byZone.set(z, (byZone.get(z) ?? 0) + pct)
    }
    const rows: { key: string; label: string; name: string; pct: number; color: string; time: string; seconds: number }[] = []
    for (let z = 1; z <= 7; z++) {
      const pct = byZone.get(z)
      if (pct == null) continue
      const seconds = move ? (pct / 100) * move : 0
      rows.push({
        key: `z${z}`, label: `Z${z}`, name: (de ? namesDe : namesEn)[z - 1], pct,
        color: colors[z - 1], time: move ? fmtMin(seconds) : '—', seconds,
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
    // VAM is only a climbing rate if there was a climb to measure it on. This
    // ride's "859 m/h" came from a 57-second, 13-metre bump — a real number
    // about nothing, presented as one of four headline metrics. A climb has to
    // last 3 minutes or gain 30 m before its VAM says anything about climbing.
    const realClimbs = climbs.filter((c) => (c.duration_s ?? 0) >= 180 || (c.elev_gain_m ?? 0) >= 30)
    const best = realClimbs.length
      ? realClimbs.reduce((a, b) => ((b.vam_m_per_h ?? 0) > (a.vam_m_per_h ?? 0) ? b : a))
      : null
    return {
      avgSpeed,
      maxSpeed,
      vam: best?.vam_m_per_h ?? null,
      vamClimb: best,
      hasRealClimb: realClimbs.length > 0,
      climbCount: realClimbs.length,
      maxGrade,
    }
  }, [story, header, climbs, maxGrade])

  // Environment — real conditions from the stored Open-Meteo hourly blob
  // (weather_client fetches temperature/wind for the ride window; virtual/indoor
  // rides carry no weather so the card hides). Values are averaged across the
  // ride's hours; wind direction uses a circular mean. No humidity is fetched,
  // so that cell stays an honest "—" rather than a fabricated number.
  const environment = useMemo(() => {
    const h = (sa?.weather as RideWeather | null | undefined)?.hourly
    const times = h?.time
    if (!h || !Array.isArray(times) || times.length === 0) return null
    // Open-Meteo returns UTC times without a trailing 'Z'; normalise for parsing.
    const startMs = header?.date ? Date.parse(header.date) : NaN
    const durMs = (header?.moving_time_s ?? 3600) * 1000
    const pad = 30 * 60 * 1000
    const idxs: number[] = []
    if (Number.isFinite(startMs)) {
      times.forEach((t, i) => {
        const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}Z`
        const ts = Date.parse(iso)
        if (Number.isFinite(ts) && ts >= startMs - pad && ts <= startMs + durMs + pad) idxs.push(i)
      })
    }
    const use = idxs.length ? idxs : times.map((_, i) => i)
    const mean = (arr?: (number | null)[]): number | null => {
      if (!arr) return null
      const vals = use.map((i) => arr[i]).filter((v): v is number => typeof v === 'number')
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    }
    const tempC = mean(h.temperature_2m)
    const windMs = mean(h.wind_speed_10m)
    let windDir: number | null = null
    if (h.wind_direction_10m) {
      const dirs = use.map((i) => h.wind_direction_10m![i]).filter((v): v is number => typeof v === 'number')
      if (dirs.length) {
        const s = dirs.reduce((a, d) => a + Math.sin((d * Math.PI) / 180), 0)
        const c = dirs.reduce((a, d) => a + Math.cos((d * Math.PI) / 180), 0)
        windDir = (((Math.atan2(s, c) * 180) / Math.PI) + 360) % 360
      }
    }
    if (tempC == null && windMs == null) return null
    return { tempC, windMs, windDir }
  }, [sa, header])

  // Coach insight takes from the AI verdict.
  const insightTakes = useMemo(() => {
    if (!verdict) return []
    const takes: { icon: React.ReactNode; color: string; head: string; body: string }[] = []
    if (verdict.ai_verdict) takes.push({ icon: <TrendingUp size={18} strokeWidth={2.2} />, color: 'var(--color-accent)', head: de ? 'Coach-Fazit' : 'Coach take', body: verdict.ai_verdict })
    for (const t of verdict.went_well ?? []) takes.push({ icon: <Heart size={18} strokeWidth={2.2} />, color: 'var(--color-recovery)', head: de ? 'Lief gut' : 'Went well', body: t })
    for (const t of verdict.watch_out ?? []) takes.push({ icon: <Clock size={18} strokeWidth={2.2} />, color: 'var(--color-strain)', head: de ? 'Achte darauf' : 'Watch out', body: t })
    return takes.slice(0, 4)
  }, [verdict, de])

  // When embedded the recap owns the page, so this component must not bring its
  // own scroll container, padding or back link — that nested a second page
  // inside the first (a stray "← Zurück" mid-scroll and doubled horizontal
  // padding). Built as an element, not a component defined during render: a
  // render-created wrapper changes identity every pass and remounts the whole
  // subtree, throwing away the charts' internal state on each parent update.
  const body = (
    <>
        {!embedded && (
        <Link
          to="/dashboard?tab=history"
          className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5"
          style={{ fontSize: 12.5, color: 'var(--color-ink-2)', border: '1px solid var(--color-rule)' }}
        >
          {de ? '← Zurück' : '← Back'}
        </Link>
        )}

        {/* The recap above already renders its own skeleton and error state for
            the same query, so an embedded copy would double them. */}
        {!embedded && isLoading && (
          <div className="flex flex-col gap-6">
            <div className="rounded-[24px] h-24 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
            <div className="rounded-[24px] h-28 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
            <div className="rounded-[24px] h-64 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
          </div>
        )}

        {!embedded && isError && (
          <p style={{ color: 'var(--color-bad)', fontSize: 14 }}>
            {de ? 'Fahrtanalyse konnte nicht geladen werden.' : "Couldn't load this ride analysis."}
          </p>
        )}

        {data && header && (
          <>
            {!embedded && (<>
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

            {/* 2b · Coach insights — VERDICT-FIRST (pen eOR1S reorder): the
                 plain-language verdict leads, the analytical detail follows.
                 Surface card with accent kicker, matching the pen's InsightsCard. */}
            {insightTakes.length > 0 && (
              <div className={cardCls} style={cardStyle}>
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

                        </>)}

            {!embedded && (<>
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
                {(() => {
                  const ref = athlete?.ftp_watts ?? powerStats.eftp
                  if (powerStats.np == null || ref == null || ref <= 0) return null
                  const pct = Math.round((powerStats.np / ref) * 100)
                  const dur = header.moving_time_s != null ? fmtMin(header.moving_time_s) : null
                  return (
                    <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                      {de
                        ? `Du hast ${pct}% deiner FTP${dur ? ` über ${dur}` : ''} gehalten — ${pct >= 85 ? 'ein wirklich harter Tag.' : pct >= 70 ? 'eine solide, kontrollierte Belastung.' : 'ein ruhiger Grundlagentag.'}`
                        : `You held ${pct}% of your FTP${dur ? ` for ${dur}` : ''} — ${pct >= 85 ? 'a genuinely hard day.' : pct >= 70 ? 'a solid, controlled effort.' : 'an easy endurance day.'}`}
                    </p>
                  )
                })()}
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

                        </>)}

            {!embedded && (<>
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

                        </>)}

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
                  const { secs, basis, ref } = hrZoneBreakdown
                  const caption = basis === 'lthr'
                    ? (de ? `Zonen aus LTHR ${Math.round(ref)} bpm` : `Zones from LTHR ${Math.round(ref)} bpm`)
                    : basis === 'hrmax'
                      ? (de ? `Zonen aus % max. HF ${Math.round(ref)} bpm` : `Zones from % HRmax ${Math.round(ref)} bpm`)
                      : (de ? `Zonen aus beob. max. HF ${Math.round(ref)} bpm` : `Zones from observed max HR ${Math.round(ref)} bpm`)
                  return (
                    <ZoneStack
                      zones={secs.map((sec, i) => ({ label: `Z${i + 1}`, name: zNames[i], color: zColors[i], seconds: sec }))}
                      caption={caption}
                    />
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

            {/* 8 · Climbing & speed — was a 2x2 grid of equal-weight tiles where two
                of the four (VAM, max gradient) are near-meaningless on a flat
                ride, and one of those two was computed off a 57-second bump.
                Now: speed gets the visual, because it is real on every ride —
                a range bar with Ø marked inside 0..max, which shows at a glance
                whether the ride was steady or full of surges. Climbing gets a
                line only when there was climbing. */}
            {(climbSpeed.avgSpeed != null || climbSpeed.maxSpeed != null) && (
              <div className={cardCls} style={cardStyle}>
                <SectionHead icon={<Mountain size={16} strokeWidth={2} />} label={de ? 'ANSTIEG & TEMPO' : 'CLIMBING & SPEED'} />

                {climbSpeed.avgSpeed != null && climbSpeed.maxSpeed != null && climbSpeed.maxSpeed > 0 && (() => {
                  const avgPct = Math.max(2, Math.min(100, (climbSpeed.avgSpeed / climbSpeed.maxSpeed) * 100))
                  return (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-end justify-between">
                        <span className="flex items-end gap-1.5">
                          <span className="num-display" style={{ fontSize: 30, color: 'var(--color-ink)', lineHeight: 1 }}>{climbSpeed.avgSpeed.toFixed(1)}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-strain)', paddingBottom: 3 }}>km/h {de ? 'Ø' : 'avg'}</span>
                        </span>
                        <span className="flex items-end gap-1.5">
                          <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink-2)', lineHeight: 1 }}>{climbSpeed.maxSpeed.toFixed(1)}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', paddingBottom: 2 }}>km/h max</span>
                        </span>
                      </div>
                      {/* Ø marked inside the 0..max span: the gap between the
                          marker and the right edge IS the ride's surge range. */}
                      <div className="relative w-full" style={{ height: 10 }}>
                        <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(90deg, var(--color-strain) 0%, var(--color-amber) 100%)', opacity: 0.28 }} />
                        <div className="absolute left-0 top-0 bottom-0 rounded-full" style={{ width: `${avgPct}%`, background: 'linear-gradient(90deg, var(--color-strain) 0%, var(--color-amber) 100%)' }} />
                        <span className="absolute" style={{ left: `calc(${avgPct}% - 1px)`, top: -3, bottom: -3, width: 2, borderRadius: 2, background: 'var(--color-ink)' }} />
                      </div>
                    </div>
                  )
                })()}

                {climbSpeed.hasRealClimb && climbSpeed.vam != null ? (
                  <div className="flex gap-2.5">
                    <MetricCell icon={<TrendingUp size={17} strokeWidth={2} />} iconColor="var(--color-exercise)" value={nf(Math.round(climbSpeed.vam))} unit="m/h" label="VAM" />
                    <MetricCell icon={<Mountain size={17} strokeWidth={2} />} iconColor="var(--color-accent)" value={climbSpeed.maxGrade != null ? `${Math.round(climbSpeed.maxGrade)}` : '—'} unit="%" label={de ? 'Max Steigung' : 'Max Gradient'} />
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-[12px]" style={{ background: 'var(--color-surface-2)', padding: '10px 12px' }}>
                    <Mountain size={15} strokeWidth={2} style={{ color: 'var(--color-muted)', flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                      {de
                        ? `Flaches Profil — keine Anstiege über 3 Min oder 30 Hm${climbSpeed.maxGrade != null ? `, maximal ${Math.round(climbSpeed.maxGrade)}% Steigung` : ''}. VAM sagt hier nichts über deine Kletterform.`
                        : `Flat profile — no climbs over 3 min or 30 m${climbSpeed.maxGrade != null ? `, ${Math.round(climbSpeed.maxGrade)}% steepest` : ''}. VAM says nothing about your climbing here.`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* 8b · Environment — real temperature + wind from the stored
                Open-Meteo blob. Hides entirely for virtual/indoor rides.
                The humidity cell is gone: no humidity is ever fetched, so it
                was a permanent em dash taking a third of the card and implying
                a metric the app might one day fill. Wind now POINTS — the arrow
                is rotated to the real bearing, which is the one thing a rider
                wants from a wind reading. */}
            {environment && (
              <div className={cardCls} style={cardStyle}>
                <SectionHead icon={<Thermometer size={16} strokeWidth={2} />} label={de ? 'BEDINGUNGEN' : 'ENVIRONMENT'} />
                <div className="flex gap-2.5">
                  <div className="flex-1 flex items-center gap-3 rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: '13px 14px' }}>
                    <Thermometer size={20} strokeWidth={2} style={{ color: 'var(--color-amber)', flexShrink: 0 }} />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="flex items-end gap-1">
                        <span className="num-display" style={{ fontSize: 26, color: 'var(--color-ink)', lineHeight: 1 }}>
                          {environment.tempC != null ? Math.round(environment.tempC) : '—'}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-amber)', paddingBottom: 2 }}>°C</span>
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'Temperatur' : 'Temperature'}</span>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center gap-3 rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: '13px 14px' }}>
                    {/* Rotated to where the wind is GOING (bearing + 180°) —
                        how a wind arrow reads on a map. */}
                    <span
                      className="grid place-items-center shrink-0"
                      style={{ transform: environment.windDir != null ? `rotate(${(environment.windDir + 180) % 360}deg)` : undefined }}
                      aria-hidden
                    >
                      <Wind size={20} strokeWidth={2} style={{ color: 'var(--color-strain)' }} />
                    </span>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="flex items-end gap-1">
                        <span className="num-display" style={{ fontSize: 26, color: 'var(--color-ink)', lineHeight: 1 }}>
                          {environment.windMs != null ? Math.round(environment.windMs * 3.6) : '—'}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-strain)', paddingBottom: 2 }}>km/h</span>
                      </span>
                      <span className="truncate" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>
                        {environment.windDir != null ? `${de ? 'Wind aus' : 'Wind from'} ${compass(environment.windDir, de)}` : (de ? 'Wind' : 'Wind')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 5 · Power zones — one segmented bar (ZoneStack) instead of five
                stacked tracks. Five separately-scaled bars answer "how long in
                Z2?" but make the question a rider actually asks — what SHAPE
                was this ride — a reading task rather than a glance, and cost
                ~100px doing it. */}
            {powerZones && (
              <div className={cardCls} style={cardStyle}>
                <SectionHead icon={<BarChart3 size={16} strokeWidth={2} />} label={de ? 'LEISTUNGSZONEN' : 'POWER ZONES'} />
                <ZoneStack
                  zones={powerZones.map((z) => ({ label: z.label, name: z.name, color: z.color, seconds: z.seconds }))}
                  hardLabel={zoneHardPct != null
                    ? (de
                        ? `${zoneHardPct}% der Zeit an der Schwelle oder darüber (Z4–Z7).`
                        : `${zoneHardPct}% of time spent at threshold or above (Z4–Z7).`)
                    : undefined}
                />
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

          </>
        )}
    </>
  )

  if (embedded) return <div className="flex flex-col gap-6">{body}</div>
  return (
    <div className="min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <div className="max-w-md mx-auto px-4 pt-6 pb-28 flex flex-col gap-6">{body}</div>
    </div>
  )
}
