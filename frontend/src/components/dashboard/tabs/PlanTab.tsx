/**
 * PlanTab (Train) — rebuilt 1:1 from pencil-new.pen "Screen · Train" (oww6S).
 * Card order matches the .pen: SportToggle → PlanCard → WeekStrip →
 * WorkoutOfDay (coral, interval-profile bars + chips + Start) → Upcoming →
 * PowerZones (Power/Pace toggle, Z1–Z7) → Cross-training.
 * Real week-plan, FTP, and activity data throughout.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { subDays, format, parseISO } from 'date-fns'
import { Bike, Footprints, Infinity as InfinityIcon, Play, Check, Dumbbell, Plus, Clock, Zap, Target, Heart, Info, ChevronRight, Moon } from 'lucide-react'
import { useCurrentWeek } from '../../../hooks/useCurrentWeek'
import { useCoachBrief } from '../../../hooks/useCoachBrief'
import { useAthleteProfile } from '../../../hooks/useAthleteProfile'
import { useActivitiesRange } from '../../../hooks/useActivitiesRange'
import { useLocale } from '../../../contexts/LocaleContext'
import { detectWorkoutSport } from '../../../api/coach'
import type { ResolvedBlock, WorkoutSport } from '../../../api/coach'
import type { DayPlan } from '../../../api/weeks'

type Sport = 'bike' | 'run' | 'all'
type ZoneMode = 'power' | 'pace' | 'hr'
const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

// Per-sport visual identity (icon + accent + de/en label).
const SPORT_META: Record<WorkoutSport, { Icon: typeof Bike; en: string; de: string; color: string }> = {
  cycling: { Icon: Bike, en: 'Bike', de: 'Rad', color: 'var(--color-strain)' },
  running: { Icon: Footprints, en: 'Run', de: 'Lauf', color: 'var(--color-exercise)' },
  gym: { Icon: Dumbbell, en: 'Strength', de: 'Kraft', color: 'var(--color-amber)' },
}

// Friel-style running zones — HR as %LTHR(run), pace as %threshold-pace (speed).
const RUN_HR = [
  { z: 'Z1', en: 'Recovery', de: 'Erholung', lo: 0, hi: 0.85, color: 'var(--color-recovery)' },
  { z: 'Z2', en: 'Endurance', de: 'Grundlage', lo: 0.85, hi: 0.90, color: 'var(--color-stand)' },
  { z: 'Z3', en: 'Tempo', de: 'Tempo', lo: 0.90, hi: 0.94, color: 'var(--color-strain)' },
  { z: 'Z4', en: 'Threshold', de: 'Schwelle', lo: 0.94, hi: 1.00, color: 'var(--color-accent)' },
  { z: 'Z5', en: 'VO₂ Max', de: 'VO₂max', lo: 1.00, hi: 0, color: 'var(--color-amber)' },
]
const RUN_PACE = [
  { z: 'Z1', en: 'Recovery', de: 'Erholung', lo: 0, hi: 0.76, color: 'var(--color-recovery)' },
  { z: 'Z2', en: 'Endurance', de: 'Grundlage', lo: 0.76, hi: 0.87, color: 'var(--color-stand)' },
  { z: 'Z3', en: 'Tempo', de: 'Tempo', lo: 0.87, hi: 0.94, color: 'var(--color-strain)' },
  { z: 'Z4', en: 'Threshold', de: 'Schwelle', lo: 0.94, hi: 1.00, color: 'var(--color-accent)' },
  { z: 'Z5', en: 'VO₂ Max', de: 'VO₂max', lo: 1.00, hi: 1.06, color: 'var(--color-amber)' },
]
const fmtPace = (sPerKm: number) => `${Math.floor(sPerKm / 60)}:${String(Math.round(sPerKm % 60)).padStart(2, '0')}`

// Coggan 7-zone power bands (%FTP) + .pen swatch colors.
const COGGAN = [
  { z: 'Z1', name_en: 'Active Recovery', name_de: 'Aktive Erholung', lo: 0, hi: 0.55, color: 'var(--color-recovery)' },
  { z: 'Z2', name_en: 'Endurance', name_de: 'Grundlage', lo: 0.56, hi: 0.75, color: 'var(--color-stand)' },
  { z: 'Z3', name_en: 'Tempo', name_de: 'Tempo', lo: 0.76, hi: 0.90, color: 'var(--color-strain)' },
  { z: 'Z4', name_en: 'Threshold', name_de: 'Schwelle', lo: 0.91, hi: 1.05, color: 'var(--color-accent)' },
  { z: 'Z5', name_en: 'VO₂ Max', name_de: 'VO₂max', lo: 1.06, hi: 1.20, color: 'var(--color-amber)' },
  { z: 'Z6', name_en: 'Anaerobic', name_de: 'Anaerob', lo: 1.21, hi: 1.50, color: 'var(--color-move)' },
  { z: 'Z7', name_en: 'Neuromuscular', name_de: 'Neuromuskulär', lo: 1.51, hi: 0, color: 'var(--color-exercise)' },
]

function zoneBarColor(z: number): string {
  if (z <= 1) return 'var(--color-surface-3)'
  if (z <= 3) return 'var(--color-strain)'
  if (z === 4) return 'var(--color-accent)'
  if (z === 5) return 'var(--color-amber)'
  return 'var(--color-move)'
}

export default function PlanTab() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const [sport, setSport] = useState<Sport>('bike')
  const [zoneMode, setZoneMode] = useState<ZoneMode>('power')
  // The zones card follows the active sport: run → pace/HR by default, else power.
  useEffect(() => { setZoneMode(sport === 'run' ? 'pace' : 'power') }, [sport])
  const today = useMemo(() => new Date(), [])
  const todayStr = useMemo(() => format(today, 'yyyy-MM-dd'), [today])
  // Which day of the week strip is expanded inline below it (default = today).
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const { data: week } = useCurrentWeek()
  const { data: brief } = useCoachBrief()
  const { data: profile } = useAthleteProfile()
  const { data: acts } = useActivitiesRange(useMemo(() => subDays(today, 8), [today]), today)

  const ftp = profile?.ftp_watts ?? null
  const lthrRun = profile?.lthr_running ?? null
  const thrPaceSPerKm = profile?.running_threshold_pace_ms ? 1000 / profile.running_threshold_pace_ms : null
  const meso = week?.meso_block
  const days = week?.days ?? []
  // Inline day panel — the day the user tapped in the strip.
  const selDay = days.find((d) => d.date === selectedDate) ?? null
  const selectedIsToday = selDay?.is_today ?? (selectedDate === todayStr)
  const workout = brief?.prescribed_workout
  const evidence = (brief?.evidence as Record<string, unknown> | undefined) ?? {}
  const goalName = (evidence.athlete as Record<string, unknown> | undefined)?.goal_target as string | undefined

  const weekStart = week?.week_start ? parseISO(week.week_start) : subDays(today, 7)
  const trainedDays = useMemo(() => new Set((acts?.activities ?? []).filter((a) => (a.tss ?? 0) > 0).map((a) => (a.started_at ?? a.date ?? '').slice(0, 10))), [acts])
  // One matcher for both plan-day sports ('cycling'/'running'/'gym') and activity sports.
  const sportMatch = (s: string) => sport === 'all' || (sport === 'bike' && s === 'cycling') || (sport === 'run' && s === 'running')
  // Everything below is scoped to the toggle so the page never shows one sport's
  // numbers under another's label. 'all' → the combined week.
  const sportDays = useMemo(() => days.filter((d) => sportMatch(d.sport)), [days, sport])
  const sportSessions = sportDays.filter((d) => d.category !== 'rest')
  const upcoming = sportDays.filter((d) => d.category !== 'rest' && !d.is_today && parseISO(d.date) >= today)
  const hasSportSessions = sportSessions.length > 0
  const sportWord = sport === 'bike' ? (de ? 'Rad' : 'Bike') : sport === 'run' ? (de ? 'Lauf' : 'Run') : (de ? 'Alle' : 'All')

  // Plan card — real aggregates, scoped to the selected discipline.
  const weeksLeft = meso?.days_to_event != null ? Math.max(0, Math.ceil(meso.days_to_event / 7)) : null
  const weekHours = sportDays.reduce((s, d) => s + (d.duration_seconds_target ?? 0), 0) / 3600
  const sessionCount = sportSessions.length
  // Sport-specific TSS target = this sport's planned days; 'all' prefers the meso figure.
  const sportTargetTss = sportDays.reduce((s, d) => s + (d.target_tss ?? 0), 0)
  const weeklyTarget = sport === 'all' ? (meso?.weekly_tss_target ?? sportTargetTss) : sportTargetTss
  const weeklyDone = useMemo(() => (acts?.activities ?? [])
    .filter((a) => sportMatch(a.sport ?? '') && parseISO(a.started_at ?? a.date ?? '') >= weekStart)
    .reduce((s, a) => s + (a.tss ?? 0), 0), [acts, sport, weekStart])
  const progressPct = weeklyTarget > 0 ? Math.min(100, (weeklyDone / weeklyTarget) * 100) : 0
  const phaseLabel = meso?.phase ? meso.phase.replace(/([a-z])(\d)/i, '$1 $2').replace(/^\w/, (c) => c.toUpperCase()) : (de ? 'Grundlage' : 'Base')
  const planName = goalName ?? (de ? 'Trainingsplan' : 'Training Plan')

  // Workout-of-day — detect sport so meta/chips/profile follow the discipline.
  const wodSport = workout ? detectWorkoutSport(workout) : 'cycling'
  const wodMeta = SPORT_META[wodSport]
  // The WOD hero only shows when today's prescribed session matches the toggle.
  const wodMatches = !!workout && sportMatch(wodSport)
  const blocks = workout?.blocks ?? []
  // Peak = highest-zone block (tie → highest %FTP); works for runs w/o watts too.
  const peakBlock = blocks.reduce<ResolvedBlock | null>((m, b) => {
    if (!m) return b
    if (b.zone > m.zone) return b
    if (b.zone === m.zone && b.target_pct_ftp > m.target_pct_ftp) return b
    return m
  }, null)
  // Bar height fraction: watts→%FTP for bike; zone-share for run/gym (no watts).
  const barFrac = (b: ResolvedBlock) => b.target_pct_ftp > 0 ? Math.min(1, b.target_pct_ftp / 1.25) : Math.min(1, b.zone / 7)
  const wodDur = workout ? `${Math.floor(workout.duration_minutes / 60)}h ${workout.duration_minutes % 60}m` : ''
  // Pace chip for a running WOD — derive from the peak block's zone + threshold pace.
  const wodPaceChip = wodSport === 'running' && thrPaceSPerKm != null && peakBlock
    ? `${fmtPace(thrPaceSPerKm / RUN_PACE[Math.min(RUN_PACE.length - 1, Math.max(0, peakBlock.zone - 1))].hi)} /km`
    : null
  // Sport-appropriate "peak" chip label for the WOD hero.
  const peakChip = peakBlock ? (
    wodSport === 'cycling'
      ? `Z${peakBlock.zone} · ${peakBlock.target_watts_low}–${peakBlock.target_watts_high}W`
      : wodSport === 'running'
        ? [wodPaceChip, `Z${peakBlock.zone}`,
            peakBlock.target_hr_low != null && peakBlock.target_hr_high != null
              ? `${peakBlock.target_hr_low}–${peakBlock.target_hr_high} bpm`
              : (wodPaceChip ? null : `RPE ${peakBlock.rpe}`)].filter(Boolean).join(' · ')
        : `RPE ${peakBlock.rpe}`
  ) : null

  // Cross-training — this-week strength sessions.
  const STRENGTH_TARGET = 2
  const strengthDone = useMemo(() => (acts?.activities ?? []).filter((a) => a.sport === 'gym' && parseISO(a.started_at ?? a.date ?? '') >= weekStart).length, [acts, weekStart])

  const fmtDur = (s: number | null) => s == null ? '' : s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : `${Math.round(s / 60)} min`

  // ── Per-session sport-specific meta derivation (Upcoming rows) ──
  // Category → representative zone when a session carries no interval blocks.
  const CAT_ZONE: Record<string, number> = { recovery: 1, endurance: 2, tempo: 3, sweet_spot: 4, threshold: 4, vo2: 5 }
  const cap = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  // Peak interval — highest zone (tie → highest %FTP). Drives bike watts + zone.
  const peakInterval = (ivs: DayPlan['intervals']) => ivs.reduce<DayPlan['intervals'][number] | null>((m, b) => {
    if (!m) return b
    if (b.zone > m.zone) return b
    if (b.zone === m.zone && (b.power_target_pct_ftp ?? 0) > (m.power_target_pct_ftp ?? 0)) return b
    return m
  }, null)
  // Dominant zone — most time-in-zone. Drives run pace/HR framing.
  const dominantZone = (ivs: DayPlan['intervals']): number | null => {
    if (!ivs.length) return null
    const acc = new Map<number, number>()
    ivs.forEach((b) => acc.set(b.zone, (acc.get(b.zone) ?? 0) + b.duration_seconds))
    return [...acc.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }
  // Run pace range for a zone, from threshold pace + RUN_PACE bands.
  const runPaceForZone = (z: number): string | null => {
    if (thrPaceSPerKm == null) return null
    const band = RUN_PACE[Math.min(RUN_PACE.length - 1, Math.max(0, z - 1))]
    const faster = fmtPace(thrPaceSPerKm / band.hi)
    const slower = band.lo > 0 ? fmtPace(thrPaceSPerKm / band.lo) : null
    return slower ? `${faster}–${slower}` : `>${faster}`
  }
  // Run HR range for a zone, from LTHR + RUN_HR bands.
  const runHrForZone = (z: number): string | null => {
    if (lthrRun == null) return null
    const band = RUN_HR[Math.min(RUN_HR.length - 1, Math.max(0, z - 1))]
    const lo = Math.round(band.lo * lthrRun)
    const hi = band.hi > 0 ? Math.round(band.hi * lthrRun) : null
    return hi ? `${lo}–${hi}` : `${lo}+`
  }
  // Secondary meta line, framed by discipline: bike→watts, run→pace/HR, gym→focus.
  const sessionMeta = (d: DayPlan): string => {
    if (d.sport === 'gym') {
      return [d.category && d.category !== 'rest' ? cap(d.category) : null, de ? 'Kraft' : 'Strength'].filter(Boolean).join(' · ')
    }
    if (d.sport === 'running') {
      const z = dominantZone(d.intervals) ?? CAT_ZONE[d.category] ?? 2
      const pace = runPaceForZone(z)
      const hr = runHrForZone(z)
      const parts = pace
        ? [`${pace} /km`, `Z${z}`]
        : hr
          ? [`Z${z}`, `${hr} bpm`]
          : [`Z${z}`, cap(d.category)]
      return parts.filter(Boolean).join(' · ')
    }
    // cycling → peak watts + zone + TSS
    const pk = peakInterval(d.intervals)
    const z = pk?.zone ?? CAT_ZONE[d.category] ?? 2
    const watts = ftp != null && pk?.power_target_pct_ftp ? `${Math.round(pk.power_target_pct_ftp * ftp)} W` : null
    return [watts, `Z${z}`, d.target_tss ? `${Math.round(d.target_tss)} TSS` : null].filter(Boolean).join(' · ')
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      {/* Sport toggle */}
      <div className="flex gap-1 rounded-full p-1" style={cardStyle}>
        {([['bike', Bike, de ? 'Rad' : 'Bike'], ['run', Footprints, de ? 'Lauf' : 'Run'], ['all', InfinityIcon, de ? 'Alle' : 'All']] as const).map(([s, Icon, label]) => (
          <button key={s} type="button" onClick={() => setSport(s)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full py-2.5"
            style={{ background: sport === s ? 'var(--color-accent)' : 'transparent', color: sport === s ? '#FFFFFF' : 'var(--color-ink-2)', fontSize: 14, fontWeight: 600 }}>
            <Icon size={18} strokeWidth={2} /> {label}
          </button>
        ))}
      </div>

      {/* Plan card → Load & Form drill-down */}
      <Link to="/load-form" className="rounded-[24px] p-5 hover-card flex flex-col gap-4" style={cardStyle}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-muted)' }}>{de ? 'TRAININGSPLAN' : 'TRAINING PLAN'}{sport !== 'all' ? ` · ${sportWord}` : ''}</span>
            <span className="num-display truncate" style={{ fontSize: 20, color: 'var(--color-ink)' }}>{planName}</span>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1">
            <span className="inline-flex items-center rounded-full px-3 py-1.5" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)', fontSize: 12, fontWeight: 700 }}>{phaseLabel}</span>
            <span className="hover-arrow"><ChevronRight size={16} style={{ color: 'var(--color-muted)' }} /></span>
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: 'var(--color-surface-2)', overflow: 'hidden' }}>
          <div style={{ width: `${progressPct}%`, height: '100%', borderRadius: 999, background: 'var(--color-accent)' }} />
        </div>
        <div className="flex">
          {[
            [weeksLeft != null ? `${weeksLeft}` : '—', de ? 'Wochen übrig' : 'Weeks left'],
            [weekHours > 0 ? `${weekHours.toFixed(1)}h` : '—', de ? 'Wochenstunden' : 'Week hours'],
            [`${sessionCount}`, de ? 'Einheiten' : 'Sessions'],
          ].map(([v, l], i) => (
            <div key={i} className="flex-1 flex flex-col gap-0.5">
              <span className="num-display" style={{ fontSize: 20, color: 'var(--color-ink)' }}>{v}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{l}</span>
            </div>
          ))}
        </div>
      </Link>

      {/* Week strip */}
      {days.length > 0 && (
        <div className="flex gap-1.5">
          {days.map((d) => {
            const dd = parseISO(d.date)
            const done = trainedDays.has(d.date.slice(0, 10))
            const isToday = d.is_today
            const isSelected = d.date === selectedDate
            const rest = d.category === 'rest'
            // Days outside the selected discipline fade back so the strip reads as this sport's week.
            const offSport = !rest && !sportMatch(d.sport)
            const dotColor = d.sport === 'running' ? 'var(--color-exercise)' : d.sport === 'gym' ? 'var(--color-amber)' : 'var(--color-strain)'
            const dark = isSelected
            return (
              <button key={d.date} type="button" onClick={() => setSelectedDate(d.date)}
                className="flex-1 flex flex-col items-center gap-1.5 rounded-2xl py-2.5 transition-colors"
                style={{
                  background: isSelected ? 'var(--color-accent)' : 'var(--color-paper-2)',
                  border: isSelected ? 'none' : isToday ? '1px solid var(--color-accent)' : '1px solid var(--color-rule)',
                  opacity: offSport && !isSelected ? 0.4 : 1,
                }}>
                <span className="eyebrow" style={{ fontSize: 10, fontWeight: 600, color: dark ? 'rgba(10,12,15,0.65)' : isToday ? 'var(--color-accent)' : 'var(--color-muted)' }}>{format(dd, 'EEE')}</span>
                <span className="num-display" style={{ fontSize: 15, color: dark ? '#0A0C0F' : 'var(--color-ink)' }}>{format(dd, 'd')}</span>
                {done ? <Check size={14} strokeWidth={3} style={{ color: dark ? '#0A0C0F' : 'var(--color-recovery)' }} />
                  : <span style={{ width: 7, height: 7, borderRadius: 999, background: dark ? '#0A0C0F' : rest || offSport ? 'var(--color-surface-3)' : dotColor }} />}
              </button>
            )
          })}
        </div>
      )}

      {/* Workout of day (coral) — today selected + today's session matches the sport */}
      {selectedIsToday && workout && wodMatches && (
        <div className="rounded-[24px] p-5 flex flex-col gap-4"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-accent)', boxShadow: '0 10px 28px -10px color-mix(in srgb, var(--color-accent) 40%, transparent)' }}>
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center rounded-full px-3 py-1.5" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>{de ? 'EINHEIT DES TAGES' : 'WORKOUT OF THE DAY'}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: 'var(--color-surface-3)', fontSize: 12, color: 'var(--color-ink-2)' }}><wodMeta.Icon size={13} style={{ color: wodMeta.color }} /> {de ? wodMeta.de : wodMeta.en}</span>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="num-display" style={{ fontSize: 24, color: 'var(--color-ink)' }}>{workout.title}</h2>
            {workout.why_this_workout && <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{workout.why_this_workout}</p>}
          </div>

          {/* Effort profile — power bars for bike, HR/pace-zone bars for run,
              movements list for gym (no power/pace bar chart). */}
          {blocks.length > 0 && wodSport !== 'gym' && (
            <div className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ background: 'var(--color-paper)' }}>
              <div className="flex items-center justify-between">
                <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-ink-2)' }}>
                  {wodSport === 'running' ? (de ? 'PACE-/HF-PROFIL' : 'PACE / HR PROFILE') : (de ? 'LEISTUNGSPROFIL' : 'POWER PROFILE')}
                </span>
                {wodSport === 'cycling' && ftp != null && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>FTP {ftp}W</span>}
                {wodSport === 'running' && lthrRun != null && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>LTHR {lthrRun} bpm</span>}
              </div>
              <div className="flex items-end gap-[3px]" style={{ height: 96 }}>
                {blocks.map((b, i) => (
                  <div key={i} className="flex-1 rounded-t"
                    style={{ height: `${Math.max(14, Math.min(96, barFrac(b) * 96))}px`, background: zoneBarColor(b.zone) }} />
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-ink-2)' }}>{blocks[0]?.name ?? ''}</span>
                {peakChip && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-ink-2)' }}>{peakChip}</span>}
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-ink-2)' }}>{blocks[blocks.length - 1]?.name ?? ''}</span>
              </div>
            </div>
          )}
          {/* Gym — movements/blocks framing instead of a power chart. */}
          {blocks.length > 0 && wodSport === 'gym' && (
            <div className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ background: 'var(--color-paper)' }}>
              <div className="flex items-center justify-between">
                <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-ink-2)' }}>{de ? 'ÜBUNGEN' : 'MOVEMENTS'}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>{blocks.length} {de ? 'Blöcke' : 'blocks'}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {blocks.map((b, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span style={{ width: 3, height: 20, borderRadius: 2, background: 'var(--color-amber)' }} />
                    <span className="flex-1 min-w-0 truncate" style={{ fontSize: 12, color: 'var(--color-ink)' }}>{b.name}</span>
                    <span className="num-mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>{Math.round(b.duration_s / 60)} min · RPE {b.rpe}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hero chips — third chip is sport-appropriate (power / HR / RPE). */}
          <div className="flex gap-2 flex-wrap">
            {([
              { icon: Clock, t: wodDur },
              { icon: Zap, t: `${Math.round(workout.predicted_tss)} TSS` },
              ...(peakChip ? [{ icon: wodSport === 'running' ? Heart : Target, t: peakChip }] : []),
            ]).map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 num-mono" style={{ background: 'var(--color-paper-2)', fontSize: 12, fontWeight: 600, color: 'var(--color-ink)' }}>
                <c.icon size={13} style={{ color: 'var(--color-accent)' }} /> {c.t}
              </span>
            ))}
          </div>

          <Link to="/workout/today" className="inline-flex items-center justify-center gap-2 rounded-full py-3.5 min-h-[48px]" style={{ background: 'var(--color-accent)', color: '#FFFFFF', fontSize: 16, fontWeight: 700 }}>
            <Play size={20} strokeWidth={2.4} fill="#FFFFFF" /> {de ? 'Einheit starten' : 'Start Workout'}
          </Link>
        </div>
      )}

      {/* No matching session today — sport-aware graceful state (never bike data under Lauf) */}
      {selectedIsToday && !(workout && wodMatches) && (
        <div className="rounded-[24px] p-5 flex items-center gap-3.5" style={cardStyle}>
          <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 44, height: 44, background: 'var(--color-surface-2)' }}>
            {sport === 'run' ? <Footprints size={22} strokeWidth={2} style={{ color: 'var(--color-exercise)' }} />
              : sport === 'bike' ? <Bike size={22} strokeWidth={2} style={{ color: 'var(--color-strain)' }} />
              : <InfinityIcon size={22} strokeWidth={2} style={{ color: 'var(--color-muted)' }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>
              {hasSportSessions
                ? (de ? `Heute keine ${sportWord}-Einheit` : `No ${sportWord.toLowerCase()} session today`)
                : (de ? `Keine ${sportWord}-Einheiten geplant` : `No ${sportWord.toLowerCase()} sessions planned`)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>
              {hasSportSessions
                ? (de ? 'Deine nächste steht unten in „Diese Woche“.' : 'Your next one is below in “This Week”.')
                : (de ? 'Wechsle die Sportart oben oder plane eine Einheit.' : 'Switch discipline above or add a session.')}
            </div>
          </div>
        </div>
      )}

      {/* Inline panel for a NON-today day tapped in the strip — no navigation, detail in place. */}
      {!selectedIsToday && (() => {
        const dLabel = format(parseISO(selectedDate), de ? 'EEEE, d. MMM' : 'EEEE, MMM d')
        // Rest day (or a date with no planned session) → friendly rest state.
        if (!selDay || selDay.category === 'rest') {
          return (
            <div className="rounded-[24px] p-5 flex items-center gap-3.5" style={cardStyle}>
              <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 44, height: 44, background: 'var(--color-surface-2)' }}>
                <Moon size={22} strokeWidth={2} style={{ color: 'var(--color-recovery)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{de ? 'Ruhetag' : 'Rest day'}</div>
                <div style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{dLabel} · {de ? 'Erholung & Regeneration' : 'Recovery & regeneration'}</div>
              </div>
            </div>
          )
        }
        const meta = SPORT_META[(selDay.sport as WorkoutSport)] ?? SPORT_META.cycling
        const ivs = selDay.intervals ?? []
        const ivFrac = (iv: DayPlan['intervals'][number]) => iv.power_target_pct_ftp ? Math.min(1, iv.power_target_pct_ftp / 1.25) : Math.min(1, iv.zone / 7)
        return (
          <div className="rounded-[24px] p-5 flex flex-col gap-4" style={cardStyle}>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center rounded-full px-3 py-1.5" style={{ background: 'var(--color-surface-2)', color: 'var(--color-ink-2)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>{de ? 'VORSCHAU' : 'PREVIEW'} · {format(parseISO(selectedDate), 'EEE, d. MMM')}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: 'var(--color-surface-3)', fontSize: 12, color: 'var(--color-ink-2)' }}><meta.Icon size={13} style={{ color: meta.color }} /> {de ? meta.de : meta.en}</span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>{selDay.title}</h2>
              {selDay.rationale && <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{selDay.rationale}</p>}
            </div>

            {/* Effort profile — zone bars from the day's intervals (bike/run). */}
            {ivs.length > 0 && selDay.sport !== 'gym' && (
              <div className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ background: 'var(--color-paper)' }}>
                <div className="flex items-center justify-between">
                  <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-ink-2)' }}>{selDay.sport === 'running' ? (de ? 'PACE-/HF-PROFIL' : 'PACE / HR PROFILE') : (de ? 'LEISTUNGSPROFIL' : 'POWER PROFILE')}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>{ivs.length} {de ? 'Blöcke' : 'blocks'}</span>
                </div>
                <div className="flex items-end gap-[3px]" style={{ height: 72 }}>
                  {ivs.map((iv, i) => (
                    <div key={i} className="flex-1 rounded-t" style={{ height: `${Math.max(12, Math.min(72, ivFrac(iv) * 72))}px`, background: zoneBarColor(iv.zone) }} />
                  ))}
                </div>
              </div>
            )}

            {/* Key targets — mirror the WOD hero chips: duration, TSS, sport-framed peak. */}
            <div className="flex gap-2 flex-wrap">
              {([
                ...(selDay.duration_seconds_target ? [{ icon: Clock, t: fmtDur(selDay.duration_seconds_target) }] : []),
                ...(selDay.target_tss ? [{ icon: Zap, t: `${Math.round(selDay.target_tss)} TSS` }] : []),
                { icon: selDay.sport === 'running' ? Heart : Target, t: sessionMeta(selDay) },
              ]).map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 num-mono" style={{ background: 'var(--color-paper-2)', fontSize: 12, fontWeight: 600, color: 'var(--color-ink)' }}>
                  <c.icon size={13} style={{ color: 'var(--color-accent)' }} /> {c.t}
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{de ? 'Diese Woche' : 'This Week'}</span>
            <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>{upcoming.length} {de ? 'Einheiten' : 'sessions'}</span>
          </div>
          {upcoming.map((d) => {
            const isRun = d.sport === 'running'
            const isGym = d.sport === 'gym'
            const Icon = isGym ? Dumbbell : isRun ? Footprints : Bike
            const col = isGym ? 'var(--color-amber)' : isRun ? 'var(--color-exercise)' : 'var(--color-strain)'
            return (
              <Link key={d.date} to="/workout/today" className="flex flex-col rounded-[20px] p-3.5 hover-card" style={cardStyle}>
                <div className="flex items-center gap-3.5">
                  <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 44, height: 44, background: `color-mix(in srgb, ${col} 18%, transparent)` }}>
                    <Icon size={20} strokeWidth={2} style={{ color: col }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="num-display truncate" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{d.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{sessionMeta(d)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{fmtDur(d.duration_seconds_target)}</span>
                    <span className="num-mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{format(parseISO(d.date), 'EEE')}</span>
                  </div>
                  <span className="hover-arrow"><ChevronRight size={16} style={{ color: 'var(--color-muted)' }} /></span>
                </div>
                <div className="hover-reveal">
                  <div className="flex items-center gap-3 pt-2" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>
                    <span>{sessionMeta(d)}</span>
                    <span>{fmtDur(d.duration_seconds_target)}</span>
                    <span>{format(parseISO(d.date), 'EEEE')}</span>
                    <span className="ml-auto" style={{ fontWeight: 700, color: 'var(--color-accent)' }}>{de ? 'Öffnen →' : 'Open →'}</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Zones — follows the active sport: run → Pace/HR, bike/all → Power/Pace. */}
      <div className="rounded-[24px] p-5 flex flex-col gap-3.5" style={cardStyle}>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>
              {zoneMode === 'power' ? (de ? 'Leistungszonen' : 'Power Zones') : zoneMode === 'hr' ? (de ? 'HF-Zonen' : 'HR Zones') : (de ? 'Pace-Zonen' : 'Pace Zones')}
            </span>
            {zoneMode === 'power' && ftp != null && <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Basis FTP' : 'Based on FTP'} {ftp}W</span>}
            {zoneMode === 'hr' && lthrRun != null && <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Basis LTHR' : 'Based on LTHR'} {lthrRun} bpm</span>}
            {zoneMode === 'pace' && thrPaceSPerKm != null && <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Basis Schwellen-Pace' : 'Based on threshold pace'} {fmtPace(thrPaceSPerKm)}/km</span>}
          </div>
          <div className="flex gap-0.5 rounded-full p-0.5" style={{ background: 'var(--color-surface-2)' }}>
            {(sport === 'run' ? (['pace', 'hr'] as const) : (['power', 'pace'] as const)).map((m) => (
              <button key={m} type="button" onClick={() => setZoneMode(m)} className="rounded-full px-3 py-1.5"
                style={{ background: zoneMode === m ? 'var(--color-accent-soft)' : 'transparent', color: zoneMode === m ? 'var(--color-accent)' : 'var(--color-muted)', fontSize: 12, fontWeight: zoneMode === m ? 700 : 600 }}>
                {m === 'power' ? (de ? 'Leistung' : 'Power') : m === 'hr' ? 'HR' : 'Pace'}
              </button>
            ))}
          </div>
        </div>

        {zoneMode === 'power' && ftp != null ? (
          <div className="flex flex-col gap-3">
            {COGGAN.map((z) => {
              const lo = Math.round(z.lo * ftp)
              const hi = z.hi > 0 ? Math.round(z.hi * ftp) : null
              return (
                <div key={z.z} className="flex items-center gap-2.5">
                  <span style={{ width: 3, height: 26, borderRadius: 2, background: z.color }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)', width: 22 }}>{z.z}</span>
                  <span className="flex-1 min-w-0 truncate" style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>{de ? z.name_de : z.name_en}</span>
                  <span className="num-mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{hi ? `${lo}–${hi}` : `${lo}+`} W</span>
                </div>
              )
            })}
          </div>
        ) : zoneMode === 'power' ? (
          <p style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>{de ? 'Setze deine FTP, um Leistungszonen zu sehen.' : 'Set your FTP to see power zones.'}</p>
        ) : zoneMode === 'hr' && lthrRun != null ? (
          <div className="flex flex-col gap-3">
            {RUN_HR.map((z) => {
              const lo = Math.round(z.lo * lthrRun)
              const hi = z.hi > 0 ? Math.round(z.hi * lthrRun) : null
              return (
                <div key={z.z} className="flex items-center gap-2.5">
                  <span style={{ width: 3, height: 26, borderRadius: 2, background: z.color }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)', width: 22 }}>{z.z}</span>
                  <span className="flex-1 min-w-0 truncate" style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>{de ? z.de : z.en}</span>
                  <span className="num-mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{hi ? `${lo}–${hi}` : `${lo}+`} bpm</span>
                </div>
              )
            })}
          </div>
        ) : zoneMode === 'hr' ? (
          <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{de ? 'HF-Zonen erscheinen, sobald deine Lauf-LTHR erfasst ist.' : 'HR zones appear once your running LTHR is set.'}</p>
        ) : thrPaceSPerKm != null ? (
          <div className="flex flex-col gap-3">
            {RUN_PACE.map((z) => {
              const faster = fmtPace(thrPaceSPerKm / z.hi)
              const slower = z.lo > 0 ? fmtPace(thrPaceSPerKm / z.lo) : null
              return (
                <div key={z.z} className="flex items-center gap-2.5">
                  <span style={{ width: 3, height: 26, borderRadius: 2, background: z.color }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)', width: 22 }}>{z.z}</span>
                  <span className="flex-1 min-w-0 truncate" style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>{de ? z.de : z.en}</span>
                  <span className="num-mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{slower ? `${faster}–${slower}` : `>${faster}`} /km</span>
                </div>
              )
            })}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{de ? 'Pace-Zonen erscheinen, sobald eine Schwellen-Pace aus deinen Läufen erkannt wurde.' : 'Pace zones appear once a threshold pace is detected from your runs.'}</p>
        )}

        <div className="flex items-center gap-2 rounded-[14px] px-3 py-2.5" style={{ background: 'var(--color-surface-2)' }}>
          <Info size={15} style={{ color: 'var(--color-muted)' }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>
            {sport === 'run'
              ? (de ? 'Lauf-Zonen aus Schwellen-Pace & LTHR.' : 'Run zones from threshold pace & LTHR.')
              : (de ? 'Tippe „Pace“ für Lauf-Herzfrequenz & Pace-Zonen.' : 'Tap Pace to view run heart-rate & pace zones.')}
          </span>
        </div>
      </div>

      {/* Fortschritt & Potenzial — a single nav entry (not a second sport picker).
          Follows the toggle: it opens the progression screen for the active discipline. */}
      {(() => {
        const prog = sport === 'run'
          ? { to: '/progress/run', Icon: Footprints, color: 'var(--color-exercise)', label: de ? 'Lauf-Fortschritt' : 'Run progress' }
          : sport === 'all'
            ? { to: '/progress/bike', Icon: InfinityIcon, color: 'var(--color-accent)', label: de ? 'Fortschritt & Potenzial' : 'Progress & potential' }
            : { to: '/progress/bike', Icon: Bike, color: 'var(--color-strain)', label: de ? 'Rad-Fortschritt' : 'Bike progress' }
        return (
          <Link to={prog.to} className="rounded-[24px] p-4 flex items-center gap-3.5 hover-card" style={cardStyle}>
            <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 44, height: 44, background: `color-mix(in srgb, ${prog.color} 18%, transparent)` }}>
              <prog.Icon size={22} strokeWidth={2} style={{ color: prog.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-muted)' }}>{de ? 'FORTSCHRITT & POTENZIAL' : 'PROGRESS & POTENTIAL'}</span>
              <div className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{prog.label}</div>
            </div>
            <span className="hover-arrow"><ChevronRight size={18} style={{ color: 'var(--color-muted)' }} /></span>
          </Link>
        )
      })()}

      {/* Cross-training — strength progress + this-week count */}
      <div className="rounded-[24px] p-4 flex items-center gap-3.5" style={cardStyle}>
        <Link to="/progress/lift" className="shrink-0 grid place-items-center rounded-full hover-card" style={{ width: 44, height: 44, background: 'color-mix(in srgb, var(--color-amber) 18%, transparent)' }}>
          <Dumbbell size={22} strokeWidth={2} style={{ color: 'var(--color-amber)' }} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{de ? 'Krafttraining' : 'Cross-training'}</div>
          <div style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>
            {de
              ? `${strengthDone} von ${STRENGTH_TARGET} Krafteinheiten diese Woche${strengthDone < STRENGTH_TARGET ? ' — dranbleiben.' : ' — stark.'}`
              : `${strengthDone} of ${STRENGTH_TARGET} strength sessions done this week${strengthDone < STRENGTH_TARGET ? ' — keep it up.' : ' — nice.'}`}
          </div>
        </div>
        {strengthDone >= STRENGTH_TARGET ? (
          <span className="shrink-0 grid place-items-center rounded-full" style={{ width: 32, height: 32, background: 'color-mix(in srgb, var(--color-recovery) 18%, transparent)' }}>
            <Check size={16} strokeWidth={3} style={{ color: 'var(--color-recovery)' }} />
          </span>
        ) : (
          <Link to="/workout/today" className="shrink-0 inline-flex items-center gap-1 rounded-full px-4 py-2" style={{ background: 'var(--color-accent)', color: '#FFFFFF', fontSize: 13, fontWeight: 700 }}>
            <Plus size={15} strokeWidth={2.6} /> {de ? 'Add' : 'Add'}
          </Link>
        )}
      </div>
    </div>
  )
}
