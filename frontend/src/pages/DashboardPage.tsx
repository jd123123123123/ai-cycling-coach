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
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useReducedMotion } from 'motion/react'
import DashboardShell from '../components/dashboard/DashboardShell'
import StickyReadinessBar from '../components/dashboard/StickyReadinessBar'
import TodayTab from '../components/dashboard/tabs/TodayTab'
import WeekTab from '../components/dashboard/tabs/WeekTab'
import CrewTab from '../components/dashboard/tabs/CrewTab'
import BikeTab from '../components/dashboard/tabs/BikeTab'
import RunTab from '../components/dashboard/tabs/RunTab'
import { SegmentedTabs } from '../components/ui/SegmentedTabs'
import { useLanguage } from '../contexts/LanguageContext'

type TabId = 'today' | 'bike' | 'run' | 'week' | 'crew'

const VALID_TABS: TabId[] = ['today', 'bike', 'run', 'week', 'crew']

function isValidTab(v: string | null): v is TabId {
  return VALID_TABS.includes(v as TabId)
}

export default function DashboardPage() {
  const { language } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const reducedMotion = useReducedMotion()

  const rawTab = searchParams.get('tab')
  const activeTab: TabId = isValidTab(rawTab) ? rawTab : 'today'

  const handleTabChange = (id: TabId) => {
    setSearchParams({ tab: id }, { replace: true })
  }

  // Reset scroll on tab change so users don't land mid-scroll
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [activeTab])

  // Language-aware tab labels.
  // The only simple/technical divergence is Week → "This week".
  const tabs: readonly { id: TabId; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'bike',  label: 'Bike' },
    { id: 'run',   label: 'Run' },
    { id: 'week',  label: language === 'simple' ? 'This week' : 'Week' },
    { id: 'crew',  label: 'Crew' },
  ]

  const tabContent = (() => {
    switch (activeTab) {
      case 'today': return <TodayTab />
      case 'bike':  return <BikeTab />
      case 'run':   return <RunTab />
      case 'week':  return <WeekTab />
      case 'crew':  return <CrewTab />
    }
  })()

  return (
    <DashboardShell
      stickyBar={<StickyReadinessBar />}
      tabs={
        <>
          <SegmentedTabs
            tabs={tabs}
            value={activeTab}
            onChange={handleTabChange}
            ariaLabel="Dashboard sections"
          />
          <div className="hairline" />
        </>
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
