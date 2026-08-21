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
// ONE ACCENT, NOT FOUR. Each tile used to carry its own hue — violet, cyan,
// blue, amber — as a gradient wash plus a tinted border plus a coloured caption.
// Four foreign colours in a 2×2 is not a palette, it is a fruit bowl, and it
// fights the single-accent system every other screen keeps. The icon still
// distinguishes them; the colour no longer has to.
const INSIGHT_META: Record<W3InsightKey, { icon: ComponentType<{ size?: number; color?: string }> }> = {
  elevation: { icon: Mountain },
  longest: { icon: RouteIcon },
  speed: { icon: Gauge },
  burned: { icon: Flame },
}
const DASH = '—'
const SEG = 24
/** The level meter's steps. Twenty-two, the same as readiness and the season
 *  meter — three screens showing a share three different ways was the problem. */
const LVL_SEG = 22

/** One value + kicker + caption, on surface. The page's whole rhythm. */
function FactCell({ f, flex = 1 }: { f: W3Fact; flex?: number }) {
  return (
    <div style={{ flex, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, padding: '13px 12px 14px', borderRadius: 20, background: T.tile }}>
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

        {/* ── THE RIDER STANDS IN A ROOM ──────────────────────────────────
             This was a 306 px cover with the figure cropped at the shoulders,
             then fourteen equally-weighted tiles stacked under it with no air
             between them. Today's hero is the standard on this app and its
             argument is simple: ONE subject, full height, with a single flat
             panel floating over the floor carrying the answer. The rider gets
             the same room the bike gets — they are the other thing this app is
             about, and a profile that opens on a wall of boxes says the numbers
             matter more than the person. ── */}
        <div style={{
          position: 'relative',
          height: 'calc(100dvh - 92px - env(safe-area-inset-bottom))',
          display: 'flex', flexDirection: 'column',
          background: T.heroBg, overflow: 'hidden',
        }}>
          {/* The bloom the figure stands in — the same warm lift Today's stage
              uses, so the two rooms are lit by one lamp. */}
          <div aria-hidden style={{
            position: 'absolute', top: '4%', left: '50%', transform: 'translateX(-50%)',
            width: '92%', height: '58%', borderRadius: '50%',
            background: `radial-gradient(closest-side, ${T.acid}1F, transparent)`,
          }} />

          {vm.avatarUrl ? (
            <motion.img src={vm.avatarUrl} alt="Dein Fahrer"
              initial={reduce ? false : { opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: EASE }}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                // Sits the figure ON the floor line rather than centring it in
                // the box, which is what left it cropped at the shoulders.
                objectFit: 'cover', objectPosition: 'center 22%',
              }} />
          ) : (
            /* The empty seat. Never someone else's showcase rider on a page
               whose whole job is to say who YOU are. */
            <button onClick={onCreateRider} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'transparent', border: 0, fontFamily: FONT, cursor: onCreateRider ? 'pointer' : 'default' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', paddingBottom: 120 }}>
                <div style={{ width: 108, height: 108, borderRadius: 100, display: 'grid', placeItems: 'center', background: T.heroChip, border: `1.5px dashed ${T.acid}59` }}>
                  <UserRound size={46} strokeWidth={1.5} color={T.acid} />
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Noch kein Fahrer</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: T.quiet }}>Erstell deinen im Studio</span>
              </div>
            </button>
          )}

          {/* Floor scrim, so the dock has something to sit on. */}
          <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 300, pointerEvents: 'none', background: `linear-gradient(180deg, ${T.heroBg}00, ${T.heroBg}CC 55%, ${T.heroBg})` }} />

          <div style={{ position: 'relative', zIndex: 2, padding: 'max(14px, env(safe-area-inset-top)) 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ minWidth: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: 1.4, color: T.ink, padding: '8px 13px', borderRadius: 100, background: T.heroChip, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>BIKER</span>
            <div style={{ flex: 'none' }}><W3NavMenu /></div>
          </div>

          {/* ── THE DOCK: who you are, in one panel ────────────────────────
               Name, handle, level and the identity chips were four separate
               devices stacked in sixty pixels — a pill, a heading, a chip row
               and a progress bar, each announcing itself. One panel, the way
               readiness is one panel. ── */}
          <div style={{ position: 'relative', zIndex: 2, marginTop: 'auto', padding: '10px 16px 18px' }}>
            <div style={{ width: '100%', background: T.heroDock, borderRadius: 28, padding: '15px 17px 16px', display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONT }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', minWidth: 0 }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: -1, lineHeight: 1.05, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vm.name}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: T.heroMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vm.handle}</span>
                </div>
                {vm.ready ? (
                  <motion.div
                    initial={reduce ? false : { scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4, ease: EASE }}
                    style={{ flex: 'none', display: 'flex', gap: 6, alignItems: 'center', padding: '7px 13px', borderRadius: 100, background: T.acid }}>
                    <Sparkles size={12} color={T.heroInk} style={{ flex: 'none' }} />
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.9, color: T.heroInk, whiteSpace: 'nowrap' }}>
                      LVL {vm.level}
                    </span>
                  </motion.div>
                ) : (
                  /* Same shape, no claim: the level is only true once the rides
                     and the wallet have answered. */
                  <div style={{ flex: 'none', display: 'flex', gap: 6, alignItems: 'center', padding: '7px 13px', borderRadius: 100, background: T.heroChip }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: T.heroMid }}>···</span>
                  </div>
                )}
              </div>

              {/* The level meter, segmented — the same twenty-two steps as
                  readiness and the season. Three screens, one way of showing a
                  share. */}
              <div style={{ display: 'flex', gap: 3, width: '100%', height: 9 }}>
                {Array.from({ length: LVL_SEG }, (_, i) => {
                  const lit = i < Math.round(Math.max(0, Math.min(1, vm.levelPct)) * LVL_SEG)
                  return (
                    <motion.span key={i}
                      initial={reduce ? false : { opacity: 0, scaleY: 0.4 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      transition={{ duration: 0.3, delay: reduce ? 0 : 0.12 + i * 0.012 }}
                      style={{
                        flex: 1, borderRadius: 2, transformOrigin: 'bottom',
                        background: lit
                          ? `linear-gradient(180deg, ${T.acidLite} 0%, ${T.acid} 55%, ${T.acidDeep} 100%)`
                          : T.heroOff,
                      }} />
                  )
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ minWidth: 0, display: 'flex', gap: 6, overflow: 'hidden' }}>
                  {vm.chips.slice(0, 3).map((c) => (
                    <span key={c} style={{ flex: 'none', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.heroMid, padding: '5px 10px', borderRadius: 100, background: T.heroChip, whiteSpace: 'nowrap' }}>{c}</span>
                  ))}
                </span>
                <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 600, color: T.heroMid, whiteSpace: 'nowrap' }}>{vm.levelNote}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Lifetime ── */}
        <div style={{ ...band(34), gap: 13 }}>
          <Kicker>Gesamt</Kicker>

          {/* The headline: the distance, made human. */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 16px', borderRadius: 22, background: T.tile }}>
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
          <div style={{ display: 'flex', width: '100%', borderRadius: 20, background: T.tile, overflow: 'hidden' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%' }}>
            {vm.insights.map((t, i) => {
              const meta = INSIGHT_META[t.key]; const Ic = meta.icon
              return (
                <motion.div key={t.key}
                  initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={grow(0.06 * i)}
                  style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7, padding: '15px 15px 16px', borderRadius: 20, background: T.tile }}>
                  <span style={{ flex: 'none', width: 28, height: 28, borderRadius: 100, background: T.acidDim, display: 'grid', placeItems: 'center' }}><Ic size={14} color={T.acid} /></span>
                  <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.6, color: t.value === DASH ? T.quiet : T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.value}</span>
                  <span style={{ minWidth: 0, fontSize: 8, fontWeight: 700, letterSpacing: 0.9, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.3, color: T.mid, overflow: 'hidden' }}>{t.caption}</span>
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* ── Engine ── */}
        <div style={{ ...band(34), gap: 13 }}>
          <Kicker>Motor</Kicker>
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            {vm.engine.map((f) => <FactCell key={f.label} f={f} />)}
          </div>
        </div>

        {/* ── Rhythm ── */}
        <div style={{ ...band(34), gap: 13 }}>
          <Kicker>Rhythmus</Kicker>
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, padding: '13px 12px 14px', borderRadius: 20, background: T.tile }}>
              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                <Flame size={14} color={vm.streak.value === DASH ? T.quiet : T.acid} style={{ flex: 'none' }} />
                <span style={{ minWidth: 0, fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.streak.label}</span>
              </div>
              <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.7, color: vm.streak.value === DASH ? T.quiet : T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.streak.value}</span>
              <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.3, color: T.quiet }}>{vm.streak.caption}</span>
            </div>
            <button onClick={onBadges} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, padding: '13px 12px 14px', borderRadius: 20, background: T.tile, fontFamily: FONT, textAlign: 'left', cursor: onBadges ? 'pointer' : 'default' }}>
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
        <div style={{ ...band(34), gap: 13 }}>
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
            <button onClick={onReferral} style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', padding: '14px 16px', borderRadius: 20, background: T.tile, fontFamily: FONT, textAlign: 'left', cursor: onReferral ? 'pointer' : 'default' }}>
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
