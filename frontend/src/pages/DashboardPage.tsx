/**
 * DashboardPage — chapter orchestrator.
 *
 * Four chapters of one season arc, each with one job:
 *   - today   → the verdict (readiness + prescription, one glance)
 *   - plan    → the plan (this week + day structure + plan-vs-actual)
 *   - body    → biometrics / readiness (the old Recovery surface)
 *   - history → the evidence (PMC, distribution, biometrics, estimates,
 *               history, and — now — Progress, which folded in here)
 *
 * Legacy `?tab=bike|run` redirect to `today`; `?tab=week` aliases `plan`;
 * `?tab=progress|analyze|trends|report` all alias `history`.
 *
 * Crew keeps its two deep-linkable homes until their content is woven into
 * Plan and History (phases 2 and 3): `?tab=social` still renders `SocialTab`
 * and `?tab=crew` still renders `CrewHighlights`, a distinct component. Both
 * are checked before the chapter switch so `resolveActive` collapsing them
 * onto `history` for nav-highlighting purposes never drops either surface.
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
import CrewHighlights from '../components/social/tabs/CrewHighlights'
import { resolveActive } from '../components/dashboard/MobileBottomNav'
import type { ChapterId } from '../utils/seasonArc'

export default function DashboardPage() {
  const [searchParams] = useSearchParams()
  const reducedMotion = useReducedMotion()

  const activeTab: ChapterId = resolveActive(searchParams.get('tab'))

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
    // Crew keeps its two deep-linkable homes until their content is woven into
    // Plan and History (phases 2 and 3). Until then a bookmarked
    // /dashboard?tab=social or /dashboard?tab=crew must keep showing what it
    // showed before — collapsing both into the History chapter here would
    // silently drop the CrewHighlights surface, which is a distinct component
    // from SocialTab, not an alias for it.
    const rawTab = searchParams.get('tab')
    if (rawTab === 'social') return <SocialTab />
    if (rawTab === 'crew') return <CrewHighlights />

    switch (activeTab) {
      case 'today':   return <TodayTab />
      case 'plan':    return <PlanTab />
      case 'body':    return <RecoveryTab />
      case 'history': return <HistoryTab />
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
