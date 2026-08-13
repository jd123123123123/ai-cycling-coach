import { type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { SlidersHorizontal, ArrowUpRight } from 'lucide-react'
import { T, FONT, EASE, grow, Kicker, DASH } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import W3TopBar from './W3TopBar'
import './w3.css'

/**
 * W3 · BELASTUNG & PROGNOSE — a 1:1 code rebuild of pen2 frame `iiy64`.
 *
 * Pure function of `vm`; `W3LoadForecastPage` builds it from REAL data: the
 * week's time-in-zone (summed from the planned intervals), the /weeks
 * performance projection (race-day threshold + its band), and the plan-change
 * interview's real compliance over the last block. Every figure resolves to a
 * value or "—". "Belastung anpassen" opens the plan's real adjust sheet.
 */

export const ZONE_HUES = ['#6E7379', '#6B8CFF', '#2BE68F', '#FFB020', '#FF7A2F'] as const

export interface ZoneRow { label: string; time: string; frac: number }
export interface W3LoadVm {
  intro: string
  weekHours: string
  zones: ZoneRow[]                 // Z1..Z5
  deineWoche: { easy: number; hard: number } | null
  zielAufbau: { easy: number; hard: number }
  balanceNote: string
  forecastSub: string
  threshold: string                // "312"
  thresholdUnit: string            // "W · 4,3 W/kg"
  delta: string | null             // "+20 W"
  rangeLow: { v: string; l: string }
  rangeMid: { v: string; l: string }
  rangeHigh: { v: string; l: string }
  rangePos: number                 // 0..1 marker position
  compliancePct: string            // "86 %"
  complianceDone: number
  complianceTotal: number
  complianceNote: string
}
export interface W3LoadActions { onBack?: () => void; onAdjust?: () => void }

const band = (padBottom: number): CSSProperties => ({ display: 'flex', flexDirection: 'column', width: '100%', background: T.bg, padding: `0 20px ${padBottom}px` })
const card = (): CSSProperties => ({ background: T.surface, borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column', width: '100%' })

function Ratio({ easy, hard, label, dim }: { easy: number; hard: number; label: string; dim?: boolean }) {
  const reduce = useReducedMotion()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: dim ? T.mid : T.ink }}>{easy} / {hard}</span>
      </div>
      <div style={{ height: 8, borderRadius: 100, background: T.surface2, overflow: 'hidden', display: 'flex' }}>
        <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${easy}%` }} transition={{ duration: 0.6, ease: EASE }}
          style={{ height: '100%', background: dim ? T.d3 : T.d4 }} />
        <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${hard}%` }} transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
          style={{ height: '100%', background: dim ? T.acidDeep : T.acid }} />
      </div>
    </div>
  )
}

