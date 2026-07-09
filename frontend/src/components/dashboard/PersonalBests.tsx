import { useMemo } from 'react'
import { subDays, format, isAfter } from 'date-fns'
import { Trophy, Zap, Timer, Gauge, Route, Share2 } from 'lucide-react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useCountUp } from '../../hooks/useCountUp'
import { useLocale } from '../../contexts/LocaleContext'
import type { ActivityRead } from '../../api/dashboard'
import { de } from 'date-fns/locale'

// Personal Records — the single most addictive feature in any sports app.
// Every Strava KOM, every Whoop monthly best, every Garmin Personal Record
// exists because athletes are wired to chase numbers they set themselves.
// We compute records client-side from the last 90 days and surface them as
// celebration cards. If the record was set in the last 7 days, it glows.

interface PR {
  key: string
  label: string
  value: string
  rawValue: number
  date: string
  sport: ActivityRead['sport']
  icon: React.ReactNode
  accent: string
  isNew: boolean
  activityTitle: string | null
}

function avgRunningPaceMinPerKm(a: ActivityRead): number | null {
  if (!a.distance_meters || !a.duration_seconds || a.distance_meters < 100) return null
  return a.duration_seconds / 60 / (a.distance_meters / 1000)
}

function fmtPace(minPerKm: number): string {
  const minutes = Math.floor(minPerKm)
  const seconds = Math.round((minPerKm - minutes) * 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function computePRs(activities: ActivityRead[], sevenDaysAgo: Date, locale: 'en' | 'de'): PR[] {
  const prs: PR[] = []

  const cycling = activities.filter((a) => a.sport === 'cycling')
  const running = activities.filter((a) => a.sport === 'running')

  // ── Cycling: Longest ride ───────────────────────────────────────────────
  const longestRide = cycling
    .filter((a) => a.distance_meters != null && a.distance_meters > 0)
    .sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0))[0]
  if (longestRide?.distance_meters) {
    const km = longestRide.distance_meters / 1000
    prs.push({
      key: 'longest-ride',
      label: locale === 'de' ? 'Längste Ausfahrt' : 'Longest ride',
      value: `${km.toFixed(1)} km`,
      rawValue: km,
      date: longestRide.started_at,
      sport: 'cycling',
      icon: <Route size={14} strokeWidth={1.8} />,
      accent: 'var(--color-forest-2)',
      isNew: isAfter(new Date(longestRide.started_at), sevenDaysAgo),
      activityTitle: longestRide.title,
    })
  }

  // ── Cycling: Peak normalized power ─────────────────────────────────────
  const peakNP = cycling
    .filter((a) => a.normalized_power != null && a.normalized_power > 0)
    .sort((a, b) => (b.normalized_power ?? 0) - (a.normalized_power ?? 0))[0]
  if (peakNP?.normalized_power) {
    prs.push({
      key: 'peak-np',
      label: locale === 'de' ? 'Spitzenleistung' : 'Peak power',
      value: `${Math.round(peakNP.normalized_power)} W`,
      rawValue: peakNP.normalized_power,
      date: peakNP.started_at,
      sport: 'cycling',
      icon: <Zap size={14} strokeWidth={1.8} />,
      accent: 'rgba(190, 124, 34, 0.95)',
      isNew: isAfter(new Date(peakNP.started_at), sevenDaysAgo),
      activityTitle: peakNP.title,
    })
  }

  // ── Any sport: Biggest TSS session ──────────────────────────────────────
  const biggestTSS = activities
    .filter((a) => a.tss != null && a.tss > 0)
    .sort((a, b) => (b.tss ?? 0) - (a.tss ?? 0))[0]
  if (biggestTSS?.tss) {
    prs.push({
      key: 'biggest-tss',
      label: locale === 'de' ? 'Größte Einheit' : 'Biggest session',
      value: `${Math.round(biggestTSS.tss)} TSS`,
      rawValue: biggestTSS.tss,
      date: biggestTSS.started_at,
      sport: biggestTSS.sport,
      icon: <Gauge size={14} strokeWidth={1.8} />,
      accent: 'rgba(214, 87, 47, 1)',
      isNew: isAfter(new Date(biggestTSS.started_at), sevenDaysAgo),
      activityTitle: biggestTSS.title,
    })
  }

  // ── Cycling: Longest duration ───────────────────────────────────────────
  const longestCyclingDur = cycling
    .filter((a) => a.duration_seconds != null && a.duration_seconds > 0)
    .sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0))[0]
  if (longestCyclingDur?.duration_seconds) {
    const h = longestCyclingDur.duration_seconds / 3600
    prs.push({
      key: 'longest-ride-time',
      label: locale === 'de' ? 'Längste Dauer' : 'Longest time',
      value: h >= 1 ? `${h.toFixed(1)} h` : `${Math.round(longestCyclingDur.duration_seconds / 60)} min`,
      rawValue: h,
      date: longestCyclingDur.started_at,
      sport: 'cycling',
      icon: <Timer size={14} strokeWidth={1.8} />,
      accent: 'var(--color-forest-2)',
      isNew: isAfter(new Date(longestCyclingDur.started_at), sevenDaysAgo),
      activityTitle: longestCyclingDur.title,
    })
  }

  // ── Running: Fastest pace ───────────────────────────────────────────────
  const fastestPace = running
    .map((a) => ({ a, pace: avgRunningPaceMinPerKm(a) }))
    .filter((x): x is { a: ActivityRead; pace: number } =>
      x.pace !== null && x.pace > 2 && x.pace < 20 &&
      (x.a.distance_meters ?? 0) > 500,
    )
    .sort((a, b) => a.pace - b.pace)[0]
  if (fastestPace) {
    prs.push({
      key: 'fastest-pace',
      label: locale === 'de' ? 'Schnellstes Tempo' : 'Fastest pace',
      value: `${fmtPace(fastestPace.pace)} /km`,
      rawValue: fastestPace.pace,
      date: fastestPace.a.started_at,
      sport: 'running',
      icon: <Zap size={14} strokeWidth={1.8} />,
      accent: 'rgba(190, 124, 34, 0.95)',
      isNew: isAfter(new Date(fastestPace.a.started_at), sevenDaysAgo),
      activityTitle: fastestPace.a.title,
    })
  }

  // ── Running: Longest run ────────────────────────────────────────────────
  const longestRun = running
    .filter((a) => a.distance_meters != null && a.distance_meters > 0)
    .sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0))[0]
  if (longestRun?.distance_meters) {
    const km = longestRun.distance_meters / 1000
    prs.push({
      key: 'longest-run',
      label: locale === 'de' ? 'Längster Lauf' : 'Longest run',
      value: `${km.toFixed(1)} km`,
      rawValue: km,
      date: longestRun.started_at,
      sport: 'running',
      icon: <Route size={14} strokeWidth={1.8} />,
      accent: 'var(--color-amber-2)',
      isNew: isAfter(new Date(longestRun.started_at), sevenDaysAgo),
      activityTitle: longestRun.title,
    })
  }

  return prs.filter((pr) => pr.rawValue > 0)
}

