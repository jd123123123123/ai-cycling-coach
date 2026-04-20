/**
 * SyncButton — masthead action to force-pull the latest Garmin data.
 *
 * Visual states:
 *   - idle     : static RefreshCw icon, clickable
 *   - syncing  : spinning RefreshCw, disabled, muted tone
 *   - done     : icon pulses green briefly (1.2s), then returns to idle
 *
 * On success it invalidates every query touching Garmin-sourced data (see
 * useForceSync for the list), so the dashboard re-renders without a page
 * reload.
 *
 * Errors:
 *   - 404 "No Garmin account connected" → show the message in a brief
 *     inline error toast; the user probably hasn't finished onboarding.
 *   - 409 "Sync already in progress" → another tab / the scheduler is
 *     already running. Message via the error toast.
 *   - 401 "Garmin authentication failed" → reconnect flow hint.
 *   - Network / 500 → generic "Sync failed" with the server's detail.
 */
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useForceSync } from '../../hooks/useForceSync'

type SyncUiState = 'idle' | 'syncing' | 'done'

// How long the "done" pulse lingers before returning to idle. 1.2s feels
// intentional without blocking a second click for too long.
const DONE_HOLD_MS = 1200

function extractAxiosMessage(err: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyErr = err as any
  const detail = anyErr?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim().length > 0) return detail
  const msg = anyErr?.message
  if (typeof msg === 'string' && msg.trim().length > 0) return msg
  return 'Sync failed'
}

export default function SyncButton() {
  const sync = useForceSync()
  const [uiState, setUiState] = useState<SyncUiState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Reflect the mutation's pending/success lifecycle into our UI state.
  // We manage the 'done' → 'idle' hold here so the green pulse doesn't
  // disappear the instant the mutation resolves.
  useEffect(() => {
    if (sync.isPending) {
      setUiState('syncing')
      setErrorMsg(null)
      return
    }
    if (sync.isSuccess) {
      setUiState('done')
      const t = setTimeout(() => setUiState('idle'), DONE_HOLD_MS)
      return () => clearTimeout(t)
    }
    if (sync.isError) {
      setUiState('idle')
      setErrorMsg(`Sync failed — ${extractAxiosMessage(sync.error)}`)
      // Auto-dismiss the error toast after 6s so it doesn't linger forever
      const t = setTimeout(() => setErrorMsg(null), 6000)
      return () => clearTimeout(t)
    }
  }, [sync.isPending, sync.isSuccess, sync.isError, sync.error])

  const handleClick = useCallback(() => {
    if (sync.isPending) return
    setErrorMsg(null)
    sync.mutate()
  }, [sync])

  const isDisabled = uiState === 'syncing'
  const isDone = uiState === 'done'

  const baseColor = isDone ? 'var(--color-forest-2)' : 'var(--color-ink-2)'
  const baseBorder = isDone ? 'var(--color-forest-2)' : 'var(--color-rule)'
  const baseBackground = isDone ? 'rgba(48, 108, 64, 0.08)' : 'transparent'

  const title = isDisabled
    ? 'Syncing with Garmin…'
    : isDone
      ? 'Sync complete'
      : 'Pull latest activities and metrics from Garmin'

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        aria-label={title}
        title={title}
        aria-busy={isDisabled}
        className="inline-flex items-center justify-center rounded-full transition-colors"
        style={{
          width: 36,
          height: 28,
          color: baseColor,
          border: `1px solid ${baseBorder}`,
          backgroundColor: baseBackground,
          opacity: isDisabled ? 0.75 : 1,
        }}
      >
        <RefreshCw
          size={14}
          strokeWidth={1.8}
          className={isDisabled ? 'animate-spin' : ''}
          aria-hidden
        />
      </button>

      {errorMsg && (
        <div
          role="alert"
          className="absolute top-full mt-2 right-0 num-mono text-[11px] leading-snug px-2.5 py-1.5 rounded-md shadow-sm whitespace-nowrap"
          style={{
            color: 'var(--color-alert)',
            backgroundColor: 'var(--color-paper)',
            border: '1px solid rgba(138, 29, 29, 0.25)',
            zIndex: 50,
            maxWidth: 280,
          }}
        >
          {errorMsg}
        </div>
      )}
    </div>
  )
}
