import { ArrowRight } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import type { NextStep } from '../../api/report'

const TONE_COLOR: Record<string, string> = {
  good: 'var(--color-good)',
  caution: 'var(--color-caution)',
  bad: 'var(--color-bad)',
  neutral: 'var(--color-ink)',
}

/** Forward-looking recommendation — the report's actionable payoff. */
export default function NextStepCard({ step }: { step: NextStep }) {
  const { locale } = useLocale()
  const accent = TONE_COLOR[step.tone] ?? 'var(--color-ink)'
  return (
    <div
      className="rounded-[18px] p-5 sm:p-6"
      style={{
        border: `1px solid color-mix(in srgb, ${accent} 30%, var(--color-rule))`,
        backgroundColor: `color-mix(in srgb, ${accent} 9%, var(--color-paper-2))`,
        backgroundImage: `radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, ${accent} 14%, transparent), transparent 62%)`,
      }}
    >
      <span className="eyebrow num-mono" style={{ color: accent, fontSize: 10, letterSpacing: '0.22em' }}>
        {locale === 'de' ? 'NÄCHSTER SCHRITT' : 'DO THIS NEXT'}
      </span>
      <div className="flex items-center gap-2.5 mt-2.5">
        <span
          className="flex items-center justify-center rounded-full shrink-0"
          style={{ width: 30, height: 30, backgroundColor: `color-mix(in srgb, ${accent} 20%, transparent)`, color: accent }}
        >
          <ArrowRight size={17} strokeWidth={2.4} />
        </span>
        <span
          style={{ fontFamily: 'var(--font-serif, serif)', color: 'var(--color-ink)', fontSize: 20, fontWeight: 500, lineHeight: 1.2 }}
        >
          {step.headline}
        </span>
      </div>
      <p className="mt-2.5 leading-relaxed" style={{ color: 'var(--color-ink-2)', fontSize: 14, maxWidth: '64ch' }}>
        {step.detail}
      </p>
    </div>
  )
}
