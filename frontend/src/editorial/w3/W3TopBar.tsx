import { type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, X } from 'lucide-react'
import { T } from './w3tokens'
import W3NavMenu from './W3NavMenu'
import W3RiderAvatar from './W3RiderAvatar'

/**
 * W3 · Top bar — the consistent header across every W3 screen: an optional back
 * button + centred title on the left/centre, and on the right the rider's
 * avatar (→ profile) plus the settings/"everything" menu (W3NavMenu). Drop
 * <W3TopBar title="…" onBack={…} /> into any screen so no page is stranded
 * without the avatar + settings. Self-contained (owns auth + navigation).
 *
 * ── THE AVATAR DOES NOT LINK TO THE PAGE YOU ARE ON ──────────────────────
 *
 * Its job is "take me to my profile", and on the profile that is a button
 * that appears to do something and does nothing. The bar drops it there
 * instead of shipping a control whose only effect is a no-op navigation —
 * and the profile shows the same portrait, larger, a few pixels below.
 *
 * Detected from the route rather than passed as a prop, because a screen
 * should not have to remember to opt out of a link to itself.
 *
 * ── ONE CORNER FOR THE MENU, EVERYWHERE ──────────────────────────────────
 *
 * The gear is the app's only always-available control, so it holds the SAME
 * corner on every screen: top right, last in this bar. The hero room has no
 * top bar — its stage is the header — so `W3TodayStage` carries the identical
 * `W3NavMenu` in the identical corner rather than in its own left stack,
 * where it used to sit. A rider moving Today → Fahrten → Werkstatt must never
 * have to look for it twice.
 *
 * The avatar button is the one thing the room does NOT repeat: the rider's
 * bust is already on the stage at full size, so a 44px copy of it would be
 * the same link, twice, on one screen.
 */
const PROFILE_ROUTE = '/e/w3-biker'

/**
 * WHERE A HEADER CONTROL SITS — one definition, imported by anything that
 * draws one. The normal row is44px controls plus6px above/below.
 * The safe-area variable excludes the inset already owned by standalone body.
 * The hero room has no top bar (its stage is the header), so
 * `W3TodayStage` positions its chip columns from these exact numbers; without
 * a shared source the two drifted 10px apart, which is precisely enough for
 * the gear to look like it moves when the rider changes screens.
 */
export const HEAD = { top: 'calc(var(--w3-header-safe-top, env(safe-area-inset-top, 0px)) + 6px)', inset: 20, control: 44, row: 56 } as const
export default function W3TopBar({ title, onBack, onClose, extra }: { title?: string; onBack?: () => void; onClose?: () => void; extra?: ReactNode }) {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const onProfile = pathname === PROFILE_ROUTE || pathname.startsWith(`${PROFILE_ROUTE}/`)
  if (onClose) return <header data-w3-topbar className="w3-topbar" style={{ flexShrink: 0, minWidth: 0, padding: `0 ${HEAD.inset}px`, height: HEAD.row, display: 'flex', alignItems: 'center', gap: 10 }}>
    <span className="w3-topbar-title" title={title} style={{ flex: 1, minWidth: 0, color: T.ink, fontSize: 15, fontWeight: 650, letterSpacing: '-0.25px', lineHeight: '18px', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>{title}</span>
    <button type="button" className="w3-topbar-control" onClick={onClose} aria-label="Schließen" style={{ width: 44, height: 44, minWidth: 44, flex: 'none', borderRadius: 100, border: 0, padding: 0, background: T.heroChip, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={20} color={T.ink}/></button>
  </header>
  return (
    <header data-w3-topbar className="w3-topbar" style={{ flexShrink: 0, minWidth: 0, padding: `0 ${HEAD.inset}px`, height: HEAD.row, display: 'flex', alignItems: 'center', gap: 10 }}>
      {onBack
        ? <button type="button" onClick={onBack} aria-label="Zurück" style={{ width: 44, height: 44, borderRadius: 100, background: T.heroChip, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none' }}><ArrowLeft size={18} color={T.ink} /></button>
        : <div style={{ width: 44, flex: 'none' }} />}
      <span style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title ?? ''}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
        {extra}
        {!onProfile && (
          <button onClick={() => nav(PROFILE_ROUTE)} aria-label="Profil & Einstellungen"
            style={{ width: 44, height: 44, borderRadius: 100, overflow: 'hidden', background: T.surface2, border: `1px solid ${T.stroke}`, display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0, flex: 'none' }}>
            <W3RiderAvatar size={42} />
          </button>
        )}
        <W3NavMenu />
      </div>
    </header>
  )
}
