// frontend/src/editorial/components/BentoGrid.tsx
import BentoTile, { type BentoTileProps } from './BentoTile'

export interface BentoEntry extends Omit<BentoTileProps, 'accent' | 'tall'> {
  /** Stable id, matched case-insensitively against the coach's reason text
   *  (unless `matchTerms` is set — see its own doc comment). */
  key: string
  /**
   * Explicit terms to match against the reason text, case-insensitively.
   * When set, these are the ONLY things matched — `key`/`label` are not
   * consulted at all for this entry. Absent (the default), matching falls
   * back to `key`/`label`, unchanged from before this field existed.
   *
   * Exists because a generic-word `label` misfires: the mount site's own
   * body-battery entry labels itself "ENERGIE" (`heroUnitEnergy`), a common
   * standalone German word, so a reason like "wenig Energie durch
   * Schlafmangel" — reasoning about SLEEP — would promote Body Battery
   * purely because "Energie" happens to appear earlier in the sentence than
   * "Schlaf". `matchTerms` lets the mount site hand this component
   * deliberately narrow, unambiguous terms for entries whose display label
   * is too generic to double as a match term.
   */
  matchTerms?: string[]
}

/**
 * Size and colour are EARNED: the metric the coach's own reason keys off
 * gets the double-height, accented tile, so the grid changes shape day to
 * day. The "exactly one accent, exactly one tall — never zero, never two"
 * invariant is the whole point: two accents and the eye has nowhere to land
 * first; zero and nothing does.
 *
 * WHICH ENTRY WINS WHEN THE REASON NAMES MORE THAN ONE METRIC: the metric
 * mentioned EARLIEST in the reason string wins, not simply the first entry
 * in the `entries` array that happens to match. A coach sentence like
 * "Schlaf war kurz, deshalb HRV im Blick behalten" leads with sleep — that
 * is the actual reasoning the coach opens with — even though HRV might sit
 * first in whatever order the caller happened to build `entries` in.
 * Deterministic either way, but leftmost-in-the-sentence is the reading
 * that matches what a human skimming the same sentence would call "the
 * thing this is about." Ties (equal earliest position — only possible if
 * one entry's key/label is itself a substring of another's) keep the entry
 * that appears first in `entries`.
 *
 * MATCHING IS PLAIN SUBSTRING, NOT WORD-BOUNDARY, ON PURPOSE: German
 * compounds a metric name straight into a longer word constantly
 * ("Schlafqualität", "Schlafmangel", "Ruhepulswert") — a `\bSchlaf\b`-style
 * boundary match would silently MISS all of those real, intended matches.
 * That false-negative risk is worse than the false-positive risk of an
 * unrelated German word accidentally containing "hrv", "schlaf", "rhr", or
 * this app's body-battery key — none of which are common German syllables,
 * and none of which collide with any string in this app's own copy deck
 * (`i18n/copy.ts`). Substring matching is the deliberate choice here.
 *
 * With no reason, or a reason naming nothing (or an empty `entries`), the
 * first entry gets both — never zero, never two.
 *
 * Never mutates the caller's `entries` array (no in-place `sort`/`splice`).
 */
function orderEntries(entries: BentoEntry[], reason: string | null): BentoEntry[] {
  if (entries.length === 0) return []

  const haystack = (reason ?? '').toLowerCase()
  let leadIndex = 0
  let leadPos = Infinity
  entries.forEach((e, i) => {
    // `matchTerms`, when given, REPLACES key/label matching entirely for
    // this entry — not adds to it — so a caller can rule out a generic
    // label (e.g. "ENERGIE") by supplying only the narrow terms it actually
    // wants matched.
    const terms = e.matchTerms && e.matchTerms.length > 0 ? e.matchTerms : [e.key, e.label]
    const candidates = terms.map((term) => haystack.indexOf(term.toLowerCase())).filter((p) => p >= 0)
    if (candidates.length === 0) return
    const pos = Math.min(...candidates)
    if (pos < leadPos) {
      leadPos = pos
      leadIndex = i
    }
  })

  // `filter`/spread below build a new array — `entries` itself is never
  // reordered or spliced.
  const lead = entries[leadIndex]
  const rest = entries.filter((_, i) => i !== leadIndex)
  return [lead, ...rest]
}

export function rankTiles(entries: BentoEntry[], reason: string | null): BentoTileProps[] {
  return orderEntries(entries, reason).map(({ key: _key, matchTerms: _matchTerms, ...tile }, i) => ({ ...tile, accent: i === 0, tall: i === 0 }))
}

export default function BentoGrid({ entries, reason }: { entries: BentoEntry[]; reason: string | null }) {
  if (entries.length === 0) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
      {orderEntries(entries, reason).map(({ key, matchTerms: _matchTerms, ...tile }, i) => (
        // Keyed by the entry's own stable `key`, not `${label}-${i}`: a
        // positional key would let React reuse the wrong DOM node (and
        // silently carry over its expand state) whenever ranking reorders
        // tiles or two entries happen to share a label. `key` is destructured
        // out and passed explicitly rather than left in the spread —
        // spreading an object containing `key` into JSX works (React
        // extracts it) but warns that the field is fragile to rely on
        // implicitly; explicit is unambiguous and keeps `BentoTileProps`
        // itself free of a `key` field, which `BentoTile` never accepts.
        <BentoTile key={key} {...tile} accent={i === 0} tall={i === 0} />
      ))}
    </div>
  )
}
