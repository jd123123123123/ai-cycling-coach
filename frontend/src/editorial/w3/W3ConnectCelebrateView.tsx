import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, Sparkles, Clock, Mountain, Flame, ArrowRight, Trophy, Globe } from 'lucide-react'
import { T, FONT, EASE, Kicker, band } from './w3tokens'
import './w3.css'

/**
 * W3 · Connect celebration — after linking Garmin / COROS / Wahoo, celebrate
 * the history the rider just shared. Pure function of `vm`. Every figure is
 * real; this screen turns raw shared data into an epic, rewarding moment
 * (acid glow, count-up, an "around the world" hero, Everest comparison).
 */

export interface W3CelebrateStat { icon: 'clock' | 'mountain' | 'flame'; value: string; label: string }
export interface W3ConnectVm {
  source: string
  headline: string
  sub: string
  ridesCount: number
  ridesLabel: string
  km: number
  earthPct: number           // 0..1 fraction of Earth's circumference
  earthLine: string          // "0.87× around the Earth"
  everestLine: string | null // "47 Everests climbed"
  stats: W3CelebrateStat[]    // 3 supporting stats
  standout: { title: string; detail: string } | null
  ctaLabel: string
}

const ICONS = { clock: Clock, mountain: Mountain, flame: Flame }

function useCountUp(target: number, run: boolean, ms = 1300) {
  const [n, setN] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (!run) return
    if (reduce) { setN(target); return }
    let raf = 0; const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, run, ms, reduce])
  return n
}

export default function W3ConnectCelebrateView({ vm, onContinue }: { vm: W3ConnectVm; onContinue?: () => void }) {
  const reduce = useReducedMotion()
  const [revealed, setRevealed] = useState(false)
  useEffect(() => { const id = setTimeout(() => setRevealed(true), 180); return () => clearTimeout(id) }, [])
  const km = useCountUp(vm.km, revealed)

  const ARC = 2 * Math.PI * 128
  const VIOLET = '#7B5CFF'

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', justifyContent: 'space-between', background: T.bg, overflow: 'hidden' }}>

        {/* ── HERO ZONE: glowing acid aura + the earth ring ── */}
        <div style={{ position: 'relative' }}>
          {/* ambient radial glow */}
          <div style={{ position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)', width: 460, height: 460, borderRadius: '50%', background: `radial-gradient(circle, ${T.acid}22 0%, ${VIOLET}14 40%, transparent 68%)`, pointerEvents: 'none' }} />

          <div style={{ height: 44, padding: '0 22px', display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 700, color: T.ink, position: 'relative' }}>9:41</div>

          {/* success chip */}
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, position: 'relative' }}>
            <motion.div initial={reduce ? false : { scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}
              style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '7px 14px', borderRadius: 100, background: T.acidDim, border: `1px solid ${T.acid}55` }}>
              <Check size={13} color={T.acid} strokeWidth={3} />
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.2, color: T.acid }}>{vm.source.toUpperCase()} CONNECTED</span>
            </motion.div>
          </div>

          {/* the earth ring — distance around the globe */}
          <div style={{ display: 'grid', placeItems: 'center', paddingTop: 22, position: 'relative' }}>
            <div style={{ position: 'relative', width: 288, height: 288, display: 'grid', placeItems: 'center' }}>
              {/* burst */}
              {!reduce && revealed && [...Array(10)].map((_, i) => (
                <motion.span key={i} initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                  animate={{ scale: 1, x: Math.cos((i / 10) * 6.28) * 150, y: Math.sin((i / 10) * 6.28) * 150, opacity: 0 }}
                  transition={{ duration: 0.9, ease: EASE, delay: 0.25 }}
                  style={{ position: 'absolute', width: 6, height: 6, borderRadius: 4, background: i % 2 ? T.acid : VIOLET }} />
              ))}
              <svg width={288} height={288} viewBox="0 0 288 288" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
                <circle cx={144} cy={144} r={128} fill="none" stroke="#FFFFFF12" strokeWidth={10} />
                <motion.circle cx={144} cy={144} r={128} fill="none" stroke={T.acid} strokeWidth={10} strokeLinecap="round"
                  strokeDasharray={ARC}
                  initial={reduce ? false : { strokeDashoffset: ARC }}
                  animate={{ strokeDashoffset: ARC * (1 - Math.min(1, vm.earthPct)) }}
                  transition={{ duration: 1.4, ease: EASE, delay: 0.35 }} />
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <Globe size={13} color={VIOLET} /><Kicker>Distance ridden</Kicker>
                </div>
                <span style={{ fontSize: 52, fontWeight: 700, letterSpacing: -2, lineHeight: 1, color: T.ink }}>{km.toLocaleString('en-US')}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.quiet, marginTop: 2 }}>KILOMETRES</span>
                <div style={{ marginTop: 12, padding: '6px 13px', borderRadius: 100, background: `${VIOLET}22`, border: `1px solid ${VIOLET}55` }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#B9A6FF' }}>🌍 {vm.earthLine}</span>
                </div>
              </div>
            </div>
          </div>

          {/* headline */}
          <div style={{ ...band(4), paddingTop: 14, alignItems: 'center', textAlign: 'center', position: 'relative' }}>
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1.1, color: T.ink, maxWidth: 320 }}>{vm.headline}</span>
            <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.45, color: T.mid, marginTop: 8, maxWidth: 300 }}>{vm.sub}</span>
          </div>
        </div>

        {/* ── STAT STRIP: rides count-up + 3 supporting ── */}
        <div style={{ ...band(8), gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {vm.stats.map((s, i) => {
              const Ic = ICONS[s.icon]
              const hero = s.icon === 'mountain' && vm.everestLine
              return (
                <motion.div key={s.label} initial={reduce ? false : { opacity: 0, y: 12 }} animate={revealed ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.45, ease: EASE, delay: 0.5 + i * 0.09 }}
                  style={{ flex: 1, padding: '15px 13px 16px', borderRadius: 18, background: T.surface, display: 'flex', flexDirection: 'column', gap: 8, border: `1px solid ${T.rule}` }}>
                  <div style={{ width: 28, height: 28, borderRadius: 100, background: T.acidDim, display: 'grid', placeItems: 'center' }}><Ic size={14} color={T.acid} /></div>
                  <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>{s.value}</span>
                  <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.quiet, lineHeight: 1.3 }}>{hero ? vm.everestLine : s.label}</span>
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* ── STANDOUT ── */}
        {vm.standout && (
          <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={revealed ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.45, delay: 0.82 }} style={band(4)}>
            <div style={{ padding: 15, borderRadius: 18, background: `linear-gradient(120deg, ${T.surface}, ${VIOLET}12)`, display: 'flex', gap: 13, alignItems: 'center', border: `1px solid ${T.rule}` }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: T.acidDim, display: 'grid', placeItems: 'center', flex: 'none' }}><Trophy size={20} color={T.acid} /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Kicker>Your all-time standout</Kicker>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{vm.standout.title}</span>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: T.mid }}>{vm.standout.detail}</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── CTA ── */}
        <div style={{ ...band(38), paddingTop: 14 }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Sparkles size={13} color={T.acid} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: T.mid, textAlign: 'center' }}>Every ride is yours — your coach reads all of it.</span>
          </div>
          <button onClick={onContinue} style={{ height: 56, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, letterSpacing: -0.2, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
            {vm.ctaLabel}<ArrowRight size={18} color={T.bg} />
          </button>
        </div>
      </div>
    </div>
  )
}
