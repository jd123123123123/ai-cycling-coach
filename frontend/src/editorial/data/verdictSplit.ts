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
  for (const sep of SEPARATORS) {
    const at = headline.indexOf(sep)
    if (at > 0) {
      return { lead: headline.slice(0, at), emphasis: headline.slice(at + sep.length) }
    }
  }
  return { lead: headline, emphasis: null }
}
