import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  Check, Share2, X, Route as RouteIcon, Timer, Zap, Mountain, Flame, TrendingUp, ChevronsRight,
} from 'lucide-react'
import { T, FONT, EASE, grow, band } from './w3tokens'
import './w3.css'

/**
 * W3 · Post-ride celebration — 1:1 with `w3.pen` frames `gVMos` (PENDING) and
 * `dXZaC` (SETTLED), driven by the `oqrCW` "The Settle" motion spec: violet is
 * a promise, lime is a receipt. One screen, two states:
 *
 *   PENDING (violet)  — "Cobbles beaten. ✱840", the ride's real stats, power
 *                       zones and firsts/bests, and SLIDE TO CLAIM.
 *   SETTLED (lime)    — after claiming, the settle animation drains violet→lime
 *                       and the body becomes the receipt: "how the N was made"
 *                       (real base + streak from the ledger), banked to the
 *                       ledger, CLAIMED ✓.
 *
 * Because RideCoin is awarded at ingestion and balances never expire, claiming
 * is the reveal ritual (banking already-earned coins into view), not a
 * forfeiture gate. One-shot: a claimed ride opens straight in the settled state.
 */

const VIOLET = '#7B5CFF'
const VIOLET_DIM = '#7B5CFF24'

export interface W3CelebStat { icon: 'route' | 'timer' | 'power' | 'climb'; label: string; value: string; unit: string }
export interface W3CelebZone { z: string; name: string; min: string; pct: number; peak: boolean }
export interface W3CelebFirst { icon: 'route' | 'flame' | 'climb'; title: string; sub: string }
export interface W3CelebBreak { label: string; value: string }

export interface W3CelebrateVm {
  provider: string | null       // "WAHOO"
  kicker: string                // "COBBLES BAGGED"
  title: string                 // "Cobbles"
  titleAccent: string           // "beaten."
  settledTitle: string          // "Points"
  settledAccent: string         // "earned."
  total: number
  coinsPending: string          // "73 coins on the cobbles"
  coinsSettled: string          // "73 coins · all banked"
  stats: W3CelebStat[]          // 4, real
  zones: W3CelebZone[]          // real power split (may be empty → section hidden)
  ftp: string
  bestEffortW: string | null    // "271 W"
  bestEffortNote: string        // "for 8 min · BEST SINCE MAY"
  firstsCount: number
  firsts: W3CelebFirst[]        // real PRs/bests (may be empty)
  breakMeta: string             // "2h04 · 28.4 KM · 186 W"
  breakdown: W3CelebBreak[]     // real: RIDE base, STREAK bonus
  bankedNote: string            // "BANKED TO YOUR AUGUST LEDGER"
  alreadyClaimed: boolean       // one-shot: open settled if seen before
}

const STAT_ICON = { route: RouteIcon, timer: Timer, power: Zap, climb: Mountain }
const FIRST_ICON = { route: RouteIcon, flame: Flame, climb: Mountain }

