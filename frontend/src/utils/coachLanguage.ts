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
 * Keep the map flat (string keys) so adding a new surface is a single entry;
 * callers pass `(key, language)` and get the copy. Unknown keys return the
 * key itself so missing entries fall back safely rather than rendering blank.
 */
import type { CoachLanguage } from '../contexts/LanguageContext'

type Pair = Record<CoachLanguage, string>

const PHRASES: Record<string, Pair> = {
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

/**
 * Returns the string for `key` in the requested `language`. If the key isn't
 * in the map (programmer error or a newly-added surface that hasn't been
 * translated yet), we fall back to the key itself so the user sees *some*
 * signal instead of a blank label.
 */
export function translateCoach(key: string, language: CoachLanguage): string {
  const pair = PHRASES[key]
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

const SIMPLE_TITLE_BY_CATEGORY: Record<string, string> = {
  recovery:   'Easy spin',
  endurance:  'Chill ride',
  tempo:      'Steady push',
  sweet_spot: 'Focused effort',
  threshold:  'Hard ride',
  vo2:        'Hard intervals',
  anaerobic:  'Sprint day',
  rest:       'Rest day',
}

/**
 * For a given template category, return the simple-mode title. Falls back to
 * the provided `fallback` (the backend-supplied title) if the category is
 * unknown — better than a generic "Ride today" when we don't recognise it.
 */
export function simpleTitleFor(
  category: TemplateCategory | null | undefined,
  fallback: string,
): string {
  if (!category) return fallback
  return SIMPLE_TITLE_BY_CATEGORY[category] ?? fallback
}


// ─── Phase 5.3 — post-ride review grade labels ───────────────────────────
//
// The grade pill on PostRideReview uses different text in simple vs technical
// mode. Technical keeps the raw grade; simple softens "okay" into "Good effort"
// and "overcooked"/"undercooked" into less clinical phrasing.

type Grade = 'perfect' | 'strong' | 'okay' | 'overcooked' | 'undercooked'

const GRADE_LABEL_SIMPLE: Record<Grade, string> = {
  perfect:     'Perfect',
  strong:      'Strong',
  okay:        'Good effort',
  overcooked:  'Too much',
  undercooked: 'A bit short',
}

const GRADE_LABEL_TECHNICAL: Record<Grade, string> = {
  perfect:     'Perfect',
  strong:      'Strong',
  okay:        'Okay',
  overcooked:  'Overcooked',
  undercooked: 'Undercooked',
}

/**
 * Grade pill display label — simple-mode softens okay / overcooked /
 * undercooked; technical preserves the raw grade.
 */
export function gradeLabel(grade: Grade, language: CoachLanguage): string {
  return language === 'simple'
    ? GRADE_LABEL_SIMPLE[grade]
    : GRADE_LABEL_TECHNICAL[grade]
}


// ─── Phase 5.3 — compliance direction phrases ───────────────────────────

type ComplianceBand = 'match' | 'over' | 'under'

/**
 * Simple-mode phrase for one compliance axis. `overLabel` customises the
 * "what went over" — e.g. "longer than planned" for duration, "harder than
 * planned" for TSS. Match + under have stable phrasings.
 */
export function complianceDirectionText(
  band: ComplianceBand,
  overLabel: string,
): string {
  if (band === 'match') return 'Right on target'
  if (band === 'over') return `A bit ${overLabel}`
  return 'A bit lighter than planned'
}
