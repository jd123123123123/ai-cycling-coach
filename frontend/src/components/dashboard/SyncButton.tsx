/**
 * SyncButton — Garmin sync status pill in the masthead (audit P1-12 rework).
 *
 * Was: a hover-tooltip-only chip ("11 Std." + amber dot) that force-synced on
 * click — unexplained on touch devices, where no tooltip exists.
 *
 * Now: a compact "⟳ 11 h" pill (both locales) whose tap opens
 * `SyncDetailsSheet` — a bottom sheet with the absolute last-sync time (24h,
 * localized), the connected source, and the Sync-now action. No tooltip.
 *
 * Visual tones (driven by `useGarminStatus` + `useForceSync`):
 *   · ok (fresh)   — green ⟳, "⟳ 12 min"
 *   · ok (stale)   — amber ⟳ once age exceeds STALE_AFTER_MIN
 *   · syncing      — amber spinner, "Syncing…"
 *   · error        — amber triangle (sync trouble is caution-with-action,
 *                    never health-safety red)
 *   · disconnected — grey wifi-off, tap routes to /garmin/connect
 *
 * The age string ticks every 30 s without re-fetching the API. The sheet owns
 * the mutation feedback (pending / error) — the mutation instance lives here
 * so pill and sheet share one isPending.
 *
 * Compatibility: preserves the previous default-export shape; existing
 * callers that mount `<SyncButton />` continue to work.
 */
import { useCallback, useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, Check, RefreshCw, WifiOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useForceSync } from '../../hooks/useForceSync'
import { useLocale } from '../../contexts/LocaleContext'
import { useGarminStatus } from '../../hooks/useGarminStatus'
import SyncDetailsSheet from './SyncDetailsSheet'

// After this many minutes since last_sync_at the pill flips ok → stale.
// Hourly scheduler runs once an hour, so 90 min gives one missed window of
// grace before we nudge the user.
const STALE_AFTER_MIN = 90

type Tone = 'ok' | 'stale' | 'syncing' | 'error' | 'disconnected'

/**
 * Compact age for the pill — "⟳ 11 h" style, identical units in both locales
 * (min / h / d read naturally in German and English).
 */
function compactAge(iso: string | null, now: number, locale: 'en' | 'de'): string {
  if (!iso) return '—'
  const diffMin = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (diffMin < 1) return locale === 'de' ? 'jetzt' : 'now'
  if (diffMin < 60) return `${diffMin} min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH} h`
  return `${Math.round(diffH / 24)} d`
}

function extractAxiosMessage(err: unknown, locale: 'en' | 'de' = 'en'): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyErr = err as any
  const detail = anyErr?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim().length > 0) return detail
  const msg = anyErr?.message
  if (typeof msg === 'string' && msg.trim().length > 0) return msg
  return locale === 'de' ? 'Synchronisierung fehlgeschlagen' : 'Sync failed'
}

interface SyncButtonProps {
  /** Kept for call-site compatibility — the pill is always compact now. */
  compact?: boolean
  className?: string
}

