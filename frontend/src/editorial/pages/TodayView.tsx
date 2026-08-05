import { Flame, Thermometer, Wind } from 'lucide-react'
import Bars from '../components/Bars'
import Cover from '../components/Cover'
import DayMark from '../components/DayMark'
import DayRail from '../components/DayRail'
import DeltaRow from '../components/DeltaRow'
import FatigueCurve from '../components/FatigueCurve'
import InsightStrip from '../components/InsightStrip'
import MetricTrack from '../components/MetricTrack'
import PeakRows, { type PeakTotal } from '../components/PeakRows'
import PMCChart from '../components/PMCChart'
import QuotePlate from '../components/QuotePlate'
import RangeRow from '../components/RangeRow'
import SecHead from '../components/SecHead'
import Statement from '../components/Statement'
import StatTile from '../components/StatTile'
import StatusBar from '../components/StatusBar'
import TabBar from '../components/TabBar'
import TomorrowBand from '../components/TomorrowBand'
import TomorrowPlate from '../components/TomorrowPlate'
import Verdict from '../components/Verdict'
import WeekRail from '../components/WeekRail'
import WhatThisChanges from '../components/WhatThisChanges'
import ZoneRows from '../components/ZoneRows'
import { isPresent, mapValue, missing, present, type Value } from '../data/value'
import type { PmcPoint, TodayModel } from '../data/useTodayModel'
import EditorialRoot from '../EditorialRoot'
import type { DayState } from '../state/dayState'
import type { CSSProperties } from 'react'
import { useCopy, type Copy } from '../i18n/useCopy'
import { intlLocale } from '../i18n/copy'

/**
 * The Today screen's layout, as a pure function of an already-assembled
 * TodayModel. Splitting it from the hook is what lets a fixture render the
 * real screen — no React Query, no auth, no backend — which is how these
 * screens get looked at rather than merely type-checked.
 *
 * The spine every Today state shares:
 *   StatusBar → Hero (Meta → Day Rail → headline → numeral → context) →
 *   Hero Body → Insight Strip → numbered sections → Tomorrow → TabBar
 *
 * TRAINED (task 8/9, LdBJ4): the numeral is the day's TSS; the numbered
 * sections are "01 THE SESSION" / "02 THE COST" / "03 TRAJECTORY".
 *
 * REST (task 10, RYP0r) and TRAINING (task 10, x4AxA5) share almost
 * everything with each other and with Trained: same Meta/DayRail/DayMark
 * spine, same "03 TRAJECTORY" section verbatim (it was already
 * state-agnostic — no branch needed). What differs:
 *  - The hero numeral is READINESS (0-100), not TSS — both frames' own
 *    "Metric Track" (cD3YC/sqYG1) show a score, not a session cost.
 *  - The hero headline is the coach's own verdict headline on Rest
 *    (there is no session to name) and the session title on Training
 *    (matches Trained's own use of the same slot).
 *  - "01 RECOVERY" (QvlIq/iLewU) replaces "01 THE SESSION": three
 *    `RangeRow`s (HRV/RESTING HR/SLEEP) plus a sleep-composition bar —
 *    identical between Rest and Training (both instance the same
 *    component/RangeRow, KT5iR — see RangeRow.tsx's own doc comment for
 *    the one deliberate departure, Training's bespoke 10-segment Track).
 *  - "02" differs by state: Rest's "ABSORPTION" (JzYYR) is a fatigue-decay
 *    band computed from `model.recovery`; Training's "THE SESSION" (HwC47)
 *    reuses the session-cost tiles and adds a session-preview `Bars` (now
 *    `emphasizeMax`-tinted) instead of the plan-vs-ridden comparison —
 *    there is no ride yet to compare against.
 *  - Rest's hero body carries `WeekRail`, the Mon-Sun load strip
 *    (`model.week`) — Training's own hero body instead shows a
 *    session-preview `Bars` before its `Verdict`.
 *  - Both get a `TomorrowBand` before the tab bar; Trained does not (out of
 *    this task's scope).
 *
 * Two things this hero deliberately leaves out, both recorded in
 * task-8-report.md as TodayModel gaps rather than invented:
 *  - The Cover's background photo — TodayModel carries no ride-photo field.
 *  - The RC context line's season-best clause and the Hero Body's
 *    power-trace bar chart — comparisons TodayModel has no field for.
 * Task 10 additionally leaves out, for the SAME reason (no TodayModel
 * source), the "DAY STATE" swap-action pill Training's hero body repeats
 * outside DayRail, and Training's own Route/GPX sub-section (route name,
 * elevation profile, "SEND GPX TO GARMIN") — TodayModel has no route data
 * at all, and neither is in this task's own enumerated "genuinely new"
 * list (sleep composition, absorption band, session-preview bars,
 * conditions). See task-10-report.md.
 *
 * CORRECTED (coordinator's formal review, finding 1): the MetricTrack call
 * for session load previously passed "SESSION LOAD" as `label`, which
 * rendered it as a caption ABOVE the numeral. Trained's own Metric Track
 * has no such caption — "SESSION LOAD" is the unit stack's second line,
 * next to "TSS". Now passed as `unitSub`; `label`/`state` are both empty,
 * so MetricTrack renders no top caption at all for this call, matching the
 * pen exactly. See MetricTrack.tsx's own doc comment for the full record.
 */
