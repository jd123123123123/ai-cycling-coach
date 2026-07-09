import { motion, useReducedMotion } from 'motion/react'
import { useLocale } from '../../contexts/LocaleContext'
import { useAdaptive } from '../../hooks/useAdaptive'
import type { DirectiveKind, Evidence, Tone } from '../../api/adaptive'

const TONE: Record<Tone, string> = {
  good: 'var(--color-good)', warn: 'var(--color-caution)', bad: 'var(--color-bad)', neutral: 'var(--color-ink-2)',
}
const EV_LABEL: Record<Evidence, { en: string; de: string; color: string }> = {
  RCT: { en: 'RCT', de: 'RCT', color: 'var(--color-good)' },
  expert: { en: 'expert', de: 'Expertise', color: 'var(--color-caution)' },
  guardrail: { en: 'guardrail', de: 'Leitplanke', color: 'var(--color-ink-blue)' },
}
const KIND: Record<DirectiveKind, { color: string; icon: string; en: string; de: string }> = {
  escalate: { color: 'var(--color-forest-2)', icon: '⚡', en: 'ESCALATE', de: 'ESKALIEREN' },
  push: { color: 'var(--color-good)', icon: '▲', en: 'PUSH HARD', de: 'VOLL DRAUF' },
  hold: { color: 'var(--color-caution)', icon: '=', en: 'HOLD', de: 'HALTEN' },
  deload: { color: 'var(--color-bad)', icon: '▼', en: 'DELOAD', de: 'DELOAD' },
  rest: { color: 'var(--color-ink-2)', icon: '○', en: 'REST', de: 'RUHE' },
}

// The daily autoregulation directive — HRV-gated, escalating on confirmed
// adaptation. Evidence tags keep it honest (RCT vs expert-opinion vs guardrail).
export default function AdaptiveDirectiveCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const reduce = useReducedMotion()
  const { data } = useAdaptive()
  if (!data) return null

  const k = KIND[data.directive]
  const hot = !reduce && (data.directive === 'escalate' || data.directive === 'push')
  const volPct = Math.round((data.volume_modifier - 1) * 100)
  const hrvLabel = de
    ? { below: 'HRV unter Band', in: 'HRV im Band', above: 'HRV über Band', unknown: 'HRV n/v' }
    : { below: 'HRV below band', in: 'HRV in-band', above: 'HRV above band', unknown: 'HRV n/a' }

  return (
    <motion.div
      className="relative rounded-[18px] p-5 sm:p-6 overflow-hidden"
      style={{
        background: `color-mix(in srgb, ${k.color} 8%, var(--color-paper-2))`,
        border: `1px solid color-mix(in srgb, ${k.color} 40%, transparent)`,
      }}
      animate={hot ? { boxShadow: [
        `0 0 0px color-mix(in srgb, ${k.color} 0%, transparent)`,
        `0 0 22px color-mix(in srgb, ${k.color} 30%, transparent)`,
        `0 0 0px color-mix(in srgb, ${k.color} 0%, transparent)`,
      ] } : undefined}
      transition={hot ? { duration: 2.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="eyebrow" style={{ color: 'var(--color-ink-2)', letterSpacing: '0.2em', fontSize: 10.5 }}>
          {de ? 'HEUTIGE ANSAGE' : "TODAY'S CALL"}
        </span>
        <span className="rounded-full px-2 py-0.5" style={{
          fontSize: 10, letterSpacing: '0.06em', color: 'var(--color-ink-2)',
          border: '1px solid var(--color-rule)',
        }}>{data.confidence === 'high' ? (de ? 'hohe Konfidenz' : 'high confidence') : (de ? 'moderate Konfidenz' : 'moderate confidence')}</span>
      </div>

      <div className="flex items-center gap-3">
        <span style={{ fontSize: 30, lineHeight: 1 }}>{k.icon}</span>
        <div>
          <div className="num-mono" style={{ color: k.color, fontSize: 22, fontWeight: 700, letterSpacing: '0.06em' }}>
            {de ? k.de : k.en}
          </div>
          <p style={{ color: 'var(--color-ink)', fontSize: 14.5, marginTop: 1 }}>{data.headline}</p>
        </div>
      </div>

      {/* levers */}
      <div className="flex flex-wrap gap-2 mt-4">
        <span className="rounded-full px-2.5 py-1" style={{ fontSize: 11.5, color: 'var(--color-ink-2)', border: '1px solid var(--color-rule)', background: 'var(--color-paper)' }}>
          {hrvLabel[data.hrv_state]}
        </span>
        {volPct !== 0 && (
          <span className="rounded-full px-2.5 py-1 num-mono" style={{ fontSize: 11.5, color: volPct > 0 ? 'var(--color-good)' : 'var(--color-caution)', border: '1px solid var(--color-rule)', background: 'var(--color-paper)' }}>
            {de ? 'Volumen' : 'Volume'} {volPct > 0 ? `+${volPct}%` : `${volPct}%`}
          </span>
        )}
        <span className="rounded-full px-2.5 py-1" style={{ fontSize: 11.5, color: 'var(--color-ink-2)', border: '1px solid var(--color-rule)', background: 'var(--color-paper)' }}>
          {de ? 'Ceiling' : 'Ceiling'}: {data.intensity_ceiling}
        </span>
      </div>

      {/* evidence-tagged signals */}
      {data.signals.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-4">
          {data.signals.map((s, i) => {
            const ev = EV_LABEL[s.evidence]
            return (
              <motion.div key={i} className="flex items-start gap-2" style={{ fontSize: 13 }}
                initial={reduce ? false : { opacity: 0, x: -6 }}
                animate={reduce ? undefined : { opacity: 1, x: 0 }}
                transition={{ duration: 0.32, delay: 0.1 + i * 0.06 }}>
                <span aria-hidden style={{ color: TONE[s.tone], marginTop: 1, lineHeight: 1 }}>
                  {s.tone === 'good' ? '▲' : s.tone === 'bad' ? '▼' : s.tone === 'warn' ? '›' : '·'}
                </span>
                <span style={{ color: 'var(--color-ink)', flex: 1 }}>{s.text}</span>
                <span className="num-mono shrink-0" style={{ fontSize: 9.5, color: ev.color, letterSpacing: '0.08em', border: `1px solid color-mix(in srgb, ${ev.color} 35%, transparent)`, borderRadius: 4, padding: '1px 4px' }}>
                  {de ? ev.de : ev.en}
                </span>
              </motion.div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
