/**
 * SportTab — Phase 7.05 "One-Screen Truth" edition (cycling + running shared).
 *
 * Above the fold: state (VO2MaxEstimate as sport composite) + trajectory (TrajectorySentence sport={sport}) + prescription (CoachBrief).
 * Below the fold (collapsed by default): editorial hero, StatCards, TrainingHeatmap, RecentActivities, GoalCard, AiCoachNote.
 *
 * Hard rule (verified in Plan 05): above-the-fold component count == 3.
 *
 * What was retired here (vs the prior 668-line tab):
 * - Editorial hero pushed below the fold (no longer competes with the sport composite)
 * - Stat grid moved into the disclosure (4 KPI cards are not the state — the composite VO2 is the state)
 * - Heatmap moved into the disclosure (13-week visualization is depth, not glance)
 *
 * TODO (Phase 7.1): add sport-aware filtering to CoachBrief so prescriptions
 * surface only activities relevant to the selected sport.
 */

import { useMemo } from 'react'
import { subDays, startOfDay, format, addDays } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  Bike,
  Activity as RunIcon,
  Target,
  Flame,
  Trophy,
  Zap,
  TrendingUp,
  CalendarDays,
} from 'lucide-react'
import { useLocale } from '../../../contexts/LocaleContext'
import type { Locale } from '../../../i18n/strings'
import { useActivitiesRange } from '../../../hooks/useActivitiesRange'
import { useAthleteProfile } from '../../../hooks/useAthleteProfile'
import { useCountUp } from '../../../hooks/useCountUp'
import VO2MaxEstimate from '../VO2MaxEstimate'
import RecentActivities from '../RecentActivities'
import TrajectorySentence from '../TrajectorySentence'
import CoachBrief from '../CoachBrief'
import DashboardSection from '../DashboardSection'
import type { ActivityRead } from '../../../api/dashboard'

type Sport = 'cycling' | 'running'

interface SportMeta {
  id: Sport
  label: string
  tagline: string
  color: string
  icon: React.ReactNode
  targetLabel: string
  fmtDistance: (m: number) => string
}

function sportLabel(sport: Sport, locale: Locale): string {
  if (locale !== 'de') return SPORT_META[sport].label
  return sport === 'cycling' ? 'Radfahren' : 'Laufen'
}

const SPORT_META: Record<Sport, SportMeta> = {
  cycling: {
    id: 'cycling',
    label: 'Biking',
    tagline: 'Every watt is earned. Every ride compounds.',
    color: 'var(--color-forest-2)',
    icon: <Bike size={14} strokeWidth={2} />,
    targetLabel: 'FTP target',
    fmtDistance: (m) => `${(m / 1000).toFixed(1)} km`,
  },
  running: {
    id: 'running',
    label: 'Running',
    tagline: 'Aerobic economy is built in months, lost in weeks.',
    color: '#FF6430',
    icon: <RunIcon size={14} strokeWidth={2} />,
    targetLabel: 'Pace target',
    fmtDistance: (m) => `${(m / 1000).toFixed(1)} km`,
  },
}

function formatPaceMinPerKm(minPerKm: number): string {
  const m = Math.floor(minPerKm)
  const s = Math.round((minPerKm - m) * 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function StatCard({
  label,
  value,
  unit,
  subtitle,
  icon,
  color,
}: {
  label: string
  value: string | number
  unit?: string
  subtitle?: string
  icon: React.ReactNode
  color: string
}) {
  return (
    <div
      className="flex flex-col gap-2 p-5 rounded-[16px] min-w-0"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="flex items-center gap-2" style={{ color }}>
        {icon}
        <span
          className="eyebrow"
          style={{
            fontSize: 9,
            letterSpacing: '0.22em',
            color,
            fontWeight: 600,
          }}
        >
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="num-display leading-none"
          style={{
            fontSize: 28,
            color: 'var(--color-ink)',
            fontVariationSettings: '"opsz" 144, "wght" 500',
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            className="num-mono"
            style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: '0.12em' }}
          >
            {unit}
          </span>
        )}
      </div>
      {subtitle && (
        <span
          className="num-mono"
          style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: '0.08em' }}
        >
          {subtitle}
        </span>
      )}
    </div>
  )
}

