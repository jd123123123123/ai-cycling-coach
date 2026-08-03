import { motion, useReducedMotion } from 'motion/react'
import { Check, Flame, Moon, Mountain, TrendingUp, Trophy } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Moment, MomentKind } from '../../utils/moments'
import { useLocale } from '../../contexts/LocaleContext'

/**
 * MomentCard — the quiet half of the reward layer.
 *
 * Loud moments (a PR, an FTP jump) go through CelebrationOverlay/Confetti.
 * This card is for the everyday ones, and it is deliberately restrained: the
 * app's resting state is calm and editorial, and a full-screen celebration for
 * "you rested when told to" would be exhausting by the third day. The reward
 * has to be repeatable to be habit-forming, which means it has to be small.
 *
 * Copy note: `rest_honoured` is phrased as an achievement, not as a
 * consolation. "Rest taken, as prescribed" — not "no ride today". The whole
 * point of the adherence streak is that this day COUNTS, and the wording is
 * where the athlete actually feels that.
 */

const ICONS: Record<MomentKind, ReactNode> = {
  session_as_prescribed: <Check size={16} strokeWidth={2.5} />,
  rest_honoured: <Moon size={16} strokeWidth={2.5} />,
  zone_held: <Mountain size={16} strokeWidth={2.5} />,
  streak_extended: <Flame size={16} strokeWidth={2.5} />,
  personal_record: <Trophy size={16} strokeWidth={2.5} />,
  ftp_gain: <TrendingUp size={16} strokeWidth={2.5} />,
  plan_week_complete: <Check size={16} strokeWidth={2.5} />,
}

const COPY: Record<MomentKind, { en: string; de: string }> = {
  session_as_prescribed: { en: 'Session done, as prescribed', de: 'Einheit erledigt, wie geplant' },
  rest_honoured: { en: 'Rest taken, as prescribed', de: 'Pause genommen, wie geplant' },
  zone_held: { en: 'You held the zone', de: 'Zone gehalten' },
  streak_extended: { en: 'Streak extended', de: 'Serie verlängert' },
  personal_record: { en: 'Personal record', de: 'Persönliche Bestleistung' },
  ftp_gain: { en: 'FTP is up', de: 'FTP gestiegen' },
  plan_week_complete: { en: 'Plan week complete', de: 'Planwoche komplett' },
}

/** Rest earns the calm token, effort the warm one — the colour agrees with the copy. */
const TONE: Record<MomentKind, string> = {
  session_as_prescribed: 'var(--color-forest)',
  rest_honoured: 'var(--color-ink-blue)',
  zone_held: 'var(--color-forest)',
  streak_extended: 'var(--color-gold)',
  personal_record: 'var(--color-gold)',
  ftp_gain: 'var(--color-forest)',
  plan_week_complete: 'var(--color-forest)',
}

export default function MomentCard({ moment }: { moment: Moment }) {
  const reduced = useReducedMotion()
  const { locale } = useLocale()
  const de = locale === 'de'
  const tone = TONE[moment.kind]

  return (
    <motion.div
      data-glass-card="true"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
      className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
      style={{
        background: 'var(--color-surface-2)',
        // Accent as an edge, not a wash — the card weight system from b864471.
        borderLeft: `2px solid ${tone}`,
        border: '1px solid var(--color-rule)',
        borderLeftWidth: 2,
        borderLeftColor: tone,
      }}
    >
      <span
        className="grid shrink-0 place-items-center rounded-full"
        style={{
          width: 30,
          height: 30,
          color: tone,
          background: `color-mix(in srgb, ${tone} 15%, transparent)`,
        }}
      >
        {ICONS[moment.kind]}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>
        {de ? COPY[moment.kind].de : COPY[moment.kind].en}
      </span>
    </motion.div>
  )
}
