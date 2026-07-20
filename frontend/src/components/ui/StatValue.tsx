/**
 * StatValue — the enforcing primitive of the honest-dash rule (audit P2-16):
 * untracked NEVER renders as 0. Hand it the raw value plus whether the series
 * is actually tracked; it renders "—" with the localized "nicht erfasst /
 * not tracked" caption whenever the value is null/undefined/NaN or
 * trackedWhen === false. Call sites stop hand-rolling `x != null ? … : '—'`
 * ternaries — and can no longer leak a fake "0" / "0%" for missing data.
 *
 * Visual language matches the existing stat tiles (RecoveryTab sleep grid /
 * MetricCard): Sora num-display value, muted unit, 9px muted caption; dash
 * values drop to --color-ink-2 exactly like the DASH tiles already do.
 */
import { useLocale } from '../../contexts/LocaleContext'

// Re-export so tiles can format percents through the same honest gate without
// a second import path (see utils/format.ts for the implementation).
export { honestPercent } from '../../utils/format'

export const DASH = '—'

export interface StatDisplay {
  /** What to print as the big value ("—" when untracked). */
  text: string
  /** Unit to print after the value — suppressed (null) when untracked ("— %" is a lie). */
  unit: string | null
  /** Small caption under the value (localized "not tracked" when untracked). */
  caption: string | null
  /** True when the honest dash is showing. */
  untracked: boolean
}

/**
 * resolveStatValue — the pure decision core, exported for node-env vitest.
 * Never returns "0" for a missing value: null/undefined/NaN/'' or
 * trackedWhen === false all collapse to the honest dash + caption.
 */
export function resolveStatValue(opts: {
  value: number | string | null | undefined
  unit?: string
  trackedWhen?: boolean
  caption?: string
  untrackedCaption?: string
  de?: boolean
}): StatDisplay {
  const { value, unit, trackedWhen = true, caption, untrackedCaption, de = false } = opts
  const missing =
    value == null || value === '' || (typeof value === 'number' && !isFinite(value))
  if (trackedWhen === false || missing) {
    return {
      text: DASH,
      unit: null,
      caption: untrackedCaption ?? (de ? 'nicht erfasst' : 'not tracked'),
      untracked: true,
    }
  }
  return {
    text: typeof value === 'number' ? String(value) : value,
    unit: unit ?? null,
    caption: caption ?? null,
    untracked: false,
  }
}

export default function StatValue({
  value,
  unit,
  trackedWhen,
  caption,
  untrackedCaption,
  size = 18,
}: {
  /** Raw value — pass what you have; null/undefined/NaN render the honest dash. */
  value: number | string | null | undefined
  unit?: string
  /** Explicit tracked flag — false forces the dash even if a (fake) number exists. */
  trackedWhen?: boolean
  /** Caption under a TRACKED value (e.g. "bedtime variance"). */
  caption?: string
  /** Overrides the default "not tracked" caption (e.g. "zu wenig Nächte"). */
  untrackedCaption?: string
  /** Value font size in px — 18 matches the sleep-quality tiles. */
  size?: number
}) {
  const { locale } = useLocale()
  const d = resolveStatValue({ value, unit, trackedWhen, caption, untrackedCaption, de: locale === 'de' })
  return (
    <span className="flex min-w-0 flex-col" style={{ gap: 3 }}>
      <span
        className="num-display"
        style={{ fontSize: size, lineHeight: 1.15, color: d.untracked ? 'var(--color-ink-2)' : 'var(--color-ink)' }}
      >
        {d.text}
        {d.unit && (
          <span style={{ fontSize: Math.max(10, Math.round(size * 0.6)), fontWeight: 500, color: 'var(--color-muted)', marginLeft: 3 }}>
            {d.unit}
          </span>
        )}
      </span>
      {d.caption && (
        <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--color-muted)', opacity: 0.8 }}>{d.caption}</span>
      )}
    </span>
  )
}
