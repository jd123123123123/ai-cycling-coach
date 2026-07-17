import { useMemo, useEffect, useState } from 'react'
import { subDays, format } from 'date-fns'
import { Flame, CheckCircle2, Circle, Target } from 'lucide-react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useCountUp } from '../../hooks/useCountUp'
import { useLocale } from '../../contexts/LocaleContext'

// StreakStrip — compact, addictive replacement for the big StreakCard.
// Designed to sit HIGH on the page. Three daily goals surface today's
// progress with tiny rings; 14-day history reads as a chain of dots that
// are filled when ALL goals hit. Current + best streak anchor the right.
//
// Daily goals (hard-coded, intentionally few — Duolingo's 3-task design):
//   1. TRAIN    — any activity today
//   2. CHECK-IN — morning check-in submitted (localStorage)
//   3. RECOVER  — sleep score ≥ 70 (proxy for quality sleep)
//
// A day counts for the streak only when all 3 goals are met. Partial days
// are shown as half-filled dots — visible progress even on imperfect days.

interface DayStatus {
  date: Date
  trained: boolean
  checkedIn: boolean
  recovered: boolean
  completion: number // 0..1
}

const CHECKIN_STORAGE_KEY = 'morning_checkin'

function readCheckInDates(): Set<string> {
  try {
    const raw = localStorage.getItem(CHECKIN_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as { date?: string }
    return parsed.date ? new Set([parsed.date]) : new Set()
  } catch {
    return new Set()
  }
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Mini ring — CSS conic gradient, tiny, addictive. */
function Ring({
  pct,
  color,
  size = 22,
  stroke = 2.5,
  icon,
}: {
  pct: number
  color: string
  size?: number
  stroke?: number
  icon: React.ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - pct)
  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--color-rule)"
          strokeWidth={stroke}
          fill="none"
          opacity={0.5}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <span
        className="absolute"
        style={{ color, lineHeight: 1 }}
      >
        {icon}
      </span>
    </div>
  )
}

function GoalPill({
  label,
  done,
  progress,
  title,
}: {
  label: string
  done: boolean
  progress: number
  title?: string
}) {
  const color = done ? '#30D158' : 'var(--color-muted)'
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-full transition-colors"
      title={title}
      style={{
        cursor: title ? 'help' : undefined,
        backgroundColor: done ? 'rgba(48, 209, 88, 0.08)' : 'transparent',
        border: done
          ? '1px solid rgba(48, 209, 88, 0.28)'
          : '1px solid var(--color-rule)',
      }}
    >
      <Ring
        pct={progress}
        color={color}
        icon={done
          ? <CheckCircle2 size={11} strokeWidth={2.5} />
          : <Circle size={11} strokeWidth={2} />
        }
      />
      <span
        className="eyebrow shrink-0"
        style={{
          fontSize: 10.5,
          letterSpacing: '0.22em',
          color: done ? 'var(--color-ink)' : 'var(--color-muted)',
          fontWeight: done ? 600 : 400,
        }}
      >
        {label}
      </span>
    </div>
  )
}

