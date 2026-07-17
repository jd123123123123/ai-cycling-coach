import { useParams, Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { useLocale } from '../contexts/LocaleContext'
import { useSessionReport } from '../hooks/useSessionReport'
import SessionReportCard from '../components/session/SessionReportCard'

export default function SessionReportView() {
  const { id } = useParams()
  const activityId = id ? Number(id) : undefined
  const { locale } = useLocale()
  const de = locale === 'de'
  const reduce = useReducedMotion()
  const { data, isLoading, isError } = useSessionReport(activityId)

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-7">
        <Link
          to="/dashboard?tab=history"
          className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5"
          style={{ fontSize: 12.5, color: 'var(--color-ink-2)', border: '1px solid var(--color-rule)' }}
        >
          {de ? '← Zurück' : '← Back'}
        </Link>

        {isLoading && (
          <div className="rounded-[22px] h-96 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
        )}
        {isError && (
          <p style={{ color: 'var(--color-bad)', fontSize: 14 }}>
            {de ? 'Einheiten-Report konnte nicht geladen werden.' : "Couldn't load this session report."}
          </p>
        )}
        {data && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <SessionReportCard report={data} />
          </motion.div>
        )}
      </div>
    </div>
  )
}
