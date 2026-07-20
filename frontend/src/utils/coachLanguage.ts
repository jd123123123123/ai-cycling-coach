/**
 * coachLanguage — client-side phrase map for bits of UI text the backend
 * can't write for us (component labels, tooltips, block names).
 *
 * The coach's generative output (brief rationale, why_this_workout, etc.)
 * is already language-mode-aware on the backend via SYSTEM_PROMPT_SIMPLE /
 * SYSTEM_PROMPT_TECHNICAL. This helper covers the remaining surfaces:
 *   - Prescribed-workout titles derived from `template.category` when the
 *     backend hands us a technical title in simple mode
 *   - Interval block names ("Warm-up" → "Warm up · Keep it easy")
 *   - KPI tooltips (simple: "How recovered you feel" vs technical: "HRV 7d mean vs 28d baseline")
 *   - WhyAmITired cause labels (simple: "Your sleep's been short" vs technical: "Sleep debt accumulated")
 *   - Section headings in the brief ("Grounded in sports science" vs framework list)
 *
 * Two orthogonal axes:
 *   - `language: 'simple' | 'technical'` — the coach VOICE (jargon vs plain).
 *   - `locale: 'en' | 'de'`             — the UI LANGUAGE (English vs German).
 *
 * Every exported function takes `locale` last (default `'en'`) so callers that
 * predate localisation keep compiling. When `locale === 'de'` we return the
 * German phrase, preserving the simple/technical distinction.
 *
 * Keep the maps flat (string keys) so adding a new surface is a single entry;
 * callers pass `(key, language, locale)` and get the copy. Unknown keys return
 * the key itself so missing entries fall back safely rather than rendering blank.
 */
import type { CoachLanguage } from '../contexts/LanguageContext'
import type { Locale } from '../i18n/strings'

type Pair = Record<CoachLanguage, string>

const PHRASES_EN: Record<string, Pair> = {
  // ─── CoachBrief footers ──────────────────────────────────────────────
  'brief.frameworksHeading': {
    simple:    'Grounded in sports science',
    technical: 'Grounded in',
  },
  'brief.whyThisWorkoutHeading': {
    simple:    'Why today',
    technical: 'Why this workout',
  },

  // ─── PrescribedWorkoutCard eyebrows ──────────────────────────────────
  'workoutCard.todayEyebrow': {
    simple:    'Today · do this',
    technical: 'Today · prescribed',
  },
  'workoutCard.alternateEyebrow': {
    simple:    'Different option',
    technical: 'Alternate',
  },
  'workoutCard.alternatesHeading': {
    simple:    'Not feeling it?',
    technical: "If today's not that day",
  },
  'workoutCard.startCta': {
    simple:    'Start ride',
    technical: 'Start workout',
  },

  // ─── Interval block names (simple adds a feel hint) ─────────────────
  'block.warmup': {
    simple:    'Warm up · Keep it easy',
    technical: 'Warm-up',
  },
  'block.cooldown': {
    simple:    'Cool down · Easy spin',
    technical: 'Cool-down',
  },
  'block.main': {
    simple:    'Main · The effort',
    technical: 'Main',
  },
  'block.recovery': {
    simple:    'Rest · Catch your breath',
    technical: 'Recovery',
  },

  // ─── KPI strip tooltips ──────────────────────────────────────────────
  'kpi.hrv.tooltip': {
    simple:    'How recovered you feel (higher = better)',
    technical: 'HRV 7d mean vs 28d baseline',
  },
  'kpi.bodyBatt.tooltip': {
    simple:    'How much energy your body has (higher = better)',
    technical: 'Body battery 7d mean vs 28d baseline',
  },
  'kpi.sleep.tooltip': {
    simple:    'How well you slept (higher = better)',
    technical: 'Sleep score 7d mean vs 28d baseline',
  },
  'kpi.tsb.tooltip': {
    simple:    'How fresh your legs are (+ fresh, − tired)',
    technical: 'TSB = CTL − ATL · Banister form',
  },
  'kpi.ctl.tooltip': {
    simple:    'Your overall fitness (higher = fitter)',
    technical: 'CTL · 42-day fitness EWMA',
  },
  'kpi.rhr.tooltip': {
    simple:    'Heart rate at rest (lower = more recovered)',
    technical: 'rHR 7d mean vs 28d baseline',
  },

  // ─── WhyAmITired cause-label overrides (simple mode) ────────────────
  // The backend emits technical-sounding labels. We keep them verbatim in
  // technical mode and rewrite to plain English in simple mode.
  'cause.label.HRV suppressed': {
    simple:    'Your body is recovering slower',
    technical: 'HRV suppressed',
  },
  'cause.label.Resting HR elevated': {
    simple:    'Your resting heart rate is up',
    technical: 'Resting HR elevated',
  },
  'cause.label.Sleep debt accumulated': {
    simple:    "Your sleep's been short",
    technical: 'Sleep debt accumulated',
  },
  'cause.label.Overreach (TSB deep-negative)': {
    simple:    "You're in the hole — too much training",
    technical: 'Overreach (TSB deep-negative)',
  },
  'cause.label.Carrying productive fatigue': {
    simple:    "You've been training hard — tired is normal",
    technical: 'Carrying productive fatigue',
  },
  'cause.label.Grey-zone creep': {
    simple:    "You've been riding the middle too much",
    technical: 'Grey-zone creep',
  },

  // ─── TransparencyDrawer intro line ──────────────────────────────────
  'transparency.intro': {
    simple:    'This is the stuff the coach looked at. Numbers and nerd details.',
    technical: (
      'Every recommendation above is grounded in the data below. This is the ' +
      'exact snapshot and system prompt the coach used — you can audit it, ' +
      'copy it, or use it to challenge a recommendation.'
    ),
  },
}

