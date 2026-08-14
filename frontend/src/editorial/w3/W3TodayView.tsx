import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import {
  Bike, Flame, Pencil, CalendarRange,
  Sparkles, Star,
} from 'lucide-react'
import { WeekTrainingCard, WeekNavCards, MirrorChart, type W3DayFull, type W3Weather, type W3Mirror, type W3Block, type OnAdapt, type W3WeekGoal } from './W3Sections'
import { T, FONT, EASE, grow, Kicker, DASH } from './w3tokens'
import W3BikeHero from './W3BikeHero'
import W3RiderAvatar from './W3RiderAvatar'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import W3RecoveryNudge from './W3RecoveryNudge'
import W3TodayProgress from './W3TodayProgress'
import { W3CoachFab } from './W3CoachChat'
import W3NavMenu, { W3NavIcon } from './W3NavMenu'
import './w3.css'

export type { W3DayFull, W3Weather, W3Mirror, W3Block, OnAdapt, AdaptResult } from './W3Sections'

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
 * hooks (`useTodayModel`, `useStreak`, `useWallet`). Fields that map to real
 * coaching data resolve to a value or an honest `null` (rendered "—"); fields
 * that belong to the not-yet-built reward economy (per-ride earn, the Garage
 * upgrade + second currency, the crew challenge) are DESIGN FIXTURES
 * reproducing the pen, each marked `fixture:` in the vm. The earn rate is NOT
 * one of them any more — it is derived from the rider's real streak through
 * the single tier table in `api/rewards.ts`, which mirrors rewards.py.
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
export interface W3CrewRow { name: string; color: string; pct: number; me: boolean }
export interface W3Vm {
  handle: string
  tierLine: string
  avatarUrl: string | null
  avatarInitial: string
  // The rider's digitalised bike (garage). `bikeImage` is null until they've
  // rendered one — that absence is what the hero's empty state is for.
  bikeName: string
  bikeImage: string | null
  bikeLoading: boolean
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

  zoneTag: string | null

  weather: W3Weather

  mirror: W3Mirror

  sessionTitle: string | null
  sessionDur: string | null
  sessionTargetW: string
  sessionTss: string
  sessionFtpPct: string
  sessionBlocks: W3Block[]
  sessionFtpTag: string
  sessionEarn: string // fixture

  form: { fitness: number; fatigue: number; formVal: number } | null

  crewCaption: string
  crew: W3CrewRow[] // fixture
  crewRank: string // fixture
  challengeLabel: string // fixture
  challengeValue: string // fixture
  challengePct: number // fixture

  garagePct: number // fixture
  garageName: string // fixture
  garageRidesLine: string // fixture
  garageMakesLine: string // fixture
  power: string // real (wallet balance) — "—" when the wallet hasn't loaded
  cycle: string // fixture
  mRides: { pct: number; label: string }
  mDist: { pct: number; label: string }
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

/** The readiness charge-meter — a row of acid bars filled in proportion to the
 *  real readiness score (an honest gauge, not a fixture). Animates in. */
function ChargeMeter({ score }: { score: number | null }) {
  const reduce = useReducedMotion()
  const N = 18
  const filled = score == null ? 0 : Math.max(0, Math.min(N, Math.round((score / 100) * N)))
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 26, width: '100%' }}>
      {Array.from({ length: N }).map((_, i) => {
        const on = i < filled
        return (
          <motion.div key={i}
            initial={reduce ? false : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={grow(i * 0.03)}
            style={{ flex: 1, height: 26, transformOrigin: 'bottom', borderRadius: 3, background: on ? T.acid : T.surface2, boxShadow: on ? `0 0 10px ${T.acid}55` : 'none' }} />
        )
      })}
    </div>
  )
}


/** The pen's repeating section header: bold title, "Earned by training, not
 *  bought" subtitle, and an acid pill tag on the right. */
function SectionHead({ title, subtitle, tag }: { title: string; subtitle?: string; tag: string | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: T.bg, padding: '0 20px 12px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>{title}</span>
        {subtitle && <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>{subtitle}</span>}
      </div>
      {tag && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '7px 13px', borderRadius: 100, background: T.acidDim, flex: 'none' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, color: T.acid }}>{tag}</span>
        </div>
      )}
    </div>
  )
}

