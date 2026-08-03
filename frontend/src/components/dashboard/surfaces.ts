import type { CSSProperties } from 'react'
import { GLASS_BLUR, GLASS_PAPER_2, supportsBackdropFilter } from './glassCard'

/**
 * surfaces — the app's card system, in three weights instead of one.
 *
 * ── The problem this solves ──────────────────────────────────────────────
 * Every card in this app was the same object: one fill, one 1px border. A
 * screen with fourteen cards therefore had fourteen equal-weight boxes and
 * nothing to lead the eye — the reason the app read as a wireframe of itself
 * rather than as a designed surface. Colour was the only differentiator
 * available, so cards that mattered got full-bleed tints, and three tinted
 * cards on one screen shout at each other and at everything between them.
 *
 * ── The direction ────────────────────────────────────────────────────────
 * An instrument panel at night. Deep near-black, machined surfaces, and light
 * that MEANS something: a glow on this page is a claim about state, never
 * decoration. Three ideas carry it:
 *
 *  1. RIM LIGHT. A 1px inner highlight along the top edge and a matching
 *     shadow along the bottom. This is what separates a machined panel from a
 *     filled rectangle, it costs nothing, and it is the single change that
 *     lifts every card in the app at once. The token (--shadow-glass-rim)
 *     already existed and was used by nothing.
 *  2. WEIGHT, NOT COLOUR, CARRIES HIERARCHY. Three tiers — recessed, card,
 *     hero — so a screen can say "this one first" without reaching for a tint.
 *  3. ACCENT AS A HAIRLINE, NOT A WASH. A card's state colour arrives as a
 *     gradient hairline along its top edge plus an optional bloom behind it.
 *     The card stays near-black, so five accented cards can coexist on one
 *     screen without fighting. A full-bleed tint cannot.
 *
 * ── Why a module and not fourteen edits ──────────────────────────────────
 * `glassCardStyle` already had ~20 consumers across Today, Recovery, the
 * rehearsal surface and the crew pages. Upgrading the primitive upgrades all
 * of them in one move and keeps them in sync afterwards, which is the whole
 * point of having a system rather than a pile of cards.
 */

const GLASS = supportsBackdropFilter()

/** The machined edge. Bright hairline on top, dark one underneath. */
const RIM =
  'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.45)'

/** Weight of a surface. Not a colour — a position in the stack. */
export type SurfaceTier = 'recessed' | 'card' | 'hero'

/**
 * Base surface for a tier.
 *
 * `recessed` sits BELOW the page: no border, a darker fill, no rim. It is for
 * rows and tiles grouped inside a card, and its job is to disappear — a
 * bordered box inside a bordered box is the single most common way a dark UI
 * turns to mush.
 *
 * `card` is the default and the one nearly everything should use.
 *
 * `hero` is the answer to "what is this screen about". One per screen. It gets
 * a real shadow so it lifts off the page, and a slightly warmer fill so it
 * reads first even in a grey screenshot.
 */
export function surface(tier: SurfaceTier = 'card'): CSSProperties {
  if (tier === 'recessed') {
    return {
      background: 'color-mix(in srgb, #000 22%, var(--color-paper-2))',
      borderRadius: 'var(--radius-md)',
    }
  }
  if (tier === 'hero') {
    return {
      background: GLASS
        ? `linear-gradient(180deg, color-mix(in srgb, var(--color-paper-2) 92%, #fff) 0%, ${GLASS_PAPER_2} 55%)`
        : 'var(--color-paper-2)',
      border: '1px solid color-mix(in srgb, var(--color-rule) 140%, #fff)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: `${RIM}, var(--shadow-3)`,
      ...GLASS_BLUR,
    }
  }
  return {
    background: GLASS_PAPER_2,
    border: '1px solid var(--color-rule)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: `${RIM}, var(--shadow-1)`,
    ...GLASS_BLUR,
  }
}

/**
 * A card's state colour, as an edge rather than a wash.
 *
 * Returns the props for a 1px gradient hairline to be absolutely positioned
 * along the card's top edge. It fades out at both ends, which is what stops it
 * reading as a hard rule and what lets it sit under a rounded corner without
 * a visible clip.
 *
 * Use with `position: relative` on the card and `overflow: hidden`.
 */
export function accentEdge(color: string): CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    background: `linear-gradient(90deg, transparent 0%, ${color} 22%, ${color} 78%, transparent 100%)`,
    opacity: 0.85,
    pointerEvents: 'none',
  }
}

/**
 * The bloom behind an accented card. Sits at the top edge, bleeds downward,
 * and is deliberately weak — it should be felt rather than seen. Anything
 * stronger and it becomes the full-bleed tint this system exists to avoid.
 */
export function accentBloom(color: string, strength: 'soft' | 'strong' = 'soft'): CSSProperties {
  const pct = strength === 'strong' ? 22 : 12
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    background: `radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, ${color} ${pct}%, transparent) 0%, transparent 70%)`,
    pointerEvents: 'none',
  }
}

/**
 * Numeral scale. One hero per card, and everything else demonstrably smaller.
 *
 * The recovery screen shipped six competing hero numbers — 81, 7:17, 6:46, 71,
 * 49, 33 — all within a few points of each other in size. When everything is
 * loud nothing is, so the steps here are deliberately far apart: a `hero` is
 * more than twice a `metric`, and there is no size in between to reach for.
 */
export const numeral = {
  hero: { fontSize: 54, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em' },
  major: { fontSize: 30, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em' },
  metric: { fontSize: 20, fontWeight: 800, lineHeight: 1.1 },
  small: { fontSize: 15, fontWeight: 700, lineHeight: 1.2 },
} as const satisfies Record<string, CSSProperties>

/** Tabular figures, so a counting number never jitters sideways. */
export const tabular: CSSProperties = { fontVariantNumeric: 'tabular-nums' }

/**
 * The one eyebrow idiom. The app had three — uppercase-tracked, sentence-case
 * headings, and coloured all-caps with an icon — often on the same screen.
 * A label is a label; its colour says whose section it is, nothing else.
 */
export function eyebrow(color = 'var(--color-ink-2)'): CSSProperties {
  return {
    fontSize: 10.5,
    letterSpacing: '0.16em',
    fontWeight: 800,
    textTransform: 'uppercase',
    color,
  }
}

/**
 * Staggered arrival. `delay(i)` gives the i-th card on a screen its own offset
 * so a page assembles itself top-down instead of appearing all at once.
 *
 * Capped at 8 steps: beyond that the last card arrives late enough to read as
 * a bug rather than as choreography, and a long screen would leave someone
 * waiting on content they can already see space for.
 */
export function delay(index: number): CSSProperties {
  return { animationDelay: `${Math.min(index, 8) * 55}ms` }
}
