import { Thermometer, Wind } from 'lucide-react'
import Bars from '../components/Bars'
import BentoGrid, { type BentoEntry } from '../components/BentoGrid'
import { type TileChart } from '../components/BentoTile'
import CassetteHero from '../components/CassetteHero'
import { COG_TEETH, cogIndexFromReadiness } from '../components/cassetteScale'
import Cover from '../components/Cover'
import { COVER_PHOTO, QUOTE_PHOTO, TOMORROW_PHOTO } from '../components/plateImagery'
import BackToSessionDoneSheet from '../components/BackToSessionDoneSheet'
import DeltaRow from '../components/DeltaRow'
import FatigueCurve from '../components/FatigueCurve'
import HeaderSpine, { type DayStateControl, type ProfileHeaderData } from '../components/HeaderSpine'
import InsightStrip from '../components/InsightStrip'
import Ledger from '../components/Ledger'
import LiveRing from '../components/LiveRing'
import MetricTrack, { type MetricTrackAction } from '../components/MetricTrack'
import { headlineFit } from '../components/numeralFit'
import PeakRows, { type PeakTotal } from '../components/PeakRows'
import PMCChart from '../components/PMCChart'
import QuotePlate from '../components/QuotePlate'
import RangeRow from '../components/RangeRow'
import SecHead from '../components/SecHead'
import Statement from '../components/Statement'
import SwitchDayTypeSheet from '../components/SwitchDayTypeSheet'
import StatTile from '../components/StatTile'
import TabBar from '../components/TabBar'
import TomorrowBand from '../components/TomorrowBand'
import TomorrowPlate from '../components/TomorrowPlate'
import Verdict from '../components/Verdict'
import WeekRail from '../components/WeekRail'
import WhatThisChanges from '../components/WhatThisChanges'
import ZoneRows from '../components/ZoneRows'
import { isPresent, mapValue, missing, present, type Value } from '../data/value'
import type { PmcPoint, TodayModel } from '../data/useTodayModel'
import type { BlockLike } from '../data/blocks'
import EditorialRoot from '../EditorialRoot'
import { dayRailStepTargets } from '../state/dayState'
import type { CSSProperties } from 'react'
import { useCopy, type Copy } from '../i18n/useCopy'
import { intlLocale } from '../i18n/copy'
import { useSwipeStep } from '../motion/useSwipeStep'

// `DayStateControl` and `ProfileHeaderData` moved to `components/HeaderSpine`
// (task 1 review, finding 2): they are the spine's own prop types, and the
// spine now has a second caller (`TrainingDay`, task 7) that must not have to
// reach into this page to find them — a component pointing at a page is
// backwards. Re-exported here so every existing importer of `TodayView`
// keeps working untouched.
export type { DayStateControl, ProfileHeaderData } from '../components/HeaderSpine'

/**
 * The Today screen's layout, as a pure function of an already-assembled
 * TodayModel. Splitting it from the hook is what lets a fixture render the
 * real screen — no React Query, no auth, no backend — which is how these
 * screens get looked at rather than merely type-checked.
 *
 * The spine every Today state shares:
 *   Hero (Meta [date · streak · avatar] → Day Rail → headline → numeral →
 *   context) → Hero Body → Insight Strip → numbered sections → Tomorrow →
 *   TabBar
 *
 * Topbar task: the pen's own mock iOS StatusBar (`components/StatusBar.tsx`)
 * is deleted — a real phone already draws its own — and the Cover's Meta
 * row grows the avatar it was always missing (`components/ProfileAvatar.tsx`,
 * real data via `TodayPage`'s `profile` prop). The Day Rail is also now
 * browsable: tap a step or swipe the screen body left/right to READ any
 * other state without changing the athlete's real day — see
 * `components/DayRail.tsx`'s own doc comment and `state/useDayState.ts`'s
 * `preview`.
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
/** Only these states have a sheet behind the pill (see the plan's Task 13). */
const SWITCHABLE = new Set(['rest', 'training', 'resting'])

export default function TodayView({ model, control, profile }: {
  model: TodayModel
  control?: DayStateControl
  profile?: ProfileHeaderData
}) {
  return (
    <EditorialRoot state={model.state}>
      <TodayViewBody model={model} control={control} profile={profile} />
      {control && (model.state === 'rest' || model.state === 'training') && (
        <SwitchDayTypeSheet
          open={control.openSheet === 'switch'}
          current={model.state}
          onPick={control.onPickDayType}
          onClose={control.onCloseSheet}
        />
      )}
      {control && model.state === 'resting' && (
        <BackToSessionDoneSheet
          open={control.openSheet === 'back'}
          onConfirm={control.onConfirmSessionDone}
          onClose={control.onCloseSheet}
        />
      )}
    </EditorialRoot>
  )
}

