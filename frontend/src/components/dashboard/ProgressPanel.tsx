import { useMemo, useState } from 'react'
import { subDays, format } from 'date-fns'
import { de } from 'date-fns/locale'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { usePMC } from '../../hooks/usePMC'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import Sparkline from './Sparkline'
import { useLocale } from '../../contexts/LocaleContext'

type Loc = 'en' | 'de'

// ProgressPanel — 4-up progress strip with a window toggle.
// Lives on the Today tab and gives the athlete a daily glance at four trend
// lines on the metrics that matter: Training Load (CTL), FTP (auto-estimated
// rolling), HRV, Body Battery. The window toggle (7/14/30/60/90) re-slices
// every chart in place.
//
// Design note: this panel intentionally compresses what would otherwise live
// across 3 tabs (Trends, Week, FTP) into a single above-the-fold horizontal
// strip. Athletes check the same 4 numbers every morning — surface them.

type WindowDays = 7 | 14 | 30 | 60 | 90
const WINDOWS: WindowDays[] = [7, 14, 30, 60, 90]

const FTP_FACTOR = 0.97

interface MetricMeta {
  key: 'load' | 'ftp' | 'hrv' | 'battery'
  label: string
  labelDe: string
  unit: string
  color: string
  higherIsBetter: boolean
}

const METRICS: MetricMeta[] = [
  { key: 'load',    label: 'Training load', labelDe: 'Trainingslast', unit: 'CTL', color: 'var(--color-forest-2)', higherIsBetter: true  },
  { key: 'ftp',     label: 'FTP',           labelDe: 'FTP',           unit: 'W',   color: '#FF6430',                higherIsBetter: true  },
  { key: 'hrv',     label: 'HRV',           labelDe: 'HRV',           unit: '',    color: '#0A84FF',                higherIsBetter: true  },
  { key: 'battery', label: 'Body battery',  labelDe: 'Body Battery',  unit: '',    color: '#BF5AF2',                higherIsBetter: true  },
]

/**
 * Build a daily time-series of best-NP-based FTP estimate.
 * For each day in the window, we look at the trailing 14 days of cycling
 * activities (40–90 min with NP data) and use max NP × FTP_FACTOR. Gives a
 * smoothed, backward-looking FTP trend rather than a single static number.
 */
function ftpEstimateSeries(
  activities: Array<{ started_at: string; sport: string; normalized_power: number | null; duration_seconds: number | null }>,
  days: number,
): Array<number | null> {
  const today = new Date()
  const series: Array<number | null> = []
  const LOOKBACK_MS = 14 * 86_400_000

  for (let i = days - 1; i >= 0; i--) {
    const dayEnd = subDays(today, i).getTime()
    const dayStart = dayEnd - LOOKBACK_MS
    const candidates = activities.filter((a) => {
      if (a.sport !== 'cycling' || a.normalized_power == null) return false
      const dur = a.duration_seconds
      if (dur == null || dur < 40 * 60 || dur > 90 * 60) return false
      const t = new Date(a.started_at).getTime()
      return t >= dayStart && t <= dayEnd
    })
    if (candidates.length === 0) {
      series.push(null)
      continue
    }
    const bestNP = Math.max(...candidates.map((a) => a.normalized_power as number))
    series.push(Math.round(bestNP * FTP_FACTOR))
  }
  return series
}

function computeDelta(current: number | null, start: number | null): { abs: number; pct: number } | null {
  if (current == null || start == null || start === 0) return null
  const abs = current - start
  const pct = (abs / start) * 100
  return { abs, pct }
}

function DeltaPill({ delta, higherIsBetter, color, locale }: {
  delta: { abs: number; pct: number } | null
  higherIsBetter: boolean
  color: string
  locale: Loc
}) {
  if (!delta || Math.abs(delta.pct) < 1) {
    return (
      <span
        className="inline-flex items-center gap-1 num-mono text-[10px]"
        style={{ color: 'var(--color-muted)' }}
      >
        <Minus size={10} strokeWidth={2} />
        {locale === 'de' ? 'stabil' : 'flat'}
      </span>
    )
  }
  const positive = delta.abs > 0
  const good = positive === higherIsBetter
  const pillColor = good ? color : 'var(--color-amber)'
  const Icon = positive ? TrendingUp : TrendingDown
  return (
    <span
      className="inline-flex items-center gap-1 num-mono text-[10px] font-semibold"
      style={{ color: pillColor }}
    >
      <Icon size={10} strokeWidth={2} />
      {positive ? '+' : ''}{delta.pct.toFixed(delta.pct >= 10 ? 0 : 1)}%
    </span>
  )
}