function PRCard({ pr, locale }: { pr: PR; locale: 'en' | 'de' }) {
  const animatedValue = useCountUp(pr.rawValue, {
    durationMs: 800,
    digits: pr.rawValue < 10 ? 1 : 0,
    skipZero: false,
  })

  const displayValue = (() => {
    if (pr.key === 'fastest-pace') return pr.value
    if (pr.key === 'biggest-tss' || pr.key === 'peak-np') return `${Math.round(animatedValue)} ${pr.value.split(' ').slice(1).join(' ')}`
    if (pr.key.includes('time') || pr.key.includes('dur')) return pr.value
    return `${animatedValue.toFixed(animatedValue < 10 ? 1 : 0)} ${pr.value.split(' ').slice(1).join(' ')}`
  })()

  return (
    <div
      className="relative flex-shrink-0 flex flex-col gap-2 rounded-[14px] px-4 py-3"
      style={{
        minWidth: 148,
        maxWidth: 180,
        backgroundColor: 'var(--color-paper)',
        border: `1px solid ${pr.isNew ? pr.accent + '55' : 'var(--color-rule)'}`,
        boxShadow: pr.isNew ? `0 0 18px color-mix(in srgb, ${pr.accent} 18%, transparent)` : 'none',
      }}
    >
      {/* NEW badge */}
      {pr.isNew && (
        <div
          className="absolute top-2.5 right-3 flex items-center gap-1"
          style={{ animation: 'score-enter 400ms cubic-bezier(.22,1,.36,1) both' }}
        >
          <Trophy
            size={11}
            strokeWidth={2}
            style={{ color: pr.accent }}
          />
          <span
            className="eyebrow"
            style={{ color: pr.accent, fontSize: 10.5, letterSpacing: '0.18em' }}
          >
            {locale === 'de' ? 'NEU' : 'NEW'}
          </span>
        </div>
      )}

      {/* Icon + label */}
      <div className="flex items-center gap-1.5">
        <span style={{ color: pr.accent }}>{pr.icon}</span>
        <span
          className="eyebrow"
          style={{ color: 'var(--color-muted)', fontSize: 10.5, letterSpacing: '0.18em' }}
        >
          {pr.label.toUpperCase()}
        </span>
      </div>

      {/* Value */}
      <span
        className="num-display leading-none"
        style={{
          fontSize: 'clamp(18px, 2.2vw, 22px)',
          color: pr.isNew ? pr.accent : 'var(--color-ink)',
        }}
      >
        {displayValue}
      </span>

      {/* Date */}
      <span
        className="num-mono text-[10px]"
        style={{ color: 'var(--color-muted)' }}
      >
        {format(new Date(pr.date), 'MMM d', locale === 'de' ? { locale: de } : undefined)}
        {pr.activityTitle ? ` · ${pr.activityTitle.slice(0, 18)}${pr.activityTitle.length > 18 ? '…' : ''}` : ''}
      </span>

      {/* Share — Web Share API with clipboard fallback.
         Always rendered on NEW PRs; subtle opacity on older ones. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          const text = locale === 'de'
            ? `Gerade eine neue Bestleistung aufgestellt — ${pr.label.toLowerCase()}: ${pr.value}. Das ist die Fitness, die der letzte Block gebracht hat. 🚴`
            : `Just set a new personal best — ${pr.label.toLowerCase()}: ${pr.value}. This is the fitness the last block earned. 🚴`
          const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
          if (nav.share) {
            nav.share({ title: locale === 'de' ? 'Bestleistung' : 'Personal best', text }).catch(() => {})
          } else if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).catch(() => {})
          }
        }}
        className="absolute bottom-2.5 right-2.5 p-1.5 rounded-md transition-opacity"
        style={{
          opacity: pr.isNew ? 0.9 : 0,
          color: pr.accent,
          backgroundColor: 'transparent',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = pr.isNew ? '0.9' : '0' }}
        aria-label={locale === 'de' ? `${pr.label} teilen` : `Share ${pr.label}`}
        title={locale === 'de' ? 'Teilen' : 'Share'}
      >
        <Share2 size={12} strokeWidth={2} />
      </button>
    </div>
  )
}

export default function PersonalBests() {
  const { locale } = useLocale()
  const today = new Date()
  const ninetyDaysAgo = subDays(today, 90)
  const sevenDaysAgo = subDays(today, 7)

  const { data, isLoading } = useActivitiesRange(ninetyDaysAgo, today)

  const prs = useMemo(
    () => computePRs(data?.activities ?? [], sevenDaysAgo, locale),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, locale],
  )

  if (isLoading) {
    return (
      <div
        className="rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: '1px solid var(--color-rule)',
        }}
      >
        <div className="h-4 w-40 rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
        <div className="flex gap-3 mt-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 w-36 rounded-[14px] flex-shrink-0 animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
          ))}
        </div>
      </div>
    )
  }

  if (prs.length === 0) return null

  const hasNew = prs.some((pr) => pr.isNew)

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Trophy
          size={13}
          strokeWidth={1.8}
          style={{ color: hasNew ? 'rgba(190, 124, 34, 0.95)' : 'var(--color-muted)' }}
        />
        <span
          className="eyebrow"
          style={{
            color: hasNew ? 'rgba(190, 124, 34, 0.95)' : 'var(--color-muted)',
            letterSpacing: '0.22em',
          }}
        >
          {hasNew
            ? (locale === 'de' ? 'Bestleistungen · neu diese Woche' : 'Personal records · new this week')
            : (locale === 'de' ? 'Bestleistungen · letzte 90 Tage' : 'Personal records · last 90 days')}
        </span>
      </div>

      {/* Scrollable cards */}
      <div
        className="flex gap-3 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {prs
          .sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0))
          .map((pr) => (
            <PRCard key={pr.key} pr={pr} locale={locale} />
          ))}
      </div>
    </div>
  )
}
