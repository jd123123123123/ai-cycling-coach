/**
 * DashboardPage — tab orchestrator.
 *
 * Reads the active tab from the `?tab` URL search param (default: 'today').
 * Writes back on change via `setSearchParams({ tab: id })` with `replace: true`
 * so browser back-nav doesn't accumulate tab changes in history.
 *
 * Tab ids: 'today' | 'week' | 'trends' | 'plan'
 *
 * Language-aware labels:
 *   - simple mode: Today / This week / Trends / Plan
 *   - technical mode: Today / Week / Trends / Plan
 *
 * Invariants preserved:
 *   - StickyReadinessBar passed as stickyBar prop (manages own visibility)
 *   - SegmentedTabs passed as tabs prop (not sticky, scrolls with page)
 *   - Chat drawer lives in DashboardShell (06-03 invariant)
 */
import { useSearchParams } from 'react-router-dom'
import DashboardShell from '../components/dashboard/DashboardShell'
import StickyReadinessBar from '../components/dashboard/StickyReadinessBar'
import TodayTab from '../components/dashboard/tabs/TodayTab'
import WeekTab from '../components/dashboard/tabs/WeekTab'
import TrendsTab from '../components/dashboard/tabs/TrendsTab'
import PlanTab from '../components/dashboard/tabs/PlanTab'
import { SegmentedTabs } from '../components/ui/SegmentedTabs'
import { useLanguage } from '../contexts/LanguageContext'

type TabId = 'today' | 'week' | 'trends' | 'plan'

const VALID_TABS: TabId[] = ['today', 'week', 'trends', 'plan']

function isValidTab(v: string | null): v is TabId {
  return VALID_TABS.includes(v as TabId)
}

export default function DashboardPage() {
  const { language } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()

  const rawTab = searchParams.get('tab')
  const activeTab: TabId = isValidTab(rawTab) ? rawTab : 'today'

  const handleTabChange = (id: TabId) => {
    setSearchParams({ tab: id }, { replace: true })
  }

  // Language-aware tab labels.
  // The only simple/technical divergence is Week → "This week".
  const tabs: readonly { id: TabId; label: string }[] = [
    { id: 'today',  label: 'Today' },
    { id: 'week',   label: language === 'simple' ? 'This week' : 'Week' },
    { id: 'trends', label: 'Trends' },
    { id: 'plan',   label: 'Plan' },
  ]

  const tabContent = (() => {
    switch (activeTab) {
      case 'today':  return <TodayTab />
      case 'week':   return <WeekTab />
      case 'trends': return <TrendsTab />
      case 'plan':   return <PlanTab />
    }
  })()

  return (
    <DashboardShell
      stickyBar={<StickyReadinessBar />}
      tabs={
        <SegmentedTabs
          tabs={tabs}
          value={activeTab}
          onChange={handleTabChange}
          ariaLabel="Dashboard sections"
        />
      }
    >
      {tabContent}
    </DashboardShell>
  )
}
