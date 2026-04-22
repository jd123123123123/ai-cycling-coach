/**
 * TodayTab — the primary view.
 *
 * Above-the-fold at 1440×900 (~804px usable after masthead + tab row):
 *   ReadinessHero  ≈ 280px
 *   CoachBrief     ≈ 220px  (contains PrescribedWorkoutCard)
 *   WeekStrip mini ≈ 72px
 *   gaps 3×24px    ≈  72px
 *   ---------------------------  total ≈ 644px  ✓ fits above-fold
 *
 * Below the fold (requires scrolling):
 *   DailyInsight
 *   KpiStripCompact (demoted from fold-2 position per 06.1-02 restructure)
 */
import CoachBrief from '../CoachBrief'
import DailyInsight from '../DailyInsight'
import KpiStripCompact from '../KpiStripCompact'
import ReadinessHero from '../ReadinessHero'
import WeekStrip from '../WeekStrip'

export default function TodayTab() {
  return (
    <div className="flex flex-col gap-6 min-w-0">
      {/* ── Above the fold ─────────────────────────────────────────────────── */}

      {/* Hero: readiness score + verdict + insight chips.
          ReadinessHero no longer renders DashboardTabs — that old sub-tab
          system is replaced by the top-level SegmentedTabs orchestrator. */}
      <ReadinessHero />

      {/* Prescribed workout + alternates — the actionable output of the coach.
          CoachBrief wraps PrescribedWorkoutCard internally. */}
      <CoachBrief />

      {/* Week-at-a-glance: 7-dot mini strip.
          TODO(Task3): replace with <WeekStrip variant="mini" /> once
          WeekStrip gains the variant prop. */}
      <WeekStrip />

      {/* ── Below the fold (requires scrolling at 1440×900) ────────────────── */}

      {/* Daily insight micro-copy card */}
      <DailyInsight />

      {/* KPI strip: demoted from fold-2 — raw numbers are context, not headline.
          Kept on the Today tab so power users can still access it quickly. */}
      <KpiStripCompact />
    </div>
  )
}
