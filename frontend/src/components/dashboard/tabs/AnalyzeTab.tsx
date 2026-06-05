/**
 * AnalyzeTab — the analytics hub.
 *
 * Groups the three analytical surfaces behind one primary-nav destination so
 * the thumb bar stays uncrowded:
 *   · Overview  → TrendsTab          (PMC, distribution, biometrics, history)
 *   · Report    → ReportTab          (period grade + verdict)
 *   · Workspace → DashboardsWorkspace (custom chart builder)
 *
 * The active sub-surface persists in the `?sub=` URL param (default 'overview')
 * so deep links and back-nav land on the right surface. Legacy `?tab=trends`
 * and `?tab=report` redirect here via DashboardPage.resolveTab.
 */
import { useSearchParams } from 'react-router-dom'
import { useReducedMotion } from 'motion/react'
import { SegmentedTabs } from '../../ui/SegmentedTabs'
import { useT } from '../../../contexts/LocaleContext'
import TrendsTab from './TrendsTab'
import ReportTab from './ReportTab'
import DashboardsWorkspace from '../DashboardsWorkspace'

export type AnalyzeSub = 'overview' | 'report' | 'workspace'

export function resolveSub(raw: string | null): AnalyzeSub {
  switch (raw) {
    case 'report': return 'report'
    case 'workspace': return 'workspace'
    case 'overview':
    default: return 'overview'
  }
}

export default function AnalyzeTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const reducedMotion = useReducedMotion()
  const t = useT()

  // No explicit ?sub= yet → honor a legacy ?tab=report deep link by opening the
  // Report sub-surface; otherwise default to Overview.
  const rawSub = searchParams.get('sub')
  const sub = resolveSub(rawSub ?? (searchParams.get('tab') === 'report' ? 'report' : null))

  const handleSubChange = (id: AnalyzeSub) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', 'analyze')
    next.set('sub', id)
    setSearchParams(next, { replace: true })
  }

  const subTabs: readonly { id: AnalyzeSub; label: string }[] = [
    { id: 'overview',  label: t('analyze_overview') },
    { id: 'report',    label: t('analyze_report') },
    { id: 'workspace', label: t('analyze_workspace') },
  ]

  const content = (() => {
    switch (sub) {
      case 'overview':  return <TrendsTab />
      case 'report':    return <ReportTab />
      case 'workspace': return <DashboardsWorkspace />
    }
  })()

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-center sm:justify-start">
        <SegmentedTabs
          tabs={subTabs}
          value={sub}
          onChange={handleSubChange}
          ariaLabel="Analyze sections"
          indicatorId="analyze-subnav-indicator"
        />
      </div>

      <div
        key={sub}
        style={reducedMotion ? undefined : { animation: 'tabpanel-in 250ms var(--ease-apple-default) both' }}
      >
        {content}
      </div>
    </div>
  )
}
