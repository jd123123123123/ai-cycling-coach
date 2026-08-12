import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowLeft, History, Flame, Zap, Sunrise, Mountain, Repeat, Info,
} from 'lucide-react'
import { T, FONT, grow, band, Kicker } from './w3tokens'
import W3TabBar from './W3TabBar'
import './w3.css'
import W3StatusBar from './W3StatusBar'

/**
 * W3 · 08 CHALLENGES ("Challenges") — 1:1 code rebuild of the `w3.pen`
 * frame `VsLYE`. Pure function of `vm`; `W3ChallengesPage` builds it.
 *
 * The whole surface is a DESIGN FIXTURE — the reward economy (POWER payouts),
 * the monthly personal challenge (Hot Streak), the global community challenges
 * with cover art + "top X%", and the open-to-join catalogue are not built in
 * the backend. The real seam is `useCrewChallenges()` (crew-scoped goals with
 * per-member pct), which has no reward/cover/monthly concept to map onto here.
 * Community cover images are asset-free CSS-gradient stand-ins for the pen's
 * photographic fills.
 */

export interface W3MonthlyChallenge {
  name: string
  daysLeftLabel: string
  blurb: string
  done: number
  total: number
  progressLabel: string
  reward: string
}
export interface W3CommunityChallenge {
  key: string
  title: string
  cover: string          // CSS background (gradient stand-in for a photo)
  pct: number            // 0–100
  progressNote: string
  youNote: string
}
export interface W3OpenChallenge {
  key: string
  title: string
  blurb: string
  reward: string
  icon: 'zap' | 'sunrise' | 'mountain' | 'repeat'
  accent?: boolean
}

export interface W3ChallengesVm {
  title: string
  subtitle: string
  monthlyKicker: string
  monthlyStatus: string
  monthly: W3MonthlyChallenge
  communityKicker: string
  community: W3CommunityChallenge[]
  openKicker: string
  open: W3OpenChallenge[]
  footnote: string
}

const OPEN_ICON = { zap: Zap, sunrise: Sunrise, mountain: Mountain, repeat: Repeat } as const

/** Scalloped acid badge (the pen's monthly-challenge seal). */
function sealPath(bumps: number, R: number, C: number) {
  const pts: [number, number][] = []
  for (let i = 0; i < bumps; i++) {
    const a = (i / bumps) * Math.PI * 2 - Math.PI / 2
    pts.push([C + Math.cos(a) * R, C + Math.sin(a) * R])
  }
  const arcR = R * 0.58
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 1; i <= bumps; i++) {
    const p = pts[i % bumps]
    d += ` A ${arcR.toFixed(1)} ${arcR.toFixed(1)} 0 0 1 ${p[0].toFixed(1)} ${p[1].toFixed(1)}`
  }
  return d + ' Z'
}
const SEAL = sealPath(11, 46, 60)

