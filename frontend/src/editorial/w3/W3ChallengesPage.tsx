import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  useRewardChallenges, useJoinChallenge, useChallengeDays,
} from '../../hooks/useRewardChallenges'
import {
  CHALLENGE_METRICS, fetchChallengeDays, type ChallengeMetric,
} from '../../api/rewardChallenges'
import { useAuth } from '../../contexts/AuthContext'
import { monthFacts } from './w3challengeMonth'
import W3ChallengesView, { leadOf } from './W3ChallengesView'
import W3ChallengeBoard from './W3ChallengeBoard'
import W3ChallengeEditor from './W3ChallengeEditor'
import { renderChallengeCard, sharePoster, canShareImage, downloadPoster } from './w3share'

/**
 * RIDR · CHALLENGES, wired. Route /e/w3-challenges.
 *
 * Owns the queries, the three mutations and the two sheets; `W3ChallengesView`
 * owns the layout and is a pure function of props, so the preview route renders
 * the REAL screen rather than a lookalike kept in sync by hand.
 *
 * THE DAY SERIES IS FETCHED FOR THE LEAD ALONE. Every board row and every day
 * series costs the server an activity query, so the seven cards on this screen
 * carry a participant COUNT (one grouped query for all of them) and only the
 * one challenge drawn as a month asks for its days.
 */

const nf = new Intl.NumberFormat('de-DE')
const UNIT: Record<ChallengeMetric, string> = Object.fromEntries(
  CHALLENGE_METRICS.map((m) => [m.metric, m.unit]),
) as Record<ChallengeMetric, string>

export default function W3ChallengesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data, isLoading } = useRewardChallenges()
  const join = useJoinChallenge()

  const [joining, setJoining] = useState<string | null>(null)
  const [board, setBoard] = useState<{ key: string; title: string; unit: string } | null>(null)
  const [editor, setEditor] = useState(false)
  const [poster, setPoster] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

  const period = data?.period ?? ''
  const active = useMemo(() => data?.active ?? [], [data])
  const available = data?.available ?? []
  const lead = useMemo(() => leadOf(active), [active])
  const { data: dayData } = useChallengeDays(lead?.key ?? null)

  const earned = active.reduce((s, c) => s + (c.awarded_rc ?? 0), 0)

  const share = async () => {
    if (!lead) return
    setSharing(true)
    try {
      const { days: dayCount, todayIndex } = monthFacts(period)
      // Re-read rather than reuse what is on screen: a share always carries
      // today's month, not the one that was loaded when the page opened.
      const series = await fetchChallengeDays(lead.key)
        .then((r) => r.days ?? [])
        .catch(() => [] as number[])
      const strip = series.length > 0 ? series : Array.from({ length: dayCount }, () => 0)
      const unit = UNIT[lead.metric] ?? ''

      const { blob, dataUrl } = await renderChallengeCard({
        title: lead.title,
        value: nf.format(Math.round(lead.value)),
        target: nf.format(lead.target),
        unit,
        pct: lead.pct,
        days: strip,
        todayIndex,
        standing: null,
        earned: lead.completed ? `${nf.format(lead.awarded_rc ?? lead.reward_rc)} RIDECOIN` : null,
        handle: user?.display_name || user?.email?.split('@')[0] || '',
        footer: period,
      })
      setPoster(dataUrl || null)
      if (blob) {
        const caption = lead.completed
          ? `${lead.title} — geschafft.`
          : `${lead.title} — ${nf.format(Math.round(lead.value))} von ${nf.format(lead.target)} ${unit}.`
        if (canShareImage()) await sharePoster(blob, caption, 'ridr-challenge.png')
        else downloadPoster(blob, 'ridr-challenge.png')
      }
    } finally {
      setSharing(false)
    }
  }

  return (
    <>
      <W3ChallengesView
        period={period}
        active={active}
        available={available}
        loading={isLoading}
        leadDays={dayData?.days ?? []}
        earned={earned}
        joining={joining}
        sharing={sharing}
        onBack={() => navigate(-1)}
        onJoin={(key) => {
          setJoining(key)
          join.mutate(key, { onSettled: () => setJoining(null) })
        }}
        onBoard={setBoard}
        onCreate={() => setEditor(true)}
        onShare={share} />

      <AnimatePresence>
        {board && (
          <W3ChallengeBoard key={board.key} challengeKey={board.key} title={board.title}
            unit={board.unit} onClose={() => setBoard(null)} />
        )}
      </AnimatePresence>

      {editor && <W3ChallengeEditor onClose={() => setEditor(false)} />}

      {/* The poster, once, so the rider sees what left the app. Tapping it away
          is the only control it needs — the share sheet already happened. */}
      <AnimatePresence>
        {poster && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setPoster(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 70, background: '#000000D9',
              display: 'grid', placeItems: 'center', padding: 26, cursor: 'pointer',
            }}>
            <img src={poster} alt="Challenge-Poster"
              style={{ maxWidth: '100%', maxHeight: '80dvh', borderRadius: 18 }} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
