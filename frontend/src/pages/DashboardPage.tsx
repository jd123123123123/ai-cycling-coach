import DashboardShell from '../components/dashboard/DashboardShell'
import ReadinessHero from '../components/dashboard/ReadinessHero'
import BiometricsDetail from '../components/dashboard/BiometricsDetail'
import PMCChart from '../components/dashboard/PMCChart'
import CalendarHeatmap from '../components/dashboard/CalendarHeatmap'
import IntensityDistribution from '../components/dashboard/IntensityDistribution'
import EfficiencyTrend from '../components/dashboard/EfficiencyTrend'
import TrainingCalendar from '../components/dashboard/TrainingCalendar'
import RecentActivities from '../components/dashboard/RecentActivities'
import KpiStripCompact from '../components/dashboard/KpiStripCompact'
import DashboardSection from '../components/dashboard/DashboardSection'

export default function DashboardPage() {
  return (
    <DashboardShell
      // Fold 1 — the headline. CoachBrief + PrescribedWorkoutCard dominate.
      hero={<ReadinessHero />}
      // Fold 2 — raw KPI row, iPhone-level density.
      kpiStrip={<KpiStripCompact />}
      // Fold 3 — PMC + recent activities.
      pmc={
        <>
          <PMCChart />
          <RecentActivities limit={5} />
        </>
      }
      // Fold 4 — everything else, collapsed by default. Each section persists
      // its expanded state in localStorage per-user-device.
      collapsedSections={
        <>
          <DashboardSection
            id="biometrics-detail"
            title="Biometrics detail"
            subtitle="Full-length HRV / body battery / sleep charts"
          >
            <BiometricsDetail />
          </DashboardSection>

          <DashboardSection
            id="intensity-efficiency"
            title="Intensity & efficiency"
            subtitle="Seiler distribution · EF trend"
          >
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
              <IntensityDistribution />
              <EfficiencyTrend />
            </div>
          </DashboardSection>

          <DashboardSection
            id="heatmap"
            title="Training calendar heatmap"
            subtitle="Load density over the past quarter"
          >
            <CalendarHeatmap />
          </DashboardSection>

          <DashboardSection
            id="training-calendar"
            title="Training calendar"
            subtitle="Plan, drag, preview upcoming sessions"
          >
            <TrainingCalendar />
          </DashboardSection>
        </>
      }
      workoutPreviewModal={null /* reserved: TrainingCalendar owns its own modal via portal */}
    />
  )
}
