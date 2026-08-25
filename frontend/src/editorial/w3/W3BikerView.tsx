import type { ComponentType } from 'react'
import { Watch, Activity as ActivityIcon, Zap, HeartPulse, ChevronRight, Ticket } from 'lucide-react'
import W3RiderHighlights, { type W3RiderHighlightsProps } from './W3RiderHighlights'
import W3NavMenu from './W3NavMenu'
import W3TabBar from './W3TabBar'
import { T, FONT, Kicker, band } from './w3tokens'
import './w3.css'

/**
 * W3 · 05 BIKER — the rider's profile. Route /e/w3-biker.
 *
 * ── WHY THIS FILE WAS REWRITTEN ────────────────────────────────────────
 * The screen it replaces was a level pill, seven bespoke "monuments", an engine
 * block, a streak, a coin balance, a referral code and a device list: a
 * settings page with a portrait on top. `W3RiderHighlights` was built to
 * replace exactly that — and then was never mounted anywhere but
 * `/e/w3-biker-preview`, so for a rider on the live app nothing changed. The
 * design existed, the page did not use it. This file is that wiring.
 *
 * ── WHAT SURVIVES THE CUT, AND WHY IT IS NOT ZERO ──────────────────────
 * The intent was "wallet, referral and devices are settings; a profile that
 * lists them is a profile nobody opens twice", and the bento agrees. But this
 * app has no settings screen, and the nav menu calls this route "Profil +
 * GERÄTE" — deleting the device list outright would leave a rider with a
 * disconnected Garmin no way back to it, which trades one design fault for a
 * broken feature. So they are still here, at the bottom, quiet, under their own
 * kicker: below the fold, out of the way of the portrait, and still reachable.
 * The day a settings screen exists, this tail moves there and nothing else on
 * this page changes.
 *
 * Pure function of `vm`. Every value is REAL or the card is not drawn.
 */

export interface W3Device { name: string; sub: string; icon: 'watch' | 'activity' | 'zap' | 'heart'; on: boolean }

export interface W3BikerVm {
  /** Everything the portrait, the rings and the bento need. */
  rider: Omit<W3RiderHighlightsProps, 'onAllBadges' | 'onRecord'>
  /** Real balance + real next shop tier, or null before the wallet answers. */
  coin: { balance: string; note: string } | null
  referral: { code: string; note: string } | null
  devices: W3Device[]
}

const DEV_ICONS: Record<W3Device['icon'], ComponentType<{ size?: number; color?: string }>> = {
  watch: Watch, activity: ActivityIcon, zap: Zap, heart: HeartPulse,
}

function TailRow({ children, first }: { children: React.ReactNode; first: boolean }) {
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'center', padding: '14px 0',
      borderTop: first ? 'none' : `1px solid ${T.rule}`,
    }}>{children}</div>
  )
}

export default function W3BikerView({ vm, onReferral, onBadges, onRecord, onCreateRider }: {
  vm: W3BikerVm
  onReferral?: () => void
  onBadges?: () => void
  onRecord?: (key: string) => void
  onCreateRider?: () => void
}) {
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>

        {/* The chrome sits ABOVE the portrait rather than over it: the two
            lifetime pills already occupy the picture's top-right corner, and a
            menu button landing on top of them is how a clean composition turns
            into a collision on the one screen size that matters. */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: 'max(12px, env(safe-area-inset-top)) 16px 10px',
        }}>
          <span style={{
            minWidth: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: 1.4, color: T.ink,
            padding: '8px 13px', borderRadius: 100, background: T.heroChip,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>BIKER</span>
          <div style={{ flex: 'none' }}><W3NavMenu /></div>
        </div>

        <W3RiderHighlights
          {...vm.rider}
          onAllBadges={onBadges}
          onRecord={onRecord}
          onCreateRider={onCreateRider} />

        {/* ── THE TAIL: the account, deliberately quiet ─────────────────── */}
        <div style={{ ...band(28), gap: 10 }}>
          <Kicker>Konto</Kicker>
          <div style={{ padding: '4px 18px 8px', borderRadius: 22, background: T.surface }}>

            {vm.coin && (
              <TailRow first>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{vm.coin.balance} RideCoin</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>{vm.coin.note}</span>
                </div>
              </TailRow>
            )}

            {vm.referral && (
              <button onClick={onReferral} style={{ width: '100%', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: FONT, textAlign: 'left' }}>
                <TailRow first={!vm.coin}>
                  <div style={{ flex: 'none', width: 32, height: 32, borderRadius: 100, background: T.acidDim, display: 'grid', placeItems: 'center' }}>
                    <Ticket size={15} color={T.acid} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>Code {vm.referral.code}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>{vm.referral.note}</span>
                  </div>
                  <ChevronRight size={16} color={T.quiet} />
                </TailRow>
              </button>
            )}

            {vm.devices.map((d, i) => {
              const Ic = DEV_ICONS[d.icon]
              return (
                <TailRow key={d.name} first={!vm.coin && !vm.referral && i === 0}>
                  <div style={{ flex: 'none', width: 32, height: 32, borderRadius: 100, background: d.on ? T.acidDim : T.surface2, display: 'grid', placeItems: 'center' }}>
                    <Ic size={15} color={d.on ? T.acid : T.quiet} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: d.on ? T.ink : T.mid, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.sub}</span>
                  </div>
                  <div style={{ flex: 'none', width: 40, height: 23, borderRadius: 100, background: d.on ? T.acid : T.surface2, display: 'flex', alignItems: 'center', justifyContent: d.on ? 'flex-end' : 'flex-start', padding: '0 3px' }}>
                    <div style={{ width: 17, height: 17, borderRadius: 100, background: d.on ? T.bg : T.quiet }} />
                  </div>
                </TailRow>
              )
            })}
          </div>
        </div>

        <W3TabBar />
      </div>
    </div>
  )
}