export default function SyncButton({ className = '' }: SyncButtonProps) {
  const { data: status } = useGarminStatus()
  const sync = useForceSync()
  const navigate = useNavigate()
  const { locale } = useLocale()
  const de = locale === 'de'
  const reduce = useReducedMotion()

  const [sheetOpen, setSheetOpen] = useState(false)

  // Tick the relative-age string every 30 s — purely UI-side, no refetch.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const isSyncing = sync.isPending || status?.sync_status === 'syncing'
  const ageMin = status?.last_sync_at
    ? Math.round((now - new Date(status.last_sync_at).getTime()) / 60_000)
    : Infinity
  const isStale = ageMin > STALE_AFTER_MIN

  let tone: Tone = 'ok'
  if (isSyncing) tone = 'syncing'
  else if (status && !status.connected) tone = 'disconnected'
  else if (
    status?.sync_status === 'auth_error' ||
    status?.sync_status === 'error' ||
    sync.isError
  )
    tone = 'error'
  else if (isStale) tone = 'stale'

  // Sync trouble is caution-with-action (amber), never health-safety red.
  const TONE_COLOR: Record<Tone, string> = {
    ok: 'var(--color-forest)',
    stale: 'var(--color-amber)',
    syncing: 'var(--color-amber)',
    error: 'var(--color-amber)',
    disconnected: 'var(--color-muted)',
  }
  const toneColor = TONE_COLOR[tone]

  const ageStr = compactAge(status?.last_sync_at ?? null, now, locale)

  const handleClick = useCallback(() => {
    // Disconnected → the pill is a "Connect Garmin" CTA routing to the flow.
    if (tone === 'disconnected') {
      navigate('/garmin/connect')
      return
    }
    setSheetOpen(true)
  }, [tone, navigate])

  // Screen-reader label only — deliberately NOT a `title` tooltip (P1-12:
  // hover-only explanations are unreachable on touch).
  const ariaLabel =
    tone === 'disconnected'
      ? de
        ? 'Garmin verbinden, um zu synchronisieren'
        : 'Connect Garmin to start syncing'
      : de
        ? `Synchronisierungsdetails öffnen — letzte Synchronisierung vor ${ageStr}`
        : `Open sync details — last synced ${ageStr} ago`

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <motion.button
        type="button"
        onClick={handleClick}
        whileHover={reduce ? undefined : { y: -1 }}
        whileTap={reduce ? undefined : { scale: 0.97 }}
        aria-label={ariaLabel}
        aria-busy={isSyncing}
        aria-haspopup={tone === 'disconnected' ? undefined : 'dialog'}
        aria-expanded={tone === 'disconnected' ? undefined : sheetOpen}
        className="inline-flex items-center gap-2 shrink-0 rounded-full"
        style={{
          minHeight: 44,
          padding: '10px 14px',
          border: `1px solid color-mix(in srgb, ${toneColor} 28%, var(--color-rule))`,
          backgroundColor: `color-mix(in srgb, ${toneColor} ${tone === 'disconnected' ? 4 : 7}%, transparent)`,
          cursor: 'pointer',
          transition: 'background-color 200ms ease, border-color 200ms ease',
        }}
      >
        {/* ⟳ glyph — spinner while syncing, warning triangle on error */}
        <span
          aria-hidden
          className="inline-flex items-center justify-center"
          style={{ width: 14, height: 14, color: toneColor }}
        >
          {tone === 'error' ? (
            <AlertTriangle size={13} strokeWidth={2.4} />
          ) : tone === 'disconnected' ? (
            <WifiOff size={13} strokeWidth={2} />
          ) : (
            <RefreshCw
              size={13}
              strokeWidth={2.4}
              className={tone === 'syncing' ? 'animate-spin' : undefined}
            />
          )}
        </span>

        <span
          className="num-mono shrink-0"
          style={{
            fontSize: 11,
            letterSpacing: '0.04em',
            fontWeight: 600,
            color:
              tone === 'ok'
                ? 'var(--color-ink-2)'
                : tone === 'disconnected'
                  ? 'var(--color-ink-2)'
                  : toneColor,
          }}
        >
          {tone === 'disconnected'
            ? de ? 'Garmin verbinden' : 'Connect Garmin'
            : tone === 'syncing'
              ? de ? 'Synchronisiere…' : 'Syncing…'
              : ageStr}
        </span>

        {/* Brief success flash when a sync just completed */}
        {sync.isSuccess && tone === 'ok' && (
          <motion.span
            aria-hidden
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 0], scale: [0.6, 1, 1] }}
            transition={{ duration: 1.6, ease: 'easeOut' }}
            className="inline-flex items-center"
            style={{ color: 'var(--color-forest)' }}
          >
            <Check size={11} strokeWidth={2.5} />
          </motion.span>
        )}
      </motion.button>

      <SyncDetailsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        status={status}
        syncing={isSyncing}
        errorMessage={sync.isError ? extractAxiosMessage(sync.error, locale) : null}
        onSyncNow={() => sync.mutate()}
        onConnect={() => {
          setSheetOpen(false)
          navigate('/garmin/connect')
        }}
      />
    </div>
  )
}
