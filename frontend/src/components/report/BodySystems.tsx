import { useLocale } from '../../contexts/LocaleContext'
import type { RadarAxis } from '../../api/report'

/** Diagnosis card — an always-visible per-axis breakdown (label, 0–100 score,
 * bar, detail) of the athlete's body systems. A single labeled bar list, no
 * duplicate radar: the bars ARE the read. Axes without enough data read
 * "n. v." / "n/a" rather than sitting as a blank bar. */
export default function BodySystems({ axes }: { axes: RadarAxis[] }) {
  const { locale } = useLocale()
  const de = locale === 'de'

  return (
    <div
      className="rounded-[18px] p-5 sm:p-6"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
        {de ? 'KÖRPERSYSTEME' : 'BODY SYSTEMS'}
      </span>
      <p className="mt-1.5" style={{ color: 'var(--color-muted)', fontSize: 13 }}>
        {de
          ? 'Relativwert 0–100 zu deiner eigenen Basis — kein CTL. Höher ist besser.'
          : 'Relative 0–100 score vs your own baseline — not CTL. Higher is better.'}
      </p>

      {/* per-axis breakdown — the single labeled bar list */}
      <div className="flex flex-col gap-4 mt-4">
        {axes.map((a) => {
          const na = a.insufficient_data || a.score == null
          return (
            <div key={a.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex-1 min-w-0" style={{ color: 'var(--color-ink)', fontSize: 14, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{a.label}</span>
                {na ? (
                  <span
                    className="num-mono shrink-0"
                    style={{ color: 'var(--color-muted)', fontSize: 12, letterSpacing: '0.04em' }}
                    title={de ? 'Nicht genug Daten für diese Achse' : 'Not enough data for this axis'}
                  >
                    {de ? 'n. v.' : 'n/a'}
                  </span>
                ) : (
                  <span className="num-mono shrink-0" style={{ color: 'var(--color-ink-2)', fontSize: 15, fontWeight: 600 }}>
                    {Math.round(a.score as number)}
                  </span>
                )}
              </div>
              <div className="rounded-full overflow-hidden" style={{ height: 6, backgroundColor: 'var(--color-rule)' }}>
                {!na && (
                  <div style={{
                    height: '100%', width: `${a.score ?? 0}%`,
                    backgroundColor: 'var(--color-good)',
                    transition: 'width 600ms var(--ease-apple-default, ease)',
                  }} />
                )}
              </div>
              {a.detail && (
                <span style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                  {na ? (de ? 'Noch keine belastbare Messung.' : 'No reliable reading yet.') : a.detail}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