/**
 * Thin wrapper: `EditorialRoot` is the one place `CopyLocaleProvider` mounts
 * (bridging the app's real `contexts/LocaleContext` locale in, defaulting to
 * German when unmounted — see `i18n/useCopy.ts`'s own doc comment). Every
 * translated string this screen renders — including its OWN `useCopy()`
 * call below, not just its child components' — must be a DESCENDANT of that
 * provider to see the right locale. `EditorialRoot` is rendered as this
 * component's own JSX, i.e. a CHILD, not an ancestor — calling `useCopy()`
 * directly in this outer function would resolve against whatever (if
 * anything) wraps `<TodayView>` itself, not against `EditorialRoot`'s own
 * provider, splitting the screen between two different locales (caught by
 * rendering the visual harness: TabBar/DayRail — real descendants of
 * `EditorialRoot` — rendered English while `SecHead` titles — computed by
 * this function before its own `return` — rendered German). `TodayViewBody`
 * below carries the entire original component; this wrapper only supplies
 * the state EditorialRoot needs.
 */
export default function TodayView({ model }: { model: TodayModel }) {
  return (
    <EditorialRoot state={model.state}>
      <TodayViewBody model={model} />
    </EditorialRoot>
  )
}

function TodayViewBody({ model }: { model: TodayModel }) {
  const { t, locale } = useCopy()
  const { state } = model
  const isRestOrTraining = state === 'rest' || state === 'training'

  const sessionLoad: Value<number> = isPresent(model.session)
    ? model.session.value.tss != null
      ? present(model.session.value.tss)
      : missing(t('noTssEstimate'))
    : missing(model.session.missing)

  const sessionName: Value<string> = mapValue(model.session, (s) => s.title)

  const sessionContext: Value<string> = missing(t('heroSessionContextMissing'))

  // ---- Hero headline/numeral, per state -----------------------------------
  // Rest has no session to name today, so its headline is the coach's own
  // verdict headline (M4EaH/NSNJa, "Absorb, don't add." in the pen — a
  // coaching statement, not a title). Training and Trained both name the
  // session (A8Mcb / Foot's own "Session" text).
  const heroHeadline: Value<string> = state === 'rest' ? mapValue(model.verdict, (v) => v.headline) : sessionName

  const heroNumeralValue: Value<number> = state === 'trained' ? sessionLoad : mapValue(model.readiness, (r) => r.score)
  const heroNumeralUnit = state === 'trained' ? t('heroUnitTss') : t('heroUnitReadiness')
  const heroNumeralUnitSub = state === 'trained' ? t('heroUnitSessionLoad') : t('heroUnitOutOf100')
  const heroNumeralHue = state === 'trained' ? 'var(--m-load)' : 'var(--st-active)'

  // "▲ N vs yesterday" (Rest's GoFzO / Training's B1DqG) — real, from
  // readiness.deltaVsYesterday. The season-best line (Rest's EqI8Z "3 off
  // your 90-day best" / Training's c7Y2u3 "cleared for full intensity") has
  // no TodayModel source at all — always missing, printed once.
  const readinessDeltaLine: Value<string> = isPresent(model.readiness) && model.readiness.value.deltaVsYesterday != null
    ? present(t('heroReadinessDeltaVsYesterday', {
      sign: model.readiness.value.deltaVsYesterday >= 0 ? '▲' : '▼',
      n: Math.abs(model.readiness.value.deltaVsYesterday),
    }))
    : missing(isPresent(model.readiness) ? t('heroReadinessDeltaMissing') : model.readiness.missing)
  const readinessContextLine: Value<string> = missing(t('heroReadinessContextMissing'))

  const todayIndex = (new Date().getDay() + 6) % 7

  const insightItems = (() => {
    if (state === 'trained') {
      return [
        { label: t('insightPeakPower'), value: missing<string>(t('insightPeakPowerMissing')) },
        { label: t('insightUntilNeutral'), value: mapValue(model.recovery, (r) => t('hoursSuffix', { n: Math.round(r.hoursRemaining) })) },
        { label: t('insightFitness'), value: mapValue(model.pmc, (p) => `${Math.round(p.fitness)}`) },
      ]
    }
    const clearWeekday = isPresent(model.recovery) ? model.recovery.value.clearAtLabel.split(' ')[0].toUpperCase() : null
    const untilLabel = clearWeekday ? t('insightUntilWeekdayCleared', { weekday: clearWeekday }) : t('insightUntilCleared')
    const formItem = { label: t('insightForm'), value: mapValue(model.pmc, (p) => signed(Math.round(p.form))) }
    // The pen's own first column ("3 OF 3" / "RECOVERY MARKERS ___") has no
    // TodayModel source at all — not a data gap that might resolve, a slot
    // nothing was ever wired to (coordinator review, finding 1). A
    // three-column strip with one column that can NEVER populate reads as a
    // design lie, so the column is dropped rather than kept as a permanent
    // dash — Rest and Training render a two-item strip, not three.
    if (state === 'rest') {
      return [
        { label: untilLabel, value: mapValue(model.recovery, (r) => t('hoursSuffix', { n: Math.round(r.hoursRemaining) })) },
        formItem,
      ]
    }
    // training
    return [
      { label: t('insightAtThreshold'), value: workBlockSummary(sessionBlocksOf(model, t), t) },
      formItem,
    ]
  })()

  // ---- 01 The Session (Trained only) ---------------------------------------
  const sessionBlocks = isPresent(model.session)
    ? model.session.value.blocks.map((b) => ({
      label: b.label,
      minutes: b.minutes,
      watts: b.watts != null ? present(b.watts) : missing<number>(t('blockNoTarget')),
      delta: null as number | null,
    }))
    : []
  const sessionClaim: Value<string> = mapValue(model.planVsRidden, () => '')

  const peaksTotal: Value<PeakTotal> = isPresent(model.peaks) && model.peaks.value.length > 0
    ? present({
      watts: model.peaks.value[model.peaks.value.length - 1].watts,
      unit: `${t('unitWatts')} · ${model.peaks.value[model.peaks.value.length - 1].duration}`,
      delta: null,
    })
    : missing(isPresent(model.peaks) ? t('noPeakIdentified') : model.peaks.missing)

  const rideMicro: Value<string> = mapValue(model.ride, (r) => [
    r.distanceM != null ? `${(r.distanceM / 1000).toLocaleString(intlLocale(locale), { maximumFractionDigits: 1, minimumFractionDigits: 1 })} KM` : null,
    r.kj != null ? `${r.kj.toLocaleString(intlLocale(locale))} KJ` : null,
    r.avgHr != null ? t('rideMicroBpmAvg', { n: r.avgHr }) : null,
    r.np != null ? t('rideMicroNp', { n: r.np }) : null,
  ].filter(Boolean).join('     '))

  // ---- 02 The Cost (Trained) ------------------------------------------------
  const costTiles: { label: string; value: Value<number | string>; unit: string }[] = [
    { label: t('tileLoad'), value: sessionLoad, unit: t('unitTss') },
    {
      label: t('tileTime'),
      value: isPresent(model.session)
        ? present(formatHoursMinutes(model.session.value.blocks.reduce((sum, b) => sum + b.minutes, 0)))
        : missing(model.session.missing),
      unit: t('unitHours'),
    },
    {
      label: t('tileIntensity'),
      value: isPresent(model.session)
        ? model.session.value.intensityFactor != null
          ? present(model.session.value.intensityFactor.toLocaleString(intlLocale(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
          : missing(t('noIntensityFactor'))
        : missing(model.session.missing),
      unit: t('unitIf'),
    },
    {
      label: t('tilePower'),
      value: isPresent(model.session)
        ? model.session.value.targetWatts != null
          ? present(model.session.value.targetWatts)
          : missing(t('noUniformTarget'))
        : missing(model.session.missing),
      unit: t('unitWatts'),
    },
  ]

  const fatigueDelta1d = isPresent(model.pmc) ? pmcDelta(model.pmc.value.series, 1, (p) => p.atl) : null
  const costClaim: Value<string> = isPresent(model.pmc) && fatigueDelta1d != null
    ? present(fatigueDelta1d >= 0 ? t('costClaimJumped', { n: fatigueDelta1d }) : t('costClaimEased', { n: Math.abs(fatigueDelta1d) }))
    : missing(isPresent(model.pmc) ? t('notEnoughFatigueHistory') : model.pmc.missing)

  // ---- 02 Absorption (Rest) -------------------------------------------------
  // "ABSORPTION · 48 HOURS" (F42AYn) is a literal, hardcoded label in the
  // pen itself — the section's own declared window, not a value read off
  // any athlete field — so 48 is used here as that same constant, not an
  // invented one. `model.recovery.hoursRemaining` is real; absorbed/
  // remaining is a direct split of that real number against the pen's own
  // stated window. There is no source anywhere for exactly when the prior
  // session ENDED (jdeez's "SESSION ENDED TUE 17:30" tick), so that tick
  // always renders a dash — see the render below.
  const ABSORPTION_WINDOW_H = 48
  const remainingH = isPresent(model.recovery) ? Math.max(0, Math.min(ABSORPTION_WINDOW_H, model.recovery.value.hoursRemaining)) : null
  const absorbedH = remainingH != null ? ABSORPTION_WINDOW_H - remainingH : null

  // Rest's "02 Absorption" cost tiles (A6NJm etc.) describe the SESSION
  // THAT CAUSED the fatigue being absorbed — a different session from
  // `model.session` (which, on a rest day, is "nothing planned"). Nothing
  // in TodayModel identifies or carries that prior session's own cost
  // numbers (no "last completed session" field anywhere) — honestly
  // missing, one reason for all four tiles.
  const NO_LAST_SESSION = t('noLastSession')
  const costTilesRest: { label: string; value: Value<number | string>; unit: string }[] = [
    { label: t('tileLoad'), value: missing(NO_LAST_SESSION), unit: t('unitTss') },
    { label: t('tileTime'), value: missing(NO_LAST_SESSION), unit: t('unitHours') },
    { label: t('tileIntensity'), value: missing(NO_LAST_SESSION), unit: t('unitIf') },
    { label: t('tilePower'), value: missing(NO_LAST_SESSION), unit: t('unitWatts') },
  ]

  // ---- 01 Recovery (Rest + Training) ----------------------------------------
  // No TodayModel field synthesises a composite "all systems say go" style
  // verdict from the three signals below (and the direction of "good" isn't
  // uniform across them — a lower resting HR is good, a lower HRV is not —
  // so this is not safely derivable from the band positions either). This
  // is a permanent, never-resolves gap, not a transient one — so, matching
  // the same rule Trained's own "01 The Session" Statement already follows
  // (`isPresent(sessionClaim) && <Statement .../>`, TodayView.tsx), the
  // Statement is not rendered at all rather than emitting a lone "—" whose
  // only explanation sits several lines below (coordinator review, finding
  // 2 — a `Statement` should never surface content that is ONLY a dash).

  // ---- 02 The Session (Training) --------------------------------------------
  const { workBlocks, uniformWork } = workIntervalsOf(sessionBlocks)
  const trainingSessionClaim: Value<string> = isPresent(model.session)
    ? uniformWork && workBlocks.length > 0
      ? present(t('trainingSessionClaim', { n: workBlocks.length, m: Math.round(workBlocks[0].minutes) }))
      : missing(t('noCleanIntervalPattern'))
    : missing(model.session.missing)

  const trainingTiles: { label: string; value: Value<number | string>; unit: string }[] = [
    {
      label: t('tileTarget'),
      value: isPresent(model.session)
        ? model.session.value.targetWatts != null ? present(model.session.value.targetWatts) : missing(t('noUniformTarget'))
        : missing(model.session.missing),
      unit: t('unitWatts'),
    },
    {
      label: t('tileWork'),
      value: isPresent(model.session)
        ? present(formatHoursMinutes(model.session.value.blocks.reduce((sum, b) => sum + b.minutes, 0)))
        : missing(model.session.missing),
      unit: t('unitMin'),
    },
    {
      label: t('tileIntensity'),
      value: isPresent(model.session)
        ? model.session.value.intensityFactor != null
          ? present(model.session.value.intensityFactor.toLocaleString(intlLocale(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
          : missing(t('noIntensityFactor'))
        : missing(model.session.missing),
      unit: t('unitIf'),
    },
    { label: t('tileLoad'), value: sessionLoad, unit: t('unitTss') },
  ]

  const sessionPreviewCaption: Value<string> = isPresent(model.session)
    ? present(t('sessionPreviewCaption', {
      n: model.session.value.blocks.length,
      hm: formatHoursMinutes(model.session.value.blocks.reduce((sum, b) => sum + b.minutes, 0)),
    }))
    : missing(model.session.missing)

  // ---- 03 Trajectory (all states) --------------------------------------------
  const fitnessDelta7d = isPresent(model.pmc) ? pmcDelta(model.pmc.value.series, 7, (p) => p.ctl) : null
  const trajectoryTiles: { label: string; value: Value<number | string>; unit: string }[] = [
    { label: t('insightFitness'), value: mapValue(model.pmc, (p) => Math.round(p.fitness)), unit: fitnessDelta7d != null ? `${signed(fitnessDelta7d)} / 7D` : '' },
    { label: t('pmcFatigue'), value: mapValue(model.pmc, (p) => Math.round(p.fatigue)), unit: fatigueDelta1d != null ? `${signed(fatigueDelta1d)} / 1D` : '' },
    {
      label: t('insightForm'),
      value: mapValue(model.pmc, (p) => signed(Math.round(p.form))),
      unit: isPresent(model.pmc) ? (model.pmc.value.form < 0 ? t('unitSpent') : model.pmc.value.form > 0 ? t('unitBanked') : t('unitNeutral')) : '',
    },
  ]
  const trajectoryClaim: Value<string> = isPresent(model.pmc) && fitnessDelta7d != null
    ? present(t('trajectoryClaim', {
      dir: fitnessDelta7d >= 0 ? t('trajectoryDirUp') : t('trajectoryDirDown'),
      n: Math.abs(fitnessDelta7d),
      form: model.pmc.value.form < 0 ? t('trajectoryFormSpent') : model.pmc.value.form > 0 ? t('trajectoryFormBanked') : t('trajectoryFormNeutral'),
    }))
    : missing(isPresent(model.pmc) ? t('notEnoughHistoryToChart') : model.pmc.missing)
  const pmcSeries: Value<PmcPoint[]> = mapValue(model.pmc, (p) => p.series)

  // ---- Tomorrow / Today band (Rest + Training) --------------------------------
  const tomorrowSession: Value<{ title: string; unlockLabel: string }> = mapValue(model.tomorrow, (t) => ({
    title: t.title,
    unlockLabel: isPresent(t.unlockLabel) ? t.unlockLabel.value : '',
  }))
  const todaySession: Value<{ title: string; unlockLabel: string }> = mapValue(model.session, (s) => ({
    title: s.title,
    unlockLabel: '',
  }))

  // ---- Quote Plate (all states) — pull-quote copy is editorial writing,
  // legitimately static per state (not athlete data), transcribed verbatim
  // from CqmME (Rest) / X8wnJ (Training) / WVwiD (Trained) — German
  // authored per the pen's own register, English kept as the source (see
  // `i18n/copy.ts`'s `quoteRest`/`quoteTraining`/`quoteTrained`).
  const quoteCopy = state === 'rest'
    ? { quote: t('quoteRest'), attribution: t('quoteRestAttribution') }
    : state === 'training'
      ? { quote: t('quoteTraining'), attribution: t('quoteTrainingAttribution') }
      : state === 'trained'
        ? { quote: t('quoteTrained'), attribution: t('quoteTrainedAttribution') }
        : null

  // ---- Tomorrow Plate (Rest, Trained) / Route Plate (Training) --------------
  // Every field routes through TodayModel where a real source exists; where
  // none does (route distance/elevation, a session's own clock time, sunset)
  // the field is honestly missing, same rule as everywhere else in this
  // model. See task-10.5-report.md for the per-field source record.
  const tomorrowKickerRight: Value<string> = isPresent(model.tomorrow)
    ? present(model.tomorrow.value.title.split(' · ')[0].toUpperCase())
    : missing(model.tomorrow.missing)
  const tomorrowKickerLeft: Value<string> = (() => {
    if (!isPresent(model.tomorrow)) return missing<string>(model.tomorrow.missing)
    const unlock = model.tomorrow.value.unlockLabel
    return isPresent(unlock) ? present(t('tomorrowKickerLeft', { label: unlock.value })) : missing<string>(unlock.missing)
  })()
  // CORRECTED (coordinator visual review, defect 2): this used to fall back
  // to `t.title` when `detail` was empty — but `TomorrowBand` (rendered
  // directly below this plate for Rest/Training) shows that SAME title
  // verbatim, so on any day the plan has no separate description the two
  // sections read as the identical session announced twice, back to back.
  // The pen's own Plate title (Rest: "Four by eight, at 285.") is prose
  // DIFFERENT from the Band's structured "Threshold · 4 × 8 @ 285 W" — real
  // prose has no TodayModel source beyond `detail`, so when `detail` is
  // empty this honestly dashes instead of duplicating the Band's own text.
  const tomorrowPlateTitle: Value<string> = isPresent(model.tomorrow) && model.tomorrow.value.detail
    ? present(model.tomorrow.value.detail)
    : missing<string>(t('noTomorrowDescription'))
  const tomorrowCaptionLeft: Value<string> = missing(t('noRouteDistanceTomorrow'))
  const tomorrowCaptionRight: Value<string> = mapValue(
    model.tomorrow,
    () => (state === 'trained' ? t('tomorrowCaptionWorkDone') : t('tomorrowCaptionMakesPossible')),
  )

  const routeKickerLeft: Value<string> = missing(t('noStartTimeToday'))
  const routeKickerRight: Value<string> = missing(t('noSunsetTime'))
  // CORRECTED (coordinator visual review, defect 2): this used to read
  // `model.session.value.title`, the exact same string `TomorrowBand`
  // renders directly below (`todaySession.title`) — the two sections
  // duplicated the session name back to back. The pen's Route Plate title
  // is real route prose ("Ölberg Loop, four ramps."), and TodayModel has no
  // route-naming field at all (documented since Task 10's own Route/GPX
  // note) — honestly missing, which now also keeps it visibly distinct from
  // the Band rather than accidentally repeating it.
  const routeTitle: Value<string> = missing<string>(t('noRouteNameToday'))
  const routeCaptionLeft: Value<string> = missing(t('noRouteDataToday'))
  const routeCaptionRight: Value<string> = (() => {
    const { workBlocks, uniformWork } = workIntervalsOf(sessionBlocks)
    if (!uniformWork || workBlocks.length === 0) return missing(t('noCleanIntervalPattern'))
    const watts = workBlocks[0].watts
    return isPresent(watts)
      ? present(t('routeCaptionRight', { n: workBlocks.length, m: Math.round(workBlocks[0].minutes), w: watts.value }))
      : missing(t('blockNoTarget'))
  })()

  return (
      <main data-day-state={state} style={{ display: 'flex', flexDirection: 'column' }}>
        <StatusBar time={new Date().toLocaleTimeString(intlLocale(locale), { hour: '2-digit', minute: '2-digit' })} />

        <Cover state={state}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, width: '100%' }}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                <span
                  style={{
                    fontFamily: 'var(--e-body)',
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 1.8,
                    color: 'var(--e-mid)',
                  }}
                >
                  {isPresent(model.dateLabel) ? model.dateLabel.value : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <Flame size={14} color="var(--e-mid)" aria-hidden="true" />
                  <span
                    style={{
                      fontFamily: 'var(--e-body)',
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 1.4,
                      color: 'var(--e-mid)',
                    }}
                  >
                    {isPresent(model.streakDays) ? t('heroStreakDays', { n: model.streakDays.value }) : '—'}
                  </span>
                </div>
              </div>
            </div>

            <DayRail state={state} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            <span
              style={{
                fontFamily: 'var(--e-display)',
                fontSize: 42,
                fontWeight: 800,
                letterSpacing: -2,
                lineHeight: 1,
                color: 'var(--e-ink)',
              }}
            >
              {isPresent(heroHeadline) ? heroHeadline.value : '—'}
            </span>

            <MetricTrack
              label=""
              state=""
              value={heroNumeralValue}
              unit={heroNumeralUnit}
              unitSub={heroNumeralUnitSub}
              delta={null}
              band={null}
              hue={heroNumeralHue}
            />

            {state === 'trained' ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-end' }}>
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)' }}>
                  {isPresent(sessionContext) ? sessionContext.value : sessionContext.missing}
                </span>
              </div>
            ) : (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-end' }}>
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 13, fontWeight: 800, color: 'var(--e-ink)' }}>
                  {isPresent(readinessDeltaLine) ? readinessDeltaLine.value : '—'}
                </span>
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)' }}>
                  {isPresent(readinessContextLine) ? readinessContextLine.value : readinessContextLine.missing}
                </span>
              </div>
            )}

            {state === 'training' && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ width: '100%', height: 1, background: 'var(--e-zone-z3)' }} />
                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Thermometer size={14} color="var(--e-mid)" aria-hidden="true" />
                    <span style={condVal}>{isPresent(model.conditions) ? `${Math.round(model.conditions.value.tempC)}°` : '—'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Wind size={14} color="var(--e-mid)" aria-hidden="true" />
                    <span style={condVal}>{isPresent(model.conditions) ? Math.round(model.conditions.value.windKmh) : '—'}</span>
                    <span style={condUnit}>KM/H</span>
                  </div>
                </div>
                {!isPresent(model.conditions) && <p style={quietReason}>{model.conditions.missing}</p>}
              </div>
            )}
          </div>

          <div style={{ position: 'absolute', top: DAY_MARK_TOP[state] ?? DAY_MARK_TOP.trained, right: 24 }}>
            <DayMark state={state} />
          </div>
        </Cover>

        <div data-hero-body style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '20px 24px 0 24px' }}>
          {state === 'rest' && (
            <div style={{ paddingBottom: 26 }}>
              <WeekRail days={model.week} todayIndex={todayIndex} />
            </div>
          )}
          {state === 'training' && (
            <div style={{ paddingBottom: 26 }}>
              <Bars blocks={sessionBlocks} emphasizeMax />
            </div>
          )}

          {state === 'trained' ? (
            <Verdict
              headline={mapValue(model.verdict, (v) => v.headline)}
              body={mapValue(model.verdict, (v) => v.body)}
            />
          ) : state === 'training' ? (
            <Verdict
              headline={mapValue(model.verdict, (v) => v.headline)}
              body={mapValue(model.verdict, (v) => v.body)}
            />
          ) : (
            // Rest's own hero-body Verdict (oYHto) has no headline slot at
            // all — only the body paragraph (WHDco). Using the `Verdict`
            // component here would render a stray "—" headline row for a
            // slot the frame doesn't have, so Rest renders that one
            // paragraph directly instead.
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
              <p
                style={{
                  fontFamily: 'var(--e-body)', fontSize: 14, fontWeight: 500, lineHeight: 1.45, textAlign: 'center',
                  color: isPresent(model.verdict) ? 'var(--e-mid)' : 'var(--e-quiet)', margin: 0, width: 320, maxWidth: '100%',
                }}
              >
                {isPresent(model.verdict) ? model.verdict.value.body : model.verdict.missing}
              </p>
            </div>
          )}
        </div>

        <InsightStrip items={insightItems} />

        {state === 'trained' && (
          <section data-section="01" style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '42px 24px 0 24px' }}>
            <SecHead
              index="01"
              title={t('sectionTheSession')}
              kicker
              chip={isPresent(model.session) ? t('chipBlocks', { n: model.session.value.blocks.length }) : undefined}
            />
            {isPresent(sessionClaim) && <Statement claim={sessionClaim} />}

            <div style={{ paddingTop: 24 }}>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '10px 0 9px 0' }}>
                <span style={kickerLabel}>{t('whatYouRode')}</span>
                <span style={kickerLabelQuiet}>
                  {isPresent(model.session) && model.session.value.targetWatts != null
                    ? t('targetWatts', { w: model.session.value.targetWatts })
                    : ''}
                </span>
              </div>

              <DeltaRow blocks={sessionBlocks} />

              <div data-ridden-row style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                {sessionBlocks.map((b, i) => (
                  <div
                    key={i}
                    style={{ flex: b.minutes || 1, height: 8, borderRadius: '3px 3px 0 0', background: 'var(--e-bar-dim)' }}
                  />
                ))}
              </div>
              {!isPresent(model.planVsRidden) && (
                <p style={quietReason}>{model.planVsRidden.missing}</p>
              )}

              <div data-baseline style={{ width: '100%', height: 1, background: 'var(--e-baseline)', margin: '10px 0' }} />

              <Bars blocks={sessionBlocks} />
              <div style={{ width: '100%', paddingTop: 8 }}>
                <span style={kickerLabelQuiet}>{t('whatWasPlanned')}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '18px 0 0 0' }}>
              <div style={{ width: '100%', height: 1, background: 'var(--e-hairline)' }} />
              <span style={{ fontFamily: 'var(--e-body)', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: 'var(--e-mid)' }}>
                {isPresent(rideMicro) ? rideMicro.value : rideMicro.missing}
              </span>
            </div>

            <div style={{ paddingTop: 28 }}>
              <PeakRows total={peaksTotal} peaks={model.peaks} />
            </div>

            <div style={{ paddingTop: 28 }}>
              <ZoneRows zones={model.zones} />
            </div>

            <div style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ width: '100%', height: 1, background: 'var(--e-hairline)' }} />
              <span style={kickerLabelDim}>{t('whatThisChangesHeading')}</span>
              <WhatThisChanges value={model.whatThisChanges} />
            </div>
          </section>
        )}

        {isRestOrTraining && (
          <section data-section="01" style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '42px 24px 0 24px' }}>
            <SecHead
              index="01"
              title={t('sectionRecovery')}
              kicker
              sub={t('recoverySub')}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 20 }}>
              <RangeRow
                label={t('labelHrv')}
                value={mapValue(model.hrv, (h) => h.value)}
                unit={t('unitMs')}
                band={isPresent(model.hrv) ? model.hrv.value.band : null}
                delta={isPresent(model.hrv) ? model.hrv.value.delta : null}
              />
              <RangeRow
                label={t('labelRestingHr')}
                value={mapValue(model.restingHr, (h) => h.value)}
                unit={t('unitBpm')}
                band={isPresent(model.restingHr) ? model.restingHr.value.band : null}
                delta={isPresent(model.restingHr) ? model.restingHr.value.delta : null}
              />
              <RangeRow
                label={t('labelSleep')}
                value={mapValue(model.sleep, (s) => s.totalS)}
                unit={t('unitH')}
                band={null}
                format={formatHM}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 20 }}>
              <span style={kickerLabelDim}>
                {t('sleepComposition')}{isPresent(model.sleep) ? t('sleepCompositionTotal', { hm: formatHM(model.sleep.value.totalS) }) : ''}
              </span>
              {isPresent(model.sleep) ? (
                <>
                  <div style={{ width: '100%', height: 10, display: 'flex', borderRadius: 2, overflow: 'hidden' }}>
                    {sleepParts(model.sleep.value, t).map((p) => (
                      p.seconds != null && p.seconds > 0
                        ? <div key={p.key} style={{ flex: p.seconds, height: 10, background: p.color }} />
                        : null
                    ))}
                  </div>
                  <div style={{ width: '100%', display: 'flex' }}>
                    {sleepParts(model.sleep.value, t).map((p) => (
                      <div key={p.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1, color: 'var(--e-lo)' }}>
                          {p.label}
                        </span>
                        <span style={{ fontFamily: 'var(--e-body)', fontSize: 13, fontWeight: 800, color: 'var(--e-ink)' }}>
                          {p.seconds != null ? formatHM(p.seconds) : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p style={quietReason}>{model.sleep.missing}</p>
              )}
            </div>
          </section>
        )}

        {quoteCopy && (
          <QuotePlate state={state} quote={quoteCopy.quote} attribution={quoteCopy.attribution} />
        )}

        {state === 'trained' && (
          <section data-section="02" style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '42px 24px 0 24px' }}>
            <SecHead
              index="02"
              title={t('sectionTheCost')}
              kicker
              chip={isPresent(model.recovery) ? t('chipHoursToRun', { n: Math.round(model.recovery.value.hoursRemaining) }) : undefined}
            />
            <Statement claim={costClaim} />

            <div style={{ width: '100%', display: 'flex', paddingTop: 20 }}>
              {costTiles.map((tile) => (
                <StatTile key={tile.label} label={tile.label} value={tile.value} unit={tile.unit} />
              ))}
            </div>

            <div style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <span style={kickerLabelDim}>{t('fatigueNext48h')}</span>
              <FatigueCurve pmc={model.pmc} recovery={model.recovery} />
            </div>
          </section>
        )}

        {state === 'rest' && (
          <section data-section="02" style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '42px 24px 0 24px' }}>
            <SecHead
              index="02"
              title={t('sectionAbsorption')}
              kicker
              sub={t('absorptionSub')}
            />
            {/* No Statement here, for the same reason 01 has none: the pen's
                claim ("Still absorbing Tuesday.") needs the last session's own
                weekday, which TodayModel cannot supply. A slot that can never
                resolve renders nothing, not a dash implying a transient gap.
                The tiles below carry the one honest reason. */}

            <div style={{ width: '100%', display: 'flex', paddingTop: 20 }}>
              {costTilesRest.map((tile) => (
                <StatTile key={tile.label} label={tile.label} value={tile.value} unit={tile.unit} hideReason />
              ))}
            </div>
            {/* Every tile above shares the exact same reason (no "last
                completed session" field exists at all) — printed once here,
                not once per tile (coordinator review, finding 4). */}
            <p style={quietReason}>{NO_LAST_SESSION}</p>

            <div style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <span style={kickerLabelDim}>{t('absorptionHours', { n: ABSORPTION_WINDOW_H })}</span>
              {isPresent(model.recovery) ? (
                <>
                  <div style={{ width: '100%', height: 12, display: 'flex', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ flex: (absorbedH ?? 0) || 0.001, height: 12, background: 'var(--st-active)' }} />
                    <div style={{ flex: (remainingH ?? 0) || 0.001, height: 12, background: 'var(--d-2)' }} />
                  </div>
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={tickStyle} title={t('absorptionNoEndTime')}>—</span>
                    <span style={tickStyle}>{t('absorptionClearAt', { label: model.recovery.value.clearAtLabel.toUpperCase() })}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--e-body)', fontSize: 10, fontWeight: 700, color: 'var(--e-mid)' }}>
                    {t('absorptionSummary', { a: Math.round(absorbedH ?? 0), r: Math.round(remainingH ?? 0) })}
                  </span>
                </>
              ) : (
                <p style={quietReason}>{model.recovery.missing}</p>
              )}
            </div>
          </section>
        )}

        {state === 'training' && (
          <section data-section="02" style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '42px 24px 0 24px' }}>
            <SecHead
              index="02"
              title={t('sectionTheSession')}
              kicker
              chip={isPresent(model.session) ? t('chipBlocks', { n: model.session.value.blocks.length }) : undefined}
              sub={t('absorptionSub')}
            />
            <Statement claim={trainingSessionClaim} />

            <div style={{ width: '100%', display: 'flex', paddingTop: 20 }}>
              {trainingTiles.map((tile) => (
                <StatTile key={tile.label} label={tile.label} value={tile.value} unit={tile.unit} />
              ))}
            </div>

            <div style={{ paddingTop: 26, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <Bars blocks={sessionBlocks} emphasizeMax />
              <span style={kickerLabelQuiet}>
                {isPresent(sessionPreviewCaption) ? sessionPreviewCaption.value : sessionPreviewCaption.missing}
              </span>
            </div>
          </section>
        )}

        <section data-section="03" style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '42px 24px 0 24px' }}>
          <SecHead
            index="03"
            title={t('sectionTrajectory')}
            kicker
            chip={fitnessDelta7d == null ? undefined : fitnessDelta7d > 0 ? t('chipClimbing') : fitnessDelta7d < 0 ? t('chipDeclining') : t('chipSteady')}
            sub={t('trajectorySub')}
          />
          <Statement claim={trajectoryClaim} />

          <div style={{ width: '100%', display: 'flex', paddingTop: 20 }}>
            {trajectoryTiles.map((tile) => (
              <StatTile key={tile.label} label={tile.label} value={tile.value} unit={tile.unit} />
            ))}
          </div>

          <div style={{ paddingTop: 14 }}>
            <PMCChart series={pmcSeries} days={42} />
          </div>
        </section>

        {(state === 'rest' || state === 'trained') && (
          <TomorrowPlate
            state={state}
            kickerLeft={tomorrowKickerLeft}
            kickerRight={tomorrowKickerRight}
            title={tomorrowPlateTitle}
            captionLeft={tomorrowCaptionLeft}
            captionRight={tomorrowCaptionRight}
          />
        )}
        {state === 'training' && (
          <TomorrowPlate
            state={state}
            kickerLeft={routeKickerLeft}
            kickerRight={routeKickerRight}
            title={routeTitle}
            captionLeft={routeCaptionLeft}
            captionRight={routeCaptionRight}
          />
        )}

        {isRestOrTraining && (
          <div style={{ width: '100%', padding: '30px 24px 0 24px' }}>
            <TomorrowBand
              session={state === 'rest' ? tomorrowSession : todaySession}
              kicker={state === 'rest' ? t('tomorrowBandTomorrow') : t('tomorrowBandToday')}
            />
          </div>
        )}

        <TabBar active="today" />
      </main>
  )
}

