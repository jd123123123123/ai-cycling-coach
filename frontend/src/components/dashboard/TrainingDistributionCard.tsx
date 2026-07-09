import { Check, AlertTriangle } from 'lucide-react'
import { useTrainingDistribution } from '../../hooks/useTrainingDistribution'
import { useLocale } from '../../contexts/LocaleContext'

// Training-intensity-distribution classification (Seiler 3-zone): names the
// athlete's model (polarized / pyramidal / threshold / high-intensity), judges
// it against the phase-appropriate target, and gives a corrective nudge.
// Complements PolarizedDistribution (which shows the raw split) by adding the
// *classification* + phase alignment.

const MODEL_LABEL: Record<string, { en: string; de: string }> = {
  polarized: { en: 'Polarized', de: 'Polarisiert' },
  pyramidal: { en: 'Pyramidal', de: 'Pyramidal' },
  threshold: { en: 'Threshold', de: 'Schwelle' },
  high_intensity: { en: 'High-Intensity', de: 'Hochintensiv' },
}

export default function TrainingDistributionCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data, isLoading } = useTrainingDistribution()

  if (isLoading) {
    return (
      <div className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
        <div className="h-4 w-40 rounded animate-pulse mb-3" style={{ backgroundColor: 'var(--color-rule)' }} />
        <div className="h-16 w-full rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
      </div>
    )
  }
  if (!data?.available || !data.model) return null

  const label = MODEL_LABEL[data.model]?.[de ? 'de' : 'en'] ?? data.model
  const targetLabel = data.target ? (MODEL_LABEL[data.target]?.[de ? 'de' : 'en'] ?? data.target) : ''
  const z1 = data.z1_pct ?? 0
  const z2 = data.z2_pct ?? 0
  const z3 = data.z3_pct ?? 0

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
      style={{ backgroundColor: 'var(--color-paper-2)', border: data.aligned ? '1px solid rgba(48, 209, 88, 0.30)' : '1px solid var(--color-rule)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
          {de ? 'INTENSITÄTSVERTEILUNG' : 'INTENSITY DISTRIBUTION'}
        </span>
        <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10.5 }}>
          {Math.round(data.total_hours ?? 0)}h · {de ? '28 TAGE' : '28 DAYS'}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="num-display" style={{ fontSize: 'clamp(20px, 2.6vw, 26px)', color: 'var(--color-ink)' }}>{label}</span>
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded-[7px]"
          style={{
            backgroundColor: data.aligned ? 'rgba(48, 209, 88, 0.10)' : 'rgba(255, 159, 10, 0.10)',
            border: data.aligned ? '1px solid rgba(48, 209, 88, 0.25)' : '1px solid rgba(255, 159, 10, 0.25)',
          }}
        >
          {data.aligned ? <Check size={11} color="#30D158" /> : <AlertTriangle size={11} color="var(--color-amber)" />}
          <span className="num-mono text-[10px]" style={{ color: data.aligned ? '#30D158' : 'var(--color-amber)' }}>
            {data.aligned ? (de ? 'passend' : 'on target') : `${de ? 'Ziel' : 'target'}: ${targetLabel}`}
          </span>
        </div>
      </div>

      {/* 3-zone stacked bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden mt-3" style={{ backgroundColor: 'var(--color-rule)' }}>
        <div style={{ width: `${z1}%`, backgroundColor: 'var(--color-forest-2)' }} />
        <div style={{ width: `${z2}%`, backgroundColor: 'var(--color-amber)' }} />
        <div style={{ width: `${z3}%`, backgroundColor: '#FF453A' }} />
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="num-mono text-[10px]" style={{ color: 'var(--color-forest-2)' }}>{z1}% {de ? 'locker' : 'easy'}</span>
        <span className="num-mono text-[10px]" style={{ color: 'var(--color-amber)' }}>{z2}% {de ? 'grau' : 'grey'}</span>
        <span className="num-mono text-[10px]" style={{ color: '#FF453A' }}>{z3}% {de ? 'hart' : 'hard'}</span>
      </div>

      <p className="text-[11px] leading-relaxed mt-3" style={{ color: 'var(--color-muted)', maxWidth: '46ch' }}>
        {data.recommendation}
      </p>
    </div>
  )
}
