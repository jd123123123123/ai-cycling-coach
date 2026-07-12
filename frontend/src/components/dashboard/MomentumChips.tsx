import { useMemo } from 'react'
import { format, subDays } from 'date-fns'
import { TrendingUp, Target, Sparkles } from 'lucide-react'
import { useCoachBrief } from '../../hooks/useCoachBrief'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { usePMC } from '../../hooks/usePMC'
import { useLocale } from '../../contexts/LocaleContext'
import type { DailyMetric } from '../../api/dashboard'

/**
 * MomentumChips — a small-wins strip that surfaces three flavours of
 * motivating context on Today:
 *
 *   1. "Local best" chips — when today's value sets a 14-day best on a
 *      recovery / readiness marker (sleep, HRV, body battery, readiness
 *      composite, lowest RHR). Each emits a chip with a small glyph.
 *   2. "Milestone" chips — the nearest concrete countdowns: days to goal,
 *      sessions to a CTL round number, week position inside the block.
 *   3. "Streak" chip — current consecutive-training-day count (lightweight,
 *      lives off the activity list, not the strict 3-goal definition).
 *
 * Everything is computed client-side from existing hooks. Renders nothing
 * if no chip is meaningful — a no-data day is silent, not noisy.
 */

interface Chip {
  key: string
  icon: React.ReactNode
  label: string
  tone: 'good' | 'caution' | 'neutral'
}

const TONE: Record<'good' | 'caution' | 'neutral', string> = {
  good: 'var(--color-good)',
  caution: 'var(--color-caution)',
  neutral: 'var(--color-ink-2)',
}

function maxBy<T>(xs: T[], get: (x: T) => number | null | undefined): T | null {
  let best: T | null = null
  let bestVal = -Infinity
  for (const x of xs) {
    const v = get(x)
    if (v == null) continue
    if (v > bestVal) { bestVal = v; best = x }
  }
  return best
}

function minBy<T>(xs: T[], get: (x: T) => number | null | undefined): T | null {
  let best: T | null = null
  let bestVal = Infinity
  for (const x of xs) {
    const v = get(x)
    if (v == null) continue
    if (v < bestVal) { bestVal = v; best = x }
  }
  return best
}

