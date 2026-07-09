import { useMemo, useState } from 'react'
import {
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  startOfWeek,
} from 'date-fns'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useLocale } from '../../contexts/LocaleContext'
import type { ActivityRead } from '../../api/dashboard'

// German labels for the metric tiles, keyed by metric. Units (km/h/W/bpm) stay
// as-is; only the descriptive label localizes.
const METRIC_LABEL_DE: Record<MetricKey, string> = {
  distance: 'Distanz',
  duration: 'Dauer',
  power: 'Ø Leistung',
  heartRate: 'Ø HF',
  pace: 'Ø Pace',
}

// Small-multiples layout — Whoop/Apple's weekly breakdown pattern. The win
// isn't any single chart; it's that the user can sweep across four tiles in
// ~1 second and read the whole week. Every tile shares the same 7-day axis,
// so their eye compares without thinking.

type Sport = 'cycling' | 'running'
type MetricKey = 'distance' | 'duration' | 'power' | 'heartRate' | 'pace'

interface MetricConfig {
  label: string
  unit: string
  accent: string
  /** Compute per-day aggregated value. */
  fromActivities: (acts: ActivityRead[]) => number
  /** How to format the summary number under the sparkline. */
  format: (v: number) => string
}

function mean(values: number[]): number {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0)
  if (clean.length === 0) return 0
  return clean.reduce((s, v) => s + v, 0) / clean.length
}

function avgOf<K extends keyof ActivityRead>(
  acts: ActivityRead[],
  key: K,
): number {
  const vals = acts
    .map((a) => a[key] as unknown)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  return mean(vals)
}

// km from metres, summed.
function totalDistanceKm(acts: ActivityRead[]): number {
  const m = acts.reduce((s, a) => s + (a.distance_meters ?? 0), 0)
  return m / 1000
}

// Hours from seconds, summed.
function totalHours(acts: ActivityRead[]): number {
  const s = acts.reduce((sum, a) => sum + (a.duration_seconds ?? 0), 0)
  return s / 3600
}

// Pace for running (min/km) = duration_minutes / distance_km, distance-weighted.
function avgRunningPace(acts: ActivityRead[]): number {
  const distM = acts.reduce((s, a) => s + (a.distance_meters ?? 0), 0)
  const dur = acts.reduce((s, a) => s + (a.duration_seconds ?? 0), 0)
  if (distM <= 0) return 0
  const minutesPerKm = dur / 60 / (distM / 1000)
  return minutesPerKm
}

const cyclingMetrics: Array<{ key: MetricKey } & MetricConfig> = [
  {
    key: 'distance',
    label: 'Distance',
    unit: 'km',
    accent: 'var(--color-forest-2)',
    fromActivities: totalDistanceKm,
    format: (v) => (v > 0 ? `${v.toFixed(v < 10 ? 1 : 0)} km` : '—'),
  },
  {
    key: 'duration',
    label: 'Duration',
    unit: 'h',
    accent: 'var(--color-forest-2)',
    fromActivities: totalHours,
    format: (v) => (v > 0 ? `${v.toFixed(1)} h` : '—'),
  },
  {
    key: 'power',
    label: 'Avg Power',
    unit: 'W',
    accent: 'rgba(190, 124, 34, 0.95)',
    fromActivities: (acts) => avgOf(acts, 'normalized_power'),
    format: (v) => (v > 0 ? `${Math.round(v)} W` : '—'),
  },
  {
    key: 'heartRate',
    label: 'Avg HR',
    unit: 'bpm',
    accent: 'rgba(214, 87, 47, 1)',
    fromActivities: (acts) => avgOf(acts, 'average_hr'),
    format: (v) => (v > 0 ? `${Math.round(v)} bpm` : '—'),
  },
]

const runningMetrics: Array<{ key: MetricKey } & MetricConfig> = [
  {
    key: 'distance',
    label: 'Distance',
    unit: 'km',
    accent: 'var(--color-forest-2)',
    fromActivities: totalDistanceKm,
    format: (v) => (v > 0 ? `${v.toFixed(v < 10 ? 1 : 0)} km` : '—'),
  },
  {
    key: 'duration',
    label: 'Duration',
    unit: 'h',
    accent: 'var(--color-forest-2)',
    fromActivities: totalHours,
    format: (v) => (v > 0 ? `${v.toFixed(1)} h` : '—'),
  },
  {
    key: 'pace',
    label: 'Avg Pace',
    unit: '/km',
    accent: 'rgba(190, 124, 34, 0.95)',
    fromActivities: avgRunningPace,
    format: (v) => {
      if (v <= 0) return '—'
      const minutes = Math.floor(v)
      const seconds = Math.round((v - minutes) * 60)
      return `${minutes}:${String(seconds).padStart(2, '0')}`
    },
  },
  {
    key: 'heartRate',
    label: 'Avg HR',
    unit: 'bpm',
    accent: 'rgba(214, 87, 47, 1)',
    fromActivities: (acts) => avgOf(acts, 'average_hr'),
    format: (v) => (v > 0 ? `${Math.round(v)} bpm` : '—'),
  },
]

