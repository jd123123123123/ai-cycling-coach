import type { ComponentType } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  Watch, Activity as ActivityIcon, Zap, HeartPulse, Sparkles, Globe2,
  Route as RouteIcon, Bike, Timer, Mountain, Gauge, Flame, Medal,
  ChevronRight, UserRound,
} from 'lucide-react'
import { W3Coin } from './W3Coin'
import W3NavMenu from './W3NavMenu'
import W3TabBar from './W3TabBar'
import { T, FONT, EASE, grow, Kicker, band, card } from './w3tokens'
import './w3.css'

/**
 * W3 · 05 BIKER — the rider's profile, in the language of the "AVATAR
 * UNLOCKED" reveal (pen `lQimK`): the generated rider fills the top of the
 * frame, an acid pill straddles the seam, and every fact below is a big number
 * with a small uppercase kicker and a human caption that makes it MEAN
 * something ("≈ 6.9× Mount Everest", "≈ 216 pizzas").
 *
 * Unlike the reveal this is a destination, not a moment: it scrolls, and it
 * carries no "Take it" / share / skip actions.
 *
 * Pure function of `vm`. Every value is REAL or the explicit em dash — the
 * Page decides, this file never invents. Values that have no backend simply
 * do not appear.
 */

export type W3InsightKey = 'elevation' | 'longest' | 'speed' | 'burned'
export interface W3Insight { key: W3InsightKey; label: string; value: string; caption: string }
export interface W3Fact { label: string; value: string; caption: string }
export interface W3Device { name: string; sub: string; icon: 'watch' | 'activity' | 'zap' | 'heart'; on: boolean }

export interface W3BikerVm {
  /** The rider's own garage figurine. Null → the empty seat, never a stand-in. */
  avatarUrl: string | null
  name: string
  handle: string
  /** False until the rides + wallet have answered. Guards the level pill so a
   *  veteran is never flashed "LVL 1 · ROOKIE" on the way in. */
  ready: boolean
  role: string
  level: number
  levelPct: number              // 0..1 through the current level
  levelNote: string             // "312 RC to Level 8"
  chips: string[]               // real identity chips (CAT, W/kg, FTP, since)
  headline: string              // "12 % around the Earth" — the meaning, not the number
  headlineCaption: string
  primary: { totalDistance: string; totalRides: string; saddleTime: string }
  insights: W3Insight[]         // 4 · the reveal's dopamine tiles
  engine: W3Fact[]              // FTP / W·kg / fitness
  streak: W3Fact
  badges: W3Fact
  coin: { balance: string; pct: number; foot: string; note: string }
  referral: { code: string; note: string } | null
  devices: W3Device[]
}

const DEV_ICONS: Record<W3Device['icon'], ComponentType<{ size?: number; color?: string }>> = {
  watch: Watch, activity: ActivityIcon, zap: Zap, heart: HeartPulse,
}
const PRIMARY = [
  { key: 'totalDistance' as const, icon: RouteIcon, label: 'GESAMTDISTANZ' },
  { key: 'totalRides' as const, icon: Bike, label: 'FAHRTEN GESAMT' },
  { key: 'saddleTime' as const, icon: Timer, label: 'SATTELZEIT' },
]
const INSIGHT_META: Record<W3InsightKey, { icon: ComponentType<{ size?: number; color?: string }>; hue: string }> = {
  elevation: { icon: Mountain, hue: T.evening },
  longest: { icon: RouteIcon, hue: '#00E5FF' },
  speed: { icon: Gauge, hue: T.training },
  burned: { icon: Flame, hue: T.warn },
}
const DASH = '—'
const SEG = 24

