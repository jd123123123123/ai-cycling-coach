import { useMemo } from 'react'
import { Sparkles, TrendingDown, TrendingUp, Flame, Moon, Heart, Activity, Award } from 'lucide-react'
import { subDays } from 'date-fns'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import type { DailyMetric, ActivityRead } from '../../api/dashboard'

// The "wow, they noticed that" card. Designed to surface one observation
// per session that feels smart, specific, and body-aware. We generate a
// pool of candidate insights from the data, rank them, and show the top one.
// Every line is deterministic — no dice rolls in production UX.

type Tone = 'positive' | 'caution' | 'neutral'

interface Insight {
  icon: typeof Sparkles
  headline: string
  body: string
  tone: Tone
  /** Used to rank candidates — higher = more interesting signal. */
  strength: number
}

// Tone → CSS var for left-bar and eyebrow dot. Single source of truth.
const TONE_COLOR: Record<Tone, string> = {
  positive: 'var(--color-forest-2)',
  caution:  'var(--color-alert)',
  neutral:  'var(--color-ink-2)',
}

function mean(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v))
  if (clean.length === 0) return null
  return clean.reduce((s, v) => s + v, 0) / clean.length
}

function lastNonNull<T>(arr: (T | null | undefined)[]): T | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i]
    if (v != null) return v
  }
  return null
}

function computeInsights(
  metrics: DailyMetric[],
  activities: ActivityRead[],
): Insight[] {
  const out: Insight[] = []
  // Sort newest-first once, reuse.
  const sorted = metrics
    .slice()
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  // ── Resting HR vs 30-day mean — classic recovery signal ─────────────────
  const rhrSeries = sorted.map((m) => m.resting_hr).filter((v): v is number => v != null)
  if (rhrSeries.length >= 7) {
    const latest = lastNonNull(sorted.map((m) => m.resting_hr))
    const baseline = mean(rhrSeries.slice(0, -1)) // everything before today
    if (latest != null && baseline != null) {
      const delta = latest - baseline
      if (delta <= -2) {
        out.push({
          icon: Heart,
          headline: `Resting HR ${Math.round(latest)} bpm — ${Math.abs(Math.round(delta))} below your 30-day mean`,
          body: 'Classic parasympathetic rebound. Your autonomic system is signalling recovery — a strong window for harder efforts.',
          tone: 'positive',
          strength: 70 + Math.min(30, Math.abs(delta) * 5),
        })
      } else if (delta >= 3) {
        out.push({
          icon: Heart,
          headline: `Resting HR ${Math.round(latest)} bpm — ${Math.round(delta)} above your 30-day mean`,
          body: 'Sympathetic load is elevated. Prioritise Z1–Z2 aerobic volume over intensity today.',
          tone: 'caution',
          strength: 65 + Math.min(25, delta * 4),
        })
      }
    }
  }

  // ── HRV 7-day vs 30-day ─────────────────────────────────────────────────
  const hrvSeries = sorted.map((m) => m.hrv_status).filter((v): v is number => v != null)
  if (hrvSeries.length >= 10) {
    const last7 = hrvSeries.slice(-7)
    const prior = hrvSeries.slice(0, -7)
    const avg7 = mean(last7)
    const avgPrior = mean(prior)
    if (avg7 != null && avgPrior != null && avgPrior > 0) {
      const pct = ((avg7 - avgPrior) / avgPrior) * 100
      if (pct >= 5) {
        out.push({
          icon: TrendingUp,
          headline: `HRV up ${Math.round(pct)}% over the last 7 days`,
          body: 'Adaptation is landing. This is the moment to cash in on the fitness you just built — quality sessions pay back now.',
          tone: 'positive',
          strength: 60 + Math.min(30, pct),
        })
      } else if (pct <= -5) {
        out.push({
          icon: TrendingDown,
          headline: `HRV down ${Math.abs(Math.round(pct))}% over the last 7 days`,
          body: 'Your system is flagging load. One extra easy day now beats a forced taper in ten.',
          tone: 'caution',
          strength: 60 + Math.min(30, Math.abs(pct)),
        })
      }
    }
  }

  // ── Sleep streak ────────────────────────────────────────────────────────
  const sleepSeries = sorted.map((m) => m.sleep_score ?? null)
  let sleepStreak = 0
  for (let i = sleepSeries.length - 1; i >= 0; i--) {
    const s = sleepSeries[i]
    if (s != null && s >= 80) sleepStreak++
    else break
  }
  if (sleepStreak >= 3) {
    out.push({
      icon: Moon,
      headline: `${sleepStreak} nights of sleep ≥ 80`,
      body: 'Recovery pipeline is full. Sleep is the single largest modifier of next-day power output — this is compounding in your favour.',
      tone: 'positive',
      strength: 55 + sleepStreak * 3,
    })
  }

  // ── Consecutive training-day streak ─────────────────────────────────────
  const today = new Date()
  const actsByDay = new Set(
    activities.map((a) => new Date(a.started_at).toDateString()),
  )
  let trainStreak = 0
  for (let i = 0; i < 30; i++) {
    const day = subDays(today, i).toDateString()
    if (actsByDay.has(day)) trainStreak++
    else break
  }
  if (trainStreak >= 4) {
    out.push({
      icon: Flame,
      headline: `${trainStreak}-day training streak`,
      body: 'Consistency compounds. The weeks you don\'t miss are the weeks that build the engine.',
      tone: 'positive',
      strength: 50 + trainStreak * 2,
    })
  }

  // ── Z2/volume comment from last 14 days ─────────────────────────────────
  const recent14 = activities.filter(
    (a) => new Date(a.started_at) > subDays(today, 14),
  )
  const hours14 = recent14.reduce(
    (s, a) => s + (a.duration_seconds ?? 0) / 3600,
    0,
  )
  if (hours14 >= 10) {
    out.push({
      icon: Activity,
      headline: `${hours14.toFixed(1)} h of training in the last 14 days`,
      body: 'Volume is what separates the aerobic engines. Seiler\'s polarized model says this is where the endurance adaptations actually live.',
      tone: 'neutral',
      strength: 40 + Math.min(25, hours14),
    })
  }

  // ── Personal records — Strava's most-clicked surface ────────────────────
  // Biggest single ride (longest-duration cycling activity in the window).
  const cycling = activities
    .filter((a) => a.sport === 'cycling' && (a.duration_seconds ?? 0) > 0)
    .sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0))
  if (cycling.length >= 2) {
    const top = cycling[0]
    const topStart = new Date(top.started_at)
    const daysSince = Math.round(
      (today.getTime() - topStart.getTime()) / (1000 * 60 * 60 * 24),
    )
    // Only interesting if the top is recent (last 10 days) — otherwise the
    // "PR" is old news.
    if (daysSince <= 10 && (top.duration_seconds ?? 0) >= 3600) {
      const hours = ((top.duration_seconds ?? 0) / 3600).toFixed(1)
      out.push({
        icon: Award,
        headline: `Longest ride in 30 days: ${hours} h`,
        body: 'Banking base miles is what lets the hard days actually stick. This is the session you\'ll thank yourself for in six weeks.',
        tone: 'positive',
        strength: 68 + Math.min(20, 10 - daysSince),
      })
    }
  }

  // Biggest TSS day in the window — pure objective PR.
  const tssByDay = new Map<string, number>()
  for (const a of activities) {
    const key = new Date(a.started_at).toDateString()
    tssByDay.set(key, (tssByDay.get(key) ?? 0) + (a.tss ?? 0))
  }
  const tssEntries = [...tssByDay.entries()].sort((a, b) => b[1] - a[1])
  if (tssEntries.length >= 3) {
    const [topDay, topTss] = tssEntries[0]
    const topDate = new Date(topDay)
    const daysSince = Math.round(
      (today.getTime() - topDate.getTime()) / (1000 * 60 * 60 * 24),
    )
    if (daysSince <= 7 && topTss >= 100) {
      out.push({
        icon: Award,
        headline: `Biggest training day in 30 days — ${Math.round(topTss)} TSS`,
        body: 'This is the spike that forces adaptation. Recovery in the next 48 hours determines whether it becomes fitness or fatigue.',
        tone: 'positive',
        strength: 72 + Math.min(15, 7 - daysSince),
      })
    }
  }

  return out.sort((a, b) => b.strength - a.strength)
}

