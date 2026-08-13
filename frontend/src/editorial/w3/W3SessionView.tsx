import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Share2, ArrowRight, Download, Clock, Flame, Zap, Gauge, Target, Activity } from 'lucide-react'
import { T, FONT, grow, Kicker, band, card, DASH } from './w3tokens'
import './w3.css'
import W3StatusBar from './W3StatusBar'

/**
 * W3 · 06 SESSION DETAIL — pure function of `vm`; `W3SessionPage` builds the
 * vm from `useSessionModel` + the coach's daily decision. Every metric here
 * resolves to a real value or an honest "—":
 *
 *  - Hero name is a characterful `funName` (helper) over the REAL prescribed
 *    title, which stays visible as the subtitle so nothing is hidden.
 *  - Stats (duration / TSS / target watts / min-in-zone), the power-shape
 *    bars and the per-block list are the session's own real numbers.
 *  - "How to ride it" is the session's training-zone definition (RPE / talk
 *    test / pacing) — honest coaching, never a fabricated read-out.
 *  - "What it earns" shows the REAL streak + TSS this session banks; the
 *    RideCoin conversion line is the one `fixture:` (economy spec'd, not
 *    wired into this screen).
 *
 * Buttons are all live: back, share (Web Share / clipboard), export the
 * workout (.fit), and back-to-today. Animations use `animate` (mount), not
 * scroll-triggered `whileInView`.
 */

export interface W3Step { idx: string; name: string; note: string; watts: string; dur: string; isMain: boolean; fill: number }
export type StatIcon = 'clock' | 'flame' | 'zap' | 'gauge' | 'target' | 'activity'
export interface W3PrescStat { v: string; l: string; s: string; icon: StatIcon }
export interface W3ShapeBar { w: number; work: boolean }
export interface W3EffortRow { label: string; value: string; hint: string; band: 'low' | 'mid' | 'high' }
export interface W3EarnTile { icon: StatIcon; v: string; l: string; s: string }
export interface W3RouteInfo { name: string; lastRidden: string; stats: { v: string; l: string }[]; notes: string[]; foot: string }

export interface W3SessionVm {
  navTitle: string
  funName: string            // characterful display name (helper)
  title: string              // the REAL prescribed title, kept as subtitle
  numeral: string
  qualifier: string
  thresholdW: string
  totalTime: string
  gauge: boolean[]           // hero segmented bar (true = work)
  prescriptionClaim: string
  stats: W3PrescStat[]       // duration / TSS / target watts / min-in-zone
  shapeBars: W3ShapeBar[]
  shapeFtpTag: string
  shapeLabels: [string, string, string]
  stepsMeta: string
  steps: W3Step[]
  effort: W3EffortRow[]      // honest zone-derived effort guide
  route: W3RouteInfo | null
  earns: W3EarnTile[]        // real: streak + TSS this session banks
  earnNote: string           // fixture: RideCoin economy line
  canExport: boolean         // a real prescribed workout exists to export
  primaryLabel: string       // export label, or "Back to today" when nothing to export
}

const ICONS: Record<StatIcon, typeof Clock> = { clock: Clock, flame: Flame, zap: Zap, gauge: Gauge, target: Target, activity: Activity }

export interface W3SessionActions {
  onBack?: () => void
  onShare?: () => void
  onExport?: () => void
  onToday?: () => void
}

function GaugeBar({ segs, delay = 0 }: { segs: { h: number; on: boolean }[]; delay?: number }) {
  const reduce = useReducedMotion()
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', width: '100%' }}>
      {segs.map((s, i) => (
        <motion.div key={i} initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={grow(delay + i * 0.012)}
          style={{ flex: 1, height: s.h, transformOrigin: 'bottom', borderRadius: 1, background: s.on ? T.acid : '#FFFFFF14' }} />
      ))}
    </div>
  )
}

