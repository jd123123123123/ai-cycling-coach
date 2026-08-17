/**
 * The bike's spec sheet, read out of the REAL vision description.
 *
 * `POST /garage/asset/render` (kind:'bike') returns `description` — the vision
 * pass's literal read of the rider's own bike. The backend prompt
 * (`backend/app/services/cyclr_studio.py` → `_ANALYSIS['bike']`) asks for it in
 * four numbered parts: 1. Frame (geometry, tube shapes, colours), 2. Cockpit
 * (bar type, tape colour), 3. Wheels (rim depth/colour, tyre walls),
 * 4. Components (saddle, pedals). That structure is a REQUEST, not a
 * guarantee — it is prose from a model — so this parser is deliberately timid:
 *
 * - it only ever SPLITS the model's own words; it never rewrites, summarises,
 *   normalises or infers a value (no "carbon" because the frame is deep-section,
 *   no colour swatches, no groupset guessing);
 * - a section is recognised only by an explicit heading word followed by a
 *   colon, so a passing mention of "wheels" inside a sentence can't invent a row;
 * - fewer than two recognised sections → it returns `[]` and the caller shows
 *   the description as the sentence it is. Half a spec sheet is worse than none.
 *
 * Anything shown from these rows is therefore something the vision pass actually
 * wrote about the rider's bike.
 */

export type BikeSpecKey = 'frame' | 'cockpit' | 'wheels' | 'components'

export interface BikeSpecRow {
  key: BikeSpecKey
  /** German label for the section (the values stay in the model's own words). */
  label: string
  /** The model's literal text for this section. */
  value: string
}

/** The German label each section is printed under. */
export const BIKE_SPEC_LABELS: Record<BikeSpecKey, string> = {
  frame: 'Rahmen',
  cockpit: 'Cockpit',
  wheels: 'Laufräder',
  components: 'Komponenten',
}

/** Heading word → section. English is what the analysis prompt produces; the
 *  German synonyms cost nothing and make the parser survive a translated pass. */
const HEADING_WORD: Record<string, BikeSpecKey> = {
  frame: 'frame', frameset: 'frame', rahmen: 'frame',
  cockpit: 'cockpit', handlebar: 'cockpit', handlebars: 'cockpit',
  cockpitcontrols: 'cockpit', lenker: 'cockpit',
  wheel: 'wheels', wheels: 'wheels', wheelset: 'wheels', rims: 'wheels',
  laufrad: 'wheels', laufräder: 'wheels', laufraeder: 'wheels',
  components: 'components', component: 'components', drivetrain: 'components',
  groupset: 'components', komponenten: 'components', antrieb: 'components',
}

// A heading: start of text / newline / end of a previous sentence, an optional
// bullet or "3." numbering, the heading word, an optional parenthetical the
// prompt itself invites ("Frame (geometry, tube shapes, colors):"), then a
// colon. The colon is what makes it a heading rather than a mention.
const HEADING = new RegExp(
  String.raw`(?:^|[\n.;])[ \t]*(?:[-–—•*]\s*)?(?:\d{1,2}[.)]\s*)?` +
  String.raw`(${Object.keys(HEADING_WORD).join('|')})\b[^:\n]{0,64}?:`,
  'gi',
)

/** Strip the markdown a model layers on ("**Frame:**", "### Wheels"). */
function unmark(text: string): string {
  return text
    .replace(/\*\*|__|`/g, '')
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, '')
}

/** Tidy one captured value without changing a word of it: collapse whitespace
 *  and drop the leading bullet / trailing sentence punctuation the split leaves
 *  behind, so the rows read as one list. No word is ever altered. */
function clean(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—•*:,]+/, '')
    .replace(/[\s;,.]+$/, '')
    .trim()
}

/**
 * Split a bike description into its spec rows, in the fixed reading order
 * frame → cockpit → wheels → components. Returns `[]` whenever the text isn't
 * confidently structured (fewer than two recognised sections), which is the
 * caller's signal to print the description as prose instead.
 */
export function parseBikeSpec(description: string | null | undefined): BikeSpecRow[] {
  if (!description) return []
  const text = unmark(description)

  // Pass 1 — locate every heading and where its value starts.
  const marks: { key: BikeSpecKey; from: number; at: number }[] = []
  HEADING.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = HEADING.exec(text)) !== null) {
    const key = HEADING_WORD[m[1].toLowerCase()]
    if (key) marks.push({ key, from: m.index, at: m.index + m[0].length })
    // A zero-length match can't happen here (the pattern needs a colon), but
    // guard anyway so a future edit can't spin this loop forever.
    if (m.index === HEADING.lastIndex) HEADING.lastIndex++
  }
  if (marks.length < 2) return []

  // Pass 2 — each value runs to the next heading.
  const found = new Map<BikeSpecKey, string>()
  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].from : text.length
    const value = clean(text.slice(mark.at, end))
    // First mention wins: a later "wheels:" inside the components paragraph
    // must not overwrite the real wheels section.
    if (value && !found.has(mark.key)) found.set(mark.key, value)
  })
  if (found.size < 2) return []

  const ORDER: BikeSpecKey[] = ['frame', 'cockpit', 'wheels', 'components']
  return ORDER.filter((k) => found.has(k)).map((k) => ({
    key: k,
    label: BIKE_SPEC_LABELS[k],
    value: found.get(k) as string,
  }))
}
