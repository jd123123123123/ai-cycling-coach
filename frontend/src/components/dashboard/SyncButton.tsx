/**
 * SyncButton — Garmin sync action with live status + age.
 *
 * A pill that pulls double duty: status indicator + click-to-refresh button.
 *
 * Visual states (driven by `useGarminStatus` + `useForceSync`):
 *   · ok (fresh)   — green dot, "Synced 12 m ago"
 *   · ok (stale)   — amber dot, age in amber once we exceed STALE_AFTER_MIN
 *   · syncing      — amber spinner, "Syncing…", click disabled
 *   · error        — red triangle, "Sync failed"; click retries
 *   · disconnected — grey wifi-off, "Not connected"; click is a no-op
 *
 * The age string ticks every 30 s without re-fetching the API. On a
 * successful sync the existing `useForceSync` hook invalidates the
 * dashboard's data queries; here we also invalidate `garmin/status` so the
 * pill itself updates.
 *
 * Errors surface as an inline toast under the pill (auto-dismiss after 6 s).
 *
 * Compatibility: this component preserves the previous default-export shape;
 * existing callers that mounted `<SyncButton />` continue to work.
 */
import { useCallback, useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, Check, RefreshCw, WifiOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useForceSync } from '../../hooks/useForceSync'
import { useLocale } from '../../contexts/LocaleContext'
import { tFor } from '../../i18n/strings'
import { useGarminStatus } from '../../hooks/useGarminStatus'

// After this many minutes since last_sync_at the pill flips ok → stale.
// Hourly scheduler runs once an hour, so 90 min gives one missed window of
// grace before we nudge the user.
const STALE_AFTER_MIN = 90
const ERROR_HOLD_MS = 6000

type Tone = 'ok' | 'stale' | 'syncing' | 'error' | 'disconnected'

