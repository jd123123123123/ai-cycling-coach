import { type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Activity, HeartPulse, Moon, BatteryCharging, Waves, Timer, Wind, TrendingUp, Sparkles } from 'lucide-react'
import { T, FONT, EASE, grow, Kicker, DASH } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import W3TopBar from './W3TopBar'
import './w3.css'

/**
 * W3 · READINESS — the `?tab=body` Recovery surface, rebuilt bubbly + intense.
 *
 * Pure function of `vm`; `W3ReadinessPage` builds it from the real signals: the
 * canonical readiness, the overnight snapshot, the 30-day daily metrics, the
 * sleep breakdown, the recovery ETA and the PMC fitness/freshness. Every value
 * resolves to a value or an honest "—".
 */

export type DriverIcon = 'hrv' | 'rhr' | 'sleep' | 'battery' | 'stress' | 'recovery' | 'vo2'
export interface DriverVm { icon: DriverIcon; label: string; value: string; unit: string; delta: string | null; deltaGood: boolean | null; frac: number; spark: number[] }
export interface SleepStage { label: string; frac: number; hue: string }
export interface W3ReadinessVm {
  score: number | null
  word: string | null
  tierLabel: string | null
  guidanceTitle: string
  guidanceBody: string
  dateNote: string
  trend: number[]
  drivers: DriverVm[]
  limiterNote: string | null
  sleep: { total: string; stages: SleepStage[]; spo2: string | null; resp: string | null; note: string } | null
  recovery: { hours: string; frac: number; note: string } | null
  fitness: { ctl: string; atl: string; tsb: string; verdict: string } | null
  vo2: string | null
}
export interface W3ReadinessActions { onBack?: () => void }

const ICONS: Record<DriverIcon, typeof Activity> = { hrv: Activity, rhr: HeartPulse, sleep: Moon, battery: BatteryCharging, stress: Waves, recovery: Timer, vo2: Wind }
const HUE: Record<DriverIcon, string> = { hrv: '#00E5FF', rhr: '#FF6A8A', sleep: '#7B5CFF', battery: '#2BE68F', stress: '#FFB020', recovery: '#6B8CFF', vo2: '#C8FF00' }

const band = (pb: number): CSSProperties => ({ display: 'flex', flexDirection: 'column', width: '100%', background: T.bg, padding: `0 20px ${pb}px` })
/** Bubbly card: big radius + a soft top-lit gradient + hairline. */
const bubble = (accent = T.stroke): CSSProperties => ({ borderRadius: 28, padding: 20, display: 'flex', flexDirection: 'column', width: '100%', background: `linear-gradient(180deg, #1B1B1B, ${T.surface})`, border: `1px solid ${accent}` })

// ── readiness ring — the dopamine hero ──
function ReadinessRing({ score, word, tier }: { score: number | null; word: string | null; tier: string | null }) {
  const reduce = useReducedMotion()
  const R = 96, C = 2 * Math.PI * R
  const pct = score == null ? 0 : Math.max(0, Math.min(1, score / 100))
  const hue = score == null ? T.quiet : score >= 70 ? T.acid : score >= 45 ? T.warn : T.bad
  return (
    <div style={{ position: 'relative', width: 236, height: 236, display: 'grid', placeItems: 'center' }}>
      <div style={{ position: 'absolute', inset: 24, borderRadius: '50%', background: score != null ? `radial-gradient(closest-side, ${hue}3D, transparent)` : 'transparent' }} />
      <svg viewBox="0 0 236 236" width={236} height={236} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="rr" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={hue} /><stop offset="100%" stopColor={T.acidDeep} /></linearGradient>
        </defs>
        <circle cx={118} cy={118} r={R} fill="none" stroke={T.surface2} strokeWidth={16} />
        <motion.circle cx={118} cy={118} r={R} fill="none" stroke="url(#rr)" strokeWidth={16} strokeLinecap="round"
          strokeDasharray={C} initial={reduce ? false : { strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - pct) }} transition={{ duration: 1.1, ease: EASE }}
          transform="rotate(-90 118 118)" style={{ filter: score != null ? `drop-shadow(0 0 8px ${hue})` : 'none' }} />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: 78, fontWeight: 700, letterSpacing: -3.5, lineHeight: 0.82, color: score != null ? hue : T.quiet, textShadow: score != null ? `0 0 30px ${hue}88` : 'none' }}>{score ?? DASH}</span>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, color: T.ink }}>{word ?? DASH}</span>
        {tier && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: hue, padding: '3px 10px', borderRadius: 100, background: `${hue}1F`, marginTop: 3 }}>{tier}</span>}
      </div>
    </div>
  )
}

