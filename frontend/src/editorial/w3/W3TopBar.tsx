import { type ReactNode, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, X } from 'lucide-react'
import { T } from './w3tokens'
import W3NavMenu from './W3NavMenu'
import W3RiderAvatar from './W3RiderAvatar'
import './w3TopBar.css'

// Today uses this same geometry for the menu floating over its bike stage.
export const HEAD = { top: 'calc(var(--w3-header-safe-top, env(safe-area-inset-top, 0px)) + 6px)', inset: 20, control: 44, row: 56 } as const
const PROFILE_ROUTE = '/e/w3-biker'

type Props = { title?: string; onBack?: () => void; onClose?: () => void; extra?: ReactNode; showAvatar?: boolean }
export default function W3TopBar({ title, onBack, onClose, extra, showAvatar = true }: Props) {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const onProfile = pathname === PROFILE_ROUTE || pathname.startsWith(`${PROFILE_ROUTE}/`) || pathname === '/e/w3-biker-preview'
  const style = { '--header-bg': T.bg, '--header-ink': T.ink, '--header-muted': T.mid, '--header-button': T.heroChip, '--header-line': T.stroke } as CSSProperties
  return <header data-w3-topbar className={`w3-topbar${onBack ? ' has-back' : ''}${onClose ? ' is-sheet' : ''}`} style={style}>
    {onBack && !onClose && <button type="button" className="w3-topbar-control" onClick={onBack} aria-label="Zurück"><ArrowLeft size={20}/></button>}
    <span className="w3-topbar-title" title={title}>{title ?? ''}</span>
    <div className="w3-topbar-actions">
      {onClose ? <button type="button" className="w3-topbar-control" onClick={onClose} aria-label="Schließen"><X size={20}/></button> : <>
        {extra}
        {showAvatar && !onProfile && <button type="button" className="w3-topbar-avatar" onClick={() => nav(PROFILE_ROUTE)} aria-label="Profil & Einstellungen"><W3RiderAvatar size={42}/></button>}
        <W3NavMenu/>
      </>}
    </div>
  </header>
}
