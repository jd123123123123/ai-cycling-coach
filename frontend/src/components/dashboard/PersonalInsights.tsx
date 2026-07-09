import { useMemo } from 'react'
import { subDays, format, getDay } from 'date-fns'
import { TrendingUp, TrendingDown, Moon, Calendar, Activity, Sparkles } from 'lucide-react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import type { DailyMetric, ActivityRead } from '../../api/dashboard'
import { useLocale } from '../../contexts/LocaleContext'

// German plural weekday names, indexed by getDay() (0=Sun..6=Sat).
const WEEKDAY_PLURAL_DE = ['Sonntage', 'Montage', 'Dienstage', 'Mittwoche', 'Donnerstage', 'Freitage', 'Samstage']

// PersonalInsights — Whoop's secret weapon, translated for cyclists.
// Auto-derives correlations from the user's own 60-day history. Each insight
// cites a real number AND tells the athlete what to do with it. The variety
// of insight types keeps every morning fresh — they never see the same card
// twice in a row because the data has shifted overnight.
//
// Insight categories we compute client-side:
//   1. High-load → next-day HRV drop
//   2. Sleep duration → next-day recovery
//   3. Weekday vs weekend recovery gap
//   4. Rest-day HRV bump
//   5. Monthly training load trend
//   6. Best recovery day-of-week (your biological prime)