export default function DailyInsight() {
  const today = new Date()
  const start = subDays(today, 30)

  const { data: metricsData, isLoading: mLoad } = useDailyMetrics(start, today)
  const { data: actData, isLoading: aLoad } = useActivitiesRange(start, today)

  const insights = useMemo(
    () =>
      computeInsights(
        metricsData?.metrics ?? [],
        actData?.activities ?? [],
      ),
    [metricsData, actData],
  )

  const top = insights[0]
  const secondary = insights.slice(1, 3)

  if (mLoad || aLoad) {
    return (
      <div
        className="paper-grain rounded-[20px] px-5 py-5 sm:px-6 sm:py-6"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: '1px solid var(--color-rule)',
        }}
      >
        <div className="h-3 w-24 rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
        <div className="mt-4 h-8 w-3/4 rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
        <div className="mt-2 h-4 rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
      </div>
    )
  }

  if (!top) return null

  const toneColorVar = TONE_COLOR[top.tone]

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-5 sm:px-6 sm:py-6 relative overflow-hidden"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
        borderLeft: `3px solid ${toneColorVar}`,
      }}
    >
      {/* Top label — with 8×8 tier-color dot */}
      <div className="flex items-center gap-2 mb-4">
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: 9999,
            background: toneColorVar,
            marginRight: 2,
            flexShrink: 0,
          }}
        />
        <Sparkles size={12} strokeWidth={1.8} style={{ color: toneColorVar }} />
        <span className="eyebrow" style={{ color: toneColorVar, letterSpacing: '0.22em' }}>
          Today&apos;s signal
        </span>
        {secondary.length > 0 && (
          <span
            className="num-mono text-[10px] px-1.5 py-0.5 rounded-full"
            style={{
              color: 'var(--color-muted)',
              backgroundColor: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.09)',
            }}
          >
            +{secondary.length} more
          </span>
        )}
      </div>

      {/* Primary insight — no icon tile */}
      <div className="flex flex-col gap-1.5 min-w-0">
        <h3
          className="num-display leading-tight"
          style={{ fontSize: 'clamp(20px, 2.8vw, 26px)', color: 'var(--color-ink)' }}
        >
          {top.headline}
        </h3>
        <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
          {top.body}
        </p>
      </div>

      {/* Secondary signals — compact pills */}
      {secondary.length > 0 && (
        <div
          className="flex flex-col gap-2 mt-4 pt-4"
          style={{ borderTop: '1px solid var(--color-rule)' }}
        >
          {secondary.map((s, i) => {
            const sc = TONE_COLOR[s.tone]
            return (
              <div key={i} className="flex items-center gap-2.5 min-w-0">
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: 9999,
                    background: sc,
                    flexShrink: 0,
                  }}
                />
                <span className="text-[12px] leading-snug truncate" style={{ color: 'var(--color-ink-2)' }}>
                  {s.headline}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
