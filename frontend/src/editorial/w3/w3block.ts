/**
 * The training block, in German — and the one line the hero wears about it.
 *
 * These used to live inside `W3WhyToday` and `W3TodayPage`, which was fine
 * while Today was the only screen that showed them. The hero is a room now
 * (`W3HeroShell`), shared with the garage, and it wears the block line above
 * the rider's handle — so the words moved to a module that neither screen
 * owns, rather than the room importing a page to borrow a string.
 */

export const BLOCK_DE: Record<string, { name: string; means: string }> = {
  accumulation: { name: 'Umfangsblock', means: 'Umfang vor Intensität — hier wird die aerobe Basis breit gemacht' },
  transmutation: { name: 'Intensitätsblock', means: 'die Basis wird in wettkampfspezifische Schärfe umgesetzt' },
  realization: { name: 'Formblock', means: 'Last runter, Schärfe rein — die Form wird scharf gestellt' },
  recovery: { name: 'Entlastungswoche', means: 'die Last fällt bewusst ab, damit die Anpassung greift' },
}

/** "Umfangsblock · Woche 2 von 4". Null without a plan — the hero then shows no
 *  pill at all, rather than a block the rider was never put in. */
export function blockLine(
  meso: { block_position: string; block_index_in_meso: number } | null,
): string | null {
  const block = meso ? BLOCK_DE[meso.block_position] : null
  if (!block) return null
  const weekNo = meso != null && meso.block_index_in_meso >= 0 ? meso.block_index_in_meso + 1 : null
  if (weekNo == null) return block.name
  return `${block.name} · ${weekNo <= 4 ? `Woche ${weekNo} von 4` : `Woche ${weekNo}`}`
}
