/**
 * SeasonView — built against pencil-new.pen "Screen · Season & Race Day"
 * (pTlXd / content n5M7h): Header → Countdown Hero (A-race chip, days-to-go,
 * projected-fitness ring, coach note) → Season Timeline (phase blocks with
 * today marker) → Race Day Plan (draft pacing from CP/W′) → Race-day
 * projection (CTL now → projected, 14-day form band) → Season Goals →
 * Countdown checklist (deterministic from the race date).
 * Every number from existing endpoints — /athletes/me, /weeks/current,
 * /coach/trajectory, /training-load/recovery-eta, /analytics/power-profile.
 * Missing data renders '—' or the card is omitted. No fabricated values.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, ArrowRight, Flag, Gauge, Zap, TrendingUp, Target,
  CheckCircle2, Circle, PencilLine, Mountain, BadgeCheck,
} from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import { useAthleteProfile } from '../hooks/useAthleteProfile'
import { useCurrentWeek } from '../hooks/useCurrentWeek'
import { useGoalTrajectory, GOAL_TRAJECTORY_KEY } from '../hooks/useGoalTrajectory'
import { useRecoveryEta } from '../hooks/useRecoveryEta'
import { usePowerProfile } from '../hooks/usePowerProfile'
import { updateGoals } from '../api/athletes'
import { daysToEvent } from '../utils/loadMetrics'
import { formatDate } from '../utils/format'
import { useLocale } from '../contexts/LocaleContext'

/* ── shared bits ── */

const CARD = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', borderRadius: 24 } as const
const EYEBROW = { fontSize: 11.5, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--color-ink-2)' } as const

function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

const PHASE_META = [
  { key: 'base', en: 'Base', de: 'Basis', color: 'var(--color-strain)' },
  { key: 'build', en: 'Build', de: 'Aufbau', color: 'var(--color-accent)' },
  { key: 'peak', en: 'Peak', de: 'Peak', color: 'var(--color-violet)' },
  { key: 'taper', en: 'Taper', de: 'Taper', color: 'var(--color-recovery)' },
  { key: 'race', en: 'Race', de: 'Rennen', color: 'var(--color-gold)' },
] as const
type PhaseKey = (typeof PHASE_META)[number]['key']

const EVENT_TYPE_LABELS: Record<string, { en: string; de: string }> = {
  fondo: { en: 'Gran Fondo', de: 'Gran Fondo' },
  road_race: { en: 'Road race', de: 'Straßenrennen' },
  crit: { en: 'Criterium', de: 'Kriterium' },
  tt: { en: 'Time trial', de: 'Zeitfahren' },
  climb: { en: 'Hill climb', de: 'Bergzeitfahren' },
  stage_race: { en: 'Stage race', de: 'Etappenrennen' },
  gravel: { en: 'Gravel', de: 'Gravel' },
}

const BLOCK_LABELS: Record<string, { en: string; de: string }> = {
  accumulation: { en: 'Accumulation', de: 'Akkumulation' },
  intensification: { en: 'Intensification', de: 'Intensivierung' },
  realization: { en: 'Realization', de: 'Realisierung' },
  deload: { en: 'Deload', de: 'Deload' },
  recovery: { en: 'Recovery', de: 'Erholung' },
  taper: { en: 'Taper', de: 'Taper' },
}

function prettyMesoPhase(raw: string, de: boolean): string {
  const m = raw.match(/^([a-z]+)(\d+)?$/i)
  const stem = (m?.[1] ?? raw).toLowerCase()
  const num = m?.[2]
  const meta = PHASE_META.find((p) => stem.startsWith(p.key))
  const label = meta ? (de ? meta.de : meta.en) : stem.charAt(0).toUpperCase() + stem.slice(1)
  return num ? `${label} ${num}` : label
}

function mesoToPhaseKey(raw: string | undefined): PhaseKey | null {
  if (!raw) return null
  const stem = raw.toLowerCase()
  for (const p of PHASE_META) if (stem.startsWith(p.key)) return p.key
  return null
}

/* ── page ── */

