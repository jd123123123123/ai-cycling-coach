import { useMemo, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { differenceInDays, startOfWeek } from 'date-fns'
import { Target, Calendar, Zap, ArrowRight } from 'lucide-react'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useCountUp } from '../../hooks/useCountUp'

// Goal Progress — surfaces mission context that previously lived only in
// the profile setup page. FTP progress toward a target, event countdown,
// and weekly volume vs commitment. These are the three numbers that make
// athletes open the app at 6am before a ride.

function AnimatedBar({ pct, color }: { pct: number; color: string }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div
      className="relative h-1.5 rounded-full overflow-hidden"
      style={{ backgroundColor: 'var(--color-rule)' }}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          backgroundColor: color,
          width: visible ? `${Math.max(2, pct)}%` : '0%',
          transition: 'width 1200ms cubic-bezier(0.22, 1, 0.36, 1)',
          boxShadow: `0 0 8px color-mix(in srgb, ${color} 50%, transparent)`,
        }}
      />
    </div>
  )
}

export default function GoalProgress() {
  const today = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })

  const { data: profile, isLoading } = useAthleteProfile()
  const { data: weekData } = useActivitiesRange(weekStart, today)

  const goals = profile?.goals
  const hasAnyGoal = !!(
    goals?.target_ftp ||
    goals?.target_event_date ||
    (profile?.weekly_hours_available && profile.weekly_hours_available > 0)
  )

  // FTP progress
  const ftpCurrent = profile?.ftp_watts ?? 0
  const ftpTarget  = goals?.target_ftp ?? 0
  const ftpPct     = ftpTarget > 0 ? Math.min(100, (ftpCurrent / ftpTarget) * 100) : 0

  // Event countdown
  const eventDays = goals?.target_event_date
    ? differenceInDays(new Date(goals.target_event_date), today)
    : null

  // Weekly volume
  const weeklyHours = useMemo(() => {
    const acts = weekData?.activities ?? []
    return acts.reduce((s, a) => s + (a.duration_seconds ?? 0), 0) / 3600
  }, [weekData])
  const weeklyTarget  = profile?.weekly_hours_available ?? 0
  const weeklyPct     = weeklyTarget > 0 ? Math.min(100, (weeklyHours / weeklyTarget) * 100) : 0

  // Animated counters
  const animFtp     = useCountUp(ftpCurrent, { durationMs: 1000, digits: 0 })
  const animDays    = useCountUp(Math.max(0, eventDays ?? 0), { durationMs: 800, digits: 0 })
  const animWeekHrs = useCountUp(weeklyHours, { durationMs: 900, digits: 1 })

  if (isLoading) {
    return (
      <div
        className="paper-grain rounded-[20px] h-24 shimmer-bg"
        style={{ border: '1px solid var(--color-rule)' }}
      />
    )
  }

  // No goals set — soft CTA
  if (!hasAnyGoal) {
    return (
      <div
        className="paper-grain rounded-[20px] px-5 py-4 flex items-center justify-between gap-4"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: '1px solid var(--color-rule)',
        }}
      >
        <div>
          <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
            Mission
          </span>
          <p className="text-[14px] mt-0.5" style={{ color: 'var(--color-ink-2)' }}>
            Set a target FTP or event to track your progress here.
          </p>
        </div>
        <Link
          to="/profile-setup"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-medium"
          style={{
            backgroundColor: 'var(--color-ink)',
            color: 'var(--color-paper)',
          }}
        >
          Set goals
          <ArrowRight size={12} strokeWidth={2} />
        </Link>
      </div>
    )
  }

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
          Mission
        </span>
        {goals?.target_event_name && eventDays != null && eventDays > 0 && (
          <div className="flex items-center gap-1.5 text-right">
            <Calendar size={11} strokeWidth={1.8} style={{ color: 'var(--color-amber)' }} />
            <span className="num-mono text-[11px]" style={{ color: 'var(--color-amber)' }}>
              {animDays}d · {goals.target_event_name}
            </span>
          </div>
        )}
        {eventDays != null && eventDays <= 0 && (
          <span className="num-mono text-[11px]" style={{ color: 'var(--color-forest-2)' }}>
            Race day!
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {/* FTP Progress */}
        {ftpTarget > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Zap size={11} strokeWidth={2} style={{ color: '#BF5AF2' }} />
                <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10 }}>
                  FTP
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="num-mono text-[13px] font-medium" style={{ color: 'var(--color-ink)' }}>
                  {animFtp}W
                </span>
                <span className="num-mono text-[11px]" style={{ color: 'var(--color-muted)' }}>
                  → {ftpTarget}W
                </span>
                <span
                  className="num-mono text-[11px] px-1.5 py-0.5 rounded"
                  style={{
                    color: '#BF5AF2',
                    backgroundColor: 'rgba(191, 90, 242, 0.10)',
                  }}
                >
                  {Math.round(ftpPct)}%
                </span>
              </div>
            </div>
            <AnimatedBar pct={ftpPct} color="#BF5AF2" />
          </div>
        )}

        {/* Weekly Volume */}
        {weeklyTarget > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Target size={11} strokeWidth={2} style={{ color: 'var(--color-forest-2)' }} />
                <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10 }}>
                  This week
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="num-mono text-[13px] font-medium" style={{ color: 'var(--color-ink)' }}>
                  {animWeekHrs}h
                </span>
                <span className="num-mono text-[11px]" style={{ color: 'var(--color-muted)' }}>
                  / {weeklyTarget}h
                </span>
                <span
                  className="num-mono text-[11px] px-1.5 py-0.5 rounded"
                  style={{
                    color: weeklyPct >= 80 ? 'var(--color-forest-2)' : weeklyPct >= 50 ? 'var(--color-amber)' : 'var(--color-alert)',
                    backgroundColor: weeklyPct >= 80
                      ? 'rgba(52, 199, 89, 0.10)'
                      : weeklyPct >= 50
                        ? 'rgba(255, 159, 10, 0.10)'
                        : 'rgba(255, 69, 58, 0.10)',
                  }}
                >
                  {Math.round(weeklyPct)}%
                </span>
              </div>
            </div>
            <AnimatedBar
              pct={weeklyPct}
              color={weeklyPct >= 80 ? 'var(--color-forest-2)' : weeklyPct >= 50 ? '#FF9F0A' : 'var(--color-alert)'}
            />
          </div>
        )}
      </div>
    </div>
  )
}
