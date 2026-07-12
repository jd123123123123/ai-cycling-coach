import { useLocale } from '../../contexts/LocaleContext'
import type { IntensityMix as IntensityMixData } from '../../api/report'

const MODEL_LABEL: Record<string, { en: string; de: string }> = {
  polarized: { en: 'Polarized', de: 'Polarisiert' },
  pyramidal: { en: 'Pyramidal', de: 'Pyramidal' },
  threshold: { en: 'Threshold', de: 'Schwelle' },
  high_intensity: { en: 'High-intensity', de: 'Hochintensiv' },
  unstructured: { en: 'Unstructured', de: 'Unstrukturiert' },
}

function modelName(model: string, locale: string): string {
  const m = MODEL_LABEL[model]
  if (!m) return model.replace(/_/g, ' ')
  return locale === 'de' ? m.de : m.en
}

const MODEL_HINT: Record<string, { en: string; de: string }> = {
  polarized: { en: 'Polarized — lots of easy plus a little very hard, almost nothing in between', de: 'Polarisiert — viel leicht + wenig sehr hart, kaum dazwischen' },
  pyramidal: { en: 'Pyramidal — mostly easy, less moderate, least hard', de: 'Pyramidal — viel leicht, weniger mittel, am wenigsten hart' },
  threshold: { en: 'Threshold — a lot of time in the moderate/hard middle', de: 'Schwelle — viel Zeit im mittleren/harten Bereich' },
  high_intensity: { en: 'High-intensity — a large share of hard riding', de: 'Hochintensiv — hoher Anteil harter Fahrten' },
  unstructured: { en: 'Unstructured — no clear distribution pattern', de: 'Unstrukturiert — kein klares Verteilungsmuster' },
}

function modelHint(model: string, locale: string): string | undefined {
  const m = MODEL_HINT[model]
  if (!m) return undefined
  return locale === 'de' ? m.de : m.en
}

/** Seiler 3-zone intensity distribution vs the phase-appropriate target.
 * Renders nothing when no ride could be classified. */
export default function IntensityMix({ mix }: { mix: IntensityMixData }) {
  const { locale } = useLocale()

  const zones = [
    { pct: mix.z1_pct, color: 'var(--color-good)', label: locale === 'de' ? 'Leicht' : 'Easy' },
    { pct: mix.z2_pct, color: 'var(--color-caution)', label: locale === 'de' ? 'Mittel' : 'Moderate' },
    { pct: mix.z3_pct, color: 'var(--color-bad)', label: locale === 'de' ? 'Hart' : 'Hard' },
  ]

  return (
    <div
      className="rounded-[18px] p-5 sm:p-6"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
          {locale === 'de' ? 'INTENSITÄTSMIX' : 'INTENSITY MIX'}
        </span>
        <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 11 }}>
          {mix.sample_rides} {locale === 'de' ? 'Fahrten' : 'rides'}
        </span>
      </div>

      {/* Stacked zone bar */}
      <div className="mt-3.5 flex w-full overflow-hidden rounded-full" style={{ height: 12 }}>
        {zones.map((z, i) => (
          z.pct > 0 ? (
            <div
              key={i}
              style={{ width: `${z.pct}%`, backgroundColor: z.color, transition: 'width 420ms var(--ease-apple-default, ease)' }}
              title={`${z.label} ${Math.round(z.pct)}%`}
            />
          ) : null
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {zones.map((z, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="rounded-full shrink-0" style={{ width: 8, height: 8, backgroundColor: z.color }} />
            <span style={{ color: 'var(--color-ink-2)', fontSize: 12.5 }}>{z.label}</span>
            <span className="num-mono" style={{ color: 'var(--color-ink)', fontSize: 12.5, fontWeight: 600 }}>
              {Math.round(z.pct)}%
            </span>
          </div>
        ))}
      </div>

      {/* Detected model vs phase target */}
      <div className="mt-3.5 flex items-center gap-2 flex-wrap" style={{ fontSize: 12.5, color: 'var(--color-ink-2)' }}>
        <span
          className="rounded-full px-2 py-0.5"
          title={modelHint(mix.model, locale)}
          style={{
            border: `1px solid color-mix(in srgb, ${mix.aligned ? 'var(--color-good)' : 'var(--color-caution)'} 35%, var(--color-rule))`,
            color: mix.aligned ? 'var(--color-good)' : 'var(--color-caution)',
            fontSize: 11.5, fontWeight: 600, cursor: 'help',
          }}
        >
          {modelName(mix.model, locale)}
        </span>
        <span style={{ color: 'var(--color-muted)' }}>
          {mix.aligned
            ? (locale === 'de' ? '— passend für diese Phase' : '— on target for this phase')
            : (locale === 'de' ? `— Ziel: ${modelName(mix.target_model, locale)}` : `— target: ${modelName(mix.target_model, locale)}`)}
        </span>
      </div>

      {mix.fix && (
        <p className="mt-2.5 leading-relaxed" style={{ color: 'var(--color-ink-2)', fontSize: 13, maxWidth: '60ch' }}>
          {mix.fix}
        </p>
      )}
    </div>
  )
}
