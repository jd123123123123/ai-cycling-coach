import { ShieldCheck, Leaf } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import { useAdaptiveGate } from '../../hooks/useAdaptiveGate'

// CoachSafetyBanner — the coach-safety interlock made visible (spec §4, §5).
//
// Sits ABOVE pillar 1. When the adaptive engine prescribes recovery it changes
// the whole page's tone: rest is reframed as the winning move, not a loss.
//   rest → forest/amber recovery-reframe strip ("Rest is today's win")
//   ease → softened "hold position" strip
//   go   → renders nothing (full competitive copy is safe)
//
// Never red. Rest is not a failure state — colouring it like an error would be
// its own dark pattern. Forest/amber only.

export default function CoachSafetyBanner() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { mode } = useAdaptiveGate()

  if (mode === 'go') return null

  const isRest = mode === 'rest'

  const eyebrow = isRest
    ? de ? 'Coach zuerst' : 'Coach first'
    : de ? 'Coach zuerst · locker' : 'Coach first · ease'

  const headline = isRest
    ? de ? 'Erholung ist heute der Sieg.' : 'Rest is today’s win.'
    : de ? 'Halte die Position.' : 'Hold your position.'

  const body = isRest
    ? de
      ? 'Dein Coach verordnet Erholung. Dein Ring schließt heute durch Ausruhen — nicht durch Training. Die Serie läuft weiter, ohne dass du etwas tun musst, und jeder Wettkampf-Anreiz pausiert, bis du wieder bereit bist.'
      : 'Your coach is prescribing recovery. Your ring closes today by resting — not by training. Your streak keeps running for free, and every catch-the-leader nudge is paused until you’re ready.'
    : de
      ? 'Ein leichter Tag hält deinen Ring am Leben — kein Grund, zu überziehen. Halte die Position, das reicht diese Woche.'
      : 'A light spin keeps your ring alive — no need to overreach. Hold position; that’s enough this week.'

  const accent = isRest ? 'var(--color-forest-2)' : 'var(--color-amber)'
  const Icon = isRest ? Leaf : ShieldCheck

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-5 sm:px-6 sm:py-5 flex items-start gap-3.5"
      role="status"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: `1px solid color-mix(in srgb, ${accent} 40%, var(--color-rule))`,
        backgroundImage: `radial-gradient(90% 70% at 0% 0%, color-mix(in srgb, ${accent} 12%, transparent), transparent 60%)`,
      }}
    >
      <div
        className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)` }}
      >
        <Icon size={18} strokeWidth={2} style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <span
          className="eyebrow"
          style={{ color: accent, letterSpacing: '0.22em', fontSize: 10, fontWeight: 600 }}
        >
          {eyebrow}
        </span>
        <p
          className="mt-1.5 leading-snug"
          style={{
            fontFamily: 'var(--font-serif, serif)',
            fontStyle: 'italic',
            fontSize: 'clamp(16px, 2.2vw, 19px)',
            color: 'var(--color-ink)',
          }}
        >
          {headline}
        </p>
        <p className="text-[13px] leading-relaxed mt-1.5" style={{ color: 'var(--color-ink-2)', maxWidth: '62ch' }}>
          {body}
        </p>
      </div>
    </div>
  )
}
