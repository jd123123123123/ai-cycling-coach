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
import GarminSyncedBanner from '../components/dashboard/GarminSyncedBanner'
import TodayTab from '../components/dashboard/tabs/TodayTab'
import PlanTab from '../components/dashboard/tabs/PlanTab'
import AnalyzeTab from '../components/dashboard/tabs/AnalyzeTab'
import CrewTab from '../components/dashboard/tabs/CrewTab'
import { SegmentedTabs } from '../components/ui/SegmentedTabs'
import { useT } from '../contexts/LocaleContext'

type TabId = 'today' | 'plan' | 'analyze' | 'crew'

function resolveTab(raw: string | null): TabId {
  switch (raw) {
    case 'today': return 'today'
    // Plan folds the old Train/Week + Workouts surfaces
    case 'plan':
    case 'train':
    case 'week':
    case 'workouts': return 'plan'
    // analytics surfaces folded into the Analyze hub
    case 'analyze':
    case 'trends':
    case 'report': return 'analyze'
    // Crew stays routable (?tab=crew) but is not in the nav until it's real
    case 'crew': return 'crew'
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
    { id: 'plan',    label: t('tab_plan') },
    { id: 'analyze', label: t('tab_analyze') },
  ]

  const tabContent = (() => {
    switch (activeTab) {
      case 'today':   return <TodayTab />
      case 'plan':    return <PlanTab />
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
      <GarminSyncedBanner />
      <div
        key={activeTab}
        style={reducedMotion ? undefined : { animation: 'tabpanel-in 250ms var(--ease-apple-default) both' }}
      >
        {tabContent}
      </div>
    </DashboardShell>
  )
}
