/**
 * HistoryTab — reconciled 1:1 to the canonical Pencil frame "V3 · History"
 * (node dd8j8). BIKE-ONLY: the app tracks cycling only, so the pen's
 * road/gravel/indoor sport-split is rendered as an honest cycling split
 * (all / outdoor / indoor, the only split we can derive) and never as
 * run/gym surfaces.
 *
 * Card order (top→bottom), matching the pen:
 *   1. Header            — title + subtitle + tune button + filter chips
 *   2. Heatmap Card      — "Dieses Jahr auf dem Rad": streak pill, 3 hero
 *                          stats, 26-week consistency heatmap, legend, caption
 *   3. Summary Card      — "Dieser Monat": distance-by-week big number + delta,
 *                          weekly distance bars, stat strip (incl. real month
 *                          elevation), momentum row
 *   4. Calendar Card     — month grid coloured by outdoor/indoor, legend, caption
 *   5. PR Card           — all-time bests (Top Speed · Longest Ride · Biggest Climb)
 *   6. Recent Activities — last rides, generative thumb, → ride recap
 *   7. Deep Dives Card   — Power Profile · Season Progress
 *
 * All values come from the existing activity + power-profile + streak hooks.
 * Elevation (Höhenmeter) is sourced from Activity.elevation_gain_m; rows that
 * genuinely lack it render a graceful "—" per the app's honest-dash rule.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  subDays, addDays, format, parseISO, startOfMonth, endOfMonth, startOfWeek,
  getDaysInMonth, getDay, differenceInCalendarDays,
} from 'date-fns'
import {
  Bike, SlidersHorizontal, ChevronRight, Flame, TrendingUp,
  Mountain, Clock, Gauge, Trophy, Zap, Repeat,
} from 'lucide-react'
import { useActivitiesRange } from '../../../hooks/useActivitiesRange'
import ExtraSessionsCard from '../ExtraSessionsCard'
import RouteSketch from '../../ui/RouteSketch'
import { useStreak } from '../../../hooks/useStreak'
import { useLocale } from '../../../contexts/LocaleContext'
import { useRehearseRoute } from '../../../hooks/useRehearseRoute'
import { formatDate, formatTime24 } from '../../../utils/format'
import type { ActivityRead } from '../../../api/dashboard'

// ── Bike-only sub-discipline split ──────────────────────────────────────────
// The only ride split we can HONESTLY derive: a trainer/indoor ride carries no
// GPS distance, an outdoor ride does. Road-vs-gravel is not in the payload, so
// we never fake it.
type Filter = 'all' | 'outdoor' | 'indoor'
const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const
const isIndoor = (a: ActivityRead) => (a.distance_meters ?? 0) <= 0 && (a.duration_seconds ?? 0) > 0
const rideColor = (a: ActivityRead) => (isIndoor(a) ? 'var(--color-amber)' : 'var(--color-strain)')

// ── Activity thumbnail ─────────────────────────────────────────────────────
// The ride's OWN GPS track, drawn by the shared RouteSketch. This used to be a
// procedurally generated "intensity terrain" ridge — fnv1a over the activity id
// seeding mulberry32 — which looked like data and encoded nothing about the
// ride, which is why its shape read as arbitrary. Rides with no GPS, or whose
// stream was never stored, get a neutral mark rather than a convincing fake.
function ActivityThumb({ activity, color }: { activity: ActivityRead; color: string }) {
  const polyline = activity.route_polyline ?? null
  const hasRoute = (polyline?.length ?? 0) >= 2

  return (
    <span
      className="relative shrink-0 grid place-items-center overflow-hidden"
      style={{
        width: 64,
        height: 64,
        borderRadius: 14,
        background: hasRoute
          ? `linear-gradient(135deg, color-mix(in srgb, ${color} 43%, transparent), color-mix(in srgb, ${color} 8%, transparent))`
          : 'var(--color-surface-2)',
        border: hasRoute ? undefined : '1px solid var(--color-rule)',
      }}
    >
      {hasRoute
        ? <RouteSketch polyline={polyline} width={64} height={64} color={color} strokeWidth={2.25} pad={8} />
        : <Bike size={20} style={{ color: 'var(--color-muted)' }} />}
    </span>
  )
}

const fmtHm = (sec: number) => {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}
const fmtDur = (sec: number) => (sec >= 3600 ? fmtHm(sec) : `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`)

function heatColor(tss: number): string {
  if (tss <= 0) return 'var(--color-surface-2)'
  if (tss < 30) return 'color-mix(in srgb, var(--color-recovery) 18%, transparent)'
  if (tss < 70) return 'color-mix(in srgb, var(--color-recovery) 40%, transparent)'
  if (tss < 130) return 'color-mix(in srgb, var(--color-recovery) 70%, transparent)'
  return 'var(--color-recovery)'
}

// ── Month-in-review verdict — pure, testable (audit P1-8) ───────────────────
// Drives the pen's MomentumRow. A lighter month is neutral information (muted
// slate), never an amber/red caution: quiet stretches are part of training.
export interface MonthVerdict { word: string; color: string; sentence: string }
export function monthVerdict(
  curTss: number,
  sessions: number,
  tssPct: number | null,
  hasPrev: boolean,
  de: boolean,
): MonthVerdict {
  const tss = Math.round(curTss).toLocaleString(de ? 'de' : 'en')
  const sess = `${sessions} ${sessions === 1 ? (de ? 'Einheit' : 'session') : de ? 'Einheiten' : 'sessions'}`
  if (!hasPrev || tssPct === null) {
    return {
      word: de ? 'Baseline im Aufbau' : 'Building baseline',
      color: 'var(--color-strain)',
      sentence: de ? `${tss} TSS · ${sess} — noch kein Vormonat zum Vergleich` : `${tss} TSS · ${sess} — no prior month to compare yet`,
    }
  }
  const up = tssPct >= 0
  const word = tssPct >= 10 ? (de ? 'Starker Monat' : 'Strong month')
    : tssPct <= -10 ? (de ? 'Ruhigerer Monat' : 'Lighter month')
    : (de ? 'Solider Monat' : 'Steady month')
  const color = tssPct >= 10 ? 'var(--color-recovery)' : tssPct <= -10 ? 'var(--color-muted)' : 'var(--color-strain)'
  const trend = de
    ? `${up ? 'plus' : 'minus'} ${Math.abs(tssPct)}% ggü. Vormonat`
    : `${up ? 'up' : 'down'} ${Math.abs(tssPct)}% on last month`
  return { word, color, sentence: `${tss} TSS, ${trend} · ${sess}` }
}

/** Scale for weekly bars comes from COMPLETED weeks only — the in-progress
 *  week neither sets nor is judged by the finished scale. */
