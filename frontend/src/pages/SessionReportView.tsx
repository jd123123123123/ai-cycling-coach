import { useNavigate, useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { useLocale } from '../contexts/LocaleContext'
import { useSessionReport } from '../hooks/useSessionReport'
import SessionReportCard from '../components/session/SessionReportCard'
import AppShell from '../components/shell/AppShell'

export default function SessionReportView() {
  const { id } = useParams()
  const activityId = id ? Number(id) : undefined
  const { locale } = useLocale()
  const de = locale === 'de'
  const reduce = useReducedMotion()
  const navigate = useNavigate()
  const { data, isLoading, isError } = useSessionReport(activityId)

  return (
    <AppShell
      title={de ? 'Einheiten-Report' : 'Session report'}
      // A session report is usually reached from History, but it is also a
      // shareable deep link. Popping history when there is some, and falling
      // back to History when there is none, keeps both entry paths sane.
      onBack={() =>
        window.history.length > 1 ? navigate(-1) : navigate('/dashboard?tab=history')
      }
    >
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
    </AppShell>
  )
}
