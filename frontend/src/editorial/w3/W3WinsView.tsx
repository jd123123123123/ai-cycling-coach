import { motion, useReducedMotion } from 'motion/react'
import type { ComponentType } from 'react'
import {
  Flame, MoreHorizontal, Plus, Medal, Mountain, Sunrise, Lock,
} from 'lucide-react'
import { T, FONT, grow, band } from './w3tokens'
import W3TabBar from './W3TabBar'
import W3StatusBar from './W3StatusBar'
import W3NavMenu from './W3NavMenu'
import './w3.css'

/**
 * W3 · 04 WINS ("Wins") — 1:1 code rebuild of the `w3.pen` Wins frame. Pure
 * function of `vm`; `W3WinsPage` builds it from `usePowerProfileView`.
 *
 * REAL: the Personal records watts come from the athlete's own mean-max curve
 * ("Every badge here is a training outcome. Nothing is bought."). FIXTURE: the
 * whole reward economy — challenges, POWER numbers, community pools, badges and
 * the "how far past your old best" deltas — is the unbuilt reward layer, marked
 * in the Page. The record→acid highlight and the earned/locked badge split are
 * real mechanics so the surface reads honestly.
 */

export interface W3Hero {
  title: string
  daysLeft: string
  body: string
  lit: number
  total: number
  progressLabel: string
  reward: string
}
export interface W3Challenge { key: string; title: string; reward: string; sub: string; fill: number; custom?: boolean }
export interface W3Record { key: string; label: string; value: string; note: string; past: number; best: boolean }
export interface W3CommunityHero { title: string; pct: string; sub: string; foot: string; fill: number }
export interface W3Community { key: string; title: string; pct: string; sub: string; you: string; fill: number }
export interface W3Badge { key: string; icon: 'medal' | 'mountain' | 'sunrise' | 'lock'; name: string; caption: string; earned: boolean }

export interface W3WinsVm {
  title: string
  subtitle: string
  balance: string | null   // REAL: RideCoin wallet balance (null until loaded)
  challengesHeader: string
  challengesSub: string
  challengesChip: string
  hero: W3Hero
  personalHeader: string
  personalSub: string
  challenges: W3Challenge[]
  newChallengeLabel: string
  recordsHeader: string
  recordsSub: string
  records: W3Record[]
  communityHeader: string
  communitySub: string
  communityChip: string
  communityHero: W3CommunityHero
  community: W3Community[]
  badgesHeader: string
  badgesCount: string
  badges: W3Badge[]
}

const BADGE_ICON: Record<W3Badge['icon'], ComponentType<{ size?: number; color?: string }>> = { medal: Medal, mountain: Mountain, sunrise: Sunrise, lock: Lock }
const OCTAGON = 'polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%)'

/** Segmented gauge — the pen's reward bar. Lit segments = acid full height,
 *  unlit = short T.rule stubs; grows on scroll into view. */
function SegGauge({ lit, total, reduce, litH = 10, unlitH = 5, delay = 0 }: { lit: number; total: number; reduce: boolean | null; litH?: number; unlitH?: number; delay?: number }) {
  return (
    <div style={{ display: 'flex', gap: 3, height: litH, alignItems: 'center', width: '100%' }}>
      {Array.from({ length: total }).map((_, i) => (
        <motion.div key={i} initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={grow(delay + i * 0.015)}
          style={{ flex: 1, height: i < lit ? litH : unlitH, alignSelf: 'center', transformOrigin: 'center', borderRadius: 1, background: i < lit ? T.acid : T.rule }} />
      ))}
    </div>
  )
}

