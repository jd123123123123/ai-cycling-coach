import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import { useAdaptive } from '../../hooks/useAdaptive'
import type { DirectiveKind, Evidence, Tone } from '../../api/adaptive'

const TONE: Record<Tone, string> = {
  good: 'var(--color-good)', warn: 'var(--color-caution)', bad: 'var(--color-bad)', neutral: 'var(--color-ink-2)',
}
const EV_LABEL: Record<Evidence, { en: string; de: string; color: string; titleEn: string; titleDe: string }> = {
  RCT: {
    en: 'RCT', de: 'RCT', color: 'var(--color-good)',
    titleEn: 'Backed by randomized controlled trials',
    titleDe: 'Durch randomisierte Studien belegt',
  },
  expert: {
    en: 'expert', de: 'Expertise', color: 'var(--color-caution)',
    titleEn: 'Based on expert opinion / coaching consensus',
    titleDe: 'Basiert auf Expertenmeinung / Coaching-Konsens',
  },
  guardrail: {
    en: 'guardrail', de: 'Leitplanke', color: 'var(--color-ink-blue)',
    titleEn: 'A safety guardrail, not a hard prescription',
    titleDe: 'Eine Sicherheits-Leitplanke, keine feste Vorgabe',
  },
}
const KIND: Record<DirectiveKind, { color: string; icon: string; en: string; de: string }> = {
  escalate: { color: 'var(--color-forest-2)', icon: '⚡', en: 'ESCALATE', de: 'ESKALIEREN' },
  push: { color: 'var(--color-good)', icon: '▲', en: 'PUSH HARD', de: 'VOLL DRAUF' },
  hold: { color: 'var(--color-caution)', icon: '=', en: 'HOLD', de: 'HALTEN' },
  deload: { color: 'var(--color-bad)', icon: '▼', en: 'DELOAD', de: 'ENTLASTUNG' },
  rest: { color: 'var(--color-ink-2)', icon: '○', en: 'REST', de: 'RUHE' },
}

// The daily autoregulation directive — HRV-gated, escalating on confirmed
// adaptation. Evidence tags keep it honest (RCT vs expert-opinion vs guardrail).
export default function AdaptiveDirectiveCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const reduce = useReducedMotion()
  const { data } = useAdaptive()
  const [open, setOpen] = useState(false)
  if (!data) return null

  const k = KIND[data.directive]
  const volPct = Math.round((data.volume_modifier - 1) * 100)
  const hrvLabel = de
    ? { below: 'HRV unter Band', in: 'HRV im Band', above: 'HRV über Band', unknown: 'HRV n/v' }
    : { below: 'HRV below band', in: 'HRV in-band', above: 'HRV above band', unknown: 'HRV n/a' }
  const hrvTitle = de
    ? 'HRV verglichen mit deiner 7-Tage-Basislinie'
    : 'HRV compared with your 7-day baseline'
  const volTitle = de ? 'Ggü. geplantem Umfang' : 'Vs planned volume'
  const ceilingLabel = de ? 'Max-Intensität heute' : 'Ceiling'
  const ceilingTitle = de
    ? 'Höchste heute freigegebene Intensität'
    : 'Highest intensity cleared for today'

  return (
    <div
      className="rounded-[14px] overflow-hidden"
      style={{
        // Single, low-saturation accent — the directive is a supporting line
        // under the session + readiness, not a red/green severity block.
        background: 'var(--color-paper-2)',
        border: `1px solid color-mix(in srgb, ${k.color} 30%, var(--color-rule))`,
      }}
    >
      {/* One tappable line: directive label + one-line "why" (headline). */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span aria-hidden style={{ fontSize: 15, lineHeight: 1, color: k.color }}>{k.icon}</span>
        <span className="num-mono shrink-0" style={{ color: k.color, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em' }}>
          {de ? k.de : k.en}
        </span>
        <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--color-ink)', fontSize: 13.5 }}>
          {data.headline}
        </span>
        <ChevronDown
          size={15}
          strokeWidth={2}
          style={{ color: 'var(--color-muted)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        />
      </button>

      {!open ? null : (
      <div className="px-4 pb-4 pt-1">
      <div className="flex items-center justify-end mb-2">
        <span className="rounded-full px-2 py-0.5" style={{
          fontSize: 10, letterSpacing: '0.06em', color: 'var(--color-ink-2)',
          border: '1px solid var(--color-rule)',
        }}>{data.confidence === 'high' ? (de ? 'hohe Konfidenz' : 'high confidence') : (de ? 'moderate Konfidenz' : 'moderate confidence')}</span>
      </div>

      {/* levers */}
      <div className="flex flex-wrap gap-2">
        <span title={hrvTitle} className="rounded-full px-2.5 py-1" style={{ fontSize: 11.5, color: 'var(--color-ink-2)', border: '1px solid var(--color-rule)', background: 'var(--color-paper)', cursor: 'help' }}>
          {hrvLabel[data.hrv_state]}
        </span>
        {volPct !== 0 && (
          <span title={volTitle} className="rounded-full px-2.5 py-1 num-mono" style={{ fontSize: 11.5, color: volPct > 0 ? 'var(--color-good)' : 'var(--color-caution)', border: '1px solid var(--color-rule)', background: 'var(--color-paper)', cursor: 'help' }}>
            {de ? 'Volumen' : 'Volume'} {volPct > 0 ? `+${volPct}%` : `${volPct}%`}
          </span>
        )}
        <span title={ceilingTitle} className="rounded-full px-2.5 py-1" style={{ fontSize: 11.5, color: 'var(--color-ink-2)', border: '1px solid var(--color-rule)', background: 'var(--color-paper)', cursor: 'help' }}>
          {ceilingLabel}: {data.intensity_ceiling}
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
                <span title={de ? ev.titleDe : ev.titleEn} className="num-mono shrink-0" style={{ fontSize: 9.5, color: ev.color, letterSpacing: '0.08em', border: `1px solid color-mix(in srgb, ${ev.color} 35%, transparent)`, borderRadius: 4, padding: '1px 4px', cursor: 'help' }}>
                  {de ? ev.de : ev.en}
                </span>
              </motion.div>
            )
          })}
        </div>
      )}
      </div>
      )}
    </div>
  )
}