function MetricTile({
  meta,
  windowDays,
  values,
  currentLabel,
  currentValue,
  locale,
}: {
  meta: MetricMeta
  windowDays: WindowDays
  values: Array<number | null>
  currentLabel: string
  currentValue: number | null
  locale: Loc
}) {
  // First defined value in the window as baseline for delta
  const firstDefined = values.find((v): v is number => v != null) ?? null
  const delta = computeDelta(currentValue, firstDefined)

  return (
    <div
      className="relative flex flex-col gap-3 px-5 py-4 sm:px-5 sm:py-5 min-w-0"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
        borderRadius: 16,
      }}
    >
      {/* Top row: label + delta */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span
          className="eyebrow"
          style={{
            color: 'var(--color-muted)',
            letterSpacing: '0.22em',
            fontSize: 10,
          }}
        >
          {(locale === 'de' ? meta.labelDe : meta.label).toUpperCase()}
        </span>
        <DeltaPill delta={delta} higherIsBetter={meta.higherIsBetter} color={meta.color} locale={locale} />
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1.5">
        <span
          className="num-display leading-none"
          style={{
            fontSize: 'clamp(24px, 2.6vw, 30px)',
            color: 'var(--color-ink)',
            fontVariationSettings: '"opsz" 144, "wght" 500',
          }}
        >
          {currentLabel}
        </span>
        {meta.unit && (
          <span
            className="num-mono text-[11px]"
            style={{ color: 'var(--color-muted)' }}
          >
            {meta.unit}
          </span>
        )}
      </div>

      {/* Sparkline */}
      <div className="relative" style={{ color: meta.color }}>
        <Sparkline
          values={values}
          width={220}
          height={32}
          stroke={meta.color}
          showDot
        />
      </div>

      {/* Footer: window reference */}
      <span
        className="num-mono text-[10px]"
        style={{ color: 'var(--color-muted)' }}
      >
        {windowDays}{locale === 'de' ? 'T' : 'd'} · {locale === 'de' ? 'erster→letzter' : 'first→last'}
      </span>
    </div>
  )
}

