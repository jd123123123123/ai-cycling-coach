import { useMemo } from 'react'
import {
  format,
  isSameDay,
  isWithinInterval,
  startOfWeek,
  subDays,
  subWeeks,
} from 'date-fns'
import { Sparkles, ArrowUpRight } from 'lucide-react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import type { ActivityRead } from '../../api/dashboard'
import { useCountUp } from '../../hooks/useCountUp'

// Strava's weekly recap is the most shared screen in the app. We don't need
// the full story flow to get 80% of the value: a single card with three
// big numbers + one headline celebration beats a buried tab every time.
// Numbers are left ready for a count-up treatment; we keep them static for
// now to avoid animation cost on the critical path.

function totalsFor(
  activities: ActivityRead[],
  start: Date,
  end: Date,
): { count: number; hours: number; tss: number; distanceKm: number } {
  const inWindow = activities.filter((a) => {
    const d = new Date(a.started_at)
    return isWithinInterval(d, { start, end })
  })
  return {
    count: inWindow.length,
    hours: inWindow.reduce((s, a) => s + (a.duration_seconds ?? 0), 0) / 3600,
    tss: inWindow.reduce((s, a) => s + (a.tss ?? 0), 0),
    distanceKm:
      inWindow.reduce((s, a) => s + (a.distance_meters ?? 0), 0) / 1000,
  }
}

function signedPercent(curr: number, prev: number): {
  text: string
  positive: boolean | null
} {
  if (prev <= 0) return { text: curr > 0 ? 'new ground' : '', positive: true }
  const pct = ((curr - prev) / prev) * 100
  if (!Number.isFinite(pct) || Math.abs(pct) < 2) return { text: 'held steady', positive: null }
  return {
    text: `${pct > 0 ? '+' : ''}${Math.round(pct)}% vs prior week`,
    positive: pct > 0,
  }
}

function celebrationLine(
  last: ReturnType<typeof totalsFor>,
  prev: ReturnType<typeof totalsFor>,
  activities: ActivityRead[],
  lastStart: Date,
  lastEnd: Date,
): string {
  // Rank a small pool of candidate headlines by notability.
  const candidates: Array<{ strength: number; text: string }> = []

  if (last.count === 0) {
    return 'A full rest week — the body builds on days you don\'t ride too.'
  }

  if (last.tss > prev.tss * 1.15 && last.tss > 100) {
    candidates.push({
      strength: 80,
      text: `Your biggest training week in a while — ${Math.round(last.tss)} TSS, ${last.hours.toFixed(1)} h banked.`,
    })
  }

  if (last.hours >= 10) {
    candidates.push({
      strength: 70,
      text: `${last.hours.toFixed(1)} hours on the bike — that\'s a real training week.`,
    })
  }

  const longest = activities
    .filter((a) =>
      isWithinInterval(new Date(a.started_at), {
        start: lastStart,
        end: lastEnd,
      }),
    )
    .sort(
      (a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0),
    )[0]
  if (longest && (longest.duration_seconds ?? 0) >= 3 * 3600) {
    const h = (longest.duration_seconds ?? 0) / 3600
    candidates.push({
      strength: 75,
      text: `Long day: ${h.toFixed(1)} h on ${format(new Date(longest.started_at), 'EEEE')}. That\'s the ride that builds the base.`,
    })
  }

  if (last.count >= 5) {
    candidates.push({
      strength: 60,
      text: `${last.count} sessions in seven days — consistency is the real engine.`,
    })
  }

  candidates.sort((a, b) => b.strength - a.strength)
  return (
    candidates[0]?.text ??
    `Solid week: ${last.count} session${last.count > 1 ? 's' : ''}, ${last.hours.toFixed(1)} h.`
  )
}