function MiniBarChart({
  values,
  accent,
  labels,
  todayIdx,
  /** For pace, lower is "better" — we invert the fill direction so a long bar
   *  still reads as "more training". Set invert to keep the visual semantic
   *  "fuller = doing more". */
  invert = false,
}: {
  values: number[]
  accent: string
  labels: string[]
  todayIdx: number
  invert?: boolean
}) {
  const max = Math.max(...values, 0.0001)
  const min = Math.min(...values.filter((v) => v > 0), max)
  return (
    <div className="grid grid-cols-7 gap-[3px] h-14 items-end">
      {values.map((v, i) => {
        const hasValue = v > 0
        // Scale: 18% min bar floor for visible presence, up to 100% for max.
        let pct: number
        if (!hasValue) pct = 0
        else if (invert && min > 0 && max > 0) {
          // Lower pace = bigger bar
          pct = 100 * (1 - (v - min) / Math.max(max - min, 0.0001)) * 0.82 + 18
        } else {
          pct = Math.max(18, (v / max) * 100)
        }
        const isToday = i === todayIdx
        return (
          <div
            key={i}
            className="relative h-full flex flex-col justify-end"
            title={`${labels[i]} · ${v > 0 ? v.toFixed(1) : '—'}`}
          >
            <div
              className="w-full rounded-sm transition-all"
              style={{
                height: `${pct}%`,
                backgroundColor: hasValue ? accent : 'var(--color-rule)',
                opacity: hasValue ? (isToday ? 1 : 0.78) : 0.35,
                outline: isToday ? `1px solid var(--color-ink)` : 'none',
                outlineOffset: 1,
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

function MetricTile({
  metric,
  values,
  labels,
  todayIdx,
  totalLabel,
  de,
}: {
  metric: MetricConfig & { key: MetricKey }
  values: number[]
  labels: string[]
  todayIdx: number
  totalLabel: string
  de: boolean
}) {
  return (
    <div
      className="rounded-xl px-3 py-3 flex flex-col gap-2 min-w-0"
      style={{
        backgroundColor: 'var(--color-paper)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span
          className="eyebrow"
          style={{
            color: 'var(--color-muted)',
            fontSize: 9,
            letterSpacing: '0.22em',
          }}
        >
          {(de ? METRIC_LABEL_DE[metric.key] : metric.label).toUpperCase()}
        </span>
        <span
          className="num-mono"
          style={{ color: 'var(--color-ink)', fontSize: 13, fontWeight: 500 }}
        >
          {totalLabel}
        </span>
      </div>
      <MiniBarChart
        values={values}
        accent={metric.accent}
        labels={labels}
        todayIdx={todayIdx}
        invert={metric.key === 'pace'}
      />
    </div>
  )
}

export default function WeeklySportMetrics() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const [sport, setSport] = useState<Sport>('cycling')
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })

  const { data, isLoading } = useActivitiesRange(weekStart, weekEnd)

  const metrics = sport === 'cycling' ? cyclingMetrics : runningMetrics

  const days = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd],
  )
  const todayIdx = days.findIndex((d) => isSameDay(d, now))
  const labels = days.map((d) => format(d, 'EEE'))

  const perMetricValues = useMemo(() => {
    const acts = (data?.activities ?? []).filter((a) => a.sport === sport)
    const byDay = days.map((d) =>
      acts.filter((a) => isSameDay(new Date(a.started_at), d)),
    )
    return metrics.map((m) => ({
      metric: m,
      values: byDay.map((dayActs) => m.fromActivities(dayActs)),
      total: m.fromActivities(acts),
    }))
  }, [data, sport, days, metrics])

  const hasAny = perMetricValues.some((m) => m.total > 0)

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span
          className="eyebrow"
          style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}
        >
          {de ? 'Wochenübersicht' : 'Weekly breakdown'} · {format(weekStart, 'MMM d')}–{format(weekEnd, 'd')}
        </span>
        <div
          className="inline-flex items-center rounded-full p-[3px]"
          style={{
            backgroundColor: 'var(--color-paper)',
            border: '1px solid var(--color-rule)',
          }}
          role="tablist"
          aria-label="Sport"
        >
          {(['cycling', 'running'] as Sport[]).map((s) => {
            const active = s === sport
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSport(s)}
                className="px-3 py-1 text-[12px] rounded-full transition-colors"
                style={{
                  color: active ? 'var(--color-paper)' : 'var(--color-ink-2)',
                  backgroundColor: active ? 'var(--color-ink)' : 'transparent',
                  fontWeight: active ? 500 : 400,
                }}
              >
                {s === 'cycling'
                  ? de ? 'Radfahren' : 'Cycling'
                  : de ? 'Laufen' : 'Running'}
              </button>
            )
          })}
        </div>
      </div>

      {isLoading ? (
        <div
          className="mt-4 h-20 rounded animate-pulse"
          style={{ backgroundColor: 'var(--color-rule)' }}
        />
      ) : !hasAny ? (
        <div className="mt-4 flex flex-col gap-1">
          <p
            className="text-[14px]"
            style={{ color: 'var(--color-ink-2)' }}
          >
            {de
              ? `Noch keine ${sport === 'cycling' ? 'Rad' : 'Lauf'}-Einheiten diese Woche.`
              : `No ${sport} sessions this week yet.`}
          </p>
          <p className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
            {de
              ? sport === 'cycling'
                ? 'Deine erste Fahrt diese Woche füllt diese Charts.'
                : 'Dein erster Lauf diese Woche füllt diese Charts.'
              : `Your first ${sport === 'cycling' ? 'ride' : 'run'} this week will paint these charts in.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 mt-4 grid-cols-2 lg:grid-cols-4">
          {perMetricValues.map(({ metric, values, total }) => (
            <MetricTile
              key={metric.key}
              metric={metric}
              values={values}
              labels={labels}
              todayIdx={todayIdx}
              de={de}
              totalLabel={
                metric.key === 'distance'
                  ? metric.format(total)
                  : metric.key === 'duration'
                    ? metric.format(total)
                    : // For power / HR / pace, the "total" is really the mean of the week
                      metric.format(mean(values.filter((v) => v > 0)))
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
