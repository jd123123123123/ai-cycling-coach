/**
 * CelebrationTriggers — global, data-driven celebration watchers.
 *
 * Mounted once by CelebrationProvider. Reads existing app data and fires an
 * honest, deduped celebration when a REAL milestone is reached:
 *   • Streak milestone — useStreak.streak hits 3 / 7 / 14 / 30 / 50 / 100 / …
 *   • Weekly rhythm complete — every planned day this week met (consistency).
 *
 * Ride PBs are triggered locally in RideRecapView (the surface that owns the
 * viewed activity's is_pr data). Everything here needs no feature-code changes.
 */
import { useEffect } from 'react'
import { useStreak } from '../../hooks/useStreak'
import { useLocale } from '../../contexts/LocaleContext'
import { useCelebrate } from '../../contexts/CelebrationContext'
import {
  streakMilestone,
  streakDedupKey,
  weeklyDedupKey,
  isoWeekKey,
} from '../../lib/celebration'

function StreakWatcher() {
  const { data } = useStreak()
  const { locale } = useLocale()
  const de = locale === 'de'
  const { celebrateOnce } = useCelebrate()

  const streak = data?.streak
  const paused = data?.paused

  useEffect(() => {
    if (typeof streak !== 'number' || paused) return
    const m = streakMilestone(streak)
    if (m == null) return
    celebrateOnce(streakDedupKey(m), 'streak', {
      kicker: de ? 'SERIE GEHALTEN' : 'STREAK KEPT',
      value: m,
      unit: de ? 'Tage' : 'days',
      rarity: m >= 100 ? (de ? 'LEGENDÄR' : 'LEGENDARY') : m >= 30 ? (de ? 'STARK' : 'STRONG') : undefined,
      detail: de
        ? `${m} Tage am Stück im Plan geblieben — Beständigkeit schlägt Intensität.`
        : `${m} days in a row on plan — consistency beats intensity.`,
    })
  }, [streak, paused, de, celebrateOnce])

  return null
}

function WeeklyRhythmWatcher() {
  const { data } = useStreak()
  const { locale } = useLocale()
  const de = locale === 'de'
  const { celebrateOnce } = useCelebrate()

  const met = data?.consistency?.met
  const planned = data?.consistency?.planned

  useEffect(() => {
    if (typeof met !== 'number' || typeof planned !== 'number') return
    if (planned <= 0 || met < planned) return
    const key = weeklyDedupKey(isoWeekKey(new Date()))
    celebrateOnce(key, 'weekly', {
      kicker: de ? 'WOCHE KOMPLETT' : 'WEEK COMPLETE',
      value: `${met}/${planned}`,
      detail: de
        ? 'Jeden geplanten Tag dieser Woche erfüllt. Starke, saubere Woche.'
        : 'Every planned day this week met. Strong, clean week.',
    })
  }, [met, planned, de, celebrateOnce])

  return null
}

export default function CelebrationTriggers() {
  return (
    <>
      <StreakWatcher />
      <WeeklyRhythmWatcher />
    </>
  )
}
