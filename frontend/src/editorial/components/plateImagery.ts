import type { DayState } from '../state/dayState'

/**
 * The plates' imagery, by day state.
 *
 * Served from `public/editorial/` and referenced by URL rather than imported:
 * an `import` would inline these into the JS bundle, where they would be
 * re-downloaded on every deploy instead of living in their own long-lived
 * cache entry.
 *
 * Two different kinds of image, on purpose:
 *  - `*-cover` are AI-generated editorial road-biking art, authored for this
 *    design system and extracted from the pen's own assets.
 *  - the quote / tomorrow / route plates are the designer's Unsplash mock,
 *    downloaded rather than hotlinked so a rotated URL cannot blank a screen.
 *    Placeholder-grade; replacing them is a known follow-up. Photographer
 *    credit travels with the files in `public/editorial/CREDITS.md`.
 *
 * Route ROWS are deliberately not here: those are the athlete's own rides, so
 * they render their real GPS track (see `RouteOptions`), never a photograph of
 * someone else's road.
 */
const BASE = '/editorial'

export const COVER_PHOTO: Record<DayState, string> = {
  rest: `${BASE}/rest-cover.webp`,
  training: `${BASE}/training-cover.webp`,
  trained: `${BASE}/trained-cover.webp`,
  resting: `${BASE}/resting-cover.webp`,
  evening: `${BASE}/evening-cover.webp`,
}

export const QUOTE_PHOTO: Record<DayState, string> = {
  rest: `${BASE}/rest-quote.webp`,
  training: `${BASE}/training-quote.webp`,
  trained: `${BASE}/trained-quote.webp`,
  resting: `${BASE}/resting-quote.webp`,
  evening: `${BASE}/evening-quote.webp`,
}

/** Training's plate is a Route Plate; the rest are Tomorrow Plates. */
export const TOMORROW_PHOTO: Record<DayState, string> = {
  rest: `${BASE}/rest-tomorrow.webp`,
  training: `${BASE}/training-route.webp`,
  trained: `${BASE}/trained-tomorrow.webp`,
  resting: `${BASE}/resting-tomorrow.webp`,
  evening: `${BASE}/evening-tomorrow.webp`,
}

/** Session Detail is not a day state — it has one quote plate of its own. */
export const SESSION_QUOTE_PHOTO = `${BASE}/session-quote.webp`
