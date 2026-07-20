/**
 * SyncDetailsSheet — tap-reachable sync details (audit P1-12).
 *
 * The masthead sync pill used to explain itself only via a hover tooltip
 * ("Letzte Synchronisierung: …"), which does not exist on touch devices.
 * This bottom sheet is the honest replacement: tapping the pill slides it up
 * with the absolute last-sync time (24h, localized), the connected source,
 * and a Sync-now action.
 *
 * Deliberately dumb: all data + actions arrive via props so the mutation
 * state (pending / error) stays single-source in SyncButton — a second
 * useForceSync() instance here would not share isPending with the pill.
 *
 * Both locales are inlined (i18n/strings.ts is owned elsewhere).
 * All tap targets ≥ 44px.
 */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { RefreshCw, X } from 'lucide-react'
import { springs } from '../../utils/motion'
import { useLocale } from '../../contexts/LocaleContext'
import type { GarminStatus } from '../../api/dashboard'

interface SyncDetailsSheetProps {
  open: boolean
  onClose: () => void
  status: GarminStatus | undefined
  /** True while a manual sync is in flight (or the backend reports 'syncing'). */
  syncing: boolean
  /** Human-readable message when the last manual sync failed; null otherwise. */
  errorMessage: string | null
  onSyncNow: () => void
  onConnect: () => void
}

/** Absolute last-sync stamp — always 24h, localized date shape. */
function absoluteTime(iso: string | null, locale: 'en' | 'de'): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
    day: '2-digit',
    month: locale === 'de' ? '2-digit' : 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

/** Relative age, compact — secondary line under the absolute stamp. */
function relativeAge(iso: string | null, locale: 'en' | 'de'): string | null {
  if (!iso) return null
  const diffMin = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (diffMin < 1) return locale === 'de' ? 'gerade eben' : 'just now'
  if (diffMin < 60) return locale === 'de' ? `vor ${diffMin} min` : `${diffMin} min ago`
  const h = Math.round(diffMin / 60)
  if (h < 24) return locale === 'de' ? `vor ${h} h` : `${h} h ago`
  const days = Math.round(h / 24)
  return locale === 'de' ? `vor ${days} d` : `${days} d ago`
}

