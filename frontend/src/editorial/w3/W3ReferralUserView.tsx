import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Sparkles, Route as RouteIcon, Bike, Clock } from 'lucide-react'
import { T, FONT } from './w3tokens'
import './w3.css'

/**
 * W3 · 11/12 REFERRAL USER DETAIL — 1:1 with pen `Z2ryuL` (pending) and
 * `KQmzp` (period ended). One screen, two states, the promise/receipt language:
 * a running 30-day window shows a violet "Your Reward" with a live countdown;
 * once it ends the button turns lime "Total earned" and (if unclaimed) claims.
 * All stats are the referred rider's real training.
 */

const VIOLET = T.evening

export interface W3ReferralUserVm {
  handle: string
  avatarUrl: string | null
  powerClaimed: string       // "126K"
  totalDistance: string      // "140.22 km"
  totalRides: string         // "16"
  rewardLabel: string        // "12.6k"
  ended: boolean
  claimed: boolean
  timeLeftLabel: string      // "16d 12h 33m"
}

export default function W3ReferralUserView({ vm, onBack, onClaim }: {
  vm: W3ReferralUserVm; onBack?: () => void; onClaim?: () => void
}) {
  const reduce = useReducedMotion()
  const accent = vm.ended ? T.acid : VIOLET
  const stats: { icon: typeof Sparkles; label: string; value: string }[] = [
    { icon: Sparkles, label: 'POWER EINGELÖST', value: vm.powerClaimed },
    { icon: RouteIcon, label: 'GESAMTDISTANZ', value: vm.totalDistance },
    { icon: Bike, label: 'FAHRTEN GESAMT', value: vm.totalRides },
  ]

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, background: '#151516', position: 'relative' }}>
        {/* Full-bleed avatar hero */}
        <div style={{ position: 'absolute', inset: 0, height: '76%' }}>
          {vm.avatarUrl
            ? <img src={vm.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: '100%', background: `radial-gradient(120% 80% at 50% 20%, ${accent}55, #151516 70%)` }} />}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, #151516 4%, #15151600 46%)' }} />
        </div>

        {/* Back */}
        <div style={{ position: 'relative', padding: '10px 20px 0' }}>
          <div style={{ height: 'max(12px, env(safe-area-inset-top))' }} />
          <button onClick={onBack} aria-label="Zurück" style={{ width: 44, height: 44, borderRadius: 100, background: '#fff', border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><ArrowLeft size={19} color="#000" /></button>
        </div>

        {/* Bottom content */}
        <div style={{ position: 'relative', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 16, padding: '0 20px calc(24px + env(safe-area-inset-bottom))' }}>
          <motion.span initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ alignSelf: 'center', padding: '10px 22px', borderRadius: 100, background: '#0B0B0BE0', fontSize: 20, fontWeight: 700, color: T.ink }}>{vm.handle}</motion.span>

          <div style={{ display: 'flex', gap: 8 }}>
            {stats.map((s, i) => (
              <motion.div key={s.label} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}
                style={{ flex: 1, minWidth: 0, padding: '16px 12px', borderRadius: 18, background: '#232427', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <s.icon size={20} color={T.acid} />
                <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.8, color: T.quiet }}>{s.label}</span>
                <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.5, color: T.ink }}>{s.value}</span>
              </motion.div>
            ))}
          </div>

          <motion.button
            onClick={vm.ended && !vm.claimed ? onClaim : undefined}
            initial={reduce ? false : { scale: 0.97 }} animate={{ scale: 1 }}
            style={{ height: 64, borderRadius: 100, border: 0, background: accent, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', cursor: vm.ended && !vm.claimed ? 'pointer' : 'default', fontFamily: FONT }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: vm.ended ? T.bg : '#fff' }}>
              {vm.claimed ? 'Eingelöst' : vm.ended ? 'Gesamt verdient' : 'Deine Belohnung'} ✱ {vm.rewardLabel}
            </span>
          </motion.button>

          {!vm.ended && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', color: VIOLET }}>
              <Clock size={15} /><span style={{ fontSize: 15, fontWeight: 700 }}>{vm.timeLeftLabel}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
