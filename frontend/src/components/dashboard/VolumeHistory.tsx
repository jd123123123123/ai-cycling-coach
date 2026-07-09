import { useMemo } from 'react'
import { subWeeks, startOfWeek, endOfWeek, isWithinInterval, format } from 'date-fns'
import { usePMC } from '../../hooks/usePMC'

// 12-week TSS bar chart — the single most requested "show me my training history"
// view. TrainingPeaks calls this "Weekly TSS" and puts it on the home screen.
// Athletes need to see: am I ramping up, are weeks consistent, where are my
// biggest spikes? A simple bar chart answers this in 2 seconds flat.

const NUM_WEEKS = 12

export default function VolumeHistory() {
  const { data, isLoading } = usePMC(NUM_WEEKS * 7 + 7)

  const weekBars = useMemo(() => {
    if (!data) return []
    const entries = data.entries
    const today = new Date()

    return Array.from({ length: NUM_WEEKS }, (_, i) => {
      const weekStart = startOfWeek(subWeeks(today, NUM_WEEKS - 1 - i), { weekStartsOn: 1 })
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
      const isCurrentWeek = i === NUM_WEEKS - 1

      const weekEntries = entries.filter((e) =>
        isWithinInterval(new Date(e.date), { start: weekStart, end: weekEnd }),
      )
      const tss = weekEntries.reduce((s, e) => s + (e.daily_tss ?? 0), 0)
      const hours = tss / 70 // rough TSS-to-hours estimate at moderate intensity

      return {
        week: i,
        label: format(weekStart, 'MMM d'),
        shortLabel: format(weekStart, 'd MMM'),
        tss: Math.round(tss),
        hours: weekEntries.reduce((s, e) => {
          // Infer hours from daily_tss (approximate)
          return s + (e.daily_tss ?? 0) / 70
        }, 0),
        isCurrentWeek,
      }
    })
  }, [data])

  const maxTSS = Math.max(...weekBars.map((w) => w.tss), 1)
  const avgTSS = weekBars.length > 0
    ? Math.round(weekBars.reduce((s, w) => s + w.tss, 0) / weekBars.length)
    : 0

  const currentWeek = weekBars[weekBars.length - 1]
  const prevWeek = weekBars[weekBars.length - 2]
  const vsLast = prevWeek && prevWeek.tss > 0
    ? Math.round(((currentWeek?.tss ?? 0) - prevWeek.tss) / prevWeek.tss * 100)
    : null

  if (isLoading) {
    return (
      <div
        className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
        style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
      >
        <div className="h-4 w-40 rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
        <div className="h-32 w-full rounded mt-4 animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
      </div>
    )
  }

  if (weekBars.every((w) => w.tss === 0)) return null

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
            Volume · last 12 weeks
          </span>
          <div className="flex items-baseline gap-3 mt-1 flex-wrap">
            <span
              className="num-display leading-none"
              style={{ fontSize: 'clamp(20px, 2.6vw, 26px)', color: 'var(--color-ink)' }}
            >
              {currentWeek?.tss ?? 0} TSS
            </span>
            {vsLast !== null && (
              <span
                className="num-mono text-[11px]"
                style={{ color: Math.abs(vsLast) < 5 ? 'var(--color-muted)' : vsLast > 0 ? 'var(--color-forest-2)' : 'var(--color-amber)' }}
              >
                {vsLast >= 0 ? '+' : ''}{vsLast}% vs last week
              </span>
            )}
          </div>
        </div>
        <span className="num-mono text-[11px]" style={{ color: 'var(--color-muted)' }}>
          avg {avgTSS} TSS/wk
        </span>
      </div>

      {/* Bar chart */}
      <div className="grid gap-[5px] items-end" style={{ gridTemplateColumns: `repeat(${NUM_WEEKS}, 1fr)`, height: 96 }}>
        {weekBars.map((w) => {
          const pct = maxTSS > 0 ? Math.max(4, (w.tss / maxTSS) * 100) : 0
          const isAboveAvg = w.tss > avgTSS
          return (
            <div
              key={w.week}
              className="relative flex flex-col justify-end h-full"
              title={`${w.shortLabel}: ${w.tss} TSS`}
            >
              <div
                className="w-full rounded-sm transition-all duration-500"
                style={{
                  height: w.tss > 0 ? `${pct}%` : '4%',
                  backgroundColor: w.isCurrentWeek
                    ? '#30D158'
                    : isAboveAvg
                    ? 'rgba(48, 209, 88, 0.55)'
                    : 'var(--color-rule)',
                  opacity: w.tss === 0 ? 0.3 : 1,
                  boxShadow: w.isCurrentWeek ? '0 -3px 8px rgba(48, 209, 88, 0.35)' : 'none',
                  outline: w.isCurrentWeek ? '1px solid rgba(48, 209, 88, 0.6)' : 'none',
                  outlineOffset: 1,
                }}
              />
            </div>
          )
        })}
      </div>

      {/* Average baseline label */}
      <div className="flex items-center justify-between mt-2">
        <span className="num-mono text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
          {weekBars[0]?.label}
        </span>
        <span className="num-mono text-[10.5px]" style={{ color: 'rgba(48, 209, 88, 0.6)' }}>
          ▌ this week
        </span>
        <span className="num-mono text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
          now
        </span>
      </div>
    </div>
  )
}
