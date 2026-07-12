import { motion, useReducedMotion } from 'motion/react'
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

// Plain-language glosses for the dense marker labels, matched on the
// abbreviation inside the (backend-provided) label. Rendered as a native
// title= tooltip so first-time readers can decode TSB/CTL/eFTP/TSS.
function markerGloss(label: string, de: boolean): string | undefined {
  const l = label.toUpperCase()
  if (l.includes('TSB') || l.includes('FORM'))
    return de ? 'Frische (TSB): plus = ausgeruht, minus = müde' : 'Freshness (TSB): plus = rested, minus = tired'
  if (l.includes('CTL') || l.includes('FITNESS') || l.includes('FITNES'))
    return de ? 'Dein Ausdauer-Fundament (CTL)' : 'Your fitness base (CTL)'
  if (l.includes('EFTP') || l.includes('FTP'))
    return de ? 'Geschätzte FTP (eFTP) aus deinen Fahrten' : 'Estimated FTP (eFTP) from your rides'
  if (l.includes('TSS'))
    return de ? 'Trainingslast — 100 ≈ eine harte Stunde' : 'Training load — 100 ≈ one hard hour'
  return undefined
}

// "Form & Progress" — the latest ride read against the athlete's fitness
// baseline: is this a sign of progress, or of accumulating fatigue?
export default function FormProgressPanel() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const reduce = useReducedMotion()
  const { data } = useFormProgress()
  if (!data) return null

  const v = VERDICT[data.verdict]
  const celebrate = !reduce && data.verdict === 'progress'

  return (
    <div className="rounded-[18px] p-5 sm:p-6" style={{
      backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)',
    }}>
      {/* header */}
      <div className="flex items-center justify-between mb-1">
        <span style={{ color: 'var(--color-ink-2)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          {de ? 'Form & Fortschritt' : 'Form & progress'}
        </span>
        <motion.span className="rounded-full px-2.5 py-0.5" style={{
          color: v.color, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em',
          border: `1px solid color-mix(in srgb, ${v.color} 40%, transparent)`,
          background: `color-mix(in srgb, ${v.color} 10%, transparent)`,
        }}
          animate={celebrate ? {
            boxShadow: [
              `0 0 0px color-mix(in srgb, ${v.color} 0%, transparent)`,
              `0 0 14px color-mix(in srgb, ${v.color} 55%, transparent)`,
              `0 0 0px color-mix(in srgb, ${v.color} 0%, transparent)`,
            ],
          } : undefined}
          transition={celebrate ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
        >{de ? v.de : v.en}</motion.span>
      </div>

      {/* verdict headline */}
      <h2 className="mb-1" style={{
        color: 'var(--color-ink)', fontFamily: 'var(--font-serif)', fontSize: 22,
        fontWeight: 500, letterSpacing: '-0.01em',
      }}>{data.headline}</h2>
      <p className="mb-1" style={{ color: 'var(--color-ink-2)', fontSize: 12.5 }}>
        {de ? 'Letzte Fahrt' : 'Latest ride'}: {data.activity_title}
      </p>
      {/* Disambiguates from the hero's "Form heute": these markers read form &
         fitness as of the last ride, not today's live figure. */}
      <p className="mb-4" style={{ color: 'var(--color-muted)', fontSize: 11 }}>
        {de ? 'Werte nach der letzten Fahrt' : 'Values after your last ride'}
      </p>

      {/* fitness / ride markers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {data.markers.map((m, i) => {
          const gloss = markerGloss(m.label, de)
          return (
          <div key={i} className="rounded-[12px] px-3 py-2.5" style={{
            background: 'var(--color-paper)', border: '1px solid var(--color-rule)',
          }}>
            <div title={gloss} style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: gloss ? 'help' : undefined }}>{m.label}</div>
            <div className="num-mono" style={{ color: TONE_COLOR[m.tone], fontSize: 18, fontWeight: 500, lineHeight: 1.2 }}>{m.value}</div>
            {m.baseline && <div style={{ color: 'var(--color-ink-2)', fontSize: 10.5 }}>{m.baseline}</div>}
          </div>
          )
        })}
      </div>

      {/* evidence signals */}
      {data.signals.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {data.signals.map((s, i) => (
            <motion.div
              key={i}
              className="flex items-start gap-2"
              style={{ fontSize: 13 }}
              initial={reduce ? false : { opacity: 0, x: -8 }}
              animate={reduce ? undefined : { opacity: 1, x: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.12 + i * 0.07 }}
            >
              <span aria-hidden style={{ color: TONE_COLOR[s.tone], marginTop: 1, lineHeight: 1 }}>
                {s.tone === 'good' ? '▲' : s.tone === 'bad' ? '▼' : s.tone === 'warn' ? '›' : '·'}
              </span>
              <span style={{ color: 'var(--color-ink)' }}>{s.text}</span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