function TodayViewBody({ model, control, profile }: {
  model: TodayModel
  control?: DayStateControl
  profile?: ProfileHeaderData
}) {
  const { t, locale } = useCopy()
  const { state } = model
  // Browsing (topbar task): swiping the screen body left/right moves one
  // Day Rail step, exactly like tapping a step — both call `onPreview`,
  // never `setOverride`. `dayRailStepTargets` is the SAME list DayRail
  // itself uses for its own tap targets, so swipe and tap always agree on
  // what "the next step" means. When there is no `control` (a fixture/
  // harness render), `onSelect` below is a no-op — swiping does nothing,
  // matching DayRail's own steps rendering inert without `onStepSelect`.
  const stepTargets = dayRailStepTargets(control?.derived ?? state)
  const swipe = useSwipeStep(stepTargets, state, (next) => control?.onPreview(next))
  const isRestOrTraining = state === 'rest' || state === 'training'
  // Resting (`h54Rs`) shares Rest's Tomorrow Band ("MORGEN"/"TOMORROW") but
  // has none of Rest/Training's "01 Recovery"/"02 Absorption"/"02 The
  // Session" sections — its own numbered sections are entirely different
  // ("01 Right Now", "02 Trajectory"), gated separately below. Evening
  // (`KYS6e`/`cx4zJ`) also carries a Tomorrow Band Wrap at the very bottom
  // of its own frame, below its own "03 Tomorrow" section.
  const showTomorrowBand = isRestOrTraining || state === 'resting' || state === 'evening'

  const sessionLoad: Value<number> = isPresent(model.session)
    ? model.session.value.tss != null
      ? present(model.session.value.tss)
      : missing(t('noTssEstimate'))
    : missing(model.session.missing)

  const sessionName: Value<string> = mapValue(model.session, (s) => s.title)

  const sessionContext: Value<string> = missing(t('heroSessionContextMissing'))

  // ---- Cassette hero caption, per state ------------------------------------
  // Names the COG the rider's own readiness maps to today, via the SAME
  // scale `CassetteHero` uses internally to place the chain
  // (`cogIndexFromReadiness`) — so the caption's tooth count always matches
  // the cog the chain visibly sits on, never a second, independent guess.
  // `trained` looks back on the day just spent ("what is left"); `evening`
  // looks ahead to tomorrow's reading; every other state reads as a
  // same-day claim. The actual Value is computed further down, once
  // `heroNumeralValue` exists — see the dedup comment there.
  const cassetteCaptionKey = state === 'trained'
    ? 'cassetteCaptionSpent'
    : state === 'evening'
      ? 'cassetteCaptionEvening'
      : 'cassetteCaptionAhead'

  // ---- Hero headline/numeral, per state -----------------------------------
  // Rest has no session to name today, so its headline is the coach's own
  // verdict headline (M4EaH/NSNJa, "Absorb, don't add." in the pen — a
  // coaching statement, not a title). Training and Trained both name the
  // session (A8Mcb / Foot's own "Session" text). Evening's own headline
  // (`ifGet`, "Protect tomorrow." — cx4zJ's Cover Foot) is the same shape as
  // Rest's: a coaching statement about the evening ahead, not a session
  // title (the ride, if any, already happened) — so it reads the coach's
  // own verdict headline too.
  // OWNER RULING 2026-08-06: on a Trainingstag the hero used to repeat the
  // session name, which section 02 ("DIE EINHEIT") already carries in full and
  // the Day Rail already names — three sayings of one thing. The hero now
  // carries the coach's own statement instead, like every other state except
  // Trained (where the ride IS the day's headline).
  const heroHeadline: Value<string> = state === 'trained'
    ? sessionName
    : mapValue(model.verdict, (v) => v.headline)

  // Resting's own hero numeral (`h54Rs`/`Q3SvDo`, "91 RECOVERY OUT OF 100")
  // is BODY BATTERY, not training_readiness — "RECOVERY" is a distinct label
  // from Rest/Training's own "READINESS", and only body_battery has a real
  // same-day wake→now shape (matching the Hero Body's "Climb" arc directly
  // below it, `model.bodyBattery`) — training_readiness is a single number
  // with no wake reading anywhere in the API. See task-11-report.md.
  // Same ruling: Training's numeral is the athlete's ENERGY RESERVE, not a
  // second reading of the session. Body battery answers the question a
  // training day actually poses — "have I got it in me today?" — where
  // readiness only restates what the plan already decided.
  // Body battery and readiness come off the SAME watch. When the gate
  // withholds readiness because the watch has not synced, a body-battery
  // numeral is exactly as stale — printing "100" above "Letzte Messung
  // 3. August" would be the screen contradicting itself. So the gate
  // withholds both, and the reason it prints is the dated one.
  const wearableWithheld = model.readinessGate === 'stale' || model.readinessGate === 'pending'
  const bodyBatteryNow: Value<number> = wearableWithheld && !isPresent(model.readiness)
    ? missing<number>(isPresent(model.bodyBattery) ? model.readiness.missing : model.bodyBattery.missing)
    : mapValue(model.bodyBattery, (bb) => bb.now)
  const heroNumeralValue: Value<number> = state === 'trained'
    ? sessionLoad
    : state === 'resting' || state === 'training'
      ? bodyBatteryNow
      : mapValue(model.readiness, (r) => r.score)
  const heroNumeralUnit = state === 'trained'
    ? t('heroUnitTss')
    : state === 'resting'
      ? t('heroUnitRecovery')
      : state === 'training'
        ? t('heroUnitEnergy')
        : t('heroUnitReadiness')
  const heroNumeralUnitSub = state === 'trained' ? t('heroUnitSessionLoad') : t('heroUnitOutOf100')
  const heroNumeralHue = state === 'trained' ? 'var(--m-load)' : 'var(--st-active)'

  // Real-data audit (2026-08-06): the readiness gate's dated headline/tone/
  // action for the missing arm above — meaningful only on Rest/Training's
  // hero (the two states whose numeral IS `model.readiness`; Trained uses
  // session load and Resting uses body battery, neither gated by this
  // rule). `control?.readinessSync` is the page's own sync mutation (a
  // hook `TodayPage.tsx` owns via `useForceSync`), handed down the same way
  // `onSwapDayType`/`onPreview` already are — absent in a fixture render,
  // which then shows no action, matching every other control-gated
  // affordance in this file.
  const heroNumeralUsesReadinessGate = state === 'rest' || state === 'training'
  const heroNumeralMissingHeadline = heroNumeralUsesReadinessGate && model.readinessGateHeadline
    ? model.readinessGateHeadline
    : undefined
  const heroNumeralMissingTone: 'quiet' | 'warn' =
    heroNumeralUsesReadinessGate && model.readinessGate === 'stale' ? 'warn' : 'quiet'
  const heroNumeralMissingAction: MetricTrackAction | undefined =
    heroNumeralUsesReadinessGate && model.readinessGate === 'stale' && control?.readinessSync
      ? {
        label: control.readinessSync.done
          ? t('heroReadinessSyncDone')
          : control.readinessSync.pending
            ? t('heroReadinessSyncPending')
            : t('heroReadinessSyncAction'),
        onPress: control.readinessSync.onSync,
        pending: control.readinessSync.pending,
        done: control.readinessSync.done,
      }
      : undefined

  // Resting's own RC lines (`h54Rs`/`l1W5R`+`hwZsA`, "▲ 3 since this
  // morning" / "top of your 90-day range") — the FIRST line is real,
  // computed from `model.bodyBattery`'s own wake/now pair (unlike Rest's
  // "vs yesterday", which is a different comparison window entirely, so it
  // is not reused here even though a value exists in `readiness.
  // deltaVsYesterday` — that would silently relabel a "vs yesterday" number
  // as "since this morning," which is exactly the kind of mislabeling this
  // build has already been corrected for once). The SECOND line ("top of
  // your 90-day range") is RE-WIRED (audit-b-data gap 2): `bodyBattery90DayHigh`
  // is a real trailing-90-day MAX over `DailyMetric.body_battery`, folding in
  // today's own wake/now reading — see useTodayModel.ts's own doc comment.
  const recoverySinceWakeLine: Value<string> = isPresent(model.bodyBattery)
    ? present(t('heroRecoverySinceWake', {
      sign: model.bodyBattery.value.now - model.bodyBattery.value.wake >= 0 ? '▲' : '▼',
      n: Math.abs(model.bodyBattery.value.now - model.bodyBattery.value.wake),
    }))
    : missing(model.bodyBattery.missing)
  const recoveryRangeLine: Value<string> = isPresent(model.bodyBattery) && isPresent(model.bodyBattery90DayHigh)
    ? (() => {
      const off = Math.round(model.bodyBattery90DayHigh.value - model.bodyBattery.value.now)
      return present(off <= 0 ? t('heroRecoveryRange90Best') : t('heroRecoveryRange90Off', { n: off }))
    })()
    : missing(t('heroRecoveryRangeMissing'))

  // "▲ N vs yesterday" (Rest's GoFzO / Training's B1DqG) — real, from
  // readiness.deltaVsYesterday. The season-best line (Rest's EqI8Z "3 off
  // your 90-day best" / Training's c7Y2u3 "cleared for full intensity") is
  // RE-WIRED (audit-b-data gap 2): `readiness90DayBest` is a real trailing-
  // 90-day MAX over `DailyMetric.training_readiness`, same pattern
  // `breakthrough_detector.py` already uses for power PBs. "cleared for
  // full intensity" (Training's own wording, a coaching verdict rather than
  // a number) still has no source and is not synthesised here — Training
  // gets the same off-best framing as Rest, which is honestly what the data
  // supports.
  const readinessDeltaLine: Value<string> = isPresent(model.readiness) && model.readiness.value.deltaVsYesterday != null
    ? present(t('heroReadinessDeltaVsYesterday', {
      sign: model.readiness.value.deltaVsYesterday >= 0 ? '▲' : '▼',
      n: Math.abs(model.readiness.value.deltaVsYesterday),
    }))
    : missing(isPresent(model.readiness) ? t('heroReadinessDeltaMissing') : model.readiness.missing)
  const readinessContextLine: Value<string> = isPresent(model.readiness) && isPresent(model.readiness90DayBest)
    ? (() => {
      const off = Math.round(model.readiness90DayBest.value - model.readiness.value.score)
      return present(off <= 0 ? t('heroReadinessContext90Best') : t('heroReadinessContext90Off', { n: off }))
    })()
    : missing(t('heroReadinessContextMissing'))
  const rcPrimaryLine: Value<string> = state === 'resting' ? recoverySinceWakeLine : readinessDeltaLine
  const rcSecondaryLine: Value<string> = state === 'resting' ? recoveryRangeLine : readinessContextLine

  // Dedupe reasons (design pass, 2026-08-06): fixing the orphan "—" below
  // (rendering the primary line's own reason instead of a bare dash)
  // surfaced a real duplicate — when the hero numeral itself is entirely
  // missing (`heroNumeralValue`, rendered by `MetricTrack`'s own composed
  // missing block a few lines up), the primary RC line's fallback reason is
  // the SAME underlying Value's `.missing` text (both derive from
  // `model.readiness` on Rest/Training, `model.bodyBattery` on Resting) —
  // printing it twice repeats MetricTrack's own reason a few pixels below
  // it. Suppressed only in that exact case; a present numeral with its own,
  // narrower gap (e.g. a delta with no prior day to compare) still shows
  // its own distinct reason here.
  const rcPrimaryReasonAlreadyShown = !isPresent(heroNumeralValue) && !isPresent(rcPrimaryLine)
    && heroNumeralValue.missing === rcPrimaryLine.missing

  // ---- Cassette hero: series/caption/readiness dedup -----------------------
  // `model.readiness90DaySeries` predates this task's own field-4 (Task 5);
  // fixtures elsewhere in this suite were built before that task and never
  // set it, so it can arrive `undefined` on a plain object cast to
  // `TodayModel` — normalise to an honest missing `Value` here rather than
  // let `isPresent` throw on a field that was never populated.
  const cassetteSeries: Value<number[]> = model.readiness90DaySeries ?? missing(t('ninetyDayHistoryMissing'))
  const cassetteSeriesValues = isPresent(cassetteSeries) ? cassetteSeries.value : []
  // `model.readiness`'s own missing reason already surfaces on the Cover
  // above, verbatim, in one of two spots — computed above, in this exact
  // order. Both checks are gated by where the OTHER Value is actually
  // RENDERED per day state, not merely by content matching — a bug this
  // build shipped once already (coordinator review, 2026-08-07): `evening`
  // never mounts `MetricTrack` (it renders a bespoke lights-out clock block
  // instead — see the render site below), so on that state
  // `heroNumeralValue`'s missing reason, even though it IS `model.readiness`
  // by reference (`mapValue` passes the missing arm through unchanged), is
  // never actually on screen. Without the state guard, the string
  // comparison below was always true whenever readiness was missing,
  // silently suppressing the cassette's own reason for a sentence that had
  // in fact printed nowhere — ten dim cogs, no chain, no explanation.
  //  - `heroNumeralValue` (MetricTrack's own numeral): rendered via
  //    `MetricTrack` on every state EXCEPT `evening` (directly on Rest, and
  //    on Training/Resting whenever `bodyBatteryNow` falls back to it — see
  //    its own doc comment: "the reason it prints is the dated one").
  //  - `rcPrimaryLine` (the RC context row): rendered on every state except
  //    `trained` and `evening` (see the render site below), UNLESS
  //    `rcPrimaryReasonAlreadyShown` already suppressed it as a duplicate of
  //    the FIRST case above — in which case the first case already covers
  //    this text, so there is nothing further to check.
  // Handing the cassette the raw `model.readiness` when either is true would
  // repeat that sentence a third time, so `CassetteHero` gets the REAL
  // `Value` (never a doctored one) plus an explicit boolean telling it
  // whether to print its own copy — see `CassetteHero.tsx`'s own
  // `reasonShownElsewhere` doc comment. When in doubt, this stays false: a
  // duplicated sentence is a small blemish, a missing one is a broken
  // contract.
  const heroNumeralRendersReason = state !== 'evening'
  const cassetteReasonShownByNumeral = heroNumeralRendersReason && !isPresent(model.readiness) && !isPresent(heroNumeralValue)
    && heroNumeralValue.missing === model.readiness.missing
  const cassetteReasonShownByRcLine = !isPresent(model.readiness) && state !== 'trained' && state !== 'evening'
    && !rcPrimaryReasonAlreadyShown && !isPresent(rcPrimaryLine) && rcPrimaryLine.missing === model.readiness.missing
  const cassetteReasonShownElsewhere = cassetteReasonShownByNumeral || cassetteReasonShownByRcLine
  // The caption is meaningless without a readiness score to place on the
  // cassette, and its own "why" is always the exact reason `readiness`
  // already carries — printed either by `CassetteHero`'s own reason
  // paragraph a few lines up (when `!cassetteReasonShownElsewhere`) or by
  // the page elsewhere (when it is). Either way the caption never needs a
  // second copy of that same sentence, so its own reason paragraph stays
  // suppressed via `captionReasonShownElsewhere`, always true here — an
  // explicit flag `CassetteHero` reads, not an empty-reason `Value` it has
  // to infer intent from.
  const cassetteCaption: Value<string> = isPresent(model.readiness)
    ? present(t(cassetteCaptionKey, {
        teeth: COG_TEETH[cogIndexFromReadiness(model.readiness.value.score, cassetteSeriesValues).index],
      }))
    : missing(model.readiness.missing)

  // Find the win, continued: when the secondary RC line IS the true "best
  // in 90 days" claim, it's a real, honest win — give it the day's accent
  // colour and real weight instead of the same quiet grey every other
  // context line uses, so it reads as a highlight rather than trivia.
  const rcSecondaryIsWin = isPresent(rcSecondaryLine)
    && (rcSecondaryLine.value === t('heroReadinessContext90Best') || rcSecondaryLine.value === t('heroRecoveryRange90Best'))
  // Cut the scaffolding (design pass, 2026-08-06): `heroReadinessContextMissing`
  // ("No further readiness context available yet") names nothing — it is
  // the vague, generic filler the design pass calls out by its exact German
  // text. Rest/Training's own secondary line renders nothing rather than
  // that sentence when there's no 90-day comparison to make; Resting's own
  // secondary reason (`heroRecoveryRangeMissing`, "no 90-day best recorded
  // yet") is specific enough to keep.
  const rcSecondaryIsGenericFiller = !isPresent(rcSecondaryLine) && rcSecondaryLine.missing === t('heroReadinessContextMissing')

  // ---- Evening's own hero numeral: a lights-out TIME, not a number --------
  // `xCSBq`/`UxmjR` ("22:30", cx4zJ's Cover Foot "Value") is a recommended
  // bedtime, computed from a sleep-duration target and a wake-alarm time.
  // TodayModel carries neither — no field anywhere derives "when should you
  // be asleep" (`session`/`tomorrow` carry no time-of-day, `sleep` is last
  // NIGHT's already-recorded total, not tonight's target). Permanently
  // missing, not a transient gap — one reason, reused for the numeral, the
  // BarLabels/hypnogram this task deliberately omits (same root cause), and
  // Tonight's own tiles below.
  //
  // CORRECTED (real-data audit, 2026-08-06): this numeral is ALWAYS the
  // missing arm (there is no source, ever), which made it the worst
  // instance of the giant-grey-dash defect — `numeralFit('—')` never
  // shrinks a single glyph, so it rendered a full 146px "—", a solid grey
  // rectangle occupying the top of the screen (found running the real app;
  // static fixtures never rendered this state's honest reality). It now
  // gets the same composed, designed treatment `MetricTrack` gives every
  // other missing hero numeral — see the render site below.
  const eveningLightsOutMissing = t('eveningLightsOutMissing')
  const eveningLightsOutHeadline = t('eveningLightsOutHeadline')

  // Distinct missing-reasons across section 01's three rows, in first-seen
  // order — the sleep-composition strip below shares them, so it suppresses
  // any it would otherwise repeat.
  const recoveryReasons = [...new Set(
    ([model.hrv, model.restingHr, model.sleep] as Value<unknown>[])
      .flatMap((v) => (isPresent(v) ? [] : [v.missing])),
  )]

  // Rest / Resting / Evening look ahead to tomorrow's session; Training and
  // Trained are still inside today's.
  const showsTomorrow = state === 'rest' || state === 'resting' || state === 'evening'

  const todayIndex = (new Date().getDay() + 6) % 7

  const insightItems = (() => {
    if (state === 'evening') {
      // "TONIGHT'S TARGET" / "UNTIL LIGHTS OUT" / "VS YOUR AVERAGE" (`n2uml`/
      // `uYXfH`/`yvy2C`, cx4zJ's own Insight Strip) all derive from the same
      // bedtime-target/wake-alarm data TodayModel does not have — one shared
      // reason, same as the hero numeral above (InsightStrip dedupes its own
      // list, so it prints once here regardless of how many items share it).
      return [
        { label: t('insightTonightTarget'), value: missing<string>(eveningLightsOutMissing) },
        { label: t('insightUntilLightsOut'), value: missing<string>(eveningLightsOutMissing) },
        { label: t('insightVsAverage'), value: missing<string>(eveningLightsOutMissing) },
      ]
    }
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

  // ---- 01 Right Now (Resting) ------------------------------------------------
  // Three `LiveRing`s (`h54Rs`/`W3PK3`+`HzsA8`+`L6fYBh`) — HRV / RESTING HR /
  // SLEEP, the SAME three signals Rest/Training's own "01 Recovery" shows as
  // `RangeRow`s, rendered here as rings instead (task 11's own visual
  // vocabulary for this state). `wake` is each ring's own diff reference —
  // HRV/RESTING HR reconstruct it from `TodayModel`'s already-real `delta`
  // (so the ring's Delta line, "+10 ms"/"−4 bpm", is real data, not
  // invented); SLEEP has no delta field anywhere in `TodayModel`, so its
  // `wake` is honestly missing and its Delta line is silently absent — see
  // `LiveRing.tsx`'s own doc comment for why `wake` here is NOT the same
  // same-day body_battery/stress wake reading the brief's interface names
  // (this screen's three rings are HRV/RHR/Sleep, none of which carry one).
  // Same "no composite verdict" gap as "01 Recovery" above — no Statement.
  const hrvWake: Value<number> = isPresent(model.hrv) && model.hrv.value.delta != null
    ? present(model.hrv.value.value - model.hrv.value.delta)
    : missing(isPresent(model.hrv) ? t('ringDeltaMissing') : model.hrv.missing)
  const restingHrWake: Value<number> = isPresent(model.restingHr) && model.restingHr.value.delta != null
    ? present(model.restingHr.value.value - model.restingHr.value.delta)
    : missing(isPresent(model.restingHr) ? t('ringDeltaMissing') : model.restingHr.missing)
  const sleepWake: Value<number> = missing(t('sleepDeltaMissing'))

  // ---- 02 The Session (Training) --------------------------------------------
  const { workBlocks, uniformWork } = workIntervalsOf(sessionBlocks)
  const trainingSessionClaim: Value<string> = isPresent(model.session)
    ? uniformWork && workBlocks.length > 0
      ? present(t('trainingSessionClaim', { n: workBlocks.length, m: Math.round(workBlocks[0].minutes) }))
      : missing(t('noCleanIntervalPattern'))
    : missing(model.session.missing)

  // Real-data audit (2026-08-06): the block-count disagreement. Training's
  // Insight Strip already reports the real WORK-interval count via
  // `workBlockSummary` ("5 BLÖCKE" for today's real session — 5 actual
  // 3-minute MAP intervals). This section's own chip separately reported
  // `model.session.value.blocks.length` (11 — every block, including
  // warm-up, the 4 recoveries between intervals, and the cool-down) under
  // the IDENTICAL word "BLÖCKE", reading as a contradiction on one screen.
  // Re-reading the pen live (not trusting the recorded tree, per this
  // build's own global rule) found neither number is what the pen actually
  // specifies in either chip slot:
  //  - Training's own "02 The Session" chip (`HwC47`/`r8stp3`) reads
  //    "STARTS 17:30" — a start-time, not a block count at all, and
  //    `PrescribedWorkout` carries no scheduled time-of-day anywhere (the
  //    same permanently-missing gap `noStartTimeToday` already names
  //    elsewhere in this file) — so it renders no chip below, rather than
  //    inventing a count the pen never asked for.
  //  - Trained's own "01 The Session" chip (`d3DbRa`) reads "4 × 12 MIN" —
  //    a work-shape summary (interval count × duration), not a raw block
  //    count either. `workShapeChip` is that shape, built from the SAME
  //    `workBlocks`/`uniformWork` this section's own claim already
  //    computes above — so Trained's chip and Training's Insight Strip now
  //    agree on what "5" refers to, instead of a second screen inventing an
  //    11 nobody asked for. See i18n/copy.ts's `chipWorkShape` for the full
  //    record of what the real numbers were.
  const workShapeChip: string | undefined = uniformWork && workBlocks.length > 0
    ? t('chipWorkShape', { n: workBlocks.length, m: Math.round(workBlocks[0].minutes) })
    : undefined

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
  const trajectoryIndex = state === 'resting' ? '02' : '03'
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
  // from CqmME (Rest) / X8wnJ (Training) / WVwiD (Trained) / o8vinG
  // (Resting) — German authored per the pen's own register, English kept as
  // the source (see `i18n/copy.ts`'s `quoteRest`/`quoteTraining`/
  // `quoteTrained`/`quoteResting`).
  const quoteCopy = state === 'rest'
    ? { quote: t('quoteRest'), attribution: t('quoteRestAttribution') }
    : state === 'training'
      ? { quote: t('quoteTraining'), attribution: t('quoteTrainingAttribution') }
      : state === 'trained'
        ? { quote: t('quoteTrained'), attribution: t('quoteTrainedAttribution') }
        : state === 'resting'
          ? { quote: t('quoteResting'), attribution: t('quoteRestingAttribution') }
          : state === 'evening'
            ? { quote: t('quoteEvening'), attribution: t('quoteEveningAttribution') }
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

  // ---- Evening: 01 Today (subsumes Trained's "the ride") --------------------
  // Statement reuses `costClaim` (below) — the exact same fatigue-delta claim
  // Trained's own "02 The Cost" already computes, since Evening's own
  // Statement ("Three hours, barely a dent.") is the same kind of claim: how
  // much today's ride cost, read from the same PMC ATL delta.
  const eveningRideChip: Value<string> = isPresent(model.ride) ? present(t('chipRideDone')) : missing(model.ride.missing)

  const eveningRideCalories: Value<string> = isPresent(model.ride)
    ? model.ride.value.calories != null
      ? present(`${model.ride.value.calories.toLocaleString(intlLocale(locale))} ${t('unitKcal')}`)
      : missing(t('noCaloriesForRide'))
    : missing(model.ride.missing)
  const NO_DAILY_ENERGY = t('noDailyEnergyBreakdown')
  const eveningLedgerRows = [
    { label: t('ledgerRide'), value: eveningRideCalories },
    { label: t('ledgerMovement'), value: missing<string>(NO_DAILY_ENERGY) },
    { label: t('ledgerRest'), value: missing<string>(NO_DAILY_ENERGY) },
  ]

  const eveningAvgPower: Value<number> = isPresent(model.ride)
    ? model.ride.value.kj != null && model.ride.value.durationS
      ? present(Math.round((model.ride.value.kj * 1000) / model.ride.value.durationS))
      : missing(t('noUniformTarget'))
    : missing(model.ride.missing)
  const eveningRideTiles: { label: string; value: Value<number | string>; unit: string }[] = [
    {
      label: t('tileDuration'),
      value: isPresent(model.ride)
        ? model.ride.value.durationS != null ? present(formatHoursMinutes(model.ride.value.durationS / 60)) : missing(t('rideMissing'))
        : missing(model.ride.missing),
      unit: t('unitMoving'),
    },
    {
      label: t('tileDistance'),
      value: isPresent(model.ride)
        ? model.ride.value.distanceM != null
          ? present((model.ride.value.distanceM / 1000).toLocaleString(intlLocale(locale), { maximumFractionDigits: 1, minimumFractionDigits: 1 }))
          : missing(t('rideMissing'))
        : missing(model.ride.missing),
      unit: t('unitKm'),
    },
    { label: t('tileAvgPower'), value: eveningAvgPower, unit: t('unitWatts') },
    {
      label: t('tileAvgHr'),
      value: isPresent(model.ride)
        ? model.ride.value.avgHr != null ? present(model.ride.value.avgHr) : missing(t('rideMissing'))
        : missing(model.ride.missing),
      unit: t('unitBpm'),
    },
  ]

  // ---- Evening: 01 Today — "Moved Key" trio (`I7AqeN`/`ppDu5`/`j7KHFv`) -----
  // Real section, confirmed present in `cx4zJ` (audit a2, 2026-08-06) but
  // previously unbuilt entirely. TRAINING LOAD and FATIGUE both derive from
  // `model.pmc.series` — the exact same field "03 Trajectory"'s own chart
  // already reads elsewhere on this screen — today's own TSS/ATL, delta vs
  // yesterday, and a 7-bar track of the trailing week (real per-day values,
  // never estimated). RESTING HR reuses `model.restingHr`'s already-real
  // value+delta (today's own morning reading — "MEASURED THIS MORNING" is
  // therefore a true caption, not invented prose) and its 7-bar track now
  // reads `model.recentRestingHr` — the audit called for that field and it
  // turned out `recentMetrics` was already being fetched for the freshness
  // label, so the series was a filter away rather than a new request. Days
  // without a reading are absent from the track rather than drawn as zero.
  const pmcSeries7 = isPresent(model.pmc) ? model.pmc.value.series.slice(-7) : []
  const pmcLast = pmcSeries7.length > 0 ? pmcSeries7[pmcSeries7.length - 1] : null
  const pmcPrior = pmcSeries7.length > 1 ? pmcSeries7[pmcSeries7.length - 2] : null
  const pmcHistoryMissing = isPresent(model.pmc) ? t('notEnoughFatigueHistory') : model.pmc.missing

  const trioTrainingLoadValue: Value<number> = pmcLast?.tss != null ? present(Math.round(pmcLast.tss)) : missing(pmcHistoryMissing)
  const trioTrainingLoadDelta = pmcLast?.tss != null && pmcPrior?.tss != null ? Math.round(pmcLast.tss - pmcPrior.tss) : null
  // A day with no matching PMC entry has `tss: undefined`, never a real
  // zero — drawing a track of coerced-to-0 bars would fabricate a shape for
  // days that never happened to have one, so the whole track is withheld
  // (not just the numeral) unless EVERY one of the trailing week's entries
  // actually carries a `tss`.
  const trioTssTrack = pmcSeries7.length > 0 && pmcSeries7.every((p) => p.tss != null)
    ? pmcSeries7.map((p) => p.tss as number)
    : null
  const trioTrainingLoadCaption = (() => {
    if (pmcLast?.tss == null || trioTssTrack == null) return null
    const rank = [...trioTssTrack].sort((a, b) => b - a).indexOf(pmcLast.tss) + 1
    return t('trioTrainingLoadCaption', { rank: ordinalLabel(rank, locale) })
  })()

  const trioFatigueValue: Value<number> = pmcLast != null ? present(Math.round(pmcLast.atl)) : missing(pmcHistoryMissing)
  const trioFatigueDelta = pmcLast != null && pmcPrior != null ? Math.round(pmcLast.atl - pmcPrior.atl) : null
  const trioAtlTrack = pmcSeries7.map((p) => p.atl)
  const trioFatigueCaption = trioFatigueDelta == null
    ? null
    : trioFatigueDelta > 0 ? t('trioFatigueCaptionRising') : trioFatigueDelta < 0 ? t('trioFatigueCaptionEasing') : t('trioFatigueCaptionSteady')

  const trioRestingHrValue: Value<number> = mapValue(model.restingHr, (h) => h.value)
  const trioRestingHrDelta = isPresent(model.restingHr) ? model.restingHr.value.delta : null
  const trioRestingHrTrack = isPresent(model.recentRestingHr) && model.recentRestingHr.value.length > 0
    ? model.recentRestingHr.value.map((d) => d.bpm)
    : null

  // ---- Evening: 02 Tonight ---------------------------------------------------
  // BEDTIME/WAKE/SLEEP/DEBT (`UtYXL`/`IgmOU`/`agHrh`/`N1xe2`, cx4zJ's own
  // Tiles) all need the same bedtime-target/wake-alarm source the hero
  // numeral above has none of — permanently missing, all four, one shared
  // reason (same pattern as Rest's own "02 Absorption" cost tiles).
  const eveningTonightTiles: { label: string; value: Value<number | string>; unit: string }[] = [
    { label: t('tileBedtime'), value: missing(eveningLightsOutMissing), unit: t('unitTarget') },
    { label: t('tileWake'), value: missing(eveningLightsOutMissing), unit: t('unitAlarm') },
    { label: t('tileSleepTargetEvening'), value: missing(eveningLightsOutMissing), unit: t('unitHrs') },
    { label: t('tileDebt'), value: missing(eveningLightsOutMissing), unit: t('unitNone') },
  ]

  // ---- Evening: 03 Tomorrow ---------------------------------------------------
  // FORM is real (model.pmc.form, the same field Trajectory's own tiles
  // already show elsewhere) — TARGET/WORK need tomorrow's own session
  // blocks, which `TodayModel.tomorrow` does not carry (title/detail/
  // unlockLabel only, no blocks) — permanently missing, one shared reason.
  const NO_TOMORROW_BLOCKS = t('noTomorrowSessionDetail')
  const eveningTomorrowChip: Value<string> = isPresent(model.tomorrow)
    ? present(model.tomorrow.value.title.split(' · ')[0].toUpperCase())
    : missing(model.tomorrow.missing)
  const eveningTomorrowTiles: { label: string; value: Value<number | string>; unit: string }[] = [
    { label: t('insightForm'), value: mapValue(model.pmc, (p) => signed(Math.round(p.form))), unit: '' },
    { label: t('tileTarget'), value: missing(NO_TOMORROW_BLOCKS), unit: t('unitWatts') },
    { label: t('tileWork'), value: missing(NO_TOMORROW_BLOCKS), unit: t('unitMin') },
  ]

  // ---- Bento Grid (Task 8): size and colour earned by the reasoning --------
  // The coach's own verdict body is the "reason" `BentoGrid` ranks its tiles
  // against — the exact sentence `Verdict`/the hero-body paragraph below
  // already renders on every state (Trained's own `Verdict`, Training's
  // body-only `Verdict`, Rest's bare paragraph — see the render below).
  // Whichever metric that sentence names gets the tile that leads; a
  // missing verdict or a sentence naming nothing both fall back to
  // `BentoGrid`'s own documented invariant (the first entry, HRV, gets
  // both size and colour) — never zero accented tiles, never two.
  const bentoReason: string | null = isPresent(model.verdict) ? model.verdict.value.body : null

  // HRV/resting HR chart as a position within the athlete's own band — the
  // exact `RangeBand` "01 Recovery"'s own `RangeRow`s already plot a few
  // hundred pixels below this, not a fabricated series. A present reading
  // with no band on record (distinct from the reading itself being absent)
  // is the one real gap, named honestly rather than silently defaulted.
  const bentoHrvBand = isPresent(model.hrv) ? model.hrv.value.band : null
  const bentoHrvChart: Value<TileChart> = !isPresent(model.hrv)
    ? missing(model.hrv.missing)
    : bentoHrvBand
      ? present({ kind: 'band', low: bentoHrvBand.low, high: bentoHrvBand.high, today: model.hrv.value.value })
      : missing(t('bentoNoRange'))
  const bentoRestingHrBand = isPresent(model.restingHr) ? model.restingHr.value.band : null
  const bentoRestingHrChart: Value<TileChart> = !isPresent(model.restingHr)
    ? missing(model.restingHr.missing)
    : bentoRestingHrBand
      ? present({ kind: 'band', low: bentoRestingHrBand.low, high: bentoRestingHrBand.high, today: model.restingHr.value.value })
      : missing(t('bentoNoRange'))
  // Sleep carries neither a delta nor a band anywhere in `TodayModel` (the
  // same gap `sleepWake` above already names) — no honest chart can be
  // built, so this reuses that exact reason rather than inventing a
  // sleep-specific one.
  const bentoSleepChart: Value<TileChart> = isPresent(model.sleep) ? missing(t('sleepDeltaMissing')) : missing(model.sleep.missing)

  const bentoEntries: BentoEntry[] = [
    {
      key: 'hrv',
      label: t('labelHrv'),
      value: isPresent(model.hrv)
        ? present({ text: String(Math.round(model.hrv.value.value)), unit: t('unitMs') })
        : missing(model.hrv.missing),
      chart: bentoHrvChart,
    },
    {
      key: 'sleep',
      label: t('labelSleep'),
      value: isPresent(model.sleep)
        ? present({ text: formatHM(model.sleep.value.totalS), unit: t('unitH') })
        : missing(model.sleep.missing),
      chart: bentoSleepChart,
    },
    {
      key: 'rhr',
      label: t('labelRestingHr'),
      value: isPresent(model.restingHr)
        ? present({ text: String(Math.round(model.restingHr.value.value)), unit: t('unitBpm') })
        : missing(model.restingHr.missing),
      chart: bentoRestingHrChart,
    },
  ]
  // Body Battery only when the watch actually has a wake/now reading — the
  // brief's own instruction ("model.bodyBattery when present"), matching
  // the same rule this file already applies to Resting's own "Climb"
  // visualisation a bit further down (`isPresent(model.bodyBattery)`).
  // Label/unit reuse `heroUnitEnergy`/`heroUnitOutOf100` — the SAME two
  // strings Training's own hero numeral already prints for this exact
  // quantity, rather than a third, freshly-invented label for one number.
  if (isPresent(model.bodyBattery)) {
    bentoEntries.push({
      key: 'bodyBattery',
      label: t('heroUnitEnergy'),
      value: present({ text: String(model.bodyBattery.value.now), unit: t('heroUnitOutOf100') }),
      chart: present({ kind: 'spark', points: [model.bodyBattery.value.wake, model.bodyBattery.value.now], highlightIndex: 1 }),
    })
  }

  return (
      <main
        data-day-state={state}
        style={{ display: 'flex', flexDirection: 'column' }}
        {...swipe}
      >
        <Cover state={state} photoUrl={COVER_PHOTO[state]}>
          <HeaderSpine
            state={state}
            dateLabel={model.dateLabel}
            streakDays={model.streakDays}
            profile={profile}
            control={control}
            switchable={SWITCHABLE.has(state)}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            <span
              style={{
                fontFamily: 'var(--e-display)',
                fontWeight: 800,
                lineHeight: 1.05,
                color: 'var(--e-ink)',
                // The Day Mark is absolutely positioned at the Cover's top
                // right; a headline running the full column width slides
                // straight under it. Reserve its lane.
                paddingRight: 46,
                ...headlineFit(isPresent(heroHeadline) ? heroHeadline.value : '—'),
              }}
            >
              {isPresent(heroHeadline) ? heroHeadline.value : '—'}
            </span>

            {state === 'evening' ? (
              // Same composed, designed treatment `MetricTrack` gives every
              // other missing hero numeral (this screen bypasses that
              // component entirely — its numeral is a clock time, not a
              // number — but the visual language must match, not diverge,
              // per the audit's own instruction). See MetricTrack.tsx's own
              // doc comment for why a scaled "—" is the defect, not the fix.
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: 'var(--e-lo)' }} />
                  <span
                    data-testid="hero-numeral"
                    style={{
                      fontFamily: 'var(--e-body)',
                      fontSize: 'var(--t-lead)',
                      fontWeight: 800,
                      letterSpacing: -0.3,
                      lineHeight: 1.15,
                      color: 'var(--e-ink)',
                    }}
                  >
                    {eveningLightsOutHeadline}
                  </span>
                </div>
                <p style={quietReason}>{eveningLightsOutMissing}</p>
              </div>
            ) : (
              <MetricTrack
                label=""
                state=""
                value={heroNumeralValue}
                unit={heroNumeralUnit}
                unitSub={heroNumeralUnitSub}
                delta={null}
                band={null}
                hue={heroNumeralHue}
                missingHeadline={heroNumeralMissingHeadline}
                missingTone={heroNumeralMissingTone}
                missingAction={heroNumeralMissingAction}
              />
            )}

            {state === 'trained' ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-end' }}>
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 500, color: 'var(--e-quiet)' }}>
                  {isPresent(sessionContext) ? sessionContext.value : sessionContext.missing}
                </span>
              </div>
            ) : state === 'evening' ? null : (
              // Evening's own Cover Foot (`cx4zJ`/`nvFz3`) has no RC line at
              // all after its Value — the earlier bare-Hero read (`KYS6e`)
              // did, but the newer IMAGERY variant dropped it (see
              // task-14-report.md). This screen's honest missing-bedtime
              // reason already prints once, directly under the numeral above.
              //
              // CORRECTED (design pass, 2026-08-06): the primary line used to
              // fall back to a bare "—" with its own explanation nowhere
              // nearby — the orphan dash found live at 390×844. It now shows
              // its own reason, like every other missing arm in this file —
              // unless that reason is the exact one `MetricTrack` already
              // printed a few lines up (`rcPrimaryReasonAlreadyShown`), in
              // which case it renders nothing rather than repeat it. The
              // secondary line is dropped entirely when it would only repeat
              // the generic "no further context" filler (see
              // `rcSecondaryIsGenericFiller`'s own doc comment); when it IS a
              // real 90-day-best claim it gets the accent colour and body
              // weight instead of quiet grey — the win, given real weight.
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-end' }}>
                {!rcPrimaryReasonAlreadyShown && (
                  <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 700, color: 'var(--e-ink)' }}>
                    {isPresent(rcPrimaryLine) ? rcPrimaryLine.value : rcPrimaryLine.missing}
                  </span>
                )}
                {!rcSecondaryIsGenericFiller && (
                  <span
                    style={{
                      fontFamily: 'var(--e-body)',
                      fontSize: 'var(--t-body)',
                      fontWeight: rcSecondaryIsWin ? 800 : 500,
                      color: rcSecondaryIsWin ? 'var(--st-active)' : 'var(--e-quiet)',
                    }}
                  >
                    {isPresent(rcSecondaryLine) ? rcSecondaryLine.value : rcSecondaryLine.missing}
                  </span>
                )}
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
        </Cover>

        <div data-hero-body style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '34px 24px 0 24px' }}>
          <CassetteHero
            readiness={model.readiness}
            series={cassetteSeries}
            todayIso={new Date().toISOString().slice(0, 10)}
            caption={cassetteCaption}
            reasonShownElsewhere={cassetteReasonShownElsewhere}
            captionReasonShownElsewhere={!isPresent(model.readiness)}
          />
          <div style={{ paddingTop: 20, paddingBottom: 26 }}>
            <BentoGrid entries={bentoEntries} reason={bentoReason} />
          </div>
          {state === 'rest' && (
            <div style={{ paddingBottom: 26 }}>
              <WeekRail days={model.week} todayIndex={todayIndex} />
            </div>
          )}
          {state === 'training' && (
            <div style={{ paddingBottom: 26 }}>
              {/* `x4AxA5/cTYba/FUAIT` — Training's hero-body session preview
                  is its own pen node, `height: 81, gap: 3`, distinct from
                  `Bars`'s own default (see Bars.tsx's doc comment). */}
              <Bars blocks={sessionBlocks} emphasizeMax height={81} gap={3} />
            </div>
          )}
          {state === 'resting' && (
            // The Hero Body's own "Climb" visualisation (`h54Rs`/`z46aUu`,
            // "SINCE YOU WOKE") — a rising wake→now arc for body_battery,
            // this task's genuinely-new hero material. The pen's own ceiling
            // row ("90-DAY BEST · 94") has no TodayModel source anywhere —
            // not a transient gap but a permanently unresolvable one (no
            // 90-day body-battery history field exists at all), so per the
            // "never a permanently-unresolvable slot dressed as a transient
            // gap" rule it renders nothing at all, not a dash. Kept as a
            // static (non-animated) hero flourish — it is this screen's own
            // bespoke embellishment, not one of the named chart components
            // the motion rules enumerate (Bars/PMCChart/FatigueCurve/
            // ZoneRows/WeekRail/LiveRing).
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 26 }}>
              <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1.2, color: 'var(--e-lo)' }}>
                {t('climbSinceWoke')}
              </span>
              {isPresent(model.bodyBattery) ? (
                <div style={{ width: '100%', height: 60, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 30, height: 1, background: 'var(--d-2)' }} />
                  <div style={{ position: 'absolute', left: 4, top: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--d-3)' }} />
                    <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1.2, color: 'var(--e-lo)', whiteSpace: 'nowrap' }}>
                      {t('climbWakeLabel', { n: model.bodyBattery.value.wake })}
                    </span>
                  </div>
                  <div style={{ position: 'absolute', right: 4, top: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--st-active)', boxShadow: '0 0 16px var(--st-a40)' }} />
                    <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1.2, color: 'var(--st-active)' }}>
                      {t('climbNow')}
                    </span>
                  </div>
                </div>
              ) : (
                <p style={quietReason}>{model.bodyBattery.missing}</p>
              )}
            </div>
          )}

          {state === 'trained' ? (
            <Verdict
              headline={mapValue(model.verdict, (v) => v.headline)}
              body={mapValue(model.verdict, (v) => v.body)}
            />
          ) : state === 'training' ? (
            // Body only. The hero above now carries this statement's headline
            // (owner ruling), so repeating it here printed the same sentence
            // twice, 200px apart — the same shape as Rest's own hero body,
            // which has never had a headline slot.
            <Verdict body={mapValue(model.verdict, (v) => v.body)} />
          ) : (
            // Rest's own hero-body Verdict (oYHto) has no headline slot at
            // all — only the body paragraph (WHDco). Using the `Verdict`
            // component here would render a stray "—" headline row for a
            // slot the frame doesn't have, so Rest renders that one
            // paragraph directly instead.
            //
            // Design pass (2026-08-06): left-aligned, matching `Verdict`'s
            // own body paragraph fix — real coach prose runs long enough
            // that centring it hurts readability more than it helps the
            // block look tidy. The 320px column stays centred by its parent.
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
              <p
                style={{
                  fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 500, lineHeight: 1.5, textAlign: 'left',
                  color: isPresent(model.verdict) ? 'var(--e-mid)' : 'var(--e-quiet)', margin: 0, width: 320, maxWidth: '100%',
                }}
              >
                {isPresent(model.verdict) ? model.verdict.value.body : model.verdict.missing}
              </p>
            </div>
          )}
        </div>

        {/* Resting's own frame (`h54Rs`) has NO Insight Strip between the
            Hero Body and its first numbered section — confirmed by a fresh
            read of the full child list, unlike every other Today state. */}
        {state !== 'resting' && <InsightStrip items={insightItems} />}

        {state === 'evening' && (
          <section data-section="01" style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '42px 24px 0 24px' }}>
            <SecHead
              index="01"
              title={t('sectionToday')}
              kicker
              chip={isPresent(eveningRideChip) ? eveningRideChip.value : undefined}
            />
            {/* Evening subsumes Trained — this section carries the ride,
                using the same fatigue-delta claim Trained's own "02 The
                Cost" already computes (`costClaim`, below). */}
            <Statement claim={costClaim} />

            {/* Energy section: the hourly energy-out curve
                (`model.energyOut`) is verified permanently missing (see
                useTodayModel.ts's own doc comment) — per this task's own
                brief, the section renders the Ledger alone rather than a
                chart with nothing to draw. */}
            {isPresent(model.energyOut) ? null : (
              <div style={{ paddingTop: 22 }}>
                <Ledger caption={t('ledgerCaption')} rows={eveningLedgerRows} />
              </div>
            )}

            {/* Dedupe reasons (design pass, 2026-08-06): `energyOut` is
                permanently missing (see the doc comment above), so the
                Ledger a few lines up always renders and — when the ride
                itself is missing too — always prints `model.ride.missing`
                first. These four tiles used to each print their own copy of
                the SAME text (measured baseline: this exact sentence
                appeared 3× on one real screen); they now hide it, and the
                caption row below stays silent for the same reason rather
                than printing a fourth/fifth copy. */}
            {/* gap: 8 (design pass, 2026-08-06) — StatTile's label now reads
                at --t-label (12px, was 9px) and, unlike the old 9px size,
                often fills its own 100px-wide column edge to edge. With
                zero gap between tiles, two adjacent single-word labels (e.g.
                "ZUBETTGEHEN" next to "WECKEN") rendered with no visible
                space between them at all — found live at 390×844, reading
                as one run-on word. Every StatTile row in this file gets the
                same gap, for one consistent rule. */}
            <div style={{ width: '100%', display: 'flex', gap: 8, paddingTop: 18 }}>
              {eveningRideTiles.map((tile) => (
                <StatTile key={tile.label} label={tile.label} value={tile.value} unit={tile.unit} hideReason />
              ))}
            </div>

            {isPresent(rideMicro) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '18px 0 0 0' }}>
                <div style={{ width: '100%', height: 1, background: 'var(--e-hairline)' }} />
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 700, letterSpacing: 0.4, color: 'var(--e-mid)' }}>
                  {rideMicro.value}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '26px 0 0 0' }}>
              <span style={kickerLabel}>{t('movedKeyHeading')}</span>
              <div style={{ width: '100%', height: 1, background: 'var(--e-hairline)' }} />
            </div>
            <MovedRow
              label={t('trioTrainingLoad')}
              caption={trioTrainingLoadCaption}
              value={trioTrainingLoadValue}
              unit={t('unitTss')}
              delta={trioTrainingLoadDelta}
              track={trioTssTrack}
              trackMissingReason={pmcHistoryMissing}
            />
            <MovedRow
              label={t('pmcFatigue')}
              caption={trioFatigueCaption}
              value={trioFatigueValue}
              unit=""
              delta={trioFatigueDelta}
              track={trioAtlTrack}
            />
            <MovedRow
              label={t('labelRestingHr')}
              caption={t('trioRestingHrCaption')}
              value={trioRestingHrValue}
              unit={t('unitBpm')}
              delta={trioRestingHrDelta}
              track={trioRestingHrTrack}
              trackMissingReason={isPresent(model.recentRestingHr) ? t('trioRestingHrHistoryMissing') : model.recentRestingHr.missing}
              last
            />
          </section>
        )}

        {state === 'resting' && (
          <section data-section="01" style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '42px 24px 0 24px' }}>
            <SecHead
              index="01"
              title={t('sectionRightNow')}
              kicker
              chip={t('rightNowChipLive')}
            />
            {/* No composite "every system is back" verdict anywhere on
                TodayModel — same permanent gap as "01 Recovery" above, so no
                Statement (matching the same rule, not a floating dash). */}
            <div style={{ width: '100%', display: 'flex', gap: 18, paddingTop: 26 }}>
              <LiveRing
                label={t('labelHrv')}
                wake={hrvWake}
                now={mapValue(model.hrv, (h) => h.value)}
                hue="var(--st-active)"
                unit={t('unitMs')}
              />
              <LiveRing
                label={t('labelRestingHr')}
                wake={restingHrWake}
                now={mapValue(model.restingHr, (h) => h.value)}
                hue="var(--st-active)"
                unit={t('unitBpm')}
              />
              <LiveRing
                label={t('labelSleep')}
                wake={sleepWake}
                now={mapValue(model.sleep, (s) => s.totalS)}
                hue="var(--st-active)"
                unit={t('unitH')}
                format={formatHM}
              />
            </div>
          </section>
        )}

        {state === 'trained' && (
          <section data-section="01" style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '42px 24px 0 24px' }}>
            <SecHead
              index="01"
              title={t('sectionTheSession')}
              kicker
              chip={workShapeChip}
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
              <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 700, letterSpacing: 0.4, color: 'var(--e-mid)' }}>
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
            {/* Cut the scaffolding (design pass, 2026-08-06): `recoverySub`
                ("HRV, resting heart rate and sleep — each against your own
                30-day range") describes how the RangeRows below are built,
                not what they say — the section's three real readings, and
                their own bands, already carry the finding. No `sub`. */}
            <SecHead
              index="01"
              title={t('sectionRecovery')}
              kicker
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 20 }}>
              <RangeRow
                label={t('labelHrv')}
                value={mapValue(model.hrv, (h) => h.value)}
                unit={t('unitMs')}
                band={isPresent(model.hrv) ? model.hrv.value.band : null}
                delta={isPresent(model.hrv) ? model.hrv.value.delta : null}
                showReason={false}
              />
              <RangeRow
                label={t('labelRestingHr')}
                value={mapValue(model.restingHr, (h) => h.value)}
                unit={t('unitBpm')}
                band={isPresent(model.restingHr) ? model.restingHr.value.band : null}
                delta={isPresent(model.restingHr) ? model.restingHr.value.delta : null}
                showReason={false}
              />
              <RangeRow
                label={t('labelSleep')}
                value={mapValue(model.sleep, (s) => s.totalS)}
                unit={t('unitH')}
                band={null}
                format={formatHM}
                showReason={false}
              />
              {/* One reason for the whole group. All three rows come off the
                  same wearable, so when it has not synced they fail together
                  and printing the sentence per row reads as the screen
                  apologising to itself — four times, measured live. */}
              {recoveryReasons.map((reason) => (
                <p key={reason} style={quietReason}>{reason}</p>
              ))}
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
                        <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1, color: 'var(--e-lo)' }}>
                          {p.label}
                        </span>
                        <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 700, color: 'var(--e-ink)' }}>
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
          <QuotePlate state={state} quote={quoteCopy.quote} attribution={quoteCopy.attribution} photoUrl={QUOTE_PHOTO[state]} />
        )}

        {state === 'evening' && (
          <section data-section="02" style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '42px 24px 0 24px' }}>
            <SecHead index="02" title={t('sectionTonight')} kicker />
            {/* No composite "eight hours is the job" claim anywhere on
                TodayModel — same permanent gap as the tiles below, so no
                Statement (matching the rule Rest's own "01 Recovery" and
                "01 Right Now" already follow: a slot that can never resolve
                renders nothing, not a floating dash). */}
            <div style={{ width: '100%', display: 'flex', gap: 8, paddingTop: 20 }}>
              {eveningTonightTiles.map((tile) => (
                <StatTile key={tile.label} label={tile.label} value={tile.value} unit={tile.unit} hideReason />
              ))}
            </div>
            <p style={quietReason}>{eveningLightsOutMissing}</p>
          </section>
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

            {/* Dedupe reasons (design pass, 2026-08-06): `costClaim`'s own
                fallback (above) is fatigue-history text — a DIFFERENT root
                cause from these tiles', which are missing only when
                `model.session` itself is absent. So the four tiles hide
                their own per-tile copy (`hideReason`) and, when that's the
                actual cause, print the real explanation once below — not
                once per tile, and not silently dropped just because
                Statement already said something else. */}
            <div style={{ width: '100%', display: 'flex', gap: 8, paddingTop: 20 }}>
              {costTiles.map((tile) => (
                <StatTile key={tile.label} label={tile.label} value={tile.value} unit={tile.unit} hideReason />
              ))}
            </div>
            {!isPresent(model.session) && <p style={quietReason}>{model.session.missing}</p>}

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

            <div style={{ width: '100%', display: 'flex', gap: 8, paddingTop: 20 }}>
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
                  <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 700, color: 'var(--e-mid)' }}>
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
            {/* No chip: the pen's own chip here (`HwC47`/`r8stp3`) is
                "STARTS 17:30", a start-time with no TodayModel source — see
                `workShapeChip`'s own doc comment above for the full record
                of why this used to show a block count that disagreed with
                the Insight Strip's real "5 BLÖCKE" a few lines up. */}
            <SecHead
              index="02"
              title={t('sectionTheSession')}
              kicker
              sub={t('absorptionSub')}
            />
            <Statement claim={trainingSessionClaim} />

            {/* Dedupe reasons: `trainingSessionClaim`'s own missing fallback
                is `model.session.missing` verbatim — the identical text
                these four tiles would otherwise each repeat — so they hide
                their own copy; Statement above already said it once. */}
            <div style={{ width: '100%', display: 'flex', gap: 8, paddingTop: 20 }}>
              {trainingTiles.map((tile) => (
                <StatTile key={tile.label} label={tile.label} value={tile.value} unit={tile.unit} hideReason />
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

        {/* "03 Trajectory" is state-agnostic across Rest/Training/Trained
            (see the top-of-file doc comment) — Resting shares the exact
            same content but numbers it "02" (`h54Rs`'s own numbered
            sections are only "01 Right Now" / "02 Trajectory", confirmed by
            a fresh read; no "01 Recovery"/"02 Absorption" precede it), and
            its own Sub node (`vs2tv/tGIwT`) is `enabled: false` in the tree
            — unlike Rest/Training/Trained's, so it's the one field this
            section doesn't share across every state. Evening does NOT share
            this section at all — its own "03" is "TOMORROW" (`gvQQs`/
            `Mfsjz`), an entirely different section, rendered separately
            below. */}
        {state !== 'evening' && (
          <section data-section={trajectoryIndex} style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '42px 24px 0 24px' }}>
            {/* Cut the scaffolding (design pass, 2026-08-06): this is the
                spec's own quoted example — `trajectorySub` ("Fitness,
                fatigue and form from the rolling 42-day model") is a
                data-source footnote sitting directly under `trajectoryClaim`
                ("Fitness gesunken um 2. Form gespart."), which is the
                actual finding. No `sub` — the Statement below is the
                section's one sentence, and it carries information. */}
            <SecHead
              index={trajectoryIndex}
              title={t('sectionTrajectory')}
              kicker
              chip={fitnessDelta7d == null ? undefined : fitnessDelta7d > 0 ? t('chipClimbing') : fitnessDelta7d < 0 ? t('chipDeclining') : t('chipSteady')}
            />
            <Statement claim={trajectoryClaim} />

            {/* Dedupe reasons (design pass, 2026-08-06): when `model.pmc` is
                missing, `trajectoryClaim` above already prints the reason —
                these three tiles would otherwise each print the identical
                text a second, third and fourth time. `hideReason` keeps
                each tile's honest "—" without repeating it. */}
            <div style={{ width: '100%', display: 'flex', gap: 8, paddingTop: 20 }}>
              {trajectoryTiles.map((tile) => (
                <StatTile key={tile.label} label={tile.label} value={tile.value} unit={tile.unit} hideReason />
              ))}
            </div>

            <div style={{ paddingTop: 14 }}>
              <PMCChart series={pmcSeries} days={42} />
            </div>
          </section>
        )}

        {state === 'evening' && (
          <section data-section="03" style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '42px 24px 0 24px' }}>
            <SecHead
              index="03"
              title={t('sectionTomorrow')}
              kicker
              chip={isPresent(eveningTomorrowChip) ? eveningTomorrowChip.value : undefined}
            />
            {/* No Statement here: the pen's own claim ("5 × 4 at 330 W.")
                duplicates the structured session title `TomorrowBand`
                already shows below, and `TomorrowPlate` (also below) already
                carries the real prose description — a third repetition of
                the same session would be the exact "same content twice"
                defect this build has already been corrected for (see
                TomorrowPlate.tsx's own doc comment). */}
            <div style={{ width: '100%', display: 'flex', gap: 8, paddingTop: 20 }}>
              {eveningTomorrowTiles.map((tile) => (
                <StatTile key={tile.label} label={tile.label} value={tile.value} unit={tile.unit} hideReason />
              ))}
            </div>
            <p style={quietReason}>{NO_TOMORROW_BLOCKS}</p>
          </section>
        )}

        {(state === 'rest' || state === 'trained' || state === 'resting' || state === 'evening') && (
          <TomorrowPlate
            photoUrl={TOMORROW_PHOTO[state]}
            state={state}
            kickerLeft={tomorrowKickerLeft}
            kickerRight={tomorrowKickerRight}
            title={tomorrowPlateTitle}
            captionLeft={tomorrowCaptionLeft}
            captionRight={tomorrowCaptionRight}
            gapReason={t('tomorrowPlateGap')}
          />
        )}
        {state === 'training' && (
          <TomorrowPlate
            photoUrl={TOMORROW_PHOTO[state]}
            state={state}
            kickerLeft={routeKickerLeft}
            kickerRight={routeKickerRight}
            title={routeTitle}
            captionLeft={routeCaptionLeft}
            captionRight={routeCaptionRight}
            gapReason={t('routePlateGap')}
          />
        )}

        {showTomorrowBand && (
          <div style={{ width: '100%', padding: '46px 16px 0 16px' }}>
            {/* The band leads to Session Detail ONLY where it is showing
                TODAY's session — that page renders today's workout and takes
                no id, so pointing a "MORGEN" band at it would open the wrong
                day. Those states get no arrow rather than a wrong one. */}
            <TomorrowBand
              session={showsTomorrow ? tomorrowSession : todaySession}
              kicker={showsTomorrow ? t('tomorrowBandTomorrow') : t('tomorrowBandToday')}
              to={showsTomorrow ? undefined : '/e/session'}
            />
          </div>
        )}

        <TabBar active="today" />
      </main>
  )
}

