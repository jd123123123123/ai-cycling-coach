import { useState } from 'react'
import type { TodayWeather } from '../../hooks/useTodayWeather'
import W3WeatherNudge from './W3WeatherNudge'
import { useNavigate } from 'react-router-dom'
import { DayTraining, WeekTrainingCard, TodayWeatherCard, type W3DayFull, type W3Weather, type W3Block, type OnAdapt, type W3WeekGoal } from './W3Sections'
import { T, FONT, DASH, band } from './w3tokens'
import type { Chest } from '../../api/rewards'
import W3TodayStage, { STAGE_PLATE } from './W3TodayStage'
import { useGroundColour } from './useGroundColour'
import W3TodayDock from './W3TodayDock'
import W3ReadinessExplanation from './W3ReadinessExplanation'
import W3PickGoalCard from './W3PickGoalCard'
import W3TodayComposer from './W3TodayComposer'
import W3RideChest from './W3RideChest'
import W3WrappedBolt from './W3WrappedBolt'
import W3TabBar from './W3TabBar'
import { useHeroPanel, useStageGround } from './W3HeroShell'
import W3RecoveryNudge from './W3RecoveryNudge'
import W3ThresholdProposal from './W3ThresholdProposal'
import W3WorkshopNudge from './W3WorkshopNudge'
import W3FormCard from './W3FormCard'
import W3TodayProgress from './W3TodayProgress'
import W3TodayGoals, { W3TodayGoalsSummary } from './W3TodayGoals'
import W3TodayRank from './W3TodayRank'
import W3TodayRides, { W3TodayRidesSummary } from './W3TodayRides'
import W3WeekRecapCard from './W3WeekRecapCard'
import W3TodayOverview from './W3TodayOverview'
import './w3.css'
import './w3todayOverview.css'

export type { W3DayFull, W3Weather, W3Block, OnAdapt, AdaptResult } from './W3Sections'

/**
 * W3 · 01 TODAY — a 1:1 code rebuild of the `w3.pen` frames `gx4WA` / `i5cVpB`.
 *
 * The flagship TODAY screen. Layout, order and W3 styling are transcribed from
 * the pen: a real bike hero, the readiness card with its acid charge-meter, the
 * AI-coach verdict, the three overnight signals, and then the pen's repeating
 * section pattern — a bold title + "Earned by training, not bought" subtitle +
 * an acid pill tag — over Your Week, Todays Training, Details, Your Current
 * Status, Your Rank and Your Progress.
 *
 * The device chrome (clock / wifi / battery) is NOT faked — the OS draws it, so
 * the top is just `W3StatusBar` breathing room.
 *
 * This file is a PURE function of `vm`; `W3TodayPage` builds the vm from real
 * hooks (`useTodayModel`, `useStreak`, `useWallet`). Every field resolves to a
 * real value or an honest `null` (rendered "—" or omitted) — the reward-economy
 * fixtures this comment used to list are all gone; see the vm's own header.
 *
 * The three lower sections are NOT part of `vm`: `W3TodayStatus`,
 * `W3TodayRank`, `W3TodayProgress` and `W3WeekRecapCard` fetch their own data,
 * because each of them needs sources (PMC, crew standings, season trends, the
 * weekly recap) that nothing else on this screen reads.
 */

// ── view model ──
export interface W3Spark { bars: number[]; hi: string }
export interface W3Signal {
  value: string
  unit: string
  /** The baseline comparison, e.g. "−2 vs 7-day". Null when the rider has no
   *  history for this metric — the card prints "—", never a padded 0. */
  sub: string | null
  subHue: string
  /** The metric's own real recent series. NULL, not a stand-in shape, when no
   *  series exists for it (see W3TodayPage) — the card then draws an empty
   *  track so the three cards stay the same height without faking a trend. */
  spark: W3Spark | null
}
export interface W3Vm {
  handle: string
  tierLine: string | null
  // ── the stage the bike stands in ──
  // Optional across the board: the preview harnesses build a W3Vm by hand and
  // have no server behind them, and a rider with one stage gets no rail either
  // way. Absent means "draw the bike on the plain floor", which is exactly what
  // this screen did before backdrops existed.
  stages?: import('../../api/garage').Stage[]
  stage?: string
  /** The bike picture is a composed scene, not the studio collectible. */
  bikeInScene?: boolean
  onSelectStage?: (id: string) => void
  stageRendering?: boolean
  // The rider's digitalised bike (garage). `bikeImage` is null until they've
  // rendered one — that absence is what the hero's empty state is for.
  bikeName: string
  bikeImage: string | null
  /** The RideCoin bike they own, as ridden — the composed build photograph, or
   *  the bike's catalogue photo. The hero's honest fallback when no photographed
   *  real bike exists yet. Null only until the garage loads. */
  collectible: string | null
  /** The rider's digitalised portrait (garage), or null — the identity card
   *  shows an empty seat rather than a photo they never chose. */
  riderImage: string | null
  /** REAL RideCoin balance (`useWallet`), localised — null → "—". */
  coins: string | null
  streak: number | null

