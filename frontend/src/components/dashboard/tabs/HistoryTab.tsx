/**
 * HistoryTab — rebuilt from the Pencil "Screen · History" content frame.
 * Card order (top→bottom): Header (title + filter chips) · Monat im Überblick
 * (ONE merged month card, P2-13: verdict + tiles + daily load + sport split) ·
 * month Calendar · Consistency heatmap · Weekly-Load trend · Personal Records ·
 * Recent Activities. All values come from real activity + power-profile data;
 * fields the backend lacks (elevation / GPS route / strength sets·kcal) render
 * the pen structure with a graceful "—".
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  subDays, addDays, format, parseISO, startOfMonth, startOfWeek,
  getDaysInMonth, getDay, differenceInCalendarDays,
} from 'date-fns'
import {
  Bike, Footprints, Dumbbell, SlidersHorizontal, ChevronLeft, ChevronRight,
  Trophy, Mountain, Zap, ArrowUp, CalendarCheck, Gauge,
  type LucideIcon,
} from 'lucide-react'
import { useActivitiesRange } from '../../../hooks/useActivitiesRange'
import { usePowerProfile } from '../../../hooks/usePowerProfile'
import { useStreak } from '../../../hooks/useStreak'
import { useLocale } from '../../../contexts/LocaleContext'
import { formatDate, formatTime24 } from '../../../utils/format'
import HoverBars from '../../ui/HoverBars'
import InsightsSection from '../InsightsSection'
import type { ActivityRead } from '../../../api/dashboard'

type Filter = 'all' | 'cycling' | 'running' | 'gym'
const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

const sportColor = (s: string) =>
  s === 'running' ? 'var(--color-recovery)' : s === 'cycling' ? 'var(--color-strain)' : 'var(--color-amber)'
const sportIcon = (s: string) => (s === 'running' ? Footprints : s === 'cycling' ? Bike : Dumbbell)

// ── Generative activity thumbnail ──────────────────────────────────────────
// Deterministic (SSR-stable, offline, CSP-safe) SVG rendered from the activity's
// own numbers — no external image service. FNV-1a hash → mulberry32 PRNG seeds a
// motif that is unique but stable per activity: an "intensity terrain" ridge for
// outdoor endurance, a rep/bar motif for gym.
function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function ActivityThumb({ activity, color, Icon }: { activity: ActivityRead; color: string; Icon: LucideIcon }) {
  const W = 64
  const H = 64
  // Seed from real fields only → stable per activity, distinct across activities.
  const seed = fnv1a(
    `${activity.id}:${Math.round(activity.tss ?? 0)}:${Math.round(activity.distance_meters ?? 0)}:` +
      `${Math.round(activity.duration_seconds ?? 0)}:${Math.round(activity.average_hr ?? 0)}`,
  )
  const rnd = mulberry32(seed)
  const gid = `thumb-fill-${activity.id}`
  const isGym = activity.sport === 'gym'

  // Endurance → ridge/route line; Gym → rep bars. Both seeded from `rnd`.
  const endurance = (() => {
    const n = 9
    const step = W / (n - 1)
    const ys = Array.from({ length: n }, () => 0.28 + rnd() * 0.55) // fraction of H above the floor
    const top = ys.map((f, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(H - f * H).toFixed(1)}`).join(' ')
    const area = `M 0 ${H} ${ys.map((f, i) => `L ${(i * step).toFixed(1)} ${(H - f * H).toFixed(1)}`).join(' ')} L ${W} ${H} Z`
    return { top, area }
  })()

  const bars = (() => {
    const n = 5
    const bw = 6
    const gap = (W - n * bw) / (n + 1)
    return Array.from({ length: n }, (_, i) => {
      const h = (0.32 + rnd() * 0.58) * H
      return { x: gap + i * (bw + gap), y: H - h, h, w: bw }
    })
  })()

  return (
    <span
      className="relative shrink-0 overflow-hidden rounded-[14px]"
      style={{ width: 64, height: 64, border: `1px solid color-mix(in srgb, ${color} 22%, transparent)` }}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="absolute inset-0">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={color} stopOpacity="0.06" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="var(--color-surface-2)" />
        <rect width={W} height={H} fill={`color-mix(in srgb, ${color} 12%, transparent)`} />
        {isGym ? (
          <g>
            {bars.map((b, i) => (
              <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={3} fill={`url(#${gid})`} stroke={color} strokeOpacity={0.7} strokeWidth={1} />
            ))}
          </g>
        ) : (
          <g>
            <path d={endurance.area} fill={`url(#${gid})`} />
            <path d={endurance.top} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        )}
      </svg>
      {/* Sport icon watermark */}
      <Icon size={18} className="absolute" style={{ right: 5, bottom: 5, color, opacity: 0.32 }} />
    </span>
  )
}