export default function LastWeekRecap() {
  const today = new Date()
  const currentStart = startOfWeek(today, { weekStartsOn: 1 })
  const lastStart = subWeeks(currentStart, 1)
  const lastEnd = subDays(currentStart, 1)
  const priorStart = subWeeks(lastStart, 1)
  const priorEnd = subDays(lastStart, 1)

  // Pull last 30 days so both weeks are covered.
  const fetchStart = subDays(today, 30)
  const { data, isLoading } = useActivitiesRange(fetchStart, today)

  const { last, prev, line } = useMemo(() => {
    const activities = data?.activities ?? []
    const last = totalsFor(activities, lastStart, lastEnd)
    const prev = totalsFor(activities, priorStart, priorEnd)
    const line = celebrationLine(last, prev, activities, lastStart, lastEnd)
    return { last, prev, line }
  }, [data])

  // Hide the card on the day the new week starts if there's no data yet AND
  // last week had nothing — avoids a cold, empty ghost card.
  const hideCold = last.count === 0 && isSameDay(today, currentStart)
  if (hideCold) return null

  const tssSig = signedPercent(last.tss, prev.tss)
  const hoursSig = signedPercent(last.hours, prev.hours)

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
          className="h-4 w-32 rounded"
          style={{ backgroundColor: 'var(--color-rule)' }}
        />
        <div
          className="mt-3 h-10 rounded"
          style={{ backgroundColor: 'var(--color-rule)' }}
        />
      </div>
    )
  }

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5 relative overflow-hidden"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
        backgroundImage:
          last.count > 0
            ? 'radial-gradient(120% 80% at 100% 0%, rgba(42, 97, 71, 0.10), transparent 60%)'
            : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={12} strokeWidth={1.8} style={{ color: 'var(--color-muted)' }} />
          <span
            className="eyebrow"
            style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}
          >
            Last week · {format(lastStart, 'MMM d')}–{format(lastEnd, 'd')}
          </span>
        </div>
      </div>

      <h3
        className="num-display mt-2 leading-tight"
        style={{
          fontSize: 'clamp(18px, 2.6vw, 22px)',
          color: 'var(--color-ink)',
        }}
      >
        {line}
      </h3>

      {last.count > 0 && (
        <div className="grid grid-cols-3 gap-3 mt-4">
          <RecapStatAnimated
            label="Sessions"
            target={last.count}
            digits={0}
            sub={`${prev.count} prior`}
          />
          <RecapStatAnimated
            label="Hours"
            target={last.hours}
            digits={1}
            sub={hoursSig.text}
            tone={hoursSig.positive}
          />
          <RecapStatAnimated
            label="TSS"
            target={last.tss}
            digits={0}
            sub={tssSig.text}
            tone={tssSig.positive}
          />
        </div>
      )}

      <button
        type="button"
        className="inline-flex items-center gap-1.5 mt-4 text-[12px] font-medium"
        style={{ color: 'var(--color-forest-2)' }}
        title="Share a compact summary of your week"
      >
        Share the week
        <ArrowUpRight size={12} strokeWidth={2} />
      </button>
    </div>
  )
}

function RecapStatAnimated({
  label,
  target,
  digits = 0,
  sub,
  tone,
}: {
  label: string
  target: number
  digits?: number
  sub?: string
  tone?: boolean | null
}) {
  // The count-up is the "this was earned, not just displayed" cue — Strava's
  // signature move. Short enough (~1.1s) that skimmers won't miss the result.
  const animated = useCountUp(target, { durationMs: 1100, digits })
  const color =
    tone === true
      ? 'var(--color-forest-2)'
      : tone === false
        ? 'var(--color-alert)'
        : 'var(--color-muted)'
  const display = digits === 0 ? Math.round(animated).toString() : animated.toFixed(digits)
  return (
    <div
      className="rounded-xl px-3 py-3 flex flex-col gap-1"
      style={{
        backgroundColor: 'var(--color-paper)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <span
        className="eyebrow"
        style={{
          color: 'var(--color-muted)',
          fontSize: 9,
          letterSpacing: '0.22em',
        }}
      >
        {label.toUpperCase()}
      </span>
      <span
        className="num-display leading-none tabular-nums"
        style={{ color: 'var(--color-ink)', fontSize: 22 }}
      >
        {display}
      </span>
      {sub && (
        <span className="num-mono text-[10px]" style={{ color }}>
          {sub}
        </span>
      )}
    </div>
  )
}