function Spark({ series, hue }: { series: number[]; hue: string }) {
  const reduce = useReducedMotion()
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 22, width: 62, flex: 'none' }}>
      {series.map((b, i) => {
        const last = i === series.length - 1
        const h = Math.max(2, Math.round(b * 22))
        return <motion.div key={i} initial={reduce ? false : { height: 0 }} animate={{ height: h }} transition={grow(i * 0.03)}
          style={{ flex: 1, height: h, borderRadius: 2, background: last ? hue : `${hue}44`, boxShadow: last ? `0 0 6px ${hue}` : 'none' }} />
      })}
    </div>
  )
}

function Sec({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ ...band(0), paddingBottom: 12, flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>{title}</span>
      {sub && <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>{sub}</span>}
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

        <W3TopBar title="Readiness" onBack={onBack} />

        {/* Hero ring */}
        <div style={{ ...band(24), paddingTop: 6, gap: 16, alignItems: 'center' }}>
          <ReadinessRing score={vm.score} word={vm.word} tier={vm.tierLabel} />
          <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet, textAlign: 'center' }}>{vm.dateNote}</span>
          {/* Guidance */}
          <div style={{ ...bubble(`${T.acid}33`), gap: 8, background: `linear-gradient(180deg, ${T.acid}1A, ${T.surface})` }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ width: 26, height: 26, borderRadius: 100, background: T.acid, display: 'grid', placeItems: 'center' }}><Sparkles size={14} color={T.bg} /></div>
              <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3, color: T.ink }}>{vm.guidanceTitle}</span>
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>{vm.guidanceBody}</span>
          </div>
        </div>

        {/* Drivers */}
        <Sec title="Was es treibt" sub="Deine Signale gegen den 7-Tage-Schnitt" />
        <div style={{ ...band(26), gap: 8 }}>
          {vm.limiterNote && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '11px 15px', borderRadius: 16, background: `${T.warn}14`, border: `1px solid ${T.warn}33`, marginBottom: 4 }}>
              <Wind size={14} color={T.warn} />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: T.ink }}>{vm.limiterNote}</span>
            </div>
          )}
          {vm.drivers.map((d) => {
            const Ic = ICONS[d.icon]; const hue = HUE[d.icon]; const dim = d.value === DASH
            const dh = d.deltaGood == null ? T.quiet : d.deltaGood ? T.acid : T.warn
            return (
              <div key={d.icon} style={{ ...bubble(), flexDirection: 'row', alignItems: 'center', gap: 14, padding: '15px 18px' }}>
                <div style={{ width: 42, height: 42, borderRadius: 14, background: dim ? T.surface2 : `${hue}1F`, display: 'grid', placeItems: 'center', flex: 'none', boxShadow: dim ? 'none' : `0 0 14px ${hue}22` }}><Ic size={19} color={dim ? T.quiet : hue} /></div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: T.mid }}>{d.label}</span>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.5, color: dim ? T.quiet : T.ink }}>{d.value}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>{d.unit}</span>
                    </div>
                  </div>
                  <div style={{ height: 6, borderRadius: 100, background: T.surface2, overflow: 'hidden' }}>
                    <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.round(d.frac * 100)}%` }} transition={{ duration: 0.7, ease: EASE }}
                      style={{ height: '100%', borderRadius: 100, background: dim ? T.d3 : hue, boxShadow: dim ? 'none' : `0 0 8px ${hue}66` }} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flex: 'none' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: dh }}>{d.delta ?? '—'}</span>
                  {d.spark.length > 0 && <Spark series={d.spark} hue={dim ? T.d3 : hue} />}
                </div>
              </div>
            )
          })}
        </div>

        {/* Sleep */}
        {vm.sleep && (
          <>
            <Sec title="Schlaf" sub="Letzte Nacht" />
            <div style={{ ...band(26) }}>
              <div style={{ ...bubble(`${HUE.sleep}33`), gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 14, background: `${HUE.sleep}1F`, display: 'grid', placeItems: 'center', boxShadow: `0 0 16px ${HUE.sleep}33` }}><Moon size={20} color={HUE.sleep} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, color: T.ink }}>{vm.sleep.total}</span>
                      <Kicker>Schlafdauer</Kicker>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {vm.sleep.spo2 && <span style={{ fontSize: 11, fontWeight: 700, color: HUE.hrv, padding: '5px 10px', borderRadius: 100, background: `${HUE.hrv}14` }}>SpO₂ {vm.sleep.spo2}</span>}
                    {vm.sleep.resp && <span style={{ fontSize: 11, fontWeight: 700, color: HUE.battery, padding: '5px 10px', borderRadius: 100, background: `${HUE.battery}14` }}>{vm.sleep.resp}</span>}
                  </div>
                </div>
                {vm.sleep.stages.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 3, height: 14, borderRadius: 100, overflow: 'hidden' }}>
                      {vm.sleep.stages.map((s, i) => (
                        <motion.div key={s.label} initial={reduce ? false : { flexGrow: 0 }} animate={{ flexGrow: Math.max(0.02, s.frac) }} transition={grow(i * 0.06)}
                          style={{ flexBasis: 0, height: 14, background: s.hue }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {vm.sleep.stages.map((s) => (
                        <div key={s.label} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: s.hue }} />
                          <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>{s.label} {Math.round(s.frac * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: T.mid }}>{vm.sleep.note}</span>
              </div>
            </div>
          </>
        )}

        {/* Recovery ETA + Fitness/Freshness, side by side */}
        {(vm.recovery || vm.fitness) && (
          <div style={{ ...band(26), flexDirection: 'row', gap: 10 }}>
            {vm.recovery && (
              <div style={{ ...bubble(`${HUE.recovery}33`), flex: 1, gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: `${HUE.recovery}1F`, display: 'grid', placeItems: 'center' }}><Timer size={18} color={HUE.recovery} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, color: T.ink }}>{vm.recovery.hours}</span>
                  <Kicker>bis voll erholt</Kicker>
                </div>
                <div style={{ height: 6, borderRadius: 100, background: T.surface2, overflow: 'hidden' }}>
                  <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.round((1 - vm.recovery.frac) * 100)}%` }} transition={{ duration: 0.8, ease: EASE }}
                    style={{ height: '100%', borderRadius: 100, background: HUE.recovery, boxShadow: `0 0 8px ${HUE.recovery}66` }} />
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>{vm.recovery.note}</span>
              </div>
            )}
            {vm.fitness && (
              <div style={{ ...bubble(`${T.acid}22`), flex: 1, gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: T.acidDim, display: 'grid', placeItems: 'center' }}><TrendingUp size={18} color={T.acid} /></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  {[['FITNESS', vm.fitness.ctl], ['FORM', vm.fitness.tsb]].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.8, color: l === 'FORM' ? T.acid : T.ink }}>{v}</span>
                      <Kicker>{l}</Kicker>
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.35, color: T.quiet }}>{vm.fitness.verdict}</span>
              </div>
            )}
          </div>
        )}

        {/* Trend */}
        {vm.trend.length > 1 && (
          <div style={{ ...band(40) }}>
            <div style={{ ...bubble(), gap: 14 }}>
              <Kicker>Readiness · letzte 7 Tage</Kicker>
              <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end', height: 76 }}>
                {vm.trend.map((t, i) => {
                  const last = i === vm.trend.length - 1
                  const h = Math.max(8, Math.round((t / trendMax) * 76))
                  return <motion.div key={i} initial={reduce ? false : { height: 0 }} animate={{ height: h }} transition={grow(i * 0.05)}
                    style={{ flex: 1, height: h, borderRadius: '6px 6px 3px 3px', background: last ? `linear-gradient(180deg, ${T.acid}, ${T.acidDeep})` : T.surface2, boxShadow: last ? `0 0 12px ${T.acid}55` : 'none' }} />
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