// ─── Sport-specific metric computation ─────────────────────────────────────

function cyclingStats(activities: ActivityRead[]) {
  const cyc = activities.filter((a) => a.sport === 'cycling')
  const last90 = cyc // already in last 90d
  const totalKm = last90.reduce((s, a) => s + (a.distance_meters ?? 0) / 1000, 0)
  const totalSessions = last90.length
  const totalTSS = Math.round(last90.reduce((s, a) => s + (a.tss ?? 0), 0))
  const peakNP = last90.reduce((m, a) => Math.max(m, a.normalized_power ?? 0), 0)
  const longestRide = last90.reduce((m, a) => Math.max(m, a.distance_meters ?? 0), 0)
  return { totalKm, totalSessions, totalTSS, peakNP, longestRide }
}

function runningStats(activities: ActivityRead[]) {
  const run = activities.filter((a) => a.sport === 'running')
  const totalKm = run.reduce((s, a) => s + (a.distance_meters ?? 0) / 1000, 0)
  const totalSessions = run.length
  const totalTSS = Math.round(run.reduce((s, a) => s + (a.tss ?? 0), 0))
  const longestRun = run.reduce((m, a) => Math.max(m, a.distance_meters ?? 0), 0)
  // Fastest pace over >= 3 km
  const paced = run
    .filter((a) => a.distance_meters && a.distance_meters >= 3000 && a.duration_seconds)
    .map((a) => a.duration_seconds! / 60 / (a.distance_meters! / 1000))
  const fastestPace = paced.length > 0 ? Math.min(...paced) : null
  return { totalKm, totalSessions, totalTSS, longestRun, fastestPace }
}

// ─── Components ────────────────────────────────────────────────────────────