/** One value + kicker + caption, on surface. The page's whole rhythm. */
function FactCell({ f, flex = 1 }: { f: W3Fact; flex?: number }) {
  return (
    <div style={{ flex, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, padding: '13px 12px 14px', borderRadius: 18, background: T.surface, border: `1px solid ${T.rule}` }}>
      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.label}</span>
      <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.7, color: f.value === DASH ? T.quiet : T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.value}</span>
      <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.3, color: T.quiet, overflow: 'hidden' }}>{f.caption}</span>
    </div>
  )
}

export default function W3BikerView({ vm, onReferral, onBadges, onCreateRider }: { vm: W3BikerVm; onReferral?: () => void; onBadges?: () => void; onCreateRider?: () => void }) {
  const reduce = useReducedMotion()
  const litSeg = Math.max(0, Math.min(SEG, Math.round((vm.coin.pct / 100) * SEG)))

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>

        {/* ── Cover: the rider fills the top of the frame ── */}
        <div style={{ position: 'relative', height: 306, background: '#141414', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)', width: 340, height: 280, borderRadius: '50%', background: `radial-gradient(closest-side, ${T.acid}26, transparent)` }} />
          {vm.avatarUrl ? (
            <img src={vm.avatarUrl} alt="Dein Fahrer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }} />
          ) : (
            /* The empty seat. Never someone else's showcase rider on a page
               whose whole job is to say who YOU are. */
            <button onClick={onCreateRider} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'transparent', border: 0, fontFamily: FONT, cursor: onCreateRider ? 'pointer' : 'default' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', paddingBottom: 34 }}>
                <div style={{ width: 92, height: 92, borderRadius: 100, display: 'grid', placeItems: 'center', background: T.surface, border: `1.5px dashed ${T.acid}59` }}>
                  <UserRound size={40} strokeWidth={1.5} color={T.acid} />
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>Noch kein Fahrer</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>Erstell deinen im Studio</span>
              </div>
            </button>
          )}
          <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150, pointerEvents: 'none', background: `linear-gradient(180deg, transparent, ${T.bg})` }} />
          {/* No W3StatusBar spacer here: the cover is full-bleed to the top of
              the frame by design (the reveal does the same) — only the header
              row is pushed clear of the OS chrome. */}
          <div style={{ position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', left: 0, right: 0, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ minWidth: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: 1.4, color: T.ink, padding: '8px 13px', borderRadius: 100, background: '#00000066', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>BIKER</span>
            <div style={{ flex: 'none' }}><W3NavMenu /></div>
          </div>
        </div>

        {/* ── Identity: acid pill on the seam, then who you are ── */}
        <div style={{ ...band(24), paddingTop: 0, marginTop: -16, gap: 10, alignItems: 'center', position: 'relative', zIndex: 2 }}>
          {vm.ready ? (
            <motion.div
              initial={reduce ? false : { scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.45, ease: EASE }}
              style={{ maxWidth: '100%', display: 'flex', gap: 7, alignItems: 'center', padding: '7px 15px', borderRadius: 100, background: T.acid, boxShadow: `0 0 24px ${T.acid}66` }}>
              <Sparkles size={13} color="#121212" style={{ flex: 'none' }} />
              <span style={{ minWidth: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: '#121212', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                LVL {vm.level} · {vm.role.toUpperCase()}
              </span>
            </motion.div>
          ) : (
            /* Same shape, no claim: the level and the role are only true once
               the rides and the wallet have answered. */
            <div style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '7px 15px', borderRadius: 100, background: T.surface2 }}>
              <Sparkles size={13} color={T.quiet} style={{ flex: 'none' }} />
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: T.quiet }}>···</span>
            </div>
          )}

          <div style={{ maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
            <span style={{ maxWidth: '100%', fontSize: 30, fontWeight: 700, letterSpacing: -1.1, lineHeight: 1.1, color: T.ink, textAlign: 'center', overflowWrap: 'anywhere' }}>{vm.name}</span>
            <span style={{ maxWidth: '100%', fontSize: 12.5, fontWeight: 600, color: T.mid, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.handle}</span>
          </div>

          {vm.chips.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              {vm.chips.map((c) => (
                <span key={c} style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.mid, padding: '6px 11px', borderRadius: 100, background: T.rule, whiteSpace: 'nowrap' }}>{c}</span>
              ))}
            </div>
          )}

          {/* Level bar — the only other acid on this screenful, and it belongs
              to the pill above: one statement, not two. */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 5, marginTop: 2 }}>
            <div style={{ height: 6, borderRadius: 100, background: T.surface2, overflow: 'hidden' }}>
              <motion.div
                initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.round(Math.max(0, Math.min(1, vm.levelPct)) * 100)}%` }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
                style={{ height: '100%', borderRadius: 100, background: `linear-gradient(90deg, ${T.acidDeep}, ${T.acid})` }} />
            </div>
            <span style={{ alignSelf: 'flex-end', fontSize: 9.5, fontWeight: 600, color: T.quiet }}>{vm.levelNote}</span>
          </div>
        </div>

        {/* ── Lifetime ── */}
        <div style={{ ...band(26), gap: 10 }}>
          <Kicker>Gesamt</Kicker>

          {/* The headline: the distance, made human. */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 16px', borderRadius: 20, background: T.surface, border: `1px solid ${T.rule}` }}>
            {/* Quiet on purpose: the acid on this screenful belongs to the
                level pill. This card speaks through the sentence, not colour. */}
            <div style={{ flex: 'none', width: 38, height: 38, borderRadius: 12, background: T.surface2, display: 'grid', placeItems: 'center' }}>
              <Globe2 size={19} color={T.mid} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.4, color: vm.headline === DASH ? T.quiet : T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.headline}</span>
              <span style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.3, color: T.quiet }}>{vm.headlineCaption}</span>
            </div>
          </div>

          {/* Primary — three cells, one strip */}
          <div style={{ display: 'flex', width: '100%', borderRadius: 18, background: T.surface, border: `1px solid ${T.stroke}`, overflow: 'hidden' }}>
            {PRIMARY.map((p, i) => {
              const Ic = p.icon
              const v = vm.primary[p.key]
              return (
                <div key={p.key} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5, padding: '12px 8px 13px', borderLeft: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                  <Ic size={17} color={T.mid} />
                  <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.7, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</span>
                  <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.6, color: v === DASH ? T.quiet : T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
                </div>
              )
            })}
          </div>

          {/* Insight tiles — each raw number made meaningful */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
            {vm.insights.map((t, i) => {
              const meta = INSIGHT_META[t.key]; const Ic = meta.icon
              return (
                <motion.div key={t.key}
                  initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={grow(0.06 * i)}
                  style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, padding: '11px 12px 12px', borderRadius: 16, background: `linear-gradient(180deg, ${meta.hue}14, ${T.surface})`, border: `1px solid ${meta.hue}2E` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 'none', width: 26, height: 26, borderRadius: 8, background: `${meta.hue}22`, display: 'grid', placeItems: 'center' }}><Ic size={14} color={meta.hue} /></div>
                    <span style={{ minWidth: 0, fontSize: 8, fontWeight: 700, letterSpacing: 0.6, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
                  </div>
                  <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.5, color: t.value === DASH ? T.quiet : T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.value}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.25, color: meta.hue, overflow: 'hidden' }}>{t.caption}</span>
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* ── Engine ── */}
        <div style={{ ...band(26), gap: 10 }}>
          <Kicker>Motor</Kicker>
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            {vm.engine.map((f) => <FactCell key={f.label} f={f} />)}
          </div>
        </div>

        {/* ── Rhythm ── */}
        <div style={{ ...band(26), gap: 10 }}>
          <Kicker>Rhythmus</Kicker>
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, padding: '13px 12px 14px', borderRadius: 18, background: T.surface, border: `1px solid ${T.rule}` }}>
              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                <Flame size={14} color={vm.streak.value === DASH ? T.quiet : T.acid} style={{ flex: 'none' }} />
                <span style={{ minWidth: 0, fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.streak.label}</span>
              </div>
              <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.7, color: vm.streak.value === DASH ? T.quiet : T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.streak.value}</span>
              <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.3, color: T.quiet }}>{vm.streak.caption}</span>
            </div>
            <button onClick={onBadges} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, padding: '13px 12px 14px', borderRadius: 18, background: T.surface, border: `1px solid ${T.rule}`, fontFamily: FONT, textAlign: 'left', cursor: onBadges ? 'pointer' : 'default' }}>
              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                <Medal size={14} color={T.mid} style={{ flex: 'none' }} />
                <span style={{ minWidth: 0, fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.badges.label}</span>
              </div>
              <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.7, color: vm.badges.value === DASH ? T.quiet : T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.badges.value}</span>
              <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.3, color: T.quiet }}>{vm.badges.caption}</span>
            </button>
          </div>
        </div>

        {/* ── RideCoin: the real wallet + the next shop tier ── */}
        <div style={{ ...band(26), gap: 10 }}>
          <Kicker>RideCoin</Kicker>
          <div style={{ ...card(), gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, color: vm.coin.balance === DASH ? T.quiet : T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.coin.balance}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.coin.foot}</span>
              </div>
              {/* The RideCoin mark itself, not a grey outline of two discs in a
                  grey circle. This is the app's main balance surface, so it is
                  where the currency should look like it's worth having. */}
              <div style={{ flex: 'none', width: 44, height: 44, borderRadius: 100, background: T.surface2, display: 'grid', placeItems: 'center' }}><W3Coin size={26} /></div>
            </div>
            <div style={{ display: 'flex', gap: 2, height: 12 }}>
              {Array.from({ length: SEG }).map((_, i) => (
                <motion.div key={i} initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={grow(i * 0.015)}
                  style={{ flex: 1, height: i < litSeg ? 12 : 6, alignSelf: 'flex-end', transformOrigin: 'bottom', borderRadius: 2, background: i < litSeg ? T.acid : T.rule }} />
              ))}
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: T.acid, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.coin.note}</span>
          </div>
        </div>

        {/* ── Referral: one quiet row, not a pitch ── */}
        {vm.referral && (
          <div style={{ ...band(26) }}>
            <button onClick={onReferral} style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', padding: '14px 16px', borderRadius: 18, background: T.surface, border: `1px solid ${T.rule}`, fontFamily: FONT, textAlign: 'left', cursor: onReferral ? 'pointer' : 'default' }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.6, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.referral.code}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.referral.note}</span>
              </div>
              <ChevronRight size={17} color={T.quiet} style={{ flex: 'none' }} />
            </button>
          </div>
        )}

        {/* ── Connected: real device state ── */}
        <div style={{ ...band(30), gap: 10 }}>
          <Kicker>Verbunden</Kicker>
          <div style={{ padding: '4px 18px 8px', borderRadius: 22, background: T.surface }}>
            {vm.devices.map((d, i) => {
              const Ic = DEV_ICONS[d.icon]
              return (
                <div key={d.name} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 0', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                  <div style={{ flex: 'none', width: 32, height: 32, borderRadius: 100, background: d.on ? T.acidDim : '#FFFFFF0F', display: 'grid', placeItems: 'center' }}><Ic size={15} color={d.on ? T.acid : T.quiet} /></div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: d.on ? T.ink : T.mid, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.sub}</span>
                  </div>
                  <div style={{ flex: 'none', width: 40, height: 23, borderRadius: 100, background: d.on ? T.acid : '#FFFFFF14', display: 'flex', alignItems: 'center', justifyContent: d.on ? 'flex-end' : 'flex-start', padding: '0 3px' }}>
                    <div style={{ width: 17, height: 17, borderRadius: 100, background: d.on ? T.bg : '#FFFFFF59' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <W3TabBar />
      </div>
    </div>
  )
}
