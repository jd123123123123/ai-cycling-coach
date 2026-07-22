/**
 * StreakBreakWatcher — global, honest "streak lost" detector.
 *
 * Mounted once (in CelebrationTriggers, inside the CelebrationProvider). It
 * reads the same forgiving server streak everything else does and fires the
 * soft StreakBreakOverlay exactly once when a REAL break happens:
 *
 *   • It tracks the last-seen streak length per user in localStorage
 *     (`streak:last:<userId>`) so a *drop* is detectable across sessions.
 *   • A break = a meaningful streak (≥3) collapsing back to 0/1 (detectStreakBreak).
 *   • It only fires when the recent week actually contains a break-causing day
 *     (`missed`/`unplanned`) — a protected Ruhetag or a paused sick/injured day
 *     never trips it (hasGenuineBreakDay). The server already guarantees this;
 *     this is the belt-and-suspenders client guard.
 *   • First load with no history seeds the store silently (never fires).
 *   • Deduped per break instance (streakBreakDedupKey) so it shows once, ever.
 *
 * The break is a soft moment (no confetti), but it rides the SAME sequential
 * celebration queue as the happy cards — enqueued via `enqueueStreakBreak` — so
 * a celebration and a break can never overlap on screen, and a break simply
 * plays after any happy card that fired in the same tick (it sorts lowest, so
 * we never open on a downer). This watcher is pure signal: it detects the real
 * break and enqueues; the provider owns the overlay slot.
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStreak, useRepairStreak } from '../../hooks/useStreak'
import { useAuth } from '../../contexts/AuthContext'
import { useLocale } from '../../contexts/LocaleContext'
import { useCelebrate } from '../../contexts/CelebrationContext'
import {
  detectStreakBreak,
  hasGenuineBreakDay,
  readStoredStreak,
  writeStoredStreak,
  streakBreakDedupKey,
  localDateKey,
  hasCelebrated,
  markCelebrated,
} from '../../lib/celebration'

export default function StreakBreakWatcher() {
  const { data } = useStreak()
  const { user } = useAuth()
  const { locale } = useLocale()
  const navigate = useNavigate()
  const { enqueueStreakBreak } = useCelebrate()
  const repair = useRepairStreak()
  const de = locale === 'de'

  const userId = user?.id
  const streak = data?.streak
  const week = data?.week

  useEffect(() => {
    if (userId == null || typeof streak !== 'number') return

    const prev = readStoredStreak(userId)
    const { broke, brokenLength } = detectStreakBreak(prev, streak)

    // Always keep the store current so the next drop is measurable. We do this
    // whether or not we fire — including the silent first-load seed.
    writeStoredStreak(userId, streak)

    if (!broke) return
    // Second, honest guard: suppress unless a real break-causing day exists in
    // the recent week (a protected Ruhetag / paused day must never fire this).
    if (!hasGenuineBreakDay(week)) return

    const key = streakBreakDedupKey(userId, brokenLength, localDateKey(new Date()))
    if (hasCelebrated(key)) return
    markCelebrated(key)

    enqueueStreakBreak({
      brokenLength,
      unit: de ? 'Tage' : 'days',
      kicker: de ? 'Serie gerissen' : 'Streak lost',
      detail: de
        ? 'Kein Drama — die beste Zeit für eine neue Serie ist heute.'
        : 'No drama — the best day to start a new streak is today.',
      ctaLabel: de ? 'Neue Serie starten' : 'Start a new streak',
      // The provider drains the queue after this runs.
      onCta: () => navigate('/workout/today'),
      dismissLabel: de ? 'Später' : 'Later',
      // One-tap morning-after repair (backlog 03·C2): a fresh sync + honest
      // re-evaluation. Restores the streak ONLY when a real ride for the missed
      // day now exists — never a manipulative free undo.
      repair: {
        run: async () => {
          const res = await repair.mutateAsync()
          return { repaired: res.repaired, streak: res.streak }
        },
        checkLabel: de ? 'Ich bin gefahren — prüfen' : "I did ride — check",
        checkingLabel: de ? 'Prüfe deine Fahrten …' : 'Checking your rides …',
        restoredKicker: de ? 'Serie gerettet' : 'Streak saved',
        restoredDetail: de
          ? 'Deine Fahrt war da — nur noch nicht synchronisiert. Deine Serie läuft weiter.'
          : 'Your ride was there — just not synced yet. Your streak lives on.',
        doneLabel: de ? 'Weiter' : 'Continue',
        nomatchDetail: de
          ? 'Keine Fahrt für den Tag gefunden — alles gut. Kein Tag definiert deine Form.'
          : 'No ride found for that day — all good. No single day defines your fitness.',
        errorDetail: de
          ? 'Prüfung gerade nicht möglich. Versuch es gleich nochmal.'
          : "Couldn't check right now. Give it another try in a moment.",
        retryLabel: de ? 'Erneut prüfen' : 'Check again',
      },
    })
    // We deliberately depend only on the live streak + identity. `week` is read
    // at fire time; `de` re-labels a live card, which is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, streak, de])

  return null
}