function relativeAge(iso: string | null, now: number, locale: 'en' | 'de' = 'en'): string {
  if (!iso) return '—'
  const diffMs = Math.max(0, now - new Date(iso).getTime())
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 1) return tFor(locale, 'sync_just_now')
  if (diffMin < 60) return `${diffMin} ${tFor(locale, 'sync_min_ago')}`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH} ${tFor(locale, 'sync_h_ago')}`
  const diffD = Math.round(diffH / 24)
  return `${diffD} ${tFor(locale, 'sync_d_ago')}`
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
  /** Hide the text label, render dot + age only. Useful in dense mastheads. */
  compact?: boolean
  className?: string
}

export default function SyncButton({ compact = false, className = '' }: SyncButtonProps) {
  const { data: status, isLoading } = useGarminStatus()
  const sync = useForceSync()
  const navigate = useNavigate()
  const { locale } = useLocale()
  const reduce = useReducedMotion()

  // Tick the relative-age string every 30 s — purely UI-side, no refetch.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // Inline error toast — auto-dismiss.
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  useEffect(() => {
    if (sync.isError) {
      setErrorMsg(extractAxiosMessage(sync.error, locale))
      const t = window.setTimeout(() => setErrorMsg(null), ERROR_HOLD_MS)
      return () => window.clearTimeout(t)
    }
  }, [sync.isError, sync.error, locale])

  // Tone selection — the click handler also keys off this.
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

  const TONE_MAP: Record<Tone, { dot: string; text: string; label: string }> = {
    ok:           { dot: 'var(--color-forest)', text: 'var(--color-forest)', label: tFor(locale, 'sync_label_synced') },
    stale:        { dot: 'var(--color-amber)',  text: 'var(--color-amber)',  label: tFor(locale, 'sync_label_synced') },
    syncing:      { dot: 'var(--color-amber)',  text: 'var(--color-amber)',  label: tFor(locale, 'sync_label_syncing') },
    error:        { dot: 'var(--color-alert)',  text: 'var(--color-alert)',  label: tFor(locale, 'sync_label_failed') },
    disconnected: { dot: 'var(--color-forest-2)', text: 'var(--color-forest-2)', label: locale === 'de' ? 'Garmin verbinden' : 'Connect Garmin' },
  }
  const TONE = TONE_MAP[tone]

  const ageStr = relativeAge(status?.last_sync_at ?? null, now, locale)
  const disabled = isLoading || isSyncing

  const handleClick = useCallback(() => {
    if (disabled) return
    // Disconnected → the pill becomes a "Connect Garmin" CTA routing to the flow.
    if (tone === 'disconnected') {
      navigate('/garmin/connect')
      return
    }
    setErrorMsg(null)
    sync.mutate()
  }, [disabled, tone, navigate, sync])

  const title =
    tone === 'disconnected'
      ? locale === 'de'
        ? 'Garmin verbinden, um zu synchronisieren — hier klicken'
        : 'Connect Garmin to start syncing — click here'
      : tone === 'error'
        ? locale === 'de'
          ? `Letzte Synchronisierung fehlgeschlagen${status?.sync_status ? ` (${status.sync_status})` : ''}. Zum Wiederholen klicken.`
          : `Last sync failed${status?.sync_status ? ` (${status.sync_status})` : ''}. Click to retry.`
        : tone === 'syncing'
          ? locale === 'de'
            ? 'Synchronisierung läuft'
            : 'Sync in progress'
          : status?.last_sync_at
            ? locale === 'de'
              ? `Letzte Synchronisierung: ${new Date(status.last_sync_at).toLocaleString('de-DE')}`
              : `Last sync: ${new Date(status.last_sync_at).toLocaleString()}`
            : locale === 'de'
              ? 'Neueste Aktivitäten und Werte von Garmin laden'
              : 'Pull latest activities and metrics from Garmin'

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <motion.button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        whileHover={reduce || disabled ? undefined : { y: -1 }}
        whileTap={reduce || disabled ? undefined : { scale: 0.97 }}
        title={title}
        aria-label={title}
        aria-busy={isSyncing}
        className="group inline-flex items-center gap-2 shrink-0 rounded-full"
        style={{
          padding: compact ? '6px 10px' : '7px 12px',
          border: `1px solid color-mix(in srgb, ${TONE.dot} 28%, var(--color-rule))`,
          backgroundColor: `color-mix(in srgb, ${TONE.dot} ${tone === 'disconnected' ? 4 : 7}%, transparent)`,
          cursor: disabled ? 'default' : 'pointer',
          transition: 'background-color 200ms ease, border-color 200ms ease',
        }}
      >
        {/* Status indicator: spinner / icon / pulsing dot depending on tone */}
        <span
          aria-hidden
          className="inline-flex items-center justify-center"
          style={{ width: 12, height: 12, color: TONE.dot }}
        >
          {tone === 'syncing' ? (
            <RefreshCw size={12} strokeWidth={2.4} className="animate-spin" />
          ) : tone === 'error' ? (
            <AlertTriangle size={12} strokeWidth={2.4} />
          ) : tone === 'disconnected' ? (
            <WifiOff size={11} strokeWidth={2} />
          ) : (
            <motion.span
              className="block rounded-full"
              style={{ width: 7, height: 7, backgroundColor: TONE.dot }}
              animate={
                reduce ? undefined : { opacity: [0.55, 1, 0.55], scale: [1, 1.18, 1] }
              }
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </span>

        {(!compact || tone === 'disconnected') && (
          <span
            className="num-mono"
            style={{
              fontSize: 10,
              letterSpacing: '0.2em',
              color: TONE.text,
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            {TONE.label}
          </span>
        )}

        {status?.last_sync_at && tone !== 'disconnected' && (
          <span
            className="num-mono shrink-0"
            style={{
              fontSize: 10.5,
              letterSpacing: '0.04em',
              color: tone === 'ok' ? 'var(--color-ink-2)' : TONE.text,
              opacity: tone === 'ok' ? 0.85 : 1,
            }}
          >
            {ageStr}
          </span>
        )}

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

      {/* Inline error toast — sits under the pill, doesn't shift layout */}
      {errorMsg && (
        <div
          role="alert"
          className="absolute top-full mt-2 right-0 num-mono text-[11px] leading-snug px-2.5 py-1.5 rounded-md shadow-sm whitespace-nowrap flex items-center gap-1"
          style={{
            color: 'var(--color-alert)',
            backgroundColor: 'var(--color-paper)',
            border: '1px solid rgba(138, 29, 29, 0.25)',
            zIndex: 50,
            maxWidth: 280,
          }}
        >
          {locale === 'de' ? 'Synchronisierung fehlgeschlagen' : 'Sync failed'} — {errorMsg}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setErrorMsg(null)
              sync.mutate()
            }}
            className="underline underline-offset-2 ml-2 hover:text-[var(--color-ink)]"
            style={{ color: 'var(--color-ink-2)' }}
          >
            {locale === 'de' ? 'Erneut versuchen' : 'Retry'}
          </button>
        </div>
      )}
    </div>
  )
}
