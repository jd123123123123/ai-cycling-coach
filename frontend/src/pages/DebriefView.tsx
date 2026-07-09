import type { ReactNode } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { useLocale } from '../contexts/LocaleContext'
import { useRaceDebrief } from '../hooks/useRaceDebrief'
import DebriefHero from '../components/debrief/DebriefHero'
import KeyReads from '../components/debrief/KeyReads'
import CompareDuel from '../components/debrief/CompareDuel'
import RideStory from '../components/debrief/RideStory'
import BreakdownPanels from '../components/debrief/BreakdownPanels'
import DebriefPlan from '../components/debrief/DebriefPlan'

// Each debrief act rises in on a staggered, spring-eased cadence — the report
// reveals itself as a narrative rather than dumping all at once.
function Act({ order, children }: { order: number; children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: Math.min(order * 0.08, 0.4) }}
    >
      {children}
    </motion.section>
  )
}

export default function DebriefView() {
  const { id } = useParams()
  const activityId = id ? Number(id) : undefined
  const { locale } = useLocale()
  const { data, isLoading, isError } = useRaceDebrief(activityId)

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-9 sm:gap-11">
        <Link
          to="/dashboard?tab=analyze"
          className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 transition-colors"
          style={{ fontSize: 12.5, color: 'var(--color-ink-2)', border: '1px solid var(--color-rule)' }}
        >
          {locale === 'de' ? '← Zurück' : '← Back'}
        </Link>
        {isLoading && (
          <div className="flex flex-col gap-4">
            <div className="rounded-[20px] h-56 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
            <div className="rounded-[18px] h-72 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
          </div>
        )}
        {isError && (
          <p style={{ color: 'var(--color-bad)', fontSize: 14 }}>
            {locale === 'de'
              ? 'Analyse konnte nicht geladen werden. Braucht diese Fahrt Leistungsdaten?'
              : "Couldn't load this debrief. Does the ride have power data?"}
          </p>
        )}
        {data && (
          <>
            <Act order={0}><DebriefHero report={data} /></Act>
            <Act order={1}><KeyReads report={data} /></Act>
            {activityId != null && (
              <Act order={2}><CompareDuel activityId={activityId} /></Act>
            )}
            <Act order={3}><RideStory story={data.story} climbs={data.climbs} /></Act>
            <Act order={4}><BreakdownPanels report={data} /></Act>
            <Act order={5}><DebriefPlan plan={data.plan} /></Act>
          </>
        )}
      </div>
    </div>
  )
}
