import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Share2, Zap, Hexagon, Flame, Users, Trophy, ArrowRight, Watch } from 'lucide-react'
import { T, FONT, grow, Kicker, band, card, DASH } from './w3tokens'
import './w3.css'

/**
 * W3 · 06 SESSION DETAIL — 1:1 code rebuild of `w3.pen` frame `B1iV8n`.
 * Values transcribed verbatim from the pen node tree. Pure function of `vm`;
 * `W3SessionPage` builds the vm from `useSessionModel`. Real coaching data
 * (numeral, stats, blocks, shape, routes) resolves to a value or honest "—";
 * the physiology cues ("How to ride it") and reward tiles ("What it unlocks",
 * record chance) are DESIGN FIXTURES reproducing the pen — marked `fixture:`.
 *
 * Block → pen-node map: Nav vNavz · Cover qf4dE · Hero vqi88 · Prescription
 * I13o7D · Blocks lxmyE · How-to-ride tcmE9 · Unlocks C1A4sr · Routes I2Hcp9
 * · CTAs sO7Sg.
 */

export interface W3Step { idx: string; name: string; note: string; watts: string; dur: string; isMain: boolean; fill: number }
export interface W3PrescStat { v: string; l: string; s: string }
export interface W3ShapeBar { w: number; work: boolean }
export interface W3RangeRow { label: string; value: string; band: 'low' | 'mid' | 'high' }
export interface W3Unlock { icon: 'zap' | 'hexagon' | 'flame' | 'users'; v: string; l: string; s: string }
export interface W3RouteInfo { name: string; lastRidden: string; stats: { v: string; l: string }[]; notes: string[]; foot: string }

export interface W3SessionVm {
  navTitle: string
  title: string
  numeral: string
  qualifier: string          // "8 MIN BLOCKS"
  thresholdW: string
  totalTime: string
  gauge: boolean[]           // hero segmented bar (true = work)
  prescriptionClaim: string
  stats: W3PrescStat[]       // 4
  shapeBars: W3ShapeBar[]
  shapeFtpTag: string
  shapeLabels: [string, string, string]
  stepsMeta: string
  steps: W3Step[]
  howToRide: W3RangeRow[]    // fixture
  route: W3RouteInfo | null
  unlocks: W3Unlock[]        // fixture
  record: { pct: number; tag: string; label: string; why: string } | null // fixture
  sendTarget: string         // fixture ("Garmin Edge 840")
}

const ICONS = { zap: Zap, hexagon: Hexagon, flame: Flame, users: Users }

function GaugeBar({ segs, delay = 0 }: { segs: { h: number; on: boolean }[]; delay?: number }) {
  const reduce = useReducedMotion()
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', width: '100%' }}>
      {segs.map((s, i) => (
        <motion.div key={i} initial={reduce ? false : { scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true, amount: 0.6 }} transition={grow(delay + i * 0.012)}
          style={{ flex: 1, height: s.h, transformOrigin: 'bottom', borderRadius: 1, background: s.on ? T.acid : '#FFFFFF14' }} />
      ))}
    </div>
  )
}

