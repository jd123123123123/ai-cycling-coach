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
  // CORRECTED (real-data audit, 2026-08-06): was "{n} BLÖCKE · {hm}" — the
  // SAME word `workBlockSummary` above already uses for the WORK-interval
  // count only ("5 BLÖCKE" in the Insight Strip a few lines up). This
  // caption sits under the full preview Bars (all 11 blocks: warm-up + 5
  // work + 4 recovery + cool-down), so its own number was real and
  // correctly captioned its own chart, but the identical word for a
  // different count read as the exact contradiction the SecHead chip
  // defect already was. "TEILE" is the neutral word Session Detail's own
  // "01 The Blocks" already uses for this same "every structural segment"
  // meaning (`chipParts`, `SessionBlocks.tsx`) — reusing it here gives the
  // whole build one consistent vocabulary: BLÖCKE = work intervals, TEILE =
  // every segment.
  sessionPreviewCaption: { de: '{n} TEILE · {hm}', en: '{n} PARTS · {hm}' },

  // ---- Recovery labels (bento tiles — components/BentoGrid.tsx) -------------
  // OWNER RULING 2026-08-07: `sectionRecovery`/`recoverySub` (the deleted
  // "01 Recovery" heading) are gone — grepped tree-wide, nothing else reads
  // them. See this file's own top-of-file doc comment for why.
  labelHrv: { de: 'HRV', en: 'HRV' },
  labelRestingHr: { de: 'RUHEPULS', en: 'RESTING HR' },
  labelSleep: { de: 'SCHLAF', en: 'SLEEP' },
  unitMs: { de: 'ms', en: 'ms' },
  unitBpm: { de: 'bpm', en: 'bpm' },
  unitH: { de: 'h', en: 'h' },
  // Bento Grid (Task 8): HRV/resting-HR tiles chart today's reading against
  // the athlete's own band (`RangeBand`, same field `RangeRow` used to plot)
  // — this is the one gap case, a present reading with no band on record,
  // distinct from the reading itself being missing (which uses that Value's
  // own `.missing` text instead).
  bentoNoRange: { de: 'Kein Bereich hinterlegt.', en: 'No range recorded yet.' },
  // OWNER RULING 2026-08-07: the deleted "01 Recovery" section's own per-row
  // delta ("+6"/"−2") and range caption ("ÜBER BEREICH"/"UNTER BEREICH")
  // migrate onto the HRV/RESTING HR tiles' `note` — this is the template
  // that joins the two when BOTH exist for a given reading (see TodayView's
  // own `bentoRangeNote`). Either half alone is used verbatim, with no
  // wrapping template.
  bentoNoteDeltaRange: { de: '{delta} · {range}', en: '{delta} · {range}' },
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
  quoteResting: {
    de: 'Erholung ist nicht die Abwesenheit von Training. Sie ist die Hälfte davon, die du nicht spürst.',
    en: "Recovery isn't the absence of training. It's the half of it you can't feel happening.",
  },
  quoteRestingAttribution: { de: 'WARUM HEUTE LEER IST', en: 'WHY TODAY IS EMPTY' },

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

  // ---- Resting (h54Rs) ---------------------------------------------------------
  heroUnitRecovery: { de: 'ERHOLUNG', en: 'RECOVERY' },
  heroRecoverySinceWake: { de: '{sign} {n} seit dem Aufwachen', en: '{sign} {n} since you woke' },
  heroRecoveryRangeMissing: { de: 'Noch kein 90-Tage-Bestwert erfasst.', en: 'No 90-day best recorded yet.' },
  climbSinceWoke: { de: 'SEIT DEM AUFWACHEN', en: 'SINCE YOU WOKE' },
  climbWakeLabel: { de: '{n} BEIM AUFWACHEN', en: '{n} AT WAKE' },
  climbNow: { de: 'JETZT', en: 'NOW' },
  sleepDeltaMissing: { de: 'Kein Vergleichswert zum Schlaf verfügbar.', en: 'No sleep comparison available yet.' },

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
  weekLoadMissing: { de: 'Für diese Woche ist noch keine Belastung geplant.', en: 'No planned load for this week yet.' },
  phaseContextMissing: { de: 'Kein Wochenplan hinterlegt.', en: 'No week plan on file.' },

  // ---- Task 13: bottom sheets (Switch Day Type / Back To Session Done) --------
  sheetChangeDayStateHeader: { de: 'TAG ÄNDERN', en: 'CHANGE DAY STATE' },
  sheetClose: { de: 'Schließen', en: 'Close' },
  sheetFromLabel: { de: 'VON', en: 'FROM' },
  sheetToLabel: { de: 'ZU', en: 'TO' },
  sheetStateRestTitle: { de: 'Ruhetag', en: 'Rest Day' },
  sheetStateTrainingTitle: { de: 'Trainingstag', en: 'Training Day' },
  sheetStateRecoveringTitle: { de: 'Erholung', en: 'Recovering' },
  sheetStateSessionDoneTitle: { de: 'Einheit erledigt', en: 'Session Done' },
  sheetSwitchBodyToTraining: {
    de: 'Der Trainingstag gilt nur für heute. Morgen entscheidest du wieder neu.',
    en: 'This applies only to today. Tomorrow resets to the plan.',
  },
  sheetSwitchBodyToRest: {
    de: 'Der Ruhetag gilt nur für heute. Dein Trainingsplan bleibt unverändert.',
    en: 'This rest day applies only to today. Your training plan stays untouched.',
  },
  sheetSwitchToTrainingCta: { de: 'ZUM TRAININGSTAG WECHSELN', en: 'SWITCH TO A TRAINING DAY' },
  sheetSwitchToRestCta: { de: 'ZUM RUHETAG WECHSELN', en: 'SWITCH TO A REST DAY' },
  sheetKeepRestCta: { de: 'RUHETAG BEIBEHALTEN', en: 'KEEP THE REST DAY' },
  sheetKeepTrainingCta: { de: 'TRAININGSTAG BEIBEHALTEN', en: 'KEEP THE TRAINING DAY' },
  sheetBackBody: {
    de: 'Du kehrst zur Ansicht nach der Einheit zurück. Deine Erholung läuft im Hintergrund weiter — nichts, was du bereits erfasst hast, geht verloren.',
    en: "You'll return to the post-session view. Recovery keeps running in the background — nothing you've logged is lost.",
  },
  sheetStayInRecoveryCta: { de: 'IN ERHOLUNG BLEIBEN', en: 'STAY IN RECOVERY' },

  // ---- Task 12: Session Detail (pages/SessionDetailPage.tsx, pen J5FV6) ------
  navSessionTitle: { de: 'EINHEIT', en: 'SESSION' },
  sessionKicker: { de: 'HEUTE · EINHEIT', en: 'TODAY · SESSION' },
  sessionMissingTitle: { de: 'Für heute nichts geplant.', en: 'Nothing planned for today.' },
  sessionClaimMissing: { de: 'Der Coach hat diese Einheit noch nicht begründet.', en: 'The coach has not motivated this session yet.' },
  numeralMissing: { de: 'Kein klares Intervallmuster für diese Einheit.', en: 'No clean interval pattern for this session.' },
  numeralQualifierZone: { de: 'IN Z{zone}', en: 'IN Z{zone}' },
  numeralSubMinBlocks: { de: '{n} MIN BLÖCKE', en: '{n} MIN BLOCKS' },
  heroStatWatts: { de: 'WATT', en: 'WATTS' },
  heroStatDuration: { de: 'DAUER', en: 'DURATION' },
  heroStatTss: { de: 'TSS', en: 'TSS' },
  heroStatInZone: { de: 'IN ZONE', en: 'IN ZONE' },
  noWattTarget: { de: 'Kein einheitlicher Zielwert.', en: 'No uniform target.' },
  noDuration: { de: 'Keine Dauer erfasst.', en: 'No duration recorded.' },
  noTss: { de: 'Keine TSS-Schätzung.', en: 'No TSS estimate.' },
  noZoneTime: { de: 'Keine Hauptblöcke erkannt.', en: 'No main blocks identified.' },
  blockNoZone: { de: 'Keine Zone für diesen Block.', en: 'No zone for this block.' },
  sectionTheBlocks: { de: 'DIE BLÖCKE', en: 'THE BLOCKS' },
  chipParts: { de: '{n} TEILE', en: '{n} PARTS' },
  blocksStatementA: { de: 'Alles vor Block eins ist Vorbereitung.', en: 'Everything before block one is preparation.' },
  blocksStatementB: { de: 'Alles danach ist Schadensbegrenzung.', en: 'Everything after is damage control.' },
  colophonTotalSession: { de: 'GESAMTE EINHEIT', en: 'TOTAL SESSION' },
  colophonAtThreshold: { de: 'AN DER SCHWELLE', en: 'AT THRESHOLD' },
  mainSetLabel: { de: 'DER HAUPTBLOCK', en: 'THE MAIN SET' },
  mainSetTotal: { de: '{time} GESAMT', en: '{time} TOTAL' },
  sectionThePayoff: { de: 'DIE AUSZAHLUNG', en: 'THE PAYOFF' },
  chipNext7Days: { de: 'NÄCHSTE 7 TAGE', en: 'NEXT 7 DAYS' },
  payoffClaimMissing: { de: 'Der Coach hat die nächsten sieben Tage noch nicht eingeordnet.', en: 'The coach has not projected the next seven days yet.' },
  payoffChartMissing: { de: 'Noch keine Sieben-Tage-Prognose.', en: 'No seven-day outlook yet.' },
  payoffToday: { de: 'HEUTE', en: 'TODAY' },
  sessionCtaTitle: { de: 'WORKOUT EXPORTIEREN', en: 'EXPORT WORKOUT' },
  sessionCtaSubtitle: { de: 'Intervalle und Strecke als Datei für dein Edge', en: 'Structured intervals and route, as a file for your Edge' },
  sessionCtaFailed: { de: 'Export fehlgeschlagen. Versuch es noch einmal.', en: 'Export failed. Try again.' },

  // ---- Task 14: Evening (pen KYS6e / cx4zJ) — 01 TODAY ------------------------
  sectionToday: { de: 'HEUTE', en: 'TODAY' },
  chipRideDone: { de: 'FAHRT ERLEDIGT', en: 'RIDE DONE' },
  eveningLightsOutMissing: {
    de: 'Kein Zubettgeh-Ziel für heute Nacht erfasst.',
    en: 'No bedtime target set for tonight.',
  },
  insightTonightTarget: { de: 'SCHLAFZIEL HEUTE NACHT', en: "TONIGHT'S TARGET" },
  insightUntilLightsOut: { de: 'BIS LICHT AUS', en: 'UNTIL LIGHTS OUT' },
  insightVsAverage: { de: 'GGÜ. DEINEM SCHNITT', en: 'VS YOUR AVERAGE' },
  ledgerCaption: { de: 'WOHIN ES GING', en: 'WHERE IT WENT' },
  ledgerRide: { de: 'FAHRT', en: 'THE RIDE' },
  ledgerMovement: { de: 'TAGESBEWEGUNG', en: 'DAILY MOVEMENT' },
  ledgerRest: { de: 'RUHEUMSATZ', en: 'AT REST' },
  unitKcal: { de: 'KCAL', en: 'KCAL' },
  noCaloriesForRide: { de: 'Kein Kalorienwert für diese Fahrt.', en: 'No calorie total for this ride.' },
  noDailyEnergyBreakdown: {
    de: 'Keine Aufschlüsselung des Tagesumsatzes verfügbar.',
    en: 'No daily energy breakdown available.',
  },
  energyOutMissing: {
    de: 'Kein stündlicher Energieverbrauch für heute verfügbar.',
    en: 'No hourly energy-out data available for today.',
  },
  tileDuration: { de: 'DAUER', en: 'DURATION' },
  unitMoving: { de: 'BEWEGT', en: 'MOVING' },
  tileDistance: { de: 'DISTANZ', en: 'DISTANCE' },
  unitKm: { de: 'KM', en: 'KM' },
  tileAvgPower: { de: 'Ø LEISTUNG', en: 'AVG POWER' },
  tileAvgHr: { de: 'Ø HERZFREQUENZ', en: 'AVG HR' },

  // ---- Task 14: Evening — Quote Plate ------------------------------------------
  quoteEvening: {
    de: 'Auf dem Rad wirst du nicht schneller. Du wirst schneller in den acht Stunden danach.',
    en: "You don't get faster on the bike. You get faster in the eight hours after it.",
  },
  quoteEveningAttribution: { de: 'WARUM HEUTE NACHT DIE EINHEIT IST', en: 'WHY TONIGHT IS THE SESSION' },

  // ---- Task 14: Evening — 02 TONIGHT -------------------------------------------
  sectionTonight: { de: 'HEUTE NACHT', en: 'TONIGHT' },
  tileBedtime: { de: 'ZUBETTGEHEN', en: 'BEDTIME' },
  tileWake: { de: 'WECKEN', en: 'WAKE' },
  tileSleepTargetEvening: { de: 'SCHLAF', en: 'SLEEP' },
  tileDebt: { de: 'SCHLAFSCHULD', en: 'DEBT' },
  unitTarget: { de: 'ZIEL', en: 'TARGET' },
  unitAlarm: { de: 'WECKER', en: 'ALARM' },
  unitHrs: { de: 'STD', en: 'HRS' },
  unitNone: { de: 'KEINE', en: 'NONE' },

  // ---- Task 14: Evening — 03 TOMORROW -------------------------------------------
  sectionTomorrow: { de: 'MORGEN', en: 'TOMORROW' },
  noTomorrowSessionDetail: {
    de: 'Noch keine Blockdaten für die morgige Einheit.',
    en: "No block data for tomorrow's session yet.",
  },

  // ---- Task 12 follow-up: Session Detail 04 WHERE TO RIDE IT
  // (components/RouteOptions.tsx, pen J5FV6 → DMMlw), wired to GET /routes/mine.
  sectionWhereToRideIt: { de: 'WO DU FAHREN SOLLTEST', en: 'WHERE TO RIDE IT' },
  chipRoutesCount: { de: '{n} STRECKEN', en: '{n} ROUTES' },
  routeOptionLabel: { de: 'OPTION {letter}', en: 'OPTION {letter}' },
  routeStatsWithAscent: { de: '{km} KM · {ascent} HM · {n}× GEFAHREN', en: '{km} KM · {ascent} M · RIDDEN {n}×' },
  routeStatsNoAscent: { de: '{km} KM · {n}× GEFAHREN', en: '{km} KM · RIDDEN {n}×' },
  routeProfileMissing: {
    de: 'Kein Höhenprofil je Strecke verfügbar.',
    en: 'No elevation profile per route available.',
  },
  noRouteAscent: { de: 'Keine Höhenmeter für diese Strecke erfasst.', en: 'No elevation gain recorded for this route.' },
  noRouteTrack: { de: 'Keine GPS-Strecke für diese Route erfasst.', en: 'No GPS track recorded for this route.' },
  noRoutesAvailable: {
    de: 'Noch keine eigenen GPS-Strecken erfasst.',
    en: 'No GPS routes of your own recorded yet.',
  },

  // ---- Task C: Motion layer — tap readouts ---------------------------------------
  rangeReadout: { de: '{value} · BEREICH {low}–{high}', en: '{value} · RANGE {low}–{high}' },
  peakRowsReadout: { de: '{watts} W BEI {duration}', en: '{watts} W AT {duration}' },
  routeSelected: { de: 'STRECKE AUSGEWÄHLT', en: 'ROUTE SELECTED' },

  // ---- audit-b-data gap 2: trailing 90-day readiness/recovery context ----
  // (`useTodayModel.ts`'s `readiness90DayBest`/`bodyBattery90DayHigh`,
  // TodayView.tsx's own `readinessContextLine`/`recoveryRangeLine`).
  ninetyDayHistoryMissing: {
    de: 'Noch keine 90-Tage-Historie erfasst.',
    en: 'No 90-day history recorded yet.',
  },
  heroReadinessContext90Off: { de: '{n} unter dem 90-Tage-Bestwert', en: '{n} off your 90-day best' },
  heroReadinessContext90Best: { de: 'Dein 90-Tage-Bestwert', en: 'Your 90-day best' },
  heroRecoveryRange90Off: { de: '{n} unter deiner 90-Tage-Bestmarke', en: '{n} off your 90-day peak' },
  heroRecoveryRange90Best: { de: 'Spitze deiner 90-Tage-Spanne', en: 'Top of your 90-day range' },

  // ---- Cassette reward layer (Task 5): 90-day series + missed-yesterday ---
  missedYesterdayNone: { de: 'Keine ausgelassene Einheit.', en: 'No skipped session.' },

  // ---- Editorial II audit (a2, 2026-08-06): Evening's "01 Today" trio -----
  // (`cx4zJ`/`I7AqeN`+`ppDu5`+`j7KHFv`, "WHAT IT MOVED · LAST 7 DAYS") — real
  // section confirmed present in the pen, previously unbuilt. See
  // audit-a2-resting-evening.md for the full record.
  movedKeyHeading: { de: 'WAS SICH BEWEGT HAT · LETZTE 7 TAGE', en: 'WHAT IT MOVED · LAST 7 DAYS' },
  trioTrainingLoad: { de: 'TRAININGSBELASTUNG', en: 'TRAINING LOAD' },
  trioTrainingLoadCaption: { de: '{rank} GRÖSSTER TAG DIESE WOCHE', en: '{rank} BIGGEST DAY THIS WEEK' },
  trioFatigueCaptionRising: { de: 'STEIGEND', en: 'CLIMBING' },
  trioFatigueCaptionEasing: { de: 'SINKEND', en: 'EASING' },
  trioFatigueCaptionSteady: { de: 'STABIL', en: 'STEADY' },
  trioRestingHrCaption: { de: 'HEUTE MORGEN GEMESSEN', en: 'MEASURED THIS MORNING' },
  trioRestingHrHistoryMissing: {
    de: 'Kein 7-Tage-Verlauf für den Ruhepuls verfügbar.',
    en: 'No 7-day resting-HR history available.',
  },

  // ---- Editorial II audit (a3, 2026-08-06): Session Detail `01 The Blocks`
  // Programme column header row (`MnBvu`/`j3uhOg`, `H-STEP`/`H-TIME`/
  // `H-WATTS`) — present in the pen, previously unbuilt in
  // `SessionBlocks.tsx`. See audit-a3-session-sheets.md.
  colStep: { de: 'SCHRITT', en: 'STEP' },
  colTime: { de: 'ZEIT', en: 'TIME' },
  colWatts: { de: 'WATT', en: 'WATTS' },

  // ---- Topbar task: the Day Rail becomes browsable (components/DayRail.tsx,
  // pages/TodayView.tsx) — tapping/swiping to a step PREVIEWS that state
  // without writing the athlete's real day override. This chip is the one
  // "you're just looking" affordance, shown only while a preview is active.
  dayRailPreviewChip: { de: 'VORSCHAU · ZURÜCK ZU HEUTE', en: 'PREVIEW · BACK TO TODAY' },
  dayRailPreviewAria: { de: 'Vorschau verlassen und zu heute zurückkehren', en: 'Exit preview and return to today' },

  // ---- Topbar task: the real profile header (components/ProfileAvatar.tsx),
  // the Cover Meta row's Avatar (bUuzT/ToC54) — links to /profile, matching
  // DashboardHeaderBar's own rider-profile avatar.
  profileAvatarAria: { de: 'Mein Profil', en: 'My profile' },

  // ---- Task: chart interaction — scrub-to-read + keyboard parity ----------
  // (motion/useScrub.ts, motion/useListNav.ts, motion/touchTarget.ts). Every
  // chart's one focusable container and its aria-live readout route through
  // these — see the owning components for how each is used.
  pmcPlotAriaHint: {
    de: 'Zum Lesen eines Tages berühren, ziehen oder Pfeiltasten verwenden',
    en: 'Touch, drag, or use arrow keys to read a day',
  },
  pmcScrubReadout: {
    de: '{date} · FITNESS {ctl} · ERMÜDUNG {atl} · FORM {tsb}',
    en: '{date} · FITNESS {ctl} · FATIGUE {atl} · FORM {tsb}',
  },
  fatigueCurveAriaLabel: {
    de: 'Ermüdungskurve: Jetzt-Wert und neutrale Rückkehr',
    en: 'Fatigue curve: now value and neutral return',
  },
  barsAriaLabel: { de: 'Geplante Wattzahl je Blockabschnitt', en: 'Planned watts per block' },
  barsReadout: { de: '{label} · {watts} W', en: '{label} · {watts} W' },
  zoneRowsAriaLabel: { de: 'Zeit in den Herzfrequenzzonen', en: 'Time in heart-rate zones' },
  zoneRowsReadout: { de: '{zone} · {range} · {time}', en: '{zone} · {range} · {time}' },
  weekRailAriaLabel: {
    de: 'Trainingsbelastung der letzten sieben Tage',
    en: 'Training load over the last seven days',
  },
  weekRailReadout: { de: '{letter} · {tss} TSS', en: '{letter} · {tss} TSS' },
  peakRowsAriaLabel: { de: 'Spitzenleistung nach Dauer', en: 'Peak power by duration' },
  liveRingReadout: { de: '{label}: {value} {unit}', en: '{label}: {value} {unit}' },
  routeOptionsAriaLabel: { de: 'Streckenoptionen', en: 'Route options' },

  // ---- Real-data audit (2026-08-06): the withheld-readiness hero ----------
  // (MetricTrack.tsx, pages/TodayView.tsx). The account's wearable hadn't
  // synced since Monday when this was found — `readiness` rendered a 64px
  // em dash (~57×55px, a "fat grey rectangle") instead of the designed,
  // dated withheld state `utils/readinessGate.ts` already specifies for the
  // rest of the app. These two headline/detail pairs are that gate's
  // 'pending'/'stale' copy, transcribed into EDITORIAL II's own terse
  // register — see `data/useTodayModel.ts`'s `readiness`/`readinessGate`/
  // `readinessGateHeadline` for how the gate selects between them.
  heroReadinessPendingHeadline: { de: 'Nacht-Werte stehen noch aus', en: 'Overnight data still landing' },
  heroReadinessPendingDetail: {
    de: 'Deine Bereitschaft erscheint, sobald die Uhr die Nacht hochgeladen hat. Der Plan unten steht schon.',
    en: 'Your readiness appears once your watch uploads last night. The plan below already stands.',
  },
  heroReadinessStaleHeadline: { de: 'Seit {n} Tagen keine Nacht-Werte', en: 'No overnight data for {n} days' },
  heroReadinessStaleDetail: {
    de: 'Letzte Messung {day}. Der Trainingsplan gilt trotzdem.',
    en: 'Last reading {day}. Your plan still stands.',
  },
  heroReadinessSyncAction: { de: 'Jetzt synchronisieren', en: 'Sync now' },
  heroReadinessSyncPending: { de: 'Synchronisiere…', en: 'Syncing…' },
  heroReadinessSyncDone: { de: 'Synchronisiert', en: 'Synced' },
  heroReadinessSyncError: { de: 'Synchronisierung fehlgeschlagen.', en: 'Sync failed.' },

  // ---- Real-data audit (2026-08-06): Evening's bedtime numeral ------------
  // is ALWAYS this arm (no source anywhere, see `eveningLightsOutMissing`'s
  // own doc comment) — it was rendering the SAME oversized dash bug, at
  // 146px (numeralFit('—') never shrinks a 1-glyph string), the worst case
  // of the defect above. Short composed headline, paired with the existing
  // `eveningLightsOutMissing` detail sentence.
  eveningLightsOutHeadline: { de: 'Kein Zubettgeh-Ziel', en: 'No bedtime target' },

  // ---- Real-data audit (2026-08-06): the session title overflow -----------
  // (pages/TodayView.tsx's `headlineFit`). No new copy — this note documents
  // why `chipWorkShape` below exists in the same audit pass.

  // ---- Real-data audit (2026-08-06): the block-count disagreement ---------
  // (pages/TodayView.tsx). The real session (`MAP — 5×3min @ 110% FTP`) has
  // 11 total blocks (warm-up + 5 work + 4 recovery + cool-down) but only 5
  // WORK intervals — Training's Insight Strip already reports the 5 (real,
  // `workBlockSummary`), while the numbered section's own chip separately
  // reported 11 under the identical "BLÖCKE" word, reading as a
  // contradiction on one screen. Re-reading the pen live (`HwC47`/`r8stp3`,
  // Training's "02 The Session") found that chip is not a block count at
  // all — it is "STARTS 17:30", a start-time chip with no TodayModel source
  // (same permanently-missing gap `noStartTimeToday` already names
  // elsewhere in this file) — so Training's chip is now dropped rather than
  // inventing a count the pen never asked for. Trained's own "01 The
  // Session" chip (`d3DbRa`) reads "4 × 12 MIN" in the pen — a work-shape
  // summary (work-interval count × duration), not a raw block count either.
  // `chipWorkShape` is that shape, built from the same `workIntervalsOf()`
  // read `workBlockSummary`/`trainingSessionClaim` already use — so Trained
  // and Training now agree with each other (and with Training's own Insight
  // Strip) on what "5" refers to, instead of a second screen inventing an
  // 11 no one asked for.
  chipWorkShape: { de: '{n} × {m} MIN', en: '{n} × {m} MIN' },

  // ---- Design pass (2026-08-06): honest counts -------------------------------
  // `insightStripCaption` ("TODAY IN THREE NUMBERS") is only true on Trained
  // and Evening, which really do show three signals — Rest and Training's
  // own strip has always rendered two (its own third column has no
  // TodayModel source at all, see InsightStrip.tsx's own doc comment), so
  // the caption was quietly claiming a count the row never delivered. Found
  // live at 390×844 against the real account. `InsightStrip` now picks
  // between this and the original by `items.length`, rather than one
  // caption baked in regardless of what it's captioning.
  insightStripCaptionTwo: { de: 'HEUTE IN ZWEI ZAHLEN', en: 'TODAY IN TWO NUMBERS' },
  // Trainingstag's hero numeral (owner ruling 2026-08-06). The app already
  // calls body battery an "Energiereserve" in BiometricsDetail/IntradayModal,
  // so ENERGIE is the term the athlete has already met, not a new coinage.
  heroUnitEnergy: { de: 'ENERGIE', en: 'ENERGY' },

  // ---- Trainingstag compression (roadbook rebuild, 2026-08-06) -------------
  tripletLoad: { de: 'BELASTUNG', en: 'LOAD' },
  /** VerdictRow's qualifier counts the session's blocks — "0:52 · IF 0,74 ·
   *  11 Teile". Every block, not just the work intervals: this is the
   *  session's length, not its shape (`chipWorkShape` is the shape, and the
   *  two disagreeing under one word is a defect this build already fixed). */
  blocksWord: { de: 'Teile', en: 'parts' },
  weekMeterLabel: { de: 'WOCHE · {pct} % VERBRAUCHT', en: 'WEEK · {pct}% SPENT' },
  /** The four wearable metrics named inline, so the Erholung section can say
   *  "no reading since Monday" once instead of dashing four rows that each
   *  repeat it. Not a chart caption: it is the list of what is missing. */
  recoveryMetricsInline: { de: 'HRV · Ruhepuls · Schlaf · Schlafphasen', en: 'HRV · Resting HR · Sleep · Sleep stages' },
  /** Phase + countdown. Two arms: an athlete on a fitness-builder plan has a
   *  phase but no event, and "noch — Tage" is not a sentence. */
  phaseWithEvent: { de: 'Phase {phase} — noch {days} Tage bis {event}.', en: 'Phase {phase} — {days} days to {event}.' },
  phaseNoEvent: { de: 'Phase {phase}.', en: 'Phase {phase}.' },
  /** The sync action beside the dated stale-wearable line. The design pass
   *  cut a ~120px orange card down to this one line; the action survives
   *  because withholding a verdict without offering the fix is a dead end. */
  syncAction: { de: 'Synchronisieren', en: 'Sync' },
  /** Tomorrow, as one line at the foot of the screen. `unlockLabel` has no
   *  source on PlannedWorkout (no time-of-day field exists anywhere), so the
   *  time arm only renders when a real one arrives. */
  tomorrowLine: { de: 'Morgen {title}', en: 'Tomorrow {title}' },
  tomorrowLineWithTime: { de: 'Morgen {title} · {time}', en: 'Tomorrow {title} · {time}' },

  // ---- Task 4: CassetteHero (components/CassetteHero.tsx) -----------------

  // ---- Task 9: KetteStrip (components/KetteStrip.tsx) — the chain is the
  // streak, the break, and the week's XP bar. `ketteBroken` names the
  // planned session that was skipped (`model.missedYesterday`, Task 5) —
  // guilt attaches only to a chosen skip, never to a rest day or a
  // physiological reading, so this key stays factual and direct, not cruel
  // and not softened (owner ruling, 2026-08-07).
  ketteHolds: { de: 'Heute fahren hält die Kette bei {days} Tagen.', en: 'Riding today holds the chain at {days} days.' },
  ketteBroken: { de: 'Die Kette ist gerissen — {title} ausgelassen.', en: 'The chain broke — {title} skipped.' },
  ketteXp: { de: '{spent} / {planned} XP', en: '{spent} / {planned} XP' },
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
