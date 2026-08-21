import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { T, FONT } from './w3tokens'
import './w3.css'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import W3PartsDock from './W3PartsDock'
import { useHeroPanel } from './W3HeroShell'
import W3GearPanel from './W3GearPanel'
import W3WorkshopPanel from './W3WorkshopPanel'
import { useGear } from '../../hooks/useGear'
import { useWorkshop } from '../../hooks/useWorkshop'
import { useWallet } from '../../hooks/useWallet'

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
  const { data: workshop } = useWorkshop()

  // NO STAGE OF ITS OWN. The garage is the same room as Today, and the room
  // belongs to `W3HeroShell` — so this page contributes only the panel that
  // floats over the floor. That is also the whole feature: switching to the
  // garage changes the panel and nothing else, so the machine never flashes.
  const dock = (
    <W3PartsDock
      gear={gear ?? null}
      onOpenSlot={() => navigate('/e/w3-gear')}
      onOpenWorkshop={() => navigate('/e/w3-workshop')}
      workshopBonus={workshop?.total_bonus_rc ?? null} />
  )
  const { inShell, portal } = useHeroPanel(dock)

  // Outside the shell — a deep link that skipped it — the garage still draws
  // its own room rather than a bare panel on a black page.
  if (inShell) return <>{portal}</>
  return <W3GarageStandalone dock={dock} />
}

/** The garage with a room of its own, for the case above. Kept minimal on
 *  purpose: it is a fallback, not a second design. */
function W3GarageStandalone({ dock }: { dock: React.ReactNode }) {
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <W3StatusBar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', padding: '10px 16px 18px' }}>{dock}</div>
        <W3TabBar />
      </div>
    </div>
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
