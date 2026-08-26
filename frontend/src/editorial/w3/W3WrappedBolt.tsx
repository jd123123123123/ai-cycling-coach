import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useQuery } from '@tanstack/react-query'
import { Zap, X } from 'lucide-react'
import { apiClient } from '../../api/client'
import { isoWeekKey } from '../../components/dashboard/WeeklyWrappedBanner'
import type { Wrapped } from '../../pages/WeeklyWrapped'
import { T, FONT, EASE } from './w3tokens'

/**
 * THE BOLT — the week's deck, offered once, at the top of a new week.
 *
 * WHY IT IS A BOLT AND NOT A CARD. This has one job: make a rider want to tap
 * it. A summary card that shows the numbers has already given away the thing it
 * is inviting you to look at — the invitation and the payoff cannot be the same
 * object. So it shows NO statistics. It says a week is ready and it glows.
 *
 * ONCE PER WEEK, AND DISMISSIBLE. It shares `wrapped_seen_week` with the old
 * dashboard's banner, so opening the deck on either surface retires it on both
 * — a rider who has seen their week should not be chased across two screens by
 * the same offer. Opening it counts as seen; so does dismissing it. That is the
 * difference between a ritual and a nag.
 *
 * A WEEK WITH NO RIDES SHOWS NOTHING. `has_rides` gates the whole component.
 * Inviting somebody to celebrate a week they did not ride is the single worst
 * thing this feature could do.
 */

const STORAGE_KEY = 'wrapped_seen_week'

export default function W3WrappedBolt({ onOpen }: { onOpen: () => void }) {
  const reduce = useReducedMotion()
  const week = isoWeekKey()

  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === week } catch { return false }
  })

  const { data } = useQuery<Wrapped>({
    queryKey: ['analytics', 'weekly-wrapped', 'de'],
    queryFn: async () => (await apiClient.get<Wrapped>('/analytics/weekly-wrapped?locale=de')).data,
    staleTime: 60 * 60 * 1000,
    enabled: !dismissed,
  })

  if (dismissed || !data?.has_rides) return null

  const seen = () => { try { localStorage.setItem(STORAGE_KEY, week) } catch { /* private mode */ } }

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE }}
      style={{ padding: '0 20px', position: 'relative' }}>
      <button
        onClick={() => { seen(); onOpen() }}
        style={{
          width: '100%', border: 0, cursor: 'pointer', fontFamily: FONT, textAlign: 'left',
          padding: '17px 18px', borderRadius: 22, background: T.acid,
          display: 'flex', alignItems: 'center', gap: 14, position: 'relative', overflow: 'hidden',
        }}>
        {/* The charge: one pass of light across the pill, slow enough to read
            as anticipation rather than as a loading bar. */}
        {!reduce && (
          <motion.div aria-hidden
            initial={{ x: '-120%' }}
            animate={{ x: '120%' }}
            transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 2.6 }}
            style={{
              position: 'absolute', top: 0, bottom: 0, width: '55%',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.34), transparent)',
            }} />
        )}
        <span style={{
          width: 38, height: 38, flex: 'none', borderRadius: 100, background: T.bg,
          display: 'grid', placeItems: 'center', position: 'relative',
        }}>
          <Zap size={19} color={T.acid} fill={T.acid} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, position: 'relative' }}>
          <span style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: -0.3, color: T.bg }}>
            Deine Woche ist fertig
          </span>
          {/* No numbers. The invitation must not spend the payoff. */}
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(11,11,11,0.66)' }}>
            Sieben Tage in einer Minute
          </span>
        </span>
      </button>
      <button
        onClick={() => { seen(); setDismissed(true) }}
        aria-label="Nicht jetzt"
        style={{
          position: 'absolute', top: -6, right: 12, width: 26, height: 26, borderRadius: 100,
          background: T.surface2, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer',
        }}>
        <X size={12} color={T.mid} />
      </button>
    </motion.div>
  )
}
