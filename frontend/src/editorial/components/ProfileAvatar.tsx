import { Link } from 'react-router-dom'
import { useCopy } from '../i18n/useCopy'

/**
 * The Cover Meta row's Avatar (pen `bUuzT`/`ToC54`, verified present on a
 * fresh read of the node tree: "Meta" is `Ident` (date) + "Right" (`Streak`
 * + `Avatar`) — a 28×28 circle, `cornerRadius: 100`, 1px inner stroke
 * `#FFFFFF29` (`--e-avatar-ring`, tokens.css), sitting after the streak in
 * the SAME "Right" flex group, `gap: 14`.
 *
 * CORRECTION (topbar task): an earlier audit recorded this avatar as having
 * "no source" and left it unbuilt. It has one — `types/auth.ts`'s
 * `User.avatar_url`, read via `useAuth()` from `contexts/AuthContext` — the
 * exact field `components/dashboard/DashboardHeaderBar.tsx`'s own
 * rider-profile avatar already uses. Per this tree's architecture,
 * `components/` may not import `hooks/`/`contexts/` itself, so the resolved
 * `avatarUrl`/`initial` arrive as props from the page (`TodayPage`), the
 * same way the day-state control already does.
 *
 * Deliberately minimal: no settings/sync/crew cluster (DashboardHeaderBar's
 * own utility row) — the pen's Meta row is `date · streak · avatar`, full
 * stop. This is a hero, not a utility bar.
 */
export default function ProfileAvatar({
  avatarUrl,
  initial,
}: {
  avatarUrl: string | null
  initial: string
}) {
  const { t } = useCopy()
  return (
    <Link
      to="/profile"
      aria-label={t('profileAvatarAria')}
      style={{
        flexShrink: 0,
        width: 28,
        height: 28,
        borderRadius: 'var(--radius-pill)',
        overflow: 'hidden',
        border: '1px solid var(--e-avatar-ring)',
        background: 'var(--e-glass)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontFamily: 'var(--e-display)', fontSize: 11, fontWeight: 800, color: 'var(--e-ink)' }}>
          {initial}
        </span>
      )}
    </Link>
  )
}
