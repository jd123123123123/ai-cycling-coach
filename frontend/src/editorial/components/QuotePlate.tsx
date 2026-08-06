import type { CSSProperties } from 'react'
import type { DayState } from '../state/dayState'
import { scrimGradient, type ScrimStop } from './plateScrim'

/** Quote Plate's Scrim shape is IDENTICAL across all three states — only the
 *  base colour (`--e-ground`, rebound per state) differs. Stops: 29→16%,
 *  7A→48%, FF→100%. */
const QUOTE_SCRIM: ScrimStop[] = [{ pos: 0, alpha: 16 }, { pos: 48, alpha: 48 }, { pos: 100, alpha: 100 }]

/**
 * The photographic stack, bottom to top: photo, saturation blend, colour
 * blend, scrim — then the plate's own content, which sits above all of them
 * simply by being in flow.
 *
 * Two things make this work. The photo is its OWN layer rather than the
 * parent's `background`, because `mix-blend-mode` composites an element
 * against its backdrop and a blend layer cannot act on the background of its
 * own parent — that was the bug: the pen's desaturated, olive-tinted
 * photography rendered as raw full-colour stock. And `isolation: isolate` on
 * the parent contains the blending inside the plate rather than letting it
 * reach the page beneath.
 *
 * The layers are all negative-z so in-flow content paints over them without
 * needing a wrapper (a `display: contents` wrapper generates no box, so it
 * cannot carry a z-index at all).
 */
const photoLayer: CSSProperties = { position: 'absolute', inset: 0, zIndex: -4 }
const satLayer: CSSProperties = { position: 'absolute', inset: 0, zIndex: -3 }
const tintLayer: CSSProperties = { position: 'absolute', inset: 0, zIndex: -2 }
const scrimLayer: CSSProperties = { position: 'absolute', inset: 0, zIndex: -1 }

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
 *
 * Design pass (2026-08-06): horizontal inset widened 24→32px and a 40px
 * `paddingTop` added (was 0) — measured live at 390×844, the pull-quote sat
 * flush against the plate's own edges with no air above it at all, a "crop
 * accident" look the brief calls out by name. The quote itself now reads at
 * `--t-title` (34px), the same step Statement's claim uses elsewhere — both
 * are "the one bold sentence" of their block, so they share a size rather
 * than each inventing their own (was 24px, between two scale steps).
 *
 * `height` → `minHeight` for the same reason as `Cover.tsx`'s own fix: 322
 * is the photo's envelope, not a hard content budget — a longer real quote
 * must never be clipped by `overflow: hidden` to hold a fixed number.
 */
export default function QuotePlate({ state, quote, attribution, photoUrl }: QuotePlateProps) {
  return (
    <div
      data-quote-plate
      data-day-state={state}
      style={{
        width: '100%',
        minHeight: photoUrl ? 322 : undefined,
        overflow: 'hidden',
        position: 'relative',
        padding: '40px 32px 28px 32px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: 'var(--e-ground)',
        isolation: 'isolate',
      }}
    >
      {photoUrl && (
        <>
          <div data-photo style={{ ...photoLayer, background: `center / cover no-repeat url(${photoUrl})` }} />
          <div data-photo-layer style={{ ...satLayer, background: 'var(--e-photo-sat-quote)', mixBlendMode: 'saturation' }} />
          <div data-photo-layer style={{ ...tintLayer, background: 'var(--e-photo-tint-quote)', mixBlendMode: 'color' }} />
        </>
      )}
      <div data-scrim style={{ ...scrimLayer, background: scrimGradient(QUOTE_SCRIM) }} />

      <div style={{ width: 34, height: 2, background: 'var(--st-active)', marginBottom: 14 }} />
      <p
        style={{
          margin: 0, fontFamily: 'var(--e-display)', fontSize: 'var(--t-title)', fontWeight: 800,
          letterSpacing: -1, lineHeight: 1.1, color: 'var(--e-ink)',
        }}
      >
        {quote}
      </p>
      <span
        style={{
          marginTop: 14, fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800,
          letterSpacing: 1.4, color: 'var(--e-quiet)',
        }}
      >
        {attribution}
      </span>
    </div>
  )
}
