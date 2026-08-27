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
  const { data: status } = useGarminStatus()
  const sync = useForceSync()
  const reduce = useReducedMotion()

  // Two ways to be busy, and they should look identical: this tab asked for a
  // sync, or the server says one is running for other reasons.
  const busy = sync.isPending || status?.sync_status === 'syncing'

  if (!status?.connected) return null

  return (
    <button
      type="button"
      onClick={() => { if (!busy) sync.mutate() }}
      disabled={busy}
      aria-label={busy ? 'Garmin wird synchronisiert' : 'Garmin jetzt synchronisieren'}
      aria-busy={busy}
      style={{
        width: size, height: size, borderRadius: 100, flex: 'none',
        display: 'grid', placeItems: 'center',
        background: T.heroChip, border: 0,
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
    </button>
  )
}
