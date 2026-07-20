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
import { Navigate, useSearchParams } from 'react-router-dom'
import { useReducedMotion } from 'motion/react'
import DashboardShell from '../components/dashboard/DashboardShell'
import StickyReadinessBar from '../components/dashboard/StickyReadinessBar'
import GarminSyncedBanner from '../components/dashboard/GarminSyncedBanner'
import TodayTab from '../components/dashboard/tabs/TodayTab'
import PlanTab from '../components/dashboard/tabs/PlanTab'
import RecoveryTab from '../components/dashboard/tabs/RecoveryTab'
import HistoryTab from '../components/dashboard/tabs/HistoryTab'
import SocialTab from '../components/social/tabs/SocialTab'

type TabId = 'today' | 'plan' | 'recovery' | 'analyze' | 'social'

function resolveTab(raw: string | null): TabId {
  switch (raw) {
    case 'today': return 'today'
    // Train folds the old Plan/Week + Workouts surfaces
    case 'plan':
    case 'train':
    case 'week':
    case 'workouts': return 'plan'
    // Recovery — biometrics / readiness
    case 'recovery': return 'recovery'
    // History = analytics (Load & Form + records)
    case 'analyze':
    case 'history':
    case 'trends':
    case 'report': return 'analyze'
    // Social is the fifth surface; legacy ?tab=crew aliases into it
    case 'social':
    case 'crew': return 'social'
    // legacy sport tabs collapsed into Today
    case 'bike':
    case 'run':
    default: return 'today'
  }
}

export default function DashboardPage() {
  const [searchParams] = useSearchParams()
  const reducedMotion = useReducedMotion()

  const activeTab: TabId = resolveTab(searchParams.get('tab'))

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [activeTab])

  // Deep-link truth (audit P1-12): ?tab=progress previously rendered Today;
  // Progress lives at /progress/bike like the nav icon says. After all hooks
  // so the hook order is render-stable.
  if (searchParams.get('tab') === 'progress') {
    return <Navigate to="/progress/bike" replace />
  }

  const tabContent = (() => {
    switch (activeTab) {
      case 'today':    return <TodayTab />
      case 'plan':     return <PlanTab />
      case 'recovery': return <RecoveryTab />
      case 'analyze':  return <HistoryTab />
      case 'social':   return <SocialTab />
    }
  })()

  return (
    <DashboardShell stickyBar={<StickyReadinessBar />}>
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
