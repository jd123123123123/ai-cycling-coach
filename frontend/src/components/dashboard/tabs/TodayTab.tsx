/**
 * TodayTab — Phase 7.06 "instrument" edition.
 *
 * Above the fold: state (ReadinessHero) + trajectory (TrajectorySentence) +
 * prescription (CoachBrief) + training-state (PMCCompact). Four primitives.
 *
 * Below the fold (collapsed by default): workout-export shortlist, the full
 * PMCChart (sport toggles + projections), polarized distribution, recent
 * activities. PMC was promoted out of the deep-dive; polarized + the export
 * row moved into it (export row used to render inside CoachBrief).
 */

import CoachBrief from '../CoachBrief'
import PMCCompact from '../PMCCompact'
import PMCChart from '../PMCChart'
import PolarizedDistribution from '../PolarizedDistribution'
import ReadinessHero from '../ReadinessHero'
import RecentActivities from '../RecentActivities'
import TrajectorySentence from '../TrajectorySentence'
import WorkoutExportRow from '../WorkoutExportRow'
import DashboardSection from '../DashboardSection'

export default function TodayTab() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
      {/* ── Above the fold ───────────────────────────────────────────────── */}
      <ReadinessHero />
      <TrajectorySentence />
      <CoachBrief />
      <PMCCompact />

      {/* ── Below the fold: collapsible deep-dive ────────────────────────── */}
      <DashboardSection id="today-deep-dive" title="Deep dive" defaultExpanded={false}>
        <div className="flex flex-col gap-6">
          <WorkoutExportRow />
          <PMCChart />
          <PolarizedDistribution />
          <RecentActivities />
        </div>
      </DashboardSection>
    </div>
  )
}