// ── band scaffold: every section is a full-width vertical band on w-bg ──
const band = (padBottom: number): CSSProperties => ({ display: 'flex', flexDirection: 'column', width: '100%', background: T.bg, padding: `0 20px ${padBottom}px` })
const card = (): CSSProperties => ({ background: T.surface, borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column', width: '100%' })

export default function W3TodayView({ vm, onAdapt }: { vm: W3Vm; onAdapt?: OnAdapt }) {
  const navigate = useNavigate()
  // The week strip and the training card share ONE selection: tapping a day
  // drives which recommendation the card shows. Defaults to today.
  const todayIdx = Math.max(0, vm.weekDays.findIndex((d) => d.status === 'today'))
  const [selDay, setSelDay] = useState(todayIdx)
  const selectedDay = vm.weekDays[selDay] ?? vm.weekDays[todayIdx]

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>

        {/* ── Safe-area breathing room — NOT a faked status bar ── */}
        <W3StatusBar />

        {/* ── Header: rider + streak + bell ── */}
        <div style={{ padding: '10px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* Reads the garage, not `users.avatar_url` — see W3RiderAvatar. */}
            <W3RiderAvatar size={34} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{vm.handle}</span>
              <span style={{ fontSize: 11.5, fontWeight: 400, color: T.quiet }}>{vm.tierLine}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '7px 11px', borderRadius: 100, background: T.acidDim }}>
              <Flame size={13} color={T.acid} />
              <span style={{ fontSize: 13, fontWeight: 600, color: T.acid }}>{vm.streak ?? DASH}</span>
            </div>
            <W3NavIcon to="/e/w3-plan" label="Training plan"><CalendarRange size={16} color={T.ink} /></W3NavIcon>
            <W3NavMenu />
          </div>
        </div>

        {/* ── Garage band: the current bike + edit. The chip names the bike the
             rider actually has; with an empty garage it says so. ── */}
        <div style={{ padding: '0 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '7px 12px 7px 10px', borderRadius: 100, background: T.surface }}>
            <Bike size={13} color={vm.bikeImage ? T.acid : T.quiet} />
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: vm.bikeImage ? T.ink : T.quiet }}>
              {vm.bikeImage ? vm.bikeName : 'NO BIKE YET'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <W3NavIcon to="/e/w3-bike-studio" label={vm.bikeImage ? 'Edit bike' : 'Add your bike'}><Pencil size={15} color={T.mid} /></W3NavIcon>
          </div>
        </div>

        {/* ── Bike Hero: the rider's OWN digitalised bike — or, when the garage
             slot is empty, the offer to make one. Never a stock stand-in. ── */}
        <W3BikeHero image={vm.bikeImage} name={vm.bikeName} loading={vm.bikeLoading} />

        {/* ── Hero: readiness + charge meter ── */}
        <div style={{ ...band(24), paddingTop: 20, gap: 14 }}>
          <button onClick={() => navigate('/e/w3-readiness')} aria-label="Readiness-Details"
            style={{ width: '100%', padding: '18px 18px 16px', borderRadius: 22, background: T.surface, border: `1px solid ${T.stroke}`, display: 'flex', flexDirection: 'column', gap: 14, cursor: 'pointer', fontFamily: FONT, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span style={{ fontSize: 68, fontWeight: 700, letterSpacing: -3, lineHeight: 0.82, color: vm.readiness != null ? T.acid : T.quiet, textShadow: vm.readiness != null ? `0 0 26px ${T.acid}66` : 'none' }}>{vm.readiness ?? DASH}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Kicker>Readiness</Kicker>
                  <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, color: T.ink }}>{vm.readinessWord ?? DASH}</span>
                  {/* The day-over-day move: a small signed kicker, deliberately
                      not a second big number next to the score. Absent — not
                      zeroed — when there aren't two dated readings. */}
                  {vm.readinessDelta && (
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: -0.1, color: vm.readinessDelta.favourable ? T.acid : T.mid }}>
                      {vm.readinessDelta.text}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                <Kicker>Earn rate</Kicker>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <Star size={14} color={T.acid} fill={T.acid} /><span style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>{vm.earnRate}</span>
                </div>
                {vm.earnRateWhy && (
                  <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.3, color: T.quiet, textAlign: 'right', maxWidth: 140 }}>{vm.earnRateWhy}</span>
                )}
              </div>
            </div>
            <ChargeMeter score={vm.readiness} />
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 11px 6px 9px', borderRadius: 100, background: T.acidDim }}>
              <Sparkles size={12} color={T.acid} /><span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, color: T.acid }}>AI COACH</span>
            </div>
            <span style={{ fontSize: 10, fontWeight: 500, color: T.quiet }}>{vm.coachDate}</span>
          </div>
        </div>

        {/* ── Recovery nudge: the real "Erholungssignal / Gute Erholung" morning
             signal (HRV/sleep/RHR vs baseline), replacing the long coach text ── */}
        <W3RecoveryNudge />

        {/* ── Signals ── */}
        <div style={{ ...band(26), flexDirection: 'row', gap: 8 }}>
          <SignalCard label="HRV" sig={vm.hrv} />
          <SignalCard label="Resting HR" sig={vm.rhr} />
          <SignalCard label="Sleep" sig={vm.sleep} />
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

        {/* ── Navigation, not week content: the season goal + the whole plan ── */}
        <WeekNavCards goal={vm.weekGoal} planWeeks={vm.planWeeks}
          onGoal={() => navigate('/e/w3-goal')} onPlan={() => navigate('/e/w3-plan')} />

        {/* ── Your Current Status: 6-week fitness/fatigue mirror + form ── */}
        <SectionHead title="Your Current Status" subtitle="Earned by training, not bought" tag={vm.zoneTag} />
        {vm.form
          ? <MirrorChart m={vm.mirror} fitness={vm.form.fitness} fatigue={vm.form.fatigue} form={vm.form.formVal} />
          : (
            <div style={band(26)}>
              <div style={{ ...card(), alignItems: 'center' }}>
                <Kicker>Where you stand</Kicker>
                <span style={{ fontSize: 26, fontWeight: 700, color: T.quiet, marginTop: 8 }}>{DASH}</span>
              </div>
            </div>
          )}

        {/* ── Your Rank (fixture: crew standings not wired) ── */}
        <SectionHead title="Your Rank" subtitle="Earned by training, not bought" tag={vm.zoneTag} />
        <div style={band(26)}>
          <div style={{ ...card(), gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Kicker>This week · your crew</Kicker>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.mid, lineHeight: 1.35 }}>{vm.crewCaption}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {vm.crew.map((r) => (
                <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 100, background: r.color, flex: 'none', border: r.me ? `2px solid ${T.acid}` : 'none' }} />
                  <div style={{ width: 64 }}><span style={{ fontSize: 13, fontWeight: r.me ? 700 : 600, color: r.me ? T.acid : T.ink }}>{r.name}</span></div>
                  <div style={{ flex: 1, height: 6, borderRadius: 100, background: '#FFFFFF14', overflow: 'hidden' }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (r.pct / 150) * 100)}%` }} transition={{ duration: 0.7, ease: EASE }}
                      style={{ height: '100%', borderRadius: 100, background: r.me ? T.acid : T.d3 }} />
                  </div>
                  <div style={{ width: 42, textAlign: 'right' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: r.me ? T.acid : T.mid }}>{r.pct}%</span>
                    {r.me && <div style={{ fontSize: 10, fontWeight: 700, color: T.acid }}>{vm.crewRank}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ height: 1, background: T.rule }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: T.quiet }}>{vm.challengeLabel}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.ink }}>{vm.challengeValue}</span>
              </div>
              <div style={{ height: 6, borderRadius: 100, background: '#FFFFFF14', overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${vm.challengePct}%` }} transition={{ duration: 0.8, ease: EASE }}
                  style={{ height: '100%', borderRadius: 100, background: T.acid }} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Your progress: real fitness goals (FTP/VO2max/20-min) + challenges ── */}
        <W3TodayProgress />

        <W3CoachFab />
        <W3TabBar />

      </div>
    </div>
  )
}