interface Insight {
  id: string
  headline: string  // The big number
  supportLabel: string  // Small-caps eyebrow
  body: string  // One-sentence prose
  icon: React.ReactNode
  tone: 'positive' | 'caution' | 'neutral'
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function metricByDay(metrics: DailyMetric[]): Map<string, DailyMetric> {
  const m = new Map<string, DailyMetric>()
  for (const x of metrics) {
    const key = x.date ?? (x.recorded_at ? isoDay(new Date(x.recorded_at)) : null)
    if (!key) continue
    // Prefer latest recorded_at per day
    const prev = m.get(key)
    if (!prev || new Date(x.recorded_at) > new Date(prev.recorded_at)) m.set(key, x)
  }
  return m
}

function tssByDay(activities: ActivityRead[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const a of activities) {
    const key = isoDay(new Date(a.started_at))
    m.set(key, (m.get(key) ?? 0) + (a.tss ?? 0))
  }
  return m
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length
}

function pctDelta(a: number, b: number): number {
  if (b === 0) return 0
  return ((a - b) / b) * 100
}

function computeInsights(
  metrics: DailyMetric[],
  activities: ActivityRead[],
  de: boolean,
): Insight[] {
  const out: Insight[] = []
  const mDay = metricByDay(metrics)
  const tssDay = tssByDay(activities)

  // 1. HIGH-LOAD → NEXT-DAY HRV
  // Find days with TSS ≥ 100; compare next-day HRV vs user's 30-day HRV mean.
  const allHRV: number[] = []
  for (const m of mDay.values()) if (m.hrv_status != null) allHRV.push(m.hrv_status)
  const meanHRV = mean(allHRV)
  const nextDayHRVAfterHardRides: number[] = []
  for (const [day, tss] of tssDay.entries()) {
    if (tss < 100) continue
    const next = new Date(day)
    next.setDate(next.getDate() + 1)
    const nextMetric = mDay.get(isoDay(next))
    if (nextMetric?.hrv_status != null) nextDayHRVAfterHardRides.push(nextMetric.hrv_status)
  }
  if (nextDayHRVAfterHardRides.length >= 3 && meanHRV > 0) {
    const delta = pctDelta(mean(nextDayHRVAfterHardRides), meanHRV)
    if (Math.abs(delta) >= 4) {
      out.push({
        id: 'hard-ride-hrv',
        headline: `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`,
        supportLabel: de ? 'HRV NACH FAHRTEN > 100 TSS' : 'HRV AFTER RIDES > 100 TSS',
        body: delta < 0
          ? (de
              ? `Deine HRV fällt ${Math.abs(delta).toFixed(0)}% am Tag nach harten Einheiten. Plane Z1 am Morgen danach — dein Körper sagt es dir.`
              : `Your HRV drops ${Math.abs(delta).toFixed(0)}% the day after hard sessions. Plan Z1 the morning after — your body is telling you.`)
          : (de
              ? `Deine HRV steigt ${delta.toFixed(0)}% nach harten Fahrten — du verkraftest die Belastung gut. Das ist eine grüne Woche.`
              : `Your HRV rises ${delta.toFixed(0)}% after hard rides — you're absorbing load well. This is a green-light week.`),
        icon: <Activity size={13} strokeWidth={2} />,
        tone: delta < 0 ? 'caution' : 'positive',
      })
    }
  }

  // 2. SLEEP DURATION → NEXT-DAY HRV
  // Split sleep_score into ≥70 and <70 buckets, compare next-day HRV.
  const daysSorted = [...mDay.keys()].sort()
  const highSleepNextHRV: number[] = []
  const lowSleepNextHRV: number[] = []
  for (const day of daysSorted) {
    const m = mDay.get(day)
    if (!m?.sleep_score) continue
    const next = new Date(day)
    next.setDate(next.getDate() + 1)
    const nextMetric = mDay.get(isoDay(next))
    if (!nextMetric?.hrv_status) continue
    if (m.sleep_score >= 70) highSleepNextHRV.push(nextMetric.hrv_status)
    else lowSleepNextHRV.push(nextMetric.hrv_status)
  }
  if (highSleepNextHRV.length >= 3 && lowSleepNextHRV.length >= 3) {
    const highMean = mean(highSleepNextHRV)
    const lowMean = mean(lowSleepNextHRV)
    const delta = pctDelta(highMean, lowMean)
    if (delta >= 3) {
      out.push({
        id: 'sleep-hrv',
        headline: `+${delta.toFixed(0)}%`,
        supportLabel: de ? 'HRV NACH GUTEM SCHLAF' : 'HRV AFTER GOOD SLEEP',
        body: de
          ? `Nächte mit Schlaf-Score ≥ 70 geben dir ${delta.toFixed(0)}% höhere HRV am nächsten Tag. Das Bett ist kostenloses Training.`
          : `Nights with sleep score ≥ 70 leave you ${delta.toFixed(0)}% higher HRV the next day. The bed is free training.`,
        icon: <Moon size={13} strokeWidth={2} />,
        tone: 'positive',
      })
    }
  }

  // 3. BEST DAY-OF-WEEK FOR RECOVERY
  // Group HRV by weekday, find the peak.
  const hrvByDow: number[][] = [[], [], [], [], [], [], []]
  for (const [day, m] of mDay.entries()) {
    if (m.hrv_status == null) continue
    const dow = getDay(new Date(day)) // 0=Sun..6=Sat
    hrvByDow[dow].push(m.hrv_status)
  }
  const dowMeans = hrvByDow.map((arr, dow) => ({ dow, mean: mean(arr), count: arr.length }))
  const eligible = dowMeans.filter((d) => d.count >= 3)
  if (eligible.length >= 3) {
    const peak = eligible.reduce((a, b) => (b.mean > a.mean ? b : a))
    const overall = mean(eligible.map((d) => d.mean))
    const delta = pctDelta(peak.mean, overall)
    if (delta >= 3) {
      const dayName = de
        ? WEEKDAY_PLURAL_DE[peak.dow]
        : ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][peak.dow]
      out.push({
        id: 'peak-dow',
        headline: dayName,
        supportLabel: de ? 'DEINE BIOLOGISCHE BESTZEIT' : 'YOUR BIOLOGICAL PRIME',
        body: de
          ? `HRV erreicht ${delta.toFixed(0)}% Spitze an ${dayName}. Lege deine härteste Einheit hierher, wenn die Woche es zulässt.`
          : `HRV peaks ${delta.toFixed(0)}% on ${dayName}. Schedule your hardest session here when the week allows.`,
        icon: <Calendar size={13} strokeWidth={2} />,
        tone: 'positive',
      })
    }
  }

  // 4. TRAINING LOAD TREND — last 30 days vs prior 30 days
  const today = new Date()
  const recent30TSS: number[] = []
  const prior30TSS: number[] = []
  for (const [day, tss] of tssDay.entries()) {
    const d = new Date(day)
    const daysAgo = Math.floor((today.getTime() - d.getTime()) / 86_400_000)
    if (daysAgo < 30) recent30TSS.push(tss)
    else if (daysAgo < 60) prior30TSS.push(tss)
  }
  if (recent30TSS.length >= 5 && prior30TSS.length >= 5) {
    const recentSum = recent30TSS.reduce((s, v) => s + v, 0)
    const priorSum = prior30TSS.reduce((s, v) => s + v, 0)
    const delta = pctDelta(recentSum, priorSum)
    if (Math.abs(delta) >= 6) {
      out.push({
        id: 'load-trend',
        headline: `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`,
        supportLabel: de ? '30T BELASTUNG VS 30 ZUVOR' : '30D LOAD VS PRIOR 30',
        body: delta > 0
          ? (de
              ? `Die Trainingsbelastung ist ${delta.toFixed(0)}% höher als letzten Monat. Fitness wird aufgebaut — halte die Rampe unter 8%/Woche.`
              : `Training load is ${delta.toFixed(0)}% higher than last month. Fitness is being built — keep the ramp under 8%/week.`)
          : (de
              ? `Du bist ${Math.abs(delta).toFixed(0)}% leichter als letzten Monat. Deloads bringen auch was — aber achte nach 14 Tagen auf Formverlust.`
              : `You're ${Math.abs(delta).toFixed(0)}% lighter than last month. Deloads build too — but watch for deconditioning past 14 days.`),
        icon: delta > 0 ? <TrendingUp size={13} strokeWidth={2} /> : <TrendingDown size={13} strokeWidth={2} />,
        tone: delta > 0 ? 'positive' : 'caution',
      })
    }
  }