export default function SeasonView() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()

  // Shared hooks only (audit P0-5): this page previously duplicated every
  // query inline under drifting keys — ['athletes','me'] vs the shared
  // ['athlete','me'], an unparameterized ['weeks','current'], and
  // ['training-load','recovery-eta',14] — plus its own Trajectory type.
  // Every figure now reads the same cache entry as the rest of the app.
  const { data: profile } = useAthleteProfile()
  const { data: week } = useCurrentWeek()
  const { data: traj } = useGoalTrajectory()
  const { data: eta } = useRecoveryEta()
  const { data: power } = usePowerProfile()

  const today = useMemo(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t
  }, [])

  const eventDateStr = traj?.event_date ?? profile?.target_event_date ?? null
  const eventDate = eventDateStr ? parseISODate(eventDateStr) : null
  // One producer for the countdown (audit P0-5) — never ad-hoc ms arithmetic.
  const daysToGo = daysToEvent(eventDateStr)
  const eventName = traj?.event_name ?? profile?.goals?.target_event_name ?? null
  const priority = (traj?.target_priority ?? profile?.target_priority ?? '').toUpperCase() || null
  const eventTypeRaw = traj?.event_type ?? profile?.target_event_type ?? null
  const eventTypeLabel = eventTypeRaw
    ? (EVENT_TYPE_LABELS[eventTypeRaw] ? (de ? EVENT_TYPE_LABELS[eventTypeRaw].de : EVENT_TYPE_LABELS[eventTypeRaw].en) : eventTypeRaw)
    : null

  // Canonical date path (audit P1-6): date-fns + de locale via utils/format —
  // each call site passes its EN/DE pattern pair (German day-first order).
  const fmtDate = (d: Date, patterns: { en: string; de: string }) =>
    formatDate(d, de ? patterns.de : patterns.en, locale)

  /* season timeline geometry — deterministic from the race date */
  const timeline = useMemo(() => {
    if (!eventDate || daysToGo == null || daysToGo < 0) return null
    const taperStart = addDays(eventDate, -14)
    const peakStart = addDays(eventDate, -42)
    const buildStart = addDays(eventDate, -98)
    const s180 = addDays(eventDate, -180)
    const seasonStart = today < s180 ? today : s180
    const seg = (a: Date, b: Date) => Math.max(0, daysBetween(a, b))
    const segments: { key: PhaseKey; days: number; start: Date }[] = [
      { key: 'base', days: seg(seasonStart, buildStart), start: seasonStart },
      { key: 'build', days: seg(buildStart, peakStart), start: buildStart },
      { key: 'peak', days: seg(peakStart, taperStart), start: peakStart },
      { key: 'taper', days: seg(taperStart, eventDate), start: taperStart },
      { key: 'race', days: 6, start: eventDate }, // fixed-width race slot
    ]
    const totalDays = segments.reduce((s, x) => s + x.days, 0)
    const markerPct = Math.min(97, Math.max(3, (daysBetween(seasonStart, today) / totalDays) * 100))
    // phase today lives in, by calendar (fallback when meso phase missing)
    let calendarPhase: PhaseKey = 'base'
    if (today >= taperStart) calendarPhase = 'taper'
    else if (today >= peakStart) calendarPhase = 'peak'
    else if (today >= buildStart) calendarPhase = 'build'
    const boundaries: { key: PhaseKey; start: Date }[] = [
      { key: 'build', start: buildStart },
      { key: 'peak', start: peakStart },
      { key: 'taper', start: taperStart },
      { key: 'race', start: eventDate },
    ]
    const next = boundaries.find((b) => b.start > today) ?? null
    return { segments, markerPct, calendarPhase, next, seasonStart, taperStart }
  }, [eventDate, daysToGo, today])

  const activePhase: PhaseKey | null = mesoToPhaseKey(week?.meso_block?.phase) ?? timeline?.calendarPhase ?? null

  /* Honest projection gate (audit P0-4): only a real plan simulation counts.
     projection_basis 'none' (or a null projected CTL) means "we can't know
     yet" — every projection-derived figure renders an honest dash instead. */
  const projectionValid = traj != null && traj.projection_basis !== 'none' && traj.ctl_projected_at_goal != null

  /* fitness ring: projected CTL vs CTL target — only with a valid projection */
  const ringPct = projectionValid && traj?.ctl_projected_at_goal != null && traj?.ctl_target != null && traj.ctl_target > 0
    ? Math.min(1, traj.ctl_projected_at_goal / traj.ctl_target)
    : null
  const ringColor = ringPct == null ? 'var(--color-muted)'
    : ringPct >= 0.85 ? 'var(--color-recovery)'
    : ringPct >= 0.6 ? 'var(--color-amber)'
    : 'var(--color-accent)'

  /* Race-day pacing anchors on the CANONICAL displayed threshold (audit P0-1)
     — never a CP that diverges from the FTP shown everywhere else. W′ only
     when the model is valid (reconcile_threshold gates CP/W′ display). */
  const displayFtp = power?.available === false ? null : power?.threshold_watts ?? null
  const modelValid = power?.available !== false && power?.model_valid === true
  const wPrime = modelValid ? power?.w_prime_j ?? null : null
  const matchesLo = wPrime != null ? Math.max(1, Math.floor(wPrime / 2500)) : null
  const matchesHi = wPrime != null ? Math.max(1, Math.ceil(wPrime / 2500)) : null

  /* forward TSB band chart */
  const band = useMemo(() => {
    const days = eta?.days ?? []
    if (days.length < 2) return null
    const w = 300
    const h = 84
    const lows = days.map((d) => d.tsb_low)
    const highs = days.map((d) => d.tsb_high)
    const min = Math.min(...lows, 0) - 2
    const max = Math.max(...highs, 0) + 2
    const x = (i: number) => (i / (days.length - 1)) * w
    const y = (v: number) => h - ((v - min) / (max - min)) * h
    const pts = (vals: number[]) => vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    const lowsReversed = lows.map((_, i) => {
      const idx = days.length - 1 - i
      return `${x(idx).toFixed(1)},${y(lows[idx]).toFixed(1)}`
    })
    return {
      w, h,
      bandPath: `M ${pts(highs).join(' L ')} L ${lowsReversed.join(' L ')} Z`,
      linePath: `M ${pts(days.map((d) => d.tsb)).join(' L ')}`,
      zeroY: y(0),
      n: days.length,
    }
  }, [eta])

  // Badge ONLY when a VALID projection says 'behind' (amber = caution with an
  // action). On-track/ahead states render the card calmly without a badge, and
  // an invalid projection must never wear a verdict it can't back up.
  const isBehind = projectionValid && traj?.on_track === 'behind'
  const onTrackChip = isBehind
    ? { label: de ? 'Hinter dem Ziel' : 'Behind target', color: 'var(--color-amber)' }
    : null

  /* countdown checklist — deterministic from the race date */
  const checklist = useMemo(() => {
    if (!eventDate) return []
    const items = [
      { date: addDays(eventDate, -14), en: 'Taper begins', de: 'Taper beginnt' },
      { date: addDays(eventDate, -2), en: 'Opener ride', de: 'Aktivierungsfahrt' },
      { date: addDays(eventDate, -1), en: 'Kit & bike check', de: 'Material- & Rad-Check' },
      { date: eventDate, en: 'Race day', de: 'Renntag' },
    ]
    return items.map((it) => ({ ...it, inDays: daysBetween(today, it.date) }))
  }, [eventDate, today])

  /* Season FTP goal — never a raw progress bar against a stale auto-seed.
     A target that is absent, equal to, or below the current FTP is the old
     onboarding auto-copy (audit: the "demoralizing 350 W"), so it renders as
     an honest "no target yet" state with a +5% suggestion the user can adopt. */
  const currentFtp = profile?.ftp_watts ?? null
  const targetFtp = profile?.goals?.target_ftp ?? null
  const hasRealFtpTarget = currentFtp != null && currentFtp > 0 && targetFtp != null && targetFtp > currentFtp
  const suggestedFtp = currentFtp != null && currentFtp > 0 ? Math.round(currentFtp * 1.05) : null
  const qc = useQueryClient()
  const adoptFtpTarget = useMutation({
    mutationFn: (watts: number) => updateGoals({ target_ftp: watts }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['athlete'] }),
        qc.invalidateQueries({ queryKey: GOAL_TRAJECTORY_KEY }),
      ])
    },
  })

  const prioChip = priority ? {
    bg: priority === 'A' ? 'var(--color-gold-soft)' : priority === 'B' ? 'color-mix(in srgb, var(--color-strain) 15%, transparent)' : 'var(--color-surface-2)',
    fg: priority === 'A' ? 'var(--color-gold)' : priority === 'B' ? 'var(--color-strain)' : 'var(--color-ink-2)',
  } : null

  const R = 36
  const CIRC = 2 * Math.PI * R

  return (
    <DashboardShell>
      <div className="mx-auto flex flex-col gap-5 px-4 pb-24 pt-3" style={{ maxWidth: 640 }}>
        {/* ── Header (.pen kvMo3) ── */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} aria-label={de ? 'Zurück' : 'Back'} className="grid place-items-center rounded-full" style={{ width: 40, height: 40, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
            <ArrowLeft size={18} style={{ color: 'var(--color-ink-2)' }} />
          </button>
          <div className="flex flex-col">
            <h1 className="num-display" style={{ fontSize: 26, color: 'var(--color-ink)' }}>{de ? 'Saison' : 'Season'}</h1>
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              {de ? 'Dein Weg zum Renntag' : 'Your road to race day'}
            </span>
          </div>
        </div>

        {eventDate == null && (
          <div className="flex flex-col gap-2 p-5" style={CARD}>
            <span className="eyebrow" style={EYEBROW}>{de ? 'KEIN ZIELEVENT' : 'NO TARGET EVENT'}</span>
            <p style={{ fontSize: 13.5, color: 'var(--color-ink-2)', lineHeight: 1.5 }}>
              {de
                ? 'Lege ein Zielevent im Profil fest — dann baut sich dein Saisonplan von selbst auf.'
                : 'Set a target event in your profile — your season plan builds itself from there.'}
            </p>
          </div>
        )}

        {/* ── Countdown Hero (.pen H4vF3) ── */}
        {eventDate != null && (
          <div className="flex flex-col gap-4 p-5" style={{
            borderRadius: 24,
            border: '1px solid var(--color-accent)',
            background: 'linear-gradient(125deg, color-mix(in srgb, var(--color-accent) 14%, var(--color-paper-2)), var(--color-paper-2) 72%)',
          }}>
            <div className="flex items-center justify-between">
              {priority && prioChip ? (
                <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: prioChip.bg }}>
                  <Flag size={12} style={{ color: prioChip.fg }} />
                  <span className="eyebrow" style={{ fontSize: 10.5, letterSpacing: '0.08em', fontWeight: 700, color: prioChip.fg }}>
                    {de ? `${priority}-RENNEN` : `${priority}-RACE`}
                  </span>
                </span>
              ) : <span />}
              <span className="num-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>
                {fmtDate(eventDate, { en: 'EEE, MMM d', de: 'EEE, d. MMM' })}
              </span>
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>
                {eventName ?? (de ? 'Zielevent' : 'Target event')}
              </span>
              <span style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>
                {[eventTypeLabel, fmtDate(eventDate, { en: 'MMMM d, yyyy', de: 'd. MMMM yyyy' })].filter(Boolean).join(' · ')}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <span className="num-display" style={{ fontSize: 54, lineHeight: 1.05, color: 'var(--color-ink)' }}>
                  {daysToGo != null && daysToGo >= 0 ? daysToGo : '—'}
                </span>
                <span style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>
                  {de ? 'Tage bis zum Renntag' : 'days until race day'}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <svg width={84} height={84} viewBox="0 0 84 84" role="img" aria-label={de ? 'Prognostizierte Fitness' : 'Projected fitness'}>
                  <circle cx={42} cy={42} r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth={7} />
                  {ringPct != null && (
                    <circle cx={42} cy={42} r={R} fill="none" stroke={ringColor} strokeWidth={7} strokeLinecap="round"
                      strokeDasharray={`${CIRC}`} strokeDashoffset={CIRC * (1 - ringPct)} transform="rotate(-90 42 42)" />
                  )}
                  <text x={42} y={44} textAnchor="middle" dominantBaseline="middle" className="num-display" style={{ fontSize: 17, fill: 'var(--color-ink)' }}>
                    {ringPct != null ? `${Math.round(ringPct * 100)}%` : '—'}
                  </text>
                </svg>
                <span style={{ fontSize: 10.5, color: 'var(--color-muted)', textAlign: 'center' }}>
                  {de ? 'Fitness vs. Ziel' : 'fitness vs target'}
                </span>
              </div>
            </div>

            {traj?.narrative_hook && (
              <div className="flex items-center gap-2 rounded-[14px] px-3 py-2.5" style={{
                background: traj.on_track === 'behind'
                  ? 'color-mix(in srgb, var(--color-amber) 10%, transparent)'
                  : 'color-mix(in srgb, var(--color-recovery) 9%, transparent)',
              }}>
                <BadgeCheck size={15} style={{ color: traj.on_track === 'behind' ? 'var(--color-amber)' : 'var(--color-recovery)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--color-ink)', lineHeight: 1.4 }}>{traj.narrative_hook}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Season Timeline (.pen wlJd1) ── */}
        {timeline && (
          <div className="flex flex-col gap-3 p-5" style={CARD}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Saisonplan' : 'Season Plan'}</span>
              <span className="num-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>
                {fmtDate(timeline.seasonStart, { en: 'MMM', de: 'MMM' })} – {fmtDate(eventDate!, { en: 'MMM', de: 'MMM' })}
              </span>
            </div>

            {/* today marker */}
            <div className="relative" style={{ height: 24 }}>
              <div className="absolute flex flex-col items-center" style={{ left: `${timeline.markerPct}%`, transform: 'translateX(-50%)' }}>
                <span className="rounded-full px-2.5 py-0.5 eyebrow" style={{ fontSize: 9.5, letterSpacing: '0.08em', fontWeight: 700, background: 'var(--color-accent)', color: '#0A0C0F' }}>
                  {de ? 'HEUTE' : 'TODAY'}
                </span>
                <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid var(--color-accent)' }} />
              </div>
            </div>

            {/* phase blocks */}
            <div className="flex gap-1">
              {timeline.segments.map((seg) => {
                const meta = PHASE_META.find((p) => p.key === seg.key)!
                const active = seg.key === activePhase
                return (
                  <div key={seg.key} className="rounded-[10px]" style={{
                    flexGrow: seg.days || 1, flexBasis: 0, height: 34,
                    background: meta.color,
                    opacity: active ? 1 : 0.32,
                    boxShadow: active ? `0 4px 14px -2px color-mix(in srgb, ${meta.color} 40%, transparent)` : undefined,
                  }} />
                )
              })}
            </div>
            <div className="flex gap-1">
              {timeline.segments.map((seg) => {
                const meta = PHASE_META.find((p) => p.key === seg.key)!
                const active = seg.key === activePhase
                return (
                  <span key={seg.key} className="text-center" style={{
                    flexGrow: seg.days || 1, flexBasis: 0, fontSize: 10,
                    fontWeight: active ? 700 : 600,
                    color: active ? 'var(--color-ink)' : 'var(--color-muted)',
                  }}>
                    {de ? meta.de : meta.en}
                  </span>
                )
              })}
            </div>

            <div style={{ height: 1, background: 'var(--color-rule)' }} />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="rounded-full" style={{ width: 7, height: 7, background: 'var(--color-accent)' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>
                  {week?.meso_block
                    ? `${prettyMesoPhase(week.meso_block.phase, de)}${week.meso_block.block_position ? ` · ${BLOCK_LABELS[week.meso_block.block_position] ? (de ? BLOCK_LABELS[week.meso_block.block_position].de : BLOCK_LABELS[week.meso_block.block_position].en) : week.meso_block.block_position}` : ''}`
                    : '—'}
                </span>
              </div>
              {timeline.next && (
                <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>
                  {(() => {
                    const meta = PHASE_META.find((p) => p.key === timeline.next!.key)!
                    const wks = Math.max(1, Math.round(daysBetween(today, timeline.next!.start) / 7))
                    return de
                      ? `${meta.de} startet in ${wks} Wo.`
                      : `${meta.en} starts in ${wks} wk${wks > 1 ? 's' : ''}`
                  })()}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Race Day Plan — draft pacing from the CANONICAL threshold (.pen H1DZl4) ── */}
        {eventDate != null && displayFtp != null && (
          <div className="flex flex-col gap-4 p-5" style={CARD}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Renntag-Plan' : 'Race Day Plan'}</span>
              <span className="flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: 'color-mix(in srgb, var(--color-amber) 15%, transparent)' }}>
                <PencilLine size={12} style={{ color: 'var(--color-amber)' }} />
                <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.08em', fontWeight: 700, color: 'var(--color-amber)' }}>
                  {de ? 'ENTWURF' : 'DRAFT'}
                </span>
              </span>
            </div>

            <div className="flex gap-3.5">
              <div className="grid place-items-center rounded-[12px]" style={{ width: 38, height: 38, background: 'var(--color-surface-2)', flexShrink: 0 }}>
                <Mountain size={19} style={{ color: 'var(--color-strain)' }} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Pacing' : 'Pacing'}</span>
                <span style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
                  {de
                    ? `Anstiege ${Math.round(displayFtp * 0.88)}–${Math.round(displayFtp * 0.94)} W (88–94 % FTP) · Flachstücke ${Math.round(displayFtp * 0.75)}–${Math.round(displayFtp * 0.82)} W (75–82 %)`
                    : `Climbs at ${Math.round(displayFtp * 0.88)}–${Math.round(displayFtp * 0.94)} W (88–94% FTP) · flats ${Math.round(displayFtp * 0.75)}–${Math.round(displayFtp * 0.82)} W (75–82%)`}
                </span>
              </div>
            </div>

            {/* W′ only when the CP model is valid — a W′ from a model that
                disagrees with the displayed FTP would contradict the pacing row. */}
            {wPrime != null && matchesLo != null && matchesHi != null && (
              <>
                <div style={{ height: 1, background: 'var(--color-rule)' }} />

                <div className="flex gap-3.5">
                  <div className="grid place-items-center rounded-[12px]" style={{ width: 38, height: 38, background: 'var(--color-surface-2)', flexShrink: 0 }}>
                    <Zap size={19} style={{ color: 'var(--color-violet)' }} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Körner-Budget' : 'Matches budget'}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
                      {de
                        ? `W′ ${(wPrime / 1000).toFixed(1)} kJ ≈ ${matchesLo === matchesHi ? matchesLo : `${matchesLo}–${matchesHi}`} harte Antritte über der Schwelle — für die entscheidenden Anstiege aufheben`
                        : `W′ ${(wPrime / 1000).toFixed(1)} kJ ≈ ${matchesLo === matchesHi ? matchesLo : `${matchesLo}–${matchesHi}`} hard surges above threshold — save them for the decisive climbs`}
                    </span>
                  </div>
                </div>
              </>
            )}

            <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>
              {de
                ? 'Pacing-Entwurf aus deiner angezeigten FTP — wird verfeinert, je näher das Rennen rückt.'
                : 'Draft pacing from your displayed FTP — refined as the event nears.'}
            </p>
          </div>
        )}

        {/* ── Race-day projection (.pen EuxvR, CTL/TSB metric refs) ── */}
        {eventDate != null && traj != null && (
          <div className="flex flex-col gap-4 p-5" style={CARD}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} style={{ color: 'var(--color-strain)' }} />
                <span className="eyebrow" style={EYEBROW}>{de ? 'PROGNOSE RENNTAG' : 'RACE-DAY PROJECTION'}</span>
              </div>
              {onTrackChip && (
                <span className="rounded-full px-2.5 py-1 eyebrow" style={{ fontSize: 10, letterSpacing: '0.08em', fontWeight: 700, color: onTrackChip.color, background: `color-mix(in srgb, ${onTrackChip.color} 14%, transparent)` }}>
                  {onTrackChip.label}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="num-display" style={{ fontSize: 32, color: 'var(--color-ink)' }}>
                  {traj.ctl_now != null ? Math.round(traj.ctl_now) : '—'}
                </span>
                <span className="eyebrow" style={{ fontSize: 9.5, color: 'var(--color-muted)' }}>{de ? 'CTL HEUTE' : 'CTL NOW'}</span>
              </div>
              <ArrowRight size={20} style={{ color: 'var(--color-muted)' }} />
              <div className="flex flex-col">
                <span className="num-display" style={{ fontSize: 32, color: projectionValid ? 'var(--color-strain)' : 'var(--color-muted)' }}>
                  {projectionValid && traj.ctl_projected_at_goal != null ? Math.round(traj.ctl_projected_at_goal) : '—'}
                </span>
                <span className="eyebrow" style={{ fontSize: 9.5, color: 'var(--color-muted)' }}>{de ? 'AM RENNTAG' : 'AT RACE DAY'}</span>
              </div>
              {projectionValid && traj.ctl_target != null && (
                <div className="ml-auto flex flex-col items-end">
                  <span className="num-display" style={{ fontSize: 20, color: 'var(--color-ink-2)' }}>{Math.round(traj.ctl_target)}</span>
                  <span className="eyebrow" style={{ fontSize: 9.5, color: 'var(--color-muted)' }}>{de ? 'ZIEL-CTL' : 'CTL TARGET'}</span>
                </div>
              )}
            </div>

            {/* Honest dash state (audit P0-4): the projection can't be computed
                yet — say so plainly, with zero verdicts or advice numbers. */}
            {!projectionValid && (
              <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.5 }}>
                {de
                  ? 'Prognose folgt — nach 2–3 Trainingswochen können wir den Renntag hochrechnen.'
                  : 'Forecast coming — we need 2–3 more training weeks to project race day.'}
              </span>
            )}

            {projectionValid && traj.ctl_7d_delta != null && (
              <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>
                {de
                  ? `CTL ${traj.ctl_7d_delta >= 0 ? '+' : ''}${traj.ctl_7d_delta.toFixed(1)} in den letzten 7 Tagen`
                  : `CTL ${traj.ctl_7d_delta >= 0 ? '+' : ''}${traj.ctl_7d_delta.toFixed(1)} over the last 7 days`}
                {traj.weekly_tss_required != null && (
                  <span style={{ color: 'var(--color-muted)' }}>
                    {' · '}
                    {/* weekly_tss_required = the plan's own next-week TSS — an
                        explanation of what's coming, never an add-more demand. */}
                    {de ? `Nächste Planwoche: ~${Math.round(traj.weekly_tss_required)} TSS` : `Next plan week: ~${Math.round(traj.weekly_tss_required)} TSS`}
                  </span>
                )}
              </span>
            )}

            {band && (
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--color-muted)' }}>
                  {de ? `FORM · NÄCHSTE ${band.n} TAGE` : `FORM · NEXT ${band.n} DAYS`}
                </span>
                <svg width="100%" height={band.h} viewBox={`0 0 ${band.w} ${band.h}`} preserveAspectRatio="none" role="img" aria-label={de ? 'Form-Band' : 'Form band'}>
                  <path d={band.bandPath} fill="color-mix(in srgb, var(--color-strain) 16%, transparent)" />
                  <line x1={0} y1={band.zeroY} x2={band.w} y2={band.zeroY} stroke="var(--color-rule)" strokeWidth={1} strokeDasharray="4 4" />
                  <path d={band.linePath} fill="none" stroke="var(--color-strain)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="flex justify-between">
                  <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{de ? 'heute' : 'today'}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>+{band.n}d</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                  {eta?.already_fresh
                    ? (de ? 'Bereits frisch (TSB ≥ −5)' : 'Already fresh (TSB ≥ −5)')
                    : eta?.fresh_on
                      ? (de ? `Frisch ab ${fmtDate(parseISODate(eta.fresh_on), { en: 'MMM d', de: 'd. MMM' })}` : `Fresh from ${fmtDate(parseISODate(eta.fresh_on), { en: 'MMM d', de: 'd. MMM' })}`)
                      : null}
                  {eta?.race_sharp_on
                    ? `${eta.already_fresh || eta.fresh_on ? ' · ' : ''}${de ? `rennscharf ab ${fmtDate(parseISODate(eta.race_sharp_on), { en: 'MMM d', de: 'd. MMM' })}` : `race-sharp from ${fmtDate(parseISODate(eta.race_sharp_on), { en: 'MMM d', de: 'd. MMM' })}`}`
                    : null}
                </span>
              </div>
            )}

            <div className={projectionValid ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3'}>
              {/* Form-at-race-day only when the projection is real — a TSB
                  guess without a plan simulation would be a fabricated number. */}
              {projectionValid && (
                <div className="flex flex-col gap-1 rounded-[16px] p-3.5" style={{ background: 'var(--color-surface-2)' }}>
                  <span className="eyebrow" style={{ fontSize: 9.5, letterSpacing: '0.1em', color: 'var(--color-muted)' }}>
                    {de ? 'FORM AM RENNTAG' : 'FORM AT RACE DAY'}
                  </span>
                  <span className="num-display" style={{ fontSize: 22, color: traj.tsb_projected_at_goal != null && traj.tsb_projected_at_goal >= 0 ? 'var(--color-recovery)' : 'var(--color-ink)' }}>
                    {traj.tsb_projected_at_goal != null ? `${traj.tsb_projected_at_goal >= 0 ? '+' : ''}${Math.round(traj.tsb_projected_at_goal)}` : '—'}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--color-muted)' }}>
                    {traj.tsb_projected_at_goal == null ? 'TSB'
                      : traj.tsb_projected_at_goal >= 5 ? (de ? 'TSB — frisch & spritzig' : 'TSB — fresh & sharp')
                      : traj.tsb_projected_at_goal >= -5 ? (de ? 'TSB — neutral' : 'TSB — neutral')
                      : (de ? 'TSB — müde' : 'TSB — fatigued')}
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-1 rounded-[16px] p-3.5" style={{ background: 'var(--color-surface-2)' }}>
                <span className="eyebrow" style={{ fontSize: 9.5, letterSpacing: '0.1em', color: 'var(--color-muted)' }}>
                  {de ? 'WOCHENDOSIS' : 'WEEKLY DOSE'}
                </span>
                <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>
                  {traj.weekly_tss_actual != null ? Math.round(traj.weekly_tss_actual) : '—'}
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--color-muted)' }}>
                  {de ? 'TSS/Wo. aktuell' : 'TSS/wk currently'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Season Goals (.pen iBvjn) ── */}
        {currentFtp != null && currentFtp > 0 && (
          <div className="flex flex-col gap-4 p-5" style={CARD}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target size={16} style={{ color: 'var(--color-accent)' }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Saisonziele' : 'Season Goals'}</span>
              </div>
              {hasRealFtpTarget && targetFtp != null && (
                <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent)' }}>
                  {Math.round((currentFtp / targetFtp) * 100)}%
                </span>
              )}
            </div>

            {hasRealFtpTarget && targetFtp != null ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Ziel-FTP' : 'Target FTP'}</span>
                  <span className="num-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>
                    {currentFtp} <span style={{ color: 'var(--color-muted)', fontWeight: 600 }}>/ {targetFtp} W</span>
                  </span>
                </div>
                <div className="rounded-full" style={{ height: 8, background: 'var(--color-surface-2)' }}>
                  <div className="rounded-full" style={{ height: 8, width: `${Math.min(100, (currentFtp / targetFtp) * 100)}%`, background: 'var(--color-accent)' }} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                  {de ? `${targetFtp - currentFtp} W bis zum Ziel` : `${targetFtp - currentFtp} W to go`}
                </span>
              </div>
            ) : (
              /* No real target (absent, or the stale onboarding auto-copy that
                 equals/undershoots the current FTP) — honest empty state with a
                 +5% suggestion the athlete can adopt in one tap. Neutral tone,
                 never a bar that shames or a "target reached" fiction. */
              <div className="flex flex-col gap-3">
                <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.5 }}>
                  {suggestedFtp != null
                    ? (de
                      ? `Kein FTP-Ziel gesetzt — Ziel wählen (Vorschlag: ${suggestedFtp} W, +5 %)`
                      : `No FTP target set — choose one (suggested: ${suggestedFtp} W, +5%)`)
                    : (de ? 'Kein FTP-Ziel gesetzt.' : 'No FTP target set.')}
                </span>
                {suggestedFtp != null && (
                  <button
                    type="button"
                    onClick={() => adoptFtpTarget.mutate(suggestedFtp)}
                    disabled={adoptFtpTarget.isPending}
                    className="self-start rounded-full px-4 py-2"
                    style={{
                      background: 'var(--color-accent-soft)', color: 'var(--color-accent)',
                      fontSize: 12.5, fontWeight: 700,
                      opacity: adoptFtpTarget.isPending ? 0.6 : 1,
                      cursor: adoptFtpTarget.isPending ? 'default' : 'pointer',
                    }}>
                    {adoptFtpTarget.isPending
                      ? (de ? 'Speichern …' : 'Saving…')
                      : (de ? `Ziel setzen: ${suggestedFtp} W` : `Set target: ${suggestedFtp} W`)}
                  </button>
                )}
              </div>
            )}

            {profile?.weight_kg != null && profile.weight_kg > 0 && (
              <div className="flex items-center justify-between" style={{ borderTop: '1px solid var(--color-rule)', paddingTop: 14 }}>
                <div className="flex flex-col gap-0.5">
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Watt pro Kilo' : 'Power to weight'}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
                    {de ? 'aus FTP & Gewicht — kein Ziel gesetzt' : 'from FTP & weight — no target set'}
                  </span>
                </div>
                <span className="num-display" style={{ fontSize: 20, color: 'var(--color-violet)' }}>
                  {(currentFtp / profile.weight_kg).toFixed(2)} <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>W/kg</span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Countdown checklist — deterministic from race date ── */}
        {checklist.length > 0 && (
          <div className="flex flex-col gap-3.5 p-5" style={CARD}>
            <div className="flex items-center gap-2">
              <Gauge size={16} style={{ color: 'var(--color-gold)' }} />
              <span className="eyebrow" style={EYEBROW}>{de ? 'COUNTDOWN' : 'COUNTDOWN'}</span>
            </div>
            <div className="flex flex-col gap-3">
              {checklist.map((it, i) => {
                const done = it.inDays < 0
                const isToday = it.inDays === 0
                const isRace = i === checklist.length - 1
                return (
                  <div key={i} className="flex items-center gap-3">
                    {done
                      ? <CheckCircle2 size={18} style={{ color: 'var(--color-recovery)', flexShrink: 0 }} />
                      : isRace
                        ? <Flag size={18} style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
                        : <Circle size={18} style={{ color: isToday ? 'var(--color-accent)' : 'var(--color-muted)', flexShrink: 0 }} />}
                    <div className="flex flex-col" style={{ flex: 1 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: done ? 'var(--color-muted)' : 'var(--color-ink)', textDecoration: done ? 'line-through' : undefined }}>
                        {de ? it.de : it.en}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
                        {fmtDate(it.date, { en: 'EEE, MMM d', de: 'EEE, d. MMM' })}
                      </span>
                    </div>
                    <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color: isToday ? 'var(--color-accent)' : done ? 'var(--color-muted)' : 'var(--color-ink-2)' }}>
                      {done
                        ? (de ? 'erledigt' : 'done')
                        : isToday
                          ? (de ? 'heute' : 'today')
                          : (de ? `in ${it.inDays} Tg.` : `in ${it.inDays}d`)}
                    </span>
                  </div>
                )
              })}
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>
              {de ? 'Automatisch aus deinem Renndatum geplant.' : 'Auto-planned from your race date.'}
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
