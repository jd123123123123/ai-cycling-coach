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
  customize: { en: 'Customize', de: 'Anpassen' },
  customize_done: { en: 'Done', de: 'Fertig' },
  customize_reset: { en: 'Reset to default', de: 'Zurücksetzen' },
  customize_hint: { en: 'Drag to reorder · tap the eye to hide', de: 'Ziehen zum Sortieren · Auge zum Ausblenden' },
  card_hidden: { en: 'Hidden', de: 'Ausgeblendet' },
  start_ride: { en: 'Start ride', de: 'Training starten' },
  preparing_zwo: { en: 'Preparing .zwo…', de: '.zwo wird vorbereitet…' },
  cant_train_today: { en: "Can't train today?", de: 'Heute kein Training?' },
  nice: { en: 'Nice', de: 'Stark' },
  close: { en: 'Close', de: 'Schließen' },
  duration: { en: 'Duration', de: 'Dauer' },
  target_tss: { en: 'Target TSS', de: 'Ziel-TSS' },
  more_to_chase: { en: 'more to chase', de: 'noch zu holen' },
  unlocked: { en: 'unlocked', de: 'freigeschaltet' },
  // Chrome sweep (audit P1-6): nav_progress is consumed by the bottom-nav
  // chrome (MobileBottomNav currently hardcodes de:'Progress'); add_action is
  // the "+ Add" button word; best_label prefixes PR times ("Best 52 min" →
  // "Bestwert 52 Min").
  nav_progress: { en: 'Progress', de: 'Fortschritt' },
  add_action: { en: 'Add', de: 'Hinzufügen' },
  best_label: { en: 'Best', de: 'Bestwert' },

  // TodayHero
  recovery_label: { en: 'RECOVERY', de: 'ERHOLUNG' },
  why_label: { en: 'WHY', de: 'WARUM' },
  sleep_label: { en: 'SLEEP', de: 'SCHLAF' },
  strain_week_label: { en: 'STRAIN · WEEK', de: 'BELASTUNG · WOCHE' },
  as_of: { en: 'AS OF', de: 'STAND' },
  days_to: { en: 'D TO', de: 'T BIS' },
  morning_read: { en: 'Morning read', de: 'Morgenlage' },

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
  tab_plan: { en: 'Plan', de: 'Plan' },
  tab_trends: { en: 'Trends', de: 'Trends' },
  tab_crew: { en: 'Crew', de: 'Crew' },
  tab_report: { en: 'Report', de: 'Report' },
  tab_analyze: { en: 'Analyze', de: 'Analyse' },
  tab_social: { en: 'Social', de: 'Social' },
  analyze_charts: { en: 'Detailed charts', de: 'Detaillierte Charts' },
  analyze_overview: { en: 'Overview', de: 'Übersicht' },
  analyze_report: { en: 'Report', de: 'Report' },
  analyze_workspace: { en: 'Workspace', de: 'Workspace' },

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

  // SyncButton — tone labels + relative ages
  sync_just_now: { en: 'just now', de: 'gerade eben' },
  sync_min_ago: { en: 'min ago', de: 'Min.' },
  sync_h_ago: { en: 'h ago', de: 'Std.' },
  sync_d_ago: { en: 'd ago', de: 'T.' },
  sync_label_synced: { en: 'Synced', de: 'Synchronisiert' },
  sync_label_syncing: { en: 'Syncing…', de: 'Synchronisiere…' },
  sync_label_failed: { en: 'Sync failed', de: 'Sync fehlgeschlagen' },
  sync_label_not_connected: { en: 'Not connected', de: 'Nicht verbunden' },

  // StreakStrip
  streak_goal_train: { en: 'TRAIN', de: 'TRAINING' },
  streak_goal_checkin: { en: 'CHECK IN', de: 'CHECK-IN' },
  streak_goal_recover: { en: 'RECOVER', de: 'ERHOLEN' },

  // WeeklyChallenge
  week_in_motion: { en: 'Your week is in motion.', de: 'Deine Woche läuft.' },
  tss_to_close_ring: { en: 'TSS to close the ring', de: 'TSS bis der Ring schließt' },

  // Crew tab — empty state
  start_your_squad_cup: { en: 'Start your Squad Cup', de: 'Starte deinen Squad Cup' },
  riders_go_further: { en: 'Riders go further in a pack.', de: 'Im Rudel kommst du weiter.' },
  squad_cup_pitch: {
    en: "Spin up a 7-day TSS competition with up to 7 training partners. Points compound as the week goes on; the leader at Sunday midnight takes the cup. The mechanic stays simple — no kudos, no comments, just a shared bar nobody wants to drop under.",
    de: 'Starte einen 7-Tage-TSS-Wettkampf mit bis zu 7 Trainingspartnern. Punkte summieren sich über die Woche; wer am Sonntagabend führt, gewinnt den Cup. Bewusst minimalistisch — keine Kudos, keine Kommentare, nur eine gemeinsame Latte, unter die niemand fallen will.',
  },
  crew_name_placeholder: {
    en: "Name your crew (e.g. 'Maratona Squad')",
    de: "Crew-Name (z. B. 'Maratona Squad')",
  },
  create_crew: { en: 'Create crew', de: 'Crew erstellen' },
  creating: { en: 'Creating…', de: 'Wird erstellt…' },
  create_crew_error: {
    en: "Couldn't create the crew — try again, or refresh the page.",
    de: 'Konnte die Crew nicht anlegen — versuche es erneut oder lade die Seite neu.',
  },
  solo_laps_copy: {
    en: 'Solo laps are training. Racing friends is compounding interest.',
    de: 'Allein zu fahren ist Training. Mit Freunden zu fahren ist Zinseszins.',
  },
  consistency_24x: {
    en: 'Athletes with 3+ accountability partners stay consistent 2.4× longer.',
    de: 'Athleten mit 3+ Accountability-Partnern bleiben 2,4× länger konsistent.',
  },
  squad_cup_this_week: { en: 'Squad Cup · this week', de: 'Squad Cup · diese Woche' },
  points_label: { en: 'POINTS', de: 'PUNKTE' },
  rank_label: { en: 'RANK', de: 'RANG' },
  of_label: { en: 'OF', de: 'VON' },
  share_invite_link: { en: 'Share invite link', de: 'Einladungslink teilen' },

  // MorningCheckin celebration prose
  feeling_great_followup: {
    en: 'Feeling strong. This is the fitness your last hard block earned — cash it in.',
    de: 'Fühl dich stark. Das ist die Fitness, die du dir mit dem letzten Block erarbeitet hast — hol sie raus.',
  },
  feeling_ok_followup: {
    en: 'Steady. The riders who stack steady days are the ones who peak on demand.',
    de: 'Solide. Wer regelmäßig ruhig stark fährt, hat am Renntag die Spitze parat.',
  },
  feeling_tired_followup: {
    en: 'Tired is data. One easy day here saves two forced rest days later.',
    de: 'Müde ist ein Signal. Ein lockerer Tag jetzt erspart zwei erzwungene Ruhetage später.',
  },
  logged_chip: { en: 'Logged', de: 'Erfasst' },

  // PrescribedWorkoutCard — category labels (chips next to the title)
  cat_recovery: { en: 'Recovery', de: 'Erholung' },
  cat_endurance: { en: 'Endurance', de: 'Ausdauer' },
  cat_tempo: { en: 'Tempo', de: 'Tempo' },
  cat_sweet_spot: { en: 'Sweet Spot', de: 'Sweet Spot' },
  cat_threshold: { en: 'Threshold', de: 'Schwelle' },
  cat_vo2: { en: 'VO₂max', de: 'VO₂max' },
  cat_anaerobic: { en: 'Anaerobic', de: 'Anaerob' },
  cat_rest: { en: 'Rest', de: 'Ruhetag' },
  workout_structure_eyebrow: { en: 'WORKOUT STRUCTURE', de: 'TRAININGSAUFBAU' },
  alternates_heading_de_fallback: { en: 'Alternates', de: 'Alternativen' },
  push_to_garmin_soon: { en: 'Coming soon — push workout to Garmin', de: 'Demnächst — Workout an Garmin senden' },
  replan_tomorrow_soon: { en: 'Coming soon — re-plan from tomorrow', de: 'Demnächst — ab Morgen neu planen' },

  // DayPlanCard side-sheet
  target_tss_eyebrow: { en: 'TARGET TSS', de: 'ZIEL-TSS' },
  activity_eyebrow: { en: 'ACTIVITY', de: 'AKTIVITÄT' },
  untitled_activity: { en: 'Untitled activity', de: 'Aktivität ohne Titel' },
  no_activity_logged: { en: 'No activity logged.', de: 'Keine Aktivität erfasst.' },

  // PostRideReview — top-level labels (the grade pill text + headline come
  // from the AI/eval payload — translated server-side once the brief LLM
  // sees locale=de; these are the surrounding chrome labels only).
  todays_ride_eyebrow: { en: "TODAY'S RIDE", de: 'HEUTIGES TRAINING' },
  todays_sessions_eyebrow: { en: "Today's sessions", de: 'Heutige Einheiten' },
  today_you_trained_eyebrow: { en: 'Today · you trained', de: 'Heute · trainiert' },
  tomorrow_setup_label: { en: 'Tomorrow setup', de: 'Morgen-Plan' },
  tomorrow_short_label: { en: 'Tomorrow', de: 'Morgen' },
  today_you_rode_eyebrow: { en: 'Today · you rode', de: 'Heute · gefahren' },
  todays_ride_simple_eyebrow: { en: "Today's ride", de: 'Heutige Fahrt' },
  extra_recovery_tonight: { en: 'Extra recovery tonight.', de: 'Heute Abend extra Erholung.' },
  goal_trajectory_label: { en: 'Goal trajectory', de: 'Ziel-Verlauf' },
  where_this_points_label: { en: 'Where this points', de: 'Wohin das führt' },
  next_session_label: { en: 'Next session', de: 'Nächste Einheit' },
  whats_next_label: { en: "What's next", de: 'Was kommt' },

  // WorkoutExportRow
  export_workout_eyebrow: { en: 'Export workout', de: 'Workout exportieren' },
  export_failed: { en: 'Export failed.', de: 'Export fehlgeschlagen.' },
  snooze_one_day: { en: 'Snooze 1 day', de: '1 Tag verschieben' },
  back_to_prescribed: { en: 'Back to prescribed', de: 'Zurück zum Plan' },
  metric_duration: { en: 'DURATION', de: 'DAUER' },
  metric_target: { en: 'TARGET', de: 'ZIEL' },
  metric_load: { en: 'LOAD', de: 'LAST' },
  metric_effort: { en: 'EFFORT', de: 'AUFWAND' },
  steady_default: { en: 'Steady', de: 'Stetig' },

  // TrainHero — periodization phase + block labels
  phase_build1: { en: 'Build 1', de: 'Aufbau 1' },
  phase_build2: { en: 'Build 2', de: 'Aufbau 2' },
  phase_base1: { en: 'Base 1', de: 'Grundlage 1' },
  phase_base2: { en: 'Base 2', de: 'Grundlage 2' },
  phase_peak: { en: 'Peak', de: 'Peak' },
  phase_taper: { en: 'Taper', de: 'Taper' },
  phase_race: { en: 'Race week', de: 'Rennwoche' },
  pos_accumulation: { en: 'Accumulation', de: 'Akkumulation' },
  pos_transmutation: { en: 'Transmutation', de: 'Transmutation' },
  pos_realization: { en: 'Realization', de: 'Realisation' },
  pos_recovery: { en: 'Recovery week', de: 'Erholungswoche' },
  days_to_event_suffix: { en: 'D TO EVENT', de: 'T BIS EVENT' },
  tss_week: { en: 'TSS · WEEK', de: 'TSS · WOCHE' },
  plan_completion: { en: 'PLAN COMPLETION', de: 'PLANERFÜLLUNG' },
  quota_plan: { en: 'plan', de: 'Plan' },
  quota_threshold: { en: 'threshold', de: 'Schwelle' },
  quota_rest: { en: 'rest', de: 'Ruhe' },

  // SeasonStats
  stat_hours: { en: 'HOURS', de: 'STUNDEN' },
  stat_distance: { en: 'DISTANCE', de: 'DISTANZ' },
  stat_tss: { en: 'TSS', de: 'TSS' },
  yoy_tooltip: { en: 'vs. same day last year', de: 'vs. gleicher Tag im Vorjahr' },

  // TrainingLogStrip
  training_log_90d: { en: 'Training log · last 90 days', de: 'Trainingslog · letzte 90 Tage' },
  log_active: { en: 'active', de: 'aktiv' },
  log_rest: { en: 'rest', de: 'Ruhe' },
  log_biggest_day: { en: 'Biggest day', de: 'Stärkster Tag' },
  log_streak_suffix: { en: '-day streak', de: '-Tage-Serie' },

  // Generic
  loading: { en: 'Loading…', de: 'Wird geladen…' },

  // Today tab card labels (used by TodayTab card registry)
  card_train_hero: { en: 'Week framing', de: 'Wochenrahmen' },
  card_checkin: { en: 'Morning check-in', de: 'Morgen-Check-in' },
  card_recap: { en: 'Yesterday recap', de: 'Rückblick gestern' },
  card_today_hero: { en: "Today's verdict", de: 'Heutiges Urteil' },
  card_momentum: { en: 'Momentum chips', de: 'Momentum-Chips' },
  card_coach_brief: { en: 'Coach brief', de: 'Coach-Briefing' },
  card_form_progress: { en: 'Form & progress', de: 'Form & Fortschritt' },
  card_streak: { en: 'Streak & challenge', de: 'Serie & Challenge' },
  card_pmc: { en: 'Training state (PMC)', de: 'Trainingszustand (PMC)' },
  card_season: { en: 'Season stats', de: 'Saison-Statistik' },
  card_badges: { en: 'Achievements', de: 'Erfolge' },
  card_dyk: { en: 'Did you know', de: 'Wusstest du' },
  card_log: { en: 'Training log', de: 'Trainings-Log' },
  card_recent: { en: 'Recent rides', de: 'Letzte Fahrten' },
  card_deep_dive: { en: 'Deep dive', de: 'Details' },

  // Trends tab card labels (used by TrendsTab card registry)
  card_trends_hero: { en: 'Trends overview', de: 'Trends-Überblick' },
  card_pmc_chart: { en: 'Fitness & form (PMC)', de: 'Fitness & Form (PMC)' },
  card_ramp_efficiency: { en: 'Ramp rate & efficiency', de: 'Rampe & Effizienz' },
  card_intensity_distribution: { en: 'Intensity & distribution', de: 'Intensität & Verteilung' },
  card_biometrics: { en: 'Biometrics', de: 'Biometrie' },
  card_estimates: { en: 'Estimates', de: 'Schätzwerte' },
  card_history_records: { en: 'History & records', de: 'Verlauf & Rekorde' },

  // Week tab card labels (used by WeekTab card registry)
  card_week_plan: { en: 'Weekly plan', de: 'Wochenplan' },
  card_week_compliance: { en: 'Compliance & ramp', de: 'Einhaltung & Rampe' },
  card_week_summary: { en: 'This week', de: 'Diese Woche' },
  card_week_calendar: { en: 'Full plan calendar', de: 'Gesamtplan-Kalender' },

  // Plan tab card labels (used by PlanTab card registry)
  card_calendar: { en: 'Training calendar', de: 'Trainingskalender' },

  // DashboardSection titles for Trends sections (used by local wrapper components)
  section_intensity: { en: 'Intensity & distribution', de: 'Intensität & Verteilung' },
  section_biometrics: { en: 'Biometrics', de: 'Biometrie' },
  section_estimates: { en: 'Estimates', de: 'Schätzwerte' },
  section_history: { en: 'History & records', de: 'Verlauf & Rekorde' },

  // Workouts tab
  tab_workouts: { en: 'Workouts', de: 'Workouts' },
  workouts_title: { en: 'Repeated workouts', de: 'Wiederholte Workouts' },
  workouts_empty: { en: 'No repeated workouts yet — do a named workout more than once to compare.', de: 'Noch keine Wiederholungen — absolviere ein benanntes Workout mehrfach zum Vergleich.' },
  workouts_times: { en: '× done', de: '× gemacht' },
  workouts_back: { en: 'All workouts', de: 'Alle Workouts' },
  workouts_not_found: { en: 'Workout not found', de: 'Workout nicht gefunden' },
  workouts_metric_efficiency: { en: 'Efficiency (W/bpm)', de: 'Effizienz (W/bpm)' },
  workouts_metric_avg_power: { en: 'Avg power (W)', de: 'Ø Leistung (W)' },
  workouts_metric_np: { en: 'Normalized power (W)', de: 'Normalisierte Leistung (W)' },
  workouts_metric_avg_hr: { en: 'Avg HR (bpm)', de: 'Ø HF (bpm)' },
  workouts_metric_pace: { en: 'Pace (/km)', de: 'Pace (/km)' },
  workouts_metric_tss: { en: 'TSS', de: 'TSS' },

  // ── AGENT-MARKER: daily-decision + sport-honest review (Today/Coach agent) ──
  // Decision pill words — keyed 1:1 off DailyDecision.state (audit P0-3).
  dd_pill_sick: { en: 'Marked sick · recovery only', de: 'Krank gemeldet · nur Erholung' },
  dd_pill_injured: { en: 'Marked injured · heal up', de: 'Verletzt gemeldet · heilen' },
  dd_pill_break: { en: 'On a break · keep it light', de: 'Pause · locker bleiben' },
  dd_pill_trained: { en: 'Session logged', de: 'Einheit erledigt' },
  dd_pill_trained_recover: { en: 'Session logged · recover', de: 'Einheit erledigt · erholen' },
  dd_pill_rest: { en: 'Rest day', de: 'Ruhetag' },
  dd_pill_recover: { en: 'Recover · go easy', de: 'Erholen · locker' },
  dd_pill_easy: { en: 'Easy day', de: 'Lockerer Tag' },
  dd_pill_quality: { en: 'Quality day', de: 'Qualitätstag' },
  dd_pill_hard: { en: 'Primed to train', de: 'Bereit zu trainieren' },
  // Sport-honest review card — neutral "logged" mode (no grade, no percentages).
  review_logged_eyebrow: { en: 'Session logged', de: 'Einheit erfasst' },
  review_not_graded: {
    en: "Counts toward your week — not graded against today's plan.",
    de: 'Zählt für deine Woche — wird nicht am heutigen Plan gemessen.',
  },
  review_sport_label: { en: 'Sport', de: 'Sport' },
  review_avg_hr_label: { en: 'Avg HR', de: 'Ø HF' },
  // ── END AGENT-MARKER: daily-decision + sport-honest review ──
} as const satisfies Record<string, StringSet>

export type StringKey = keyof typeof STRINGS

export function tFor(locale: Locale, key: StringKey): string {
  // Resilient lookup: a missing key falls back to English, then to the key
  // name itself, so an un-added translation never throws at runtime.
  const entry = STRINGS[key] as StringSet | undefined
  return entry?.[locale] ?? entry?.en ?? key
}
