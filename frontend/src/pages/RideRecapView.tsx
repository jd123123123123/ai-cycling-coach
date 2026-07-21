/**
 * RideRecapView — the V3 "Ride Recap" post-save landing, rebuilt 1:1 from the
 * pen frame Q5zjIH (content g7IQxJ). Render order matches the pen top-to-bottom:
 *   1 Header (back · "Ride complete" + date · share)
 *   2 Gradient hero (grade score · ride name · distance/elev/time · route line)
 *   3 AI narrative + trait tags
 *   4 Ride power-over-time graph (zone-colored bars, terrain behind) + zone dist
 *   5 Pacing card — 1st vs 2nd half Speed & Power (proves negative split)
 *   6 RPE 1-tap loop — "How hard did that feel?" (persists; tunes next week)
 *   7 Power & Effort — IF-fills-toward-FTP bar + metric tiles
 *   8 Achievements (PR badges from this ride's peak efforts)
 *   9 "Go deeper" → Ride Analysis
 * The pen's kudos footer is intentionally omitted — real kudos need crew/social
 * data this surface doesn't own; fabricating avatars would break the honesty
 * rule. Every missing stream renders an honest "—" or the card self-hides.
 */
import { useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { parseISO, format } from 'date-fns'
import { de as deLocale } from 'date-fns/locale'
import {
  ChevronLeft, Share2, Sparkles, Activity, TrendingUp, Gauge, Zap, Award, Star,
  ChevronRight, Flag, LineChart, Trophy,
} from 'lucide-react'
import { useRaceDebrief } from '../hooks/useRaceDebrief'
import { useStreamAnalysis } from '../hooks/useStreamAnalysis'
import { useAthleteProfile } from '../hooks/useAthleteProfile'
import { useRideRpe, useSetRideRpe } from '../hooks/useRideRpe'
import type { RpeValue } from '../api/rideFeedback'
import { useLocale } from '../contexts/LocaleContext'
import { useCelebrate } from '../contexts/CelebrationContext'
import { bestPrEffort, pbDedupKey } from '../lib/celebration'
import { hapticTick } from '../lib/haptics'

// ── helpers ─────────────────────────────────────────────────────────────────
function routePath(poly: [number, number][], w: number, h: number, pad = 16): { d: string; pts: [number, number][] } | null {
  if (!poly || poly.length < 2) return null
  const lats = poly.map((p) => p[0]), lngs = poly.map((p) => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const midLat = (minLat + maxLat) / 2
  const kx = Math.cos((midLat * Math.PI) / 180)
  const gw = (maxLng - minLng) * kx || 1e-6
  const gh = (maxLat - minLat) || 1e-6
  const scale = Math.min((w - 2 * pad) / gw, (h - 2 * pad) / gh)
  const offX = pad + ((w - 2 * pad) - gw * scale) / 2
  const offY = pad + ((h - 2 * pad) - gh * scale) / 2
  const pts = poly.map(([lat, lng]): [number, number] => [
    offX + (lng - minLng) * kx * scale,
    offY + (maxLat - lat) * scale,
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

function fmtHM(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`
}

const ZONE_VARS = [
  'var(--color-zone-1)', 'var(--color-zone-2)', 'var(--color-zone-3)',
  'var(--color-zone-4)', 'var(--color-zone-5)', 'var(--color-zone-6)', 'var(--color-zone-7)',
]
// Coggan power-zone upper bounds as fractions of FTP.
function zoneOf(watts: number, ftp: number): number {
  const f = watts / ftp
  if (f < 0.55) return 0
  if (f < 0.75) return 1
  if (f < 0.90) return 2
  if (f < 1.05) return 3
  if (f < 1.20) return 4
  if (f < 1.50) return 5
  return 6
}

const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const
const cardCls = 'rounded-[24px] p-5 flex flex-col gap-[14px]'

// Canonical effort lengths for the recap mean-maximal power card (pen E71iR).
const REC_MMP_DURS: { s: number; en: string; de: string }[] = [
  { s: 5, en: '5 s', de: '5 s' }, { s: 15, en: '15 s', de: '15 s' },
  { s: 60, en: '1 min', de: '1 Min' }, { s: 300, en: '5 min', de: '5 Min' },
  { s: 1200, en: '20 min', de: '20 Min' }, { s: 3600, en: '60 min', de: '60 Min' },
]

export default function RideRecapView() {
  const { id } = useParams()
  const activityId = Number(id)
  const idOk = Number.isFinite(activityId)
  const navigate = useNavigate()
  const { locale } = useLocale()
  const de = locale === 'de'
  const dfLocale = de ? { locale: deLocale } : undefined
  const nf = (n: number) => n.toLocaleString(de ? 'de' : 'en')

  const { data, isLoading, isError } = useRaceDebrief(idOk ? activityId : undefined)
  const { data: sa } = useStreamAnalysis(idOk ? activityId : undefined)
  const { data: athlete } = useAthleteProfile()
  const { data: rpeData } = useRideRpe(idOk ? activityId : undefined)
  const setRpe = useSetRideRpe(idOk ? activityId : undefined)
  const { celebrateOnce } = useCelebrate()

  const header = data?.header ?? null
  const verdict = data?.verdict ?? null
  const story = data?.story ?? null
  const pacing = data?.pacing ?? null
  const efficiency = data?.efficiency ?? null
  const efforts = data?.efforts ?? []
  const ftp = athlete?.ftp_watts ?? data?.wko?.mftp_watts ?? null
  const weight = athlete?.weight_kg ?? null

  const route = useMemo(
    () => (sa?.gps?.polyline ? routePath(sa.gps.polyline, 358, 300) : null),
    [sa],
  )

  // Weather chip (honest — only when the stream carried it).
  const tempC = useMemo(() => {
    const w = sa?.weather as Record<string, unknown> | null | undefined
    const t = w && typeof w === 'object' ? (w['temp_c'] ?? w['temperature'] ?? w['temp']) : null
    return typeof t === 'number' ? Math.round(t) : null
  }, [sa])

  // Power stats
  const power = useMemo(() => {
    const p = (story?.power ?? []).filter((x): x is number => typeof x === 'number' && x > 0)
    const avg = p.length ? Math.round(p.reduce((a, b) => a + b, 0) / p.length) : null
    const max = p.length ? Math.round(Math.max(...p)) : null
    const np = header?.np_watts ?? null
    const ifr = header?.if_ ?? (np && ftp ? np / ftp : null)
    return { avg, max, np, ifr, wkg: avg && weight ? avg / weight : null }
  }, [story, header, ftp, weight])

  // Power-over-time bars (zone-colored), plus terrain area behind.
  const graph = useMemo(() => {
    const p = story?.power
    if (!p || !p.some((v) => typeof v === 'number' && v > 0) || !ftp) return null
    const bars = downsample(p.map((v) => (typeof v === 'number' ? v : 0)), 48)
    const maxW = Math.max(...bars, ftp) || 1
    const alt = (story?.altitude ?? []).filter((x): x is number => typeof x === 'number')
    let terrain: number[] | null = null
    if (alt.length > 4) {
      const ds = downsample(alt, 48)
      const min = Math.min(...ds), span = Math.max(...ds) - min || 1
      terrain = ds.map((a) => (a - min) / span)
    }
    return {
      bars: bars.map((w) => ({ frac: Math.max(0.04, w / maxW), zone: zoneOf(w, ftp) })),
      terrain,
    }
  }, [story, ftp])

  // Ride mean-maximal power (pen "Mean-max power" card): the best rolling-average
  // watts this ride held for each canonical duration, from this ride's own power
  // stream (O(n) prefix-sum sliding window). Bars are zone-colored; durations that
  // set a season best (efforts.is_pr) get a PR marker. Honest empty when the ride
  // carries no real power — the whole Power & Effort section hides in that case.
  const mmp = useMemo(() => {
    const p = story?.power
    if (!p || p.length < 2 || !ftp || ftp <= 0) return null
    if (!p.some((v) => typeof v === 'number' && v > 0)) return null
    const n = p.length
    const t = story?.t
    const span = t && t.length === n && t[n - 1] > t[0] ? t[n - 1] - t[0] : n - 1
    const dt = span > 0 ? span / (n - 1) : 1
    const rideLen = span > 0 ? span : n
    const prefix = new Float64Array(n + 1)
    for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + (typeof p[i] === 'number' ? (p[i] as number) : 0)
    const prSet = new Set(efforts.filter((e) => e.is_pr).map((e) => e.duration_s))
    const rows: { s: number; label: string; w: number; pr: boolean; zone: number }[] = []
    for (const d of REC_MMP_DURS) {
      if (d.s > rideLen + 0.5) break
      const win = Math.max(1, Math.round(d.s / dt))
      if (win > n) continue
      let best = -Infinity
      for (let i = win; i <= n; i++) {
        const avg = (prefix[i] - prefix[i - win]) / win
        if (avg > best) best = avg
      }
      if (best > 0) rows.push({ s: d.s, label: de ? d.de : d.en, w: best, pr: prSet.has(d.s), zone: zoneOf(best, ftp) })
    }
    return rows.length ? rows : null
  }, [story, ftp, efforts, de])

  // Zone distribution track from pacing.zone_time_pct
  const zoneDist = useMemo(() => {
    const zt = pacing?.zone_time_pct
    if (!zt) return null
    const rows: { z: number; pct: number }[] = []
    for (let z = 1; z <= 7; z++) {
      const pct = zt[`z${z}`] ?? zt[`Z${z}`] ?? zt[String(z)]
      if (typeof pct === 'number' && pct > 0) rows.push({ z, pct })
    }
    return rows.length ? rows : null
  }, [pacing])

  // Pacing: 1st vs 2nd half power (from pacing) + speed (from story.speed halves)
  const halves = useMemo(() => {
    const p1 = pacing?.first_half_np ?? null
    const p2 = pacing?.second_half_np ?? null
    const spd = (story?.speed ?? []).filter((x): x is number => typeof x === 'number' && x >= 0)
    let s1: number | null = null, s2: number | null = null
    if (spd.length >= 4) {
      const mid = Math.floor(spd.length / 2)
      const mean = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length) * 3.6
      s1 = mean(spd.slice(0, mid)); s2 = mean(spd.slice(mid))
    }
    const negSplit = p1 != null && p2 != null && p2 >= p1
    return { p1, p2, s1, s2, negSplit }
  }, [pacing, story])

  // Trait tags derived honestly from pacing.
  const tags = useMemo(() => {
    const out: { label: string; color: string }[] = []
    if (halves.negSplit) out.push({ label: de ? 'Negativer Split' : 'Negative split', color: 'var(--color-recovery)' })
    if (pacing?.variability_index != null && pacing.variability_index <= 1.05)
      out.push({ label: de ? 'Gleichmäßig' : 'Even pacing', color: 'var(--color-stand)' })
    if (pacing?.final_30min_np != null && power.np != null && pacing.final_30min_np >= power.np)
      out.push({ label: de ? 'Starkes Finish' : 'Strong finish', color: 'var(--color-amber)' })
    return out
  }, [halves, pacing, power, de])

  const prCount = efforts.filter((e) => e.is_pr).length
  const durLabel = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}min` : `${Math.round(s / 3600)}h`)

  const RPE_OPTS: { key: RpeValue; label: string }[] = [
    { key: 'easy', label: de ? 'Locker' : 'Easy' },
    { key: 'moderate', label: de ? 'Moderat' : 'Moderate' },
    { key: 'hard', label: de ? 'Hart' : 'Hard' },
    { key: 'all_out', label: de ? 'Volle Power' : 'All out' },
  ]
  const selectedRpe = rpeData?.rpe ?? null

  function onShare() {
    const title = header?.title ?? (de ? 'Meine Fahrt' : 'My ride')
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title, url: window.location.href }).catch(() => {})
    }
  }

  // Micro-dopamine: a viewed ride that set a season best earns ONE celebration,
  // ever — the highest-wattage is_pr effort drives the pen "NEW PERSONAL RECORD"
  // moment. Deduped by activity so a revisit/re-render never re-fires. Honest:
  // no PB in the real efforts → no celebration.
  const bestPr = useMemo(() => bestPrEffort(efforts), [efforts])
  useEffect(() => {
    if (!idOk || !bestPr) return
    celebrateOnce(pbDedupKey(activityId), 'pb', {
      kicker: de ? 'NEUER REKORD' : 'NEW PERSONAL RECORD',
      value: Math.round(bestPr.ride_watts),
      unit: 'W',
      rarity: prCount > 1 ? (de ? `${prCount} BESTWERTE` : `${prCount} PBs`) : undefined,
      detail: de
        ? `Deine beste ${durLabel(bestPr.duration_s)}-Leistung aller Zeiten.`
        : `Your best ${durLabel(bestPr.duration_s)} power ever.`,
      onShare,
      shareLabel: de ? 'Diesen Erfolg teilen' : 'Share this win',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idOk, activityId, bestPr, prCount, de])

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <div className="max-w-md mx-auto pb-28">
        {/* 1 · Header */}
        <div className="flex items-center justify-between gap-3 px-4 pt-6 pb-2.5">
          <button
            onClick={() => navigate('/dashboard?tab=history')}
            className="grid place-items-center rounded-full"
            style={{ width: 40, height: 40, background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
            aria-label={de ? 'Zurück' : 'Back'}
          >
            <ChevronLeft size={22} strokeWidth={2.2} style={{ color: 'var(--color-ink)' }} />
          </button>
          <div className="flex flex-col items-center min-w-0">
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Fahrt abgeschlossen' : 'Ride complete'}</span>
            {header?.date && (
              <span className="num-mono" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                {format(parseISO(header.date), de ? 'EEE, d. MMM · HH:mm' : 'EEE, MMM d · HH:mm', dfLocale)}
              </span>
            )}
          </div>
          <button
            onClick={onShare}
            className="grid place-items-center rounded-full"
            style={{ width: 40, height: 40, background: 'var(--color-accent)' }}
            aria-label={de ? 'Teilen' : 'Share'}
          >
            <Share2 size={18} strokeWidth={2.2} style={{ color: '#fff' }} />
          </button>
        </div>

        {isLoading && (
          <div className="flex flex-col gap-[18px] px-4 pt-2">
            <div className="rounded-[24px] shimmer-bg" style={{ height: 300, border: '1px solid var(--color-rule)' }} />
            <div className="rounded-[24px] h-40 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
          </div>
        )}
        {isError && (
          <p className="px-4" style={{ color: 'var(--color-bad)', fontSize: 14 }}>
            {de ? 'Recap konnte nicht geladen werden.' : "Couldn't load this recap."}
          </p>
        )}

        {data && header && (
          <div className="flex flex-col gap-[18px] px-4 pt-1">
            {/* 2 · Gradient hero */}
            <div
              className="relative rounded-[24px] overflow-hidden flex flex-col justify-between"
              style={{ height: 300, padding: 20, background: 'linear-gradient(120deg, #FF6A3C 0%, #FA1E55 52%, #3868FF 100%)' }}
            >
              {route && (
                <svg viewBox="0 0 358 300" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0 }}>
                  <path d={route.d} fill="none" stroke="#FFFFFF40" strokeWidth={11} strokeLinejoin="round" strokeLinecap="round" />
                  <path d={route.d} fill="none" stroke="#FFFFFF" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
                  <circle cx={route.pts[0][0]} cy={route.pts[0][1]} r={7} fill="var(--color-recovery)" stroke="#fff" strokeWidth={3} />
                  <circle cx={route.pts[route.pts.length - 1][0]} cy={route.pts[route.pts.length - 1][1]} r={7} fill="var(--color-amber)" stroke="#fff" strokeWidth={3} />
                </svg>
              )}
              <div className="absolute left-0 right-0 bottom-0" style={{ height: 150, background: 'linear-gradient(to top, #0A0C0FCC, transparent)' }} />
              <div className="relative flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full" style={{ padding: '6px 12px', background: '#FFFFFF26' }}>
                  <Activity size={14} strokeWidth={2.4} style={{ color: '#fff' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{(header.sport || (de ? 'Radfahren' : 'Ride')).toUpperCase()}</span>
                </span>
                {tempC != null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full" style={{ padding: '6px 12px', background: '#FFFFFF26', fontSize: 12, fontWeight: 700, color: '#fff' }}>
                    {tempC}°C
                  </span>
                )}
              </div>
              <div className="relative flex flex-col gap-3.5">
                {verdict?.grade_letter && (
                  <span className="inline-flex items-center gap-2 self-start rounded-full" style={{ padding: '6px 12px', background: '#FFFFFF26' }}>
                    <span className="num-display" style={{ fontSize: 18, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{verdict.grade_letter}</span>
                    {verdict.grade_score != null && <span style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFFCC' }}>{Math.round(verdict.grade_score)}/100</span>}
                  </span>
                )}
                <h1 className="num-display" style={{ fontSize: 30, fontWeight: 700, color: '#fff', lineHeight: 1.05 }}>{header.title}</h1>
                <div className="flex items-end justify-between">
                  {([
                    { v: header.distance_km != null ? header.distance_km.toFixed(1) : '—', u: 'km' },
                    { v: header.elevation_m != null ? nf(Math.round(header.elevation_m)) : '—', u: de ? 'Hm' : 'm' },
                    { v: header.moving_time_s != null ? fmtHM(header.moving_time_s) : '—', u: 'h:m' },
                    { v: header.tss != null ? Math.round(header.tss).toString() : '—', u: 'TSS' },
                  ]).map((x, i) => (
                    <div key={i} className="flex flex-col">
                      <span className="num-display" style={{ fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{x.v}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#FFFFFFB0' }}>{x.u}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3 · AI narrative + tags */}
            {verdict?.ai_verdict && (
              <div className={cardCls} style={cardStyle}>
                <div className="flex items-center gap-3">
                  <span className="grid place-items-center rounded-full shrink-0" style={{ width: 40, height: 40, background: 'var(--color-accent)' }}>
                    <Sparkles size={19} strokeWidth={2.2} style={{ color: '#fff' }} />
                  </span>
                  <div className="flex flex-col">
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Coach-Analyse' : 'Coach analysis'}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'So ist die Fahrt gelaufen' : 'How the ride went'}</span>
                  </div>
                </div>
                <p style={{ fontSize: 14, color: 'var(--color-ink-2)', lineHeight: 1.5 }}>{verdict.ai_verdict}</p>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((t, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 rounded-full" style={{ padding: '5px 11px', background: 'var(--color-surface-2)', border: `1px solid ${t.color}` }}>
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: t.color }} />
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>{t.label}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 4 · Ride power-over-time graph + zone distribution */}
            {graph && (
              <div className={cardCls} style={cardStyle}>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Leistung über Zeit' : 'Power over time'}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Nach Leistungszone eingefärbt' : 'Colored by power zone'}</span>
                  </div>
                  {power.max != null && (
                    <span className="inline-flex items-center gap-1.5 rounded-full" style={{ padding: '5px 10px', background: 'var(--color-surface-2)' }}>
                      <Zap size={13} strokeWidth={2.2} style={{ color: 'var(--color-accent)' }} />
                      <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-ink)' }}>{power.max} W</span>
                    </span>
                  )}
                </div>
                <div className="relative" style={{ height: 150 }}>
                  {graph.terrain && (
                    <svg viewBox="0 0 318 150" width="100%" height="100%" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
                      <path
                        d={`M0 150 ${graph.terrain.map((f, i) => `L${((i / (graph.terrain!.length - 1)) * 318).toFixed(1)} ${(150 - f * 120).toFixed(1)}`).join(' ')} L318 150 Z`}
                        fill="#38B6FF1A"
                      />
                    </svg>
                  )}
                  <div className="absolute inset-0 flex items-end" style={{ gap: 2 }}>
                    {graph.bars.map((b, i) => (
                      <div key={i} className="flex-1 rounded-[1px]" style={{ height: `${Math.round(b.frac * 100)}%`, background: ZONE_VARS[b.zone] }} />
                    ))}
                  </div>
                </div>
                <div className="flex justify-between" style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>
                  <span>{de ? 'Start' : 'Start'}</span><span>{de ? 'Ziel' : 'Finish'}</span>
                </div>
                {zoneDist && (
                  <>
                    <div style={{ height: 1, background: 'var(--color-rule)' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Zeit in Leistungszonen' : 'Time in power zones'}</span>
                    <div className="flex rounded-full overflow-hidden" style={{ height: 14 }}>
                      {zoneDist.map((r) => (
                        <div key={r.z} style={{ width: `${r.pct}%`, background: ZONE_VARS[r.z - 1] }} title={`Z${r.z} · ${Math.round(r.pct)}%`} />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                      {zoneDist.map((r) => (
                        <span key={r.z} className="inline-flex items-center gap-1.5">
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: ZONE_VARS[r.z - 1] }} />
                          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-muted)' }}>Z{r.z} · {Math.round(r.pct)}%</span>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 5 · Pacing — 1st vs 2nd half */}
            {(halves.p1 != null || halves.s1 != null) && (
              <div className={cardCls} style={cardStyle}>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'So hast du es umgesetzt' : 'How you executed it'}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Erste vs. zweite Hälfte' : 'First vs second half'}</span>
                  </div>
                  {halves.negSplit && (
                    <span className="inline-flex items-center gap-1.5 rounded-full" style={{ padding: '5px 11px', background: 'var(--color-recovery-soft, color-mix(in srgb, var(--color-recovery) 15%, transparent))' }}>
                      <TrendingUp size={13} strokeWidth={2.2} style={{ color: 'var(--color-recovery)' }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-recovery)' }}>{de ? 'Negativer Split' : 'Negative split'}</span>
                    </span>
                  )}
                </div>
                <div className="flex gap-2.5">
                  {([
                    { icon: <Gauge size={16} strokeWidth={2} />, label: de ? 'Tempo' : 'Speed', unit: 'km/h', a: halves.s1, b: halves.s2, color: 'var(--color-strain)' },
                    { icon: <Zap size={16} strokeWidth={2} />, label: de ? 'Leistung' : 'Power', unit: 'W', a: halves.p1, b: halves.p2, color: 'var(--color-accent)' },
                  ]).filter((g) => g.a != null && g.b != null).map((g, i) => {
                    const mx = Math.max(g.a as number, g.b as number) || 1
                    return (
                      <div key={i} className="flex-1 flex flex-col gap-2.5 rounded-[16px]" style={{ background: 'var(--color-surface-2)', padding: 14 }}>
                        <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>
                          <span style={{ color: g.color, display: 'inline-flex' }}>{g.icon}</span>{g.label}
                        </span>
                        {([['1', g.a as number], ['2', g.b as number]] as [string, number][]).map(([half, val]) => (
                          <div key={half} className="flex items-center gap-2">
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-muted)', width: 12 }}>{half}.</span>
                            <div className="flex-1 rounded-full overflow-hidden" style={{ height: 8, background: 'var(--color-surface-3)' }}>
                              <div style={{ width: `${Math.round((val / mx) * 100)}%`, height: '100%', background: g.color }} />
                            </div>
                            <span className="num-mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-ink)', width: 34, textAlign: 'right' }}>{Math.round(val)}</span>
                          </div>
                        ))}
                        <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{g.unit}</span>
                      </div>
                    )
                  })}
                </div>
                {halves.negSplit && (
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
                    {de
                      ? 'Du bist die zweite Hälfte stärker gefahren — Beine früh gespart, spät entladen. So gewinnt man die großen Tage.'
                      : 'You rode the back half stronger — legs saved early, unloaded late. That\'s how the big days are won.'}
                  </p>
                )}
              </div>
            )}

            {/* 6 · RPE 1-tap loop */}
            <div className="rounded-[24px] p-5 flex flex-col gap-3" style={{ background: 'var(--color-paper-2)', border: '1.5px solid var(--color-accent)' }}>
              <div className="flex flex-col gap-0.5">
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Wie hart hat sich das angefühlt?' : 'How hard did that feel?'}</span>
                <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Ein Tipp — deine Antwort justiert die Ziele nächste Woche' : 'One tap — your answer tunes next week\'s targets'}</span>
              </div>
              <div className="flex gap-2">
                {RPE_OPTS.map((o) => {
                  const active = selectedRpe === o.key
                  return (
                    <button
                      key={o.key}
                      onClick={() => { hapticTick(); setRpe.mutate(o.key) }}
                      disabled={setRpe.isPending}
                      className="flex-1 grid place-items-center rounded-full"
                      style={{
                        padding: '10px 0',
                        background: active ? 'var(--color-accent)' : 'var(--color-surface-2)',
                        border: active ? '1px solid var(--color-accent)' : '1px solid var(--color-rule)',
                        transition: 'background 120ms',
                      }}
                    >
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: active ? '#fff' : 'var(--color-ink-2)' }}>{o.label}</span>
                    </button>
                  )
                })}
              </div>
              {selectedRpe && (
                <span className="inline-flex items-center gap-1.5" style={{ fontSize: 11.5, color: 'var(--color-recovery)' }}>
                  <Star size={12} strokeWidth={2.4} style={{ color: 'var(--color-recovery)' }} />
                  {de ? 'Gespeichert — fließt in die Anpassung nächste Woche ein.' : 'Saved — feeds next week\'s adaptation.'}
                </span>
              )}
            </div>

            {/* 7 · Power & Effort */}
            {power.np != null && ftp && (
              <div className="flex flex-col gap-3">
                <div className={cardCls} style={cardStyle}>
                  <div className="flex flex-col gap-0.5">
                    <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Leistung & Effort' : 'Power & Effort'}</span>
                    <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>{de ? 'Normalisierte Leistung im Verhältnis zur Schwelle' : 'Normalized power relative to threshold'}</span>
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="flex items-end gap-1.5">
                      <span className="num-display" style={{ fontSize: 34, color: 'var(--color-ink)', lineHeight: 1 }}>{Math.round(power.np)}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink-2)', paddingBottom: 3 }}>W NP</span>
                    </span>
                    {power.ifr != null && (
                      <span className="num-display" style={{ fontSize: 22, color: 'var(--color-accent)', lineHeight: 1 }}>IF {power.ifr.toFixed(2)}</span>
                    )}
                  </div>
                  <div className="relative rounded-full overflow-hidden" style={{ height: 14, background: 'var(--color-surface-3)' }}>
                    <div style={{ width: `${Math.min(100, Math.round(((power.np / ftp)) * 100))}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-recovery), var(--color-accent))' }} />
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: '100%', width: 2, background: 'var(--color-ink-2)', transform: 'translateX(-2px)' }} />
                  </div>
                  <div className="flex justify-between" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-muted)' }}>
                    <span>NP {Math.round(power.np)} W</span><span>FTP {Math.round(ftp)} W</span>
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                    {de
                      ? `Deine normalisierte Leistung lag bei ${Math.round((power.np / ftp) * 100)}% der Schwelle${header.moving_time_s ? ` für ${fmtHM(header.moving_time_s)} h` : ''} — ein echt harter Tag.`
                      : `Your normalized power sat at ${Math.round((power.np / ftp) * 100)}% of threshold${header.moving_time_s ? ` for ${fmtHM(header.moving_time_s)} h` : ''} — a genuinely hard day.`}
                  </p>
                </div>
                <div className="flex gap-2.5">
                  {([
                    { v: power.avg != null ? `${power.avg}` : '—', u: 'W', l: de ? 'Ø Leistung' : 'Avg Power', c: 'var(--color-ink)' },
                    { v: power.wkg != null ? power.wkg.toFixed(1) : '—', u: 'W/kg', l: de ? 'Ø W/kg' : 'Avg W/kg', c: 'var(--color-exercise)' },
                    { v: header.tss != null ? `${Math.round(header.tss)}` : '—', u: 'TSS', l: de ? 'Belastung' : 'Load', c: 'var(--color-move)' },
                  ]).map((x, i) => (
                    <div key={i} className="flex-1 flex flex-col gap-1 rounded-[16px]" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', padding: 14 }}>
                      <span className="flex items-baseline gap-0.5">
                        <span className="num-display" style={{ fontSize: 22, color: x.c, lineHeight: 1 }}>{x.v}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>{x.u}</span>
                      </span>
                      <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.04em', color: 'var(--color-muted)' }}>{x.l}</span>
                    </div>
                  ))}
                </div>

                {/* 7b · Mean-max power (pen E71iR) — ride power-duration curve as
                     zone-colored bars, with PR markers + a records callout. */}
                {mmp && (() => {
                  const maxW = Math.max(...mmp.map((r) => r.w)) || 1
                  const prRows = mmp.filter((r) => r.pr)
                  const prLabels = prRows.map((r) => r.label)
                  const joined = prLabels.length <= 1
                    ? (prLabels[0] ?? '')
                    : prLabels.slice(0, -1).join(', ') + (de ? ' und ' : ' and ') + prLabels[prLabels.length - 1]
                  const n = prRows.length
                  return (
                    <div className={cardCls} style={{ background: 'var(--color-paper-2)', border: '1.5px solid var(--color-accent)' }}>
                      <div className="flex items-center gap-[7px]">
                        <LineChart size={18} strokeWidth={2.2} style={{ color: 'var(--color-accent)' }} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Mean-Max-Leistung' : 'Mean-max power'}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)', lineHeight: 1.4 }}>
                        {de ? 'Deine beste Durchschnittsleistung je Dauer — vom Sprint bis zum langen Anstieg.' : 'Your best average power for each effort length — sprint to steady climb.'}
                      </span>
                      <div className="flex items-end gap-2" style={{ height: 214 }}>
                        {mmp.map((r) => (
                          <div key={r.s} className="flex-1 flex flex-col items-center gap-1.5 justify-end">
                            {r.pr && (
                              <span className="inline-flex items-center gap-0.5 rounded-full" style={{ padding: '2px 7px', background: 'var(--color-gold-soft)' }}>
                                <Star size={9} strokeWidth={2.4} style={{ color: 'var(--color-gold)' }} />
                                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-gold)' }}>PR</span>
                              </span>
                            )}
                            <span className="num-display" style={{ fontSize: 12, fontWeight: 700, color: r.pr ? 'var(--color-gold)' : 'var(--color-ink)', lineHeight: 1 }}>{nf(Math.round(r.w))}</span>
                            <div className="w-full" style={{ height: Math.max(6, Math.round((r.w / maxW) * 150)), borderRadius: '8px 8px 3px 3px', background: ZONE_VARS[r.zone] }} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{r.label}</span>
                          </div>
                        ))}
                      </div>
                      {n > 0 && (
                        <>
                          <div style={{ height: 1, background: 'var(--color-rule)' }} />
                          <div className="flex items-center gap-[11px] rounded-[14px]" style={{ background: 'var(--color-gold-soft)', border: '1px solid var(--color-gold)', padding: '12px 13px' }}>
                            <Trophy size={22} strokeWidth={2} style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-gold)' }}>
                                {de
                                  ? (n === 1 ? 'Neuer Rekord heute!' : `${n} neue Rekorde heute!`)
                                  : (n === 1 ? 'New record today!' : `${n} new records today!`)}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>
                                {de
                                  ? `Deine Bestleistung über ${joined} ${n === 1 ? 'war die beste' : 'waren die besten'}, die du je gefahren bist.`
                                  : `Your ${joined} power ${n === 1 ? 'is the best' : 'are the best'} you’ve ever ridden.`}
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* 8 · Achievements (PR badges) */}
            {prCount > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Erfolge freigeschaltet' : 'Achievements unlocked'}</span>
                  <span className="inline-flex items-center rounded-full" style={{ padding: '4px 10px', background: 'var(--color-accent)', fontSize: 12, fontWeight: 700, color: '#fff' }}>{prCount}</span>
                </div>
                <div className="flex gap-2.5 overflow-x-auto">
                  {efforts.filter((e) => e.is_pr).slice(0, 4).map((e, i) => (
                    <div key={i} className="flex flex-col gap-2 rounded-[18px] shrink-0" style={{ background: 'var(--color-gold-soft)', border: '1px solid #FFD1664D', padding: 14, minWidth: 130 }}>
                      <Award size={20} strokeWidth={2} style={{ color: 'var(--color-gold)' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Bestleistung' : 'Personal best'}</span>
                      <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{Math.round(e.ride_watts)} W</span>
                      <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{durLabel(e.duration_s)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 9 · Go deeper → Ride Analysis */}
            <Link
              to={`/activities/${activityId}/ride`}
              className="rounded-[24px] flex items-center gap-3"
              style={{ ...cardStyle, padding: '16px 18px' }}
            >
              <span className="grid place-items-center rounded-full shrink-0" style={{ width: 38, height: 38, background: 'var(--color-accent-soft)' }}>
                <Flag size={19} strokeWidth={2} style={{ color: 'var(--color-accent)' }} />
              </span>
              <div className="flex flex-col min-w-0 flex-1">
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Tiefer eintauchen' : 'Go deeper on this ride'}</span>
                <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Zonen, Spitzen & Entkopplung in der Fahrtanalyse' : 'Zones, peak efforts & decoupling in Ride Analysis'}</span>
              </div>
              <ChevronRight size={22} strokeWidth={2} style={{ color: 'var(--color-accent)' }} />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