const kickerLabel: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.6, color: 'var(--e-mid)',
}
const kickerLabelQuiet: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.6, color: 'var(--e-quiet)',
}
const kickerLabelDim: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.6, color: 'var(--e-lo)',
}
const quietReason: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)', margin: '8px 0 0 0',
}
const condVal: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 700, color: 'var(--e-ink)',
}
const condUnit: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 10, fontWeight: 800, letterSpacing: 1.2, color: 'var(--e-lo)',
}
const tickStyle: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 8.5, fontWeight: 800, letterSpacing: 0.8, color: 'var(--e-lo)',
}

/** Day Mark's absolute `top` offset — pen-verified per state (`K8WxOh` Rest
 *  186, `LRIzl` Training 158, `F6851` Trained 150), previously hardcoded to
 *  150 for every state. Resting/Evening have no pen read yet; they fall
 *  back to Trained's value below rather than guessing. */
const DAY_MARK_TOP: Partial<Record<DayState, number>> & { trained: number } = {
  rest: 186, training: 158, trained: 150,
}

function pmcDelta(series: PmcPoint[], daysBack: number, pick: (p: PmcPoint) => number): number | null {
  if (series.length === 0) return null
  const last = series[series.length - 1]
  const priorIndex = series.length - 1 - daysBack
  const prior = priorIndex >= 0 ? series[priorIndex] : null
  if (prior == null) return null
  return Math.round(pick(last) - pick(prior))
}

