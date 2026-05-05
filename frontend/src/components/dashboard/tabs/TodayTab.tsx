/**
 * TodayTab — Phase 7.05 "One-Screen Truth" edition.
 *
 * Above the fold: state (ReadinessHero) + trajectory (TrajectorySentence) + prescription (CoachBrief).
 * Below the fold (collapsed by default): PMC chart, polarized distribution, recent activities.
 *
 * Hard rule (verified in Plan 05): above-the-fold component count == 3.
 * Three primitives. No more.
 *
 * Phase 7.05 Plan 02 removed ~1220 lines of decorative "Pulse 2026" scaffolding:
 * - Animated date masthead with parallax pulse-sweep
 * - Bento Cell wrapper with eyebrow + Fraunces "meaning" sentence
 * - Scroll-driven decorative ornaments (×2, motion/react)
 * - Three redundant card components retired to disk (see Plan 02 Task 4)
 */

import CoachBrief from '../CoachBrief'
import PMCChart from '../PMCChart'
import PolarizedDistribution from '../PolarizedDistribution'
import ReadinessHero from '../ReadinessHero'
import RecentActivities from '../RecentActivities'
import TrajectorySentence from '../TrajectorySentence'
import DashboardSection from '../DashboardSection'

export default function TodayTab() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
      {/* ── Above the fold: exactly 3 primitives ─────────────────────────── */}

      {/* 1. State — readiness dial, HRV gated via UncertainValue, ContributorsSheet */}
      <ReadinessHero />

      {/* 2. Trajectory — CTL 14-day trend, confidence-gated via UncertainValue */}
      <TrajectorySentence />

      {/* 3. Prescription — AI coach brief, prescribed workout, tomorrow card */}
      <CoachBrief />

      {/* ── Below the fold: collapsible deep-dive ────────────────────────── */}
      {/* TODO: i18n — add 'today.deepDive' key to coach translation map */}
      <DashboardSection id="today-deep-dive" title="Deep dive" defaultExpanded={false}>
        <div className="flex flex-col gap-6">
          <PMCChart />
          <PolarizedDistribution />
          <RecentActivities />
        </div>
      </DashboardSection>
    </div>
  )
}
