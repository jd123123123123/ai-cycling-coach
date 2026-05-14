import { useLocale } from '../../contexts/LocaleContext'

/**
 * LocaleSwitch — compact EN / DE toggle. Sits near the sync pill so the
 * user can flip languages without diving into settings.
 *
 * Coverage caveat (intentional): only the dashboard chrome added in the
 * new-component pass uses the t() lookup. The AI-generated prose
 * (brief.verdict, rationale, tomorrow_plan.description, etc.) still
 * arrives in whatever language the brief LLM produced it in — wiring
 * locale into the coach prompt is the next step.
 */
export default function LocaleSwitch() {
  const { locale, setLocale } = useLocale()
  const opts: Array<{ key: 'en' | 'de'; label: string }> = [
    { key: 'en', label: 'EN' },
    { key: 'de', label: 'DE' },
  ]
  return (
    <div
      className="inline-flex rounded-full p-0.5"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
      role="group"
      aria-label="UI language"
    >
      {opts.map((o) => {
        const active = locale === o.key
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => setLocale(o.key)}
            className="num-mono text-[10px] px-2.5 py-1 rounded-full"
            style={{
              color: active ? 'var(--color-paper)' : 'var(--color-ink-2)',
              backgroundColor: active ? 'var(--color-ink)' : 'transparent',
              letterSpacing: '0.12em',
              fontWeight: active ? 600 : 400,
              minWidth: 36,
              transition: 'background-color 200ms ease, color 200ms ease',
            }}
            aria-pressed={active}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
