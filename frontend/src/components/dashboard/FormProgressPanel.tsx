import { useLocale } from '../../contexts/LocaleContext'
import { useFormProgress } from '../../hooks/useFormProgress'
import type { Tone, Verdict } from '../../api/formProgress'

const TONE_COLOR: Record<Tone, string> = {
  good: 'var(--color-good)',
  warn: 'var(--color-caution)',
  bad: 'var(--color-bad)',
  neutral: 'var(--color-ink-2)',
}

const VERDICT: Record<Verdict, { color: string; en: string; de: string }> = {
  progress: { color: 'var(--color-good)', en: 'PROGRESS', de: 'FORTSCHRITT' },
  fatigue: { color: 'var(--color-bad)', en: 'FATIGUE', de: 'ERMÜDUNG' },
  steady: { color: 'var(--color-caution)', en: 'STEADY', de: 'STABIL' },
}

// "Form & Progress" — the latest ride read against the athlete's fitness
// baseline: is this a sign of progress, or of accumulating fatigue?
export default function FormProgressPanel() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = useFormProgress()
  if (!data) return null

  const v = VERDICT[data.verdict]

  return (
    <div className="rounded-[18px] p-5 sm:p-6" style={{
      backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)',
    }}>
      {/* header */}
      <div className="flex items-center justify-between mb-1">
        <span style={{ color: 'var(--color-ink-2)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          {de ? 'Form & Fortschritt' : 'Form & progress'}
        </span>
        <span className="rounded-full px-2.5 py-0.5" style={{
          color: v.color, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em',
          border: `1px solid color-mix(in srgb, ${v.color} 40%, transparent)`,
          background: `color-mix(in srgb, ${v.color} 10%, transparent)`,
        }}>{de ? v.de : v.en}</span>
      </div>

      {/* verdict headline */}
      <h2 className="mb-1" style={{
        color: 'var(--color-ink)', fontFamily: 'var(--font-serif)', fontSize: 22,
        fontWeight: 500, letterSpacing: '-0.01em',
      }}>{data.headline}</h2>
      <p className="mb-4" style={{ color: 'var(--color-ink-2)', fontSize: 12.5 }}>
        {de ? 'Letzte Fahrt' : 'Latest ride'}: {data.activity_title}
      </p>

      {/* fitness / ride markers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {data.markers.map((m, i) => (
          <div key={i} className="rounded-[12px] px-3 py-2.5" style={{
            background: 'var(--color-paper)', border: '1px solid var(--color-rule)',
          }}>
            <div style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{m.label}</div>
            <div className="num-mono" style={{ color: TONE_COLOR[m.tone], fontSize: 18, fontWeight: 500, lineHeight: 1.2 }}>{m.value}</div>
            {m.baseline && <div style={{ color: 'var(--color-ink-2)', fontSize: 10.5 }}>{m.baseline}</div>}
          </div>
        ))}
      </div>

      {/* evidence signals */}
      {data.signals.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {data.signals.map((s, i) => (
            <div key={i} className="flex items-start gap-2" style={{ fontSize: 13 }}>
              <span aria-hidden style={{ color: TONE_COLOR[s.tone], marginTop: 1, lineHeight: 1 }}>
                {s.tone === 'good' ? '▲' : s.tone === 'bad' ? '▼' : s.tone === 'warn' ? '›' : '·'}
              </span>
              <span style={{ color: 'var(--color-ink)' }}>{s.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