function useCountUp(target: number, run: boolean, reduce: boolean | null, ms = 780) {
  const [n, setN] = useState(reduce ? target : 0)
  useEffect(() => {
    if (!run) return
    if (reduce) { setN(target); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms)
      const eased = 1 - Math.pow(1 - p, 3) // ease-out-cubic (the Tally)
      setN(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, run, reduce, ms])
  return n
}

export default function W3RideCelebrateView({
  vm, onClose, onShare, onFullDetail,
}: { vm: W3CelebrateVm; onClose?: () => void; onShare?: () => void; onFullDetail?: () => void }) {
  const reduce = useReducedMotion()
  const [claimed, setClaimed] = useState(vm.alreadyClaimed)
  const accent = claimed ? T.acid : VIOLET
  const count = useCountUp(vm.total, true, reduce)
  const nf = (x: number) => x.toLocaleString('en-US')

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>

        {/* StatusBar */}
        <div style={{ height: 44, padding: '0 22px', display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 700, color: T.ink }}>9:41</div>

        {/* Top row: synced pill + share/close */}
        <div style={{ padding: '4px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 14px 7px 8px', borderRadius: 100, background: T.surface }}>
            <span style={{ width: 20, height: 20, borderRadius: 100, background: T.acid, display: 'grid', placeItems: 'center' }}><Check size={12} color={T.bg} strokeWidth={3.5} /></span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: T.ink }}>RIDE SYNCED{vm.provider ? ` · ${vm.provider}` : ''}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onShare} aria-label="Share" style={{ width: 40, height: 40, borderRadius: 100, background: 'transparent', border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Share2 size={17} color={T.mid} /></button>
            <button onClick={onClose} aria-label="Close" style={{ width: 40, height: 40, borderRadius: 100, background: 'transparent', border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={19} color={T.mid} /></button>
          </div>
        </div>

        {/* Hero scene: coin motif + earned points */}
        <div style={{ position: 'relative', margin: '10px 0 0', padding: '30px 20px 26px', overflow: 'hidden' }}>
          {/* ambient scene glow (violet promise → lime receipt) */}
          <motion.div animate={{ background: `radial-gradient(120% 90% at 78% 30%, ${accent}2E, ${accent}00 60%)` }} transition={{ duration: 0.6, ease: EASE }}
            style={{ position: 'absolute', inset: 0 }} />
          {/* trailing coins */}
          <div style={{ position: 'absolute', right: 18, top: 54, display: 'flex', gap: 10, alignItems: 'center' }}>
            {[1, 0.72, 0.5, 0.34].map((o, i) => (
              <motion.div key={i} animate={reduce ? {} : { y: [0, -4, 0] }} transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
                style={{ width: 34 - i * 6, height: 34 - i * 6, borderRadius: 100, background: T.acid, opacity: o, boxShadow: `0 0 16px ${T.acid}66`, display: 'grid', placeItems: 'center' }}>
                <span style={{ fontSize: 15 - i * 3, fontWeight: 900, color: T.bg }}>I</span>
              </motion.div>
            ))}
          </div>
          {/* +12 pop */}
          <motion.div initial={reduce ? false : { y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}
            style={{ position: 'absolute', right: 96, top: 20, padding: '6px 12px', borderRadius: 100, background: T.acid, fontSize: 13, fontWeight: 800, color: T.bg }}>+12</motion.div>

          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6, marginTop: 96 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.6, color: accent }}>{vm.kicker}</span>
            <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.5, color: T.ink, lineHeight: 1 }}>
              {claimed ? vm.settledTitle : vm.title}{' '}
              <span style={{ color: accent }}>{claimed ? vm.settledAccent : vm.titleAccent}</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <motion.span animate={{ color: accent }} transition={{ duration: 0.5 }} style={{ fontSize: 30, fontWeight: 800 }}>{claimed ? '✦' : '✱'}</motion.span>
                <span style={{ fontSize: 76, fontWeight: 800, letterSpacing: -3, color: T.ink, lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}>{nf(count)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, paddingBottom: 6 }}>
                <span style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '7px 13px', borderRadius: 100, border: `1px solid ${accent}`, fontSize: 11, fontWeight: 800, letterSpacing: 1, color: accent }}>
                  <span style={{ width: 6, height: 6, borderRadius: 100, background: accent }} />{claimed ? 'SETTLED' : 'PENDING'}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>{claimed ? vm.coinsSettled : vm.coinsPending}</span>
              </div>
            </div>
          </div>
        </div>

        {claimed ? (
          /* ── SETTLED (receipt) ── */
          <>
            <div style={{ ...band(22), gap: 14 }}>
              <div style={{ ...cardBox(), gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>How the {nf(vm.total)} was made</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet, letterSpacing: 0.3 }}>{vm.breakMeta}</span>
                </div>
                {/* proportional breakdown bar */}
                <div style={{ display: 'flex', gap: 4, height: 12 }}>
                  {vm.breakdown.map((b, i) => {
                    const val = parseInt(b.value.replace(/\D/g, '')) || 0
                    return <div key={i} style={{ flex: val || 1, height: 12, borderRadius: 100, background: i === 0 ? T.acid : T.acidDeep }} />
                  })}
                </div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  {vm.breakdown.map((b, i) => (
                    <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                      <span style={{ width: 6, height: 6, borderRadius: 100, background: i === 0 ? T.acid : T.acidDeep }} />
                      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, color: T.mid }}>{b.label}</span>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: T.acid }}>{b.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ ...band(24), gap: 8 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ width: 22, height: 22, borderRadius: 100, border: `1.5px solid ${T.acid}`, display: 'grid', placeItems: 'center' }}><Check size={12} color={T.acid} strokeWidth={3} /></span>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Settled <span style={{ color: T.mid }}>just now</span></span>
                <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, letterSpacing: 0.8, color: T.acid }}>{vm.bankedNote}</span>
              </div>
            </div>

            <div style={{ ...band(30), gap: 12 }}>
              <div style={{ height: 60, borderRadius: 100, background: T.acidDim, border: `1px solid ${T.acid}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 0 24px' }}>
                <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.5, color: T.acid }}>CLAIMED ✦ {nf(vm.total)}</span>
                <span style={{ width: 46, height: 46, borderRadius: 100, background: T.acid, display: 'grid', placeItems: 'center' }}><Check size={22} color={T.bg} strokeWidth={3} /></span>
              </div>
              <button onClick={onFullDetail} style={{ height: 54, borderRadius: 100, background: T.surface, border: 0, fontFamily: FONT, fontSize: 14, fontWeight: 700, letterSpacing: 0.5, color: T.ink, cursor: 'pointer' }}>FULL RIDE DETAIL</button>
            </div>
          </>
        ) : (
          /* ── PENDING (promise) ── */
          <>
            {/* stat cards */}
            <div style={{ ...band(22), flexDirection: 'row', gap: 8 }}>
              {vm.stats.map((s) => {
                const Ic = STAT_ICON[s.icon]
                return (
                  <div key={s.label} style={{ flex: 1, padding: '13px 12px 15px', borderRadius: 18, background: T.surface, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Ic size={15} color={T.acid} />
                    <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>{s.label}</span>
                    <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.6, color: s.value === '—' ? T.quiet : T.ink }}>{s.value}<span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}> {s.unit}</span></span>
                  </div>
                )
              })}
            </div>

            {/* power zones */}
            {vm.zones.length > 0 && (
              <div style={band(24)}>
                <div style={{ ...cardBox(), gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>You were strongest here</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, color: T.quiet }}>{vm.ftp}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 96 }}>
                    {vm.zones.map((z, i) => (
                      <motion.div key={i} initial={reduce ? false : { scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={grow(i * 0.05)}
                        style={{ flex: 1, height: `${Math.max(8, z.pct)}%`, minHeight: 8, transformOrigin: 'bottom', borderRadius: 4, background: z.peak ? T.acid : T.acidDeep, opacity: z.peak ? 1 : 0.5 }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {vm.zones.map((z, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ height: 3, borderRadius: 100, background: z.peak ? T.acid : T.rule }} />
                        <span style={{ fontSize: 8, fontWeight: 700, color: T.quiet }}>{z.z.replace('ZONE ', 'Z')} {z.min.replace(' min', "'")}</span>
                      </div>
                    ))}
                  </div>
                  {vm.bestEffortW && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 4 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1, color: T.acid }}>{vm.bestEffortW}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>{vm.bestEffortNote}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* firsts & bests */}
            {vm.firsts.length > 0 && (
              <div style={{ ...band(26), gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>Firsts and bests</span>
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, color: T.acid }}>{vm.firstsCount} NEW</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {vm.firsts.map((f, i) => {
                    const Ic = FIRST_ICON[f.icon]
                    return (
                      <div key={i} style={{ flex: 1, padding: '14px 13px', borderRadius: 18, background: T.surface, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <Ic size={16} color={T.acid} />
                        <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: -0.2, color: T.ink, lineHeight: 1.1 }}>{f.title}</span>
                        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6, color: T.quiet }}>{f.sub}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* slide to claim */}
            <div style={{ ...band(30), gap: 14 }}>
              <button onClick={() => setClaimed(true)}
                style={{ position: 'relative', height: 62, borderRadius: 100, background: VIOLET_DIM, border: `1px solid ${VIOLET}`, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', padding: '0 8px', overflow: 'hidden' }}>
                <span style={{ width: 46, height: 46, borderRadius: 100, background: VIOLET, display: 'grid', placeItems: 'center', flex: 'none' }}><ChevronsRight size={22} color="#fff" strokeWidth={2.5} /></span>
                <span style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 800, letterSpacing: 1, color: '#fff' }}>SLIDE TO CLAIM ✱ {nf(vm.total)}</span>
              </button>
              <button onClick={onFullDetail} style={{ height: 20, background: 'transparent', border: 0, fontFamily: FONT, fontSize: 13, fontWeight: 700, letterSpacing: 0.5, color: T.mid, cursor: 'pointer', display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                FULL RIDE DETAIL <TrendingUp size={13} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const cardBox = () => ({ background: T.surface, borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column' as const, width: '100%' })
