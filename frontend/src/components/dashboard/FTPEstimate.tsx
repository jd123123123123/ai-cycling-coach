import { useMemo } from 'react'
import { subDays } from 'date-fns'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useCountUp } from '../../hooks/useCountUp'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'

// Auto-FTP estimate from recent cycling data.
// Method: Coggan-adjacent — best NP from rides 40–90 min long × 0.97.
// Longer rides underestimate FTP; shorter ones overestimate without knowing
// exact effort. 40–90 min sweet spot captures hard race-pace / threshold efforts.
// Shows vs stored FTP with a delta badge. If estimated > stored + 5W → prompt.

const WINDOW_DAYS = 90
const MIN_DURATION_S = 40 * 60
const MAX_DURATION_S = 90 * 60
const FTP_FACTOR = 0.97

export default function FTPEstimate() {
  const { locale } = useLocale()
  const today = new Date()
  const start = useMemo(() => subDays(today, WINDOW_DAYS), [])
  const { data: activitiesData, isLoading: actsLoading } = useActivitiesRange(start, today)
  const { data: profile, isLoading: profLoading } = useAthleteProfile()

  const { estimated, stored, delta, confidence } = useMemo(() => {
    const acts = activitiesData?.activities ?? []
    const storedFtp = profile?.ftp_watts ?? null

    // Filter: cycling, within duration window, has NP
    const candidates = acts.filter(
      (a) =>
        a.sport === 'cycling' &&
        typeof a.normalized_power === 'number' &&
        a.normalized_power > 0 &&
        typeof a.duration_seconds === 'number' &&
        a.duration_seconds >= MIN_DURATION_S &&
        a.duration_seconds <= MAX_DURATION_S,
    )

    if (candidates.length === 0) {
      return { estimated: null, stored: storedFtp, delta: null, confidence: 0 }
    }

    // Best NP within the duration window
    const bestNP = Math.max(...candidates.map((a) => a.normalized_power as number))
    const est = Math.round(bestNP * FTP_FACTOR)
    const d = storedFtp != null ? est - storedFtp : null

    // Confidence: more qualifying rides = higher confidence (cap at 5)
    const conf = Math.min(candidates.length / 5, 1)

    return { estimated: est, stored: storedFtp, delta: d, confidence: conf }
  }, [activitiesData, profile])

  const countedEst = useCountUp(estimated ?? 0, { duration: 900, enabled: estimated != null })
  const countedStored = useCountUp(stored ?? 0, { duration: 700, enabled: stored != null })

  const isLoading = actsLoading || profLoading
  const hasDelta = delta != null && Math.abs(delta) >= 3

  if (isLoading) {
    return (
      <div
        className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
        style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
      >
        <div className="h-4 w-40 rounded animate-pulse mb-3" style={{ backgroundColor: 'var(--color-rule)' }} />
        <div className="h-12 w-full rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
      </div>
    )
  }

  if (estimated == null && stored == null) return null

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: hasDelta && delta! > 0
          ? '1px solid rgba(48, 209, 88, 0.30)'
          : '1px solid var(--color-rule)',
      }}
    >
      <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
        {locale === 'de' ? 'FTP · Auto-Schätzung' : 'FTP · auto-estimate'}
      </span>

      <div className="flex items-end gap-6 mt-2 flex-wrap">
        {/* Estimated FTP */}
        {estimated != null && (
          <div>
            <span className="eyebrow" style={{ color: '#30D158', fontSize: 10.5, letterSpacing: '0.18em' }}>
              {locale === 'de' ? 'ERKANNT' : 'DETECTED'}
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span
                className="num-display leading-none"
                style={{ fontSize: 'clamp(26px, 3.2vw, 34px)', color: 'var(--color-ink)' }}
              >
                {countedEst}
              </span>
              <span className="num-mono text-[12px]" style={{ color: 'var(--color-ink-2)' }}>W</span>
            </div>
          </div>
        )}

        {/* Stored FTP */}
        {stored != null && (
          <div>
            <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10.5, letterSpacing: '0.18em' }}>
              {locale === 'de' ? 'GESPEICHERT' : 'STORED'}
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span
                className="num-display leading-none"
                style={{ fontSize: 'clamp(18px, 2.2vw, 24px)', color: 'var(--color-ink-2)' }}
              >
                {countedStored}
              </span>
              <span className="num-mono text-[11px]" style={{ color: 'var(--color-muted)' }}>W</span>
            </div>
          </div>
        )}

        {/* Delta badge */}
        {hasDelta && (
          <div
            className="flex items-center gap-1 px-2.5 py-1 rounded-[8px]"
            style={{
              backgroundColor: delta! > 0 ? 'rgba(48, 209, 88, 0.10)' : 'rgba(255, 159, 10, 0.10)',
              border: delta! > 0 ? '1px solid rgba(48, 209, 88, 0.25)' : '1px solid rgba(255, 159, 10, 0.25)',
            }}
          >
            {delta! > 0
              ? <TrendingUp size={12} color="#30D158" />
              : <TrendingDown size={12} color="var(--color-amber)" />
            }
            <span
              className="num-mono text-[11px] font-semibold"
              style={{ color: delta! > 0 ? '#30D158' : 'var(--color-amber)' }}
            >
              {delta! > 0 ? '+' : ''}{delta}W
            </span>
          </div>
        )}
      </div>

      {/* Context */}
      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-muted)', maxWidth: '26ch' }}>
          {estimated != null
            ? (locale === 'de'
                ? `Beste NP × 0,97 aus 40–90-Min-Fahrten der letzten ${WINDOW_DAYS}T.`
                : `Best NP × 0.97 from 40–90 min rides in last ${WINDOW_DAYS}d.`)
            : (locale === 'de' ? 'Keine qualifizierenden Fahrten in den letzten 90 Tagen.' : 'No qualifying rides in last 90 days.')}
        </p>
        {/* Confidence dots */}
        {confidence > 0 && (
          <div className="flex items-center gap-1">
            <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10.5 }}>{locale === 'de' ? 'KONFIDENZ' : 'CONFIDENCE'}</span>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }, (_, i) => (
                <span
                  key={i}
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: i < Math.round(confidence * 5)
                      ? 'var(--color-forest-2)'
                      : 'var(--color-rule)',
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CTA if meaningful delta */}
      {hasDelta && delta! > 5 && (
        <p className="text-[11px] mt-2" style={{ color: '#30D158' }}>
          {locale === 'de'
            ? 'Deine Fitness hat sich womöglich verbessert — erwäge, deine FTP in den Einstellungen zu aktualisieren.'
            : 'Your fitness may have improved — consider updating your FTP in settings.'}
        </p>
      )}
    </div>
  )
}
