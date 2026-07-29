/**
 * MorningHealthCard — Körper's early-signal surface. Renders ONLY when the
 * backend detector returns level != 'none'; a normal morning shows nothing
 * (honest empty). Every number is real Garmin data cited against the
 * athlete's own baseline — no fabrication, no diagnosis, either direction.
 *
 * Backed by GET /health/morning-check (services/morning_health_detector.py):
 * the verdict (warning OR a genuine, earned recovery opportunity) + localized
 * copy come from the server; this file only presents them, via the shared
 * InsightNudge shell. Bike-only, German-first.
 */
import InsightNudge from '../narrative/InsightNudge'
import { useMorningHealthCheck } from '../../hooks/useMorningHealthCheck'
import { useLocale } from '../../contexts/LocaleContext'

function metricLabel(metric: string, de: boolean): string {
  const en: Record<string, string> = {
    resting_hr: 'Resting HR', hrv: 'HRV', respiration: 'Respiration',
    spo2: 'SpO₂', sleep_score: 'Sleep',
  }
  const dede: Record<string, string> = {
    resting_hr: 'Ruhepuls', hrv: 'HRV', respiration: 'Atemfrequenz',
    spo2: 'SpO₂', sleep_score: 'Schlaf',
  }
  return (de ? dede : en)[metric] ?? metric
}

export default function MorningHealthCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = useMorningHealthCheck()

  // Honest empty: nothing to say, in either direction, or data not (yet) available.
  if (!data || data.level === 'none' || !data.polarity || data.signals.length === 0) return null

  const eyebrow = data.polarity === 'warning'
    ? (de ? 'Gesundheits-Frühwarnung' : 'Health early-warning')
    : (de ? 'Erholungssignal' : 'Recovery signal')

  return (
    <InsightNudge
      polarity={data.polarity}
      level={data.level as 'watch' | 'elevated' | 'high'}
      eyebrow={eyebrow}
      headline={data.headline ?? ''}
      recommendation={data.recommendation ?? ''}
      signals={data.signals}
      metricLabel={(metric) => metricLabel(metric, de)}
    />
  )
}
