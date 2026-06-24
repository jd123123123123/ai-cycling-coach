import { ArrowRight, BedDouble, TrendingUp, Scale, Moon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import type { Prescription } from '../../api/report'
import NextStepCard from './NextStepCard'

const ICONS: Record<string, LucideIcon> = {
  arrow: ArrowRight,
  rest: BedDouble,
  build: TrendingUp,
  balance: Scale,
  sleep: Moon,
}

const TONE_COLOR: Record<string, string> = {
  good: 'var(--color-good)',
  caution: 'var(--color-caution)',
  bad: 'var(--color-bad)',
  neutral: 'var(--color-ink)',
}

/** Ranked actions for the coming window. The top prescription keeps the
 * Fraunces-CTA wash (NextStepCard); the rest are tighter ranked rows. */
export default function PrescriptionList({ prescriptions }: { prescriptions: Prescription[] }) {
  const { locale } = useLocale()
  if (prescriptions.length === 0) return null

  const [top, ...rest] = prescriptions

  return (
    <div className="flex flex-col gap-3">
      <NextStepCard step={{ headline: top.headline, detail: top.detail, tone: top.tone }} />

      {rest.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="eyebrow num-mono" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.22em' }}>
            {locale === 'de' ? 'AUSSERDEM' : 'ALSO WORTH DOING'}
          </span>
          {rest.map((p) => {
            const accent = TONE_COLOR[p.tone] ?? 'var(--color-ink)'
            const Icon = ICONS[p.icon_key] ?? ArrowRight
            return (
              <div
                key={p.priority}
                className="rounded-[14px] p-4 flex items-start gap-3"
                style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
              >
                <span
                  className="flex items-center justify-center rounded-full shrink-0 mt-0.5"
                  style={{ width: 26, height: 26, backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}
                >
                  <Icon size={14} strokeWidth={2.3} />
                </span>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ color: 'var(--color-ink)', fontSize: 14.5, fontWeight: 600 }}>{p.headline}</span>
                    {p.effect && (
                      <span
                        className="rounded-full px-2 py-0.5"
                        style={{ color: accent, fontSize: 10.5, backgroundColor: `color-mix(in srgb, ${accent} 11%, transparent)` }}
                      >
                        {p.effect}
                      </span>
                    )}
                  </div>
                  <p className="leading-relaxed" style={{ color: 'var(--color-ink-2)', fontSize: 13, maxWidth: '64ch' }}>
                    {p.detail}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
