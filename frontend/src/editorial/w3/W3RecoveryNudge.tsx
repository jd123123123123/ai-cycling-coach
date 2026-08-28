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

/**
 * The series AND the line it is being judged against.
 *
 * The card's whole sentence is "X is N below your baseline", and the chart used
 * to draw only X — the rider could see a line moving without seeing the level
 * that made it worth mentioning. `baseline` already arrives on every signal
 * from GET /health/morning-check; drawing it costs one dashed rule and turns a
 * shape into a reading.
 *
 * The baseline is folded into the domain before scaling. Without that, a
 * baseline outside the series' own min/max — exactly the case when a rider is
 * having a genuinely unusual morning, which is when this card appears — would
 * be clamped to the edge or drawn outside the 20px box.
 */
function Sparkline({ series, baseline, color }: { series: number[]; baseline: number | null; color: string }) {
  if (!series || series.length < 2) return null
  const w = 58, h = 20
  const domain = baseline != null ? [...series, baseline] : series
  const min = Math.min(...domain), max = Math.max(...domain)
  const span = max - min || 1
  const y = (v: number) => h - ((v - min) / span) * h
  const pts = series.map((v, i) => `${((i / (series.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = series[series.length - 1]
  return (
    <svg width={w} height={h} style={{ overflow: 'visible', flex: 'none' }} aria-hidden>
      {baseline != null && (
        <line x1={0} x2={w} y1={y(baseline)} y2={y(baseline)}
          stroke={T.d2} strokeWidth={1} strokeDasharray="2 2" />
      )}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={y(last)} r={2.4} fill={color} />
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
      <div style={{ borderRadius: 24, padding: 20, background: T.surface, border: `1px solid ${T.stroke}`, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Header */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ width: 40, height: 40, borderRadius: 14, background: `${accent}1F`, display: 'grid', placeItems: 'center', flex: 'none' }}>
            {warning ? <AlertTriangle size={19} color={accent} /> : <Activity size={19} color={accent} />}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: accent }}>{eyebrow}</span>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>{data.headline}</span>
          </div>
        </div>

        {/* Signal chips — W3 pills, per-signal colour on the trend + delta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {/* TRIGGERED FIRST, and the cap is why it matters.
              Every measured marker now arrives, not only the deviating ones —
              which is what finally puts HRV on this card on an ordinary
              morning. But only three are drawn, so arrival order would let a
              perfectly normal SpO2 push the actual reason for the warning off
              the card. Sorted so the markers that earned the warning are the
              ones the rider sees, and the calm ones fill whatever room is
              left. */}
          {[...data.signals]
            .sort((a, b) => Number(b.triggered ?? false) - Number(a.triggered ?? false))
            .slice(0, 3).map((s) => {
            const label = (METRIC_LABEL[s.metric]?.[de ? 'de' : 'en']) ?? s.metric
            const d = s.delta ?? 0
            const sign = d > 0 ? '+' : d < 0 ? '−' : ''
            const mag = Math.abs(d)
            const deltaStr = s.delta == null ? '—' : s.unit === '%' ? `${sign}${mag.toFixed(0)}%` : `${sign}${mag % 1 === 0 ? mag : mag.toFixed(1)}`
            const c = signalColor(s.metric, s.direction, s.severity)
            return (
              <div key={s.metric} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderRadius: 16, background: T.surface2 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.mid, width: 78, flex: 'none' }}>{label}</span>
                <Sparkline series={s.series} baseline={s.baseline} color={c} />
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.4, color: c }}>{deltaStr}</span>
                  {s.baseline != null && <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet, flex: 'none' }}>vs {Math.round(s.baseline)}</span>}
                </span>
              </div>
            )
          })}
        </div>

        {/* Body */}
        {data.recommendation && (
          <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>{data.recommendation}</span>
        )}
      </div>
    </div>
  )
}

const band = (padBottom: number) => ({ display: 'flex', flexDirection: 'column' as const, width: '100%', background: T.bg, padding: `0 20px ${padBottom}px`, fontFamily: FONT })
