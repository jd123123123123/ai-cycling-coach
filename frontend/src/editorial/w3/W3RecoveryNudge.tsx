import { Activity, AlertTriangle } from 'lucide-react'
import { useMorningHealthCheck } from '../../hooks/useMorningHealthCheck'
import { useLocale } from '../../contexts/LocaleContext'
import { T, FONT } from './w3tokens'

/**
 * W3 · Recovery nudge — the live app's "Erholungssignal / Gute Erholung" morning
 * signal, in W3 dress. Real data: GET /health/morning-check
 * (services/morning_health_detector.py) — only fires when the athlete's Garmin
 * signals are meaningfully off their own baseline, in EITHER direction (a
 * warning or an earned recovery opportunity). Each signal chip shows a mini
 * trend from the real series, the delta vs baseline, and is coloured by
 * polarity. Honest: renders nothing on a normal morning (no signal to give).
 */

const METRIC_LABEL: Record<string, { en: string; de: string }> = {
  resting_hr: { en: 'Resting HR', de: 'Ruhepuls' },
  hrv: { en: 'HRV', de: 'HRV' },
  respiration: { en: 'Respiration', de: 'Atemfrequenz' },
  spo2: { en: 'SpO₂', de: 'SpO₂' },
  sleep_score: { en: 'Sleep', de: 'Schlaf' },
}

// Which direction is FAVORABLE per metric (higher-is-better vs lower-is-better).
const HIGHER_IS_BETTER: Record<string, boolean> = {
  hrv: true, sleep_score: true, spo2: true, resting_hr: false, respiration: false,
}

/** Per-signal colour: green when the move is favourable, red when it's an
 *  adverse strong move, amber for a mild adverse move. */
function signalColor(metric: string, direction: 'up' | 'down', severity: 'mild' | 'strong'): string {
  const higherBetter = HIGHER_IS_BETTER[metric] ?? true
  const favorable = direction === (higherBetter ? 'up' : 'down')
  if (favorable) return T.training
  return severity === 'strong' ? T.bad : T.warn
}

function Sparkline({ series, color }: { series: number[]; color: string }) {
  if (!series || series.length < 2) return null
  const w = 58, h = 20, min = Math.min(...series), max = Math.max(...series)
  const span = max - min || 1
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * w
    const y = h - ((v - min) / span) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const last = series[series.length - 1]
  const lx = w, ly = h - ((last - min) / span) * h
  return (
    <svg width={w} height={h} style={{ overflow: 'visible', flex: 'none' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.4} fill={color} />
    </svg>
  )
}

export default function W3RecoveryNudge() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = useMorningHealthCheck()

  if (!data || data.level === 'none' || !data.polarity || !data.signals?.length) return null

  const warning = data.polarity === 'warning'
  const accent = warning ? T.warn : T.training
  const eyebrow = warning
    ? (de ? 'GESUNDHEITS-FRÜHWARNUNG' : 'HEALTH EARLY-WARNING')
    : (de ? 'ERHOLUNGSSIGNAL' : 'RECOVERY SIGNAL')

  return (
    <div style={{ ...band(26), gap: 12 }}>
      <div style={{ borderRadius: 24, padding: 18, background: T.surface, border: `1px solid ${accent}44`, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: `0 0 30px ${accent}14` }}>
        {/* Header */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ width: 42, height: 42, borderRadius: 100, background: `${accent}22`, display: 'grid', placeItems: 'center', flex: 'none' }}>
            {warning ? <AlertTriangle size={20} color={accent} /> : <Activity size={20} color={accent} />}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.4, color: accent }}>{eyebrow}</span>
            <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>{data.headline}</span>
          </div>
        </div>

        {/* Signal chips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.signals.slice(0, 3).map((s) => {
            const label = (METRIC_LABEL[s.metric]?.[de ? 'de' : 'en']) ?? s.metric
            const d = s.delta ?? 0
            const sign = d > 0 ? '+' : d < 0 ? '−' : ''
            const mag = Math.abs(d)
            const deltaStr = s.delta == null ? '—' : s.unit === '%' ? `${sign}${mag.toFixed(0)}%` : `${sign}${mag % 1 === 0 ? mag : mag.toFixed(1)}`
            const c = signalColor(s.metric, s.direction, s.severity)
            return (
              <div key={s.metric} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 100, border: `1px solid ${c}33` }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, width: 74, flex: 'none' }}>{label}</span>
                <Sparkline series={s.series} color={c} />
                <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 800, color: c }}>{deltaStr}</span>
                {s.baseline != null && <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet, flex: 'none' }}>vs {Math.round(s.baseline)}</span>}
              </div>
            )
          })}
        </div>

        {/* Body */}
        {data.recommendation && (
          <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>{data.recommendation}</span>
        )}
      </div>
    </div>
  )
}

const band = (padBottom: number) => ({ display: 'flex', flexDirection: 'column' as const, width: '100%', background: T.bg, padding: `0 20px ${padBottom}px`, fontFamily: FONT })
