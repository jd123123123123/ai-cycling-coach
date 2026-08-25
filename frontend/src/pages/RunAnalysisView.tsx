/**
 * RunAnalysisView — per-run analysis screen rebuilt 1:1 from the Pencil
 * "Run Analysis" design. Card order (top→bottom):
 *   1. Header + stat row      2. Pace hero        3. Per-km splits
 *   4. Heart rate + zones     5. Running dynamics 6. VO₂ max & race predictor
 *   7. Fuel & hydration       8. Conditions       9. Shoe mileage
 *  10. Coach insights
 *
 * Real data only. Runs in this backend carry no per-second streams, so the
 * debrief usually 404s — we fall back to the activity row (distance, time,
 * avg/max HR). Every .pen card is still rendered: cards whose data needs
 * streams / dynamics / weather / shoe records show their real fields where we
 * have them and a graceful "—" / "not recorded" note otherwise. Nothing is
 * fabricated.
 */
import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { subDays, format, parseISO } from 'date-fns'
import {
  Footprints, Heart, HeartPulse, Gauge, CheckCircle2, Flame,
  LineChart, GlassWater, Thermometer, Droplets, Wind, Lightbulb, Trophy,
  TrendingUp, ArrowRight, Map as MapIcon, Mountain, Route as RouteIcon,
} from 'lucide-react'
import { useRaceDebrief } from '../hooks/useRaceDebrief'
import { useStreamAnalysis } from '../hooks/useStreamAnalysis'
import { useActivitiesRange } from '../hooks/useActivitiesRange'
import { useLocale } from '../contexts/LocaleContext'
import HoverBars from '../components/ui/HoverBars'
import type { DebriefStory } from '../api/debrief'

const card = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

/** Project a lat/lng polyline into an SVG path fitted to a WxH box (north up,
 *  aspect-preserved, padded). Returns the `d` string + fitted point list.
 *  Copied from RideAnalysisView so runs draw their real GPS route the same way. */
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

function downsample<T>(arr: T[], target: number): T[] {
  if (arr.length <= target) return arr
  const step = arr.length / target
  const out: T[] = []
  for (let i = 0; i < target; i++) out.push(arr[Math.floor(i * step)])
  return out
}

function fmtPace(secPerKm: number): string {
  if (!isFinite(secPerKm) || secPerKm <= 0) return '—'
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtDuration(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.round(sec % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// Per-km splits by integrating the speed stream into distance buckets.
function deriveSplits(story: DebriefStory | null): { km: number; pace: number }[] {
  if (!story || !story.t?.length || !story.speed?.length) return []
  const { t, speed } = story
  const bucketTime: number[] = []
  const bucketDist: number[] = []
  let cumDist = 0
  for (let i = 1; i < t.length; i++) {
    const dt = t[i] - t[i - 1]
    if (dt <= 0 || dt > 60) continue
    const v = speed[i] ?? speed[i - 1] ?? 0
    if (v == null || v < 0) continue
    const km = Math.floor(cumDist / 1000)
    bucketTime[km] = (bucketTime[km] ?? 0) + dt
    bucketDist[km] = (bucketDist[km] ?? 0) + v * dt
    cumDist += v * dt
  }
  const out: { km: number; pace: number }[] = []
  for (let k = 0; k < bucketTime.length; k++) {
    const dist = bucketDist[k] ?? 0
    const time = bucketTime[k] ?? 0
    if (dist < 200 || time <= 0) continue
    out.push({ km: k + 1, pace: time / (dist / 1000) })
  }
  return out
}

// HR-zone time distribution from the HR stream as % of observed max HR.
function deriveHrZones(story: DebriefStory | null): { secs: number[]; maxHr: number | null } {
  if (!story || !story.hr?.length || !story.t?.length) return { secs: [], maxHr: null }
  const { t, hr } = story
  const maxHr = hr.reduce<number>((m, h) => (h != null && h > m ? h : m), 0)
  if (maxHr <= 0) return { secs: [], maxHr: null }
  const z = [0, 0, 0, 0, 0]
  let total = 0
  for (let i = 1; i < t.length; i++) {
    const dt = t[i] - t[i - 1]
    if (dt <= 0 || dt > 60) continue
    const h = hr[i]
    if (h == null) continue
    const frac = h / maxHr
    const idx = frac < 0.6 ? 0 : frac < 0.7 ? 1 : frac < 0.8 ? 2 : frac < 0.9 ? 3 : 4
    z[idx] += dt
    total += dt
  }
  if (total <= 0) return { secs: [], maxHr }
  return { secs: z, maxHr }
}

const RIEGEL = 1.06
const RACES: [number, string][] = [[5, '5K'], [10, '10K'], [21.0975, 'Half'], [42.195, 'Full']]
const ACCENT = 'var(--color-accent)'

/* ── small building blocks ──────────────────────────────────────────── */
function SectionHead({ icon: Icon, title, color = 'var(--color-ink-2)', right }: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>
  title: string; color?: string; right?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-[7px]">
      <Icon size={16} strokeWidth={2} style={{ color }} />
      <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color }}>{title}</span>
      {right != null && <span className="ml-auto">{right}</span>}
    </div>
  )
}