  return out
}

function ToneStyle(tone: Insight['tone']): { color: string; bg: string; border: string } {
  switch (tone) {
    case 'positive':
      return {
        color: '#30D158',
        bg: 'rgba(48, 209, 88, 0.07)',
        border: 'rgba(48, 209, 88, 0.22)',
      }
    case 'caution':
      return {
        color: 'var(--color-amber)',
        bg: 'rgba(255, 159, 10, 0.06)',
        border: 'rgba(255, 159, 10, 0.22)',
      }
    default:
      return {
        color: 'var(--color-ink-2)',
        bg: 'transparent',
        border: 'var(--color-rule)',
      }
  }
}

function InsightCard({ insight }: { insight: Insight }) {
  const s = ToneStyle(insight.tone)
  return (
    <div
      className="flex flex-col gap-2 px-5 py-4 rounded-[14px] min-w-0"
      style={{
        backgroundColor: s.bg || 'var(--color-paper-2)',
        border: `1px solid ${s.border}`,
      }}
    >
      <div className="flex items-center gap-2" style={{ color: s.color }}>
        {insight.icon}
        <span
          className="eyebrow"
          style={{
            fontSize: 9,
            letterSpacing: '0.22em',
            color: s.color,
            fontWeight: 600,
          }}
        >
          {insight.supportLabel}
        </span>
      </div>
      <span
        className="num-display leading-none"
        style={{
          fontSize: 28,
          color: s.color,
          fontVariationSettings: '"opsz" 144, "wght" 500',
        }}
      >
        {insight.headline}
      </span>
      <p
        className="text-[12px] leading-relaxed"
        style={{ color: 'var(--color-ink-2)' }}
      >
        {insight.body}
      </p>
    </div>
  )
}

export default function PersonalInsights() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const today = new Date()
  const start = subDays(today, 60)
  const { data: metricsData } = useDailyMetrics(start, today)
  const { data: actsData } = useActivitiesRange(start, today)

  const insights = useMemo(
    () => computeInsights(metricsData?.metrics ?? [], actsData?.activities ?? [], de),
    [metricsData, actsData, de],
  )

  if (insights.length === 0) return null

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-5 sm:px-6 sm:py-6"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={13} strokeWidth={2} style={{ color: 'var(--color-forest-2)' }} />
        <span
          className="eyebrow"
          style={{
            color: 'var(--color-ink)',
            letterSpacing: '0.28em',
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          {de ? 'Was dir dein Körper sagt' : 'What your body is telling you'}
        </span>
        <span
          className="num-mono"
          style={{
            fontSize: 9,
            color: 'var(--color-muted)',
            letterSpacing: '0.12em',
          }}
        >
          · {insights.length} {de ? (insights.length === 1 ? 'ERKENNTNIS' : 'ERKENNTNISSE') : `INSIGHT${insights.length === 1 ? '' : 'S'}`}
        </span>
      </div>

      <p
        className="text-[12px] italic mb-4"
        style={{
          fontFamily: '"Fraunces", serif',
          color: 'var(--color-muted)',
          fontVariationSettings: '"opsz" 14, "wght" 400',
          maxWidth: '60ch',
        }}
      >
        {de
          ? 'Muster aus den letzten 60 Tagen deiner eigenen Daten. Aktualisiert sich, während du trainierst.'
          : 'Patterns derived from the last 60 days of your own data. Updates as you train.'}
      </p>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {insights.slice(0, 6).map((ins) => (
          <InsightCard key={ins.id} insight={ins} />
        ))}
      </div>

      <p
        className="text-[11px] mt-4"
        style={{ color: 'var(--color-muted)' }}
      >
        {de ? 'Zuletzt aktualisiert' : 'Last updated'} {format(today, 'EEE d LLL · HH:mm')}
      </p>
    </div>
  )
}