/** Continuous rounded bar — the community pools read as one flowing total. */
function Bar({ fill, reduce, delay = 0 }: { fill: number; reduce: boolean | null; delay?: number }) {
  return (
    <div style={{ height: 5, borderRadius: 100, background: '#FFFFFF14', overflow: 'hidden' }}>
      <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.round(fill * 100)}%` }} transition={grow(delay)}
        style={{ height: '100%', borderRadius: 100, background: T.acid }} />
    </div>
  )
}

const SectionHead = ({ title, sub, chip, count }: { title: string; sub?: string; chip?: string; count?: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>{title}</span>
      {sub && <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>{sub}</span>}
    </div>
    {chip && <span style={{ flex: 'none', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.acid, padding: '6px 11px', borderRadius: 100, background: T.acidDim }}>{chip}</span>}
    {count && <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 700, color: T.mid, paddingTop: 3 }}>{count}</span>}
  </div>
)

export default function W3WinsView({ vm, onNewChallenge, onEditChallenge }: { vm: W3WinsVm; onNewChallenge?: () => void; onEditChallenge?: (key: string) => void }) {
  const reduce = useReducedMotion()

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>

        {/* StatusBar */}
        <W3StatusBar />

        {/* Title */}
        <div style={{ ...band(0), padding: '14px 20px 22px', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1.05, color: T.ink }}>{vm.title}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 'none' }}>
              {vm.balance != null && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, padding: '8px 13px', borderRadius: 14, background: T.acidDim, marginTop: 2 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5, color: T.acid, fontVariantNumeric: 'tabular-nums' }}>{vm.balance}</span>
                  <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 1, color: T.acid, opacity: 0.7 }}>RIDECOIN</span>
                </div>
              )}
              <W3NavMenu />
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: T.quiet }}>{vm.subtitle}</span>
        </div>

        {/* Your challenges → hero */}
        <div style={{ ...band(28), gap: 14 }}>
          <SectionHead title={vm.challengesHeader} sub={vm.challengesSub} chip={vm.challengesChip} />
          <div style={{ borderRadius: 24, background: `linear-gradient(180deg, #1b1c19, ${T.surface})`, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: `1px solid ${T.rule}` }}>
            <div style={{ height: 176, position: 'relative', display: 'grid', placeItems: 'center', background: `radial-gradient(circle at 50% 44%, ${T.acid}33, ${T.acid}0d 42%, transparent 66%)` }}>
              {/* pulsing radiant glow behind the emblem */}
              <motion.div
                animate={reduce ? undefined : { scale: [1, 1.12, 1], opacity: [0.5, 0.75, 0.5] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                style={{ position: 'absolute', width: 150, height: 150, background: T.acid, clipPath: OCTAGON, filter: 'blur(34px)', opacity: 0.5 }} />
              <div style={{ width: 104, height: 104, position: 'relative', display: 'grid', placeItems: 'center' }}>
                {/* outer acid ring */}
                <div style={{ position: 'absolute', inset: -8, clipPath: OCTAGON, background: `${T.acid}2e` }} />
                <div style={{ position: 'absolute', width: 104, height: 104, background: T.acid, clipPath: OCTAGON, filter: 'blur(16px)', opacity: 0.65 }} />
                <div style={{ position: 'absolute', inset: 0, clipPath: OCTAGON, background: `linear-gradient(155deg, #dbff5a, ${T.acid} 45%, ${T.acidDeep})` }} />
                {/* glossy top highlight */}
                <div style={{ position: 'absolute', top: 6, left: 14, right: 30, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,.4)', filter: 'blur(6px)' }} />
                <Flame size={44} color={T.bg} style={{ position: 'relative' }} />
              </div>
            </div>
            <div style={{ padding: '4px 20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>{vm.hero.title}</span>
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: T.acid, padding: '5px 10px', borderRadius: 100, background: T.acidDim }}>{vm.hero.daysLeft}</span>
                <div style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 100, background: T.surface2, display: 'grid', placeItems: 'center' }}><MoreHorizontal size={16} color={T.mid} /></div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.45, color: T.mid }}>{vm.hero.body}</span>
              <SegGauge lit={vm.hero.lit} total={vm.hero.total} reduce={reduce} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{vm.hero.progressLabel}</span>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, color: T.acid }}>{vm.hero.reward}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Personal challenges */}
        <div style={{ ...band(28), gap: 14 }}>
          <SectionHead title={vm.personalHeader} sub={vm.personalSub} />
          <div style={{ padding: '4px 18px 8px', borderRadius: 24, background: T.surface, display: 'flex', flexDirection: 'column' }}>
            {vm.challenges.map((c, i) => (
              <div key={c.key} style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '16px 0', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2, color: T.ink }}>{c.title}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: T.acid }}>{c.reward}</span>
                  {c.custom
                    ? <button onClick={() => onEditChallenge?.(c.key)} aria-label="Challenge bearbeiten" style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', display: 'grid', placeItems: 'center' }}><MoreHorizontal size={16} color={T.mid} /></button>
                    : <MoreHorizontal size={16} color={T.quiet} />}
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>{c.sub}</span>
                <SegGauge lit={Math.round(c.fill * 20)} total={20} reduce={reduce} delay={i * 0.03} />
              </div>
            ))}
            <button onClick={onNewChallenge} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0 12px', borderTop: `1px solid ${T.rule}`, background: 'transparent', border: 0, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: T.rule, fontFamily: FONT, cursor: 'pointer', color: T.acid, textAlign: 'left' }}>
              <Plus size={16} color={T.acid} strokeWidth={2.5} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: T.acid }}>{vm.newChallengeLabel}</span>
            </button>
          </div>
        </div>

        {/* Personal records */}
        <div style={{ ...band(28), gap: 14 }}>
          <SectionHead title={vm.recordsHeader} sub={vm.recordsSub} />
          <div style={{ padding: '4px 18px 10px', borderRadius: 22, background: T.surface, display: 'flex', flexDirection: 'column' }}>
            {vm.records.map((r, i) => (
              <div key={r.key} style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '14px 0', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ width: 44, flex: 'none', fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: T.quiet }}>{r.label}</span>
                  <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.7, color: r.best ? T.acid : T.ink }}>{r.value}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: r.best ? T.acid : T.quiet }}>{r.note}</span>
                </div>
                <SegGauge lit={r.best ? 20 : Math.max(1, Math.round(r.past * 20))} total={20} reduce={reduce} delay={i * 0.03} />
              </div>
            ))}
          </div>
        </div>

        {/* Community challenges */}
        <div style={{ ...band(28), gap: 14 }}>
          <SectionHead title={vm.communityHeader} sub={vm.communitySub} chip={vm.communityChip} />
          <div style={{ borderRadius: 24, background: T.surface, overflow: 'hidden' }}>
            <div style={{ position: 'relative', minHeight: 210, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 18, background: 'linear-gradient(160deg, #2A3340 0%, #1B2330 42%, #14181F 100%)' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, #0B0B0BCC 100%)' }} />
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.8, color: T.ink }}>{vm.communityHero.title}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1.4, color: T.acid, lineHeight: 1 }}>{vm.communityHero.pct}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: T.mid }}>{vm.communityHero.sub}</span>
                </div>
                <Bar fill={vm.communityHero.fill} reduce={reduce} />
                <span style={{ fontSize: 10.5, fontWeight: 600, color: T.mid }}>{vm.communityHero.foot}</span>
              </div>
            </div>
          </div>
          <div style={{ padding: '6px 18px 10px', borderRadius: 24, background: T.surface, display: 'flex', flexDirection: 'column' }}>
            {vm.community.map((c, i) => (
              <div key={c.key} style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '15px 0', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2, color: T.ink }}>{c.title}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700, letterSpacing: -0.3, color: T.acid }}>{c.pct}</span>
                </div>
                <Bar fill={c.fill} reduce={reduce} delay={i * 0.03} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>{c.sub}</span>
                  <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6, color: T.mid }}>{c.you}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Badges */}
        <div style={{ ...band(30), gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>{vm.badgesHeader}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: T.mid }}>{vm.badgesCount}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {vm.badges.map((b) => {
              const Ic = BADGE_ICON[b.earned ? b.icon : 'lock']
              return (
                <div key={b.key} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 10px 14px', alignItems: 'center', borderRadius: 20, background: b.earned ? `linear-gradient(180deg, #1b1c19, ${T.surface})` : T.surface, border: `1px solid ${b.earned ? T.acid + '26' : T.rule}` }}>
                  <div style={{ width: 52, height: 52, position: 'relative', display: 'grid', placeItems: 'center' }}>
                    {b.earned && <div style={{ position: 'absolute', width: 60, height: 60, background: T.acid, clipPath: OCTAGON, filter: 'blur(15px)', opacity: 0.5 }} />}
                    <div style={{ position: 'absolute', inset: 0, clipPath: OCTAGON, background: b.earned ? `linear-gradient(155deg, #dbff5a, ${T.acid} 48%, ${T.acidDeep})` : '#FFFFFF0F' }} />
                    {b.earned && <div style={{ position: 'absolute', top: 4, left: 8, right: 16, height: 13, borderRadius: '50%', background: 'rgba(255,255,255,.4)', filter: 'blur(3px)' }} />}
                    <Ic size={22} color={b.earned ? T.bg : T.quiet} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', color: b.earned ? T.ink : T.mid }}>{b.name}</span>
                    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, textAlign: 'center', color: b.earned ? T.acid : T.quiet }}>{b.caption}</span>
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
