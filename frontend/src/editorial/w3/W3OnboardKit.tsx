import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import RidrMark, { RIDR_LIME } from '../../components/RidrMark'
import { T, FONT } from './w3tokens'

/**
 * Shared chrome for the four W3 onboarding screens (welcome / devices /
 * rewards / garage). Every screen wears the same wordmark header, four-step
 * progress rail and acid pill CTA — factored here so the individual views hold
 * only their own hero + copy. Pure presentational primitives.
 */

/**
 * Top bar: the Ridr wordmark on the left, an optional SKIP on the right.
 *
 * It read "W3.RIDE" beside a lucide lightning bolt — the internal name of the
 * design system, and a stock icon standing in for a logo the app owns. This is
 * the FIRST screen a new rider sees, so it was also the first thing the app
 * told them it was called, and it was telling them the wrong name.
 *
 * The mark is the app's own, in the logo's lime rather than the interface's
 * acid: `RidrMark` documents that difference, and a wordmark is the one place
 * the logo's colour outranks the accent.
 */
export function W3OnboardTopBar({ onSkip }: { onSkip?: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 20px 0', height: 40 }}>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <RidrMark size={19} color={RIDR_LIME} />
        <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 2, color: T.ink }}>RIDR</span>
      </div>
      {onSkip && (
        <button
          onClick={onSkip}
          style={{ background: 'transparent', border: 0, color: T.quiet, fontFamily: FONT, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, cursor: 'pointer' }}
        >
          SPÄTER
        </button>
      )}
    </div>
  )
}

/** Four-step progress rail — the active step is an acid pill, the rest are dim dots. */
export function W3OnboardDots({ step, total = 4 }: { step: number; total?: number }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{
            height: 6,
            width: i === step ? 26 : 6,
            borderRadius: 100,
            background: i === step ? T.acid : T.d2,
            transition: 'width 200ms',
          }}
        />
      ))}
    </div>
  )
}

/** The acid pill CTA (NEXT / START RIDING). */
export function W3OnboardCta({ label, onClick, icon }: { label: string; onClick: () => void; icon?: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 60, width: '100%', borderRadius: 100, border: 0, background: T.acid, color: T.bg,
        fontFamily: FONT, fontSize: 16, fontWeight: 800, letterSpacing: 1, cursor: 'pointer',
        display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center',
      }}
    >
      {label}
      {icon ?? <ArrowRight size={19} color={T.bg} strokeWidth={2.6} />}
    </button>
  )
}

/** Kicker + two-line display headline (white line over acid line) + body. */
export function W3OnboardHeadline({ kicker, line1, line2, body }: {
  kicker: string; line1: string; line2: string; body: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, color: T.acid }}>{kicker}</span>
      <h1 style={{ margin: 0, fontSize: 40, fontWeight: 800, letterSpacing: -1.6, lineHeight: 1.0, color: T.ink }}>
        {line1}<br /><span style={{ color: T.acid }}>{line2}</span>
      </h1>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 500, lineHeight: 1.5, color: T.mid, maxWidth: 340 }}>{body}</p>
    </div>
  )
}
