/**
 * Mechanic K needs one word of the headline in the accent, mid-sentence.
 * The honest place to break a coach verdict is where the coach already
 * broke it — this splits on the separators `brief.verdict` really uses and
 * refuses to invent one anywhere else. A verdict with no separator renders
 * whole, at one weight, with no accent spent: the roadbook's accent budget
 * is two, and an accent landing on an arbitrary word is worth less than the
 * budget it costs.
 */
const SEPARATORS = [' — ', ' – ', ': ']

export function splitVerdict(headline: string): { lead: string; emphasis: string | null } {
  // AMENDED (task-4 review, 2026-08-07): split at the LEFTMOST separator of
  // any kind, not at the first kind that happens to appear. Iterating the
  // list and returning on the first match made separator *priority* decide
  // the break: "Heute zählt: die Sache — jetzt zählt es" split at the em
  // dash and swallowed the earlier colon into the quiet lead. The rule this
  // function exists to serve is "break it where the coach already broke it",
  // and the break the coach made first is the earliest one in the sentence.
  let best: { at: number; sep: string } | null = null
  for (const sep of SEPARATORS) {
    const at = headline.indexOf(sep)
    // `> 0`, never `>= 0`: a sentence that STARTS with a separator has no
    // lead clause, and splitting it would leave an empty first half.
    if (at > 0 && (best == null || at < best.at)) best = { at, sep }
  }
  if (best == null) return { lead: headline, emphasis: null }
  return { lead: headline.slice(0, best.at), emphasis: headline.slice(best.at + best.sep.length) }
}
