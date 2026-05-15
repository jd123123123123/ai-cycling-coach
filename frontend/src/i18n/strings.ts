/**
 * Static UI-string dictionary for the dashboard chrome. AI-generated prose
 * (brief.verdict, rationale, tomorrow_plan.description, etc.) still comes
 * from the backend in whatever language the LLM was told to write in —
 * extending the brief prompt with a `locale` field is the natural next
 * step, but this file covers all the fixed eyebrows, button labels, stat
 * names, and short copy in the new dashboard surfaces.
 */

export type Locale = 'en' | 'de'

type StringSet = Record<Locale, string>

export const STRINGS = {
  // Generic
  start_ride: { en: 'Start ride', de: 'Training starten' },
  preparing_zwo: { en: 'Preparing .zwo…', de: '.zwo wird vorbereitet…' },
  cant_train_today: { en: "Can't train today?", de: 'Heute kein Training?' },
  nice: { en: 'Nice', de: 'Stark' },
  close: { en: 'Close', de: 'Schließen' },
  duration: { en: 'Duration', de: 'Dauer' },
  target_tss: { en: 'Target TSS', de: 'Ziel-TSS' },
  more_to_chase: { en: 'more to chase', de: 'noch zu holen' },
  unlocked: { en: 'unlocked', de: 'freigeschaltet' },

  // TodayHero
  recovery_label: { en: 'RECOVERY', de: 'ERHOLUNG' },
  why_label: { en: 'WHY', de: 'WARUM' },
  sleep_label: { en: 'SLEEP', de: 'SCHLAF' },
  strain_week_label: { en: 'STRAIN · WEEK', de: 'BELASTUNG · WOCHE' },
  as_of: { en: 'AS OF', de: 'STAND' },
  days_to: { en: 'D TO', de: 'T BIS' },

  // MorningCheckin
  morning_checkin_prompt: { en: 'How does today feel?', de: 'Wie fühlst du dich heute?' },
  feeling_great: { en: 'Great', de: 'Super' },
  feeling_ok: { en: 'OK', de: 'OK' },
  feeling_tired: { en: 'Tired', de: 'Müde' },

  // MorningRecap pieces
  yesterday_missed: { en: 'YESTERDAY · MISSED', de: 'GESTERN · VERPASST' },
  tss_planned: { en: 'TSS planned', de: 'TSS geplant' },
  recovery_yesterday: { en: 'RECOVERY · YESTERDAY', de: 'ERHOLUNG · GESTERN' },

  // TomorrowCard
  tomorrow_label: { en: 'TOMORROW', de: 'MORGEN' },
  projected: { en: 'PROJECTED', de: 'PROGNOSE' },

  // PMC compact
  training_state_90d: { en: 'Training state · 90 days', de: 'Trainingszustand · 90 Tage' },
  fitness_label: { en: 'FITNESS', de: 'FITNESS' },
  fatigue_label: { en: 'FATIGUE', de: 'ERMÜDUNG' },
  form_label: { en: 'FORM', de: 'FORM' },

  // SeasonStats
  year_to_date: { en: 'YEAR TO DATE', de: 'JAHR BIS DATUM' },
  hours_label: { en: 'HOURS', de: 'STUNDEN' },
  distance_label: { en: 'DISTANCE', de: 'DISTANZ' },
  sessions_label: { en: 'SESSIONS', de: 'EINHEITEN' },
  tss_label: { en: 'TSS', de: 'TSS' },
  this_month_suffix: { en: 'this month', de: 'diesen Monat' },
  sessions_this_month_suffix: {
    en: 'SESSIONS',
    de: 'EINHEITEN',
  },

  // MomentumChips
  logged_streak: { en: 'd logged streak', de: '-Tage-Logging-Streak' },

  // AchievementBadges
  badges_eyebrow: { en: 'BADGES', de: 'ABZEICHEN' },
  new_badge: { en: 'NEW BADGE', de: 'NEUES ABZEICHEN' },
  new_chip: { en: 'NEW', de: 'NEU' },

  // DidYouKnow
  did_you_know: { en: 'DID YOU KNOW', de: 'WUSSTEST DU' },

  // PatternInsight
  pattern_spotted: { en: 'PATTERN SPOTTED', de: 'MUSTER ERKANNT' },

  // SkipTodayDialog
  if_you_skip_today: { en: 'IF YOU SKIP TODAY', de: 'WENN DU HEUTE AUSSETZT' },
  heres_what_changes: { en: "Here's what changes.", de: 'Das ändert sich.' },
  today_label: { en: 'TODAY', de: 'HEUTE' },
  form_tsb_label: { en: 'FORM · TSB', de: 'FORM · TSB' },
  fatigue_atl_label: { en: 'FATIGUE · ATL', de: 'ERMÜDUNG · ATL' },
  fitness_ctl_label: { en: 'FITNESS · CTL', de: 'FITNESS · CTL' },
  tomorrow_lowercase: { en: 'tomorrow', de: 'morgen' },
  never_mind: { en: "Never mind, I'm doing it", de: 'Doch — ich mach es' },
  skip_today: { en: 'Skip today', de: 'Heute aussetzen' },
  got_it_easy_day: { en: 'Got it — easy day', de: 'Verstanden — Ruhetag' },

  // Tab labels
  tab_today: { en: 'Today', de: 'Heute' },
  tab_train: { en: 'Train', de: 'Training' },
  tab_trends: { en: 'Trends', de: 'Trends' },
  tab_crew: { en: 'Crew', de: 'Crew' },

  // PMCChart
  training_load_90d: { en: 'Training load · 90 days', de: 'Trainingslast · 90 Tage' },
  fitness_fatigue_form: { en: 'Fitness, fatigue, form', de: 'Fitness, Ermüdung, Form' },
  fitness_ctl: { en: 'Fitness · CTL', de: 'Fitness · CTL' },
  fatigue_atl: { en: 'Fatigue · ATL', de: 'Ermüdung · ATL' },
  form_tsb: { en: 'Form · TSB', de: 'Form · TSB' },

  // ComplianceStrip grade prose
  grade_a_note: {
    en: 'Plan nailed. This is how fitness compounds.',
    de: 'Plan voll umgesetzt. Genau so baust du Fitness auf.',
  },
  grade_b_note: {
    en: 'Close — minor drift, still productive.',
    de: 'Knapp dran — kleine Abweichung, trotzdem produktiv.',
  },
  grade_big_miss_note: {
    en: 'Big miss. Either the plan was too ambitious or life got in the way.',
    de: 'Großer Ausfall. Entweder war der Plan zu ehrgeizig oder das Leben kam dazwischen.',
  },
  grade_over_note: {
    en: 'Overdelivering. Good effort — just watch the fatigue side of the ledger.',
    de: 'Über dem Plan. Starker Einsatz — aber pass auf die Ermüdung auf.',
  },
  grade_mixed_note: {
    en: 'Mixed week — a few days off target.',
    de: 'Gemischte Woche — ein paar Tage neben dem Ziel.',
  },

  // CoachBrief
  coach_brief_today: { en: 'Coach brief · today', de: 'Coach-Brief · heute' },
  ai_offline_chip: { en: 'AI offline · rule-based', de: 'KI offline · regelbasiert' },
  cached_chip: { en: 'cached', de: 'gespeichert' },
  why_this: { en: 'Why this?', de: 'Warum das?' },
  refresh: { en: 'Refresh', de: 'Aktualisieren' },
  sources_link: { en: 'sources', de: 'Quellen' },

  // Tomorrow & recovery section + Deep dive
  tomorrow_recovery_section: { en: 'Tomorrow & recovery', de: 'Morgen & Erholung' },
  deep_dive: { en: 'Deep dive', de: 'Details' },

  // Other section titles
  full_plan: { en: 'Full plan', de: 'Gesamtplan' },
  this_week: { en: 'This week', de: 'Diese Woche' },
} as const satisfies Record<string, StringSet>

export type StringKey = keyof typeof STRINGS

export function tFor(locale: Locale, key: StringKey): string {
  return STRINGS[key][locale] ?? STRINGS[key].en
}
