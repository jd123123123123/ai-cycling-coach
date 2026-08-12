import { useState, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  Activity, Battery, Bell, Bike, Flame, Route, Signal,
  Sparkles, Trophy, UserRound, Wifi, Star, Gauge as GaugeIcon,
} from 'lucide-react'
import { WeekSection, WeatherRoute, MirrorChart, TrainingSection, type W3DayFull, type W3Weather, type W3Mirror, type W3Block, type OnAdapt } from './W3Sections'
import './w3.css'

export type { W3DayFull, W3Weather, W3Mirror, W3Block, OnAdapt, AdaptResult } from './W3Sections'

// Shared spring for the graph reveals — snappy, slightly overshooting, the
// register the pen's motion notes call for. All animation is opt-out via
// `useReducedMotion()` (the app's standing accessibility contract).
const EASE = [0.22, 1, 0.36, 1] as const
const grow = (delay: number) => ({ duration: 0.55, ease: EASE, delay })

/**
 * W3 · 01 TODAY — a 1:1 code rebuild of the `w3.pen` frame `gx4WA`.
 *
 * Every dimension, colour, radius, gap, font size, weight and letter-spacing
 * below is transcribed VERBATIM from the pen node tree (read via the Pencil
 * MCP, 2026-08-11), the same way `pages/BikeProgressView.tsx` mirrors its pen
 * frame. The block → pen-node map:
 *
 *   StatusBar    component/StatusBar d6mot0      Header       WubXb
 *   Bike Hero    rMjk7                           Hero         k4XB0
 *   Signals      n6GuHK                          Week Wrap    TPyRo
 *   Session Wrap z3sbp                           Load Wrap    Traqf
 *   Crew Wrap    Krj7x                           Garage Band  DMsjq
 *   TabBar       component/TabBar qUhCj
 *
 * This file is a PURE function of `vm`; `W3TodayPage` builds the vm from
 * `useTodayModel` so a fixture can render it without a backend. Fields that
 * map to real coaching data resolve to a value or an honest `null` (rendered
 * as "—"); fields that belong to the not-yet-built reward economy (earn rate,
 * Power/Cycle balances, the Garage upgrade, the crew standings) are DESIGN
 * FIXTURES that reproduce the pen, marked `fixture:` in the vm.
 */

// ── tokens (mirror w3.css, inlined so the styles read as one unit) ──
const T = {
  bg: '#0B0B0B', surface: '#161616', surface2: '#202020',
  acid: '#C8FF00', acidDim: '#C8FF001F', acidDeep: '#8FBF00',
  ink: '#FFFFFF', mid: '#9BA0A6', quiet: '#6E7379',
  rule: '#FFFFFF14', stroke: '#FFFFFF1A',
  d2: '#FFFFFF33', d3: '#FFFFFF4D', d4: '#FFFFFF8C',
  training: '#2BE68F', evening: '#7B5CFF', cool: '#6B8CFF',
}
const FONT = '"Inter Tight", ui-sans-serif, system-ui, sans-serif'

// ── view model ──
export interface W3Spark { bars: number[]; hi: string }
export interface W3Signal { value: string; unit: string; sub: string | null; subHue: string; spark: W3Spark }
export interface W3CrewRow { name: string; color: string; pct: number; me: boolean }
export interface W3Vm {
  handle: string
  tierLine: string
  avatarUrl: string | null
  avatarInitial: string
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
  weekDays: W3DayFull[]

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
  power: string // fixture
  cycle: string // fixture
  mRides: { pct: number; label: string }
  mDist: { pct: number; label: string }
}

// ── primitives ──
const Kicker = ({ children }: { children: ReactNode }) => (
  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: T.quiet }}>{children}</span>
)
const DASH = '—'

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
            whileInView={{ height: bh }}
            viewport={{ once: true, amount: 0.6 }}
            transition={grow(i * 0.04)}
            style={{ flex: 1, height: bh, borderRadius: 1.5, background: last ? spark.hi : T.d2 }} />
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
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.6, color: T.ink, lineHeight: 1 }}>{sig.value}</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: T.quiet, lineHeight: 1.9 }}>{sig.unit}</span>
          </div>
          <Spark spark={sig.spark} />
          <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.25, color: sig.sub ? sig.subHue : T.quiet }}>{sig.sub ?? DASH}</span>
        </>
      ) : (
        <span style={{ fontSize: 26, fontWeight: 700, color: T.quiet, lineHeight: 1 }}>{DASH}</span>
      )}
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
        whileInView={{ strokeDashoffset: off }}
        viewport={{ once: true, amount: 0.8 }}
        transition={{ duration: 0.9, ease: EASE }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={12} fontWeight={600} fill={T.ink} fontFamily={FONT}>{Math.round(pct)}%</text>
    </svg>
  )
}