export default function W3ChallengesView({ vm, onJoin }: { vm: W3ChallengesVm; onJoin?: (key: string) => void }) {
  const reduce = useReducedMotion()
  const m = vm.monthly
  const segs = Array.from({ length: m.total }, (_, i) => i < m.done)

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>

        {/* StatusBar */}
        <W3StatusBar />

        {/* Header nav */}
        <div style={{ ...band(0), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 6 }}>
          <button style={{ width: 40, height: 40, borderRadius: 100, border: 0, background: T.surface, display: 'grid', placeItems: 'center', cursor: 'pointer' }} aria-label="Back">
            <ArrowLeft size={18} color={T.ink} />
          </button>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: T.quiet }}>Challenges</span>
          <button style={{ width: 40, height: 40, borderRadius: 100, border: 0, background: T.surface, display: 'grid', placeItems: 'center', cursor: 'pointer' }} aria-label="History">
            <History size={18} color={T.mid} />
          </button>
        </div>

        {/* Title */}
        <div style={{ ...band(0), padding: '10px 20px 20px', gap: 10 }}>
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1.05, color: T.ink }}>{vm.title}</span>
          <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: T.quiet }}>{vm.subtitle}</span>
        </div>

        {/* Monthly challenge */}
        <div style={{ ...band(28), gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Kicker>{vm.monthlyKicker}</Kicker>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.acid }}>{vm.monthlyStatus}</span>
          </div>

          <div style={{ borderRadius: 24, background: '#0F0F0F', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Hero emblem */}
            <div style={{ padding: '30px 0 26px', display: 'grid', placeItems: 'center', position: 'relative' }}>
              <div style={{ position: 'absolute', width: 168, height: 168, borderRadius: '50%', background: 'radial-gradient(circle, rgba(200,255,0,0.42), rgba(200,255,0,0) 62%)', filter: 'blur(4px)' }} />
              <div style={{ position: 'relative', width: 120, height: 120, display: 'grid', placeItems: 'center' }}>
                <svg width={120} height={120} viewBox="0 0 120 120" style={{ position: 'absolute', inset: 0 }}>
                  <path d={SEAL} fill={T.acid} />
                </svg>
                <Flame size={40} color="#0B0B0B" strokeWidth={2.4} style={{ position: 'relative' }} />
              </div>
            </div>

            {/* Body panel */}
            <div style={{ background: T.surface, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>{m.name}</span>
                <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: T.acid, padding: '6px 11px', borderRadius: 100, background: '#0B0B0B' }}>{m.daysLeftLabel}</span>
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, color: T.mid }}>{m.blurb}</span>

              {/* Segmented gauge */}
              <div style={{ display: 'flex', gap: 3, alignItems: 'stretch' }}>
                {segs.map((on, i) => (
                  on ? (
                    <motion.div key={i} initial={reduce ? false : { scaleX: 0, opacity: 0 }} whileInView={{ scaleX: 1, opacity: 1 }} viewport={{ once: true, amount: 0.8 }} transition={grow(i * 0.035)}
                      style={{ flex: 1, height: 13, borderRadius: 3, background: T.acid, transformOrigin: 'left' }} />
                  ) : (
                    <div key={i} style={{ flex: 1, height: 13, borderRadius: 3, background: '#FFFFFF14' }} />
                  )
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{m.progressLabel}</span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: T.acid }}>{m.reward}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Community challenges */}
        <div style={{ ...band(28), gap: 16 }}>
          <Kicker>{vm.communityKicker}</Kicker>
          {vm.community.map((c) => (
            <div key={c.key} style={{ borderRadius: 24, background: T.surface, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Cover (gradient stand-in) */}
              <div style={{ height: 150, background: c.cover, position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(11,11,11,0) 40%, rgba(11,11,11,0.72) 100%)' }} />
                <span style={{ position: 'relative', padding: '0 20px 16px', fontSize: 26, fontWeight: 700, letterSpacing: -0.7, color: T.ink }}>{c.title}</span>
              </div>
              {/* Body */}
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1.2, color: T.acid, lineHeight: 1 }}>{c.pct}%</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.mid, textAlign: 'right' }}>{c.progressNote}</span>
                </div>
                <div style={{ height: 6, borderRadius: 100, background: '#FFFFFF0F', overflow: 'hidden' }}>
                  <motion.div initial={reduce ? false : { width: 0 }} whileInView={{ width: `${Math.max(0, Math.min(100, c.pct))}%` }} viewport={{ once: true, amount: 0.8 }} transition={grow(0.05)}
                    style={{ height: '100%', borderRadius: 100, background: T.acid }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: T.mid }}>{c.youNote}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Open to join */}
        <div style={{ ...band(24), gap: 12 }}>
          <Kicker>{vm.openKicker}</Kicker>
          <div style={{ padding: '4px 16px', borderRadius: 22, background: T.surface, display: 'flex', flexDirection: 'column' }}>
            {vm.open.map((o, i) => {
              const Ic = OPEN_ICON[o.icon]
              return (
                <button key={o.key} onClick={() => onJoin?.(o.key)} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 0', border: 0, background: 'transparent', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}`, cursor: onJoin ? 'pointer' : 'default', fontFamily: FONT, textAlign: 'left', width: '100%' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, flex: 'none', display: 'grid', placeItems: 'center', background: o.accent ? T.acid : T.surface2 }}>
                    <Ic size={20} color={o.accent ? '#0B0B0B' : T.mid} strokeWidth={2.2} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3, color: T.ink }}>{o.title}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: T.mid }}>{o.blurb}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                    <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.4, color: T.acid }}>{o.reward}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>RIDECOIN</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Footnote */}
        <div style={{ ...band(30) }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 16, borderRadius: 20, background: T.surface, border: `1px solid ${T.rule}` }}>
            <div style={{ width: 26, height: 26, borderRadius: 100, flex: 'none', display: 'grid', placeItems: 'center', background: T.surface2 }}>
              <Info size={14} color={T.mid} />
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.45, color: T.mid }}>{vm.footnote}</span>
          </div>
        </div>

        <W3TabBar />

      </div>
    </div>
  )
}
