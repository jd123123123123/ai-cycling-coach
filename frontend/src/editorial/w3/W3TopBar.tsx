import { type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { T, FONT } from './w3tokens'
import W3NavMenu from './W3NavMenu'

/**
 * W3 · Top bar — the consistent header across every W3 screen: an optional back
 * button + centred title on the left/centre, and on the right the rider's
 * avatar (→ profile) plus the settings/"everything" menu (W3NavMenu). Drop
 * <W3TopBar title="…" onBack={…} /> into any screen so no page is stranded
 * without the avatar + settings. Self-contained (owns auth + navigation).
 */
export default function W3TopBar({ title, onBack, extra }: { title?: string; onBack?: () => void; extra?: ReactNode }) {
  const nav = useNavigate()
  const { user } = useAuth()
  const initial = (user?.display_name || user?.email || '?').charAt(0).toUpperCase()
  return (
    <div style={{ padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', gap: 10 }}>
      {onBack
        ? <button onClick={onBack} aria-label="Zurück" style={{ width: 38, height: 38, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none' }}><ArrowLeft size={18} color={T.ink} /></button>
        : <div style={{ width: 38, flex: 'none' }} />}
      <span style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title ?? ''}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
        {extra}
        <button onClick={() => nav('/e/w3-biker')} aria-label="Profil & Einstellungen"
          style={{ width: 38, height: 38, borderRadius: 100, overflow: 'hidden', background: T.surface2, border: `1px solid ${T.stroke}`, display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0, flex: 'none' }}>
          {user?.avatar_url
            ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 13, fontWeight: 700, color: T.mid, fontFamily: FONT }}>{initial}</span>}
        </button>
        <W3NavMenu />
      </div>
    </div>
  )
}