// ── band scaffold: every section is a full-width vertical band on w-bg ──
const band = (padBottom: number): CSSProperties => ({ display: 'flex', flexDirection: 'column', width: '100%', background: T.bg, padding: `0 20px ${padBottom}px` })
const card = (): CSSProperties => ({ background: T.surface, borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column', width: '100%' })

export default function W3TodayView({ vm, onAdapt }: { vm: W3Vm; onAdapt?: OnAdapt }) {
  // The week strip and the training card share ONE selection: tapping a day
  // drives which recommendation the card shows. Defaults to today.
  const todayIdx = Math.max(0, vm.weekDays.findIndex((d) => d.status === 'today'))
  const [selDay, setSelDay] = useState(todayIdx)
  const selectedDay = vm.weekDays[selDay] ?? vm.weekDays[todayIdx]

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>

        {/* ── StatusBar ── */}
        <div style={{ height: 44, padding: '0 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>9:41</span>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <Signal size={15} color={T.ink} /><Wifi size={15} color={T.ink} /><Battery size={15} color={T.ink} />
          </div>
        </div>

        {/* ── Header ── */}
        <div style={{ padding: '10px 20px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            <div style={{ width: 34, height: 34, borderRadius: 100, background: T.surface, display: 'grid', placeItems: 'center' }}><Bell size={16} color={T.ink} /></div>
          </div>
        </div>

        {/* ── Bike Hero (fixture: no bike render exists; faithful placeholder) ── */}
        <div style={{ position: 'relative', height: 300, background: T.bg, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
          <div style={{ position: 'absolute', width: 320, height: 200, borderRadius: '50%', background: `radial-gradient(closest-side, ${T.acid}22, transparent)` }} />
          <Bike size={180} strokeWidth={1} color="#3A3A3A" style={{ position: 'relative' }} />
          <div style={{ position: 'absolute', top: 16, left: 20, display: 'flex', gap: 6, alignItems: 'center', padding: '6px 11px', borderRadius: 100, background: '#161616CC' }}>
            <Bike size={13} color={T.acid} /><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.ink }}>GHOST AERO 01</span>
          </div>
        </div>

        {/* ── Hero: readiness + coach ── */}
        <div style={{ ...band(26), paddingTop: 24, gap: 12 }}>
          <div style={{ width: '100%', maxWidth: 350, alignSelf: 'center', padding: '16px 18px', borderRadius: 20, background: T.surface, border: `1px solid ${T.stroke}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <span style={{ fontSize: 76, fontWeight: 700, letterSpacing: -3, lineHeight: 0.86, color: vm.readiness != null ? T.acid : T.quiet }}>{vm.readiness ?? DASH}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 6 }}>
                <Kicker>Readiness</Kicker>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{vm.readinessWord ?? DASH}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', paddingBottom: 6 }}>
              <Kicker>Earn rate</Kicker>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <Star size={13} color={T.acid} fill={T.acid} /><span style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{vm.earnRate}</span>
              </div>
            </div>
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

        {/* ── Week (controlled: tap a day → the training card below reflects it) ── */}
        <WeekSection days={vm.weekDays} meta={vm.weekMeta} selected={selDay} onSelect={setSelDay} />

        {/* ── Training recommendation for the selected day
            (today → adapt; future → plan; past → plan vs. ridden / skipped) ── */}
        <TrainingSection
          day={selectedDay}
          session={{ dur: vm.sessionDur, blocks: vm.sessionBlocks, ftpTag: vm.sessionFtpTag, earn: vm.sessionEarn }}
          onAdapt={onAdapt} />

        {/* ── Weather + route recommendation ── */}
        <WeatherRoute w={vm.weather} />

        {/* ── Load: interactive 6-week fitness/fatigue mirror + form ── */}
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

        {/* ── Crew (fixture) ── */}
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
                    <motion.div initial={{ width: 0 }} whileInView={{ width: `${Math.min(100, (r.pct / 150) * 100)}%` }} viewport={{ once: true, amount: 0.8 }} transition={{ duration: 0.7, ease: EASE }}
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
                <motion.div initial={{ width: 0 }} whileInView={{ width: `${vm.challengePct}%` }} viewport={{ once: true, amount: 0.8 }} transition={{ duration: 0.8, ease: EASE }}
                  style={{ height: '100%', borderRadius: 100, background: T.acid }} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Garage (fixture) ── */}
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
                    initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true, amount: 0.8 }} transition={grow(i * 0.02)}
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

        {/* ── TabBar (sticky in-flow: pins to the viewport bottom while
            scrolling, rests at the frame bottom at page end) ── */}
        <div style={{ marginTop: 'auto', position: 'sticky', bottom: 0, width: '100%', height: 92, padding: '12px 18px 0', background: '#0B0B0BF2', backdropFilter: 'blur(12px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {[['TODAY', Activity, true], ['RIDES', Route, false], ['GARAGE', Bike, false], ['WINS', Trophy, false], ['BIKER', UserRound, false]].map(([label, Ic, active]) => {
              const Icon = Ic as typeof Activity
              const col = active ? T.acid : T.quiet
              return (
                <div key={label as string} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                  <Icon size={22} color={col} />
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: col }}>{label as string}</span>
                </div>
              )
            })}
          </div>
          <div style={{ height: 34, display: 'grid', placeItems: 'center' }}><div style={{ width: 134, height: 5, borderRadius: 100, background: '#FFFFFF59' }} /></div>
        </div>

      </div>
    </div>
  )
}
