import { useEffect, useMemo, useRef, useState } from 'react'
import { Flame, Trophy } from 'lucide-react'
import { subDays, format } from 'date-fns'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import type { ActivityRead } from '../../api/dashboard'
import { prefersReducedMotion } from '../../utils/motion'
import { useCountUp } from '../../hooks/useCountUp'

// Milestone thresholds tuned to feel earned — 3 is "you're trying", 5 is "a
// habit is forming", 10 is "the streak is real", 30 is "you've reshaped your
// life". Matches Duolingo's scaling cadence.
const MILESTONES = [3, 5, 10, 20, 30, 60, 90]

function nearestMilestone(current: number): number | null {
  for (const m of MILESTONES) {
    if (current === m) return m
  }
  return null
}

// Duolingo's finding — and every successful habit app's — is that loss
// aversion around a streak keeps users coming back more reliably than any
// positive-framing nudge. We surface both:
//   current  → what you'd lose by skipping tomorrow
//   personal best → the goal to beat (self-rivalry, the cleanest motivator)

function uniqueActivityDays(activities: ActivityRead[]): Set<string> {
  const set = new Set<string>()
  for (const a of activities) {
    set.add(new Date(a.started_at).toDateString())
  }
  return set
}

function currentStreak(days: Set<string>, from: Date): number {
  let n = 0
  // Allow a gap of the current day (streak doesn't break at midnight before
  // today's workout is done) — start counting from yesterday.
  for (let i = 0; i < 180; i++) {
    const day = subDays(from, i).toDateString()
    if (days.has(day)) n++
    else if (i === 0) continue // today may not have logged yet
    else break
  }
  return n
}

function longestStreak(days: Set<string>, since: Date): number {
  let longest = 0
  let cur = 0
  const today = new Date()
  const totalDays = Math.ceil(
    (today.getTime() - since.getTime()) / (1000 * 60 * 60 * 24),
  )
  for (let i = totalDays; i >= 0; i--) {
    const day = subDays(today, i).toDateString()
    if (days.has(day)) {
      cur++
      if (cur > longest) longest = cur
    } else {
      cur = 0
    }
  }
  return longest
}