export default function MomentumChips() {
  const { locale } = useLocale()
  const today = useMemo(() => new Date(), [])
  const { data: brief } = useCoachBrief()
  const { data: metricsResp } = useDailyMetrics(useMemo(() => subDays(today, 14), [today]), today)
  // Use a long window so CTL is fully seeded (a 14-day window starts CTL near
  // zero and under-reports it, contradicting the Form & Progress panel's CTL).
  const { data: pmc } = usePMC(90)

  const metrics: DailyMetric[] = metricsResp?.metrics ?? []
  const pmcEntries = pmc?.entries ?? []

  const chips: Chip[] = []

  // ── Local best chips ──────────────────────────────────────────────
  // Today's metric row is the latest entry; compare against the previous
  // 13 (excluding today itself).
  if (metrics.length >= 4) {
    const latest = metrics[metrics.length - 1]
    const prior = metrics.slice(0, -1)
    const todayKey = format(today, 'yyyy-MM-dd')
    const latestIsToday =
      latest.date === todayKey ||
      (latest.recorded_at && latest.recorded_at.slice(0, 10) === todayKey)

    if (latestIsToday) {
      const sleep = latest.sleep_score
      const sleepPriorMax = maxBy(prior, (m) => m.sleep_score)?.sleep_score ?? null
      if (sleep != null && sleepPriorMax != null && sleep > sleepPriorMax && sleep >= 75) {
        chips.push({
          key: 'sleep-best',
          icon: <Sparkles size={11} strokeWidth={2.2} />,
          label: locale === 'de' ? `Bester Schlaf in 14 T · ${sleep}` : `Best sleep in 14 d · ${sleep}`,
          tone: 'good',
        })
      }

      const hrv = latest.hrv_status
      const hrvPriorMax = maxBy(prior, (m) => m.hrv_status)?.hrv_status ?? null
      if (hrv != null && hrvPriorMax != null && hrv > hrvPriorMax) {
        chips.push({
          key: 'hrv-best',
          icon: <TrendingUp size={11} strokeWidth={2.2} />,
          label: locale === 'de' ? `Top-HRV in 14 T · ${hrv}` : `Top HRV in 14 d · ${hrv}`,
          tone: 'good',
        })
      }

      const rhr = latest.resting_hr
      const rhrPriorMin = minBy(prior, (m) => m.resting_hr)?.resting_hr ?? null
      if (rhr != null && rhrPriorMin != null && rhr < rhrPriorMin) {
        chips.push({
          key: 'rhr-best',
          icon: <TrendingUp size={11} strokeWidth={2.2} />,
          label: locale === 'de' ? `Niedrigste RHR in 14 T · ${rhr}` : `Lowest RHR in 14 d · ${rhr}`,
          tone: 'good',
        })
      }
    }
  }

  // ── Streak chip removed ───────────────────────────────────────────
  // The consecutive-day streak lives once, in the dedicated StreakStrip
  // (its strict 3-goal definition). A second, looser streak here read as a
  // contradictory duplicate, so it was dropped.

  // ── Milestone chips ───────────────────────────────────────────────
  const evidence = (brief?.evidence as Record<string, unknown> | undefined) ?? {}
  const athlete = evidence.athlete as Record<string, unknown> | undefined
  const daysToGoal = athlete?.days_to_goal as number | null | undefined
  const goalName = (athlete?.goal_target as string | undefined) ?? null

  if (typeof daysToGoal === 'number' && daysToGoal > 0 && goalName) {
    // Days to goal at week-resolution feels less anxiety-inducing than the
    // bare day count + already lives in the hero. Keep this chip lighter:
    // weekend countdown for races inside a month, else weeks-to-event.
    const text =
      daysToGoal <= 28
        ? locale === 'de'
          ? `${daysToGoal} T bis ${goalName}`
          : `${daysToGoal} d to ${goalName}`
        : locale === 'de'
          ? `${Math.ceil(daysToGoal / 7)} Wochen bis ${goalName}`
          : `${Math.ceil(daysToGoal / 7)} weeks to ${goalName}`
    chips.push({
      key: 'event-countdown',
      icon: <Target size={11} strokeWidth={2.2} />,
      label: text,
      tone: 'neutral',
    })
  }

  // Fitness (CTL) milestone — the next round-5 number strictly ABOVE current
  // CTL, so it always reads as a forward target (never a number below where
  // the athlete already sits). Labelled "Fitness (CTL)" to line up with the
  // Form & Fortschritt panel's fitness marker.
  if (pmcEntries.length > 0) {
    const latest = pmcEntries[pmcEntries.length - 1]
    const ctl = latest.ctl
    // Round strictly up to the next multiple of 5 above the current value.
    const nextRound = (Math.floor(ctl / 5) + 1) * 5
    const gap = nextRound - ctl
    // Average daily CTL gain over the last 7 days
    const prior7 = pmcEntries.length >= 8 ? pmcEntries[pmcEntries.length - 8] : pmcEntries[0]
    const dailyGain = (ctl - prior7.ctl) / 7
    if (dailyGain > 0.05) {
      const daysToTarget = Math.ceil(gap / dailyGain)
      if (daysToTarget > 0 && daysToTarget <= 30) {
        chips.push({
          key: 'ctl-milestone',
          icon: <TrendingUp size={11} strokeWidth={2.2} />,
          label: locale === 'de' ? `~${daysToTarget} T bis Fitness ${nextRound}` : `~${daysToTarget} d to Fitness ${nextRound}`,
          tone: 'good',
        })
      }
    }
  }

  if (chips.length === 0) return null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {chips.map((c) => (
        <span
          key={c.key}
          className="num-mono text-[11px] px-2 py-1 rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
          style={{
            color: TONE[c.tone],
            border: `1px solid color-mix(in srgb, ${TONE[c.tone]} 32%, var(--color-rule))`,
            backgroundColor: `color-mix(in srgb, ${TONE[c.tone]} 6%, transparent)`,
          }}
        >
          <span style={{ color: TONE[c.tone] }}>{c.icon}</span>
          {c.label}
        </span>
      ))}
    </div>
  )
}