const fmtHm = (sec: number) => {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}
const fmtDur = (sec: number) => (sec >= 3600 ? fmtHm(sec) : `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`)
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
const durLabel = (sec: number) => (sec >= 3600 ? `${fmtHm(sec)} h` : `${Math.round(sec / 60)} min`)
const paceStr = (sec: number, meters: number) => {
  const km = meters / 1000
  if (!km) return '—'
  const spk = sec / km
  return `${Math.floor(spk / 60)}:${String(Math.round(spk % 60)).padStart(2, '0')}`
}

function heatColor(tss: number): string {
  if (tss <= 0) return 'var(--color-surface-2)'
  if (tss < 30) return 'color-mix(in srgb, var(--color-recovery) 18%, transparent)'
  if (tss < 70) return 'color-mix(in srgb, var(--color-recovery) 40%, transparent)'
  if (tss < 130) return 'color-mix(in srgb, var(--color-recovery) 70%, transparent)'
  return 'var(--color-recovery)'
}

// ── Month-in-review verdict — pure, testable (audit P1-8) ───────────────────
// A lighter month is neutral information (muted slate), never an amber/red
// caution: quiet stretches are part of training, not failures.
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

/** Scale for the 12-week bars comes from COMPLETED weeks only — the
 *  in-progress week neither sets nor is judged by the finished scale. */
export function completedWeekMax(bars: { value: number; inProgress?: boolean }[]): number {
  return Math.max(...bars.filter((b) => !b.inProgress).map((b) => b.value), 1)
}

