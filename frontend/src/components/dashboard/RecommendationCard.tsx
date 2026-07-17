import { Link } from 'react-router-dom'
import { Sparkles, ArrowRight } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import { useAdaptive } from '../../hooks/useAdaptive'

// Recommendation — the coral-accented call to action that turns the analytics
// into a next move. Headline + lead signal from the adaptive directive, with a
// pill CTA into today's session. Renders nothing until a directive exists.

export default function RecommendationCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = useAdaptive()
  if (!data) return null

  const body = data.signals?.[0]?.text ?? data.intensity_ceiling

  return (
    <div className="rounded-[24px] p-5 flex flex-col gap-4" style={{ background: 'var(--color-accent-soft)', border: '1px solid var(--color-accent)' }}>
      <div className="flex items-start gap-3">
        <span className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--color-accent)' }}>
          <Sparkles size={20} strokeWidth={2.2} style={{ color: '#FFFFFF' }} />
        </span>
        <div className="flex flex-col gap-1">
          <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{data.headline}</span>
          {body && <span style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{body}</span>}
        </div>
      </div>

      <Link
        to="/dashboard?tab=today"
        className="inline-flex items-center gap-1.5 rounded-full self-start"
        style={{ background: 'var(--color-accent)', color: '#FFFFFF', fontSize: 13, fontWeight: 700, padding: '8px 16px' }}
      >
        {de ? 'Session öffnen' : 'Open session'}
        <ArrowRight size={15} strokeWidth={2.4} />
      </Link>
    </div>
  )
}
