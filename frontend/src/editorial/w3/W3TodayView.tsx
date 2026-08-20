import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Sparkles, Star } from 'lucide-react'
import { WeekTrainingCard, WeekNavCards, type W3DayFull, type W3Weather, type W3Block, type OnAdapt, type W3WeekGoal } from './W3Sections'
import { T, FONT, grow, Kicker, DASH, Reveal } from './w3tokens'
import W3TodayStage, { STAGE_PLATE } from './W3TodayStage'
import { useGroundColour } from './useGroundColour'
import W3TodayDock from './W3TodayDock'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import W3RecoveryNudge from './W3RecoveryNudge'
import W3TodayProgress from './W3TodayProgress'
import W3TodayStatus from './W3TodayStatus'
import W3TodayRank from './W3TodayRank'
import W3WeekRecapCard from './W3WeekRecapCard'
import W3WhyToday from './W3WhyToday'
import W3ScoreCard from './W3ScoreCard'
import './w3.css'

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
  avatarUrl: string | null
  avatarInitial: string
  // The rider's digitalised bike (garage). `bikeImage` is null until they've
  // rendered one — that absence is what the hero's empty state is for.
  bikeName: string
  bikeImage: string | null
  bikeLoading: boolean
  /** The RideCoin bike they own, as ridden — the composed build photograph, or
   *  the bike's catalogue photo. The hero's honest fallback when no photographed
   *  real bike exists yet. Null only until the garage loads. */
  collectible: string | null
  collectibleName: string | null
  /** The rider's digitalised portrait (garage), or null — the identity card
   *  shows an empty seat rather than a photo they never chose. */
  riderImage: string | null
  /** REAL RideCoin balance (`useWallet`), localised — null → "—". */
  coins: string | null
  streak: number | null

  readiness: number | null
  readinessWord: string | null
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
  coachDate: string
  coachLead: string | null
  coachWhy: string | null

  hrv: W3Signal | null
  rhr: W3Signal | null
  sleep: W3Signal | null

  weekMeta: string
  weekDoneLabel: string | null
  weekDays: W3DayFull[]
  // "Deine Woche" — block context + the season goal this week feeds.
  weekBlockLabel: string
  weekDoneChip: string | null
  weekLoadLabel: string
  weekGoal: W3WeekGoal | null
  planWeeks: string

  weather: W3Weather

  sessionTitle: string | null
  sessionDur: string | null
  sessionTargetW: string
  sessionTss: string
  sessionFtpPct: string
  sessionBlocks: W3Block[]
  sessionFtpTag: string
  sessionEarn: string | null
}

// ── primitives ──
function Spark({ spark, h = 22 }: { spark: W3Spark | null; h?: number }) {
  const reduce = useReducedMotion()
  // No real series for this metric — hold the height with an empty track
  // rather than draw a shape the rider's data never made.
  if (!spark || spark.bars.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', width: '100%', height: h }}>
        <div style={{ width: '100%', height: 2, borderRadius: 1, background: T.d2, opacity: 0.5 }} />
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', width: '100%', height: h }}>
      {spark.bars.map((b, i) => {
        const last = i === spark.bars.length - 1
        const bh = Math.max(2, Math.round(b * h))
        return (
          <motion.div key={i}
            initial={reduce ? false : { height: 0 }}
            animate={{ height: bh }}
            transition={grow(i * 0.04)}
            style={{ flex: 1, height: bh, borderRadius: 1.5, background: last ? spark.hi : T.d2, boxShadow: last ? `0 0 8px ${spark.hi}66` : 'none' }} />
        )
      })}
    </div>
  )
}

function SignalCard({ label, sig }: { label: string; sig: W3Signal | null }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 13px', borderRadius: 18, background: T.surface }}>
      <Kicker>{label}</Kicker>
      {sig ? (
        <>
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
            <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.8, color: T.ink, lineHeight: 0.9 }}>{sig.value}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet, lineHeight: 2 }}>{sig.unit}</span>
          </div>
          <Spark spark={sig.spark} />
          <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.25, color: sig.sub ? sig.subHue : T.quiet }}>{sig.sub ?? DASH}</span>
        </>
      ) : (
        <span style={{ fontSize: 32, fontWeight: 700, color: T.quiet, lineHeight: 0.9 }}>{DASH}</span>
      )}
    </div>
  )
}


