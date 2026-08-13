import { useState, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  Bell, Bike, Flame, Share2, Pencil,
  Sparkles, Star, Gauge as GaugeIcon,
} from 'lucide-react'
import { WeekSection, WeatherRoute, MirrorChart, TrainingSection, type W3DayFull, type W3Weather, type W3Mirror, type W3Block, type OnAdapt } from './W3Sections'
import { T, FONT, EASE, grow, Kicker, DASH } from './w3tokens'
import { STARTER_BIKE } from './starterBike'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import W3RecoveryInsight from './W3RecoveryInsight'
import { W3CoachFab } from './W3CoachChat'
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
 * that belong to the not-yet-built reward economy (earn rate, per-ride earn,
 * the Garage upgrade + second currency, the crew standings) are DESIGN FIXTURES
 * reproducing the pen, each marked `fixture:` in the vm.
 */

// ── view model ──
export interface W3Spark { bars: number[]; hi: string }
export interface W3Signal { value: string; unit: string; sub: string | null; subHue: string; spark: W3Spark }
export interface W3CrewRow { name: string; color: string; pct: number; me: boolean }
export interface W3Vm {
  handle: string
  tierLine: string
  avatarUrl: string | null
  avatarInitial: string
  bikeName: string
  streak: number | null

  readiness: number | null
  readinessWord: string | null
  earnRate: string // fixture
  coachDate: string
  coachLead: string | null
  coachWhy: string | null

  hrv: W3Signal | null
  rhr: W3Signal | null
  sleep: W3Signal | null