export default function W3SessionView({ vm, onBack, onShare, onExport, onToday }: { vm: W3SessionVm } & W3SessionActions) {
  const reduce = useReducedMotion()
  const [openStep, setOpenStep] = useState<number | null>(null)

  const heroSegs = vm.gauge.map((on) => ({ h: on ? 18 : 8, on }))

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>

        <W3StatusBar />

        {/* Nav */}
        <div style={{ padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onBack} aria-label="Back" style={{ width: 40, height: 40, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><ArrowLeft size={18} color={T.ink} /></button>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: T.quiet }}>{vm.navTitle}</span>
          <button onClick={onShare} aria-label="Share session" style={{ width: 40, height: 40, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Share2 size={16} color={T.ink} /></button>
        </div>

        {/* Cover (atmospheric plate — no photo, per the editorial "ground, never a photo" rule) */}
        <div style={{ height: 210, margin: '8px 0 0', background: `radial-gradient(120% 90% at 50% 20%, #1c2a1a, ${T.bg})`, position: 'relative' }} />

        {/* Hero: fun name + real title + numeral + gauge */}
        <div style={{ ...band(0), paddingTop: 0, marginTop: -62, gap: 14 }}>
          <div style={{ width: '100%', padding: '16px 18px', borderRadius: 20, background: T.surface, border: `1px solid ${T.stroke}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1.2, lineHeight: 0.95, color: T.ink }}>{vm.funName}</span>
              {vm.title && vm.title !== vm.funName && (
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.2, color: T.mid }}>{vm.title}</span>
              )}
            </div>
            <div style={{ height: 1, background: T.rule }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
                <span style={{ fontSize: 68, fontWeight: 700, letterSpacing: -3, lineHeight: 0.8, color: vm.numeral === DASH ? T.quiet : T.acid }}>{vm.numeral}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 7 }}>
                  <Kicker>Target</Kicker>
                  <span style={{ fontSize: 15, fontWeight: 700, color: vm.thresholdW === DASH ? T.quiet : T.ink }}>{vm.thresholdW}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', paddingBottom: 7 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: T.quiet }}>TOTAL TIME</span>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <Clock size={13} color={T.mid} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: vm.totalTime === DASH ? T.quiet : T.ink }}>{vm.totalTime}</span>
                </div>
              </div>
            </div>
            <div style={{ height: 22, display: 'flex', alignItems: 'flex-end' }}><GaugeBar segs={heroSegs} /></div>
          </div>
        </div>

        {/* The Prescription — real stat cards with icons */}
        <div style={{ ...band(26), paddingTop: 26, gap: 14 }}>
          <Kicker>The prescription</Kicker>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.28, color: T.ink }}>{vm.prescriptionClaim}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10 }}>
            {[[0, 1], [2, 3]].map((row, ri) => (
              <div key={ri} style={{ display: 'flex', gap: 8 }}>
                {row.map((i) => {
                  const s = vm.stats[i]
                  if (!s) return <div key={i} style={{ flex: 1 }} />
                  const Ic = ICONS[s.icon]
                  const dash = s.v === DASH
                  return (
                    <div key={i} style={{ flex: 1, padding: '14px 16px 16px', borderRadius: 20, background: T.surface, display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 100, background: T.acidDim, display: 'grid', placeItems: 'center' }}><Ic size={14} color={T.acid} /></div>
                      <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.9, color: dash ? T.quiet : T.ink }}>{s.v}</span>
                      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: T.quiet }}>{s.l}</span>
                      {s.s && <span style={{ fontSize: 10, fontWeight: 600, color: T.acid }}>{s.s}</span>}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* The shape of it — power profile bars (real blocks, or honest envelope) */}
        {vm.shapeBars.length > 0 && (
          <div style={{ ...band(28), gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Kicker>The shape of it</Kicker>
              {vm.shapeFtpTag && <span style={{ fontSize: 10, fontWeight: 700, color: T.mid }}>{vm.shapeFtpTag}</span>}
            </div>
            <div style={{ position: 'relative', height: 106, display: 'flex', gap: 2, alignItems: 'flex-end' }}>
              {vm.shapeBars.map((b, i) => {
                const h = Math.round(b.w * 106)
                return (
                  <motion.div key={i} initial={reduce ? false : { height: 0 }} animate={{ height: h }} transition={grow(i * 0.03)}
                    style={{ width: b.work ? 45 : 22, flex: b.work ? 'none' : 1, height: h, borderRadius: '3px 3px 0 0', background: b.work ? `linear-gradient(180deg, ${T.acid}, ${T.acidDeep})` : '#FFFFFF2B' }} />
                )
              })}
              <div style={{ position: 'absolute', top: 13, left: 0, right: 0, height: 1, background: '#FFFFFFA6' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {vm.shapeLabels.map((l, i) => <span key={i} style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6, color: T.quiet }}>{l}</span>)}
            </div>
          </div>
        )}

        {/* The blocks — real per-block list */}
        {vm.steps.length > 0 && (
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
                })
                return (
                  <button key={st.idx} onClick={() => setOpenStep(open ? null : i)}
                    style={{ padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 9, borderTop: i === 0 ? 'none' : `1px solid ${T.rule}`, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: FONT, textAlign: 'left' }}>
                    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                      <span style={{ width: 19, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: st.isMain ? T.acid : T.quiet }}>{st.idx}</span>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{st.name}</span>
                        {st.note && <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>{st.note}</span>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: st.isMain ? T.acid : st.watts === DASH ? T.quiet : T.ink }}>{st.watts}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>{st.dur}</span>
                      </div>
                    </div>
                    <div style={{ height: 9, display: 'flex', alignItems: 'flex-end' }}><GaugeBar segs={segs} delay={i * 0.02} /></div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* How to ride it — honest zone-derived effort guide */}
        {vm.effort.length > 0 && (
          <div style={{ ...band(28), gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>How to ride it</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: T.mid }}>By feel · no numbers to chase</span>
            </div>
            <div style={{ padding: '20px 20px 22px', borderRadius: 24, background: T.surface, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {vm.effort.map((r, i) => (
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
                  <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.4, color: T.quiet }}>{r.hint}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Where to ride it — real recorded route */}
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
                    <span style={{ fontSize: 17, fontWeight: 700, color: s.v === DASH ? T.quiet : T.ink }}>{s.v}</span>
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

        {/* What it earns — REAL streak + TSS; RideCoin line is fixture */}
        {vm.earns.length > 0 && (
          <div style={{ ...band(28), gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>What it earns</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: T.mid }}>On completion</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {vm.earns.map((u, i) => {
                const Ic = ICONS[u.icon]
                return (
                  <div key={i} style={{ flex: 1, padding: '14px 13px 16px', borderRadius: 18, background: T.surface, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 100, background: T.acidDim, display: 'grid', placeItems: 'center' }}><Ic size={14} color={T.acid} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.9, color: u.v === DASH ? T.quiet : T.ink }}>{u.v}</span>
                      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2, color: T.acid }}>{u.l}</span>
                      <span style={{ fontSize: 9.5, fontWeight: 600, color: T.quiet }}>{u.s}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {vm.earnNote && <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.4, color: T.quiet }}>{vm.earnNote}</span>}
          </div>
        )}

        {/* CTAs — all real actions */}
        <div style={{ ...band(40), paddingTop: 4, gap: 10 }}>
          <button onClick={vm.canExport ? onExport : onToday}
            style={{ height: 54, borderRadius: 100, background: T.acid, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 0 22px', border: 0, cursor: 'pointer', fontFamily: FONT, width: '100%' }}>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2, color: T.bg }}>{vm.primaryLabel}</span>
            <div style={{ width: 38, height: 38, borderRadius: 100, background: T.bg, display: 'grid', placeItems: 'center' }}>
              {vm.canExport ? <Download size={17} color={T.acid} /> : <ArrowRight size={18} color={T.acid} />}
            </div>
          </button>
          {vm.canExport && (
            <button onClick={onToday}
              style={{ height: 48, borderRadius: 100, background: '#FFFFFF0A', display: 'flex', gap: 9, justifyContent: 'center', alignItems: 'center', border: 0, cursor: 'pointer', fontFamily: FONT, width: '100%' }}>
              <ArrowLeft size={15} color={T.ink} /><span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Back to today</span>
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