function NotRecorded({ text }: { text: string }) {
  return <p style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.4 }}>{text}</p>
}

export default function RunAnalysisView() {
  const { id } = useParams()
  const activityId = id ? Number(id) : undefined
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data, isLoading, isError } = useRaceDebrief(activityId)
  // Real per-second stream analysis (splits, HR zones, elevation, run dynamics).
  const { data: sa } = useStreamAnalysis(activityId)
  const hasStreams = sa?.has_streams === true
  // Fallback — most runs carry no streams, so the debrief 404s; we still fill
  // the header + HR cards from the activity row.
  const { data: actsResp } = useActivitiesRange(useMemo(() => subDays(new Date(), 400), []), useMemo(() => new Date(), []))
  const act = actsResp?.activities.find((a) => a.id === activityId)

  const splits = useMemo(() => deriveSplits(data?.story ?? null), [data])
  const hrZones = useMemo(() => deriveHrZones(data?.story ?? null), [data])

  const back = (
    <Link
      to="/dashboard?tab=history"
      className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5"
      style={{ fontSize: 12.5, color: 'var(--color-ink-2)', border: '1px solid var(--color-rule)' }}
    >
      {de ? '← Zurück' : '← Back'}
    </Link>
  )

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <div className="max-w-md mx-auto px-4 pt-6 pb-28 flex flex-col gap-6">{children}</div>
    </div>
  )

  if (isLoading) {
    return shell(
      <>
        {back}
        <div className="rounded-[24px] h-72 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
        <div className="rounded-[24px] h-56 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
      </>,
    )
  }

  // Neither debrief nor activity row → genuine error.
  if ((isError || !data) && !act) {
    return shell(
      <>
        {back}
        <p style={{ color: 'var(--color-move)', fontSize: 14 }}>{de ? 'Lauf konnte nicht geladen werden.' : "Couldn't load this run."}</p>
      </>,
    )
  }

  /* ── unified real-data model (debrief when present, else activity row) ── */
  const header = data?.header
  const verdict = data?.verdict
  const efficiency = data?.efficiency
  const pacing = data?.pacing
  const wko = data?.wko

  const title = header?.title ?? act?.title ?? (de ? 'Lauf' : 'Run')
  const dateStr = header?.date
    ?? (act?.started_at ? format(parseISO(act.started_at), de ? "EEEE, d. MMMM · HH:mm" : 'EEEE, MMMM d · h:mm a') : '')
  const distKm = header?.distance_km ?? (act?.distance_meters ?? 0) / 1000
  const movingS = header?.moving_time_s ?? act?.duration_seconds ?? 0
  const streamElev = hasStreams && sa?.elevation ? sa.elevation.gain_m : null
  const elevation = streamElev ?? (header && (header.elevation_m ?? 0) > 0 ? header.elevation_m : null)
  const streamAvgHr = (() => {
    const hr = (data?.story?.hr ?? []).filter((h): h is number => h != null)
    return hr.length ? hr.reduce((a, b) => a + b, 0) / hr.length : null
  })()
  const avgHr = efficiency?.avg_hr ?? (hasStreams ? sa?.avg_hr : null) ?? act?.average_hr ?? streamAvgHr
  const maxHr = (hasStreams ? sa?.max_hr : null) ?? hrZones.maxHr ?? act?.max_hr ?? null
  const avgPace = distKm > 0 ? movingS / distKm : 0

  /* ── Route & elevation (real GPS + altitude stream) ── */
  // Fitted SVG path of the real outdoor GPS route (≥2 points required).
  const route = sa?.gps?.polyline && sa.gps.polyline.length >= 2 ? routePath(sa.gps.polyline, 320, 150) : null
  const isOutdoorRoute = route != null && sa?.route_kind !== 'indoor'
  // Tint the route line by effort: faster avg pace → warmer color.
  const routeColor = (() => {
    if (!avgPace) return 'var(--color-exercise)'
    if (avgPace < 255) return 'var(--color-accent)'      // < 4:15 /km — hard
    if (avgPace < 315) return 'var(--color-amber)'       // < 5:15 /km — tempo
    if (avgPace < 375) return 'var(--color-exercise)'    // < 6:15 /km — easy
    return 'var(--color-recovery)'                        // recovery
  })()
  // Elevation-profile bars from the altitude stream (normalized min→max for shape).
  const elevBars = (() => {
    const prof = sa?.elevation?.profile
    if (!prof || prof.length < 4) return null
    const ds = downsample(prof, 42)
    const min = Math.min(...ds), max = Math.max(...ds)
    const span = max - min || 1
    return ds.map((a, i) => ({ m: a, frac: (a - min) / span, pct: Math.round((i / (ds.length - 1)) * 100) }))
  })()
  const elevGain = sa?.elevation?.gain_m ?? null
  // Max grade approximated from consecutive altitude samples over even distance spacing.
  const maxGrade = (() => {
    const prof = sa?.elevation?.profile
    if (!prof || prof.length < 2 || distKm <= 0) return null
    const segM = (distKm * 1000) / (prof.length - 1)
    if (segM <= 0) return null
    let mx = 0
    for (let i = 1; i < prof.length; i++) {
      const g = Math.abs((prof[i] - prof[i - 1]) / segM) * 100
      if (g > mx) mx = g
    }
    return mx > 0 ? Math.min(mx, 45) : null
  })()

  const avgPower = act?.average_power ?? null   // Garmin running power (W) — real
  const calories = act?.calories ?? null        // Garmin active energy (kcal) — real
  const decoupling = efficiency?.decoupling_pct ?? null
  const negativeSplit = pacing != null && pacing.split_pct < 0
  const vo2 = wko?.vo2max_estimate ?? null

  const canPredict = distKm >= 3 && movingS > 0
  const predictions = RACES.map(([d, label]) => ({
    label,
    time: canPredict ? movingS * Math.pow(d / distKm, RIEGEL) : NaN,
  }))

  // Prefer REAL per-km splits from the stream (pace + HR + elevation);
  // fall back to speed-integrated splits (pace only) when no stream.
  type SplitRow = { km: number; pace: number; hr: number | null; elev: number | null }
  const streamSplits: SplitRow[] = hasStreams
    ? (sa?.splits ?? []).map((s) => ({ km: s.km, pace: s.pace_s_per_km, hr: s.avg_hr, elev: s.elev_delta_m }))
    : []
  const splitRows: SplitRow[] = streamSplits.length >= 2
    ? streamSplits
    : splits.map((s) => ({ km: s.km, pace: s.pace, hr: null, elev: null }))
  const hasSplitHr = splitRows.some((s) => s.hr != null)
  const hasSplitElev = splitRows.some((s) => s.elev != null)
  const fastestKm = splitRows.length ? splitRows.reduce((a, b) => (b.pace < a.pace ? b : a)).km : -1
  const slowestKm = splitRows.length ? splitRows.reduce((a, b) => (b.pace > a.pace ? b : a)).km : -1

  // Grade-adjusted pace (real, from run dynamics).
  const gapPace = hasStreams ? sa?.run_dynamics?.gap_pace_s_per_km ?? null : null

  // Real HR-zone seconds from the stream, else speed/HR-derived fallback.
  const streamZoneSecs = hasStreams && sa?.hr_zones ? sa.hr_zones.secs : null
  const zoneSecs = streamZoneSecs ?? hrZones.secs

  // Real running dynamics rows (parallel to dynMetrics order).
  const rd = hasStreams ? sa?.run_dynamics : undefined
  const dynData: Array<{ v: string; u: string }> = [
    { v: rd?.cadence_spm != null ? `${Math.round(rd.cadence_spm)}` : '—', u: rd?.cadence_spm != null ? 'spm' : '' },
    { v: rd?.ground_contact_ms != null ? `${Math.round(rd.ground_contact_ms)}` : '—', u: rd?.ground_contact_ms != null ? 'ms' : '' },
    { v: rd?.vertical_oscillation_mm != null ? `${(rd.vertical_oscillation_mm / 10).toFixed(1)}` : '—', u: rd?.vertical_oscillation_mm != null ? 'cm' : '' },
    { v: rd?.vertical_ratio_pct != null ? `${rd.vertical_ratio_pct.toFixed(1)}` : '—', u: rd?.vertical_ratio_pct != null ? '%' : '' },
    { v: rd?.stride_length_cm != null ? `${Math.round(rd.stride_length_cm)}` : '—', u: rd?.stride_length_cm != null ? 'cm' : '' },
  ]
  const hasDyn = dynData.some((d) => d.v !== '—')

  const zoneColors = ['var(--color-recovery)', 'var(--color-strain)', 'var(--color-exercise)', 'var(--color-amber)', 'var(--color-move)']
  const zoneLabels = de
    ? ['Z1 Erholung', 'Z2 Grundlage', 'Z3 Tempo', 'Z4 Schwelle', 'Z5 VO2']
    : ['Z1 Recovery', 'Z2 Endurance', 'Z3 Tempo', 'Z4 Threshold', 'Z5 VO2']
  const zoneTotal = zoneSecs.reduce((a, b) => a + b, 0)

  const dynMetrics = de
    ? ['Schrittfrequenz', 'Bodenkontakt', 'Vertikale Osz.', 'Vertikales Verhältnis', 'Schrittlänge']
    : ['Cadence', 'Ground Contact', 'Vertical Osc.', 'Vertical Ratio', 'Stride Length']

  const envTiles: Array<[React.ComponentType<{ size?: number; style?: React.CSSProperties }>, string, string, string]> = [
    [Thermometer, 'var(--color-strain)', '—', de ? 'Temp' : 'Temp'],
    [Droplets, 'var(--color-stand)', '—', de ? 'Feuchte' : 'Humidity'],
    [Flame, 'var(--color-amber)', '—', de ? 'Hitze /km' : 'Heat /km'],
    [Wind, 'var(--color-ink-2)', '—', de ? 'Wind km/h' : 'Wind km/h'],
  ]

  const insights = [
    ...(verdict?.went_well ?? []).map((w) => ({ icon: Trophy, color: 'var(--color-amber)', text: w })),
    ...(verdict?.watch_out ?? []).map((w) => ({ icon: Heart, color: 'var(--color-move)', text: w })),
  ]

  return shell(
    <>
      {back}

      {/* 1 · Header + stats */}
      <header className="flex flex-col gap-[18px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-[5px] min-w-0">
            <div className="flex items-center gap-1.5">
              <Footprints size={15} strokeWidth={2.2} style={{ color: ACCENT }} />
              <span className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.13em', color: ACCENT }}>{de ? 'LAUFANALYSE' : 'RUN ANALYSIS'}</span>
            </div>
            <h1 className="num-display" style={{ fontSize: 24, color: 'var(--color-ink)', lineHeight: 1.1 }}>{title}</h1>
            {dateStr && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)' }}>{dateStr}</span>}
          </div>
          <span
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full"
            style={{ padding: '6px 11px', background: 'color-mix(in srgb, var(--color-recovery) 15%, transparent)' }}
          >
            <CheckCircle2 size={15} strokeWidth={2.4} style={{ color: 'var(--color-recovery)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-recovery)' }}>{de ? 'Erledigt' : 'Completed'}</span>
          </span>
        </div>
        <div className="flex justify-between">
          {([
            [distKm > 0 ? distKm.toFixed(1) : '—', 'km', de ? 'DISTANZ' : 'DISTANCE'],
            [fmtDuration(movingS), '', de ? 'ZEIT' : 'TIME'],
            [calories != null ? `${calories}` : elevation != null ? `+${Math.round(elevation)}` : '—', calories != null ? 'kcal' : 'm', calories != null ? (de ? 'KALORIEN' : 'CALORIES') : (de ? 'HÖHE' : 'ELEVATION')],
            [avgHr != null ? `${Math.round(avgHr)}` : '—', 'bpm', de ? 'Ø HF' : 'AVG HR'],
          ] as Array<[string, string, string]>).map(([v, u, l], i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              <span className="flex items-end gap-[3px]">
                <span className="num-display" style={{ fontSize: 20, color: 'var(--color-ink)', lineHeight: 1 }}>{v}</span>
                {u && <span className="num-mono" style={{ fontSize: 12, color: 'var(--color-muted)', paddingBottom: 3 }}>{u}</span>}
              </span>
              <span className="eyebrow" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--color-muted)' }}>{l}</span>
            </div>
          ))}
        </div>
      </header>

      {/* 2 · Pace hero */}
      <div className="rounded-[24px] p-[18px] flex flex-col gap-4" style={card}>
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-[3px]">
            <span className="eyebrow" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{de ? 'Ø TEMPO' : 'AVG PACE'}</span>
            <span className="flex items-end gap-1.5">
              <span className="num-display" style={{ fontSize: 44, color: 'var(--color-ink)', lineHeight: 0.9 }}>{fmtPace(avgPace)}</span>
              <span className="num-mono" style={{ fontSize: 14, color: 'var(--color-muted)', paddingBottom: 7 }}>/km</span>
            </span>
          </div>
          <div className="flex flex-col gap-3 items-end">
            <div className="flex flex-col gap-0.5 items-end">
              <span className="eyebrow" style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'STEIGUNGSKORR.' : 'GRADE-ADJ'}</span>
              <span className="flex items-end gap-0.5">
                <span className="num-display" style={{ fontSize: 22, color: 'var(--color-strain)' }}>{gapPace != null ? fmtPace(gapPace) : '—'}</span>
                {gapPace != null && <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)', paddingBottom: 2 }}>/km</span>}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 items-end">
              <span className="eyebrow" style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'LEISTUNG' : 'POWER'}</span>
              <span className="flex items-end gap-0.5">
                <span className="num-display" style={{ fontSize: 22, color: ACCENT }}>{avgPower != null ? Math.round(avgPower) : '—'}</span>
                {avgPower != null && <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)', paddingBottom: 2 }}>W</span>}
              </span>
            </div>
          </div>
        </div>
        <div style={{ height: 1, background: 'var(--color-rule)' }} />
        <div className="flex flex-wrap gap-2">
          {avgHr != null && maxHr != null && maxHr > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full" style={{ padding: '6px 10px', background: 'var(--color-surface-2)' }}>
              <Heart size={13} strokeWidth={2.2} style={{ color: 'var(--color-move)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>{Math.round((avgHr / maxHr) * 100)}% {de ? 'HFmax' : 'HRmax'}</span>
            </span>
          )}
          {negativeSplit && (
            <span className="inline-flex items-center gap-1.5 rounded-full" style={{ padding: '6px 10px', background: 'var(--color-surface-2)' }}>
              <Gauge size={13} strokeWidth={2.2} style={{ color: 'var(--color-recovery)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Negativer Split' : 'Negative split'}</span>
            </span>
          )}
          {verdict?.grade_letter && (
            <span className="inline-flex items-center gap-1.5 rounded-full" style={{ padding: '6px 10px', background: 'var(--color-surface-2)' }}>
              <Flame size={13} strokeWidth={2.2} style={{ color: 'var(--color-amber)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Note' : 'Grade'} {verdict.grade_letter}</span>
            </span>
          )}
        </div>
      </div>

      {/* 2b · Route & elevation — real GPS route + altitude profile */}
      {(route || elevBars) && (
        <div className="rounded-[24px] p-5 flex flex-col gap-[14px]" style={card}>
          <SectionHead icon={MapIcon} title={de ? 'STRECKE & HÖHE' : 'ROUTE & ELEVATION'} />
          {isOutdoorRoute && route ? (
            <div className="relative rounded-[16px] overflow-hidden" style={{ height: 150, background: 'radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--color-exercise) 10%, var(--color-paper)) 0%, var(--color-paper) 70%)', border: '1px solid var(--color-rule)' }}>
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
              {elevGain != null && elevGain > 0 && (
                <span className="absolute left-2.5 bottom-2.5 inline-flex items-center gap-1.5 rounded-full" style={{ padding: '5px 10px', background: 'color-mix(in srgb, var(--color-paper) 80%, transparent)' }}>
                  <Mountain size={14} strokeWidth={2} style={{ color: 'var(--color-amber)' }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink)' }}>+{Math.round(elevGain)} m</span>
                </span>
              )}
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

      {/* 3 · Per-km splits */}
      <div className="rounded-[24px] p-5 flex flex-col gap-3" style={card}>
        <SectionHead icon={Footprints} title={de ? 'KILOMETER-SPLITS' : 'PER-KM SPLITS'} />
        {splitRows.length >= 2 ? (
          <>
            <div className="flex items-center gap-2 px-1.5" style={{ color: 'var(--color-muted)' }}>
              <span className="num-mono" style={{ width: 34, fontSize: 10, fontWeight: 600 }}>KM</span>
              <span className="num-mono flex-1" style={{ fontSize: 10, fontWeight: 600 }}>{de ? 'TEMPO' : 'PACE'}</span>
              {hasSplitHr && <span className="num-mono text-right" style={{ width: 46, fontSize: 10, fontWeight: 600 }}>HR</span>}
              {hasSplitElev && <span className="num-mono text-right" style={{ width: 56, fontSize: 10, fontWeight: 600 }}>ELEV</span>}
            </div>
            <div className="flex flex-col gap-0.5" style={splitRows.length > 12 ? { maxHeight: 360, overflowY: 'auto' } : undefined}>
              {splitRows.map((s) => {
                const isFast = s.km === fastestKm
                const isSlow = s.km === slowestKm
                const rowBg = isFast
                  ? 'color-mix(in srgb, var(--color-recovery) 15%, transparent)'
                  : isSlow ? 'color-mix(in srgb, var(--color-amber) 9%, transparent)' : 'transparent'
                return (
                  <div key={s.km} className="flex items-center gap-2 rounded-[10px] px-1.5 py-[7px]" style={{ background: rowBg }}>
                    <span className="num-mono" style={{ width: 34, fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{s.km}</span>
                    <span className="num-mono flex-1" style={{ fontSize: 14, fontWeight: 700, color: isFast ? 'var(--color-recovery)' : isSlow ? 'var(--color-amber)' : 'var(--color-ink)' }}>{fmtPace(s.pace)}</span>
                    {hasSplitHr && <span className="num-mono text-right" style={{ width: 46, fontSize: 12, color: 'var(--color-muted)' }}>{s.hr != null ? Math.round(s.hr) : '—'}</span>}
                    {hasSplitElev && <span className="num-mono text-right" style={{ width: 56, fontSize: 12, color: 'var(--color-muted)' }}>{s.elev != null ? `${s.elev >= 0 ? '+' : ''}${Math.round(s.elev)}m` : '—'}</span>}
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <NotRecorded text={de ? 'Kilometer-Splits benötigen GPS-Streamdaten — für diesen Lauf nicht aufgezeichnet.' : 'Per-km splits need GPS stream data — not recorded for this run.'} />
        )}
      </div>

      {/* 4 · Heart rate + zones */}
      <div className="rounded-[24px] p-5 flex flex-col gap-3.5" style={card}>
        <SectionHead
          icon={HeartPulse}
          title={de ? 'HERZFREQUENZ' : 'HEART RATE'}
          color="var(--color-move)"
          right={(avgHr != null || maxHr != null) && (
            <span className="num-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>
              {de ? 'Ø' : 'Avg'} {avgHr != null ? Math.round(avgHr) : '—'} · Max {maxHr != null ? Math.round(maxHr) : '—'} bpm
            </span>
          )}
        />
        {zoneTotal > 0 ? (
          <div className="flex flex-col gap-[9px]">
            {zoneSecs.map((sec, i) => (
              <div key={i} className="flex items-center gap-2.5" title={`${zoneLabels[i]} · ${fmtDuration(sec)} · ${Math.round((sec / zoneTotal) * 100)}%`}>
                <span style={{ width: 92, fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>{zoneLabels[i]}</span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-3)', cursor: 'default' }}>
                  <div style={{ width: `${(sec / zoneTotal) * 100}%`, height: '100%', borderRadius: 999, background: zoneColors[i] }} />
                </div>
                <span className="num-mono text-right" style={{ width: 38, fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{fmtDuration(sec)}</span>
              </div>
            ))}
          </div>
        ) : (
          <NotRecorded text={de ? 'HF-Zonenzeit benötigt einen Herzfrequenz-Stream — nicht aufgezeichnet.' : 'HR-zone time needs a heart-rate stream — not recorded.'} />
        )}
        <div style={{ height: 1, background: 'var(--color-rule)' }} />
        <div className="flex justify-between">
          {([
            [de ? 'Kardiale Drift' : 'Cardiac drift', decoupling != null ? `${decoupling.toFixed(1)}%` : '—', decoupling != null ? (decoupling <= 5 ? (de ? 'Niedrig' : 'Low') : decoupling <= 10 ? (de ? 'Moderat' : 'Moderate') : (de ? 'Hoch' : 'High')) : '', decoupling != null && decoupling <= 5 ? 'var(--color-recovery)' : 'var(--color-amber)'],
            [de ? 'Aerobe TE' : 'Aerobic TE', '—', '', 'var(--color-strain)'],
            [de ? 'Anaerobe TE' : 'Anaerobic TE', '—', '', 'var(--color-muted)'],
          ] as Array<[string, string, string, string]>).map(([l, v, s, c], i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>{l}</span>
              <span className="num-display" style={{ fontSize: 19, color: 'var(--color-ink)' }}>{v}</span>
              {s && <span style={{ fontSize: 9, fontWeight: 500, color: c }}>{s}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* 5 · Running dynamics */}
      <div className="rounded-[24px] p-5 flex flex-col gap-3.5" style={card}>
        <SectionHead icon={LineChart} title={de ? 'LAUF-DYNAMIK' : 'RUNNING DYNAMICS'} />
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>{de ? 'Deine Form vs. Freizeit → Elite' : 'Your form vs recreational → elite'}</span>
        <div className="flex flex-col gap-2.5">
          {dynMetrics.map((m, i) => (
            <div key={i} className="flex items-center justify-between">
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)' }}>{m}</span>
              <span className="flex items-end gap-0.5">
                <span className="num-display" style={{ fontSize: 17, color: 'var(--color-ink)' }}>{dynData[i].v}</span>
                {dynData[i].u && <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)', paddingBottom: 2 }}>{dynData[i].u}</span>}
              </span>
            </div>
          ))}
        </div>
        {!hasDyn && <NotRecorded text={de ? 'Lauf-Dynamik (Frequenz, Bodenkontakt, Osz.) benötigt einen Dynamik-Sensor — nicht aufgezeichnet.' : 'Running dynamics (cadence, ground contact, oscillation) need a dynamics pod — not recorded.'} />}
      </div>

      {/* 6 · VO₂ max & race predictor */}
      <div className="rounded-[24px] p-5 flex flex-col gap-3.5" style={card}>
        <SectionHead icon={HeartPulse} title={de ? 'VO2 MAX & RENN-PROGNOSE' : 'VO2 MAX & RACE PREDICTOR'} />
        <div className="rounded-[16px] p-4 flex items-center justify-between" style={{ background: 'var(--color-surface-2)' }}>
          <div className="flex flex-col gap-1">
            <span className="eyebrow" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>VO2 MAX</span>
            <span className="flex items-end gap-1.5">
              <span className="num-display" style={{ fontSize: 36, color: 'var(--color-ink)', lineHeight: 0.9 }}>{vo2 != null ? Math.round(vo2) : '—'}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)', paddingBottom: 6 }}>ml/kg/min</span>
            </span>
            {vo2 != null && (
              <span className="inline-flex items-center gap-1 rounded-full self-start" style={{ padding: '3px 8px', background: 'color-mix(in srgb, var(--color-recovery) 15%, transparent)' }}>
                <TrendingUp size={12} strokeWidth={2.2} style={{ color: 'var(--color-recovery)' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-recovery)' }}>{de ? 'geschätzt' : 'estimated'}</span>
              </span>
            )}
          </div>
        </div>
        <span className="eyebrow" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{de ? 'PROGNOSTIZIERTE RENNZEITEN' : 'PREDICTED RACE TIMES'}</span>
        <div className="grid grid-cols-4 gap-2">
          {predictions.map((p) => (
            <div key={p.label} className="rounded-[12px] py-3 px-1.5 flex flex-col gap-[3px] items-center" style={{ background: 'var(--color-surface-2)' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{p.label}</span>
              <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{fmtDuration(p.time)}</span>
            </div>
          ))}
        </div>
        <NotRecorded text={canPredict
          ? (de ? 'Geschätzt aus diesem Lauf (Riegel-Formel).' : 'Estimated from this run (Riegel formula).')
          : (de ? 'Prognose benötigt einen Lauf ≥ 3 km.' : 'Prediction needs a run ≥ 3 km.')} />
      </div>

      {/* 7 · Fuel & hydration */}
      <div className="rounded-[24px] p-5 flex flex-col gap-3.5" style={card}>
        <SectionHead icon={GlassWater} title={de ? 'ERNÄHRUNG & FLÜSSIGKEIT' : 'FUEL & HYDRATION'} />
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>{de ? 'Aufnahme vs. Ziel für diese Belastung' : 'Intake vs target for this effort'}</span>
        <div className="flex justify-between">
          {([
            [movingS >= 3600 ? '60' : '—', de ? 'KH g/h Ziel' : 'carbs g/hr target', 'var(--color-recovery)'],
            ['~500', de ? 'Flüssig. ml/h' : 'fluid ml/hr', 'var(--color-strain)'],
            [calories != null && distKm > 0 ? `${Math.round(calories / distKm)}` : '—', 'kcal/km', 'var(--color-ink-2)'],
            [calories != null ? `${calories}` : '—', 'kcal', 'var(--color-amber)'],
          ] as Array<[string, string, string]>).map(([v, l, c], i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <span className="num-display" style={{ fontSize: 17, color: c }}>{v}</span>
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{l}</span>
            </div>
          ))}
        </div>
        <div style={{ height: 1, background: 'var(--color-rule)' }} />
        <NotRecorded text={calories != null ? (de ? `${calories} kcal verbrannt (Garmin). Ziel-Aufnahme geschätzt; protokollierte Verpflegung nicht erfasst.` : `${calories} kcal burned (Garmin). Target intake estimated; logged fueling not recorded.`) : (de ? 'Ernährungs-Timeline benötigt protokollierte Verpflegung — nicht aufgezeichnet.' : 'Fueling timeline needs logged intake — not recorded for this run.')} />
      </div>

      {/* 8 · Conditions */}
      <div className="rounded-[24px] p-5 flex flex-col gap-3.5" style={card}>
        <SectionHead icon={Thermometer} title={de ? 'BEDINGUNGEN' : 'CONDITIONS'} />
        <div className="grid grid-cols-4 gap-2">
          {envTiles.map(([Icon, color, v, l], i) => (
            <div key={i} className="rounded-[12px] flex flex-col items-center gap-1.5" style={{ background: 'var(--color-surface-2)', padding: '13px 4px' }}>
              <Icon size={18} style={{ color }} />
              <span className="num-display" style={{ fontSize: 17, color: 'var(--color-ink)' }}>{v}</span>
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)', textAlign: 'center' }}>{l}</span>
            </div>
          ))}
        </div>
        <NotRecorded text={de ? 'Wetterdaten wurden für diesen Lauf nicht aufgezeichnet.' : 'Weather data was not recorded for this run.'} />
      </div>

      {/* 9 · Shoe mileage */}
      <div className="rounded-[24px] p-5 flex flex-col gap-3" style={card}>
        <SectionHead icon={Footprints} title={de ? 'SCHUH-KILOMETER' : 'SHOE MILEAGE'} />
        <div className="flex items-center gap-3">
          <span className="grid place-items-center rounded-[12px]" style={{ width: 42, height: 42, background: 'var(--color-surface-2)' }}>
            <Footprints size={22} style={{ color: ACCENT }} />
          </span>
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{de ? 'Kein Schuh zugeordnet' : 'No shoe assigned'}</span>
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Schuh-Kilometer nicht erfasst' : 'Shoe mileage not tracked'}</span>
          </div>
          <span className="flex items-end gap-0.5">
            <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>—</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)', paddingBottom: 2 }}>km</span>
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-3)' }} />
      </div>

      {/* 10 · Coach insights */}
      <div
        className="rounded-[24px] p-5 flex flex-col gap-4"
        style={{ background: 'var(--color-accent-soft)', border: `1px solid ${ACCENT}` }}
      >
        <SectionHead icon={Lightbulb} title={de ? 'COACH-ANALYSE' : 'COACH INSIGHTS'} color={ACCENT} />
        {verdict?.ai_verdict && (
          <p style={{ fontSize: 13, color: 'var(--color-ink)', lineHeight: 1.45 }}>{verdict.ai_verdict}</p>
        )}
        {insights.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {insights.map((ins, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <ins.icon size={17} strokeWidth={2} style={{ color: ins.color, marginTop: 1, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{ins.text}</span>
              </div>
            ))}
          </div>
        ) : !verdict?.ai_verdict ? (
          <NotRecorded text={de ? 'Detailliertes Coaching benötigt einen aufgezeichneten Lauf (GPS/HF).' : 'Detailed coaching needs a recorded run (GPS/HR).'} />
        ) : null}
        <div style={{ height: 1, background: 'color-mix(in srgb, var(--color-accent) 25%, transparent)' }} />
        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            <div className="flex flex-col">
              <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>—</span>
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Erholung' : 'Recovery'}</span>
            </div>
            <div className="flex flex-col">
              <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>—</span>
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Nächste Einheit' : 'Next session'}</span>
            </div>
          </div>
          <Link
            to="/dashboard?tab=plan"
            className="inline-flex items-center gap-1.5 rounded-full"
            style={{ padding: '10px 16px', background: ACCENT }}
          >
            <span className="num-display" style={{ fontSize: 13, color: 'var(--color-ink)' }}>{de ? 'Plan ansehen' : 'View plan'}</span>
            <ArrowRight size={16} strokeWidth={2.4} style={{ color: 'var(--color-ink)' }} />
          </Link>
        </div>
      </div>
    </>,
  )
}