  weekMeta: string
  weekDoneLabel: string | null
  weekDays: W3DayFull[]

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
function Spark({ spark, h = 22 }: { spark: W3Spark; h?: number }) {
  const reduce = useReducedMotion()
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

function Ring({ pct, size = 46 }: { pct: number; size?: number }) {
  const reduce = useReducedMotion()
  const r = (size - 5) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - pct / 100)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: 'none' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#FFFFFF14" strokeWidth={5} />
      <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.acid} strokeWidth={5} strokeLinecap="round"
        strokeDasharray={c}
        initial={reduce ? false : { strokeDashoffset: c }}
        animate={{ strokeDashoffset: off }}
        transition={{ duration: 0.9, ease: EASE }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={12} fontWeight={600} fill={T.ink} fontFamily={FONT}>{Math.round(pct)}%</text>
    </svg>
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

const IconBtn = ({ children }: { children: ReactNode }) => (
  <div style={{ width: 34, height: 34, borderRadius: 100, background: T.surface, display: 'grid', placeItems: 'center', flex: 'none' }}>{children}</div>
)

// ── band scaffold: every section is a full-width vertical band on w-bg ──
const band = (padBottom: number): CSSProperties => ({ display: 'flex', flexDirection: 'column', width: '100%', background: T.bg, padding: `0 20px ${padBottom}px` })
const card = (): CSSProperties => ({ background: T.surface, borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column', width: '100%' })

export default function W3TodayView({ vm, onAdapt }: { vm: W3Vm; onAdapt?: OnAdapt }) {
  const reduce = useReducedMotion()
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
            <div style={{ width: 34, height: 34, borderRadius: 100, overflow: 'hidden', background: T.surface2, flex: 'none', display: 'grid', placeItems: 'center' }}>
              {vm.avatarUrl
                ? <img src={vm.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 14, fontWeight: 700, color: T.mid }}>{vm.avatarInitial}</span>}
            </div>
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
            <IconBtn><Bell size={16} color={T.ink} /></IconBtn>
          </div>
        </div>

        {/* ── Garage band: the current bike + share / edit ── */}
        <div style={{ padding: '0 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '7px 12px 7px 10px', borderRadius: 100, background: T.surface }}>
            <Bike size={13} color={T.acid} /><span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: T.ink }}>{vm.bikeName}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <IconBtn><Share2 size={15} color={T.mid} /></IconBtn>
            <IconBtn><Pencil size={15} color={T.mid} /></IconBtn>
          </div>
        </div>

        {/* ── Bike Hero: the rider's real bike photo, faded into the page ── */}
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: EASE }}
          style={{ position: 'relative', height: 300, background: T.bg, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          {/* The pedestal box — a raised surface the bike stands ON. */}
          <div style={{ position: 'absolute', left: 20, right: 20, bottom: 22, height: 132, borderRadius: 26, background: `linear-gradient(180deg, ${T.surface2}, ${T.surface})`, border: `1px solid ${T.stroke}`, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 90% at 50% 0%, ${T.acid}22, transparent 60%)` }} />
          </div>
          {/* Contact shadow so the bike reads as sitting on the box, not floating. */}
          <div style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', width: 210, height: 26, borderRadius: '50%', background: '#000000', filter: 'blur(12px)', opacity: 0.55 }} />
          {/* The bike, popping OUT above the box top for a 3D standing effect. */}
          <motion.img
            src={STARTER_BIKE} alt={vm.bikeName}
            initial={reduce ? false : { y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.7, ease: EASE }}
            style={{ position: 'relative', width: '82%', height: '92%', objectFit: 'contain', objectPosition: 'center bottom', filter: 'drop-shadow(0 10px 24px #000000AA)', marginBottom: 44 }} />
        </motion.div>

        {/* ── Hero: readiness + charge meter ── */}
        <div style={{ ...band(24), paddingTop: 20, gap: 14 }}>
          <div style={{ width: '100%', padding: '18px 18px 16px', borderRadius: 22, background: T.surface, border: `1px solid ${T.stroke}`, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span style={{ fontSize: 68, fontWeight: 700, letterSpacing: -3, lineHeight: 0.82, color: vm.readiness != null ? T.acid : T.quiet, textShadow: vm.readiness != null ? `0 0 26px ${T.acid}66` : 'none' }}>{vm.readiness ?? DASH}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Kicker>Readiness</Kicker>
                  <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, color: T.ink }}>{vm.readinessWord ?? DASH}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                <Kicker>Earn rate</Kicker>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <Star size={14} color={T.acid} fill={T.acid} /><span style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>{vm.earnRate}</span>
                </div>
              </div>
            </div>
            <ChargeMeter score={vm.readiness} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 11px 6px 9px', borderRadius: 100, background: T.acidDim }}>
              <Sparkles size={12} color={T.acid} /><span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, color: T.acid }}>AI COACH</span>
            </div>
            <span style={{ fontSize: 10, fontWeight: 500, color: T.quiet }}>{vm.coachDate}</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.28, color: T.ink }}>{vm.coachLead ?? DASH}</div>
          {vm.coachWhy && <div style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.5, color: T.mid }}>{vm.coachWhy}</div>}
        </div>

        {/* ── Signals ── */}
        <div style={{ ...band(26), flexDirection: 'row', gap: 8 }}>
          <SignalCard label="HRV" sig={vm.hrv} />
          <SignalCard label="Resting HR" sig={vm.rhr} />
          <SignalCard label="Sleep" sig={vm.sleep} />
        </div>

        {/* ── Recovery insight: real /coach/adaptive push-vs-gentle read ── */}
        <W3RecoveryInsight />

        {/* ── Your Week ── */}
        <SectionHead title="Your Week" subtitle="Earned by training, not bought" tag={vm.weekDoneLabel} />
        <WeekSection days={vm.weekDays} meta={vm.weekMeta} selected={selDay} onSelect={setSelDay} />

        {/* ── Todays Training — the card renders its own header/tag ── */}
        <TrainingSection
          day={selectedDay}
          session={{ dur: vm.sessionDur, blocks: vm.sessionBlocks, ftpTag: vm.sessionFtpTag, earn: vm.sessionEarn }}
          onAdapt={onAdapt} />

        {/* ── Details: weather window + route recommendation ── */}
        <SectionHead title="Details" subtitle="Earned by training, not bought" tag={vm.zoneTag} />
        <WeatherRoute w={vm.weather} />

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

        {/* ── Your Progress (fixture economy; POWER = real wallet balance) ── */}
        <SectionHead title="Your Progress" subtitle="Earned by training, not bought" tag={vm.zoneTag} />
        <div style={{ ...band(30), gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.quiet }}>What the training is buying</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: T.acid }}>Garage →</span>
          </div>
          <div style={{ ...card(), gap: 14, padding: '18px 18px 20px' }}>
            <div style={{ display: 'flex', gap: 13, alignItems: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: T.acidDim, display: 'grid', placeItems: 'center' }}><GaugeIcon size={20} color={T.acid} /></div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: T.quiet }}>Next upgrade</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{vm.garageName}</span>
              </div>
              <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.3, color: T.acid }}>{vm.garagePct}%</span>
            </div>
            <div style={{ display: 'flex', gap: 2, height: 10 }}>
              {Array.from({ length: 25 }).map((_, i) => {
                const on = i < Math.round(vm.garagePct / 100 * 25)
                return (
                  <motion.div key={i}
                    initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={grow(i * 0.02)}
                    style={{ flex: 1, height: on ? 10 : 5, alignSelf: 'flex-end', transformOrigin: 'bottom', borderRadius: 1.5, background: on ? T.acid : T.rule }} />
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: T.mid }}>{vm.garageRidesLine}</span>
              <span style={{ fontSize: 10, fontWeight: 500, color: T.acid }}>{vm.garageMakesLine}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['POWER', vm.power], ['CYCLE', vm.cycle]].map(([l, v]) => (
              <div key={l} style={{ flex: 1, display: 'flex', gap: 10, alignItems: 'center', padding: '14px 16px', borderRadius: 18, background: T.surface }}>
                <div style={{ width: 30, height: 30, borderRadius: 100, background: T.acidDim, display: 'grid', placeItems: 'center' }}>
                  {l === 'POWER' ? <Sparkles size={15} color={T.acid} /> : <Star size={15} color={T.acid} />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Kicker>{l}</Kicker>
                  <span style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>{v}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[[vm.mRides, 'rides'], [vm.mDist, 'dist']].map(([m], i) => {
              const mi = m as { pct: number; label: string }
              return (
                <div key={i} style={{ flex: 1, display: 'flex', gap: 12, alignItems: 'center', padding: 16, borderRadius: 20, background: T.surface }}>
                  <Ring pct={mi.pct} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>Next milestone</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {i === 0 ? <Bike size={15} color={T.ink} /> : <GaugeIcon size={15} color={T.ink} />}
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{mi.label}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <W3CoachFab />
        <W3TabBar />

      </div>
    </div>
  )
}