  /** A ride waiting to be opened. While this is set the readiness dock's slot
   *  belongs to the chest — see `W3RideChest` for why one screen answers one
   *  question at a time. */
  chest: Chest | null
  readinessAction?: string | null
  readinessDetails?: import('../../api/coach').DailyDecisionReadiness | null
  readiness: number | null
  readinessWord: string | null
  /** WHY there is no readiness figure, dated — "Seit 3 Tagen keine
   *  Nacht-Werte". Only meaningful while `readiness` is null. */
  readinessNote: string | null
  /** Readiness against the previous day that has a real reading — a small
   *  signed kicker, never a second big number competing with the score.
   *  `null` whenever there aren't two dated readings to subtract. */
  readinessDelta: { text: string; favourable: boolean } | null
  /** REAL: the rider's current earn multiplier, derived from their real streak
   *  via the ONE tier table in `api/rewards.ts` (mirrors rewards.py). "—" when
   *  the streak hasn't loaded. */
  earnRate: string
  /** What earns that multiplier — "14-day streak", or the next tier to reach. */
  earnRateWhy: string | null

  recoveryDate?: string
  hrv: W3Signal | null
  rhr: W3Signal | null
  sleep: W3Signal | null

  weekDays: W3DayFull[]
  // "Deine Woche" — block context + the season goal this week feeds.
  planPhaseSchedule?: string[] | null
  planWeekIndex?: number | null
  planPhaseKey?: string | null
  planPhase?: string | null
  weekBlockLabel: string
  weekDoneChip: string | null
  weekLoadLabel: string
  weekGoal: W3WeekGoal | null
  planWeeks: string
  /**
   * Whether a real training plan exists behind this week.
   *
   * FALSE MUST NOT LOOK LIKE TRUE. Without a plan the week still had a block
   * heading ("Trainingsblock") and a "Ganzer Plan" card pointing into an empty
   * screen — a rider was shown the furniture of coaching without any coaching
   * in it, which is exactly the state in which they never go and set one up.
   */
  hasPlan: boolean

  weather: W3Weather
  weatherForecast?: TodayWeather
  weatherNow?: Date

  sessionDur: string | null
  sessionBlocks: W3Block[]
  sessionFtpTag: string
  sessionEarn: string | null
  /** The room's backdrop, for the standalone (non-shell) branch — the shell
   *  resolves its own from the profile. Preview routes use this to show every
   *  theme without an account. */
  stageTheme?: import('./w3stageThemes').StageTheme
  /** True when the bike art is a white-ground catalogue square — the stage
   *  dissolves it with a multiply blend (see W3TodayStage). */
  bikeStudioArt?: boolean
}

// ── primitives ──



// ── band scaffold: every section is a full-width vertical band on w-bg ──
// The pen's repeating section header now lives inside each self-fetching
// section (W3TodayStatus / W3TodayRank / W3TodayProgress), because only the
// section itself knows what its acid pill should say.
// Local copy of the shared helper, and transparent for the same reason: a band
// that paints `T.bg` cuts off the ground colour the hero hands down the page.

/**
 * `onComposeScene` is GONE, and its absence is the point. The old hero offered
 * to compose the rider onto the bike — a slow, paid `cyclr_studio.compose_scene`
 * call with a long defensive anatomy block, reachable from the app's most
 * visited screen. The pen's stage shows the two isolated renders the rider
 * already owns instead, so Today composes nothing and can no longer fail on a
 * mangled limb. Scene composition still exists for RIDES, where it belongs.
 */
/**
 * How much vertical distance the transition below the hero actually needs.
 *
 * A colour that ENDS is an edge; a colour that RUNS OUT is not — but the runway
 * only has to be as long as the step it is hiding. Linear in the perceived
 * distance between the picture's last row and the page's own ground, capped at
 * the 180 px the original hard-coded band used, and zero once the two are
 * within a couple of levels of each other.
 *
 * Exported for its test: this is the number that decides whether the screen
 * reads as one room or has a hole in it.
 */
