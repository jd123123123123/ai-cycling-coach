import { T, FONT } from './w3tokens'

import { READINESS_BANDS, readinessBand } from './w3ReadinessBands'

export default function W3ReadinessSpectrum({ score }: { score: number | null }) {
  const value = score != null && Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null
  return <svg role="img" aria-label={value == null ? 'Bereitschaft: keine aktuelle Messung' : `Bereitschaft ${value} von 100. ${readinessBand(value).word}. Grenzen: 30, 45, 65 und 80. Die heutige Einheit richtet sich nach deinem Plan.`}
    viewBox="0 0 326 40" style={{ width: '100%', display: 'block', overflow: 'visible' }}>
    <title>Bereitschaftsskala: unter 30 Pause, ab 30 Vorsicht, ab 45 locker, ab 65 bereit, ab 80 hohe Belastbarkeit. Krankheit, Verletzung und geplante Ruhe gehen vor.</title>
    {READINESS_BANDS.map(b => <g key={b.from} opacity={value == null ? 0.35 : 1}>
      <rect x={b.from * 3.26} y="11" width={(b.to - b.from) * 3.26 - 2} height="6" rx="2" fill={T[b.hue]} opacity="0.8" />
      <text x={(b.from + b.to) / 2 * 3.26} y="35" textAnchor="middle" fontSize="9" fontFamily={FONT} fill={T.mid}>{b.label}</text>
      {b.from > 0 && <text x={b.from * 3.26} y="7" textAnchor="middle" fontSize="8" fontFamily={FONT} fill={T.quiet}>{b.from}</text>}
    </g>)}
    {value != null && <g transform={`translate(${Math.min(324, Math.max(2, value * 3.26))},0)`}>
      <path d="M-3 10 L0 13 L3 10" fill={T.ink} />
      <rect x="-1" y="10" width="2" height="12" rx="1" fill={T.ink} />
    </g>}
  </svg>
}