export default function SyncDetailsSheet({
  open,
  onClose,
  status,
  syncing,
  errorMessage,
  onSyncNow,
  onConnect,
}: SyncDetailsSheetProps) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const reduce = useReducedMotion()
  const titleId = useRef(`sync-sheet-${Math.random().toString(36).slice(2)}`)

  // Escape closes; body scroll locks while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const connected = status?.connected === true
  const backendError = status?.sync_status === 'auth_error' || status?.sync_status === 'error'

  const rows: Array<{ label: string; value: React.ReactNode; sub?: string | null }> = [
    {
      label: de ? 'Letzte Synchronisierung' : 'Last synced',
      value: (
        <span className="num-mono" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-ink)' }}>
          {absoluteTime(status?.last_sync_at ?? null, locale)}
        </span>
      ),
      sub: relativeAge(status?.last_sync_at ?? null, locale),
    },
    {
      label: de ? 'Quelle' : 'Source',
      value: (
        <span className="inline-flex items-center" style={{ gap: 8 }}>
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 9999,
              backgroundColor: connected ? 'var(--color-forest)' : 'var(--color-muted)',
            }}
          />
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-ink)' }}>Garmin</span>
          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            {connected
              ? de ? 'verbunden' : 'connected'
              : de ? 'nicht verbunden' : 'not connected'}
          </span>
        </span>
      ),
    },
  ]

  const sheet = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="sync-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 500,
            }}
          />
          <motion.div
            key="sync-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId.current}
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={reduce ? { duration: 0.15 } : springs.smooth}
            onClick={(e) => e.stopPropagation()}
            style={{
              // Centre with auto margins (NOT translateX) — motion owns
              // `transform` for the y-slide.
              position: 'fixed',
              left: 0,
              right: 0,
              marginLeft: 'auto',
              marginRight: 'auto',
              bottom: 0,
              zIndex: 501,
              width: '100%',
              maxWidth: 480,
              maxHeight: '86vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-paper)',
              borderTop: '1px solid var(--color-rule)',
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              boxShadow: '0 -8px 40px rgba(0,0,0,0.45)',
            }}
          >
            {/* Grab handle */}
            <div className="flex justify-center" style={{ paddingTop: 10 }}>
              <div style={{ width: 40, height: 5, borderRadius: 3, background: 'var(--color-surface-3)' }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between" style={{ padding: '10px 20px 6px', gap: 12 }}>
              <span
                id={titleId.current}
                style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.2 }}
              >
                {de ? 'Synchronisierung' : 'Sync status'}
              </span>
              <button
                type="button"
                aria-label={de ? 'Schließen' : 'Close'}
                onClick={onClose}
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  border: '1px solid var(--color-rule)',
                  background: 'transparent',
                  color: 'var(--color-muted)',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Detail rows */}
            <div style={{ padding: '4px 20px 8px', display: 'flex', flexDirection: 'column' }}>
              {rows.map((row, i) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between"
                  style={{
                    gap: 16,
                    minHeight: 56,
                    padding: '10px 0',
                    borderTop: i > 0 ? '1px solid var(--color-rule)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 12, color: 'var(--color-muted)', letterSpacing: '0.02em' }}>
                    {row.label}
                  </span>
                  <span className="flex flex-col items-end" style={{ gap: 2, textAlign: 'right' }}>
                    {row.value}
                    {row.sub && (
                      <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                        {row.sub}
                      </span>
                    )}
                  </span>
                </div>
              ))}

              {/* Backend-reported sync problem — caution-with-action, never red */}
              {backendError && !syncing && (
                <div
                  role="status"
                  style={{
                    marginTop: 4,
                    padding: '10px 12px',
                    borderRadius: 12,
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: 'var(--color-amber)',
                    border: '1px solid color-mix(in srgb, var(--color-amber) 30%, transparent)',
                    backgroundColor: 'color-mix(in srgb, var(--color-amber) 7%, transparent)',
                  }}
                >
                  {status?.sync_status === 'auth_error'
                    ? de
                      ? 'Garmin-Anmeldung abgelaufen — bitte neu verbinden.'
                      : 'Garmin login expired — please reconnect.'
                    : de
                      ? 'Die letzte automatische Synchronisierung ist fehlgeschlagen. Jetzt erneut versuchen.'
                      : 'The last automatic sync failed. Try again now.'}
                </div>
              )}

              {/* Manual sync error (from the mutation) */}
              {errorMessage && (
                <div
                  role="alert"
                  style={{
                    marginTop: 4,
                    padding: '10px 12px',
                    borderRadius: 12,
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: 'var(--color-amber)',
                    border: '1px solid color-mix(in srgb, var(--color-amber) 30%, transparent)',
                    backgroundColor: 'color-mix(in srgb, var(--color-amber) 7%, transparent)',
                  }}
                >
                  {de ? 'Synchronisierung fehlgeschlagen' : 'Sync failed'} — {errorMessage}
                </div>
              )}
            </div>

            {/* Action */}
            <div
              style={{
                flexShrink: 0,
                padding: '10px 20px calc(16px + env(safe-area-inset-bottom, 0px))',
              }}
            >
              {connected ? (
                <button
                  type="button"
                  onClick={onSyncNow}
                  disabled={syncing}
                  className="w-full inline-flex items-center justify-center"
                  style={{
                    gap: 8,
                    minHeight: 48,
                    borderRadius: 14,
                    fontSize: 14,
                    fontWeight: 600,
                    color: syncing ? 'var(--color-muted)' : 'var(--color-paper)',
                    backgroundColor: syncing ? 'var(--color-paper-2)' : 'var(--color-ink)',
                    border: '1px solid var(--color-rule)',
                    cursor: syncing ? 'default' : 'pointer',
                    transition: 'background-color 200ms ease, color 200ms ease',
                  }}
                >
                  <RefreshCw size={15} strokeWidth={2.2} className={syncing ? 'animate-spin' : undefined} />
                  {syncing
                    ? de ? 'Synchronisiere…' : 'Syncing…'
                    : de ? 'Jetzt synchronisieren' : 'Sync now'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onConnect}
                  className="w-full inline-flex items-center justify-center"
                  style={{
                    gap: 8,
                    minHeight: 48,
                    borderRadius: 14,
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--color-paper)',
                    backgroundColor: 'var(--color-ink)',
                    border: '1px solid var(--color-rule)',
                    cursor: 'pointer',
                  }}
                >
                  {de ? 'Garmin verbinden' : 'Connect Garmin'}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(sheet, document.body)
}
