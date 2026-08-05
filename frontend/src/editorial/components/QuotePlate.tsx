import type { CSSProperties } from 'react'
import type { DayState } from '../state/dayState'
import { scrimGradient, type ScrimStop } from './plateScrim'

/** Quote Plate's Scrim shape is IDENTICAL across all three states — only the
 *  base colour (`--e-ground`, rebound per state) differs. Stops: 29→16%,
 *  7A→48%, FF→100%. */
const QUOTE_SCRIM: ScrimStop[] = [{ pos: 0, alpha: 16 }, { pos: 48, alpha: 48 }, { pos: 100, alpha: 100 }]

const layer: CSSProperties = { position: 'absolute', inset: 0, zIndex: -1 }

export interface QuotePlateProps {
  state: DayState
  /** The pull-quote. Editorial writing, not athlete data — legitimately
   *  static per state (see task-10.5-report.md), not a Value<string>. */
  quote: string
  attribution: string
  /** No TodayModel photo field — see Cover's own doc comment. */
  photoUrl?: string | null
}

/**
 * The photographic plate between section 01 and section 02 on every day
 * state (pen "Quote Plate": `CqmME` Rest, `X8wnJ` Training, `WVwiD`
 * Trained). 322 tall in the pen — but that height is the photo's own
 * envelope. Holds a 34×2 accent Tick, the quote, and a label.
 *
 * CORRECTED (coordinator visual review, defect 1): without a photo (see
 * `TodayModel`'s own gap, `task-10.5-report.md`), a fixed 322px box reads as
 * empty void above the bottom-pinned quote. Collapses to its content's
 * height when `photoUrl` is absent; the scrim still renders full-bleed
 * behind that content. See `Cover.tsx`'s own doc comment for why the
 * absolute scrim sizing to auto-height content has no circular dependency.
 */
export default function QuotePlate({ state, quote, attribution, photoUrl }: QuotePlateProps) {
  return (
    <div
      data-quote-plate
      data-day-state={state}
      style={{
        width: '100%',
        height: photoUrl ? 322 : undefined,
        overflow: 'hidden',
        position: 'relative',
        padding: '0 24px 28px 24px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: photoUrl ? `center / cover no-repeat url(${photoUrl}), var(--e-ground)` : 'var(--e-ground)',
      }}
    >
      {photoUrl && (
        <>
          <div data-photo-layer style={{ ...layer, background: 'var(--e-photo-sat-quote)', mixBlendMode: 'saturation' }} />
          <div data-photo-layer style={{ ...layer, background: 'var(--e-photo-tint-quote)', mixBlendMode: 'color' }} />
        </>
      )}
      <div data-scrim style={{ ...layer, background: scrimGradient(QUOTE_SCRIM) }} />

      <div style={{ width: 34, height: 2, background: 'var(--st-active)', marginBottom: 14 }} />
      <p
        style={{
          margin: 0, fontFamily: 'var(--e-display)', fontSize: 24, fontWeight: 800,
          letterSpacing: -1, lineHeight: 1.1, color: 'var(--e-ink)',
        }}
      >
        {quote}
      </p>
      <span
        style={{
          marginTop: 14, fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800,
          letterSpacing: 1.6, color: 'var(--e-quiet)',
        }}
      >
        {attribution}
      </span>
    </div>
  )
}