function GoalCard({ sport, profile }: {
  sport: Sport
  profile: {
    ftp_watts?: number | null
    goals?: { target_ftp?: number; target_event_name?: string; target_event_date?: string } | null
  } | null | undefined
}) {
  const { locale } = useLocale()
  const meta = SPORT_META[sport]
  const target = sport === 'cycling' ? profile?.goals?.target_ftp : null
  const current = sport === 'cycling' ? profile?.ftp_watts : null

  const pct =
    sport === 'cycling' && target && current
      ? Math.min(1, current / target)
      : 0

  return (
    <div
      className="rounded-[20px] px-6 py-6 relative overflow-hidden"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: `1px solid color-mix(in srgb, ${meta.color} 22%, var(--color-rule))`,
        backgroundImage: `radial-gradient(60% 50% at 100% 0%, color-mix(in srgb, ${meta.color} 10%, transparent), transparent 55%)`,
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Target size={13} strokeWidth={2} style={{ color: meta.color }} />
        <span
          className="eyebrow"
          style={{
            color: 'var(--color-ink)',
            letterSpacing: '0.28em',
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          {locale === 'de' ? 'Dein Ziel' : 'Your goal'} · {sportLabel(sport, locale)}
        </span>
      </div>
      {sport === 'cycling' && target && current ? (
        <>
          <div className="flex items-baseline gap-2 mb-2">
            <span
              className="num-display leading-none"
              style={{ fontSize: 36, color: 'var(--color-ink)' }}
            >
              {current}
            </span>
            <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
              / {target} W
            </span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--color-rule)' }}
          >
            <div
              className="h-full transition-all duration-1000"
              style={{
                width: `${pct * 100}%`,
                backgroundColor: meta.color,
                borderRadius: 4,
              }}
            />
          </div>
          <p className="text-[12px] mt-3" style={{ color: 'var(--color-ink-2)' }}>
            {pct >= 1
              ? (locale === 'de'
                  ? 'Ziel-FTP erreicht. Setz die Latte im Profil höher, wenn du bereit bist.'
                  : 'Target FTP achieved. Raise the bar in Profile when you\'re ready.')
              : (locale === 'de'
                  ? `Noch ${Math.round((target - current))} W — ${Math.round(pct * 100)}% geschafft. Strukturierte VO2- + Sweet-Spot-Blöcke summieren sich schnell.`
                  : `${Math.round((target - current))} W to go — ${Math.round(pct * 100)}% there. Structured VO2 + sweet-spot blocks compound fast.`)}
          </p>
        </>
      ) : (
        <>
          <p
            className="text-[14px] leading-relaxed"
            style={{ color: 'var(--color-ink-2)', maxWidth: '46ch' }}
          >
            {sport === 'cycling'
              ? (locale === 'de'
                  ? 'Lege im Profil ein FTP-Ziel fest, um die Zielverfolgung freizuschalten. Der KI-Coach plant darauf hin.'
                  : 'Set an FTP target in your Profile to unlock goal tracking. The AI coach will program toward it.')
              : (locale === 'de'
                  ? 'Laufziele bald verfügbar — Pace-Ziele, Longrun-Ziele und wettkampfspezifische Aufbaupläne.'
                  : 'Running goals coming soon — pace targets, longest-run goals, and race-specific build plans.')}
          </p>
        </>
      )}
    </div>
  )
}

// ─── GitHub-style training heatmap ─────────────────────────────────────────
// 13-week (91-day) grid, weeks as columns, weekdays as rows. Cell intensity
// scales with daily TSS for the selected sport — days without a session are
// muted, training days light up in the sport's accent color.

const HEATMAP_WEEKS = 13
const HEATMAP_DAYS = HEATMAP_WEEKS * 7

function TrainingHeatmap({
  sport,
  activities,
  color,
}: {
  sport: Sport
  activities: ActivityRead[]
  color: string
}) {
  const { locale } = useLocale()
  const { cells, totalDays, weekLabels } = useMemo(() => {
    const today = startOfDay(new Date())
    // Anchor grid so today is the bottom-right cell (weekday-aware).
    const todayDow = today.getDay() // 0 = Sun … 6 = Sat
    const gridEnd = today
    const gridStart = subDays(gridEnd, HEATMAP_DAYS - 1 - (6 - todayDow))

    const tssByDay = new Map<string, number>()
    for (const a of activities) {
      if (a.sport !== sport) continue
      const key = format(startOfDay(new Date(a.started_at)), 'yyyy-MM-dd')
      tssByDay.set(key, (tssByDay.get(key) ?? 0) + (a.tss ?? 0))
    }

    const list: Array<{
      key: string
      date: Date
      tss: number
      future: boolean
    }> = []
    for (let i = 0; i < HEATMAP_DAYS; i += 1) {
      const d = addDays(gridStart, i)
      const key = format(d, 'yyyy-MM-dd')
      list.push({
        key,
        date: d,
        tss: tssByDay.get(key) ?? 0,
        future: d.getTime() > today.getTime(),
      })
    }

    // Month labels per week (column). Show label only on the first column of
    // a new month.
    const labels: Array<{ col: number; label: string }> = []
    let lastMonth = -1
    for (let w = 0; w < HEATMAP_WEEKS; w += 1) {
      const firstDay = list[w * 7]?.date
      if (!firstDay) continue
      if (firstDay.getMonth() !== lastMonth) {
        labels.push({ col: w, label: format(firstDay, 'MMM', locale === 'de' ? { locale: de } : undefined) })
        lastMonth = firstDay.getMonth()
      }
    }

    const trainedDays = list.filter((c) => c.tss > 0).length

    return { cells: list, totalDays: trainedDays, weekLabels: labels }
  }, [activities, sport, locale])

  function intensity(tss: number): number {
    // 0 = empty, 1–4 = scaled buckets. Tuned for typical endurance loads.
    if (tss <= 0) return 0
    if (tss < 30) return 1
    if (tss < 70) return 2
    if (tss < 120) return 3
    return 4
  }

  function cellStyle(tss: number, future: boolean): React.CSSProperties {
    if (future) {
      return {
        backgroundColor: 'transparent',
        border: '1px solid var(--color-rule)',
      }
    }
    const lvl = intensity(tss)
    if (lvl === 0) {
      return {
        backgroundColor: 'color-mix(in srgb, var(--color-rule) 60%, transparent)',
      }
    }
    const opacity = 0.25 + lvl * 0.18 // 0.43 … 0.97
    return {
      backgroundColor: `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`,
    }
  }

  return (
    <div
      className="rounded-[20px] px-5 py-5 sm:px-6 sm:py-6"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays size={13} strokeWidth={2} style={{ color }} />
          <span
            className="eyebrow"
            style={{
              color: 'var(--color-ink)',
              letterSpacing: '0.28em',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {locale === 'de' ? 'Trainingsserie · letzte 13 Wochen' : 'Training streak · last 13 weeks'}
          </span>
        </div>
        <span
          className="num-mono text-[11px]"
          style={{ color: 'var(--color-muted)' }}
        >
          {locale === 'de'
            ? `${totalDays} aktive ${totalDays === 1 ? 'Tag' : 'Tage'}`
            : `${totalDays} active ${totalDays === 1 ? 'day' : 'days'}`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1 min-w-full">
          {/* Month labels row */}
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${HEATMAP_WEEKS}, minmax(12px, 1fr))`,
              paddingLeft: 18,
            }}
          >
            {Array.from({ length: HEATMAP_WEEKS }).map((_, w) => {
              const lbl = weekLabels.find((l) => l.col === w)
              return (
                <div
                  key={w}
                  className="num-mono"
                  style={{
                    fontSize: 9,
                    color: 'var(--color-muted)',
                    letterSpacing: '0.08em',
                    height: 12,
                  }}
                >
                  {lbl?.label ?? ''}
                </div>
              )
            })}
          </div>

          {/* Grid: row = weekday (Sun..Sat), col = week */}
          <div className="flex gap-1">
            {/* Weekday gutter */}
            <div className="flex flex-col gap-1 pr-1 select-none" style={{ width: 14 }}>
              {['', 'M', '', 'W', '', 'F', ''].map((d, i) => (
                <div
                  key={i}
                  className="num-mono"
                  style={{
                    fontSize: 9,
                    color: 'var(--color-muted)',
                    height: 'clamp(10px, 1.8vw, 14px)',
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {d}
                </div>
              ))}
            </div>

            <div
              className="grid gap-1 flex-1"
              style={{
                gridTemplateColumns: `repeat(${HEATMAP_WEEKS}, minmax(12px, 1fr))`,
                gridTemplateRows: 'repeat(7, clamp(10px, 1.8vw, 14px))',
                gridAutoFlow: 'column',
              }}
            >
              {cells.map((c) => {
                const dfOpts = locale === 'de' ? { locale: de } : undefined
                const title = c.future
                  ? format(c.date, 'EEE, MMM d', dfOpts)
                  : c.tss > 0
                    ? `${format(c.date, 'EEE, MMM d', dfOpts)} — ${Math.round(c.tss)} TSS`
                    : `${format(c.date, 'EEE, MMM d', dfOpts)} — ${locale === 'de' ? 'Pause' : 'rest'}`
                return (
                  <div
                    key={c.key}
                    title={title}
                    className="rounded-[3px]"
                    style={{
                      ...cellStyle(c.tss, c.future),
                      width: '100%',
                      height: '100%',
                    }}
                  />
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div
            className="flex items-center justify-end gap-1.5 mt-3"
            style={{ fontSize: 10, color: 'var(--color-muted)' }}
          >
            <span className="num-mono" style={{ letterSpacing: '0.08em' }}>
              {locale === 'de' ? 'Weniger' : 'Less'}
            </span>
            {[0, 1, 2, 3, 4].map((lvl) => {
              const opacity = lvl === 0 ? 0 : 0.25 + lvl * 0.18
              return (
                <div
                  key={lvl}
                  className="rounded-[3px]"
                  style={{
                    width: 11,
                    height: 11,
                    backgroundColor:
                      lvl === 0
                        ? 'color-mix(in srgb, var(--color-rule) 60%, transparent)'
                        : `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`,
                  }}
                />
              )
            })}
            <span className="num-mono" style={{ letterSpacing: '0.08em' }}>
              {locale === 'de' ? 'Mehr' : 'More'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function AiCoachNote({ sport, hasData }: { sport: Sport; hasData: boolean }) {
  const { locale } = useLocale()
  const meta = SPORT_META[sport]
  const note = hasData
    ? sport === 'cycling'
      ? (locale === 'de'
          ? 'Bitte The Coach um einen VO2-max-Block (4×4 Min bei 110–115% FTP) — Studien zeigen, dass 6–8 Einheiten die größten Fortschritte bringen. ⌘K zum Chatten.'
          : 'Ask The Coach for a VO2 max block (4×4 min at 110–115% FTP) — research shows 6–8 sessions drive the largest gains. ⌘K to chat.')
      : (locale === 'de'
          ? 'Bitte The Coach um einen 4×4-VO2-Lauf (Hügel oder flach bei 95% max. HF). Auch norwegische Sub-Threshold-Doubles funktionieren gut. ⌘K zum Chatten.'
          : 'Ask The Coach for a 4×4 VO2 run (hills or flat at 95% max HR). Norwegian sub-threshold doubles work well too. ⌘K to chat.')
    : sport === 'cycling'
      ? (locale === 'de'
          ? 'Verbinde Garmin und logge eine Fahrt, um personalisiertes VO2-Coaching freizuschalten.'
          : 'Connect Garmin and log a ride to unlock personalized VO2 coaching.')
      : (locale === 'de'
          ? 'Verbinde Garmin und logge einen Lauf, um personalisiertes VO2-Coaching freizuschalten.'
          : 'Connect Garmin and log a run to unlock personalized VO2 coaching.')
  return (
    <div
      className="rounded-[16px] px-5 py-4"
      style={{
        backgroundColor: 'transparent',
        border: `1px dashed color-mix(in srgb, ${meta.color} 28%, var(--color-rule))`,
      }}
    >
      <div className="flex items-start gap-2">
        <Zap size={13} strokeWidth={2} style={{ color: meta.color, marginTop: 3 }} />
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: 'var(--color-ink)', maxWidth: '58ch' }}
        >
          {note}
        </p>
      </div>
    </div>
  )
}

export default function SportTab({ sport }: { sport: Sport }) {
  const { locale } = useLocale()
  const today = new Date()
  const start = subDays(today, 90)
  const { data: actsData } = useActivitiesRange(start, today)
  const { data: profile } = useAthleteProfile()
  const meta = SPORT_META[sport]

  const activities = actsData?.activities ?? []
  const cyc = useMemo(() => cyclingStats(activities), [activities])
  const run = useMemo(() => runningStats(activities), [activities])

  const stats = sport === 'cycling' ? cyc : run
  const hasData = sport === 'cycling' ? cyc.totalSessions > 0 : run.totalSessions > 0

  const totalKm = useCountUp(Math.round(stats.totalKm), { duration: 900, enabled: true })

  return (
    <div className="flex flex-col gap-6 min-w-0">

      {/* ── ABOVE THE FOLD: 3 primitives ── */}

      {/* 1. State — sport-specific VO2 max composite score */}
      <VO2MaxEstimate sport={sport} />

      {/* 2. Trajectory — sport-filtered CTL trend sentence */}
      <TrajectorySentence sport={sport} />

      {/* 3. Prescription — coach brief (sport-unfiltered for v1; see TODO in header) */}
      <CoachBrief />

      {/* ── BELOW THE FOLD: everything else, collapsed by default ── */}
      <DashboardSection
        id={`sport-${sport}-deep-dive`}
        title={locale === 'de' ? `${sportLabel(sport, locale)} im Detail` : `${meta.label} deep-dive`}
        subtitle={locale === 'de' ? 'Statistiken, Serie, letzte Aktivitäten, Ziele' : 'Stats, streak, recent activities, goals'}
        defaultExpanded={false}
      >
        <div className="flex flex-col gap-6 mt-2">
          {/* Editorial hero — demoted from top of tab per phase 7.05 principle */}
          <div
            className="paper-grain rounded-[22px] px-6 py-7 sm:px-8 sm:py-9 relative overflow-hidden"
            style={{
              backgroundColor: 'var(--color-paper-2)',
              border: `1px solid color-mix(in srgb, ${meta.color} 25%, var(--color-rule))`,
              backgroundImage: `
                radial-gradient(100% 70% at 0% 0%, color-mix(in srgb, ${meta.color} 14%, transparent), transparent 55%),
                radial-gradient(60% 50% at 100% 100%, color-mix(in srgb, ${meta.color} 5%, transparent), transparent 60%)
              `,
            }}
          >
            <div className="flex items-center gap-2 mb-5">
              <span
                className="inline-flex items-center justify-center w-8 h-8 rounded-full"
                style={{
                  backgroundColor: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
                  color: meta.color,
                }}
              >
                {meta.icon}
              </span>
              <span
                className="eyebrow"
                style={{
                  color: 'var(--color-ink)',
                  letterSpacing: '0.28em',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {sportLabel(sport, locale)} · {locale === 'de' ? 'letzte 90 Tage' : 'last 90 days'}
              </span>
            </div>

            <h1
              className="leading-[0.95]"
              style={{
                fontFamily: '"Fraunces", serif',
                fontStyle: 'italic',
                fontVariationSettings: '"opsz" 144, "SOFT" 50, "wght" 400',
                fontSize: 'clamp(34px, 5vw, 56px)',
                color: 'var(--color-ink)',
                letterSpacing: '-0.02em',
                maxWidth: '22ch',
              }}
            >
              {locale === 'de'
                ? (sport === 'cycling'
                    ? 'Jedes Watt ist verdient. Jede Fahrt summiert sich.'
                    : 'Aerobe Ökonomie baut man in Monaten auf, verliert sie in Wochen.')
                : meta.tagline}
            </h1>
          </div>

          {/* Stat grid — sport-specific */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={locale === 'de' ? 'DISTANZ · 90T' : 'DISTANCE · 90D'}
              value={totalKm}
              unit="km"
              subtitle={locale === 'de' ? `${stats.totalSessions} Einheiten` : `${stats.totalSessions} sessions`}
              icon={<TrendingUp size={13} strokeWidth={2} />}
              color={meta.color}
            />
            <StatCard
              label={locale === 'de' ? 'BELASTUNG · 90T' : 'LOAD · 90D'}
              value={stats.totalTSS}
              unit="TSS"
              subtitle={locale === 'de' ? 'Gesamtbelastung' : 'total stress'}
              icon={<Flame size={13} strokeWidth={2} />}
              color={meta.color}
            />
            {sport === 'cycling' ? (
              <>
                <StatCard
                  label={locale === 'de' ? 'SPITZEN-NP' : 'PEAK NP'}
                  value={Math.round(cyc.peakNP) || '—'}
                  unit="W"
                  subtitle={locale === 'de' ? 'beste Leistung' : 'best effort'}
                  icon={<Zap size={13} strokeWidth={2} />}
                  color={meta.color}
                />
                <StatCard
                  label={locale === 'de' ? 'LÄNGSTE FAHRT' : 'LONGEST RIDE'}
                  value={cyc.longestRide ? `${(cyc.longestRide / 1000).toFixed(0)}` : '—'}
                  unit="km"
                  subtitle={locale === 'de' ? 'deine weiteste' : 'your furthest'}
                  icon={<Trophy size={13} strokeWidth={2} />}
                  color={meta.color}
                />
              </>
            ) : (
              <>
                <StatCard
                  label={locale === 'de' ? 'SCHNELLSTE PACE' : 'FASTEST PACE'}
                  value={run.fastestPace ? formatPaceMinPerKm(run.fastestPace) : '—'}
                  unit="/km"
                  subtitle={locale === 'de' ? '≥ 3 km Einheit' : '≥ 3 km effort'}
                  icon={<Zap size={13} strokeWidth={2} />}
                  color={meta.color}
                />
                <StatCard
                  label={locale === 'de' ? 'LÄNGSTER LAUF' : 'LONGEST RUN'}
                  value={run.longestRun ? `${(run.longestRun / 1000).toFixed(1)}` : '—'}
                  unit="km"
                  subtitle={locale === 'de' ? 'deine weiteste' : 'your furthest'}
                  icon={<Trophy size={13} strokeWidth={2} />}
                  color={meta.color}
                />
              </>
            )}
          </div>

          {/* Training streak — GitHub-style heatmap of training days */}
          <TrainingHeatmap sport={sport} activities={activities} color={meta.color} />

          {/* Recent rides / runs from Garmin */}
          <RecentActivities
            sport={sport}
            windowDays={30}
            limit={8}
            heading={locale === 'de'
              ? (sport === 'cycling' ? 'Letzte Fahrten' : 'Letzte Läufe')
              : (sport === 'cycling' ? 'Recent rides' : 'Recent runs')}
          />

          {/* Goal */}
          <GoalCard sport={sport} profile={profile} />

          {/* AI coaching note */}
          <AiCoachNote sport={sport} hasData={hasData} />
        </div>
      </DashboardSection>
    </div>
  )
}
