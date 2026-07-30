/**
 * seasonArc — the one description of where the athlete is in their season.
 *
 * Every one of these numbers already existed, computed privately inside
 * PlanTab (lines ~320-400). Four chapters now need the same figures in a
 * persistent bar, and a second implementation would drift: audit P0-5 was
 * exactly that bug, a parallel countdown that flipped 138 ↔ 139 depending on
 * the hour of day. So this module is an EXTRACTION, not new maths, and it
 * delegates the countdown itself to the single sanctioned producer.
 *
 * Honesty rules:
 *  • No event booked → `daysToEvent: null` and `synthesized: true`. The bar
 *    then shows the training block, never an invented race date.
 *  • The server publishes a block length only as the no-event fitness-builder
 *    `progression.horizon_weeks`. When it is absent, `blockWeeks` is null and
 *    the bar shows the phase word alone rather than a fabricated "W3/6".
 */
import { daysToEvent } from './loadMetrics'

/** The four chapters, in story order. */
export type ChapterId = 'today' | 'plan' | 'body' | 'history'

export const CHAPTERS: readonly ChapterId[] = ['today', 'plan', 'body', 'history']

export function chapterIndex(id: ChapterId): number {
  return CHAPTERS.indexOf(id)
}

/** The next chapter, wrapping the last back to the first so the arc closes. */
export function nextChapter(id: ChapterId): ChapterId {
  return CHAPTERS[(chapterIndex(id) + 1) % CHAPTERS.length]
}

/** Each chapter's question, in the athlete's language. Lived in ChapterBar
 *  until that component was removed; NextChapter still names the next
 *  chapter's question, so the titles outlive the bar that introduced them. */
export const CHAPTER_TITLES: Record<ChapterId, { en: string; de: string }> = {
  today:   { en: 'WHAT DO I DO TODAY', de: 'WAS MACHE ICH HEUTE' },
  plan:    { en: 'WHERE THIS IS GOING', de: 'WO DAS HINGEHT' },
  body:    { en: 'CAN I TAKE IT',       de: 'KANN ICH DAS TRAGEN' },
  history: { en: 'DID IT WORK',         de: 'HAT ES FUNKTIONIERT' },
}

/** The subset of the server's MesoBlockContext this module reads. */
export interface SeasonArcMeso {
  phase?: string | null
  /** 0-BASED week index inside the block, as the server sends it. */
  block_index_in_meso?: number | null
  days_to_event?: number | null
  progression?: { horizon_weeks?: number | null } | null
}

export interface SeasonArcInput {
  /** Athlete profile target event date — highest precedence. */
  targetEventDate?: string | null
  /** Goal date off the brief evidence — backup when the profile has none. */
  goalEventDate?: string | null
  meso?: SeasonArcMeso | null
  now?: Date
}

export interface SeasonArc {
  phaseKey: string | null
  /** 1-based week within the block; null when the server did not say. */
  weekInBlock: number | null
  /** Block length in weeks; null when unpublished. */
  blockWeeks: number | null
  /** Days until the event; null when none is booked. */
  daysToEvent: number | null
  /** Whole weeks until the event, rounded up; null when no event. */
  weeksToEvent: number | null
  /** True when no real event anchors the arc. */
  synthesized: boolean
}

const PHASE_WORDS: Record<string, { en: string; de: string }> = {
  base: { en: 'Base', de: 'Grundlage' },
  build: { en: 'Build', de: 'Aufbau' },
  peak: { en: 'Peak', de: 'Peak' },
  taper: { en: 'Taper', de: 'Taper' },
  race: { en: 'Race', de: 'Rennen' },
}

/** "base1" → "Grundlage 1". Lifted verbatim from PlanTab's phaseLabel memo. */
export function phaseLabel(phaseKey: string | null | undefined, de: boolean): string {
  if (!phaseKey) return de ? 'Grundlage' : 'Base'
  const m = phaseKey.match(/^([a-z]+)\s*(\d+)?$/i)
  const stem = (m?.[1] ?? phaseKey).toLowerCase()
  const word = Object.entries(PHASE_WORDS).find(([k]) => stem.startsWith(k))?.[1]
  const label = word
    ? (de ? word.de : word.en)
    : (m?.[1] ?? phaseKey).replace(/^\w/, (c) => c.toUpperCase())
  return m?.[2] ? `${label} ${m[2]}` : label
}

export function seasonArc(input: SeasonArcInput): SeasonArc {
  const meso = input.meso ?? null
  const now = input.now ?? new Date()

  // Precedence, unchanged from PlanTab: profile date, then brief evidence,
  // then the server's own figure. `daysToEvent` is the only producer.
  const clientDays = daysToEvent(input.targetEventDate ?? input.goalEventDate ?? null, now)
  const resolved = clientDays != null
    ? Math.max(0, clientDays)
    : meso?.days_to_event != null
      ? Math.max(0, meso.days_to_event)
      : null

  const idx = meso?.block_index_in_meso
  const weekInBlock = typeof idx === 'number' && Number.isFinite(idx) ? idx + 1 : null

  const horizon = meso?.progression?.horizon_weeks
  const blockWeeks = typeof horizon === 'number' && Number.isFinite(horizon) && horizon > 0
    ? horizon
    : null

  return {
    phaseKey: meso?.phase ?? null,
    weekInBlock,
    blockWeeks,
    daysToEvent: resolved,
    weeksToEvent: resolved != null ? Math.max(0, Math.ceil(resolved / 7)) : null,
    synthesized: resolved == null,
  }
}