export function completedWeekMax(bars: { value: number; inProgress?: boolean }[]): number {
  return Math.max(...bars.filter((b) => !b.inProgress).map((b) => b.value), 1)
}

export default function HistoryTab() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const loc = de ? 'de' : 'en'
  const today = useMemo(() => new Date(), [])
  // A full year of history (API caps a single range at 366 days).
  const { data: acts } = useActivitiesRange(useMemo(() => subDays(today, 365), [today]), today)
  const { data: streakData } = useStreak()
  const { rehearse, pendingRef, failed: rehearseFailed, error: rehearseError } = useRehearseRoute()

  // Sub-discipline filter (bike-only): all / outdoor / indoor.
  const [filter, setFilter] = useState<Filter>('all')
  const [showAll, setShowAll] = useState(false)
  const [heatCell, setHeatCell] = useState<{ ci: number; key: string; t: number } | null>(null)

  // Cycling-only universe (defensive — the app is bike-only already).
  const all = useMemo(() => (acts?.activities ?? []).filter((a) => a.sport === 'cycling'), [acts])
  const activities = useMemo(() => {
    if (filter === 'all') return all
    return all.filter((a) => (filter === 'indoor' ? isIndoor(a) : !isIndoor(a)))
  }, [all, filter])

  const dateOf = (a: ActivityRead) => parseISO(a.started_at ?? a.date ?? '')

  // TSS per calendar day (filtered) + dominant ride kind (outdoor/indoor).
  const dayTss = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of activities) {
      const k = (a.started_at ?? a.date ?? '').slice(0, 10)
      if (k) m.set(k, (m.get(k) ?? 0) + (a.tss ?? 0))
    }
    return m
  }, [activities])

  const dayKind = useMemo(() => {
    const m = new Map<string, { indoor: boolean; tss: number }>()
    for (const a of activities) {
      const k = (a.started_at ?? a.date ?? '').slice(0, 10)
      if (!k) continue
      const cur = m.get(k)
      const t = a.tss ?? 0
      if (!cur || t >= cur.tss) m.set(k, { indoor: isIndoor(a), tss: t })
    }
    return m
  }, [activities])

  // ── All-time hero stats (heatmap card) ────────────────────────────────────
  const heroStats = useMemo(() => {
    const rides = activities.length
    const km = activities.reduce((s, a) => s + (a.distance_meters ?? 0) / 1000, 0)
    // Longest run of consecutive calendar days with a logged ride — honest,
    // derived from the activity dates themselves.
    const days = [...new Set(activities.map((a) => (a.started_at ?? a.date ?? '').slice(0, 10)).filter(Boolean))].sort()
    let best = 0, run = 0
    let prev: Date | null = null
    for (const key of days) {
      const d = parseISO(key)
      if (prev && differenceInCalendarDays(d, prev) === 1) run += 1
      else run = 1
      if (run > best) best = run
      prev = d
    }
    return { rides, km, bestStreak: best }
  }, [activities])

  // ── This-month vs last-month summary ──────────────────────────────────────
  const summary = useMemo(() => {
    const agg = (year: number, month: number) => {
      const win = activities.filter((a) => {
        const d = dateOf(a)
        return d.getFullYear() === year && d.getMonth() === month
      })
      return {
        km: win.reduce((s, a) => s + (a.distance_meters ?? 0) / 1000, 0),
        sec: win.reduce((s, a) => s + (a.duration_seconds ?? 0), 0),
        tss: win.reduce((s, a) => s + (a.tss ?? 0), 0),
        // Sum ONLY rides that actually carry an ascent figure — honest "—" when
        // none do (indoor month / elevation never synced), never a fake 0.
        elev: win.reduce((s, a) => s + (a.elevation_gain_m ?? 0), 0),
        elevN: win.filter((a) => a.elevation_gain_m != null).length,
        n: win.length,
      }
    }
    const cur = agg(today.getFullYear(), today.getMonth())
    const prevRef = subDays(startOfMonth(today), 1)
    const prev = agg(prevRef.getFullYear(), prevRef.getMonth())
    return { cur, prev }
  }, [activities, today])

  const pctDelta = (cur: number, prev: number) => {
    if (!prev) return null
    const p = Math.round(((cur - prev) / prev) * 100)
    return { up: p >= 0, text: `${p >= 0 ? '+' : ''}${p}%` }
  }

  const tssPct = summary.prev.tss ? Math.round(((summary.cur.tss - summary.prev.tss) / summary.prev.tss) * 100) : null
  const hasPrev = summary.prev.tss > 0 || summary.prev.n > 0
  const verdict = useMemo(
    () => monthVerdict(summary.cur.tss, summary.cur.n, tssPct, hasPrev, de),
    [summary, tssPct, hasPrev, de],
  )
  const kmDelta = summary.cur.n === 0 ? null : pctDelta(summary.cur.km, summary.prev.km)

  // ── Weekly distance bars across the current month ─────────────────────────
  const monthWeeks = useMemo(() => {
    const mStart = startOfMonth(today)
    const mEnd = endOfMonth(today)
    const first = startOfWeek(mStart, { weekStartsOn: 1 })
    const weeks: { start: Date; km: number }[] = []
    for (let c = first; c <= mEnd; c = addDays(c, 7)) weeks.push({ start: new Date(c), km: 0 })
    const idx = new Map(weeks.map((w, i) => [format(w.start, 'yyyy-MM-dd'), i]))
    for (const a of activities) {
      const d = dateOf(a)
      if (isNaN(d.getTime())) continue
      const wk = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const i = idx.get(wk)
      if (i != null && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()) {
        weeks[i].km += (a.distance_meters ?? 0) / 1000
      }
    }
    const curWk = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    return weeks.map((w, i) => ({
      km: Math.round(w.km),
      label: format(w.start, 'yyyy-MM-dd') === curWk ? (de ? 'Diese Wo.' : 'This wk') : `W${i + 1}`,
      current: format(w.start, 'yyyy-MM-dd') === curWk,
      future: w.start > today,
    }))
  }, [activities, today, de])
  const monthWeekMax = Math.max(...monthWeeks.map((w) => w.km), 1)

  // ── Consistency heatmap — 26 weeks × 7 days ───────────────────────────────
  const heat = useMemo(() => {
    const startMon = startOfWeek(subDays(today, 25 * 7), { weekStartsOn: 1 })
    return Array.from({ length: 26 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const date = addDays(startMon, w * 7 + d)
        const key = format(date, 'yyyy-MM-dd')
        return { key, t: dayTss.get(key) ?? 0, future: date > today }
      }),
    )
  }, [dayTss, today])

  // ── Personal records (cycling, all-time) ──────────────────────────────────
  const prs = useMemo(() => {
    const withDist = all.filter((a) => a.distance_meters != null)
    const longestRide = withDist.reduce<ActivityRead | null>((b, a) => ((a.distance_meters ?? 0) > (b?.distance_meters ?? -1) ? a : b), null)
    const fastest = all
      .filter((a) => (a.distance_meters ?? 0) > 3000 && (a.duration_seconds ?? 0) > 0)
      .map((a) => ({ a, kmh: (a.distance_meters! / 1000) / (a.duration_seconds! / 3600) }))
      .sort((x, y) => y.kmh - x.kmh)[0]
    // Biggest single-ride climb — honest, only across rides that carry ascent.
    const biggestClimb = all
      .filter((a) => (a.elevation_gain_m ?? 0) > 0)
      .reduce<ActivityRead | null>((b, a) => ((a.elevation_gain_m ?? 0) > (b?.elevation_gain_m ?? -1) ? a : b), null)
    return { longestRide, fastest, biggestClimb }
  }, [all])

  const prRows = useMemo(() => {
    const dfmt = (a?: ActivityRead | null) => (a?.started_at ? formatDate(parseISO(a.started_at), de ? 'd. MMM' : 'MMM d', locale) : '—')
    return [
      {
        icon: Gauge, color: 'var(--color-recovery)',
        title: de ? 'Höchste Geschwindigkeit' : 'Top Speed',
        sub: prs.fastest ? dfmt(prs.fastest.a) : (de ? 'Noch kein Wert' : 'No record yet'),
        value: prs.fastest ? `${prs.fastest.kmh.toFixed(1)} km/h` : '—',
        to: prs.fastest?.a ? `/activities/${prs.fastest.a.id}/recap` : null,
      },
      {
        icon: Bike, color: 'var(--color-strain)',
        title: de ? 'Längste Fahrt' : 'Longest Ride',
        sub: prs.longestRide ? dfmt(prs.longestRide) : (de ? 'Noch kein Wert' : 'No record yet'),
        value: prs.longestRide ? `${((prs.longestRide.distance_meters ?? 0) / 1000).toFixed(0)} km` : '—',
        to: prs.longestRide ? `/activities/${prs.longestRide.id}/recap` : null,
      },
      {
        // Real ascent when a ride carries elevation; honest dash otherwise.
        icon: Mountain, color: 'var(--color-amber)',
        title: de ? 'Größter Anstieg' : 'Biggest Climb',
        sub: prs.biggestClimb ? dfmt(prs.biggestClimb) : (de ? 'Höhendaten fehlen' : 'No elevation data'),
        value: prs.biggestClimb ? `${Math.round(prs.biggestClimb.elevation_gain_m ?? 0).toLocaleString(loc)} hm` : '—',
        to: prs.biggestClimb ? `/activities/${prs.biggestClimb.id}/recap` : null,
      },
    ]
  }, [prs, de, locale])

  // ── Recent activities ─────────────────────────────────────────────────────
  const sortedActivities = useMemo(
    () => [...activities].sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? '')),
    [activities],
  )
  const recent = showAll ? sortedActivities : sortedActivities.slice(0, 5)

  const relDate = (a: ActivityRead) => {
    const d = dateOf(a)
    if (isNaN(d.getTime())) return '—'
    const diff = differenceInCalendarDays(today, d)
    const day = diff === 0 ? (de ? 'Heute' : 'Today') : diff === 1 ? (de ? 'Gestern' : 'Yesterday') : formatDate(d, de ? 'd. MMM' : 'MMM d', locale)
    return `${day} · ${formatTime24(d, locale)}`
  }

  const recentStats = (a: ActivityRead): { v: string; l: string }[] => {
    const km = a.distance_meters != null && a.distance_meters > 0 ? (a.distance_meters / 1000).toFixed(1) : '—'
    const dur = a.duration_seconds ?? 0
    return [
      { v: km, l: 'km' },
      { v: a.duration_seconds != null ? fmtDur(dur) : '—', l: dur >= 3600 ? 'h:m' : (de ? 'Zeit' : 'time') },
      { v: a.normalized_power != null ? `${Math.round(a.normalized_power)}` : '—', l: 'watts' },
    ]
  }

  // ── Month calendar ────────────────────────────────────────────────────────
  const monthStart = startOfMonth(today)
  const daysInMonth = getDaysInMonth(today)
  const leadBlanks = (getDay(monthStart) + 6) % 7
  const trailBlanks = (7 - ((leadBlanks + daysInMonth) % 7)) % 7
  const calStats = useMemo(() => {
    const y = today.getFullYear(), mo = today.getMonth()
    let rides = 0
    const rideDays = new Set<string>()
    for (const a of activities) {
      const d = dateOf(a)
      if (d.getFullYear() === y && d.getMonth() === mo) {
        rides += 1
        rideDays.add(format(d, 'yyyy-MM-dd'))
      }
    }
    // Rest days = elapsed days of the month with no ride.
    const elapsed = today.getDate()
    let rest = 0
    for (let i = 1; i <= elapsed; i++) {
      if (!rideDays.has(format(new Date(y, mo, i), 'yyyy-MM-dd'))) rest += 1
    }
    return { rides, rest }
  }, [activities, today])

  // ── Deep dives ────────────────────────────────────────────────────────────
  const deepDives = [
    { icon: Gauge, color: 'var(--color-accent)', to: '/power-profile', title: de ? 'Leistungsprofil' : 'Power Profile', sub: de ? 'FTP, Leistungskurve & Benchmarks' : 'FTP, power curve & benchmarks' },
    { icon: TrendingUp, color: 'var(--color-gold)', to: '/season', title: de ? 'Saisonfortschritt' : 'Season Progress', sub: de ? 'FTP-Verlauf, Prognose & Rennziel' : 'FTP arc, forecast & race projection' },
  ]

  const filterChips: { key: Filter; label: string }[] = [
    { key: 'all', label: de ? 'Alle' : 'All' },
    { key: 'outdoor', label: de ? 'Draußen' : 'Outdoor' },
    { key: 'indoor', label: 'Indoor' },
  ]

  const streak = streakData?.streak ?? 0

  return (
    <div className="flex flex-col gap-6 pb-5">
      {/* ── 1. Header ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-[3px]">
            <h1 className="num-display" style={{ fontSize: 24, color: 'var(--color-ink)' }}>{de ? 'Verlauf' : 'History'}</h1>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Jede Fahrt, die du je aufgezeichnet hast' : 'Every ride you’ve ever logged'}</span>
          </div>
          <button type="button" className="grid place-items-center rounded-full shrink-0" style={{ width: 40, height: 40, ...cardStyle }}>
            <SlidersHorizontal size={20} style={{ color: 'var(--color-ink-2)' }} />
          </button>
        </div>
        <div className="flex gap-2">
          {filterChips.map((c) => {
            const on = filter === c.key
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilter(c.key)}
                className="rounded-full"
                style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 600,
                  background: on ? 'var(--color-accent)' : 'var(--color-paper-2)',
                  color: on ? 'var(--color-paper)' : 'var(--color-ink-2)',
                  border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-rule)'}`,
                }}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 2. Heatmap Card ── */}
      <div className="rounded-[24px] p-5 flex flex-col gap-4" style={cardStyle}>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Dieses Jahr auf dem Rad' : 'This year on the bike'}</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Jedes Feld ein Tag, an dem du gefahren bist' : 'Every square is a day you showed up'}</span>
          </div>
          {streak > 0 && (
            <span className="flex items-center gap-[5px] rounded-full shrink-0" style={{ padding: '6px 12px', background: 'color-mix(in srgb, var(--color-recovery) 15%, transparent)' }}>
              <Flame size={15} style={{ color: 'var(--color-recovery)' }} />
              {/* Singular/plural: "1-Tage-Serie" was wrong in German. */}
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-recovery)' }}>
                {de ? (streak === 1 ? '1 Tag in Folge' : `${streak} Tage in Folge`) : (streak === 1 ? '1-day streak' : `${streak}-day streak`)}
              </span>
            </span>
          )}
        </div>

        {/* Hero stats */}
        <div className="flex gap-2.5">
          {[
            { v: heroStats.rides.toLocaleString(loc), l: de ? 'Fahrten' : 'Rides', color: 'var(--color-ink)' },
            { v: heroStats.km > 0 ? Math.round(heroStats.km).toLocaleString(loc) : '—', l: de ? 'km gefahren' : 'km ridden', color: 'var(--color-ink)' },
            { v: heroStats.bestStreak > 0 ? `${heroStats.bestStreak}` : '—', l: de ? 'Längste Serie' : 'Best streak', color: heroStats.bestStreak > 0 ? 'var(--color-recovery)' : 'var(--color-muted)' },
          ].map((s) => (
            <div key={s.l} className="flex-1 flex flex-col items-center gap-0.5 rounded-[14px]" style={{ background: 'var(--color-surface-2)', padding: '12px 10px' }}>
              <span className="num-display" style={{ fontSize: 22, color: s.color }}>{s.v}</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{s.l}</span>
            </div>
          ))}
        </div>

        {/* Heat grid */}
        <div className="relative select-none">
          {heatCell && (
            <div className="absolute z-20 pointer-events-none flex flex-col items-center" style={{ left: `${((heatCell.ci + 0.5) / heat.length) * 100}%`, bottom: '100%', marginBottom: 8, transform: 'translateX(-50%)' }}>
              <div className="rounded-[10px] px-2.5 py-1.5 flex flex-col items-center gap-0.5 whitespace-nowrap" style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-rule)', boxShadow: '0 6px 18px rgba(0,0,0,0.45)' }}>
                <span className="num-display" style={{ fontSize: 14, lineHeight: 1, color: heatCell.t > 0 ? 'var(--color-recovery)' : 'var(--color-muted)' }}>{heatCell.t > 0 ? `${heatCell.t} TSS` : (de ? 'Ruhetag' : 'Rest day')}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-muted)' }}>{formatDate(parseISO(heatCell.key), de ? 'EEE, d. MMM' : 'EEE, MMM d', locale)}</span>
              </div>
              <span style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid var(--color-surface-3)' }} />
            </div>
          )}
          <div className="flex gap-[3px]">
            {heat.map((col, ci) => (
              <div key={ci} className="flex-1 flex flex-col gap-[3px]">
                {col.map((cell) => (
                  <div
                    key={cell.key}
                    style={{ height: 9, borderRadius: 2, background: cell.future ? 'transparent' : heatColor(cell.t), cursor: cell.future ? 'default' : 'pointer' }}
                    onPointerEnter={() => !cell.future && setHeatCell({ ci, key: cell.key, t: Math.round(cell.t) })}
                    onPointerDown={() => !cell.future && setHeatCell({ ci, key: cell.key, t: Math.round(cell.t) })}
                    onPointerLeave={() => setHeatCell((cur) => (cur?.key === cell.key ? null : cur))}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-[5px]">
          <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Weniger' : 'Less'}</span>
          {['var(--color-surface-2)', 'color-mix(in srgb, var(--color-recovery) 18%, transparent)', 'color-mix(in srgb, var(--color-recovery) 40%, transparent)', 'color-mix(in srgb, var(--color-recovery) 70%, transparent)', 'var(--color-recovery)'].map((c, i) => (
            <span key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
          ))}
          <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Mehr' : 'More'}</span>
        </div>
        {streak > 0 && (
          <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: 'var(--color-ink-2)' }}>
            {/* Was: "fahr morgen weiter, um die Serie am Leben zu halten." /
                "ride tomorrow to keep the fire alive." That is loss aversion —
                the thing the athlete stands to LOSE by resting — on a product
                that promises no streak mechanics, and it contradicts the Today
                tab, which already replaced the daily streak with a
                non-punitive weekly-rhythm stat (P1-11). The count stays,
                because consistency is genuinely worth seeing; the threat does
                not. Also fixes "1 Tage in Folge", which was ungrammatical in
                the app's first language on a headline stat. */}
            {de
              ? (streak === 1 ? 'Ein Tag in Folge — der Anfang zählt schon.' : `${streak} Tage in Folge — schöner Rhythmus.`)
              : (streak === 1 ? 'One day in a row — that already counts.' : `${streak} days in a row — nice rhythm.`)}
          </span>
        )}
      </div>

      {/* ── 3. Summary Card ── */}
      <div className="rounded-[24px] p-5 flex flex-col gap-[18px]" style={cardStyle}>
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Dieser Monat' : 'This Month'}</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Dein Volumen, Woche für Woche' : 'Your volume, week by week'}</span>
          </div>
          <span className="num-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{formatDate(today, 'MMMM yyyy', locale)}</span>
        </div>

        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'var(--color-muted)' }}>{de ? 'DISTANZ DIESEN MONAT' : 'DISTANCE THIS MONTH'}</span>
            <span className="flex items-end gap-1">
              <span className="num-display" style={{ fontSize: 28, color: 'var(--color-ink)' }}>{summary.cur.n > 0 ? Math.round(summary.cur.km).toLocaleString(loc) : '—'}</span>
              {summary.cur.n > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)', paddingBottom: 4 }}>km</span>}
            </span>
          </div>
          {kmDelta && (
            <span className="flex items-center gap-1 rounded-full" style={{ padding: '5px 10px', background: kmDelta.up ? 'color-mix(in srgb, var(--color-recovery) 15%, transparent)' : 'var(--color-surface-2)' }}>
              {kmDelta.up && <TrendingUp size={13} style={{ color: 'var(--color-recovery)' }} />}
              <span style={{ fontSize: 12, fontWeight: 700, color: kmDelta.up ? 'var(--color-recovery)' : 'var(--color-muted)' }}>{kmDelta.text}</span>
            </span>
          )}
        </div>

        {/* Weekly distance bars */}
        {monthWeeks.some((w) => w.km > 0) ? (
          <div className="flex items-end gap-2" style={{ height: 132 }}>
            {monthWeeks.map((w, i) => {
              const h = Math.max(6, (w.km / monthWeekMax) * 100)
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5 justify-end" style={{ height: '100%' }}>
                  <span className="num-display" style={{ fontSize: w.current ? 13 : 12, fontWeight: 700, color: w.current ? 'var(--color-accent)' : 'var(--color-ink-2)' }}>{w.km}</span>
                  <span
                    className="block w-full"
                    style={{
                      height: `${h}%`,
                      borderRadius: '5px 5px 0 0',
                      background: w.future
                        ? 'color-mix(in srgb, var(--color-accent) 24%, transparent)'
                        : 'linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 78%, white), var(--color-accent))',
                      boxShadow: w.current ? '0 4px 16px color-mix(in srgb, var(--color-accent) 55%, transparent)' : 'none',
                    }}
                  />
                  <span style={{ fontSize: 10, fontWeight: 600, color: w.current ? 'var(--color-ink-2)' : 'var(--color-muted)' }}>{w.label}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="grid place-items-center rounded-[14px]" style={{ height: 132, background: 'var(--color-surface-2)', fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>
            {de ? 'Noch keine Fahrten diesen Monat' : 'No rides logged this month yet'}
          </div>
        )}

        {/* Stat strip */}
        <div className="flex gap-2">
          {[
            { icon: Mountain, color: 'var(--color-strain)', v: summary.cur.elevN > 0 ? Math.round(summary.cur.elev).toLocaleString(loc) : '—', l: de ? 'Hm gesamt' : 'm climbed' },
            { icon: Clock, color: 'var(--color-ink-2)', v: summary.cur.n > 0 ? fmtHm(summary.cur.sec) : '—', l: de ? 'Stunden' : 'hours' },
            { icon: Bike, color: 'var(--color-accent)', v: `${summary.cur.n}`, l: de ? 'Fahrten' : 'rides' },
            { icon: Zap, color: 'var(--color-move)', v: summary.cur.n > 0 ? Math.round(summary.cur.tss).toLocaleString(loc) : '—', l: 'TSS' },
          ].map((s) => (
            <div key={s.l} className="flex-1 flex flex-col items-center gap-[3px] rounded-[12px]" style={{ background: 'var(--color-surface-2)', padding: '11px 6px' }}>
              <s.icon size={16} style={{ color: s.color }} />
              <span className="num-display" style={{ fontSize: 17, color: 'var(--color-ink)' }}>{s.v}</span>
              <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--color-muted)' }}>{s.l}</span>
            </div>
          ))}
        </div>

        {/* Momentum row — verdict-tinted */}
        <div className="flex items-center gap-2 rounded-[12px]" style={{ padding: '10px 12px', background: `color-mix(in srgb, ${verdict.color} 15%, transparent)` }}>
          <TrendingUp size={15} className="shrink-0" style={{ color: verdict.color }} />
          <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.35, color: 'var(--color-ink)' }}>{verdict.sentence}</span>
        </div>
      </div>

      {/* ── 4. Calendar Card ── */}
      {/* De-linked: was a <Link to="/load-form">; Load & Form is archived, so this
          is now a plain, non-navigating calendar card (no hover-card, no CTA). */}
      <div className="rounded-[24px] p-5 flex flex-col gap-3.5" style={cardStyle}>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{formatDate(today, 'MMMM', locale)}</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>
              {de ? `${calStats.rides} Fahrten · ${calStats.rest} Ruhetage` : `${calStats.rides} rides · ${calStats.rest} rest days`}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {(de ? ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']).map((d, i) => (
            <span key={i} className="text-center" style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>{d}</span>
          ))}
          {Array.from({ length: leadBlanks }).map((_, i) => <div key={`b${i}`} style={{ height: 42 }} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dnum = i + 1
            const key = format(new Date(today.getFullYear(), today.getMonth(), dnum), 'yyyy-MM-dd')
            const info = dayKind.get(key)
            const isToday = dnum === today.getDate()
            const col = info ? (info.indoor ? 'var(--color-amber)' : 'var(--color-strain)') : undefined
            return (
              <div key={dnum} className="flex flex-col items-center justify-center gap-[3px] rounded-[10px]"
                style={{
                  height: 42,
                  background: col ? `color-mix(in srgb, ${col} 50%, transparent)` : 'var(--color-surface-2)',
                  border: isToday ? '1.5px solid var(--color-accent)' : 'none',
                }}>
                <span className="num-mono" style={{ fontSize: 12, fontWeight: info ? 700 : 500, color: info ? 'var(--color-ink)' : 'var(--color-muted)' }}>{dnum}</span>
                {col && <span style={{ width: 5, height: 5, borderRadius: 999, background: col }} />}
              </div>
            )
          })}
          {Array.from({ length: trailBlanks }).map((_, i) => <div key={`t${i}`} style={{ height: 42 }} />)}
        </div>
        <div className="flex items-center gap-3.5">
          {[
            { c: 'var(--color-strain)', l: de ? 'Draußen' : 'Outdoor' },
            { c: 'var(--color-amber)', l: 'Indoor' },
          ].map((x) => (
            <span key={x.l} className="flex items-center gap-1.5">
              <span style={{ width: 6, height: 6, borderRadius: 999, background: x.c }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{x.l}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── 5. Personal Records ── */}
      <div className="rounded-[24px] flex flex-col" style={{ ...cardStyle, padding: '6px 20px' }}>
        <div className="flex items-center justify-between" style={{ padding: '14px 0' }}>
          <div className="flex flex-col gap-0.5">
            <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Rekorde' : 'Personal Records'}</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Tage, an denen du schneller warst als je zuvor' : 'The days you went faster than ever'}</span>
          </div>
          <span className="flex items-center gap-[5px] rounded-full shrink-0" style={{ padding: '5px 11px', background: 'var(--color-gold-soft)' }}>
            <Trophy size={14} style={{ color: 'var(--color-gold)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-gold)' }}>{de ? 'Bestwerte' : 'All-time bests'}</span>
          </span>
        </div>
        {prRows.map((p, i) => {
          const hasPr = p.value !== '—'
          const inner = (
            <>
              <span className="grid place-items-center rounded-full shrink-0" style={{ width: 42, height: 42, background: `color-mix(in srgb, ${p.color} 35%, transparent)` }}>
                <p.icon size={21} style={{ color: p.color }} />
              </span>
              <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{p.title}</span>
                <span className="truncate" style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{p.sub}</span>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="num-display" style={{ fontSize: 18, color: hasPr ? p.color : 'var(--color-muted)' }}>{p.value}</span>
                {hasPr && (
                  <span className="rounded-full" style={{ padding: '3px 8px', background: 'var(--color-gold-soft)', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: 'var(--color-gold)' }}>PR</span>
                )}
              </div>
            </>
          )
          const style = { padding: '14px 0', borderTop: i > 0 ? '1px solid var(--color-rule)' : 'none' } as const
          return p.to
            ? <Link key={p.title} to={p.to} className="hover-card flex items-center gap-3" style={style}>{inner}</Link>
            : <div key={p.title} className="flex items-center gap-3" style={style}>{inner}</div>
        })}
        <div style={{ padding: '6px 0 14px' }}>
          <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: 'var(--color-ink-2)' }}>
            {de ? 'Drei Rekorde, die noch stehen. Jag sie.' : 'Records that still stand. Go chase them down.'}
          </span>
        </div>
      </div>

      {/* ── 6. Recent Activities ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{de ? 'Letzte Aktivitäten' : 'Recent Activities'}</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>
              {de ? `${sortedActivities.length} ${sortedActivities.length === 1 ? 'Fahrt' : 'Fahrten'}` : `${sortedActivities.length} ${sortedActivities.length === 1 ? 'ride' : 'rides'}`}
            </span>
          </div>
          {sortedActivities.length > 5 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="inline-flex items-center gap-0.5" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent)' }}>
              {showAll ? (de ? 'Weniger' : 'Show less') : (de ? 'Alle' : 'See all')}
              <ChevronRight size={15} style={{ color: 'var(--color-accent)', transform: showAll ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform 0.18s ease' }} />
            </button>
          )}
        </div>
        {recent.map((a) => {
          const col = rideColor(a)
          const route = `/activities/${a.id}/recap`
          // Only a ride with a stored track can be rehearsed. An indoor ride
          // has no route to ride again, so the offer is simply absent rather
          // than present-and-refusing.
          const canRehearse = (a.route_polyline?.length ?? 0) >= 2
          const busy = pendingRef === a.id
          return (
            // The card is a plain container with a stretched link inside it,
            // so the whole row still navigates while the rehearse control gets
            // its own hit area — a <button> nested inside an <a> would not be
            // valid HTML.
            <div key={a.id} className="hover-card relative flex items-center gap-3 rounded-[24px] p-3" style={cardStyle}>
              <Link to={route} className="absolute inset-0 rounded-[24px]" aria-label={a.title ?? (de ? 'Fahrt' : 'Ride')} />
              <ActivityThumb activity={a} color={col} />
              <div className="flex-1 min-w-0 flex flex-col gap-[7px]">
                <div className="flex items-center gap-1.5">
                  <Bike size={15} style={{ color: col }} />
                  <span className="truncate" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{a.title ?? (de ? 'Fahrt' : 'Ride')}</span>
                </div>
                {/* position: relative + the pill absolutely placed on it keeps
                    this line's own box height fixed at the bare date text's
                    line-height -- the pill's padding/border never enter the
                    flex-col's flow, so a row with the pill and a row without
                    it are the same height, and a mixed indoor/outdoor list
                    stays uniform rather than going ragged. */}
                <div className="flex items-center" style={{ position: 'relative' }}>
                  <span
                    className="truncate"
                    style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)', paddingRight: canRehearse ? 112 : 0 }}
                  >
                    {relDate(a)}
                  </span>
                  {canRehearse && (
                    <button
                      type="button"
                      disabled={pendingRef !== null}
                      onClick={() => { void rehearse('activity', a.id, a.title ?? undefined) }}
                      className="absolute right-0 top-1/2 z-10 inline-flex items-center gap-1 rounded-full shrink-0"
                      style={{
                        transform: 'translateY(-50%)',
                        padding: '4px 9px', background: 'var(--color-surface-2)',
                        border: '1px solid var(--color-rule)',
                        opacity: pendingRef !== null && !busy ? 0.5 : 1,
                      }}
                    >
                      <Repeat size={11} strokeWidth={2.4} style={{ color: 'var(--color-accent)' }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)' }}>
                        {busy
                          ? (de ? 'Läuft …' : 'Working…')
                          : (de ? 'Nochmal fahren' : 'Ride it again')}
                      </span>
                    </button>
                  )}
                </div>
                <div className="flex gap-4">
                  {recentStats(a).map((s, si) => (
                    <div key={si} className="flex flex-col gap-px">
                      <span className="num-display" style={{ fontSize: 14, color: 'var(--color-ink)' }}>{s.v}</span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{s.l}</span>
                    </div>
                  ))}
                </div>
              </div>
              <ChevronRight size={18} className="hover-arrow shrink-0" style={{ color: 'var(--color-muted)' }} />
            </div>
          )
        })}
        {rehearseFailed && (
          <span role="alert" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-amber)', lineHeight: 1.4 }}>
            {rehearseError
              ?? (de ? 'Diese Fahrt konnte gerade nicht geprobt werden.' : "Couldn't rehearse that ride just now.")}
          </span>
        )}
        {recent.length === 0 && (
          <div className="grid place-items-center rounded-[24px]" style={{ ...cardStyle, height: 96, fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>
            {de ? 'Noch keine Fahrten' : 'No rides logged yet'}
          </div>
        )}
      </div>

      {/* ── 6b. Extra sessions (rolling 7 days) ──
          The non-bike contribution to the week's load. It lives here rather
          than on Today, whose copy asks the same question about today alone:
          a 7-day breakdown is a history question. Self-hides when the week
          held no extra sessions. */}
      <ExtraSessionsCard window="week" />

      {/* ── 7. Deep Dives Card ── */}
      <div className="rounded-[24px] flex flex-col" style={{ ...cardStyle, padding: '6px 20px' }}>
        <div className="flex flex-col gap-0.5" style={{ padding: '14px 0' }}>
          <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Tiefer eintauchen' : 'Go deeper'}</span>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Belastung, Leistung & Saisontrends' : 'Load, power & season trends'}</span>
        </div>
        {deepDives.map((d, i) => (
          <Link key={d.to} to={d.to} className="hover-card flex items-center gap-3" style={{ padding: '14px 0', borderTop: i > 0 ? '1px solid var(--color-rule)' : 'none' }}>
            <span className="grid place-items-center rounded-full shrink-0" style={{ width: 40, height: 40, background: `color-mix(in srgb, ${d.color} 18%, transparent)` }}>
              <d.icon size={20} style={{ color: d.color }} />
            </span>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{d.title}</span>
              <span className="truncate" style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>{d.sub}</span>
            </div>
            <ChevronRight size={20} className="hover-arrow shrink-0" style={{ color: 'var(--color-muted)' }} />
          </Link>
        ))}
      </div>
    </div>
  )
}