function signed(n: number): string {
  if (n > 0) return `+${n}`
  if (n < 0) return `−${Math.abs(n)}`
  return '0'
}

function formatHoursMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = Math.round(totalMinutes % 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Seconds → "H:MM", the format Sleep's own Value text uses ("7:42"). */
function formatHM(totalSeconds: number): string {
  return formatHoursMinutes(totalSeconds / 60)
}

function sleepParts(sleep: { deepS: number | null; remS: number | null; lightS: number | null; awakeS: number | null }, t: Copy['t']) {
  return [
    { key: 'DEEP', label: t('sleepDeep'), seconds: sleep.deepS, color: 'var(--d-4)' },
    { key: 'REM', label: t('sleepRem'), seconds: sleep.remS, color: 'var(--d-3)' },
    { key: 'LIGHT', label: t('sleepLight'), seconds: sleep.lightS, color: 'var(--d-2)' },
    { key: 'AWAKE', label: t('sleepAwake'), seconds: sleep.awakeS, color: 'var(--e-cool)' },
  ]
}

interface BlockLike { label: string; minutes: number; watts: Value<number>; delta: number | null }

function sessionBlocksOf(model: TodayModel, t: Copy['t']): BlockLike[] {
  return isPresent(model.session)
    ? model.session.value.blocks.map((b) => ({
      label: b.label,
      minutes: b.minutes,
      watts: b.watts != null ? present(b.watts) : missing<number>(t('blockNoTarget')),
      delta: null,
    }))
    : []
}

/** The block(s) at the session's own peak wattage are its work intervals —
 *  a real, definitional read of `SessionSummary.blocks`, not an estimate
 *  (see `Bars.tsx`'s own `emphasizeMax` doc comment for the same rule). */
function workIntervalsOf(blocks: BlockLike[]): { workBlocks: BlockLike[]; uniformWork: boolean } {
  const presentWatts = blocks.map((b) => (isPresent(b.watts) ? b.watts.value : null)).filter((w): w is number => w != null)
  const maxWatts = presentWatts.length > 0 ? Math.max(...presentWatts) : null
  const workBlocks = maxWatts != null ? blocks.filter((b) => isPresent(b.watts) && b.watts.value === maxWatts) : []
  const uniformWork = workBlocks.length > 0 && workBlocks.every((b) => b.minutes === workBlocks[0].minutes)
  return { workBlocks, uniformWork }
}

function workBlockSummary(blocks: BlockLike[], t: Copy['t']): Value<string> {
  const { workBlocks, uniformWork } = workIntervalsOf(blocks)
  return uniformWork && workBlocks.length > 0
    ? present(t('workBlockSummary', { n: workBlocks.length }))
    : missing(t('noCleanIntervalPattern'))
}