export function fadeRunway(ground: string | null, page: string, max = 180): number {
  if (!ground) return max
  const lum = (hex: string) => {
    const h = hex.replace('#', '')
    if (h.length < 6) return null
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const a = lum(ground), b = lum(page)
  if (a == null || b == null) return max
  // 26 levels of luminance is roughly where a step across a full-width seam
  // stops being visible on a dark screen; below 2 there is nothing to hide.
  const d = Math.abs(a - b)
  if (d < 2) return 0
  return Math.round(Math.min(1, d / 26) * max)
}

export default function W3TodayView({ vm, onAdapt, onOpenChest, onOpenWrapped }: {
  vm: W3Vm
  onAdapt?: OnAdapt
  /** Fired when the rider swipes the sealed chest open. */
  onOpenChest?: () => void
  /** Opens last week's deck. Absent → the bolt never mounts. */
  onOpenWrapped?: () => void
}) {
  const navigate = useNavigate()
  // The colour the stage picture ends in. Everything the hero touches — the
  // first screen, the section under it, the frame behind both — continues in
  // it, so the app reads as one room rather than as a picture pasted onto a
  // page. Null until the sample lands, and null forever if a canvas read is
  // refused; both cases fall back to the token.
  // The shell resolves the ground for whatever plate is ACTUALLY on stage
  // (a chosen theme knows its own; the studio webp is sampled). Outside the
  // shell — previews, deep links — fall back to sampling the studio.
  const shellGround = useStageGround()
  const sampledGround = useGroundColour(shellGround == null && vm.stageTheme?.ground == null ? STAGE_PLATE : null)
  const ground = shellGround ?? vm.stageTheme?.ground ?? sampledGround
  // How far the picture's last colour is from the app's own, 0..1 over the
  // range where a hard edge would actually be visible. Below ~2 levels nobody
  // can see a step, so nothing is spent hiding one.
  const fadeH = Math.min(24, fadeRunway(ground, T.bg))
  // The week strip and the training card share ONE selection: tapping a day
  // drives which recommendation the card shows. Defaults to today.
  const todayIdx = Math.max(0, vm.weekDays.findIndex((d) => d.status === 'today'))
  const [selDay, setSelDay] = useState(todayIdx)
  const selectedDay = vm.weekDays[selDay] ?? vm.weekDays[todayIdx]
  // ── THE ROOM IS THE SHELL'S, NOT THIS PAGE'S ────────────────────────
  // The stage used to be rendered here, which meant navigating away tore it
  // down and rebuilt it: the rider watched their own machine flash out and
  // back in to answer a different question about it. `W3HeroShell` mounts it
  // once and keeps it; this page contributes the PANEL that floats over the
  // floor and the content beneath, which are the only two things actually
  // about Today.
  //
  // `inShell` is false when this view is rendered outside the shell — a preview
  // route, or a deep link that skips it — and then the hero below is drawn
  // locally exactly as it always was. A page outside the room is a legitimate
  // thing to be.
  // A sealed chest takes the dock's slot outright, for exactly as long as it is
  // sealed. Not a banner above it: the morning after a ride, "what did that
  // give me" IS the question, and stacking it over readiness would make the
  // screen ask two.
  const dock = vm.chest?.sealed ? (
    <W3RideChest chest={vm.chest} onOpen={onOpenChest ?? (() => {})} />
  ) : (
            <W3TodayDock
              endDate={vm.recoveryDate}
              action={vm.readinessAction}
              vm={{
                score: vm.readiness,
                state: vm.readinessWord,
                // `vm.readiness` is already withheld upstream when the wearable
                // is stale (utils/readinessGate). The dock states that absence
                // rather than drawing a zero into a meter — and now it can say
                // WHICH absence. This was hardcoded null, so the one field the
                // dock's own docblock calls "the whole reason the dock still
                // renders" fell back to a generic "Noch keine Messung", while
                // the dated sentence sat computed two files away and was used
                // by the morning briefing alone.
                scoreNote: vm.readinessNote,
                delta: vm.readinessDelta,
                // `earnRate` already carries its × (api/rewards formatMultiplier),
                // so appending one here printed "1,4××".
                bonus: vm.earnRate === DASH ? null : vm.earnRate,
                bonusWhy: vm.earnRateWhy,
                // The unit is its own field now rather than glued into the
                // value: the card sets it small on the baseline, and "71 ms"
                // as one string cannot be typeset that way.
                stats: [
                  { label: 'HRV', value: vm.hrv?.value ?? null, unit: vm.hrv?.unit ?? null,
                    note: vm.hrv?.sub ?? null, noteHue: vm.hrv?.subHue, spark: vm.hrv?.spark ?? null },
                  { label: 'RUHEPULS', value: vm.rhr?.value ?? null, unit: vm.rhr?.unit ?? null,
                    note: vm.rhr?.sub ?? null, noteHue: vm.rhr?.subHue, spark: vm.rhr?.spark ?? null },
                  { label: 'SCHLAF', value: vm.sleep?.value ?? null, unit: vm.sleep?.unit ?? null,
                    note: vm.sleep?.sub ?? null, noteHue: vm.sleep?.subHue, spark: vm.sleep?.spark ?? null },
                ],
                // The first screen answers ONE question with one number and one
                // meter. The overnight signals are the working behind it and
                // live below the fold — see `W3DockVm.showStats`.
                // Not hidden — FOLDED. The row is in the panel and opens with
                // the scroll; see `W3DockVm.expand`.
                showStats: false,
                expand: 0,
                compact: true,
                planLabel: vm.weekDays[todayIdx]?.rest ? 'Heute Ruhetag' : vm.weekDays[todayIdx]?.title ?? null,
              }}
              explanation={<W3ReadinessExplanation report={vm.readinessDetails} score={vm.readiness} action={vm.readinessAction} />}
              onOpen={() => navigate('/e/w3-readiness')} />
  )
  const { inShell, portal } = useHeroPanel(dock)

  const content = (
    <div className="w3-today-content">
      <div aria-hidden style={{ height: fadeH, marginBottom: -fadeH, pointerEvents: 'none', background: `linear-gradient(180deg, ${ground ?? T.heroBg}, ${T.bg})` }} />
      <W3ThresholdProposal />
      <W3RecoveryNudge />
      <W3TodayOverview vm={vm}
        weather={<W3WeatherNudge forecast={vm.weatherForecast} now={vm.weatherNow} />}
        selectedWeekDay={selDay} onSelectWeekDay={setSelDay}
        onOpenPlan={() => navigate('/e/w3-plan')}
        onPickGoal={intent => navigate(intent ? `/e/w3-goal-set?intent=${intent}` : '/e/w3-goal-set')}
        today={vm.weekDays[todayIdx] && vm.hasPlan ? <DayTraining
          day={vm.weekDays[todayIdx]}
          session={{ dur: vm.sessionDur, blocks: vm.weekDays[todayIdx].blocks?.length ? vm.weekDays[todayIdx].blocks! : vm.sessionBlocks, ftpTag: vm.sessionFtpTag, earn: vm.sessionEarn }}
          weather={vm.weather} onAdapt={onAdapt}
        /> : <W3TodayComposer readiness={vm.readiness} />}
        week={<>
          {vm.hasPlan ? <WeekTrainingCard embedded detailsOnly
            days={vm.weekDays} selected={selDay} onSelect={setSelDay}
            blockLabel={vm.weekBlockLabel} doneChip={vm.weekDoneChip} loadLabel={vm.weekLoadLabel}
            day={selectedDay}
            session={{ dur: selDay === todayIdx ? vm.sessionDur : null, blocks: selectedDay?.blocks ?? (selDay === todayIdx ? vm.sessionBlocks : []), ftpTag: vm.sessionFtpTag, earn: vm.sessionEarn }}
            weather={vm.weather} onAdapt={onAdapt}
          /> : <><TodayWeatherCard weather={vm.weather} /><W3TodayComposer readiness={vm.readiness} /></>}
          <W3WeekRecapCard />
          {!vm.chest?.sealed && onOpenWrapped && <div style={band(0)}><W3WrappedBolt onOpen={onOpenWrapped} /></div>}
        </>}
        form={null}
        persistentForm={expanded => <W3FormCard embedded expanded={expanded} />}
        crew={<W3TodayRank />}
        ridesSummary={<W3TodayRidesSummary />}
        rides={<W3TodayRides />}
        progress={<W3TodayProgress />}
        goalSummary={<W3TodayGoalsSummary />}
        goals={<>
          {!vm.hasPlan && <W3PickGoalCard onPick={key => navigate(`/e/w3-goal-set?intent=${key}`)} />}
          <W3TodayGoals /><W3WorkshopNudge />
        </>}
      />
    </div>
  )

  if (inShell) return <>{portal}{content}</>

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <div style={{
          position: 'relative',
          height: 'auto',
          display: 'flex', flexDirection: 'column',
          background: ground ?? T.heroBg,
        }}>
          <W3TodayStage
            compact
            vm={{
              handle: vm.handle,
              role: vm.tierLine,
              rider: vm.riderImage,
              // The rider's own render first, their collectible second, and the
              // labelled example only when neither exists. Never a stock bike
              // presented as theirs.
              bike: vm.bikeImage ?? vm.collectible,
              bikeName: vm.bikeName,
              bikeInScene: vm.bikeInScene,
              coins: vm.coins,
              streak: vm.streak,
              bonus: vm.earnRate === DASH ? null : vm.earnRate,
              stages: vm.stages,
              stage: vm.stage,
              onSelectStage: vm.onSelectStage,
              rendering: vm.stageRendering,
              theme: vm.stageTheme,
              bikeStudioArt: vm.bikeStudioArt,
            }} />
          <div style={{
            position: 'relative', zIndex: 2, marginTop: 'auto',
            padding: '0 16px 8px', flex: 'none',
          }}>
            {dock}
          </div>
        </div>
        {content}
        <W3TabBar />
      </div>
    </div>
  )
}
