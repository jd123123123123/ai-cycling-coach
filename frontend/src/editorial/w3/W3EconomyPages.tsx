import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { T, FONT } from './w3tokens'
import './w3.css'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import W3GarageHero from './W3GarageHero'
import W3GearPanel from './W3GearPanel'
import W3WorkshopPanel from './W3WorkshopPanel'
import { useGear } from '../../hooks/useGear'
import { useBikeBuild } from '../../hooks/useGear'
import { useWorkshop } from '../../hooks/useWorkshop'
import { useGarage } from '../../hooks/useGarage'
import { useWallet } from '../../hooks/useWallet'
import { useStreak } from '../../hooks/useStreak'
import { useAuth } from '../../contexts/AuthContext'

/**
 * The three live screens of the bike economy, wired to real endpoints.
 *
 * They are in ONE file because they are one feature and each is a thin shell:
 * a header, a panel that owns its own data, and the tab bar. Three files of
 * fifteen lines each would spread one idea across a directory.
 *
 * The GARAGE is the hub — the built bike, the five slots, and what they bring.
 * Tapping a slot goes to the shop; tapping the workshop card goes to the
 * workshop. Neither is embedded in the garage: each is a full screen because
 * each is a real activity, and stacking all three would make the one thing the
 * garage is FOR — looking at your bike — a strip at the top of a long scroll.
 */

function Shell({ title, back, right, children }: {
  title: string
  back?: boolean
  right?: React.ReactNode
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, minHeight: '100dvh', background: T.heroBg }}>
        <W3StatusBar />
        <div style={{ padding: '8px 20px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {back && (
            <button onClick={() => navigate('/e/w3-garage')} aria-label="Zurück"
              style={{
                width: 36, height: 36, borderRadius: 100, border: 0, background: T.heroChip,
                display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none', padding: 0,
              }}>
              <ArrowLeft size={17} color={T.ink} />
            </button>
          )}
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.8, color: T.ink }}>{title}</span>
          {right && <span style={{ marginLeft: 'auto' }}>{right}</span>}
        </div>
        {children}
        <W3TabBar />
      </div>
    </div>
  )
}

/** The balance, in the header, on every economy screen — so a rider deciding
 *  whether to buy never has to leave the screen to find out if they can. */
function Balance() {
  const { data: wallet } = useWallet()
  return (
    <span style={{
      fontSize: 15, fontWeight: 700, color: T.ink, fontVariantNumeric: 'tabular-nums',
      display: 'inline-flex', alignItems: 'center', gap: 5,
    }}>
      <span style={{ color: T.lilac }}>✳</span>
      {wallet ? wallet.balance.toLocaleString('de-DE') : '—'}
    </span>
  )
}

/** GARAGE — the hub. Route: /e/w3-garage */
export function W3GarageHome() {
  const navigate = useNavigate()
  const { data: gear } = useGear()
  const { data: build, isFetching: building } = useBikeBuild()
  const { data: workshop } = useWorkshop()
  const { data: garage } = useGarage()
  const { data: wallet } = useWallet()
  const { data: streak } = useStreak()
  const { user } = useAuth()

  // No `Shell` here. The garage IS the stage now — full-bleed, its own status
  // bar and tab bar — exactly as Today is, and a page title bar above a
  // full-screen room would put a header on a photograph.
  return (
    <W3GarageHero
      handle={user?.display_name ? `@${user.display_name}` : '@rider'}
      role={null}
      rider={garage?.rider?.image_base64 ?? null}
      // The BUILT bike when one exists, the rider's plain render otherwise.
      // Never a stock bike presented as theirs — `needs_bike` leaves this null
      // and the stage shows its labelled example.
      bike={build?.image_base64 ?? garage?.bike?.image_base64 ?? null}
      bikeName={garage?.bike?.name ?? 'Dein Rad'}
      coins={wallet?.balance != null ? wallet.balance.toLocaleString('de-DE') : null}
      streak={streak?.streak ?? null}
      bonus={null}
      gear={gear ?? null}
      building={building}
      workshopBonus={workshop?.total_bonus_rc ?? null}
      onOpenSlot={() => navigate('/e/w3-gear')}
      onOpenWorkshop={() => navigate('/e/w3-workshop')} />
  )
}

/** AUSRÜSTUNG — the shop. Route: /e/w3-gear */
export function W3GearScreen() {
  return (
    <Shell title="Ausrüstung" back right={<Balance />}>
      <W3GearPanel />
    </Shell>
  )
}

/** WERKSTATT — the harvest. Route: /e/w3-workshop */
export function W3WorkshopScreen() {
  return (
    <Shell title="Werkstatt" back right={<Balance />}>
      <W3WorkshopPanel />
    </Shell>
  )
}
