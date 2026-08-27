import { RefreshCw } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useGarminStatus } from '../../hooks/useGarminStatus'
import { useForceSync } from '../../hooks/useForceSync'
import { T } from './w3tokens'

/**
 * PULL THE WATCH NOW.
 *
 * Garmin is synced on an hourly schedule, which is right almost all of the
 * time and wrong in the one moment a rider cares about: they have just walked
 * in from a ride, opened the app, and their ride is not there. The hourly
 * cadence is invisible to them, so the screen simply looks broken. This is the
 * button that answers "where is my ride" without making anyone wait for a
 * clock they cannot see.
 *
 * IT ONLY EXISTS FOR A CONNECTED WATCH. `POST /garmin/sync` answers 404 when
 * no account is linked, and a button whose only outcome is an error is worse
 * than no button — the rider with no Garmin has nothing to force, and the
 * place to fix that is the devices screen. So this draws nothing at all until
 * `connected` is true, which also keeps it off the screen for anyone who
 * finished onboarding without a watch.
 *
 * A SYNC ALREADY RUNNING IS NOT A FAILURE. The backend answers 409 when the
 * hourly scheduler (or a second tap) is mid-sync. From where the rider stands
 * that is the thing they asked for already happening, so it reads as success:
 * the icon keeps spinning and the invalidation still fires when it settles.
 * Surfacing "409 Conflict" would be reporting our own scheduling as their
 * error.
 *
 * WHAT IT DOES NOT DO IS ANNOUNCE ITSELF. There is no toast and no result
 * count. The rider pressed this because something was missing from the screen;
 * the answer is that the missing thing appears, which `useForceSync` handles by
 * invalidating everything Today reads. A banner saying "1 activity synced" over
 * a screen that just filled itself in is a second, worse copy of the same news.
 */
export default function W3SyncChip({ size = 44, iconSize = 20 }: {
  size?: number
  iconSize?: number
}) {
  const { data: status, dataUpdatedAt } = useGarminStatus()
  const sync = useForceSync()
  const reduce = useReducedMotion()

  // Two ways to be busy, and they should look identical: this tab asked for a
  // sync, or the server says one is running for other reasons.
  const busy = sync.isPending || status?.sync_status === 'syncing'

  /**
   * BROKEN AND EMPTY LOOK THE SAME, AND THEY ARE NOT.
   *
   * `last_sync_at` and `sync_status` have always been on this response and
   * nothing has ever drawn them. So a rider whose Garmin token expired three
   * days ago sees exactly what a rider who genuinely has not ridden sees: an
   * empty screen. One of them should press this button and one of them should
   * go and reconnect their watch, and the app gave neither of them a way to
   * tell which they were.
   *
   * A DOT IS ENOUGH. This chip lives in a stack of 44px controls over the hero
   * and there is no room for a sentence — but there is room for one mark that
   * says "the thing behind this button is not well", which is the entire
   * decision the rider has to make. The detail belongs on the devices screen,
   * and that is where the label sends them.
   *
   * STALE IS NOT AN ERROR. Past a few hours the hourly pull has plainly not
   * run, which is worth a quiet mark; it is not worth alarm, because the usual
   * cause is a watch that has not been near a phone. Only a real auth failure
   * gets the warning colour.
   */
  const failed = status?.sync_status === 'auth_error' || status?.sync_status === 'error'
  //
   // MEASURED AGAINST WHEN WE ASKED, NOT AGAINST NOW. `Date.now()` in a render
   // body is impure and the lint rule is right to refuse it — but the query's
   // own fetch timestamp is also the more honest clock here: the answer is
   // "how stale was the sync when the server last told us", which cannot drift
   // as a tab sits open.
  const syncedAt = status?.last_sync_at ? Date.parse(status.last_sync_at) : NaN
  const staleHours = Number.isFinite(syncedAt) && dataUpdatedAt
    ? (dataUpdatedAt - syncedAt) / 3.6e6
    : null
  // Never seen a sync at all counts as stale: a connected watch that has never
  // delivered is exactly the case worth flagging.
  const stale = !busy && (staleHours === null || staleHours > 3)
  const mark = failed ? T.bad : stale ? T.mid : null

  if (!status?.connected) return null

  return (
    <button
      type="button"
      onClick={() => { if (!busy) sync.mutate() }}
      disabled={busy}
      aria-label={
        busy ? 'Garmin wird synchronisiert'
          : failed ? 'Garmin-Verbindung gestört — jetzt synchronisieren'
            : stale ? 'Garmin länger nicht synchronisiert — jetzt synchronisieren'
              : 'Garmin jetzt synchronisieren'
      }
      title={
        failed ? 'Verbindung zu Garmin gestört'
          : stale ? 'Länger nicht synchronisiert'
            : undefined
      }
      aria-busy={busy}
      style={{
        width: size, height: size, borderRadius: 100, flex: 'none',
        display: 'grid', placeItems: 'center',
        background: T.heroChip, border: 0, position: 'relative',
        // Not `not-allowed`: the button is doing what it was asked, and a
        // forbidden cursor says the tap was a mistake.
        cursor: busy ? 'progress' : 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}>
      <motion.span
        style={{ display: 'grid', placeItems: 'center' }}
        // The spin IS the feedback — the only thing this button has to say is
        // "working", and it says it in the same place the rider is looking.
        animate={busy && !reduce ? { rotate: 360 } : { rotate: 0 }}
        transition={busy && !reduce
          ? { duration: 1.1, ease: 'linear', repeat: Infinity }
          : { duration: 0.2 }}>
        <RefreshCw size={iconSize} color={busy ? T.acid : T.ink} strokeWidth={2} />
      </motion.span>
      {mark && (
        <span
          aria-hidden
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 7, height: 7, borderRadius: 100, background: mark,
            // Ringed in the chip's own ground so it reads as a mark ON the
            // control rather than a speck of dust on the photograph behind it.
            boxShadow: `0 0 0 2px ${T.heroChip}`,
          }} />
      )}
    </button>
  )
}
