/**
 * SyncStatusPill — compact masthead indicator showing last-sync timestamp
 * and color-coded freshness for the connected Garmin provider.
 *
 * Data source: same ['garmin', 'status'] React Query key that SyncButton
 * uses — reads useGarminStatus() directly so both components stay in sync
 * with no extra wiring. Click navigates to /settings where the full sync
 * configuration lives.
 *
 * Freshness bands:
 *   < 30 min ago → forest (fresh)
 *   30 min – 24 h → amber-soft / ink (stale)
 *   > 24 h or error state → alert (needs attention)
 *
 * Per-provider breakdown (Garmin + others) is a TODO for a future backend
 * endpoint — this wave shows single-provider ("Garmin") only.
 *
 * Hidden on viewports < 640px to keep the mobile masthead clean.
 */
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { useGarminStatus } from '../../hooks/useGarminStatus'
import { useLanguage } from '../../contexts/LanguageContext'

type Freshness = 'fresh' | 'stale' | 'error'

function freshness(lastSyncAt: string | null, syncStatus: string | null): Freshness {
  if (syncStatus === 'auth_error' || syncStatus === 'error') return 'error'
  if (!lastSyncAt) return 'error'
  const ms = Date.now() - new Date(lastSyncAt).getTime()
  const minutes = ms / 1_000 / 60
  if (minutes < 30) return 'fresh'
  if (minutes < 24 * 60) return 'stale'
  return 'error'
}

const FRESHNESS_STYLES: Record<Freshness, { bg: string; color: string }> = {
  fresh: { bg: 'var(--color-forest)', color: 'var(--color-paper)' },
  stale: { bg: 'var(--color-amber-soft)', color: 'var(--color-ink)' },
  error: { bg: 'var(--color-alert)', color: 'var(--color-paper)' },
}

export default function SyncStatusPill() {
  const { data } = useGarminStatus()
  const { language } = useLanguage()
  const navigate = useNavigate()

  // Only render once we have data — avoids a layout-shift flash in the masthead.
  if (!data) return null

  const level = freshness(data.last_sync_at, data.sync_status ?? null)
  const { bg, color } = FRESHNESS_STYLES[level]

  let label: string
  if (!data.connected) {
    label = language === 'simple' ? 'Not connected' : 'Garmin · not connected'
  } else if (!data.last_sync_at) {
    label = language === 'simple' ? 'Never synced' : 'Garmin · never synced'
  } else {
    const timeAgo = formatDistanceToNow(new Date(data.last_sync_at), { addSuffix: false })
      .replace('about ', '')
      .replace('less than a ', '<1 ')
    if (language === 'simple') {
      label = `Synced ${timeAgo} ago`
    } else {
      const statusTag = data.sync_status === 'ok' ? '· OK' : data.sync_status ? `· ${data.sync_status}` : ''
      label = `Garmin · ${timeAgo} ago ${statusTag}`.trimEnd()
    }
  }

  return (
    <button
      type="button"
      onClick={() => navigate('/settings')}
      className="hidden sm:inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium transition-opacity hover:opacity-80"
      style={{
        backgroundColor: bg,
        color,
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
        minHeight: 28,
      }}
      title={`Sync status: ${level}. Click to manage in Settings.`}
      aria-label={label}
    >
      {label}
    </button>
  )
}