const PHRASES_DE: Record<string, Pair> = {
  // ─── CoachBrief footers ──────────────────────────────────────────────
  'brief.frameworksHeading': {
    simple:    'Auf Sportwissenschaft gestützt',
    technical: 'Gestützt auf',
  },
  'brief.whyThisWorkoutHeading': {
    simple:    'Warum heute',
    technical: 'Warum dieses Training',
  },

  // ─── PrescribedWorkoutCard eyebrows ──────────────────────────────────
  'workoutCard.todayEyebrow': {
    simple:    'Heute · das machen',
    technical: 'Heute · verordnet',
  },
  'workoutCard.alternateEyebrow': {
    simple:    'Andere Option',
    technical: 'Alternative',
  },
  'workoutCard.alternatesHeading': {
    simple:    'Kein Bock?',
    technical: 'Wenn heute nicht dein Tag ist',
  },
  'workoutCard.startCta': {
    simple:    'Training starten',
    technical: 'Training starten',
  },

  // ─── Interval block names (simple adds a feel hint) ─────────────────
  'block.warmup': {
    simple:    'Aufwärmen · Locker bleiben',
    technical: 'Aufwärmen',
  },
  'block.cooldown': {
    simple:    'Ausfahren · Locker drehen',
    technical: 'Ausfahren',
  },
  'block.main': {
    simple:    'Hauptteil · Der Aufwand',
    technical: 'Hauptteil',
  },
  'block.recovery': {
    simple:    'Pause · Durchatmen',
    technical: 'Erholung',
  },

  // ─── KPI strip tooltips ──────────────────────────────────────────────
  'kpi.hrv.tooltip': {
    simple:    'Wie erholt du dich fühlst (höher = besser)',
    technical: 'HRV 7-Tage-Mittel vs. 28-Tage-Basis',
  },
  'kpi.bodyBatt.tooltip': {
    simple:    'Wie viel Energie dein Körper hat (höher = besser)',
    technical: 'Body Battery 7-Tage-Mittel vs. 28-Tage-Basis',
  },
  'kpi.sleep.tooltip': {
    simple:    'Wie gut du geschlafen hast (höher = besser)',
    technical: 'Schlaf-Score 7-Tage-Mittel vs. 28-Tage-Basis',
  },
  'kpi.tsb.tooltip': {
    simple:    'Wie frisch deine Beine sind (+ frisch, − müde)',
    technical: 'TSB = CTL − ATL · Banister-Form',
  },
  'kpi.ctl.tooltip': {
    simple:    'Deine Gesamtfitness (höher = fitter)',
    technical: 'CTL · 42-Tage-Fitness-EWMA',
  },
  'kpi.rhr.tooltip': {
    simple:    'Ruhepuls (niedriger = erholter)',
    technical: 'Ruhepuls 7-Tage-Mittel vs. 28-Tage-Basis',
  },

  // ─── WhyAmITired cause-label overrides ──────────────────────────────
  'cause.label.HRV suppressed': {
    simple:    'Dein Körper erholt sich langsamer',
    technical: 'HRV unterdrückt',
  },
  'cause.label.Resting HR elevated': {
    simple:    'Dein Ruhepuls ist erhöht',
    technical: 'Ruhepuls erhöht',
  },
  'cause.label.Sleep debt accumulated': {
    simple:    'Dein Schlaf war zu kurz',
    technical: 'Schlafdefizit angesammelt',
  },
  'cause.label.Overreach (TSB deep-negative)': {
    simple:    'Du steckst im Loch — zu viel Training',
    technical: 'Überlastung (TSB stark negativ)',
  },
  'cause.label.Carrying productive fatigue': {
    simple:    'Du trainierst hart — müde ist normal',
    technical: 'Produktive Ermüdung',
  },
  'cause.label.Grey-zone creep': {
    simple:    'Du fährst zu oft im Mittelbereich',
    technical: 'Grauzonen-Schleichgang',
  },

  // ─── TransparencyDrawer intro line ──────────────────────────────────
  'transparency.intro': {
    simple:    'Das ist der Kram, den der Coach angeschaut hat. Zahlen und Nerd-Details.',
    technical: (
      'Jede Empfehlung oben stützt sich auf die Daten unten. Das ist genau der ' +
      'Snapshot und der System-Prompt, den der Coach genutzt hat — du kannst ihn ' +
      'prüfen, kopieren oder eine Empfehlung damit hinterfragen.'
    ),
  },
}

