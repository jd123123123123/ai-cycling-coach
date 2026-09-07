import type { ComponentType } from 'react'
import { Watch, Activity as ActivityIcon, Zap, HeartPulse, ChevronRight, Ticket, Users } from 'lucide-react'
import W3RiderHighlights, { type W3RiderHighlightsProps } from './W3RiderHighlights'
import { W3SeasonGrid, W3FormCurve, W3ActiveBike, type W3SeasonStat } from './W3ProfileBlocks'
import W3StatusBar from './W3StatusBar'
import W3TopBar from './W3TopBar'
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

/**
 * The three blocks pen frame `pMYpt` adds between the portrait and the
 * account. Each is null-or-empty when its source has not answered, and the
 * section then does not render — a profile is the page a rider SHOWS someone,
 * and a placeholder on it is a number they would repeat out loud.
 */
export interface W3ProfileExtras {
  season: W3SeasonStat[]
  curve: { value: number; delta: number | null; series: number[]; months: string[] } | null
  bike: {
    name: string; imageUrl: string | null
    weightKg: number | null; km: number | null; count: number | null
  } | null
  onGarage?: () => void
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

export default function W3BikerView({
  vm, onReferral, onBadges, onRecord, onCreateRider, onCrew,
  season = [], curve = null, bike = null, onGarage,
}: {
  vm: W3BikerVm
  onReferral?: () => void
  onCrew?: () => void
  onBadges?: () => void
  onRecord?: (key: string) => void
  onCreateRider?: () => void
} & Partial<W3ProfileExtras>) {
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>

        {/* ── THE SAME CHROME AS EVERY OTHER SCREEN ─────────────────────
            This was a bespoke header — a "BIKER" pill on the left and a lone
            menu button on the right — and it was the odd one out. Every other
            W3 screen that is not the hero room uses `W3TopBar`: back button,
            centred title, the rider's avatar, then the menu. Biker had no
            avatar and no back button, at a slightly different height, so
            moving between tabs the furniture jumped.

            The original note here was about not covering the portrait's own
            lifetime pills with a menu button. That still holds and is still
            respected: the bar sits ABOVE the picture rather than over it, so
            nothing lands on the pills — it is simply the shared bar now
            rather than a second design of the same thing. */}
        <W3StatusBar />
        {/* NO TITLE, like Fahrten. Both are bottom-tab roots and the tab bar
            already says which one you are on — printing "BIKER" above a lit
            BIKER tab is the same word twice, and it made this screen's header
            the only one of the two that had a centred label. */}
        <W3TopBar />

        <W3RiderHighlights
          {...vm.rider}
          onAllBadges={onBadges}
          onRecord={onRecord}
          onCreateRider={onCreateRider} />

        {/* ── pen `pMYpt`: the season, the form, the machine ─────────────
             In the frame's own order, and between the portrait and the
             account — a rider reads who they are, then how the year has gone,
             then what they ride, and only then the settings. */}
        {season.length > 0 && (
          <div style={{ ...band(26) }}>
            <W3SeasonGrid title={`Saison ${new Date().getFullYear()}`} stats={season} />
          </div>
        )}

        {curve && (
          <div style={{ ...band(26) }}>
            <W3FormCurve {...curve} />
          </div>
        )}

        {bike && (
          <div style={{ ...band(28) }}>
            <W3ActiveBike {...bike} onCustomise={onGarage} />
          </div>
        )}

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

            {/* BIKER is the tab that owns crew in the bar — without this row
                the crew was reachable only through the nav sheet. */}
            {onCrew && (
              <button onClick={onCrew} style={{ width: '100%', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: FONT, textAlign: 'left' }}>
                <TailRow first={!vm.coin}>
                  <div style={{ flex: 'none', width: 32, height: 32, borderRadius: 100, background: T.surface2, display: 'grid', placeItems: 'center' }}>
                    <Users size={15} color={T.evening} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>Deine Crew</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>Feed, Wochenwertung, Mitglieder</span>
                  </div>
                  <ChevronRight size={16} color={T.quiet} />
                </TailRow>
              </button>
            )}

            {vm.referral && (
              <button onClick={onReferral} style={{ width: '100%', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: FONT, textAlign: 'left' }}>
                <TailRow first={!vm.coin && !onCrew}>
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
                <TailRow key={d.name} first={!vm.coin && !onCrew && !vm.referral && i === 0}>
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
