import { useMemo } from 'react'
import { subDays } from 'date-fns'
import { Wind, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useCountUp } from '../../hooks/useCountUp'
import type { ActivityRead } from '../../api/dashboard'
import { useLocale } from '../../contexts/LocaleContext'

type Loc = 'en' | 'de'

// VO2Max estimator — sport-aware, rolling 30-day window.
//
// CYCLING: VO2max (ml/kg/min) ≈ FTP × 10.8 / weight + 7  (Storer, 1990 adapted)
//          FTP = best NP × 0.97 on 40-90 min rides in the window.
//
// RUNNING: Jack Daniels' VDOT from best recent race/effort.
//          VDOT ≈ 3.5 · v_crit (m/min) / 210 + 7.5  simplified from VDOT tables.
//          v_crit from best pace on runs ≥ 3 km.
//
// The classification bands are ACSM/Cooper reference percentiles for
// recreational-to-trained endurance athletes (age-adjusted is coming —
// for now we show the raw number + a qualitative tier).

const WINDOW_DAYS_RECENT = 30
const WINDOW_DAYS_PRIOR = 60

type Sport = 'cycling' | 'running'

// ─── Sport-specific extractors ─────────────────────────────────────────────

function bestCyclingFTP(
  activities: ActivityRead[],
  startMs: number,
  endMs: number,
): number | null {
  const pool = activities.filter((a) => {
    if (a.sport !== 'cycling') return false
    if (a.normalized_power == null || a.normalized_power <= 0) return false
    const dur = a.duration_seconds
    if (dur == null || dur < 40 * 60 || dur > 90 * 60) return false
    const t = new Date(a.started_at).getTime()
    return t >= startMs && t <= endMs
  })
  if (pool.length === 0) return null
  const bestNP = Math.max(...pool.map((a) => a.normalized_power as number))
  return Math.round(bestNP * 0.97)
}

function bestRunningPaceMS(
  activities: ActivityRead[],
  startMs: number,
  endMs: number,
): number | null {
  // Fastest meters-per-second on runs >= 3km.
  const pool = activities.filter((a) => {
    if (a.sport !== 'running') return false
    if (!a.distance_meters || a.distance_meters < 3000) return false
    if (!a.duration_seconds || a.duration_seconds <= 0) return false
    const t = new Date(a.started_at).getTime()
    return t >= startMs && t <= endMs
  })
  if (pool.length === 0) return null
  const speeds = pool.map((a) => a.distance_meters! / a.duration_seconds!)
  return Math.max(...speeds)
}

function cyclingVO2(ftpWatts: number | null, weightKg: number | null): number | null {
  if (ftpWatts == null || weightKg == null || weightKg <= 0) return null
  return (ftpWatts * 10.8) / weightKg + 7
}

function runningVO2(bestPaceMs: number | null): number | null {
  if (bestPaceMs == null) return null
  // Convert m/s → m/min → simplified VDOT → VO2
  const vMin = bestPaceMs * 60
  return (3.5 * vMin) / 210 + 7.5
}