export default function StreakCard() {
  const today = new Date()
  const windowStart = subDays(today, 90)
  const { data, isLoading } = useActivitiesRange(windowStart, today)

  const { current, best, beatingBest, activityDays, streakInDanger, hoursToMidnight } = useMemo(() => {
    const acts = data?.activities ?? []
    const days = uniqueActivityDays(acts)
    const current = currentStreak(days, today)
    const best = longestStreak(days, windowStart)

    // Streak danger: yesterday's streak is alive (>= 1) but today has no activity.
    // Warn only after noon so we don't nag pre-ride users.
    const yday = new Date(today); yday.setDate(today.getDate() - 1)
    const streakThroughYesterday = currentStreak(days, yday)
    const trainedToday = days.has(today.toDateString())
    const midnight = new Date(today); midnight.setHours(24, 0, 0, 0)
    const hrs = Math.max(0, Math.ceil((midnight.getTime() - today.getTime()) / 3600000))
    const danger = !trainedToday && streakThroughYesterday >= 1 && today.getHours() >= 12

    return {
      current: trainedToday ? current : streakThroughYesterday,
      best,
      beatingBest: (trainedToday ? current : streakThroughYesterday) > 0
        && (trainedToday ? current : streakThroughYesterday) >= best,
      activityDays: days,
      streakInDanger: danger,
      hoursToMidnight: hrs,
    }
  }, [data, today])

  // Animated streak number — counts up on mount
  const animatedStreak = useCountUp(current, { durationMs: 800, skipZero: false })

  // Milestone celebration — fire a one-shot flash when the current streak
  // *arrives at* a threshold we haven't celebrated yet for this session.
  // Persistent across page loads via localStorage so a returning user doesn't
  // get the same confetti twice for the same 5-day streak.
  const [flash, setFlash] = useState<number | null>(null)
  const firedRef = useRef<Set<number>>(new Set())
  useEffect(() => {
    if (prefersReducedMotion()) return
    const m = nearestMilestone(current)
    if (m == null) return
    const key = `streak-milestone-${m}`
    try {
      if (window.localStorage.getItem(key)) return
      window.localStorage.setItem(key, '1')
    } catch {
      // localStorage disabled — still allow a single in-memory fire.
      if (firedRef.current.has(m)) return
      firedRef.current.add(m)
    }
    setFlash(m)
    const t = setTimeout(() => setFlash(null), 2400)
    return () => clearTimeout(t)
  }, [current])

  if (isLoading) {
    return (
      <div
        className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5 animate-pulse"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: '1px solid var(--color-rule)',
        }}
      >
        <div
          className="h-4 w-24 rounded"
          style={{ backgroundColor: 'var(--color-rule)' }}
        />
        <div
          className="mt-3 h-8 rounded"
          style={{ backgroundColor: 'var(--color-rule)' }}
        />
      </div>
    )
  }

  // Tier-based tint — celebrate, don't just report. The "big number" should
  // visibly change character at thresholds that feel meaningful.
  const tier: 'cold' | 'warm' | 'hot' | 'fire' =
    current === 0
      ? 'cold'
      : current >= 10
        ? 'fire'
        : current >= 5
          ? 'hot'
          : 'warm'

  const tierColor: Record<typeof tier, string> = {
    cold: 'var(--color-muted)',
    warm: 'var(--color-forest-2)',
    hot: '#FF9F0A',
    fire: '#FF6430',
  }

  const tierGradient: Record<typeof tier, string | undefined> = {
    cold: undefined,
    warm: 'radial-gradient(120% 80% at 100% 0%, rgba(52, 199, 89, 0.12), transparent 60%)',
    hot: 'radial-gradient(120% 80% at 100% 0%, rgba(255, 159, 10, 0.14), transparent 60%)',
    fire: 'radial-gradient(120% 80% at 100% 0%, rgba(255, 100, 48, 0.18), transparent 60%)',
  }

  const headline =
    current === 0
      ? 'Start today · build a streak'
      : current === 1
        ? 'Day 1 of a new streak'
        : `${animatedStreak}-day streak`

  const subline =
    streakInDanger
      ? `${hoursToMidnight}h until midnight. Train today or this chain snaps to zero.`
      : current === 0
        ? "Any session starts the engine. Day 1 is harder than day 50."
        : beatingBest
          ? `You're writing your longest chapter. Don't stop now.`
          : best > current
            ? `${best - current} to tie your best. Break ${best} and you've reshaped a quarter.`
            : `This is who you are now — a rider who shows up.`

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5 relative overflow-hidden"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: streakInDanger
          ? '1px solid rgba(255, 159, 10, 0.55)'
          : '1px solid var(--color-rule)',
        backgroundImage: streakInDanger
          ? 'radial-gradient(120% 80% at 100% 0%, rgba(255, 159, 10, 0.18), transparent 60%)'
          : tierGradient[tier],
        boxShadow: streakInDanger
          ? '0 0 0 0 rgba(255, 159, 10, 0.35)'
          : 'none',
        animation: streakInDanger ? 'streak-danger-pulse 2.4s ease-in-out infinite' : undefined,
      }}
    >
      {streakInDanger && (
        <>
          <div
            className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{
              backgroundColor: 'rgba(255, 159, 10, 0.14)',
              border: '1px solid rgba(255, 159, 10, 0.4)',
              zIndex: 2,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: 'var(--color-amber)',
                animation: 'streak-dot-pulse 1.2s ease-in-out infinite',
              }}
            />
            <span
              className="eyebrow"
              style={{ color: 'var(--color-amber)', fontSize: 9, letterSpacing: '0.2em' }}
            >
              {hoursToMidnight}H TO MIDNIGHT
            </span>
          </div>
          <style>{`
            @keyframes streak-danger-pulse {
              0%, 100% { box-shadow: 0 0 0 0 rgba(255, 159, 10, 0.30); }
              50% { box-shadow: 0 0 0 10px rgba(255, 159, 10, 0); }
            }
            @keyframes streak-dot-pulse {
              0%, 100% { opacity: 0.5; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.3); }
            }
          `}</style>
        </>
      )}
      {/* Milestone flash — brief, unrepeatable celebration when the user hits
         a streak threshold for the first time. Ring expands + fades, then the
         badge slides in from the top-right. Keeps the card clean at rest. */}
      {flash && (
        <>
          <div
            className="absolute inset-0 rounded-[20px] pointer-events-none"
            style={{
              boxShadow: `0 0 0 0 ${tierColor[tier]}`,
              animation: 'streak-flash 1.6s ease-out forwards',
              opacity: 0.8,
            }}
            aria-hidden
          />
          <div
            className="absolute top-3 right-3 num-mono text-[10px] px-2 py-1 rounded-full pointer-events-none"
            style={{
              color: 'var(--color-paper)',
              backgroundColor: tierColor[tier],
              animation: 'streak-badge 2.4s cubic-bezier(.22,1,.36,1) forwards',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            {flash}-day milestone
          </div>
          <style>{`
            @keyframes streak-flash {
              0%   { box-shadow: 0 0 0 0 color-mix(in srgb, ${tierColor[tier]} 60%, transparent); }
              60%  { box-shadow: 0 0 0 14px color-mix(in srgb, ${tierColor[tier]} 8%, transparent); }
              100% { box-shadow: 0 0 0 20px color-mix(in srgb, ${tierColor[tier]} 0%, transparent); }
            }
            @keyframes streak-badge {
              0%   { opacity: 0; transform: translateY(-6px) scale(0.9); }
              12%  { opacity: 1; transform: translateY(0) scale(1); }
              80%  { opacity: 1; transform: translateY(0) scale(1); }
              100% { opacity: 0; transform: translateY(-2px) scale(1); }
            }
          `}</style>
        </>
      )}
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
            tier === 'fire' ? 'animate-pulse' : ''
          }`}
          style={{
            backgroundColor: `color-mix(in srgb, ${tierColor[tier]} 14%, transparent)`,
          }}
          aria-hidden
        >
          {beatingBest ? (
            <Trophy
              size={18}
              strokeWidth={2}
              style={{ color: tierColor[tier] }}
            />
          ) : (
            <Flame
              size={18}
              strokeWidth={2}
              style={{ color: tierColor[tier] }}
            />
          )}
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span
            className="eyebrow"
            style={{
              color: 'var(--color-muted)',
              letterSpacing: '0.22em',
            }}
          >
            Consistency
          </span>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className="num-display leading-none"
              style={{
                fontSize: 'clamp(22px, 3vw, 28px)',
                color: 'var(--color-ink)',
              }}
            >
              {headline}
            </span>
            {best > 0 && (
              <span
                className="num-mono text-[11px]"
                style={{ color: 'var(--color-muted)' }}
                title="Your longest streak in the last 90 days"
              >
                · best {best}
              </span>
            )}
          </div>
          <p
            className="text-[13px] leading-relaxed mt-1"
            style={{ color: 'var(--color-ink-2)' }}
          >
            {subline}
          </p>

          {/* 30-day dot grid + consistency % — the "don't break the chain" visual.
             5 cols × 6 rows, grouped by week (Mon–Sun). Most recent is bottom-right.
             Consistency % shows the fraction of days with activity in 30d window. */}
          <div className="mt-3">
            <div className="flex gap-1.5" aria-label="Last 30 days activity">
              {Array.from({ length: 5 }, (_, col) => (
                <div key={col} className="flex flex-col gap-1.5">
                  {Array.from({ length: 6 }, (_, row) => {
                    const dotIndex = col * 6 + row  // 0=oldest, 29=today
                    const d = subDays(today, 29 - dotIndex)
                    const active = activityDays.has(d.toDateString())
                    const isToday = dotIndex === 29
                    return (
                      <span
                        key={row}
                        title={`${format(d, 'EEE d MMM')}${active ? ' · trained' : ''}`}
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 3,
                          backgroundColor: active ? tierColor[tier] : 'var(--color-rule)',
                          opacity: active ? (isToday ? 1 : 0.8) : 0.4,
                          boxShadow: active && isToday ? `0 0 5px ${tierColor[tier]}` : undefined,
                          transition: 'background-color 300ms ease',
                          animation: `fade-in 200ms ease-out ${dotIndex * 20}ms both`,
                        }}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
            {/* Consistency metric below the grid */}
            {(() => {
              const activeDays = Array.from({ length: 30 }, (_, i) =>
                activityDays.has(subDays(today, 29 - i).toDateString()) ? 1 : 0
              ).reduce((s, v) => s + v, 0)
              const consistencyPct = Math.round((activeDays / 30) * 100)
              return (
                <div className="flex items-center gap-2 mt-2">
                  <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 9 }}>
                    30-DAY CONSISTENCY
                  </span>
                  <span
                    className="num-mono text-[11px]"
                    style={{
                      color: consistencyPct >= 70
                        ? tierColor[tier]
                        : consistencyPct >= 40
                          ? 'var(--color-amber)'
                          : 'var(--color-muted)',
                    }}
                  >
                    {activeDays} / 30 days · {consistencyPct}%
                  </span>
                </div>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
