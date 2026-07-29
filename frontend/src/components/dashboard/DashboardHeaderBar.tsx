/**
 * DashboardHeaderBar — the top-right utility row shared by every main tab:
 * locale switch, sync, settings, and the rider-profile avatar. Extracted from
 * DashboardShell so standalone root routes (e.g. /progress/bike) carry the same
 * header as the tabbed dashboard instead of missing it.
 */
import { Link } from 'react-router-dom'
import { SlidersHorizontal, Users } from 'lucide-react'
import SyncButton from './SyncButton'
import { useLocale } from '../../contexts/LocaleContext'
import { useAuth } from '../../contexts/AuthContext'

export default function DashboardHeaderBar() {
  const { locale } = useLocale()
  const { user } = useAuth()
  const de = locale === 'de'
  const profileInitial = (user?.display_name || user?.email || 'A').charAt(0).toUpperCase()

  return (
    <div className="flex justify-end items-center gap-2 pt-3">
      {/* The EN/DE LocaleSwitch used to sit here, on every dashboard screen.
          App language is set roughly once in a user's lifetime, and it was
          holding permanent prime chrome directly above the readiness hero —
          the single most valuable strip on the page — which read as an
          unfinished demo build rather than a product. It now lives in
          Settings › Preferences, beside every other set-and-forget choice. */}
      <SyncButton compact />
      {/* Settings — detail level, connections, notifications */}
      <Link
        to="/settings"
        aria-label={de ? 'Einstellungen' : 'Settings'}
        title={de ? 'Einstellungen' : 'Settings'}
        className="inline-flex items-center justify-center rounded-full transition-colors min-h-[36px] min-w-[36px]"
        style={{ width: 36, height: 36, border: '1px solid var(--color-rule)', color: 'var(--color-ink-2)', backgroundColor: 'var(--color-paper-2)' }}
      >
        <SlidersHorizontal size={16} strokeWidth={2} />
      </Link>
      {/* Crew entry — Social left the bottom bar when the nav became four
          chapters. The crew stack is not going anywhere, so it keeps a
          one-tap home here until its content is woven into Plan's calendar
          and History's evidence (phases 2 and 3). */}
      <Link
        to="/dashboard?tab=social"
        aria-label={de ? 'Crew' : 'Crew'}
        className="grid place-items-center rounded-full"
        style={{ width: 36, height: 36, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}
      >
        <Users size={17} strokeWidth={2} style={{ color: 'var(--color-muted)' }} />
      </Link>
      {/* Rider profile — the primary, thumb-reachable way to "yourself" */}
      <Link
        to="/profile"
        aria-label={de ? 'Mein Profil' : 'My profile'}
        title={de ? 'Mein Profil' : 'My profile'}
        className="inline-flex items-center justify-center rounded-full overflow-hidden transition-opacity active:opacity-80 min-h-[36px] min-w-[36px]"
        style={{ width: 36, height: 36, backgroundColor: 'var(--color-accent)', border: '1px solid var(--color-rule)' }}
      >
        {user?.avatar_url ? (
          <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span className="text-[14px] font-bold text-white" style={{ fontFamily: '"Sora", "Inter", ui-sans-serif, sans-serif' }}>
            {profileInitial}
          </span>
        )}
      </Link>
    </div>
  )
}
