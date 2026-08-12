import { motion, useReducedMotion } from 'motion/react'
import { Share2, Settings, Crown, Watch, Activity as ActivityIcon, Zap, HeartPulse } from 'lucide-react'
import { SHOWCASE_RIDER } from './showcaseRider'
import W3TabBar from './W3TabBar'
import { T, FONT, grow, Kicker, band, card } from './w3tokens'
import './w3.css'

/**
 * W3 · 05 BIKER (profile) — 1:1 code rebuild of `w3.pen` frame `xGJGp`. Pure
 * function of `vm`. The figurine avatar is the hero. Season stats, FTP/W·kg
 * are REAL from the athlete/season data; the tier/POWER progress, referrals
 * and the connected-device sync labels are the reward layer / device state
 * (fixtures where a backend field doesn't exist yet, marked in the Page).
 */

export interface W3StatCard { v: string; l: string; s: string }
export interface W3Device { name: string; sub: string; icon: 'watch' | 'activity' | 'zap' | 'heart'; on: boolean }
export interface W3BikerVm {
  avatarUrl: string | null
  handle: string
  tierChip: string; sinceChip: string; locationChip: string
  name: string
  stats: W3StatCard[]           // 4 (real: season km, climbed, FTP, W/kg)
  tierFrom: string; tierTo: string; tierPct: number; tierFoot: string; tierRate: string   // fixture (POWER)
  referralCode: string; referralBody: string; referralActive: string                       // fixture
  devices: W3Device[]           // real connection state
}

const DEV_ICONS = { watch: Watch, activity: ActivityIcon, zap: Zap, heart: HeartPulse }

export default function W3BikerView({ vm, onBack }: { vm: W3BikerVm; onBack?: () => void }) {
  const reduce = useReducedMotion()
  const avatar = vm.avatarUrl ?? SHOWCASE_RIDER
  const SEG = 24, litSeg = Math.round((vm.tierPct / 100) * SEG)

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <div style={{ height: 44, padding: '0 22px', display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 700, color: T.ink }}>9:41</div>

        {/* Nav */}
        <div style={{ padding: '0 20px', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: T.quiet }}>Biker</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onBack} aria-label="Share" style={{ width: 40, height: 40, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Share2 size={16} color={T.ink} /></button>
            <button aria-label="Settings" style={{ width: 40, height: 40, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Settings size={16} color={T.ink} /></button>
          </div>
        </div>

        {/* Avatar hero card + identity */}
        <div style={{ ...band(26), gap: 18 }}>
          <div style={{ position: 'relative', width: '100%', height: 326, borderRadius: 28, overflow: 'hidden', background: '#232427' }}>
            <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 28%' }} />
            <div style={{ position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)', display: 'flex', gap: 7, alignItems: 'center', padding: '8px 14px 8px 10px', borderRadius: 100, background: '#0B0B0BE6' }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: T.acid }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{vm.handle}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.acid, padding: '6px 11px', borderRadius: 100, background: T.acidDim }}>{vm.tierChip}</span>
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.mid, padding: '6px 11px', borderRadius: 100, background: T.rule }}>{vm.sinceChip}</span>
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.mid, padding: '6px 11px', borderRadius: 100, background: T.rule }}>{vm.locationChip}</span>
            </div>
            <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1.1, color: T.ink }}>{vm.name}</span>
          </div>
        </div>

        {/* Season stats */}
        <div style={{ ...band(26), gap: 8 }}>
          {[[0, 1], [2, 3]].map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 8 }}>
              {row.map((i) => {
                const s = vm.stats[i]
                return (
                  <div key={i} style={{ flex: 1, padding: '16px 16px 17px', borderRadius: 20, background: T.surface, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.9, color: s.v === '—' ? T.quiet : T.ink }}>{s.v}</span>
                    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: T.quiet }}>{s.l}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: T.acid }}>{s.s}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Next tier (fixture: POWER) */}
        <div style={band(26)}>
          <div style={{ ...card(), gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Kicker>Next tier</Kicker>
                <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>{vm.tierFrom} → {vm.tierTo}</span>
              </div>
              <div style={{ width: 44, height: 44, borderRadius: 100, background: T.surface2, display: 'grid', placeItems: 'center' }}><Crown size={20} color={T.mid} /></div>
            </div>
            <div style={{ display: 'flex', gap: 2, height: 12 }}>
              {Array.from({ length: SEG }).map((_, i) => (
                <motion.div key={i} initial={reduce ? false : { scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true, amount: 0.6 }} transition={grow(i * 0.015)}
                  style={{ flex: 1, height: i < litSeg ? 12 : 6, alignSelf: 'flex-end', transformOrigin: 'bottom', borderRadius: 2, background: i < litSeg ? T.acid : T.rule }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.mid }}>{vm.tierFoot}</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: T.acid }}>{vm.tierRate}</span>
            </div>
          </div>
        </div>

        {/* Referrals (fixture) */}
        <div style={{ ...band(26), gap: 12 }}>
          <Kicker>Referrals</Kicker>
          <div style={{ ...card(), gap: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.45, color: T.mid }}>{vm.referralBody}</span>
            <div style={{ height: 52, borderRadius: 100, background: '#FFFFFF0F', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 0 18px' }}>
              <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: 2.5, color: T.ink }}>{vm.referralCode}</span>
              <div style={{ height: 38, borderRadius: 100, background: T.acid, display: 'flex', gap: 7, alignItems: 'center', padding: '0 16px' }}>
                <Share2 size={14} color={T.bg} /><span style={{ fontSize: 12.5, fontWeight: 700, color: T.bg }}>Share</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingTop: 14, borderTop: `1px solid ${T.rule}` }}>
              <div style={{ display: 'flex' }}>
                {['#B9A7EE', '#A7D8EE', '#EEC7A7'].map((c, i) => <div key={i} style={{ width: 28, height: 28, borderRadius: 100, background: c, marginLeft: i ? -8 : 0, border: `2px solid ${T.surface}` }} />)}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.mid }}>{vm.referralActive}</span>
            </div>
          </div>
        </div>

        {/* Connected devices (real state) */}
        <div style={{ ...band(30), gap: 12 }}>
          <Kicker>Connected</Kicker>
          <div style={{ padding: '4px 18px 8px', borderRadius: 22, background: T.surface }}>
            {vm.devices.map((d, i) => {
              const Ic = DEV_ICONS[d.icon]
              return (
                <div key={d.name} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 0', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                  <div style={{ width: 32, height: 32, borderRadius: 100, background: d.on ? T.acidDim : '#FFFFFF0F', display: 'grid', placeItems: 'center', flex: 'none' }}><Ic size={15} color={d.on ? T.acid : T.quiet} /></div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: d.on ? T.ink : T.mid }}>{d.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>{d.sub}</span>
                  </div>
                  <div style={{ width: 40, height: 23, borderRadius: 100, background: d.on ? T.acid : '#FFFFFF14', display: 'flex', alignItems: 'center', justifyContent: d.on ? 'flex-end' : 'flex-start', padding: '0 3px' }}>
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
