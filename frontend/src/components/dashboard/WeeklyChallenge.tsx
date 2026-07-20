import { useMemo } from 'react'
import { startOfWeek, endOfWeek, isWithinInterval, differenceInHours } from 'date-fns'
import { Target, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useCountUp } from '../../hooks/useCountUp'
import { useLocale } from '../../contexts/LocaleContext'

// Weekly Challenge Ring — Apple Fitness's core mechanic translated for cyclists.
// The ring closes as the athlete accumulates TSS toward their weekly commitment.
// Goal auto-derives from athlete profile (weekly_hours_available × 70 TSS/hr),
// which gives a sane default without forcing users through goal-setting UX.
// When closed: celebratory pulse. When close: urgency copy. When far: calm copy.

const RING_SIZE = 96
const RING_STROKE = 10
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRC = 2 * Math.PI * RING_RADIUS

export default function WeeklyChallenge({ teaser = false }: { teaser?: boolean }) {
  const { locale, t } = useLocale()
  const de = locale === 'de'
  const today = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })

  const { data: activitiesData } = useActivitiesRange(weekStart, today)
  const { data: profile } = useAthleteProfile()

  const { thisWeekTSS, goal, pct, sessions, hoursLeft } = useMemo(() => {
    const activities = activitiesData?.activities ?? []
    const weekActs = activities.filter((a) =>
      isWithinInterval(new Date(a.started_at), { start: weekStart, end: weekEnd })
    )
    const tss = weekActs.reduce((s, a) => s + (a.tss ?? 0), 0)
    const weeklyHours = profile?.weekly_hours_available ?? 6
    const g = Math.max(200, Math.round(weeklyHours * 70)) // 70 TSS/hr default
    const p = Math.min(1, tss / g)
    const sess = weekActs.length
    const hrs = Math.max(0, Math.floor(differenceInHours(weekEnd, today)))
    return { thisWeekTSS: Math.round(tss), goal: g, pct: p, sessions: sess, hoursLeft: hrs }
  }, [activitiesData, profile, weekStart, weekEnd, today])

  const countedTSS = useCountUp(thisWeekTSS, { durationMs: 900 })
  const countedPct = useCountUp(Math.round(pct * 100), { durationMs: 900 })

  const closed = pct >= 1
  const close = pct >= 0.7 && pct < 1
  const behind = pct < 0.5 && hoursLeft < 48

  const ringColor = closed ? '#30D158' : close ? '#30D158' : 'var(--color-forest-2)'
  const glowColor = closed ? 'rgba(48, 209, 88, 0.45)' : 'rgba(48, 209, 88, 0.20)'

  // Strategic copy — identity + loss aversion per psychology audit.
  // Default state is translated; the situational closed/close/behind
  // variants stay English-only until they get their own dictionary keys
  // (rarely seen, not worth pulling into i18n in this pass).
  let headline = t('week_in_motion')
  let subline = `${Math.max(0, goal - thisWeekTSS)} ${t('tss_to_close_ring')}`
  if (closed) {
    headline = de ? 'Ring geschlossen. Du warst da.' : 'Ring closed. You showed up.'
    subline = de
      ? `${thisWeekTSS} TSS in ${sessions} ${sessions === 1 ? 'Einheit' : 'Einheiten'} — das bist du jetzt.`
      : `${thisWeekTSS} TSS across ${sessions} ${sessions === 1 ? 'session' : 'sessions'} — this is who you are now.`
  } else if (close) {
    headline = de ? 'Du bist in Schlagdistanz.' : "You're within striking distance."
    subline = de
      ? `${goal - thisWeekTSS} TSS übrig · ${hoursLeft}h auf der Uhr`
      : `${goal - thisWeekTSS} TSS left · ${hoursLeft}h on the clock`
  } else if (behind) {
    headline = de ? 'Die Woche ruft.' : 'The week is asking.'
    subline = de
      ? `${hoursLeft}h, um den Ring zu schützen. Eine Einheit reicht.`
      : `${hoursLeft}h left to protect the ring. One session answers it.`
  }

  const dashOffset = RING_CIRC * (1 - pct)

  // Teaser variant (Today): the gamified ring lives on Social — here we show
  // only a slim, read-only one-line load figure that links across to it.
  if (teaser) {
    return (
      <Link
        to="/dashboard?tab=social"
        className="flex items-center justify-between gap-3 rounded-[14px] px-4 py-3 transition-colors"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: '1px solid var(--color-rule)',
          textDecoration: 'none',
        }}
      >
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10.5, letterSpacing: '0.18em' }}>
            {de ? 'DIESE WOCHE' : 'THIS WEEK'}
          </span>
          <span className="num-mono" style={{ color: 'var(--color-ink)', fontSize: 16, fontWeight: 600 }}>
            {thisWeekTSS}
          </span>
          <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 14 }}>
            / {goal} TSS
          </span>
        </span>
        <span className="inline-flex items-center gap-1 shrink-0" style={{ color: 'var(--color-muted)', fontSize: 12 }}>
          {de ? 'Ring' : 'Ring'}
          <ChevronRight size={13} strokeWidth={2} />
        </span>
      </Link>
    )
  }

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5 relative overflow-hidden"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: closed ? '1px solid rgba(48, 209, 88, 0.35)' : '1px solid var(--color-rule)',
        boxShadow: closed ? '0 0 24px rgba(48, 209, 88, 0.15) inset' : 'none',
        transition: 'border-color 400ms, box-shadow 400ms',
      }}
    >
      {/* Ambient glow when ring is closed */}
      {closed && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 20% 50%, rgba(48, 209, 88, 0.08), transparent 60%)',
          }}
          aria-hidden
        />
      )}

      <div className="flex items-center gap-5 relative">
        {/* Ring */}
        <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
          <svg width={RING_SIZE} height={RING_SIZE} style={{ transform: 'rotate(-90deg)' }}>
            {/* Track */}
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke="var(--color-rule)"
              strokeWidth={RING_STROKE}
              fill="none"
              opacity={0.5}
            />
            {/* Progress */}
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={ringColor}
              strokeWidth={RING_STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={RING_CIRC}
              strokeDashoffset={dashOffset}
              style={{
                transition: 'stroke-dashoffset 1200ms cubic-bezier(.22,1,.36,1)',
                filter: `drop-shadow(0 0 6px ${glowColor})`,
              }}
            />
          </svg>
          {/* Center content */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ gap: 2 }}
          >
            {closed ? (
              <Target size={22} strokeWidth={2} color="#30D158" />
            ) : (
              <>
                <span
                  className="num-display leading-none"
                  style={{ fontSize: 20, color: 'var(--color-ink)' }}
                >
                  {countedPct}
                </span>
                <span
                  className="num-mono leading-none"
                  style={{ fontSize: 10.5, color: 'var(--color-muted)', letterSpacing: '0.15em' }}
                >
                  %
                </span>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
            {de ? 'Wochen-Ring' : 'Weekly ring'} · {sessions} / {Math.ceil(goal / 70)} {de ? 'Einheiten' : 'sessions'}
          </span>
          <p
            className="text-[15px] font-medium leading-snug"
            style={{ color: 'var(--color-ink)' }}
          >
            {headline}
          </p>
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
            {subline}
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className="num-mono text-[11px]"
              style={{ color: 'var(--color-muted)' }}
            >
              {countedTSS} / {goal} TSS
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