export default function ProgressPanel() {
  const { locale } = useLocale()
  const [windowDays, setWindowDays] = useState<WindowDays>(30)
  const today = new Date()
  const start = subDays(today, windowDays - 1)

  // Pull enough for the longest window even when user toggles shorter ones.
  // React Query caches per-range; switching windows re-fetches the needed
  // range but previously cached ones stay warm.
  const { data: metricsData } = useDailyMetrics(start, today)
  const { data: activitiesData } = useActivitiesRange(subDays(today, 90), today)
  const { data: pmcData } = usePMC(Math.max(windowDays, 90))
  const { data: profile } = useAthleteProfile()

  const series = useMemo(() => {
    // Training Load (CTL from PMC): sample last N days
    const pmcEntries = pmcData?.entries ?? []
    const sortedPmc = pmcEntries.slice().sort((a, b) => a.date.localeCompare(b.date))
    const loadVals: Array<number | null> = Array.from({ length: windowDays }, (_, i) => {
      const d = subDays(today, windowDays - 1 - i)
      const iso = format(d, 'yyyy-MM-dd')
      const entry = sortedPmc.find((e) => e.date === iso)
      return entry ? Math.round(entry.ctl) : null
    })

    // FTP estimate series — rolling 14-day best NP × 0.97
    const acts = activitiesData?.activities ?? []
    const ftpVals = ftpEstimateSeries(
      acts.map((a) => ({
        started_at: a.started_at,
        sport: a.sport,
        normalized_power: a.normalized_power,
        duration_seconds: a.duration_seconds,
      })),
      windowDays,
    )

    // HRV + Body Battery from daily metrics: latest per day
    const metricsByDay = new Map<string, { hrv: number | null; bb: number | null }>()
    for (const m of metricsData?.metrics ?? []) {
      const day = m.date ?? format(new Date(m.recorded_at), 'yyyy-MM-dd')
      const prev = metricsByDay.get(day)
      // Prefer the latest recorded_at per day
      if (!prev) {
        metricsByDay.set(day, { hrv: m.hrv_status, bb: m.body_battery })
      }
    }
    const hrvVals: Array<number | null> = []
    const bbVals: Array<number | null> = []
    for (let i = windowDays - 1; i >= 0; i--) {
      const d = subDays(today, i)
      const key = format(d, 'yyyy-MM-dd')
      const row = metricsByDay.get(key)
      hrvVals.push(row?.hrv ?? null)
      bbVals.push(row?.bb ?? null)
    }

    return {
      load: loadVals,
      ftp: ftpVals,
      hrv: hrvVals,
      battery: bbVals,
    }
  }, [pmcData, activitiesData, metricsData, windowDays, today])

  // "Current value" for each metric — prefer latest non-null
  function latestDefined(values: Array<number | null>): number | null {
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i] != null) return values[i]
    }
    return null
  }

  const current = {
    load: latestDefined(series.load),
    ftp: latestDefined(series.ftp) ?? profile?.ftp_watts ?? null,
    hrv: latestDefined(series.hrv),
    battery: latestDefined(series.battery),
  }

  function valueLabel(key: MetricMeta['key']): string {
    const v = current[key]
    if (v == null) return '—'
    return String(Math.round(v))
  }

  const anyData = Object.values(current).some((v) => v != null)
  if (!anyData) return null

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {/* Window toggle — magazine segmented control */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="eyebrow"
            style={{
              color: 'var(--color-muted)',
              letterSpacing: '0.22em',
              fontSize: 10,
            }}
          >
            {locale === 'de' ? 'Zeitraum' : 'Window'}
          </span>
          <div
            className="flex rounded-full p-0.5"
            style={{
              backgroundColor: 'var(--color-paper-2)',
              border: '1px solid var(--color-rule)',
            }}
          >
            {WINDOWS.map((w) => {
              const active = w === windowDays
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWindowDays(w)}
                  aria-pressed={active}
                  className="px-3 py-1.5 rounded-full transition-colors num-mono"
                  style={{
                    fontSize: 11,
                    fontWeight: active ? 600 : 400,
                    color: active ? 'var(--color-paper)' : 'var(--color-ink-2)',
                    backgroundColor: active ? 'var(--color-ink)' : 'transparent',
                    letterSpacing: '0.04em',
                  }}
                >
                  {w}{locale === 'de' ? 'T' : 'd'}
                </button>
              )
            })}
          </div>
        </div>

        <span
          className="num-mono hidden sm:inline"
          style={{
            color: 'var(--color-muted)',
            fontSize: 10,
            letterSpacing: '0.08em',
          }}
        >
          {format(start, 'dd MMM', locale === 'de' ? { locale: de } : undefined).toUpperCase()} → {format(today, 'dd MMM', locale === 'de' ? { locale: de } : undefined).toUpperCase()}
        </span>
      </div>

      {/* 4-up metric grid */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map((m) => (
          <MetricTile
            key={m.key}
            meta={m}
            windowDays={windowDays}
            values={series[m.key]}
            currentLabel={valueLabel(m.key)}
            currentValue={current[m.key]}
            locale={locale}
          />
        ))}
      </div>

      {/* Caption explains the rolling FTP method so the number isn't a mystery */}
      <p
        className="text-[11px] italic leading-relaxed"
        style={{
          color: 'var(--color-muted)',
          fontFamily: '"Fraunces", serif',
          fontVariationSettings: '"opsz" 14, "wght" 400',
        }}
      >
        {locale === 'de'
          ? 'FTP schätzt eine rollierende 14-Tage-Obergrenze aus deiner besten NP auf 40–90-Min-Fahrten. HRV und Body Battery sind deine neuesten Tageswerte. CTL ist die chronische Trainingslast — die Fitness, die du mit dir trägst.'
          : 'FTP estimates a rolling 14-day ceiling from your best NP on 40–90 min rides. HRV and Body Battery are your latest daily readings. CTL is the chronic training load — the fitness you carry with you.'}
      </p>
    </div>
  )
}
