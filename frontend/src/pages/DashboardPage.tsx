/**
 * DashboardPage — tab orchestrator.
 *
 * Three surfaces, each with one job:
 *   - today  → the verdict (readiness + prescription, one glance)
 *   - train  → the plan (this week + day structure + plan-vs-actual)
 *   - trends → the evidence (PMC, distribution, biometrics, estimates, history)
 *
 * Legacy `?tab=bike|run` redirect to `today`; `?tab=week` aliases `train`;
 * `?tab=crew` still renders the Crew surface (not in the nav until it's real).
 *
 * Tab state lives in the `?tab` URL search param (default 'today'), written
 * back with `replace: true` so back-nav doesn't accumulate tab changes.
 */
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useReducedMotion } from 'motion/react'
import DashboardShell from '../components/dashboard/DashboardShell'
import StickyReadinessBar from '../components/dashboard/StickyReadinessBar'
import TodayTab from '../components/dashboard/tabs/TodayTab'
import WeekTab from '../components/dashboard/tabs/WeekTab'
import AnalyzeTab from '../components/dashboard/tabs/AnalyzeTab'
import CrewTab from '../components/dashboard/tabs/CrewTab'
import { SegmentedTabs } from '../components/ui/SegmentedTabs'
import { useT } from '../contexts/LocaleContext'

type TabId = 'today' | 'train' | 'analyze' | 'crew'

function resolveTab(raw: string | null): TabId {
  switch (raw) {
    case 'today': return 'today'
    case 'train':
    case 'week': return 'train'
    case 'analyze': return 'analyze'
    case 'crew': return 'crew'
    // analytics surfaces folded into the Analyze hub
    case 'trends':
    case 'report': return 'analyze'
    // legacy sport tabs collapsed into Today
    case 'bike':
    case 'run':
    default: return 'today'
  }
}

export default function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const reducedMotion = useReducedMotion()

  const activeTab: TabId = resolveTab(searchParams.get('tab'))

  const handleTabChange = (id: TabId) => {
    setSearchParams({ tab: id }, { replace: true })
  }

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [activeTab])

  const t = useT()
  const tabs: readonly { id: TabId; label: string }[] = [
    { id: 'today',   label: t('tab_today') },
    { id: 'train',   label: t('tab_train') },
    { id: 'analyze', label: t('tab_analyze') },
    { id: 'crew',    label: t('tab_crew') },
  ]

  const tabContent = (() => {
    switch (activeTab) {
      case 'today':   return <TodayTab />
      case 'train':   return <WeekTab />
      case 'analyze': return <AnalyzeTab />
      case 'crew':    return <CrewTab />
    }
  })()

  const navValue: TabId = activeTab

  return (
    <DashboardShell
      stickyBar={<StickyReadinessBar />}
      tabs={
        // Desktop only — on <lg viewports MobileBottomNav owns navigation
        // and the top tab strip is redundant + steals header height.
        <div className="hidden lg:block">
          <SegmentedTabs
            tabs={tabs}
            value={navValue}
            onChange={handleTabChange}
            ariaLabel="Dashboard sections"
          />
          <div className="hairline" />
        </div>
      }
    >
      <div
        key={activeTab}
        style={reducedMotion ? undefined : { animation: 'tabpanel-in 250ms var(--ease-apple-default) both' }}
      >
        {tabContent}
      </div>
    </DashboardShell>
  )
}
