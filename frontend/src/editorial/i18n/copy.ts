/**
 * EDITORIAL II's own copy deck. Owner's ruling, 2026-08-05: EDITORIAL II
 * ships in German — the pen's English is the designer's mock, not the
 * product (see docs/superpowers/plans/2026-08-05-editorial-ii-design-system.md,
 * "German is the language").
 *
 * This is a SEPARATE dictionary from `i18n/strings.ts` (the app-wide one).
 * `editorial/` must not add keys there — that file sits outside this tree,
 * and the one-way dependency (nothing outside `editorial/` imports from it;
 * this tree may read from `api/`, `hooks/`, `utils/`, `contexts/`) is what
 * makes this whole design system deletable in one `rm -rf`. So every literal
 * under `editorial/` routes through THIS file instead, via `useCopy()`
 * (`./useCopy.ts`).
 *
 * German authored first; English is the pen's own original wording, kept
 * alongside it both as a translation source-of-truth and because the pen
 * itself (and this task's own English-speaking reviewers) still reads it.
 * `Record<CopyKey, { de: string; en: string }>` makes a missing translation
 * a compile error — there is no way to add a key with only one language.
 *
 * TRANSLATION REGISTER: this is edited editorial writing, not a literal
 * gloss — terse, calm, second person (`du`, never `Sie`), never chirpy.
 * Athlete units stay as the athlete already reads them (W, TSS, KM, BPM, H,
 * IF, NP) — never germanised. Numbers format via `toLocaleString('de-DE')`
 * at the call site (decimal comma), never a hand-rolled `.replace('.', ',')`.
 * Weekday/month names come from `toLocaleDateString('de-DE', …)` at the call
 * site (see `data/useTodayModel.ts`), never a hand-written array — the one
 * exception is `week.dowLetters` below, which is UI chrome (a 7-column strip
 * header), not a date computation, and has no `Intl` equivalent for "the
 * single/double letter that labels a weekday column."
 *
 * Placeholders use `{name}` and are filled by `interpolate()` in
 * `useCopy.ts`. A key with no placeholders is used directly.
 */

export type Locale = 'de' | 'en'

export const EDITORIAL_DEFAULT_LOCALE: Locale = 'de'

interface CopyEntry {
  de: string
  en: string
}