const PHRASES_BY_LOCALE: Record<Locale, Record<string, Pair>> = {
  en: PHRASES_EN,
  de: PHRASES_DE,
}

/**
 * Returns the string for `key` in the requested `language` and `locale`. If the
 * key isn't in the map (programmer error or a newly-added surface that hasn't
 * been translated yet), we fall back to the key itself so the user sees *some*
 * signal instead of a blank label.
 */
export function translateCoach(
  key: string,
  language: CoachLanguage,
  locale: Locale = 'en',
): string {
  const map = PHRASES_BY_LOCALE[locale] ?? PHRASES_EN
  const pair = map[key] ?? PHRASES_EN[key]
  if (!pair) return key
  return pair[language]
}


// ─── Template category → simple-mode title ───────────────────────────────
//
// The backend returns a technical title ("Z2 endurance 60min @ 65% FTP") on
// every brief regardless of language because `template.name` is static.
// In simple mode the backend already overrides the rule-based fallback
// title, but the LLM path occasionally lets jargon slip through — this
// map is the final client-side guard. It also powers the
// PrescribedWorkoutCard when we want to force-simplify a title without
// round-tripping to the server.

type TemplateCategory =
  | 'recovery'
  | 'endurance'
  | 'tempo'
  | 'sweet_spot'
  | 'threshold'
  | 'vo2'
  | 'anaerobic'
  | 'rest'
  | string   // backend may add new categories over time — stay forgiving

const SIMPLE_TITLE_BY_CATEGORY_EN: Record<string, string> = {
  recovery:   'Easy spin',
  endurance:  'Chill ride',
  tempo:      'Steady push',
  sweet_spot: 'Focused effort',
  threshold:  'Hard ride',
  vo2:        'Hard intervals',
  anaerobic:  'Sprint day',
  rest:       'Rest day',
}

const SIMPLE_TITLE_BY_CATEGORY_DE: Record<string, string> = {
  recovery:   'Locker drehen',
  endurance:  'Lockere Fahrt',
  tempo:      'Gleichmäßig drücken',
  sweet_spot: 'Fokussierter Aufwand',
  threshold:  'Harte Fahrt',
  vo2:        'Harte Intervalle',
  anaerobic:  'Sprint-Tag',
  rest:       'Ruhetag',
}

const SIMPLE_TITLE_BY_LOCALE: Record<Locale, Record<string, string>> = {
  en: SIMPLE_TITLE_BY_CATEGORY_EN,
  de: SIMPLE_TITLE_BY_CATEGORY_DE,
}

/**
 * For a given template category, return the simple-mode title. Falls back to
 * the provided `fallback` (the backend-supplied title) if the category is
 * unknown — better than a generic "Ride today" when we don't recognise it.
 */