export default function W3LoadForecastView({ vm, onBack, onAdjust }: { vm: W3LoadVm } & W3LoadActions) {
  const reduce = useReducedMotion()
  const totalFrac = Math.max(1, vm.zones.reduce((s, z) => s + z.frac, 0))
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <W3StatusBar />

        {/* Nav */}
        <W3TopBar title="Belastung & Prognose" onBack={onBack} />

        {/* Hero */}
        <div style={{ ...band(24), paddingTop: 10, gap: 14 }}>
          <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1.0, color: T.ink }}>Was der Plan<br />von dir will</span>
          <span style={{ fontSize: 14, fontWeight: 500, color: T.mid, lineHeight: 1.5 }}>{vm.intro}</span>
        </div>

        {/* Wie hart die Woche ist */}
        <div style={{ ...band(0), paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>Wie hart die Woche ist</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>Zeit pro Trainingszone</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.mid }}>{vm.weekHours}</span>
        </div>
        <div style={{ ...band(26) }}>
          <div style={{ ...card(), gap: 18 }}>
            <div style={{ display: 'flex', gap: 3, height: 16 }}>
              {vm.zones.map((z, i) => (
                <motion.div key={i} initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={grow(0.1 + i * 0.05)}
                  style={{ flex: Math.max(0.04, z.frac / totalFrac), transformOrigin: 'left', height: 16, borderRadius: 4, background: ZONE_HUES[i] }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {vm.zones.map((z, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <div style={{ width: 7, height: 7, borderRadius: 100, background: ZONE_HUES[i] }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.mid }}>{z.label}</span>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: z.time === DASH ? T.quiet : T.ink }}>{z.time}</span>
                </div>
              ))}
            </div>
            <div style={{ height: 1, background: T.rule }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>Locker gegen hart</span>
              {vm.deineWoche
                ? <Ratio easy={vm.deineWoche.easy} hard={vm.deineWoche.hard} label="Deine Woche" />
                : <span style={{ fontSize: 13, fontWeight: 600, color: T.quiet }}>Noch keine Einheiten mit Leistungsdaten diese Woche.</span>}
              <Ratio easy={vm.zielAufbau.easy} hard={vm.zielAufbau.hard} label="Ziel im Aufbau" dim />
              <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet, lineHeight: 1.45 }}>{vm.balanceNote}</span>
            </div>
          </div>
        </div>

        {/* Wo dich der Plan hinbringt */}
        <div style={{ ...band(0), paddingBottom: 12, flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>Wo dich der Plan hinbringt</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>{vm.forecastSub}</span>
        </div>
        <div style={{ ...band(26) }}>
          <div style={{ ...card(), gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Kicker>SCHWELLE AM RENNTAG</Kicker>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 56, fontWeight: 700, letterSpacing: -2.5, lineHeight: 0.8, color: vm.threshold === DASH ? T.quiet : T.acid, textShadow: vm.threshold === DASH ? 'none' : `0 0 22px ${T.acid}55` }}>{vm.threshold}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: T.mid }}>{vm.thresholdUnit}</span>
                </div>
              </div>
              {vm.delta && (
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '7px 12px', borderRadius: 100, background: T.acidDim }}>
                  <ArrowUpRight size={14} color={T.acid} /><span style={{ fontSize: 13, fontWeight: 700, color: T.acid }}>{vm.delta}</span>
                </div>
              )}
            </div>
            <div style={{ position: 'relative', height: 8, borderRadius: 100, background: T.surface2 }}>
              <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.round(vm.rangePos * 100)}%` }} transition={{ duration: 0.7, ease: EASE }}
                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 100, background: T.acid }} />
              <div style={{ position: 'absolute', top: -3, left: `calc(${Math.round(vm.rangePos * 100)}% - 7px)`, width: 14, height: 14, borderRadius: 100, background: T.acid, boxShadow: `0 0 10px ${T.acid}` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {[vm.rangeLow, vm.rangeMid, vm.rangeHigh].map((r, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: i === 0 ? 'flex-start' : i === 1 ? 'center' : 'flex-end' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: i === 1 ? T.ink : T.mid }}>{r.v}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>{r.l}</span>
                </div>
              ))}
            </div>
            <div style={{ height: 1, background: T.rule }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Umsetzung der letzten 4 Wochen</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{vm.compliancePct}</span>
              </div>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {Array.from({ length: vm.complianceTotal }).map((_, i) => (
                  <div key={i} style={{ flex: '1 0 8px', height: 14, borderRadius: 3, background: i < vm.complianceDone ? T.acid : T.surface2 }} />
                ))}
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet, lineHeight: 1.45 }}>{vm.complianceNote}</span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{ ...band(40), paddingTop: 4 }}>
          <button onClick={onAdjust}
            style={{ height: 54, borderRadius: 100, background: 'transparent', border: `1px solid ${T.stroke}`, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontFamily: FONT }}>
            <SlidersHorizontal size={17} color={T.ink} /><span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Belastung anpassen</span>
          </button>
        </div>
      </div>
    </div>
  )
}
