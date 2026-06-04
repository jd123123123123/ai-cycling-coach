import { ArrowRight } from 'lucide-react'
import type { NextStep } from '../../api/report'

const TONE_COLOR: Record<string, string> = {
  good: 'var(--color-good)',
  caution: 'var(--color-caution)',
  bad: 'var(--color-bad)',
  neutral: 'var(--color-ink)',
}

/** Forward-looking recommendation — the report's actionable payoff. */
export default function NextStepCard({ step }: { step: NextStep }) {
  const accent = TONE_COLOR[step.tone] ?? 'var(--color-ink)'
  return (
    <div
      className="rounded-[18px] p-5 sm:p-6"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
        DO THIS NEXT
      </span>
      <div className="flex items-center gap-2 mt-2">
        <ArrowRight size={18} strokeWidth={2.2} style={{ color: accent }} />
        <span style={{ color: 'var(--color-ink)', fontSize: 16, fontWeight: 600 }}>{step.headline}</span>
      </div>
      <p className="mt-2 leading-relaxed" style={{ color: 'var(--color-ink-2)', fontSize: 14, maxWidth: '64ch' }}>
        {step.detail}
      </p>
    </div>
  )
}
