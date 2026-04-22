/**
 * TodayTab — the primary view.
 *
 * Above-the-fold audit at 1440×900 (Task 3 measured heights):
 *   Chrome: masthead 64px + tab strip ~50px = 114px chrome
 *   Usable:  900 - 114 = ~786px
 *
 *   ReadinessHero  ≈ 260-300px (dial + verdict + chips; no DashboardTabs now)
 *   CoachBrief     ≈ 220-240px  (contains PrescribedWorkoutCard)
 *   WeekStrip mini ≈  64px      (label row + dot row + padding)
 *   gaps 2×24px    ≈  48px
 *   ---------------------------  total ≈ 592-652px  ✓ fits above-fold at 786px
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
          DashboardTabs removed — replaced by top-level SegmentedTabs in DashboardPage. */}
      <ReadinessHero />

      {/* Prescribed workout + alternates — the actionable output of the coach.
          CoachBrief wraps PrescribedWorkoutCard internally. */}
      <CoachBrief />

      {/* Week-at-a-glance: 7-dot mini strip (~64px).
          Dot click navigates to ?tab=plan. */}
      <WeekStrip variant="mini" />

      {/* ── Below the fold (requires scrolling at 1440×900) ────────────────── */}

      {/* Daily insight micro-copy card */}
      <DailyInsight />

      {/* KPI strip: demoted from fold-2 — raw numbers are context, not headline. */}
      <KpiStripCompact />
    </div>
  )
}
