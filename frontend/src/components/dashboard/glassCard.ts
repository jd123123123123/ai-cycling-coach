/**
 * glassCard — the ONE shared "glass" treatment for Today's cards.
 *
 * Today's Road (DashboardShell) paints the day's terrain full-bleed behind
 * <main>. The product decision (task 8 review, finding 3) is a whole-page
 * treatment: every card rendered on Today reads as translucent glass over
 * the road, not a patchwork of a few translucent cards mixed with solid
 * `var(--color-paper-2)` slabs. This module is the single source of that
 * treatment so every consumer (TodayTab's own cards + the shared
 * SessionOfTheDay / FitnessFreshnessCard / WeatherWindowCard /
 * ExtraSessionsCard / AbsorptionCard / ThisWeekCard /
 * SessionReviewCard components) stays in sync — one token, not eight
 * copies drifting independently.
 *
 * Fallback (finding 4): a 72%-opaque tint with no blur over an animated
 * landscape is a legibility risk on runtimes without `backdrop-filter`
 * support. `CSS.supports` is the DOM's `@supports` — checked once, at
 * import time (deliberately not per-render: support doesn't change while
 * the app is running, and this avoids recomputing GLASS_PAPER_2 on every
 * card's every render).
 */

/** True when the runtime can actually blur what's behind the card. */
export function supportsBackdropFilter(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false
  return CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)')
}

const GLASS = supportsBackdropFilter()

/** Card surface colour: translucent (road shows through) when blur is
 *  supported, else the plain solid surface — never a flat, unblurred tint. */
export const GLASS_PAPER_2 = GLASS
  ? 'color-mix(in srgb, var(--color-paper-2) 72%, transparent)'
  : 'var(--color-paper-2)'

/** Spread onto a card's style object alongside a background that already
 *  uses GLASS_PAPER_2 (e.g. inside a gradient) to add the blur itself. */
export const GLASS_BLUR = GLASS
  ? ({ backdropFilter: 'blur(14px) saturate(1.2)', WebkitBackdropFilter: 'blur(14px) saturate(1.2)' } as const)
  : ({} as const)

/** Drop-in replacement for the old flat `{ background: var(--color-paper-2),
 *  border: 1px solid var(--color-rule) }` card style.
 *
 *  Carries the RIM LIGHT: a 1px highlight along the top edge and a matching
 *  shadow along the bottom. That pair is what separates a machined panel from
 *  a filled rectangle, and adding it here rather than at each call site lifts
 *  every card in the app at once — Today, Recovery, the rehearsal surface and
 *  the crew pages all consume this object. `--shadow-glass-rim` had existed as
 *  a token since the 6.1 redesign and was used by nothing.
 *
 *  The accompanying --shadow-1 is deliberately the smallest step on the scale:
 *  on a screen of a dozen cards a heavier drop shadow stops reading as depth
 *  and starts reading as fog. Cards that need to lift further ask for the
 *  `hero` tier in `surfaces.ts`. */
export const glassCardStyle = {
  background: GLASS_PAPER_2,
  border: '1px solid var(--color-rule)',
  boxShadow: 'var(--shadow-glass-rim), var(--shadow-1)',
  ...GLASS_BLUR,
} as const

/** Spread onto a card's root element props (alongside `style`) so the
 *  Today's-Road pointer delegation in DashboardShell can tell "this pointer
 *  landed on a card" from "this pointer landed on empty page" and leave
 *  card taps/drags alone — see DashboardShell.tsx's onPointerDown. */
export const GLASS_CARD_MARKER = { 'data-glass-card': 'true' } as const
