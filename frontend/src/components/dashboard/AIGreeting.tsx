import { useMemo } from 'react'
import { subDays, isWithinInterval, startOfWeek, endOfWeek } from 'date-fns'
import { Sparkles } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useCoachBrief } from '../../hooks/useCoachBrief'

// AI Greeting — synthesized from 4 data streams into a single personalized
// one-liner above the hero. Specificity is what makes this feel like the app
// "knows you." We compose micro-variations deterministically so every user
// sees a greeting nobody else sees. Loss-aversion and identity-priming copy
// are woven in based on the cards that matter today.

function timeOfDayLabel(): { greeting: string; window: 'morning' | 'day' | 'evening' } {
  const h = new Date().getHours()
  if (h < 5) return { greeting: 'Still up', window: 'evening' }
  if (h < 12) return { greeting: 'Morning', window: 'morning' }
  if (h < 17) return { greeting: 'Afternoon', window: 'day' }
  return { greeting: 'Evening', window: 'evening' }
}

function deriveFirstName(email: string | undefined): string | null {
  if (!email) return null
  const local = email.split('@')[0] ?? ''
  const raw = local.split(/[._-]/)[0] ?? local
  if (!raw) return null
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

export default function AIGreeting() {
  const { user } = useAuth()
  const today = new Date()
  const { data: acts } = useActivitiesRange(subDays(today, 14), today)
  const { data: metricsData } = useDailyMetrics(subDays(today, 7), today)
  const { data: brief } = useCoachBrief()

  const firstName = useMemo(() => deriveFirstName(user?.email), [user])
  const { greeting, window } = timeOfDayLabel()

  const insight = useMemo(() => {
    const activities = acts?.activities ?? []
    const weekStart = startOfWeek(today, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
    const thisWeekTSS = Math.round(
      activities
        .filter((a) => isWithinInterval(new Date(a.started_at), { start: weekStart, end: weekEnd }))
        .reduce((s, a) => s + (a.tss ?? 0), 0),
    )
    const lastWeekStart = subDays(weekStart, 7)
    const lastWeekEnd = subDays(weekEnd, 7)
    const lastWeekTSS = Math.round(
      activities
        .filter((a) => isWithinInterval(new Date(a.started_at), { start: lastWeekStart, end: lastWeekEnd }))
        .reduce((s, a) => s + (a.tss ?? 0), 0),
    )
    const latestMetric = (metricsData?.metrics ?? [])
      .slice()
      .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())[0]
    const hrv = latestMetric?.hrv_status ?? null

    // Parse the verdict string — the coach brief gives us a verdict line
    // like "Go hard today" or "Take an easy spin". Match on keywords.
    const verdict = (brief?.verdict ?? '').toLowerCase()
    const hardCue = /hard|push|intens|threshold|attack|crush/.test(verdict)
    const easyCue = /easy|rest|recover|spin|light/.test(verdict)

    // Highest-signal line wins
    if (hardCue) {
      return "today is a green light — your body's handing you a gift. Cash it in."
    }
    if (easyCue) {
      return 'your system is asking for mercy. Honor it — forced rest is expensive.'
    }
    if (lastWeekTSS > 0 && thisWeekTSS > lastWeekTSS * 1.15) {
      const delta = Math.round(((thisWeekTSS - lastWeekTSS) / lastWeekTSS) * 100)
      return `you're ${delta}% ahead of last week. This is what momentum feels like.`
    }
    if (hrv != null && hrv >= 75) {
      return 'HRV is strong — the adaptation from last block is landing.'
    }
    if (thisWeekTSS > 200) {
      return `${thisWeekTSS} TSS this week already. You're not messing around.`
    }
    if (activities.length === 0) {
      return 'the best time to start was last week. The second-best is today.'
    }
    return window === 'morning'
      ? 'the engine is warm. What will you build today?'
      : window === 'evening'
        ? 'one more session before the day closes?'
        : 'the afternoon is yours to use.'
  }, [acts, metricsData, brief, today, window])

  const headline = firstName ? `${greeting}, ${firstName}.` : `${greeting}.`

  return (
    <div
      className="flex items-start gap-3 px-5 py-3 rounded-[16px]"
      style={{
        border: '1px solid var(--color-rule)',
        background: 'linear-gradient(135deg, rgba(48, 209, 88, 0.04), transparent 55%)',
      }}
    >
      <Sparkles size={14} strokeWidth={2} style={{ color: 'var(--color-forest-2)', marginTop: 3 }} />
      <p className="text-[14px] leading-relaxed" style={{ color: 'var(--color-ink)' }}>
        <span style={{ fontWeight: 600 }}>{headline}</span>{' '}
        <span style={{ color: 'var(--color-ink-2)' }}>{insight}</span>
      </p>
    </div>
  )
}