export function simpleTitleFor(
  category: TemplateCategory | null | undefined,
  fallback: string,
  locale: Locale = 'en',
): string {
  if (!category) return fallback
  const map = SIMPLE_TITLE_BY_LOCALE[locale] ?? SIMPLE_TITLE_BY_CATEGORY_EN
  return map[category] ?? fallback
}


// ─── Phase 5.3 — post-ride review grade labels ───────────────────────────
//
// The grade pill on PostRideReview uses different text in simple vs technical
// mode. Technical keeps the raw grade; simple softens "okay" into "Good effort"
// and "overcooked"/"undercooked" into less clinical phrasing.

type Grade = 'perfect' | 'strong' | 'okay' | 'overcooked' | 'undercooked'

const GRADE_LABEL_SIMPLE_EN: Record<Grade, string> = {
  perfect:     'Perfect',
  strong:      'Strong',
  okay:        'Good effort',
  overcooked:  'Too much',
  undercooked: 'A bit short',
}

const GRADE_LABEL_TECHNICAL_EN: Record<Grade, string> = {
  perfect:     'Perfect',
  strong:      'Strong',
  okay:        'Okay',
  overcooked:  'Overcooked',
  undercooked: 'Undercooked',
}

const GRADE_LABEL_SIMPLE_DE: Record<Grade, string> = {
  perfect:     'Perfekt',
  strong:      'Stark',
  okay:        'Guter Einsatz',
  overcooked:  'Zu viel',
  undercooked: 'Etwas kurz',
}

const GRADE_LABEL_TECHNICAL_DE: Record<Grade, string> = {
  perfect:     'Perfekt',
  strong:      'Stark',
  okay:        'Okay',
  overcooked:  'Übertrieben',
  undercooked: 'Zu wenig',
}

/**
 * Grade pill display label — simple-mode softens okay / overcooked /
 * undercooked; technical preserves the raw grade.
 */
export function gradeLabel(
  grade: Grade,
  language: CoachLanguage,
  locale: Locale = 'en',
): string {
  if (locale === 'de') {
    return language === 'simple'
      ? GRADE_LABEL_SIMPLE_DE[grade]
      : GRADE_LABEL_TECHNICAL_DE[grade]
  }
  return language === 'simple'
    ? GRADE_LABEL_SIMPLE_EN[grade]
    : GRADE_LABEL_TECHNICAL_EN[grade]
}


// ─── Phase 5.3 — compliance direction phrases ───────────────────────────

type ComplianceBand = 'match' | 'over' | 'under'

/**
 * Simple-mode phrase for one compliance axis. `overLabel` customises the
 * "what went over" — e.g. "longer than planned" for duration, "harder than
 * planned" for TSS. The caller passes an already-localised `overLabel`.
 * Match + under have stable phrasings per locale.
 */
export function complianceDirectionText(
  band: ComplianceBand,
  overLabel: string,
  locale: Locale = 'en',
): string {
  if (locale === 'de') {
    if (band === 'match') return 'Genau im Ziel'
    if (band === 'over') return `Etwas ${overLabel}`
    return 'Etwas leichter als geplant'
  }
  if (band === 'match') return 'Right on target'
  if (band === 'over') return `A bit ${overLabel}`
  return 'A bit lighter than planned'
}


// ─── P1-7 — simple-mode workout names ────────────────────────────────────
//
// Template titles arrive shaped like 'Hill VO2 — 6×3min @ 115% FTP' or
// 'Z2 endurance 60min @ 65% FTP'. In simple mode those become an invitation
// instead of a wall: 'Berg-Intervalle · 6×3 Min sehr hart' / 'Hill
// intervals · 6×3 min very hard'. Technical mode never calls this —
// callers keep the raw title there.

/**
 * Intensity adjective from %FTP bands (audit P1-7):
 *   <75 locker/easy · 75–90 zügig/steady · 90–105 hart/hard · >105 sehr hart/very hard
 */
export function intensityAdjective(pctFtp: number, locale: Locale = 'en'): string {
  const de = locale === 'de'
  if (pctFtp < 75) return de ? 'locker' : 'easy'
  if (pctFtp < 90) return de ? 'zügig' : 'steady'
  if (pctFtp <= 105) return de ? 'hart' : 'hard'
  return de ? 'sehr hart' : 'very hard'
}

