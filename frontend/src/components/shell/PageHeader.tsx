import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useLocale } from '../../contexts/LocaleContext'

/**
 * PageHeader — the back chevron + title + subtitle block that a dozen pages had
 * each hand-rolled.
 *
 * Extracted verbatim from the shape SeasonView, AchievementsView and their
 * siblings had all converged on independently: a 40px circular back button on
 * `--color-surface-2` with a `--color-rule` hairline, then a 26px `num-display`
 * title with a 12px muted subtitle stacked under it. Keeping those exact values
 * is the point — this is a consolidation, not a restyle, so no page should
 * shift by a pixel when it adopts this.
 *
 * `onBack` defaults to `navigate(-1)`. Pages that arrived via a tab rather than
 * a push should pass `back={false}` instead of passing a no-op, so the chevron
 * is absent rather than present-and-dead.
 */
export interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Show the back chevron. Default true — most pages are pushed sub-pages. */
  back?: boolean
  /** Override the default `navigate(-1)`. */
  onBack?: () => void
  /** Trailing control, right-aligned on the title row. */
  action?: ReactNode
}

export default function PageHeader({
  title,
  subtitle,
  back = true,
  onBack,
  action,
}: PageHeaderProps) {
  const navigate = useNavigate()
  const { locale } = useLocale()
  const de = locale === 'de'

  return (
    <div className="flex items-center gap-3">
      {back && (
        <button
          type="button"
          onClick={onBack ?? (() => navigate(-1))}
          aria-label={de ? 'Zurück' : 'Back'}
          className="grid shrink-0 place-items-center rounded-full"
          style={{
            width: 40,
            height: 40,
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-rule)',
          }}
        >
          <ArrowLeft size={18} style={{ color: 'var(--color-ink-2)' }} />
        </button>
      )}

      <div className="flex min-w-0 flex-col">
        {/*
          Long titles step down instead of truncating. At 390 px a 26 px title
          plus a back chevron plus an action button leaves room for roughly 16
          characters, and German is routinely longer than English for the same
          screen ("Fahrt abgeschlossen" vs "Ride complete") -- which is exactly
          how the recap page rendered as "Fahrt abgeschloss…". Two deterministic
          steps, no measurement, so it cannot reflow between renders.
        */}
        <h1
          className="num-display truncate"
          style={{
            fontSize: title.length > 22 ? 19 : title.length > 15 ? 22 : 26,
            color: 'var(--color-ink)',
            lineHeight: 1.15,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{subtitle}</span>
        )}
      </div>

      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  )
}
