import { AlertTriangle } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import type { Cause } from '../../api/report'

const SEV_COLOR: Record<string, string> = {
  high: 'var(--color-bad)',
  med: 'var(--color-caution)',
  low: 'var(--color-muted)',
}

/** "What's holding you back" — severity-ranked causes with live evidence.
 * Renders nothing when there are no causes. */
export default function CausesPanel({ causes }: { causes: Cause[] }) {
  const { locale } = useLocale()
  if (causes.length === 0) return null
  return (
    <div className="rounded-[18px] p-5 sm:p-6" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
        {locale === 'de' ? 'WAS DICH BREMST' : "WHAT'S HOLDING YOU BACK"}
      </span>
      <div className="flex flex-col gap-3 mt-3">
        {causes.map((c, i) => {
          const color = SEV_COLOR[c.severity] ?? 'var(--color-muted)'
          return (
            <div key={i} className="flex items-start gap-2.5">
              <span className="shrink-0 mt-0.5" style={{ color }}>
                <AlertTriangle size={15} strokeWidth={2} />
              </span>
              <div className="flex flex-col">
                <span style={{ color: 'var(--color-ink)', fontSize: 13.5 }}>{c.label}</span>
                <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>{c.evidence}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