// Design pass (2026-08-06): every shared caption style below now points at
// the seven-step scale (tokens.css) instead of a one-off literal — most of
// these were 9px, the biggest single contributor to the 42-elements-at-
// ≤9px baseline this pass measured and is meant to beat.
const kickerLabel: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1.4, color: 'var(--e-mid)',
}
const kickerLabelQuiet: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1.4, color: 'var(--e-quiet)',
}
const kickerLabelDim: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1.4, color: 'var(--e-lo)',
}
// The single biggest lever in this pass: every reason line in the file
// shares this one constant, so raising it once (12→15px, the prose step)
// fixes the "too small to read comfortably" body-text finding everywhere
// it appears, not just in one spot.
const quietReason: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 500, color: 'var(--e-quiet)', margin: '8px 0 0 0',
}
const condVal: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 700, color: 'var(--e-ink)',
}
const condUnit: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 700, letterSpacing: 0.8, color: 'var(--e-lo)',
}
const tickStyle: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 0.8, color: 'var(--e-lo)',
}

/** One row of Evening's "Moved Key" trio (`I7AqeN`/`ppDu5`/`j7KHFv` — Label +
 *  Caption left, Value/Unit/Delta right, a 7-bar Track beneath, a hairline
 *  Sep beneath that). `track` is a real 7-entry number series when one
 *  exists (`pmc.series`, sliced to the trailing week); `null` when no source
 *  exists at all (Resting HR — see the render site's own doc comment) — in
 *  which case the Track is skipped and `trackMissingReason` prints instead,
 *  same "never fabricate a shape" rule every other chart in this file
 *  follows. `last` omits the pen's own trailing Sep rule (the third row is
 *  the section's last child). */