export default function W3SessionView({ vm, onBack }: { vm: W3SessionVm; onBack?: () => void }) {
  const reduce = useReducedMotion()
  const [openStep, setOpenStep] = useState<number | null>(null)

  // hero gauge: 20 segs, work tall/acid
  const heroSegs = vm.gauge.map((on) => ({ h: on ? 18 : 8, on }))

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>

        {/* StatusBar */}
        <div style={{ height: 44, padding: '0 22px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 5, fontSize: 12, color: T.mid }}>9:41</div>

        {/* Nav */}
        <div style={{ padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onBack} aria-label="Back" style={{ width: 40, height: 40, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><ArrowLeft size={18} color={T.ink} /></button>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: T.quiet }}>{vm.navTitle}</span>
          <button aria-label="Share" style={{ width: 40, height: 40, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Share2 size={16} color={T.ink} /></button>
        </div>

        {/* Cover (3D render placeholder — no asset in-app) */}
        <div style={{ height: 210, margin: '8px 0 0', background: `radial-gradient(120% 90% at 50% 20%, #1c2a1a, ${T.bg})`, position: 'relative' }} />

        {/* Hero: session card + numeral + gauge */}
        <div style={{ ...band(0), paddingTop: 0, marginTop: -62, gap: 14 }}>
          <div style={{ width: '100%', padding: '16px 18px', borderRadius: 20, background: T.surface, border: `1px solid ${T.stroke}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1.2, color: T.ink }}>{vm.title}</span>
            <div style={{ height: 1, background: T.rule }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
                <span style={{ fontSize: 68, fontWeight: 700, letterSpacing: -3, lineHeight: 0.8, color: T.acid }}>{vm.numeral}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 7 }}>
                  <Kicker>Threshold</Kicker>
                  <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{vm.thresholdW}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', paddingBottom: 7 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: T.quiet }}>TOTAL TIME</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>⏱ {vm.totalTime}</span>
              </div>
            </div>
            <div style={{ height: 22, display: 'flex', alignItems: 'flex-end' }}><GaugeBar segs={heroSegs} /></div>
          </div>
        </div>

        {/* The Prescription */}
        <div style={{ ...band(26), paddingTop: 26, gap: 14 }}>
          <Kicker>The prescription</Kicker>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.28, color: T.ink }}>{vm.prescriptionClaim}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10 }}>
            {[[0, 1], [2, 3]].map((row, ri) => (
              <div key={ri} style={{ display: 'flex', gap: 8 }}>
                {row.map((i) => {
                  const s = vm.stats[i]
                  return (
                    <div key={i} style={{ flex: 1, padding: '16px 16px 17px', borderRadius: 20, background: T.surface, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.9, color: s.v === DASH ? T.quiet : T.ink }}>{s.v}</span>
                      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: T.quiet }}>{s.l}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: T.acid }}>{s.s}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* The shape of it */}
        <div style={{ ...band(28), gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Kicker>The shape of it</Kicker>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.mid }}>{vm.shapeFtpTag}</span>
          </div>
          <div style={{ position: 'relative', height: 106, display: 'flex', gap: 2, alignItems: 'flex-end' }}>
            {vm.shapeBars.map((b, i) => (
              <motion.div key={i} initial={reduce ? false : { height: 0 }} whileInView={{ height: Math.round(b.w * 106) }} viewport={{ once: true, amount: 0.5 }} transition={grow(i * 0.03)}
                style={{ width: b.work ? 45 : 22, flex: b.work ? 'none' : 1, height: Math.round(b.w * 106), borderRadius: '3px 3px 0 0', background: b.work ? `linear-gradient(180deg, ${T.acid}, ${T.acidDeep})` : '#FFFFFF2B' }} />
            ))}
            <div style={{ position: 'absolute', top: 13, left: 0, right: 0, height: 1, background: '#FFFFFFA6' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {vm.shapeLabels.map((l, i) => <span key={i} style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6, color: T.quiet }}>{l}</span>)}
          </div>
        </div>

        {/* The blocks */}
        <div style={{ ...band(28), gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>The blocks</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: T.mid }}>{vm.stepsMeta}</span>
          </div>
          <div style={{ padding: '6px 20px 12px', borderRadius: 24, background: T.surface, display: 'flex', flexDirection: 'column' }}>
            {vm.steps.map((st, i) => {
              const open = openStep === i
              const segs = Array.from({ length: 18 }, (_, k) => {
                const on = k / 18 < st.fill
                return { h: on ? (st.isMain ? 9 : 6) : 4, on }
              }).map((s) => ({ h: s.h, on: s.on }))
              return (
                <button key={st.idx} onClick={() => setOpenStep(open ? null : i)}
                  style={{ padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 9, borderTop: i === 0 ? 'none' : `1px solid ${T.rule}`, background: 'transparent', border: 0, borderTopColor: T.rule, cursor: 'pointer', fontFamily: FONT, textAlign: 'left' }}>
                  <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                    <span style={{ width: 19, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: st.isMain ? T.acid : T.quiet }}>{st.idx}</span>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{st.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>{st.note}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: st.isMain ? T.acid : T.ink }}>{st.watts}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>{st.dur}</span>
                    </div>
                  </div>
                  <div style={{ height: 9, display: 'flex', alignItems: 'flex-end' }}><GaugeBar segs={segs} delay={i * 0.02} /></div>
                </button>
              )
            })}
          </div>
        </div>

        {/* How to ride it (fixture: live physiology cues) */}
        <div style={{ ...band(28), gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>How to ride it</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: T.mid }}>Pace · read-outs · bail-outs</span>
          </div>
          <div style={{ padding: '20px 20px 22px', borderRadius: 24, background: T.surface, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.4, color: T.ink }}>WHAT TO CHECK WHILE RIDING</span>
              <span style={{ fontSize: 9.5, fontWeight: 600, color: T.quiet }}>Lit segment is where you want to be. Not always the middle.</span>
            </div>
            {vm.howToRide.map((r, i) => (
              <div key={r.label} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: i === 0 ? 0 : 14, borderTop: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: T.mid }}>{r.label}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.2, color: T.ink }}>{r.value}</span>
                </div>
                <div style={{ display: 'flex', gap: 2 }}>
                  {(['low', 'mid', 'high'] as const).map((seg, k) => (
                    <div key={seg} style={{
                      flex: seg === 'mid' ? 1.12 : 1, height: 7,
                      borderRadius: k === 0 ? '100px 0 0 100px' : k === 2 ? '0 100px 100px 0' : 0,
                      background: r.band === seg ? T.acid : seg === 'high' ? '#FFFFFF14' : '#FFFFFF2B',
                    }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Where to ride it */}
        {vm.route && (
          <div style={{ ...band(28), gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>Where to ride it</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: T.acid }}>Outdoor alternative</span>
            </div>
            <div style={{ ...card(), gap: 16 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: T.acidDim, display: 'grid', placeItems: 'center' }}><ArrowRight size={20} color={T.acid} style={{ transform: 'rotate(-45deg)' }} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>{vm.route.name}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>{vm.route.lastRidden}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {vm.route.stats.map((s) => (
                  <div key={s.l} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>{s.v}</span>
                    <Kicker>{s.l}</Kicker>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {vm.route.notes.map((n, i) => (
                  <span key={i} style={{ fontSize: 11.5, fontWeight: 600, color: T.mid }}>· {n}</span>
                ))}
              </div>
              <div style={{ height: 1, background: T.rule }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>{vm.route.foot}</span>
            </div>
          </div>
        )}

        {/* What it unlocks (fixture: reward economy) */}
        <div style={{ ...band(28), gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>What it unlocks</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: T.mid }}>On completion</span>
          </div>
          {[[0, 1], [2, 3]].map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 8 }}>
              {row.map((i) => {
                const u = vm.unlocks[i]
                const Ic = ICONS[u.icon]
                return (
                  <div key={i} style={{ flex: 1, padding: '14px 13px 16px', borderRadius: 18, background: T.surface, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 100, background: T.acidDim, display: 'grid', placeItems: 'center' }}><Ic size={14} color={T.acid} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.9, color: T.ink }}>{u.v}</span>
                      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2, color: T.acid }}>{u.l}</span>
                      <span style={{ fontSize: 9.5, fontWeight: 600, color: T.quiet }}>{u.s}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
          {vm.record && (
            <div style={{ ...card(), gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Kicker>Record chance</Kicker>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '5px 10px 5px 8px', borderRadius: 100, background: T.acidDim }}>
                  <Trophy size={11} color={T.acid} /><span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: T.acid }}>{vm.record.tag}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 11, alignItems: 'flex-end' }}>
                <span style={{ fontSize: 52, fontWeight: 700, letterSpacing: -2.2, lineHeight: 0.85, color: T.acid }}>{vm.record.pct}%</span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: T.ink, paddingBottom: 4, lineHeight: 1.25 }}>{vm.record.label}</span>
              </div>
              <div style={{ display: 'flex', gap: 2, height: 10 }}>
                {Array.from({ length: 20 }).map((_, i) => {
                  const on = i < Math.round((vm.record!.pct / 100) * 20)
                  return <motion.div key={i} initial={reduce ? false : { scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true, amount: 0.8 }} transition={grow(i * 0.02)}
                    style={{ flex: 1, height: on ? 10 : 5, alignSelf: 'flex-end', transformOrigin: 'bottom', borderRadius: 1.5, background: on ? T.acid : T.rule }} />
                })}
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: T.mid }}>{vm.record.why}</span>
            </div>
          )}
        </div>

        {/* CTAs */}
        <div style={{ ...band(40), paddingTop: 4, gap: 10 }}>
          <div style={{ height: 54, borderRadius: 100, background: T.acid, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 0 22px' }}>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2, color: T.bg }}>Start the ride</span>
            <div style={{ width: 38, height: 38, borderRadius: 100, background: T.bg, display: 'grid', placeItems: 'center' }}><ArrowRight size={18} color={T.acid} /></div>
          </div>
          <div style={{ height: 48, borderRadius: 100, background: '#FFFFFF0A', display: 'flex', gap: 9, justifyContent: 'center', alignItems: 'center' }}>
            <Watch size={15} color={T.ink} /><span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Send to {vm.sendTarget}</span>
          </div>
        </div>

      </div>
    </div>
  )
}
