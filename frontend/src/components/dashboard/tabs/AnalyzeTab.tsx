/**
 * AnalyzeTab — one analytical narrative, not three sub-tabs.
 *
 * The Report (period grade → diagnosis → prescription) is the MECE story lead;
 * the raw charts (PMC, distribution, biometrics, estimates, history) are a
 * collapsed drill-down beneath it. Both rise in on a staggered cadence, matching
 * the Today dashboard. The custom-chart Workspace lives at /dashboards.
 */
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import ReportTab from './ReportTab'
import TrendsTab from './TrendsTab'
import DashboardSection from '../DashboardSection'
import { useT } from '../../../contexts/LocaleContext'

function Act({ order, children }: { order: number; children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: Math.min(order * 0.1, 0.3) }}
    >
      {children}
    </motion.section>
  )
}

export default function AnalyzeTab() {
  const t = useT()
  return (
    <div className="flex flex-col gap-9 sm:gap-11">
      <Act order={0}><ReportTab /></Act>
      <Act order={1}>
        <DashboardSection id="analyze-charts" title={t('analyze_charts')} defaultExpanded={false}>
          <TrendsTab />
        </DashboardSection>
      </Act>
    </div>
  )
}