// Keyword → simple base name. Checked in order; first hit wins. Each entry
// can differ between interval titles (N×M) and single-block rides.
const NAME_RULES: Array<{
  re: RegExp
  intervals: { en: string; de: string }
  single: { en: string; de: string }
}> = [
  {
    re: /hill|berg|climb/i,
    intervals: { en: 'Hill intervals', de: 'Berg-Intervalle' },
    single: { en: 'Hill ride', de: 'Bergfahrt' },
  },
  {
    re: /sprint|anaerobic|neuromuscular/i,
    intervals: { en: 'Sprints', de: 'Sprints' },
    single: { en: 'Sprint day', de: 'Sprint-Tag' },
  },
  {
    re: /vo2|vo₂/i,
    intervals: { en: 'Hard intervals', de: 'Harte Intervalle' },
    single: { en: 'Hard ride', de: 'Harte Fahrt' },
  },
  {
    re: /sweet\s*spot/i,
    intervals: { en: 'Focused effort', de: 'Fokussierter Aufwand' },
    single: { en: 'Focused effort', de: 'Fokussierter Aufwand' },
  },
  {
    re: /threshold|schwelle|\bftp\s+(interval|test)/i,
    intervals: { en: 'Hard intervals', de: 'Harte Intervalle' },
    single: { en: 'Hard ride', de: 'Harte Fahrt' },
  },
  {
    re: /tempo/i,
    intervals: { en: 'Steady push', de: 'Gleichmäßig drücken' },
    single: { en: 'Steady push', de: 'Gleichmäßig drücken' },
  },
  {
    re: /endurance|\bz2\b|grundlage|\bbase\b/i,
    intervals: { en: 'Chill ride', de: 'Lockere Fahrt' },
    single: { en: 'Chill ride', de: 'Lockere Fahrt' },
  },
  {
    re: /recovery|regeneration|\bz1\b/i,
    intervals: { en: 'Easy spin', de: 'Locker drehen' },
    single: { en: 'Easy spin', de: 'Locker drehen' },
  },
]

/**
 * Render a simple-mode variant of a technical workout title.
 *
 * Parses the common template shapes:
 *   - 'Hill VO2 — 6×3min @ 115% FTP'  → 'Berg-Intervalle · 6×3 Min sehr hart'
 *   - 'Z2 endurance 60min @ 65% FTP'  → 'Lockere Fahrt · 60 Min locker'
 * Unknown shapes fall back to the original title — never a blank label.
 */
export function simpleWorkoutName(title: string, locale: Locale = 'en'): string {
  if (!title || !title.trim()) return title
  const de = locale === 'de'

  // Structure: repeats ('6×3min' / '6x3 min') and/or a single duration.
  const repeats = title.match(/(\d+)\s*[×x]\s*(\d+)\s*(?:min|m\b)/i)
  const secRepeats = repeats ? null : title.match(/(\d+)\s*[×x]\s*(\d+)\s*(?:sec|s\b)/i)
  const single = repeats || secRepeats ? null : title.match(/(\d+)\s*min\b/i)
  const pct = title.match(/@\s*(\d+(?:[.,]\d+)?)\s*%\s*FTP/i)

  const rule = NAME_RULES.find((r) => r.re.test(title))
  const hasIntervals = repeats != null || secRepeats != null

  // Nothing recognisable — keep the backend title rather than inventing one.
  if (!rule && !hasIntervals && !single) return title

  const name = rule
    ? (hasIntervals ? rule.intervals : rule.single)[de ? 'de' : 'en']
    : hasIntervals
      ? de ? 'Intervalle' : 'Intervals'
      : de ? 'Fahrt' : 'Ride'

  const adj = pct ? intensityAdjective(parseFloat(pct[1].replace(',', '.')), locale) : null

  let structure: string | null = null
  if (repeats) {
    structure = `${repeats[1]}×${repeats[2]} ${de ? 'Min' : 'min'}`
  } else if (secRepeats) {
    structure = `${secRepeats[1]}×${secRepeats[2]} ${de ? 'Sek' : 'sec'}`
  } else if (single) {
    structure = `${single[1]} ${de ? 'Min' : 'min'}`
  }

  const tail = [structure, adj].filter(Boolean).join(' ')
  return tail ? `${name} · ${tail}` : name
}
