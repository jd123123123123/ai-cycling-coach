import { type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Activity, HeartPulse, Moon, BatteryCharging, Waves, Timer, Wind } from 'lucide-react'
import { T, FONT, EASE, grow, Kicker, DASH } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import './w3.css'

/**
 * W3 · READINESS — the `?tab=body` Recovery surface rebuilt in full W3 style.
 *
 * Pure function of `vm`; `W3ReadinessPage` builds it from the SAME real signals
 * the legacy RecoveryTab reads — the daily decision's canonical readiness, the
 * overnight snapshot (HRV / body battery / stress / recovery time) and the
 * 30-day daily metrics (resting HR, sleep). Every driver resolves to a value or
 * an honest "—"; deltas compare against the athlete's own 7-day baseline.
 */

export type DriverIcon = 'hrv' | 'rhr' | 'sleep' | 'battery' | 'stress' | 'recovery' | 'vo2'
export interface DriverVm {
  icon: DriverIcon
  label: string
  value: string
  unit: string
  delta: string | null
  deltaGood: boolean | null
  frac: number            // 0..1 fill for the mini bar
  spark: number[]         // 0..1 normalised last-7
}
export interface W3ReadinessVm {
  score: number | null
  word: string | null
  guidanceTitle: string
  guidanceBody: string
  dateNote: string
  trend: number[]         // 0..1 readiness last 7 days
  drivers: DriverVm[]
  limiterNote: string | null
}
export interface W3ReadinessActions { onBack?: () => void }

const ICONS: Record<DriverIcon, typeof Activity> = {
  hrv: Activity, rhr: HeartPulse, sleep: Moon, battery: BatteryCharging, stress: Waves, recovery: Timer, vo2: Wind,
}
const band = (pb: number): CSSProperties => ({ display: 'flex', flexDirection: 'column', width: '100%', background: T.bg, padding: `0 20px ${pb}px` })
const card = (): CSSProperties => ({ background: T.surface, borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column', width: '100%' })

function ChargeMeter({ score }: { score: number | null }) {
  const reduce = useReducedMotion()
  const N = 20
  const filled = score == null ? 0 : Math.max(0, Math.min(N, Math.round((score / 100) * N)))
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 30, width: '100%' }}>
      {Array.from({ length: N }).map((_, i) => (
        <motion.div key={i} initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={grow(i * 0.025)}
          style={{ flex: 1, height: 30, transformOrigin: 'bottom', borderRadius: 3, background: i < filled ? T.acid : T.surface2, boxShadow: i < filled ? `0 0 10px ${T.acid}55` : 'none' }} />
      ))}
    </div>
  )
}

function Spark({ series, hue }: { series: number[]; hue: string }) {
  const reduce = useReducedMotion()
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 20, width: 60, flex: 'none' }}>
      {series.map((b, i) => {
        const last = i === series.length - 1
        const h = Math.max(2, Math.round(b * 20))
        return <motion.div key={i} initial={reduce ? false : { height: 0 }} animate={{ height: h }} transition={grow(i * 0.03)}
          style={{ flex: 1, height: h, borderRadius: 1.5, background: last ? hue : T.d2 }} />
      })}
    </div>
  )
}

export default function W3ReadinessView({ vm, onBack }: { vm: W3ReadinessVm } & W3ReadinessActions) {
  const reduce = useReducedMotion()
  const trendMax = Math.max(1, ...vm.trend)
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <W3StatusBar />

        {/* Nav */}
        <div style={{ padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onBack} aria-label="Zurück" style={{ width: 40, height: 40, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><ArrowLeft size={18} color={T.ink} /></button>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: T.quiet }}>Readiness</span>
          <div style={{ width: 40 }} />
        </div>

        {/* Hero — the readiness aura + charge meter */}
        <div style={{ ...band(24), paddingTop: 10, gap: 16 }}>
          <div style={{ width: '100%', padding: '22px 20px 20px', borderRadius: 24, background: T.surface, border: `1px solid ${T.stroke}`, display: 'flex', flexDirection: 'column', gap: 18, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 260, height: 200, borderRadius: '50%', background: `radial-gradient(closest-side, ${vm.score != null ? T.acid + '2E' : 'transparent'}, transparent)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <span style={{ fontSize: 76, fontWeight: 700, letterSpacing: -3.5, lineHeight: 0.8, color: vm.score != null ? T.acid : T.quiet, textShadow: vm.score != null ? `0 0 30px ${T.acid}66` : 'none' }}>{vm.score ?? DASH}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Kicker>Readiness</Kicker>
                  <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.3, color: T.ink }}>{vm.word ?? DASH}</span>
                </div>
              </div>
            </div>
            <ChargeMeter score={vm.score} />
            <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>{vm.dateNote}</span>
          </div>

          {/* Guidance */}
          <div style={{ ...card(), gap: 8, background: T.acidDim, border: `1px solid ${T.acid}33` }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Activity size={14} color={T.acid} />
              <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3, color: T.ink }}>{vm.guidanceTitle}</span>
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>{vm.guidanceBody}</span>
          </div>
        </div>

        {/* What's driving it */}
        <div style={{ ...band(0), paddingBottom: 12, flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>Was es treibt</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>Deine Signale gegen den 7-Tage-Schnitt</span>
        </div>
        <div style={{ ...band(26), gap: 8 }}>
          {vm.limiterNote && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 14, background: T.surface, marginBottom: 4 }}>
              <Wind size={13} color={T.warn} />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: T.mid }}>{vm.limiterNote}</span>
            </div>
          )}
          {vm.drivers.map((d) => {
            const Ic = ICONS[d.icon]
            const dim = d.value === DASH
            const dh = d.deltaGood == null ? T.quiet : d.deltaGood ? T.acid : T.warn
            return (
              <div key={d.icon} style={{ ...card(), flexDirection: 'row', alignItems: 'center', gap: 14, padding: '15px 18px' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: T.surface2, display: 'grid', placeItems: 'center', flex: 'none' }}><Ic size={18} color={dim ? T.quiet : T.acid} /></div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: T.mid }}>{d.label}</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: dim ? T.quiet : T.ink }}>{d.value}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>{d.unit}</span>
                    </div>
                  </div>
                  <div style={{ height: 5, borderRadius: 100, background: T.surface2, overflow: 'hidden' }}>
                    <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.round(d.frac * 100)}%` }} transition={{ duration: 0.7, ease: EASE }}
                      style={{ height: '100%', borderRadius: 100, background: dim ? T.d3 : T.acid }} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flex: 'none' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: dh }}>{d.delta ?? '—'}</span>
                  <Spark series={d.spark} hue={dim ? T.d3 : T.acid} />
                </div>
              </div>
            )
          })}
        </div>

        {/* 7-day readiness trend */}
        {vm.trend.length > 1 && (
          <div style={{ ...band(40) }}>
            <div style={{ ...card(), gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Kicker>Readiness · letzte 7 Tage</Kicker>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 70 }}>
                {vm.trend.map((t, i) => {
                  const last = i === vm.trend.length - 1
                  const h = Math.max(6, Math.round((t / trendMax) * 70))
                  return <motion.div key={i} initial={reduce ? false : { height: 0 }} animate={{ height: h }} transition={grow(i * 0.05)}
                    style={{ flex: 1, height: h, borderRadius: '5px 5px 0 0', background: last ? `linear-gradient(180deg, ${T.acid}, ${T.acidDeep})` : T.d2 }} />
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