export default function HistoryTab() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const today = useMemo(() => new Date(), [])
  // Pull a full year of history (API caps a single range at 366 days) so "See all"
  // truly shows all past workouts, not just the last few months.
  const { data: acts } = useActivitiesRange(useMemo(() => subDays(today, 365), [today]), today)
  const { data: power } = usePowerProfile()
  // Bike-only: History is cycling-only. Run/Strength filters + PR cards archived.
  const filter: Filter = 'cycling'
  // "See all" toggle for the Recent Activities list (collapsed → 5, expanded → all).
  const [showAll, setShowAll] = useState(false)
  // Active consistency-heatmap cell → floating tooltip (date + that day's TSS).
  const [heatCell, setHeatCell] = useState<{ ci: number; key: string; t: number } | null>(null)

  const all = acts?.activities ?? []
  const activities = useMemo(() => (filter === 'all' ? all : all.filter((a) => a.sport === filter)), [all, filter])

  const dateOf = (a: ActivityRead) => parseISO(a.started_at ?? a.date ?? '')

  // TSS + dominant sport per calendar day (filtered)
  const dayTss = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of activities) {
      const k = (a.started_at ?? a.date ?? '').slice(0, 10)
      if (k) m.set(k, (m.get(k) ?? 0) + (a.tss ?? 0))
    }
    return m
  }, [activities])

  const daySport = useMemo(() => {
    const m = new Map<string, { sport: string; tss: number }>()
    for (const a of activities) {
      const k = (a.started_at ?? a.date ?? '').slice(0, 10)
      if (!k) continue
      const cur = m.get(k)
      if (!cur || (a.tss ?? 0) >= cur.tss) m.set(k, { sport: a.sport, tss: a.tss ?? 0 })
    }
    return m
  }, [activities])

  // This-month vs last-month summary
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
  const countDelta = (d: number) => (d === 0 ? null : { up: d > 0, text: `${d > 0 ? '+' : ''}${d}` })

  const summaryStats = useMemo(() => {
    const c = summary.cur, p = summary.prev
    const loc = de ? 'de' : 'en'
    // Honest-dash sweep (finding #6): a month with zero sessions has no
    // distance/time/TSS to report — "—" everywhere, never a fake "0 km"
    // beside "— m". Units render only next to real values.
    const empty = c.n === 0
    const rows = [
      { label: de ? 'Distanz' : 'Distance', value: empty ? '—' : Math.round(c.km).toLocaleString(loc), unit: 'km', delta: empty ? null : pctDelta(c.km, p.km) },
      { label: de ? 'Zeit' : 'Time', value: empty ? '—' : fmtHm(c.sec), unit: 'h', delta: empty ? null : pctDelta(c.sec, p.sec) },
      { label: de ? 'Höhenmeter' : 'Elevation', value: '—', unit: 'm', delta: null },
      { label: 'TSS', value: empty ? '—' : Math.round(c.tss).toLocaleString(loc), unit: '', delta: empty ? null : pctDelta(c.tss, p.tss) },
      { label: de ? 'Einheiten' : 'Sessions', value: `${c.n}`, unit: '', delta: countDelta(c.n - p.n) },
    ]
    return rows.map((r) => (r.value === '—' ? { ...r, unit: '' } : r))
  }, [summary, de])

  // Raw TSS delta % (numeric) drives the at-a-glance verdict headline.
  const tssPct = summary.prev.tss ? Math.round(((summary.cur.tss - summary.prev.tss) / summary.prev.tss) * 100) : null
  const hasPrev = summary.prev.tss > 0 || summary.prev.n > 0
  const verdict = useMemo(
    () => monthVerdict(summary.cur.tss, summary.cur.n, tssPct, hasPrev, de),
    [summary, tssPct, hasPrev, de],
  )

  // Per-day TSS across the current month (filtered) — reveals the month's shape.
  const monthDaily = useMemo(() => {
    const y = today.getFullYear(), mo = today.getMonth()
    const n = getDaysInMonth(today)
    return Array.from({ length: n }, (_, i) => {
      const dnum = i + 1
      const date = new Date(y, mo, dnum)
      const key = format(date, 'yyyy-MM-dd')
      return { dnum, key, v: Math.round(dayTss.get(key) ?? 0), future: date > today, isToday: dnum === today.getDate() }
    })
  }, [dayTss, today])
  const monthDailyPeak = Math.max(...monthDaily.map((d) => d.v), 0)

  // Sport split of the month's TSS (unfiltered) — the All view breakdown.
  const monthSplit = useMemo(() => {
    const y = today.getFullYear(), mo = today.getMonth()
    const acc: Record<string, number> = { cycling: 0, running: 0, gym: 0 }
    for (const a of all) {
      const d = dateOf(a)
      if (d.getFullYear() !== y || d.getMonth() !== mo) continue
      if (a.sport in acc) acc[a.sport] += a.tss ?? 0
    }
    const total = acc.cycling + acc.running + acc.gym
    return { acc, total }
  }, [all, today])

  // Weekly TSS within the current month for the active sport (single-sport view).
  const monthWeekly = useMemo(() => {
    const mStart = startOfMonth(today)
    const first = startOfWeek(mStart, { weekStartsOn: 1 })
    const weeks: { key: string; v: number }[] = []
    for (let c = first; c <= today; c = addDays(c, 7)) weeks.push({ key: format(c, 'yyyy-MM-dd'), v: 0 })
    const idx = new Map(weeks.map((w, i) => [w.key, i]))
    for (const a of activities) {
      const d = dateOf(a)
      if (isNaN(d.getTime()) || d < first) continue
      const i = idx.get(format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd'))
      if (i != null) weeks[i].v += a.tss ?? 0
    }
    return weeks.map((w) => ({ ...w, v: Math.round(w.v) }))
  }, [activities, today])

  // Weekly TSS trend (12 weeks)
  const weekly = useMemo(() => {
    const buckets = Array.from({ length: 12 }, (_, i) => {
      const monday = startOfWeek(subDays(today, (11 - i) * 7), { weekStartsOn: 1 })
      return { key: format(monday, 'yyyy-MM-dd'), v: 0 }
    })
    const idx = new Map(buckets.map((b, i) => [b.key, i]))
    for (const a of activities) {
      const d = dateOf(a)
      if (isNaN(d.getTime())) continue
      const key = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const i = idx.get(key)
      if (i != null) buckets[i].v += a.tss ?? 0
    }
    return buckets.map((b) => ({ ...b, v: Math.round(b.v) }))
  }, [activities, today])
  // Average over COMPLETED weeks only — the in-progress week would drag the
  // number down and read like a shortfall (audit P1-8).
  const completedWeeks = weekly.slice(0, -1)
  const weeklyAvg = Math.round(completedWeeks.reduce((s, w) => s + w.v, 0) / Math.max(completedWeeks.length, 1))

  // Consistency heatmap — 26 weeks × 7 days
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

  // Weekly rhythm (P1-11): the Konstanz card shows the SAME consistency stat
  // Today shows — met vs planned days this week — never a day-streak count
  // that could contradict it. Hidden until the backend sends the stat.
  const { data: streakData } = useStreak()
  const consistency = streakData?.consistency ?? null

  // Personal records — computed per-sport so the card can react to the active filter.
  const prs = useMemo(() => {
    const cyc = all.filter((a) => a.sport === 'cycling')
    const run = all.filter((a) => a.sport === 'running')
    const gym = all.filter((a) => a.sport === 'gym')
    const maxBy = (arr: ActivityRead[], f: (a: ActivityRead) => number) =>
      arr.reduce<ActivityRead | null>((b, a) => (f(a) > (b ? f(b) : -Infinity) ? a : b), null)

    // ── Cycling ──────────────────────────────────────────────────────────────
    const longestRide = maxBy(cyc.filter((a) => a.distance_meters != null), (a) => a.distance_meters ?? 0)
    const fastestRide = cyc
      .filter((a) => (a.distance_meters ?? 0) > 3000 && (a.duration_seconds ?? 0) > 0)
      .map((a) => ({ a, kmh: (a.distance_meters! / 1000) / (a.duration_seconds! / 3600) }))
      .sort((x, y) => y.kmh - x.kmh)[0]
    const p20 = power?.peaks?.['1200']

    // ── Running — distance PRs pace-scaled from runs that reached near the mark ─
    const scaledBest = (minMeters: number, targetMeters: number) => run
      .filter((a) => (a.distance_meters ?? 0) >= minMeters && a.duration_seconds)
      .map((a) => ({ a, sec: a.duration_seconds! * (targetMeters / (a.distance_meters ?? 1)) }))
      .sort((x, y) => x.sec - y.sec)[0]
    const best5k = scaledBest(4500, 5000)
    const best10k = scaledBest(9500, 10000)
    const longestRun = maxBy(run.filter((a) => a.distance_meters != null), (a) => a.distance_meters ?? 0)
    const bestPace = run
      .filter((a) => (a.distance_meters ?? 0) > 500 && a.duration_seconds)
      .map((a) => ({ a, spk: a.duration_seconds! / ((a.distance_meters ?? 1) / 1000) }))
      .filter((x) => x.spk > 120 && x.spk < 1200)
      .sort((x, y) => x.spk - y.spk)[0]

    // ── Strength — real gym fields only (duration / calories / avg HR) ─────────
    const gymThisMonth = gym.filter((a) => {
      const d = dateOf(a)
      return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()
    }).length
    const longestGym = maxBy(gym.filter((a) => a.duration_seconds != null), (a) => a.duration_seconds ?? 0)
    const topCalGym = maxBy(gym.filter((a) => a.calories != null), (a) => a.calories ?? 0)
    const topHrGym = maxBy(gym.filter((a) => a.average_hr != null), (a) => a.average_hr ?? 0)

    return { longestRide, fastestRide, p20, best5k, best10k, longestRun, bestPace, gymThisMonth, longestGym, topCalGym, topHrGym }
  }, [all, power, today])

  // Row set is keyed to the active sport filter so the card matches Ride / Run /
  // Strength / All. Real data only — honest "—" where a metric has no basis.
  const prRows = useMemo(() => {
    const dfmt = (a?: ActivityRead | null) => (a?.started_at ? formatDate(parseISO(a.started_at), de ? 'd. MMM yyyy' : 'MMM d, yyyy', locale) : '—')

    const rideRows = [
      {
        icon: Bike, color: 'var(--color-strain)', title: de ? 'Längste Fahrt' : 'Longest Ride',
        date: dfmt(prs.longestRide), value: prs.longestRide ? `${((prs.longestRide.distance_meters ?? 0) / 1000).toFixed(0)} km` : '—',
        to: prs.longestRide ? `/activities/${prs.longestRide.id}/ride` : null,
      },
      {
        icon: Gauge, color: 'var(--color-accent)', title: de ? 'Schnellster Schnitt' : 'Fastest avg speed',
        date: dfmt(prs.fastestRide?.a), value: prs.fastestRide ? `${prs.fastestRide.kmh.toFixed(1)} km/h` : '—',
        to: prs.fastestRide?.a ? `/activities/${prs.fastestRide.a.id}/ride` : null,
      },
      { icon: Mountain, color: 'var(--color-amber)', title: de ? 'Größter Anstieg' : 'Biggest Climb', date: '—', value: '—', to: null },
      { icon: Zap, color: 'var(--color-accent)', title: de ? 'Max 20-Min-Leistung' : 'Max 20-min Power', date: '—', value: prs.p20 ? `${Math.round(prs.p20)} W` : '—', to: null },
    ]

    // Bike-only: cycling records only (run/gym PR cards archived).
    return rideRows
  }, [prs, de, locale])

  // Full filtered, newest-first list; the Recent card shows 5 unless expanded.
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
    const km = a.distance_meters != null ? (a.distance_meters / 1000).toFixed(1) : '—'
    const dur = a.duration_seconds ?? 0
    if (a.sport === 'gym') {
      // Gym payloads lack `sets`; show only real fields: duration, kcal, avg HR.
      return [
        { v: a.duration_seconds != null ? `${Math.round(dur / 60)}` : '—', l: 'min' },
        { v: a.calories != null ? `${Math.round(a.calories)}` : '—', l: 'kcal' },
        { v: a.average_hr != null ? `${Math.round(a.average_hr)}` : '—', l: de ? 'Ø HF' : 'avg HR' },
      ]
    }
    if (a.sport === 'running') {
      return [
        { v: km, l: 'km' },
        { v: a.duration_seconds != null ? fmtDur(dur) : '—', l: dur >= 3600 ? 'h:m' : 'time' },
        { v: a.distance_meters ? paceStr(dur, a.distance_meters) : '—', l: '/km' },
      ]
    }
    return [
      { v: km, l: 'km' },
      { v: a.duration_seconds != null ? fmtDur(dur) : '—', l: dur >= 3600 ? 'h:m' : 'time' },
      { v: a.normalized_power != null ? `${Math.round(a.normalized_power)}` : '—', l: 'watts' },
    ]
  }

  // Extra stats revealed on hover — only real, populated fields (no
  // fabrication), and NEVER a field the base row already shows (review
  // finding: gym entries rendered "111 Ø HF" twice — base + hover both
  // carried avg HR/kcal; running duplicated pace the same way).
  const recentHoverStats = (a: ActivityRead): { v: string; l: string }[] => {
    const out: { v: string; l: string }[] = []
    if (a.sport !== 'gym' && a.average_hr != null) out.push({ v: `${Math.round(a.average_hr)}`, l: de ? 'Ø HF' : 'avg HR' })
    if (a.max_hr != null) out.push({ v: `${Math.round(a.max_hr)}`, l: de ? 'Max HF' : 'max HR' })
    if (a.sport === 'cycling' && a.average_power != null) out.push({ v: `${Math.round(a.average_power)}`, l: de ? 'Ø W' : 'avg W' })
    if (a.tss != null) out.push({ v: `${Math.round(a.tss)}`, l: 'TSS' })
    if (a.sport !== 'gym' && a.calories != null) out.push({ v: `${Math.round(a.calories)}`, l: 'kcal' })
    return out
  }

  // Month calendar
  const monthStart = startOfMonth(today)
  const daysInMonth = getDaysInMonth(today)
  const leadBlanks = (getDay(monthStart) + 6) % 7

  return (
    <div className="flex flex-col gap-6 pb-5">
      {/* Header: title + filter chips */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="num-display" style={{ fontSize: 24, color: 'var(--color-ink)' }}>{de ? 'Verlauf' : 'History'}</h1>
          <button type="button" className="grid place-items-center rounded-full" style={{ width: 40, height: 40, ...cardStyle }}>
            <SlidersHorizontal size={20} style={{ color: 'var(--color-ink-2)' }} />
          </button>
        </div>
      </div>

      {/* ── Monat im Überblick — ONE merged month card (P2-13): verdict
          headline + numeric tiles + daily-load chart + sport split/trend.
          The former separate "Dieser Monat" card duplicated Load/Hours/
          Sessions at the same grain — merged, nothing is told twice. ── */}
      <div className="rounded-[24px] p-5 flex flex-col gap-5" style={{ ...cardStyle, background: `linear-gradient(160deg, color-mix(in srgb, ${verdict.color} 12%, var(--color-paper-2)) 0%, var(--color-paper-2) 62%)` }}>
        <div className="flex items-center justify-between">
          <span className="eyebrow">{de ? 'Monat im Überblick' : 'Month in review'}</span>
          <span className="num-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{formatDate(today, 'MMMM yyyy', locale)}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2">
            <span style={{ width: 8, height: 8, borderRadius: 999, background: verdict.color }} />
            <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>{verdict.word}</span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: 'var(--color-ink-2)' }}>{verdict.sentence}</span>
        </div>

        {/* Numeric tiles */}
        <div className="grid grid-cols-3 gap-x-3 gap-y-[18px]">
          {summaryStats.map((s) => (
            <div key={s.label} className="flex flex-col gap-[5px]">
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.3px', color: 'var(--color-muted)' }}>{s.label}</span>
              <span className="flex items-end gap-[3px]">
                <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>{s.value}</span>
                {s.unit && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)', paddingBottom: 3 }}>{s.unit}</span>}
              </span>
              {s.delta && (
                s.delta.up ? (
                  <span className="inline-flex items-center gap-[2px]" style={{ color: 'var(--color-recovery)' }}>
                    <ArrowUp size={12} />
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{s.delta.text}</span>
                  </span>
                ) : (
                  // P1-8: below-plan / below-last-month numbers stay neutral gray.
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{s.delta.text}</span>
                )
              )}
            </div>
          ))}
        </div>

        {/* Daily load — per-day TSS across the month, hover any bar */}
        <div className="flex flex-col gap-2.5" style={{ borderTop: '1px solid var(--color-rule)', paddingTop: 18 }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Tägliche Belastung' : 'Daily load'}</span>
            <span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'TSS/Tag · Balken antippen' : 'TSS/day · tap a bar'}</span>
          </div>
          {monthDailyPeak > 0 ? (
            <HoverBars
              height={92}
              gap={2}
              radius={2}
              defaultColor="var(--color-strain)"
              bars={monthDaily.map((d) => ({
                value: d.future ? 0 : d.v,
                valueLabel: d.v > 0 ? `${d.v} TSS` : (de ? 'Ruhetag' : 'Rest day'),
                label: formatDate(parseISO(d.key), de ? 'EEE, d. MMM' : 'EEE, MMM d', locale),
                highlight: d.isToday,
              }))}
            />
          ) : (
            <div className="grid place-items-center rounded-[14px]" style={{ height: 92, background: 'var(--color-surface-2)', fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>
              {de ? 'Noch keine Einheiten diesen Monat' : 'No sessions logged this month yet'}
            </div>
          )}
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{formatDate(startOfMonth(today), de ? 'd. MMM' : 'MMM d', locale)}</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{formatDate(today, de ? 'd. MMM' : 'MMM d', locale)}</span>
          </div>
        </div>

        {/* Filter = All → sport split of month TSS · single sport → its weekly trend */}
        {filter === 'all' ? (
          <div className="flex flex-col gap-2.5" style={{ borderTop: '1px solid var(--color-rule)', paddingTop: 18 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Sport-Aufteilung' : 'Sport split'}</span>
            {monthSplit.total > 0 ? (
              <>
                <div className="flex w-full overflow-hidden rounded-full" style={{ height: 12, background: 'var(--color-surface-2)' }}>
                  {(['cycling', 'running', 'gym'] as const).map((s) => {
                    const pct = (monthSplit.acc[s] / monthSplit.total) * 100
                    return pct > 0 ? <span key={s} style={{ width: `${pct}%`, background: sportColor(s) }} /> : null
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {(['cycling', 'running', 'gym'] as const).map((s) => {
                    const label = s === 'cycling' ? (de ? 'Rad' : 'Ride') : s === 'running' ? (de ? 'Lauf' : 'Run') : (de ? 'Kraft' : 'Strength')
                    const pct = Math.round((monthSplit.acc[s] / monthSplit.total) * 100)
                    return (
                      <span key={s} className="flex items-center gap-1.5">
                        <span style={{ width: 7, height: 7, borderRadius: 999, background: sportColor(s) }} />
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>{label}</span>
                        <span className="num-mono" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-ink)' }}>{pct}%</span>
                        <span className="num-mono" style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--color-muted)' }}>{Math.round(monthSplit.acc[s])} TSS</span>
                      </span>
                    )
                  })}
                </div>
              </>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Noch keine Belastung diesen Monat' : 'No load logged this month yet'}</span>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5" style={{ borderTop: '1px solid var(--color-rule)', paddingTop: 18 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Wöchentlicher Verlauf' : 'Weekly trend'}</span>
            {monthWeekly.some((w) => w.v > 0) ? (
              <HoverBars
                height={80}
                gap={8}
                defaultColor={sportColor(filter)}
                bars={monthWeekly.map((w) => {
                  const monday = parseISO(w.key)
                  return {
                    value: w.v,
                    valueLabel: `${w.v} TSS`,
                    label: `${formatDate(monday, de ? 'd. MMM' : 'MMM d', locale)} – ${formatDate(addDays(monday, 6), de ? 'd. MMM' : 'MMM d', locale)}`,
                    color: sportColor(filter),
                  }
                })}
              />
            ) : (
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Noch keine Einheiten diesen Monat' : 'No sessions logged this month yet'}</span>
            )}
          </div>
        )}
        <Link to="/load-form" className="hover-card inline-flex items-center gap-1 self-start" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-accent)' }}>
          {de ? 'Belastung & Form ansehen' : 'View load & form'}
          <ChevronRight size={14} className="hover-arrow" style={{ color: 'var(--color-accent)' }} />
        </Link>
      </div>

      {/* Month calendar → load-form drill-down */}
      <Link to="/load-form" className="hover-card rounded-[24px] p-5 flex flex-col gap-3.5" style={cardStyle}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{formatDate(today, 'MMMM', locale)}</span>
            <ChevronRight size={16} className="hover-arrow" style={{ color: 'var(--color-muted)' }} />
          </span>
          <span className="flex items-center gap-3.5">
            <ChevronLeft size={20} style={{ color: 'var(--color-muted)' }} />
            <ChevronRight size={20} style={{ color: 'var(--color-ink-2)' }} />
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {(de ? ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']).map((d, i) => (
            <span key={i} className="text-center" style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>{d}</span>
          ))}
          {Array.from({ length: leadBlanks }).map((_, i) => <div key={`b${i}`} style={{ height: 42 }} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dnum = i + 1
            const key = format(new Date(today.getFullYear(), today.getMonth(), dnum), 'yyyy-MM-dd')
            const info = daySport.get(key)
            const isToday = dnum === today.getDate()
            const col = info ? sportColor(info.sport) : undefined
            return (
              <div key={dnum} className="flex flex-col items-center justify-center gap-[3px] rounded-[10px]"
                style={{
                  height: 42,
                  background: col ? `color-mix(in srgb, ${col} 15%, transparent)` : 'var(--color-surface-2)',
                  border: isToday ? '1.5px solid var(--color-accent)' : 'none',
                }}>
                <span className="num-mono" style={{ fontSize: 12, fontWeight: info ? 700 : 500, color: info ? 'var(--color-ink)' : 'var(--color-muted)' }}>{dnum}</span>
                {col && <span style={{ width: 5, height: 5, borderRadius: 999, background: col }} />}
              </div>
            )
          })}
        </div>
        {/* Bike-only: sport legend removed — every ride is cycling. */}
        <div className="hover-reveal" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-accent)' }}>{de ? 'Belastung & Form ansehen →' : 'View load & form →'}</div>
      </Link>

      {/* Consistency heatmap */}
      <div className="rounded-[24px] p-5 flex flex-col gap-4" style={cardStyle}>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Konstanz' : 'Consistency'}</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Letzte 6 Monate' : 'Last 6 months'}</span>
          </div>
          {/* Weekly rhythm — the same consistency stat Today shows (P1-11);
              hidden until the backend sends it. met = 0 stays neutral gray. */}
          {consistency && consistency.planned > 0 && (
            <span className="flex items-center gap-[5px] rounded-full" style={{ padding: '6px 12px', background: consistency.met > 0 ? 'color-mix(in srgb, var(--color-recovery) 15%, transparent)' : 'var(--color-surface-2)' }}>
              <CalendarCheck size={15} style={{ color: consistency.met > 0 ? 'var(--color-recovery)' : 'var(--color-muted)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: consistency.met > 0 ? 'var(--color-recovery)' : 'var(--color-muted)' }}>
                {de ? `${consistency.met} von ${consistency.planned} geplanten Tagen` : `${consistency.met} of ${consistency.planned} planned days`}
              </span>
            </span>
          )}
        </div>
        <div className="relative select-none">
          {heatCell && (
            <div
              className="absolute z-20 pointer-events-none flex flex-col items-center"
              style={{ left: `${((heatCell.ci + 0.5) / heat.length) * 100}%`, bottom: '100%', marginBottom: 8, transform: 'translateX(-50%)' }}
            >
              <div
                className="rounded-[10px] px-2.5 py-1.5 flex flex-col items-center gap-0.5 whitespace-nowrap"
                style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-rule)', boxShadow: '0 6px 18px rgba(0,0,0,0.45)' }}
              >
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
      </div>

      {/* Weekly-Load trend — hover any bar for its TSS + week; card links to load-form */}
      <div className="hover-card rounded-[24px] p-5 flex flex-col gap-4" style={cardStyle}>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Wochenlast' : 'Weekly Load'}</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'TSS · letzte 12 Wochen · Balken antippen' : 'TSS · last 12 weeks · tap a bar'}</span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="num-display" style={{ fontSize: 18, color: weekly.some((w) => w.v > 0) ? 'var(--color-strain)' : 'var(--color-muted)' }}>{weekly.some((w) => w.v > 0) ? weeklyAvg : '—'}</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Ø / volle Woche' : 'avg / full wk'}</span>
          </div>
        </div>
        {weekly.some((w) => w.v > 0) ? (
          <>
            <InProgressWeekBars
              height={130}
              gap={6}
              bars={weekly.map((w, i) => {
                const monday = parseISO(w.key)
                const sunday = addDays(monday, 6)
                const inProgress = i === weekly.length - 1
                return {
                  value: w.v,
                  valueLabel: `${w.v} TSS${inProgress ? (de ? ' · läuft noch' : ' · in progress') : ''}`,
                  label: `${formatDate(monday, de ? 'd. MMM' : 'MMM d', locale)} – ${formatDate(sunday, de ? 'd. MMM' : 'MMM d', locale)}`,
                  inProgress,
                }
              })}
            />
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'vor 12 Wochen' : '12 wks ago'}</span>
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Diese Woche · läuft noch' : 'This week · in progress'}</span>
            </div>
          </>
        ) : (
          // Honest empty state (finding #6): no fake floor bars under a "0".
          <div className="grid place-items-center rounded-[14px]" style={{ height: 130, background: 'var(--color-surface-2)', fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>
            {de ? 'Noch keine Einheiten in den letzten 12 Wochen' : 'No sessions logged in the last 12 weeks yet'}
          </div>
        )}
        <Link to="/load-form" className="hover-reveal inline-flex items-center gap-1" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-accent)' }}>{de ? 'Belastung & Form ansehen →' : 'View load & form →'}</Link>
      </div>

      {/* Personal records */}
      <div className="rounded-[24px] flex flex-col" style={{ ...cardStyle, padding: '6px 20px' }}>
        <div className="flex items-center justify-between" style={{ padding: '14px 0' }}>
          <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Rekorde' : 'Personal Records'}</span>
          <Trophy size={18} style={{ color: 'var(--color-amber)' }} />
        </div>
        {prRows.map((p, i) => {
          const rowClass = 'hover-card flex items-center gap-3'
          const rowStyle = { padding: '14px 0', borderTop: i > 0 ? '1px solid var(--color-rule)' : 'none' } as const
          const inner = (
            <>
              <span className="grid place-items-center rounded-full shrink-0" style={{ width: 38, height: 38, background: `color-mix(in srgb, ${p.color} 15%, transparent)` }}>
                <p.icon size={20} style={{ color: p.color }} />
              </span>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>{p.title}</span>
                {/* No date basis (e.g. 20-min power comes from the sanitized
                    power-duration envelope, not one ride) → drop the slot
                    instead of rendering a dash next to a real value. */}
                {p.date !== '—' && (
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{p.date}</span>
                )}
              </div>
              <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{p.value}</span>
              {p.to && <ChevronRight size={16} className="hover-arrow" style={{ color: 'var(--color-muted)' }} />}
            </>
          )
          return p.to
            ? <Link key={p.title} to={p.to} className={rowClass} style={rowStyle}>{inner}</Link>
            : <div key={p.title} className="flex items-center gap-3" style={rowStyle}>{inner}</div>
        })}
      </div>

      {/* Recent activities */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="flex items-baseline gap-2">
            <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{de ? 'Letzte Aktivitäten' : 'Recent Activities'}</span>
            <span className="num-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>
              {sortedActivities.length} {de ? 'Aktivitäten' : sortedActivities.length === 1 ? 'activity' : 'activities'}
            </span>
          </span>
          {sortedActivities.length > 5 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="inline-flex items-center gap-0.5" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent)' }}>
              {showAll ? (de ? 'Weniger' : 'Show less') : (de ? 'Alle' : 'See all')}
              <ChevronRight size={15} style={{ color: 'var(--color-accent)', transform: showAll ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform 0.18s ease' }} />
            </button>
          )}
        </div>
        {recent.map((a) => {
          const Icon = sportIcon(a.sport)
          const col = sportColor(a.sport)
          // Bike-only: every activity opens the V3 Ride Recap (grade +
          // planned-vs-actual RPE loop); the recap links onward to Ride Analysis.
          const route = `/activities/${a.id}/recap`
          const hoverStats = recentHoverStats(a)
          return (
            <Link key={a.id} to={route} className="hover-card flex items-center gap-3 rounded-[24px] p-3" style={cardStyle}>
              {/* Generative thumbnail — deterministic SVG motif seeded from the activity's own numbers */}
              <ActivityThumb activity={a} color={col} Icon={Icon} />
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Icon size={15} style={{ color: col }} />
                  <span className="truncate" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{a.title ?? (de ? 'Einheit' : 'Session')}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{relDate(a)}</span>
                <div className="flex gap-4">
                  {recentStats(a).map((s, si) => (
                    <div key={si} className="flex flex-col gap-px">
                      <span className="num-display" style={{ fontSize: 14, color: 'var(--color-ink)' }}>{s.v}</span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{s.l}</span>
                    </div>
                  ))}
                </div>
                {/* Hover-reveal: extra real stats + call-to-view */}
                <div className="hover-reveal flex flex-col gap-2" style={{ borderTop: '1px solid var(--color-rule)', paddingTop: 8 }}>
                  {hoverStats.length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {hoverStats.map((s, si) => (
                        <div key={si} className="flex items-baseline gap-1">
                          <span className="num-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>{s.v}</span>
                          <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{s.l}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-accent)' }}>{de ? 'Analyse ansehen →' : 'View analysis →'}</span>
                </div>
              </div>
              <ChevronRight size={18} className="hover-arrow shrink-0" style={{ color: 'var(--color-muted)' }} />
            </Link>
          )
        })}
      </div>

      {/* Insights — the curated deep end (PMC, TID, efficiency, VO₂max, form,
          AI-FTP framing, NL chart workspace). Roadmap P0.5. */}
      <InsightsSection sport={filter} />
    </div>
  )
}

// ── In-progress-aware weekly bars (audit P1-8) ──────────────────────────────
// Same interaction contract as HoverBars, plus one honesty rule: the current
// (in-progress) week is a DIFFERENT kind of bar — reduced-opacity fill with a
// dashed top edge and a "läuft noch / in progress" tooltip label — and it is
// excluded from the completed weeks' scale so a half-lived week can never
// render as the row's smallest "failure" bar.
function InProgressWeekBars({
  bars,
  height = 130,
  gap = 6,
}: {
  bars: { value: number; valueLabel: string; label: string; inProgress?: boolean }[]
  height?: number
  gap?: number
}) {
  const [active, setActive] = useState<number | null>(null)
  const max = completedWeekMax(bars)
  const act = active != null ? bars[active] : null

  return (
    <div className="relative select-none" style={{ width: '100%' }}>
      {act && (
        <div
          className="absolute z-20 pointer-events-none flex flex-col items-center"
          style={{
            left: `${((active! + 0.5) / bars.length) * 100}%`,
            bottom: height + 8,
            transform: 'translateX(-50%)',
          }}
        >
          <div
            className="rounded-[10px] px-2.5 py-1.5 flex flex-col items-center gap-0.5 whitespace-nowrap"
            style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-rule)', boxShadow: '0 6px 18px rgba(0,0,0,0.45)' }}
          >
            <span className="num-display" style={{ fontSize: 14, lineHeight: 1, color: act.inProgress ? 'var(--color-ink-2)' : 'var(--color-ink)' }}>{act.valueLabel}</span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-muted)' }}>{act.label}</span>
          </div>
          <span style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid var(--color-surface-3)' }} />
        </div>
      )}

      <div className="flex items-end" style={{ height, gap }}>
        {bars.map((b, i) => {
          const on = active === i
          return (
            <button
              key={i}
              type="button"
              className="flex-1 min-w-0 p-0 border-0 bg-transparent"
              style={{ height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'pointer' }}
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
              onPointerLeave={() => setActive((cur) => (cur === i ? null : cur))}
              aria-label={`${b.label}: ${b.valueLabel}`}
            >
              <span
                className="block w-full"
                style={{
                  height: `${Math.min(100, Math.max(6, (b.value / max) * 100))}%`,
                  background: b.inProgress
                    ? 'color-mix(in srgb, var(--color-strain) 45%, transparent)'
                    : 'var(--color-strain)',
                  borderTop: b.inProgress ? '2px dashed var(--color-strain)' : 'none',
                  borderRadius: '3px 3px 0 0',
                  opacity: on || b.inProgress ? 1 : 0.8,
                  outline: on ? '2px solid color-mix(in srgb, var(--color-ink) 25%, transparent)' : 'none',
                  outlineOffset: 1,
                  transition: 'opacity 0.12s ease',
                }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