// ── band scaffold: every section is a full-width vertical band on w-bg ──
// The pen's repeating section header now lives inside each self-fetching
// section (W3TodayStatus / W3TodayRank / W3TodayProgress), because only the
// section itself knows what its acid pill should say.
// Local copy of the shared helper, and transparent for the same reason: a band
// that paints `T.bg` cuts off the ground colour the hero hands down the page.
const band = (padBottom: number): CSSProperties => ({ display: 'flex', flexDirection: 'column', width: '100%', padding: `0 20px ${padBottom}px` })

/**
 * `onComposeScene` is GONE, and its absence is the point. The old hero offered
 * to compose the rider onto the bike — a slow, paid `cyclr_studio.compose_scene`
 * call with a long defensive anatomy block, reachable from the app's most
 * visited screen. The pen's stage shows the two isolated renders the rider
 * already owns instead, so Today composes nothing and can no longer fail on a
 * mangled limb. Scene composition still exists for RIDES, where it belongs.
 */
export default function W3TodayView({ vm, onAdapt }: {
  vm: W3Vm
  onAdapt?: OnAdapt
}) {
  const navigate = useNavigate()
  // The colour the stage picture ends in. Everything the hero touches — the
  // first screen, the section under it, the frame behind both — continues in
  // it, so the app reads as one room rather than as a picture pasted onto a
  // page. Null until the sample lands, and null forever if a canvas read is
  // refused; both cases fall back to the token.
  const ground = useGroundColour(STAGE_PLATE)
  // How far the readiness panel is open, from the page's own scroll. The first
  // 130px of travel opens it fully — far enough that a stray flick does not
  // trigger it, short enough that the answer is there before the hero leaves.
  const [openness, setOpenness] = useState(0)
  useEffect(() => {
    const onScroll = () => setOpenness(Math.min(1, window.scrollY / 130))
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  // The week strip and the training card share ONE selection: tapping a day
  // drives which recommendation the card shows. Defaults to today.
  const todayIdx = Math.max(0, vm.weekDays.findIndex((d) => d.status === 'today'))
  const [selDay, setSelDay] = useState(todayIdx)
  const selectedDay = vm.weekDays[selDay] ?? vm.weekDays[todayIdx]
  // Does the PLAN prescribe rest today? `status` can't answer this — it is
  // 'today' for today whatever the day type is — so read the day's own `rest`.
  const todayIsRest = vm.weekDays[todayIdx]?.rest === true

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>

        {/* ── THE PEN SCREEN ──────────────────────────────────────────────
             Frames `YIU3g` / `qv4Aw`, rebuilt: one viewport that answers the
             day on its own — the rider and their bike on a lit stage, and one
             dock carrying readiness. Everything below this block is the scroll,
             and a rider who never scrolls has already been answered.

             Sized to the viewport MINUS the fixed tab bar, so the dock lands
             exactly above it the way it does in the pen, on any device height
             rather than only at 844. ── */}
        {/* THE ROOM IS THE WHOLE SCREEN.
            The stage used to be one band in a column, so its floor stopped at
            the readiness panel and the picture cut hard into flat black — the
            seam the rider kept pointing at. The stage is absolute and full
            bleed now; the status bar and the panel float over it. That is also
            what puts the bike properly low: its floor line is measured against
            the whole screen instead of against the leftover space above a
            panel. */}
        <div style={{
          position: 'relative',
          height: 'calc(100dvh - 92px - env(safe-area-inset-bottom))',
          display: 'flex', flexDirection: 'column',
          // ONE SYSTEM, NO SEAM. The page continues in exactly the colour the
          // stage picture finishes with, read off its bottom edge rather than
          // chosen — so there is no border to hide and nothing to blend. Change
          // the stage and the whole screen follows it. Falls back to the token
          // while the sample loads, which is what shipped before.
          background: ground ?? T.heroBg,
        }}>
          <W3StatusBar />

          <W3TodayStage
            fullBleed
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
            }} />

          {/* The pen's bottom slot: padding 16, one panel, centred.
              `paddingBottom: 28` — the dock sat tight against the tab bar with
              nothing under it, so the first screen ended on a hard edge and gave
              no sign that anything followed. The extra air is also the room the
              scroll cue needs. */}
          <div style={{
            position: 'relative', zIndex: 2, marginTop: 'auto',
            // LOWER, so the closed panel clears the back wheel. The bike stands
            // on a floor line at 76% of the stage; a panel that starts higher
            // than that cuts across the machine it is standing next to.
            padding: '10px 16px 18px', flex: 'none',
          }}>
            <W3TodayDock
              vm={{
                score: vm.readiness,
                state: vm.readinessWord,
                // `vm.readiness` is already withheld upstream when the wearable
                // is stale (utils/readinessGate). The dock states that absence
                // rather than drawing a zero into a meter.
                scoreNote: null,
                // `earnRate` already carries its × (api/rewards formatMultiplier),
                // so appending one here printed "1,4××".
                bonus: vm.earnRate === DASH ? null : vm.earnRate,
                stats: [
                  { label: 'HRV', value: vm.hrv ? `${vm.hrv.value} ${vm.hrv.unit}`.trim() : null },
                  { label: 'RUHEPULS', value: vm.rhr ? vm.rhr.value : null },
                  { label: 'SCHLAF', value: vm.sleep ? vm.sleep.value : null },
                ],
                // The first screen answers ONE question with one number and one
                // meter. The overnight signals are the working behind it and
                // live below the fold — see `W3DockVm.showStats`.
                // Not hidden — FOLDED. The row is in the panel and opens with
                // the scroll; see `W3DockVm.expand`.
                showStats: true,
                expand: openness,
              }}
              onOpen={() => navigate('/e/w3-readiness')} />
          </div>
        </div>

        {/* The overnight signals used to live here as their own band. They are
            inside the readiness panel now, opened by scrolling — which removes
            a whole surface from the screen, and with it the second place where
            a background colour had to stop. */}

        {/* THE ONE TRANSITION IN THE SCREEN.
            The stage's ground colour used to stop at the bottom of the first
            screen and the page resumed in flat black — a second hard line,
            directly below the horizon line that belongs there. A colour that
            ENDS is always an edge; a colour that runs out is not. This band
            carries the sampled ground into the app's own black over 180px, so
            the eye reads one continuous room rather than three stacked
            surfaces. It draws nothing and holds nothing — it is only the
            distance the two colours need to meet in. */}
        <div aria-hidden style={{
          height: 180, flex: 'none',
          background: `linear-gradient(180deg, ${ground ?? T.heroBg} 0%, ${T.bg} 100%)`,
        }} />

        {/* ── Hero: readiness + charge meter ──
             The card is `W3ScoreCard` now — the same element grades a finished
             ride's execution score. Everything it prints is passed in from real
             data; it owns no copy of its own.

             REST-DAY RECONCILIATION: a 76 next to "Bereit" on a day the plan
             prescribes rest reads as a contradiction the rider has to solve.
             Both facts are true — readiness measures the BODY, the plan decides
             the DAY — so the card says so instead of hiding the number. The
             rest flag comes from `day.rest` (the plan's day TYPE), never from
             `status`, which is 'today' whatever kind of day it is. ── */}
        {/* band(26) — every content band on Today now shares one bottom gap. */}
        <div style={{ ...band(26), paddingTop: 20, gap: 14 }}>
          <W3ScoreCard
            score={vm.readiness}
            label="Bereitschaft"
            word={vm.readinessWord}
            // The day-over-day move: a small signed kicker, deliberately not a
            // second big number next to the score. Absent — not zeroed — when
            // there aren't two dated readings.
            note={vm.readinessDelta}
            aside={{
              label: 'Multiplikator',
              value: vm.earnRate,
              caption: vm.earnRateWhy,
              icon: <Star size={14} color={T.acid} fill={T.acid} />,
            }}
            context={todayIsRest && vm.readiness != null ? (
              <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>
                Ruhetag — die {vm.readiness} beschreibt deinen Körper, nicht den Plan.
                Heute wird die Erholung angelegt, nicht ausgegeben.
              </span>
            ) : null}
            onClick={() => navigate('/e/w3-readiness')}
            ariaLabel="Readiness-Details"
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 11px 6px 9px', borderRadius: 100, background: T.acidDim }}>
              <Sparkles size={12} color={T.acid} /><span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, color: T.acid }}>KI-COACH</span>
            </div>
            <span style={{ fontSize: 10, fontWeight: 500, color: T.quiet }}>{vm.coachDate}</span>
          </div>

          {/* ── The coach's own verdict (pen frame `k4XB0`): the DAY-level call
               in the coach's voice — headline, then the body that names the
               evidence it read. REAL: GET /coach/brief → `verdict` / `rationale`
               (via useTodayModel). Both nullable; an absent verdict renders
               nothing rather than an empty block. The SESSION-level "why THIS
               session" lives further down in `W3WhyToday`, structured, so the
               two never narrate the same thing twice. ── */}
          {(vm.coachLead || vm.coachWhy) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
              {vm.coachLead && (
                <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: -0.75, lineHeight: 1.18, color: T.ink, minWidth: 0 }}>
                  {vm.coachLead}
                </span>
              )}
              {vm.coachWhy && (
                <span style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.6, color: T.mid, minWidth: 0 }}>
                  {vm.coachWhy}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Recovery nudge: the real "Erholungssignal / Gute Erholung" morning
             signal (HRV/sleep/RHR vs baseline), replacing the long coach text ── */}
        <W3RecoveryNudge />

        {/* ── Signals ── */}
        <div style={{ ...band(26), flexDirection: 'row', gap: 8 }}>
          <SignalCard label="HRV" sig={vm.hrv} />
          <SignalCard label="Ruhepuls" sig={vm.rhr} />
          <SignalCard label="Schlaf" sig={vm.sleep} />
        </div>

        {/* ── Deine Woche — ONE card: the day selector, the SELECTED day's
             training (plan / adapt / planned-vs-done), and that day's weather.
             Tapping a day drives everything below the strip inside the card. ── */}
        <WeekTrainingCard
          days={vm.weekDays} selected={selDay} onSelect={setSelDay}
          blockLabel={vm.weekBlockLabel} doneChip={vm.weekDoneChip} loadLabel={vm.weekLoadLabel}
          day={selectedDay}
          session={{
            dur: vm.sessionDur,
            // The card follows the selected day: its own real power profile when
            // it has one (today, or a set future day), else today's bars.
            blocks: selectedDay.blocks && selectedDay.blocks.length > 0 ? selectedDay.blocks : vm.sessionBlocks,
            ftpTag: vm.sessionFtpTag,
            earn: vm.sessionEarn,
          }}
          weather={vm.weather}
          onAdapt={onAdapt} />

        {/* ── "Warum diese Einheit?" — the session-level why, every day. Reads
             the brief's adaptation explainer + the real mesocycle block, and
             renders nothing when neither is on the wire. ── */}
        <W3WhyToday />

        {/* ── Navigation, not week content: the season goal + the whole plan ── */}
        <WeekNavCards goal={vm.weekGoal} planWeeks={vm.planWeeks}
          onGoal={() => navigate('/e/w3-goal')} onPlan={() => navigate('/e/w3-plan')} />

        {/* ── Letzte Woche — the weekly story as a tappable card, opening the
             celebration popup. Shares ONE producer (`useWeekReviewVm`) with the
             full /e/w3-week-review page, and renders nothing when last week
             held no story. It sits here on purpose: the bridge from what you
             did to where you now stand. ── */}
        <Reveal><W3WeekRecapCard /></Reveal>

        {/* ── The lower half arrives as you reach it ─────────────────────────
             These four sections are the long tail of the scroll, and a long
             tail that is entirely static reads as a list rather than a page.
             Each lifts and fades ONCE as its top edge arrives (see `Reveal`).

             Wrapped HERE rather than inside each component on purpose: each of
             these owns its own `band(26)` root, and the reveal is a property of
             how Today composes them, not of what they are — W3TodayProgress
             renders the same on its own preview route without inheriting a
             scroll behaviour it never asked for. ── */}

        {/* ── Dein aktueller Status — the real 90-day CTL/ATL curve on a proper
             axis, what the number MEANS (peak / "so fit wie zuletzt am …" /
             the 4-week move), the form band, and the server's own forward
             projection. Self-fetching (usePMC + /weeks + /coach/trajectory),
             like W3WhyToday and W3TodayProgress. ── */}
        <Reveal><W3TodayStatus /></Reveal>

        {/* ── Dein Rang — REAL crew standings (GET /crews/me/standings). The old
             fixture leaderboard and its invented "um die Welt" challenge are
             gone; no crew now renders an honest empty state. ── */}
        <Reveal><W3TodayRank /></Reveal>

        {/* ── Your progress: real fitness goals (FTP/VO2max/20-min) + challenges ── */}
        <Reveal><W3TodayProgress /></Reveal>

        <W3TabBar />

      </div>
    </div>
  )
}
