import type { StoryField, StoryLayout } from './w3share'

/**
 * WHICH WORDS EACH STORY FORMAT ACTUALLY PRINTS.
 *
 * The renderer emits a tap zone for every editable word it draws, so this list
 * is not what makes editing work — it is what the editor uses to know what to
 * ask for when a rider opens the word list, and what a test can hold a layout
 * to. `silent` prints no sentence and therefore offers nothing: a field for
 * words the format refuses to draw is how a settings screen grows.
 */
export const EDITABLE_FIELDS: Record<StoryLayout, StoryField[]> = {
  wrap: ['routeName', 'lead', 'emphasis'],
  full: ['lead', 'emphasis'],
  silent: [],
  trace: ['routeName'],
  headline: ['routeName', 'dateline', 'ticker'],
  viewfinder: ['routeName', 'dateline'],
  effort: ['dateline', 'lead', 'emphasis'],
}

/** What each word is, in the rider's language — shown while they type it. */
export const FIELD_LABEL: Record<StoryField, string> = {
  routeName: 'Titel',
  dateline: 'Zeile',
  lead: 'Satz',
  emphasis: 'Betonung',
  ticker: 'Laufband',
}

/**
 * THE SIX FORMATS, IN THE ORDER YOU SWIPE THROUGH THEM.
 *
 * Ordered by how much they give up, quietest last: the whole card, then the one
 * that drops the sentence, then the one that drops everything but the route.
 * Swiping is a continuum, so the order has to be one too — six chips in an
 * arbitrary order is a menu, and a rider swiping a menu learns nothing about
 * where they are in it.
 */
export const STORY_FORMATS: { id: StoryLayout; name: string; drops: string }[] = [
  // FIRST, because it is what the rider was looking at when they pressed share.
  // Every other format is a re-composition of the same ride; this one is the
  // screen itself, and defaulting to anything else answers a question nobody
  // asked.
  { id: 'wrap', name: 'Dein Screen', drops: 'Wie im Ziel' },
  { id: 'full', name: 'Karte', drops: 'Alles drauf' },
  { id: 'headline', name: 'Schlagzeile', drops: 'Titel + Laufband' },
  { id: 'viewfinder', name: 'Sucher', drops: 'Telemetrie' },
  { id: 'effort', name: 'Effort', drops: 'Satz oben' },
  { id: 'silent', name: 'Ohne Worte', drops: 'Nur Zahlen' },
  { id: 'trace', name: 'Spur', drops: 'Nur die Strecke' },
]

/** Step through the formats by one, without wrapping. Swiping past the end of a
 *  list should feel like an end, not like a loop — a rider who wraps cannot
 *  tell whether they have seen all six. */
export function stepFormat(current: StoryLayout, dir: 1 | -1): StoryLayout {
  const i = STORY_FORMATS.findIndex((f) => f.id === current)
  const next = Math.max(0, Math.min(STORY_FORMATS.length - 1, (i < 0 ? 0 : i) + dir))
  return STORY_FORMATS[next].id
}