function MovedRow({ label, caption, value, unit, delta, track, trackMissingReason, last }: {
  label: string
  caption: string | null
  value: Value<number>
  unit: string
  delta: number | null
  track: number[] | null
  trackMissingReason?: string
  last?: boolean
}) {
  const max = track && track.length > 0 ? Math.max(1, ...track) : 1
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 18 }}>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 4 }}>
          <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1.2, color: 'var(--e-mid)' }}>
            {label}
          </span>
          {caption && (
            <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 700, letterSpacing: 1, color: 'var(--e-lo)' }}>
              {caption}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end' }}>
          <span style={{ fontFamily: 'var(--e-display)', fontSize: 'var(--t-lead)', fontWeight: 800, letterSpacing: -0.5, lineHeight: 1, color: 'var(--e-ink)' }}>
            {isPresent(value) ? value.value : '—'}
          </span>
          <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end', paddingBottom: 3 }}>
            {unit && (
              <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 700, color: 'var(--e-lo)' }}>{unit}</span>
            )}
            {delta != null && (
              <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 800, color: 'var(--e-ink)' }}>
                {signed(delta)}
              </span>
            )}
          </div>
        </div>
      </div>
      {track ? (
        <div style={{ width: '100%', display: 'flex', gap: 4, alignItems: 'flex-end', height: 24 }}>
          {track.map((v, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: Math.max(3, Math.round((v / max) * 24)),
                borderRadius: 2,
                background: i === track.length - 1 ? 'var(--st-evening)' : 'var(--d-2)',
              }}
            />
          ))}
        </div>
      ) : (
        trackMissingReason && <p style={quietReason}>{trackMissingReason}</p>
      )}
      {!last && <div style={{ width: '100%', height: 1, background: 'var(--e-hairline)' }} />}
    </div>
  )
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

/** Locale-aware ordinal, e.g. "3RD"/"1ST"/"11TH" (en) or "3." (de) — used by
 *  the Moved Key trio's "Nth biggest day this week" caption (see the
 *  `trioTrainingLoadCaption` doc comment). German ordinals are a bare period
 *  after the number, never an English-style letter suffix. */
function ordinalLabel(n: number, locale: import('../i18n/copy').Locale): string {
  if (locale === 'de') return `${n}.`
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}TH`
  switch (n % 10) {
    case 1: return `${n}ST`
    case 2: return `${n}ND`
    case 3: return `${n}RD`
    default: return `${n}TH`
  }
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

export type { BlockLike } from '../data/blocks'

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