export const COPY = {
  // ---- TabBar (components/TabBar.tsx) --------------------------------------
  tabToday: { de: 'HEUTE', en: 'TODAY' },
  tabTrain: { de: 'TRAINING', en: 'TRAIN' },
  tabRecovery: { de: 'ERHOLUNG', en: 'RECOVERY' },
  tabHistory: { de: 'VERLAUF', en: 'HISTORY' },
  tabSocial: { de: 'CREW', en: 'SOCIAL' },

  // ---- DayRail (components/DayRail.tsx) ------------------------------------
  dayRailRestDay: { de: 'RUHETAG', en: 'REST DAY' },
  dayRailTrainingDay: { de: 'TRAININGSTAG', en: 'TRAINING DAY' },
  dayRailSession: { de: 'EINHEIT', en: 'SESSION' },
  dayRailRecovery: { de: 'ERHOLUNG', en: 'RECOVERY' },
  dayRailLightsOut: { de: 'LICHT AUS', en: 'LIGHTS OUT' },
  dayRailDayState: { de: 'TAGESTYP', en: 'DAY STATE' },
  dayRailMakeTraining: { de: 'ZUM TRAININGSTAG MACHEN', en: 'MAKE IT A TRAINING DAY' },
  dayRailMakeRest: { de: 'ZUM RUHETAG MACHEN', en: 'MAKE IT A REST DAY' },
  dayRailBackToPlanned: { de: 'ZURÜCK ZUM PLAN', en: 'BACK TO PLANNED' },
  dayRailBackToDone: { de: 'ZURÜCK ZU ERLEDIGT', en: 'BACK TO SESSION DONE' },

  // ---- RangeRow (components/RangeRow.tsx) ----------------------------------
  rangeBelow: { de: 'UNTER BEREICH', en: 'BELOW RANGE' },
  rangeAbove: { de: 'ÜBER BEREICH', en: 'ABOVE RANGE' },
  rangeIn: { de: 'IM BEREICH', en: 'IN RANGE' },

  // ---- InsightStrip (components/InsightStrip.tsx) --------------------------
  insightStripCaption: { de: 'HEUTE IN DREI ZAHLEN', en: 'TODAY IN THREE NUMBERS' },

  // ---- ZoneRows (components/ZoneRows.tsx) ----------------------------------
  // "ZEIT IN DEN HERZFREQUENZZONEN" is the literal translation but overflows
  // a 9px/ls1.6 uppercase eyebrow at 390px next to the right-aligned TOTAL —
  // shortened to the "HF" abbreviation (Herzfrequenz) every German cycling
  // app already uses for this exact label.
  zoneRowsCaption: { de: 'ZEIT IN DEN HF-ZONEN', en: 'TIME IN HEART RATE ZONES' },
  zoneRowsThresholdPct: { de: '{pct}% AN DER SCHWELLE', en: '{pct}% AT THRESHOLD' },
  zoneRowsTotal: { de: '{time} GESAMT', en: '{time} TOTAL' },

  // ---- PeakRows (components/PeakRows.tsx) ----------------------------------
  peakRowsCaption: { de: 'SPITZENLEISTUNG HEUTE', en: 'PEAK POWER TODAY' },
  // "% DES SAISONBESTWERTS" is the literal translation but is noticeably
  // wider than the pen's own "% OF SEASON BEST" at the same 9px/ls1.6 —
  // shortened to keep the right-aligned header from crowding the kicker.
  peakRowsSeasonBest: { de: '% VOM BESTWERT', en: '% OF SEASON BEST' },

  // ---- PMCChart (components/PMCChart.tsx) ----------------------------------
  pmcFitness: { de: 'FITNESS', en: 'FITNESS' },
  pmcFatigue: { de: 'ERMÜDUNG', en: 'FATIGUE' },
  pmcForm: { de: 'FORM', en: 'FORM' },
  pmcDaysAgo: { de: 'VOR {days} TAGEN', en: '{days} DAYS AGO' },
  pmcNow: { de: 'JETZT', en: 'NOW' },
  pmcAriaLabel: {
    de: 'Fitness, Ermüdung und Form der letzten {days} Tage',
    en: 'Fitness, fatigue and form over the last {days} days',
  },
  pmcNotEnoughHistory: {
    de: 'Noch nicht genug Trainingshistorie für ein Diagramm.',
    en: 'Not enough training history to chart yet.',
  },

  // ---- FatigueCurve (components/FatigueCurve.tsx) --------------------------
  fatigueCurveNow: { de: 'JETZT · {n}', en: 'NOW · {n}' },
  fatigueCurveNeutral: { de: 'NEUTRAL {n}', en: 'NEUTRAL {n}' },
  fatigueCurveCaption: {
    de: 'Jetzt am höchsten, dann klingt sie ab — neutral etwa {label}.',
    en: 'Peaks now, then decays — back to neutral around {label}.',
  },

  // ---- WhatThisChanges (components/WhatThisChanges.tsx) --------------------
  onYou: { de: 'FÜR DICH', en: 'ON YOU' },
  onThePlan: { de: 'FÜR DEN PLAN', en: 'ON THE PLAN' },

  // ---- TomorrowBand (components/TomorrowBand.tsx) --------------------------
  tomorrowBandTomorrow: { de: 'MORGEN', en: 'TOMORROW' },
  tomorrowBandToday: { de: 'HEUTE', en: 'TODAY' },

  // ---- NotInThisSystem (pages/NotInThisSystem.tsx) --------------------------
  notInThisSystem: {
    de: 'Dieser Tab ist in diesem Design-System noch nicht angelegt.',
    en: 'This tab is not in this design system yet.',
  },

  // ---- week.dowLetters (WeekRail column headers) — see the top comment for
  // why this is chrome, not a date computation.
  weekMon: { de: 'MO', en: 'M' },
  weekTue: { de: 'DI', en: 'T' },
  weekWed: { de: 'MI', en: 'W' },
  weekThu: { de: 'DO', en: 'T' },
  weekFri: { de: 'FR', en: 'F' },
  weekSat: { de: 'SA', en: 'S' },
  weekSun: { de: 'SO', en: 'S' },

  // ---- TodayView.tsx: hero -----------------------------------------------
  heroSessionContextMissing: { de: 'Noch kein Vergleich zur Belastung.', en: 'No session-load comparison available yet.' },
  heroReadinessDeltaMissing: { de: 'Keine Bereitschaft von gestern zum Vergleich.', en: 'No prior-day readiness to compare.' },
  heroReadinessContextMissing: { de: 'Noch kein weiterer Kontext zur Bereitschaft.', en: 'No further readiness context available yet.' },
  heroReadinessDeltaVsYesterday: { de: '{sign} {n} ggü. gestern', en: '{sign} {n} vs yesterday' },
  heroStreakDays: { de: '{n} TAGE', en: '{n} DAYS' },
  heroUnitTss: { de: 'TSS', en: 'TSS' },
  heroUnitReadiness: { de: 'BEREITSCHAFT', en: 'READINESS' },
  heroUnitSessionLoad: { de: 'BELASTUNG DER EINHEIT', en: 'SESSION LOAD' },
  heroUnitOutOf100: { de: 'VON 100', en: 'OUT OF 100' },

  // ---- Insight Strip items --------------------------------------------------
  insightPeakPower: { de: 'SPITZENLEISTUNG', en: 'PEAK POWER' },
  insightPeakPowerMissing: { de: 'Noch keine Spitzenleistungs-Analyse.', en: 'No peak-power analysis yet.' },
  insightUntilNeutral: { de: 'BIS ZUR ERHOLUNG', en: 'UNTIL BACK TO NEUTRAL' },
  insightFitness: { de: 'FITNESS', en: 'FITNESS' },
  insightForm: { de: 'FORM', en: 'FORM' },
  insightAtThreshold: { de: 'AN DER SCHWELLE', en: 'AT THRESHOLD' },
  insightUntilWeekdayCleared: { de: 'BIS {weekday} ERHOLT', en: 'UNTIL {weekday} IS CLEARED' },
  insightUntilCleared: { de: 'BIS ERHOLT', en: 'UNTIL CLEARED' },
  hoursSuffix: { de: '{n} Std.', en: '{n} h' },
  workBlockSummary: { de: '{n} BLÖCKE', en: '{n} BLOCKS' },

  // ---- 01 The Session (Trained) ---------------------------------------------
  sectionTheSession: { de: 'DIE EINHEIT', en: 'THE SESSION' },
  chipBlocks: { de: '{n} BLÖCKE', en: '{n} BLOCKS' },
  whatYouRode: { de: 'GEFAHREN', en: 'WHAT YOU RODE' },
  whatWasPlanned: { de: 'GEPLANT', en: 'WHAT WAS PLANNED' },
  targetWatts: { de: 'ZIEL {w} W', en: 'TARGET {w} W' },
  whatThisChangesHeading: { de: 'WAS DAS ÄNDERT', en: 'WHAT THIS CHANGES' },
  rideMicroBpmAvg: { de: '{n} BPM Ø', en: '{n} BPM AVG' },
  rideMicroNp: { de: 'NP {n} W', en: 'NP {n} W' },
  blockNoTarget: { de: 'Kein Zielwert für diesen Block.', en: 'No target for this block.' },
  noTssEstimate: { de: 'Keine TSS-Schätzung für diese Einheit.', en: 'No TSS estimate for this session.' },

  // ---- costTiles / trainingTiles / trajectoryTiles labels + units ----------
  tileLoad: { de: 'BELASTUNG', en: 'LOAD' },
  tileTime: { de: 'ZEIT', en: 'TIME' },
  tileIntensity: { de: 'INTENSITÄT', en: 'INTENSITY' },
  tilePower: { de: 'LEISTUNG', en: 'POWER' },
  tileTarget: { de: 'ZIEL', en: 'TARGET' },
  tileWork: { de: 'ARBEIT', en: 'WORK' },
  unitTss: { de: 'TSS', en: 'TSS' },
  unitHours: { de: 'H', en: 'HRS' },
  unitIf: { de: 'IF', en: 'IF' },
  unitWatts: { de: 'WATT', en: 'WATTS' },
  unitMin: { de: 'MIN', en: 'MIN' },
  noIntensityFactor: { de: 'Keine Intensität für diese Einheit.', en: 'No intensity factor for this session.' },
  noUniformTarget: { de: 'Kein einheitlicher Zielwert für diese Einheit.', en: 'No uniform target for this session.' },

  // ---- 02 THE COST (Trained) -------------------------------------------------
  sectionTheCost: { de: 'DIE KOSTEN', en: 'THE COST' },
  chipHoursToRun: { de: 'NOCH {n} H', en: '{n}H TO RUN' },
  costClaimJumped: { de: 'Ermüdung um {n} gestiegen.', en: 'Fatigue jumped {n}.' },
  costClaimEased: { de: 'Ermüdung um {n} gesunken.', en: 'Fatigue eased {n}.' },
  notEnoughFatigueHistory: { de: 'Nicht genug Verlauf, um die Ermüdung einzuordnen.', en: 'Not enough history to say how fatigue moved.' },
  fatigueNext48h: { de: 'ERMÜDUNG · NÄCHSTE 48 STUNDEN', en: 'FATIGUE · NEXT 48 HOURS' },

  // ---- 02 ABSORPTION (Rest) ---------------------------------------------------
  sectionAbsorption: { de: 'ABSORPTION', en: 'ABSORPTION' },
  absorptionSub: { de: 'Die Einheit, die dein Körper gerade noch verarbeitet.', en: 'The session your body is still paying for right now.' },
  noLastSession: { de: 'Kein Datensatz zur Einheit, die gerade absorbiert wird.', en: 'No record of the session being absorbed.' },
  absorptionHours: { de: 'ABSORPTION · {n} STUNDEN', en: 'ABSORPTION · {n} HOURS' },
  absorptionClearAt: { de: 'ERHOLT AB {label}', en: 'CLEAR {label}' },
  absorptionNoEndTime: { de: 'Kein Zeitpunkt für das Ende der letzten Einheit erfasst.', en: 'No record of when the last session ended.' },
  absorptionSummary: { de: '{a} Std. absorbiert · noch {r} Std.', en: '{a}h absorbed · {r}h still to run' },

  // ---- 02 THE SESSION (Training) ---------------------------------------------
  noCleanIntervalPattern: { de: 'Kein klares Intervallmuster erkennbar.', en: 'No clean interval pattern to summarize.' },
  trainingSessionClaim: { de: '{n} × {m} an der Schwelle.', en: '{n} × {m} at threshold.' },
  sessionPreviewCaption: { de: '{n} BLÖCKE · {hm}', en: '{n} BLOCKS · {hm}' },

  // ---- 01 RECOVERY (Rest + Training) -----------------------------------------
  sectionRecovery: { de: 'ERHOLUNG', en: 'RECOVERY' },
  recoverySub: {
    de: 'HRV, Ruhepuls und Schlaf — jeweils im Vergleich zu deinen eigenen 30 Tagen.',
    en: 'HRV, resting heart rate and sleep — each against your own 30-day range.',
  },
  labelHrv: { de: 'HRV', en: 'HRV' },
  labelRestingHr: { de: 'RUHEPULS', en: 'RESTING HR' },
  labelSleep: { de: 'SCHLAF', en: 'SLEEP' },
  unitMs: { de: 'ms', en: 'ms' },
  unitBpm: { de: 'bpm', en: 'bpm' },
  unitH: { de: 'h', en: 'h' },
  sleepComposition: { de: 'SCHLAFPHASEN', en: 'SLEEP COMPOSITION' },
  sleepCompositionTotal: { de: ' · {hm} GESAMT', en: ' · {hm} TOTAL' },
  sleepDeep: { de: 'TIEF', en: 'DEEP' },
  sleepRem: { de: 'REM', en: 'REM' },
  sleepLight: { de: 'LEICHT', en: 'LIGHT' },
  sleepAwake: { de: 'WACH', en: 'AWAKE' },

  // ---- 03 TRAJECTORY (all states) ---------------------------------------------
  sectionTrajectory: { de: 'VERLAUF', en: 'TRAJECTORY' },
  trajectorySub: {
    de: 'Fitness, Ermüdung und Form aus dem rollierenden 42-Tage-Modell.',
    en: 'Fitness, fatigue and form from the rolling 42-day model.',
  },
  chipClimbing: { de: 'STEIGEND', en: 'CLIMBING' },
  chipDeclining: { de: 'SINKEND', en: 'DECLINING' },
  chipSteady: { de: 'STABIL', en: 'STEADY' },
  unitSpent: { de: 'VERAUSGABT', en: 'SPENT' },
  unitBanked: { de: 'GESPART', en: 'BANKED' },
  unitNeutral: { de: 'NEUTRAL', en: 'NEUTRAL' },
  trajectoryClaim: {
    de: 'Fitness {dir} {n}. Form {form}.',
    en: 'Fitness {dir} {n}. Form {form}.',
  },
  trajectoryDirUp: { de: 'gestiegen um', en: 'up' },
  trajectoryDirDown: { de: 'gesunken um', en: 'down' },
  trajectoryFormSpent: { de: 'verausgabt', en: 'spent' },
  trajectoryFormBanked: { de: 'gespart', en: 'banked' },
  trajectoryFormNeutral: { de: 'neutral', en: 'neutral' },
  notEnoughHistoryToChart: { de: 'Nicht genug Verlauf für einen Trend.', en: 'Not enough history to chart a trend.' },

  // ---- Quote Plate (all states) ------------------------------------------------
  quoteRest: {
    de: 'Nichts, was du heute tust, macht dich schneller. Alles, was du lässt, schon.',
    en: "Nothing you do today will make you faster. Everything you don't do will.",
  },
  quoteRestAttribution: { de: 'WOFÜR RUHE DA IST', en: 'WHAT REST IS FOR' },
  quoteTraining: {
    de: 'Alles, was du in den letzten drei Wochen getan hast, hat diesen vierten Block erst möglich gemacht.',
    en: 'Everything you did in the last three weeks was to make the fourth block possible.',
  },
  quoteTrainingAttribution: { de: 'WOFÜR HEUTE DA IST', en: 'WHAT TODAY IS FOR' },
  quoteTrained: {
    de: 'Du verarbeitest eine Einheit nicht, indem du die nächste fährst. Der Gewinn entsteht in der Ruhe.',
    en: "You don't absorb a session by doing another one. The gain is made while you're still.",
  },
  quoteTrainedAttribution: { de: 'WAS JETZT PASSIERT', en: 'WHAT HAPPENS NEXT' },

  // ---- Tomorrow Plate / Route Plate --------------------------------------------
  tomorrowKickerLeft: { de: 'MORGEN · {label}', en: 'TOMORROW · {label}' },
  tomorrowCaptionWorkDone: { de: 'DIE ARBEIT IST GETAN', en: 'THE WORK IS DONE' },
  tomorrowCaptionMakesPossible: { de: 'HEUTE MACHT ES MÖGLICH', en: 'TODAY MAKES IT POSSIBLE' },
  noTomorrowDescription: { de: 'Noch keine Beschreibung für den morgigen Plan.', en: "No description for tomorrow's plan." },
  noRouteDistanceTomorrow: { de: 'Keine Streckendistanz für morgen.', en: "No route distance for tomorrow's plan." },
  noRouteNameToday: { de: 'Kein Streckenname für die heutige Fahrt.', en: "No route name for today's ride." },
  noStartTimeToday: { de: 'Keine Startzeit für die heutige Einheit erfasst.', en: "No start time recorded for today's session." },
  noSunsetTime: { de: 'Keine Sonnenuntergangszeit verfügbar.', en: 'No sunset time available.' },
  noRouteDataToday: { de: 'Keine Streckendaten für die heutige Fahrt.', en: "No route data for today's ride." },
  // ONE combined sentence for a plate that has SOME real content but not
  // all of it — replaces joining each missing field's own reason (see
  // TomorrowPlate.tsx's own doc comment, coordinator visual review round 2).
  tomorrowPlateGap: { de: 'Weitere Details zu morgen liegen noch nicht vor.', en: "Further details for tomorrow aren't available yet." },
  routePlateGap: { de: 'Weitere Streckendetails liegen noch nicht vor.', en: "Further route details aren't available yet." },
  routeCaptionRight: { de: '{n} × {m} @ {w} W', en: '{n} × {m} @ {w} W' },
  noPeakIdentified: { de: 'Noch kein Spitzenwert für diese Fahrt erkannt.', en: 'No headline peak identified for this ride yet.' },

  // ---- data/useTodayModel.ts: reason strings ----------------------------------
  wearableLastSyncFallback: { de: 'deiner letzten Synchronisierung', en: 'your last sync' },
  wearableMissingSince: { de: 'Keine Messung seit {day}.', en: 'No wearable reading since {day}.' },
  streakMissing: { de: 'Noch keine Serie erfasst.', en: 'No streak recorded yet.' },
  readinessMissing: { de: 'Noch keine Bereitschaftsmessung.', en: 'No readiness reading yet.' },
  pmcMissing: { de: 'Noch nicht genug Trainingshistorie.', en: 'Not enough training history yet.' },
  recoveryFreshNow: { de: 'Jetzt frisch', en: 'Fresh now' },
  recoveryMissing: { de: 'Noch keine Erholungsschätzung.', en: 'No recovery estimate yet.' },
  sessionMissing: { de: 'Für heute nichts geplant.', en: 'Nothing planned for today.' },
  rideMissing: { de: 'Heute noch keine Fahrt erfasst.', en: 'No ride recorded yet today.' },
  zonesNoHrData: { de: 'Keine Herzfrequenzdaten für diese Fahrt.', en: 'No heart-rate data for this ride.' },
  peaksMissing: { de: 'Noch keine Spitzenleistungs-Aufschlüsselung für diese Fahrt.', en: 'No peak-power breakdown for this ride yet.' },
  planVsRiddenMissing: { de: 'Diese Fahrt konnte nicht mit dem Plan abgeglichen werden.', en: 'This ride was not matched to its plan.' },
  verdictMissing: { de: 'Der Coach hat sich heute noch nicht geäußert.', en: 'The coach has not weighed in yet today.' },
  whatThisChangesMissing: { de: 'Der Coach hat sich zu dieser Fahrt noch nicht geäußert.', en: 'The coach has not weighed in on this ride yet.' },
  weatherMissing: { de: 'Kein Standort aus einer kürzlichen Fahrt.', en: 'No location from a recent ride.' },
  tomorrowUnlockMissing: { de: 'Keine Startzeit für morgen geplant.', en: "No unlock time on tomorrow's plan." },
  tomorrowMissing: { de: 'Der Plan für morgen steht noch nicht.', en: "Tomorrow's plan is not set yet." },
  weekDayNoRide: { de: 'Keine Fahrt erfasst.', en: 'No ride logged.' },
} as const satisfies Record<string, CopyEntry>

export type CopyKey = keyof typeof COPY

/** `Locale` ('de'/'en') → the BCP-47 tag `toLocaleDateString`/
 *  `toLocaleTimeString`/`toLocaleString` need. Every date, weekday, month
 *  and decimal number rendered under `editorial/` goes through this — never
 *  a hand-written weekday/month array or a hand-rolled `.replace('.', ',')`
 *  for the decimal separator. German is `de-DE` (real weekday names,
 *  decimal comma); English keeps the pen's own `en-GB` (24h clock,
 *  day-before-month, decimal point). */
export function intlLocale(locale: Locale): string {
  return locale === 'de' ? 'de-DE' : 'en-GB'
}