export default function StreakStrip() {
  const { locale, t } = useLocale()
  const today = new Date()
  const windowStart = subDays(today, 90)
  const metricsStart = subDays(today, 14)

  const { data: actsData } = useActivitiesRange(windowStart, today)
  const { data: metricsData } = useDailyMetrics(metricsStart, today)

  // Subscribe to localStorage changes for check-in key
  const [checkInDates, setCheckInDates] = useState<Set<string>>(() => readCheckInDates())
  useEffect(() => {
    function onStorage() { setCheckInDates(readCheckInDates()) }
    window.addEventListener('storage', onStorage)
    // Refresh on mount (localStorage written after component mount)
    const id = setInterval(onStorage, 2000)
    return () => {
      window.removeEventListener('storage', onStorage)
      clearInterval(id)
    }
  }, [])

  const { days14, currentStreak, bestStreak, todayStatus } = useMemo(() => {
    const activities = actsData?.activities ?? []
    const activityDays = new Set(activities.map((a) => isoDay(new Date(a.started_at))))

    const sleepMap = new Map<string, number>()
    for (const m of metricsData?.metrics ?? []) {
      const day = m.date ?? (m.recorded_at ? isoDay(new Date(m.recorded_at)) : null)
      if (!day) continue
      if (m.sleep_score != null) sleepMap.set(day, m.sleep_score)
    }

    const statusFor = (d: Date): DayStatus => {
      const key = isoDay(d)
      const trained = activityDays.has(key)
      const checkedIn = checkInDates.has(key)
      const sleep = sleepMap.get(key) ?? null
      const recovered = sleep != null && sleep >= 70
      const completion = (Number(trained) + Number(checkedIn) + Number(recovered)) / 3
      return { date: d, trained, checkedIn, recovered, completion }
    }

    // Today + last 14 for the chain
    const chain: DayStatus[] = []
    for (let i = 13; i >= 0; i--) {
      chain.push(statusFor(subDays(today, i)))
    }

    // Current streak: consecutive days (from today back) where completion === 1
    // If today is incomplete but yesterday was, streak counts through yesterday
    // (so users don't lose the number mid-day while still working on today).
    let cur = 0
    for (let i = 0; i < 90; i++) {
      const s = statusFor(subDays(today, i))
      if (s.completion === 1) cur++
      else if (i === 0) continue // allow in-progress today without breaking streak
      else break
    }

    // Best streak in last 90 days
    let best = 0
    let run = 0
    for (let i = 89; i >= 0; i--) {
      const s = statusFor(subDays(today, i))
      if (s.completion === 1) {
        run++
        if (run > best) best = run
      } else {
        run = 0
      }
    }

    return {
      days14: chain,
      currentStreak: cur,
      bestStreak: best,
      todayStatus: statusFor(today),
    }
  }, [actsData, metricsData, checkInDates, today])

  const countedStreak = useCountUp(currentStreak, { durationMs: 800 })

  const tier: 'cold' | 'warm' | 'hot' | 'fire' =
    currentStreak === 0
      ? 'cold'
      : currentStreak >= 10
        ? 'fire'
        : currentStreak >= 5
          ? 'hot'
          : 'warm'

  const tierColor = {
    cold: 'var(--color-muted)',
    warm: 'var(--color-forest-2)',
    hot: '#FF9F0A',
    fire: '#FF6430',
  }[tier]

  // Addictive: if today is partially done, the number gently pulses to prompt
  // completion; if fully done, glows calmly.
  const todayDone = todayStatus.completion === 1

  return (
    <div
      className="flex flex-col gap-3 px-5 py-4 rounded-[16px]"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: tier === 'cold'
          ? '1px solid var(--color-rule)'
          : `1px solid color-mix(in srgb, ${tierColor} 30%, var(--color-rule))`,
        backgroundImage: tier === 'cold'
          ? undefined
          : `radial-gradient(80% 60% at 0% 0%, color-mix(in srgb, ${tierColor} 10%, transparent), transparent 60%)`,
      }}
    >
      <style>{`
        @keyframes streak-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>

      {/* Top row — streak number + goal rings + best */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full"
            style={{
              backgroundColor: `color-mix(in srgb, ${tierColor} 14%, transparent)`,
              animation: todayDone ? undefined : 'streak-pulse 2.4s ease-in-out infinite',
            }}
          >
            <Flame size={16} strokeWidth={2.2} style={{ color: tierColor }} />
          </div>
          <div className="flex items-baseline gap-2 min-w-0">
            <span
              className="num-display leading-none"
              style={{
                fontSize: 'clamp(24px, 2.8vw, 30px)',
                color: 'var(--color-ink)',
              }}
            >
              {countedStreak}
            </span>
            <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em', fontSize: 10 }}>
              {locale === 'de' ? (currentStreak === 1 ? 'TAG' : 'TAGE') : `DAY${currentStreak === 1 ? '' : 'S'}`}
            </span>
            {bestStreak > currentStreak && (
              <span
                className="num-mono text-[11px] shrink-0"
                style={{ color: 'var(--color-muted)' }}
                title={locale === 'de' ? `Bestwert ${bestStreak} Tage in den letzten 90 T` : `Best ${bestStreak} days in last 90d`}
              >
                · {locale === 'de' ? 'Best' : 'best'} {bestStreak}
              </span>
            )}
          </div>
        </div>

        {/* Today's 3 goals as pills with rings */}
        <div className="flex items-center gap-2 flex-wrap">
          <GoalPill
            label={t('streak_goal_train')}
            done={todayStatus.trained}
            progress={todayStatus.trained ? 1 : 0}
          />
          <GoalPill
            label={t('streak_goal_checkin')}
            done={todayStatus.checkedIn}
            progress={todayStatus.checkedIn ? 1 : 0}
          />
          <GoalPill
            label={t('streak_goal_recover')}
            done={todayStatus.recovered}
            progress={todayStatus.recovered ? 1 : 0}
            title={locale === 'de' ? 'Ziel erreicht bei Schlaf-Score ≥ 70' : 'Met when sleep score ≥ 70'}
          />
        </div>
      </div>

      {/* 14-day chain — each day is a tiny stacked indicator */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="eyebrow shrink-0" style={{ color: 'var(--color-muted)', fontSize: 10.5, letterSpacing: '0.22em' }}>
          {locale === 'de' ? 'LETZTE 14 TAGE' : 'LAST 14 DAYS'}
        </span>
        <div className="flex items-center gap-1 flex-1 justify-center">
          {days14.map((d, i) => {
            const isTodayIdx = i === days14.length - 1
            const full = d.completion === 1
            const partial = d.completion > 0 && d.completion < 1
            const dotColor = full
              ? tierColor
              : partial
                ? 'var(--color-amber)'
                : 'var(--color-rule)'
            return (
              <div
                key={i}
                className="relative group shrink-0"
                title={locale === 'de'
                  ? `${format(d.date, 'EEE d LLL')} · ${d.trained ? '✓' : '·'} Einheit · ${d.checkedIn ? '✓' : '·'} Check-in · ${d.recovered ? '✓' : '·'} Erholung`
                  : `${format(d.date, 'EEE d LLL')} · ${d.trained ? '✓' : '·'} train · ${d.checkedIn ? '✓' : '·'} check · ${d.recovered ? '✓' : '·'} recover`}
              >
                <span
                  className="block rounded-full"
                  style={{
                    width: isTodayIdx ? 9 : 7,
                    height: isTodayIdx ? 9 : 7,
                    backgroundColor: dotColor,
                    opacity: full ? 1 : partial ? 0.7 : 0.4,
                    boxShadow: isTodayIdx && full ? `0 0 5px ${tierColor}` : undefined,
                    border: partial ? `1px solid ${tierColor}` : undefined,
                  }}
                />
              </div>
            )
          })}
        </div>
        <span className="eyebrow shrink-0 hidden sm:inline" style={{ color: 'var(--color-muted)', fontSize: 10.5, letterSpacing: '0.22em' }}>
          {locale === 'de' ? 'HEUTE' : 'TODAY'}
        </span>
      </div>

      {/* Micro status line — addictive copy */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0">
          <Target size={11} strokeWidth={2} style={{ color: todayDone ? '#30D158' : 'var(--color-muted)' }} />
          <span
            className="text-[11px] leading-snug"
            style={{ color: todayDone ? 'var(--color-ink)' : 'var(--color-ink-2)' }}
          >
            {todayDone
              ? (locale === 'de'
                  ? 'Heute abgeschlossen. Die Kette wächst auf ' + (currentStreak + (todayStatus.completion === 1 ? 0 : 1)) + '.'
                  : 'Today closed. Chain grows to ' + (currentStreak + (todayStatus.completion === 1 ? 0 : 1)) + '.')
              : todayStatus.completion === 0
                ? (locale === 'de'
                    ? 'Null von drei. Eine Einheit oder ein Check-in startet sie.'
                    : 'Zero of three. One session or one check-in starts it.')
                : (locale === 'de'
                    ? `${Math.round(todayStatus.completion * 3)} von 3 — noch ${3 - Math.round(todayStatus.completion * 3)}, um heute abzuschließen.`
                    : `${Math.round(todayStatus.completion * 3)} of 3 — ${3 - Math.round(todayStatus.completion * 3)} to close today.`)}
          </span>
        </div>
      </div>
    </div>
  )
}
