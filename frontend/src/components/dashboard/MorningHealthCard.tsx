/**
 * MorningHealthCard — morning-health early-warning (illness / significant
 * downturn). Renders ONLY when the backend detector returns level != 'none';
 * a normal morning shows nothing (honest empty). Every number is real Garmin
 * data cited against the athlete's own baseline — no fabrication, no diagnosis.
 *
 * Backed by GET /health/morning-check (services/morning_health_detector.py):
 * the cluster verdict + localized recommendation come from the server; this
 * card only presents them and the deviating markers. Bike-only, German-first.
 */
import { AlertTriangle, Thermometer, Activity } from 'lucide-react'
import { useMorningHealthCheck, type MorningHealthCheck } from '../../hooks/useMorningHealthCheck'
import { useLocale } from '../../contexts/LocaleContext'
import { GLASS_CARD_MARKER, GLASS_PAPER_2, GLASS_BLUR } from './glassCard'

type Level = MorningHealthCheck['level']

// Level → accent color + icon. watch = calm amber/stand; elevated = amber;
// high = the move/alert red. Tuned so the card escalates visually with risk.
function levelStyle(level: Level): { color: string; Icon: typeof AlertTriangle } {
  switch (level) {
    case 'high': return { color: 'var(--color-move)', Icon: Thermometer }
    case 'elevated': return { color: 'var(--color-amber)', Icon: AlertTriangle }
    case 'watch': return { color: 'var(--color-stand)', Icon: Activity }
    default: return { color: 'var(--color-muted)', Icon: Activity }
  }
}

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

function deltaText(sig: MorningHealthCheck['signals'][number]): string {
  if (sig.delta == null) return `${sig.value}${sig.unit}`
  const sign = sig.delta > 0 ? '+' : sig.delta < 0 ? '−' : ''
  const mag = Math.abs(sig.delta)
  const sep = sig.unit === '%' || sig.unit === '' ? '' : ' '
  return `${sign}${mag}${sep}${sig.unit}`.trim()
}

export default function MorningHealthCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = useMorningHealthCheck()

  // Honest empty: nothing to warn about, or data not (yet) available.
  if (!data || data.level === 'none' || data.signals.length === 0) return null

  const { color, Icon } = levelStyle(data.level)
  const eyebrow = de ? 'Gesundheits-Frühwarnung' : 'Health early-warning'

  return (
    <div
      className="relative overflow-hidden rounded-[24px] p-5 flex flex-col gap-4"
      style={{
        background: `linear-gradient(150deg, color-mix(in srgb, ${color} 16%, ${GLASS_PAPER_2}) 0%, ${GLASS_PAPER_2} 66%)`,
        border: `1px solid color-mix(in srgb, ${color} 45%, var(--color-rule))`,
        boxShadow: `0 12px 34px -18px color-mix(in srgb, ${color} 70%, transparent)`,
        ...GLASS_BLUR,
      }}
      role="alert"
      {...GLASS_CARD_MARKER}
    >
      <div className="flex items-start gap-3.5">
        <div
          className="shrink-0 grid place-items-center rounded-full"
          style={{ width: 44, height: 44, background: `color-mix(in srgb, ${color} 22%, transparent)` }}
        >
          <Icon size={22} strokeWidth={2} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="eyebrow"
            style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color }}
          >
            {eyebrow.toUpperCase()}
          </div>
          <div className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)', lineHeight: 1.15 }}>
            {data.headline}
          </div>
        </div>
      </div>

      {/* Cited deviating markers — value vs personal baseline. */}
      <div className="flex flex-wrap gap-2">
        {data.signals.map((sig) => (
          <div
            key={sig.metric}
            className="flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{
              background: 'var(--color-surface-2)',
              border: `1px solid color-mix(in srgb, ${color} ${sig.severity === 'strong' ? 55 : 30}%, var(--color-rule))`,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>
              {metricLabel(sig.metric, de)}
            </span>
            <span className="num-display" style={{ fontSize: 13, color }}>
              {deltaText(sig)}
            </span>
            {sig.baseline != null && (
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                {de ? 'vs' : 'vs'} {sig.baseline}
              </span>
            )}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--color-ink)', margin: 0 }}>
        {data.recommendation}
      </p>
    </div>
  )
}