function classifyVO2(vo2: number, sport: Sport, locale: Loc): { label: string; color: string } {
  // Coarse generic adult-male endurance bands. Close enough for the
  // qualitative chip; proper age/sex adjustment is a future refinement.
  const de = locale === 'de'
  const L = {
    elite: de ? 'ELITE' : 'ELITE',
    excellent: de ? 'HERVORRAGEND' : 'EXCELLENT',
    strong: de ? 'STARK' : 'STRONG',
    fit: de ? 'FIT' : 'FIT',
    building: de ? 'IM AUFBAU' : 'BUILDING',
  }
  if (sport === 'cycling') {
    if (vo2 >= 60) return { label: L.elite, color: '#30D158' }
    if (vo2 >= 52) return { label: L.excellent, color: '#30D158' }
    if (vo2 >= 45) return { label: L.strong, color: 'var(--color-forest-2)' }
    if (vo2 >= 38) return { label: L.fit, color: 'var(--color-amber)' }
    return { label: L.building, color: 'var(--color-muted)' }
  }
  if (vo2 >= 65) return { label: L.elite, color: '#30D158' }
  if (vo2 >= 55) return { label: L.excellent, color: '#30D158' }
  if (vo2 >= 48) return { label: L.strong, color: 'var(--color-forest-2)' }
  if (vo2 >= 40) return { label: L.fit, color: 'var(--color-amber)' }
  return { label: L.building, color: 'var(--color-muted)' }
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function VO2MaxEstimate({ sport }: { sport: Sport }) {
  const { locale } = useLocale()
  const today = new Date()
  const start = subDays(today, WINDOW_DAYS_PRIOR)
  const { data: actsData } = useActivitiesRange(start, today)
  const { data: profile } = useAthleteProfile()

  const { vo2, vo2Prior, delta, tier, supportNumber, supportUnit } = useMemo(() => {
    const activities = actsData?.activities ?? []
    const now = today.getTime()
    const recentStart = subDays(today, WINDOW_DAYS_RECENT).getTime()
    const priorStart = subDays(today, WINDOW_DAYS_PRIOR).getTime()
    const priorEnd = recentStart

    let current: number | null = null
    let prior: number | null = null
    let support: number | null = null
    let unit: string = ''

    if (sport === 'cycling') {
      const ftpRecent = bestCyclingFTP(activities, recentStart, now)
      const ftpPrior = bestCyclingFTP(activities, priorStart, priorEnd)
      const weight = profile?.weight_kg ?? null
      current = cyclingVO2(ftpRecent, weight)
      prior = cyclingVO2(ftpPrior, weight)
      support = ftpRecent
      unit = 'W FTP'
    } else {
      const pRecent = bestRunningPaceMS(activities, recentStart, now)
      const pPrior = bestRunningPaceMS(activities, priorStart, priorEnd)
      current = runningVO2(pRecent)
      prior = runningVO2(pPrior)
      support = pRecent != null ? pRecent : null
      unit = support != null ? `min/km best` : ''
    }

    const d = current != null && prior != null ? current - prior : null
    const t = current != null ? classifyVO2(current, sport, locale) : null

    return {
      vo2: current,
      vo2Prior: prior,
      delta: d,
      tier: t,
      supportNumber: support,
      supportUnit: unit,
    }
  }, [actsData, profile, sport, today, locale])

  const countedVO2 = useCountUp(Math.round((vo2 ?? 0) * 10) / 10, {
    duration: 900,
    enabled: vo2 != null,
  })

  if (vo2 == null) {
    return (
      <div
        className="paper-grain rounded-[20px] px-6 py-6 text-center"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: '1px dashed var(--color-rule)',
        }}
      >
        <Wind size={18} style={{ color: 'var(--color-muted)', margin: '0 auto' }} />
        <p
          className="text-[13px] mt-2"
          style={{ color: 'var(--color-muted)' }}
        >
          {sport === 'cycling'
            ? (locale === 'de'
                ? 'Zeichne eine 40–90-Min-Fahrt mit Leistung auf, um deine VO2-Max-Schätzung zu sehen.'
                : 'Log a 40–90 min ride with power to see your VO2 max estimate.')
            : (locale === 'de'
                ? 'Zeichne einen Lauf ≥ 3 km auf, um deine VO2-Max-Schätzung zu sehen.'
                : 'Log a run ≥ 3 km to see your VO2 max estimate.')}
        </p>
        {sport === 'cycling' && !profile?.weight_kg && (
          <p
            className="text-[11px] mt-1"
            style={{ color: 'var(--color-amber)' }}
          >
            {locale === 'de'
              ? 'Körpergewicht fehlt — trage es im Profil für die Rad-VO2 ein.'
              : 'Body weight missing — add it in Profile for cycling VO2.'}
          </p>
        )}
      </div>
    )
  }

  const DeltaIcon =
    delta == null || Math.abs(delta) < 0.4
      ? Minus
      : delta > 0
        ? TrendingUp
        : TrendingDown
  const deltaColor =
    delta == null || Math.abs(delta) < 0.4
      ? 'var(--color-muted)'
      : delta > 0
        ? '#30D158'
        : 'var(--color-amber)'

  let supportLine = ''
  if (sport === 'cycling' && supportNumber != null) {
    supportLine = locale === 'de'
      ? `Bestes FTP-Fenster: ${supportNumber} W · Gewicht ${profile?.weight_kg ?? '—'} kg`
      : `Best FTP window: ${supportNumber} W · weight ${profile?.weight_kg ?? '—'} kg`
  } else if (sport === 'running' && supportNumber != null) {
    const paceMinPerKm = 1000 / supportNumber / 60
    const minutes = Math.floor(paceMinPerKm)
    const seconds = Math.round((paceMinPerKm - minutes) * 60)
    supportLine = locale === 'de'
      ? `Bestes Pace-Fenster: ${minutes}:${String(seconds).padStart(2, '0')} min/km`
      : `Best pace window: ${minutes}:${String(seconds).padStart(2, '0')} min/km`
  }

  return (
    <div
      className="relative paper-grain rounded-[22px] px-6 py-6 sm:px-8 sm:py-8 overflow-hidden"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
        backgroundImage: tier
          ? `radial-gradient(80% 60% at 100% 0%, color-mix(in srgb, ${tier.color} 10%, transparent), transparent 55%)`
          : undefined,
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Wind size={13} strokeWidth={2} style={{ color: 'var(--color-forest-2)' }} />
        <span
          className="eyebrow"
          style={{
            color: 'var(--color-ink)',
            letterSpacing: '0.28em',
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          VO2 max · {locale === 'de' ? (sport === 'cycling' ? 'Radfahren' : 'Laufen') : sport}
        </span>
        {tier && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full num-mono"
            style={{
              fontSize: 9,
              letterSpacing: '0.16em',
              color: tier.color,
              backgroundColor: `color-mix(in srgb, ${tier.color} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${tier.color} 28%, transparent)`,
            }}
          >
            {tier.label}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-3 flex-wrap">
        <span
          className="num-display leading-none"
          style={{
            fontSize: 'clamp(40px, 5vw, 56px)',
            color: 'var(--color-ink)',
            fontVariationSettings: '"opsz" 144, "wght" 500',
          }}
        >
          {countedVO2.toFixed(1)}
        </span>
        <span
          className="num-mono"
          style={{ fontSize: 11, color: 'var(--color-muted)', letterSpacing: '0.14em' }}
        >
          ML/KG/MIN
        </span>
        {delta != null && (
          <span
            className="inline-flex items-center gap-1 num-mono"
            style={{ color: deltaColor, fontSize: 12, fontWeight: 600 }}
          >
            <DeltaIcon size={11} strokeWidth={2.2} />
            {delta > 0 ? '+' : ''}{delta.toFixed(1)} {locale === 'de' ? 'ggü. 30T zuvor' : 'vs 30d prior'}
          </span>
        )}
      </div>

      {supportLine && (
        <p
          className="text-[12px] mt-3"
          style={{
            fontFamily: '"Fraunces", serif',
            fontStyle: 'italic',
            fontVariationSettings: '"opsz" 30, "wght" 400',
            color: 'var(--color-muted)',
          }}
        >
          {supportLine}
        </p>
      )}

      <p className="text-[11px] mt-2" style={{ color: 'var(--color-muted)' }}>
        {sport === 'cycling'
          ? (locale === 'de'
              ? `Geschätzt aus bester NP × 0,97 ÷ Gewicht (Storer). Eine Veränderung von +4–6 Einheiten ist über eine Saison mit strukturierter Z2- + VO2-Arbeit typisch.`
              : `Estimated from best NP × 0.97 ÷ weight (Storer). Lifetime change of +4–6 units typical across a season of structured Z2 + VO2 work.`)
          : (locale === 'de'
              ? `Geschätzt aus schnellster Pace über ≥ 3 km (Daniels VDOT). +3–5 Einheiten sind ein starker Saisongewinn.`
              : `Estimated from fastest pace over ≥ 3 km (Daniels VDOT). +3–5 units is a strong seasonal gain.`)}
      </p>
    </div>
  )
}
