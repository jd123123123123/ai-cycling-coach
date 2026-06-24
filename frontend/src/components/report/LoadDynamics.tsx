import { useLocale } from '../../contexts/LocaleContext'
import type { LoadDynamics as LoadDynamicsData } from '../../api/report'

const FLAG_COLOR: Record<string, string> = {
  ok: 'var(--color-good)',
  ramping: 'var(--color-caution)',
  monotonous: 'var(--color-bad)',
  flat: 'var(--color-muted)',
}

/** Load health — weekly ramp + Foster monotony/strain. Renders nothing when
 * there are too few training days to read a pattern. */
export default function LoadDynamics({ load }: { load: LoadDynamicsData }) {
  const { locale } = useLocale()
  const accent = FLAG_COLOR[load.flag] ?? 'var(--color-muted)'

  const chips: { label: string; value: string }[] = []
  if (load.ramp_per_week !== null) {
    const v = load.ramp_per_week
    chips.push({ label: locale === 'de' ? 'Aufbau/Woche' : 'Ramp/week', value: `${v > 0 ? '+' : ''}${v}` })
  }
  if (load.monotony !== null) {
    chips.push({ label: locale === 'de' ? 'Monotonie' : 'Monotony', value: `${load.monotony}` })
  }
  if (load.strain !== null) {
    chips.push({ label: locale === 'de' ? 'Belastung' : 'Strain', value: `${load.strain}` })
  }

  return (
    <div
      className="rounded-[18px] p-5 sm:p-6"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
        {locale === 'de' ? 'BELASTUNGSDYNAMIK' : 'LOAD DYNAMICS'}
      </span>

      <div className="mt-3 flex flex-wrap gap-2.5">
        {chips.map((c, i) => (
          <div
            key={i}
            className="rounded-[12px] px-3 py-2"
            style={{
              border: `1px solid color-mix(in srgb, ${accent} 28%, var(--color-rule))`,
              backgroundColor: `color-mix(in srgb, ${accent} 7%, var(--color-paper))`,
            }}
          >
            <div className="num-mono" style={{ color: 'var(--color-ink)', fontSize: 17, fontWeight: 600, lineHeight: 1.1 }}>
              {c.value}
            </div>
            <div style={{ color: 'var(--color-muted)', fontSize: 10.5, letterSpacing: '0.04em' }}>{c.label}</div>
          </div>
        ))}
      </div>

      <p className="mt-3 leading-relaxed" style={{ color: 'var(--color-ink-2)', fontSize: 13, maxWidth: '62ch' }}>
        {load.note}
      </p>
    </div>
  )
}
